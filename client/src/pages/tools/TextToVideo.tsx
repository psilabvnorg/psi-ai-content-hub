import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Download, Eye, FileText, ImagePlus, Loader2, Mic, Play, Settings, Upload, Video, X } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import type { I18nKey } from "@/i18n/translations";
import { APP_API_URL } from "@/lib/api";
import { ProgressDisplay, ServiceStatusTable } from "@/components/common/tool-page-ui";
import type { ProgressData, StatusRowConfig } from "@/components/common/tool-page-ui";
import { useManagedServices } from "@/hooks/useManagedServices";

const MAX_CHARS = 5000;
const VOICE_CLONE_URL = "http://127.0.0.1:6902";
const astt_service_base_url = `${APP_API_URL}/api/v1/whisper`;

type Voice = { id: string; name: string; description?: string };
type TranscriptWord = { word?: string; start?: number; end?: number };
type TranscriptSegment = { start?: number; end?: number; text?: string; words?: TranscriptWord[] };
type TranscriptPayload = { text?: string; language?: string; segments?: TranscriptSegment[]; [key: string]: unknown };
type StreamPayload = { status?: string; percent?: number; message?: string; logs?: string[] };
type AudioCreateResponse = { task_id: string };
type AudioResultResponse = {
  session_id: string;
  audio: { filename: string; download_url: string };
  transcript: TranscriptPayload;
  transcript_file: { filename: string; download_url: string };
};
type RenderCreateResponse = { task_id: string };
type RenderResultResponse = { video: { filename: string; download_url: string }; preview_url: string };
type AudioInputMode = "generate" | "upload";
type IntroConfigPayload = {
  templateId: string;
  title: string;
  brandName: string;
  tagline: string;
  url: string;
  gradientTopColor: string;
  gradientBottomColor: string;
  brandNameColor: string;
  accentColor: string;
  taglineColor: string;
  titleColor: string;
  urlColor: string;
  showBackgroundPattern: boolean;
  showTopLogo: boolean;
  showBrandLogo: boolean;
  showSocialIcons: boolean;
  showFacebook: boolean;
  showTikTok: boolean;
  showYouTube: boolean;
  showInstagram: boolean;
  showMoneyElement: boolean;
  showProfitElement: boolean;
  enableAudio: boolean;
};

const defaultIntroConfig: IntroConfigPayload = {
  templateId: "template_2",
  title: "Loạt cổ phiếu ngân hàng, chứng khoán tăng trần",
  brandName: "PSI.VN",
  tagline: "KÊNH KINH TẾ - CHÍNH TRỊ - XÃ HỘI",
  url: "https://psi.vn",
  gradientTopColor: "rgba(10, 10, 26, 0.7)",
  gradientBottomColor: "rgba(0, 0, 0, 0.85)",
  brandNameColor: "#ffffff",
  accentColor: "#ffffff",
  taglineColor: "#ffffff",
  titleColor: "#ffffff",
  urlColor: "#ffffff",
  showBackgroundPattern: true,
  showTopLogo: true,
  showBrandLogo: true,
  showSocialIcons: true,
  showFacebook: true,
  showTikTok: true,
  showYouTube: true,
  showInstagram: true,
  showMoneyElement: true,
  showProfitElement: true,
  enableAudio: false,
};

function toAbsoluteApiUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) return pathOrUrl;
  return pathOrUrl.startsWith("/") ? `${APP_API_URL}${pathOrUrl}` : `${APP_API_URL}/${pathOrUrl}`;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("read failed")));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

