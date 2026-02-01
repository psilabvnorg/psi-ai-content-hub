import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Video, FileText, Book, Film, Youtube, 
  Download, Music, FileAudio, Layout, 
  Mic, Languages, Search, Settings, 
  ChevronLeft, Menu, Sparkles, Wand2,
  FileVideo, Instagram, Facebook, Play,
  Image as ImageIcon
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const features = {
  workflow: [
    { id: "text-to-video", title: "Topic/Text to Video", icon: Video, description: "Generate short or long videos from text prompts" },
    { id: "news-to-video", title: "News Link to Video", icon: FileText, description: "Convert news articles into engaging video content" },
    { id: "book-to-video", title: "Book to Video", icon: Book, description: "Summarize chapters or full books into videos" },
    { id: "movie-to-video", title: "Movie to Video", icon: Film, description: "Explain or summarize movies from MP4 files" },
    { id: "clone-channel", title: "Clone YT Channel", icon: Youtube, description: "New voice, new images, same great content" },
  ],
  tool: [
    { id: "dl-tiktok", title: "TikTok Downloader", icon: Video, description: "Download TikTok videos as MP4" },
    { id: "dl-youtube", title: "YouTube Downloader", icon: Youtube, description: "Download YouTube videos as MP4" },
    { id: "dl-facebook", title: "FB Video Downloader", icon: Facebook, description: "Download Facebook videos as MP4" },
    { id: "dl-instagram", title: "IG Video Downloader", icon: Instagram, description: "Download Instagram videos as MP4" },
    { id: "dl-music", title: "Music Extractor", icon: Music, description: "Extract MP3 from any video file" },
    { id: "mp3-to-wav", title: "Audio Converter", icon: FileAudio, description: "Convert MP3 files to high-quality WAV" },
    { id: "thumbnail", title: "Thumbnail Creator", icon: ImageIcon, description: "AI-powered video thumbnail generation" },
    { id: "tts-fast", title: "Super Fast TTS", icon: Play, description: "Instant text-to-speech generation" },
    { id: "voice-clone", title: "Voice Clone", icon: Mic, description: "Clone KOL voices or create your own" },
    { id: "stt", title: "Speech to Text", icon: Languages, description: "Convert audio to text in multiple languages" },
  ]
};

export default function Home({ onSelectFeature }: { onSelectFeature: (id: string) => void }) {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);

  useEffect(() => {
    setSidebarOpen(!isMobile);
  }, [isMobile]);

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
            <span className="font-bold text-xl tracking-tight text-zinc-900 dark:text-white">AI Studio</span>
          </div>

          <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
            <div className="py-4">
              <p className="px-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Workflows</p>
              {features.workflow.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onSelectFeature(item.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all"
                  data-testid={`link-${item.id}`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.title}
                </button>
              ))}
            </div>

            <div className="py-4 border-t border-zinc-100 dark:border-zinc-800 mt-2">
              <p className="px-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Tools</p>
              <div className="grid grid-cols-1 gap-1">
                {features.tool.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onSelectFeature(item.id)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all"
                    data-testid={`link-${item.id}`}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.title}
                  </button>
                ))}
              </div>
            </div>
          </nav>

          <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
            <button className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">
              <Settings className="w-4 h-4" />
              Settings
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
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">Dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="hidden sm:flex">
              <Search className="w-4 h-4 text-zinc-500" />
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-5 h-9 text-xs font-bold shadow-lg shadow-blue-500/20">
              <Sparkles className="w-3.5 h-3.5 mr-2" />
              Upgrade Pro
            </Button>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-10 scroll-smooth">
          <div className="max-w-7xl mx-auto space-y-16">
            
            {/* Workflows Section */}
            <section>
              <div className="flex items-end justify-between mb-8">
                <div>
                  <h2 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tight mb-2">AI Workflows</h2>
                  <p className="text-zinc-500 dark:text-zinc-400">Complete end-to-end video generation pipelines.</p>
                </div>
                <Button variant="link" className="text-blue-600 font-bold hidden md:flex">View All</Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {features.workflow.map((feature) => (
                  <Card 
                    key={feature.id} 
                    className="group cursor-pointer border-none shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:-translate-y-1.5 transition-all duration-300 bg-white dark:bg-zinc-900 overflow-hidden"
                    onClick={() => onSelectFeature(feature.id)}
                    data-testid={`card-workflow-${feature.id}`}
                  >
                    <CardContent className="p-8">
                      <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-6 group-hover:bg-blue-600 group-hover:text-white transition-all duration-500 ease-out shadow-sm group-hover:shadow-blue-500/40">
                        <feature.icon className="w-7 h-7 text-blue-600 dark:text-blue-400 group-hover:text-white" />
                      </div>
                      <h3 className="text-xl font-black mb-3 text-zinc-900 dark:text-white tracking-tight group-hover:text-blue-600 transition-colors">{feature.title}</h3>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed font-medium">{feature.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            {/* Tools Section */}
            <section className="pb-12">
              <div className="mb-8">
                <h2 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tight mb-2">Creative Tools</h2>
                <p className="text-zinc-500 dark:text-zinc-400">Essential utilities for high-performance creators.</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {features.tool.map((tool) => (
                  <Card 
                    key={tool.id} 
                    className="group cursor-pointer border border-zinc-100 dark:border-zinc-800/50 hover:border-blue-500 hover:ring-1 hover:ring-blue-500 transition-all bg-white dark:bg-zinc-900 shadow-none rounded-xl overflow-hidden"
                    onClick={() => onSelectFeature(tool.id)}
                    data-testid={`card-tool-${tool.id}`}
                  >
                    <CardContent className="p-5 flex flex-col items-center text-center">
                      <div className="w-12 h-12 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 flex items-center justify-center mb-4 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 group-hover:text-blue-600 transition-all duration-300">
                        <tool.icon className="w-6 h-6 text-zinc-500 dark:text-zinc-400 group-hover:text-blue-600" />
                      </div>
                      <h3 className="text-xs font-bold text-zinc-900 dark:text-white tracking-wide uppercase group-hover:text-blue-600 transition-colors">{tool.title}</h3>
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
