import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Copy, Languages, Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import type { I18nKey } from "@/i18n/translations";
import { APP_API_URL } from "@/lib/api";
import { ProgressDisplay, ServiceStatusTable } from "@/components/common/tool-page-ui";
import type { ProgressData, StatusRowConfig } from "@/components/common/tool-page-ui";
import { useManagedServices } from "@/hooks/useManagedServices";
import { useAppStatus } from "@/context/AppStatusContext";

type TranslationModelStatus = {
  loaded?: boolean;
  downloaded?: boolean;
  model_id?: string;
  model_dir?: string | null;
};

type StreamPayload = {
  status?: string;
  percent?: number;
  message?: string;
  logs?: string[];
};

type TranslateCreateResponse = {
  job_id: string;
};

type TranslateResult = {
  translated_text?: string;
  segments?: Array<{ text?: string }>;
};

type TranslateResultEnvelope = {
  status?: string;
  error?: string | null;
  result?: TranslateResult | null;
};

const LANGUAGE_OPTIONS: Array<{ code: string; key: I18nKey }> = [
  { code: "vi", key: "lang.vi" },
  { code: "en", key: "lang.en" },
  { code: "zh", key: "lang.zh" },
  { code: "ja", key: "lang.ja" },
  { code: "ko", key: "lang.ko" },
  { code: "es", key: "lang.es" },
  { code: "fr", key: "lang.fr" },
  { code: "de", key: "lang.de" },
];

