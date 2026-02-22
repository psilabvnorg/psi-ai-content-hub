import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Check, Download, Eye, EyeOff, Image as ImageIcon, Key, Loader2, Search } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import { APP_API_URL } from "@/lib/api";
import { ProgressDisplay, ServiceStatusTable } from "@/components/common/tool-page-ui";
import type { ProgressData, StatusRowConfig } from "@/components/common/tool-page-ui";
import { useManagedServices } from "@/hooks/useManagedServices";

type ImageFinderImage = {
  url?: string;
  source?: string;
  description?: string;
  tags?: string[];
  file_path?: string;
  width?: number;
  height?: number;
  resolution?: number;
};

type ImageFinderResponse = {
  status?: string;
  keywords?: string;
  search_query?: string;
  count?: number;
  images?: ImageFinderImage[];
};

type ApiKeysStatusResponse = {
  unsplash?: {
    configured?: boolean;
    masked?: string;
  };
};

const IMAGE_COUNTS = ["5", "6", "7", "8", "9", "10"];
const ALL_SOURCE_IDS = [
  "google",
  "bing",
  "unsplash",
  "civitai",
  "kling_ai",
  "artvee",
  "wga",
] as const;

const SOURCE_GROUPS: Array<{
  groupKey: "general" | "api" | "ai" | "art";
  sources: readonly (typeof ALL_SOURCE_IDS)[number][];
}> = [
  { groupKey: "general", sources: ["google", "bing"] },
  { groupKey: "api", sources: ["unsplash"] },
  { groupKey: "ai", sources: ["civitai", "kling_ai"] },
  { groupKey: "art", sources: ["artvee", "wga"] },
];

const SOURCE_GROUP_LABEL_KEYS = {
  general: "tool.image_finder.source_group_general",
  api: "tool.image_finder.source_group_api",
  ai: "tool.image_finder.source_group_ai",
  art: "tool.image_finder.source_group_art",
} as const;

const SOURCE_LABELS: Record<(typeof ALL_SOURCE_IDS)[number], string> = {
  google: "Google",
  bing: "Bing",
  unsplash: "Unsplash",
  civitai: "Civitai",
  kling_ai: "KlingAI",
  artvee: "Artvee",
  wga: "WGA",
};

