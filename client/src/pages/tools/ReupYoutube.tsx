import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Video, AlertCircle } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import type { I18nKey } from "@/i18n/translations";
import { API_URL } from "@/lib/api";

const LANGUAGES: Array<{ code: string; nameKey: I18nKey }> = [
  { code: "en", nameKey: "lang.en" },
  { code: "vi", nameKey: "lang.vi" },
  { code: "ja", nameKey: "lang.ja" },
  { code: "de", nameKey: "lang.de" },
];

type WorkflowResult = {
  job_id?: string;
  status?: string;
  reason?: string;
};

export default function ReupYoutube() {
  const { t } = useI18n();
  const [url, setUrl] = useState("");
  const [language, setLanguage] = useState("vi");
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<WorkflowResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startJob = async () => {
    if (!url) return;
    setIsRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API_URL}/api/workflows/reup-youtube/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, target_language: language }),
      });
      const data = (await res.json()) as WorkflowResult;
      setResult(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("tool.common.error");
      setError(message);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-white dark:bg-zinc-900">
      <CardContent className="p-8 space-y-6">
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="flex-1 space-y-1">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t("tool.reup.stub_title")}</p>
              <p className="text-xs text-amber-700 dark:text-amber-400">{t("tool.reup.stub_desc")}</p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase">{t("tool.reup.youtube_url")}</label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            className="h-12 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase">{t("tool.reup.target_language")}</label>
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

        <Button
          className="w-full h-12 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold"
          onClick={startJob}
          disabled={isRunning || !url}
        >
          <Video className="w-5 h-5 mr-2" />
          {t("tool.reup.start")}
        </Button>

        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {result && (
          <div className="p-4 bg-zinc-50 dark:bg-zinc-950/40 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-2">
            <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              {t("tool.reup.stub_result")}
            </div>
            <div className="text-xs text-zinc-600 dark:text-zinc-400">
              {t("tool.reup.stub_reason", { reason: result.reason || t("tool.reup.stub_unknown") })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
