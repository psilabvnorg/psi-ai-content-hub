import { type ChangeEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Volume2 } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import { APP_API_URL } from "@/lib/api";
import { ServiceStatusTable, ProgressDisplay, AudioResult } from "@/components/common/tool-page-ui";
import type { ProgressData, StatusRowConfig } from "@/components/common/tool-page-ui";
import { useManagedServices } from "@/hooks/useManagedServices";

const MAX_CHARS = 3000;

const LOCALE_DISPLAY_NAMES: Record<string, string> = {
  "af-ZA": "Afrikaans (South Africa)",
  "am-ET": "Amharic (Ethiopia)",
  "ar-AE": "Arabic (UAE)",
  "ar-BH": "Arabic (Bahrain)",
  "ar-DZ": "Arabic (Algeria)",
  "ar-EG": "Arabic (Egypt)",
  "ar-IQ": "Arabic (Iraq)",
  "ar-JO": "Arabic (Jordan)",
  "ar-KW": "Arabic (Kuwait)",
  "ar-LB": "Arabic (Lebanon)",
  "ar-LY": "Arabic (Libya)",
  "ar-MA": "Arabic (Morocco)",
  "ar-OM": "Arabic (Oman)",
  "ar-QA": "Arabic (Qatar)",
  "ar-SA": "Arabic (Saudi Arabia)",
  "ar-SY": "Arabic (Syria)",
  "ar-TN": "Arabic (Tunisia)",
  "ar-YE": "Arabic (Yemen)",
  "az-AZ": "Azerbaijani (Azerbaijan)",
  "bg-BG": "Bulgarian (Bulgaria)",
  "bn-BD": "Bengali (Bangladesh)",
  "bn-IN": "Bengali (India)",
  "bs-BA": "Bosnian (Bosnia)",
  "ca-ES": "Catalan (Spain)",
  "cs-CZ": "Czech (Czech Republic)",
  "cy-GB": "Welsh (UK)",
  "da-DK": "Danish (Denmark)",
  "de-AT": "German (Austria)",
  "de-CH": "German (Switzerland)",
  "de-DE": "German (Germany)",
  "el-GR": "Greek (Greece)",
  "en-AU": "English (Australia)",
  "en-CA": "English (Canada)",
  "en-GB": "English (UK)",
  "en-HK": "English (Hong Kong)",
  "en-IE": "English (Ireland)",
  "en-IN": "English (India)",
  "en-KE": "English (Kenya)",
  "en-NG": "English (Nigeria)",
  "en-NZ": "English (New Zealand)",
  "en-PH": "English (Philippines)",
  "en-SG": "English (Singapore)",
  "en-TZ": "English (Tanzania)",
  "en-US": "English (United States)",
  "en-ZA": "English (South Africa)",
  "es-AR": "Spanish (Argentina)",
  "es-BO": "Spanish (Bolivia)",
  "es-CL": "Spanish (Chile)",
  "es-CO": "Spanish (Colombia)",
  "es-CR": "Spanish (Costa Rica)",
  "es-CU": "Spanish (Cuba)",
  "es-DO": "Spanish (Dominican Republic)",
  "es-EC": "Spanish (Ecuador)",
  "es-ES": "Spanish (Spain)",
  "es-GQ": "Spanish (Equatorial Guinea)",
  "es-GT": "Spanish (Guatemala)",
  "es-HN": "Spanish (Honduras)",
  "es-MX": "Spanish (Mexico)",
  "es-NI": "Spanish (Nicaragua)",
  "es-PA": "Spanish (Panama)",
  "es-PE": "Spanish (Peru)",
  "es-PR": "Spanish (Puerto Rico)",
  "es-PY": "Spanish (Paraguay)",
  "es-SV": "Spanish (El Salvador)",
  "es-US": "Spanish (United States)",
  "es-UY": "Spanish (Uruguay)",
  "es-VE": "Spanish (Venezuela)",
  "et-EE": "Estonian (Estonia)",
  "eu-ES": "Basque (Spain)",
  "fa-IR": "Persian (Iran)",
  "fi-FI": "Finnish (Finland)",
  "fil-PH": "Filipino (Philippines)",
  "fr-BE": "French (Belgium)",
  "fr-CA": "French (Canada)",
  "fr-CH": "French (Switzerland)",
  "fr-FR": "French (France)",
  "ga-IE": "Irish (Ireland)",
  "gl-ES": "Galician (Spain)",
  "gu-IN": "Gujarati (India)",
  "he-IL": "Hebrew (Israel)",
  "hi-IN": "Hindi (India)",
  "hr-HR": "Croatian (Croatia)",
  "hu-HU": "Hungarian (Hungary)",
  "hy-AM": "Armenian (Armenia)",
  "id-ID": "Indonesian (Indonesia)",
  "is-IS": "Icelandic (Iceland)",
  "it-IT": "Italian (Italy)",
  "ja-JP": "Japanese (Japan)",
  "jv-ID": "Javanese (Indonesia)",
  "ka-GE": "Georgian (Georgia)",
  "kk-KZ": "Kazakh (Kazakhstan)",
  "km-KH": "Khmer (Cambodia)",
  "kn-IN": "Kannada (India)",
  "ko-KR": "Korean (South Korea)",
  "lo-LA": "Lao (Laos)",
  "lt-LT": "Lithuanian (Lithuania)",
  "lv-LV": "Latvian (Latvia)",
  "mk-MK": "Macedonian (North Macedonia)",
  "ml-IN": "Malayalam (India)",
  "mn-MN": "Mongolian (Mongolia)",
  "mr-IN": "Marathi (India)",
  "ms-MY": "Malay (Malaysia)",
  "mt-MT": "Maltese (Malta)",
  "my-MM": "Burmese (Myanmar)",
  "nb-NO": "Norwegian (Norway)",
  "ne-NP": "Nepali (Nepal)",
  "nl-BE": "Dutch (Belgium)",
  "nl-NL": "Dutch (Netherlands)",
  "or-IN": "Odia (India)",
  "pa-IN": "Punjabi (India)",
  "pl-PL": "Polish (Poland)",
  "ps-AF": "Pashto (Afghanistan)",
  "pt-BR": "Portuguese (Brazil)",
  "pt-PT": "Portuguese (Portugal)",
  "ro-RO": "Romanian (Romania)",
  "ru-RU": "Russian (Russia)",
  "si-LK": "Sinhala (Sri Lanka)",
  "sk-SK": "Slovak (Slovakia)",
  "sl-SI": "Slovenian (Slovenia)",
  "so-SO": "Somali (Somalia)",
  "sq-AL": "Albanian (Albania)",
  "sr-RS": "Serbian (Serbia)",
  "su-ID": "Sundanese (Indonesia)",
  "sv-SE": "Swedish (Sweden)",
  "sw-KE": "Swahili (Kenya)",
  "sw-TZ": "Swahili (Tanzania)",
  "ta-IN": "Tamil (India)",
  "ta-LK": "Tamil (Sri Lanka)",
  "ta-MY": "Tamil (Malaysia)",
  "ta-SG": "Tamil (Singapore)",
  "te-IN": "Telugu (India)",
  "th-TH": "Thai (Thailand)",
  "tr-TR": "Turkish (Turkey)",
  "uk-UA": "Ukrainian (Ukraine)",
  "ur-IN": "Urdu (India)",
  "ur-PK": "Urdu (Pakistan)",
  "uz-UZ": "Uzbek (Uzbekistan)",
  "vi-VN": "Vietnamese (Vietnam)",
  "wuu-CN": "Wu Chinese (China)",
  "yue-CN": "Cantonese (China)",
  "zh-CN": "Chinese Simplified (China)",
  "zh-CN-liaoning": "Chinese — Liaoning dialect (China)",
  "zh-CN-shaanxi": "Chinese — Shaanxi dialect (China)",
  "zh-HK": "Chinese (Hong Kong)",
  "zh-TW": "Chinese Traditional (Taiwan)",
  "zu-ZA": "Zulu (South Africa)",
};

