import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Loader2, Download, AlertCircle, FileText } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import type { I18nKey } from "@/i18n/translations";
import { API_URL } from "@/lib/api";

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
  deps_ok?: boolean;
  deps_missing?: string[];
  ffmpeg_ok?: boolean;
  model_dir?: string;
  cached_models?: string[];
  server_time?: number;
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
  const [status, setStatus] = useState<StatusData | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<ResultData | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const serverUnreachable = status?.server_unreachable === true;
  const depsNotOk = status?.deps_ok === false;
  const ffmpegMissing = status?.ffmpeg_ok === false;
  const whisperMissing = status?.cached_models ? !status.cached_models.includes("large-v3.pt") : false;

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/tools/stt/status`);
      const data = (await res.json()) as StatusData;
      setStatus({ ...data, server_unreachable: false });
    } catch {
      setStatus({ server_unreachable: true });
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

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

    try {
      const res = await fetch(`${API_URL}/api/tools/stt/transcribe`, {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as { task_id: string };
      const taskId = data.task_id;

      const es = new EventSource(`${API_URL}/api/tools/stt/progress/${taskId}`);
      es.onmessage = (event) => {
        const payload = JSON.parse(event.data) as ProgressData;
        setProgress(payload);
        if (payload.logs) setLogs(payload.logs);
        if (payload.status === "complete") {
          es.close();
          setIsTranscribing(false);
          fetch(`${API_URL}/api/tools/stt/result/${taskId}`)
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
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-white dark:bg-zinc-900">
      <CardContent className="p-8 space-y-6">
        {!serverUnreachable && (depsNotOk || ffmpegMissing || whisperMissing) && (
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t("tool.stt.not_ready")}</p>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {depsNotOk
                    ? t("tool.stt.missing_deps", { deps: status?.deps_missing?.join(", ") || "unknown" })
                    : ffmpegMissing
                    ? t("tool.stt.ffmpeg_missing")
                    : whisperMissing
                    ? t("tool.stt.whisper_missing")
                    : t("tool.stt.setup_incomplete")}
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={onOpenSettings} disabled={!onOpenSettings}>
                    {t("tool.common.open_settings")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={fetchStatus}>
                    {t("tool.stt.refresh_status")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {serverUnreachable && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-semibold text-red-800 dark:text-red-300">{t("tool.stt.server_unreachable")}</p>
                <p className="text-xs text-red-700 dark:text-red-400">
                  {t("tool.stt.server_unreachable_desc")}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={fetchStatus}>
                    {t("tool.stt.retry")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase">{t("tool.stt.upload_audio")}</label>
          <div className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl p-8 text-center hover:border-blue-500 transition-colors cursor-pointer">
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
              className="hidden"
              id="audio-upload"
            />
            <label htmlFor="audio-upload" className="cursor-pointer">
              <Upload className="w-10 h-10 text-zinc-400 mx-auto mb-3" />
              <p className="text-sm font-bold text-zinc-600 dark:text-zinc-400">
                {audioFile ? audioFile.name : t("tool.stt.click_upload")}
              </p>
              <p className="text-xs text-zinc-400 mt-1">{t("tool.common.supported_audio")}</p>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase">{t("tool.stt.language")}</label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
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
            <label className="text-xs font-bold text-zinc-500 uppercase">{t("tool.stt.model")}</label>
            <Select value={model} onValueChange={(v) => setModel(v as (typeof MODELS)[number])}>
              <SelectTrigger className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
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
            <label className="text-xs font-bold text-zinc-500 uppercase">{t("tool.stt.punctuation")}</label>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={addPunctuation} onChange={(e) => setAddPunctuation(e.target.checked)} />
              <span className="text-xs text-zinc-500">{t("tool.stt.restore_punctuation")}</span>
            </div>
          </div>
        </div>

        <Button
          className="w-full h-12 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold"
          onClick={handleTranscribe}
          disabled={isTranscribing || !audioFile || serverUnreachable || depsNotOk || ffmpegMissing || whisperMissing}
        >
          {isTranscribing ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <FileText className="w-5 h-5 mr-2" />}
          {t("tool.stt.transcribe")}
        </Button>

        {progress && progress.status !== "waiting" && (
          <div className="w-full p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                {progress.message || t("tool.common.processing")}
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
              <div
                ref={logRef}
                className="mt-3 max-h-48 overflow-y-auto text-xs font-mono text-blue-700 dark:text-blue-300 bg-white/60 dark:bg-black/20 p-2 rounded"
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
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-green-700 dark:text-green-400">{t("tool.stt.transcription_ready")}</span>
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
              <div className="text-xs text-green-700 dark:text-green-400 mb-2">
                {t("tool.stt.language_line", {
                  lang: result.language || t("tool.stt.auto"),
                  duration: result.duration ? `${result.duration}s` : t("tool.stt.na"),
                  segments: result.segments_count ?? result.segments?.length ?? 0,
                })}
              </div>
              <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
                {result.text}
              </p>
            </div>

            {result.text_with_punctuation && result.text_no_punctuation && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 border rounded-lg bg-white dark:bg-zinc-900">
                  <div className="text-xs font-semibold text-zinc-500 mb-2">{t("tool.stt.with_punctuation")}</div>
                  <div className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                    {result.text_with_punctuation}
                  </div>
                </div>
                <div className="p-3 border rounded-lg bg-white dark:bg-zinc-900">
                  <div className="text-xs font-semibold text-zinc-500 mb-2">{t("tool.stt.without_punctuation")}</div>
                  <div className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                    {result.text_no_punctuation}
                  </div>
                </div>
              </div>
            )}

            {result.segments && result.segments.length > 0 && (
              <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                <div className="text-xs font-bold text-zinc-500 uppercase mb-3">{t("tool.stt.segments")}</div>
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {result.segments.map((seg, idx) => (
                    <div key={idx} className="text-xs text-zinc-700 dark:text-zinc-300">
                      <span className="font-mono text-zinc-500">
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
