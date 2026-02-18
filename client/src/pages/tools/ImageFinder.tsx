import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Download, Image as ImageIcon, Loader2, Search } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import { APP_API_URL } from "@/lib/api";
import { ProgressDisplay, ServiceStatusTable } from "@/components/common/tool-page-ui";
import type { ProgressData, StatusRowConfig } from "@/components/common/tool-page-ui";
import { useManagedServices } from "@/hooks/useManagedServices";

type EnvStatusResponse = {
  installed?: boolean;
  missing?: string[];
};

type LlmStatusResponse = {
  status?: string;
  url?: string;
  models?: string[];
  detail?: string;
};

type ImageFinderImage = {
  url?: string;
  source?: string;
  description?: string;
  tags?: string[];
};

type ImageFinderResponse = {
  status?: string;
  keywords?: string;
  search_query?: string;
  count?: number;
  images?: ImageFinderImage[];
};

const IMAGE_COUNTS = ["5", "6", "7", "8", "9", "10"];

export default function ImageFinder({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { t } = useI18n();
  const { servicesById, start, stop, isBusy } = useManagedServices();

  const [text, setText] = useState("");
  const [numberOfImages, setNumberOfImages] = useState("5");
  const [model, setModel] = useState("deepseek-r1:8b");

  const [isSearching, setIsSearching] = useState(false);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const [keywords, setKeywords] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [images, setImages] = useState<ImageFinderImage[]>([]);

  const [serverUnreachable, setServerUnreachable] = useState(true);
  const [envInstalled, setEnvInstalled] = useState(false);
  const [envMissing, setEnvMissing] = useState<string[]>([]);
  const [modelReady, setModelReady] = useState(false);
  const [modelStatusPath, setModelStatusPath] = useState("--");
  const [isCheckingModel, setIsCheckingModel] = useState(false);

  const appService = servicesById.app;
  const appRunning = appService?.status === "running";
  const appBusy = isBusy("app");

  const withTimeout = async (input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 12000) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      window.clearTimeout(timer);
    }
  };

  const checkModelStatus = async () => {
    if (serverUnreachable) return;
    setIsCheckingModel(true);
    try {
      const response = await withTimeout(`${APP_API_URL}/api/v1/llm/status`, {}, 10000);
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { detail?: string };
        throw new Error(payload.detail || t("tool.image_finder.model_not_ready"));
      }
      const payload = (await response.json()) as LlmStatusResponse;
      if (payload.status !== "ok") {
        const reason = payload.detail || payload.status || t("tool.image_finder.model_not_ready");
        setModelReady(false);
        setModelStatusPath(`Ollama ${reason}`);
        return;
      }
      const available = Array.isArray(payload.models) ? payload.models : [];
      const isAvailable = available.some((m) => m === model || m.startsWith(`${model}:`));
      setModelReady(isAvailable);
      setModelStatusPath(
        isAvailable
          ? `${model} (${t("settings.tools.status.ready")})`
          : `${model} ${t("settings.tools.status.not_ready")} — Available: ${available.join(", ") || "--"}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : t("tool.image_finder.model_not_ready");
      setModelReady(false);
      setModelStatusPath(message);
    } finally {
      setIsCheckingModel(false);
    }
  };

  const fetchStatus = async () => {
    let reachable = false;
    try {
      const envRes = await fetch(`${APP_API_URL}/api/v1/env/status`);
      if (!envRes.ok) throw new Error("env");
      const envData = (await envRes.json()) as EnvStatusResponse;
      reachable = true;
      setServerUnreachable(false);
      setEnvInstalled(envData.installed === true);
      setEnvMissing(Array.isArray(envData.missing) ? envData.missing : []);
    } catch {
      setServerUnreachable(true);
      setEnvInstalled(false);
      setEnvMissing([]);
      setModelReady(false);
      setModelStatusPath("--");
      return;
    }

    if (reachable) {
      setIsCheckingModel(true);
      try {
        const response = await withTimeout(`${APP_API_URL}/api/v1/llm/status`, {}, 10000);
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { detail?: string };
          throw new Error(payload.detail || t("tool.image_finder.model_not_ready"));
        }
        const payload = (await response.json()) as LlmStatusResponse;
        if (payload.status !== "ok") {
          const reason = payload.detail || payload.status || t("tool.image_finder.model_not_ready");
          setModelReady(false);
          setModelStatusPath(`Ollama ${reason}`);
          return;
        }
        const available = Array.isArray(payload.models) ? payload.models : [];
        const isAvailable = available.some((m) => m === model || m.startsWith(`${model}:`));
        setModelReady(isAvailable);
        setModelStatusPath(
          isAvailable
            ? `${model} (${t("settings.tools.status.ready")})`
            : `${model} ${t("settings.tools.status.not_ready")} — Available: ${available.join(", ") || "--"}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : t("tool.image_finder.model_not_ready");
        setModelReady(false);
        setModelStatusPath(message);
      } finally {
        setIsCheckingModel(false);
      }
    }
  };

  const isElectron = typeof window !== "undefined" && window.electronAPI !== undefined;

  useEffect(() => {
    if (isElectron) return;
    void fetchStatus();
  }, []);

  useEffect(() => {
    if (!appService) return;
    if (appService.status === "running" || appService.status === "stopped") {
      void fetchStatus();
    }
  }, [appService?.status]);

  const handleToggleServer = async () => {
    if (!appService) return;
    if (appRunning) {
      await stop("app");
      setServerUnreachable(true);
      return;
    }
    await start("app");
    await fetchStatus();
  };

  const handleSearch = async () => {
    if (isSearching || !text.trim()) return;

    setIsSearching(true);
    setLogs([]);
    setImages([]);
    setKeywords("");
    setSearchQuery("");
    setProgress({ status: "starting", percent: 5, message: t("tool.image_finder.searching") });

    try {
      const response = await fetch(`${APP_API_URL}/api/v1/image-finder/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          number_of_images: Number(numberOfImages),
          model: model.trim(),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { detail?: string };
        throw new Error(payload.detail || t("tool.image_finder.search_failed"));
      }

      const payload = (await response.json()) as ImageFinderResponse;
      const foundImages = Array.isArray(payload.images) ? payload.images : [];

      setKeywords(payload.keywords || "");
      setSearchQuery(payload.search_query || "");
      setImages(foundImages);
      setLogs((prev) => [
        ...prev,
        `[INFO] ${t("tool.image_finder.found_images", { count: foundImages.length })}`,
      ]);
      setProgress({ status: "complete", percent: 100, message: t("tool.image_finder.search_complete") });
    } catch (error) {
      const message = error instanceof Error ? error.message : t("tool.image_finder.search_failed");
      setProgress({ status: "error", percent: 0, message });
      setLogs((prev) => [...prev, `[ERROR] ${message}`]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleDownloadImage = async (url: string, index: number) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("download failed");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `image-finder-${index + 1}.jpg`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, "_blank");
    }
  };

  const statusRows: StatusRowConfig[] = [
    {
      id: "server",
      label: t("tool.image_finder.server_status"),
      isReady: !serverUnreachable,
      path: APP_API_URL,
      showActionButton: Boolean(appService),
      actionDisabled: appBusy || appService?.status === "not_configured",
      onAction: handleToggleServer,
    },
    {
      id: "dependencies",
      label: t("tool.image_finder.dependencies_status"),
      isReady: envInstalled,
      path: envInstalled ? t("settings.tools.status.ready") : envMissing.join(", ") || "--",
      showActionButton: !envInstalled && Boolean(onOpenSettings),
      actionButtonLabel: t("tool.common.open_settings"),
      onAction: onOpenSettings,
    },
    {
      id: "model",
      label: t("tool.image_finder.model_status"),
      isReady: modelReady,
      path: modelStatusPath,
      showActionButton: !serverUnreachable,
      actionButtonLabel: isCheckingModel ? t("tool.common.processing") : t("tool.image_finder.check_model"),
      actionDisabled: isCheckingModel,
      onAction: () => {
        void checkModelStatus();
      },
    },
  ];

  const canSearch = !serverUnreachable && envInstalled && modelReady && !isSearching && text.trim().length > 0;

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-card">
      <CardContent className="p-8 space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">{t("feature.tool.image_finder.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("feature.tool.image_finder.desc")}</p>
        </div>

        <ServiceStatusTable serverUnreachable={serverUnreachable} rows={statusRows} onRefresh={fetchStatus} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.image_finder.model")}</label>
            <Input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="deepseek-r1:8b"
              className="bg-card border-border"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.image_finder.number_of_images")}</label>
            <Select value={numberOfImages} onValueChange={setNumberOfImages}>
              <SelectTrigger className="bg-card border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IMAGE_COUNTS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.image_finder.input_text")}</label>
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t("tool.image_finder.input_placeholder")}
            className="min-h-[140px] bg-card border-border resize-none"
          />
        </div>

        <Button
          className="w-full h-12 bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl font-bold"
          onClick={handleSearch}
          disabled={!canSearch}
        >
          {isSearching ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Search className="w-5 h-5 mr-2" />}
          {isSearching ? t("tool.image_finder.searching") : t("tool.image_finder.search")}
        </Button>

        <ProgressDisplay progress={progress} logs={logs} defaultMessage={t("tool.common.processing")} />

        {(keywords || searchQuery) && (
          <div className="p-4 border border-border rounded-xl bg-card space-y-2">
            <div className="text-xs text-muted-foreground">
              <span className="font-bold uppercase mr-2">{t("tool.image_finder.keywords")}:</span>
              {keywords || "--"}
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="font-bold uppercase mr-2">{t("tool.image_finder.search_query")}:</span>
              {searchQuery || "--"}
            </div>
          </div>
        )}

        {images.length > 0 && (
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase text-muted-foreground">
              {t("tool.image_finder.output_images", { count: images.length })}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {images.map((image, index) => {
                const imageUrl = typeof image.url === "string" ? image.url : "";
                if (!imageUrl) return null;
                return (
                  <div key={`${imageUrl}-${index}`} className="border border-border rounded-xl p-2 bg-card space-y-2">
                    <div className="w-full aspect-video rounded-md overflow-hidden bg-muted/40">
                      <img src={imageUrl} alt={`image-result-${index + 1}`} className="w-full h-full object-cover" />
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-2">
                      {image.description || image.source || t("tool.image_finder.image")}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        void handleDownloadImage(imageUrl, index);
                      }}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      {t("tool.image_finder.download_image")}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!isSearching && images.length === 0 && (
          <div className="text-xs text-muted-foreground border border-dashed border-border rounded-xl p-6 text-center">
            <ImageIcon className="w-5 h-5 inline mr-2" />
            {t("tool.image_finder.no_images")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
