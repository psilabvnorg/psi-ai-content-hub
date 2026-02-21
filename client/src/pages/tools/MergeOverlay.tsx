import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Image as ImageIcon, Video as VideoIcon, Upload, Download, Loader2, Music } from "lucide-react";
import { BGREMOVE_API_URL } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { DropZone, ServiceStatusTable, ProgressDisplay } from "@/components/common/tool-page-ui";
import type { ProgressData, EnvStatus, StatusRowConfig } from "@/components/common/tool-page-ui";
import { useI18n } from "@/i18n/i18n";
import { useManagedServices } from "@/hooks/useManagedServices";

type OverlayResult = {
  status: string;
  filename: string;
  merged_url: string;
  download_url: string;
};

type VideoOverlayResult = {
  status: string;
  filename: string;
  frames_processed: number;
  merged_url: string;
  download_url: string;
};

const iconContainer = (icon: React.ReactNode) => (
  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-accent/10">{icon}</div>
);

export default function MergeOverlay() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<"image" | "video">("image");

  // Image state
  const [fgImageFile, setFgImageFile] = useState<File | null>(null);
  const [bgImageFile, setBgImageFile] = useState<File | null>(null);
  const [imageResult, setImageResult] = useState<OverlayResult | null>(null);

  // Video state
  const [subjectVideoFile, setSubjectVideoFile] = useState<File | null>(null);
  const [maskVideoFile, setMaskVideoFile] = useState<File | null>(null);
  const [bgVideoFile, setBgVideoFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [videoResult, setVideoResult] = useState<VideoOverlayResult | null>(null);

  // Shared processing
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  // Service status
  const [serverUnreachable, setServerUnreachable] = useState(false);
  const [envStatus, setEnvStatus] = useState<EnvStatus | null>(null);
  const [isInstallingEnv, setIsInstallingEnv] = useState(false);

  const { servicesById, start, stop, isBusy } = useManagedServices();
  const serviceStatus = servicesById.app;
  const serviceRunning = serviceStatus?.status === "running";
  const serviceBusy = isBusy("app");
  const envReady = envStatus?.installed === true;
  const statusReady = !serverUnreachable && envReady;

  const fetchStatus = async () => {
    try {
      const envRes = await fetch(`${BGREMOVE_API_URL}/api/v1/env/status`);
      if (!envRes.ok) throw new Error("status");
      const envData = (await envRes.json()) as EnvStatus;
      setEnvStatus(envData);
      setServerUnreachable(false);
    } catch {
      setEnvStatus(null);
      setServerUnreachable(true);
    }
  };

  useEffect(() => { void fetchStatus(); }, []);

  useEffect(() => {
    if (!serviceStatus) return;
    if (serviceStatus.status === "running" || serviceStatus.status === "stopped") {
      void fetchStatus();
    }
  }, [serviceStatus?.status]);

  const handleToggleServer = async () => {
    if (!serviceStatus) return;
    if (serviceRunning) {
      await stop("app");
      setServerUnreachable(true);
      return;
    }
    await start("app");
    await fetchStatus();
  };

  const handleInstallLibs = async () => {
    setIsInstallingEnv(true);
    setLogs([]);
    setProgress({ status: "starting", percent: 0, message: "Starting installation..." });
    try {
      const res = await fetch(`${BGREMOVE_API_URL}/api/v1/env/install`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to start install");
      const { task_id } = (await res.json()) as { task_id: string };
      const source = new EventSource(`${BGREMOVE_API_URL}/api/v1/env/install/stream/${task_id}`);
      source.onmessage = (event) => {
        const data = JSON.parse(event.data as string) as { status: string; percent: number; logs?: string[] };
        setProgress({ status: data.status as ProgressData["status"], percent: data.percent, message: "Installing dependencies..." });
        if (data.logs?.length) setLogs((prev) => [...prev, ...data.logs!].slice(-200));
        if (data.status === "complete") {
          source.close();
          setProgress({ status: "complete", percent: 100, message: "Dependencies installed." });
          setIsInstallingEnv(false);
          void fetchStatus();
        } else if (data.status === "error") {
          source.close();
          setProgress({ status: "error", percent: 0, message: "Failed to install dependencies." });
          setIsInstallingEnv(false);
        }
      };
      source.onerror = () => {
        source.close();
        setProgress({ status: "error", percent: 0, message: "Lost connection during install." });
        setIsInstallingEnv(false);
      };
    } catch {
      setProgress({ status: "error", percent: 0, message: "Failed to start installation." });
      setIsInstallingEnv(false);
    }
  };

  const statusRows: StatusRowConfig[] = useMemo(
    () => [
      {
        id: "server",
        label: t("tool.bg_remove.server_status"),
        isReady: !serverUnreachable,
        path: BGREMOVE_API_URL,
        showActionButton: Boolean(serviceStatus),
        actionButtonLabel: serviceRunning ? t("tool.common.stop_server") : t("tool.common.start_server"),
        actionDisabled: serviceBusy,
        actionLoading: serviceBusy,
        onAction: handleToggleServer,
      },
      {
        id: "env",
        label: t("tool.bg_remove.env_status"),
        isReady: envReady,
        path: envStatus?.missing?.length
          ? envStatus.missing.join(", ")
          : envStatus?.installed_modules?.length
            ? envStatus.installed_modules.join(", ")
            : "--",
        showActionButton: !envReady && !serverUnreachable,
        actionButtonLabel: isInstallingEnv ? t("tool.common.starting") : t("tool.common.install_library"),
        actionDisabled: isInstallingEnv,
        onAction: handleInstallLibs,
      },
    ],
    [t, serverUnreachable, serviceStatus, serviceRunning, serviceBusy, envReady, envStatus, isInstallingEnv],
  );

  const resetProgress = () => {
    setProgress(null);
    setLogs([]);
  };

  const getAbsoluteUrl = (path: string) =>
    path.startsWith("http") ? path : `${BGREMOVE_API_URL}${path}`;

  const handleImageMerge = async () => {
    if (!fgImageFile || !bgImageFile) return;
    setImageResult(null);
    setIsProcessing(true);
    setProgress({ status: "starting", percent: 0, message: "Starting image overlay..." });
    setLogs([]);
    try {
      const body = new FormData();
      body.append("fg_file", fgImageFile);
      body.append("bg_file", bgImageFile);
      const response = await fetch(`${BGREMOVE_API_URL}/api/v1/remove/overlay/upload`, { method: "POST", body });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error((error as { detail?: string }).detail || "Merge failed");
      }
      const { task_id } = (await response.json()) as { task_id: string };
      const source = new EventSource(`${BGREMOVE_API_URL}/api/v1/remove/overlay/stream/${task_id}`);
      source.onmessage = (event) => {
        const payload = JSON.parse(event.data as string) as ProgressData;
        setProgress(payload);
        if (payload.logs) setLogs(payload.logs);
        if (payload.status === "complete") {
          source.close();
          fetch(`${BGREMOVE_API_URL}/api/v1/remove/overlay/result/${task_id}`)
            .then((res) => res.json())
            .then((result: OverlayResult) => { setImageResult(result); setIsProcessing(false); })
            .catch(() => { setProgress({ status: "error", percent: 0, message: "Failed to fetch result." }); setIsProcessing(false); });
        }
        if (payload.status === "error") { source.close(); setIsProcessing(false); }
      };
      source.onerror = () => { source.close(); setProgress({ status: "error", percent: 0, message: "Lost connection." }); setIsProcessing(false); };
    } catch (err) {
      setProgress({ status: "error", percent: 0, message: (err as Error).message || "Request failed." });
      setIsProcessing(false);
    }
  };

  const handleVideoMerge = async () => {
    if (!subjectVideoFile || !bgVideoFile) return;
    setVideoResult(null);
    setIsProcessing(true);
    setProgress({ status: "starting", percent: 0, message: "Starting video overlay..." });
    setLogs([]);
    try {
      const body = new FormData();
      body.append("subject_file", subjectVideoFile);
      if (maskVideoFile) body.append("mask_file", maskVideoFile);
      body.append("bg_file", bgVideoFile);
      if (audioFile) body.append("audio_file", audioFile);
      const response = await fetch(`${BGREMOVE_API_URL}/api/v1/video/overlay/upload`, { method: "POST", body });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error((error as { detail?: string }).detail || "Video merge failed");
      }
      const { task_id } = (await response.json()) as { task_id: string };
      const source = new EventSource(`${BGREMOVE_API_URL}/api/v1/video/overlay/stream/${task_id}`);
      source.onmessage = (event) => {
        const payload = JSON.parse(event.data as string) as ProgressData;
        setProgress(payload);
        if (payload.logs) setLogs(payload.logs);
        if (payload.status === "complete") {
          source.close();
          fetch(`${BGREMOVE_API_URL}/api/v1/video/overlay/result/${task_id}`)
            .then((res) => res.json())
            .then((result: VideoOverlayResult) => { setVideoResult(result); setIsProcessing(false); })
            .catch(() => { setProgress({ status: "error", percent: 0, message: "Failed to fetch result." }); setIsProcessing(false); });
        }
        if (payload.status === "error") { source.close(); setIsProcessing(false); }
      };
      source.onerror = () => { source.close(); setProgress({ status: "error", percent: 0, message: "Lost connection." }); setIsProcessing(false); };
    } catch (err) {
      setProgress({ status: "error", percent: 0, message: (err as Error).message || "Request failed." });
      setIsProcessing(false);
    }
  };

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-card">
      <CardContent className="p-8 space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">Merge Video / Image</h2>
          <p className="text-sm text-muted-foreground">
            Composite a transparent foreground image or subject video over a custom background.
          </p>
        </div>

        <ServiceStatusTable serverUnreachable={serverUnreachable} rows={statusRows} onRefresh={fetchStatus} />

        <Tabs
          value={activeTab}
          onValueChange={(v) => { setActiveTab(v as "image" | "video"); resetProgress(); }}
          className="space-y-4"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="image">
              <ImageIcon className="w-4 h-4 mr-2" />
              Image
            </TabsTrigger>
            <TabsTrigger value="video">
              <VideoIcon className="w-4 h-4 mr-2" />
              Video
            </TabsTrigger>
          </TabsList>

          {/* ── Image Tab ── */}
          <TabsContent value="image" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground uppercase">Foreground Image</p>
                <DropZone
                  file={fgImageFile}
                  onFile={setFgImageFile}
                  accept="image/*"
                  label="Upload foreground (PNG)"
                  hint="Transparent PNG from background removal"
                  icon={iconContainer(<Upload className="w-6 h-6 text-accent" />)}
                  disabled={isProcessing}
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground uppercase">Background Image</p>
                <DropZone
                  file={bgImageFile}
                  onFile={setBgImageFile}
                  accept="image/*"
                  label="Upload background"
                  hint="PNG, JPG, WEBP supported"
                  icon={iconContainer(<ImageIcon className="w-6 h-6 text-accent" />)}
                  disabled={isProcessing}
                />
              </div>
            </div>

            <Button
              className="w-full h-11 font-bold"
              onClick={handleImageMerge}
              disabled={isProcessing || !fgImageFile || !bgImageFile || !statusReady}
            >
              {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Merge Images
            </Button>

            {imageResult ? (
              <div className="space-y-3">
                <img
                  src={getAbsoluteUrl(imageResult.merged_url)}
                  alt="Merged result"
                  className="w-full rounded-xl border border-border"
                />
                <Button
                  variant="download"
                  className="w-full"
                  onClick={() => downloadFile(imageResult.download_url, imageResult.filename, BGREMOVE_API_URL)}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Merged Image
                </Button>
              </div>
            ) : null}
          </TabsContent>

          {/* ── Video Tab ── */}
          <TabsContent value="video" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground uppercase">Subject Video</p>
                <DropZone
                  file={subjectVideoFile}
                  onFile={setSubjectVideoFile}
                  accept=".mp4,.avi,.mov,.mkv"
                  label="Upload subject video"
                  hint="Foreground video from background removal"
                  icon={iconContainer(<Upload className="w-6 h-6 text-accent" />)}
                  disabled={isProcessing}
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground uppercase">Background</p>
                <DropZone
                  file={bgVideoFile}
                  onFile={setBgVideoFile}
                  accept="image/*,.mp4,.avi,.mov,.mkv"
                  label="Upload background"
                  hint="Image or video — looped if shorter"
                  icon={iconContainer(<ImageIcon className="w-6 h-6 text-accent" />)}
                  disabled={isProcessing}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground uppercase">
                  Mask Video <span className="normal-case font-normal text-muted-foreground">(optional — improves edge quality)</span>
                </p>
                <DropZone
                  file={maskVideoFile}
                  onFile={setMaskVideoFile}
                  accept=".mp4,.avi,.mov,.mkv"
                  label="Upload mask video"
                  hint="Grayscale alpha mask from background removal"
                  icon={iconContainer(<VideoIcon className="w-6 h-6 text-muted-foreground" />)}
                  disabled={isProcessing}
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground uppercase">
                  Audio <span className="normal-case font-normal text-muted-foreground">(optional)</span>
                </p>
                <DropZone
                  file={audioFile}
                  onFile={setAudioFile}
                  accept=".wav,.mp3,.aac,.flac,.ogg,.m4a"
                  label="Upload audio file"
                  hint="WAV, MP3 — added to final merged video"
                  icon={iconContainer(<Music className="w-6 h-6 text-muted-foreground" />)}
                  disabled={isProcessing}
                />
              </div>
            </div>

            <Button
              className="w-full h-11 font-bold"
              onClick={handleVideoMerge}
              disabled={isProcessing || !subjectVideoFile || !bgVideoFile || !statusReady}
            >
              {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Merge Video
            </Button>

            {videoResult ? (
              <div className="rounded-xl border border-border p-4 bg-muted/30 space-y-3">
                <p className="text-sm text-foreground font-medium">{videoResult.frames_processed} frames processed</p>
                <Button
                  variant="download"
                  className="w-full"
                  onClick={() => downloadFile(videoResult.download_url, videoResult.filename, BGREMOVE_API_URL)}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Merged Video
                </Button>
              </div>
            ) : null}
          </TabsContent>
        </Tabs>

        <ProgressDisplay progress={progress} logs={logs} defaultMessage="Processing..." />
      </CardContent>
    </Card>
  );
}