async function streamTask(
  streamUrl: string,
  onProgress: (progress: ProgressData) => void,
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

export default function TextToVideo({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { t } = useI18n();

  const [text, setText] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [charLimitEnabled, setCharLimitEnabled] = useState(true);
  const [audioInputMode, setAudioInputMode] = useState<AudioInputMode>("generate");

  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState<ProgressData | null>(null);
  const [audioLogs, setAudioLogs] = useState<string[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioDownloadName, setAudioDownloadName] = useState<string | null>(null);
  const [transcriptResult, setTranscriptResult] = useState<TranscriptPayload | null>(null);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [t2vSessionId, setT2vSessionId] = useState<string | null>(null);
  const [uploadedAudioFile, setUploadedAudioFile] = useState<File | null>(null);
  const [uploadedTranscriptFile, setUploadedTranscriptFile] = useState<File | null>(null);
  const uploadAudioInputRef = useRef<HTMLInputElement>(null);
  const uploadTranscriptInputRef = useRef<HTMLInputElement>(null);

  const [introImage, setIntroImage] = useState<File | null>(null);
  const [introImagePreview, setIntroImagePreview] = useState<string | null>(null);
  const introImageInputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [introConfig, setIntroConfig] = useState<IntroConfigPayload>(defaultIntroConfig);

  const [orientation, setOrientation] = useState<"vertical" | "horizontal">("vertical");
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState<ProgressData | null>(null);
  const [renderLogs, setRenderLogs] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDownloadName, setVideoDownloadName] = useState<string | null>(null);

  const [isStaging, setIsStaging] = useState(false);
  const [studioRunning, setStudioRunning] = useState(false);

  const stopStudio = useCallback(() => {
    fetch(`${APP_API_URL}/api/v1/text-to-video/preview/studio/stop`, { method: "POST" }).catch(() => {});
  }, []);

  // Stop Remotion Studio when leaving the page or closing the app
  useEffect(() => {
    const handleBeforeUnload = () => {
      navigator.sendBeacon(`${APP_API_URL}/api/v1/text-to-video/preview/studio/stop`);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      stopStudio();
    };
  }, [stopStudio]);

  const [appServerReachable, setAppServerReachable] = useState(false);
  const [vcServerReachable, setVcServerReachable] = useState(false);
  const [sttServerReachable, setSttServerReachable] = useState(false);

  const { servicesById, start, stop, isBusy } = useManagedServices();
  const appService = servicesById.app;
  const appRunning = appService?.status === "running";
  const appBusy = isBusy("app");
  const vcService = servicesById.f5;
  const vcRunning = vcService?.status === "running";
  const vcBusy = isBusy("f5");
  const sttService = servicesById.app;
  const sttRunning = sttService?.status === "running";
  const sttBusy = isBusy("app");

  const charCount = text.length;
  const isUploadMode = audioInputMode === "upload";
  const overLimit = charLimitEnabled && charCount > MAX_CHARS;
  const segments = transcriptResult?.segments || [];
  const audioReady = audioUrl !== null && transcriptResult !== null && t2vSessionId !== null;
  const renderReady = audioReady && introImage !== null && images.length > 0;
  const canGenerateAudio =
    text.trim().length > 0 &&
    !overLimit &&
    selectedVoice.length > 0 &&
    appServerReachable &&
    vcServerReachable &&
    sttServerReachable;
  const canUploadAudioArtifacts = uploadedAudioFile !== null && uploadedTranscriptFile !== null && appServerReachable;

  const fetchStatus = async () => {
    try {
      await fetch(`${APP_API_URL}/api/v1/status`);
      setAppServerReachable(true);
    } catch {
      setAppServerReachable(false);
    }
    try {
      await fetch(`${VOICE_CLONE_URL}/api/v1/status`);
      setVcServerReachable(true);
    } catch {
      setVcServerReachable(false);
    }
    try {
      await fetch(`${astt_service_base_url}/status`);
      setSttServerReachable(true);
    } catch {
      setSttServerReachable(false);
    }
    try {
      const res = await fetch(`${APP_API_URL}/api/v1/text-to-video/preview/studio/status`);
      const data = (await res.json()) as { running?: boolean };
      setStudioRunning(data.running === true);
    } catch {
      setStudioRunning(false);
    }
  };

  const fetchVoices = async () => {
    try {
      const response = await fetch(`${VOICE_CLONE_URL}/api/v1/voices`);
      const payload = (await response.json()) as { voices?: Voice[] };
      setVoices(payload.voices || []);
    } catch {
      setVoices([]);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchVoices();
  }, []);

  useEffect(() => {
    if (appService?.status === "running" || appService?.status === "stopped") fetchStatus();
  }, [appService?.status]);

  useEffect(() => {
    if (vcService?.status === "running" || vcService?.status === "stopped") {
      fetchStatus();
      fetchVoices();
    }
  }, [vcService?.status]);

  useEffect(() => {
    if (sttService?.status === "running" || sttService?.status === "stopped") fetchStatus();
  }, [sttService?.status]);

  useEffect(() => {
    setAudioUrl(null);
    setAudioDownloadName(null);
    setTranscriptResult(null);
    setTranscriptExpanded(false);
    setT2vSessionId(null);
    setVideoUrl(null);
    setVideoDownloadName(null);
    setRenderProgress(null);
    setRenderLogs([]);
    setAudioProgress(null);
    setAudioLogs([]);
  }, [audioInputMode]);

  const refreshImagePreviews = async (files: File[]) => {
    const previews: string[] = [];
    for (const file of files) previews.push(await readAsDataUrl(file));
    setImagePreviews(previews);
  };

  const resetAudioOutputs = () => {
    setAudioUrl(null);
    setAudioDownloadName(null);
    setTranscriptResult(null);
    setTranscriptExpanded(false);
    setT2vSessionId(null);
    setVideoUrl(null);
    setVideoDownloadName(null);
    setRenderProgress(null);
    setRenderLogs([]);
  };

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

  const handleToggleVcServer = async () => {
    if (!vcService) return;
    if (vcRunning) {
      await stop("f5");
      setVcServerReachable(false);
      return;
    }
    await start("f5");
    await fetchStatus();
    await fetchVoices();
  };

  const handleToggleSttServer = async () => {
    if (!sttService) return;
    if (sttRunning) {
      await stop("app");
      setSttServerReachable(false);
      return;
    }
    await start("app");
    await fetchStatus();
  };

  const handleUploadAudioAndTranscript = async () => {
    if (!uploadedAudioFile || !uploadedTranscriptFile || !appServerReachable) return;
    setIsGeneratingAudio(true);
    setAudioProgress({ status: "starting", percent: 0, message: t("tool.t2v.uploading_artifacts") });
    setAudioLogs([]);
    resetAudioOutputs();

    try {
      const form = new FormData();
      form.append("audio_file", uploadedAudioFile);
      form.append("transcript_file", uploadedTranscriptFile);

      const response = await fetch(`${APP_API_URL}/api/v1/text-to-video/audio/upload`, {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => ({}))) as { detail?: string };
        throw new Error(errorPayload.detail || "Failed to upload audio and transcript");
      }

      const result = (await response.json()) as AudioResultResponse;
      setT2vSessionId(result.session_id);
      setAudioUrl(toAbsoluteApiUrl(result.audio.download_url));
      setAudioDownloadName(result.audio.filename);
      setTranscriptResult(result.transcript);
      setAudioProgress({ status: "complete", percent: 100, message: t("tool.t2v.upload_complete") });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Audio upload failed";
      setAudioProgress({ status: "error", percent: 0, message });
      setAudioLogs((prev) => [...prev, `[ERROR] ${message}`]);
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const handleGenerateAudio = async () => {
    if (!text.trim() || overLimit || !selectedVoice || !appServerReachable || !vcServerReachable || !sttServerReachable) return;
    setIsGeneratingAudio(true);
    setAudioProgress({ status: "starting", percent: 0, message: t("tool.t2v.step_voice") });
    setAudioLogs([]);
    resetAudioOutputs();

    try {
      const createResponse = await fetch(`${APP_API_URL}/api/v1/text-to-video/audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), voice_id: selectedVoice }),
      });
      if (!createResponse.ok) {
        const errorPayload = (await createResponse.json().catch(() => ({}))) as { detail?: string };
        throw new Error(errorPayload.detail || "Failed to create audio task");
      }
      const createData = (await createResponse.json()) as AudioCreateResponse;

      await streamTask(
        `${APP_API_URL}/api/v1/text-to-video/audio/stream/${createData.task_id}`,
        setAudioProgress,
        setAudioLogs,
      );

      const resultResponse = await fetch(`${APP_API_URL}/api/v1/text-to-video/audio/result/${createData.task_id}`);
      if (!resultResponse.ok) {
        const errorPayload = (await resultResponse.json().catch(() => ({}))) as { detail?: string };
        throw new Error(errorPayload.detail || "Failed to fetch audio result");
      }
      const result = (await resultResponse.json()) as AudioResultResponse;
      setT2vSessionId(result.session_id);
      setAudioUrl(toAbsoluteApiUrl(result.audio.download_url));
      setAudioDownloadName(result.audio.filename);
      setTranscriptResult(result.transcript);
      setAudioProgress({ status: "complete", percent: 100, message: t("tool.t2v.audio_complete") });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Audio generation failed";
      setAudioProgress({ status: "error", percent: 0, message });
      setAudioLogs((prev) => [...prev, `[ERROR] ${message}`]);
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const handleIntroUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    setIntroImage(file);
    setIntroImagePreview(await readAsDataUrl(file));
    if (introImageInputRef.current) introImageInputRef.current.value = "";
  };

  const handleImagesUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
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

  const handleRenderVideo = async () => {
    if (!renderReady || !t2vSessionId || !introImage) return;
    setIsRendering(true);
    setRenderProgress({ status: "starting", percent: 0, message: t("tool.t2v.step_render") });
    setRenderLogs([]);
    setVideoUrl(null);
    setVideoDownloadName(null);

    try {
      const form = new FormData();
      form.append("session_id", t2vSessionId);
      form.append("orientation", orientation);
      form.append("intro_config_json", JSON.stringify(introConfig));
      form.append("intro_image", introImage);
      for (const image of images) form.append("images", image);

      const createResponse = await fetch(`${APP_API_URL}/api/v1/text-to-video/render`, { method: "POST", body: form });
      if (!createResponse.ok) {
        const errorPayload = (await createResponse.json().catch(() => ({}))) as { detail?: string };
        throw new Error(errorPayload.detail || "Failed to create render task");
      }
      const createData = (await createResponse.json()) as RenderCreateResponse;

      await streamTask(
        `${APP_API_URL}/api/v1/text-to-video/render/stream/${createData.task_id}`,
        setRenderProgress,
        setRenderLogs,
      );

      const resultResponse = await fetch(`${APP_API_URL}/api/v1/text-to-video/render/result/${createData.task_id}`);
      if (!resultResponse.ok) {
        const errorPayload = (await resultResponse.json().catch(() => ({}))) as { detail?: string };
        throw new Error(errorPayload.detail || "Failed to fetch render result");
      }
      const result = (await resultResponse.json()) as RenderResultResponse;
      setVideoUrl(toAbsoluteApiUrl(result.preview_url));
      setVideoDownloadName(result.video.filename);
      setRenderProgress({ status: "complete", percent: 100, message: t("tool.t2v.complete") });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Render failed";
      setRenderProgress({ status: "error", percent: 0, message });
      setRenderLogs((prev) => [...prev, `[ERROR] ${message}`]);
    } finally {
      setIsRendering(false);
    }
  };

  const handlePreview = async () => {
    if (!renderReady || !t2vSessionId || !introImage) return;
    setIsStaging(true);

    try {
      await fetch(`${APP_API_URL}/api/v1/text-to-video/preview/studio/start`, { method: "POST" });
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const form = new FormData();
      form.append("session_id", t2vSessionId);
      form.append("orientation", orientation);
      form.append("intro_config_json", JSON.stringify(introConfig));
      form.append("intro_image", introImage);
      for (const image of images) form.append("images", image);

      const res = await fetch(`${APP_API_URL}/api/v1/text-to-video/preview/stage`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(err.detail || "Failed to stage preview");
      }

      setStudioRunning(true);
      window.open("http://localhost:3100", "_blank");
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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return `${mins}:${secs.padStart(4, "0")}`;
  };

  const handleToggleStudio = async () => {
    const endpoint = studioRunning ? "stop" : "start";
    await fetch(`${APP_API_URL}/api/v1/text-to-video/preview/studio/${endpoint}`, { method: "POST" }).catch(() => {});
    if (!studioRunning) {
      // Give studio time to start before refreshing status
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    fetchStatus();
  };

  const statusRows: StatusRowConfig[] = [
    {
      id: "server",
      label: t("tool.t2v.app_server"),
      isReady: appServerReachable,
      path: APP_API_URL,
      showActionButton: Boolean(appService),
      actionButtonLabel: appRunning || appServerReachable ? t("tool.common.stop_server") : t("tool.common.start_server"),
      actionDisabled: appBusy || appService?.status === "not_configured",
      onAction: handleToggleAppServer,
    },
    {
      id: "vc",
      label: t("tool.t2v.vc_server"),
      isReady: vcServerReachable,
      path: VOICE_CLONE_URL,
      showActionButton: Boolean(vcService),
      actionButtonLabel: vcRunning || vcServerReachable ? t("tool.common.stop_server") : t("tool.common.start_server"),
      actionDisabled: vcBusy || vcService?.status === "not_configured",
      onAction: handleToggleVcServer,
    },
    {
      id: "stt",
      label: t("tool.t2v.stt_server"),
      isReady: sttServerReachable,
      path: astt_service_base_url,
      showActionButton: Boolean(sttService),
      actionButtonLabel: sttRunning || sttServerReachable ? t("tool.common.stop_server") : t("tool.common.start_server"),
      actionDisabled: sttBusy || sttService?.status === "not_configured",
      onAction: handleToggleSttServer,
    },
    {
      id: "studio",
      label: t("tool.t2v.remotion_studio"),
      isReady: studioRunning,
      path: `http://localhost:3100`,
      showActionButton: appServerReachable,
      actionButtonLabel: studioRunning ? t("tool.common.stop_server") : t("tool.common.start_server"),
      onAction: handleToggleStudio,
    },
  ];

  const textFields: Array<{ key: keyof IntroConfigPayload; labelKey: I18nKey }> = [
    { key: "templateId", labelKey: "tool.t2v.template_id" },
    { key: "title", labelKey: "tool.t2v.title" },
    { key: "brandName", labelKey: "tool.t2v.brand_name" },
    { key: "tagline", labelKey: "tool.t2v.tagline" },
    { key: "url", labelKey: "tool.t2v.url" },
    { key: "gradientTopColor", labelKey: "tool.t2v.gradient_top_color" },
    { key: "gradientBottomColor", labelKey: "tool.t2v.gradient_bottom_color" },
    { key: "brandNameColor", labelKey: "tool.t2v.brand_color" },
    { key: "accentColor", labelKey: "tool.t2v.accent_color" },
    { key: "taglineColor", labelKey: "tool.t2v.tagline_color" },
    { key: "titleColor", labelKey: "tool.t2v.title_color" },
    { key: "urlColor", labelKey: "tool.t2v.url_color" },
  ];

  const toggleFields: Array<{ key: keyof IntroConfigPayload; labelKey: I18nKey }> = [
    { key: "showBackgroundPattern", labelKey: "tool.t2v.toggle_background_pattern" },
    { key: "showTopLogo", labelKey: "tool.t2v.toggle_top_logo" },
    { key: "showBrandLogo", labelKey: "tool.t2v.toggle_brand_logo" },
    { key: "showSocialIcons", labelKey: "tool.t2v.toggle_social_icons" },
    { key: "showFacebook", labelKey: "tool.t2v.toggle_facebook" },
    { key: "showTikTok", labelKey: "tool.t2v.toggle_tiktok" },
    { key: "showYouTube", labelKey: "tool.t2v.toggle_youtube" },
    { key: "showInstagram", labelKey: "tool.t2v.toggle_instagram" },
    { key: "showMoneyElement", labelKey: "tool.t2v.toggle_money_element" },
    { key: "showProfitElement", labelKey: "tool.t2v.toggle_profit_element" },
    { key: "enableAudio", labelKey: "tool.t2v.toggle_enable_audio" },
  ];

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-card">
      <CardContent className="p-8 space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">{t("feature.workflow.text_to_video.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("feature.workflow.text_to_video.desc")}</p>
        </div>

        <ServiceStatusTable serverUnreachable={!appServerReachable} rows={statusRows} onRefresh={fetchStatus} />

        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase">{t("tool.t2v.step1_title")}</h3>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-muted-foreground">{t("tool.t2v.input_mode")}</label>
            <Select value={audioInputMode} onValueChange={(value) => setAudioInputMode(value as AudioInputMode)}>
              <SelectTrigger className="bg-card border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="generate">{t("tool.t2v.mode_generate")}</SelectItem>
                <SelectItem value="upload">{t("tool.t2v.mode_upload")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isUploadMode ? (
            <div className="space-y-3">
              <input
                ref={uploadAudioInputRef}
                type="file"
                accept=".wav,audio/wav"
                className="hidden"
                onChange={(event) => {
                  setUploadedAudioFile(event.target.files?.[0] || null);
                }}
              />
              <input
                ref={uploadTranscriptInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(event) => {
                  setUploadedTranscriptFile(event.target.files?.[0] || null);
                }}
              />
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-muted-foreground">{t("tool.t2v.upload_audio_file")}</label>
                <Button variant="outline" onClick={() => uploadAudioInputRef.current?.click()} className="w-full justify-start">
                  <Upload className="w-4 h-4 mr-2" />
                  {uploadedAudioFile?.name || t("tool.t2v.choose_wav")}
                </Button>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-muted-foreground">{t("tool.t2v.upload_transcript_file")}</label>
                <Button variant="outline" onClick={() => uploadTranscriptInputRef.current?.click()} className="w-full justify-start">
                  <FileText className="w-4 h-4 mr-2" />
                  {uploadedTranscriptFile?.name || t("tool.t2v.choose_json")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                <SelectTrigger className="bg-card border-border">
                  <SelectValue placeholder={t("tool.t2v.choose_voice")} />
                </SelectTrigger>
                <SelectContent>{voices.map((voice) => <SelectItem key={voice.id} value={voice.id}>{voice.name}</SelectItem>)}</SelectContent>
              </Select>
              <Textarea value={text} onChange={(event) => setText(event.target.value)} className="min-h-[140px] bg-card border-border resize-none" />
              <div className="flex items-center justify-between">
                <p className={`text-xs ${overLimit ? "text-red-500" : "text-muted-foreground"}`}>
                  {charLimitEnabled ? t("tool.voice_clone.characters", { count: charCount, max: MAX_CHARS }) : `${charCount} characters`}
                </p>
                <Button size="sm" variant={charLimitEnabled ? "outline" : "secondary"} onClick={() => setCharLimitEnabled((v) => !v)} className="h-6 text-xs px-2">
                  {charLimitEnabled ? t("tool.common.char_limit_on") : t("tool.common.char_limit_off")}
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase">{isUploadMode ? t("tool.t2v.step2_upload_title") : t("tool.t2v.step2_generate_title")}</h3>
          {isUploadMode && <p className="text-xs text-muted-foreground">{t("tool.t2v.upload_mode_server_hint")}</p>}
          <Button
            className="w-full h-10 bg-accent text-accent-foreground rounded-xl font-bold"
            onClick={isUploadMode ? handleUploadAudioAndTranscript : handleGenerateAudio}
            disabled={isGeneratingAudio || (isUploadMode ? !canUploadAudioArtifacts : !canGenerateAudio)}
          >
            {isGeneratingAudio ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : isUploadMode ? <Upload className="w-4 h-4 mr-2" /> : <Mic className="w-4 h-4 mr-2" />}
            {isUploadMode ? t("tool.t2v.upload_audio") : t("tool.t2v.generate_audio")}
          </Button>
          <ProgressDisplay progress={audioProgress} logs={audioLogs} defaultMessage={t("tool.t2v.processing")} />
          {audioUrl && (
            <div className="p-4 bg-emerald-500/12 rounded-xl border border-emerald-500/45 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-emerald-400"><Play className="w-4 h-4 inline mr-2" />{t("tool.t2v.audio_ready")}</span>
                <Button size="sm" variant="outline" onClick={() => downloadFile(audioUrl, audioDownloadName || "voice_output.wav")}>
                  <Download className="w-3 h-3 mr-1.5" />{audioDownloadName || "voice_output.wav"}
                </Button>
              </div>
              <audio controls className="w-full h-10"><source src={audioUrl} type="audio/wav" /></audio>
            </div>
          )}
          {transcriptResult && (
            <div className="p-4 bg-blue-500/12 rounded-xl border border-blue-500/45 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-blue-400"><FileText className="w-4 h-4 inline mr-2" />{t("tool.t2v.transcript_ready")}</span>
                <Button size="sm" variant="outline" onClick={() => setTranscriptExpanded((v) => !v)}>{transcriptExpanded ? t("tool.t2v.collapse") : t("tool.t2v.expand")}</Button>
              </div>
              {segments.map((segment, index) => <div key={index} className="text-xs"><span className="text-blue-400 font-mono">[{formatTime(segment.start || 0)} -&gt; {formatTime(segment.end || 0)}]</span> {segment.text || ""}</div>)}
              {transcriptExpanded && <pre className="text-[10px] font-mono text-blue-300/70 bg-muted/50 p-3 rounded-lg whitespace-pre-wrap">{JSON.stringify(transcriptResult, null, 2)}</pre>}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase">{t("tool.t2v.step3_images_title")}</h3>
          <input ref={introImageInputRef} type="file" accept="image/*" className="hidden" onChange={handleIntroUpload} />
          <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImagesUpload} />
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-muted-foreground">{t("tool.t2v.intro_image")}</label>
            {introImagePreview ? (
              <div className="border rounded-lg p-2 space-y-2">
                <img src={introImagePreview} alt="Intro" className="w-full h-36 object-cover rounded-md" />
                <Button size="sm" variant="outline" onClick={() => { setIntroImage(null); setIntroImagePreview(null); }}>
                  <X className="w-3 h-3 mr-1" />{t("tool.t2v.remove")}
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={() => introImageInputRef.current?.click()}><ImagePlus className="w-4 h-4 mr-2" />{t("tool.t2v.upload_intro_image")}</Button>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-muted-foreground">{t("tool.t2v.slideshow_images")}</label>
            <div className="grid grid-cols-5 gap-2">
              {imagePreviews.map((preview, index) => (
                <div key={index} className="relative group aspect-video rounded-lg overflow-hidden border border-border">
                  <img src={preview} alt={`slide-${index + 1}`} className="w-full h-full object-cover" />
                  <button onClick={() => void removeImage(index)} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100"><X className="w-3 h-3 mx-auto" /></button>
                </div>
              ))}
              {images.length < 10 && <button onClick={() => imageInputRef.current?.click()} className="aspect-video rounded-lg border-2 border-dashed border-border flex items-center justify-center"><ImagePlus className="w-5 h-5" /></button>}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("tool.t2v.images_hint", { count: images.length, max: 10 })}</p>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase">{t("tool.t2v.step4_render_title")}</h3>
          <Select value={orientation} onValueChange={(value) => setOrientation(value as "vertical" | "horizontal")}>
            <SelectTrigger className="bg-card border-border"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="vertical">{t("tool.t2v.vertical")}</SelectItem>
              <SelectItem value="horizontal">{t("tool.t2v.horizontal")}</SelectItem>
            </SelectContent>
          </Select>

          <div className="border border-border rounded-xl p-4 space-y-3 bg-muted/20">
            <div className="text-sm font-bold uppercase"><Settings className="w-4 h-4 inline mr-2" />{t("tool.t2v.intro_settings")}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {textFields.map((field) => (
                <div key={field.key} className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t(field.labelKey)}</label>
                  <Input value={String(introConfig[field.key])} onChange={(event) => setIntroConfig((prev) => ({ ...prev, [field.key]: event.target.value }))} />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {toggleFields.map((field) => (
                <label key={field.key} className="flex items-center gap-2">
                  <input type="checkbox" checked={Boolean(introConfig[field.key])} onChange={(event) => setIntroConfig((prev) => ({ ...prev, [field.key]: event.target.checked }))} />
                  {t(field.labelKey)}
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button className="flex-1 h-12 rounded-xl font-bold" variant="outline" onClick={handlePreview} disabled={isStaging || isRendering || !renderReady}>
              {isStaging ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Eye className="w-5 h-5 mr-2" />}{t("tool.t2v.preview")}
            </Button>
            <Button className="flex-1 h-12 bg-accent text-accent-foreground rounded-xl font-bold" onClick={handleRenderVideo} disabled={isRendering || !renderReady}>
              {isRendering ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Video className="w-5 h-5 mr-2" />}{t("tool.t2v.generate")}
            </Button>
          </div>

          <ProgressDisplay progress={renderProgress} logs={renderLogs} defaultMessage={t("tool.t2v.processing")} />
          {videoUrl && (
            <div className="p-4 bg-emerald-500/12 rounded-xl border border-emerald-500/45 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-emerald-400">{t("tool.common.video_ready")}</span>
                <Button size="sm" variant="download" onClick={() => downloadFile(videoUrl, videoDownloadName || "text_to_video.mp4")}>
                  <Download className="w-4 h-4 mr-2" />{t("tool.common.download")}
                </Button>
              </div>
              <video controls className="w-full rounded-lg bg-black" src={videoUrl} />
            </div>
          )}
        </div>

        {onOpenSettings && (!vcService || !sttService) && <Button variant="outline" onClick={onOpenSettings}>{t("tool.common.open_settings")}</Button>}
      </CardContent>
    </Card>
  );
}
