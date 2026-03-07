import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Eye, FileText, FolderOpen, ImagePlus, Loader2, Play, Upload, Video, X } from "lucide-react";
import { APP_API_URL } from "@/lib/api";
import { ProgressDisplay, ServiceStatusTable } from "@/components/common/tool-page-ui";
import type { ProgressData, StatusRowConfig } from "@/components/common/tool-page-ui";
import { useManagedServices } from "@/hooks/useManagedServices";
import { useAppStatus } from "@/context/AppStatusContext";

// ── Types ────────────────────────────────────────────────────────────────────

type StreamPayload = { status?: string; percent?: number; message?: string; logs?: string[] };
type RenderCreateResponse = { task_id: string };
type RenderResultResponse = { video: { filename: string; download_url: string }; preview_url: string };

const API_BASE = `${APP_API_URL}/api/v1`;
const N2V_BASE = `${API_BASE}/news-to-video`;

// ── Templates ─────────────────────────────────────────────────────────────────

type TemplateMeta = {
  id: string;
  label: string;
  desc: string;
  usesHero: boolean;
  backgroundMode: boolean;
  introDurationInFrames: number;
  imageDurationInFrames: number;
  captionBottomPercent?: number;
};

type PlatformPreset = {
  id: string;
  label: string;
  description: string;
  featureFlags: string[];
  defaultConfig: {
    introDurationInFrames?: number;
    imageDurationInFrames?: number;
    captionBottomPercent?: number;
  };
  status?: string;
};

type PlatformCatalog = {
  categories: Array<{ category: string; presets: PlatformPreset[] }>;
};

const FALLBACK_TEMPLATE: TemplateMeta = {
  id: "news.anchor.vertical.background",
  label: "News Anchor Vertical Background",
  desc: "Fallback template while the platform catalog loads.",
  usesHero: false,
  backgroundMode: true,
  introDurationInFrames: 150,
  imageDurationInFrames: 170,
};

const mapPreset = (preset: PlatformPreset): TemplateMeta => ({
  id: preset.id,
  label: preset.label,
  desc: preset.description,
  usesHero: preset.featureFlags.includes("hero-overlay"),
  backgroundMode: preset.featureFlags.includes("background-overlay"),
  introDurationInFrames: preset.defaultConfig?.introDurationInFrames ?? 150,
  imageDurationInFrames: preset.defaultConfig?.imageDurationInFrames ?? 170,
  captionBottomPercent: preset.defaultConfig?.captionBottomPercent,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function toAbsoluteApiUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) return pathOrUrl;
  return pathOrUrl.startsWith("/") ? `${APP_API_URL}${pathOrUrl}` : `${APP_API_URL}/${pathOrUrl}`;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("read failed"));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

