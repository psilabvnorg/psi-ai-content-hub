import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { 
  ChevronLeft, Wand2, 
  Scissors, Gauge, Loader2, CheckCircle2
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
import BrandLogo from "@/components/BrandLogo";

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
              className="h-12 rounded-xl pr-32"
            />
            <Button 
              className="absolute right-1 top-1 bottom-1 rounded-lg text-xs"
              onClick={handleAction}
              disabled={isLoading || !url}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("home.process")}
            </Button>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-center text-muted-foreground">
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
              <label className="text-xs font-bold uppercase text-muted-foreground">{t("tool.video_trimmer.start_time")}</label>
              <Input placeholder="00:00:00" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-muted-foreground">{t("tool.video_trimmer.end_time")}</label>
              <Input placeholder="00:02:15" />
            </div>
          </div>
          <Button 
            className="w-full h-12 rounded-xl font-bold"
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
          <div className="space-y-4 rounded-2xl border border-border bg-muted/40 p-4">
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-foreground">{t("home.speed_multiplier")}</span>
              <span className="text-lg font-black text-accent">{speed}x</span>
            </div>
            <input 
              type="range" 
              min="0.5" 
              max="2.0" 
              step="0.1" 
              value={speed}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSpeed(e.target.value)}
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-border accent-accent"
            />
            <div className="flex justify-between text-[10px] font-bold uppercase text-muted-foreground">
              <span>{t("home.slower")}</span>
              <span>{t("home.normal")}</span>
              <span>{t("home.faster")}</span>
            </div>
          </div>
          <Button 
            className="w-full h-12 rounded-xl font-bold"
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
        className="w-full h-12 rounded-xl font-bold"
        onClick={handleAction}
        disabled={isLoading}
      >
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Wand2 className="w-5 h-5 mr-2" />}
        {t("home.process_file")}
      </Button>
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-background p-6 text-foreground">
      <header className="mx-auto mb-12 flex w-full max-w-5xl items-center justify-between gap-4 border-b border-border pb-6">
        <Button 
          variant="ghost" 
          onClick={onBack}
          className="group font-bold"
          data-testid="button-back"
        >
          <ChevronLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
          {t("home.back_dashboard")}
        </Button>
        <BrandLogo label={t("app.name")} imageClassName="h-10 border-white/15 bg-black" />
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center pt-4 text-center">
        {isSuccess ? (
          <div className="animate-in zoom-in duration-300 flex flex-col items-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-accent-border bg-accent/20">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="mb-2 text-2xl font-black text-foreground">{t("home.success_title")}</h2>
            <p className="mb-8 text-muted-foreground">{t("home.success_desc")}</p>
            <Button variant="outline" className="rounded-full px-8" onClick={() => setIsSuccess(false)}>
              {t("home.process_another")}
            </Button>
          </div>
        ) : (
          <>

            <h1 className="mb-4 text-3xl font-black tracking-tight text-foreground">
              {title}
            </h1>

            
            {actualTool ? (
              <div className="mb-12 w-full">
                {actualTool}
              </div>
            ) : (
              <Card className="mb-12 w-full overflow-hidden border-card-border bg-card">
                <CardContent className="p-8">
                  {renderToolUI()}
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-3 gap-8 w-full">
              <div className="flex flex-col items-center gap-2">
                <div className="text-xl font-black text-foreground">4K</div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{t("home.quality")}</div>
              </div>
              <div className="flex flex-col items-center gap-2 border-x border-border">
                <div className="text-xl font-black text-foreground">10s</div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{t("home.avg_speed")}</div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="text-xl font-black text-accent">PRO</div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{t("home.engine")}</div>
              </div>
            </div>
          </>
        )}
      </main>

      <footer className="mx-auto mt-auto w-full max-w-5xl py-8 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{t("app.powered_by")}</p>
      </footer>
    </div>
  );
}
