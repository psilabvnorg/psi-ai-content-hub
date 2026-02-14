import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Image as ImageIcon, Link as LinkIcon, FileOutput, Loader2, Download } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import { BGREMOVE_API_URL } from "@/lib/api";
import { ServiceStatusTable, ProgressDisplay } from "@/components/common/tool-page-ui";
import type { ProgressData, StatusRowConfig } from "@/components/common/tool-page-ui";
import { useManagedServices } from "@/hooks/useManagedServices";

type BgModelStatus = {
  model_id?: string;
  model_loaded?: boolean;
  model_loading?: boolean;
  model_error?: string | null;
  device?: "cuda" | "cpu";
};

type BgStatusResponse = {
  models?: {
    background_removal?: BgModelStatus;
  };
};

type EnvStatus = {
  installed: boolean;
  missing?: string[];
  installed_modules?: string[];
};

type BgResult = {
  status: string;
  filename: string;
  original_url: string;
  processed_url: string;
  download_url: string;
};

function BeforeAfterSlider({ beforeUrl, afterUrl }: { beforeUrl: string; afterUrl: string }) {
  const { t } = useI18n();
  const [position, setPosition] = useState(50);

  return (
    <div className="space-y-3">
      <div className="relative w-full overflow-hidden rounded-xl border border-border bg-black/30">
        <img src={beforeUrl} alt={t("tool.bg_remove.original")} className="w-full h-auto block select-none" />
        <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${position}%` }}>
          <img src={afterUrl} alt={t("tool.bg_remove.processed")} className="w-full h-auto block select-none" />
        </div>
        <div className="absolute inset-y-0" style={{ left: `calc(${position}% - 1px)` }}>
          <div className="h-full w-0.5 bg-white/90" />
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t("tool.bg_remove.original")}</span>
          <span>{t("tool.bg_remove.processed")}</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={position}
          onChange={(event) => setPosition(Number(event.target.value))}
          className="w-full accent-accent"
        />
      </div>
    </div>
  );
}

export default function BackgroundRemoval({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<"upload" | "url" | "file">("upload");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [fileOutputUpload, setFileOutputUpload] = useState<File | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [uploadResult, setUploadResult] = useState<BgResult | null>(null);
  const [urlResult, setUrlResult] = useState<BgResult | null>(null);
  const [fileResult, setFileResult] = useState<BgResult | null>(null);
  const [serverUnreachable, setServerUnreachable] = useState(false);
  const [envStatus, setEnvStatus] = useState<EnvStatus | null>(null);
  const [modelStatus, setModelStatus] = useState<BgModelStatus | null>(null);

  const { servicesById, start, stop, isBusy } = useManagedServices();
  const serviceStatus = servicesById.bgremove;
  const serviceRunning = serviceStatus?.status === "running";
  const serviceBusy = isBusy("bgremove");

  const envReady = envStatus?.installed === true;
  const modelLoaded = modelStatus?.model_loaded === true;
  const modelLoading = modelStatus?.model_loading === true;
  const statusReady = !serverUnreachable && envReady && modelLoaded && !modelLoading;

  const resetProgressState = () => {
    setProgress(null);
    setLogs([]);
  };

  const fetchStatus = async () => {
    try {
      const [envRes, statusRes] = await Promise.all([
        fetch(`${BGREMOVE_API_URL}/api/v1/env/status`),
        fetch(`${BGREMOVE_API_URL}/api/v1/status`),
      ]);
      if (!envRes.ok || !statusRes.ok) {
        throw new Error("status");
      }
      const envData = (await envRes.json()) as EnvStatus;
      const statusData = (await statusRes.json()) as BgStatusResponse;
      setEnvStatus(envData);
      setModelStatus(statusData.models?.background_removal ?? null);
      setServerUnreachable(false);
    } catch {
      setEnvStatus(null);
      setModelStatus(null);
      setServerUnreachable(true);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    if (!serviceStatus) return;
    if (serviceStatus.status === "running" || serviceStatus.status === "stopped") {
      fetchStatus();
    }
  }, [serviceStatus?.status]);

  const handleToggleServer = async () => {
    if (!serviceStatus) return;
    if (serviceRunning) {
      await stop("bgremove");
      setServerUnreachable(true);
      return;
    }
    await start("bgremove");
    await fetchStatus();
  };

  const handleDownload = (downloadUrl: string, filename: string) => {
    const href = downloadUrl.startsWith("http") ? downloadUrl : `${BGREMOVE_API_URL}${downloadUrl}`;
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const runTask = async (
    startTask: () => Promise<string>,
    applyResult: (result: BgResult) => void,
  ) => {
    setIsProcessing(true);
    setProgress({ status: "starting", percent: 0, message: t("tool.bg_remove.starting") });
    setLogs([]);
    try {
      const taskId = await startTask();
      const streamUrl = `${BGREMOVE_API_URL}/api/v1/remove/stream/${taskId}`;
      const source = new EventSource(streamUrl);
      source.onmessage = (event) => {
        const payload = JSON.parse(event.data) as ProgressData;
        setProgress(payload);
        if (payload.logs) {
          setLogs(payload.logs);
        }
        if (payload.status === "complete") {
          source.close();
          fetch(`${BGREMOVE_API_URL}/api/v1/remove/result/${taskId}`)
            .then((res) => res.json())
            .then((result: BgResult) => {
              applyResult(result);
              setIsProcessing(false);
            })
            .catch(() => {
              setProgress({ status: "error", percent: 0, message: t("tool.bg_remove.failed_result") });
              setIsProcessing(false);
            });
        }
        if (payload.status === "error") {
          source.close();
          setIsProcessing(false);
        }
      };
      source.onerror = () => {
        source.close();
        setProgress({ status: "error", percent: 0, message: t("tool.bg_remove.lost_connection") });
        setIsProcessing(false);
      };
    } catch {
      setProgress({ status: "error", percent: 0, message: t("tool.bg_remove.request_failed") });
      setIsProcessing(false);
    }
  };

  const handleUploadGenerate = async () => {
    if (!uploadFile) return;
    setUploadResult(null);
    await runTask(async () => {
      const body = new FormData();
      body.append("file", uploadFile);
      const response = await fetch(`${BGREMOVE_API_URL}/api/v1/remove/upload`, { method: "POST", body });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "Upload failed");
      }
      const payload = (await response.json()) as { task_id: string };
      return payload.task_id;
    }, setUploadResult);
  };

  const handleUrlGenerate = async () => {
    if (!urlInput.trim()) return;
    setUrlResult(null);
    await runTask(async () => {
      const response = await fetch(`${BGREMOVE_API_URL}/api/v1/remove/url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "URL process failed");
      }
      const payload = (await response.json()) as { task_id: string };
      return payload.task_id;
    }, setUrlResult);
  };

  const handleFileGenerate = async () => {
    if (!fileOutputUpload) return;
    setFileResult(null);
    await runTask(async () => {
      const body = new FormData();
      body.append("file", fileOutputUpload);
      const response = await fetch(`${BGREMOVE_API_URL}/api/v1/remove/upload`, { method: "POST", body });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "File process failed");
      }
      const payload = (await response.json()) as { task_id: string };
      return payload.task_id;
    }, setFileResult);
  };

  const statusRows: StatusRowConfig[] = useMemo(
    () => [
      {
        id: "server",
        label: t("tool.bg_remove.server_status"),
        isReady: !serverUnreachable,
        path: BGREMOVE_API_URL,
        showActionButton: Boolean(serviceStatus),
        actionButtonLabel: serviceRunning ? t("tool.common.stop_server") : t("tool.common.start_server"),
        actionDisabled: serviceBusy || serviceStatus?.status === "not_configured",
        onAction: handleToggleServer,
      },
      {
        id: "env",
        label: t("tool.bg_remove.env_status"),
        isReady: envReady,
        path:
          envStatus?.installed_modules?.length
            ? envStatus.installed_modules.join(", ")
            : envStatus?.missing?.length
              ? envStatus.missing.join(", ")
              : "--",
        showActionButton: !envReady,
        actionButtonLabel: t("tool.common.install_library"),
        onAction: onOpenSettings,
      },
      {
        id: "model",
        label: t("tool.bg_remove.model_status"),
        isReady: modelLoaded,
        path: modelStatus
          ? `${modelStatus.model_id || "BiRefNet"} • ${modelStatus.device || "cpu"}${
              modelStatus.model_error ? ` • ${modelStatus.model_error}` : ""
            }`
          : "--",
        showActionButton: !modelLoaded,
        actionButtonLabel: t("tool.common.open_settings"),
        onAction: onOpenSettings,
      },
    ],
    [t, serverUnreachable, serviceStatus, serviceRunning, serviceBusy, envReady, envStatus, modelLoaded, modelStatus, onOpenSettings],
  );

  const getAbsoluteImageUrl = (path: string) => (path.startsWith("http") ? path : `${BGREMOVE_API_URL}${path}`);

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-card">
      <CardContent className="p-8 space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">{t("feature.tool.background_removal.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("feature.tool.background_removal.desc")}</p>
        </div>

        <ServiceStatusTable serverUnreachable={serverUnreachable} rows={statusRows} onRefresh={fetchStatus} />

        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            setActiveTab(value as "upload" | "url" | "file");
            resetProgressState();
          }}
          className="space-y-4"
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload">
              <ImageIcon className="w-4 h-4 mr-2" />
              {t("tool.bg_remove.tab_upload")}
            </TabsTrigger>
            <TabsTrigger value="url">
              <LinkIcon className="w-4 h-4 mr-2" />
              {t("tool.bg_remove.tab_url")}
            </TabsTrigger>
            <TabsTrigger value="file">
              <FileOutput className="w-4 h-4 mr-2" />
              {t("tool.bg_remove.tab_file")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.bg_remove.upload_image")}</label>
              <Input
                type="file"
                accept="image/*"
                onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
                disabled={isProcessing}
              />
            </div>
            <Button className="w-full h-11 font-bold" onClick={handleUploadGenerate} disabled={isProcessing || !uploadFile || !statusReady}>
              {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {t("tool.bg_remove.remove_bg")}
            </Button>
            {uploadResult ? (
              <div className="space-y-3">
                <BeforeAfterSlider
                  beforeUrl={getAbsoluteImageUrl(uploadResult.original_url)}
                  afterUrl={getAbsoluteImageUrl(uploadResult.processed_url)}
                />
                <Button
                  variant="download"
                  className="w-full"
                  onClick={() => handleDownload(uploadResult.download_url, uploadResult.filename)}
                >
                  <Download className="w-4 h-4 mr-2" />
                  {t("tool.bg_remove.download_png")}
                </Button>
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="url" className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.bg_remove.image_url")}</label>
              <Input
                value={urlInput}
                onChange={(event) => setUrlInput(event.target.value)}
                placeholder="https://example.com/photo.jpg"
                disabled={isProcessing}
              />
            </div>
            <Button className="w-full h-11 font-bold" onClick={handleUrlGenerate} disabled={isProcessing || !urlInput.trim() || !statusReady}>
              {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {t("tool.bg_remove.remove_bg")}
            </Button>
            {urlResult ? (
              <div className="space-y-3">
                <BeforeAfterSlider
                  beforeUrl={getAbsoluteImageUrl(urlResult.original_url)}
                  afterUrl={getAbsoluteImageUrl(urlResult.processed_url)}
                />
                <Button
                  variant="download"
                  className="w-full"
                  onClick={() => handleDownload(urlResult.download_url, urlResult.filename)}
                >
                  <Download className="w-4 h-4 mr-2" />
                  {t("tool.bg_remove.download_png")}
                </Button>
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="file" className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.bg_remove.upload_image")}</label>
              <Input
                type="file"
                accept="image/*"
                onChange={(event) => setFileOutputUpload(event.target.files?.[0] || null)}
                disabled={isProcessing}
              />
            </div>
            <Button className="w-full h-11 font-bold" onClick={handleFileGenerate} disabled={isProcessing || !fileOutputUpload || !statusReady}>
              {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {t("tool.bg_remove.generate_file")}
            </Button>
            {fileResult ? (
              <div className="rounded-xl border border-border p-4 bg-muted/30 space-y-3">
                <p className="text-sm text-foreground">{fileResult.filename}</p>
                <Button
                  variant="download"
                  className="w-full"
                  onClick={() => handleDownload(fileResult.download_url, fileResult.filename)}
                >
                  <Download className="w-4 h-4 mr-2" />
                  {t("tool.bg_remove.download_png")}
                </Button>
              </div>
            ) : null}
          </TabsContent>
        </Tabs>

        <ProgressDisplay progress={progress} logs={logs} defaultMessage={t("tool.bg_remove.processing")} />
      </CardContent>
    </Card>
  );
}
