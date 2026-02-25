import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  BrainCircuit,
  Download,
  Image as ImageIcon,
  Loader2,
  Search,
} from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import { APP_API_URL } from "@/lib/api";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  ProgressDisplay,
  ServiceStatusTable,
} from "@/components/common/tool-page-ui";
import type {
  ProgressData,
  StatusRowConfig,
} from "@/components/common/tool-page-ui";
import { useManagedServices } from "@/hooks/useManagedServices";
import { useAppStatus } from "@/context/AppStatusContext";

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

type PreviewImage = {
  url: string;
  index: number;
  source?: string;
  width?: number;
  height?: number;
  resolution?: number;
};

const IMAGE_COUNTS = ["5", "6", "7", "8", "9", "10"];
const ALL_SOURCE_IDS = [
  "google",
  "bing",
  "unsplash",
  "lexica",
  "artvee",
] as const;

const SOURCE_GROUPS: Array<{
  groupKey: "general" | "ai_generated" | "gallery" | "story_art";
  title: string;
  description: string;
  example: string;
  sources: readonly (typeof ALL_SOURCE_IDS)[number][];
}> = [
  {
    groupKey: "general",
    title: "General Image Search",
    description:
      "Broad search engines for latest information and reference images.",
    example:
      "Example: world news event, sports match highlights, historical facts",
    sources: ["google", "bing"],
  },
  {
    groupKey: "ai_generated",
    title: "AI-Generated Image Sources",
    description:
      "Best for synthetic visuals, prompts, styles, and model-generated artwork.",
    example:
      "Example: cyberpunk portrait, fantasy character concept, cinematic AI style",
    sources: ["lexica"],
  },
  {
    groupKey: "gallery",
    title: "Stock And Gallery Images",
    description:
      "High-quality regular photos from stock and free image libraries.",
    example:
      "Example: office team photo, nature landscape, city street lifestyle",
    sources: ["unsplash"],
  },
  {
    groupKey: "story_art",
    title: "Philosophy And Story References",
    description:
      "Classical art and archival references suited for themes and narratives.",
    example:
      "Example: renaissance painting, mythology scene, philosophical symbolism",
    sources: ["artvee"],
  },
];

const SOURCE_LABELS: Record<(typeof ALL_SOURCE_IDS)[number], string> = {
  google: "Google",
  bing: "Bing",
  unsplash: "Unsplash",
  lexica: "Lexica",
  artvee: "Artvee",
};

