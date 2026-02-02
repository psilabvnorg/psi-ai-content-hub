import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";

const API_URL = "http://localhost:8000";

interface ProgressData {
  status: 'waiting' | 'starting' | 'downloading' | 'processing' | 'converting' | 'complete' | 'error';
  message?: string;
  percent?: string;
  speed?: string;
  eta?: string;
  downloaded?: number;
  total?: number;
}

export default function VideoDownloader() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [progressDetails, setProgressDetails] = useState<ProgressData | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadId, setDownloadId] = useState<string | null>(null);
  const { toast } = useToast();
  const eventSourceRef = useRef<EventSource | null>(null);

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Connect to SSE when downloadId is available
  useEffect(() => {
    if (!downloadId) return;

    console.log("Connecting to SSE for download:", downloadId);
    const eventSource = new EventSource(`${API_URL}/api/progress/${downloadId}`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data: ProgressData = JSON.parse(event.data);
      console.log("Progress update:", data);
      setProgressDetails(data);

      // Update progress bar
      if (data.percent) {
        const percentValue = parseFloat(data.percent.replace('%', ''));
        setProgress(percentValue);
      }

      // Update status message
      if (data.status === 'downloading') {
        setStatusMessage(`Downloading... ${data.percent || ''} ${data.speed ? `at ${data.speed}` : ''}`);
      } else if (data.status === 'processing') {
        setStatusMessage(data.message || 'Processing...');
        setProgress(95);
      } else if (data.status === 'converting') {
        setStatusMessage(data.message || 'Converting...');
        setProgress(98);
      } else if (data.status === 'complete') {
        setStatusMessage('Complete!');
        setProgress(100);
        setLoading(false);
        
        // Extract result data from progress
        const resultData: any = data;
        setResult(resultData);
        
        toast({ 
          title: "Success", 
          description: `Video downloaded successfully!${resultData.converted ? ' (Converted to H.264)' : ''}` 
        });
        
        eventSource.close();
      } else if (data.status === 'error') {
        setError(data.message || 'Download failed');
        setLoading(false);
        toast({ 
          title: "Download Failed", 
          description: data.message || 'Unknown error', 
          variant: "destructive" 
        });
        eventSource.close();
      } else if (data.status === 'starting') {
        setStatusMessage(data.message || 'Starting...');
        setProgress(5);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE Error:', error);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [downloadId, toast]);

  const detectPlatform = (url: string): string => {
    if (url.includes("tiktok.com")) return "tiktok";
    if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
    if (url.includes("facebook.com") || url.includes("fb.watch")) return "facebook";
    if (url.includes("instagram.com")) return "instagram";
    return "youtube"; // default
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const handleDownload = async () => {
    if (!url) {
      toast({ title: "Error", description: "Please enter a URL", variant: "destructive" });
      return;
    }

    const platform = detectPlatform(url);
    console.log("=== Starting download ===");
    console.log("URL:", url);
    console.log("Platform:", platform);
    
    setLoading(true);
    setResult(null);
    setError(null);
    setProgress(0);
    setProgressDetails(null);
    setDownloadId(null);
    setStatusMessage("Initializing download...");

    try {
      console.log("Sending request to API...");
      const response = await fetch(`${API_URL}/api/download/video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, platform }),
      });

      console.log("Response status:", response.status);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error("API Error:", errorData);
        throw new Error(errorData.detail || "Download failed");
      }

      const data = await response.json();
      console.log("Download response:", data);
      
      // API now returns immediately with download_id
      if (data.download_id) {
        setDownloadId(data.download_id);
        setStatusMessage("Connecting to progress stream...");
      } else {
        throw new Error("No download_id received from server");
      }
      
    } catch (error: any) {
      console.error("=== Download failed ===");
      console.error("Error:", error);
      console.error("Error message:", error.message);
      
      setError(error.message);
      setLoading(false);
      setProgress(0);
      setStatusMessage("");
      
      toast({ 
        title: "Download Failed", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Download Video</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Video URL</label>
            <Input
              placeholder="Paste Link/URL..."
              value={url}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-zinc-500">Platform will be automatically detected from the URL</p>
          </div>

          {loading && (
            <div className="space-y-3">
              <Progress value={progress} className="w-full" />
              <div className="flex items-center gap-2 text-sm text-zinc-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{statusMessage}</span>
              </div>
              
              {/* Real-time download details */}
              {progressDetails && progressDetails.status === 'downloading' && (
                <div className="text-xs text-zinc-500 space-y-1 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
                  <div className="flex justify-between">
                    <span>Speed:</span>
                    <span className="font-medium">{progressDetails.speed || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ETA:</span>
                    <span className="font-medium">{progressDetails.eta || 'N/A'}</span>
                  </div>
                  {progressDetails.downloaded && progressDetails.total && (
                    <div className="flex justify-between">
                      <span>Downloaded:</span>
                      <span className="font-medium">
                        {formatBytes(progressDetails.downloaded)} / {formatBytes(progressDetails.total)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900 dark:text-red-100">Download Failed</p>
                <p className="text-xs text-red-700 dark:text-red-300 mt-1">{error}</p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-2">Check the browser console (F12) for detailed logs</p>
              </div>
            </div>
          )}

          <Button onClick={handleDownload} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Download Video
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
              Download Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-zinc-500">Title</p>
              <p className="font-medium">{result.title}</p>
            </div>
            <div>
              <p className="text-sm text-zinc-500">Duration</p>
              <p className="font-medium">{Math.floor(result.duration / 60)}:{(result.duration % 60).toString().padStart(2, '0')}</p>
            </div>
            {result.converted && (
              <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-xs text-blue-700 dark:text-blue-300">
                <CheckCircle2 className="w-4 h-4" />
                Converted to H.264 for Windows compatibility
              </div>
            )}
            <Button asChild className="w-full">
              <a href={`${API_URL}${result.download_url}`} download>
                <Download className="w-4 h-4 mr-2" />
                Download File
              </a>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
