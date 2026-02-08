import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { 
  ChevronLeft, Wand2, Download, 
  Scissors, Gauge, Loader2, CheckCircle2,
  Video, Music, Youtube, Facebook, Instagram
} from "lucide-react";
import VideoDownloader from "./tools/VideoDownloader";
import AudioExtractor from "./tools/AudioExtractor";
import AudioConverter from "./tools/AudioConverter";
import VideoTrimmer from "./tools/VideoTrimmer";
import SpeedAdjuster from "./tools/SpeedAdjuster";
import TTSFast from "./tools/TTSFast";
import VoiceClone from "./tools/VoiceClone";
import SpeechToText from "./tools/SpeechToText";
import ThumbnailCreator from "./tools/ThumbnailCreator";
import ReupYoutube from "./tools/ReupYoutube";
import BackendConsole from "./tools/BackendConsole";
import Settings from "./Settings";
import { useI18n } from "@/i18n/i18n";
import type { I18nKey } from "@/i18n/translations";

export default function FeaturePlaceholder({ 
  id, 
  onBack,
  onSelectFeature,
}: {
  id: string;
  onBack: () => void;
  onSelectFeature: (id: string) => void;
}) {
  const { t } = useI18n();
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [speed, setSpeed] = useState("1.0");

  const getTitleKeyFromId = (targetId: string): I18nKey => {
    const titleMap: Record<string, I18nKey> = {
      "text-to-video": "feature.workflow.text_to_video.title",
      "reup-youtube": "feature.workflow.reup_youtube.title",
      "news-to-video": "feature.workflow.news_to_video.title",
      "book-to-video": "feature.workflow.book_to_video.title",
      "movie-to-video": "feature.workflow.movie_to_video.title",
      "clone-channel": "feature.workflow.clone_channel.title",
      "dl-tiktok": "feature.tool.dl_tiktok.title",
      "dl-youtube": "feature.tool.dl_youtube.title",
      "dl-facebook": "feature.tool.dl_facebook.title",
      "dl-instagram": "feature.tool.dl_instagram.title",
      "dl-music": "feature.tool.dl_music.title",
      "mp3-to-wav": "feature.tool.mp3_to_wav.title",
      "trim-video": "feature.tool.trim_video.title",
      "adjust-speed": "feature.tool.adjust_speed.title",
      "thumbnail": "feature.tool.thumbnail.title",
      "tts-fast": "feature.tool.tts_fast.title",
      "voice-clone": "feature.tool.voice_clone.title",
      "stt": "feature.tool.stt.title",
      "backend-console": "feature.tool.backend_console.title",
      "settings": "settings.title",
    };
    return titleMap[targetId] || "settings.title";
  };

  const title = t(getTitleKeyFromId(id));
  
  const handleAction = () => {
    setIsLoading(true);
    // Mocking the backend process
    setTimeout(() => {
      setIsLoading(false);
      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 3000);
    }, 2000);
  };

  // Render actual tool components
  const renderActualTool = () => {
    switch(id) {
      case "dl-youtube":
      case "dl-tiktok":
      case "dl-facebook":
      case "dl-instagram":
        return <VideoDownloader />;
      case "dl-music":
        return <AudioExtractor />;
      case "mp3-to-wav":
        return <AudioConverter />;
      case "trim-video":
        return <VideoTrimmer />;
      case "adjust-speed":
        return <SpeedAdjuster />;
      case "tts-fast":
        return <TTSFast onOpenSettings={() => onSelectFeature("settings")} />;
      case "voice-clone":
        return <VoiceClone onOpenSettings={() => onSelectFeature("settings")} />;
      case "stt":
        return <SpeechToText onOpenSettings={() => onSelectFeature("settings")} />;
      case "thumbnail":
        return <ThumbnailCreator />;
      case "reup-youtube":
        return <ReupYoutube />;
      case "backend-console":
        return <BackendConsole />;
      case "settings":
        return <Settings />;
      default:
        return null;
    }
  };

  const actualTool = renderActualTool();

  const renderToolUI = () => {
    if (id.startsWith("dl-") || id.includes("to-video")) {
      return (
        <div className="w-full space-y-4">
          <div className="relative">
            <Input 
              placeholder={t("home.paste_url")}
              value={url}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
              className="h-12 pr-32 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 rounded-xl"
            />
            <Button 
              className="absolute right-1 top-1 bottom-1 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs"
              onClick={handleAction}
              disabled={isLoading || !url}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("home.process")}
            </Button>
          </div>
          <p className="text-[10px] text-zinc-400 text-center uppercase tracking-widest font-bold">
            {t("home.supports")}
          </p>
        </div>
      );
    }

    if (id === "trim-video") {
      return (
        <div className="w-full space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase">{t("tool.video_trimmer.start_time")}</label>
              <Input placeholder="00:00:00" className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase">{t("tool.video_trimmer.end_time")}</label>
              <Input placeholder="00:02:15" className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800" />
            </div>
          </div>
          <Button 
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold"
            onClick={handleAction}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Scissors className="w-5 h-5 mr-2" />}
            {t("home.trim_video")}
          </Button>
        </div>
      );
    }

    if (id === "adjust-speed") {
      return (
        <div className="w-full space-y-6 text-left">
          <div className="space-y-4 p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{t("home.speed_multiplier")}</span>
              <span className="text-lg font-black text-blue-600">{speed}x</span>
            </div>
            <input 
              type="range" 
              min="0.5" 
              max="2.0" 
              step="0.1" 
              value={speed}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSpeed(e.target.value)}
              className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-[10px] font-bold text-zinc-400 uppercase">
              <span>{t("home.slower")}</span>
              <span>{t("home.normal")}</span>
              <span>{t("home.faster")}</span>
            </div>
          </div>
          <Button 
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold"
            onClick={handleAction}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Gauge className="w-5 h-5 mr-2" />}
            {t("home.apply_speed")}
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
        {t("home.process_file")}
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
          {t("home.back_dashboard")}
        </Button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
            <Wand2 className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg dark:text-white">{t("app.name")}</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center text-center max-w-xl mx-auto w-full pt-8">
        {isSuccess ? (
          <div className="animate-in zoom-in duration-300 flex flex-col items-center">
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-black text-zinc-900 dark:text-white mb-2">{t("home.success_title")}</h2>
            <p className="text-zinc-500 mb-8">{t("home.success_desc")}</p>
            <Button variant="outline" className="rounded-full px-8 border-zinc-200 dark:border-zinc-800" onClick={() => setIsSuccess(false)}>
              {t("home.process_another")}
            </Button>
          </div>
        ) : (
          <>

            <h1 className="text-3xl font-black text-zinc-900 dark:text-white mb-4 tracking-tight">
              {title}
            </h1>

            
            {actualTool ? (
              <div className="w-full mb-12">
                {actualTool}
              </div>
            ) : (
              <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-white dark:bg-zinc-900 overflow-hidden mb-12">
                <CardContent className="p-8">
                  {renderToolUI()}
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-3 gap-8 w-full">
              <div className="flex flex-col items-center gap-2">
                <div className="text-zinc-900 dark:text-white font-black text-xl">4K</div>
                <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{t("home.quality")}</div>
              </div>
              <div className="flex flex-col items-center gap-2 border-x border-zinc-100 dark:border-zinc-800">
                <div className="text-zinc-900 dark:text-white font-black text-xl">10s</div>
                <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{t("home.avg_speed")}</div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="text-zinc-900 dark:text-white font-black text-xl">PRO</div>
                <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{t("home.engine")}</div>
              </div>
            </div>
          </>
        )}
      </main>

      <footer className="max-w-4xl mx-auto w-full py-8 text-center mt-auto">
        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{t("app.powered_by")}</p>
      </footer>
    </div>
  );
}
