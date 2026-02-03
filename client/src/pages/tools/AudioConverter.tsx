import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileAudio, Loader2, Download, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isElectron, ipcApi } from "@/lib/ipc-client";
import { API_URL } from "@/lib/api";

export default function AudioConverter() {
  const [audioPath, setAudioPath] = useState("");
  const [outputFormat, setOutputFormat] = useState<"mp3" | "wav">("wav");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();

  const handleSelectFile = async () => {
    if (!isElectron()) return;
    
    const api = (window as any).electronAPI;
    const dialogResult = await api.showOpenDialog({
      title: 'Select Audio File',
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'] }],
      properties: ['openFile']
    });
    
    if (!dialogResult.canceled && dialogResult.filePaths[0]) {
      setAudioPath(dialogResult.filePaths[0]);
    }
  };

  const handleConvert = async () => {
    if (!audioPath) {
      toast({ title: "Error", description: "Please select an audio file", variant: "destructive" });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      if (isElectron()) {
        const data = await ipcApi.convertAudio(audioPath, outputFormat);
        setResult(data);
        toast({ title: "Success", description: "Audio converted successfully!" });
      } else {
        const response = await fetch(`${API_URL}/api/convert/audio`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio_path: audioPath, output_format: outputFormat }),
        });

        if (!response.ok) throw new Error("Conversion failed");

        const data = await response.json();
        setResult(data);
        toast({ title: "Success", description: "Audio converted successfully!" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
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
        const blob = new Blob([new Uint8Array(byteNumbers)], { type: `audio/${outputFormat}` });
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
          <CardTitle>Convert Audio Format</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Audio File</label>
            {isElectron() ? (
              <div 
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={handleSelectFile}
              >
                {audioPath ? (
                  <p className="text-sm font-medium truncate">{audioPath}</p>
                ) : (
                  <>
                    <Upload className="w-8 h-8 mx-auto mb-2 text-zinc-400" />
                    <p className="text-sm">Click to select audio file</p>
                  </>
                )}
              </div>
            ) : (
              <input
                type="text"
                className="w-full px-3 py-2 border rounded-md"
                placeholder="/path/to/audio.mp3"
                value={audioPath}
                onChange={(e) => setAudioPath(e.target.value)}
              />
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Convert To</label>
            <Select value={outputFormat} onValueChange={(v) => setOutputFormat(v as "mp3" | "wav")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="wav">WAV</SelectItem>
                <SelectItem value="mp3">MP3</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleConvert} disabled={loading || !audioPath} className="w-full">
            {loading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Converting...</>
            ) : (
              <><FileAudio className="w-4 h-4 mr-2" />Convert Audio</>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="pt-6">
            <Button onClick={handleDownload} variant="download" className="w-full">
              <Download className="w-4 h-4 mr-2" />
              Download {outputFormat.toUpperCase()}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
