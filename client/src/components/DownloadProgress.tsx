import { useEffect, useState, useRef } from "react";
import { useI18n } from "@/i18n/i18n";

interface ProgressData {
  status: 'waiting' | 'starting' | 'downloading' | 'processing' | 'converting' | 'complete' | 'error';
  message?: string;
  percent?: string;
  speed?: string;
  eta?: string;
  downloaded?: number;
  total?: number;
}

interface DownloadProgressProps {
  downloadId: string;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

const MAX_ERRORS = 2;
const TIMEOUT_MS = 30000;

export function DownloadProgress({ downloadId, onComplete, onError }: DownloadProgressProps) {
  const { t } = useI18n();
  const [progress, setProgress] = useState<ProgressData>({ status: 'waiting' });
  const closedRef = useRef(false);

  useEffect(() => {
    closedRef.current = false;
    let errorCount = 0;
    
    const timeoutId = setTimeout(() => {
      if (!closedRef.current) {
        closedRef.current = true;
        onError?.(t("tool.download_progress.timeout"));
      }
    }, TIMEOUT_MS);
    
    const eventSource = new EventSource(`http://localhost:8000/api/progress/${downloadId}`);

    eventSource.onmessage = (event) => {
      if (closedRef.current) return;
      
      try {
        const data: ProgressData = JSON.parse(event.data);
        setProgress(data);

        if (data.status === 'complete') {
          clearTimeout(timeoutId);
          closedRef.current = true;
          eventSource.close();
          onComplete?.();
        } else if (data.status === 'error') {
          clearTimeout(timeoutId);
          closedRef.current = true;
          eventSource.close();
          onError?.(data.message || t("tool.common.failed"));
        }
      } catch (e) {
        console.error("Parse error:", e);
      }
    };

    eventSource.onerror = () => {
      errorCount++;
      if (errorCount >= MAX_ERRORS && !closedRef.current) {
        clearTimeout(timeoutId);
        closedRef.current = true;
        eventSource.close();
        onError?.(t("tool.download_progress.lost"));
      }
    };

    return () => {
      clearTimeout(timeoutId);
      closedRef.current = true;
      eventSource.close();
    };
  }, [downloadId, onComplete, onError]);

  const getProgressPercentage = () => {
    if (progress.percent) {
      return parseFloat(progress.percent.replace('%', ''));
    }
    if (progress.downloaded && progress.total) {
      return (progress.downloaded / progress.total) * 100;
    }
    return 0;
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  return (
    <div className="w-full max-w-md p-4 bg-white rounded-lg shadow-md">
      <div className="mb-2">
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm font-medium text-gray-700">
            {progress.status === 'downloading' && t("tool.download_progress.downloading")}
            {progress.status === 'processing' && t("tool.download_progress.processing")}
            {progress.status === 'converting' && t("tool.download_progress.converting")}
            {progress.status === 'complete' && t("tool.download_progress.complete")}
            {progress.status === 'error' && t("tool.download_progress.error")}
            {progress.status === 'waiting' && t("tool.download_progress.waiting")}
            {progress.status === 'starting' && t("tool.download_progress.starting")}
          </span>
          {progress.percent && (
            <span className="text-sm font-semibold text-blue-600">
              {progress.percent}
            </span>
          )}
        </div>

        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className={`h-2.5 rounded-full transition-all duration-300 ${
              progress.status === 'error' ? 'bg-red-600' :
              progress.status === 'complete' ? 'bg-green-600' :
              'bg-blue-600'
            }`}
            style={{ width: `${getProgressPercentage()}%` }}
          />
        </div>
      </div>

      <div className="text-xs text-gray-600 space-y-1">
        {progress.message && (
          <div className="text-sm">{progress.message}</div>
        )}
        
        {progress.status === 'downloading' && (
          <div className="flex justify-between">
            <span>{t("tool.download_progress.speed")}: {progress.speed || t("tool.download_progress.na")}</span>
            <span>{t("tool.download_progress.eta")}: {progress.eta || t("tool.download_progress.na")}</span>
          </div>
        )}

        {progress.downloaded && progress.total && (
          <div>
            {formatBytes(progress.downloaded)} / {formatBytes(progress.total)}
          </div>
        )}
      </div>
    </div>
  );
}
