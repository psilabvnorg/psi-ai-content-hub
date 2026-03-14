import { useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Video, FileText, Book, Film, Youtube,
  Music, FileAudio,
  Mic, Languages,
  Play, Download, Volume2,
  Image as ImageIcon, Scissors, Gauge, BrainCircuit, Settings, Newspaper, Palette, Wand2, Type, TableProperties, ListChecks
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/i18n";
import type { I18nKey } from "@/i18n/translations";

type ToolItem = {
  id: string;
  titleKey: I18nKey;
  icon: React.ElementType;
  descriptionKey: I18nKey;
};

type BasicToolSection = {
  sectionId: string;
  label: string;
  tools: ToolItem[];
};

const basicToolSections: BasicToolSection[] = [
  {
    sectionId: "voice",
    label: "Voice Tool",
    tools: [
      { id: "tts-fast", titleKey: "feature.tool.tts_fast.title" as I18nKey, icon: Play, descriptionKey: "feature.tool.tts_fast.desc" as I18nKey },
      { id: "piper-tts", titleKey: "feature.tool.piper_tts.title" as I18nKey, icon: Volume2, descriptionKey: "feature.tool.piper_tts.desc" as I18nKey },
      { id: "voice-clone", titleKey: "feature.tool.voice_clone.title" as I18nKey, icon: Mic, descriptionKey: "feature.tool.voice_clone.desc" as I18nKey },
      { id: "voice-clone-custom", titleKey: "feature.tool.voice_clone_custom.title" as I18nKey, icon: Mic, descriptionKey: "feature.tool.voice_clone_custom.desc" as I18nKey },
      { id: "stt", titleKey: "feature.tool.stt.title" as I18nKey, icon: Languages, descriptionKey: "feature.tool.stt.desc" as I18nKey },
      { id: "mp3-to-wav", titleKey: "feature.tool.mp3_to_wav.title" as I18nKey, icon: FileAudio, descriptionKey: "feature.tool.mp3_to_wav.desc" as I18nKey },
      { id: "trim-audio", titleKey: "feature.tool.trim_audio.title" as I18nKey, icon: Scissors, descriptionKey: "feature.tool.trim_audio.desc" as I18nKey },
      { id: "dl-music", titleKey: "feature.tool.dl_music.title" as I18nKey, icon: Music, descriptionKey: "feature.tool.dl_music.desc" as I18nKey },
    ],
  },
  {
    sectionId: "download",
    label: "Download Tool",
    tools: [
      { id: "dl-tiktok", titleKey: "feature.tool.dl_tiktok.title" as I18nKey, icon: Download, descriptionKey: "feature.tool.dl_tiktok.desc" as I18nKey },
      { id: "news-scraper", titleKey: "feature.tool.news_scraper.title" as I18nKey, icon: Newspaper, descriptionKey: "feature.tool.news_scraper.desc" as I18nKey },
      { id: "image-finder", titleKey: "feature.tool.image_finder.title" as I18nKey, icon: ImageIcon, descriptionKey: "feature.tool.image_finder.desc" as I18nKey },
    ],
  },
  {
    sectionId: "image",
    label: "Image Tool",
    tools: [
      { id: "background-removal", titleKey: "feature.tool.background_removal.title" as I18nKey, icon: ImageIcon, descriptionKey: "feature.tool.background_removal.desc" as I18nKey },
      { id: "image-editor", titleKey: "feature.tool.image_editor.title" as I18nKey, icon: ImageIcon, descriptionKey: "feature.tool.image_editor.desc" as I18nKey },
      { id: "logo-generator-prompt", titleKey: "feature.tool.logo_generator_prompt.title" as I18nKey, icon: Wand2, descriptionKey: "feature.tool.logo_generator_prompt.desc" as I18nKey },
      { id: "text-generator", titleKey: "feature.tool.text_generator.title" as I18nKey, icon: Type, descriptionKey: "feature.tool.text_generator.desc" as I18nKey },
      { id: "color-picker", titleKey: "feature.tool.color_picker.title" as I18nKey, icon: Palette, descriptionKey: "feature.tool.color_picker.desc" as I18nKey },
      { id: "thumbnail", titleKey: "feature.tool.thumbnail.title" as I18nKey, icon: ImageIcon, descriptionKey: "feature.tool.thumbnail.desc" as I18nKey },
      { id: "thumbnail-simple", titleKey: "feature.tool.thumbnail_simple.title" as I18nKey, icon: ImageIcon, descriptionKey: "feature.tool.thumbnail_simple.desc" as I18nKey },
      { id: "image-border", titleKey: "feature.tool.image_border.title" as I18nKey, icon: ImageIcon, descriptionKey: "feature.tool.image_border.desc" as I18nKey },
    ],
  },
  {
    sectionId: "text",
    label: "Text Tool",
    tools: [
      { id: "llm", titleKey: "feature.tool.llm.title" as I18nKey, icon: BrainCircuit, descriptionKey: "feature.tool.llm.desc" as I18nKey },
      { id: "translator", titleKey: "feature.tool.translator.title" as I18nKey, icon: Languages, descriptionKey: "feature.tool.translator.desc" as I18nKey },
    ],
  },
  {
    sectionId: "other",
    label: "Other",
    tools: [
      { id: "trim-video", titleKey: "feature.tool.trim_video.title" as I18nKey, icon: Scissors, descriptionKey: "feature.tool.trim_video.desc" as I18nKey },
      { id: "adjust-speed", titleKey: "feature.tool.adjust_speed.title" as I18nKey, icon: Gauge, descriptionKey: "feature.tool.adjust_speed.desc" as I18nKey },
      { id: "merge-overlay", titleKey: "feature.tool.merge_overlay.title" as I18nKey, icon: ImageIcon, descriptionKey: "feature.tool.merge_overlay.desc" as I18nKey },
      { id: "image-upscaler", titleKey: "feature.tool.image_upscaler.title" as I18nKey, icon: ImageIcon, descriptionKey: "feature.tool.image_upscaler.desc" as I18nKey },
    ],
  },
];

const advancedTools = [
  {
    id: "reup-youtube",
    titleKey: "feature.workflow.reup_youtube.title" as I18nKey,
    icon: Youtube,
    descriptionKey: "feature.workflow.reup_youtube.desc" as I18nKey,
  },
  {
    id: "news-to-video",
    titleKey: "feature.workflow.news_to_video.title" as I18nKey,
    icon: FileText,
    descriptionKey: "feature.workflow.news_to_video.desc" as I18nKey,
  },
  {
    id: "book-to-video",
    titleKey: "feature.workflow.book_to_video.title" as I18nKey,
    icon: Book,
    descriptionKey: "feature.workflow.book_to_video.desc" as I18nKey,
  },
  {
    id: "movie-to-video",
    titleKey: "feature.workflow.movie_to_video.title" as I18nKey,
    icon: Film,
    descriptionKey: "feature.workflow.movie_to_video.desc" as I18nKey,
  },
  {
    id: "clone-channel",
    titleKey: "feature.workflow.clone_channel.title" as I18nKey,
    icon: Youtube,
    descriptionKey: "feature.workflow.clone_channel.desc" as I18nKey,
  },
];

export default function Home({ onSelectFeature }: { onSelectFeature: (id: string) => void }) {
  const { t } = useI18n();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedScrollPosition = sessionStorage.getItem('homeScrollPosition');
    if (savedScrollPosition && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = parseInt(savedScrollPosition, 10);
      sessionStorage.removeItem('homeScrollPosition');
    }
  }, []);

  const handleFeatureClick = (id: string) => {
    if (scrollContainerRef.current) {
      sessionStorage.setItem('homeScrollPosition', scrollContainerRef.current.scrollTop.toString());
    }
    onSelectFeature(id);
  };

  return (
    <div className="bg-background text-foreground">
      <div ref={scrollContainerRef} className="h-screen pt-16 overflow-y-auto scroll-smooth">
        <div className="p-6 md:p-10">
          <div className="mx-auto max-w-7xl space-y-16 pb-14">

            {/* Section 1: Basic Tools */}
            <section>
              <div className="mb-8">
                <h2 className="mb-2 text-3xl font-black tracking-tight text-foreground">{t("home.section.tools")}</h2>
                <p className="text-muted-foreground">{t("home.section.tools_desc")}</p>
              </div>

              <div className="space-y-8">
                {basicToolSections.map((section) => (
                  <div key={section.sectionId}>
                    <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground border-b border-border pb-2">
                      {section.label}
                    </h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      {section.tools.map((tool) => (
                        <Card
                          key={tool.id}
                          className="group cursor-pointer overflow-hidden border-card-border bg-card transition-all hover:-translate-y-0.5 hover:border-accent/70 hover:shadow-md"
                          onClick={() => handleFeatureClick(tool.id)}
                          data-testid={`card-tool-${tool.id}`}
                        >
                          <CardContent className="p-5">
                            <div className="flex items-start gap-3">
                              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 transition-colors duration-300 group-hover:border-accent/70 group-hover:bg-accent group-hover:text-accent-foreground">
                                <tool.icon className="w-4 h-4 text-muted-foreground group-hover:text-accent-foreground" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="mb-1 text-sm font-bold text-foreground transition-colors group-hover:text-accent">
                                  {t(tool.titleKey)}
                                </h3>
                                <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{t(tool.descriptionKey)}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Section 2: Advanced Tools */}
            <section>
              <div className="mb-8 flex items-end justify-between gap-4">
                <div>
                  <h2 className="mb-2 text-3xl font-black tracking-tight text-foreground">{t("home.section.workflows")}</h2>
                  <p className="text-muted-foreground">{t("home.section.workflows_desc")}</p>
                </div>
                <Button variant="link" className="hidden font-bold md:flex">
                  {t("app.view_all")}
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                {advancedTools.map((feature) => (
                  <Card
                    key={feature.id}
                    className="group cursor-pointer overflow-hidden border-card-border bg-card transition-all duration-300 hover:-translate-y-1 hover:border-accent/70 hover:shadow-lg"
                    onClick={() => handleFeatureClick(feature.id)}
                    data-testid={`card-workflow-${feature.id}`}
                  >
                    <CardContent className="p-8">
                      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl border border-accent-border bg-accent text-accent-foreground shadow-sm transition-transform duration-300 group-hover:scale-105">
                        <feature.icon className="w-7 h-7" />
                      </div>
                      <h3 className="mb-3 text-xl font-black tracking-tight text-foreground transition-colors group-hover:text-accent">
                        {t(feature.titleKey)}
                      </h3>
                      <p className="text-sm font-medium leading-relaxed text-muted-foreground">{t(feature.descriptionKey)}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            {/* Section 3: Workflow */}
            <section>
              <div className="mb-8">
                <h2 className="mb-2 text-3xl font-black tracking-tight text-foreground">{t("home.section.workflow")}</h2>
                <p className="text-muted-foreground">Batch automation sequences powered by templates.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card
                  className="group cursor-pointer overflow-hidden border-card-border bg-card transition-all hover:-translate-y-0.5 hover:border-accent/70 hover:shadow-md"
                  onClick={() => handleFeatureClick("thumbnail-workflow")}
                  data-testid="card-workflow-thumbnail-workflow"
                >
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 transition-colors duration-300 group-hover:border-accent/70 group-hover:bg-accent group-hover:text-accent-foreground">
                        <TableProperties className="w-4 h-4 text-muted-foreground group-hover:text-accent-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="mb-1 text-sm font-bold text-foreground transition-colors group-hover:text-accent">
                          Thumbnail Batch
                        </h3>
                        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          Upload Excel + template → export one PNG per row with placeholder images swapped in.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card
                  className="group cursor-pointer overflow-hidden border-card-border bg-card transition-all hover:-translate-y-0.5 hover:border-accent/70 hover:shadow-md"
                  onClick={() => handleFeatureClick("llm-batch")}
                  data-testid="card-workflow-llm-batch"
                >
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 transition-colors duration-300 group-hover:border-accent/70 group-hover:bg-accent group-hover:text-accent-foreground">
                        <ListChecks className="w-4 h-4 text-muted-foreground group-hover:text-accent-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="mb-1 text-sm font-bold text-foreground transition-colors group-hover:text-accent">
                          {t("feature.workflow.llm_batch.title")}
                        </h3>
                        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {t("feature.workflow.llm_batch.desc")}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* Section 4: Settings */}
            <section className="pb-12">
              <div className="mb-8">
                <h2 className="mb-2 text-3xl font-black tracking-tight text-foreground">{t("home.section.settings")}</h2>
              </div>
              <Button
                size="lg"
                variant="outline"
                className="gap-2 font-bold"
                onClick={() => handleFeatureClick("settings")}
                data-testid="button-home-settings"
              >
                <Settings className="w-5 h-5" />
                {t("nav.settings")}
              </Button>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}