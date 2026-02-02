import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Music, Loader2, Upload, Download, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API_URL = "http://localhost:8000";

export default function AudioExtractor() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [format, setFormat] = useState<string>("mp3");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
      if (!validTypes.includes(file.type) && !file.name.match(/\.(mp4|mpeg|mov|avi|webm|mkv)$/i)) {
        toast({ 
          title: "Invalid file", 
          description: "Please select a valid video file", 
          variant: "destructive" 
        });
        return;
      }
      setSelectedFile(file);
      setResult(null);
    }
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleExtract = async () => {
    if (!selectedFile) {
      toast({ title: "Error", description: "Please select a video file", variant: "destructive" });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("format", format);

      const response = await fetch(`${API_URL}/api/extract/audio/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Extraction failed");
      }

      const data = await response.json();
      setResult(data);
      toast({ title: "Success", description: "Audio extracted successfully!" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Extract Audio from Video</CardTitle>
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
                    <Music className="w-5 h-5 text-primary" />
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

          <div className="space-y-2">
            <label className="text-sm font-medium">Output Format</label>
            <Select value={format} onValueChange={setFormat} disabled={loading}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mp3">MP3</SelectItem>
                <SelectItem value="wav">WAV</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button 
            onClick={handleExtract} 
            disabled={loading || !selectedFile} 
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Extracting...
              </>
            ) : (
              <>
                <Music className="w-4 h-4 mr-2" />
                Extract Audio
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Audio Ready</p>
              <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                {result.format.toUpperCase()}
              </span>
            </div>
            <Button asChild className="w-full">
              <a href={`${API_URL}${result.download_url}`} download={result.filename}>
                <Download className="w-4 h-4 mr-2" />
                Download {result.format.toUpperCase()} File
              </a>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
