import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useI18n } from "@/i18n/i18n";

type AudioResultProps = {
  audioUrl: string | null;
  downloadName?: string | null;
  duration?: number | null;
  onDownload: () => void;
  readyMessage?: string;
  durationMessage?: string;
};

export function AudioResult({
  audioUrl,
  downloadName,
  duration,
  onDownload,
  readyMessage,
  durationMessage,
}: AudioResultProps) {
  const { t } = useI18n();

  if (!audioUrl) {
    return null;
  }

  return (
    <div className="p-4 bg-emerald-500/12 rounded-xl border border-emerald-500/45 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-emerald-400">
          {readyMessage || t("tool.common.audio_ready")}
        </span>
        <Button size="sm" variant="outline" onClick={onDownload}>
          <Download className="w-4 h-4 mr-2" />
          {t("tool.common.download")}
        </Button>
      </div>
      {duration !== null && duration !== undefined && (
        <div className="text-xs text-emerald-400">
          {durationMessage || t("tool.tts_fast.duration", { seconds: duration })}
        </div>
      )}
      <audio controls className="w-full h-10">
        <source src={audioUrl} type="audio/wav" />
      </audio>
    </div>
  );
}
