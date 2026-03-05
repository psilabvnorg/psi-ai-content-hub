import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Newspaper,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { APP_API_URL } from "@/lib/api";
import { useI18n } from "@/i18n/i18n";
import { ServiceStatusTable } from "@/components/common/tool-page-ui";
import type { StatusRowConfig } from "@/components/common/tool-page-ui";
import { useAppStatus } from "@/context/AppStatusContext";
import { useEffect } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CrawlProgress = {
  status?: string;
  message?: string;
  current?: number;
  total?: number;
  percent?: number;
  processed?: number;
  failed?: number;
  consolidated_file?: string;
  out_dir?: string;
};

type Source = {
  id: string;
  label: string;
  available: boolean;
  categories?: { label: string; url: string }[];
  default_category_url?: string;
};

// ---------------------------------------------------------------------------
// Predefined categories
// ---------------------------------------------------------------------------

const VNEXPRESS_CATEGORIES = [
  { label: "Kinh doanh", url: "https://vnexpress.net/kinh-doanh" },
  { label: "Thời sự", url: "https://vnexpress.net/thoi-su" },
  { label: "Thế giới", url: "https://vnexpress.net/the-gioi" },
  { label: "Khoa học", url: "https://vnexpress.net/khoa-hoc" },
  { label: "Giải trí", url: "https://vnexpress.net/giai-tri" },
  { label: "Thể thao", url: "https://vnexpress.net/the-thao" },
  { label: "Sức khỏe", url: "https://vnexpress.net/suc-khoe" },
  { label: "Du lịch", url: "https://vnexpress.net/du-lich" },
];

const CNN_CATEGORIES = [
  { label: "Business", url: "https://edition.cnn.com/business" },
  { label: "Politics", url: "https://edition.cnn.com/politics" },
  { label: "Entertainment", url: "https://edition.cnn.com/entertainment" },
  { label: "Sport", url: "https://edition.cnn.com/sport" },
  { label: "Health", url: "https://edition.cnn.com/health" },
  { label: "Tech", url: "https://edition.cnn.com/tech" },
  { label: "Travel", url: "https://edition.cnn.com/travel" },
  { label: "World", url: "https://edition.cnn.com/world" },
];

