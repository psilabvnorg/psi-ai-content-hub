import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, CheckCircle, XCircle, Loader2, FolderOpen, Copy, Check, AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { APP_API_URL, F5_API_URL } from "@/lib/api";
import { useI18n } from "@/i18n/i18n";
import { useManagedServices } from "@/hooks/useManagedServices";

type LogLine = { line: string };

type SystemStatus = {
  status: string;
  base_app_dir?: string;
  temp?: { temp_dir: string; file_count: number; total_size_mb: number };
  tools?: {
    ffmpeg?: { installed: boolean; path?: string | null };
    yt_dlp?: { installed: boolean; path?: string | null };
    torch?: { installed: boolean; version?: string | null; cuda?: string | null; path?: string | null };
  };
};

type ToolsStatus = {
  ffmpeg?: { installed: boolean; path?: string | null };
  yt_dlp?: { installed: boolean; path?: string | null };
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
  model_downloaded?: boolean;
  model_error?: string | null;
  device?: "cuda" | "cpu";
};

type F5ModelStatus = {
  installed?: boolean;
  model_dir?: string | null;
  model_file?: string | null;
  vocab_file?: string | null;
};

type F5StatusData = {
  server_unreachable?: boolean;
  env?: EnvStatus;
  models?: {
    vi?: F5ModelStatus;
    en?: F5ModelStatus;
  };
};

type F5Language = "vi" | "en";

const F5_MODEL_DEFAULT_PATHS: Record<F5Language, string> = {
  vi: "C:\\Users\\ADMIN\\AppData\\Roaming\\psi-ai-content-hub\\models\\f5-tts-vn",
  en: "C:\\Users\\ADMIN\\AppData\\Roaming\\psi-ai-content-hub\\models\\f5-tts-en",
};

type TranslationModelStatus = {
  loaded?: boolean;
  downloaded?: boolean;
  model_id?: string;
  model_dir?: string | null;
  device?: string | null;
  supported_languages?: Record<string, string>;
};

type aprofile_status_envelope_data = {
  profile_status?: {
    installed?: boolean;
    missing_modules?: string[];
    installed_modules?: string[];
    python_path?: string;
  };
};