async function streamTask(
  streamUrl: string,
  onProgress: (p: ProgressData) => void,
  onLogs: (logs: string[]) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const source = new EventSource(streamUrl);
    let settled = false;

    source.onmessage = (event) => {
      let payload: StreamPayload;
      try {
        payload = JSON.parse(event.data) as StreamPayload;
      } catch {
        return;
      }
      onProgress({
        status: payload.status || "processing",
        percent: typeof payload.percent === "number" ? payload.percent : 0,
        message: payload.message,
      });
      if (Array.isArray(payload.logs)) onLogs(payload.logs);

      if (payload.status === "complete" || payload.status === "completed") {
        settled = true;
        source.close();
        resolve();
      }
      if (payload.status === "error" || payload.status === "failed") {
        settled = true;
        source.close();
        reject(new Error(payload.message || "Task failed"));
      }
    };

    source.onerror = () => {
      source.close();
      if (!settled) reject(new Error("Lost progress stream connection"));
    };
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NewsToVideo({ onOpenSettings }: { onOpenSettings?: () => void }) {
  // ── Server status ──
  const [appServerReachable, setAppServerReachable] = useState(false);
  const { servicesById, start, stop, isBusy } = useManagedServices();
  const { hasMissingDeps } = useAppStatus();
  const appService = servicesById.app;
  const appRunning = appService?.status === "running";
  const appBusy = isBusy("app");

  // ── Template selection ──
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [templateId, setTemplateId] = useState<string>(FALLBACK_TEMPLATE.id);
  const selectedTemplate = templates.find((t) => t.id === templateId) ?? FALLBACK_TEMPLATE;

  // ── Editable config overrides (reset when template changes) ──
  const [introDuration, setIntroDuration] = useState(selectedTemplate.introDurationInFrames);
  const [imageDuration, setImageDuration] = useState(selectedTemplate.imageDurationInFrames);
  const [bgOverlay, setBgOverlay] = useState("");
  const [captionBottom, setCaptionBottom] = useState<number | "">(
    selectedTemplate.captionBottomPercent ?? ""
  );
  const [introImage1, setIntroImage1] = useState("");
  const [introImage2, setIntroImage2] = useState("");
  const [introHeroImage, setIntroHeroImage] = useState("");

  useEffect(() => {
    const tpl = templates.find((t) => t.id === templateId) ?? FALLBACK_TEMPLATE;
    setIntroDuration(tpl.introDurationInFrames);
    setImageDuration(tpl.imageDurationInFrames);
    setBgOverlay("");
    setCaptionBottom(tpl.captionBottomPercent ?? "");
    setIntroImage1("");
    setIntroImage2("");
    setIntroHeroImage("");
  }, [templateId, templates]);

  // ── File uploads ──
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [heroImage, setHeroImage] = useState<File | null>(null);
  const [heroPreview, setHeroPreview] = useState<string | null>(null);

  const audioInputRef = useRef<HTMLInputElement>(null);
  const transcriptInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const heroInputRef = useRef<HTMLInputElement>(null);

  // Config image upload refs
  const bgOverlayFileRef = useRef<HTMLInputElement>(null);
  const introImg1FileRef = useRef<HTMLInputElement>(null);
  const introImg2FileRef = useRef<HTMLInputElement>(null);
  const introHeroFileRef = useRef<HTMLInputElement>(null);

  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadConfigAsset = async (file: File, setter: (ref: string) => void, field: string) => {
    setUploadingField(field);
    setUploadError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`${API_BASE}/assets`, { method: "POST", body: form });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string };
        setUploadError(err.detail ?? "Upload failed");
        return;
      }
      const data = (await res.json()) as { assetRef: string };
      setter(data.assetRef);
    } catch {
      setUploadError("Upload failed — is the app server running?");
    } finally {
      setUploadingField(null);
    }
  };

  // ── Render state ──
  const [isStaging, setIsStaging] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState<ProgressData | null>(null);
  const [renderLogs, setRenderLogs] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDownloadName, setVideoDownloadName] = useState<string | null>(null);

  // ── Status fetch ──
  const fetchStatus = async () => {
    try {
      await fetch(`${APP_API_URL}/api/v1/status`);
      setAppServerReachable(true);
    } catch {
      setAppServerReachable(false);
    }
  };

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const res = await fetch(`${API_BASE}/templates`);
        if (!res.ok) return;
        const data = (await res.json()) as PlatformCatalog;
        const newsCategory = data.categories?.find((c) => c.category === "news");
        const mapped = (newsCategory?.presets ?? [])
          .filter((p) => p.status !== "internal")
          .map(mapPreset);
        if (!mapped.length) return;
        setTemplates(mapped);
        setTemplateId((current) => (mapped.some((t) => t.id === current) ? current : mapped[0].id));
      } catch {
        // Keep fallback template when the API catalog is unavailable.
      }
    };
    void loadTemplates();
    void fetchStatus();
  }, []);

  useEffect(() => {
    if (appService?.status === "running" || appService?.status === "stopped") void fetchStatus();
  }, [appService?.status]);

  // ── Image helpers ──
  const refreshImagePreviews = async (files: File[]) => {
    const previews: string[] = [];
    for (const file of files) previews.push(await readAsDataUrl(file));
    setImagePreviews(previews);
  };

  const handleImagesUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const merged = [...images, ...files].slice(0, 10);
    setImages(merged);
    await refreshImagePreviews(merged);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const removeImage = async (index: number) => {
    const next = images.filter((_, i) => i !== index);
    setImages(next);
    await refreshImagePreviews(next);
  };

  const handleHeroUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    setHeroImage(file);
    setHeroPreview(await readAsDataUrl(file));
    if (heroInputRef.current) heroInputRef.current.value = "";
  };

  // ── Server toggles ──
  const handleToggleAppServer = async () => {
    if (!appService) return;
    if (appRunning) {
      await stop("app");
      setAppServerReachable(false);
      return;
    }
    await start("app");
    await fetchStatus();
  };

  // ── Render ──
  const canRender =
    appServerReachable &&
    audioFile !== null &&
    transcriptFile !== null &&
    images.length >= 1 &&
    !isRendering &&
    !isStaging;

  const buildConfigOverrides = (): Record<string, unknown> => {
    const overrides: Record<string, unknown> = {
      introDurationInFrames: introDuration,
      imageDurationInFrames: imageDuration,
      introProps: { image1: introImage1, image2: introImage2, heroImage: introHeroImage },
    };
    if (selectedTemplate.backgroundMode) overrides.backgroundOverlayImage = bgOverlay;
    else overrides.overlayImage = bgOverlay;
    if (captionBottom !== "") overrides.captionBottomPercent = captionBottom;
    return overrides;
  };

  const buildForm = (extraFiles?: { heroImage?: File | null }) => {
    const form = new FormData();
    form.append("template", selectedTemplate.id);
    form.append("config_overrides", JSON.stringify(buildConfigOverrides()));
    form.append("audio_file", audioFile!);
    form.append("transcript_file", transcriptFile!);
    for (const img of images) form.append("images", img);
    if (extraFiles?.heroImage) form.append("hero_image", extraFiles.heroImage);
    return form;
  };

  const handleRender = async () => {
    if (!canRender || !audioFile || !transcriptFile) return;
    setIsRendering(true);
    setRenderProgress({ status: "starting", percent: 0, message: "Submitting render job..." });
    setRenderLogs([]);
    setVideoUrl(null);
    setVideoDownloadName(null);

    try {
      const createRes = await fetch(`${N2V_BASE}/render`, {
        method: "POST",
        body: buildForm({ heroImage }),
      });
      if (!createRes.ok) {
        const err = (await createRes.json().catch(() => ({}))) as { detail?: string };
        throw new Error(err.detail || "Failed to create render task");
      }
      const { task_id } = (await createRes.json()) as RenderCreateResponse;

      await streamTask(`${N2V_BASE}/render/stream/${task_id}`, setRenderProgress, setRenderLogs);

      const resultRes = await fetch(`${N2V_BASE}/render/result/${task_id}`);
      if (!resultRes.ok) {
        const err = (await resultRes.json().catch(() => ({}))) as { detail?: string };
        throw new Error(err.detail || "Failed to fetch render result");
      }
      const result = (await resultRes.json()) as RenderResultResponse;
      setVideoUrl(toAbsoluteApiUrl(result.preview_url));
      setVideoDownloadName(result.video.filename);
      setRenderProgress({ status: "complete", percent: 100, message: "Video render complete." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Render failed";
      setRenderProgress({ status: "error", percent: 0, message });
      setRenderLogs((prev) => [...prev, `[ERROR] ${message}`]);
    } finally {
      setIsRendering(false);
    }
  };

  const handlePreview = async () => {
    if (!canRender || !audioFile || !transcriptFile) return;
    setIsStaging(true);
    try {
      const res = await fetch(`${N2V_BASE}/preview/stage`, {
        method: "POST",
        body: buildForm({ heroImage }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(err.detail || "Failed to stage preview");
      }
      const data = (await res.json()) as { studio_url?: string };
      const studioUrl = data.studio_url || "http://localhost:3000/NewsAnchorComposition";
      if (window.electronAPI?.openExternal) {
        await window.electronAPI.openExternal(studioUrl);
      } else {
        window.open(studioUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Preview failed";
      setRenderProgress({ status: "error", percent: 0, message });
    } finally {
      setIsStaging(false);
    }
  };

  const downloadFile = (url: string, filename: string) => {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  // ── Status rows ──
  const statusRows: StatusRowConfig[] = [
    {
      id: "server",
      label: "App Server",
      isReady: appServerReachable,
      path: APP_API_URL,
      showActionButton: Boolean(appService),
      actionButtonLabel: appRunning || appServerReachable ? "Stop Server" : "Start Server",
      actionDisabled: appBusy || appService?.status === "not_configured",
      onAction: handleToggleAppServer,
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-card">
      <CardContent className="p-8 space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-foreground">News to Video</h2>
          <p className="text-sm text-muted-foreground">
            Upload audio, transcript, and images — render a news video with a news anchor template.
          </p>
        </div>

        {/* Service status */}
        <ServiceStatusTable
          serverUnreachable={!appServerReachable}
          rows={statusRows}
          onRefresh={() => void fetchStatus()}
          serverWarning={hasMissingDeps}
          onOpenSettings={onOpenSettings}
        />

        {/* Step 1 — Template */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase">Step 1 — Select Template</h3>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger className="bg-card border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{selectedTemplate.desc}</p>
          <details className="rounded-lg border border-border bg-muted/30 text-xs">
            <summary className="cursor-pointer select-none px-3 py-2 font-semibold text-foreground hover:bg-muted/50 rounded-lg">
              Details Config
            </summary>
          <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">

            {/* Hidden file inputs for config asset uploads */}
            <input ref={bgOverlayFileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadConfigAsset(f, setBgOverlay, "bgOverlay"); e.target.value = ""; }} />
            <input ref={introImg1FileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadConfigAsset(f, setIntroImage1, "img1"); e.target.value = ""; }} />
            <input ref={introImg2FileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadConfigAsset(f, setIntroImage2, "img2"); e.target.value = ""; }} />
            <input ref={introHeroFileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadConfigAsset(f, setIntroHeroImage, "hero"); e.target.value = ""; }} />
            {uploadError && (
              <p className="text-[10px] text-red-400">{uploadError}</p>
            )}

            {/* Durations + Overlay row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1 rounded-md border border-border bg-background/50 p-2">
                <span className="font-semibold text-foreground">Intro Duration</span>
                <span className="text-[10px] text-muted-foreground">Frames played for the animated intro (30 fps)</span>
                <input
                  type="number" min={0} step={1} value={introDuration}
                  onChange={(e) => setIntroDuration(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent mt-1"
                />
              </div>
              <div className="flex flex-col gap-1 rounded-md border border-border bg-background/50 p-2">
                <span className="font-semibold text-foreground">Slide Duration</span>
                <span className="text-[10px] text-muted-foreground">Frames each slideshow image stays on screen</span>
                <input
                  type="number" min={1} step={1} value={imageDuration}
                  onChange={(e) => setImageDuration(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent mt-1"
                />
              </div>
              <div className="flex flex-col gap-1 rounded-md border border-border bg-background/50 p-2">
                <span className="font-semibold text-foreground">
                  {selectedTemplate.backgroundMode ? "Background Overlay" : "Logo / Overlay"}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {selectedTemplate.backgroundMode
                    ? "Persistent image layered over the background after the intro ends"
                    : "Image overlaid on top of the video throughout (logo, watermark, etc.)"}
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <button type="button" onClick={() => bgOverlayFileRef.current?.click()} disabled={uploadingField === "bgOverlay"}
                    className="h-7 px-2 flex items-center gap-1.5 rounded-md border border-border bg-background hover:bg-muted transition-colors text-xs text-foreground shrink-0 disabled:opacity-50">
                    {uploadingField === "bgOverlay" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderOpen className="w-3.5 h-3.5 text-muted-foreground" />}Upload
                  </button>
                  <span className="text-[10px] text-muted-foreground truncate" title={bgOverlay}>
                    {bgOverlay ? bgOverlay.split(/[\\/]/).pop() : "No file"}
                  </span>
                </div>
              </div>
              {selectedTemplate.captionBottomPercent !== undefined && (
                <div className="flex flex-col gap-1 rounded-md border border-border bg-background/50 p-2">
                  <span className="font-semibold text-foreground">Caption Bottom Offset (%)</span>
                  <span className="text-[10px] text-muted-foreground">Vertical position of captions from the bottom edge</span>
                  <input
                    type="number" step={0.1} value={captionBottom}
                    onChange={(e) => setCaptionBottom(e.target.value === "" ? "" : parseFloat(e.target.value))}
                    className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent mt-1"
                  />
                </div>
              )}
            </div>

            {/* introProps */}
            <div className="space-y-2 pt-1 border-t border-border">
              <span className="font-semibold text-foreground">Intro Images</span>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1 rounded-md border border-border bg-background/50 p-2">
                  <span className="font-medium text-foreground">{selectedTemplate.id.includes("horizontal") ? "Left Panel" : "Top Panel"}</span>
                  <span className="text-[10px] text-muted-foreground">{selectedTemplate.id.includes("horizontal") ? "Left" : "Top"} decorative graphic in the animated intro</span>
                  <div className="flex items-center gap-2 mt-1">
                    <button type="button" onClick={() => introImg1FileRef.current?.click()} disabled={uploadingField === "img1"}
                      className="h-7 px-2 flex items-center gap-1.5 rounded-md border border-border bg-background hover:bg-muted transition-colors text-xs text-foreground shrink-0 disabled:opacity-50">
                      {uploadingField === "img1" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderOpen className="w-3.5 h-3.5 text-muted-foreground" />}Upload
                    </button>
                    <span className="text-[10px] text-muted-foreground truncate" title={introImage1}>
                      {introImage1 ? introImage1.split(/[\\/]/).pop() : "No file"}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-1 rounded-md border border-border bg-background/50 p-2">
                  <span className="font-medium text-foreground">{selectedTemplate.id.includes("horizontal") ? "Right Panel" : "Bottom Panel"}</span>
                  <span className="text-[10px] text-muted-foreground">{selectedTemplate.id.includes("horizontal") ? "Right" : "Bottom"} decorative graphic in the animated intro</span>
                  <div className="flex items-center gap-2 mt-1">
                    <button type="button" onClick={() => introImg2FileRef.current?.click()} disabled={uploadingField === "img2"}
                      className="h-7 px-2 flex items-center gap-1.5 rounded-md border border-border bg-background hover:bg-muted transition-colors text-xs text-foreground shrink-0 disabled:opacity-50">
                      {uploadingField === "img2" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderOpen className="w-3.5 h-3.5 text-muted-foreground" />}Upload
                    </button>
                    <span className="text-[10px] text-muted-foreground truncate" title={introImage2}>
                      {introImage2 ? introImage2.split(/[\\/]/).pop() : "No file"}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-1 rounded-md border border-border bg-background/50 p-2">
                  <span className="font-medium text-foreground">Anchor / Hero</span>
                  <span className="text-[10px] text-muted-foreground">Main presenter image in the intro animation</span>
                  <div className="flex items-center gap-2 mt-1">
                    <button type="button" onClick={() => introHeroFileRef.current?.click()} disabled={uploadingField === "hero"}
                      className="h-7 px-2 flex items-center gap-1.5 rounded-md border border-border bg-background hover:bg-muted transition-colors text-xs text-foreground shrink-0 disabled:opacity-50">
                      {uploadingField === "hero" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderOpen className="w-3.5 h-3.5 text-muted-foreground" />}Upload
                    </button>
                    <span className="text-[10px] text-muted-foreground truncate" title={introHeroImage}>
                      {introHeroImage ? introHeroImage.split(/[\\/]/).pop() : "No file"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

          </div>
          </details>
        </div>

        {/* Step 2 — Audio + Transcript */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase">Step 2 — Audio &amp; Transcript</h3>

          {/* Hidden file inputs */}
          <input
            ref={audioInputRef}
            type="file"
            accept=".wav,.mp3,.ogg,.aac,.m4a,audio/*"
            className="hidden"
            onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
          />
          <input
            ref={transcriptInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => setTranscriptFile(e.target.files?.[0] || null)}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-muted-foreground">
                Audio file (.wav / .mp3 / …) <span className="text-red-500">*</span>
              </label>
              <Button
                variant={audioFile ? "secondary" : "outline"}
                onClick={() => audioInputRef.current?.click()}
                className="w-full justify-start"
              >
                <Upload className="w-4 h-4 mr-2 shrink-0" />
                <span className="truncate">{audioFile?.name || "Choose audio file"}</span>
              </Button>
              {audioFile && (
                <button
                  className="text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => setAudioFile(null)}
                >
                  <X className="w-3 h-3 inline mr-1" />Remove
                </button>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-muted-foreground">
                Transcript file (.json) <span className="text-red-500">*</span>
              </label>
              <Button
                variant={transcriptFile ? "secondary" : "outline"}
                onClick={() => transcriptInputRef.current?.click()}
                className="w-full justify-start"
              >
                <FileText className="w-4 h-4 mr-2 shrink-0" />
                <span className="truncate">{transcriptFile?.name || "Choose .json file"}</span>
              </Button>
              {transcriptFile && (
                <button
                  className="text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => setTranscriptFile(null)}
                >
                  <X className="w-3 h-3 inline mr-1" />Remove
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Step 3 — Slideshow Images */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase">
            Step 3 — Slideshow Images{" "}
            <span className="text-muted-foreground font-normal normal-case">
              ({images.length}/10)
            </span>
          </h3>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void handleImagesUpload(e)}
          />
          <div className="grid grid-cols-5 gap-2">
            {imagePreviews.map((preview, idx) => (
              <div
                key={idx}
                className="relative group aspect-video rounded-lg overflow-hidden border border-border"
              >
                <img src={preview} alt={`slide-${idx + 1}`} className="w-full h-full object-cover" />
                <button
                  onClick={() => void removeImage(idx)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {images.length < 10 && (
              <button
                onClick={() => imageInputRef.current?.click()}
                className="aspect-video rounded-lg border-2 border-dashed border-border flex items-center justify-center hover:border-accent transition-colors"
              >
                <ImagePlus className="w-5 h-5 text-muted-foreground" />
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            1–10 images. Sorted by upload order and named 01, 02, … in the config.
          </p>
        </div>

        {/* Step 4 — Hero Image (only for templates with hero-overlay) */}
        {selectedTemplate.usesHero && (
          <div className="space-y-3">
            <h3 className="text-sm font-bold uppercase">
              Step 4 — Hero Image{" "}
              <span className="text-muted-foreground font-normal normal-case">(optional)</span>
            </h3>
            <p className="text-xs text-muted-foreground">
              Persistent overlay on the right half of the screen.
            </p>
            <input
              ref={heroInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handleHeroUpload(e)}
            />
            {heroPreview ? (
              <div className="border rounded-lg p-2 space-y-2 max-w-xs">
                <img src={heroPreview} alt="Hero" className="w-full h-32 object-contain rounded-md" />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setHeroImage(null);
                    setHeroPreview(null);
                  }}
                >
                  <X className="w-3 h-3 mr-1" />Remove
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={() => heroInputRef.current?.click()}>
                <ImagePlus className="w-4 h-4 mr-2" />Upload hero image
              </Button>
            )}
          </div>
        )}

        {/* Step 5 — Render */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase">
            {selectedTemplate.usesHero ? "Step 5" : "Step 4"} — Generate Video
          </h3>

          <div className="flex gap-2">
            <Button
              className="flex-1 h-10 bg-accent text-accent-foreground rounded-xl font-bold"
              onClick={() => void handleRender()}
              disabled={!canRender}
            >
              {isRendering ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Video className="w-4 h-4 mr-2" />
              )}
              {isRendering ? "Rendering…" : "Generate Video"}
            </Button>

            <Button
              variant="outline"
              className="h-10 px-4 rounded-xl font-bold"
              onClick={() => void handlePreview()}
              disabled={!canRender}
              title="Stage a preview workspace and open the Remotion family in your browser"
            >
              {isStaging ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Eye className="w-4 h-4 mr-2" />
              )}
              {isStaging ? "Staging…" : "Preview"}
            </Button>
          </div>

          <ProgressDisplay
            progress={renderProgress}
            logs={renderLogs}
            defaultMessage="Waiting for render…"
          />

          {/* Video preview + download */}
          {videoUrl && (
            <div className="space-y-3 p-4 bg-emerald-500/12 rounded-xl border border-emerald-500/45">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-emerald-400">
                  <Play className="w-4 h-4 inline mr-2" />
                  Video ready
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => downloadFile(videoUrl, videoDownloadName || "news-video.mp4")}
                >
                  <Download className="w-3 h-3 mr-1.5" />
                  {videoDownloadName || "news-video.mp4"}
                </Button>
              </div>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                controls
                className="w-full rounded-lg border border-border"
                src={videoUrl}
                style={{ maxHeight: "480px" }}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
