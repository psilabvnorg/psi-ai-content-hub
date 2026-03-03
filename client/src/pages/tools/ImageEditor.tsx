import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, Download, RotateCcw, X } from "lucide-react";

const FILTERS = [
  { id: "none",      label: "Original",   css: "",                                             fillWhite: false },
  { id: "bw",        label: "B&W",        css: "grayscale(100%)",                              fillWhite: false },
  { id: "vivid",     label: "Vivid",      css: "saturate(200%) contrast(110%)",                fillWhite: false },
  { id: "warm",      label: "Warm",       css: "sepia(40%) saturate(150%)",                    fillWhite: false },
  { id: "classic",   label: "Classic",    css: "sepia(20%) contrast(90%) brightness(95%)",     fillWhite: false },
  { id: "cool",      label: "Cool",       css: "hue-rotate(20deg) saturate(120%)",             fillWhite: false },
  { id: "fade",      label: "Fade",       css: "brightness(115%) contrast(75%) saturate(60%)", fillWhite: false },
  { id: "fillwhite", label: "Fill White", css: "",                                             fillWhite: true  },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];
type CropRect = { x: number; y: number; w: number; h: number };
type Handle   = "tl" | "tr" | "bl" | "br" | "t" | "r" | "b" | "l" | "move";

interface DragState {
  handle: Handle; startX: number; startY: number; startCrop: CropRect;
}

const MIN     = 30;
const BRACKET = 20;
const BORDER  = 3;

