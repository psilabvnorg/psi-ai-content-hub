import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Copy, Check } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import { useToast } from "@/hooks/use-toast";
import { APP_API_URL } from "@/lib/api";
import { ServiceStatusTable } from "@/components/common/tool-page-ui";
import type { StatusRowConfig } from "@/components/common/tool-page-ui";
import { useManagedServices } from "@/hooks/useManagedServices";
import type { I18nKey } from "@/i18n/translations";
import { useAppStatus } from "@/context/AppStatusContext";

const TEMPLATES: { id: string; labelKey: I18nKey; prompt: string }[] = [
  {
    id: "lessons",
    labelKey: "tool.llm.template_lessons",
    prompt:
      "Format the following text as structured lessons with clear headings, bullet points, and key takeaways.",
  },
  {
    id: "news",
    labelKey: "tool.llm.template_news",
    prompt: "Rewrite the following text as a professional news article.",
  },
  {
    id: "clean_json",
    labelKey: "tool.llm.template_clean_json",
    prompt:
      "Clean and fix the following JSON. Return only valid JSON with no explanation.",
  },
  {
    id: "fix_grammar",
    labelKey: "tool.llm.template_fix_grammar",
    prompt:
      "Fix all grammar and spelling errors in the following text. Return only the corrected text.",
  },
  {
    id: "summarize",
    labelKey: "tool.llm.template_summarize",
    prompt: "Summarize the following text concisely.",
  },
  {
    id: "translate_en",
    labelKey: "tool.llm.template_translate_en",
    prompt: "Translate the following text to English. Return only the translation.",
  },
  {
    id: "translate_vi",
    labelKey: "tool.llm.template_translate_vi",
    prompt:
      "Translate the following text to Vietnamese. Return only the translation.",
  },
  {
    id: "extract_keyword",
    labelKey: "tool.llm.template_extract_keyword",
    prompt:
      "Extract the main keywords from the following text. Return only a comma-separated list of keywords, no explanation.",
  },
  {
    id: "custom",
    labelKey: "tool.llm.custom_prompt",
    prompt: "",
  },
];

export default function LLM({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [templateId, setTemplateId] = useState("fix_grammar");
  const [customPrompt, setCustomPrompt] = useState("");
  const [inputText, setInputText] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const [serverUnreachable, setServerUnreachable] = useState(false);
  const { servicesById } = useManagedServices();
  const { hasMissingDeps } = useAppStatus();
  const serviceStatus = servicesById.app;

  const fetchStatus = async () => {
    try {
      const response = await fetch(`${APP_API_URL}/api/v1/status`);
      if (!response.ok) throw new Error("status");
      setServerUnreachable(false);
    } catch {
      setServerUnreachable(true);
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

  const selectedTemplate = TEMPLATES.find((t) => t.id === templateId);
  const activePrompt =
    templateId === "custom" ? customPrompt : selectedTemplate?.prompt || "";

  const handleGenerate = async () => {
    if (!inputText.trim()) return;
    setLoading(true);
    setOutput("");
    try {
      const resp = await fetch(`${APP_API_URL}/api/v1/llm/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: activePrompt,
          input_text: inputText,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(err.detail || "Request failed");
      }
      const data = await resp.json();
      setOutput(data.output || "");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <ServiceStatusTable serverUnreachable={serverUnreachable} rows={statusRows} onRefresh={fetchStatus} serverWarning={hasMissingDeps} onOpenSettings={onOpenSettings} />

      {/* Section 1: Prompt Template */}
      <Card>
        <CardHeader>
          <CardTitle>{t("tool.llm.template")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEMPLATES.map((tmpl) => (
                <SelectItem key={tmpl.id} value={tmpl.id}>
                  {t(tmpl.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {templateId === "custom" && (
            <Textarea
              placeholder={t("tool.llm.custom_prompt_placeholder")}
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={3}
            />
          )}
        </CardContent>
      </Card>

      {/* Section 2: Input Text */}
      <Card>
        <CardHeader>
          <CardTitle>{t("tool.llm.input")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder={t("tool.llm.input_placeholder")}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            rows={8}
          />
        </CardContent>
      </Card>

      {/* Section 3: Generate & Output */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("tool.llm.output")}</CardTitle>
          {output && (
            <Button variant="ghost" size="sm" onClick={handleCopy}>
              {copied ? (
                <Check className="w-4 h-4 mr-1" />
              ) : (
                <Copy className="w-4 h-4 mr-1" />
              )}
              {copied ? t("tool.llm.copied") : t("tool.llm.copy")}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleGenerate}
            disabled={loading || !inputText.trim()}
            className="w-full"
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {loading ? t("tool.llm.generating") : t("tool.llm.generate")}
          </Button>

          {output && (
            <Textarea value={output} readOnly rows={12} className="font-mono" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
