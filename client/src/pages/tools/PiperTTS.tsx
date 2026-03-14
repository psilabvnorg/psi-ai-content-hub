import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Play, Volume2 } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import { APP_API_URL } from "@/lib/api";
import { ProgressDisplay, AudioResult } from "@/components/common/tool-page-ui";
import type { ProgressData } from "@/components/common/tool-page-ui";

const MAX_CHARS = 3000;

const LANGUAGES = [
  { id: "vi", label: "Tiếng Việt" },
  { id: "en", label: "English" },
  { id: "id", label: "Indonesia" },
];

type Voice = {
  id: string;
  name: string;
  language: string;
  demo_url: string | null;
};

type GenerateResponse = {
  status: string;
  file_id: string;
  filename: string;
  download_url: string;
  normalized_text: string;
};

export default function PiperTTS({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { t } = useI18n();

  const [language, setLanguage] = useState("vi");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState("");
  const [text, setText] = useState("");
  const [speed, setSpeed] = useState(1.0);
  const [charLimitEnabled, setCharLimitEnabled] = useState(true);
  const [isNormalizing, setIsNormalizing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string | null>(null);
  const [serverUnreachable, setServerUnreachable] = useState(false);
  const [playingDemo, setPlayingDemo] = useState<string | null>(null);
  const demoAudioRef = useRef<HTMLAudioElement | null>(null);

  const charCount = text.length;
  const overLimit = charLimitEnabled && charCount > MAX_CHARS;

  const fetchVoices = async (lang: string) => {
    try {
      const res = await fetch(`${APP_API_URL}/api/v1/piper-tts/voices?language=${lang}`);
      if (!res.ok) throw new Error("voices");
      const data = await res.json();
      const list = (data.voices || []) as Voice[];
      setVoices(list);
      setSelectedVoice(list.length > 0 ? list[0].id : "");
      setServerUnreachable(false);
    } catch {
      setVoices([]);
      setSelectedVoice("");
      setServerUnreachable(true);
    }
  };

  useEffect(() => {
    fetchVoices(language);
  }, [language]);

  const handlePlayDemo = (voice: Voice) => {
    if (!voice.demo_url) return;
    const url = `${APP_API_URL}${voice.demo_url}`;
    if (playingDemo === voice.id) {
      demoAudioRef.current?.pause();
      setPlayingDemo(null);
      return;
    }
    if (demoAudioRef.current) {
      demoAudioRef.current.pause();
    }
    const audio = new Audio(url);
    demoAudioRef.current = audio;
    audio.play();
    setPlayingDemo(voice.id);
    audio.onended = () => setPlayingDemo(null);
    audio.onerror = () => setPlayingDemo(null);
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

  const handleGenerate = async () => {
    if (!text.trim() || !selectedVoice || overLimit) return;
    setIsGenerating(true);
    setProgress({ status: "starting", percent: 10, message: t("tool.piper_tts.starting") });
    setLogs(["Submitting Piper TTS request..."]);
    setAudioUrl(null);
    setDownloadName(null);

    try {
      setProgress({ status: "processing", percent: 50, message: t("tool.piper_tts.processing") });
      const res = await fetch(`${APP_API_URL}/api/v1/piper-tts/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice_id: selectedVoice, language, speed, normalize: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(String(err.detail || "Generate failed"));
      }
      const data = (await res.json()) as GenerateResponse;
      const url = data.download_url.startsWith("http") ? data.download_url : `${APP_API_URL}${data.download_url}`;
      setLogs((prev) => [...prev, `Generated: ${data.filename}`]);
      setProgress({ status: "complete", percent: 100, message: t("tool.piper_tts.audio_ready") });
      setAudioUrl(url);
      setDownloadName(data.filename || "piper_tts.wav");
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("tool.piper_tts.server_not_reachable");
      setLogs((prev) => [...prev, msg]);
      setProgress({ status: "error", percent: 0, message: msg });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!audioUrl) return;
    try {
      const res = await fetch(audioUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = downloadName || "piper_tts.wav";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(audioUrl, "_blank");
    }
  };

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-card">
      <CardContent className="p-8 space-y-6">

        {/* Language tabs */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.piper_tts.select_language")}</label>
          <div className="flex gap-2">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.id}
                onClick={() => setLanguage(lang.id)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  language === lang.id
                    ? "bg-accent text-accent-foreground border-accent"
                    : "bg-card text-muted-foreground border-border hover:border-accent/50"
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>

        {/* Voice grid */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.piper_tts.select_voice")}</label>
          {voices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {serverUnreachable ? t("tool.piper_tts.server_not_reachable") : t("tool.piper_tts.no_voices")}
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {voices.map((voice) => (
                <div
                  key={voice.id}
                  onClick={() => setSelectedVoice(voice.id)}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedVoice === voice.id
                      ? "border-accent bg-accent/10 text-foreground"
                      : "border-border bg-card hover:border-accent/50"
                  }`}
                >
                  <span className="text-sm font-medium truncate pr-1">{voice.name}</span>
                  {voice.demo_url && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handlePlayDemo(voice); }}
                      className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-full border transition-colors ${
                        playingDemo === voice.id
                          ? "bg-accent text-accent-foreground border-accent"
                          : "border-border hover:border-accent/50 text-muted-foreground hover:text-foreground"
                      }`}
                      title={t("tool.piper_tts.play_demo")}
                    >
                      <Play className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Text input */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.piper_tts.text_to_speak")}</label>
          <Textarea
            placeholder={t("tool.piper_tts.text_ph")}
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

        {/* Speed */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-muted-foreground uppercase">
            {t("tool.piper_tts.speed")} — {speed.toFixed(1)}x
          </label>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] font-bold uppercase text-muted-foreground">
            <span>0.5x</span>
            <span>1.0x</span>
            <span>2.0x</span>
          </div>
        </div>

        {/* Generate */}
        <Button
          className="w-full h-12 bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl font-bold"
          onClick={handleGenerate}
          disabled={isGenerating || !text.trim() || overLimit || !selectedVoice}
        >
          {isGenerating ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Volume2 className="w-5 h-5 mr-2" />}
          {t("tool.piper_tts.generate")}
        </Button>

        <ProgressDisplay progress={progress} logs={logs} defaultMessage={t("tool.piper_tts.processing")} />

        <AudioResult
          audioUrl={audioUrl}
          downloadName={downloadName}
          duration={null}
          onDownload={handleDownload}
          readyMessage={t("tool.piper_tts.audio_ready")}
        />
      </CardContent>
    </Card>
  );
}
