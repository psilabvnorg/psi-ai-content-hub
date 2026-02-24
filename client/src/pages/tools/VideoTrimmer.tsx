import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Scissors, Loader2, Download, Upload, X, Video } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { APP_API_URL } from "@/lib/api";
import { useI18n } from "@/i18n/i18n";
import { ServiceStatusTable } from "@/components/common/tool-page-ui";
import type { StatusRowConfig } from "@/components/common/tool-page-ui";
import { useManagedServices } from "@/hooks/useManagedServices";
import { useAppStatus } from "@/context/AppStatusContext";

export default function VideoTrimmer({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { t } = useI18n();
  type TrimResult = { download_url?: string; filename?: string };
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [startTime, setStartTime] = useState("00:00:00");

  const [serverUnreachable, setServerUnreachable] = useState(false);
  const { servicesById } = useManagedServices();
  const { hasMissingDeps } = useAppStatus();
  const serviceStatus = servicesById.app;

  const fetchStatus = async () => {
    try {
      const response = await fetch(`${APP_API_URL}/api/v1/status`);
      if (!response.ok) throw new Error("status");
      setServerUnreachable(false);
    } catch {
      setServerUnreachable(true);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    if (!serviceStatus) return;
    if (serviceStatus.status === "running" || serviceStatus.status === "stopped") {
      fetchStatus();
    }
  }, [serviceStatus?.status]);

  const statusRows: StatusRowConfig[] = [
    {
      id: "server",
      label: t("tool.tts_fast.server_status"),
      isReady: !serverUnreachable,
      path: APP_API_URL,
      showSecondaryAction: serverUnreachable && Boolean(onOpenSettings),
      secondaryActionLabel: t("tool.common.open_settings"),
      onSecondaryAction: onOpenSettings,
    },
  ];
  const [endTime, setEndTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<TrimResult | null>(null);
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
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleTrim = async () => {
    if (!selectedFile) {
      toast({ title: t("tool.common.error"), description: t("tool.common.select_valid_video"), variant: "destructive" });
      return;
    }

    if (!startTime) {
      toast({ title: t("tool.common.error"), description: t("tool.video_trimmer.start_required"), variant: "destructive" });
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

      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("start_time", startTime);
      if (endTime) formData.append("end_time", endTime);

      const response = await fetch(`${APP_API_URL}/api/v1/video/trim`, {
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
      toast({ title: t("tool.common.success"), description: t("tool.video_trimmer.success") });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t("tool.common.error");
      toast({ title: t("tool.common.error"), description: message, variant: "destructive" });
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
      if (result.download_url) {
        window.open(`${APP_API_URL}${result.download_url}`, "_blank");
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t("tool.common.error");
      toast({ title: t("tool.common.error"), description: message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <ServiceStatusTable serverUnreachable={serverUnreachable} rows={statusRows} onRefresh={fetchStatus} serverWarning={hasMissingDeps} onOpenSettings={onOpenSettings} />

      <Card>
        <CardHeader>
          <CardTitle>{t("tool.video_trimmer.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("tool.common.video_file")}</label>
            
            {!selectedFile ? (
              <div 
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm font-medium mb-1">{t("tool.common.upload_video")}</p>
                <p className="text-xs text-muted-foreground">{t("tool.common.supported_videos")}</p>
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
                    <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
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
              <label className="text-sm font-medium">{t("tool.video_trimmer.start_time")}</label>
              <Input
                placeholder="00:00:30"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("tool.video_trimmer.format_hint")}</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t("tool.video_trimmer.end_time")}</label>
              <Input
                placeholder="00:02:15"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("tool.video_trimmer.end_hint")}</p>
            </div>
          </div>

          {loading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("tool.video_trimmer.progress")}</span>
                <span className="font-medium">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          <Button onClick={handleTrim} disabled={loading || !selectedFile} className="w-full">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t("tool.video_trimmer.trimming")}
              </>
            ) : (
              <>
                <Scissors className="w-4 h-4 mr-2" />
                {t("tool.video_trimmer.title")}
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
              {t("tool.video_trimmer.download")}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
