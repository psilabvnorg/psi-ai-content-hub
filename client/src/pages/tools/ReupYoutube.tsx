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
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-card">
      <CardContent className="p-8 space-y-6">
        <div className="p-4 bg-accent/12 rounded-xl border border-accent/45">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-accent mt-0.5" />
            <div className="flex-1 space-y-1">
              <p className="text-sm font-semibold text-accent">{t("tool.reup.stub_title")}</p>
              <p className="text-xs text-accent/90">{t("tool.reup.stub_desc")}</p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.reup.youtube_url")}</label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            className="h-12 bg-card border-border rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.reup.target_language")}</label>
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

        <Button
          className="w-full h-12 bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl font-bold"
          onClick={startJob}
          disabled={isRunning || !url}
        >
          <Video className="w-5 h-5 mr-2" />
          {t("tool.reup.start")}
        </Button>

        {error && (
          <div className="p-4 bg-destructive/12 rounded-xl border border-destructive/45 text-sm text-destructive/90">
            {error}
          </div>
        )}

        {result && (
          <div className="p-4 bg-muted/40 rounded-xl border border-border space-y-2">
            <div className="text-sm font-semibold text-foreground">
              {t("tool.reup.stub_result")}
            </div>
            <div className="text-xs text-muted-foreground">
              {t("tool.reup.stub_reason", { reason: result.reason || t("tool.reup.stub_unknown") })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
