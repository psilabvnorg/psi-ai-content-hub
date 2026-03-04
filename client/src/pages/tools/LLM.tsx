import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Copy, Check, ExternalLink, Save } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import { useToast } from "@/hooks/use-toast";
import { APP_API_URL } from "@/lib/api";
import { ServiceStatusTable } from "@/components/common/tool-page-ui";
import type { StatusRowConfig } from "@/components/common/tool-page-ui";
import { useAppStatus } from "@/context/AppStatusContext";

import type { I18nKey } from "@/i18n/translations";

type PromptTemplate = {
  id: string;
  labelKey: I18nKey;
  prompt: { en: string; vi: string };
};

export default function LLM({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { t, language } = useI18n();
  const { toast } = useToast();

  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [templateId, setTemplateId] = useState("hook_generator");
  const [promptLang, setPromptLang] = useState<"en" | "vi">(language as "en" | "vi");
  const [promptText, setPromptText] = useState("");
  const [inputText, setInputText] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [serverUnreachable, setServerUnreachable] = useState(false);
  const { hasMissingDeps } = useAppStatus();

  const fetchStatus = async () => {
    try {
      const response = await fetch(`${APP_API_URL}/api/v1/status`);
      if (!response.ok) throw new Error("status");
      setServerUnreachable(false);
    } catch {
      setServerUnreachable(true);
    }
  };

  const fetchPrompts = async () => {
    try {
      const resp = await fetch(`${APP_API_URL}/api/v1/llm/prompts`);
      if (!resp.ok) throw new Error("Failed to load prompts");
      const data: PromptTemplate[] = await resp.json();
      setTemplates(data);
      const initial = data.find((t) => t.id === "hook_generator") ?? data[0];
      if (initial) {
        setTemplateId(initial.id);
        setPromptText(initial.prompt[promptLang] ?? "");
      }
    } catch (err) {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchPrompts();
  }, []);

  // When promptLang changes, reload the prompt for the active template
  useEffect(() => {
    const tmpl = templates.find((t) => t.id === templateId);
    if (tmpl) setPromptText(tmpl.prompt[promptLang] ?? "");
  }, [promptLang]);

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

  const handleSelectTemplate = (tmpl: PromptTemplate) => {
    setTemplateId(tmpl.id);
    setPromptText(tmpl.prompt[promptLang] ?? "");
  };

  const handleSavePrompt = async () => {
    setSaving(true);
    setSaved(false);
    const updated = templates.map((t) =>
      t.id === templateId
        ? { ...t, prompt: { ...t.prompt, [promptLang]: promptText } }
        : t
    );
    try {
      const resp = await fetch(`${APP_API_URL}/api/v1/llm/prompts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      if (!resp.ok) throw new Error("Save failed");
      setTemplates(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const finalPrompt =
    promptText && inputText.trim()
      ? `${promptText}\n\n${inputText.trim()}`
      : "";

  const handleCopyPrompt = async () => {
    if (!finalPrompt) return;
    await navigator.clipboard.writeText(finalPrompt);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  };

  const handleGenerate = async () => {
    if (!inputText.trim()) return;
    setLoading(true);
    setOutput("");
    try {
      const resp = await fetch(`${APP_API_URL}/api/v1/llm/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptText,
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

      {/* Section 1: Template Selection */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("tool.llm.template")}</CardTitle>
          <div className="flex gap-1 rounded-lg border border-border p-0.5">
            {(["en", "vi"] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => setPromptLang(lang)}
                className={`rounded-md px-3 py-1 text-xs font-bold uppercase transition-colors ${
                  promptLang === lang
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {lang}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {templates.map((tmpl) => (
              <Button
                key={tmpl.id}
                variant={templateId === tmpl.id ? "default" : "outline"}
                size="sm"
                className="rounded-xl"
                onClick={() => handleSelectTemplate(tmpl)}
              >
                {t(tmpl.labelKey)}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Prompt Editor */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("tool.llm.prompt")}</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSavePrompt}
            disabled={saving}
            className="gap-1.5"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saved ? "Saved!" : "Save"}
          </Button>
        </CardHeader>
        <CardContent>
          <Textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            rows={4}
            placeholder={t("tool.llm.custom_prompt_placeholder")}
            className="font-mono"
          />
        </CardContent>
      </Card>

      {/* Section 3: Input Text */}
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

      {/* Section 4: Final Prompt Preview */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("tool.llm.final_prompt")}</CardTitle>
          {finalPrompt && (
            <Button variant="ghost" size="sm" onClick={handleCopyPrompt}>
              {promptCopied ? (
                <Check className="w-4 h-4 mr-1" />
              ) : (
                <Copy className="w-4 h-4 mr-1" />
              )}
              {promptCopied ? t("tool.llm.copied") : t("tool.llm.copy")}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <Textarea
            value={finalPrompt}
            readOnly
            rows={6}
            placeholder={t("tool.llm.final_prompt_placeholder")}
            className="font-mono"
          />
        </CardContent>
      </Card>

      {/* Section 5: Use With */}
      <Card>
        <CardHeader>
          <CardTitle>{t("tool.llm.use_with")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ChatGPT option */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {t("tool.llm.chatgpt_hint")}
            </p>
            <a
              href="https://chatgpt.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 h-11 rounded-xl border border-border bg-background hover:bg-muted transition-colors text-sm font-semibold"
            >
              <img
                src="https://cdn.oaistatic.com/assets/favicon-o20kmmos.svg"
                alt="ChatGPT"
                className="w-5 h-5"
              />
              ChatGPT
              <ExternalLink className="w-3 h-3 text-muted-foreground" />
            </a>
          </div>

          {/* Local LLM option */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {t("tool.llm.or_local_llm")}
            </p>
            <Button
              onClick={handleGenerate}
              disabled={loading || !inputText.trim()}
              className="w-full"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {loading ? t("tool.llm.generating") : t("tool.llm.generate")}
            </Button>
          </div>

          {/* Output */}
          {output && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t("tool.llm.output")}</span>
                <Button variant="ghost" size="sm" onClick={handleCopy}>
                  {copied ? (
                    <Check className="w-4 h-4 mr-1" />
                  ) : (
                    <Copy className="w-4 h-4 mr-1" />
                  )}
                  {copied ? t("tool.llm.copied") : t("tool.llm.copy")}
                </Button>
              </div>
              <Textarea value={output} readOnly rows={12} className="font-mono" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
