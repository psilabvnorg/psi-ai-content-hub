import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileAudio, Loader2, Download, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { APP_API_URL } from "@/lib/api";
import { useI18n } from "@/i18n/i18n";
import { ServiceStatusTable } from "@/components/common/tool-page-ui";
import type { StatusRowConfig } from "@/components/common/tool-page-ui";
import { useManagedServices } from "@/hooks/useManagedServices";
import { useAppStatus } from "@/context/AppStatusContext";

export default function AudioConverter({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { t } = useI18n();
  type ConversionResult = { download_url?: string; filename?: string };
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [outputFormat, setOutputFormat] = useState<"mp3" | "wav">("wav");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const { toast } = useToast();

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
  };

  const handleConvert = async () => {
    if (!selectedFile) {
      toast({ title: t("tool.common.error"), description: t("tool.audio_converter.select_prompt"), variant: "destructive" });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("output_format", outputFormat);
      const response = await fetch(`${APP_API_URL}/api/v1/audio/convert`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error(t("tool.common.failed"));

      const data = await response.json();
      setResult(data);
      toast({ title: t("tool.common.success"), description: t("tool.audio_converter.success") });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t("tool.common.error");
      toast({ title: t("tool.common.error"), description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
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
          <CardTitle>{t("tool.audio_converter.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("tool.common.audio_file")}</label>
            <div className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors">
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                id="audio-upload"
                onChange={handleFileSelect}
              />
              <label htmlFor="audio-upload" className="cursor-pointer">
                {selectedFile ? (
                  <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                ) : (
                  <>
                    <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm">{t("tool.audio_converter.click_select")}</p>
                  </>
                )}
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t("tool.common.convert_to")}</label>
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

          <Button onClick={handleConvert} disabled={loading || !selectedFile} className="w-full">
            {loading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("tool.audio_converter.converting")}</>
            ) : (
              <><FileAudio className="w-4 h-4 mr-2" />{t("tool.audio_converter.convert")}</>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="pt-6">
            <Button onClick={handleDownload} variant="download" className="w-full">
              <Download className="w-4 h-4 mr-2" />
              {t("tool.audio_converter.download", { format: outputFormat.toUpperCase() })}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
