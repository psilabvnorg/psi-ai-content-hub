import { useState } from 'react';
import { DownloadProgress } from './DownloadProgress';

export function VideoDownloader() {
  const [url, setUrl] = useState('');
  const [platform, setPlatform] = useState<'youtube' | 'tiktok' | 'facebook' | 'instagram'>('youtube');
  const [downloadId, setDownloadId] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleDownload = async () => {
    if (!url) return;

    setIsDownloading(true);
    setResult(null);

    try {
      const response = await fetch('http://localhost:8000/api/download/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, platform })
      });

      const data = await response.json();
      
      if (data.download_id) {
        setDownloadId(data.download_id);
      }
      
      if (data.status === 'success') {
        setResult(data);
      }
    } catch (error) {
      console.error('Download failed:', error);
      setIsDownloading(false);
    }
  };

  const handleComplete = () => {
    setIsDownloading(false);
    console.log('Download complete!');
  };

  const handleError = (error: string) => {
    setIsDownloading(false);
    alert(`Download failed: ${error}`);
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-4">Video Downloader</h2>

      <div className="space-y-4">
        {/* URL Input */}
        <div>
          <label className="block text-sm font-medium mb-2">Video URL</label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            disabled={isDownloading}
          />
        </div>

        {/* Platform Select */}
        <div>
          <label className="block text-sm font-medium mb-2">Platform</label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as any)}
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
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isDownloading ? 'Downloading...' : 'Download Video'}
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
            <h3 className="font-semibold text-green-800 mb-2">Download Complete!</h3>
            <p className="text-sm text-gray-700">Title: {result.title}</p>
            <p className="text-sm text-gray-700">Duration: {result.duration}s</p>
            <a
              href={`http://localhost:8000${result.download_url}`}
              download
              className="inline-block mt-2 text-blue-600 hover:underline"
            >
              Download File
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
