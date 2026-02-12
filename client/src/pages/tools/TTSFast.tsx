import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Download, Volume2, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import { VIENEU_API_URL } from "@/lib/api";
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

type EnvStatus = {
  installed: boolean;
  missing?: string[];
  installed_modules?: string[];
  python_path?: string;
};

type ModelStatus = {
  backbone_ready?: boolean;
  codec_ready?: boolean;
  backbone_dir?: string;
  codec_dir?: string;
  model_loaded?: boolean;
  current_config?: Record<string, unknown>;
};

type StatusData = {
  server_unreachable?: boolean;
  env?: EnvStatus;
  model?: ModelStatus;
};

export default function TTSFast({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const mode: "preset" = "preset";
  const [selectedVoice, setSelectedVoice] = useState("");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [status, setStatus] = useState<StatusData | null>(null);
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
  const depsReady = status?.env?.installed === true;
  const statusReady = status?.server_unreachable !== true && depsReady;

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // --- Data fetching ---
  const fetchStatus = async () => {
    try {
      const [envRes, statusRes] = await Promise.all([
        fetch(`${VIENEU_API_URL}/api/v1/env/status`),
        fetch(`${VIENEU_API_URL}/api/v1/status`),
      ]);
      if (!envRes.ok || !statusRes.ok) throw new Error("status");
      const envData = (await envRes.json()) as EnvStatus;
      const statusData = (await statusRes.json()) as { models?: { vieneu_tts?: ModelStatus } };
      setStatus({ server_unreachable: false, env: envData, model: statusData.models?.vieneu_tts });
    } catch {
      setStatus({ server_unreachable: true });
    }
  };

  const fetchVoices = async () => {
    try {
      const res = await fetch(`${VIENEU_API_URL}/api/v1/voices`);
      const data = await res.json();
      setVoices(data.voices || []);
    } catch { /* */ }
  };

  useEffect(() => {
    fetchStatus();
    fetchVoices();
  }, []);

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

  const progressPercent = useMemo(() => Math.max(0, Math.min(100, progress?.percent || 0)), [progress]);

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

        {/* Status Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground/85">{t("tool.tts_fast.service_status")}</h3>
            <Button size="sm" variant="outline" onClick={fetchStatus}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
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
                <TableCell className="font-medium">{t("tool.tts_fast.server_status")}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {!serverUnreachable ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                    <span className="text-sm">
                      {!serverUnreachable ? t("settings.tools.status.ready") : t("settings.tools.status.not_ready")}
                    </span>
                    {serverUnreachable && onOpenSettings && (
                      <Button size="sm" variant="outline" onClick={onOpenSettings} className="ml-2">
                        {t("tool.common.turn_on_server")}
                      </Button>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs font-mono break-all">
                  {!serverUnreachable ? VIENEU_API_URL : "--"}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">{t("tool.tts_fast.env_status")}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {status?.env?.installed ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                    <span className="text-sm">
                      {status?.env?.installed ? t("settings.tools.status.ready") : t("settings.tools.status.not_ready")}
                    </span>
                    {!status?.env?.installed && onOpenSettings && (
                      <Button size="sm" variant="outline" onClick={onOpenSettings} className="ml-2">
                        {t("tool.common.install_library")}
                      </Button>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs font-mono break-all">
                  {status?.env?.installed_modules?.length
                    ? status.env.installed_modules.join(", ")
                    : status?.env?.missing?.length
                    ? status.env.missing.join(", ")
                    : "--"}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">{t("tool.tts_fast.model_status")}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {status?.model?.backbone_ready && status?.model?.codec_ready ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                    <span className="text-sm">
                      {status?.model?.backbone_ready && status?.model?.codec_ready
                        ? t("settings.tools.status.ready")
                        : t("settings.tools.status.not_ready")}
                    </span>
                    {status?.model?.model_loaded && (
                      <span className="ml-2 text-xs text-green-600">({t("settings.vieneu.model_loaded")})</span>
                    )}
                    {(!status?.model?.backbone_ready || !status?.model?.codec_ready) && onOpenSettings && (
                      <Button size="sm" variant="outline" onClick={onOpenSettings} className="ml-2">
                        {t("tool.common.download_model")}
                      </Button>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs font-mono break-all">
                  {status?.model?.backbone_dir && status?.model?.codec_dir
                    ? `Backbone: ${status.model.backbone_dir}, Codec: ${status.model.codec_dir}`
                    : "--"}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        </div>

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
          <p className={`text-xs ${overLimit ? "text-red-500" : "text-muted-foreground"}`}>
            {t("tool.voice_clone.characters", { count: charCount, max: MAX_CHARS })}
          </p>
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
        {progress && progress.status !== "waiting" && (
          <div className="w-full p-4 bg-accent/12 rounded-xl border border-accent/45">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-semibold text-accent">{progress.message || t("tool.tts_fast.processing")}</span>
              <span className="text-sm font-bold text-accent">{progressPercent}%</span>
            </div>
            <div className="w-full bg-muted/60 rounded-full h-2 overflow-hidden">
              <div className="bg-accent h-full rounded-full transition-all duration-300 ease-out" style={{ width: `${progressPercent}%` }} />
            </div>
            {logs.length > 0 && (
              <div ref={logRef} className="mt-3 max-h-48 overflow-y-auto text-xs font-mono text-accent bg-muted/50 p-2 rounded">
                {logs.map((l, idx) => (<div key={idx}>{l}</div>))}
              </div>
            )}
          </div>
        )}

        {/* Audio Result */}
        {audioUrl && (
          <div className="p-4 bg-emerald-500/12 rounded-xl border border-emerald-500/45 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-emerald-400">{t("tool.tts_fast.audio_ready")}</span>
              <Button size="sm" variant="outline" onClick={handleDownload}>
                <Download className="w-4 h-4 mr-2" />
                {t("tool.common.download")}
              </Button>
            </div>
            {audioDuration !== null && (
              <div className="text-xs text-emerald-400">{t("tool.tts_fast.duration", { seconds: audioDuration })}</div>
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
