import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { API_URL } from "@/lib/api";
import { useI18n } from "@/i18n/i18n";
import type { I18nKey } from "@/i18n/translations";

type SystemStatus = {
  status: string;
  temp?: { temp_dir: string; file_count: number; total_size_mb: number };
  tools?: {
    ffmpeg?: { installed: boolean; path?: string | null };
    yt_dlp?: { installed: boolean; path?: string | null };
    torch?: { installed: boolean; version?: string | null; cuda?: string | null; path?: string | null };
    vieneu_tts?: { installed: boolean; path?: string | null };
    vieneu_tts_deps?: { installed: boolean; missing?: string[] };
    f5_tts?: { installed: boolean; path?: string | null };
    whisper?: { installed: boolean; model?: string | null; path?: string | null };
  };
};

type ToolRow = {
  id: string;
  name: string;
  status: "ready" | "not_ready";
  path?: string | null;
  can_install: boolean;
};

type ProgressData = {
  status: string;
  percent: number;
  message?: string;
  logs?: string[];
};

async function consumeSseStream(response: Response, onMessage: (data: ProgressData) => void) {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      const line = part.trim();
      if (line.startsWith("data:")) {
        const payload = line.replace("data:", "").trim();
        try {
          onMessage(JSON.parse(payload) as ProgressData);
        } catch {
          // ignore
        }
      }
    }
  }
}

export default function Settings() {
  const { t, language, setLanguage } = useI18n();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [tools, setTools] = useState<ToolRow[]>([]);
  const [toolProgress, setToolProgress] = useState<Record<string, ProgressData | null>>({});
  const toolLabelMap: Record<string, I18nKey> = {
    "yt-dlp": "settings.tools.item.yt-dlp",
    "ffmpeg": "settings.tools.item.ffmpeg",
    "torch-cu121": "settings.tools.item.torch-cu121",
    "vieneu-tts": "settings.tools.item.vieneu-tts",
    "vieneu-tts-deps": "settings.tools.item.vieneu-tts-deps",
    "f5-tts": "settings.tools.item.f5-tts",
    "whisper-large-v3": "settings.tools.item.whisper-large-v3",
  };

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/system/status`);
      if (!response.ok) {
        throw new Error("Failed to load status");
      }
      const data = (await response.json()) as SystemStatus;
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchTools = async () => {
    try {
      const response = await fetch(`${API_URL}/api/tools/manager/status`);
      if (!response.ok) {
        throw new Error("Failed to load tools");
      }
      const data = (await response.json()) as ToolRow[];
      setTools(data);
    } catch {
      setTools([]);
    }
  };

  const handleInstall = async (toolId: string) => {
    setToolProgress((prev) => ({ ...prev, [toolId]: { status: "starting", percent: 0, message: t("settings.tools.installing") } }));
    try {
      const res = await fetch(`${API_URL}/api/tools/manager/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: toolId }),
      });
      await consumeSseStream(res, (data) => {
        setToolProgress((prev) => ({ ...prev, [toolId]: data }));
      });
    } catch {
      setToolProgress((prev) => ({ ...prev, [toolId]: { status: "error", percent: 0, message: t("settings.tools.install_failed") } }));
    } finally {
      fetchStatus();
      fetchTools();
    }
  };

  const handleCleanup = async () => {
    await fetch(`${API_URL}/api/tools/video/cache`, { method: "DELETE" });
    await fetchStatus();
  };

  useEffect(() => {
    fetchStatus();
    fetchTools();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">{t("settings.title")}</h2>
        <p className="text-zinc-500">{t("settings.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.language.title")}</CardTitle>
          <CardDescription>{t("settings.language.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button onClick={() => setLanguage(language === "en" ? "vi" : "en")}>
            {language === "en" ? t("settings.language.vi") : t("settings.language.en")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("settings.tools.title")}</CardTitle>
              <CardDescription>{t("settings.tools.desc")}</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchStatus();
                fetchTools();
              }}
              disabled={loading}
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings.tools.table.tool")}</TableHead>
                  <TableHead>{t("settings.tools.table.status")}</TableHead>
                  <TableHead>{t("settings.tools.table.path")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tools.map((tool) => {
                  const progress = toolProgress[tool.id];
                  const isInstalling = progress && !["complete", "error"].includes(progress.status);
                  const ready = tool.status === "ready" && !isInstalling;
                  return (
                    <TableRow key={tool.id}>
                      <TableCell className="font-medium">{t(toolLabelMap[tool.id] || "settings.tools.item.unknown")}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {ready ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500" />
                          )}
                          <span className="text-sm">
                            {isInstalling
                              ? `${progress?.message || t("settings.tools.installing")} ${progress?.percent ?? 0}%`
                              : ready
                              ? t("settings.tools.status.ready")
                              : t("settings.tools.status.not_ready")}
                          </span>
                          {!ready && tool.can_install && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleInstall(tool.id)}
                              disabled={isInstalling}
                              className="ml-2"
                            >
                              {isInstalling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                              {t("settings.tools.download")}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-mono break-all">{tool.path || "--"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("settings.storage.title")}</CardTitle>
              <CardDescription>{t("settings.storage.desc")}</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchStatus} disabled={loading}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4">
              <div className="text-sm text-zinc-500 mb-1">{t("settings.storage.total_files")}</div>
              <div className="text-2xl font-bold">{status?.temp?.file_count ?? 0}</div>
            </div>
            <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4">
              <div className="text-sm text-zinc-500 mb-1">{t("settings.storage.used")}</div>
              <div className="text-2xl font-bold">{status?.temp?.total_size_mb ?? 0} MB</div>
            </div>
            <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4">
              <div className="text-sm text-zinc-500 mb-1">{t("settings.storage.location")}</div>
              <div className="text-xs font-mono break-all">{status?.temp?.temp_dir ?? "--"}</div>
            </div>
          </div>

          <Button variant="destructive" className="w-full" onClick={handleCleanup}>
            {t("settings.cleanup.title")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
