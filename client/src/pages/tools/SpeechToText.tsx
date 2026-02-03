import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Languages, Loader2, Download, Upload, FileText } from "lucide-react";

const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "vi", name: "Vietnamese" },
  { code: "zh", name: "Chinese" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
];

export default function SpeechToText() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("en");
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);

  const handleTranscribe = async () => {
    if (!audioFile) return;
    
    setIsProcessing(true);
    setTimeout(() => {
      setTranscript("This is a sample transcription of your audio file. The actual transcription will appear here after processing.");
      setIsProcessing(false);
    }, 3000);
  };

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-white dark:bg-zinc-900">
      <CardContent className="p-8 space-y-6">
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase">Upload Audio File</label>
          <div className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl p-8 text-center hover:border-blue-500 transition-colors cursor-pointer">
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
              className="hidden"
              id="audio-upload"
            />
            <label htmlFor="audio-upload" className="cursor-pointer">
              <Upload className="w-10 h-10 text-zinc-400 mx-auto mb-3" />
              <p className="text-sm font-bold text-zinc-600 dark:text-zinc-400">
                {audioFile ? audioFile.name : "Click to upload audio file"}
              </p>
              <p className="text-xs text-zinc-400 mt-1">Supports WAV, MP3, M4A, FLAC</p>
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase">Language</label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          className="w-full h-12 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold"
          onClick={handleTranscribe}
          disabled={isProcessing || !audioFile}
        >
          {isProcessing ? (
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
          ) : (
            <Languages className="w-5 h-5 mr-2" />
          )}
          Transcribe Audio
        </Button>

        {transcript && (
          <div className="space-y-3">
            <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-zinc-500 uppercase">Transcription</span>
                <Button size="sm" variant="download">
                  <Download className="w-4 h-4 mr-2" />
                  Download TXT
                </Button>
              </div>
              <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                {transcript}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
