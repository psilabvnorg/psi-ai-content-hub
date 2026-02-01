import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { 
  ChevronLeft, Wand2, Download, 
  Scissors, Gauge, Loader2, CheckCircle2,
  Video, Music, Youtube, Facebook, Instagram
} from "lucide-react";

export default function FeaturePlaceholder({ 
  id, 
  onBack 
}: { 
  id: string, 
  onBack: () => void 
}) {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [speed, setSpeed] = useState("1.0");

  const title = id.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  
  const handleAction = () => {
    setIsLoading(true);
    // Mocking the backend process
    setTimeout(() => {
      setIsLoading(false);
      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 3000);
    }, 2000);
  };

  const renderToolUI = () => {
    if (id.startsWith("dl-") || id.includes("to-video")) {
      return (
        <div className="w-full space-y-4">
          <div className="relative">
            <Input 
              placeholder="Paste URL here..." 
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="h-12 pr-32 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 rounded-xl"
            />
            <Button 
              className="absolute right-1 top-1 bottom-1 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs"
              onClick={handleAction}
              disabled={isLoading || !url}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Process"}
            </Button>
          </div>
          <p className="text-[10px] text-zinc-400 text-center uppercase tracking-widest font-bold">
            Supports: TikTok, YouTube, Facebook, Instagram
          </p>
        </div>
      );
    }

    if (id === "trim-video") {
      return (
        <div className="w-full space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase">Start Time</label>
              <Input placeholder="00:00:00" className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase">End Time</label>
              <Input placeholder="00:02:15" className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800" />
            </div>
          </div>
          <Button 
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold"
            onClick={handleAction}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Scissors className="w-5 h-5 mr-2" />}
            Trim Video
          </Button>
        </div>
      );
    }

    if (id === "adjust-speed") {
      return (
        <div className="w-full space-y-6 text-left">
          <div className="space-y-4 p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Speed Multiplier</span>
              <span className="text-lg font-black text-blue-600">{speed}x</span>
            </div>
            <input 
              type="range" 
              min="0.5" 
              max="2.0" 
              step="0.1" 
              value={speed}
              onChange={(e) => setSpeed(e.target.value)}
              className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-[10px] font-bold text-zinc-400 uppercase">
              <span>Slower</span>
              <span>Normal</span>
              <span>Faster</span>
            </div>
          </div>
          <Button 
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold"
            onClick={handleAction}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Gauge className="w-5 h-5 mr-2" />}
            Apply Speed
          </Button>
        </div>
      );
    }

    return (
      <Button 
        className="w-full h-12 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold"
        onClick={handleAction}
        disabled={isLoading}
      >
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Wand2 className="w-5 h-5 mr-2" />}
        Process File
      </Button>
    );
  };

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#0a0a0a] p-6 flex flex-col font-sans">
      <header className="max-w-4xl mx-auto w-full flex items-center justify-between mb-12">
        <Button 
          variant="ghost" 
          onClick={onBack}
          className="group hover:bg-zinc-100 dark:hover:bg-zinc-800 font-bold"
          data-testid="button-back"
        >
          <ChevronLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
          Dashboard
        </Button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
            <Wand2 className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg dark:text-white">AI Studio</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center text-center max-w-xl mx-auto w-full">
        {isSuccess ? (
          <div className="animate-in zoom-in duration-300 flex flex-col items-center">
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-black text-zinc-900 dark:text-white mb-2">Success!</h2>
            <p className="text-zinc-500 mb-8">Your file is ready for download.</p>
            <Button variant="outline" className="rounded-full px-8 border-zinc-200 dark:border-zinc-800" onClick={() => setIsSuccess(false)}>
              Process Another
            </Button>
          </div>
        ) : (
          <>
            <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center mb-8">
               <Wand2 className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-3xl font-black text-zinc-900 dark:text-white mb-4 tracking-tight">
              {title}
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-10 leading-relaxed font-medium">
              Professional-grade tools powered by AI and robust scripts. 
              Enter your parameters below to begin processing.
            </p>
            
            <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-white dark:bg-zinc-900 overflow-hidden mb-12">
              <CardContent className="p-8">
                {renderToolUI()}
              </CardContent>
            </Card>

            <div className="grid grid-cols-3 gap-8 w-full">
              <div className="flex flex-col items-center gap-2">
                <div className="text-zinc-900 dark:text-white font-black text-xl">4K</div>
                <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Quality</div>
              </div>
              <div className="flex flex-col items-center gap-2 border-x border-zinc-100 dark:border-zinc-800">
                <div className="text-zinc-900 dark:text-white font-black text-xl">10s</div>
                <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Avg Speed</div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="text-zinc-900 dark:text-white font-black text-xl">PRO</div>
                <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Engine</div>
              </div>
            </div>
          </>
        )}
      </main>

      <footer className="max-w-4xl mx-auto w-full py-8 text-center mt-auto">
        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Powered by yt-dlp & FFmpeg</p>
      </footer>
    </div>
  );
}
