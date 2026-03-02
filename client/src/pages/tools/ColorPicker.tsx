import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Pipette, Copy, Check, Upload, X } from "lucide-react";
import { useI18n } from "@/i18n/i18n";

function toHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : null;
}

export default function ColorPickerTool() {
  const { t } = useI18n();

  const [color, setColor] = useState("#3b82f6");
  const [copied, setCopied] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [hoverColor, setHoverColor] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Draw image onto hidden canvas for pixel reading whenever imageUrl changes
  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")?.drawImage(img, 0, 0);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Cleanup object URL on unmount or image change
  useEffect(() => {
    return () => { if (imageUrl) URL.revokeObjectURL(imageUrl); };
  }, [imageUrl]);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setImageUrl(URL.createObjectURL(file));
  };

  const getPixelAt = (e: React.MouseEvent<HTMLImageElement>) => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return null;
    const rect = img.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
    const y = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height));
    const data = canvas.getContext("2d")?.getImageData(x, y, 1, 1).data;
    if (!data) return null;
    return toHex(data[0], data[1], data[2]);
  };

  const handleImgClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const hex = getPixelAt(e);
    if (hex) setColor(hex);
  };

  const handleImgMove = (e: React.MouseEvent<HTMLImageElement>) => {
    const hex = getPixelAt(e);
    if (!hex) return;
    setHoverColor(hex);
    const rect = imgRef.current!.getBoundingClientRect();
    setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handlePickScreen = async () => {
    if ("EyeDropper" in window) {
      try {
        const result = await new (window as any).EyeDropper().open();
        setColor(result.sRGBHex);
      } catch { /* cancelled */ }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(color);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const rgb = hexToRgb(color);

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-card">
      <CardContent className="p-8 space-y-6">

        {/* Image Upload / Preview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-muted-foreground uppercase">
              {t("tool.color.upload_image")}
            </label>
            {imageUrl && (
              <button
                className="text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setImageUrl(null)}
                title="Remove image"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {!imageUrl ? (
            /* Drop zone — same pattern as ImageUpscaler/AudioTrimmer */
            <div
              className="border-2 border-dashed border-border rounded-xl p-10 text-center cursor-pointer hover:border-accent transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onDragOver={(e) => e.preventDefault()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.bmp,image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium text-muted-foreground">
                {t("tool.color.upload_hint")}
              </p>
            </div>
          ) : (
            /* Image display — click to pick color */
            <div className="relative rounded-xl overflow-hidden border border-border">
              <img
                ref={imgRef}
                src={imageUrl}
                alt="color source"
                className="w-full block cursor-crosshair"
                onClick={handleImgClick}
                onMouseMove={handleImgMove}
                onMouseLeave={() => setHoverColor(null)}
              />
              {/* Hidden canvas used only for pixel reading */}
              <canvas ref={canvasRef} className="hidden" />
              {/* Hover color tooltip */}
              {hoverColor && (
                <div
                  className="pointer-events-none absolute flex items-center gap-2 bg-popover border border-border rounded-lg px-2 py-1.5 shadow-lg text-xs font-mono z-10"
                  style={{
                    left: cursorPos.x + 14,
                    top: cursorPos.y + 14,
                    transform: cursorPos.x > 420 ? "translateX(-110%)" : undefined,
                  }}
                >
                  <div
                    className="w-4 h-4 rounded-sm border border-border flex-shrink-0"
                    style={{ background: hoverColor }}
                  />
                  {hoverColor}
                </div>
              )}
            </div>
          )}
        </div>

        {/* HEX + RGB */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase">
              {t("tool.color.hex")}
            </label>
            <Input
              value={color}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setColor(e.target.value)}
              className="font-mono bg-card border-border"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase">
              {t("tool.color.rgb")}
            </label>
            <Input
              readOnly
              value={rgb ? `${rgb.r}, ${rgb.g}, ${rgb.b}` : "—"}
              className="font-mono bg-muted border-border text-muted-foreground"
            />
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-2">
          <Button
            className="flex-1 h-12 bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl font-bold"
            onClick={handlePickScreen}
          >
            <Pipette className="w-5 h-5 mr-2" />
            {t("tool.color.pick_btn")}
          </Button>

          <Button
            className="flex-1 h-12 rounded-xl font-bold"
            variant="outline"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="w-5 h-5 mr-2 text-green-500" />
            ) : (
              <Copy className="w-5 h-5 mr-2" />
            )}
            {copied ? t("tool.color.copied") : t("tool.color.copy")}
          </Button>
        </div>

        {/* Preview */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-muted-foreground uppercase">
            {t("tool.color.preview")}
          </label>
          <div
            className="w-full h-16 rounded-xl border border-border"
            style={{ background: color }}
          />
        </div>

      </CardContent>
    </Card>
  );
}
