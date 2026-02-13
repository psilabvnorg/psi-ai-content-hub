import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { APP_API_URL, F5_API_URL, VIENEU_API_URL, WHISPER_API_URL } from "@/lib/api";
import { useI18n } from "@/i18n/i18n";
import type { I18nKey } from "@/i18n/translations";
import { useManagedServices } from "@/hooks/useManagedServices";

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

const WHISPER_MODELS = ["tiny", "base", "small", "medium", "large", "large-v3"] as const;
const MANAGED_SERVICE_LABELS: Record<string, string> = {
  app: "App API",
  f5: "F5 Voice Clone API",
  vieneu: "VieNeu TTS API",
  whisper: "Whisper STT API",
};
const MANAGED_SERVICE_IDS = ["app", "f5", "vieneu", "whisper"] as const;

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
    refreshServices();
  }, []);

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
    </div>
  );
}
