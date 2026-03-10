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

export default function ImageBorderOutline({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [thickness, setThickness] = useState(10);
  const [borderColor, setBorderColor] = useState("#ffffff");
  const [feather, setFeather] = useState(40);
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
    if (!file.type.includes("png") && !file.name.match(/\.png$/i)) {
      toast({ title: "PNG required", description: "Please select a PNG image with transparency.", variant: "destructive" });
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
      formData.append("thickness", String(thickness));
      formData.append("color", borderColor);
      formData.append("feather", String(feather));

      const response = await fetch(`${APP_API_URL}/api/v1/image-border`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { detail?: string };
        throw new Error(error.detail || "Processing failed");
      }

      const data = await response.json() as ProcessResult;
      setResult(data);

      const imgRes = await fetch(`${APP_API_URL}${data.download_url}`);
      const blob = await imgRes.blob();
      setResultPreviewUrl(URL.createObjectURL(blob));

      toast({ title: "Done", description: "Border outline added successfully." });
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
          <CardTitle>Image Border Outline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Adds a colored border/outline around the subject of a transparent PNG image using alpha channel dilation.
            Upload a PNG with a transparent background (e.g. a cutout logo or person).
          </p>

          <div className="space-y-2">
            <label className="text-sm font-medium">PNG File (with transparency)</label>

            {!selectedFile ? (
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
              >
                <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm font-medium mb-1">Click or drag & drop a PNG</p>
                <p className="text-xs text-muted-foreground">PNG with transparent background required</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".png,image/png"
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
                  <div
                    className="rounded border border-border overflow-hidden"
                    style={{ background: "repeating-conic-gradient(#aaa 0% 25%, #fff 0% 50%) 0 0 / 16px 16px" }}
                  >
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="w-full max-h-48 object-contain"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Border Thickness</label>
                <span className="text-sm font-mono text-muted-foreground">{thickness}px</span>
              </div>
              <input
                type="range"
                min={1}
                max={60}
                value={thickness}
                onChange={(e) => { setThickness(Number(e.target.value)); setResult(null); }}
                className="w-full accent-accent"
              />
              <p className="text-xs text-muted-foreground">Pixels of outline around subject</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Feather</label>
                <span className="text-sm font-mono text-muted-foreground">{feather}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={feather}
                onChange={(e) => { setFeather(Number(e.target.value)); setResult(null); }}
                className="w-full accent-accent"
              />
              <p className="text-xs text-muted-foreground">0 = hard edge · 100 = soft glow</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Border Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={borderColor}
                onChange={(e) => { setBorderColor(e.target.value); setResult(null); }}
                className="h-10 w-16 rounded-md border border-border cursor-pointer"
              />
              <input
                type="text"
                value={borderColor}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  if (/^#[0-9a-fA-F]{6}$/.test(v)) setBorderColor(v);
                  else if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setBorderColor(v as string);
                }}
                placeholder="#ffffff"
                maxLength={7}
                className="flex-1 h-10 px-3 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
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
              "Add Border Outline"
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
              style={{ background: "repeating-conic-gradient(#aaa 0% 25%, #fff 0% 50%) 0 0 / 16px 16px" }}
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
