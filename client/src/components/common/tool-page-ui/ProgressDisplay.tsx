import { useEffect, useRef, useMemo } from "react";
import { useI18n } from "@/i18n/i18n";
import type { ProgressData } from "./types";

type ProgressDisplayProps = {
  progress: ProgressData | null;
  logs: string[];
  defaultMessage?: string;
};

export function ProgressDisplay({ progress, logs, defaultMessage }: ProgressDisplayProps) {
  const { t } = useI18n();
  const logRef = useRef<HTMLDivElement>(null);

  const progressPercent = useMemo(() => {
    return Math.max(0, Math.min(100, progress?.percent || 0));
  }, [progress]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  if (!progress || progress.status === "waiting") {
    return null;
  }

  return (
    <div className="w-full p-4 bg-accent/12 rounded-xl border border-accent/45">
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-semibold text-accent">
          {progress.message || defaultMessage || t("tool.common.processing")}
        </span>
        <span className="text-sm font-bold text-accent">{progressPercent}%</span>
      </div>
      <div className="w-full bg-muted/60 rounded-full h-2 overflow-hidden">
        <div
          className="bg-accent h-full rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      {logs.length > 0 && (
        <div
          ref={logRef}
          className="mt-3 max-h-48 overflow-y-auto text-xs font-mono text-accent bg-muted/50 p-2 rounded"
        >
          {logs.map((log, idx) => (
            <div key={idx}>{log}</div>
          ))}
        </div>
      )}
    </div>
  );
}
