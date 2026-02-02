import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Scissors, Loader2, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API_URL = "http://localhost:8000";

export default function VideoTrimmer() {
  const [videoPath, setVideoPath] = useState("");
  const [startTime, setStartTime] = useState("00:00:00");
  const [endTime, setEndTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();

  const handleTrim = async () => {
    if (!videoPath || !startTime) {
      toast({ title: "Error", description: "Please provide video path and start time", variant: "destructive" });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(`${API_URL}/api/trim/video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          video_path: videoPath, 
          start_time: startTime,
          end_time: endTime || undefined
        }),
      });

      if (!response.ok) throw new Error("Trimming failed");

      const data = await response.json();
      setResult(data);
      toast({ title: "Success", description: "Video trimmed successfully!" });
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
          <CardTitle>Trim Video</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Video File Path</label>
            <Input
              placeholder="/path/to/video.mp4"
              value={videoPath}
              onChange={(e) => setVideoPath(e.target.value)}
            />
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

          <Button onClick={handleTrim} disabled={loading} className="w-full">
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
            <Button asChild className="w-full">
              <a href={`${API_URL}${result.download_url}`} download>
                <Download className="w-4 h-4 mr-2" />
                Download Trimmed Video
              </a>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
