import { useEffect, useState } from 'react';

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

export function DownloadProgress({ downloadId, onComplete, onError }: DownloadProgressProps) {
  const [progress, setProgress] = useState<ProgressData>({ status: 'waiting' });

  useEffect(() => {
    // Create EventSource for SSE
    const eventSource = new EventSource(`http://localhost:8000/api/progress/${downloadId}`);

    eventSource.onmessage = (event) => {
      const data: ProgressData = JSON.parse(event.data);
      setProgress(data);

      if (data.status === 'complete') {
        onComplete?.();
        eventSource.close();
      } else if (data.status === 'error') {
        onError?.(data.message || 'Download failed');
        eventSource.close();
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE Error:', error);
      eventSource.close();
    };

    return () => {
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
            {progress.status === 'downloading' && 'Downloading...'}
            {progress.status === 'processing' && 'Processing...'}
            {progress.status === 'converting' && 'Converting...'}
            {progress.status === 'complete' && 'Complete!'}
            {progress.status === 'error' && 'Error'}
            {progress.status === 'waiting' && 'Waiting...'}
            {progress.status === 'starting' && 'Starting...'}
          </span>
          {progress.percent && (
            <span className="text-sm font-semibold text-blue-600">
              {progress.percent}
            </span>
          )}
        </div>

        {/* Progress Bar */}
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

      {/* Details */}
      <div className="text-xs text-gray-600 space-y-1">
        {progress.message && (
          <div className="text-sm">{progress.message}</div>
        )}
        
        {progress.status === 'downloading' && (
          <div className="flex justify-between">
            <span>Speed: {progress.speed || 'N/A'}</span>
            <span>ETA: {progress.eta || 'N/A'}</span>
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
