import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, X } from "lucide-react";
import html2canvas from "html2canvas";

export default function ThumbnailCreator() {
  const [mode, setMode] = useState<"gradient-split" | "normal-gradient">("gradient-split");
  const [split, setSplit] = useState("30");
  const [color1, setColor1] = useState("#00ff88");
  const [color2, setColor2] = useState("#003322");
  const [elements, setElements] = useState<any[]>([]);

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
    const canvas = await html2canvas(canvasRef.current, { scale: 2, useCORS: true });
    const link = document.createElement("a");
    link.download = "thumbnail.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-card">
      <CardContent className="p-8 space-y-8">
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
                <SelectItem value="gradient-split">Gradient Split (A/B)</SelectItem>
                <SelectItem value="normal-gradient">Full Gradient</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === "gradient-split" && (
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
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Colors */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">
              Color 1
            </label>
            <input
              type="color"
              value={color1}
              onChange={(e) => setColor1(e.target.value)}
              className="w-full h-12 rounded-md border border-border cursor-pointer"
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">
              Color 2
            </label>
            <input
              type="color"
              value={color2}
              onChange={(e) => setColor2(e.target.value)}
              className="w-full h-12 rounded-md border border-border cursor-pointer"
            />
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
        <div
          ref={canvasRef}
          className="relative w-full rounded-xl border border-border overflow-hidden"
          style={{
            height: "600px",
            background:
              mode === "gradient-split"
                ? `linear-gradient(to bottom, ${color1} ${split}%, ${color2} ${split}%)`
                : `linear-gradient(${color1}, ${color2})`,
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
