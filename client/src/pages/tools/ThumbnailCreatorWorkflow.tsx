import { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { layoutTextToBox } from "@/lib/utils";
import type { TemplateData, ImageElement, PlaceholderElement } from "./ThumbnailCreator";

const electronAPI = (window as any).electronAPI as any;

// ─── helpers ──────────────────────────────────────────────────────────────────
const a_template_fallback_canvas_space_map_data = {
  youtube: { width: 720, height: 405 },
  tiktok: { width: 340, height: Math.round((340 * 16) / 9) },
} as const;

const toRgba = (hex: string, opacity: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity / 100})`;
};

/** Load an image src (URL, data URI, or local file path) and return HTMLImageElement. */
async function loadImage(src: string): Promise<HTMLImageElement> {
  // If it's a local file path, convert via Electron IPC
  if (
    electronAPI?.readFileAsBase64 &&
    !src.startsWith("http") &&
    !src.startsWith("data:") &&
    !src.startsWith("blob:")
  ) {
    try {
      const b64 = await electronAPI.readFileAsBase64(src);
      src = b64;
    } catch {
      // fall through and try loading directly
    }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

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

const a_normalize_placeholder_settings_data = (a_placeholder_data: PlaceholderElement) => ({
  ...a_placeholder_data,
  placeholderType: a_placeholder_data.placeholderType ?? "image",
  fontFamily: a_placeholder_data.fontFamily ?? "Impact",
  textAlign: a_placeholder_data.textAlign ?? "left",
  textColor: a_placeholder_data.textColor ?? "#000000",
});

const a_get_template_canvas_space_data = (a_template_data: TemplateData) => {
  const a_fallback_data = a_template_fallback_canvas_space_map_data[a_template_data.pageSize];
  const a_width_data = a_template_data.canvasWidth && a_template_data.canvasWidth > 0
    ? a_template_data.canvasWidth
    : a_fallback_data.width;
  const a_height_data = a_template_data.canvasHeight && a_template_data.canvasHeight > 0
    ? a_template_data.canvasHeight
    : a_fallback_data.height;

  return { width: a_width_data, height: a_height_data };
};

const a_draw_text_placeholder_data = (
  a_canvas_context_data: CanvasRenderingContext2D,
  a_placeholder_data: PlaceholderElement,
  a_cell_value_data: string,
  a_scale_x_data: number,
  a_scale_y_data: number,
) => {
  const a_text_data = a_cell_value_data.trim();
  if (!a_text_data) return;

  const a_box_x_data = a_placeholder_data.x * a_scale_x_data;
  const a_box_y_data = a_placeholder_data.y * a_scale_y_data;
  const a_box_width_data = a_placeholder_data.w * a_scale_x_data;
  const a_box_height_data = a_placeholder_data.h * a_scale_y_data;
  const a_padding_data = Math.max(8, Math.round(Math.min(a_box_width_data, a_box_height_data) * 0.08));

  const a_layout_data = layoutTextToBox(a_text_data, a_canvas_context_data, {
    boxWidth: a_box_width_data,
    boxHeight: a_box_height_data,
    horizontalPadding: a_padding_data,
    verticalPadding: a_padding_data,
    fontFamily: a_placeholder_data.fontFamily ?? "Impact",
    maxSize: 160,
    minSize: 10,
    step: 2,
    lineHeightRatio: 1.4,
  });

  a_canvas_context_data.save();
  a_canvas_context_data.fillStyle = a_placeholder_data.textColor ?? "#000000";
  a_canvas_context_data.textBaseline = "top";
  a_canvas_context_data.font = `${a_layout_data.fontSize}px ${a_placeholder_data.fontFamily ?? "Impact"}`;
  a_canvas_context_data.textAlign = a_placeholder_data.textAlign ?? "left";

  const a_draw_x_data =
    (a_placeholder_data.textAlign ?? "left") === "center"
      ? a_box_x_data + a_box_width_data / 2
      : (a_placeholder_data.textAlign ?? "left") === "right"
        ? a_box_x_data + a_box_width_data - a_padding_data
        : a_box_x_data + a_padding_data;
  const a_draw_y_data = a_box_y_data + a_padding_data;

  a_layout_data.lines.forEach((a_line_data, a_index_data) => {
    a_canvas_context_data.fillText(a_line_data, a_draw_x_data, a_draw_y_data + a_index_data * a_layout_data.lineHeight);
  });
  a_canvas_context_data.restore();
};

const a_normalize_template_element_list_data = (a_element_list_data: TemplateData["elements"]): TemplateData["elements"] =>
  a_element_list_data.map((a_element_data) => {
    if ((a_element_data as PlaceholderElement).type !== "placeholder") return a_element_data;
    return a_normalize_placeholder_settings_data(a_element_data as PlaceholderElement);
  });

/** Render one thumbnail PNG for the given template + placeholder→imagePath map.
 *  Returns a data URL.
 */
async function renderThumbnail(
  template: TemplateData,
  placeholderMap: Record<string, string>, // key → image path/URL
): Promise<string> {
  const outW = template.pageSize === "youtube" ? 1280 : 1080;
  const outH = template.pageSize === "youtube" ? 720  : 1920;

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d")!;

  const { color1, opacity1, transparent1, color2, opacity2, transparent2, mode, split, pageSize } = template;

  // Background gradient
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

  const a_template_canvas_space_data = a_get_template_canvas_space_data(template);
  const sx = outW / a_template_canvas_space_data.width;
  const sy = outH / a_template_canvas_space_data.height;

  for (const el of template.elements) {
    if (el.type === "placeholder") {
      const ph = a_normalize_placeholder_settings_data(el as PlaceholderElement);
      const cellValue = String(placeholderMap[ph.name] ?? "");
      if (!cellValue.trim()) continue;

      if (ph.placeholderType === "text") {
        a_draw_text_placeholder_data(ctx, ph, cellValue, sx, sy);
        continue;
      }

      try {
        const img = await loadImage(cellValue.trim());
        a_draw_image_contain_in_box_data(ctx, img, ph.x * sx, ph.y * sy, ph.w * sx, ph.h * sy);
      } catch {
        // skip failed images
      }
    } else {
      const imgEl = el as ImageElement;
      if (!imgEl.src) continue;
      try {
        const img = await loadImage(imgEl.src);
        ctx.globalAlpha = (imgEl.opacity ?? 100) / 100;
        a_draw_image_contain_in_box_data(ctx, img, el.x * sx, el.y * sy, el.w * sx, el.h * sy);
        ctx.globalAlpha = 1;
      } catch {
        // skip
      }
    }
  }

  return canvas.toDataURL("image/png");
}

// ─── component ────────────────────────────────────────────────────────────────

type Row = Record<string, string>;

type GeneratedItem = {
  rowIndex: number;
  label: string;
  dataUrl: string;
};

export default function ThumbnailCreatorWorkflow() {
  // Templates
  const [prebuiltTemplates, setPrebuiltTemplates] = useState<TemplateData[]>([]);
  const [userTemplates, setUserTemplates]         = useState<TemplateData[]>([]);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState("");
  const [template, setTemplate] = useState<TemplateData | null>(null);

  // Excel
  const [excelRows, setExcelRows]     = useState<Row[]>([]);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const excelInputRef = useRef<HTMLInputElement>(null);

  // Generation
  const [generating, setGenerating]   = useState(false);
  const [progress, setProgress]       = useState(0);
  const [generated, setGenerated]     = useState<GeneratedItem[]>([]);
  const [error, setError]             = useState("");

  // Load templates on mount
  useEffect(() => {
    if (electronAPI?.templates) {
      electronAPI.templates.listPrebuilt()
        .then(async (list: { name: string }[]) => {
          const loaded = await Promise.all(
            list.map(({ name }) =>
              fetch(`/templates/${encodeURIComponent(name)}/template.json`)
                .then(r => r.json())
                .then(data => ({ ...data, name, elements: a_normalize_template_element_list_data(data.elements || []) } as TemplateData))
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

  // Load selected template
  const handleSelectTemplate = async (value: string) => {
    setSelectedTemplateKey(value);
    setTemplate(null);
    setGenerated([]);
    if (!value) return;
    const [source, name] = value.split(":");
    try {
      if (source === "prebuilt") {
        const data = await fetch(`/templates/${encodeURIComponent(name)}/template.json`).then(r => r.json());
        // resolve file refs for image elements
        const elements = (data.elements || []).map((el: any) =>
          el.type === "placeholder"
            ? a_normalize_placeholder_settings_data(el as PlaceholderElement)
            : el.file ? { ...el, src: `/templates/${encodeURIComponent(name)}/${el.file}`, file: undefined } : el
        );
        setTemplate({ ...data, name, elements });
      } else if (source === "user" && electronAPI?.templates) {
        const data: TemplateData = await electronAPI.templates.get(name);
        setTemplate({ ...data, elements: a_normalize_template_element_list_data(data.elements || []) });
      }
    } catch (e) {
      console.error("Failed to load template", e);
    }
  };

  // Parse Excel
  const handleExcelFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target!.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: Row[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
        if (rows.length === 0) { setError("Excel file has no data rows."); return; }
        setExcelHeaders(Object.keys(rows[0]));
        setExcelRows(rows);
        setGenerated([]);
        setError("");
      } catch {
        setError("Failed to parse Excel file.");
      }
    };
    reader.readAsBinaryString(file);
  };

  // Placeholders in selected template
  const placeholders = (template?.elements ?? []).filter(el => el.type === "placeholder") as PlaceholderElement[];
  const a_normalized_placeholder_list_data = placeholders.map(a_normalize_placeholder_settings_data);
  const a_placeholder_type_lookup_map_data = new Map(
    a_normalized_placeholder_list_data.map((a_placeholder_data) => [a_placeholder_data.name, a_placeholder_data.placeholderType])
  );

  // First column is the label/filename — skip it for placeholder matching
  const labelColumn = excelHeaders[0] ?? "";
  const dataHeaders = excelHeaders.slice(1);

  const matchedKeys = dataHeaders.filter(h => a_normalized_placeholder_list_data.some(ph => ph.name === h));
  const unmatchedKeys = dataHeaders.filter(h => !a_normalized_placeholder_list_data.some(ph => ph.name === h));
  const missingKeys = a_normalized_placeholder_list_data.map(ph => ph.name).filter(n => !dataHeaders.includes(n));

  // Generate all thumbnails
  const handleGenerate = async () => {
    if (!template || excelRows.length === 0) return;
    setGenerating(true);
    setProgress(0);
    setGenerated([]);
    setError("");

    const results: GeneratedItem[] = [];
    for (let i = 0; i < excelRows.length; i++) {
      const row = excelRows[i];
      const placeholderMap: Record<string, string> = {};
      for (const ph of a_normalized_placeholder_list_data) {
        if (row[ph.name]) placeholderMap[ph.name] = row[ph.name] as string;
      }
      try {
        const dataUrl = await renderThumbnail(template, placeholderMap);
        // label: value of first column (video name), fallback to row index
        const label = (labelColumn && row[labelColumn]) ? String(row[labelColumn]) : `row_${i + 1}`;
        results.push({ rowIndex: i, label, dataUrl });
      } catch (err) {
        console.error(`Row ${i + 1} render failed`, err);
        results.push({ rowIndex: i, label: `row_${i + 1}_error`, dataUrl: "" });
      }
      setProgress(Math.round(((i + 1) / excelRows.length) * 100));
    }

    setGenerated(results);
    setGenerating(false);
  };

  // Download single PNG
  const downloadOne = (item: GeneratedItem) => {
    const link = document.createElement("a");
    link.download = `thumbnail_${item.label.replace(/[^a-zA-Z0-9_\-]/g, "_")}.png`;
    link.href = item.dataUrl;
    link.click();
  };

  // Download all as ZIP
  const downloadZip = async () => {
    const zip = new JSZip();
    for (const item of generated) {
      if (!item.dataUrl) continue;
      const base64 = item.dataUrl.split(",")[1];
      const filename = `thumbnail_${item.label.replace(/[^a-zA-Z0-9_\-]/g, "_")}.png`;
      zip.file(filename, base64, { base64: true });
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = "thumbnails.zip";
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const successCount = generated.filter(g => g.dataUrl).length;
  const a_preview_aspect_ratio_data = template?.pageSize === "youtube" ? "16 / 9" : "9 / 16";
  const a_result_grid_class_name_data = template?.pageSize === "tiktok"
    ? "grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-3"
    : "grid grid-cols-2 sm:grid-cols-3 gap-3";

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-card">
      <CardContent className="p-8 space-y-8">

        {/* Step 1 — Select template */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-widest text-accent">Step 1</span>
            <label className="text-xs font-bold uppercase text-muted-foreground">Select Template</label>
          </div>
          <Select value={selectedTemplateKey} onValueChange={handleSelectTemplate}>
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder="Choose a saved template…" />
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
                    <SelectItem key={t.name} value={`user:${t.name}`}>{t.name}</SelectItem>
                  ))}
                </SelectGroup>
              )}
              {prebuiltTemplates.length === 0 && userTemplates.length === 0 && (
                <SelectItem value="__empty" disabled>No templates — create one in the designer first</SelectItem>
              )}
            </SelectContent>
          </Select>

          {template && placeholders.length > 0 && (
            <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-1">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Template placeholders</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {a_normalized_placeholder_list_data.map(ph => (
                  <span key={ph.name} className="text-xs font-mono bg-accent/15 text-accent border border-accent/30 rounded-md px-2 py-0.5">
                    {ph.name} ({ph.placeholderType})
                  </span>
                ))}
              </div>
            </div>
          )}

          {template && placeholders.length === 0 && (
            <p className="text-xs text-amber-500 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              This template has no placeholder elements. Add placeholders in the designer.
            </p>
          )}
        </div>

        {/* Step 2 — Upload Excel */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-widest text-accent">Step 2</span>
            <label className="text-xs font-bold uppercase text-muted-foreground">Upload Excel File</label>
          </div>
          <p className="text-xs text-muted-foreground">
            Column names must match placeholder keys. Each row = one thumbnail. Image placeholders use image paths/URLs; text placeholders use plain text.
          </p>
          <div
            className="border-2 border-dashed border-border p-8 rounded-xl text-center cursor-pointer hover:border-accent transition-colors"
            onClick={() => excelInputRef.current?.click()}
          >
            <input
              ref={excelInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleExcelFile(f); }}
            />
            <FileSpreadsheet className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {excelRows.length > 0
                ? `${excelRows.length} rows loaded — click to replace`
                : "Click to upload .xlsx / .xls / .csv"}
            </p>
          </div>

          {error && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> {error}
            </p>
          )}
        </div>

        {/* Column mapping preview */}
        {excelRows.length > 0 && template && (
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-muted-foreground">Column Mapping</label>
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-bold text-muted-foreground">Excel Column</th>
                    <th className="text-left px-3 py-2 font-bold text-muted-foreground">Placeholder</th>
                    <th className="text-left px-3 py-2 font-bold text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {/* First column is always the label/filename — shown separately */}
                  {labelColumn && (
                    <tr className="border-t border-border bg-muted/20">
                      <td className="px-3 py-2 font-mono">{labelColumn}</td>
                      <td className="px-3 py-2 text-muted-foreground">—</td>
                      <td className="px-3 py-2">
                        <span className="text-blue-500 font-semibold">Row label (filename)</span>
                      </td>
                    </tr>
                  )}
                  {dataHeaders.map(header => {
                    const matchedPlaceholderType = a_placeholder_type_lookup_map_data.get(header);
                    const matched = Boolean(matchedPlaceholderType);
                    return (
                      <tr key={header} className="border-t border-border">
                        <td className="px-3 py-2 font-mono">{header}</td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">
                          {matched ? `${header} (${matchedPlaceholderType})` : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {matched ? (
                            <span className="flex items-center gap-1 text-green-600 font-semibold">
                              <CheckCircle2 className="w-3 h-3" /> Matched
                            </span>
                          ) : (
                            <span className="text-muted-foreground">No placeholder</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {missingKeys.map(key => (
                    <tr key={`missing-${key}`} className="border-t border-border bg-amber-50 dark:bg-amber-950/20">
                      <td className="px-3 py-2 text-muted-foreground">—</td>
                      <td className="px-3 py-2 font-mono text-amber-600">{key}</td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1 text-amber-600 font-semibold">
                          <AlertCircle className="w-3 h-3" /> No column in Excel
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Data preview */}
            <details className="group">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground font-semibold py-1 select-none list-none flex items-center gap-1">
                <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                Preview rows ({excelRows.length})
              </summary>
              <div className="mt-2 overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-bold text-muted-foreground">#</th>
                      {excelHeaders.map(h => (
                        <th key={h} className="text-left px-3 py-2 font-bold text-muted-foreground font-mono">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {excelRows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        {excelHeaders.map(h => (
                          <td key={h} className="px-3 py-2 font-mono truncate max-w-[180px]" title={row[h]}>{row[h] || "—"}</td>
                        ))}
                      </tr>
                    ))}
                    {excelRows.length > 5 && (
                      <tr className="border-t border-border">
                        <td colSpan={excelHeaders.length + 1} className="px-3 py-2 text-center text-muted-foreground">
                          … {excelRows.length - 5} more rows
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        )}

        {/* Step 3 — Generate */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-widest text-accent">Step 3</span>
            <label className="text-xs font-bold uppercase text-muted-foreground">Generate Thumbnails</label>
          </div>

          <Button
            className="w-full h-12 rounded-xl font-bold gap-2"
            onClick={handleGenerate}
            disabled={!template || excelRows.length === 0 || generating}
          >
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating… {progress}%</>
              : <><Upload className="w-4 h-4" /> Generate {excelRows.length > 0 ? `${excelRows.length} ` : ""}Thumbnails</>
            }
          </Button>

          {generating && (
            <div className="w-full bg-border rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-accent h-full rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        {/* Results */}
        {generated.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase text-muted-foreground">
                Results — {successCount} of {generated.length} generated
              </label>
              {successCount > 1 && (
                <Button size="sm" variant="outline" className="rounded-xl gap-2" onClick={downloadZip}>
                  <Download className="w-3.5 h-3.5" />
                  Download All (ZIP)
                </Button>
              )}
            </div>

            <div className={a_result_grid_class_name_data}>
              {generated.map(item => (
                <div key={item.rowIndex} className="space-y-1">
                  {item.dataUrl ? (
                    <>
                      <div
                        className="rounded-lg overflow-hidden border border-border bg-muted/20 flex items-center justify-center"
                        style={{ aspectRatio: a_preview_aspect_ratio_data }}
                      >
                        <img
                          src={item.dataUrl}
                          className="w-full h-full object-cover"
                          alt={item.label}
                        />
                      </div>
                      <button
                        className="w-full text-xs font-semibold text-muted-foreground hover:text-foreground truncate text-left transition-colors flex items-center gap-1"
                        onClick={() => downloadOne(item)}
                        title={item.label}
                      >
                        <Download className="w-3 h-3 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </button>
                    </>
                  ) : (
                    <div
                      className="rounded-lg border border-border bg-muted/20 flex items-center justify-center"
                      style={{ aspectRatio: a_preview_aspect_ratio_data }}
                    >
                      <span className="text-xs text-red-500 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> Failed
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
