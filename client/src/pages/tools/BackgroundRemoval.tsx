import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Image as ImageIcon, Loader2, Download, Video as VideoIcon, Upload } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import { APP_API_URL } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { DropZone, ServiceStatusTable, ProgressDisplay } from "@/components/common/tool-page-ui";
import type { ProgressData, StatusRowConfig } from "@/components/common/tool-page-ui";
import { useManagedServices } from "@/hooks/useManagedServices";

type BgModelStatus = {
  model_id?: string;
  model_loaded?: boolean;
  model_loading?: boolean;
  model_error?: string | null;
  model_downloaded?: boolean;
  model_downloading?: boolean;
  model_download_error?: string | null;
  device?: "cuda" | "cpu";
  cuda_available?: boolean;
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
  processed_file_id: string;
};

type BgVideoResult = {
  status: string;
  frames_processed: number;
  mask_filename: string;
  subject_filename: string;
  mask_url: string;
  subject_url: string;
  mask_download_url: string;
  subject_download_url: string;
  subject_file_id: string;
  mask_file_id: string;
};

type OverlayResult = {
  status: string;
  filename: string;
  merged_url: string;
  download_url: string;
};

type VideoOverlayResult = {
  status: string;
  filename: string;
  frames_processed: number;
  merged_url: string;
  download_url: string;
};

