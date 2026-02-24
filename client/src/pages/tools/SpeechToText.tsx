import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Loader2, Download, FileText } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import type { I18nKey } from "@/i18n/translations";
import { APP_API_URL } from "@/lib/api";
import { ServiceStatusTable } from "@/components/common/tool-page-ui";
import type { StatusRowConfig } from "@/components/common/tool-page-ui";
import { useManagedServices } from "@/hooks/useManagedServices";
import { useAppStatus } from "@/context/AppStatusContext";

const MODELS = ["tiny", "base", "small", "medium", "large"] as const;
const LANGUAGES: Array<{ code: string; nameKey: I18nKey }> = [
  { code: "vi", nameKey: "lang.vi" },
  { code: "en", nameKey: "lang.en" },
  { code: "zh", nameKey: "lang.zh" },
  { code: "ja", nameKey: "lang.ja" },
  { code: "ko", nameKey: "lang.ko" },
  { code: "es", nameKey: "lang.es" },
  { code: "fr", nameKey: "lang.fr" },
  { code: "de", nameKey: "lang.de" },
];

type ProgressData = {
  status: string;
  percent: number;
  message?: string;
  logs?: string[];
};

type StatusData = {
  server_unreachable?: boolean;
};

type Segment = {
  id?: number;
  start?: number;
  end?: number;
  text?: string;
};

type ResultData = {
  text: string;
  text_with_punctuation?: string;
  text_no_punctuation?: string;
  punctuation_restored?: boolean;
  language?: string;
  duration?: number | null;
  segments_count?: number;
  segments?: Segment[];
};

