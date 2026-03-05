import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, Download, FileJson } from "lucide-react";
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

export default function LLMBatch({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { hasMissingDeps } = useAppStatus();
  const [serverUnreachable, setServerUnreachable] = useState(false);

  const fetchStatus = async () => {
    try {
      const response = await fetch(`${APP_API_URL}/api/v1/status`);
      if (!response.ok) throw new Error("status");
      setServerUnreachable(false);
    } catch {
      setServerUnreachable(true);
    }
  };

  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [promptLang, setPromptLang] = useState<"en" | "vi">("vi");

  const [fileData, setFileData] = useState<Record<string, string> | null>(null);
  const [fileName, setFileName] = useState("");

  const [previewResult, setPreviewResult] = useState<Record<string, string> | null>(null);
  const [batchResult, setBatchResult] = useState<Record<string, string> | null>(null);

  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [generatingBatch, setGeneratingBatch] = useState(false);
  const [parsedResult, setParsedResult] = useState<Record<string, { box1: string; box2: string }> | null>(null);

  // ── fetch prompt templates ────────────────────────────────────────────────
  useEffect(() => {
    fetchStatus();
    fetch(`${APP_API_URL}/api/v1/llm/prompts`)
      .then((r) => r.json())
      .then((data: PromptTemplate[]) => {
        // exclude custom
        const usable = data.filter((t) => t.id !== "custom");
        setTemplates(usable);
        const initial = usable.find((t) => t.id === "hook_generator") ?? usable[0];
        if (initial) setTemplateId(initial.id);
      })
      .catch(() => toast({ title: "Error", description: "Failed to load prompt templates", variant: "destructive" }));
  }, []);

  // ── active prompt text for current language ───────────────────────────────
  const activePrompt =
    templates.find((t) => t.id === templateId)?.prompt[promptLang] ?? "";

  // ── file upload ───────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setPreviewResult(null);
    setBatchResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (typeof parsed !== "object" || Array.isArray(parsed))
          throw new Error("Expected a JSON object");
        setFileData(parsed as Record<string, string>);
      } catch {
        toast({ title: "Error", description: "Invalid JSON file. Expected { key: text, ... }", variant: "destructive" });
        setFileData(null);
        setFileName("");
      }
    };
    reader.readAsText(file);
    // reset input so same file can be re-selected
    e.target.value = "";
  };

  const itemCount = fileData ? Object.keys(fileData).length : 0;

  // ── generate prompt preview ───────────────────────────────────────────────
  const handleGeneratePrompts = async () => {
    if (!fileData || !activePrompt) return;
    setGeneratingPreview(true);
    setPreviewResult(null);
    setBatchResult(null);
    try {
      const resp = await fetch(`${APP_API_URL}/api/v1/llm/batch/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: fileData, prompt: activePrompt }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      setPreviewResult(await resp.json());
    } catch (err) {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    } finally {
      setGeneratingPreview(false);
    }
  };

  // ── batch generate output ─────────────────────────────────────────────────
  const handleGenerateOutput = async () => {
    if (!fileData || !activePrompt) return;
    setGeneratingBatch(true);
    setBatchResult(null);
    try {
      const resp = await fetch(`${APP_API_URL}/api/v1/llm/batch/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: fileData, prompt: activePrompt }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      setBatchResult(await resp.json());
    } catch (err) {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    } finally {
      setGeneratingBatch(false);
    }
  };

  // ── parse JSON ───────────────────────────────────────────────────────────
  const [parsingJson, setParsingJson] = useState(false);

  const handleParseJson = async () => {
    if (!batchResult) return;
    setParsingJson(true);
    setParsedResult(null);
    try {
      const resp = await fetch(`${APP_API_URL}/api/v1/llm/batch/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: batchResult }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      setParsedResult(await resp.json());
    } catch (err) {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    } finally {
      setParsingJson(false);
    }
  };

  // ── download helper ───────────────────────────────────────────────────────
  const downloadJson = (data: object, name: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
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
    <div className="space-y-6">
      <ServiceStatusTable serverUnreachable={serverUnreachable} rows={statusRows} onRefresh={fetchStatus} serverWarning={hasMissingDeps} onOpenSettings={onOpenSettings} />

      {/* Section 1: Upload JSON */}
      <Card>
        <CardHeader>
          <CardTitle>{t("tool.llm_batch.upload_json")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            variant="outline"
            className="w-full h-24 border-dashed flex-col gap-2"
            onClick={() => fileInputRef.current?.click()}
          >
            {fileData ? (
              <>
                <FileJson className="w-6 h-6 text-green-500" />
                <span className="text-sm font-semibold">{fileName}</span>
                <span className="text-xs text-muted-foreground">
                  {t("tool.llm_batch.items_loaded", { count: itemCount })}
                </span>
              </>
            ) : (
              <>
                <Upload className="w-6 h-6 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Click to upload .json</span>
              </>
            )}
          </Button>

          {fileData && (
            <Textarea
              readOnly
              rows={6}
              className="font-mono text-xs"
              value={JSON.stringify(fileData, null, 2)}
            />
          )}
        </CardContent>
      </Card>

      {/* Section 2: Select Prompt */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("tool.llm_batch.select_prompt")}</CardTitle>
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
        <CardContent className="space-y-3">
          <Select value={templateId} onValueChange={setTemplateId} disabled={templates.length === 0}>
            <SelectTrigger>
              <SelectValue placeholder="Pick a prompt template" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((tmpl) => (
                <SelectItem key={tmpl.id} value={tmpl.id}>
                  {t(tmpl.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {activePrompt && (
            <Textarea
              readOnly
              rows={3}
              className="font-mono text-xs"
              value={activePrompt}
            />
          )}
        </CardContent>
      </Card>

      {/* Section 3: Generate Prompts → Preview */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("tool.llm_batch.prompt_preview")}</CardTitle>
          {previewResult && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => downloadJson(previewResult, "prompts_preview.json")}
            >
              <Download className="w-4 h-4" />
              {t("tool.llm_batch.download")}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            className="w-full"
            onClick={handleGeneratePrompts}
            disabled={generatingPreview || !fileData || !activePrompt}
          >
            {generatingPreview && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {generatingPreview
              ? t("tool.llm_batch.generating_prompts")
              : t("tool.llm_batch.generate_prompts")}
          </Button>

          {previewResult && (
            <Textarea
              readOnly
              rows={12}
              className="font-mono text-xs"
              value={JSON.stringify(previewResult, null, 2)}
            />
          )}
        </CardContent>
      </Card>

      {/* Section 4: Batch Generate Output */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("tool.llm_batch.batch_result")}</CardTitle>
          {batchResult && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => downloadJson(batchResult, "batch_output.json")}
            >
              <Download className="w-4 h-4" />
              {t("tool.llm_batch.download")}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            className="w-full"
            onClick={handleGenerateOutput}
            disabled={generatingBatch || !fileData || !activePrompt}
          >
            {generatingBatch && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {generatingBatch
              ? t("tool.llm_batch.generating_output")
              : t("tool.llm_batch.generate_output")}
          </Button>

          {batchResult && (
            <Textarea
              readOnly
              rows={16}
              className="font-mono text-xs"
              value={JSON.stringify(batchResult, null, 2)}
            />
          )}
        </CardContent>
      </Card>

      {/* Section 5: Parse JSON */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Parse JSON</CardTitle>
          {parsedResult && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => downloadJson(parsedResult, "parsed_output.json")}
            >
              <Download className="w-4 h-4" />
              {t("tool.llm_batch.download")}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            className="w-full"
            onClick={handleParseJson}
            disabled={parsingJson || !batchResult}
          >
            {parsingJson && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Parse JSON
          </Button>

          {parsedResult && (
            <Textarea
              readOnly
              rows={16}
              className="font-mono text-xs"
              value={JSON.stringify(parsedResult, null, 2)}
            />
          )}
        </CardContent>
      </Card>

    </div>
  );
}
