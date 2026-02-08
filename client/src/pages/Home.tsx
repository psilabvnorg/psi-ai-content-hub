import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Video, FileText, Book, Film, Youtube, 
  Music, FileAudio, 
  Mic, Languages, Search, Settings, 
  Menu, Sparkles, Wand2,
  Instagram, Facebook, Play,
  Image as ImageIcon, Scissors, Gauge, Terminal
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n";
import type { I18nKey } from "@/i18n/translations";

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
    <div className="flex h-screen bg-[#fafafa] dark:bg-[#0a0a0a] overflow-hidden font-sans">
      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 transition-transform duration-300 ease-in-out transform shadow-xl lg:shadow-none",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          "lg:relative lg:translate-x-0"
        )}
      >
        <div className="flex flex-col h-full">
          <div className="p-6 flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Wand2 className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight text-zinc-900 dark:text-white">{t("app.name")}</span>
          </div>

          <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
            <div className="py-4">
              <p className="px-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">{t("nav.workflows")}</p>
              {features.workflow.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleFeatureClick(item.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all"
                  data-testid={`link-${item.id}`}
                >
                  <item.icon className="w-4 h-4" />
                  {t(item.titleKey)}
                </button>
              ))}
            </div>

            <div className="py-4 border-t border-zinc-100 dark:border-zinc-800 mt-2">
              <p className="px-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">{t("nav.tools")}</p>
              <div className="grid grid-cols-1 gap-1">
                {features.tool.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleFeatureClick(item.id)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all"
                    data-testid={`link-${item.id}`}
                  >
                    <item.icon className="w-4 h-4" />
                    {t(item.titleKey)}
                  </button>
                ))}
              </div>
            </div>
          </nav>

          <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
            <button 
              onClick={() => handleFeatureClick("settings")}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              data-testid="link-settings"
            >
              <Settings className="w-4 h-4" />
              {t("nav.settings")}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-6 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10">
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
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">{t("app.dashboard")}</h1>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="hidden sm:flex">
              <Search className="w-4 h-4 text-zinc-500" />
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-5 h-9 text-xs font-bold shadow-lg shadow-blue-500/20">
              <Sparkles className="w-3.5 h-3.5 mr-2" />
              {t("app.upgrade_pro")}
            </Button>
          </div>
        </header>

        {/* Scrollable Content */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6 md:p-10 scroll-smooth">
          <div className="max-w-7xl mx-auto space-y-16">
            
            {/* Workflows Section */}
            <section>
              <div className="flex items-end justify-between mb-8">
                <div>
                  <h2 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tight mb-2">{t("home.section.workflows")}</h2>
                  <p className="text-zinc-500 dark:text-zinc-400">{t("home.section.workflows_desc")}</p>
                </div>
                <Button variant="link" className="text-blue-600 font-bold hidden md:flex">{t("app.view_all")}</Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {features.workflow.map((feature) => (
                  <Card 
                    key={feature.id} 
                    className="group cursor-pointer border-none shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:-translate-y-1.5 transition-all duration-300 bg-white dark:bg-zinc-900 overflow-hidden"
                    onClick={() => handleFeatureClick(feature.id)}
                    data-testid={`card-workflow-${feature.id}`}
                  >
                    <CardContent className="p-8">
                      <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-6 group-hover:bg-blue-600 group-hover:text-white transition-all duration-500 ease-out shadow-sm group-hover:shadow-blue-500/40">
                        <feature.icon className="w-7 h-7 text-blue-600 dark:text-blue-400 group-hover:text-white" />
                      </div>
                      <h3 className="text-xl font-black mb-3 text-zinc-900 dark:text-white tracking-tight group-hover:text-blue-600 transition-colors">{t(feature.titleKey)}</h3>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed font-medium">{t(feature.descriptionKey)}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            {/* Tools Section */}
            <section className="pb-12">
              <div className="mb-8">
                <h2 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tight mb-2">{t("home.section.tools")}</h2>
                <p className="text-zinc-500 dark:text-zinc-400">{t("home.section.tools_desc")}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {features.tool.map((tool) => (
                  <Card 
                    key={tool.id} 
                    className="group cursor-pointer border border-zinc-100 dark:border-zinc-800/50 hover:border-blue-500 hover:ring-1 hover:ring-blue-500 transition-all bg-white dark:bg-zinc-900 shadow-sm hover:shadow-md rounded-xl overflow-hidden"
                    onClick={() => handleFeatureClick(tool.id)}
                    data-testid={`card-tool-${tool.id}`}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-all duration-300">
                          <tool.icon className="w-6 h-6 text-zinc-500 dark:text-zinc-400 group-hover:text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-1.5 group-hover:text-blue-600 transition-colors">{t(tool.titleKey)}</h3>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed line-clamp-2">{t(tool.descriptionKey)}</p>
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

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && isMobile && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-opacity" 
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