export default function ImageEditor() {
  const [imageSrc, setImageSrc]     = useState<string | null>(null);
  const [imageFile, setImageFile]   = useState<File | null>(null);
  const [opacity, setOpacity]       = useState(100);
  const [brightness, setBrightness] = useState(100);
  const [filter, setFilter]         = useState<FilterId>("none");
  const [cropRect, setCropRect]     = useState<CropRect | null>(null);
  const [activeDrag, setActiveDrag] = useState<DragState | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef       = useRef<HTMLImageElement>(null);

  const isPng        = imageFile?.type === "image/png";
  const activeFilter = FILTERS.find((f) => f.id === filter)!;
  const cssFilter    = [activeFilter.css, brightness !== 100 ? `brightness(${brightness}%)` : ""]
                         .filter(Boolean).join(" ") || undefined;

  /* ── Window-level drag ── */
  useEffect(() => {
    if (!activeDrag) return;
    const img = imgRef.current;
    if (!img) return;
    const maxW = img.clientWidth;
    const maxH = img.clientHeight;

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - activeDrag.startX;
      const dy = e.clientY - activeDrag.startY;
      const { x, y, w, h } = activeDrag.startCrop;
      let nx = x, ny = y, nw = w, nh = h;
      switch (activeDrag.handle) {
        case "tl": nx = Math.max(0, Math.min(x+dx, x+w-MIN)); ny = Math.max(0, Math.min(y+dy, y+h-MIN)); nw = w-(nx-x); nh = h-(ny-y); break;
        case "tr": ny = Math.max(0, Math.min(y+dy, y+h-MIN)); nh = h-(ny-y); nw = Math.max(MIN, Math.min(w+dx, maxW-x)); break;
        case "bl": nx = Math.max(0, Math.min(x+dx, x+w-MIN)); nw = w-(nx-x); nh = Math.max(MIN, Math.min(h+dy, maxH-y)); break;
        case "br": nw = Math.max(MIN, Math.min(w+dx, maxW-x)); nh = Math.max(MIN, Math.min(h+dy, maxH-y)); break;
        case "t":  ny = Math.max(0, Math.min(y+dy, y+h-MIN)); nh = h-(ny-y); break;
        case "r":  nw = Math.max(MIN, Math.min(w+dx, maxW-x)); break;
        case "b":  nh = Math.max(MIN, Math.min(h+dy, maxH-y)); break;
        case "l":  nx = Math.max(0, Math.min(x+dx, x+w-MIN)); nw = w-(nx-x); break;
        case "move": nx = Math.max(0, Math.min(x+dx, maxW-w)); ny = Math.max(0, Math.min(y+dy, maxH-h)); break;
      }
      setCropRect({ x: nx, y: ny, w: nw, h: nh });
    };
    const onUp = () => setActiveDrag(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [activeDrag]);

  const startDrag = (handle: Handle, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!cropRect) return;
    setActiveDrag({ handle, startX: e.clientX, startY: e.clientY, startCrop: { ...cropRect } });
  };

  const handleUpload = (file: File) => {
    setImageFile(file);
    setImageSrc(URL.createObjectURL(file));
    setOpacity(100); setBrightness(100); setFilter("none"); setCropRect(null);
  };

  const onImageLoad = () => {
    const img = imgRef.current;
    if (img) setCropRect({ x: 0, y: 0, w: img.clientWidth, h: img.clientHeight });
  };

  const reset = () => {
    setOpacity(100); setBrightness(100); setFilter("none");
    const img = imgRef.current;
    if (img) setCropRect({ x: 0, y: 0, w: img.clientWidth, h: img.clientHeight });
  };

  const download = async () => {
    if (!imageSrc || !imgRef.current) return;
    const img = imgRef.current;
    const sx  = img.naturalWidth / img.clientWidth;
    const sy  = img.naturalHeight / img.clientHeight;
    const cr  = cropRect ?? { x: 0, y: 0, w: img.clientWidth, h: img.clientHeight };
    const srcX = Math.round(cr.x * sx), srcY = Math.round(cr.y * sy);
    const srcW = Math.round(cr.w * sx), srcH = Math.round(cr.h * sy);

    const canvas = document.createElement("canvas");
    canvas.width = srcW; canvas.height = srcH;
    const ctx = canvas.getContext("2d")!;
    if (activeFilter.fillWhite) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, srcW, srcH); }
    const filterStr = [activeFilter.css, brightness !== 100 ? `brightness(${brightness}%)` : ""].filter(Boolean).join(" ");
    if (filterStr) ctx.filter = filterStr;
    ctx.globalAlpha = opacity / 100;
    const source = new Image();
    source.src = imageSrc;
    await new Promise<void>((r) => { source.onload = () => r(); });
    ctx.drawImage(source, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
    const ext = isPng ? "png" : "jpeg";
    const a = document.createElement("a");
    a.download = `edited.${ext}`; a.href = canvas.toDataURL(isPng ? "image/png" : "image/jpeg", 0.95); a.click();
  };

  const cr = cropRect;

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-card">
      <CardContent className="p-8 space-y-6">

        {/* Adjustments — always visible */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold uppercase text-muted-foreground">Opacity</label>
              <span className="text-xs text-muted-foreground">{opacity}%</span>
            </div>
            <input type="range" min={0} max={100} value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))} className="w-full accent-accent" />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold uppercase text-muted-foreground">Brightness</label>
              <span className="text-xs text-muted-foreground">{brightness}%</span>
            </div>
            <input type="range" min={0} max={200} value={brightness}
              onChange={(e) => setBrightness(Number(e.target.value))} className="w-full accent-accent" />
          </div>
        </div>

        {/* Filters — always visible */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase text-muted-foreground">Filter</label>
          <div className="grid grid-cols-4 gap-2">
            {FILTERS.map((f) => (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className={`h-10 rounded-lg text-xs font-semibold border transition-colors ${
                  filter === f.id
                    ? "bg-accent text-accent-foreground border-accent"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Action buttons — always visible */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={reset} className="h-12 px-4 rounded-xl" title="Reset all adjustments">
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button onClick={download} disabled={!imageSrc} className="flex-1 h-12 rounded-xl font-bold gap-2">
            <Download className="w-4 h-4" />
            Download {isPng ? "PNG" : "Image"}
          </Button>
        </div>

        {/* Image / Upload zone */}
        {imageSrc ? (
          <>
            {/* Change image link */}
            <div className="flex items-center justify-between -mb-2">
              <label className="text-xs font-bold uppercase text-muted-foreground">Preview</label>
              <button
                onClick={() => { setImageSrc(null); setImageFile(null); setCropRect(null); }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Change image
              </button>
            </div>

            {/* Image canvas with always-on crop handles */}
            <div
              className="relative rounded-xl overflow-hidden border border-border select-none"
              style={{
                background: activeFilter.fillWhite
                  ? "#ffffff"
                  : isPng
                  ? "repeating-conic-gradient(#aaa 0% 25%,#fff 0% 50%) 0 0/16px 16px"
                  : "#000",
              }}
            >
              <img
                ref={imgRef}
                src={imageSrc}
                alt="preview"
                draggable={false}
                className="w-full h-auto block"
                style={{ filter: cssFilter, opacity: opacity / 100, userSelect: "none" }}
                onLoad={onImageLoad}
              />

              {cr && (
                <>
                  {/* Dark overlay outside crop */}
                  <div className="absolute pointer-events-none"
                    style={{ left: cr.x, top: cr.y, width: cr.w, height: cr.h, boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)" }} />

                  {/* Movable inner area + label */}
                  <div className="absolute flex items-center justify-center"
                    style={{ left: cr.x, top: cr.y, width: cr.w, height: cr.h, cursor: "move" }}
                    onMouseDown={(e) => startDrag("move", e)}>
                    <span className="text-white text-xs font-semibold px-2 py-0.5 rounded"
                      style={{ background: "rgba(0,0,0,0.35)", pointerEvents: "none", userSelect: "none" }}>
                      Crop Area
                    </span>
                  </div>

                  {/* Rule-of-thirds grid */}
                  <div className="absolute pointer-events-none"
                    style={{ left: cr.x, top: cr.y, width: cr.w, height: cr.h }}>
                    <div className="absolute top-0 bottom-0" style={{ left: "33.33%", width: 1, background: "rgba(255,255,255,0.35)" }} />
                    <div className="absolute top-0 bottom-0" style={{ left: "66.66%", width: 1, background: "rgba(255,255,255,0.35)" }} />
                    <div className="absolute left-0 right-0" style={{ top: "33.33%", height: 1, background: "rgba(255,255,255,0.35)" }} />
                    <div className="absolute left-0 right-0" style={{ top: "66.66%", height: 1, background: "rgba(255,255,255,0.35)" }} />
                  </div>

                  {/* Corner L-brackets */}
                  <div className="absolute" style={{ left: cr.x, top: cr.y, cursor: "nw-resize", width: BRACKET, height: BRACKET }} onMouseDown={(e) => startDrag("tl", e)}>
                    <div style={{ position: "absolute", top: 0, left: 0, width: BRACKET, height: BORDER, background: "white" }} />
                    <div style={{ position: "absolute", top: 0, left: 0, width: BORDER, height: BRACKET, background: "white" }} />
                  </div>
                  <div className="absolute" style={{ left: cr.x + cr.w - BRACKET, top: cr.y, cursor: "ne-resize", width: BRACKET, height: BRACKET }} onMouseDown={(e) => startDrag("tr", e)}>
                    <div style={{ position: "absolute", top: 0, right: 0, width: BRACKET, height: BORDER, background: "white" }} />
                    <div style={{ position: "absolute", top: 0, right: 0, width: BORDER, height: BRACKET, background: "white" }} />
                  </div>
                  <div className="absolute" style={{ left: cr.x, top: cr.y + cr.h - BRACKET, cursor: "sw-resize", width: BRACKET, height: BRACKET }} onMouseDown={(e) => startDrag("bl", e)}>
                    <div style={{ position: "absolute", bottom: 0, left: 0, width: BRACKET, height: BORDER, background: "white" }} />
                    <div style={{ position: "absolute", bottom: 0, left: 0, width: BORDER, height: BRACKET, background: "white" }} />
                  </div>
                  <div className="absolute" style={{ left: cr.x + cr.w - BRACKET, top: cr.y + cr.h - BRACKET, cursor: "se-resize", width: BRACKET, height: BRACKET }} onMouseDown={(e) => startDrag("br", e)}>
                    <div style={{ position: "absolute", bottom: 0, right: 0, width: BRACKET, height: BORDER, background: "white" }} />
                    <div style={{ position: "absolute", bottom: 0, right: 0, width: BORDER, height: BRACKET, background: "white" }} />
                  </div>

                  {/* Edge pill handles */}
                  <div className="absolute flex items-center justify-center" style={{ left: cr.x + cr.w/2 - 20, top: cr.y - 8, width: 40, height: 16, cursor: "n-resize" }} onMouseDown={(e) => startDrag("t", e)}>
                    <div style={{ width: 32, height: BORDER, background: "white", borderRadius: 2 }} />
                  </div>
                  <div className="absolute flex items-center justify-center" style={{ left: cr.x + cr.w/2 - 20, top: cr.y + cr.h - 8, width: 40, height: 16, cursor: "s-resize" }} onMouseDown={(e) => startDrag("b", e)}>
                    <div style={{ width: 32, height: BORDER, background: "white", borderRadius: 2 }} />
                  </div>
                  <div className="absolute flex items-center justify-center" style={{ left: cr.x - 8, top: cr.y + cr.h/2 - 20, width: 16, height: 40, cursor: "w-resize" }} onMouseDown={(e) => startDrag("l", e)}>
                    <div style={{ width: BORDER, height: 32, background: "white", borderRadius: 2 }} />
                  </div>
                  <div className="absolute flex items-center justify-center" style={{ left: cr.x + cr.w - 8, top: cr.y + cr.h/2 - 20, width: 16, height: 40, cursor: "e-resize" }} onMouseDown={(e) => startDrag("r", e)}>
                    <div style={{ width: BORDER, height: 32, background: "white", borderRadius: 2 }} />
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          /* Upload zone */
          <div
            className="border-2 border-dashed border-border rounded-xl text-center cursor-pointer hover:border-accent transition-colors p-16"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("image/")) handleUpload(f); }}
          >
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
            <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-semibold text-foreground">Click or drag to upload image</p>
            <p className="text-xs text-muted-foreground mt-1">PNG, JPG, WEBP · PNG transparency preserved</p>
          </div>
        )}

      </CardContent>
    </Card>
  );
}
