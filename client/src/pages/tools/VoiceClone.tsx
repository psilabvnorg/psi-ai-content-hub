import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mic, Loader2, Download, AlertCircle } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import { F5_API_URL } from "@/lib/api";
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
};

type ModelStatus = {
  installed?: boolean;
  model_file?: string | null;
  vocab_file?: string | null;
};

type StatusData = {
  server_unreachable?: boolean;
  env?: EnvStatus;
  model?: ModelStatus;
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

  const charCount = text.length;
  const overLimit = charCount > MAX_CHARS;
  const serverUnreachable = status?.server_unreachable === true;
  const depsReady = status?.env?.installed === true;
  const modelReady = status?.model?.installed === true;
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
      const statusData = (await statusRes.json()) as { models?: { f5_tts?: ModelStatus } };
      setStatus({ server_unreachable: false, env: envData, model: statusData.models?.f5_tts });
    } catch {
      setStatus({ server_unreachable: true });
    }
  };

  const fetchVoices = async () => {
    try {
      const res = await fetch(`${F5_API_URL}/api/v1/voices`);
      const data = await res.json();
      setVoices(data.voices || []);
    } catch {}
  };


  useEffect(() => {
    fetchStatus();
    fetchVoices();
  }, []);

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

  const handleDownload = () => {
    if (!audioUrl) return;
    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = downloadName || "voice.wav";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const progressPercent = useMemo(() => {
    return Math.max(0, Math.min(100, progress?.percent || 0));
  }, [progress]);

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-white dark:bg-zinc-900">
      <CardContent className="p-8 space-y-6">
        {serverUnreachable && (
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t("tool.voice_clone.not_ready")}</p>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {t("tool.voice_clone.server_not_reachable")}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={fetchStatus}>
                    {t("tool.tts_fast.retry")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {!serverUnreachable && !depsReady && (
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t("tool.common.deps_not_ready")}</p>
                <p className="text-xs text-amber-700 dark:text-amber-400">{t("tool.common.go_settings")}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={onOpenSettings} disabled={!onOpenSettings}>
                    {t("tool.common.open_settings")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {!serverUnreachable && depsReady && !modelReady && (
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t("tool.voice_clone.model_not_downloaded")}</p>
                <p className="text-xs text-amber-700 dark:text-amber-400">{t("tool.common.go_settings")}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={onOpenSettings} disabled={!onOpenSettings}>
                    {t("tool.common.open_settings")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase">{t("tool.voice_clone.select_voice")}</label>
          <Select value={selectedVoice} onValueChange={setSelectedVoice}>
            <SelectTrigger className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
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
          <label className="text-xs font-bold text-zinc-500 uppercase">{t("tool.voice_clone.text_to_speak")}</label>
          <Textarea
            placeholder={t("tool.voice_clone.text_ph")}
            value={text}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
            className="min-h-[100px] bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 resize-none"
          />
          <p className={`text-xs ${overLimit ? "text-red-500" : "text-zinc-400"}`}>
            {t("tool.voice_clone.characters", { count: charCount, max: MAX_CHARS })}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase">{t("tool.voice_clone.speed")}</label>
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
            <label className="text-xs font-bold text-zinc-500 uppercase">{t("tool.voice_clone.cfg_strength")}</label>
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
            <label className="text-xs font-bold text-zinc-500 uppercase">{t("tool.voice_clone.nfe_steps")}</label>
            <Select value={String(nfeStep)} onValueChange={(v) => setNfeStep(parseInt(v, 10))}>
              <SelectTrigger className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
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
            <label className="text-xs font-bold text-zinc-500 uppercase">{t("tool.voice_clone.remove_silence")}</label>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={removeSilence} onChange={(e) => setRemoveSilence(e.target.checked)} />
              <span className="text-xs text-zinc-500">{t("tool.voice_clone.trim_silence")}</span>
            </div>
          </div>
        </div>

        <Button
          className="w-full h-12 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold"
          onClick={handleGenerate}
          disabled={isGenerating || !text.trim() || !selectedVoice || overLimit || !statusReady}
        >
          {isGenerating ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Mic className="w-5 h-5 mr-2" />}
          {t("tool.voice_clone.clone_voice")}
        </Button>

        {progress && (
          <div className="w-full p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                {progress.message || t("tool.voice_clone.processing")}
              </span>
              <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{progressPercent}%</span>
            </div>
            <div className="w-full bg-blue-100 dark:bg-blue-900/40 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-600 dark:bg-blue-500 h-full rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {logs.length > 0 && (
              <div ref={logRef} className="mt-3 max-h-48 overflow-y-auto text-xs font-mono text-blue-700 dark:text-blue-300 bg-white/60 dark:bg-black/20 p-2 rounded">
                {logs.map((l, idx) => (
                  <div key={idx}>{l}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {audioUrl && (
          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-green-700 dark:text-green-400">{t("tool.voice_clone.audio_ready")}</span>
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
