import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Download, Volume2, AlertCircle, Settings2 } from "lucide-react";

const TTS_FAST_API = "http://127.0.0.1:8189";
const MAX_CHARS = 3000;

type Voice = { id: string; name: string; description?: string };
type SampleVoice = { id: string; filename: string; url: string };
type SampleText = { id: string; filename: string; preview: string };

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
  model_loaded?: boolean;
  vieneu_exists?: boolean;
  config_exists?: boolean;
  deps_ok?: boolean;
  deps_missing?: string[];
  voices_ready?: boolean;
  runtime_ready?: boolean;
  server_running?: boolean;
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
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [selectedVoice, setSelectedVoice] = useState("");
  const [selectedSampleVoice, setSelectedSampleVoice] = useState("");
  const [selectedSampleText, setSelectedSampleText] = useState("");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [sampleVoices, setSampleVoices] = useState<SampleVoice[]>([]);
  const [sampleTexts, setSampleTexts] = useState<SampleText[]>([]);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [modelConfigs, setModelConfigs] = useState<ModelConfig | null>(null);
  const [selectedBackbone, setSelectedBackbone] = useState("");
  const [selectedCodec, setSelectedCodec] = useState("");
  const [isSetupLoading, setIsSetupLoading] = useState(false);
  const [isDepsInstalling, setIsDepsInstalling] = useState(false);
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
  const runtimeNotReady = status?.runtime_ready === false;
  const depsNotOk = status && status.deps_ok === false;
  const modelReady = status?.model_loaded === true;
  const statusReady = status?.model_loaded && status?.voices_ready && status?.deps_ok;

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // --- Data fetching ---
  const fetchStatus = async () => {
    if (window.electronAPI) {
      try {
        const ipcStatus = await window.electronAPI.ttsFastStatus();
        if (!ipcStatus.runtime_ready) {
          setStatus({ model_loaded: false, runtime_ready: false, server_running: false });
          return;
        }
        if (!ipcStatus.server_running) {
          await window.electronAPI.ttsFastStartServer();
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch { /* fall through */ }
    }
    try {
      const res = await fetch(`${TTS_FAST_API}/tts-fast/status`);
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus({ model_loaded: false, server_unreachable: true });
    }
  };

  const fetchVoices = async () => {
    try {
      const res = await fetch(`${TTS_FAST_API}/tts-fast/voices`);
      const data = await res.json();
      setVoices(data.voices || []);
    } catch { /* */ }
  };

  const fetchSamples = async () => {
    try {
      const res = await fetch(`${TTS_FAST_API}/tts-fast/samples`);
      const data = await res.json();
      setSampleVoices(data.sample_voices || []);
      setSampleTexts(data.sample_texts || []);
    } catch { /* */ }
  };

  const fetchModelConfigs = async () => {
    try {
      const res = await fetch(`${TTS_FAST_API}/tts-fast/model/configs`);
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
    fetchSamples();
    fetchModelConfigs();
  }, []);

  // --- Setup Runtime (shared venv via Electron IPC, same as VoiceClone) ---
  const runSetup = async () => {
    setIsSetupLoading(true);
    setLogs([]);
    setProgress({ status: "starting", percent: 0, message: "Setting up runtime..." });

    if (window.electronAPI) {
      const cleanup = window.electronAPI.onVoiceCloneSetupProgress((data: ProgressData) => {
        setProgress(data);
        if (data.logs) setLogs(data.logs);
      });
      try {
        const result = await window.electronAPI.voiceCloneSetup();
        if (!result.success) {
          setProgress({ status: "error", percent: 0, message: result.error || "Setup failed" });
        }
      } catch (err) {
        console.warn("[TTSFast] IPC setup failed:", err);
        setProgress({ status: "error", percent: 0, message: "Setup failed unexpectedly." });
      } finally {
        cleanup();
        setIsSetupLoading(false);
        fetchStatus();
      }
      return;
    }

    // Web fallback
    try {
      const res = await fetch(`${TTS_FAST_API}/tts-fast/setup`, { method: "POST" });
      await consumeSseStream(res, (data) => {
        setProgress(data);
        if (data.logs) setLogs(data.logs);
      });
    } catch {
      setProgress({ status: "error", percent: 0, message: "Server not reachable." });
    } finally {
      setIsSetupLoading(false);
      fetchStatus();
    }
  };

  // --- Install VieNeu-TTS deps ---
  const runInstallDeps = async () => {
    setIsDepsInstalling(true);
    setLogs([]);
    setProgress({ status: "starting", percent: 0, message: "Installing VieNeu-TTS dependencies..." });
    try {
      const res = await fetch(`${TTS_FAST_API}/tts-fast/install-deps`, { method: "POST" });
      await consumeSseStream(res, (data) => {
        setProgress(data);
        if (data.logs) setLogs(data.logs);
      });
    } catch {
      setProgress({ status: "error", percent: 0, message: "Server not reachable." });
    } finally {
      setIsDepsInstalling(false);
      fetchStatus();
    }
  };

  // --- Load Model ---
  const handleLoadModel = async () => {
    if (!selectedBackbone || !selectedCodec) return;
    setIsModelLoading(true);
    setLogs([]);
    setProgress({ status: "starting", percent: 0, message: "Loading model..." });
    try {
      const res = await fetch(`${TTS_FAST_API}/tts-fast/model/load`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backbone: selectedBackbone, codec: selectedCodec, device: "auto" }),
      });
      await consumeSseStream(res, (data) => {
        setProgress(data);
        if (data.logs) setLogs(data.logs);
      });
    } catch {
      setProgress({ status: "error", percent: 0, message: "Failed to load model." });
    } finally {
      setIsModelLoading(false);
      fetchStatus();
    }
  };

  // --- Generate ---
  const handleGenerate = async () => {
    if (!text.trim() || overLimit) return;
    if (mode === "preset" && !selectedVoice) return;
    if (mode === "custom" && (!selectedSampleVoice || !selectedSampleText)) return;

    setIsGenerating(true);
    setProgress({ status: "starting", percent: 0, message: "Starting generation..." });
    setLogs([]);
    setAudioUrl(null);
    setDownloadName(null);
    setAudioDuration(null);

    try {
      const payload: Record<string, unknown> = { text, mode };
      if (mode === "preset") payload.voice_id = selectedVoice;
      else {
        payload.sample_voice_id = selectedSampleVoice;
        payload.sample_text_id = selectedSampleText;
      }

      const res = await fetch(`${TTS_FAST_API}/tts-fast/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      const taskId = data.task_id;

      const es = new EventSource(`${TTS_FAST_API}/tts-fast/progress/${taskId}`);
      es.onmessage = (event) => {
        const p: ProgressData = JSON.parse(event.data);
        setProgress(p);
        if (p.logs) setLogs(p.logs);
        if (p.status === "complete") {
          es.close();
          setIsGenerating(false);
          setAudioUrl(`${TTS_FAST_API}/tts-fast/download/${taskId}`);
          setDownloadName(p.filename || "tts.wav");
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
        setProgress({ status: "error", percent: 0, message: "Lost connection to TTS server" });
      };
    } catch {
      setProgress({ status: "error", percent: 0, message: "TTS server not reachable." });
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

        {/* Setup Warning — like VoiceClone */}
        {!statusReady && !serverUnreachable && (
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Fast TTS Not Ready</p>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {runtimeNotReady
                    ? "Python runtime not set up yet. Click 'Setup Runtime' to create the virtual environment and install dependencies."
                    : depsNotOk
                    ? `Missing dependencies: ${status?.deps_missing?.join(", ")}. Click 'Install Dependencies' to fix.`
                    : !modelReady
                    ? "Model not loaded yet. Select backbone/codec below and click 'Load Model'."
                    : "Setup incomplete."}
                </p>
                <div className="flex gap-2 flex-wrap">
                  {runtimeNotReady && (
                    <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={runSetup} disabled={isSetupLoading}>
                      {isSetupLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Setup Runtime
                    </Button>
                  )}
                  {!runtimeNotReady && depsNotOk && (
                    <Button size="sm" variant="outline" onClick={runInstallDeps} disabled={isDepsInstalling}>
                      {isDepsInstalling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Install Dependencies
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={fetchStatus}>
                    Refresh Status
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Server unreachable */}
        {serverUnreachable && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-semibold text-red-800 dark:text-red-300">Server Not Reachable</p>
                <p className="text-xs text-red-700 dark:text-red-400">
                  Fast TTS server is not running on port 8189. Setup the runtime first, then the server will start automatically.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={runSetup} disabled={isSetupLoading}>
                    {isSetupLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Setup Runtime
                  </Button>
                  <Button size="sm" variant="outline" onClick={fetchStatus}>
                    Retry
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Model Loading Section */}
        {!serverUnreachable && !runtimeNotReady && !depsNotOk && !modelReady && modelConfigs && (
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 space-y-3">
            <div className="flex items-start gap-3">
              <Settings2 className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div className="flex-1 space-y-3">
                <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">Load TTS Model</p>
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  Select backbone and codec, then load the model before generating speech.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-500 uppercase">Backbone</label>
                    <Select value={selectedBackbone} onValueChange={setSelectedBackbone}>
                      <SelectTrigger className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
                        <SelectValue placeholder="Select backbone..." />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(modelConfigs.backbones).map((k) => (
                          <SelectItem key={k} value={k}>{k}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-zinc-500 uppercase">Codec</label>
                    <Select value={selectedCodec} onValueChange={setSelectedCodec}>
                      <SelectTrigger className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
                        <SelectValue placeholder="Select codec..." />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(modelConfigs.codecs).map((k) => (
                          <SelectItem key={k} value={k}>{k}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={handleLoadModel} disabled={isModelLoading || !selectedBackbone || !selectedCodec}>
                  {isModelLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Load Model
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Mode Selection */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase">Mode</label>
          <div className="flex gap-2">
            <Button size="sm" variant={mode === "preset" ? "default" : "outline"} onClick={() => setMode("preset")}>Preset Voice</Button>
            <Button size="sm" variant={mode === "custom" ? "default" : "outline"} onClick={() => setMode("custom")}>Custom Voice</Button>
          </div>
        </div>

        {/* Voice Selection */}
        {mode === "preset" && (
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase">Select Voice</label>
            <Select value={selectedVoice} onValueChange={setSelectedVoice}>
              <SelectTrigger className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
                <SelectValue placeholder="Choose a preset voice..." />
              </SelectTrigger>
              <SelectContent>
                {voices.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name} {v.description ? `— ${v.description}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Custom Voice Selection */}
        {mode === "custom" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase">Sample Voice</label>
              <Select value={selectedSampleVoice} onValueChange={setSelectedSampleVoice}>
                <SelectTrigger className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
                  <SelectValue placeholder="Choose sample voice..." />
                </SelectTrigger>
                <SelectContent>
                  {sampleVoices.map((sv) => (<SelectItem key={sv.id} value={sv.id}>{sv.id}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase">Sample Text</label>
              <Select value={selectedSampleText} onValueChange={setSelectedSampleText}>
                <SelectTrigger className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
                  <SelectValue placeholder="Choose sample text..." />
                </SelectTrigger>
                <SelectContent>
                  {sampleTexts.map((st) => (<SelectItem key={st.id} value={st.id}>{st.id} — {st.preview}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Text Input */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase">Text to Speak</label>
          <Textarea
            placeholder="Enter text to convert to speech..."
            value={text}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
            className="min-h-[120px] bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 resize-none"
          />
          <p className={`text-xs ${overLimit ? "text-red-500" : "text-zinc-400"}`}>{charCount}/{MAX_CHARS} characters</p>
        </div>

        {/* Generate Button */}
        <Button
          className="w-full h-12 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold"
          onClick={handleGenerate}
          disabled={isGenerating || !text.trim() || overLimit || !statusReady || (mode === "preset" && !selectedVoice) || (mode === "custom" && (!selectedSampleVoice || !selectedSampleText))}
        >
          {isGenerating ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Volume2 className="w-5 h-5 mr-2" />}
          Generate Speech
        </Button>

        {/* Progress */}
        {progress && progress.status !== "waiting" && (
          <div className="w-full p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">{progress.message || "Processing..."}</span>
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
              <span className="text-sm font-bold text-green-700 dark:text-green-400">Audio Ready</span>
              <Button size="sm" variant="outline" onClick={handleDownload}>
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            </div>
            {audioDuration !== null && (
              <div className="text-xs text-green-700 dark:text-green-400">Duration: {audioDuration}s</div>
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
