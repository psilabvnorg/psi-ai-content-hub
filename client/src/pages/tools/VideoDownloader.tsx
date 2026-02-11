import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { APP_API_URL } from "@/lib/api";
import { useI18n } from "@/i18n/i18n";

export default function VideoDownloader() {
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
  const { toast } = useToast();
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

    const platform = detectPlatform(url);
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("tool.video_downloader.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("tool.video_downloader.url")}</label>
            <Input
              placeholder={t("tool.video_downloader.placeholder")}
              value={url}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-zinc-500">{t("tool.video_downloader.detect_hint")}</p>
          </div>

          {url && detectPlatform(url) === "tiktok" && (
            <>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="convertH264"
                  checked={convertToH264}
                  onChange={(e) => setConvertToH264(e.target.checked)}
                  disabled={loading}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="convertH264" className="text-sm font-medium cursor-pointer">
                  {t("tool.video_downloader.convert_h264")}
                </label>
              </div>
              <p className="text-xs text-zinc-500 -mt-2 ml-6">
                {t("tool.video_downloader.convert_h264_hint")}
              </p>
            </>
          )}

          {loading && (
            <div className="space-y-3">
              <Progress value={progress} className="w-full" />
              <div className="flex items-center gap-2 text-sm text-zinc-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{statusMessage}</span>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900 dark:text-red-100">{t("tool.video_downloader.failed")}</p>
                <p className="text-xs text-red-700 dark:text-red-300 mt-1">{error}</p>
              </div>
            </div>
          )}

          <Button onClick={handleDownload} disabled={loading} className="w-full">
            {loading ? (
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
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              {t("tool.common.download_complete")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-zinc-500">{t("tool.video_downloader.filename")}</p>
              <p className="font-medium">{result.filename}</p>
            </div>
            {result.originalCodec && result.originalCodec !== 'h264' && (
              <div>
                <p className="text-sm text-zinc-500">{t("tool.video_downloader.original_codec")}</p>
                <p className="font-medium uppercase">{result.originalCodec}</p>
              </div>
            )}
            {result.converted && (
              <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-xs text-blue-700 dark:text-blue-300">
                <CheckCircle2 className="w-4 h-4" />
                {t("tool.video_downloader.converted_note")}
              </div>
            )}
            <Button onClick={handleSaveFile} variant="download" className="w-full">
              <Download className="w-4 h-4 mr-2" />
              {t("tool.video_downloader.save_file")}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
