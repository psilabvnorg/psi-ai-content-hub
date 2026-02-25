import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ZoomIn, Loader2, Download, Upload, X, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { APP_API_URL } from "@/lib/api";
import { useI18n } from "@/i18n/i18n";
import { ServiceStatusTable } from "@/components/common/tool-page-ui";
import type { StatusRowConfig } from "@/components/common/tool-page-ui";
import { useManagedServices } from "@/hooks/useManagedServices";
import { useAppStatus } from "@/context/AppStatusContext";

const UPSCALE_MODELS = [
  "ultrasharp-4x",
  "remacri-4x",
  "ultramix-balanced-4x",
  "high-fidelity-4x",
  "digital-art-4x",
  "upscayl-standard-4x",
  "upscayl-lite-4x",
] as const;

type UpscaleModel = (typeof UPSCALE_MODELS)[number];

export default function ImageUpscaler({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { t } = useI18n();
  type UpscaleResult = { download_url?: string; filename?: string };
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scale, setScale] = useState<2 | 3 | 4>(4);
  const [modelName, setModelName] = useState<UpscaleModel>("ultrasharp-4x");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UpscaleResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [serverUnreachable, setServerUnreachable] = useState(false);
  const [binaryFound, setBinaryFound] = useState(false);
  const { servicesById } = useManagedServices();
  const { hasMissingDeps } = useAppStatus();
  const serviceStatus = servicesById.app;

  const fetchStatus = async () => {
    try {
      const [statusRes, modelsRes] = await Promise.all([
        fetch(`${APP_API_URL}/api/v1/status`),
        fetch(`${APP_API_URL}/api/v1/image/upscale/models`),
      ]);
      if (!statusRes.ok) throw new Error("status");
      setServerUnreachable(false);
      if (modelsRes.ok) {
        const data = (await modelsRes.json()) as { models: string[]; binary_found: boolean };
        setBinaryFound(data.binary_found);
      }
    } catch {
      setServerUnreachable(true);
      setBinaryFound(false);
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
    {
      id: "binary",
      label: "upscayl-bin",
      isReady: binaryFound,
      path: binaryFound ? "upscayl-bin.exe" : t("tool.image_upscaler.binary_missing"),
      showSecondaryAction: false,
    },
  ];

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = ["image/jpeg", "image/png", "image/webp", "image/bmp"];
      if (!validTypes.includes(file.type) && !file.name.match(/\.(jpe?g|png|webp|bmp)$/i)) {
        toast({ title: t("tool.common.invalid_file"), description: t("tool.image_upscaler.select_valid_image"), variant: "destructive" });
        return;
      }
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setResult(null);
    }
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setResult(null);
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUpscale = async () => {
    if (!selectedFile) {
      toast({ title: t("tool.common.error"), description: t("tool.image_upscaler.select_valid_image"), variant: "destructive" });
      return;
    }

    setLoading(true);
    setResult(null);
    setProgress(0);

    try {
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + Math.random() * 10, 85));
      }, 600);

      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("scale", String(scale));
      formData.append("model_name", modelName);

      const response = await fetch(`${APP_API_URL}/api/v1/image/upscale`, {
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
      toast({ title: t("tool.common.success"), description: t("tool.image_upscaler.success") });
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

  const handleDownload = () => {
    if (!result?.download_url) return;
    window.open(`${APP_API_URL}${result.download_url}`, "_blank");
  };

  return (
    <div className="space-y-6">
      <ServiceStatusTable serverUnreachable={serverUnreachable} rows={statusRows} onRefresh={fetchStatus} serverWarning={hasMissingDeps} onOpenSettings={onOpenSettings} />

      <Card>
        <CardHeader>
          <CardTitle>{t("tool.image_upscaler.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("tool.common.image_file")}</label>

            {!selectedFile ? (
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm font-medium mb-1">{t("tool.image_upscaler.upload_image")}</p>
                <p className="text-xs text-muted-foreground">{t("tool.image_upscaler.supported_formats")}</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.bmp,image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>
            ) : (
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded flex items-center justify-center">
                      <ImageIcon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleClearFile} disabled={loading}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                {previewUrl && (
                  <img src={previewUrl} alt="Preview" className="w-full max-h-48 object-contain rounded border border-border" />
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t("tool.image_upscaler.model")}</label>
            <div className="flex flex-wrap gap-2">
              {UPSCALE_MODELS.map((m) => (
                <Button
                  key={m}
                  type="button"
                  variant={modelName === m ? "default" : "outline"}
                  size="sm"
                  onClick={() => setModelName(m)}
                  disabled={loading}
                >
                  {m.replace(/-4x$/, "")}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t("tool.image_upscaler.scale_factor")}</label>
            <div className="flex gap-3">
              {([2, 3, 4] as const).map((s) => (
                <Button
                  key={s}
                  type="button"
                  variant={scale === s ? "default" : "outline"}
                  size="sm"
                  onClick={() => setScale(s)}
                  disabled={loading}
                >
                  {s}x
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t("tool.image_upscaler.scale_hint")}</p>
          </div>

          {loading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("tool.image_upscaler.progress")}</span>
                <span className="font-medium">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          <Button onClick={handleUpscale} disabled={loading || !selectedFile || !binaryFound} className="w-full">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t("tool.image_upscaler.upscaling")}
              </>
            ) : (
              <>
                <ZoomIn className="w-4 h-4 mr-2" />
                {t("tool.image_upscaler.title")}
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
              {t("tool.image_upscaler.download")} ({scale}x PNG)
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