function aextract_env_status_data(payload: EnvStatus | aprofile_status_envelope_data): EnvStatus {
  if ("profile_status" in payload) {
    const profileStatus = payload.profile_status ?? {};
    return {
      installed: profileStatus.installed === true,
      missing: profileStatus.missing_modules ?? [],
      installed_modules: profileStatus.installed_modules ?? [],
      python_path: profileStatus.python_path,
    };
  }
  return payload as EnvStatus;
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

function getStoragePaths(baseAppDir: string | null, tempDir: string | null, t: (key: string) => string) {
  return [
    {
      label: t("settings.storage_locations.model_log_path"),
      path: baseAppDir ?? "--",
    },
    {
      label: t("settings.storage_locations.temp_path"),
      path: tempDir ?? "--",
    },
  ];
}

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
  const { t } = useI18n();
  const [baseAppDir, setBaseAppDir] = useState<string | null>(null);
  const [tempDir, setTempDir] = useState<string | null>(null);

  useEffect(() => {
    const w = window as unknown as { electronAPI?: { getAppPaths?: () => Promise<{ baseAppDir: string; tempDir: string }> } };
    if (w.electronAPI?.getAppPaths) {
      void w.electronAPI.getAppPaths().then((paths) => {
        setBaseAppDir(paths.baseAppDir);
        setTempDir(paths.tempDir);
      });
    }
  }, []);

  const paths = getStoragePaths(baseAppDir, tempDir, t);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          {t("settings.storage_locations.title")}
        </CardTitle>
        <CardDescription>{t("settings.storage_locations.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {paths.map(({ label, path }) => (
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

type OllamaStatus = {
  status: string;
  connected: boolean;
  url: string;
  default_model: string;
  models: string[];
};

function OllamaSettingsCard() {
  const { t } = useI18n();
  const [url, setUrl] = useState("");
  const [model, setModel] = useState("");
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${APP_API_URL}/api/v1/llm/config`);
      if (!res.ok) return;
      const data = await res.json() as { url: string; model: string };
      setUrl(data.url || "");
      setModel(data.model || "");
    } catch {
      // ignore
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setStatus(null);
    try {
      const res = await fetch(`${APP_API_URL}/api/v1/llm/status`);
      if (!res.ok) throw new Error("unreachable");
      const data = await res.json() as OllamaStatus;
      setStatus(data);
    } catch {
      setStatus({ status: "unreachable", connected: false, url: "", default_model: "", models: [] });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus("idle");
    try {
      const res = await fetch(`${APP_API_URL}/api/v1/llm/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() || undefined, model: model.trim() || undefined }),
      });
      if (!res.ok) throw new Error("save failed");
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    void fetchConfig();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.ollama.title")}</CardTitle>
        <CardDescription>{t("settings.ollama.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted-foreground uppercase">
              {t("settings.ollama.url")}
            </label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t("settings.ollama.url_placeholder")}
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted-foreground uppercase">
              {t("settings.ollama.model")}
            </label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={t("settings.ollama.model_placeholder")}
              className="font-mono text-sm"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleTest} disabled={testing}>
            {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            {t("settings.ollama.test")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : saveStatus === "saved" ? (
              <Check className="w-4 h-4 mr-2 text-green-500" />
            ) : null}
            {saveStatus === "saved" ? t("settings.ollama.saved") : t("settings.ollama.save")}
          </Button>
        </div>

        {saveStatus === "error" && (
          <p className="text-xs text-destructive">{t("settings.ollama.save_failed")}</p>
        )}

        {status && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5 text-sm">
            <div className="flex items-center gap-2">
              {status.connected ? (
                <CheckCircle className="w-4 h-4 text-green-500" />
              ) : (
                <XCircle className="w-4 h-4 text-destructive" />
              )}
              <span className="font-medium">
                {status.connected ? t("settings.ollama.connected") : t("settings.ollama.unreachable")}
              </span>
            </div>
            {status.connected && status.models.length > 0 && (
              <div className="text-xs text-muted-foreground">
                <span className="font-semibold uppercase mr-1">{t("settings.ollama.models_label")}:</span>
                {status.models.join(", ")}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { t, language, setLanguage } = useI18n();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [whisperEnv, setWhisperEnv] = useState<EnvStatus | null>(null);
  const [whisperStatus, setWhisperStatus] = useState<WhisperModelStatus | null>(null);
  const [whisperProgress, setWhisperProgress] = useState<ProgressData | null>(null);
  const [bgRemoveEnv, setBgRemoveEnv] = useState<EnvStatus | null>(null);
  const [bgRemoveStatus, setBgRemoveStatus] = useState<BgRemoveModelStatus | null>(null);
  const [bgRemoveProgress, setBgRemoveProgress] = useState<ProgressData | null>(null);
  const [translationEnv, setTranslationEnv] = useState<EnvStatus | null>(null);
  const [translationModelStatus, setTranslationModelStatus] = useState<TranslationModelStatus | null>(null);
  const [translationProgress, setTranslationProgress] = useState<ProgressData | null>(null);
  const [imageFinderEnv, setImageFinderEnv] = useState<EnvStatus | null>(null);
  const [imageFinderProgress, setImageFinderProgress] = useState<ProgressData | null>(null);
  const [toolsStatus, setToolsStatus] = useState<ToolsStatus | null>(null);
  const [toolsProgress, setToolsProgress] = useState<Record<string, ProgressData>>({});
  const [envInstallAllActive, setEnvInstallAllActive] = useState(false);
  const [envInstallStep, setEnvInstallStep] = useState("");
  const [envInstallDoneCount, setEnvInstallDoneCount] = useState(0);
  const [serverStartProgress, setServerStartProgress] = useState(0);
  const serverStartTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [f5Status, setF5Status] = useState<F5StatusData | null>(null);
  const [f5ModelProgress, setF5ModelProgress] = useState<Partial<Record<F5Language, ProgressData>>>({});
  const [logs, setLogs] = useState<string[]>([]);
  const [logsServerUnreachable, setLogsServerUnreachable] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const {
    services,
    refresh: refreshServices,
    start: startService,
    stop: stopService,
    isBusy: isServiceBusy,
  } = useManagedServices();
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

  const handleCleanup = async () => {
    await fetch(`${APP_API_URL}/api/v1/cache/temp`, { method: "DELETE" });
    await fetchStatus();
  };

  const fetchWhisperStatus = async () => {
    try {
      const [envRes, statusRes] = await Promise.all([
        fetch(`${APP_API_URL}/api/v1/env/profiles/whisper/status`),
        fetch(`${APP_API_URL}/api/v1/whisper/status`),
      ]);
      if (envRes.ok) {
        setWhisperEnv(aextract_env_status_data((await envRes.json()) as EnvStatus | aprofile_status_envelope_data));
      } else {
        setWhisperEnv(null);
      }
      if (statusRes.ok) {
        const statusData = (await statusRes.json()) as { models?: { whisper?: WhisperModelStatus } };
        setWhisperStatus(statusData.models?.whisper ?? null);
      } else {
        setWhisperStatus(null);
      }
    } catch {
      setWhisperEnv(null);
      setWhisperStatus(null);
    }
  };

  const handleWhisperEnvInstall = async () => {
    setWhisperProgress({ status: "starting", percent: 0, message: t("settings.whisper.env_installing") });
    try {
      const res = await fetch(`${APP_API_URL}/api/v1/env/profiles/whisper/install`, {
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
      const res = await fetch(`${APP_API_URL}/api/v1/whisper/models/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "large-v3" }),
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
        fetch(`${APP_API_URL}/api/v1/env/profiles/bg-remove-overlay/status`),
        fetch(`${APP_API_URL}/api/v1/bg-remove-overlay/status`),
      ]);
      if (envRes.ok) {
        setBgRemoveEnv(aextract_env_status_data((await envRes.json()) as EnvStatus | aprofile_status_envelope_data));
      } else {
        setBgRemoveEnv(null);
      }
      if (statusRes.ok) {
        const statusData = (await statusRes.json()) as { models?: { background_removal?: BgRemoveModelStatus } };
        setBgRemoveStatus(statusData.models?.background_removal ?? null);
      } else {
        setBgRemoveStatus(null);
      }
    } catch {
      setBgRemoveEnv(null);
      setBgRemoveStatus(null);
    }
  };

  const fetchImageFinderStatus = async () => {
    try {
      const res = await fetch(`${APP_API_URL}/api/v1/env/profiles/image-search/status`);
      if (!res.ok) throw new Error("ImageFinder status failed");
      setImageFinderEnv(
        aextract_env_status_data((await res.json()) as EnvStatus | aprofile_status_envelope_data)
      );
    } catch {
      setImageFinderEnv(null);
    }
  };

  const fetchToolsStatus = async () => {
    try {
      const res = await fetch(`${APP_API_URL}/api/v1/tools/status`);
      if (!res.ok) throw new Error("tools status failed");
      setToolsStatus((await res.json()) as ToolsStatus);
    } catch {
      setToolsStatus(null);
    }
  };

  const handleInstallTool = async (toolId: string) => {
    setToolsProgress((prev) => ({ ...prev, [toolId]: { status: "starting", percent: 0, message: `Installing ${toolId}...` } }));
    try {
      const res = await fetch(`${APP_API_URL}/api/v1/tools/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: toolId }),
      });
      if (!res.ok) throw new Error("Install request failed");
      await consumeSseStream(res, (data) =>
        setToolsProgress((prev) => ({ ...prev, [toolId]: data }))
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Install failed";
      setToolsProgress((prev) => ({ ...prev, [toolId]: { status: "error", percent: 0, message } }));
    } finally {
      void fetchToolsStatus();
    }
  };

  const handleImageFinderEnvInstall = async () => {
    setImageFinderProgress({ status: "starting", percent: 0, message: "Installing ImageFinder environment..." });
    try {
      const res = await fetch(`${APP_API_URL}/api/v1/env/profiles/image-search/install`, {
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
        fetch(`${APP_API_URL}/api/v1/env/profiles/translation/status`),
        fetch(`${APP_API_URL}/api/v1/translation/status`),
      ]);
      if (envRes.ok) {
        setTranslationEnv(
          aextract_env_status_data((await envRes.json()) as EnvStatus | aprofile_status_envelope_data)
        );
      } else {
        setTranslationEnv(null);
      }
      if (modelRes.ok) {
        setTranslationModelStatus((await modelRes.json()) as TranslationModelStatus);
      } else {
        setTranslationModelStatus(null);
      }
    } catch {
      setTranslationEnv(null);
      setTranslationModelStatus(null);
    }
  };

  const handleTranslationEnvInstall = async () => {
    setTranslationProgress({ status: "starting", percent: 0, message: "Installing translation environment..." });
    try {
      const res = await fetch(`${APP_API_URL}/api/v1/env/profiles/translation/install`, {
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
      const res = await fetch(`${APP_API_URL}/api/v1/translation/download`, { method: "POST" });
      if (!res.ok) throw new Error("Download request failed");
      await consumeSseStream(res, (data) => setTranslationProgress(data));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Download failed";
      setTranslationProgress({ status: "error", percent: 0, message });
    } finally {
      void fetchTranslationStatus();
    }
  };

  const handleTranslationLoadModel = async () => {
    setTranslationProgress({ status: "starting", percent: 0, message: "Loading translation model..." });
    try {
      const res = await fetch(`${APP_API_URL}/api/v1/translation/load`, { method: "POST" });
      if (!res.ok) throw new Error("Load request failed");
      await consumeSseStream(res, (data) => setTranslationProgress(data));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Load failed";
      setTranslationProgress({ status: "error", percent: 0, message });
    } finally {
      void fetchTranslationStatus();
    }
  };

  const handleTranslationUnloadModel = async () => {
    try {
      await fetch(`${APP_API_URL}/api/v1/translation/unload`, { method: "POST" });
      setTranslationProgress(null);
    } catch {
      setTranslationProgress({ status: "error", percent: 0, message: "Failed to unload translation model" });
    } finally {
      void fetchTranslationStatus();
    }
  };

  const handleBgRemoveEnvInstall = async () => {
    setBgRemoveProgress({ status: "starting", percent: 0, message: t("settings.bgremove.env_installing") });
    try {
      const res = await fetch(`${APP_API_URL}/api/v1/env/profiles/bg-remove-overlay/install`, {
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

  const handleBgRemoveDownloadModel = async () => {
    setBgRemoveProgress({ status: "starting", percent: 0, message: "Downloading and loading background removal model..." });
    try {
      const response = await fetch(`${APP_API_URL}/api/v1/bg-remove-overlay/remove/download`, { method: "POST" });
      if (!response.ok) throw new Error("Model download request failed");
      const payload = (await response.json()) as { task_id?: string | null };
      if (!payload.task_id) {
        await fetchBgRemoveStatus();
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const stream = new EventSource(`${APP_API_URL}/api/v1/bg-remove-overlay/remove/stream/${payload.task_id}`);
        stream.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as ProgressData;
            setBgRemoveProgress(data);
            if (data.status === "complete") {
              stream.close();
              resolve();
              return;
            }
            if (data.status === "error") {
              stream.close();
              reject(new Error(data.message || "Model download failed"));
            }
          } catch {
            // Ignore parse errors for keep-alive events.
          }
        };
        stream.onerror = () => {
          stream.close();
          reject(new Error("Lost stream while downloading model"));
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Model download failed";
      setBgRemoveProgress({ status: "error", percent: 0, message });
    } finally {
      fetchBgRemoveStatus();
    }
  };

  const handleBgRemoveLoadModel = async () => {
    setBgRemoveProgress({ status: "starting", percent: 0, message: "Loading background removal model..." });
    try {
      const response = await fetch(`${APP_API_URL}/api/v1/bg-remove-overlay/remove/load`, { method: "POST" });
      if (!response.ok) throw new Error("Model load request failed");
      const payload = (await response.json()) as { task_id?: string | null };
      if (!payload.task_id) {
        await fetchBgRemoveStatus();
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const stream = new EventSource(`${APP_API_URL}/api/v1/bg-remove-overlay/remove/stream/${payload.task_id}`);
        stream.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as ProgressData;
            setBgRemoveProgress(data);
            if (data.status === "complete") {
              stream.close();
              resolve();
              return;
            }
            if (data.status === "error") {
              stream.close();
              reject(new Error(data.message || "Model load failed"));
            }
          } catch {
            // Ignore parse errors for keep-alive events.
          }
        };
        stream.onerror = () => {
          stream.close();
          reject(new Error("Lost stream while loading model"));
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Model load failed";
      setBgRemoveProgress({ status: "error", percent: 0, message });
    } finally {
      fetchBgRemoveStatus();
    }
  };

  const handleBgRemoveUnloadModel = async () => {
    try {
      await fetch(`${APP_API_URL}/api/v1/bg-remove-overlay/remove/unload`, { method: "POST" });
      setBgRemoveProgress({ status: "complete", percent: 100, message: "Background removal model unloaded" });
    } catch {
      setBgRemoveProgress({ status: "error", percent: 0, message: "Failed to unload background removal model" });
    } finally {
      fetchBgRemoveStatus();
    }
  };

  const handleInstallAllEnvs = async () => {
    setEnvInstallAllActive(true);
    setEnvInstallDoneCount(0);
    try {
      setEnvInstallStep("Whisper environment");
      await handleWhisperEnvInstall();
      setEnvInstallDoneCount(1);
      setEnvInstallStep("Translation environment");
      await handleTranslationEnvInstall();
      setEnvInstallDoneCount(2);
      setEnvInstallStep("Image search environment");
      await handleImageFinderEnvInstall();
      setEnvInstallDoneCount(3);
      setEnvInstallStep("Background removal environment");
      await handleBgRemoveEnvInstall();
      setEnvInstallDoneCount(4);
    } finally {
      setEnvInstallAllActive(false);
      setEnvInstallStep("");
      setWhisperProgress(null);
      setTranslationProgress(null);
      setBgRemoveProgress(null);
      setImageFinderProgress(null);
    }
  };

  const fetchF5Status = async () => {
    try {
      const [envRes, statusRes] = await Promise.all([
        fetch(`${F5_API_URL}/api/v1/env/status`),
        fetch(`${F5_API_URL}/api/v1/status`),
      ]);
      if (!envRes.ok || !statusRes.ok) throw new Error("status");
      const envData = (await envRes.json()) as EnvStatus;
      const statusData = (await statusRes.json()) as { models?: { f5_tts_vn?: F5ModelStatus; f5_tts_en?: F5ModelStatus } };
      setF5Status({
        server_unreachable: false,
        env: envData,
        models: {
          vi: statusData.models?.f5_tts_vn,
          en: statusData.models?.f5_tts_en,
        },
      });
    } catch {
      setF5Status({ server_unreachable: true });
    }
  };

  const isF5ModelDownloading = (language: F5Language) => {
    const status = f5ModelProgress[language]?.status;
    return status === "starting" || status === "downloading" || status === "installing";
  };

  const handleF5DownloadModel = async (language: F5Language) => {
    setF5ModelProgress((prev) => ({
      ...prev,
      [language]: { status: "starting", percent: 0, message: t("settings.f5.download_model") },
    }));
    try {
      const res = await fetch(`${F5_API_URL}/api/v1/models/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      });
      if (!res.ok) {
        throw new Error("Model download request failed");
      }
      await consumeSseStream(res, (data) =>
        setF5ModelProgress((prev) => ({
          ...prev,
          [language]: data,
        }))
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Model download failed";
      setF5ModelProgress((prev) => ({
        ...prev,
        [language]: { status: "error", percent: 0, message },
      }));
    } finally {
      void fetchF5Status();
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchWhisperStatus();
    fetchBgRemoveStatus();
    fetchTranslationStatus();
    fetchImageFinderStatus();
    fetchToolsStatus();
    fetchF5Status();
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

  const refreshAppApiSetup = () => {
    fetchWhisperStatus();
    fetchBgRemoveStatus();
    fetchTranslationStatus();
    fetchImageFinderStatus();
    fetchToolsStatus();
    refreshServices();
  };

  const appService = services.find((service) => service.id === "app");
  const appServiceRunning = appService?.status === "running";
  const appServiceBusy = appService ? isServiceBusy("app") : false;
  const f5Service = services.find((service) => service.id === "f5");
  const f5ServiceRunning = f5Service?.status === "running";
  const f5ServiceBusy = f5Service ? isServiceBusy("f5") : false;
  const whisperModelDownloaded = Boolean(whisperStatus?.cached_models?.length);
  const translationModelDownloaded = Boolean(translationModelStatus?.downloaded);
  const translationModelLoaded = Boolean(translationModelStatus?.loaded);
  const bgRemoveModelDownloaded = Boolean(bgRemoveStatus?.model_downloaded);
  const bgRemoveModelLoaded = Boolean(bgRemoveStatus?.model_loaded);

  const prevAppServiceRunning = useRef<boolean | null>(null);
  useEffect(() => {
    if (prevAppServiceRunning.current === false && appServiceRunning === true) {
      refreshAppApiSetup();
    }
    prevAppServiceRunning.current = appServiceRunning;
  }, [appServiceRunning]);

  const prevF5ServiceRunning = useRef<boolean | null>(null);
  useEffect(() => {
    if (prevF5ServiceRunning.current !== null && f5ServiceRunning !== prevF5ServiceRunning.current) {
      fetchF5Status();
    }
    prevF5ServiceRunning.current = f5ServiceRunning ?? null;
  }, [f5ServiceRunning]);

  // Simulated elapsed-time progress while App Server is starting
  useEffect(() => {
    const isStarting = appService?.status === "starting";
    if (isStarting) {
      setServerStartProgress(3);
      // Tick ~0.25%/s → reaches ~85% after 5 min (max before timeout)
      serverStartTimerRef.current = setInterval(() => {
        setServerStartProgress((prev) => Math.min(prev + 0.25, 88));
      }, 1000);
    } else {
      if (serverStartTimerRef.current) {
        clearInterval(serverStartTimerRef.current);
        serverStartTimerRef.current = null;
      }
      setServerStartProgress(0);
    }
    return () => {
      if (serverStartTimerRef.current) {
        clearInterval(serverStartTimerRef.current);
        serverStartTimerRef.current = null;
      }
    };
  }, [appService?.status]);

  const handleToggleF5Server = async () => {
    if (!f5Service) return;
    if (f5ServiceRunning) {
      await stopService("f5");
      setF5Status({ server_unreachable: true });
      return;
    }
    await startService("f5");
    await fetchF5Status();
  };

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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("settings.main_server.title")}</CardTitle>
              <CardDescription>{t("settings.main_server.desc")}</CardDescription>
              <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                <div>API: <a href="http://127.0.0.1:6901" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">http://127.0.0.1:6901</a></div>
                <div>API Docs: <a href="http://127.0.0.1:6901/docs" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">http://127.0.0.1:6901/docs</a></div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={refreshAppApiSetup}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>{t("settings.tools.table.status")}</TableHead>
                  <TableHead>{t("settings.tools.table.path")}</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">App Server (6901)</TableCell>
                  <TableCell>
                    {(() => {
                      const hasMissingDeps = appServiceRunning && (
                        !toolsStatus?.ffmpeg?.installed ||
                        !toolsStatus?.yt_dlp?.installed ||
                        !whisperEnv?.installed ||
                        !translationEnv?.installed ||
                        !imageFinderEnv?.installed ||
                        !bgRemoveEnv?.installed ||
                        !whisperModelDownloaded ||
                        !translationModelDownloaded ||
                        !bgRemoveModelDownloaded
                      );
                      return (
                        <div className="flex items-center gap-2">
                          {appServiceRunning && hasMissingDeps ? (
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                          ) : appServiceRunning ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : appService?.status === "starting" || appService?.status === "stopping" ? (
                            <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500" />
                          )}
                          <span className="text-sm">
                            {appServiceRunning && hasMissingDeps
                              ? "Warning"
                              : appService
                              ? getManagedServiceStatusText(appService.status)
                              : t("settings.tools.status.not_ready")}
                          </span>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-xs font-mono break-all">
                    {appService ? `${appService.api_url} | ${appService.venv_python_path || "--"}` : APP_API_URL}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!appService || appServiceBusy}
                      onClick={() => {
                        if (!appService) return;
                        if (appServiceRunning) {
                          stopService("app");
                          return;
                        }
                        startService("app");
                      }}
                    >
                      {appServiceBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      {appServiceRunning ? t("tool.common.stop_server") : appService?.status === "not_configured" ? "Install & Start" : t("tool.common.start_server")}
                    </Button>
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="font-medium">Environments</TableCell>
                  <TableCell>
                    {(() => {
                      const allReady = whisperEnv?.installed && translationEnv?.installed && imageFinderEnv?.installed && bgRemoveEnv?.installed;
                      return (
                        <div className="flex items-center gap-2">
                          {allReady ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                          <span className="text-sm">{allReady ? t("settings.tools.status.ready") : t("settings.tools.status.not_ready")}</span>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-xs font-mono break-all">
                    {(() => {
                      const pythonPath = whisperEnv?.python_path || translationEnv?.python_path || imageFinderEnv?.python_path || bgRemoveEnv?.python_path;
                      const missing = [
                        ...(whisperEnv?.missing ?? []),
                        ...(translationEnv?.missing ?? []),
                        ...(imageFinderEnv?.missing ?? []),
                        ...(bgRemoveEnv?.missing ?? []),
                      ].filter((v, i, a) => a.indexOf(v) === i);
                      return (
                        <div className="space-y-0.5">
                          {pythonPath && <div>{pythonPath}</div>}
                          {missing.length > 0 && (
                            <div className="text-red-400">MISSING: {missing.join(", ")}</div>
                          )}
                          {!pythonPath && missing.length === 0 && "--"}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    {appServiceRunning && !(whisperEnv?.installed && translationEnv?.installed && imageFinderEnv?.installed && bgRemoveEnv?.installed) && (() => {
                      const isInstalling = [whisperProgress, translationProgress, imageFinderProgress, bgRemoveProgress].some((p) => p?.status === "starting");
                      return (
                        <Button size="sm" variant="outline" onClick={() => { void handleInstallAllEnvs(); }} disabled={isInstalling}>
                          {isInstalling ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                          Install All
                        </Button>
                      );
                    })()}
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="font-medium">System Tools</TableCell>
                  <TableCell>
                    {(() => {
                      const allReady = toolsStatus?.ffmpeg?.installed && toolsStatus?.yt_dlp?.installed;
                      return (
                        <div className="flex items-center gap-2">
                          {allReady ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                          <span className="text-sm">{allReady ? t("settings.tools.status.ready") : t("settings.tools.status.not_ready")}</span>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-xs font-mono break-all">
                    <div className="space-y-0.5">
                      <div className={toolsStatus?.ffmpeg?.installed ? "" : "text-red-400"}>
                        ffmpeg: {toolsStatus?.ffmpeg?.installed ? (toolsStatus.ffmpeg.path ?? "in PATH") : "not found"}
                      </div>
                      <div className={toolsStatus?.yt_dlp?.installed ? "" : "text-red-400"}>
                        yt-dlp: {toolsStatus?.yt_dlp?.installed ? (toolsStatus.yt_dlp.path ?? "in PATH") : "not found"}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {appServiceRunning && (
                      <div className="flex flex-wrap gap-2">
                        {!toolsStatus?.ffmpeg?.installed && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { void handleInstallTool("ffmpeg"); }}
                            disabled={toolsProgress["ffmpeg"]?.status === "starting" || toolsProgress["ffmpeg"]?.status === "downloading" || toolsProgress["ffmpeg"]?.status === "extracting"}
                          >
                            {(toolsProgress["ffmpeg"]?.status === "starting" || toolsProgress["ffmpeg"]?.status === "downloading" || toolsProgress["ffmpeg"]?.status === "extracting") ? (
                              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            ) : null}
                            Install ffmpeg
                          </Button>
                        )}
                        {!toolsStatus?.yt_dlp?.installed && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { void handleInstallTool("yt-dlp"); }}
                            disabled={toolsProgress["yt-dlp"]?.status === "starting" || toolsProgress["yt-dlp"]?.status === "installing"}
                          >
                            {(toolsProgress["yt-dlp"]?.status === "starting" || toolsProgress["yt-dlp"]?.status === "installing") ? (
                              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            ) : null}
                            Install yt-dlp
                          </Button>
                        )}
                      </div>
                    )}
                    {(toolsProgress["ffmpeg"] || toolsProgress["yt-dlp"]) && (
                      <div className="mt-2 space-y-2 min-w-[180px]">
                        {toolsProgress["ffmpeg"] && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>ffmpeg: {toolsProgress["ffmpeg"].message}</span>
                              <span>{toolsProgress["ffmpeg"].percent ?? 0}%</span>
                            </div>
                            <Progress value={toolsProgress["ffmpeg"].percent ?? 0} className="h-1.5" />
                          </div>
                        )}
                        {toolsProgress["yt-dlp"] && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>yt-dlp: {toolsProgress["yt-dlp"].message}</span>
                              <span>{toolsProgress["yt-dlp"].percent ?? 0}%</span>
                            </div>
                            <Progress value={toolsProgress["yt-dlp"].percent ?? 0} className="h-1.5" />
                          </div>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="font-medium">Whisper Model</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {whisperModelDownloaded ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      <span className="text-sm">
                        {whisperModelDownloaded ? t("settings.tools.status.ready") : t("settings.tools.status.not_ready")}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono break-all">
                    {whisperStatus?.cached_models?.length ? whisperStatus.cached_models.join(", ") : whisperStatus?.model_dir || "--"}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      {appServiceRunning && !whisperModelDownloaded && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleWhisperDownloadModel}
                          disabled={Boolean(whisperProgress?.status && !["complete", "error"].includes(whisperProgress.status))}
                        >
                          {whisperProgress?.status && !["complete", "error"].includes(whisperProgress.status) ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : null}
                          {t("settings.whisper.download_model")}
                        </Button>
                      )}
                      {whisperProgress && (
                        <div className="space-y-1 min-w-[160px]">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{whisperProgress.message}</span>
                            <span>{whisperProgress.percent ?? 0}%</span>
                          </div>
                          <Progress value={whisperProgress.percent ?? 0} className="h-1.5" />
                        </div>
                      )}
                    </div>
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="font-medium">Translation Model</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {translationModelLoaded ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : translationModelDownloaded ? (
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      <span className="text-sm">
                        {translationModelLoaded
                          ? t("settings.tools.status.ready")
                          : translationModelDownloaded
                          ? "Sleep"
                          : t("settings.tools.status.not_ready")}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono break-all">
                    {translationModelStatus?.model_dir || translationModelStatus?.model_id || "--"}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      {appServiceRunning && (
                        <div className="flex flex-wrap gap-2">
                          {!translationModelDownloaded && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { void handleTranslationDownloadModel(); }}
                              disabled={Boolean(translationProgress?.status && !["complete", "error"].includes(translationProgress.status)) || !translationEnv?.installed}
                            >
                              {translationProgress?.status && !["complete", "error"].includes(translationProgress.status) ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : null}
                              Download Model
                            </Button>
                          )}
                          {translationModelDownloaded && !translationModelLoaded && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { void handleTranslationLoadModel(); }}
                              disabled={Boolean(translationProgress?.status && !["complete", "error"].includes(translationProgress.status))}
                            >
                              {translationProgress?.status && !["complete", "error"].includes(translationProgress.status) ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : null}
                              Load Model
                            </Button>
                          )}
                          {translationModelLoaded && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { void handleTranslationUnloadModel(); }}
                            >
                              Unload
                            </Button>
                          )}
                        </div>
                      )}
                      {translationProgress && (
                        <div className="space-y-1 min-w-[160px]">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{translationProgress.message}</span>
                            <span>{translationProgress.percent ?? 0}%</span>
                          </div>
                          <Progress value={translationProgress.percent ?? 0} className="h-1.5" />
                        </div>
                      )}
                    </div>
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="font-medium">Background Removal Model</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {bgRemoveModelLoaded ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : bgRemoveModelDownloaded ? (
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      <span className="text-sm">
                        {bgRemoveModelLoaded
                          ? t("settings.tools.status.ready")
                          : bgRemoveModelDownloaded
                          ? "Sleep"
                          : t("settings.tools.status.not_ready")}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono break-all">
                    {bgRemoveStatus
                      ? `${bgRemoveStatus.model_id || "BiRefNet"} (${bgRemoveStatus.device || "cpu"})${bgRemoveStatus.model_error ? ` - ${bgRemoveStatus.model_error}` : ""}`
                      : "--"}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      {appServiceRunning && (
                        <div className="flex flex-wrap gap-2">
                          {!bgRemoveModelDownloaded && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleBgRemoveDownloadModel}
                              disabled={Boolean(bgRemoveProgress?.status && !["complete", "error"].includes(bgRemoveProgress.status))}
                            >
                              {bgRemoveProgress?.status && !["complete", "error"].includes(bgRemoveProgress.status) ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : null}
                              Download Model
                            </Button>
                          )}
                          {bgRemoveModelDownloaded && !bgRemoveModelLoaded && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleBgRemoveLoadModel}
                              disabled={Boolean(bgRemoveProgress?.status && !["complete", "error"].includes(bgRemoveProgress.status))}
                            >
                              {bgRemoveProgress?.status && !["complete", "error"].includes(bgRemoveProgress.status) ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : null}
                              Load Model
                            </Button>
                          )}
                          {bgRemoveModelLoaded && (
                            <Button size="sm" variant="outline" onClick={handleBgRemoveUnloadModel}>
                              Unload
                            </Button>
                          )}
                        </div>
                      )}
                      {bgRemoveProgress && (
                        <div className="space-y-1 min-w-[160px]">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{bgRemoveProgress.message}</span>
                            <span>{bgRemoveProgress.percent ?? 0}%</span>
                          </div>
                          <Progress value={bgRemoveProgress.percent ?? 0} className="h-1.5" />
                        </div>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          {appService?.status === "starting" && (
            <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                  <span className="font-medium">
                    {appService.message || "Starting server..."}
                  </span>
                </div>
                <span className="text-muted-foreground text-xs">
                  {Math.round(serverStartProgress)}%
                </span>
              </div>
              <Progress value={serverStartProgress} className="h-2" />
              {!appService.configured && (
                <p className="text-xs text-amber-500/80">
                  First-time setup: creating virtual environment and installing packages. This may take a few minutes.
                </p>
              )}
            </div>
          )}

          {envInstallAllActive && (
            <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                  <span className="font-medium">
                    Installing environments ({envInstallDoneCount}/4)
                  </span>
                </div>
                <span className="text-muted-foreground text-xs">
                  {Math.round((envInstallDoneCount / 4) * 100)}%
                </span>
              </div>
              {envInstallStep && (
                <p className="text-xs text-muted-foreground">Current: {envInstallStep}</p>
              )}
              <Progress value={envInstallDoneCount === 0 ? 3 : (envInstallDoneCount / 4) * 100} className="h-2" />
              <p className="text-xs text-amber-500/80">
                This may take 30 – 60 minutes depending on your internet speed and hardware.
              </p>
            </div>
          )}
          {!envInstallAllActive && imageFinderProgress && (
            <div className="text-xs text-muted-foreground">
              Image Finder: {imageFinderProgress.message} {imageFinderProgress.percent ?? 0}%
            </div>
          )}
        </CardContent>
      </Card>

      {/* F5 Voice Clone API Service Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("tool.voice_clone.service_status")}</CardTitle>
              <CardDescription>{t("tool.voice_clone.service_desc")}</CardDescription>
              <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                <div>API: <a href="http://127.0.0.1:6902" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">http://127.0.0.1:6902</a></div>
                <div>API Docs: <a href="http://127.0.0.1:6902/docs" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">http://127.0.0.1:6902/docs</a></div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={fetchF5Status}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
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
                  <TableCell className="font-medium">{t("tool.voice_clone.server_status")}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {!f5Status?.server_unreachable ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      <span className="text-sm">
                        {!f5Status?.server_unreachable ? t("settings.tools.status.ready") : t("settings.tools.status.not_ready")}
                      </span>
                      {f5Service && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleToggleF5Server}
                          disabled={f5ServiceBusy || f5Service.status === "not_configured"}
                          className="ml-2"
                        >
                          {f5ServiceBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                          {f5ServiceRunning ? t("tool.common.stop_server") : t("tool.common.start_server")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono break-all">
                    {F5_API_URL}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">{t("tool.voice_clone.env_status")}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {f5Status?.env?.installed ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      <span className="text-sm">
                        {f5Status?.env?.installed ? t("settings.tools.status.ready") : t("settings.tools.status.not_ready")}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono break-all">
                    {f5Status?.env?.installed_modules?.length
                      ? f5Status.env.installed_modules.join(", ")
                      : f5Status?.env?.missing?.length
                      ? f5Status.env.missing.join(", ")
                      : "--"}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">{t("tool.voice_clone.model_status_vn")}</TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        {f5Status?.models?.vi?.installed ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                        <span className="text-sm">
                          {f5Status?.models?.vi?.installed ? t("settings.tools.status.ready") : t("settings.tools.status.not_ready")}
                        </span>
                        {!f5Status?.models?.vi?.installed && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              void handleF5DownloadModel("vi");
                            }}
                            disabled={isF5ModelDownloading("vi") || !f5Status?.env?.installed || Boolean(f5Status?.server_unreachable)}
                            className="ml-2"
                          >
                            {isF5ModelDownloading("vi") ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            {t("settings.f5.download_model")}
                          </Button>
                        )}
                      </div>
                      {f5ModelProgress.vi && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{f5ModelProgress.vi.message || t("settings.f5.download_model")}</span>
                            <span>{f5ModelProgress.vi.percent ?? 0}%</span>
                          </div>
                          <Progress value={f5ModelProgress.vi.percent ?? 0} className="h-1.5" />
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono break-all">
                    {f5Status?.models?.vi?.model_file || f5Status?.models?.vi?.model_dir || F5_MODEL_DEFAULT_PATHS.vi}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">{t("tool.voice_clone.model_status_en")}</TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        {f5Status?.models?.en?.installed ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                        <span className="text-sm">
                          {f5Status?.models?.en?.installed ? t("settings.tools.status.ready") : t("settings.tools.status.not_ready")}
                        </span>
                        {!f5Status?.models?.en?.installed && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              void handleF5DownloadModel("en");
                            }}
                            disabled={isF5ModelDownloading("en") || !f5Status?.env?.installed || Boolean(f5Status?.server_unreachable)}
                            className="ml-2"
                          >
                            {isF5ModelDownloading("en") ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            {t("settings.f5.download_model")}
                          </Button>
                        )}
                      </div>
                      {f5ModelProgress.en && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{f5ModelProgress.en.message || t("settings.f5.download_model")}</span>
                            <span>{f5ModelProgress.en.percent ?? 0}%</span>
                          </div>
                          <Progress value={f5ModelProgress.en.percent ?? 0} className="h-1.5" />
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono break-all">
                    {f5Status?.models?.en?.model_file || f5Status?.models?.en?.model_dir || F5_MODEL_DEFAULT_PATHS.en}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
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

      <StorageLocationsCard />

      <OllamaSettingsCard />

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
