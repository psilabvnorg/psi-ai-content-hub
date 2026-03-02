import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, X } from "lucide-react";

const PAGE_SIZES = {
  youtube: { label: "YouTube — Horizontal (16:9)", aspectRatio: "16 / 9", maxWidth: "100%" },
  tiktok:  { label: "TikTok — Vertical (9:16)",   aspectRatio: "9 / 16",  maxWidth: "340px" },
} as const;

type PageSize = keyof typeof PAGE_SIZES;

export default function ThumbnailCreator() {
  const [pageSize, setPageSize] = useState<PageSize>("youtube");
  const [mode, setMode] = useState<"gradient-split" | "normal-gradient">("gradient-split");
  const [split, setSplit] = useState("30");
  const [color1, setColor1] = useState("#00ff88");
  const [opacity1, setOpacity1] = useState(100);
  const [transparent1, setTransparent1] = useState(false);
  const [color2, setColor2] = useState("#003322");
  const [opacity2, setOpacity2] = useState(100);
  const [transparent2, setTransparent2] = useState(false);
  const [elements, setElements] = useState<any[]>([]);

  const toRgba = (hex: string, opacity: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${opacity / 100})`;
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const handleAddOverlay = (file: File) => {
    const url = URL.createObjectURL(file);
    setElements((prev) => [
      ...prev,
      {
        id: Date.now(),
        x: 100,
        y: 100,
        w: 120,
        h: 120,
        src: url,
      },
    ]);
  };

  const startDrag = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const el = elements.find((x) => x.id === id);
    if (!el) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const origX = el.x;
    const origY = el.y;

    const move = (evt: MouseEvent) => {
      const dx = evt.clientX - startX;
      const dy = evt.clientY - startY;
      setElements((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, x: origX + dx, y: origY + dy } : item
        )
      );
    };

    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const startResize = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const el = elements.find((x) => x.id === id);
    if (!el) return;

    const startX = e.clientX;
    const startW = el.w;

    const move = (evt: MouseEvent) => {
      const dx = evt.clientX - startX;
      const newW = Math.max(30, startW + dx);
      const ratio = el.h / el.w;
      setElements((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, w: newW, h: newW * ratio } : item
        )
      );
    };

    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const exportPNG = async () => {
    if (!canvasRef.current) return;

    const outW = pageSize === "youtube" ? 1280 : 1080;
    const outH = pageSize === "youtube" ? 720  : 1920;
    const { width: dW, height: dH } = canvasRef.current.getBoundingClientRect();

    const canvas = document.createElement("canvas");
    canvas.width  = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d")!;

    // Draw gradient background
    if (!(transparent1 && transparent2)) {
      const c1 = transparent1 ? "rgba(0,0,0,0)" : toRgba(color1, opacity1);
      const c2 = transparent2 ? "rgba(0,0,0,0)" : toRgba(color2, opacity2);
      const grad = pageSize === "youtube"
        ? ctx.createLinearGradient(0, 0, outW, 0)
        : ctx.createLinearGradient(0, 0, 0, outH);

      if (mode === "gradient-split") {
        const p = parseInt(split) / 100;
        grad.addColorStop(0, c1);
        grad.addColorStop(Math.max(0, p - 0.001), c1);
        grad.addColorStop(Math.min(1, p + 0.001), c2);
        grad.addColorStop(1, c2);
      } else {
        const p = parseInt(split) / 100;
        grad.addColorStop(0, c1);
        grad.addColorStop(Math.max(0, p - 0.05), c1);
        grad.addColorStop(Math.min(1, p + 0.05), c2);
        grad.addColorStop(1, c2);
      }

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, outW, outH);
    }

    // Draw overlay images scaled from display coords to output coords
    const sx = outW / dW;
    const sy = outH / dH;
    for (const el of elements) {
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => { ctx.drawImage(img, el.x * sx, el.y * sy, el.w * sx, el.h * sy); resolve(); };
        img.onerror = () => resolve();
        img.src = el.src;
      });
    }

    const link = document.createElement("a");
    link.download = "thumbnail.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-card">
      <CardContent className="p-8 space-y-8">
        {/* Page Size */}
        <div className="space-y-1">
          <label className="text-xs font-bold uppercase text-muted-foreground">
            Page Size
          </label>
          <Select value={pageSize} onValueChange={(v: PageSize) => setPageSize(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select size" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PAGE_SIZES) as PageSize[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {PAGE_SIZES[key].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Background Mode */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase text-muted-foreground">
              Mode
            </label>
            <Select value={mode} onValueChange={(v: any) => setMode(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gradient-split">Normal Split</SelectItem>
                <SelectItem value="normal-gradient">Gradient Split</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase text-muted-foreground">
              Split %
            </label>
            <Select value={split} onValueChange={setSplit}>
              <SelectTrigger>
                <SelectValue placeholder="Pick split" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20%</SelectItem>
                <SelectItem value="30">30%</SelectItem>
                <SelectItem value="40">40%</SelectItem>
                <SelectItem value="50">50%</SelectItem>
                <SelectItem value="60">60%</SelectItem>
                <SelectItem value="69">69%</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Colors */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-muted-foreground">
              Color 1
            </label>
            <input
              type="color"
              value={color1}
              onChange={(e) => setColor1(e.target.value)}
              disabled={transparent1}
              className="w-full h-12 rounded-md border border-border cursor-pointer disabled:opacity-30"
            />
            <div className="flex items-center gap-2">
              <input
                id="transparent1"
                type="checkbox"
                checked={transparent1}
                onChange={(e) => setTransparent1(e.target.checked)}
                className="w-4 h-4 cursor-pointer accent-accent"
              />
              <label htmlFor="transparent1" className="text-xs text-muted-foreground cursor-pointer">
                Transparent
              </label>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">Opacity: {opacity1}%</label>
                <button
                  onClick={() => setOpacity1((v) => Math.min(100, v * 2))}
                  disabled={transparent1 || opacity1 === 100}
                  className="text-xs px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-30"
                >×2</button>
              </div>
              <input
                type="range" min={0} max={100} value={opacity1}
                onChange={(e) => setOpacity1(Number(e.target.value))}
                disabled={transparent1}
                className="w-full accent-accent disabled:opacity-30"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-muted-foreground">
              Color 2
            </label>
            <input
              type="color"
              value={color2}
              onChange={(e) => setColor2(e.target.value)}
              disabled={transparent2}
              className="w-full h-12 rounded-md border border-border cursor-pointer disabled:opacity-30"
            />
            <div className="flex items-center gap-2">
              <input
                id="transparent2"
                type="checkbox"
                checked={transparent2}
                onChange={(e) => setTransparent2(e.target.checked)}
                className="w-4 h-4 cursor-pointer accent-accent"
              />
              <label htmlFor="transparent2" className="text-xs text-muted-foreground cursor-pointer">
                Transparent
              </label>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">Opacity: {opacity2}%</label>
                <button
                  onClick={() => setOpacity2((v) => Math.min(100, v * 2))}
                  disabled={transparent2 || opacity2 === 100}
                  className="text-xs px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-30"
                >×2</button>
              </div>
              <input
                type="range" min={0} max={100} value={opacity2}
                onChange={(e) => setOpacity2(Number(e.target.value))}
                disabled={transparent2}
                className="w-full accent-accent disabled:opacity-30"
              />
            </div>
          </div>
        </div>

        {/* Upload Overlay */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase text-muted-foreground">
            Add overlay element (logo / icon)
          </label>
          <div
            className="border-2 border-dashed border-border p-10 rounded-xl text-center cursor-pointer hover:border-accent"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleAddOverlay(f);
              }}
            />
            <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Click to upload</p>
          </div>
        </div>

        {/* Design Canvas */}
        {/* Outer wrapper: handles sizing + checkerboard (visual only, not exported) */}
        <div
          className="relative rounded-xl border border-border overflow-hidden mx-auto"
          style={{
            maxWidth: PAGE_SIZES[pageSize].maxWidth,
            width: "100%",
            aspectRatio: PAGE_SIZES[pageSize].aspectRatio,
            background: "repeating-conic-gradient(#aaa 0% 25%, #fff 0% 50%) 0 0 / 16px 16px",
          }}
        >
          {/* Inner canvas: exported — only real gradient, no checkerboard */}
          <div
            ref={canvasRef}
            className="absolute inset-0"
            style={{
              background: (() => {
                const c1 = transparent1 ? "transparent" : toRgba(color1, opacity1);
                const c2 = transparent2 ? "transparent" : toRgba(color2, opacity2);
                const dir = pageSize === "youtube" ? "to right" : "to bottom";
                if (transparent1 && transparent2) return "transparent";
                return mode === "gradient-split"
                  ? `linear-gradient(${dir}, ${c1} ${split}%, ${c2} ${split}%)`
                  : `linear-gradient(${dir}, ${c1} calc(${split}% - 10%), ${c2} calc(${split}% + 10%))`;
              })(),
            }}
          >
            {elements.map((el) => (
              <div
                key={el.id}
                className="absolute group"
                style={{
                  left: el.x,
                  top: el.y,
                  width: el.w,
                  height: el.h,
                  cursor: "move",
                }}
                onMouseDown={(e) => startDrag(el.id, e)}
              >
                <img
                  src={el.src}
                  className="w-full h-full object-contain pointer-events-none"
                />
                <div
                  className="absolute bottom-0 right-0 w-4 h-4 bg-white border border-black cursor-se-resize"
                  onMouseDown={(e) => startResize(el.id, e)}
                />
                <button
                  className="absolute -top-3 -right-3 bg-white border border-border rounded-full p-1 opacity-0 group-hover:opacity-100"
                  onClick={() =>
                    setElements((p) => p.filter((x) => x.id !== el.id))
                  }
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Export */}
        <Button
          className="w-full h-12 rounded-xl font-bold mt-4"
          onClick={exportPNG}
        >
          Export PNG
        </Button>
      </CardContent>
    </Card>
  );
}
