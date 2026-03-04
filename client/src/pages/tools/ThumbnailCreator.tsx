import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, X, Maximize2, Save, Trash2, Plus } from "lucide-react";

const PAGE_SIZES = {
  youtube: { label: "YouTube — Horizontal (16:9)", aspectRatio: "16 / 9", maxWidth: "100%" },
  tiktok:  { label: "TikTok — Vertical (9:16)",   aspectRatio: "9 / 16",  maxWidth: "340px" },
} as const;

const a_thumbnail_text_font_option_list_data = ["Inter", "Roboto", "Georgia", "Impact", "Comic Sans MS"] as const;

type PageSize = keyof typeof PAGE_SIZES;

export type ImageElement = {
  id: number;
  type?: "image";
  x: number; y: number; w: number; h: number;
  opacity: number;
  src: string;
  file?: string;
};

export type PlaceholderElement = {
  id: number;
  type: "placeholder";
  name: string;
  placeholderType?: "image" | "text";
  fontFamily?: string;
  textAlign?: "left" | "center" | "right";
  textColor?: string;
  x: number; y: number; w: number; h: number;
};

export type CanvasElement = ImageElement | PlaceholderElement;

export type TemplateData = {
  name: string;
  pageSize: PageSize;
  mode: "gradient-split" | "normal-gradient";
  split: number;
  color1: string; opacity1: number; transparent1: boolean;
  color2: string; opacity2: number; transparent2: boolean;
  canvasWidth?: number;
  canvasHeight?: number;
  elements: CanvasElement[];
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
  const [elements, setElements] = useState<CanvasElement[]>([]);

  // Template state
  const [prebuiltTemplates, setPrebuiltTemplates] = useState<TemplateData[]>([]);
  const [userTemplates, setUserTemplates]         = useState<TemplateData[]>([]);
  const [selectedTemplate, setSelectedTemplate]   = useState("");
  const [savingTemplate, setSavingTemplate]       = useState(false);
  const [templateName, setTemplateName]           = useState("");
  const [savedMsg, setSavedMsg]                   = useState(false);


  // Load templates on mount
  useEffect(() => {
    if (electronAPI?.templates) {
      electronAPI.templates.listPrebuilt()
        .then(async (list: { name: string }[]) => {
          const loaded = await Promise.all(
            list.map(({ name }) =>
              fetch(`/templates/${encodeURIComponent(name)}/template.json`)
                .then(r => r.json())
                .then(data => ({ ...data, name } as TemplateData))
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

  const blobToBase64 = async (src: string): Promise<string> => {
    if (src.startsWith("data:")) return src;
    const blob = await fetch(src).then(r => r.blob());
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  };

  const a_normalize_placeholder_element_data = (a_element_data: CanvasElement): CanvasElement => {
    if (a_element_data.type !== "placeholder") return a_element_data;
    const a_placeholder_data = a_element_data as PlaceholderElement;
    return {
      ...a_placeholder_data,
      placeholderType: a_placeholder_data.placeholderType ?? "image",
      fontFamily: a_placeholder_data.fontFamily ?? "Impact",
      textAlign: a_placeholder_data.textAlign ?? "left",
      textColor: a_placeholder_data.textColor ?? "#000000",
    };
  };

  const applyTemplate = (t: TemplateData) => {
    setPageSize(t.pageSize);
    setMode(t.mode);
    setSplit(t.split);
    setColor1(t.color1);     setOpacity1(t.opacity1);     setTransparent1(t.transparent1);
    setColor2(t.color2);     setOpacity2(t.opacity2);     setTransparent2(t.transparent2);
    setElements(t.elements.map(el => ({ ...a_normalize_placeholder_element_data(el), id: Date.now() + Math.random() })));
  };

  const handleLoadTemplate = async (value: string) => {
    setSelectedTemplate(value);
    if (!value) return;
    const [source, name] = value.split(":");
    try {
      if (source === "prebuilt") {
        const data = await fetch(`/templates/${encodeURIComponent(name)}/template.json`).then(r => r.json());
        const els = (data.elements || []).map((el: any) =>
          el.type === "placeholder"
            ? el
            : el.file ? { ...el, src: `/templates/${encodeURIComponent(name)}/${el.file}`, file: undefined } : el
        );
        applyTemplate({ ...data, name, elements: els });
      } else if (source === "user" && electronAPI?.templates) {
        const data: TemplateData = await electronAPI.templates.get(name);
        applyTemplate(data);
      }
    } catch (e) {
      console.error("Failed to load template", e);
    }
  };

  const buildTemplatePayload = async () => {
    const a_canvas_rect_data = canvasRef.current?.getBoundingClientRect();
    return {
      pageSize, mode, split,
      color1, opacity1, transparent1,
      color2, opacity2, transparent2,
      canvasWidth: a_canvas_rect_data?.width ? Math.round(a_canvas_rect_data.width) : undefined,
      canvasHeight: a_canvas_rect_data?.height ? Math.round(a_canvas_rect_data.height) : undefined,
      elements: await Promise.all(
        elements.map(async el => {
          if (el.type === "placeholder") return el;
          const imgEl = el as ImageElement;
          return { ...imgEl, src: imgEl.src ? await blobToBase64(imgEl.src) : undefined };
        })
      ),
    };
  };

  const handleSaveChanges = async () => {
    if (!electronAPI?.templates) { alert("Template saving is only available in the desktop app."); return; }
    const [, name] = selectedTemplate.split(":");
    const saveName = name || "Untitled";
    try {
      await electronAPI.templates.save(saveName, await buildTemplatePayload());
      const list: TemplateData[] = await electronAPI.templates.listUser();
      setUserTemplates(list);
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 4000);
    } catch (e) { console.error("Failed to save changes", e); }
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return;
    if (!electronAPI?.templates) {
      alert("Template saving is only available in the desktop app.");
      setSavingTemplate(false);
      return;
    }
    try {
      await electronAPI.templates.save(templateName.trim(), await buildTemplatePayload());
      const list: TemplateData[] = await electronAPI.templates.listUser();
      setUserTemplates(list);
      setTemplateName("");
      setSavingTemplate(false);
    } catch (e) {
      console.error("Failed to save template", e);
    }
  };

  const handleDeleteTemplate = async (name: string) => {
    try {
      await electronAPI.templates.delete(name);
      setUserTemplates(prev => prev.filter(t => t.name !== name));
      if (selectedTemplate === `user:${name}`) setSelectedTemplate("");
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

  const a_draw_image_contain_in_box_data = (
    a_canvas_context_data: CanvasRenderingContext2D,
    a_image_data: HTMLImageElement,
    a_box_x_data: number,
    a_box_y_data: number,
    a_box_width_data: number,
    a_box_height_data: number,
  ) => {
    if (a_box_width_data <= 0 || a_box_height_data <= 0 || a_image_data.width <= 0 || a_image_data.height <= 0) return;
    const a_image_aspect_data = a_image_data.width / a_image_data.height;
    const a_box_aspect_data = a_box_width_data / a_box_height_data;

    let a_draw_width_data = a_box_width_data;
    let a_draw_height_data = a_box_height_data;
    let a_draw_x_data = a_box_x_data;
    let a_draw_y_data = a_box_y_data;

    if (a_image_aspect_data > a_box_aspect_data) {
      a_draw_height_data = a_box_width_data / a_image_aspect_data;
      a_draw_y_data = a_box_y_data + (a_box_height_data - a_draw_height_data) / 2;
    } else {
      a_draw_width_data = a_box_height_data * a_image_aspect_data;
      a_draw_x_data = a_box_x_data + (a_box_width_data - a_draw_width_data) / 2;
    }

    a_canvas_context_data.drawImage(a_image_data, a_draw_x_data, a_draw_y_data, a_draw_width_data, a_draw_height_data);
  };

  const handleAddOverlay = (file: File) => {
    const url = URL.createObjectURL(file);
    setElements(prev => [
      ...prev,
      { id: Date.now(), type: "image" as const, x: 100, y: 100, w: 120, h: 120, opacity: 100, src: url },
    ]);
  };

  const startDrag = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const el = elements.find(x => x.id === id);
    if (!el) return;
    const startX = e.clientX, startY = e.clientY;
    const origX = el.x, origY = el.y;
    const move = (evt: MouseEvent) => {
      setElements(prev => prev.map(item =>
        item.id === id ? { ...item, x: origX + evt.clientX - startX, y: origY + evt.clientY - startY } : item
      ));
    };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const startResize = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const el = elements.find(x => x.id === id);
    if (!el) return;
    const startX = e.clientX, startW = el.w, startH = el.h;
    const isImg = el.type !== "placeholder";
    const ratio = startH / startW;
    const move = (evt: MouseEvent) => {
      const newW = Math.max(30, startW + evt.clientX - startX);
      setElements(prev => prev.map(item =>
        item.id === id
          ? { ...item, w: newW, h: isImg ? newW * ratio : Math.max(30, startH + (newW - startW) * ratio) }
          : item
      ));
    };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const exportPNG = async () => {
    if (!canvasRef.current) return;
    const outW = pageSize === "youtube" ? 1280 : 1080;
    const outH = pageSize === "youtube" ? 720  : 1920;
    const { width: dW, height: dH } = canvasRef.current.getBoundingClientRect();
    const canvas = document.createElement("canvas");
    canvas.width = outW; canvas.height = outH;
    const ctx = canvas.getContext("2d")!;

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

    const sx = outW / dW, sy = outH / dH;
    for (const el of elements) {
      if (el.type === "placeholder") continue; // placeholders are design guides, not rendered
      const imgEl = el as ImageElement;
      await new Promise<void>(resolve => {
        const img = new Image();
        img.onload = () => {
          ctx.globalAlpha = (imgEl.opacity ?? 100) / 100;
          a_draw_image_contain_in_box_data(ctx, img, el.x * sx, el.y * sy, el.w * sx, el.h * sy);
          ctx.globalAlpha = 1;
          resolve();
        };
        img.onerror = () => resolve();
        img.src = imgEl.src;
      });
    }

    const link = document.createElement("a");
    link.download = "thumbnail.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const placeholders = elements.filter(el => el.type === "placeholder") as PlaceholderElement[];

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-card">
      <CardContent className="p-8 space-y-8">

        {/* Templates */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase text-muted-foreground">Templates</label>
          <Select value={selectedTemplate} onValueChange={handleLoadTemplate}>
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder="Load a template…" />
            </SelectTrigger>
            <SelectContent>
              {prebuiltTemplates.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Prebuilt</SelectLabel>
                  {prebuiltTemplates.map(t => (
                    <SelectItem key={t.name} value={`prebuilt:${t.name}`}>{t.name}</SelectItem>
                  ))}
                </SelectGroup>
              )}
              {userTemplates.length > 0 && (
                <SelectGroup>
                  <SelectLabel>My Templates</SelectLabel>
                  {userTemplates.map(t => (
                    <SelectItem key={t.name} value={`user:${t.name}`}>
                      <span className="flex items-center justify-between w-full gap-4">
                        <span>{t.name}</span>
                        <button
                          className="text-muted-foreground hover:text-red-500 transition-colors"
                          onClick={e => { e.stopPropagation(); handleDeleteTemplate(t.name); }}
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
          <label className="text-xs font-bold uppercase text-muted-foreground">Page Size</label>
          <Select value={pageSize} onValueChange={(v: PageSize) => setPageSize(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select size" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PAGE_SIZES) as PageSize[]).map(key => (
                <SelectItem key={key} value={key}>{PAGE_SIZES[key].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Background Mode */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase text-muted-foreground">Mode</label>
            <div className="flex gap-2">
              {(["gradient-split", "normal-gradient"] as const).map(m => (
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
              <label className="text-xs font-bold uppercase text-muted-foreground">Split %</label>
              <span className="text-xs text-muted-foreground">{split}%</span>
            </div>
            <input
              type="range" min={0} max={100} value={split}
              onChange={e => setSplit(Number(e.target.value))}
              className="w-full accent-accent mt-2"
            />
          </div>
        </div>

        {/* Colors */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-muted-foreground">Color 1</label>
            <input type="color" value={color1} onChange={e => setColor1(e.target.value)} disabled={transparent1}
              className="w-full h-12 rounded-md border border-border cursor-pointer disabled:opacity-30" />
            <input type="text" value={color1}
              onChange={e => { const v = e.target.value.trim(); if (/^#[0-9a-fA-F]{6}$/.test(v)) setColor1(v); else if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setColor1(v as any); }}
              onPaste={e => { const p = e.clipboardData.getData("text").trim(); const hex = p.startsWith("#") ? p : `#${p}`; if (/^#[0-9a-fA-F]{6}$/.test(hex)) { e.preventDefault(); setColor1(hex); } }}
              disabled={transparent1} placeholder="#000000" maxLength={7}
              className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm font-mono disabled:opacity-30 focus:outline-none focus:ring-1 focus:ring-accent" />
            <div className="flex items-center gap-2">
              <input id="transparent1" type="checkbox" checked={transparent1} onChange={e => setTransparent1(e.target.checked)} className="w-4 h-4 cursor-pointer accent-accent" />
              <label htmlFor="transparent1" className="text-xs text-muted-foreground cursor-pointer">Transparent</label>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">Opacity: {opacity1}%</label>
                <button onClick={() => setOpacity1(v => Math.min(100, v * 2))} disabled={transparent1 || opacity1 === 100}
                  className="text-xs px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-30">×2</button>
              </div>
              <input type="range" min={0} max={100} value={opacity1} onChange={e => setOpacity1(Number(e.target.value))} disabled={transparent1} className="w-full accent-accent disabled:opacity-30" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-muted-foreground">Color 2</label>
            <input type="color" value={color2} onChange={e => setColor2(e.target.value)} disabled={transparent2}
              className="w-full h-12 rounded-md border border-border cursor-pointer disabled:opacity-30" />
            <input type="text" value={color2}
              onChange={e => { const v = e.target.value.trim(); if (/^#[0-9a-fA-F]{6}$/.test(v)) setColor2(v); else if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setColor2(v as any); }}
              onPaste={e => { const p = e.clipboardData.getData("text").trim(); const hex = p.startsWith("#") ? p : `#${p}`; if (/^#[0-9a-fA-F]{6}$/.test(hex)) { e.preventDefault(); setColor2(hex); } }}
              disabled={transparent2} placeholder="#000000" maxLength={7}
              className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm font-mono disabled:opacity-30 focus:outline-none focus:ring-1 focus:ring-accent" />
            <div className="flex items-center gap-2">
              <input id="transparent2" type="checkbox" checked={transparent2} onChange={e => setTransparent2(e.target.checked)} className="w-4 h-4 cursor-pointer accent-accent" />
              <label htmlFor="transparent2" className="text-xs text-muted-foreground cursor-pointer">Transparent</label>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">Opacity: {opacity2}%</label>
                <button onClick={() => setOpacity2(v => Math.min(100, v * 2))} disabled={transparent2 || opacity2 === 100}
                  className="text-xs px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-30">×2</button>
              </div>
              <input type="range" min={0} max={100} value={opacity2} onChange={e => setOpacity2(Number(e.target.value))} disabled={transparent2} className="w-full accent-accent disabled:opacity-30" />
            </div>
          </div>
        </div>

        {/* Design Canvas */}
        <div
          className="relative rounded-xl border border-border overflow-hidden mx-auto"
          style={{
            maxWidth: PAGE_SIZES[pageSize].maxWidth,
            width: "100%",
            aspectRatio: PAGE_SIZES[pageSize].aspectRatio,
            background: "repeating-conic-gradient(#aaa 0% 25%, #fff 0% 50%) 0 0 / 16px 16px",
          }}
        >
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
            {elements.map(el => (
              <div
                key={el.id}
                className="absolute group"
                style={{ left: el.x, top: el.y, width: el.w, height: el.h, cursor: "move" }}
                onMouseDown={e => startDrag(el.id, e)}
              >
                {el.type === "placeholder" ? (
                  <div
                    className="w-full h-full border-2 border-dashed flex flex-col items-center justify-center rounded select-none"
                    style={{ borderColor: "rgba(255,255,255,0.65)", background: "rgba(255,255,255,0.10)" }}
                  >
                    <span className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>
                      placeholder
                    </span>
                    <span className="font-bold text-[11px] text-center px-2 break-all leading-tight" style={{ color: "rgba(255,255,255,0.85)" }}>
                      {(el as PlaceholderElement).name}
                    </span>
                    <span className="text-[9px] mt-0.5 uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.7)" }}>
                      {(el as PlaceholderElement).placeholderType ?? "image"}
                    </span>
                  </div>
                ) : (
                  <>
                    <div
                      className="absolute -top-7 left-0 right-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      onMouseDown={e => e.stopPropagation()}
                    >
                      <input
                        type="range" min={0} max={100} value={(el as ImageElement).opacity ?? 100}
                        onChange={e => setElements(prev => prev.map(item =>
                          item.id === el.id ? { ...item, opacity: Number(e.target.value) } : item
                        ))}
                        className="w-full h-1 cursor-pointer"
                        style={{ accentColor: "white" }}
                      />
                      <span className="text-white text-[9px] font-bold leading-none w-7 shrink-0 drop-shadow">
                        {(el as ImageElement).opacity ?? 100}%
                      </span>
                    </div>
                    <img
                      src={(el as ImageElement).src}
                      className="w-full h-full object-contain pointer-events-none"
                      style={{ opacity: ((el as ImageElement).opacity ?? 100) / 100 }}
                    />
                  </>
                )}

                {/* Resize handle */}
                <div
                  className="absolute bottom-0 right-0 w-6 h-6 flex items-center justify-center bg-white border border-border rounded-full cursor-se-resize shadow-md hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"
                  onMouseDown={e => startResize(el.id, e)}
                >
                  <Maximize2 className="w-3 h-3 text-gray-600 rotate-90" />
                </div>

                {/* Delete */}
                <button
                  className="absolute top-0 right-0 w-6 h-6 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-colors shadow-md"
                  onClick={() => setElements(p => p.filter(x => x.id !== el.id))}
                >
                  <X className="w-3.5 h-3.5" strokeWidth={3} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Upload Image Overlay */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase text-muted-foreground">Add overlay element (logo / icon)</label>
          <div
            className="border-2 border-dashed rounded-xl p-2.5 text-center cursor-pointer transition-all hover:brightness-110 active:scale-[0.99]"
            style={{ borderColor: "#ff9000", background: "rgba(255,144,0,0.07)" }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleAddOverlay(f); }}
            />
            <Upload className="w-8 h-8 mx-auto mb-1" style={{ color: "#ff9000" }} />
            <p className="text-sm font-bold" style={{ color: "#ff9000" }}>Click to upload</p>
          </div>
        </div>

        {/* Placeholder Elements */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase text-muted-foreground">Placeholder Elements</label>
          <p className="text-xs text-muted-foreground">
            Named slots the Workflow tool replaces with row-specific images or text values from your spreadsheet file.
          </p>

          <button
            className="w-full h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:brightness-110 active:scale-[0.98]"
            style={{ background: "#ff9000", color: "#000" }}
            onClick={() => {
              const base = ["box1", "box2"];
              const toAdd = base.filter(name => !elements.some(el => el.type === "placeholder" && (el as PlaceholderElement).name === name));
              if (toAdd.length === 0) return;
              const rect = canvasRef.current?.getBoundingClientRect();
              const cw = Math.round(rect?.width  ?? 300);
              const ch = Math.round(rect?.height ?? 400);
              const hw = Math.floor(cw / 8), hh = Math.floor(ch / 4); // youtube: quarter-half sizes
              const vw = Math.floor(cw / 4), vh = Math.floor(ch / 8); // tiktok: quarter-half sizes
              const positions: Record<string, { x: number; y: number; w: number; h: number }> =
                pageSize === "youtube"
                  ? { box1: { x: 0,               y: 0, w: hw, h: hh },
                      box2: { x: Math.ceil(cw / 2), y: 0, w: hw, h: hh } }
                  : { box1: { x: 0, y: 0,                w: vw, h: vh },
                      box2: { x: 0, y: Math.ceil(ch / 2), w: vw, h: vh } };
              const now = Date.now();
              setElements(prev => [
                ...prev,
                ...toAdd.map((name, i) => ({
                  id: now + i,
                  type: "placeholder" as const,
                  name,
                  placeholderType: "image" as const,
                  fontFamily: "Impact",
                  textAlign: "left" as const,
                  textColor: "#000000",
                  ...(positions[name] ?? { x: 80 + i * 220, y: 80, w: 200, h: 150 }),
                })),
              ]);
            }}
          >
            <Plus className="w-4 h-4" />
            Add Placeholder
          </button>

          {placeholders.length > 0 && (
            <div className="space-y-1 mt-2">
              {placeholders.map(ph => (
                <div key={ph.id} className="space-y-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
                  <div className="grid grid-cols-[1fr_140px_auto] items-center gap-2">
                    <input
                      type="text"
                      value={ph.name}
                      onChange={e => {
                        const val = e.target.value;
                        const duplicate = elements.some(el => el.type === "placeholder" && el.id !== ph.id && (el as PlaceholderElement).name === val);
                        if (!duplicate) setElements(prev => prev.map(el => el.id === ph.id ? { ...el, name: val } : el));
                      }}
                      className="bg-transparent text-sm font-bold font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-accent rounded px-1 h-9"
                      aria-label="Placeholder name"
                    />

                    <Select
                      value={ph.placeholderType ?? "image"}
                      onValueChange={(value: "image" | "text") =>
                        setElements(prev => prev.map(el => el.id === ph.id ? { ...el, placeholderType: value } : el))
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="image">Image</SelectItem>
                        <SelectItem value="text">Text</SelectItem>
                      </SelectContent>
                    </Select>

                    <button
                      className="text-muted-foreground hover:text-red-500 transition-colors shrink-0 h-9 w-9 inline-flex items-center justify-center"
                      onClick={() => setElements(p => p.filter(x => x.id !== ph.id))}
                      aria-label="Delete placeholder"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {(ph.placeholderType ?? "image") === "text" && (
                    <div className="grid grid-cols-3 gap-2">
                      <Select
                        value={ph.fontFamily ?? "Impact"}
                        onValueChange={(value) =>
                          setElements(prev => prev.map(el => el.id === ph.id ? { ...el, fontFamily: value } : el))
                        }
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Font style" />
                        </SelectTrigger>
                        <SelectContent>
                          {a_thumbnail_text_font_option_list_data.map(fontName => (
                            <SelectItem key={fontName} value={fontName}>{fontName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <div className="flex items-center gap-1 rounded-md border border-border bg-background p-1">
                        <button
                          className={`flex-1 h-7 text-xs rounded ${ (ph.textAlign ?? "left") === "left" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground" }`}
                          onClick={() => setElements(prev => prev.map(el => el.id === ph.id ? { ...el, textAlign: "left" as const } : el))}
                        >
                          Left
                        </button>
                        <button
                          className={`flex-1 h-7 text-xs rounded ${ (ph.textAlign ?? "left") === "center" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground" }`}
                          onClick={() => setElements(prev => prev.map(el => el.id === ph.id ? { ...el, textAlign: "center" as const } : el))}
                        >
                          Mid
                        </button>
                        <button
                          className={`flex-1 h-7 text-xs rounded ${ (ph.textAlign ?? "left") === "right" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground" }`}
                          onClick={() => setElements(prev => prev.map(el => el.id === ph.id ? { ...el, textAlign: "right" as const } : el))}
                        >
                          Right
                        </button>
                      </div>

                      <div className="h-9 rounded-md border border-border bg-background px-2 flex items-center gap-2">
                        <input
                          type="color"
                          value={ph.textColor ?? "#000000"}
                          onChange={e => setElements(prev => prev.map(el => el.id === ph.id ? { ...el, textColor: e.target.value } : el))}
                          className="h-6 w-8 rounded border border-border cursor-pointer"
                          aria-label="Text color"
                        />
                        <span className="text-xs font-mono text-muted-foreground">{ph.textColor ?? "#000000"}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {/* Add more */}
              <button
                className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors px-1 pt-1"
                onClick={() => {
                  const existing = elements.filter(el => el.type === "placeholder").map(el => (el as PlaceholderElement).name);
                  let n = existing.length + 1;
                  while (existing.includes(`box${n}`)) n++;
                  setElements(prev => [...prev, {
                    id: Date.now(),
                    type: "placeholder" as const,
                    name: `box${n}`,
                    placeholderType: "image" as const,
                    fontFamily: "Impact",
                    textAlign: "left" as const,
                    textColor: "#000000",
                    x: 80, y: 80, w: 200, h: 150,
                  }]);
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                Add another
              </button>
            </div>
          )}
        </div>

        {/* Export */}
        <Button className="w-full h-12 rounded-xl font-bold mt-4" onClick={exportPNG}>
          Export PNG
        </Button>

        {/* Save buttons */}
        <div className="flex gap-2">
          <Button
            className="flex-1 h-12 rounded-xl font-bold gap-2"
            onClick={handleSaveChanges}
          >
            <Save className="w-4 h-4" />
            Save Changes
          </Button>
          {savingTemplate ? (
            <div className="flex flex-1 gap-2">
              <Input
                autoFocus
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSaveTemplate(); if (e.key === "Escape") setSavingTemplate(false); }}
                placeholder="Template name…"
                className="h-12 rounded-xl text-sm"
              />
              <Button size="sm" onClick={handleSaveTemplate} disabled={!templateName.trim()} className="rounded-xl h-12 px-4">Save</Button>
              <Button size="sm" variant="ghost" onClick={() => { setSavingTemplate(false); setTemplateName(""); }} className="rounded-xl h-12">Cancel</Button>
            </div>
          ) : (
            <Button className="flex-1 h-12 rounded-xl font-bold gap-2" variant="outline" onClick={() => setSavingTemplate(true)}>
              <Save className="w-4 h-4" />
              Save as New Template
            </Button>
          )}
        </div>
        {savedMsg && (
          <p className="text-center text-xs text-green-500 mt-1">Saved</p>
        )}
      </CardContent>
    </Card>
  );
}
