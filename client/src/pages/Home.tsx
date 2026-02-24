import { useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Video, FileText, Book, Film, Youtube,
  Music, FileAudio,
  Mic, Languages,
  Play, Download,
  Image as ImageIcon, Scissors, Gauge, BrainCircuit, Settings
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/i18n";
import type { I18nKey } from "@/i18n/translations";

const features = {
  basicTool: [
    {
      id: "tts-fast",
      titleKey: "feature.tool.tts_fast.title" as I18nKey,
      icon: Play,
      descriptionKey: "feature.tool.tts_fast.desc" as I18nKey,
    },
    {
      id: "dl-tiktok",
      titleKey: "feature.tool.dl_tiktok.title" as I18nKey,
      icon: Download,
      descriptionKey: "feature.tool.dl_tiktok.desc" as I18nKey,
    },
    {
      id: "dl-music",
      titleKey: "feature.tool.dl_music.title" as I18nKey,
      icon: Music,
      descriptionKey: "feature.tool.dl_music.desc" as I18nKey,
    },
    {
      id: "voice-clone",
      titleKey: "feature.tool.voice_clone.title" as I18nKey,
      icon: Mic,
      descriptionKey: "feature.tool.voice_clone.desc" as I18nKey,
    },
    {
      id: "voice-clone-custom",
      titleKey: "feature.tool.voice_clone_custom.title" as I18nKey,
      icon: Mic,
      descriptionKey: "feature.tool.voice_clone_custom.desc" as I18nKey,
    },
    {
      id: "background-removal",
      titleKey: "feature.tool.background_removal.title" as I18nKey,
      icon: ImageIcon,
      descriptionKey: "feature.tool.background_removal.desc" as I18nKey,
    },
    {
      id: "thumbnail",
      titleKey: "feature.tool.thumbnail.title" as I18nKey,
      icon: ImageIcon,
      descriptionKey: "feature.tool.thumbnail.desc" as I18nKey,
    },
    {
      id: "image-finder",
      titleKey: "feature.tool.image_finder.title" as I18nKey,
      icon: ImageIcon,
      descriptionKey: "feature.tool.image_finder.desc" as I18nKey,
    },
    {
      id: "llm",
      titleKey: "feature.tool.llm.title" as I18nKey,
      icon: BrainCircuit,
      descriptionKey: "feature.tool.llm.desc" as I18nKey,
    },
    {
      id: "translator",
      titleKey: "feature.tool.translator.title" as I18nKey,
      icon: Languages,
      descriptionKey: "feature.tool.translator.desc" as I18nKey,
    },
    {
      id: "mp3-to-wav",
      titleKey: "feature.tool.mp3_to_wav.title" as I18nKey,
      icon: FileAudio,
      descriptionKey: "feature.tool.mp3_to_wav.desc" as I18nKey,
    },
    {
      id: "trim-video",
      titleKey: "feature.tool.trim_video.title" as I18nKey,
      icon: Scissors,
      descriptionKey: "feature.tool.trim_video.desc" as I18nKey,
    },
    {
      id: "trim-audio",
      titleKey: "feature.tool.trim_audio.title" as I18nKey,
      icon: Scissors,
      descriptionKey: "feature.tool.trim_audio.desc" as I18nKey,
    },
    {
      id: "adjust-speed",
      titleKey: "feature.tool.adjust_speed.title" as I18nKey,
      icon: Gauge,
      descriptionKey: "feature.tool.adjust_speed.desc" as I18nKey,
    },
    {
      id: "merge-overlay",
      titleKey: "feature.tool.merge_overlay.title" as I18nKey,
      icon: ImageIcon,
      descriptionKey: "feature.tool.merge_overlay.desc" as I18nKey,
    },
    {
      id: "stt",
      titleKey: "feature.tool.stt.title" as I18nKey,
      icon: Languages,
      descriptionKey: "feature.tool.stt.desc" as I18nKey,
    },
  ],
  advancedTool: [
    {
      id: "reup-youtube",
      titleKey: "feature.workflow.reup_youtube.title" as I18nKey,
      icon: Youtube,
      descriptionKey: "feature.workflow.reup_youtube.desc" as I18nKey,
    },
    {
      id: "text-to-video",
      titleKey: "feature.workflow.text_to_video.title" as I18nKey,
      icon: Video,
      descriptionKey: "feature.workflow.text_to_video.desc" as I18nKey,
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
  ],
};

export default function Home({ onSelectFeature }: { onSelectFeature: (id: string) => void }) {
  const { t } = useI18n();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Restore scroll position when component mounts
    const savedScrollPosition = sessionStorage.getItem('homeScrollPosition');
    if (savedScrollPosition && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = parseInt(savedScrollPosition, 10);
      sessionStorage.removeItem('homeScrollPosition');
    }
  }, []);

  const handleFeatureClick = (id: string) => {
    // Save scroll position before navigating
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
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {features.basicTool.map((tool) => (
                  <Card
                    key={tool.id}
                    className="group cursor-pointer overflow-hidden border-card-border bg-card transition-all hover:-translate-y-0.5 hover:border-accent/70 hover:shadow-md"
                    onClick={() => handleFeatureClick(tool.id)}
                    data-testid={`card-tool-${tool.id}`}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 transition-colors duration-300 group-hover:border-accent/70 group-hover:bg-accent group-hover:text-accent-foreground">
                          <tool.icon className="w-5 h-5 text-muted-foreground group-hover:text-accent-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="mb-1.5 text-sm font-bold text-foreground transition-colors group-hover:text-accent">
                            {t(tool.titleKey)}
                          </h3>
                          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{t(tool.descriptionKey)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
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
                {features.advancedTool.map((feature) => (
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

            {/* Section 3: Workflow (placeholder) */}
            <section>
              <div className="mb-8">
                <h2 className="mb-2 text-3xl font-black tracking-tight text-foreground">{t("home.section.workflow")}</h2>
                <p className="text-muted-foreground">{t("home.section.workflow_desc")}</p>
              </div>
              <div className="flex items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 py-16">
                <p className="text-sm text-muted-foreground">{t("home.section.workflow_desc")}</p>
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