function formatTimestamp(seconds?: number) {
  if (seconds === undefined || seconds === null || Number.isNaN(seconds)) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${secs.toFixed(2).padStart(5, "0")}`;
}

export default function SpeechToText({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { t } = useI18n();
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("vi");
  const [model, setModel] = useState<(typeof MODELS)[number]>("base");
  const [addPunctuation, setAddPunctuation] = useState(true);
  const [wordTimestamps, setWordTimestamps] = useState(false);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<ResultData | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const { servicesById } = useManagedServices();
  const { hasMissingDeps } = useAppStatus();
  const serviceStatus = servicesById.app;

  const serverUnreachable = status?.server_unreachable === true;

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const fetchStatus = async () => {
    try {
      const response = await fetch(`${APP_API_URL}/api/v1/status`);
      if (!response.ok) throw new Error("status");
      setStatus({ server_unreachable: false });
    } catch {
      setStatus({ server_unreachable: true });
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    if (!serviceStatus) return;
    if (serviceStatus.status === "running" || serviceStatus.status === "stopped") {
      fetchStatus();
    }
  }, [serviceStatus?.status]);

  const handleTranscribe = async () => {
    if (!audioFile) return;
    setIsTranscribing(true);
    setLogs([]);
    setResult(null);
    setProgress({ status: "starting", percent: 0, message: t("tool.stt.uploading_audio") });

    const formData = new FormData();
    formData.append("file", audioFile);
    formData.append("model", model);
    formData.append("language", language);
    formData.append("add_punctuation", String(addPunctuation));
    formData.append("word_timestamps", String(wordTimestamps));

    try {
      const res = await fetch(`${APP_API_URL}/api/v1/whisper/transcribe`, {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as { task_id: string };
      const taskId = data.task_id;

      const es = new EventSource(`${APP_API_URL}/api/v1/whisper/transcribe/stream/${taskId}`);
      es.onmessage = (event) => {
        const payload = JSON.parse(event.data) as ProgressData;
        setProgress(payload);
        if (payload.logs) setLogs(payload.logs);
        if (payload.status === "complete") {
          es.close();
          setIsTranscribing(false);
          fetch(`${APP_API_URL}/api/v1/whisper/transcribe/result/${taskId}`)
            .then((r) => r.json())
            .then((r: ResultData) => setResult(r))
            .catch(() => {
              setProgress({ status: "error", percent: 0, message: t("tool.stt.failed_load_result") });
            });
        }
        if (payload.status === "error") {
          es.close();
          setIsTranscribing(false);
        }
      };
      es.onerror = () => {
        es.close();
        setIsTranscribing(false);
        setProgress({ status: "error", percent: 0, message: t("tool.stt.lost_connection") });
      };
    } catch (err) {
      console.warn("[STT] Transcribe request failed:", err);
      setProgress({ status: "error", percent: 0, message: t("tool.stt.server_not_reachable") });
      setIsTranscribing(false);
    }
  };

  const handleDownloadText = () => {
    if (!result?.text) return;
    const blob = new Blob([result.text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const progressPercent = useMemo(() => Math.max(0, Math.min(100, progress?.percent || 0)), [progress]);

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-card">
      <CardContent className="p-8 space-y-6">
        <ServiceStatusTable
          serverUnreachable={serverUnreachable}
          rows={[
            {
              id: "server",
              label: t("tool.stt.server_status"),
              isReady: !serverUnreachable,
              path: `${APP_API_URL}/api/v1/whisper`,
              showSecondaryAction: serverUnreachable && Boolean(onOpenSettings),
              secondaryActionLabel: t("tool.common.open_settings"),
              onSecondaryAction: onOpenSettings,
            } satisfies StatusRowConfig,
          ]}
          onRefresh={fetchStatus}
          serverWarning={hasMissingDeps}
          onOpenSettings={onOpenSettings}
        />

        <div className="space-y-2">
          <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.stt.upload_audio")}</label>
          <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-accent transition-colors cursor-pointer">
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
              className="hidden"
              id="audio-upload"
            />
            <label htmlFor="audio-upload" className="cursor-pointer">
              <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-bold text-muted-foreground">
                {audioFile ? audioFile.name : t("tool.stt.click_upload")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{t("tool.common.supported_audio")}</p>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.stt.language")}</label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="bg-card border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {t(lang.nameKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.stt.model")}</label>
            <Select value={model} onValueChange={(v) => setModel(v as (typeof MODELS)[number])}>
              <SelectTrigger className="bg-card border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODELS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.stt.punctuation")}</label>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={addPunctuation} onChange={(e) => setAddPunctuation(e.target.checked)} />
              <span className="text-xs text-muted-foreground">{t("tool.stt.restore_punctuation")}</span>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.stt.word_timestamps")}</label>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={wordTimestamps} onChange={(e) => setWordTimestamps(e.target.checked)} />
              <span className="text-xs text-muted-foreground">{t("tool.stt.enable_word_timestamps")}</span>
            </div>
          </div>
        </div>

        <Button
          className="w-full h-12 bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl font-bold"
          onClick={handleTranscribe}
          disabled={isTranscribing || !audioFile || serverUnreachable}
        >
          {isTranscribing ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <FileText className="w-5 h-5 mr-2" />}
          {t("tool.stt.transcribe")}
        </Button>

        {progress && progress.status !== "waiting" && (
          <div className="w-full p-4 bg-accent/12 rounded-xl border border-accent/45">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-semibold text-accent">
                {progress.message || t("tool.common.processing")}
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
              <div
                ref={logRef}
                className="mt-3 max-h-48 overflow-y-auto text-xs font-mono text-accent bg-muted/50 p-2 rounded"
              >
                {logs.map((l, idx) => (
                  <div key={idx}>{l}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-500/12 rounded-xl border border-emerald-500/45">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-emerald-400">{t("tool.stt.transcription_ready")}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={handleDownloadText}>
                    <Download className="w-4 h-4 mr-2" />
                    TXT
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleDownloadJson}>
                    <Download className="w-4 h-4 mr-2" />
                    JSON
                  </Button>
                </div>
              </div>
              <div className="text-xs text-emerald-400 mb-2">
                {t("tool.stt.language_line", {
                  lang: result.language || t("tool.stt.auto"),
                  duration: result.duration ? `${result.duration}s` : t("tool.stt.na"),
                  segments: result.segments_count ?? result.segments?.length ?? 0,
                })}
              </div>
              <p className="text-sm text-foreground/85 leading-relaxed whitespace-pre-wrap">
                {result.text}
              </p>
            </div>

            {result.text_with_punctuation && result.text_no_punctuation && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 border rounded-lg bg-card">
                  <div className="text-xs font-semibold text-muted-foreground mb-2">{t("tool.stt.with_punctuation")}</div>
                  <div className="text-xs text-foreground/85 whitespace-pre-wrap">
                    {result.text_with_punctuation}
                  </div>
                </div>
                <div className="p-3 border rounded-lg bg-card">
                  <div className="text-xs font-semibold text-muted-foreground mb-2">{t("tool.stt.without_punctuation")}</div>
                  <div className="text-xs text-foreground/85 whitespace-pre-wrap">
                    {result.text_no_punctuation}
                  </div>
                </div>
              </div>
            )}

            {result.segments && result.segments.length > 0 && (
              <div className="p-4 bg-card border border-border rounded-xl">
                <div className="text-xs font-bold text-muted-foreground uppercase mb-3">{t("tool.stt.segments")}</div>
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {result.segments.map((seg, idx) => (
                    <div key={idx} className="text-xs text-foreground/85">
                      <span className="font-mono text-muted-foreground">
                        {formatTimestamp(seg.start)} → {formatTimestamp(seg.end)}
                      </span>{" "}
                      {seg.text}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
