import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Loader2, CheckCircle2, AlertCircle, Music, Youtube, Facebook, Instagram, Video } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { APP_API_URL } from "@/lib/api";
import { useI18n } from "@/i18n/i18n";
import { ServiceStatusTable } from "@/components/common/tool-page-ui";
import type { StatusRowConfig } from "@/components/common/tool-page-ui";
import { useManagedServices } from "@/hooks/useManagedServices";
import { useAppStatus } from "@/context/AppStatusContext";

export default function VideoDownloader({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { t } = useI18n();
  type DownloadResult = {
    filename?: string;
    download_url?: string;
    original_codec?: string;
    converted?: boolean;
  };
  type ProgressEvent = {
    percent?: number;
    status?: string;
    message?: string;
  };
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [result, setResult] = useState<DownloadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadId, setDownloadId] = useState<string | null>(null);
  const [convertToH264, setConvertToH264] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<"tiktok" | "youtube" | "facebook" | "instagram" | null>("tiktok");
  const modeRef = useRef<"video" | "audio">("video");
  const [downloadMode, setDownloadMode] = useState<"video" | "audio">("video");
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioResult, setAudioResult] = useState<{ download_url?: string; filename?: string } | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const { toast } = useToast();

  const [serverUnreachable, setServerUnreachable] = useState(false);
  const { servicesById } = useManagedServices();
  const { hasMissingDeps } = useAppStatus();
  const serviceStatus = servicesById.app;

  const fetchStatus = async () => {
    try {
      const response = await fetch(`${APP_API_URL}/api/v1/status`);
      if (!response.ok) throw new Error("status");
      setServerUnreachable(false);
    } catch {
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

  const statusRows: StatusRowConfig[] = [
    {
      id: "server",
      label: t("tool.tts_fast.server_status"),
      isReady: !serverUnreachable,
      path: APP_API_URL,
      showSecondaryAction: serverUnreachable && Boolean(onOpenSettings),
      secondaryActionLabel: t("tool.common.open_settings"),
      onSecondaryAction: onOpenSettings,
    },
  ];

  useEffect(() => {
    if (!result || downloadMode !== "audio") return;
    void handleExtractAudio(result.download_url ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, downloadMode]);

  useEffect(() => {
    if (!downloadId) return;
    let closed = false;
    const es = new EventSource(`${APP_API_URL}/api/v1/video/download/stream/${downloadId}`);

    const finalize = async () => {
      try {
        const response = await fetch(`${APP_API_URL}/api/v1/video/download/status/${downloadId}`);
        if (!response.ok) return;
        const data = await response.json();
        if (data.status === "complete") {
          setStatusMessage(t("tool.video_downloader.status_complete"));
          setProgress(100);
          setLoading(false);
          setResult(data.result as DownloadResult);
          toast({ title: t("tool.common.success"), description: t("tool.video_downloader.complete") });
        } else if (data.status === "error") {
          setError(data.error || t("tool.video_downloader.failed"));
          setLoading(false);
          toast({ title: t("tool.common.failed"), description: data.error || t("tool.video_downloader.failed"), variant: "destructive" });
        }
      } catch {
        // ignore
      }
    };

    es.onmessage = (event) => {
      if (closed) return;
      try {
        const progressData = JSON.parse(event.data) as ProgressEvent;
        if (progressData?.percent !== undefined) {
          setProgress(progressData.percent);
        }
        if (progressData?.status === "downloading") {
          setStatusMessage(t("tool.video_downloader.status_downloading", { percent: `${progressData.percent || 0}%` }));
        } else if (progressData?.status === "processing") {
          setStatusMessage(t("tool.video_downloader.status_processing"));
        } else if (progressData?.status === "converting") {
          setStatusMessage(t("tool.video_downloader.status_converting"));
        }
        if (progressData?.status === "complete") {
          closed = true;
          es.close();
          void finalize();
        }
        if (progressData?.status === "error") {
          closed = true;
          es.close();
          setError(progressData.message || t("tool.video_downloader.failed"));
          setLoading(false);
        }
      } catch {
        // ignore
      }
    };

    es.onerror = () => {
      if (!closed) {
        closed = true;
        es.close();
      }
    };

    return () => {
      closed = true;
      es.close();
    };
  }, [downloadId, toast, t]);

  const detectPlatform = (url: string): string => {
    if (url.includes("tiktok.com")) return "tiktok";
    if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
    if (url.includes("facebook.com") || url.includes("fb.watch")) return "facebook";
    if (url.includes("instagram.com")) return "instagram";
    return "youtube";
  };

  const handleDownload = async () => {
    if (!url) {
      toast({ title: t("tool.common.error"), description: t("tool.video_downloader.enter_url"), variant: "destructive" });
      return;
    }

    const platform = selectedPlatform ?? detectPlatform(url);
    console.log("Starting download:", { url, platform, convertToH264 });
    
    setLoading(true);
    setResult(null);
    setError(null);
    setProgress(0);
    setDownloadId(null);
    setStatusMessage(t("tool.video_downloader.init"));

    try {
      const response = await fetch(`${APP_API_URL}/api/v1/video/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, platform, convert_to_h264: convertToH264 }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Download failed");
      }

      const data = await response.json();
      if (data.job_id) {
        setDownloadId(data.job_id);
        setStatusMessage(t("tool.video_downloader.started"));
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t("tool.video_downloader.failed");
      console.error("Download failed:", error);
      setError(message);
      setLoading(false);
      setProgress(0);
      setStatusMessage("");
      toast({ 
        title: t("tool.video_downloader.failed"), 
        description: message, 
        variant: "destructive" 
      });
    }
  };

  const handleSaveFile = async () => {
    if (!result?.download_url) return;
        window.open(`${APP_API_URL}${result.download_url}`, "_blank");
  };

  const handleExtractAudio = async (downloadUrl: string) => {
    const fileId = downloadUrl.split("/").pop();
    if (!fileId) return;
    setAudioLoading(true);
    setAudioResult(null);
    setAudioError(null);
    try {
      const response = await fetch(`${APP_API_URL}/api/v1/video/extract-audio-from-fileid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: fileId, format: "mp3" }),
      });
      if (!response.ok) {
        const err = await response.json() as { detail?: string };
        throw new Error(err.detail ?? "Audio extraction failed");
      }
      const data = await response.json() as { download_url?: string; filename?: string };
      setAudioResult(data);
      toast({ title: t("tool.common.success"), description: "Audio extracted successfully" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Audio extraction failed";
      setAudioError(message);
      toast({ title: t("tool.common.error"), description: message, variant: "destructive" });
    } finally {
      setAudioLoading(false);
    }
  };

  const handleDownloadVideo = () => {
    modeRef.current = "video";
    setDownloadMode("video");
    setAudioResult(null);
    setAudioError(null);
    void handleDownload();
  };

  const handleDownloadAudio = () => {
    modeRef.current = "audio";
    setDownloadMode("audio");
    setAudioResult(null);
    setAudioError(null);
    void handleDownload();
  };

  return (
    <div className="space-y-6">
      <ServiceStatusTable serverUnreachable={serverUnreachable} rows={statusRows} onRefresh={fetchStatus} serverWarning={hasMissingDeps} onOpenSettings={onOpenSettings} />

      <Card>
        <CardHeader>
          <CardTitle>{t("tool.video_downloader.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-4 gap-2">
            {(
              [
                { id: "tiktok", label: "TikTok", icon: Video },
                { id: "youtube", label: "YouTube", icon: Youtube },
                { id: "facebook", label: "Facebook", icon: Facebook },
                { id: "instagram", label: "Instagram", icon: Instagram },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                disabled={loading}
                onClick={() => setSelectedPlatform(selectedPlatform === id ? null : id)}
                className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-semibold transition-all
                  ${selectedPlatform === id
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-muted/40 text-muted-foreground hover:border-accent/60 hover:text-foreground"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <Icon className="w-5 h-5" />
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t("tool.video_downloader.url")}</label>
            <Input
              placeholder={t("tool.video_downloader.placeholder")}
              value={url}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
              disabled={loading}
            />
            {!selectedPlatform && (
              <p className="text-xs text-muted-foreground">{t("tool.video_downloader.detect_hint")}</p>
            )}
          </div>

          {(selectedPlatform === "tiktok" || (!selectedPlatform && url && detectPlatform(url) === "tiktok")) && (
            <>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="convertH264"
                  checked={convertToH264}
                  onChange={(e) => setConvertToH264(e.target.checked)}
                  disabled={loading}
                  className="h-4 w-4 rounded border-border text-accent focus:ring-ring"
                />
                <label htmlFor="convertH264" className="text-sm font-medium cursor-pointer">
                  {t("tool.video_downloader.convert_h264")}
                </label>
              </div>
              <p className="text-xs text-muted-foreground -mt-2 ml-6">
                {t("tool.video_downloader.convert_h264_hint")}
              </p>
            </>
          )}

          {loading && (
            <div className="space-y-3">
              <Progress value={progress} className="w-full" />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{statusMessage}</span>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 bg-destructive/12 border border-destructive/45 rounded-lg">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
              <div className="flex-1">
                <p className="text-sm font-medium text-destructive">{t("tool.video_downloader.failed")}</p>
                <p className="text-xs text-destructive/90 mt-1">{error}</p>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleDownloadVideo} disabled={loading} className="flex-1">
              {loading && modeRef.current === "video" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t("tool.video_downloader.downloading")}
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  {t("tool.video_downloader.download")}
                </>
              )}
            </Button>
            <Button onClick={handleDownloadAudio} disabled={loading} variant="outline" className="flex-1">
              {loading && modeRef.current === "audio" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t("tool.video_downloader.downloading")}
                </>
              ) : (
                <>
                  <Music className="w-4 h-4 mr-2" />
                  Download Audio
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              {downloadMode === "audio" ? "Audio Processing" : t("tool.common.download_complete")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {downloadMode === "video" && (
              <div>
                <p className="text-sm text-muted-foreground">{t("tool.video_downloader.filename")}</p>
                <p className="font-medium">{result.filename}</p>
              </div>
            )}
            {downloadMode === "video" && result.original_codec && result.original_codec !== 'h264' && (
              <div>
                <p className="text-sm text-muted-foreground">{t("tool.video_downloader.original_codec")}</p>
                <p className="font-medium uppercase">{result.original_codec}</p>
              </div>
            )}
            {downloadMode === "video" && result.converted && (
              <div className="flex items-center gap-2 p-2 bg-accent/12 border border-accent/45 rounded text-xs text-accent">
                <CheckCircle2 className="w-4 h-4" />
                {t("tool.video_downloader.converted_note")}
              </div>
            )}
            {downloadMode === "video" && (
              <Button onClick={handleSaveFile} variant="download" className="w-full">
                <Download className="w-4 h-4 mr-2" />
                {t("tool.video_downloader.save_file")}
              </Button>
            )}

            {downloadMode === "audio" && audioLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Extracting audio…</span>
              </div>
            )}
            {downloadMode === "audio" && audioError && (
              <div className="flex items-start gap-2 p-3 bg-destructive/12 border border-destructive/45 rounded-lg">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
                <p className="text-sm text-destructive">{audioError}</p>
              </div>
            )}
            {downloadMode === "audio" && audioResult?.download_url && (
              <>
                <div>
                  <p className="text-sm text-muted-foreground">{t("tool.video_downloader.filename")}</p>
                  <p className="font-medium">{audioResult.filename}</p>
                </div>
                <Button
                  onClick={() => window.open(`${APP_API_URL}${audioResult.download_url}`, "_blank")}
                  variant="download"
                  className="w-full"
                >
                  <Music className="w-4 h-4 mr-2" />
                  Download Audio File
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
