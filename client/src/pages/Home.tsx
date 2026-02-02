import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Video, FileText, Book, Film, Youtube, 
  Music, FileAudio, 
  Mic, Languages, Search, Settings, 
  Menu, Sparkles, Wand2,
  Instagram, Facebook, Play,
  Image as ImageIcon, Scissors, Gauge
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const features = {
  workflow: [
    { 
      id: "text-to-video", 
      title: "Topic/Text to Video", 
      icon: Video, 
      description: "Transform any topic or text into engaging vertical (TikTok, YouTube Shorts, FB Reels) or horizontal videos (YouTube). Perfect for news, education, reviews, tourism, sports, investment, self-help, philosophy, and psychology content."
    },
    { 
      id: "news-to-video", 
      title: "News Link to Video", 
      icon: FileText, 
      description: "Paste a news article URL (VnExpress, etc.) and instantly generate short or long-form videos. Ideal for news channels, educational content, and knowledge sharing across all major platforms."
    },
    { 
      id: "book-to-video", 
      title: "Book to Video", 
      icon: Book, 
      description: "Upload PDF or EPUB files to create video summaries. Generate chapter-by-chapter breakdowns or full book explanations for educational and review content."
    },
    { 
      id: "movie-to-video", 
      title: "Movie to Video", 
      icon: Film, 
      description: "Upload MP4 movie files to automatically generate engaging summaries and explanations. Perfect for film review channels and entertainment content creators."
    },
    { 
      id: "clone-channel", 
      title: "Clone YT Channel", 
      icon: Youtube, 
      description: "Paste any YouTube video URL to recreate it with a new voice, fresh images, and translated content. Convert English to Vietnamese or any language while maintaining the original message."
    },
  ],
  tool: [
    { 
      id: "dl-tiktok", 
      title: "Download TikTok Video", 
      icon: Video, 
      description: "Download any TikTok video in high quality MP4 format without watermarks"
    },
    { 
      id: "dl-youtube", 
      title: "Download YouTube Video", 
      icon: Youtube, 
      description: "Download YouTube videos in multiple resolutions up to 4K quality"
    },
    { 
      id: "dl-facebook", 
      title: "Download Facebook Video", 
      icon: Facebook, 
      description: "Extract and download Facebook videos and reels in original quality"
    },
    { 
      id: "dl-instagram", 
      title: "Download Instagram Video", 
      icon: Instagram, 
      description: "Download Instagram videos, reels, and IGTV content instantly"
    },
    { 
      id: "dl-music", 
      title: "Extract Music from Video", 
      icon: Music, 
      description: "Extract audio from any video file and save as high-quality MP3"
    },
    { 
      id: "mp3-to-wav", 
      title: "Audio Converter", 
      icon: FileAudio, 
      description: "Convert MP3 files to uncompressed WAV format for professional audio editing"
    },
    { 
      id: "trim-video", 
      title: "Trim Video", 
      icon: Scissors, 
      description: "Precisely cut and trim video segments with frame-accurate control"
    },
    { 
      id: "adjust-speed", 
      title: "Adjust Speed", 
      icon: Gauge, 
      description: "Change video playback speed from 0.5x to 2x for slow-motion or time-lapse effects"
    },
    { 
      id: "thumbnail", 
      title: "Thumbnail Creator", 
      icon: ImageIcon, 
      description: "AI-powered thumbnail generation from video frames or custom text prompts"
    },
    { 
      id: "tts-fast", 
      title: "Super Fast TTS", 
      icon: Play, 
      description: "Lightning-fast text-to-speech conversion with natural-sounding voices"
    },
    { 
      id: "voice-clone", 
      title: "Voice Clone", 
      icon: Mic, 
      description: "Clone celebrity voices (Trần Hà Linh, Khá Bảnh, Huấn Hoa Hồng, Elon Musk, Warren Buffet) or create your own custom voice model"
    },
    { 
      id: "stt", 
      title: "Speech to Text", 
      icon: Languages, 
      description: "Transcribe audio to text with multi-language support. Accepts WAV and MP3 files"
    },
  ]
};

export default function Home({ onSelectFeature }: { onSelectFeature: (id: string) => void }) {
  const isMobile = useIsMobile();
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
            <span className="font-bold text-xl tracking-tight text-zinc-900 dark:text-white">AI Studio</span>
          </div>

          <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
            <div className="py-4">
              <p className="px-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Workflows</p>
              {features.workflow.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleFeatureClick(item.id)}
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
                    onClick={() => handleFeatureClick(item.id)}
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
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6 md:p-10 scroll-smooth">
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
                    onClick={() => handleFeatureClick(feature.id)}
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
                          <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-1.5 group-hover:text-blue-600 transition-colors">{tool.title}</h3>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed line-clamp-2">{tool.description}</p>
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
