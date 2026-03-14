import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mic, Loader2, Download } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import { APP_API_URL, F5_API_URL } from "@/lib/api";
import { ServiceStatusTable } from "@/components/common/tool-page-ui";
import type { StatusRowConfig } from "@/components/common/tool-page-ui";
const MAX_CHARS = 500;

type Voice = {
  id: string;
  name: string;
  description?: string;
  language?: string;
  gender?: string;
};


type EnvStatus = {
  installed: boolean;
  missing?: string[];
  installed_modules?: string[];
  python_path?: string;
};

type ModelStatus = {
  installed?: boolean;
  model_file?: string | null;
  vocab_file?: string | null;
};

type StatusData = {
  server_unreachable?: boolean;
  env?: EnvStatus;
  models?: {
    vi?: ModelStatus;
    en?: ModelStatus;
  };
};

type ProgressData = {
  status: string;
  percent: number;
  message?: string;
  logs?: string[];
  file_path?: string;
  filename?: string;
  duration?: number;
};

export default function VoiceClone({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { t } = useI18n();
  const [language, setLanguage] = useState<"vi" | "en">("vi");
  const [text, setText] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1.0);
  const logRef = useRef<HTMLDivElement>(null);
  const [cfgStrength, setCfgStrength] = useState(2.0);
  const [nfeStep, setNfeStep] = useState(32);
  const [removeSilence, setRemoveSilence] = useState(false);
  const [charLimitEnabled, setCharLimitEnabled] = useState(true);
  const [isNormalizing, setIsNormalizing] = useState(false);
  const charCount = text.length;
  const overLimit = charLimitEnabled && charCount > MAX_CHARS;
  const serverUnreachable = status?.server_unreachable === true;
  const depsReady = status?.env?.installed === true;
  const modelReady = status?.models?.[language]?.installed === true;
  const statusReady = !serverUnreachable && depsReady && modelReady;

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const fetchStatus = async () => {
    try {
      const [envRes, statusRes] = await Promise.all([
        fetch(`${F5_API_URL}/api/v1/env/status`),
        fetch(`${F5_API_URL}/api/v1/status`),
      ]);
      if (!envRes.ok || !statusRes.ok) throw new Error("status");
      const envData = (await envRes.json()) as EnvStatus;
      const statusData = (await statusRes.json()) as { models?: { f5_tts_vn?: ModelStatus; f5_tts_en?: ModelStatus } };
      setStatus({
        server_unreachable: false,
        env: envData,
        models: {
          vi: statusData.models?.f5_tts_vn,
          en: statusData.models?.f5_tts_en,
        },
      });
    } catch {
      setStatus({ server_unreachable: true });
    }
  };

  const normalizeText = async () => {
    if (!text.trim()) return;
    setIsNormalizing(true);
    try {
      const res = await fetch(`${APP_API_URL}/api/v1/text/normalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language }),
      });
      if (!res.ok) throw new Error("normalize failed");
      const data = await res.json();
      setText(data.normalized_text);
    } catch {}
    setIsNormalizing(false);
  };

  const fetchVoices = async (lang?: string) => {
    try {
      const res = await fetch(`${F5_API_URL}/api/v1/voices?language=${lang ?? language}`);
      const data = await res.json();
      setVoices(data.voices || []);
    } catch {}
  };


  useEffect(() => {
    fetchStatus();
    fetchVoices(language);
  }, []);

  // Reload voices when language changes
  useEffect(() => {
    setSelectedVoice("");
    fetchVoices(language);
  }, [language]);

  const handleGenerate = async () => {
    if (!text.trim() || !selectedVoice || overLimit) return;
    setIsGenerating(true);
    setProgress({ status: "starting", percent: 0, message: t("tool.voice_clone.processing") });
    setLogs([]);
    setAudioUrl(null);
    setDownloadName(null);

    try {
      const res = await fetch(`${F5_API_URL}/api/v1/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voice_id: selectedVoice,
          text,
          speed,
          cfg_strength: cfgStrength,
          nfe_step: nfeStep,
          remove_silence: removeSilence,
          language,
        }),
      });
      const data = await res.json();
      const taskId = data.task_id;
      const es = new EventSource(`${F5_API_URL}/api/v1/generate/stream/${taskId}`);

      es.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        setProgress(payload);
        if (payload.logs) setLogs(payload.logs);
        if (payload.status === "complete") {
          es.close();
          setIsGenerating(false);
          fetch(`${F5_API_URL}/api/v1/generate/download/${taskId}`)
            .then((r) => r.json())
            .then((r) => {
              setAudioUrl(`${F5_API_URL}${r.download_url}`);
              setDownloadName(r.filename || "voice.wav");
            });
        }
        if (payload.status === "error") {
          es.close();
          setIsGenerating(false);
        }
      };
    } catch (err) {
      console.warn("[VoiceClone] Generate request failed:", err);
      setProgress({ status: "error", percent: 0, message: t("tool.voice_clone.server_not_reachable") });
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!audioUrl) return;
    const response = await fetch(audioUrl);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadName || "voice.wav";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const progressPercent = useMemo(() => {
    return Math.max(0, Math.min(100, progress?.percent || 0));
  }, [progress]);

  const statusRows: StatusRowConfig[] = [
    {
      id: "server",
      label: t("tool.voice_clone.server_status"),
      isReady: !serverUnreachable,
      path: F5_API_URL,
      showSecondaryAction: serverUnreachable && Boolean(onOpenSettings),
      secondaryActionLabel: t("tool.common.open_settings"),
      onSecondaryAction: onOpenSettings,
    },
    {
      id: "env",
      label: t("tool.voice_clone.env_status"),
      isReady: status?.env?.installed === true,
      path: status?.env?.installed_modules?.length
        ? status.env.installed_modules.join(", ")
        : status?.env?.missing?.length
        ? status.env.missing.join(", ")
        : "--",
      showActionButton: !serverUnreachable && !status?.env?.installed && !!onOpenSettings,
      actionButtonLabel: t("tool.common.open_settings"),
      actionButtonVariant: "outline",
      onAction: onOpenSettings,
    },
    {
      id: "model-vi",
      label: t("tool.voice_clone.model_status_vn"),
      isReady: status?.models?.vi?.installed === true,
      path: status?.models?.vi?.model_file || "--",
      showActionButton: !serverUnreachable && !status?.models?.vi?.installed && !!onOpenSettings,
      actionButtonLabel: t("tool.common.open_settings"),
      actionButtonVariant: "outline",
      onAction: onOpenSettings,
    },
    {
      id: "model-en",
      label: t("tool.voice_clone.model_status_en"),
      isReady: status?.models?.en?.installed === true,
      path: status?.models?.en?.model_file || "--",
      showActionButton: !serverUnreachable && !status?.models?.en?.installed && !!onOpenSettings,
      actionButtonLabel: t("tool.common.open_settings"),
      actionButtonVariant: "outline",
      onAction: onOpenSettings,
    },
  ];

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-card">
      <CardContent className="p-8 space-y-6">
        
        {/* Status Table */}
        <ServiceStatusTable
          serverUnreachable={serverUnreachable}
          rows={statusRows}
          onRefresh={fetchStatus}
        />

        <div className="space-y-2">
          <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.voice_clone.select_mode")}</label>
          <Select value={language} onValueChange={(v) => setLanguage(v as "vi" | "en")}>
            <SelectTrigger className="bg-card border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vi">{t("tool.voice_clone.mode_vi")}</SelectItem>
              <SelectItem value="en">{t("tool.voice_clone.mode_en")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.voice_clone.select_voice")}</label>
          <Select value={selectedVoice} onValueChange={setSelectedVoice}>
            <SelectTrigger className="bg-card border-border">
              <SelectValue placeholder={t("tool.voice_clone.choose_voice")} />
            </SelectTrigger>
            <SelectContent>
              {voices.map((voice) => (
                <SelectItem key={voice.id} value={voice.id}>
                  {voice.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.voice_clone.text_to_speak")}</label>
          <Textarea
            placeholder={t("tool.voice_clone.text_ph")}
            value={text}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
            className="min-h-[100px] bg-card border-border resize-none"
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
              className={`h-8 text-sm font-semibold px-3 ${charLimitEnabled ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90" : ""}`}
            >
              {charLimitEnabled ? t("tool.common.char_limit_on") : t("tool.common.char_limit_off")}
            </Button>
          </div>
          <div className="flex justify-center pt-1">
            <Button
              size="sm"
              onClick={normalizeText}
              disabled={isNormalizing || !text.trim()}
              className="h-8 text-sm font-semibold px-4 bg-accent text-accent-foreground hover:bg-accent/90 border-0"
            >
              {isNormalizing ? (
                <><Loader2 className="w-3 h-3 mr-1 animate-spin" />{t("tool.voice_clone.normalizing")}</>
              ) : (
                t("tool.voice_clone.normalize_text")
              )}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.voice_clone.speed")}</label>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.voice_clone.cfg_strength")}</label>
            <input
              type="range"
              min="1.0"
              max="5.0"
              step="0.5"
              value={cfgStrength}
              onChange={(e) => setCfgStrength(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.voice_clone.nfe_steps")}</label>
            <Select value={String(nfeStep)} onValueChange={(v) => setNfeStep(parseInt(v, 10))}>
              <SelectTrigger className="bg-card border-border">
                <SelectValue placeholder={t("tool.voice_clone.select_steps")} />
              </SelectTrigger>
              <SelectContent>
                {[16, 32, 64].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.voice_clone.remove_silence")}</label>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={removeSilence} onChange={(e) => setRemoveSilence(e.target.checked)} />
              <span className="text-xs text-muted-foreground">{t("tool.voice_clone.trim_silence")}</span>
            </div>
          </div>
        </div>

        <Button
          className="w-full h-12 bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl font-bold"
          onClick={handleGenerate}
          disabled={isGenerating || !text.trim() || !selectedVoice || overLimit || !statusReady}
        >
          {isGenerating ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Mic className="w-5 h-5 mr-2" />}
          {t("tool.voice_clone.clone_voice")}
        </Button>

        {progress && (
          <div className="w-full p-4 bg-accent/12 rounded-xl border border-accent/45">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-semibold text-accent">
                {progress.message || t("tool.voice_clone.processing")}
              </span>
              <span className="text-sm font-bold text-accent">{progressPercent}%</span>
            </div>
            <div className="w-full bg-muted/60 rounded-full h-2 overflow-hidden">
              <div
                className="bg-accent h-full rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {logs.length > 0 && (
              <div ref={logRef} className="mt-3 max-h-48 overflow-y-auto text-xs font-mono text-accent bg-muted/50 p-2 rounded">
                {logs.map((l, idx) => (
                  <div key={idx}>{l}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {audioUrl && (
          <div className="p-4 bg-emerald-500/12 rounded-xl border border-emerald-500/45 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-emerald-400">{t("tool.voice_clone.audio_ready")}</span>
              <Button size="sm" variant="download" onClick={handleDownload}>
                <Download className="w-4 h-4 mr-2" />
                {t("tool.common.download")}
              </Button>
            </div>
            <audio controls className="w-full h-10">
              <source src={audioUrl} type="audio/wav" />
            </audio>
          </div>
        )}

      </CardContent>
    </Card>
  );
}
