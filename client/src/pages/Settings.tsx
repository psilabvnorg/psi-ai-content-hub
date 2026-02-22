import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, CheckCircle, XCircle, Loader2, FolderOpen, Copy, Check } from "lucide-react";
import { APP_API_URL } from "@/lib/api";
import { useI18n } from "@/i18n/i18n";
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

type aprofile_status_envelope_data = {
  profile_status?: {
    installed?: boolean;
    missing_modules?: string[];
    installed_modules?: string[];
  };
};

function aextract_env_status_data(payload: EnvStatus | aprofile_status_envelope_data): EnvStatus {
  if ("profile_status" in payload) {
    const profileStatus = payload.profile_status ?? {};
    return {
      installed: profileStatus.installed === true,
      missing: profileStatus.missing_modules ?? [],
      installed_modules: profileStatus.installed_modules ?? [],
    };
  }
  return payload as EnvStatus;
}

const MANAGED_SERVICE_LABELS: Record<string, string> = {
  app: "App API",
  f5: "F5 Voice Clone API",
};
const MANAGED_SERVICE_IDS = ["app", "f5"] as const;

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
      const res = await fetch(`${APP_API_URL}/api/v1/env/profiles/image-search/status`);
      if (!res.ok) throw new Error("ImageFinder status failed");
      setImageFinderEnv(
        aextract_env_status_data((await res.json()) as EnvStatus | aprofile_status_envelope_data)
      );
    } catch {
      setImageFinderEnv(null);
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
      if (!envRes.ok || !modelRes.ok) throw new Error("Translation status failed");
      setTranslationEnv(
        aextract_env_status_data((await envRes.json()) as EnvStatus | aprofile_status_envelope_data)
      );
      setTranslationModelStatus((await modelRes.json()) as TranslationModelStatus);
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

  const handleTranslationUnloadModel = async () => {
    try {
      await fetch(`${APP_API_URL}/api/v1/translation/unload`, { method: "POST" });
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
    await handleWhisperEnvInstall();
    await handleTranslationEnvInstall();
    await handleImageFinderEnvInstall();
    await handleBgRemoveEnvInstall();
  };

  useEffect(() => {
    fetchStatus();
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

  const refreshAppApiSetup = () => {
    fetchWhisperStatus();
    fetchBgRemoveStatus();
    fetchTranslationStatus();
    fetchImageFinderStatus();
    refreshServices();
  };

  const appService = services.find((service) => service.id === "app");
  const appServiceRunning = appService?.status === "running";
  const appServiceBusy = appService ? isServiceBusy("app") : false;
  const whisperModelReady = Boolean(whisperStatus?.cached_models?.length);
  const translationModelReady = Boolean(translationModelStatus?.loaded || translationModelStatus?.downloaded);
  const bgRemoveModelReady = Boolean(bgRemoveStatus?.model_loaded);

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
              <CardTitle>App API (6901) Setup</CardTitle>
              <CardDescription>Centralized server, environment, and model management for all tools running on port 6901.</CardDescription>
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
                    <div className="flex items-center gap-2">
                      {appServiceRunning ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : appService?.status === "starting" || appService?.status === "stopping" ? (
                        <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      <span className="text-sm">{appService ? getManagedServiceStatusText(appService.status) : t("settings.tools.status.not_ready")}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono break-all">
                    {appService ? `${appService.api_url} | ${appService.venv_python_path || "--"}` : APP_API_URL}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!appService || appServiceBusy || appService.status === "not_configured"}
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
                      {appServiceRunning ? t("tool.common.stop_server") : t("tool.common.start_server")}
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
                    {(() => {
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
                  <TableCell className="font-medium">Whisper Model</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {whisperModelReady ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                      <span className="text-sm">{whisperModelReady ? t("settings.tools.status.ready") : t("settings.tools.status.not_ready")}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono break-all">
                    {whisperStatus?.cached_models?.length ? whisperStatus.cached_models.join(", ") : whisperStatus?.model_dir || "--"}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={handleWhisperDownloadModel} disabled={whisperProgress?.status === "starting"}>
                      {whisperProgress?.status === "starting" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      {t("settings.whisper.download_model")}
                    </Button>
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="font-medium">Translation Model</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {translationModelReady ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                      <span className="text-sm">{translationModelReady ? t("settings.tools.status.ready") : t("settings.tools.status.not_ready")}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono break-all">
                    {translationModelStatus?.model_dir || translationModelStatus?.model_id || "--"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          void handleTranslationDownloadModel();
                        }}
                        disabled={translationProgress?.status === "starting" || !translationEnv?.installed}
                      >
                        {translationProgress?.status === "starting" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Download / Load
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          void handleTranslationUnloadModel();
                        }}
                        disabled={!translationModelStatus?.loaded}
                      >
                        Unload
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="font-medium">Background Removal Model</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {bgRemoveModelReady ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                      <span className="text-sm">{bgRemoveModelReady ? t("settings.tools.status.ready") : t("settings.tools.status.not_ready")}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono break-all">
                    {bgRemoveStatus
                      ? `${bgRemoveStatus.model_id || "BiRefNet"} (${bgRemoveStatus.device || "cpu"})${bgRemoveStatus.model_error ? ` - ${bgRemoveStatus.model_error}` : ""}`
                      : "--"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={handleBgRemoveDownloadModel} disabled={bgRemoveProgress?.status === "starting"}>
                        {bgRemoveProgress?.status === "starting" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Download / Load
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleBgRemoveUnloadModel} disabled={!bgRemoveStatus?.model_loaded}>
                        Unload
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          {whisperProgress && (
            <div className="text-xs text-muted-foreground">
              Whisper: {whisperProgress.message} {whisperProgress.percent ?? 0}%
            </div>
          )}
          {translationProgress && (
            <div className="text-xs text-muted-foreground">
              Translation: {translationProgress.message} {translationProgress.percent ?? 0}%
            </div>
          )}
          {imageFinderProgress && (
            <div className="text-xs text-muted-foreground">
              Image Finder: {imageFinderProgress.message} {imageFinderProgress.percent ?? 0}%
            </div>
          )}
          {bgRemoveProgress && (
            <div className="text-xs text-muted-foreground">
              Background Removal: {bgRemoveProgress.message} {bgRemoveProgress.percent ?? 0}%
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
