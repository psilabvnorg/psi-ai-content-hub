import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ImageIcon, Loader2, Download, Wand2, Upload } from "lucide-react";
import { useI18n } from "@/i18n/i18n";

export default function ThumbnailCreator() {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!title.trim()) return;
    
    setIsProcessing(true);
    setTimeout(() => {
      setThumbnailUrl("https://via.placeholder.com/1280x720/3b82f6/ffffff?text=AI+Generated+Thumbnail");
      setIsProcessing(false);
    }, 3000);
  };

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-white dark:bg-zinc-900">
      <CardContent className="p-8 space-y-6">
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase">{t("tool.thumbnail.video_title")}</label>
          <Input
            placeholder={t("tool.thumbnail.video_title_ph")}
            value={title}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
            className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase">{t("tool.thumbnail.desc")}</label>
          <Textarea
            placeholder={t("tool.thumbnail.desc_ph")}
            value={description}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
            className="min-h-[80px] bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 resize-none"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase">{t("tool.thumbnail.upload_video")}</label>
          <div className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl p-6 text-center hover:border-blue-500 transition-colors cursor-pointer">
            <input
              type="file"
              accept="video/*"
              onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
              className="hidden"
              id="video-upload"
            />
            <label htmlFor="video-upload" className="cursor-pointer">
              <Upload className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
              <p className="text-sm font-bold text-zinc-600 dark:text-zinc-400">
                {videoFile ? videoFile.name : t("tool.thumbnail.upload_hint")}
              </p>
              <p className="text-xs text-zinc-400 mt-1">{t("tool.thumbnail.ai_hint")}</p>
            </label>
          </div>
        </div>

        <Button
          className="w-full h-12 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold"
          onClick={handleGenerate}
          disabled={isProcessing || !title.trim()}
        >
          {isProcessing ? (
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
          ) : (
            <Wand2 className="w-5 h-5 mr-2" />
          )}
          {t("tool.thumbnail.generate")}
        </Button>

        {thumbnailUrl && (
          <div className="space-y-3">
            <div className="relative rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
              <img src={thumbnailUrl} alt={t("tool.thumbnail.alt")} className="w-full" />
              <div className="absolute top-3 right-3">
                <Button size="sm" variant="download">
                  <Download className="w-4 h-4 mr-2" />
                  {t("tool.thumbnail.download")}
                </Button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl">
                {t("tool.thumbnail.regenerate")}
              </Button>
              <Button variant="outline" className="flex-1 rounded-xl">
                {t("tool.thumbnail.edit_style")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
