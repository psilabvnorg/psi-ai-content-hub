import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileAudio, Loader2, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API_URL = "http://localhost:8000";

export default function AudioConverter() {
  const [audioPath, setAudioPath] = useState("");
  const [outputFormat, setOutputFormat] = useState<string>("wav");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();

  const handleConvert = async () => {
    if (!audioPath) {
      toast({ title: "Error", description: "Please provide audio path", variant: "destructive" });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(`${API_URL}/api/convert/audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio_path: audioPath, output_format: outputFormat }),
      });

      if (!response.ok) throw new Error("Conversion failed");

      const data = await response.json();
      setResult(data);
      toast({ title: "Success", description: "Audio converted successfully!" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
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
            <label className="text-sm font-medium">Audio File Path</label>
            <input
              type="text"
              className="w-full px-3 py-2 border rounded-md"
              placeholder="/path/to/audio.mp3"
              value={audioPath}
              onChange={(e) => setAudioPath(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Convert To</label>
            <Select value={outputFormat} onValueChange={setOutputFormat}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="wav">WAV</SelectItem>
                <SelectItem value="mp3">MP3</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleConvert} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Converting...
              </>
            ) : (
              <>
                <FileAudio className="w-4 h-4 mr-2" />
                Convert Audio
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="pt-6">
            <Button asChild className="w-full">
              <a href={`${API_URL}${result.download_url}`} download>
                <Download className="w-4 h-4 mr-2" />
                Download {result.format.toUpperCase()}
              </a>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