function BeforeAfterSlider({ beforeUrl, afterUrl }: { beforeUrl: string; afterUrl: string }) {
  const { t } = useI18n();
  const [position, setPosition] = useState(50);

  return (
    <div className="space-y-3 w-1/2 mx-auto">
      <div className="relative w-full overflow-hidden rounded-xl border border-border bg-black/30">
        <img src={afterUrl} alt={t("tool.bg_remove.processed")} className="w-full h-auto block select-none" />
        <img
          src={beforeUrl}
          alt={t("tool.bg_remove.original")}
          className="absolute top-0 left-0 w-full select-none"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        />
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
  const abg_remove_overlay_base_url = `${APP_API_URL}/api/v1/bg-remove-overlay`;
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<"upload" | "video">("upload");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [uploadResult, setUploadResult] = useState<BgResult | null>(null);
  const [videoResult, setVideoResult] = useState<BgVideoResult | null>(null);
  const [overlayBgFile, setOverlayBgFile] = useState<File | null>(null);
  const [overlayResult, setOverlayResult] = useState<OverlayResult | null>(null);
  const [isOverlaying, setIsOverlaying] = useState(false);
  const [videoOverlayBgFile, setVideoOverlayBgFile] = useState<File | null>(null);
  const [videoOverlayResult, setVideoOverlayResult] = useState<VideoOverlayResult | null>(null);
  const [isVideoOverlaying, setIsVideoOverlaying] = useState(false);
  const [serverUnreachable, setServerUnreachable] = useState(false);
  const [envStatus, setEnvStatus] = useState<EnvStatus | null>(null);
  const [modelStatus, setModelStatus] = useState<BgModelStatus | null>(null);
  const [isInstallingEnv, setIsInstallingEnv] = useState(false);
  const [isDownloadingModel, setIsDownloadingModel] = useState(false);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const modelPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { servicesById, start, stop, isBusy } = useManagedServices();
  const serviceStatus = servicesById.app;
  const serviceRunning = serviceStatus?.status === "running";
  const serviceBusy = isBusy("app");

  const envReady = envStatus?.installed === true;
  const modelLoaded = modelStatus?.model_loaded === true;
  const modelLoading = modelStatus?.model_loading === true;
  const modelDownloaded = modelStatus?.model_downloaded === true;
  const modelDownloading = modelStatus?.model_downloading === true;
  const statusReady = !serverUnreachable && envReady && modelLoaded && !modelLoading;

  const resetProgressState = () => {
    setProgress(null);
    setLogs([]);
  };

  const fetchStatus = async () => {
    try {
      const [envRes, statusRes] = await Promise.all([
        fetch(`${abg_remove_overlay_base_url}/env/status`),
        fetch(`${abg_remove_overlay_base_url}/status`),
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
      await stop("app");
      setServerUnreachable(true);
      return;
    }
    await start("app");
    await fetchStatus();
  };

  const handleInstallLibs = async () => {
    setIsInstallingEnv(true);
    setLogs([]);
    setProgress({ status: "starting", percent: 0, message: "Starting installation..." });
    try {
      const res = await fetch(`${abg_remove_overlay_base_url}/env/install`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to start install");
      const { task_id } = (await res.json()) as { task_id: string };

      const source = new EventSource(`${abg_remove_overlay_base_url}/env/install/stream/${task_id}`);
      source.onmessage = (event) => {
        const data = JSON.parse(event.data as string) as { status: string; percent: number; logs?: string[] };
        setProgress({ status: data.status as ProgressData["status"], percent: data.percent, message: "Installing dependencies..." });
        if (data.logs?.length) {
          setLogs((prev) => [...prev, ...data.logs!].slice(-200));
        }
        if (data.status === "complete") {
          source.close();
          setProgress({ status: "complete", percent: 100, message: "Dependencies installed. Restart the server to load the model." });
          setIsInstallingEnv(false);
          void fetchStatus();
        } else if (data.status === "error") {
          source.close();
          setProgress({ status: "error", percent: 0, message: "Failed to install dependencies." });
          setIsInstallingEnv(false);
        }
      };
      source.onerror = () => {
        source.close();
        setProgress({ status: "error", percent: 0, message: "Lost connection during install." });
        setIsInstallingEnv(false);
      };
    } catch {
      setProgress({ status: "error", percent: 0, message: "Failed to start installation." });
      setIsInstallingEnv(false);
    }
  };

  const _startModelTask = async (
    endpoint: string,
    setSending: (v: boolean) => void,
    startMsg: string,
    failMsg: string,
    onComplete: () => void,
  ) => {
    setSending(true);
    setLogs([]);
    setProgress({ status: "starting", percent: 0, message: startMsg });
    try {
      const res = await fetch(`${abg_remove_overlay_base_url}${endpoint}`, { method: "POST" });
      const { task_id } = (await res.json()) as { task_id: string | null };
      if (!task_id) {
        setSending(false);
        void fetchStatus();
        return;
      }
      const source = new EventSource(`${abg_remove_overlay_base_url}/remove/stream/${task_id}`);
      source.onmessage = (event) => {
        const payload = JSON.parse(event.data as string) as ProgressData & { logs?: string[] };
        setProgress({ status: payload.status as ProgressData["status"], percent: payload.percent, message: payload.message });
        if (payload.logs?.length) setLogs(payload.logs);
        if (payload.status === "complete") {
          source.close();
          setSending(false);
          onComplete();
        } else if (payload.status === "error") {
          source.close();
          setSending(false);
        }
      };
      source.onerror = () => {
        source.close();
        setSending(false);
        void fetchStatus();
      };
    } catch {
      setProgress({ status: "error", percent: 0, message: failMsg });
      setSending(false);
    }
  };

  const handleDownloadModel = async () => {
    if (!envReady) {
      setProgress({ status: "error", percent: 0, message: "Dependencies not installed. Please click 'Install Library' first." });
      return;
    }
    await _startModelTask(
      "/remove/download",
      setIsDownloadingModel,
      "Downloading model files...",
      "Failed to start model download.",
      () => { void fetchStatus(); },
    );
  };

  const handleLoadModel = async () => {
    await _startModelTask(
      "/remove/load",
      setIsLoadingModel,
      "Loading model into memory...",
      "Failed to start model load.",
      () => { void fetchStatus(); },
    );
  };

  useEffect(() => {
    if (!isDownloadingModel) return;
    if (modelLoaded) {
      setIsDownloadingModel(false);
      setProgress({ status: "complete", percent: 100, message: "Model loaded successfully." });
      if (modelPollingRef.current) { clearInterval(modelPollingRef.current); modelPollingRef.current = null; }
    } else if (modelStatus?.model_error && !modelStatus.model_loading) {
      setIsDownloadingModel(false);
      setProgress({ status: "error", percent: 0, message: modelStatus.model_error });
      if (modelPollingRef.current) { clearInterval(modelPollingRef.current); modelPollingRef.current = null; }
    }
  }, [modelLoaded, modelStatus, isDownloadingModel]);

  // Auto-poll when the model is loading via startup preload (not triggered by user)
  useEffect(() => {
    if (modelLoading && !isDownloadingModel) {
      if (!modelPollingRef.current) {
        modelPollingRef.current = setInterval(() => { void fetchStatus(); }, 3000);
      }
    } else if (!isDownloadingModel && modelPollingRef.current) {
      clearInterval(modelPollingRef.current);
      modelPollingRef.current = null;
    }
  }, [modelLoading, isDownloadingModel]);

  useEffect(() => {
    return () => { if (modelPollingRef.current) clearInterval(modelPollingRef.current); };
  }, []);

  const handleUnloadModel = async () => {
    await fetch(`${abg_remove_overlay_base_url}/remove/unload`, { method: "POST" });
    await fetchStatus();
  };

  const handleSetDevice = async (device: "cuda" | "cpu") => {
    if (device === modelStatus?.device) return;
    await fetch(`${abg_remove_overlay_base_url}/remove/set-device`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device }),
    });
    await fetchStatus();
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
      const streamUrl = `${abg_remove_overlay_base_url}/remove/stream/${taskId}`;
      const source = new EventSource(streamUrl);
      source.onmessage = (event) => {
        const payload = JSON.parse(event.data) as ProgressData;
        setProgress(payload);
        if (payload.logs) {
          setLogs(payload.logs);
        }
        if (payload.status === "complete") {
          source.close();
          fetch(`${abg_remove_overlay_base_url}/remove/result/${taskId}`)
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
      const response = await fetch(`${abg_remove_overlay_base_url}/remove/upload`, { method: "POST", body });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "Upload failed");
      }
      const payload = (await response.json()) as { task_id: string };
      return payload.task_id;
    }, setUploadResult);
  };


  const runVideoTask = async (
    startTask: () => Promise<string>,
    applyResult: (result: BgVideoResult) => void,
  ) => {
    setIsProcessing(true);
    setProgress({ status: "starting", percent: 0, message: "Starting video background removal..." });
    setLogs([]);
    try {
      const taskId = await startTask();
      const streamUrl = `${abg_remove_overlay_base_url}/video/stream/${taskId}`;
      const source = new EventSource(streamUrl);
      source.onmessage = (event) => {
        const payload = JSON.parse(event.data) as ProgressData;
        setProgress(payload);
        if (payload.logs) setLogs(payload.logs);
        if (payload.status === "complete") {
          source.close();
          fetch(`${abg_remove_overlay_base_url}/video/result/${taskId}`)
            .then((res) => res.json())
            .then((result: BgVideoResult) => {
              applyResult(result);
              setIsProcessing(false);
            })
            .catch(() => {
              setProgress({ status: "error", percent: 0, message: "Failed to fetch video result." });
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
        setProgress({ status: "error", percent: 0, message: "Lost connection during video processing." });
        setIsProcessing(false);
      };
    } catch {
      setProgress({ status: "error", percent: 0, message: "Video request failed." });
      setIsProcessing(false);
    }
  };

  const handleVideoGenerate = async () => {
    if (!videoFile) return;
    setVideoResult(null);
    setVideoOverlayResult(null);
    await runVideoTask(async () => {
      const body = new FormData();
      body.append("file", videoFile);
      const response = await fetch(`${abg_remove_overlay_base_url}/video/upload`, { method: "POST", body });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error((error as { detail?: string }).detail || "Video upload failed");
      }
      const payload = (await response.json()) as { task_id: string };
      return payload.task_id;
    }, setVideoResult);
  };

  const handleImageOverlay = async () => {
    if (!overlayBgFile || !uploadResult?.processed_file_id) return;
    setOverlayResult(null);
    setIsOverlaying(true);
    setIsProcessing(true);
    setProgress({ status: "starting", percent: 0, message: "Starting overlay..." });
    setLogs([]);
    try {
      const body = new FormData();
      body.append("bg_file", overlayBgFile);
      body.append("processed_file_id", uploadResult.processed_file_id);
      const response = await fetch(`${abg_remove_overlay_base_url}/remove/overlay`, { method: "POST", body });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error((error as { detail?: string }).detail || "Overlay failed");
      }
      const { task_id } = (await response.json()) as { task_id: string };
      const source = new EventSource(`${abg_remove_overlay_base_url}/remove/overlay/stream/${task_id}`);
      source.onmessage = (event) => {
        const payload = JSON.parse(event.data as string) as ProgressData;
        setProgress(payload);
        if (payload.logs) setLogs(payload.logs);
        if (payload.status === "complete") {
          source.close();
          fetch(`${abg_remove_overlay_base_url}/remove/overlay/result/${task_id}`)
            .then((res) => res.json())
            .then((result: OverlayResult) => { setOverlayResult(result); setIsProcessing(false); setIsOverlaying(false); })
            .catch(() => { setProgress({ status: "error", percent: 0, message: "Failed to fetch overlay result." }); setIsProcessing(false); setIsOverlaying(false); });
        }
        if (payload.status === "error") { source.close(); setIsProcessing(false); setIsOverlaying(false); }
      };
      source.onerror = () => { source.close(); setProgress({ status: "error", percent: 0, message: "Lost connection during overlay." }); setIsProcessing(false); setIsOverlaying(false); };
    } catch (err) {
      setProgress({ status: "error", percent: 0, message: (err as Error).message || "Overlay request failed." });
      setIsProcessing(false);
      setIsOverlaying(false);
    }
  };

  const handleVideoOverlay = async () => {
    if (!videoOverlayBgFile || !videoResult?.subject_file_id || !videoResult?.mask_file_id) return;
    setVideoOverlayResult(null);
    setIsVideoOverlaying(true);
    setIsProcessing(true);
    setProgress({ status: "starting", percent: 0, message: "Starting video overlay..." });
    setLogs([]);
    try {
      const body = new FormData();
      body.append("bg_file", videoOverlayBgFile);
      body.append("subject_file_id", videoResult.subject_file_id);
      body.append("mask_file_id", videoResult.mask_file_id);
      const response = await fetch(`${abg_remove_overlay_base_url}/video/overlay`, { method: "POST", body });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error((error as { detail?: string }).detail || "Video overlay failed");
      }
      const { task_id } = (await response.json()) as { task_id: string };
      const source = new EventSource(`${abg_remove_overlay_base_url}/video/overlay/stream/${task_id}`);
      source.onmessage = (event) => {
        const payload = JSON.parse(event.data as string) as ProgressData;
        setProgress(payload);
        if (payload.logs) setLogs(payload.logs);
        if (payload.status === "complete") {
          source.close();
          fetch(`${abg_remove_overlay_base_url}/video/overlay/result/${task_id}`)
            .then((res) => res.json())
            .then((result: VideoOverlayResult) => { setVideoOverlayResult(result); setIsProcessing(false); setIsVideoOverlaying(false); })
            .catch(() => { setProgress({ status: "error", percent: 0, message: "Failed to fetch video overlay result." }); setIsProcessing(false); setIsVideoOverlaying(false); });
        }
        if (payload.status === "error") { source.close(); setIsProcessing(false); setIsVideoOverlaying(false); }
      };
      source.onerror = () => { source.close(); setProgress({ status: "error", percent: 0, message: "Lost connection during video overlay." }); setIsProcessing(false); setIsVideoOverlaying(false); };
    } catch (err) {
      setProgress({ status: "error", percent: 0, message: (err as Error).message || "Video overlay request failed." });
      setIsProcessing(false);
      setIsVideoOverlaying(false);
    }
  };

  const statusRows: StatusRowConfig[] = useMemo(
    () => [
      {
        id: "server",
        label: t("tool.bg_remove.server_status"),
        isReady: !serverUnreachable,
        path: `${APP_API_URL}/api/v1/bg-remove-overlay`,
        showActionButton: Boolean(serviceStatus),
        actionButtonLabel: serviceRunning ? t("tool.common.stop_server") : t("tool.common.start_server"),
        actionDisabled: serviceBusy,
        actionLoading: serviceBusy,
        onAction: handleToggleServer,
      },
      {
        id: "env",
        label: t("tool.bg_remove.env_status"),
        isReady: envReady,
        path:
          envStatus?.missing?.length
            ? envStatus.missing.join(", ")
            : envStatus?.installed_modules?.length
              ? envStatus.installed_modules.join(", ")
              : "--",
        showActionButton: !envReady,
        actionButtonLabel: isInstallingEnv ? t("tool.common.starting") : t("tool.common.install_library"),
        actionDisabled: isInstallingEnv || serverUnreachable,
        actionLoading: isInstallingEnv,
        onAction: handleInstallLibs,
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
        // "Download Model" when not yet on disk; "Load Model" when downloaded but not in memory
        showActionButton: !serverUnreachable && !modelLoaded,
        actionButtonLabel: !modelDownloaded
          ? (isDownloadingModel || modelDownloading ? t("tool.common.starting") : t("tool.common.download_model"))
          : (isLoadingModel || modelLoading ? t("tool.common.starting") : "Load Model"),
        actionDisabled: isDownloadingModel || modelDownloading || isLoadingModel || modelLoading,
        actionLoading: isLoadingModel || modelLoading || isDownloadingModel || modelDownloading,
        onAction: !modelDownloaded ? handleDownloadModel : handleLoadModel,
        showSecondaryAction: !serverUnreachable && modelLoaded,
        secondaryActionLabel: "Unload Model",
        onSecondaryAction: handleUnloadModel,
      },
    ],
    [t, serverUnreachable, serviceStatus, serviceRunning, serviceBusy, envReady, envStatus, modelLoaded, modelLoading, modelDownloaded, modelDownloading, modelStatus, isInstallingEnv, isDownloadingModel, isLoadingModel, handleInstallLibs, handleDownloadModel, handleLoadModel, handleUnloadModel],
  );

  const getAbsoluteImageUrl = (path: string) => (path.startsWith("http") ? path : `${APP_API_URL}${path}`);
  const handleDownload = (downloadUrl: string, filename: string) => {
    downloadFile(downloadUrl, filename, APP_API_URL);
  };

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-card">
      <CardContent className="p-8 space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">{t("feature.tool.background_removal.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("feature.tool.background_removal.desc")}</p>
        </div>

        <ServiceStatusTable serverUnreachable={serverUnreachable} rows={statusRows} onRefresh={fetchStatus} />

        {!serverUnreachable && envReady && (
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-muted-foreground uppercase">Compute</span>
            <div className="flex border border-border rounded-md overflow-hidden">
              <Button
                variant={modelStatus?.device === "cpu" ? "default" : "ghost"}
                size="sm"
                className="rounded-none h-7 px-3 text-xs"
                onClick={() => handleSetDevice("cpu")}
                disabled={isProcessing || modelLoading || isLoadingModel || modelStatus?.device === "cpu"}
              >
                CPU
              </Button>
              <Button
                variant={modelStatus?.device === "cuda" ? "default" : "ghost"}
                size="sm"
                className="rounded-none h-7 px-3 text-xs border-l border-border"
                onClick={() => handleSetDevice("cuda")}
                disabled={isProcessing || modelLoading || isLoadingModel || !modelStatus?.cuda_available || modelStatus?.device === "cuda"}
              >
                GPU
              </Button>
            </div>
            {modelStatus && !modelStatus.cuda_available && (
              <span className="text-xs text-muted-foreground">No GPU detected by PyTorch</span>
            )}
            {modelStatus?.cuda_available && modelLoaded && (
              <span className="text-xs text-muted-foreground">Switching device will unload the model</span>
            )}
          </div>
        )}

        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            setActiveTab(value as "upload" | "video");
            resetProgressState();
          }}
          className="space-y-4"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload">
              <ImageIcon className="w-4 h-4 mr-2" />
              {t("tool.bg_remove.tab_upload")}
            </TabsTrigger>
            <TabsTrigger value="video">
              <VideoIcon className="w-4 h-4 mr-2" />
              Video
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-4">
            <DropZone
              file={uploadFile}
              onFile={setUploadFile}
              accept="image/*"
              label={t("tool.bg_remove.upload_image")}
              hint="PNG, JPG, WEBP supported"
              icon={
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-accent/10">
                  <Upload className="w-7 h-7 text-accent" />
                </div>
              }
              disabled={isProcessing}
              className="gap-3 py-10"
            />
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
                  onClick={() => downloadFile(uploadResult.download_url, uploadResult.filename, APP_API_URL)}
                >
                  <Download className="w-4 h-4 mr-2" />
                  {t("tool.bg_remove.download_png")}
                </Button>
                <div className="border-t border-border pt-3 space-y-3">
                  <p className="text-xs font-bold text-muted-foreground uppercase">Add Background</p>
                  <DropZone
                    file={overlayBgFile}
                    onFile={setOverlayBgFile}
                    accept="image/*"
                    label="Upload background image"
                    hint="PNG, JPG, WEBP supported"
                    icon={<Upload className="w-5 h-5 text-muted-foreground" />}
                    disabled={isProcessing}
                    className="py-6 border-border hover:border-accent hover:bg-accent/5"
                  />
                  <Button className="w-full h-10 font-bold" onClick={handleImageOverlay} disabled={isProcessing || !overlayBgFile}>
                    {isOverlaying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Merge with Background
                  </Button>
                  {overlayResult ? (
                    <div className="space-y-2">
                      <img src={getAbsoluteImageUrl(overlayResult.merged_url)} alt="Merged result" className="w-full rounded-lg border border-border" />
                      <Button variant="download" className="w-full" onClick={() => downloadFile(overlayResult.download_url, overlayResult.filename, APP_API_URL)}>
                        <Download className="w-4 h-4 mr-2" />
                        Download Merged Image
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="video" className="space-y-4">
            <DropZone
              file={videoFile}
              onFile={setVideoFile}
              accept=".mp4,.avi,.mov,.mkv"
              label="Upload Video"
              hint="MP4, AVI, MOV, MKV supported"
              icon={
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-accent/10">
                  <VideoIcon className="w-7 h-7 text-accent" />
                </div>
              }
              disabled={isProcessing}
              className="gap-3 py-10"
            />
            <Button className="w-full h-11 font-bold" onClick={handleVideoGenerate} disabled={isProcessing || !videoFile || !statusReady}>
              {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Remove Background
            </Button>
            {videoResult ? (
              <div className="rounded-xl border border-border p-4 bg-muted/30 space-y-3">
                <p className="text-sm text-foreground font-medium">{videoResult.frames_processed} frames processed</p>
                <Button
                  variant="download"
                  className="w-full"
                  onClick={() => downloadFile(videoResult.subject_download_url, videoResult.subject_filename, APP_API_URL)}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Subject Video
                </Button>
                <div className="border-t border-border pt-3 space-y-3">
                  <p className="text-xs font-bold text-muted-foreground uppercase">Add Background</p>
                  <DropZone
                    file={videoOverlayBgFile}
                    onFile={setVideoOverlayBgFile}
                    accept="image/*,.mp4,.avi,.mov,.mkv"
                    label="Upload background image or video"
                    hint="Image or video — looped if shorter"
                    icon={<Upload className="w-5 h-5 text-muted-foreground" />}
                    disabled={isProcessing}
                    className="py-6 border-border hover:border-accent hover:bg-accent/5"
                  />
                  <Button className="w-full h-10 font-bold" onClick={handleVideoOverlay} disabled={isProcessing || !videoOverlayBgFile}>
                    {isVideoOverlaying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Merge with Background
                  </Button>
                  {videoOverlayResult ? (
                    <Button variant="download" className="w-full" onClick={() => handleDownload(videoOverlayResult.download_url, videoOverlayResult.filename)}>
                      <Download className="w-4 h-4 mr-2" />
                      Download Merged Video ({videoOverlayResult.frames_processed} frames)
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </TabsContent>
        </Tabs>

        <ProgressDisplay progress={progress} logs={logs} defaultMessage={t("tool.bg_remove.processing")} />
      </CardContent>
    </Card>
  );
}
