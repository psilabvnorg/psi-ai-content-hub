import { useState, useRef, useEffect } from "react";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Download, CheckCircle2, AlertCircle, Loader2, FileJson } from "lucide-react";
import { renderThumbnail } from "@/lib/thumbnail_renderer";
import type { TemplateData, PlaceholderElement } from "./ThumbnailCreator";

const electronAPI = (window as any).electronAPI as any;

// ─── helpers ──────────────────────────────────────────────────────────────────
const a_normalize_placeholder_settings_data = (a_placeholder_data: PlaceholderElement) => ({
  ...a_placeholder_data,
  placeholderType: a_placeholder_data.placeholderType ?? "image",
  fontFamily: a_placeholder_data.fontFamily ?? "Impact",
  textAlign: a_placeholder_data.textAlign ?? "left",
  textColor: a_placeholder_data.textColor ?? "#000000",
});

const a_normalize_template_element_list_data = (a_element_list_data: TemplateData["elements"]): TemplateData["elements"] =>
  a_element_list_data.map((a_element_data) => {
    if ((a_element_data as PlaceholderElement).type !== "placeholder") return a_element_data;
    return a_normalize_placeholder_settings_data(a_element_data as PlaceholderElement);
  });

const parseConfigJson = (config: Record<string, Record<string, string>>) => {
  const keys = Object.keys(config);
  if (keys.length === 0) return { rows: [], headers: ["name"] };
  const placeholderKeys = Array.from(new Set(keys.flatMap(k => Object.keys(config[k]))));
  const rows = keys.map(key => ({ name: key, ...config[key] }));
  return { rows, headers: ["name", ...placeholderKeys] };
};

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

  // JSON file rows
  const [configRows, setConfigRows]       = useState<Row[]>([]);
  const [configHeaders, setConfigHeaders] = useState<string[]>([]);
  const [configFileName, setConfigFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Generation
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress]     = useState(0);
  const [generated, setGenerated]   = useState<GeneratedItem[]>([]);
  const [error, setError]           = useState("");

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

  // Parse uploaded JSON file
  const handleJsonFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const config = JSON.parse(e.target!.result as string) as Record<string, Record<string, string>>;
        const { rows, headers } = parseConfigJson(config);
        if (rows.length === 0) { setError("JSON file has no entries."); return; }
        setConfigRows(rows);
        setConfigHeaders(headers);
        setConfigFileName(file.name);
        setGenerated([]);
        setError("");
      } catch {
        setError("Failed to parse JSON file. Make sure it matches the expected format.");
      }
    };
    reader.readAsText(file);
  };

  // Placeholders in selected template
  const placeholders = (template?.elements ?? []).filter(el => el.type === "placeholder") as PlaceholderElement[];
  const a_normalized_placeholder_list_data = placeholders.map(a_normalize_placeholder_settings_data);
  const a_placeholder_type_lookup_map_data = new Map(
    a_normalized_placeholder_list_data.map((ph) => [ph.name, ph.placeholderType])
  );

  const dataHeaders = configHeaders.slice(1); // skip "name" label column
  const missingKeys = a_normalized_placeholder_list_data.map(ph => ph.name).filter(n => !dataHeaders.includes(n));

  // Generate all thumbnails
  const handleGenerate = async () => {
    if (!template || configRows.length === 0) return;
    setGenerating(true);
    setProgress(0);
    setGenerated([]);
    setError("");

    const results: GeneratedItem[] = [];
    for (let i = 0; i < configRows.length; i++) {
      const row = configRows[i];
      const placeholderMap: Record<string, string> = {};
      for (const ph of a_normalized_placeholder_list_data) {
        if (row[ph.name]) placeholderMap[ph.name] = row[ph.name];
      }
      try {
        const dataUrl = await renderThumbnail(template, placeholderMap);
        const label = row["name"] || `row_${i + 1}`;
        results.push({ rowIndex: i, label, dataUrl });
      } catch (err) {
        console.error(`Row ${i + 1} render failed`, err);
        results.push({ rowIndex: i, label: `row_${i + 1}_error`, dataUrl: "" });
      }
      setProgress(Math.round(((i + 1) / configRows.length) * 100));
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
      zip.file(`thumbnail_${item.label.replace(/[^a-zA-Z0-9_\-]/g, "_")}.png`, base64, { base64: true });
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

        {/* Step 2 — Upload JSON */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-widest text-accent">Step 2</span>
            <label className="text-xs font-bold uppercase text-muted-foreground">Upload Config JSON</label>
          </div>
          <p className="text-xs text-muted-foreground">
            JSON format: <span className="font-mono">{`{ "video1": { "box1": "...", "box2": "..." }, ... }`}</span>. Each top-level key = one thumbnail.
          </p>
          <div
            className="border-2 border-dashed border-border p-8 rounded-xl text-center cursor-pointer hover:border-accent transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleJsonFile(f); e.target.value = ""; }}
            />
            <FileJson className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {configRows.length > 0
                ? <><span className="font-semibold text-foreground">{configFileName}</span> — {configRows.length} entries loaded · click to replace</>
                : "Click to upload .json config file"}
            </p>
          </div>

          {error && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> {error}
            </p>
          )}
        </div>

        {/* Column mapping preview */}
        {configRows.length > 0 && template && (
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-muted-foreground">Key Mapping</label>
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-bold text-muted-foreground">JSON Key</th>
                    <th className="text-left px-3 py-2 font-bold text-muted-foreground">Placeholder</th>
                    <th className="text-left px-3 py-2 font-bold text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border bg-muted/20">
                    <td className="px-3 py-2 font-mono">name</td>
                    <td className="px-3 py-2 text-muted-foreground">—</td>
                    <td className="px-3 py-2">
                      <span className="text-blue-500 font-semibold">Row label (filename)</span>
                    </td>
                  </tr>
                  {dataHeaders.map(header => {
                    const matchedType = a_placeholder_type_lookup_map_data.get(header);
                    const matched = Boolean(matchedType);
                    return (
                      <tr key={header} className="border-t border-border">
                        <td className="px-3 py-2 font-mono">{header}</td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">
                          {matched ? `${header} (${matchedType})` : "—"}
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
                          <AlertCircle className="w-3 h-3" /> No key in JSON
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
                Preview entries ({configRows.length})
              </summary>
              <div className="mt-2 overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-bold text-muted-foreground">#</th>
                      {configHeaders.map(h => (
                        <th key={h} className="text-left px-3 py-2 font-bold text-muted-foreground font-mono">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {configRows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        {configHeaders.map(h => (
                          <td key={h} className="px-3 py-2 font-mono truncate max-w-[180px]" title={row[h]}>{row[h] || "—"}</td>
                        ))}
                      </tr>
                    ))}
                    {configRows.length > 5 && (
                      <tr className="border-t border-border">
                        <td colSpan={configHeaders.length + 1} className="px-3 py-2 text-center text-muted-foreground">
                          … {configRows.length - 5} more entries
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
            disabled={!template || configRows.length === 0 || generating}
          >
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating… {progress}%</>
              : <><Upload className="w-4 h-4" /> Generate {configRows.length > 0 ? `${configRows.length} ` : ""}Thumbnails</>
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
