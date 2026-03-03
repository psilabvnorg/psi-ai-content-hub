import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, X, Maximize2, Save, Trash2 } from "lucide-react";

const PAGE_SIZES = {
  youtube: { label: "YouTube — Horizontal (16:9)", aspectRatio: "16 / 9", maxWidth: "100%" },
  tiktok:  { label: "TikTok — Vertical (9:16)",   aspectRatio: "9 / 16",  maxWidth: "340px" },
} as const;

type PageSize = keyof typeof PAGE_SIZES;

type TemplateData = {
  slug: string;
  name: string;
  pageSize: PageSize;
  mode: "gradient-split" | "normal-gradient";
  split: number;
  color1: string; opacity1: number; transparent1: boolean;
  color2: string; opacity2: number; transparent2: boolean;
  elements: any[];
};

const electronAPI = (window as any).electronAPI as any;

export default function ThumbnailCreator() {
  const [pageSize, setPageSize] = useState<PageSize>("tiktok");
  const [mode, setMode] = useState<"gradient-split" | "normal-gradient">("normal-gradient");
  const [split, setSplit] = useState(50);
  const [color1, setColor1] = useState("#00ff88");
  const [opacity1, setOpacity1] = useState(100);
  const [transparent1, setTransparent1] = useState(false);
  const [color2, setColor2] = useState("#003322");
  const [opacity2, setOpacity2] = useState(100);
  const [transparent2, setTransparent2] = useState(false);
  const [elements, setElements] = useState<any[]>([]);

  // Template state
  const [prebuiltTemplates, setPrebuiltTemplates] = useState<TemplateData[]>([]);
  const [userTemplates, setUserTemplates]         = useState<TemplateData[]>([]);
  const [selectedTemplate, setSelectedTemplate]   = useState("");
  const [savingTemplate, setSavingTemplate]       = useState(false);
  const [templateName, setTemplateName]           = useState("");

  // Load templates on mount
  useEffect(() => {
    // Load prebuilt via Electron IPC (auto-discovers all subfolders in client/public/templates/)
    if (electronAPI?.templates) {
      electronAPI.templates.listPrebuilt()
        .then(async (list: { slug: string; name: string }[]) => {
          const loaded = await Promise.all(
            list.map(({ slug, name }) =>
              fetch(`/templates/${slug}/template.json`)
                .then(r => r.json())
                .then(data => ({ ...data, slug, name } as TemplateData))
                .catch(() => null)
            )
          );
          setPrebuiltTemplates(loaded.filter(Boolean) as TemplateData[]);
        })
        .catch(() => {});

      electronAPI.templates.listUser()
        .then((list: TemplateData[]) => setUserTemplates(list))
        .catch(() => {});
    }
  }, []);

  // Convert a blob URL to base64 data URL
  const blobToBase64 = async (src: string): Promise<string> => {
    if (src.startsWith("data:")) return src;
    const blob = await fetch(src).then(r => r.blob());
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  };

  // Apply a loaded template object to state
  const applyTemplate = (t: TemplateData) => {
    setPageSize(t.pageSize);
    setMode(t.mode);
    setSplit(t.split);
    setColor1(t.color1);     setOpacity1(t.opacity1);     setTransparent1(t.transparent1);
    setColor2(t.color2);     setOpacity2(t.opacity2);     setTransparent2(t.transparent2);
    setElements(t.elements.map(el => ({ ...el, id: Date.now() + Math.random() })));
  };

  // Load and apply selected template
  const handleLoadTemplate = async (value: string) => {
    setSelectedTemplate(value);
    if (!value) return;
    const [source, slug] = value.split(":");
    try {
      if (source === "prebuilt") {
        const data = await fetch(`/templates/${slug}/template.json`).then(r => r.json());
        const elements = (data.elements || []).map((el: any) =>
          el.file ? { ...el, src: `/templates/${slug}/${el.file}`, file: undefined } : el
        );
        applyTemplate({ ...data, slug, elements });
      } else if (source === "user" && electronAPI?.templates) {
        const data: TemplateData = await electronAPI.templates.get(slug);
        applyTemplate(data);
      }
    } catch (e) {
      console.error("Failed to load template", e);
    }
  };

  // Save current canvas state as a user template
  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return;
    if (!electronAPI?.templates) {
      alert("Template saving is only available in the desktop app.");
      setSavingTemplate(false);
      return;
    }
    const template = {
      pageSize, mode, split,
      color1, opacity1, transparent1,
      color2, opacity2, transparent2,
      elements: await Promise.all(
        elements.map(async el => ({
          ...el,
          src: el.src ? await blobToBase64(el.src) : undefined,
        }))
      ),
    };
    try {
      await electronAPI.templates.save(templateName.trim(), template);
      const list: TemplateData[] = await electronAPI.templates.listUser();
      setUserTemplates(list);
      setTemplateName("");
      setSavingTemplate(false);
    } catch (e) {
      console.error("Failed to save template", e);
    }
  };

  // Delete a user template
  const handleDeleteTemplate = async (slug: string) => {
    try {
      await electronAPI.templates.delete(slug);
      setUserTemplates(prev => prev.filter(t => t.slug !== slug));
      if (selectedTemplate === `user:${slug}`) setSelectedTemplate("");
    } catch (e) {
      console.error("Failed to delete template", e);
    }
  };

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
        opacity: 100,
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
        const p = split / 100;
        grad.addColorStop(0, c1);
        grad.addColorStop(Math.max(0, p - 0.001), c1);
        grad.addColorStop(Math.min(1, p + 0.001), c2);
        grad.addColorStop(1, c2);
      } else {
        const p = split / 100;
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
        img.onload = () => {
          ctx.globalAlpha = (el.opacity ?? 100) / 100;
          ctx.drawImage(img, el.x * sx, el.y * sy, el.w * sx, el.h * sy);
          ctx.globalAlpha = 1;
          resolve();
        };
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
        {/* Templates */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase text-muted-foreground">Templates</label>

          {/* Template dropdown */}
          <Select value={selectedTemplate} onValueChange={handleLoadTemplate}>
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder="Load a template…" />
            </SelectTrigger>
            <SelectContent>
              {prebuiltTemplates.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Prebuilt</SelectLabel>
                  {prebuiltTemplates.map(t => (
                    <SelectItem key={t.slug} value={`prebuilt:${t.slug}`}>{t.name}</SelectItem>
                  ))}
                </SelectGroup>
              )}
              {userTemplates.length > 0 && (
                <SelectGroup>
                  <SelectLabel>My Templates</SelectLabel>
                  {userTemplates.map(t => (
                    <SelectItem key={t.slug} value={`user:${t.slug}`}>
                      <span className="flex items-center justify-between w-full gap-4">
                        <span>{t.name}</span>
                        <button
                          className="text-muted-foreground hover:text-red-500 transition-colors"
                          onClick={e => { e.stopPropagation(); handleDeleteTemplate(t.slug); }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {prebuiltTemplates.length === 0 && userTemplates.length === 0 && (
                <SelectItem value="__empty" disabled>No templates yet</SelectItem>
              )}
            </SelectContent>
          </Select>

        </div>

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
            <div className="flex gap-2">
              {(["gradient-split", "normal-gradient"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 h-10 rounded-md border text-xs font-semibold transition-colors ${
                    mode === m
                      ? "bg-accent text-accent-foreground border-accent"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m === "gradient-split" ? "Normal Split" : "Gradient Split"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase text-muted-foreground">
                Split %
              </label>
              <span className="text-xs text-muted-foreground">{split}%</span>
            </div>
            <input
              type="range" min={0} max={100} value={split}
              onChange={(e) => setSplit(Number(e.target.value))}
              className="w-full accent-accent mt-2"
            />
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
            <input
              type="text"
              value={color1}
              onChange={(e) => {
                const v = e.target.value.trim();
                if (/^#[0-9a-fA-F]{6}$/.test(v)) setColor1(v);
                else if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setColor1(v as any);
              }}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData("text").trim();
                const hex = pasted.startsWith("#") ? pasted : `#${pasted}`;
                if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
                  e.preventDefault();
                  setColor1(hex);
                }
              }}
              disabled={transparent1}
              placeholder="#000000"
              maxLength={7}
              className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm font-mono disabled:opacity-30 focus:outline-none focus:ring-1 focus:ring-accent"
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
            <input
              type="text"
              value={color2}
              onChange={(e) => {
                const v = e.target.value.trim();
                if (/^#[0-9a-fA-F]{6}$/.test(v)) setColor2(v);
                else if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setColor2(v as any);
              }}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData("text").trim();
                const hex = pasted.startsWith("#") ? pasted : `#${pasted}`;
                if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
                  e.preventDefault();
                  setColor2(hex);
                }
              }}
              disabled={transparent2}
              placeholder="#000000"
              maxLength={7}
              className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm font-mono disabled:opacity-30 focus:outline-none focus:ring-1 focus:ring-accent"
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
                {/* Opacity slider — visible on hover, sits above the element */}
                <div
                  className="absolute -top-7 left-0 right-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <input
                    type="range" min={0} max={100} value={el.opacity ?? 100}
                    onChange={(e) =>
                      setElements((prev) =>
                        prev.map((item) =>
                          item.id === el.id ? { ...item, opacity: Number(e.target.value) } : item
                        )
                      )
                    }
                    className="w-full h-1 accent-white cursor-pointer"
                    style={{ accentColor: "white" }}
                  />
                  <span className="text-white text-[9px] font-bold leading-none w-7 shrink-0 drop-shadow">
                    {el.opacity ?? 100}%
                  </span>
                </div>
                <img
                  src={el.src}
                  className="w-full h-full object-contain pointer-events-none"
                  style={{ opacity: (el.opacity ?? 100) / 100 }}
                />
                <div
                  className="absolute -bottom-3 -right-3 w-6 h-6 flex items-center justify-center bg-white border border-border rounded-full cursor-se-resize shadow-md hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"
                  onMouseDown={(e) => startResize(el.id, e)}
                >
                  <Maximize2 className="w-3 h-3 text-gray-600 rotate-90" />
                </div>
                <button
                  className="absolute -top-3 -right-3 w-6 h-6 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-colors shadow-md"
                  onClick={() =>
                    setElements((p) => p.filter((x) => x.id !== el.id))
                  }
                >
                  <X className="w-3.5 h-3.5" strokeWidth={3} />
                </button>
              </div>
            ))}
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

        {/* Export */}
        <Button
          className="w-full h-12 rounded-xl font-bold mt-4"
          onClick={exportPNG}
        >
          Export PNG
        </Button>

        {/* Save template */}
        {savingTemplate ? (
          <div className="flex gap-2">
            <Input
              autoFocus
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSaveTemplate(); if (e.key === "Escape") setSavingTemplate(false); }}
              placeholder="Template name…"
              className="h-9 rounded-xl text-sm"
            />
            <Button size="sm" onClick={handleSaveTemplate} disabled={!templateName.trim()} className="rounded-xl">Save</Button>
            <Button size="sm" variant="ghost" onClick={() => { setSavingTemplate(false); setTemplateName(""); }} className="rounded-xl">Cancel</Button>
          </div>
        ) : (
          <Button
            className="w-full h-12 rounded-xl font-bold gap-2"
            onClick={() => setSavingTemplate(true)}
          >
            <Save className="w-4 h-4" />
            Save Current as Template
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