export default function ImageFinder({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const aimage_search_base_url = `${APP_API_URL}/api/v1/image-search`;
  const { t } = useI18n();
  const { servicesById } = useManagedServices();

  const [text, setText] = useState("");
  const [numberOfImages, setNumberOfImages] = useState("5");
  const [model, setModel] = useState("deepseek-r1:8b");
  const [selectedSources, setSelectedSources] = useState<string[]>([...ALL_SOURCE_IDS]);

  const [unsplashKey, setUnsplashKey] = useState("");
  const [unsplashKeyMasked, setUnsplashKeyMasked] = useState("");
  const [unsplashConfigured, setUnsplashConfigured] = useState(false);
  const [unsplashKeyVisible, setUnsplashKeyVisible] = useState(false);
  const [unsplashSaving, setUnsplashSaving] = useState(false);
  const [unsplashSaveStatus, setUnsplashSaveStatus] = useState<"idle" | "saved" | "error">("idle");

  const [isSearching, setIsSearching] = useState(false);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const [keywords, setKeywords] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [images, setImages] = useState<ImageFinderImage[]>([]);

  const [serverUnreachable, setServerUnreachable] = useState(true);

  const imageFinderService = servicesById.app;
  const statusReady = !serverUnreachable;

  const fetchApiKeyStatus = async () => {
    try {
      const res = await fetch(`${aimage_search_base_url}/config/api-keys`);
      if (!res.ok) return;
      const data = (await res.json()) as ApiKeysStatusResponse;
      setUnsplashConfigured(data.unsplash?.configured === true);
      setUnsplashKeyMasked(data.unsplash?.masked || "");
    } catch {
      // Server may not support config endpoint yet — silently ignore.
    }
  };

  const handleSaveApiKey = async ({
    sourceId,
    keyValue,
    setSaving,
    setSaveStatus,
    setConfigured,
    setMasked,
    setKeyValue,
    setKeyVisible,
  }: {
    sourceId: string;
    keyValue: string;
    setSaving: (v: boolean) => void;
    setSaveStatus: (v: "idle" | "saved" | "error") => void;
    setConfigured: (v: boolean) => void;
    setMasked: (v: string) => void;
    setKeyValue: (v: string) => void;
    setKeyVisible: (v: boolean) => void;
  }) => {
    setSaving(true);
    setSaveStatus("idle");
    try {
      const res = await fetch(`${aimage_search_base_url}/config/api-keys/${sourceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: keyValue.trim() }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(payload.detail || "Save failed");
      }
      const data = (await res.json()) as { configured?: boolean; masked?: string };
      setConfigured(data.configured === true);
      setMasked(data.masked || "");
      setKeyValue("");
      setKeyVisible(false);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUnsplashKey = () =>
    handleSaveApiKey({
      sourceId: "unsplash",
      keyValue: unsplashKey,
      setSaving: setUnsplashSaving,
      setSaveStatus: setUnsplashSaveStatus,
      setConfigured: setUnsplashConfigured,
      setMasked: setUnsplashKeyMasked,
      setKeyValue: setUnsplashKey,
      setKeyVisible: setUnsplashKeyVisible,
    });

  const fetchStatus = async () => {
    try {
      const response = await fetch(`${APP_API_URL}/api/v1/status`);
      if (!response.ok) throw new Error("status");
      setServerUnreachable(false);
    } catch {
      setServerUnreachable(true);
    }
  };

  useEffect(() => {
    void fetchStatus();
    void fetchApiKeyStatus();
  }, []);

  useEffect(() => {
    if (!imageFinderService) return;
    if (imageFinderService.status === "running" || imageFinderService.status === "stopped") {
      void fetchStatus();
      void fetchApiKeyStatus();
    }
  }, [imageFinderService?.status]);

  const handleToggleSource = (sourceId: string, checked: boolean) => {
    setSelectedSources((previous) => {
      if (checked) {
        if (previous.includes(sourceId)) return previous;
        return [...previous, sourceId];
      }
      return previous.filter((source) => source !== sourceId);
    });
  };

  const handleSearch = async () => {
    if (isSearching || !text.trim()) return;

    setIsSearching(true);
    setLogs([]);
    setImages([]);
    setKeywords("");
    setSearchQuery("");
    setProgress({ status: "starting", percent: 5, message: t("tool.image_finder.searching") });

    try {
      const response = await fetch(`${aimage_search_base_url}/image-finder/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          number_of_images: Number(numberOfImages),
          model: model.trim(),
          sources: selectedSources,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { detail?: string };
        throw new Error(payload.detail || t("tool.image_finder.search_failed"));
      }

      const payload = (await response.json()) as ImageFinderResponse;
      const foundImages = Array.isArray(payload.images) ? payload.images : [];

      setKeywords(payload.keywords || "");
      setSearchQuery(payload.search_query || "");
      setImages(foundImages);
      setLogs((prev) => [
        ...prev,
        `[INFO] ${t("tool.image_finder.found_images", { count: foundImages.length })}`,
      ]);
      setProgress({ status: "complete", percent: 100, message: t("tool.image_finder.search_complete") });
    } catch (error) {
      const message = error instanceof Error ? error.message : t("tool.image_finder.search_failed");
      setProgress({ status: "error", percent: 0, message });
      setLogs((prev) => [...prev, `[ERROR] ${message}`]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleDownloadImage = async (url: string, index: number) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("download failed");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `image-finder-${index + 1}.jpg`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, "_blank");
    }
  };

  const statusRows: StatusRowConfig[] = [
    {
      id: "server",
      label: t("tool.image_finder.server_status"),
      isReady: !serverUnreachable,
      path: `${APP_API_URL}/api/v1/image-search`,
      showSecondaryAction: serverUnreachable && Boolean(onOpenSettings),
      secondaryActionLabel: t("tool.common.open_settings"),
      onSecondaryAction: onOpenSettings,
    },
  ];

  const canSearch = statusReady && !isSearching && text.trim().length > 0 && selectedSources.length > 0;

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-card">
      <CardContent className="p-8 space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">{t("feature.tool.image_finder.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("feature.tool.image_finder.desc")}</p>
        </div>

        <ServiceStatusTable serverUnreachable={serverUnreachable} rows={statusRows} onRefresh={fetchStatus} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.image_finder.model")}</label>
            <Input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="deepseek-r1:8b"
              className="bg-card border-border"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.image_finder.number_of_images")}</label>
            <Select value={numberOfImages} onValueChange={setNumberOfImages}>
              <SelectTrigger className="bg-card border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IMAGE_COUNTS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-xs font-bold text-muted-foreground uppercase">
            {t("tool.image_finder.sources")}
          </label>
          {SOURCE_GROUPS.map(({ groupKey, sources }) => (
            <div key={groupKey} className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">
                {t(SOURCE_GROUP_LABEL_KEYS[groupKey])}
              </p>
              <div className="flex flex-wrap gap-3">
                {sources.map((sourceId) => (
                  <label key={sourceId} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedSources.includes(sourceId)}
                      onChange={(event) => {
                        handleToggleSource(sourceId, event.target.checked);
                      }}
                    />
                    <span className="text-sm">{SOURCE_LABELS[sourceId]}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-muted-foreground" />
            <label className="text-xs font-bold text-muted-foreground uppercase">
              {t("tool.image_finder.unsplash_api_key")}
            </label>
            {unsplashConfigured && (
              <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                {t("tool.image_finder.unsplash_configured")}
                {unsplashKeyMasked ? ` (${unsplashKeyMasked})` : ""}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("tool.image_finder.unsplash_note")}{" "}
            <a
              href="https://unsplash.com/developers"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-accent hover:text-accent/80"
            >
              unsplash.com/developers
            </a>
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={unsplashKeyVisible ? "text" : "password"}
                value={unsplashKey}
                onChange={(e) => setUnsplashKey(e.target.value)}
                placeholder={unsplashConfigured ? t("tool.image_finder.unsplash_placeholder_update") : t("tool.image_finder.unsplash_placeholder")}
                className="bg-card border-border pr-10 font-mono text-sm"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setUnsplashKeyVisible((v) => !v)}
                tabIndex={-1}
              >
                {unsplashKeyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button
              variant="outline"
              size="default"
              onClick={handleSaveUnsplashKey}
              disabled={unsplashSaving || !unsplashKey.trim()}
              className="min-w-[80px]"
            >
              {unsplashSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : unsplashSaveStatus === "saved" ? (
                <><Check className="w-4 h-4 mr-1 text-green-600" />{t("tool.image_finder.unsplash_saved")}</>
              ) : (
                t("tool.image_finder.unsplash_save")
              )}
            </Button>
          </div>
          {unsplashSaveStatus === "error" && (
            <p className="text-xs text-destructive">{t("tool.image_finder.unsplash_save_failed")}</p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-muted-foreground uppercase">{t("tool.image_finder.input_text")}</label>
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t("tool.image_finder.input_placeholder")}
            className="min-h-[140px] bg-card border-border resize-none"
          />
        </div>

        <Button
          className="w-full h-12 bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl font-bold"
          onClick={handleSearch}
          disabled={!canSearch}
        >
          {isSearching ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Search className="w-5 h-5 mr-2" />}
          {isSearching ? t("tool.image_finder.searching") : t("tool.image_finder.search")}
        </Button>

        <ProgressDisplay progress={progress} logs={logs} defaultMessage={t("tool.common.processing")} />

        {(keywords || searchQuery) && (
          <div className="p-4 border border-border rounded-xl bg-card space-y-2">
            <div className="text-xs text-muted-foreground">
              <span className="font-bold uppercase mr-2">{t("tool.image_finder.keywords")}:</span>
              {keywords || "--"}
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="font-bold uppercase mr-2">{t("tool.image_finder.search_query")}:</span>
              {searchQuery || "--"}
            </div>
          </div>
        )}

        {images.length > 0 && (
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase text-muted-foreground">
              {t("tool.image_finder.output_images", { count: images.length })}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {images.map((image, index) => {
                const imageUrl = typeof image.url === "string" ? image.url : "";
                if (!imageUrl) return null;
                return (
                  <div key={`${imageUrl}-${index}`} className="border border-border rounded-xl p-2 bg-card space-y-2">
                    <div className="w-full aspect-video rounded-md overflow-hidden bg-muted/40">
                      <img src={imageUrl} alt={`image-result-${index + 1}`} className="w-full h-full object-cover" />
                    </div>
                    <div className="text-xs text-muted-foreground truncate" title={imageUrl}>
                      <a
                        href={imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-foreground"
                      >
                        {imageUrl.length > 60 ? `${imageUrl.slice(0, 60)}…` : imageUrl}
                      </a>
                    </div>
                    {image.source && (
                      <div className="text-[11px] text-muted-foreground/70">
                        via {image.source}
                      </div>
                    )}
                    {(typeof image.width === "number" || typeof image.height === "number" || typeof image.resolution === "number") && (
                      <div className="text-[11px] text-muted-foreground">
                        {typeof image.width === "number" && typeof image.height === "number"
                          ? `${image.width}x${image.height}`
                          : "--"}
                        {typeof image.resolution === "number" ? ` • ${image.resolution.toLocaleString()} px` : ""}
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        void handleDownloadImage(imageUrl, index);
                      }}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      {t("tool.image_finder.download_image")}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!isSearching && images.length === 0 && (
          <div className="text-xs text-muted-foreground border border-dashed border-border rounded-xl p-6 text-center">
            <ImageIcon className="w-5 h-5 inline mr-2" />
            {t("tool.image_finder.no_images")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
