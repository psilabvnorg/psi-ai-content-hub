import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, CheckCircle, XCircle, Loader2, FolderOpen, Copy, Check } from "lucide-react";
import { APP_API_URL, BGREMOVE_API_URL, F5_API_URL, IMAGE_FINDER_API_URL, TRANSLATION_API_URL, VIENEU_API_URL, WHISPER_API_URL } from "@/lib/api";
import { useI18n } from "@/i18n/i18n";
import type { I18nKey } from "@/i18n/translations";
import { useManagedServices } from "@/hooks/useManagedServices";

type LogLine = { line: string };

type SystemStatus = {
  status: string;
  temp?: { temp_dir: string; file_count: number; total_size_mb: number };
  tools?: {
    ffmpeg?: { installed: boolean; path?: string | null };
    yt_dlp?: { installed: boolean; path?: string | null };
    torch?: { installed: boolean; version?: string | null; cuda?: string | null; path?: string | null };
  };
};

type ToolRow = {
  id: string;
  name: string;
  status: "ready" | "not_ready";
  path?: string | null;
  can_install: boolean;
};

type ProgressData = {
  status: string;
  percent: number;
  message?: string;
  logs?: string[];
};

type EnvStatus = {
  installed: boolean;
  missing?: string[];
  installed_modules?: string[];
  python_path?: string;
};

type F5ModelStatus = {
  installed?: boolean;
  model_file?: string | null;
  vocab_file?: string | null;
};

type VieNeuModelStatus = {
  backbone_ready?: boolean;
  codec_ready?: boolean;
  backbone_dir?: string;
  codec_dir?: string;
  model_loaded?: boolean;
  current_config?: Record<string, unknown>;
};

type WhisperModelStatus = {
  deps_ok?: boolean;
  deps_missing?: string[];
  ffmpeg_ok?: boolean;
  model_dir?: string;
  cached_models?: string[];
};

type BgRemoveModelStatus = {
  model_id?: string;
  model_loaded?: boolean;
  model_loading?: boolean;
  model_error?: string | null;
  device?: "cuda" | "cpu";
};

type TranslationModelStatus = {
  loaded?: boolean;
  downloaded?: boolean;
  model_id?: string;
  model_dir?: string | null;
  device?: string | null;
  supported_languages?: Record<string, string>;
};

const WHISPER_MODELS = ["tiny", "base", "small", "medium", "large", "large-v3"] as const;
const MANAGED_SERVICE_LABELS: Record<string, string> = {
  app: "App API",
  f5: "F5 Voice Clone API",
  vieneu: "VieNeu TTS API",
};
const MANAGED_SERVICE_IDS = ["app", "f5", "vieneu"] as const;

function isManagedServiceId(value: string): value is (typeof MANAGED_SERVICE_IDS)[number] {
  return MANAGED_SERVICE_IDS.includes(value as (typeof MANAGED_SERVICE_IDS)[number]);
}

async function consumeSseStream(response: Response, onMessage: (data: ProgressData) => void) {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      const line = part.trim();
      if (line.startsWith("data:")) {
        const payload = line.replace("data:", "").trim();
        try {
          onMessage(JSON.parse(payload) as ProgressData);
        } catch {
          // ignore
        }
      }
    }
  }
}

const STORAGE_PATHS = [
  {
    label: "Model path",
    path: "C:\\Users\\ADMIN\\AppData\\Roaming\\psi-ai-content-hub\\models\\",
  },
  {
    label: "Temp media storage path",
    path: "C:\\Users\\ADMIN\\AppData\\Local\\Temp\\psi_ai_content_hub",
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handleCopy} title="Copy path">
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
    </Button>
  );
}

function StorageLocationsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          File Storage Locations
        </CardTitle>
        <CardDescription>Where models and temporary files are stored on this machine</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {STORAGE_PATHS.map(({ label, path }) => (
          <div key={label} className="flex items-center justify-between rounded-md border px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{label}</p>
              <p className="truncate text-xs text-muted-foreground font-mono">{path}</p>
            </div>
            <CopyButton text={path} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { t, language, setLanguage } = useI18n();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [tools, setTools] = useState<ToolRow[]>([]);
  const [toolProgress, setToolProgress] = useState<Record<string, ProgressData | null>>({});
  const [f5Env, setF5Env] = useState<EnvStatus | null>(null);
  const [f5Model, setF5Model] = useState<F5ModelStatus | null>(null);
  const [f5Progress, setF5Progress] = useState<ProgressData | null>(null);
  const [vieneuEnv, setVieneuEnv] = useState<EnvStatus | null>(null);
  const [vieneuStatus, setVieneuStatus] = useState<VieNeuModelStatus | null>(null);
  const [vieneuConfigs, setVieneuConfigs] = useState<{ backbones?: Record<string, unknown>; codecs?: Record<string, unknown> } | null>(null);
  const [vieneuBackbone, setVieneuBackbone] = useState("");
  const [vieneuCodec, setVieneuCodec] = useState("");
  const [vieneuProgress, setVieneuProgress] = useState<ProgressData | null>(null);
  const [whisperEnv, setWhisperEnv] = useState<EnvStatus | null>(null);
  const [whisperStatus, setWhisperStatus] = useState<WhisperModelStatus | null>(null);
  const [whisperModel, setWhisperModel] = useState<(typeof WHISPER_MODELS)[number]>("large-v3");
  const [whisperProgress, setWhisperProgress] = useState<ProgressData | null>(null);
  const [bgRemoveEnv, setBgRemoveEnv] = useState<EnvStatus | null>(null);
  const [bgRemoveStatus, setBgRemoveStatus] = useState<BgRemoveModelStatus | null>(null);
  const [bgRemoveProgress, setBgRemoveProgress] = useState<ProgressData | null>(null);
  const [translationEnv, setTranslationEnv] = useState<EnvStatus | null>(null);
  const [translationModelStatus, setTranslationModelStatus] = useState<TranslationModelStatus | null>(null);
  const [translationProgress, setTranslationProgress] = useState<ProgressData | null>(null);
  const [imageFinderEnv, setImageFinderEnv] = useState<EnvStatus | null>(null);
  const [imageFinderProgress, setImageFinderProgress] = useState<ProgressData | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [logsServerUnreachable, setLogsServerUnreachable] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const {
    services,
    supported: servicesSupported,
    loading: servicesLoading,
    refresh: refreshServices,
    start: startService,
    stop: stopService,
    isBusy: isServiceBusy,
  } = useManagedServices();
  const toolLabelMap: Record<string, I18nKey> = {
    "yt-dlp": "settings.tools.item.yt-dlp",
    "ffmpeg": "settings.tools.item.ffmpeg",
    "torch": "settings.tools.item.torch",
  };

  const getManagedServiceStatusText = (status: string) => {
    switch (status) {
      case "running":
        return "Running";
      case "starting":
        return "Starting";
      case "stopping":
        return "Stopping";
      case "stopped":
        return "Stopped";
      case "not_configured":
        return "Venv missing";
      case "error":
        return "Error";
      default:
        return status;
    }
  };

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${APP_API_URL}/api/v1/status`);
      if (!response.ok) {
        throw new Error("Failed to load status");
      }
      const data = (await response.json()) as SystemStatus;
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogTail = async () => {
    try {
      const res = await fetch(`${APP_API_URL}/api/v1/logs/tail?lines=200`);
      const data = (await res.json()) as { lines?: string[] };
      setLogs(data.lines || []);
      setLogsServerUnreachable(false);
    } catch {
      setLogs([]);
      setLogsServerUnreachable(true);
    }
  };

  const fetchTools = async () => {
    try {
      const response = await fetch(`${APP_API_URL}/api/v1/tools/status`);
      if (!response.ok) {
        throw new Error("Failed to load tools");
      }
      const data = (await response.json()) as SystemStatus["tools"];
      const rows: ToolRow[] = [
        {
          id: "yt-dlp",
          name: "yt-dlp",
          status: data?.yt_dlp?.installed ? "ready" : "not_ready",
          path: data?.yt_dlp?.path ?? null,
          can_install: true,
        },
        {
          id: "ffmpeg",
          name: "ffmpeg",
          status: data?.ffmpeg?.installed ? "ready" : "not_ready",
          path: data?.ffmpeg?.path ?? null,
          can_install: true,
        },
        {
          id: "torch",
          name: "torch",
          status: data?.torch?.installed ? "ready" : "not_ready",
          path: data?.torch?.path ?? null,
          can_install: true,
        },
      ];
      setTools(rows);
    } catch {
      setTools([]);
    }
  };

  const handleInstall = async (toolId: string) => {
    setToolProgress((prev) => ({ ...prev, [toolId]: { status: "starting", percent: 0, message: t("settings.tools.installing") } }));
    try {
      const res = await fetch(`${APP_API_URL}/api/v1/tools/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: toolId }),
      });
      await consumeSseStream(res, (data) => {
        setToolProgress((prev) => ({ ...prev, [toolId]: data }));
      });
    } catch {
      setToolProgress((prev) => ({ ...prev, [toolId]: { status: "error", percent: 0, message: t("settings.tools.install_failed") } }));
    } finally {
      fetchStatus();
      fetchTools();
    }
  };

  const handleCleanup = async () => {
    await fetch(`${APP_API_URL}/api/v1/cache/temp`, { method: "DELETE" });
    await fetchStatus();
  };

  const fetchF5Status = async () => {
    try {
      const [envRes, statusRes] = await Promise.all([
        fetch(`${F5_API_URL}/api/v1/env/status`),
        fetch(`${F5_API_URL}/api/v1/status`),
      ]);
      if (!envRes.ok || !statusRes.ok) throw new Error("F5 status failed");
      const envData = (await envRes.json()) as EnvStatus;
      const statusData = (await statusRes.json()) as { models?: { f5_tts?: F5ModelStatus } };
      setF5Env(envData);
      setF5Model(statusData.models?.f5_tts ?? null);
    } catch {
      setF5Env(null);
      setF5Model(null);
    }
  };

  const handleF5EnvInstall = async () => {
    setF5Progress({ status: "starting", percent: 0, message: t("settings.f5.env_installing") });
    try {
      const res = await fetch(`${F5_API_URL}/api/v1/env/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("env install failed");
      setF5Progress({ status: "complete", percent: 100, message: t("settings.f5.env_installed") });
    } catch {
      setF5Progress({ status: "error", percent: 0, message: t("settings.f5.env_install_failed") });
    } finally {
      fetchF5Status();
    }
  };

  const handleF5DownloadModel = async () => {
    setF5Progress({ status: "starting", percent: 0, message: t("settings.f5.model_downloading") });
    try {
      const res = await fetch(`${F5_API_URL}/api/v1/models/download`, { method: "POST" });
      await consumeSseStream(res, (data) => setF5Progress(data));
    } catch {
      setF5Progress({ status: "error", percent: 0, message: t("settings.f5.model_download_failed") });
    } finally {
      fetchF5Status();
    }
  };

  const fetchVieneuStatus = async () => {
    try {
      const [envRes, statusRes, configRes] = await Promise.all([
        fetch(`${VIENEU_API_URL}/api/v1/env/status`),
        fetch(`${VIENEU_API_URL}/api/v1/status`),
        fetch(`${VIENEU_API_URL}/api/v1/models/configs`),
      ]);
      if (!envRes.ok || !statusRes.ok || !configRes.ok) throw new Error("VieNeu status failed");
      const envData = (await envRes.json()) as EnvStatus;
      const statusData = (await statusRes.json()) as { models?: { vieneu_tts?: VieNeuModelStatus } };
      const configData = (await configRes.json()) as { backbones?: Record<string, unknown>; codecs?: Record<string, unknown> };
      setVieneuEnv(envData);
      setVieneuStatus(statusData.models?.vieneu_tts ?? null);
      setVieneuConfigs(configData);
    } catch {
      setVieneuEnv(null);
      setVieneuStatus(null);
      setVieneuConfigs(null);
    }
  };

  const handleVieneuEnvInstall = async () => {
    setVieneuProgress({ status: "starting", percent: 0, message: t("settings.vieneu.env_installing") });
    try {
      const res = await fetch(`${VIENEU_API_URL}/api/v1/env/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("env install failed");
      setVieneuProgress({ status: "complete", percent: 100, message: t("settings.vieneu.env_installed") });
    } catch {
      setVieneuProgress({ status: "error", percent: 0, message: t("settings.vieneu.env_install_failed") });
    } finally {
      fetchVieneuStatus();
    }
  };

  const handleVieneuDownloadModel = async () => {
    if (!vieneuBackbone || !vieneuCodec) return;
    setVieneuProgress({ status: "starting", percent: 0, message: t("settings.vieneu.model_downloading") });
    try {
      const res = await fetch(`${VIENEU_API_URL}/api/v1/models/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backbone: vieneuBackbone, codec: vieneuCodec }),
      });
      await consumeSseStream(res, (data) => setVieneuProgress(data));
    } catch {
      setVieneuProgress({ status: "error", percent: 0, message: t("settings.vieneu.model_download_failed") });
    } finally {
      fetchVieneuStatus();
    }
  };

  const handleVieneuLoadModel = async () => {
    if (!vieneuBackbone || !vieneuCodec) return;
    setVieneuProgress({ status: "starting", percent: 0, message: t("settings.vieneu.model_loading") });
    try {
      const res = await fetch(`${VIENEU_API_URL}/api/v1/models/load`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backbone: vieneuBackbone, codec: vieneuCodec }),
      });
      await consumeSseStream(res, (data) => setVieneuProgress(data));
    } catch {
      setVieneuProgress({ status: "error", percent: 0, message: t("settings.vieneu.model_load_failed") });
    } finally {
      fetchVieneuStatus();
    }
  };

  const handleVieneuUnloadModel = async () => {
    try {
      await fetch(`${VIENEU_API_URL}/api/v1/models/unload`, { method: "POST" });
    } finally {
      fetchVieneuStatus();
    }
  };

  const fetchWhisperStatus = async () => {
    try {
      const [envRes, statusRes] = await Promise.all([
        fetch(`${WHISPER_API_URL}/api/v1/env/status`),
        fetch(`${WHISPER_API_URL}/api/v1/status`),
      ]);
      if (!envRes.ok || !statusRes.ok) throw new Error("Whisper status failed");
      const envData = (await envRes.json()) as EnvStatus;
      const statusData = (await statusRes.json()) as { models?: { whisper?: WhisperModelStatus } };
      setWhisperEnv(envData);
      setWhisperStatus(statusData.models?.whisper ?? null);
    } catch {
      setWhisperEnv(null);
      setWhisperStatus(null);
    }
  };

  const handleWhisperEnvInstall = async () => {
    setWhisperProgress({ status: "starting", percent: 0, message: t("settings.whisper.env_installing") });
    try {
      const res = await fetch(`${WHISPER_API_URL}/api/v1/env/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("env install failed");
      setWhisperProgress({ status: "complete", percent: 100, message: t("settings.whisper.env_installed") });
    } catch {
      setWhisperProgress({ status: "error", percent: 0, message: t("settings.whisper.env_install_failed") });
    } finally {
      fetchWhisperStatus();
    }
  };

  const handleWhisperDownloadModel = async () => {
    setWhisperProgress({ status: "starting", percent: 0, message: t("settings.whisper.model_downloading") });
    try {
      const res = await fetch(`${WHISPER_API_URL}/api/v1/models/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: whisperModel }),
      });
      await consumeSseStream(res, (data) => setWhisperProgress(data));
    } catch {
      setWhisperProgress({ status: "error", percent: 0, message: t("settings.whisper.model_download_failed") });
    } finally {
      fetchWhisperStatus();
    }
  };

  const fetchBgRemoveStatus = async () => {
    try {
      const [envRes, statusRes] = await Promise.all([
        fetch(`${BGREMOVE_API_URL}/api/v1/env/status`),
        fetch(`${BGREMOVE_API_URL}/api/v1/status`),
      ]);
      if (!envRes.ok || !statusRes.ok) throw new Error("Background removal status failed");
      const envData = (await envRes.json()) as EnvStatus;
      const statusData = (await statusRes.json()) as { models?: { background_removal?: BgRemoveModelStatus } };
      setBgRemoveEnv(envData);
      setBgRemoveStatus(statusData.models?.background_removal ?? null);
    } catch {
      setBgRemoveEnv(null);
      setBgRemoveStatus(null);
    }
  };

  const fetchImageFinderStatus = async () => {
    try {
      const res = await fetch(`${IMAGE_FINDER_API_URL}/api/v1/env/status`);
      if (!res.ok) throw new Error("ImageFinder status failed");
      setImageFinderEnv((await res.json()) as EnvStatus);
    } catch {
      setImageFinderEnv(null);
    }
  };

  const handleImageFinderEnvInstall = async () => {
    setImageFinderProgress({ status: "starting", percent: 0, message: "Installing ImageFinder environment..." });
    try {
      const res = await fetch(`${IMAGE_FINDER_API_URL}/api/v1/env/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Environment install failed");
      setImageFinderProgress({ status: "complete", percent: 100, message: "ImageFinder environment installed" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Environment install failed";
      setImageFinderProgress({ status: "error", percent: 0, message });
    } finally {
      void fetchImageFinderStatus();
    }
  };

  const fetchTranslationStatus = async () => {
    try {
      const [envRes, modelRes] = await Promise.all([
        fetch(`${TRANSLATION_API_URL}/api/v1/env/status`),
        fetch(`${TRANSLATION_API_URL}/api/v1/translation/status`),
      ]);
      if (!envRes.ok || !modelRes.ok) throw new Error("Translation status failed");
      setTranslationEnv((await envRes.json()) as EnvStatus);
      setTranslationModelStatus((await modelRes.json()) as TranslationModelStatus);
    } catch {
      setTranslationEnv(null);
      setTranslationModelStatus(null);
    }
  };

  const handleTranslationEnvInstall = async () => {
    setTranslationProgress({ status: "starting", percent: 0, message: "Installing translation environment..." });
    try {
      const res = await fetch(`${TRANSLATION_API_URL}/api/v1/env/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Environment install failed");
      setTranslationProgress({ status: "complete", percent: 100, message: "Translation environment installed" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Environment install failed";
      setTranslationProgress({ status: "error", percent: 0, message });
    } finally {
      void fetchTranslationStatus();
    }
  };

  const handleTranslationDownloadModel = async () => {
    setTranslationProgress({ status: "starting", percent: 0, message: "Downloading Tencent HY-MT model..." });
    try {
      const res = await fetch(`${TRANSLATION_API_URL}/api/v1/translation/download`, { method: "POST" });
      if (!res.ok) throw new Error("Download request failed");
      await consumeSseStream(res, (data) => setTranslationProgress(data));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Download failed";
      setTranslationProgress({ status: "error", percent: 0, message });
    } finally {
      void fetchTranslationStatus();
    }
  };

  const handleTranslationUnloadModel = async () => {
    try {
      await fetch(`${TRANSLATION_API_URL}/api/v1/translation/unload`, { method: "POST" });
    } finally {
      void fetchTranslationStatus();
    }
  };

  const handleBgRemoveEnvInstall = async () => {
    setBgRemoveProgress({ status: "starting", percent: 0, message: t("settings.bgremove.env_installing") });
    try {
      const res = await fetch(`${BGREMOVE_API_URL}/api/v1/env/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("env install failed");
      setBgRemoveProgress({ status: "complete", percent: 100, message: t("settings.bgremove.env_installed") });
    } catch {
      setBgRemoveProgress({ status: "error", percent: 0, message: t("settings.bgremove.env_install_failed") });
    } finally {
      fetchBgRemoveStatus();
    }
  };

  useEffect(() => {
    if (!vieneuConfigs) return;
    const backbones = Object.keys(vieneuConfigs.backbones || {});
    const codecs = Object.keys(vieneuConfigs.codecs || {});
    if (!vieneuBackbone && backbones.length > 0) setVieneuBackbone(backbones[0]);
    if (!vieneuCodec && codecs.length > 0) setVieneuCodec(codecs[0]);
  }, [vieneuConfigs, vieneuBackbone, vieneuCodec]);

  useEffect(() => {
    fetchStatus();
    fetchTools();
    fetchF5Status();
    fetchVieneuStatus();
    fetchWhisperStatus();
    fetchBgRemoveStatus();
    fetchTranslationStatus();
    fetchImageFinderStatus();
    refreshServices();
    fetchLogTail();
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    if (logsServerUnreachable) {
      setIsStreaming(false);
      return;
    }
    const es = new EventSource(`${APP_API_URL}/api/v1/logs/stream`);
    setIsStreaming(true);
    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as LogLine;
        if (!payload.line) return;
        setLogs((prev) => {
          const next = [...prev, payload.line];
          return next.length > 400 ? next.slice(-400) : next;
        });
      } catch {
        // ignore
      }
    };
    es.onerror = () => {
      es.close();
      setIsStreaming(false);
      setLogsServerUnreachable(true);
    };
    return () => {
      es.close();
      setIsStreaming(false);
    };
  }, [logsServerUnreachable]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">{t("settings.title")}</h2>
        <p className="text-muted-foreground">{t("settings.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.language.title")}</CardTitle>
          <CardDescription>{t("settings.language.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button onClick={() => setLanguage(language === "en" ? "vi" : "en")}>
            {language === "en" ? t("settings.language.vi") : t("settings.language.en")}
          </Button>
        </CardContent>
      </Card>

      <StorageLocationsCard />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Backend Services</CardTitle>
              <CardDescription>Start and stop FastAPI services manually from Electron</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={refreshServices} disabled={servicesLoading}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!servicesSupported ? (
            <div className="text-sm text-muted-foreground">
              Service controls are available in the Electron desktop app.
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("settings.tools.table.tool")}</TableHead>
                    <TableHead>{t("settings.tools.table.status")}</TableHead>
                    <TableHead>API</TableHead>
                    <TableHead>{t("settings.tools.table.path")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {services.map((service) => {
                    const serviceId = service.id;
                    if (!isManagedServiceId(serviceId)) {
                      return null;
                    }
                    const running = service.status === "running";
                    const busy = isServiceBusy(serviceId);
                    const actionDisabled = busy || service.status === "not_configured";
                    return (
                      <TableRow key={serviceId}>
                        <TableCell className="font-medium">
                          {MANAGED_SERVICE_LABELS[service.id] || service.name}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {running ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : service.status === "starting" || service.status === "stopping" ? (
                              <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-500" />
                            )}
                            <span className="text-sm">{getManagedServiceStatusText(service.status)}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="ml-2"
                              disabled={actionDisabled}
                              onClick={() => {
                                if (running) {
                                  stopService(serviceId);
                                  return;
                                }
                                startService(serviceId);
                              }}
                            >
                              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                              {running ? t("tool.common.stop_server") : t("tool.common.start_server")}
                            </Button>
                          </div>
                          {service.error ? <div className="text-xs text-red-500 mt-1">{service.error}</div> : null}
                        </TableCell>
                        <TableCell className="text-xs font-mono break-all">{service.api_url}</TableCell>
                        <TableCell className="text-xs font-mono break-all">{service.venv_python_path || "--"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Image Finder</CardTitle>
              <CardDescription>Search engine dependencies — DuckDuckGo, Selenium, Unsplash, and Pillow.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => { void fetchImageFinderStatus(); }}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings.tools.table.tool")}</TableHead>
                  <TableHead>{t("settings.tools.table.status")}</TableHead>
                  <TableHead>{t("settings.tools.table.path")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Environment</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {imageFinderEnv?.installed ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      <span className="text-sm">
                        {imageFinderEnv?.installed ? t("settings.tools.status.ready") : t("settings.tools.status.not_ready")}
                      </span>
                      {!imageFinderEnv?.installed && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { void handleImageFinderEnvInstall(); }}
                          disabled={imageFinderProgress?.status === "starting"}
                          className="ml-2"
                        >
                          {imageFinderProgress?.status === "starting" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                          Install Environment
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono break-all">
                    {imageFinderEnv?.installed_modules?.length
                      ? imageFinderEnv.installed_modules.join(", ")
                      : imageFinderEnv?.missing?.length
                        ? imageFinderEnv.missing.join(", ")
                        : "--"}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          {imageFinderProgress && (
            <div className="text-xs text-muted-foreground">
              {imageFinderProgress.message} {imageFinderProgress.percent ?? 0}%
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("settings.bgremove.title")}</CardTitle>
              <CardDescription>{t("settings.bgremove.desc")}</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchBgRemoveStatus}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings.tools.table.tool")}</TableHead>
                  <TableHead>{t("settings.tools.table.status")}</TableHead>
                  <TableHead>{t("settings.tools.table.path")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">{t("settings.bgremove.env_status")}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {bgRemoveEnv?.installed ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      <span className="text-sm">
                        {bgRemoveEnv?.installed ? t("settings.tools.status.ready") : t("settings.tools.status.not_ready")}
                      </span>
                      {!bgRemoveEnv?.installed && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleBgRemoveEnvInstall}
                          disabled={bgRemoveProgress?.status === "starting"}
                          className="ml-2"
                        >
                          {bgRemoveProgress?.status === "starting" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                          {t("settings.bgremove.install_env")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono break-all">
                    {bgRemoveEnv?.installed_modules?.length
                      ? bgRemoveEnv.installed_modules.join(", ")
                      : bgRemoveEnv?.missing?.length
                        ? bgRemoveEnv.missing.join(", ")
                        : "--"}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">{t("settings.bgremove.model_status")}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {bgRemoveStatus?.model_loading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                      ) : bgRemoveStatus?.model_loaded ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      <span className="text-sm">
                        {bgRemoveStatus?.model_loading
                          ? t("settings.bgremove.model_loading")
                          : bgRemoveStatus?.model_loaded
                            ? t("settings.tools.status.ready")
                            : t("settings.tools.status.not_ready")}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono break-all">
                    {bgRemoveStatus
                      ? `${bgRemoveStatus.model_id || "BiRefNet"} (${bgRemoveStatus.device || "cpu"})${
                          bgRemoveStatus.model_error ? ` - ${bgRemoveStatus.model_error}` : ""
                        }`
                      : "--"}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          {bgRemoveProgress && (
            <div className="text-xs text-muted-foreground">
              {bgRemoveProgress.message} {bgRemoveProgress.percent ?? 0}%
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("settings.tools.title")}</CardTitle>
              <CardDescription>{t("settings.tools.desc")}</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchStatus();
                fetchTools();
                fetchF5Status();
                fetchVieneuStatus();
                fetchWhisperStatus();
                fetchBgRemoveStatus();
                refreshServices();
              }}
              disabled={loading}
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings.tools.table.tool")}</TableHead>
                  <TableHead>{t("settings.tools.table.status")}</TableHead>
                  <TableHead>{t("settings.tools.table.path")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tools.map((tool) => {
                  const progress = toolProgress[tool.id];
                  const isInstalling = !!progress && !["complete", "error"].includes(progress.status);
                  const ready = tool.status === "ready" && !isInstalling;
                  return (
                    <TableRow key={tool.id}>
                      <TableCell className="font-medium">{t(toolLabelMap[tool.id] || "settings.tools.item.unknown")}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {ready ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500" />
                          )}
                          <span className="text-sm">
                            {isInstalling
                              ? `${progress?.message || t("settings.tools.installing")} ${progress?.percent ?? 0}%`
                              : ready
                              ? t("settings.tools.status.ready")
                              : t("settings.tools.status.not_ready")}
                          </span>
                          {!ready && tool.can_install && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleInstall(tool.id)}
                              disabled={isInstalling}
                              className="ml-2"
                            >
                              {isInstalling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                              {t("settings.tools.download")}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-mono break-all">{tool.path || "--"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("settings.f5.title")}</CardTitle>
              <CardDescription>{t("settings.f5.desc")}</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchF5Status}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings.tools.table.tool")}</TableHead>
                  <TableHead>{t("settings.tools.table.status")}</TableHead>
                  <TableHead>{t("settings.tools.table.path")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">{t("settings.f5.env_status")}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {f5Env?.installed ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      <span className="text-sm">
                        {f5Env?.installed ? t("settings.tools.status.ready") : t("settings.tools.status.not_ready")}
                      </span>
                      {!f5Env?.installed && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleF5EnvInstall}
                          disabled={f5Progress?.status === "starting"}
                          className="ml-2"
                        >
                          {f5Progress?.status === "starting" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                          {t("settings.f5.install_env")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono break-all">
                    {f5Env?.installed_modules?.length
                      ? f5Env.installed_modules.join(", ")
                      : f5Env?.missing?.length
                      ? f5Env.missing.join(", ")
                      : "--"}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">{t("settings.f5.model_status")}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {f5Model?.installed ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      <span className="text-sm">
                        {f5Model?.installed ? t("settings.tools.status.ready") : t("settings.tools.status.not_ready")}
                      </span>
                      {!f5Model?.installed && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleF5DownloadModel}
                          disabled={f5Progress?.status === "starting"}
                          className="ml-2"
                        >
                          {f5Progress?.status === "starting" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                          {t("settings.f5.download_model")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono break-all">
                    {f5Model?.model_file || "--"}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          {f5Progress && (
            <div className="text-xs text-muted-foreground">
              {f5Progress.message} {f5Progress.percent ?? 0}%
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("settings.vieneu.title")}</CardTitle>
              <CardDescription>{t("settings.vieneu.desc")}</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchVieneuStatus}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings.tools.table.tool")}</TableHead>
                  <TableHead>{t("settings.tools.table.status")}</TableHead>
                  <TableHead>{t("settings.tools.table.path")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">{t("settings.vieneu.env_status")}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {vieneuEnv?.installed ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      <span className="text-sm">
                        {vieneuEnv?.installed ? t("settings.tools.status.ready") : t("settings.tools.status.not_ready")}
                      </span>
                      {!vieneuEnv?.installed && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleVieneuEnvInstall}
                          disabled={vieneuProgress?.status === "starting"}
                          className="ml-2"
                        >
                          {vieneuProgress?.status === "starting" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                          {t("settings.vieneu.install_env")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono break-all">
                    {vieneuEnv?.installed_modules?.length
                      ? vieneuEnv.installed_modules.join(", ")
                      : vieneuEnv?.missing?.length
                      ? vieneuEnv.missing.join(", ")
                      : "--"}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">{t("settings.vieneu.model_status")}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {vieneuStatus?.backbone_ready && vieneuStatus?.codec_ready ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      <span className="text-sm">
                        {vieneuStatus?.backbone_ready && vieneuStatus?.codec_ready
                          ? t("settings.tools.status.ready")
                          : t("settings.tools.status.not_ready")}
                      </span>
                      {vieneuStatus?.model_loaded && (
                        <span className="ml-2 text-xs text-green-600">({t("settings.vieneu.model_loaded")})</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono break-all">
                    {vieneuStatus?.backbone_dir && vieneuStatus?.codec_dir
                      ? `Backbone: ${vieneuStatus.backbone_dir}, Codec: ${vieneuStatus.codec_dir}`
                      : "--"}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase">{t("settings.vieneu.backbone")}</label>
              <Select value={vieneuBackbone} onValueChange={setVieneuBackbone}>
                <SelectTrigger>
                  <SelectValue placeholder={t("settings.vieneu.select_backbone")} />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(vieneuConfigs?.backbones || {}).map((id) => (
                    <SelectItem key={id} value={id}>
                      {id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase">{t("settings.vieneu.codec")}</label>
              <Select value={vieneuCodec} onValueChange={setVieneuCodec}>
                <SelectTrigger>
                  <SelectValue placeholder={t("settings.vieneu.select_codec")} />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(vieneuConfigs?.codecs || {}).map((id) => (
                    <SelectItem key={id} value={id}>
                      {id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={handleVieneuDownloadModel}
              disabled={!vieneuBackbone || !vieneuCodec || vieneuProgress?.status === "starting"}
            >
              {vieneuProgress?.status === "starting" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {t("settings.vieneu.download_model")}
            </Button>
            <Button
              variant="outline"
              onClick={handleVieneuLoadModel}
              disabled={!vieneuBackbone || !vieneuCodec || vieneuProgress?.status === "starting"}
            >
              {t("settings.vieneu.load_model")}
            </Button>
            <Button variant="outline" onClick={handleVieneuUnloadModel}>
              {t("settings.vieneu.unload_model")}
            </Button>
          </div>

          {vieneuProgress && (
            <div className="text-xs text-muted-foreground">
              {vieneuProgress.message} {vieneuProgress.percent ?? 0}%
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("settings.whisper.title")}</CardTitle>
              <CardDescription>{t("settings.whisper.desc")}</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchWhisperStatus}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings.tools.table.tool")}</TableHead>
                  <TableHead>{t("settings.tools.table.status")}</TableHead>
                  <TableHead>{t("settings.tools.table.path")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">{t("settings.whisper.env_status")}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {whisperEnv?.installed ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      <span className="text-sm">
                        {whisperEnv?.installed ? t("settings.tools.status.ready") : t("settings.tools.status.not_ready")}
                      </span>
                      {!whisperEnv?.installed && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleWhisperEnvInstall}
                          disabled={whisperProgress?.status === "starting"}
                          className="ml-2"
                        >
                          {whisperProgress?.status === "starting" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                          {t("settings.whisper.install_env")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono break-all">
                    {whisperEnv?.installed_modules?.length
                      ? whisperEnv.installed_modules.join(", ")
                      : whisperEnv?.missing?.length
                      ? whisperEnv.missing.join(", ")
                      : "--"}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">{t("settings.whisper.model_cache")}</TableCell>
                  <TableCell>
                    <div className="text-sm text-muted-foreground">
                      {whisperStatus?.cached_models?.length ? whisperStatus.cached_models.join(", ") : t("settings.whisper.no_models")}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono break-all">
                    {whisperStatus?.model_dir || "--"}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase">{t("settings.whisper.model_select")}</label>
            <Select value={whisperModel} onValueChange={(v) => setWhisperModel(v as (typeof WHISPER_MODELS)[number])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WHISPER_MODELS.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={handleWhisperDownloadModel}
              disabled={whisperProgress?.status === "starting"}
            >
              {whisperProgress?.status === "starting" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {t("settings.whisper.download_model")}
            </Button>
          </div>

          {whisperProgress && (
            <div className="text-xs text-muted-foreground">
              {whisperProgress.message} {whisperProgress.percent ?? 0}%
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Translation Model</CardTitle>
              <CardDescription>Tencent HY-MT1.5-1.8B — multilingual translation model used by the pipeline.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => { void fetchTranslationStatus(); }}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings.tools.table.tool")}</TableHead>
                  <TableHead>{t("settings.tools.table.status")}</TableHead>
                  <TableHead>{t("settings.tools.table.path")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Environment</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {translationEnv?.installed ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      <span className="text-sm">
                        {translationEnv?.installed ? t("settings.tools.status.ready") : t("settings.tools.status.not_ready")}
                      </span>
                      {!translationEnv?.installed && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { void handleTranslationEnvInstall(); }}
                          disabled={translationProgress?.status === "starting"}
                          className="ml-2"
                        >
                          {translationProgress?.status === "starting" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                          Install Environment
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono break-all">
                    {translationEnv?.installed_modules?.length
                      ? translationEnv.installed_modules.join(", ")
                      : translationEnv?.missing?.length
                        ? translationEnv.missing.join(", ")
                        : "--"}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">{t("tool.image_finder.model")}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {translationModelStatus?.loaded || translationModelStatus?.downloaded ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      <span className="text-sm">
                        {translationModelStatus?.loaded
                          ? t("settings.tools.status.ready")
                          : translationModelStatus?.downloaded
                            ? t("settings.tools.status.ready")
                            : t("settings.tools.status.not_ready")}
                      </span>
                      {translationModelStatus?.device && (
                        <span className="text-xs text-muted-foreground ml-1">({translationModelStatus.device})</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono break-all">
                    {translationModelStatus?.model_dir || translationModelStatus?.model_id || "--"}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => { void handleTranslationDownloadModel(); }}
              disabled={translationProgress?.status === "starting" || !translationEnv?.installed}
            >
              {translationProgress?.status === "starting" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Download / Load Model
            </Button>
            <Button
              variant="outline"
              onClick={() => { void handleTranslationUnloadModel(); }}
              disabled={!translationModelStatus?.loaded}
            >
              Unload Model
            </Button>
          </div>

          {translationProgress && (
            <div className="text-xs text-muted-foreground">
              {translationProgress.message} {translationProgress.percent ?? 0}%
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("settings.storage.title")}</CardTitle>
              <CardDescription>{t("settings.storage.desc")}</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchStatus} disabled={loading}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-muted/40 rounded-lg p-4">
              <div className="text-sm text-muted-foreground mb-1">{t("settings.storage.total_files")}</div>
              <div className="text-2xl font-bold">{status?.temp?.file_count ?? 0}</div>
            </div>
            <div className="bg-muted/40 rounded-lg p-4">
              <div className="text-sm text-muted-foreground mb-1">{t("settings.storage.used")}</div>
              <div className="text-2xl font-bold">{status?.temp?.total_size_mb ?? 0} MB</div>
            </div>
            <div className="bg-muted/40 rounded-lg p-4">
              <div className="text-sm text-muted-foreground mb-1">{t("settings.storage.location")}</div>
              <div className="text-xs font-mono break-all">{status?.temp?.temp_dir ?? "--"}</div>
            </div>
          </div>

          <Button variant="destructive" className="w-full" onClick={handleCleanup}>
            {t("settings.cleanup.title")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("tool.backend_console.logs")}</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {isStreaming ? t("tool.backend_console.streaming") : t("tool.backend_console.paused")}
              </span>
              <Button size="sm" variant="outline" onClick={fetchLogTail}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div
            ref={logRef}
            className="h-72 overflow-y-auto rounded-xl border border-border bg-black/90 text-zinc-100 p-3 font-mono text-xs"
          >
            {logs.length === 0 ? (
              <div className="text-muted-foreground">{t("tool.backend_console.no_logs")}</div>
            ) : (
              logs.map((line, idx) => <div key={idx}>{line}</div>)
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
