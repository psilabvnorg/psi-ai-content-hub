import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Newspaper,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Link2,
  List,
  Search,
  Copy,
  ChevronDown,
  ChevronUp,
  ExternalLink,
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

type Mode = "fetch" | "scrape" | "crawl";

type ArticleMeta = {
  title?: string;
  description?: string;
  author?: string;
  published_time?: string;
  image?: string;
  tags?: string[];
  categories?: string[];
  url?: string;
};

type ArticleBody = {
  paragraphs?: string[];
  images?: { src: string; caption?: string | null }[];
};

type ScrapeResult = {
  scraped_at?: string;
  source_url?: string;
  meta?: ArticleMeta;
  body?: ArticleBody;
};

type CrawlProgress = {
  status?: string;
  message?: string;
  current?: number;
  total?: number;
  percent?: number;
  processed?: number;
  failed?: number;
  saved_files?: string[];
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
// VNExpress predefined categories (used as quick-picks)
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

const SOURCES_FALLBACK: Source[] = [
  { id: "vnexpress", label: "VNExpress", available: true, categories: VNEXPRESS_CATEGORIES, default_category_url: "https://vnexpress.net/kinh-doanh" },
  { id: "kenh14", label: "Kênh 14", available: false },
  { id: "cafef", label: "CafeF", available: false },
  { id: "cnn", label: "CNN", available: false },
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

  // ----- Mode -----
  const [mode, setMode] = useState<Mode>("fetch");

  // ----- Inputs -----
  const [categoryUrl, setCategoryUrl] = useState(VNEXPRESS_CATEGORIES[0].url);
  const [articleUrl, setArticleUrl] = useState("");
  const [limit, setLimit] = useState(10);
  const [outDir, setOutDir] = useState("");

  // ----- Fetch-URL results -----
  const [fetchedUrls, setFetchedUrls] = useState<string[]>([]);

  // ----- Scrape results -----
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null);
  const [bodyExpanded, setBodyExpanded] = useState(false);

  // ----- Crawl results -----
  const [crawlJobId, setCrawlJobId] = useState<string | null>(null);
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgress | null>(null);
  const crawlJobIdRef = useRef<string | null>(null);

  // ----- Generic state -----
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
            setError(data.message ?? "Crawl failed");
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
    setFetchedUrls([]);
    setScrapeResult(null);
    setCrawlProgress(null);
    setError(null);
    setCrawlJobId(null);
  };

  const handleFetchUrls = async () => {
    resetResults();
    setLoading(true);
    try {
      const res = await fetch(`${APP_API_URL}/api/v1/news-scraper/fetch-urls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: selectedSource, category_url: categoryUrl, limit }),
      });
      if (!res.ok) {
        const err = await res.json() as { detail?: string };
        throw new Error(err.detail ?? "Failed to fetch URLs");
      }
      const data = await res.json() as { urls: string[]; count: number };
      setFetchedUrls(data.urls);
      toast({ title: t("tool.common.success"), description: t("tool.news_scraper.urls_found").replace("{{count}}", String(data.count)) });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Fetch failed";
      setError(msg);
      toast({ title: t("tool.common.error"), description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleScrape = async (url?: string) => {
    const targetUrl = url ?? articleUrl;
    if (!targetUrl) {
      toast({ title: t("tool.common.error"), description: "Please enter an article URL", variant: "destructive" });
      return;
    }
    resetResults();
    setLoading(true);
    try {
      const res = await fetch(`${APP_API_URL}/api/v1/news-scraper/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
      });
      if (!res.ok) {
        const err = await res.json() as { detail?: string };
        throw new Error(err.detail ?? "Scrape failed");
      }
      const data = await res.json() as ScrapeResult;
      setScrapeResult(data);
      setBodyExpanded(false);
      toast({ title: t("tool.common.success"), description: data.meta?.title ?? "Article scraped" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Scrape failed";
      setError(msg);
      toast({ title: t("tool.common.error"), description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
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

  const handleSubmit = () => {
    if (mode === "fetch") void handleFetchUrls();
    else if (mode === "scrape") void handleScrape();
    else void handleStartCrawl();
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: text.slice(0, 60) });
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const paragraphs = scrapeResult?.body?.paragraphs ?? [];
  const PREVIEW_PARAGRAPHS = 3;

  return (
    <div className="space-y-6">
      <ServiceStatusTable
        serverUnreachable={serverUnreachable}
        rows={statusRows}
        onRefresh={fetchServerStatus}
        serverWarning={hasMissingDeps}
        onOpenSettings={onOpenSettings}
      />

      {/* ---- Input card ---- */}
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

          {/* Mode selector */}
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: "fetch" as Mode, label: t("tool.news_scraper.mode_fetch"), icon: List },
                  { id: "scrape" as Mode, label: t("tool.news_scraper.mode_scrape"), icon: Search },
                  { id: "crawl" as Mode, label: t("tool.news_scraper.mode_crawl"), icon: Newspaper },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  disabled={loading}
                  onClick={() => { setMode(id); resetResults(); }}
                  className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-semibold transition-all
                    ${mode === id
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border bg-muted/40 text-muted-foreground hover:border-accent/60 hover:text-foreground"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Category quick-picks (fetch / crawl mode) */}
          {(mode === "fetch" || mode === "crawl") && categories.length > 0 && (
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

          {/* Article URL input (scrape mode) */}
          {mode === "scrape" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("tool.news_scraper.article_url")}</label>
              <Input
                value={articleUrl}
                onChange={(e) => setArticleUrl(e.target.value)}
                placeholder={t("tool.news_scraper.article_url_placeholder")}
                disabled={loading}
              />
            </div>
          )}

          {/* Limit (fetch / crawl) */}
          {(mode === "fetch" || mode === "crawl") && (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t("tool.news_scraper.limit")}: <span className="text-accent font-bold">{limit}</span>
              </label>
              <input
                type="range"
                min={mode === "fetch" ? 5 : 1}
                max={mode === "fetch" ? 100 : 50}
                step={1}
                value={limit}
                disabled={loading}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-border accent-accent disabled:opacity-50"
              />
              <div className="flex justify-between text-[10px] font-bold uppercase text-muted-foreground">
                <span>Min</span>
                <span>Max {mode === "fetch" ? 100 : 50}</span>
              </div>
            </div>
          )}

          {/* Output dir (crawl) */}
          {mode === "crawl" && (
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
          )}

          {/* Loading state (crawl progress bar) */}
          {loading && mode === "crawl" && crawlProgress && (
            <div className="space-y-2">
              <Progress value={crawlProgress.percent ?? 0} className="w-full" />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{crawlProgress.message}</span>
              </div>
            </div>
          )}

          {/* Loading state (generic spinner) */}
          {loading && mode !== "crawl" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>
                {mode === "fetch" ? t("tool.news_scraper.fetching") : t("tool.news_scraper.scraping")}
              </span>
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

          {/* Action button */}
          <Button onClick={handleSubmit} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {mode === "fetch"
                  ? t("tool.news_scraper.fetching")
                  : mode === "scrape"
                  ? t("tool.news_scraper.scraping")
                  : t("tool.news_scraper.crawling")}
              </>
            ) : (
              <>
                {mode === "fetch" && <><List className="w-4 h-4 mr-2" />{t("tool.news_scraper.fetch_urls")}</>}
                {mode === "scrape" && <><Search className="w-4 h-4 mr-2" />{t("tool.news_scraper.scrape")}</>}
                {mode === "crawl" && <><Newspaper className="w-4 h-4 mr-2" />{t("tool.news_scraper.start_crawl")}</>}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* ---- Fetched URLs result ---- */}
      {fetchedUrls.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              {t("tool.news_scraper.urls_found").replace("{{count}}", String(fetchedUrls.length))}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 max-h-80 overflow-y-auto pr-1">
              {fetchedUrls.map((url, i) => (
                <li key={i} className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
                  <Link2 className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate font-mono text-foreground/80">{url}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(url)}
                    className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                    title="Copy URL"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMode("scrape"); setArticleUrl(url); void handleScrape(url); }}
                    className="flex-shrink-0 text-muted-foreground hover:text-accent"
                    title="Scrape this article"
                  >
                    <Search className="w-3.5 h-3.5" />
                  </button>
                  <a href={url} target="_blank" rel="noreferrer" className="flex-shrink-0 text-muted-foreground hover:text-foreground">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ---- Scraped article result ---- */}
      {scrapeResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              {scrapeResult.meta?.title ?? "Article"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Thumbnail */}
            {scrapeResult.meta?.image && (
              <img
                src={scrapeResult.meta.image}
                alt={scrapeResult.meta.title ?? ""}
                className="w-full rounded-lg object-cover max-h-52"
              />
            )}

            {/* Meta */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {scrapeResult.meta?.author && (
                <div>
                  <span className="text-muted-foreground text-xs">Author</span>
                  <p className="font-medium">{scrapeResult.meta.author}</p>
                </div>
              )}
              {scrapeResult.meta?.published_time && (
                <div>
                  <span className="text-muted-foreground text-xs">Published</span>
                  <p className="font-medium">{scrapeResult.meta.published_time.replace("T", " ").replace("Z", "")}</p>
                </div>
              )}
              {(scrapeResult.meta?.categories ?? []).length > 0 && (
                <div className="col-span-2">
                  <span className="text-muted-foreground text-xs">Categories</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {scrapeResult.meta?.categories?.map((c, i) => (
                      <span key={i} className="rounded-full bg-accent/20 text-accent px-2 py-0.5 text-[11px] font-medium">{c}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Description */}
            {scrapeResult.meta?.description && (
              <p className="text-sm text-muted-foreground border-l-2 border-accent pl-3 italic">
                {scrapeResult.meta.description}
              </p>
            )}

            {/* Body paragraphs */}
            {paragraphs.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Body ({paragraphs.length} paragraphs, {scrapeResult.body?.images?.length ?? 0} images)
                </p>
                <div className="space-y-2">
                  {(bodyExpanded ? paragraphs : paragraphs.slice(0, PREVIEW_PARAGRAPHS)).map((p, i) => (
                    <p key={i} className="text-sm leading-relaxed">{p}</p>
                  ))}
                </div>
                {paragraphs.length > PREVIEW_PARAGRAPHS && (
                  <button
                    type="button"
                    onClick={() => setBodyExpanded(!bodyExpanded)}
                    className="flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    {bodyExpanded ? (
                      <><ChevronUp className="w-3.5 h-3.5" /> Show less</>
                    ) : (
                      <><ChevronDown className="w-3.5 h-3.5" /> Show {paragraphs.length - PREVIEW_PARAGRAPHS} more paragraphs</>
                    )}
                  </button>
                )}
              </div>
            )}

            {/* Copy JSON */}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => copyToClipboard(JSON.stringify(scrapeResult, null, 2))}
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy JSON
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ---- Crawl result ---- */}
      {crawlProgress && (mode === "crawl") && (
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
                {(crawlProgress.saved_files ?? []).length > 0 && (
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {crawlProgress.saved_files?.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 rounded border border-border bg-muted/20 px-2 py-1 text-xs font-mono text-muted-foreground">
                        <CheckCircle2 className="w-3 h-3 flex-shrink-0 text-green-500" />
                        <span className="truncate">{f}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
