import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { isElectron, ipcApi, listen } from "@/lib/ipc-client";
import { API_URL } from "@/lib/api";

export default function VideoDownloader() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadId, setDownloadId] = useState<string | null>(null);
  const [convertToH264, setConvertToH264] = useState(false);
  const { toast } = useToast();
  const unlistenRef = useRef<(() => void) | null>(null);

  // Cleanup listener on unmount
  useEffect(() => {
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
      }
    };
  }, []);

  // Listen for progress updates via IPC
  useEffect(() => {
    if (!downloadId || !isElectron()) return;

    // Listen for progress broadcasts from server
    const unlisten = listen('download-progress', (data: any) => {
      if (data.downloadId !== downloadId) return;

      if (data.percent) {
        setProgress(parseFloat(data.percent.replace('%', '')));
      }

      if (data.status === 'downloading') {
        setStatusMessage(`Downloading... ${data.percent || ''}`);
      } else if (data.status === 'processing') {
        setStatusMessage('Processing...');
        setProgress(95);
      } else if (data.status === 'converting') {
        setStatusMessage('Converting...');
        setProgress(98);
      } else if (data.status === 'complete') {
        setStatusMessage('Complete!');
        setProgress(100);
        setLoading(false);
        setResult(data);
        toast({ title: "Success", description: "Download complete!" });
      } else if (data.status === 'error') {
        setError(data.message || 'Download failed');
        setLoading(false);
        toast({ title: "Failed", description: data.message, variant: "destructive" });
      }
    });

    unlistenRef.current = unlisten;

    // Also poll for progress (backup)
    const pollInterval = setInterval(async () => {
      try {
        const progressData = await ipcApi.getProgress(downloadId);
        if (progressData.status === 'complete' || progressData.status === 'error') {
          clearInterval(pollInterval);
        }
      } catch (e) {
        // Ignore polling errors
      }
    }, 1000);

    return () => {
      unlisten();
      clearInterval(pollInterval);
    };
  }, [downloadId, toast]);

  const detectPlatform = (url: string): string => {
    if (url.includes("tiktok.com")) return "tiktok";
    if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
    if (url.includes("facebook.com") || url.includes("fb.watch")) return "facebook";
    if (url.includes("instagram.com")) return "instagram";
    return "youtube";
  };

  const handleDownload = async () => {
    if (!url) {
      toast({ title: "Error", description: "Please enter a URL", variant: "destructive" });
      return;
    }

    const platform = detectPlatform(url);
    console.log("Starting download:", { url, platform, convertToH264 });
    
    setLoading(true);
    setResult(null);
    setError(null);
    setProgress(0);
    setDownloadId(null);
    setStatusMessage("Initializing download...");

    try {
      if (isElectron()) {
        // Use IPC for Electron
        const response = await ipcApi.downloadVideo(url, platform, convertToH264);
        console.log("Download response:", response);
        
        if (response.downloadId) {
          setDownloadId(response.downloadId);
          setStatusMessage("Download started...");
        } else {
          throw new Error("No downloadId received");
        }
      } else {
        // Use HTTP for web
        const response = await fetch(`${API_URL}/api/download/video`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, platform, convert_to_h264: convertToH264 }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || "Download failed");
        }

        const data = await response.json();
        if (data.download_id) {
          setDownloadId(data.download_id);
          setStatusMessage("Download started...");
        }
      }
    } catch (error: any) {
      console.error("Download failed:", error);
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

  const handleSaveFile = async () => {
    if (!result?.filePath || !isElectron()) return;

    try {
      // Read file as base64
      const fileData = await ipcApi.readFileBase64(result.filePath);
      
      // Create blob and download
      const byteCharacters = atob(fileData.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'video/mp4' });
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileData.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({ title: "Success", description: "File saved!" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
                  Convert to H.264 for Windows compatibility
                </label>
              </div>
              <p className="text-xs text-zinc-500 -mt-2 ml-6">
                TikTok videos use HEVC codec. Enable this for better Windows compatibility.
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
                <p className="text-sm font-medium text-red-900 dark:text-red-100">Download Failed</p>
                <p className="text-xs text-red-700 dark:text-red-300 mt-1">{error}</p>
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
              <p className="text-sm text-zinc-500">Filename</p>
              <p className="font-medium">{result.filename}</p>
            </div>
            {result.originalCodec && result.originalCodec !== 'h264' && (
              <div>
                <p className="text-sm text-zinc-500">Original Codec</p>
                <p className="font-medium uppercase">{result.originalCodec}</p>
              </div>
            )}
            {result.converted && (
              <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-xs text-blue-700 dark:text-blue-300">
                <CheckCircle2 className="w-4 h-4" />
                Converted to H.264 for Windows compatibility
              </div>
            )}
            <Button onClick={handleSaveFile} variant="download" className="w-full">
              <Download className="w-4 h-4 mr-2" />
              Save File
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