function getLanguageLabel(code: string, voiceCount: number): string {
  const display = LOCALE_DISPLAY_NAMES[code] ?? code;
  return `${display} — ${voiceCount} ${voiceCount === 1 ? "voice" : "voices"}`;
}

type EdgeTtsLanguage = {
  code: string;
  name: string;
  voice_count: number;
};

type EdgeTtsVoice = {
  id: string;
  name: string;
  locale: string;
  gender?: string;
};

type EdgeTtsGenerateResponse = {
  status: string;
  file_id: string;
  filename: string;
  download_url: string;
};

export default function TTSFast({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { t } = useI18n();

  const [text, setText] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("");
  const [languages, setLanguages] = useState<EdgeTtsLanguage[]>([]);
  const [voices, setVoices] = useState<EdgeTtsVoice[]>([]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string | null>(null);

  const [serverUnreachable, setServerUnreachable] = useState(false);
  const [charLimitEnabled, setCharLimitEnabled] = useState(true);
  const charCount = text.length;
  const overLimit = charLimitEnabled && charCount > MAX_CHARS;
  const statusReady = !serverUnreachable;

  const { servicesById } = useManagedServices();
  const serviceStatus = servicesById.app;

  const fetchStatus = async () => {
    try {
      const response = await fetch(`${APP_API_URL}/api/v1/status`);
      if (!response.ok) throw new Error("status");
      setServerUnreachable(false);
    } catch {
      setServerUnreachable(true);
      setLanguages([]);
      setVoices([]);
      setSelectedVoice("");
    }
  };

  const fetchLanguages = async () => {
    try {
      const res = await fetch(`${APP_API_URL}/api/v1/edge-tts/languages`);
      if (!res.ok) throw new Error("languages");
      const data = await res.json();
      const nextLanguages = (data.languages || []) as EdgeTtsLanguage[];
      setLanguages(nextLanguages);
      if (!selectedLanguage && nextLanguages.length > 0) {
        setSelectedLanguage(nextLanguages[0].code);
      }
    } catch {
      setLanguages([]);
      setVoices([]);
      setSelectedVoice("");
    }
  };

  const fetchVoices = async (languageCode: string) => {
    if (!languageCode) {
      setVoices([]);
      setSelectedVoice("");
      return;
    }

    try {
      const res = await fetch(`${APP_API_URL}/api/v1/edge-tts/voices?language=${encodeURIComponent(languageCode)}`);
      if (!res.ok) throw new Error("voices");
      const data = await res.json();
      const nextVoices = (data.voices || []) as EdgeTtsVoice[];
      setVoices(nextVoices);
      if (!nextVoices.find((voice) => voice.id === selectedVoice)) {
        setSelectedVoice("");
      }
    } catch {
      setVoices([]);
      setSelectedVoice("");
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchLanguages();
  }, []);

  useEffect(() => {
    if (!serviceStatus) return;
    if (serviceStatus.status === "running" || serviceStatus.status === "stopped") {
      fetchStatus();
      fetchLanguages();
    }
  }, [serviceStatus?.status]);

  useEffect(() => {
    fetchVoices(selectedLanguage);
  }, [selectedLanguage]);

  const handleGenerate = async () => {
    if (!text.trim() || overLimit || !selectedVoice || !selectedLanguage || !statusReady) return;

    setIsGenerating(true);
    setProgress({ status: "starting", percent: 10, message: t("tool.tts_fast.starting_generation") });
    setLogs(["Submitting Edge TTS generation request..."]);
    setAudioUrl(null);
    setDownloadName(null);

    try {
      setProgress({ status: "processing", percent: 45, message: t("tool.tts_fast.processing") });
      const res = await fetch(`${APP_API_URL}/api/v1/edge-tts/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: selectedVoice }),
      });

      if (!res.ok) {
        const errorPayload = await res.json().catch(() => ({}));
        throw new Error(String(errorPayload.detail || "Generate failed"));
      }

      const data = (await res.json()) as EdgeTtsGenerateResponse;
      const downloadUrl = data.download_url.startsWith("http")
        ? data.download_url
        : `${APP_API_URL}${data.download_url}`;

      setLogs((prev) => [...prev, `Generated file: ${data.filename}`]);
      setProgress({ status: "complete", percent: 100, message: t("tool.tts_fast.audio_ready") });
      setAudioUrl(downloadUrl);
      setDownloadName(data.filename || "tts.mp3");
    } catch (error) {
      const message = error instanceof Error ? error.message : t("tool.tts_fast.server_not_reachable");
      setLogs((prev) => [...prev, message]);
      setProgress({ status: "error", percent: 0, message: t("tool.tts_fast.server_not_reachable") });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = downloadName || "tts.mp3";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const statusRows: StatusRowConfig[] = [
    {
      id: "server",
      label: t("tool.tts_fast.server_status"),
      isReady: !serverUnreachable,
      path: APP_API_URL,
      showSecondaryAction: serverUnreachable && Boolean(onOpenSettings),
      secondaryActionLabel: t("tool.common.open_settings"),
      onSecondaryAction: onOpenSettings,
    },
  ];

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-card">
      <CardContent className="p-8 space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">{t("feature.tool.tts_fast.title")}</h2>
          <div className="text-sm text-muted-foreground space-y-1">
            <p>
              API:{" "}
              <a href="http://127.0.0.1:6901" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent/80 underline">
                http://127.0.0.1:6901
              </a>
            </p>
            <p>
              API Docs:{" "}
              <a
                href="http://127.0.0.1:6901/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:text-accent/80 underline"
              >
                http://127.0.0.1:6901/docs
              </a>
            </p>
          </div>
        </div>

        <ServiceStatusTable serverUnreachable={serverUnreachable} rows={statusRows} onRefresh={fetchStatus} />

        <div className="space-y-2">
          <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.tts_fast.select_language")}</label>
          <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
            <SelectTrigger className="bg-card border-border">
              <SelectValue placeholder={t("tool.tts_fast.choose_language")} />
            </SelectTrigger>
            <SelectContent viewportClassName="!h-auto max-h-[220px] overflow-y-auto">
              {languages.map((language) => (
                <SelectItem key={language.code} value={language.code}>
                  {getLanguageLabel(language.code, language.voice_count)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.tts_fast.select_voice")}</label>
          <Select value={selectedVoice} onValueChange={setSelectedVoice}>
            <SelectTrigger className="bg-card border-border">
              <SelectValue placeholder={t("tool.tts_fast.choose_preset")} />
            </SelectTrigger>
            <SelectContent viewportClassName="!h-auto max-h-[220px] overflow-y-auto">
              {voices.map((voice) => (
                <SelectItem key={voice.id} value={voice.id}>
                  {voice.name} ({voice.locale}) {voice.gender ? `- ${voice.gender}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.tts_fast.text_to_speak")}</label>
          <Textarea
            placeholder={t("tool.tts_fast.text_ph")}
            value={text}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
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
              className="h-6 text-xs px-2"
            >
              {charLimitEnabled ? t("tool.common.char_limit_on") : t("tool.common.char_limit_off")}
            </Button>
          </div>
        </div>

        <Button
          className="w-full h-12 bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl font-bold"
          onClick={handleGenerate}
          disabled={isGenerating || !text.trim() || overLimit || !statusReady || !selectedLanguage || !selectedVoice}
        >
          {isGenerating ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Volume2 className="w-5 h-5 mr-2" />}
          {t("tool.tts_fast.generate")}
        </Button>

        <ProgressDisplay progress={progress} logs={logs} defaultMessage={t("tool.tts_fast.processing")} />

        <AudioResult
          audioUrl={audioUrl}
          downloadName={downloadName}
          duration={null}
          onDownload={handleDownload}
          readyMessage={t("tool.tts_fast.audio_ready")}
        />
      </CardContent>
    </Card>
  );
}
