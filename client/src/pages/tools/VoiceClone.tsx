import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mic, Loader2, Download, Upload, Volume2 } from "lucide-react";

const PRESET_VOICES = [
  { id: "tran-ha-linh", name: "Trần Hà Linh" },
  { id: "kha-banh", name: "Khá Bảnh" },
  { id: "huan-hoa-hong", name: "Huấn Hoa Hồng" },
  { id: "elon-musk", name: "Elon Musk" },
  { id: "warren-buffet", name: "Warren Buffet" },
];

export default function VoiceClone() {
  const [text, setText] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("");
  const [customVoice, setCustomVoice] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!text.trim() || (!selectedVoice && !customVoice)) return;
    
    setIsProcessing(true);
    setTimeout(() => {
      setAudioUrl("https://example.com/cloned-audio.mp3");
      setIsProcessing(false);
    }, 3000);
  };

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-white dark:bg-zinc-900">
      <CardContent className="p-8 space-y-6">
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase">Select Voice</label>
          <Select value={selectedVoice} onValueChange={setSelectedVoice}>
            <SelectTrigger className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
              <SelectValue placeholder="Choose a preset voice..." />
            </SelectTrigger>
            <SelectContent>
              {PRESET_VOICES.map((voice) => (
                <SelectItem key={voice.id} value={voice.id}>
                  {voice.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-zinc-200 dark:border-zinc-800" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white dark:bg-zinc-900 px-2 text-zinc-400 font-bold">Or</span>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase">Upload Custom Voice</label>
          <div className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl p-6 text-center hover:border-blue-500 transition-colors cursor-pointer">
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setCustomVoice(e.target.files?.[0] || null)}
              className="hidden"
              id="voice-upload"
            />
            <label htmlFor="voice-upload" className="cursor-pointer">
              <Upload className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
              <p className="text-sm font-bold text-zinc-600 dark:text-zinc-400">
                {customVoice ? customVoice.name : "Click to upload voice sample"}
              </p>
              <p className="text-xs text-zinc-400 mt-1">WAV or MP3 (min 30 seconds)</p>
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase">Text to Speak</label>
          <Textarea
            placeholder="Enter text to clone with selected voice..."
            value={text}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
            className="min-h-[100px] bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 resize-none"
          />
        </div>

        <Button
          className="w-full h-12 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold"
          onClick={handleGenerate}
          disabled={isProcessing || !text.trim() || (!selectedVoice && !customVoice)}
        >
          {isProcessing ? (
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
          ) : (
            <Mic className="w-5 h-5 mr-2" />
          )}
          Clone Voice
        </Button>

        {audioUrl && (
          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-green-700 dark:text-green-400">Cloned Audio Ready</span>
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
