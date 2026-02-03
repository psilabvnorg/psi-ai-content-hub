import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Play, Loader2, Download, Volume2 } from "lucide-react";

export default function TTSFast() {
  const [text, setText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!text.trim()) return;
    
    setIsProcessing(true);
    // Simulate API call
    setTimeout(() => {
      setAudioUrl("https://example.com/audio.mp3");
      setIsProcessing(false);
    }, 2000);
  };

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-white dark:bg-zinc-900">
      <CardContent className="p-8 space-y-6">
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase">Text Input</label>
          <Textarea
            placeholder="Enter text to convert to speech..."
            value={text}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
            className="min-h-[120px] bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 resize-none"
          />
          <p className="text-xs text-zinc-400">{text.length} characters</p>
        </div>

        <Button
          className="w-full h-12 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold"
          onClick={handleGenerate}
          disabled={isProcessing || !text.trim()}
        >
          {isProcessing ? (
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
          ) : (
            <Volume2 className="w-5 h-5 mr-2" />
          )}
          Generate Speech
        </Button>

        {audioUrl && (
          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-green-700 dark:text-green-400">Audio Ready</span>
              <Button size="sm" variant="download">
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            </div>
            <audio controls className="w-full h-10">
              <source src={audioUrl} type="audio/mpeg" />
            </audio>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
