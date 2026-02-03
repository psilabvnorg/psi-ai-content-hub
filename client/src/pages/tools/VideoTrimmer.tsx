import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Scissors, Loader2, Download, Upload, X, Video } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isElectron, ipcApi } from "@/lib/ipc-client";
import { API_URL } from "@/lib/api";

export default function VideoTrimmer() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [startTime, setStartTime] = useState("00:00:00");
  const [endTime, setEndTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
      if (!validTypes.includes(file.type) && !file.name.match(/\.(mp4|mpeg|mov|avi|webm|mkv)$/i)) {
        toast({ title: "Invalid file", description: "Please select a valid video file", variant: "destructive" });
        return;
      }
      setSelectedFile(file);
      setResult(null);
    }
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setResult(null);
    setProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleTrim = async () => {
    if (!selectedFile) {
      toast({ title: "Error", description: "Please select a video file", variant: "destructive" });
      return;
    }

    if (!startTime) {
      toast({ title: "Error", description: "Please provide start time", variant: "destructive" });
      return;
    }

    setLoading(true);
    setResult(null);
    setProgress(0);

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + Math.random() * 15, 90));
      }, 500);

      if (isElectron()) {
        // Convert File to base64 and upload to server temp directory
        const arrayBuffer = await selectedFile.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        
        setProgress(30);
        
        // Save file to temp directory
        const uploadResult = await ipcApi.saveUploadedFile(base64, selectedFile.name);
        
        setProgress(50);
        
        // Trim the uploaded file
        const data = await ipcApi.trimVideo(uploadResult.filePath, startTime, endTime || undefined);
        
        clearInterval(progressInterval);
        setProgress(100);
        setResult(data);
        toast({ title: "Success", description: "Video trimmed successfully!" });
      } else {
        // For web: use HTTP upload
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("start_time", startTime);
        if (endTime) formData.append("end_time", endTime);

        const response = await fetch(`${API_URL}/api/trim/video/upload`, {
          method: "POST",
          body: formData,
        });

        clearInterval(progressInterval);
        setProgress(100);

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.detail || "Trimming failed");
        }

        const data = await response.json();
        setResult(data);
        toast({ title: "Success", description: "Video trimmed successfully!" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setProgress(0);
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const handleDownload = async () => {
    if (!result) return;
    
    try {
      if (isElectron() && result.filePath) {
        const fileData = await ipcApi.readFileBase64(result.filePath);
        const byteCharacters = atob(fileData.data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'video/mp4' });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileData.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        toast({ title: "Success", description: "File saved!" });
      } else if (result.download_url) {
        window.open(`${API_URL}${result.download_url}`, '_blank');
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Trim Video</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Video File</label>
            
            {!selectedFile ? (
              <div 
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-12 h-12 mx-auto mb-4 text-zinc-400" />
                <p className="text-sm font-medium mb-1">Click to upload video</p>
                <p className="text-xs text-zinc-500">MP4, MOV, AVI, WebM, MKV</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>
            ) : (
              <div className="border rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded flex items-center justify-center">
                    <Video className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{selectedFile.name}</p>
                    <p className="text-xs text-zinc-500">{formatFileSize(selectedFile.size)}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearFile}
                  disabled={loading}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Start Time</label>
              <Input
                placeholder="00:00:30"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
              <p className="text-xs text-zinc-500">Format: HH:MM:SS</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">End Time (Optional)</label>
              <Input
                placeholder="00:02:15"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
              <p className="text-xs text-zinc-500">Leave empty for end</p>
            </div>
          </div>

          {loading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Trimming video...</span>
                <span className="font-medium">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          <Button onClick={handleTrim} disabled={loading || !selectedFile} className="w-full">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Trimming...
              </>
            ) : (
              <>
                <Scissors className="w-4 h-4 mr-2" />
                Trim Video
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="pt-6">
            <Button onClick={handleDownload} variant="download" className="w-full">
              <Download className="w-4 h-4 mr-2" />
              Download Trimmed Video
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
