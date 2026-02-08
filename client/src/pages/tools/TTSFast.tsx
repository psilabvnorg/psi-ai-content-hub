import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Download, Volume2, AlertCircle, Settings2 } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import { API_URL } from "@/lib/api";
const MAX_CHARS = 3000;

type Voice = { id: string; name: string; description?: string };

type ProgressData = {
  status: string;
  percent: number;
  message?: string;
  logs?: string[];
  file_path?: string;
  filename?: string;
  duration?: number;
  sample_rate?: number;
};

type StatusData = {
  server_unreachable?: boolean;
};

type ModelConfig = {
  backbones: Record<string, { repo: string; [key: string]: unknown }>;
  codecs: Record<string, { repo: string; [key: string]: unknown }>;
};

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
        try { onMessage(JSON.parse(payload)); } catch { /* ignore */ }
      }
    }
  }
}

export default function TTSFast() {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const mode: "preset" = "preset";
  const [selectedVoice, setSelectedVoice] = useState("");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [modelConfigs, setModelConfigs] = useState<ModelConfig | null>(null);
  const [selectedBackbone, setSelectedBackbone] = useState("");
  const [selectedCodec, setSelectedCodec] = useState("");
  const [isModelDownloading, setIsModelDownloading] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const charCount = text.length;
  const overLimit = charCount > MAX_CHARS;

  const serverUnreachable = status?.server_unreachable === true;
  const statusReady = status?.server_unreachable !== true;

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // --- Data fetching ---
  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/system/status`);
      if (!res.ok) throw new Error("status");
      setStatus({ server_unreachable: false });
    } catch {
      setStatus({ server_unreachable: true });
    }
  };

  const fetchVoices = async () => {
    try {
      const res = await fetch(`${API_URL}/api/tools/tts/voices`);
      const data = await res.json();
      setVoices(data.voices || []);
    } catch { /* */ }
  };


  const fetchModelConfigs = async () => {
    try {
      const res = await fetch(`${API_URL}/api/tools/tts/model/configs`);
      const data = await res.json();
      setModelConfigs(data);
      const bbKeys = Object.keys(data.backbones || {});
      const ccKeys = Object.keys(data.codecs || {});
      if (bbKeys.length > 0 && !selectedBackbone) setSelectedBackbone(bbKeys[0]);
      if (ccKeys.length > 0 && !selectedCodec) setSelectedCodec(ccKeys[0]);
    } catch { /* */ }
  };

  useEffect(() => {
    fetchStatus();
    fetchVoices();
    fetchModelConfigs();
  }, []);

  // --- Download Model ---
  const runModelDownload = async () => {
    if (!selectedBackbone || !selectedCodec) return;
    setIsModelDownloading(true);
    setLogs([]);
    setProgress({ status: "starting", percent: 0, message: t("tool.tts_fast.downloading_model") });
    try {
      const res = await fetch(`${API_URL}/api/tools/tts/model/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backbone: selectedBackbone, codec: selectedCodec }),
      });
      await consumeSseStream(res, (data) => {
        setProgress(data);
        if (data.logs) setLogs(data.logs);
      });
    } catch {
        setProgress({ status: "error", percent: 0, message: t("tool.tts_fast.failed_download_model") });
    } finally {
      setIsModelDownloading(false);
      fetchStatus();
    }
  };

  // --- Load Model ---
  const handleLoadModel = async () => {
    if (!selectedBackbone || !selectedCodec) return;
    setIsModelLoading(true);
    setLogs([]);
    setProgress({ status: "starting", percent: 0, message: t("tool.tts_fast.loading_model") });
    try {
      const res = await fetch(`${API_URL}/api/tools/tts/model/load`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backbone: selectedBackbone, codec: selectedCodec, device: "auto" }),
      });
      await consumeSseStream(res, (data) => {
        setProgress(data);
        if (data.logs) setLogs(data.logs);
      });
    } catch {
      setProgress({ status: "error", percent: 0, message: t("tool.tts_fast.failed_load_model") });
    } finally {
      setIsModelLoading(false);
      fetchStatus();
    }
  };

  // --- Generate ---
  const handleGenerate = async () => {
    if (!text.trim() || overLimit) return;
    if (mode === "preset" && !selectedVoice) return;
    if (mode === "custom") return;

    setIsGenerating(true);
    setProgress({ status: "starting", percent: 0, message: t("tool.tts_fast.starting_generation") });
    setLogs([]);
    setAudioUrl(null);
    setDownloadName(null);
    setAudioDuration(null);

    try {
      const payload: Record<string, unknown> = { text, mode, voice_id: selectedVoice };

      const res = await fetch(`${API_URL}/api/tools/tts/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      const taskId = data.task_id;

      const es = new EventSource(`${API_URL}/api/tools/tts/progress/${taskId}`);
      es.onmessage = (event) => {
        const p: ProgressData = JSON.parse(event.data);
        setProgress(p);
        if (p.logs) setLogs(p.logs);
        if (p.status === "complete") {
          es.close();
          setIsGenerating(false);
          fetch(`${API_URL}/api/tools/tts/download/${taskId}`)
            .then((r) => r.json())
            .then((r) => {
              setAudioUrl(`${API_URL}${r.download_url}`);
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

  const progressPercent = useMemo(() => Math.max(0, Math.min(100, progress?.percent || 0)), [progress]);

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-white dark:bg-zinc-900">
      <CardContent className="p-8 space-y-6">

        {/* Server unreachable */}
        {serverUnreachable && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-semibold text-red-800 dark:text-red-300">{t("tool.tts_fast.server_unreachable")}</p>
                <p className="text-xs text-red-700 dark:text-red-400">
                  {t("tool.tts_fast.server_unreachable_desc")}
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

        {/* Model Loading Section */}
        {!serverUnreachable && modelConfigs && (
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 space-y-3">
            <div className="flex items-start gap-3">
              <Settings2 className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div className="flex-1 space-y-3">
                <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">{t("tool.tts_fast.load_model")}</p>
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  {t("tool.tts_fast.load_desc")}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-500 uppercase">{t("tool.tts_fast.backbone")}</label>
                    <Select value={selectedBackbone} onValueChange={setSelectedBackbone}>
                      <SelectTrigger className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
                        <SelectValue placeholder={t("tool.tts_fast.backbone")} />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(modelConfigs.backbones).map((k) => (
                          <SelectItem key={k} value={k}>{k}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-500 uppercase">{t("tool.tts_fast.codec")}</label>
                    <Select value={selectedCodec} onValueChange={setSelectedCodec}>
                      <SelectTrigger className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
                        <SelectValue placeholder={t("tool.tts_fast.codec")} />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(modelConfigs.codecs).map((k) => (
                          <SelectItem key={k} value={k}>{k}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={runModelDownload} disabled={isModelDownloading || !selectedBackbone || !selectedCodec}>
                    {isModelDownloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {t("tool.tts_fast.download_model")}
                  </Button>
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={handleLoadModel} disabled={isModelLoading || !selectedBackbone || !selectedCodec}>
                    {isModelLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {t("tool.tts_fast.load_model_btn")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mode Selection */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase">{t("tool.tts_fast.select_voice")}</label>
          <Select value={selectedVoice} onValueChange={setSelectedVoice}>
            <SelectTrigger className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
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
          <label className="text-xs font-bold text-zinc-500 uppercase">{t("tool.tts_fast.text_to_speak")}</label>
          <Textarea
            placeholder={t("tool.tts_fast.text_ph")}
            value={text}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
            className="min-h-[120px] bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 resize-none"
          />
          <p className={`text-xs ${overLimit ? "text-red-500" : "text-zinc-400"}`}>
            {t("tool.voice_clone.characters", { count: charCount, max: MAX_CHARS })}
          </p>
        </div>

        {/* Generate Button */}
        <Button
          className="w-full h-12 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold"
          onClick={handleGenerate}
          disabled={isGenerating || !text.trim() || overLimit || !statusReady || !selectedVoice}
        >
          {isGenerating ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Volume2 className="w-5 h-5 mr-2" />}
          {t("tool.tts_fast.generate")}
        </Button>

        {/* Progress */}
        {progress && progress.status !== "waiting" && (
          <div className="w-full p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">{progress.message || t("tool.tts_fast.processing")}</span>
              <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{progressPercent}%</span>
            </div>
            <div className="w-full bg-blue-100 dark:bg-blue-900/40 rounded-full h-2 overflow-hidden">
              <div className="bg-blue-600 dark:bg-blue-500 h-full rounded-full transition-all duration-300 ease-out" style={{ width: `${progressPercent}%` }} />
            </div>
            {logs.length > 0 && (
              <div ref={logRef} className="mt-3 max-h-48 overflow-y-auto text-xs font-mono text-blue-700 dark:text-blue-300 bg-white/60 dark:bg-black/20 p-2 rounded">
                {logs.map((l, idx) => (<div key={idx}>{l}</div>))}
              </div>
            )}
          </div>
        )}

        {/* Audio Result */}
        {audioUrl && (
          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-green-700 dark:text-green-400">{t("tool.tts_fast.audio_ready")}</span>
              <Button size="sm" variant="outline" onClick={handleDownload}>
                <Download className="w-4 h-4 mr-2" />
                {t("tool.common.download")}
              </Button>
            </div>
            {audioDuration !== null && (
              <div className="text-xs text-green-700 dark:text-green-400">{t("tool.tts_fast.duration", { seconds: audioDuration })}</div>
            )}
            <audio controls className="w-full h-10">
              <source src={audioUrl} type="audio/wav" />
            </audio>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
