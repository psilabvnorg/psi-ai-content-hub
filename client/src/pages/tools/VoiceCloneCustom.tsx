import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/i18n";
import { APP_API_URL, F5_API_URL } from "@/lib/api";
import { useManagedServices } from "@/hooks/useManagedServices";
import { CheckCircle, Download, Loader2, Mic, RefreshCw, Upload, XCircle } from "lucide-react";

const MAX_CHARS = 500;

type Voice = {
  id: string;
  name: string;
  description?: string;
  language?: string;
  gender?: string;
  custom?: boolean;
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
};

type TrimResponse = {
  status?: string;
  filename?: string;
  download_url?: string;
};

type WhisperResult = {
  text?: string;
  language?: string;
};

type RegisterVoiceResponse = {
  status: string;
  voice?: Voice;
};

type GenerateDownloadResponse = {
  filename?: string;
  download_url?: string;
};

export default function VoiceCloneCustom({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { t } = useI18n();
  const [language, setLanguage] = useState<"vi" | "en">("vi");
  const [status, setStatus] = useState<StatusData | null>(null);

  const [sampleFile, setSampleFile] = useState<File | null>(null);
  const [setupProgress, setSetupProgress] = useState<ProgressData | null>(null);
  const [setupLogs, setSetupLogs] = useState<string[]>([]);
  const [processingSample, setProcessingSample] = useState(false);
  const [trimmedFile, setTrimmedFile] = useState<File | null>(null);
  const [trimmedAudioUrl, setTrimmedAudioUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");

  const [registerName, setRegisterName] = useState("");
  const [registeringVoice, setRegisteringVoice] = useState(false);
  const [registeredVoices, setRegisteredVoices] = useState<Voice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState("");

  const [text, setText] = useState("");
  const [speed, setSpeed] = useState(1.0);
  const [cfgStrength, setCfgStrength] = useState(2.0);
  const [nfeStep, setNfeStep] = useState(32);
  const [removeSilence, setRemoveSilence] = useState(false);
  const [charLimitEnabled, setCharLimitEnabled] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState<ProgressData | null>(null);
  const [generateLogs, setGenerateLogs] = useState<string[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string | null>(null);

  const setupLogRef = useRef<HTMLDivElement>(null);
  const generateLogRef = useRef<HTMLDivElement>(null);

  const { servicesById, start, stop, restart, isBusy } = useManagedServices();
  const serviceStatus = servicesById.f5;
  const serviceRunning = serviceStatus?.status === "running";
  const serviceBusy = isBusy("f5");

  const charCount = text.length;
  const overLimit = charLimitEnabled && charCount > MAX_CHARS;
  const serverUnreachable = status?.server_unreachable === true;
  const depsReady = status?.env?.installed === true;
  const modelReady = status?.models?.[language]?.installed === true;
  const statusReady = !serverUnreachable && depsReady && modelReady;

  useEffect(() => {
    if (setupLogRef.current) {
      setupLogRef.current.scrollTop = setupLogRef.current.scrollHeight;
    }
  }, [setupLogs]);

  useEffect(() => {
    if (generateLogRef.current) {
      generateLogRef.current.scrollTop = generateLogRef.current.scrollHeight;
    }
  }, [generateLogs]);

  useEffect(() => {
    return () => {
      if (trimmedAudioUrl) {
        URL.revokeObjectURL(trimmedAudioUrl);
      }
    };
  }, [trimmedAudioUrl]);

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

  const fetchRegisteredVoices = async (lang: "vi" | "en" = language) => {
    try {
      const res = await fetch(`${F5_API_URL}/api/v1/voices?language=${lang}&custom_only=true`);
      if (!res.ok) throw new Error("voices");
      const data = (await res.json()) as { voices?: Voice[] };
      setRegisteredVoices(data.voices || []);
      if (!data.voices?.find((voice) => voice.id === selectedVoice)) {
        setSelectedVoice("");
      }
    } catch {
      setRegisteredVoices([]);
      setSelectedVoice("");
    }
  };

  useEffect(() => {
    void fetchStatus();
    void fetchRegisteredVoices(language);
  }, []);

  useEffect(() => {
    setSelectedVoice("");
    void fetchRegisteredVoices(language);
    setRegisterName("");
  }, [language]);

  useEffect(() => {
    if (!serviceStatus) return;
    if (serviceStatus.status === "running" || serviceStatus.status === "stopped") {
      void fetchStatus();
      void fetchRegisteredVoices(language);
    }
  }, [serviceStatus?.status]);

  const handleToggleServer = async () => {
    if (!serviceStatus) return;
    if (serviceRunning) {
      await stop("f5");
      setStatus({ server_unreachable: true });
      return;
    }
    await start("f5");
    await fetchStatus();
    await fetchRegisteredVoices(language);
  };

  const handleSampleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setSampleFile(file);
    setSetupProgress(null);
    setSetupLogs([]);
    setTranscript("");
    setTrimmedFile(null);
    if (trimmedAudioUrl) {
      URL.revokeObjectURL(trimmedAudioUrl);
      setTrimmedAudioUrl(null);
    }
  };

  const handleProcessSample = async () => {
    if (!sampleFile) return;
    setProcessingSample(true);
    setSetupLogs([]);
    setTranscript("");
    setTrimmedFile(null);
    if (trimmedAudioUrl) {
      URL.revokeObjectURL(trimmedAudioUrl);
      setTrimmedAudioUrl(null);
    }
    setSetupProgress({ status: "processing", percent: 5, message: t("tool.voice_clone_custom.step_trim") });

    try {
      const trimForm = new FormData();
      trimForm.append("file", sampleFile);
      trimForm.append("start_time", "00:00:00");
      trimForm.append("end_time", "00:00:10");
      trimForm.append("output_format", "wav");

      const trimRes = await fetch(`${APP_API_URL}/api/v1/audio/trim`, {
        method: "POST",
        body: trimForm,
      });
      if (!trimRes.ok) {
        throw new Error("Trim request failed");
      }
      const trimPayload = (await trimRes.json()) as TrimResponse;
      if (!trimPayload.download_url) {
        throw new Error("Trim output not found");
      }

      setSetupProgress({ status: "processing", percent: 40, message: t("tool.voice_clone_custom.step_download_trimmed") });
      const trimmedDownloadRes = await fetch(`${APP_API_URL}${trimPayload.download_url}`);
      if (!trimmedDownloadRes.ok) {
        throw new Error("Failed to download trimmed sample");
      }
      const trimmedBlob = await trimmedDownloadRes.blob();
      const nextTrimmedFile = new File(
        [trimmedBlob],
        trimPayload.filename || `trimmed_${Date.now()}.wav`,
        { type: "audio/wav" }
      );
      const nextTrimmedAudioUrl = URL.createObjectURL(trimmedBlob);
      setTrimmedFile(nextTrimmedFile);
      setTrimmedAudioUrl(nextTrimmedAudioUrl);

      setSetupProgress({ status: "processing", percent: 55, message: t("tool.voice_clone_custom.step_transcribe") });
      const sttForm = new FormData();
      sttForm.append("file", nextTrimmedFile);
      sttForm.append("model", "large-v3");
      sttForm.append("language", language);
      sttForm.append("add_punctuation", "true");
      sttForm.append("word_timestamps", "false");

      const sttRes = await fetch(`${APP_API_URL}/api/v1/whisper/transcribe`, {
        method: "POST",
        body: sttForm,
      });
      if (!sttRes.ok) {
        throw new Error("Transcribe request failed");
      }

      const sttPayload = (await sttRes.json()) as { task_id?: string };
      const sttTaskId = sttPayload.task_id;
      if (!sttTaskId) {
        throw new Error("Transcribe task not found");
      }

      await new Promise<void>((resolve, reject) => {
        const stream = new EventSource(`${APP_API_URL}/api/v1/whisper/transcribe/stream/${sttTaskId}`);
        stream.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data) as ProgressData;
            if (payload.logs) {
              setSetupLogs(payload.logs);
            }
            const whisperPercent = Math.max(0, Math.min(100, payload.percent || 0));
            const mappedPercent = 55 + Math.floor(whisperPercent * 0.4);
            setSetupProgress({
              status: payload.status,
              percent: payload.status === "complete" ? 95 : mappedPercent,
              message: payload.message || t("tool.voice_clone_custom.step_transcribe"),
            });
            if (payload.status === "complete") {
              stream.close();
              resolve();
              return;
            }
            if (payload.status === "error") {
              stream.close();
              reject(new Error(payload.message || "Transcribe failed"));
            }
          } catch {
            // Ignore malformed keep-alive events.
          }
        };
        stream.onerror = () => {
          stream.close();
          reject(new Error("Lost STT stream connection"));
        };
      });

      const sttResultRes = await fetch(`${APP_API_URL}/api/v1/whisper/transcribe/result/${sttTaskId}`);
      if (!sttResultRes.ok) {
        throw new Error("Failed to load transcript result");
      }
      const sttResult = (await sttResultRes.json()) as WhisperResult;
      setTranscript((sttResult.text || "").trim());
      setSetupProgress({ status: "complete", percent: 100, message: t("tool.voice_clone_custom.sample_ready") });
    } catch (error) {
      const message = error instanceof Error ? error.message : t("tool.common.error");
      setSetupProgress({ status: "error", percent: 0, message });
    } finally {
      setProcessingSample(false);
    }
  };

  const handleRegisterVoice = async () => {
    if (!trimmedFile || !transcript.trim() || !registerName.trim()) return;
    setRegisteringVoice(true);
    try {
      const formData = new FormData();
      formData.append("file", trimmedFile);
      formData.append("name", registerName.trim());
      formData.append("language", language);
      formData.append("transcript", transcript.trim());
      formData.append("description", `${registerName.trim()} - ${language === "vi" ? "vietnamese" : "english"}`);

      const registerRequest = () =>
        fetch(`${F5_API_URL}/api/v1/voices/register`, {
          method: "POST",
          body: formData,
        });

      const readRegisterError = async (response: Response): Promise<string> => {
        const defaultMessage = "Register voice failed";
        try {
          const payload = (await response.json()) as { detail?: string; message?: string; error?: string };
          return payload.detail || payload.message || payload.error || defaultMessage;
        } catch {
          try {
            const text = await response.text();
            return text || defaultMessage;
          } catch {
            return defaultMessage;
          }
        }
      };

      let res = await registerRequest();

      // During dev, backend code may be updated while service keeps running old routes.
      // Retry once after restarting F5 service when register endpoint is not found.
      if (res.status === 404 && serviceStatus && serviceStatus.status !== "not_configured") {
        await restart("f5");
        await fetchStatus();
        res = await registerRequest();
      }

      if (!res.ok) {
        throw new Error(await readRegisterError(res));
      }
      const payload = (await res.json()) as RegisterVoiceResponse;
      if (payload.voice?.id) {
        setSelectedVoice(payload.voice.id);
      }
      await fetchRegisteredVoices(language);
      setSetupProgress({ status: "complete", percent: 100, message: t("tool.voice_clone_custom.voice_registered") });
    } catch (error) {
      const message = error instanceof Error ? error.message : t("tool.common.error");
      setSetupProgress({ status: "error", percent: 0, message });
    } finally {
      setRegisteringVoice(false);
    }
  };

  const handleGenerate = async () => {
    if (!text.trim() || !selectedVoice || overLimit) return;
    setIsGenerating(true);
    setGenerateProgress({ status: "starting", percent: 0, message: t("tool.voice_clone.processing") });
    setGenerateLogs([]);
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
      if (!res.ok) {
        throw new Error("Generate request failed");
      }
      const data = (await res.json()) as { task_id?: string };
      if (!data.task_id) {
        throw new Error("Generate task not found");
      }

      const stream = new EventSource(`${F5_API_URL}/api/v1/generate/stream/${data.task_id}`);
      stream.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as ProgressData;
          setGenerateProgress(payload);
          if (payload.logs) setGenerateLogs(payload.logs);
          if (payload.status === "complete") {
            stream.close();
            setIsGenerating(false);
            fetch(`${F5_API_URL}/api/v1/generate/download/${data.task_id}`)
              .then((downloadRes) => downloadRes.json())
              .then((downloadPayload: GenerateDownloadResponse) => {
                if (downloadPayload.download_url) {
                  setAudioUrl(`${F5_API_URL}${downloadPayload.download_url}`);
                }
                setDownloadName(downloadPayload.filename || "voice.wav");
              });
            return;
          }
          if (payload.status === "error") {
            stream.close();
            setIsGenerating(false);
          }
        } catch {
          // ignore malformed keep-alive payload
        }
      };
      stream.onerror = () => {
        stream.close();
        setIsGenerating(false);
        setGenerateProgress({ status: "error", percent: 0, message: t("tool.voice_clone.server_not_reachable") });
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : t("tool.common.error");
      setGenerateProgress({ status: "error", percent: 0, message });
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    const link = document.createElement("a");
    link.href = audioUrl;
    link.download = downloadName || "voice.wav";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const setupPercent = useMemo(() => Math.max(0, Math.min(100, setupProgress?.percent || 0)), [setupProgress]);
  const generatePercent = useMemo(
    () => Math.max(0, Math.min(100, generateProgress?.percent || 0)),
    [generateProgress]
  );

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-card">
      <CardContent className="p-8 space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground/85">{t("tool.voice_clone.service_status")}</h3>
            <Button size="sm" variant="outline" onClick={() => { void fetchStatus(); }}>
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
                  <TableCell className="font-medium">{t("tool.voice_clone.server_status")}</TableCell>
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
                      {serviceStatus && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { void handleToggleServer(); }}
                          disabled={serviceBusy || serviceStatus.status === "not_configured"}
                          className="ml-2"
                        >
                          {serviceBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                          {serviceRunning ? t("tool.common.stop_server") : t("tool.common.start_server")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono break-all">{F5_API_URL}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">{t("tool.voice_clone.env_status")}</TableCell>
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
                      {!serverUnreachable && !status?.env?.installed && onOpenSettings && (
                        <Button size="sm" variant="outline" onClick={onOpenSettings} className="ml-2">
                          {t("tool.common.open_settings")}
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
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.voice_clone.select_mode")}</label>
          <Select value={language} onValueChange={(value) => setLanguage(value as "vi" | "en")}>
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
          <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.voice_clone_custom.sample_voice")}</label>
          <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-accent transition-colors cursor-pointer">
            <input
              type="file"
              accept=".mp3,.wav,audio/mpeg,audio/wav,audio/x-wav,audio/wave"
              onChange={handleSampleFileChange}
              className="hidden"
              id="voice-clone-custom-sample"
            />
            <label htmlFor="voice-clone-custom-sample" className="cursor-pointer">
              <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-bold text-muted-foreground">
                {sampleFile ? sampleFile.name : t("tool.voice_clone_custom.upload_sample")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{t("tool.voice_clone_custom.sample_hint")}</p>
            </label>
          </div>
          <Button
            className="w-full"
            onClick={() => { void handleProcessSample(); }}
            disabled={!sampleFile || processingSample}
          >
            {processingSample ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {t("tool.voice_clone_custom.process_sample")}
          </Button>
        </div>

        {setupProgress && (
          <div className="w-full p-4 bg-accent/12 rounded-xl border border-accent/45">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-semibold text-accent">
                {setupProgress.message || t("tool.voice_clone.processing")}
              </span>
              <span className="text-sm font-bold text-accent">{setupPercent}%</span>
            </div>
            <Progress value={setupPercent} className="h-2" />
            {setupLogs.length > 0 && (
              <div ref={setupLogRef} className="mt-3 max-h-32 overflow-y-auto text-xs font-mono text-accent bg-muted/50 p-2 rounded">
                {setupLogs.map((line, index) => (
                  <div key={`${line}_${index}`}>{line}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {trimmedFile && (
          <div className="space-y-3 border rounded-xl p-4">
            <div className="text-xs font-bold uppercase text-muted-foreground">{t("tool.voice_clone_custom.sample_result")}</div>
            {trimmedAudioUrl && (
              <audio controls className="w-full h-10">
                <source src={trimmedAudioUrl} type="audio/wav" />
              </audio>
            )}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.voice_clone_custom.transcript")}</label>
              <Textarea
                value={transcript}
                onChange={(event) => setTranscript(event.target.value)}
                className="min-h-[100px] bg-card border-border resize-none"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
              <Input
                value={registerName}
                onChange={(event) => setRegisterName(event.target.value)}
                placeholder={t("tool.voice_clone_custom.register_name_ph")}
              />
              <Button
                onClick={() => { void handleRegisterVoice(); }}
                disabled={registeringVoice || !registerName.trim() || !transcript.trim()}
              >
                {registeringVoice ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mic className="w-4 h-4 mr-2" />}
                {t("tool.voice_clone_custom.register_voice")}
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.voice_clone_custom.registered_voices")}</label>
            <Button size="sm" variant="outline" onClick={() => { void fetchRegisteredVoices(language); }}>
              <RefreshCw className="w-4 h-4 mr-2" />
              {t("settings.refresh")}
            </Button>
          </div>
          <Select value={selectedVoice} onValueChange={setSelectedVoice}>
            <SelectTrigger className="bg-card border-border">
              <SelectValue placeholder={t("tool.voice_clone_custom.select_registered_voice")} />
            </SelectTrigger>
            <SelectContent>
              {registeredVoices.length > 0 ? (
                registeredVoices.map((voice) => (
                  <SelectItem key={voice.id} value={voice.id}>
                    {voice.name}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="__no_voice__" disabled>
                  {t("tool.voice_clone_custom.no_registered_voice")}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.voice_clone.text_to_speak")}</label>
          <Textarea
            placeholder={t("tool.voice_clone.text_ph")}
            value={text}
            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setText(event.target.value)}
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
              onChange={(event) => setSpeed(parseFloat(event.target.value))}
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
              onChange={(event) => setCfgStrength(parseFloat(event.target.value))}
              className="w-full"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.voice_clone.nfe_steps")}</label>
            <Select value={String(nfeStep)} onValueChange={(value) => setNfeStep(parseInt(value, 10))}>
              <SelectTrigger className="bg-card border-border">
                <SelectValue placeholder={t("tool.voice_clone.select_steps")} />
              </SelectTrigger>
              <SelectContent>
                {[16, 32, 64].map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.voice_clone.remove_silence")}</label>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={removeSilence} onChange={(event) => setRemoveSilence(event.target.checked)} />
              <span className="text-xs text-muted-foreground">{t("tool.voice_clone.trim_silence")}</span>
            </div>
          </div>
        </div>

        <Button
          className="w-full h-12 bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl font-bold"
          onClick={() => { void handleGenerate(); }}
          disabled={isGenerating || !text.trim() || !selectedVoice || overLimit || !statusReady}
        >
          {isGenerating ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Mic className="w-5 h-5 mr-2" />}
          {t("tool.voice_clone.clone_voice")}
        </Button>

        {generateProgress && (
          <div className="w-full p-4 bg-accent/12 rounded-xl border border-accent/45">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-semibold text-accent">
                {generateProgress.message || t("tool.voice_clone.processing")}
              </span>
              <span className="text-sm font-bold text-accent">{generatePercent}%</span>
            </div>
            <Progress value={generatePercent} className="h-2" />
            {generateLogs.length > 0 && (
              <div ref={generateLogRef} className="mt-3 max-h-48 overflow-y-auto text-xs font-mono text-accent bg-muted/50 p-2 rounded">
                {generateLogs.map((line, index) => (
                  <div key={`${line}_${index}`}>{line}</div>
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
