import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Gauge, Loader2, Download, Upload, X, Video } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { API_URL } from "@/lib/api";
import { useI18n } from "@/i18n/i18n";

export default function SpeedAdjuster() {
  const { t } = useI18n();
  type AdjustResult = { download_url?: string; speed?: number };
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [speed, setSpeed] = useState([1.0]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AdjustResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
      if (!validTypes.includes(file.type) && !file.name.match(/\.(mp4|mpeg|mov|avi|webm|mkv)$/i)) {
        toast({ title: t("tool.common.invalid_file"), description: t("tool.common.select_valid_video"), variant: "destructive" });
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
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAdjust = async () => {
    if (!selectedFile) {
      toast({ title: t("tool.common.error"), description: t("tool.common.select_valid_video"), variant: "destructive" });
      return;
    }

    setLoading(true);
    setResult(null);
    setProgress(0);

    try {
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + Math.random() * 15, 90));
      }, 500);

      const formData = new FormData();
      formData.append("file", selectedFile!);
      formData.append("speed", speed[0].toString());

      const response = await fetch(`${API_URL}/api/tools/video/speed`, {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || t("tool.common.failed"));
      }

      const data = await response.json();
      setResult(data);
      toast({ title: t("tool.common.success"), description: t("tool.speed_adjuster.success") });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t("tool.common.error");
      toast({ title: t("tool.common.error"), description: message, variant: "destructive" });
      setProgress(0);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!result) return;
    try {
      if (result.download_url) {
        window.open(`${API_URL}${result.download_url}`, "_blank");
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t("tool.common.error");
      toast({ title: t("tool.common.error"), description: message, variant: "destructive" });
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
          <CardTitle>{t("tool.speed_adjuster.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("tool.common.video_file")}</label>
            
            {!selectedFile ? (
              <div 
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-12 h-12 mx-auto mb-4 text-zinc-400" />
                <p className="text-sm font-medium mb-1">{t("tool.common.upload_video")}</p>
                <p className="text-xs text-zinc-500">{t("tool.common.supported_videos")}</p>
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
                <Button variant="ghost" size="sm" onClick={handleClearFile} disabled={loading}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium">{t("tool.speed_adjuster.speed_multiplier")}</label>
              <span className="text-lg font-bold text-blue-600">{speed[0].toFixed(1)}x</span>
            </div>
            <Slider value={speed} onValueChange={setSpeed} min={0.5} max={2.0} step={0.1} className="w-full" />
            <div className="flex justify-between text-xs text-zinc-500">
              <span>0.5x ({t("home.slower")})</span>
              <span>1.0x ({t("home.normal")})</span>
              <span>2.0x ({t("home.faster")})</span>
            </div>
          </div>

          {loading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">{t("tool.speed_adjuster.processing")}</span>
                <span className="font-medium">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          <Button onClick={handleAdjust} disabled={loading || !selectedFile} className="w-full">
            {loading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("tool.speed_adjuster.processing")}</>
            ) : (
              <><Gauge className="w-4 h-4 mr-2" />{t("tool.speed_adjuster.adjust")}</>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <p className="text-sm text-zinc-500">{t("tool.speed_adjuster.result_speed", { speed: result.speed ?? speed[0] })}</p>
            <Button onClick={handleDownload} variant="download" className="w-full">
              <Download className="w-4 h-4 mr-2" />
              {t("tool.speed_adjuster.download")}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
