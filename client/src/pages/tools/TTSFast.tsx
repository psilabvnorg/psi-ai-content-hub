import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Volume2 } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import { VIENEU_API_URL } from "@/lib/api";
import { ServiceStatusTable, ProgressDisplay, AudioResult } from "@/components/common/tool-page-ui";
import type { ProgressData, StatusRowConfig } from "@/components/common/tool-page-ui";
import { useManagedServices } from "@/hooks/useManagedServices";

const MAX_CHARS = 3000;

type Voice = { id: string; name: string; description?: string };

type ModelStatus = {
  backbone_ready?: boolean;
  codec_ready?: boolean;
  backbone_dir?: string;
  codec_dir?: string;
  model_loaded?: boolean;
  current_config?: Record<string, unknown>;
};

type VieneuStatusResponse = {
  models?: {
    vieneu_tts?: ModelStatus;
  };
};

type ModelConfigs = {
  backbones: Record<string, { repo: string; description?: string }>;
  codecs: Record<string, { repo: string; description?: string }>;
};

export default function TTSFast({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const mode: "preset" = "preset";
  const [selectedVoice, setSelectedVoice] = useState("");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);

  // Status management
  const [serverUnreachable, setServerUnreachable] = useState(false);
  const [envInstalled, setEnvInstalled] = useState(false);
  const [envModules, setEnvModules] = useState<string[]>([]);
  const [envMissing, setEnvMissing] = useState<string[]>([]);
  const [modelStatus, setModelStatus] = useState<ModelStatus | undefined>();

  const [isModelLoading, setIsModelLoading] = useState(false);
  const [useGpu, setUseGpu] = useState(true);
  const [modelConfigs, setModelConfigs] = useState<ModelConfigs | null>(null);

  const [charLimitEnabled, setCharLimitEnabled] = useState(true);
  const charCount = text.length;
  const overLimit = charLimitEnabled && charCount > MAX_CHARS;
  const modelReady = modelStatus?.backbone_ready && modelStatus?.codec_ready;
  const modelLoaded = modelStatus?.model_loaded;
  const statusReady = !serverUnreachable && envInstalled && modelReady && modelLoaded;
  const { servicesById, start, stop, isBusy } = useManagedServices();
  const serviceStatus = servicesById.vieneu;
  const serviceRunning = serviceStatus?.status === "running";
  const serviceBusy = isBusy("vieneu");

  // --- Data fetching ---
  const fetchStatus = async () => {
    try {
      const [envRes, statusRes] = await Promise.all([
        fetch(`${VIENEU_API_URL}/api/v1/env/status`),
        fetch(`${VIENEU_API_URL}/api/v1/status`),
      ]);
      if (!envRes.ok || !statusRes.ok) throw new Error("status");
      
      const envData = await envRes.json();
      const statusData = (await statusRes.json()) as VieneuStatusResponse;
      
      setServerUnreachable(false);
      setEnvInstalled(envData.installed || false);
      setEnvModules(envData.installed_modules || []);
      setEnvMissing(envData.missing || []);
      setModelStatus(statusData.models?.vieneu_tts);
    } catch {
      setServerUnreachable(true);
    }
  };

  const fetchVoices = async () => {
    try {
      const res = await fetch(`${VIENEU_API_URL}/api/v1/voices`);
      const data = await res.json();
      setVoices(data.voices || []);
    } catch { /* */ }
  };

  const fetchModelConfigs = async () => {
    try {
      const res = await fetch(`${VIENEU_API_URL}/api/v1/models/configs`);
      if (!res.ok) return;
      const data = await res.json();
      setModelConfigs(data);
    } catch { /* */ }
  };

  const currentDevice = (modelStatus?.current_config?.device as string) || "";
  const wantedDevice = useGpu ? "cuda" : "cpu";
  const deviceMismatch = modelStatus?.model_loaded && currentDevice !== wantedDevice;

  const loadModelOnDevice = async () => {
    const configs = modelConfigs || (await fetch(`${VIENEU_API_URL}/api/v1/models/configs`).then(r => r.json()));
    const backboneKeys = Object.keys(configs.backbones || {});
    const codecKeys = Object.keys(configs.codecs || {});
    if (!backboneKeys.length || !codecKeys.length) return;

    const res = await fetch(`${VIENEU_API_URL}/api/v1/models/load`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backbone: backboneKeys[0], codec: codecKeys[0], device: wantedDevice }),
    });

    if (res.ok && res.headers.get("content-type")?.includes("text/event-stream")) {
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (chunk.includes('"complete"') || chunk.includes('"error"')) break;
        }
      }
    }
  };

  const handleLoadModel = async () => {
    if (isModelLoading) return;
    setIsModelLoading(true);
    try {
      if (modelStatus?.model_loaded && !deviceMismatch) {
        // Simple unload
        await fetch(`${VIENEU_API_URL}/api/v1/models/unload`, { method: "POST" });
      } else {
        if (modelStatus?.model_loaded) {
          // Unload first before reloading on different device
          await fetch(`${VIENEU_API_URL}/api/v1/models/unload`, { method: "POST" });
        }
        await loadModelOnDevice();
      }
      await fetchStatus();
    } catch (error) {
      console.error("Error toggling model:", error);
    } finally {
      setIsModelLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchVoices();
    fetchModelConfigs();
  }, []);

  useEffect(() => {
    if (!serviceStatus) return;
    if (serviceStatus.status === "running" || serviceStatus.status === "stopped") {
      fetchStatus();
      fetchVoices();
      fetchModelConfigs();
    }
  }, [serviceStatus?.status]);

  const handleToggleServer = async () => {
    // Check if running in Electron
    const isElectron = typeof window !== "undefined" && window.electronAPI !== undefined;
    
    try {
      if (isElectron && serviceStatus) {
        // Use Electron API - this is the primary supported mode
        if (serviceRunning) {
          await stop("vieneu");
          setServerUnreachable(true);
        } else {
          await start("vieneu");
          await fetchStatus();
          await fetchVoices();
        }
      } else if (!serverUnreachable) {
        // Browser mode: can only STOP a running server
        // Cannot start a server that's not running (chicken-and-egg problem)
        const response = await fetch(`${VIENEU_API_URL}/api/v1/server/stop`, {
          method: "POST",
        });
        if (response.ok) {
          setServerUnreachable(true);
        }
      }
      // If in browser mode and server is unreachable, do nothing
      // User must manually start the server via command line
    } catch (error) {
      console.error("Error toggling server:", error);
    }
  };



  // --- Generate ---
  const handleGenerate = async () => {
    if (!text.trim() || overLimit) return;
    if (mode === "preset" && !selectedVoice) return;

    setIsGenerating(true);
    setProgress({ status: "starting", percent: 0, message: t("tool.tts_fast.starting_generation") });
    setLogs([]);
    setAudioUrl(null);
    setDownloadName(null);
    setAudioDuration(null);

    try {
      const payload: Record<string, unknown> = { text, mode, voice_id: selectedVoice };

      const res = await fetch(`${VIENEU_API_URL}/api/v1/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      const taskId = data.task_id;

      const es = new EventSource(`${VIENEU_API_URL}/api/v1/generate/stream/${taskId}`);
      es.onmessage = (event) => {
        const p: ProgressData = JSON.parse(event.data);
        setProgress(p);
        if (p.logs) setLogs(p.logs);
        if (p.status === "complete") {
          es.close();
          setIsGenerating(false);
          fetch(`${VIENEU_API_URL}/api/v1/generate/download/${taskId}`)
            .then((r) => r.json())
            .then((r) => {
              setAudioUrl(`${VIENEU_API_URL}${r.download_url}`);
              setDownloadName(r.filename || "tts.wav");
            });
          setAudioDuration(p.duration || null);
        }
        if (p.status === "error") {
          es.close();
          setIsGenerating(false);
        }
      };
      es.onerror = () => {
        es.close();
        setIsGenerating(false);
        setProgress({ status: "error", percent: 0, message: t("tool.tts_fast.lost_connection") });
      };
    } catch {
        setProgress({ status: "error", percent: 0, message: t("tool.tts_fast.server_not_reachable") });
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = downloadName || "tts.wav";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Build status rows configuration
  const isElectron = typeof window !== "undefined" && window.electronAPI !== undefined;
  
  const statusRows: StatusRowConfig[] = [
    {
      id: "server",
      label: t("tool.tts_fast.server_status"),
      isReady: !serverUnreachable,
      path: VIENEU_API_URL,
      // Only show start/stop button in Electron mode or when server is running (for stop)
      showActionButton: Boolean(serviceStatus) || (!isElectron && !serverUnreachable),
      actionButtonLabel: serviceRunning || !serverUnreachable 
        ? t("tool.common.stop_server") 
        : t("tool.common.start_server"),
      actionDisabled: serviceBusy || serviceStatus?.status === "not_configured" || (!isElectron && serverUnreachable),
      onAction: handleToggleServer,
    },
    {
      id: "env",
      label: t("tool.tts_fast.env_status"),
      isReady: envInstalled,
      path: envModules.length ? envModules.join(", ") : envMissing.length ? envMissing.join(", ") : undefined,
      showActionButton: !envInstalled,
      actionButtonLabel: t("tool.common.install_library"),
      onAction: onOpenSettings,
    },
    {
      id: "model",
      label: t("tool.tts_fast.model_status"),
      isReady: (modelReady && modelStatus?.model_loaded) || false,
      path: modelStatus?.model_loaded
        ? `Loaded: ${(modelStatus.current_config?.backbone as string) || "?"} (${(modelStatus.current_config?.device as string) || "?"})`
        : modelStatus?.backbone_dir && modelStatus?.codec_dir
          ? `Backbone: ${modelStatus.backbone_dir}, Codec: ${modelStatus.codec_dir}`
          : undefined,
      showActionButton: !serverUnreachable && modelReady,
      actionButtonLabel: isModelLoading
        ? "Loading..."
        : deviceMismatch
          ? `Reload on ${useGpu ? "GPU" : "CPU"}`
          : modelStatus?.model_loaded ? "Unload Model" : "Load Model",
      actionDisabled: isModelLoading,
      onAction: handleLoadModel,
      showSecondaryAction: !modelReady,
      secondaryActionLabel: t("tool.common.download_model"),
      onSecondaryAction: onOpenSettings,
    },
  ];

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-card">
      <CardContent className="p-8 space-y-6">

        {/* Title and Description */}
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">{t("feature.tool.tts_fast.title")}</h2>
          <div className="text-sm text-muted-foreground space-y-1">
            <p>API: <a href="http://127.0.0.1:6903" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent/80 underline">http://127.0.0.1:6903</a></p>
            <p>API Docs: <a href="http://127.0.0.1:6903/docs" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent/80 underline">http://127.0.0.1:6903/docs</a></p>
          </div>
        </div>

        {/* CPU/GPU Toggle */}
        {!serverUnreachable && modelReady && (
          <div className="flex items-center gap-2 text-sm">
            <span className={`font-medium ${!useGpu ? "text-foreground" : "text-muted-foreground"}`}>CPU</span>
            <Switch checked={useGpu} onCheckedChange={setUseGpu} />
            <span className={`font-medium ${useGpu ? "text-foreground" : "text-muted-foreground"}`}>GPU</span>
          </div>
        )}

        {/* Status Table */}
        <ServiceStatusTable
          serverUnreachable={serverUnreachable}
          rows={statusRows}
          onRefresh={fetchStatus}
        />

        {/* Mode Selection */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.tts_fast.select_voice")}</label>
          <Select value={selectedVoice} onValueChange={setSelectedVoice}>
            <SelectTrigger className="bg-card border-border">
              <SelectValue placeholder={t("tool.tts_fast.choose_preset")} />
            </SelectTrigger>
            <SelectContent>
              {voices.map((v) => (
                <SelectItem key={v.id} value={v.id}>{v.name} {v.description ? `— ${v.description}` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Text Input */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.tts_fast.text_to_speak")}</label>
          <Textarea
            placeholder={t("tool.tts_fast.text_ph")}
            value={text}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
            className="min-h-[120px] bg-card border-border resize-none"
          />
          <div className="flex items-center justify-between">
            <p className={`text-xs ${overLimit ? "text-red-500" : "text-muted-foreground"}`}>
              {charLimitEnabled
                ? t("tool.voice_clone.characters", { count: charCount, max: MAX_CHARS })
                : `${charCount} characters`}
            </p>
            <Button
              size="sm"
              variant={charLimitEnabled ? "outline" : "secondary"}
              onClick={() => setCharLimitEnabled(!charLimitEnabled)}
              className="h-6 text-xs px-2"
            >
              {charLimitEnabled ? t("tool.common.char_limit_on") : t("tool.common.char_limit_off")}
            </Button>
          </div>
        </div>

        {/* Generate Button */}
        <Button
          className="w-full h-12 bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl font-bold"
          onClick={handleGenerate}
          disabled={isGenerating || !text.trim() || overLimit || !statusReady || !selectedVoice}
        >
          {isGenerating ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Volume2 className="w-5 h-5 mr-2" />}
          {t("tool.tts_fast.generate")}
        </Button>

        {/* Progress */}
        <ProgressDisplay
          progress={progress}
          logs={logs}
          defaultMessage={t("tool.tts_fast.processing")}
        />

        {/* Audio Result */}
        <AudioResult
          audioUrl={audioUrl}
          downloadName={downloadName}
          duration={audioDuration}
          onDownload={handleDownload}
          readyMessage={t("tool.tts_fast.audio_ready")}
          durationMessage={audioDuration !== null ? t("tool.tts_fast.duration", { seconds: audioDuration }) : undefined}
        />
      </CardContent>
    </Card>
  );
}