export default function ImageFinder({
  onOpenSettings,
}: {
  onOpenSettings?: () => void;
}) {
  const aimage_search_base_url = `${APP_API_URL}/api/v1/image-search`;
  const { t } = useI18n();
  const { servicesById } = useManagedServices();
  const { hasMissingDeps } = useAppStatus();

  const [text, setText] = useState("");
  const [numberOfImages, setNumberOfImages] = useState("5");
  const [useLlm, setUseLlm] = useState(false);
  const [selectedSources, setSelectedSources] = useState<string[]>([
    "google",
    "bing",
  ]);

  const [isSearching, setIsSearching] = useState(false);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const [keywords, setKeywords] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [images, setImages] = useState<ImageFinderImage[]>([]);
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null);

  const [serverUnreachable, setServerUnreachable] = useState(true);

  const imageFinderService = servicesById.app;
  const statusReady = !serverUnreachable;

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
  }, []);

  useEffect(() => {
    if (!imageFinderService) return;
    if (
      imageFinderService.status === "running" ||
      imageFinderService.status === "stopped"
    ) {
      void fetchStatus();
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
    setProgress({
      status: "starting",
      percent: 5,
      message: t("tool.image_finder.searching"),
    });

    try {
      const response = await fetch(
        `${aimage_search_base_url}/image-finder/search`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: text.trim(),
            number_of_images: Number(numberOfImages),
            use_llm: useLlm,
            sources: selectedSources,
          }),
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          detail?: string;
        };
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
      setProgress({
        status: "complete",
        percent: 100,
        message: t("tool.image_finder.search_complete"),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("tool.image_finder.search_failed");
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

  const handlePreviewImage = (image: ImageFinderImage, index: number) => {
    if (typeof image.url !== "string" || !image.url) return;
    setPreviewImage({
      url: image.url,
      index,
      source: image.source,
      width: image.width,
      height: image.height,
      resolution: image.resolution,
    });
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

  const canSearch =
    statusReady &&
    !isSearching &&
    text.trim().length > 0 &&
    selectedSources.length > 0;

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-card">
      <CardContent className="p-8 space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">
            {t("feature.tool.image_finder.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("feature.tool.image_finder.desc")}
          </p>
        </div>

        <ServiceStatusTable
          serverUnreachable={serverUnreachable}
          rows={statusRows}
          onRefresh={fetchStatus}
          serverWarning={hasMissingDeps}
          onOpenSettings={onOpenSettings}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase">
              {t("tool.image_finder.number_of_images")}
            </label>
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
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase">
              {t("tool.image_finder.llm_extraction")}
            </label>
            <button
              type="button"
              onClick={() => setUseLlm((v) => !v)}
              className={`flex items-center gap-2 w-full px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                useLlm
                  ? "bg-accent text-accent-foreground border-accent"
                  : "bg-card text-muted-foreground border-border hover:border-accent/50"
              }`}
            >
              <BrainCircuit className="w-4 h-4 shrink-0" />
              <span>
                {useLlm
                  ? t("tool.image_finder.llm_extraction_on")
                  : t("tool.image_finder.llm_extraction_off")}
              </span>
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-xs font-bold text-muted-foreground uppercase">
            {t("tool.image_finder.sources")}
          </label>
          {SOURCE_GROUPS.map(
            ({ groupKey, title, description, example, sources }) => (
              <div key={groupKey} className="space-y-1">
                <p className="text-xs text-muted-foreground font-semibold">
                  {title}
                </p>
                <p className="text-xs text-muted-foreground">{description}</p>
                <p className="text-xs text-muted-foreground/80">{example}</p>
                <div className="flex flex-wrap gap-3">
                  {sources.map((sourceId) => {
                    const isChecked = selectedSources.includes(sourceId);
                    return (
                      <label
                        key={sourceId}
                        className="flex items-center gap-1.5 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(event) => {
                            handleToggleSource(sourceId, event.target.checked);
                          }}
                        />
                        <span className="text-sm">
                          {SOURCE_LABELS[sourceId]}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ),
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-muted-foreground uppercase">
            {t("tool.image_finder.input_text")}
          </label>
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
          {isSearching ? (
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
          ) : (
            <Search className="w-5 h-5 mr-2" />
          )}
          {isSearching
            ? t("tool.image_finder.searching")
            : t("tool.image_finder.search")}
        </Button>

        <ProgressDisplay
          progress={progress}
          logs={logs}
          defaultMessage={t("tool.common.processing")}
        />

        {(keywords || searchQuery) && (
          <div className="p-4 border border-border rounded-xl bg-card space-y-2">
            <div className="text-xs text-muted-foreground">
              <span className="font-bold uppercase mr-2">
                {t("tool.image_finder.keywords")}:
              </span>
              {keywords || "--"}
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="font-bold uppercase mr-2">
                {t("tool.image_finder.search_query")}:
              </span>
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
                  <div
                    key={`${imageUrl}-${index}`}
                    className="border border-border rounded-xl p-2 bg-card space-y-2"
                  >
                    <button
                      type="button"
                      className="w-full aspect-video rounded-md overflow-hidden bg-muted/40 cursor-zoom-in"
                      onClick={() => handlePreviewImage(image, index)}
                    >
                      <img
                        src={imageUrl}
                        alt={`image-result-${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                    <div
                      className="text-xs text-muted-foreground truncate"
                      title={imageUrl}
                    >
                      <a
                        href={imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-foreground"
                      >
                        {imageUrl.length > 60
                          ? `${imageUrl.slice(0, 60)}…`
                          : imageUrl}
                      </a>
                    </div>
                    {image.source && (
                      <div className="text-[11px] text-muted-foreground/70">
                        via {image.source}
                      </div>
                    )}
                    {(typeof image.width === "number" ||
                      typeof image.height === "number" ||
                      typeof image.resolution === "number") && (
                      <div className="text-[11px] text-muted-foreground">
                        {typeof image.width === "number" &&
                        typeof image.height === "number"
                          ? `${image.width}x${image.height}`
                          : "--"}
                        {typeof image.resolution === "number"
                          ? ` • ${image.resolution.toLocaleString()} px`
                          : ""}
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

        <Dialog
          open={previewImage !== null}
          onOpenChange={(open) => {
            if (!open) setPreviewImage(null);
          }}
        >
          <DialogContent className="w-[95vw] max-w-5xl p-3 sm:p-4">
            <DialogTitle className="sr-only">Image Preview</DialogTitle>
            {previewImage && (
              <div className="space-y-3">
                <div className="w-full max-h-[75vh] rounded-md bg-muted/40 overflow-hidden">
                  <img
                    src={previewImage.url}
                    alt={`image-preview-${previewImage.index + 1}`}
                    className="w-full h-full max-h-[75vh] object-contain"
                  />
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="text-xs text-muted-foreground">
                    {previewImage.source ? `via ${previewImage.source}` : ""}
                    {(typeof previewImage.width === "number" &&
                      typeof previewImage.height === "number") ||
                    typeof previewImage.resolution === "number"
                      ? ` ${
                          previewImage.source ? "•" : ""
                        } ${typeof previewImage.width === "number" && typeof previewImage.height === "number" ? `${previewImage.width}x${previewImage.height}` : "--"}${typeof previewImage.resolution === "number" ? ` • ${previewImage.resolution.toLocaleString()} px` : ""}`
                      : ""}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void handleDownloadImage(
                          previewImage.url,
                          previewImage.index,
                        )
                      }
                    >
                      <Download className="w-4 h-4 mr-2" />
                      {t("tool.image_finder.download_image")}
                    </Button>
                    <Button size="sm" asChild>
                      <a
                        href={previewImage.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open Original
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
