import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { APP_API_URL, F5_API_URL, VIENEU_API_URL, WHISPER_API_URL } from "@/lib/api";
import { useI18n } from "@/i18n/i18n";
import type { I18nKey } from "@/i18n/translations";

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
};

type F5ModelStatus = {
  installed?: boolean;
  model_file?: string | null;
  vocab_file?: string | null;
};

type VieNeuModelStatus = {
  backbone_ready?: boolean;
  codec_ready?: boolean;
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
  const toolLabelMap: Record<string, I18nKey> = {
    "yt-dlp": "settings.tools.item.yt-dlp",
    "ffmpeg": "settings.tools.item.ffmpeg",
    "torch": "settings.tools.item.torch",
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
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">{t("settings.title")}</h2>
        <p className="text-zinc-500">{t("settings.subtitle")}</p>
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
                  const isInstalling = progress && !["complete", "error"].includes(progress.status);
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">{t("settings.f5.env_status")}</div>
              <div className="text-xs text-zinc-500">
                {f5Env?.installed ? t("settings.tools.status.ready") : t("settings.tools.status.not_ready")}
                {!f5Env?.installed && f5Env?.missing?.length ? ` (${f5Env.missing.join(", ")})` : ""}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">{t("settings.f5.model_status")}</div>
              <div className="text-xs text-zinc-500">
                {f5Model?.installed ? t("settings.tools.status.ready") : t("settings.tools.status.not_ready")}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleF5EnvInstall} disabled={f5Env?.installed === true}>
              {t("settings.f5.install_env")}
            </Button>
            <Button variant="outline" onClick={handleF5DownloadModel}>
              {t("settings.f5.download_model")}
            </Button>
          </div>
          {f5Progress && (
            <div className="text-xs text-zinc-500">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">{t("settings.vieneu.env_status")}</div>
              <div className="text-xs text-zinc-500">
                {vieneuEnv?.installed ? t("settings.tools.status.ready") : t("settings.tools.status.not_ready")}
                {!vieneuEnv?.installed && vieneuEnv?.missing?.length ? ` (${vieneuEnv.missing.join(", ")})` : ""}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">{t("settings.vieneu.model_status")}</div>
              <div className="text-xs text-zinc-500">
                {vieneuStatus?.model_loaded ? t("settings.vieneu.model_loaded") : t("settings.vieneu.model_not_loaded")}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-500 uppercase">{t("settings.vieneu.backbone")}</label>
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
              <label className="text-xs font-semibold text-zinc-500 uppercase">{t("settings.vieneu.codec")}</label>
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
            <Button variant="outline" onClick={handleVieneuEnvInstall} disabled={vieneuEnv?.installed === true}>
              {t("settings.vieneu.install_env")}
            </Button>
            <Button variant="outline" onClick={handleVieneuDownloadModel} disabled={!vieneuBackbone || !vieneuCodec}>
              {t("settings.vieneu.download_model")}
            </Button>
            <Button variant="outline" onClick={handleVieneuLoadModel} disabled={!vieneuBackbone || !vieneuCodec}>
              {t("settings.vieneu.load_model")}
            </Button>
            <Button variant="outline" onClick={handleVieneuUnloadModel}>
              {t("settings.vieneu.unload_model")}
            </Button>
          </div>

          {vieneuProgress && (
            <div className="text-xs text-zinc-500">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">{t("settings.whisper.env_status")}</div>
              <div className="text-xs text-zinc-500">
                {whisperEnv?.installed ? t("settings.tools.status.ready") : t("settings.tools.status.not_ready")}
                {!whisperEnv?.installed && whisperEnv?.missing?.length ? ` (${whisperEnv.missing.join(", ")})` : ""}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">{t("settings.whisper.model_cache")}</div>
              <div className="text-xs text-zinc-500">
                {whisperStatus?.cached_models?.length ? whisperStatus.cached_models.join(", ") : t("settings.whisper.no_models")}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-500 uppercase">{t("settings.whisper.model_select")}</label>
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
            <Button variant="outline" onClick={handleWhisperEnvInstall} disabled={whisperEnv?.installed === true}>
              {t("settings.whisper.install_env")}
            </Button>
            <Button variant="outline" onClick={handleWhisperDownloadModel}>
              {t("settings.whisper.download_model")}
            </Button>
          </div>

          {whisperProgress && (
            <div className="text-xs text-zinc-500">
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
            <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4">
              <div className="text-sm text-zinc-500 mb-1">{t("settings.storage.total_files")}</div>
              <div className="text-2xl font-bold">{status?.temp?.file_count ?? 0}</div>
            </div>
            <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4">
              <div className="text-sm text-zinc-500 mb-1">{t("settings.storage.used")}</div>
              <div className="text-2xl font-bold">{status?.temp?.total_size_mb ?? 0} MB</div>
            </div>
            <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4">
              <div className="text-sm text-zinc-500 mb-1">{t("settings.storage.location")}</div>
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