export default function Translator({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { t } = useI18n();
  const { servicesById } = useManagedServices();
  const { hasMissingDeps } = useAppStatus();
  const streamRef = useRef<EventSource | null>(null);

  const [sourceLang, setSourceLang] = useState("vi");
  const [targetLang, setTargetLang] = useState("en");
  const [preserveEmotion, setPreserveEmotion] = useState(true);
  const [inputText, setInputText] = useState("");
  const [outputText, setOutputText] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const [serverUnreachable, setServerUnreachable] = useState(false);
  const [translationModelStatus, setTranslationModelStatus] = useState<TranslationModelStatus | null>(null);

  const translationService = servicesById.app;
  const statusReady = !serverUnreachable;
  const translationModelLoaded = Boolean(translationModelStatus?.loaded);
  const translationModelDownloaded = Boolean(translationModelStatus?.downloaded);

  useEffect(() => {
    return () => {
      streamRef.current?.close();
      streamRef.current = null;
    };
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await fetch(`${APP_API_URL}/api/v1/status`);
      if (!response.ok) throw new Error("status");
      setServerUnreachable(false);
    } catch {
      setServerUnreachable(true);
      setTranslationModelStatus(null);
      return;
    }
    try {
      const modelRes = await fetch(`${APP_API_URL}/api/v1/translation/status`);
      if (modelRes.ok) setTranslationModelStatus((await modelRes.json()) as TranslationModelStatus);
    } catch {
      // leave stale value
    }
  };

  useEffect(() => {
    void fetchStatus();
  }, []);

  useEffect(() => {
    if (!translationService) return;
    if (translationService.status === "running" || translationService.status === "stopped") {
      void fetchStatus();
    }
  }, [translationService?.status]);

  const statusRows: StatusRowConfig[] = [
    {
      id: "server",
      label: t("tool.translator.server_status"),
      isReady: !serverUnreachable,
      path: `${APP_API_URL}/api/v1/translation`,
      showSecondaryAction: serverUnreachable && Boolean(onOpenSettings),
      secondaryActionLabel: t("tool.common.open_settings"),
      onSecondaryAction: onOpenSettings,
    },
    {
      id: "translation-model",
      label: "Translation Model",
      isReady: translationModelLoaded,
      isSleeping: translationModelDownloaded && !translationModelLoaded,
      path: translationModelStatus?.model_dir || translationModelStatus?.model_id || "--",
      showActionButton: !translationModelLoaded && Boolean(onOpenSettings),
      actionButtonLabel: t("tool.common.open_settings"),
      onAction: onOpenSettings,
    },
  ];

  const canTranslate =
    statusReady &&
    !isTranslating &&
    inputText.trim().length > 0 &&
    sourceLang !== targetLang;

  const finishWithResult = async (jobId: string) => {
    try {
      const resultRes = await fetch(`${APP_API_URL}/api/v1/translation/translate/result/${jobId}`);
      if (!resultRes.ok) {
        throw new Error(t("tool.translator.failed_result"));
      }

      const payload = (await resultRes.json()) as TranslateResultEnvelope;
      if (payload.status === "error" || payload.status === "failed") {
        throw new Error(payload.error || t("tool.translator.translation_failed"));
      }

      const translated = payload.result?.translated_text;
      if (typeof translated === "string" && translated.trim()) {
        setOutputText(translated.trim());
      } else {
        const merged = (payload.result?.segments || [])
          .map((segment) => (typeof segment.text === "string" ? segment.text.trim() : ""))
          .filter((text) => text.length > 0)
          .join(" ");
        setOutputText(merged);
      }

      setProgress({ status: "complete", percent: 100, message: t("tool.translator.translation_complete") });
    } catch (error) {
      const message = error instanceof Error ? error.message : t("tool.translator.translation_failed");
      setProgress({ status: "error", percent: 0, message });
      setLogs((prev) => [...prev, `[ERROR] ${message}`]);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleTranslate = async () => {
    if (!canTranslate) return;

    streamRef.current?.close();
    streamRef.current = null;
    setIsTranslating(true);
    setOutputText("");
    setLogs([]);
    setProgress({ status: "starting", percent: 0, message: t("tool.translator.starting") });

    try {
      const response = await fetch(`${APP_API_URL}/api/v1/translation/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: inputText.trim(),
          source_lang: sourceLang,
          target_lang: targetLang,
          preserve_emotion: preserveEmotion,
        }),
      });

      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as { detail?: string };
        throw new Error(err.detail || t("tool.translator.translation_failed"));
      }

      const createPayload = (await response.json()) as TranslateCreateResponse;
      if (!createPayload.job_id) {
        throw new Error(t("tool.translator.translation_failed"));
      }

      const eventSource = new EventSource(
        `${APP_API_URL}/api/v1/translation/translate/stream/${createPayload.job_id}`
      );
      streamRef.current = eventSource;

      eventSource.onmessage = (event) => {
        let payload: StreamPayload;
        try {
          payload = JSON.parse(event.data) as StreamPayload;
        } catch {
          return;
        }

        setProgress({
          status: payload.status || "processing",
          percent: typeof payload.percent === "number" ? payload.percent : 0,
          message: payload.message || t("tool.common.processing"),
        });

        if (Array.isArray(payload.logs)) {
          setLogs(payload.logs);
        }

        if (payload.status === "complete" || payload.status === "completed") {
          eventSource.close();
          streamRef.current = null;
          void finishWithResult(createPayload.job_id);
        }

        if (payload.status === "error" || payload.status === "failed") {
          eventSource.close();
          streamRef.current = null;
          const message = payload.message || t("tool.translator.translation_failed");
          setProgress({ status: "error", percent: 0, message });
          setLogs((prev) => [...prev, `[ERROR] ${message}`]);
          setIsTranslating(false);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        streamRef.current = null;
        setProgress({ status: "error", percent: 0, message: t("tool.translator.lost_connection") });
        setIsTranslating(false);
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : t("tool.translator.translation_failed");
      setProgress({ status: "error", percent: 0, message });
      setLogs((prev) => [...prev, `[ERROR] ${message}`]);
      setIsTranslating(false);
    }
  };

  const handleCopyOutput = async () => {
    if (!outputText.trim()) return;
    await navigator.clipboard.writeText(outputText);
  };

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-card">
      <CardContent className="p-8 space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">{t("feature.tool.translator.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("feature.tool.translator.desc")}</p>
        </div>

        <ServiceStatusTable serverUnreachable={serverUnreachable} rows={statusRows} onRefresh={fetchStatus} serverWarning={hasMissingDeps} onOpenSettings={onOpenSettings} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase">
              {t("tool.translator.source_language")}
            </label>
            <Select value={sourceLang} onValueChange={setSourceLang}>
              <SelectTrigger className="bg-card border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_OPTIONS.map((language) => (
                  <SelectItem key={language.code} value={language.code}>
                    {t(language.key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase">
              {t("tool.translator.target_language")}
            </label>
            <Select value={targetLang} onValueChange={setTargetLang}>
              <SelectTrigger className="bg-card border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_OPTIONS.map((language) => (
                  <SelectItem key={language.code} value={language.code}>
                    {t(language.key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase">
              {t("tool.translator.preserve_emotion")}
            </label>
            <div className="h-10 px-3 border border-border rounded-md bg-card flex items-center justify-between">
              <span className="text-sm text-foreground">
                {preserveEmotion ? t("tool.common.success") : t("tool.common.failed")}
              </span>
              <Switch checked={preserveEmotion} onCheckedChange={setPreserveEmotion} />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-muted-foreground uppercase">
            {t("tool.translator.input_text")}
          </label>
          <Textarea
            value={inputText}
            onChange={(event) => setInputText(event.target.value)}
            placeholder={t("tool.translator.input_placeholder")}
            className="min-h-[140px] bg-card border-border resize-none"
          />
        </div>

        <Button
          className="w-full h-12 bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl font-bold"
          onClick={handleTranslate}
          disabled={!canTranslate}
        >
          {isTranslating ? (
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
          ) : (
            <Languages className="w-5 h-5 mr-2" />
          )}
          {isTranslating ? t("tool.translator.translating") : t("tool.translator.translate")}
        </Button>

        <ProgressDisplay progress={progress} logs={logs} defaultMessage={t("tool.common.processing")} />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-muted-foreground uppercase">
              {t("tool.translator.output_text")}
            </label>
            <Button variant="outline" size="sm" onClick={handleCopyOutput} disabled={!outputText.trim()}>
              <Copy className="w-4 h-4 mr-2" />
              {t("tool.llm.copy")}
            </Button>
          </div>
          <Textarea
            value={outputText}
            readOnly
            placeholder={t("tool.translator.output_placeholder")}
            className="min-h-[140px] bg-card border-border resize-none"
          />
        </div>
      </CardContent>
    </Card>
  );
}

