import { useState } from "react";
import { DownloadProgress } from './DownloadProgress';
import { useI18n } from "@/i18n/i18n";
import { APP_API_URL } from "@/lib/api";

export function VideoDownloader() {
  const { t } = useI18n();
  type Platform = "youtube" | "tiktok" | "facebook" | "instagram";
  type DownloadResult = {
    title?: string;
    duration?: number;
    download_url?: string;
  };
  const [url, setUrl] = useState("");
  const [platform, setPlatform] = useState<Platform>("youtube");
  const [downloadId, setDownloadId] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [result, setResult] = useState<DownloadResult | null>(null);

  const handleDownload = async () => {
    if (!url) return;

    setIsDownloading(true);
    setResult(null);

    try {
      const response = await fetch(`${APP_API_URL}/api/v1/video/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, platform })
      });

      const data = await response.json();
      
      if (data.job_id) {
        setDownloadId(data.job_id);
      }
      
      if (data.status === 'success') {
        setResult(data);
      }
    } catch (error) {
      console.error("Download failed:", error);
      setIsDownloading(false);
    }
  };

  const handleComplete = () => {
    setIsDownloading(false);
    console.log("Download complete!");
  };

  const handleError = (error: string) => {
    setIsDownloading(false);
    alert(t("tool.video_dl.failed", { error }));
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-4">{t("tool.video_dl.title")}</h2>

      <div className="space-y-4">
        {/* URL Input */}
        <div>
          <label className="block text-sm font-medium mb-2">{t("tool.video_dl.url")}</label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t("tool.video_dl.placeholder")}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            disabled={isDownloading}
          />
        </div>

        {/* Platform Select */}
        <div>
          <label className="block text-sm font-medium mb-2">{t("tool.video_dl.platform")}</label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Platform)}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            disabled={isDownloading}
          >
            <option value="youtube">YouTube</option>
            <option value="tiktok">TikTok</option>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
          </select>
        </div>

        {/* Download Button */}
        <button
          onClick={handleDownload}
          disabled={!url || isDownloading}
          className="w-full bg-pink-500 hover:bg-pink-600 text-white font-bold py-2 px-4 rounded-lg border border-pink-600 shadow-md hover:shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isDownloading ? t("tool.video_dl.downloading") : t("tool.video_dl.download")}
        </button>

        {/* Progress Display */}
        {downloadId && isDownloading && (
          <DownloadProgress
            downloadId={downloadId}
            onComplete={handleComplete}
            onError={handleError}
          />
        )}

        {/* Result Display */}
        {result && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <h3 className="font-semibold text-green-800 mb-2">{t("tool.video_dl.complete")}</h3>
            <p className="text-sm text-gray-700">{t("tool.video_dl.title_label", { title: result.title ?? "-" })}</p>
            <p className="text-sm text-gray-700">{t("tool.video_dl.duration", { seconds: result.duration ?? 0 })}</p>
            <a
              href={`${APP_API_URL}${result.download_url}`}
              download
              className="inline-block mt-2 text-pink-600 hover:text-pink-700 font-bold hover:underline"
            >
              {t("tool.video_dl.download_file")}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
