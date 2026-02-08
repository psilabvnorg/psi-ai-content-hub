import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Play, Square, RefreshCw, Terminal } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import { API_URL } from "@/lib/api";

type SystemStatus = {
  status?: string;
  uptime?: number;
  temp?: { temp_dir: string; file_count: number; total_size_mb: number };
  tools?: Record<string, unknown>;
};

type LogLine = { line: string };

export default function BackendConsole() {
  const { t } = useI18n();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [serverUnreachable, setServerUnreachable] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/system/status`);
      if (!res.ok) throw new Error("status");
      const data = (await res.json()) as SystemStatus;
      setStatus(data);
      setServerUnreachable(false);
    } catch {
      setStatus(null);
      setServerUnreachable(true);
    }
  };

  const fetchLogTail = async () => {
    try {
      const res = await fetch(`${API_URL}/api/system/logs/tail?lines=200`);
      const data = (await res.json()) as { lines?: string[] };
      setLogs(data.lines || []);
    } catch {
      setLogs([]);
    }
  };

  const startBackend = async () => {
    try {
      await fetch(`${API_URL}/api/system/start`, { method: "POST" });
      await fetchStatus();
    } catch {
      setServerUnreachable(true);
    }
  };

  const stopBackend = async () => {
    try {
      await fetch(`${API_URL}/api/system/stop`, { method: "POST" });
    } catch {
      setServerUnreachable(true);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchLogTail();
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    if (serverUnreachable) {
      setIsStreaming(false);
      return;
    }
    const es = new EventSource(`${API_URL}/api/system/logs/stream`);
    setIsStreaming(true);
    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as LogLine;
        if (!payload.line) return;
        setLogs((prev) => {
          const next = [...prev, payload.line];
          return next.length > 400 ? next.slice(-400) : next;
        });
      } catch {
        // ignore
      }
    };
    es.onerror = () => {
      es.close();
      setIsStreaming(false);
      setServerUnreachable(true);
    };
    return () => {
      es.close();
      setIsStreaming(false);
    };
  }, [serverUnreachable]);

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-white dark:bg-zinc-900">
      <CardContent className="p-8 space-y-6">
        {serverUnreachable && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
              <div className="space-y-2">
                <p className="text-sm font-semibold text-red-800 dark:text-red-300">{t("tool.backend_console.unreachable")}</p>
                <p className="text-xs text-red-700 dark:text-red-400">
                  {t("tool.backend_console.unreachable_desc")}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-zinc-500" />
            <div className="text-sm font-semibold text-zinc-900 dark:text-white">
              {t("tool.backend_console.title")}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                fetchStatus();
                fetchLogTail();
              }}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {t("tool.backend_console.refresh")}
            </Button>
            <Button size="sm" onClick={startBackend} disabled={serverUnreachable}>
              <Play className="w-4 h-4 mr-2" />
              {t("tool.backend_console.start")}
            </Button>
            <Button size="sm" variant="destructive" onClick={stopBackend} disabled={serverUnreachable}>
              <Square className="w-4 h-4 mr-2" />
              {t("tool.backend_console.stop")}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800">
            <div className="text-xs text-zinc-500 uppercase">{t("tool.backend_console.status")}</div>
            <div className="text-lg font-bold text-zinc-900 dark:text-white">
              {status?.status || (serverUnreachable ? t("tool.backend_console.down") : t("tool.backend_console.unknown"))}
            </div>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800">
            <div className="text-xs text-zinc-500 uppercase">{t("tool.backend_console.temp_files")}</div>
            <div className="text-lg font-bold text-zinc-900 dark:text-white">
              {status?.temp?.file_count ?? 0}
            </div>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800">
            <div className="text-xs text-zinc-500 uppercase">{t("tool.backend_console.temp_size")}</div>
            <div className="text-lg font-bold text-zinc-900 dark:text-white">
              {status?.temp?.total_size_mb ?? 0} MB
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-zinc-500 uppercase">{t("tool.backend_console.logs")}</div>
            <div className="text-xs text-zinc-500">
              {isStreaming ? t("tool.backend_console.streaming") : t("tool.backend_console.paused")}
            </div>
          </div>
          <div
            ref={logRef}
            className="h-72 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-black/90 text-zinc-100 p-3 font-mono text-xs"
          >
            {logs.length === 0 ? (
              <div className="text-zinc-400">{t("tool.backend_console.no_logs")}</div>
            ) : (
              logs.map((line, idx) => <div key={idx}>{line}</div>)
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
