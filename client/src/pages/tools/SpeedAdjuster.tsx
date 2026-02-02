import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Gauge, Loader2, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API_URL = "http://localhost:8000";

export default function SpeedAdjuster() {
  const [videoPath, setVideoPath] = useState("");
  const [speed, setSpeed] = useState([1.0]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();

  const handleAdjust = async () => {
    if (!videoPath) {
      toast({ title: "Error", description: "Please provide video path", variant: "destructive" });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(`${API_URL}/api/adjust/speed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_path: videoPath, speed: speed[0] }),
      });

      if (!response.ok) throw new Error("Speed adjustment failed");

      const data = await response.json();
      setResult(data);
      toast({ title: "Success", description: "Video speed adjusted successfully!" });
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
          <CardTitle>Adjust Video Speed</CardTitle>
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

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium">Speed Multiplier</label>
              <span className="text-lg font-bold text-blue-600">{speed[0].toFixed(1)}x</span>
            </div>
            <Slider
              value={speed}
              onValueChange={setSpeed}
              min={0.5}
              max={2.0}
              step={0.1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-zinc-500">
              <span>0.5x (Slower)</span>
              <span>1.0x (Normal)</span>
              <span>2.0x (Faster)</span>
            </div>
          </div>

          <Button onClick={handleAdjust} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Gauge className="w-4 h-4 mr-2" />
                Adjust Speed
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <p className="text-sm text-zinc-500">Speed: {result.speed}x</p>
            <Button asChild className="w-full">
              <a href={`${API_URL}${result.download_url}`} download>
                <Download className="w-4 h-4 mr-2" />
                Download Adjusted Video
              </a>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
