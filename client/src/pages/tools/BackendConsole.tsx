import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw, Terminal } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import { APP_API_URL } from "@/lib/api";
import { useManagedServices } from "@/hooks/useManagedServices";

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
  const { servicesById, start, stop, isBusy } = useManagedServices();
  const serviceStatus = servicesById.app;
  const serviceRunning = serviceStatus?.status === "running";
  const serviceBusy = isBusy("app");

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${APP_API_URL}/api/v1/status`);
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
      const res = await fetch(`${APP_API_URL}/api/v1/logs/tail?lines=200`);
      const data = (await res.json()) as { lines?: string[] };
      setLogs(data.lines || []);
    } catch {
      setLogs([]);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchLogTail();
  }, []);

  useEffect(() => {
    if (!serviceStatus) return;
    if (serviceStatus.status === "running") {
      fetchStatus();
      fetchLogTail();
    }
    if (serviceStatus.status === "stopped") {
      setServerUnreachable(true);
    }
  }, [serviceStatus?.status]);

  const handleToggleServer = async () => {
    if (!serviceStatus) return;
    if (serviceRunning) {
      await stop("app");
      setServerUnreachable(true);
      setLogs([]);
      return;
    }
    await start("app");
    await fetchStatus();
    await fetchLogTail();
  };

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
    const es = new EventSource(`${APP_API_URL}/api/v1/logs/stream`);
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
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-card">
      <CardContent className="p-8 space-y-6">
        {serverUnreachable && (
          <div className="p-4 bg-destructive/12 rounded-xl border border-destructive/45">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive mt-0.5" />
              <div className="space-y-2">
                <p className="text-sm font-semibold text-destructive">{t("tool.backend_console.unreachable")}</p>
                <p className="text-xs text-destructive/90">
                  {t("tool.backend_console.unreachable_desc")}
                </p>
                {serviceStatus && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleToggleServer}
                    disabled={serviceBusy || serviceStatus.status === "not_configured"}
                  >
                    {serviceBusy ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {serviceRunning ? t("tool.common.stop_server") : t("tool.common.start_server")}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-muted-foreground" />
            <div className="text-sm font-semibold text-foreground">
              {t("tool.backend_console.title")}
            </div>
          </div>
          <div className="flex gap-2">
            {serviceStatus && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleToggleServer}
                disabled={serviceBusy || serviceStatus.status === "not_configured"}
              >
                {serviceBusy ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : null}
                {serviceRunning ? t("tool.common.stop_server") : t("tool.common.start_server")}
              </Button>
            )}
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
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-muted/40 rounded-xl p-4 border border-border">
            <div className="text-xs text-muted-foreground uppercase">{t("tool.backend_console.status")}</div>
            <div className="text-lg font-bold text-foreground">
              {status?.status || (serverUnreachable ? t("tool.backend_console.down") : t("tool.backend_console.unknown"))}
            </div>
          </div>
          <div className="bg-muted/40 rounded-xl p-4 border border-border">
            <div className="text-xs text-muted-foreground uppercase">{t("tool.backend_console.temp_files")}</div>
            <div className="text-lg font-bold text-foreground">
              {status?.temp?.file_count ?? 0}
            </div>
          </div>
          <div className="bg-muted/40 rounded-xl p-4 border border-border">
            <div className="text-xs text-muted-foreground uppercase">{t("tool.backend_console.temp_size")}</div>
            <div className="text-lg font-bold text-foreground">
              {status?.temp?.total_size_mb ?? 0} MB
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-muted-foreground uppercase">{t("tool.backend_console.logs")}</div>
            <div className="text-xs text-muted-foreground">
              {isStreaming ? t("tool.backend_console.streaming") : t("tool.backend_console.paused")}
            </div>
          </div>
          <div
            ref={logRef}
            className="h-72 overflow-y-auto rounded-xl border border-border bg-black/90 text-zinc-100 p-3 font-mono text-xs"
          >
            {logs.length === 0 ? (
              <div className="text-muted-foreground">{t("tool.backend_console.no_logs")}</div>
            ) : (
              logs.map((line, idx) => <div key={idx}>{line}</div>)
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