const SOURCES_FALLBACK: Source[] = [
  { id: "vnexpress", label: "VNExpress", available: true, categories: VNEXPRESS_CATEGORIES, default_category_url: "https://vnexpress.net/kinh-doanh" },
  { id: "cnn", label: "CNN", available: true, categories: CNN_CATEGORIES, default_category_url: "https://edition.cnn.com/business" },
  { id: "kenh14", label: "Kênh 14", available: false },
  { id: "cafef", label: "CafeF", available: false },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NewsScraper({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const { hasMissingDeps } = useAppStatus();

  // ----- Server status -----
  const [serverUnreachable, setServerUnreachable] = useState(false);

  const fetchServerStatus = async () => {
    try {
      const res = await fetch(`${APP_API_URL}/api/v1/status`);
      if (!res.ok) throw new Error();
      setServerUnreachable(false);
    } catch {
      setServerUnreachable(true);
    }
  };

  useEffect(() => {
    fetchServerStatus();
    void (async () => {
      try {
        const res = await fetch(`${APP_API_URL}/api/v1/news-scraper/sources`);
        if (!res.ok) return;
        const data = await res.json() as { sources?: Source[]; default_out_dir?: string };
        if (data.sources) setSources(data.sources);
        if (data.default_out_dir) {
          setDefaultOutDir(data.default_out_dir);
          setOutDir(data.default_out_dir);
        }
      } catch {
        // keep fallback values
      }
    })();
  }, []);

  const statusRows: StatusRowConfig[] = [
    {
      id: "server",
      label: t("tool.news_scraper.server_status"),
      isReady: !serverUnreachable,
      path: APP_API_URL,
      showSecondaryAction: serverUnreachable && Boolean(onOpenSettings),
      secondaryActionLabel: t("tool.common.open_settings"),
      onSecondaryAction: onOpenSettings,
    },
  ];

  // ----- Sources -----
  const [sources, setSources] = useState<Source[]>(SOURCES_FALLBACK);
  const [selectedSource, setSelectedSource] = useState<string>("vnexpress");
  const [defaultOutDir, setDefaultOutDir] = useState("");

  const currentSource = sources.find((s) => s.id === selectedSource) ?? sources[0];
  const categories = currentSource?.categories ?? [];

  // ----- Inputs -----
  const [categoryUrl, setCategoryUrl] = useState(VNEXPRESS_CATEGORIES[0].url);
  const [limit, setLimit] = useState(10);
  const [outDir, setOutDir] = useState("");

  // ----- Crawl state -----
  const [crawlJobId, setCrawlJobId] = useState<string | null>(null);
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgress | null>(null);
  const crawlJobIdRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ----- Crawl SSE -----
  useEffect(() => {
    if (!crawlJobId) return;
    crawlJobIdRef.current = crawlJobId;
    let closed = false;

    const es = new EventSource(`${APP_API_URL}/api/v1/news-scraper/crawl/stream/${crawlJobId}`);

    es.onmessage = (event) => {
      if (closed) return;
      try {
        const data = JSON.parse(event.data) as CrawlProgress;
        if (data.status === "heartbeat") return;
        setCrawlProgress(data);
        if (data.status === "complete") {
          closed = true;
          es.close();
          setLoading(false);
          toast({ title: t("tool.common.success"), description: t("tool.news_scraper.crawl_complete") });
        }
        if (data.status === "done" || data.status === "error") {
          closed = true;
          es.close();
          setLoading(false);
          if (data.status === "error") {
            setError((data as { message?: string }).message ?? "Crawl failed");
          }
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      if (!closed) {
        closed = true;
        es.close();
        setLoading(false);
      }
    };

    return () => {
      closed = true;
      es.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crawlJobId]);

  // ----- Actions -----

  const resetResults = () => {
    setCrawlProgress(null);
    setError(null);
    setCrawlJobId(null);
  };

  const handleStartCrawl = async () => {
    resetResults();
    setLoading(true);
    try {
      const res = await fetch(`${APP_API_URL}/api/v1/news-scraper/crawl/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: selectedSource, category_url: categoryUrl, limit, out_dir: outDir || defaultOutDir || undefined }),
      });
      if (!res.ok) {
        const err = await res.json() as { detail?: string };
        throw new Error(err.detail ?? "Failed to start crawl");
      }
      const data = await res.json() as { job_id: string };
      setCrawlJobId(data.job_id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Start crawl failed";
      setError(msg);
      setLoading(false);
      toast({ title: t("tool.common.error"), description: msg, variant: "destructive" });
    }
  };

  const handleDownloadJson = async () => {
    if (!crawlJobId) return;
    try {
      const res = await fetch(`${APP_API_URL}/api/v1/news-scraper/crawl/download/${crawlJobId}`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `articles_${crawlJobId.slice(0, 8)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      toast({ title: t("tool.common.error"), description: "Download failed", variant: "destructive" });
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      <ServiceStatusTable
        serverUnreachable={serverUnreachable}
        rows={statusRows}
        onRefresh={fetchServerStatus}
        serverWarning={hasMissingDeps}
        onOpenSettings={onOpenSettings}
      />

      {/* ---- Batch Crawl card ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Newspaper className="w-5 h-5" />
            {t("tool.news_scraper.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Source selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("tool.news_scraper.source")}</label>
            <div className="grid grid-cols-4 gap-2">
              {sources.map((src) => (
                <button
                  key={src.id}
                  type="button"
                  disabled={!src.available || loading}
                  onClick={() => {
                    setSelectedSource(src.id);
                    if (src.default_category_url) setCategoryUrl(src.default_category_url);
                    else if (src.categories?.[0]) setCategoryUrl(src.categories[0].url);
                    resetResults();
                  }}
                  className={`relative flex flex-col items-center gap-1 rounded-xl border p-3 text-xs font-semibold transition-all
                    ${selectedSource === src.id && src.available
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border bg-muted/40 text-muted-foreground hover:border-accent/60 hover:text-foreground"
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {src.label}
                  {!src.available && (
                    <span className="text-[9px] font-normal opacity-70">{t("tool.news_scraper.coming_soon")}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Category quick-picks */}
          {categories.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("tool.news_scraper.category")}</label>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((cat) => (
                  <button
                    key={cat.url}
                    type="button"
                    disabled={loading}
                    onClick={() => setCategoryUrl(cat.url)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-all
                      ${categoryUrl === cat.url
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-muted/40 text-muted-foreground hover:border-accent/60 hover:text-foreground"
                      } disabled:opacity-50`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              <Input
                value={categoryUrl}
                onChange={(e) => setCategoryUrl(e.target.value)}
                placeholder={t("tool.news_scraper.category_placeholder")}
                disabled={loading}
                className="font-mono text-xs"
              />
            </div>
          )}

          {/* Limit */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t("tool.news_scraper.limit")}: <span className="text-accent font-bold">{limit}</span>
            </label>
            <input
              type="range"
              min={1}
              max={50}
              step={1}
              value={limit}
              disabled={loading}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-border accent-accent disabled:opacity-50"
            />
            <div className="flex justify-between text-[10px] font-bold uppercase text-muted-foreground">
              <span>Min</span>
              <span>Max 50</span>
            </div>
          </div>

          {/* Output dir */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("tool.news_scraper.out_dir")}</label>
            <Input
              value={outDir}
              onChange={(e) => setOutDir(e.target.value)}
              placeholder={defaultOutDir || t("tool.news_scraper.out_dir_placeholder")}
              disabled={loading}
              className="font-mono text-xs"
            />
            {defaultOutDir && !outDir && (
              <p className="text-[11px] text-muted-foreground font-mono break-all">{defaultOutDir}</p>
            )}
          </div>

          {/* Progress bar */}
          {loading && crawlProgress && (
            <div className="space-y-2">
              <Progress value={crawlProgress.percent ?? 0} className="w-full" />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{crawlProgress.message}</span>
              </div>
            </div>
          )}

          {/* Loading spinner (before first progress event) */}
          {loading && !crawlProgress && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{t("tool.news_scraper.crawling")}</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-destructive/12 border border-destructive/45 rounded-lg">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
              <div className="flex-1">
                <p className="text-sm font-medium text-destructive">{t("tool.common.error")}</p>
                <p className="text-xs text-destructive/90 mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Batch Crawl button */}
          <Button onClick={() => void handleStartCrawl()} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t("tool.news_scraper.crawling")}
              </>
            ) : (
              <>
                <Newspaper className="w-4 h-4 mr-2" />
                {t("tool.news_scraper.start_crawl")}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* ---- Crawl result ---- */}
      {(crawlProgress?.status === "complete" || crawlProgress?.status === "error") && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {crawlProgress.status === "complete" ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : crawlProgress.status === "error" ? (
                <AlertCircle className="w-5 h-5 text-destructive" />
              ) : (
                <Loader2 className="w-5 h-5 animate-spin text-accent" />
              )}
              {crawlProgress.status === "complete"
                ? t("tool.news_scraper.crawl_complete")
                : crawlProgress.message ?? t("tool.news_scraper.crawling")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {crawlProgress.status === "complete" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                    <p className="text-2xl font-black text-green-500">{crawlProgress.processed ?? 0}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Articles Saved</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                    <p className="text-2xl font-black text-destructive">{crawlProgress.failed ?? 0}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Failed</p>
                  </div>
                </div>
                {crawlProgress.out_dir && (
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Output Directory</p>
                    <p className="font-mono text-xs text-foreground mt-0.5 break-all">{crawlProgress.out_dir}</p>
                  </div>
                )}
                {crawlJobId && (
                  <Button onClick={() => void handleDownloadJson()} variant="outline" className="w-full">
                    <Download className="w-4 h-4 mr-2" />
                    Download Consolidated JSON
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
