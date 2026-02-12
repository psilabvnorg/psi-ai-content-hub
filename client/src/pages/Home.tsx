import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Video, FileText, Book, Film, Youtube, 
  Music, FileAudio, 
  Mic, Languages, Search, Settings, 
  Menu, Sparkles,
  Instagram, Facebook, Play,
  Image as ImageIcon, Scissors, Gauge, Terminal
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n";
import type { I18nKey } from "@/i18n/translations";
import BrandLogo from "@/components/BrandLogo";

const features = {
  workflow: [
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
  tool: [
    { 
      id: "dl-tiktok",
      titleKey: "feature.tool.dl_tiktok.title" as I18nKey,
      icon: Video,
      descriptionKey: "feature.tool.dl_tiktok.desc" as I18nKey,
    },
    { 
      id: "dl-youtube",
      titleKey: "feature.tool.dl_youtube.title" as I18nKey,
      icon: Youtube,
      descriptionKey: "feature.tool.dl_youtube.desc" as I18nKey,
    },
    { 
      id: "dl-facebook",
      titleKey: "feature.tool.dl_facebook.title" as I18nKey,
      icon: Facebook,
      descriptionKey: "feature.tool.dl_facebook.desc" as I18nKey,
    },
    { 
      id: "dl-instagram",
      titleKey: "feature.tool.dl_instagram.title" as I18nKey,
      icon: Instagram,
      descriptionKey: "feature.tool.dl_instagram.desc" as I18nKey,
    },
    { 
      id: "dl-music",
      titleKey: "feature.tool.dl_music.title" as I18nKey,
      icon: Music,
      descriptionKey: "feature.tool.dl_music.desc" as I18nKey,
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
      id: "adjust-speed",
      titleKey: "feature.tool.adjust_speed.title" as I18nKey,
      icon: Gauge,
      descriptionKey: "feature.tool.adjust_speed.desc" as I18nKey,
    },
    { 
      id: "thumbnail",
      titleKey: "feature.tool.thumbnail.title" as I18nKey,
      icon: ImageIcon,
      descriptionKey: "feature.tool.thumbnail.desc" as I18nKey,
    },
    { 
      id: "tts-fast",
      titleKey: "feature.tool.tts_fast.title" as I18nKey,
      icon: Play,
      descriptionKey: "feature.tool.tts_fast.desc" as I18nKey,
    },
    { 
      id: "voice-clone",
      titleKey: "feature.tool.voice_clone.title" as I18nKey,
      icon: Mic,
      descriptionKey: "feature.tool.voice_clone.desc" as I18nKey,
    },
    { 
      id: "stt",
      titleKey: "feature.tool.stt.title" as I18nKey,
      icon: Languages,
      descriptionKey: "feature.tool.stt.desc" as I18nKey,
    },
    {
      id: "backend-console",
      titleKey: "feature.tool.backend_console.title" as I18nKey,
      icon: Terminal,
      descriptionKey: "feature.tool.backend_console.desc" as I18nKey,
    },
  ]
};

export default function Home({ onSelectFeature }: { onSelectFeature: (id: string) => void }) {
  const isMobile = useIsMobile();
  const { t } = useI18n();
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSidebarOpen(!isMobile);
  }, [isMobile]);

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
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 border-r border-sidebar-border bg-sidebar transition-transform duration-300 ease-in-out shadow-xl lg:relative lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-sidebar-border">
            <BrandLogo label={t("app.name")} imageClassName="h-10 border-white/15 bg-black" />
          </div>

          <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
            <div className="py-4">
              <p className="px-2 mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/85">
                {t("nav.workflows")}
              </p>
              {features.workflow.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleFeatureClick(item.id)}
                  className="w-full flex items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-sidebar-accent-border hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  data-testid={`link-${item.id}`}
                >
                  <item.icon className="w-4 h-4" />
                  {t(item.titleKey)}
                </button>
              ))}
            </div>

            <div className="py-4 mt-2 border-t border-sidebar-border">
              <p className="px-2 mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/85">
                {t("nav.tools")}
              </p>
              <div className="grid grid-cols-1 gap-1">
                {features.tool.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleFeatureClick(item.id)}
                    className="w-full flex items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-sidebar-accent-border hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    data-testid={`link-${item.id}`}
                  >
                    <item.icon className="w-4 h-4" />
                    {t(item.titleKey)}
                  </button>
                ))}
              </div>
            </div>
          </nav>

          <div className="p-4 border-t border-sidebar-border">
            <button
              onClick={() => handleFeatureClick("settings")}
              className="w-full flex items-center gap-3 rounded-lg border border-sidebar-accent-border bg-sidebar-accent px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:border-accent-border hover:bg-accent hover:text-accent-foreground"
              data-testid="link-settings"
            >
              <Settings className="w-4 h-4" />
              {t("nav.settings")}
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="sticky top-0 z-10 h-16 border-b border-border bg-background/90 px-6 backdrop-blur-md">
          <div className="flex h-full items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                data-testid="button-toggle-menu"
              >
                <Menu className="w-5 h-5" />
              </Button>
              <h1 className="text-lg font-semibold text-foreground">{t("app.dashboard")}</h1>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="hidden sm:flex">
                <Search className="w-4 h-4 text-muted-foreground" />
              </Button>
              <Button className="h-9 rounded-md px-5 text-xs font-bold uppercase tracking-wide">
                <Sparkles className="w-3.5 h-3.5 mr-2" />
                {t("app.upgrade_pro")}
              </Button>
            </div>
          </div>
        </header>

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6 md:p-10 scroll-smooth">
          <div className="mx-auto max-w-7xl space-y-16 pb-14">
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
                {features.workflow.map((feature) => (
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

            <section className="pb-12">
              <div className="mb-8">
                <h2 className="mb-2 text-3xl font-black tracking-tight text-foreground">{t("home.section.tools")}</h2>
                <p className="text-muted-foreground">{t("home.section.tools_desc")}</p>
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {features.tool.map((tool) => (
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
          </div>
        </div>
      </main>

      {sidebarOpen && isMobile && (
        <div
          className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
