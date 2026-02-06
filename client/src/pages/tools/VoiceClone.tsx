import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mic, Loader2, Download, AlertCircle } from "lucide-react";

const VOICE_CLONE_API = "http://127.0.0.1:8188";
const MAX_CHARS = 500;

type Voice = {
  id: string;
  name: string;
  description?: string;
  language?: string;
  gender?: string;
};

type Sample = {
  id: string;
  filename: string;
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

async function consumeSseStream(response: Response, onMessage: (data: any) => void) {
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
          onMessage(JSON.parse(payload));
        } catch {
          // ignore
        }
      }
    }
  }
}

export default function VoiceClone() {
  const [text, setText] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [isSetupLoading, setIsSetupLoading] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
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
  const statusReady = status?.model_ready && status?.voices_ready;

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const fetchStatus = async () => {
    // In Electron, check runtime status via IPC first
    if (window.electronAPI) {
      try {
        const ipcStatus = await window.electronAPI.voiceCloneStatus();
        if (!ipcStatus.runtime_ready) {
          setStatus({ model_ready: false, voices_ready: false, runtime_ready: false });
          return;
        }
      } catch {}
    }
    try {
      const res = await fetch(`${VOICE_CLONE_API}/voice-clone/status`);
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus({ model_ready: false });
    }
  };

  const fetchVoices = async () => {
    try {
      const res = await fetch(`${VOICE_CLONE_API}/voice-clone/voices`);
      const data = await res.json();
      setVoices(data.voices || []);
    } catch {}
  };

  const fetchSamples = async () => {
    try {
      const res = await fetch(`${VOICE_CLONE_API}/voice-clone/samples`);
      const data = await res.json();
      setSamples(data.samples || []);
    } catch {}
  };

  useEffect(() => {
    fetchStatus();
    fetchVoices();
    fetchSamples();
  }, []);

  const runSetup = async () => {
    setIsSetupLoading(true);
    setLogs([]);
    setProgress({ status: "starting", percent: 0, message: "Setting up runtime..." });

    // In Electron, use IPC to install runtime via main process
    if (window.electronAPI) {
      const cleanup = window.electronAPI.onVoiceCloneSetupProgress((data) => {
        setProgress(data);
        if (data.logs) setLogs(data.logs);
      });
      try {
        const result = await window.electronAPI.voiceCloneSetup();
        if (!result.success) {
          setProgress({ status: "error", percent: 0, message: result.error || "Setup failed" });
        }
      } catch (err) {
        console.warn("[VoiceClone] IPC setup failed:", err);
        setProgress({ status: "error", percent: 0, message: "Setup failed unexpectedly." });
      } finally {
        cleanup();
        setIsSetupLoading(false);
        fetchStatus();
      }
      return;
    }

    // Fallback: call Python server directly (web mode)
    try {
      const res = await fetch(`${VOICE_CLONE_API}/voice-clone/setup`, { method: "POST" });
      await consumeSseStream(res, (data) => {
        setProgress(data);
        if (data.logs) setLogs(data.logs);
      });
    } catch (err) {
      console.warn("[VoiceClone] Setup request failed:", err);
      setProgress({ status: "error", percent: 0, message: "Setup server not reachable. Is the voice clone server running?" });
    } finally {
      setIsSetupLoading(false);
      fetchStatus();
    }
  };

  const runModelDownload = async () => {
    setIsModelLoading(true);
    setLogs([]);
    setProgress({ status: "starting", percent: 0, message: "Downloading model..." });
    try {
      const res = await fetch(`${VOICE_CLONE_API}/voice-clone/model`, { method: "POST" });
      await consumeSseStream(res, (data) => {
        setProgress(data);
        if (data.logs) setLogs(data.logs);
      });
    } catch (err) {
      console.warn("[VoiceClone] Model download request failed:", err);
      setProgress({ status: "error", percent: 0, message: "Voice clone server not reachable." });
    } finally {
      setIsModelLoading(false);
      fetchStatus();
    }
  };

  const handleGenerate = async () => {
    if (!text.trim() || !selectedVoice || overLimit) return;
    setIsGenerating(true);
    setProgress({ status: "starting", percent: 0, message: "Starting generation..." });
    setLogs([]);
    setAudioUrl(null);
    setDownloadName(null);

    try {
      const res = await fetch(`${VOICE_CLONE_API}/voice-clone/start`, {
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
      const es = new EventSource(`${VOICE_CLONE_API}/voice-clone/progress/${taskId}`);

      es.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        setProgress(payload);
        if (payload.logs) setLogs(payload.logs);
        if (payload.status === "complete") {
          es.close();
          setIsGenerating(false);
          const url = `${VOICE_CLONE_API}/voice-clone/download/${taskId}`;
          setAudioUrl(url);
          setDownloadName(payload.filename || "voice.wav");
        }
        if (payload.status === "error") {
          es.close();
          setIsGenerating(false);
        }
      };
    } catch (err) {
      console.warn("[VoiceClone] Generate request failed:", err);
      setProgress({ status: "error", percent: 0, message: "Voice clone server not reachable." });
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
        {!statusReady && (
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Voice Clone Not Ready</p>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {status?.model_ready ? "Runtime ready." : "Model not downloaded yet."}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={runSetup} disabled={isSetupLoading}>
                    {isSetupLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Setup Runtime
                  </Button>
                  <Button size="sm" variant="outline" onClick={runModelDownload} disabled={isModelLoading}>
                    {isModelLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Download Model
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase">Select Voice</label>
          <Select value={selectedVoice} onValueChange={setSelectedVoice}>
            <SelectTrigger className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
              <SelectValue placeholder="Choose a preset voice..." />
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
          <label className="text-xs font-bold text-zinc-500 uppercase">Text to Speak</label>
          <Textarea
            placeholder="Enter text to clone with selected voice..."
            value={text}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
            className="min-h-[100px] bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 resize-none"
          />
          <p className={`text-xs ${overLimit ? "text-red-500" : "text-zinc-400"}`}>
            {charCount}/{MAX_CHARS} characters
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase">Speed</label>
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
            <label className="text-xs font-bold text-zinc-500 uppercase">CFG Strength</label>
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
            <label className="text-xs font-bold text-zinc-500 uppercase">NFE Steps</label>
            <Select value={String(nfeStep)} onValueChange={(v) => setNfeStep(parseInt(v, 10))}>
              <SelectTrigger className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
                <SelectValue placeholder="Select steps" />
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
            <label className="text-xs font-bold text-zinc-500 uppercase">Remove Silence</label>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={removeSilence} onChange={(e) => setRemoveSilence(e.target.checked)} />
              <span className="text-xs text-zinc-500">Trim long silences</span>
            </div>
          </div>
        </div>

        <Button
          className="w-full h-12 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold"
          onClick={handleGenerate}
          disabled={isGenerating || !text.trim() || !selectedVoice || overLimit || !statusReady}
        >
          {isGenerating ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Mic className="w-5 h-5 mr-2" />}
          Clone Voice
        </Button>

        {progress && (
          <div className="w-full p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                {progress.message || "Processing..."}
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
              <span className="text-sm font-bold text-green-700 dark:text-green-400">Cloned Audio Ready</span>
              <Button size="sm" variant="download" onClick={handleDownload}>
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            </div>
            <audio controls className="w-full h-10">
              <source src={audioUrl} type="audio/wav" />
            </audio>
          </div>
        )}

        {samples.length > 0 && (
          <div className="space-y-3">
            <div className="text-xs font-bold text-zinc-500 uppercase">Samples</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {samples.map((s) => (
                <div key={s.id} className="p-3 border rounded-lg bg-white dark:bg-zinc-900">
                  <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">{s.filename}</div>
                  <audio controls className="w-full h-8">
                    <source src={`${VOICE_CLONE_API}/voice-clone/samples/${s.id}`} type="audio/wav" />
                  </audio>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
