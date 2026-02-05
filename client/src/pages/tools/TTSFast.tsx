import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Download, Volume2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isElectron, ipcApi } from "@/lib/ipc-client";
import { API_URL } from "@/lib/api";

export default function TTSFast() {
  const [text, setText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ duration?: number; processTime?: number } | null>(null);
  const [ttsReady, setTtsReady] = useState(!isElectron()); // Default false for Electron, true for web
  const [ttsStatus, setTtsStatus] = useState<any>(null);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const { toast } = useToast();

  // Check TTS status on mount (Electron only)
  useEffect(() => {
    if (isElectron()) {
      checkTtsStatus();
    } else {
      checkWebTtsStatus();
    }
  }, []);

  const checkWebTtsStatus = async () => {
    try {
      setStatusError(null);
      const response = await fetch(`${API_URL}/api/tts/status`);
      if (!response.ok) throw new Error("Failed to check TTS status");
      const status = await response.json();
      setTtsStatus(status);
      setTtsReady(status.ready);
    } catch (error: any) {
      console.error('Failed to check TTS status:', error);
      setStatusError(error.message || 'Failed to check TTS status');
      setTtsStatus({ runnerExists: true, ready: false, ttsInstalled: false });
      setTtsReady(false);
    }
  };

  const checkTtsStatus = async () => {
    try {
      setStatusError(null);
      const status = await ipcApi.ttsStatus();
      setTtsStatus(status);
      setTtsReady(status.ready);
    } catch (error: any) {
      console.error('Failed to check TTS status:', error);
      setStatusError(error.message || 'Failed to check TTS status');
      setTtsStatus({ runnerExists: false, ready: false });
      setTtsReady(false);
    }
  };

  const handleSetupTts = async () => {
    setIsSettingUp(true);
    try {
      toast({ title: "Setting up TTS", description: "Downloading the TTS model... This may take a few minutes." });
      
      if (isElectron()) {
        await ipcApi.ttsSetup();
      } else {
        const response = await fetch(`${API_URL}/api/tts/setup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ forceReinstall: false }),
        });
        if (!response.ok) {
          const error = await response.json().catch(() => ({ detail: "Setup failed" }));
          throw new Error(error.detail || "Setup failed");
        }
      }
      
      toast({ title: "Success", description: "TTS setup completed!" });
      // Wait a moment for files to be written, then check status
      setTimeout(() => {
        if (isElectron()) {
          checkTtsStatus();
        } else {
          checkWebTtsStatus();
        }
      }, 1000);
    } catch (error: any) {
      toast({ 
        title: "Setup Failed", 
        description: error.message,
        variant: "destructive" 
      });
    } finally {
      setIsSettingUp(false);
    }
  };

  const handleGenerate = async () => {
    if (!text.trim()) return;
    
    setIsProcessing(true);
    if (audioUrl && audioUrl.startsWith("blob:")) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl(null);
    setDownloadName(null);
    setMeta(null);

    try {
      if (isElectron()) {
        const result = await ipcApi.ttsFast(text);
        const fileData = await ipcApi.readFileBase64(result.filePath);
        const byteCharacters = atob(fileData.data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const blob = new Blob([new Uint8Array(byteNumbers)], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setDownloadName(fileData.filename);
        setMeta({ duration: result.duration, processTime: result.processTime });
      } else {
        const response = await fetch(`${API_URL}/api/tts/fast`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ detail: "TTS failed" }));
          throw new Error(error.detail || "TTS failed");
        }

        const data = await response.json();
        const audioResponse = await fetch(`${API_URL}${data.download_url}`);
        if (!audioResponse.ok) {
          throw new Error("Failed to fetch generated audio");
        }
        const blob = await audioResponse.blob();
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setDownloadName(data.filename);
        setMeta({ duration: data.duration, processTime: data.process_time });
      }

      toast({ title: "Success", description: "Audio generated successfully!" });
    } catch (error: any) {
      // Handle TTS not installed error
      if (error.message === 'TTS_NOT_INSTALLED') {
        toast({ 
          title: "TTS Not Installed", 
          description: "Please set up TTS first by clicking the setup button below.",
          variant: "destructive" 
        });
        if (isElectron()) {
          await checkTtsStatus();
        }
        return;
      }
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = downloadName || "tts.wav";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-white dark:bg-zinc-900">
      <CardContent className="p-8 space-y-6">
        {/* TTS Setup Warning */}
        {!ttsReady && (
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  TTS Not Ready
                </p>
                {statusError ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Error checking TTS status: {statusError}
                  </p>
                ) : (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    {!ttsStatus?.runnerExists
                      ? "TTS engine is missing. Please reinstall the app."
                      : ttsStatus?.ttsInstalled === false
                      ? "TTS models need to be downloaded. This is a one-time setup (5-10 minutes)."
                      : "TTS setup is incomplete. Click the button below to complete setup."}
                  </p>
                )}
                {(ttsStatus?.runnerExists !== false) && (
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700"
                    onClick={handleSetupTts}
                    disabled={isSettingUp}
                  >
                    {isSettingUp ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Setting up...
                      </>
                    ) : (
                      "Download TTS Models"
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

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
          disabled={isProcessing || !text.trim() || (isElectron() && !ttsReady)}
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
              <Button size="sm" variant="download" onClick={handleDownload}>
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            </div>
            {meta && (
              <div className="text-xs text-green-700 dark:text-green-400">
                {meta.duration !== undefined && <span>Duration: {meta.duration}s</span>}
                {meta.processTime !== undefined && (
                  <span className="ml-3">Processed in {meta.processTime}s</span>
                )}
              </div>
            )}
            <audio controls className="w-full h-10">
              <source src={audioUrl} type="audio/wav" />
            </audio>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
