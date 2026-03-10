import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Download, Upload, X, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { APP_API_URL } from "@/lib/api";
import { ServiceStatusTable } from "@/components/common/tool-page-ui";
import type { StatusRowConfig } from "@/components/common/tool-page-ui";
import { useAppStatus } from "@/context/AppStatusContext";
import { downloadFile } from "@/lib/download";

type ProcessResult = {
  download_url: string;
  filename: string;
};

export default function TransparentLogo({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tolerance, setTolerance] = useState(1);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [resultPreviewUrl, setResultPreviewUrl] = useState<string | null>(null);
  const [serverUnreachable, setServerUnreachable] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { hasMissingDeps } = useAppStatus();

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${APP_API_URL}/api/v1/status`);
      if (!res.ok) throw new Error("status");
      setServerUnreachable(false);
    } catch {
      setServerUnreachable(true);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const statusRows: StatusRowConfig[] = [
    {
      id: "server",
      label: "App Server Status",
      isReady: !serverUnreachable,
      path: APP_API_URL,
      showSecondaryAction: serverUnreachable && Boolean(onOpenSettings),
      secondaryActionLabel: "Open Settings",
      onSecondaryAction: onOpenSettings,
    },
  ];

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/bmp"];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(jpe?g|png|webp|bmp)$/i)) {
      toast({ title: "Invalid file", description: "Please select a JPG, PNG, WEBP, or BMP image.", variant: "destructive" });
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setResult(null);
    if (resultPreviewUrl) {
      URL.revokeObjectURL(resultPreviewUrl);
      setResultPreviewUrl(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const fakeEvent = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileSelect(fakeEvent);
    }
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setResult(null);
    if (resultPreviewUrl) {
      URL.revokeObjectURL(resultPreviewUrl);
      setResultPreviewUrl(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleProcess = async () => {
    if (!selectedFile) return;
    setLoading(true);
    setResult(null);
    if (resultPreviewUrl) {
      URL.revokeObjectURL(resultPreviewUrl);
      setResultPreviewUrl(null);
    }

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("tolerance", String(tolerance));

      const response = await fetch(`${APP_API_URL}/api/v1/thumbnail-simple`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { detail?: string };
        throw new Error(error.detail || "Processing failed");
      }

      const data = await response.json() as ProcessResult;
      setResult(data);

      // Fetch result image for preview
      const imgRes = await fetch(`${APP_API_URL}${data.download_url}`);
      const blob = await imgRes.blob();
      setResultPreviewUrl(URL.createObjectURL(blob));

      toast({ title: "Done", description: "Background removed successfully." });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!result?.download_url) return;
    downloadFile(result.download_url, result.filename, APP_API_URL);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <div className="space-y-6">
      <ServiceStatusTable
        serverUnreachable={serverUnreachable}
        rows={statusRows}
        onRefresh={fetchStatus}
        serverWarning={hasMissingDeps}
        onOpenSettings={onOpenSettings}
      />

      <Card>
        <CardHeader>
          <CardTitle>Transparent Logo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Detects the background color from image corners and makes all pixels within the color tolerance transparent.
            Works best for logos and images with a solid single-color background (e.g. white, black).
          </p>

          <div className="space-y-2">
            <label className="text-sm font-medium">Image File</label>

            {!selectedFile ? (
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
              >
                <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm font-medium mb-1">Click or drag & drop an image</p>
                <p className="text-xs text-muted-foreground">PNG, JPG, WEBP, BMP supported</p>
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
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="w-full max-h-48 object-contain rounded border border-border"
                  />
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Color Tolerance</label>
              <span className="text-sm font-mono text-muted-foreground">{tolerance}</span>
            </div>
            <input
              type="range"
              min={1}
              max={120}
              value={tolerance}
              onChange={(e) => { setTolerance(Number(e.target.value)); setResult(null); }}
              className="w-full accent-accent"
            />
            <p className="text-xs text-muted-foreground">
              Low = only exact background color removed &nbsp;·&nbsp; High = more pixels removed (may affect edges)
            </p>
          </div>

          <Button
            onClick={handleProcess}
            disabled={loading || !selectedFile || serverUnreachable}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing…
              </>
            ) : (
              "Remove Background"
            )}
          </Button>
        </CardContent>
      </Card>

      {resultPreviewUrl && result && (
        <Card>
          <CardHeader>
            <CardTitle>Result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className="rounded-xl border border-border overflow-hidden"
              style={{
                background: "repeating-conic-gradient(#aaa 0% 25%, #fff 0% 50%) 0 0 / 16px 16px",
              }}
            >
              <img
                src={resultPreviewUrl}
                alt="Result"
                className="w-full max-h-96 object-contain"
              />
            </div>
            <Button onClick={handleDownload} variant="download" className="w-full">
              <Download className="w-4 h-4 mr-2" />
              Download {result.filename}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
