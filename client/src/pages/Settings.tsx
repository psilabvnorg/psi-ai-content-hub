import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Loader2, HardDrive, RefreshCw, FolderOpen, Download, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isElectron, ipcApi } from "@/lib/ipc-client";
import { API_URL } from "@/lib/api";

interface StorageInfo {
  tempDir: string;
  fileCount: number;
  totalSizeMb: number;
  files: Array<{
    name: string;
    size: number;
    modified: number;
  }>;
}

interface ToolStatus {
  installed: boolean;
  version: string | null;
  error?: string;
}

export default function Settings() {
  const [loading, setLoading] = useState(false);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [ytdlpStatus, setYtdlpStatus] = useState<ToolStatus | null>(null);
  const [ffmpegStatus, setFfmpegStatus] = useState<ToolStatus | null>(null);
  const [updatingYtdlp, setUpdatingYtdlp] = useState(false);
  const [installingYtdlp, setInstallingYtdlp] = useState(false);
  const [cleaningVenv, setCleaningVenv] = useState(false);
  const [vcStatus, setVcStatus] = useState<{ runtime_ready: boolean; server_running: boolean; venv_path?: string; model_path?: string } | null>(null);
  const { toast } = useToast();

  const fetchStorageInfo = async () => {
    setLoadingInfo(true);
    try {
      if (isElectron()) {
        const data = await ipcApi.storageInfo();
        setStorageInfo(data);
      } else {
        const response = await fetch(`${API_URL}/api/storage/info`);
        if (!response.ok) throw new Error("Failed to fetch storage info");
        const data = await response.json();
        setStorageInfo({
          tempDir: data.temp_dir,
          fileCount: data.file_count,
          totalSizeMb: data.total_size_mb,
          files: data.files,
        });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoadingInfo(false);
    }
  };

  const fetchToolsStatus = async () => {
    try {
      if (isElectron()) {
        const [ytdlp, ffmpeg] = await Promise.all([
          ipcApi.ytdlpStatus(),
          ipcApi.ffmpegStatus(),
        ]);
        setYtdlpStatus(ytdlp);
        setFfmpegStatus(ffmpeg);
      } else {
        const [ytdlpRes, ffmpegRes] = await Promise.all([
          fetch(`${API_URL}/api/tools/ytdlp/status`),
          fetch(`${API_URL}/api/tools/ffmpeg/status`),
        ]);
        if (ytdlpRes.ok) setYtdlpStatus(await ytdlpRes.json());
        if (ffmpegRes.ok) setFfmpegStatus(await ffmpegRes.json());
      }
    } catch (error) {
      console.error("Failed to fetch tools status:", error);
    }
  };

  useEffect(() => {
    fetchStorageInfo();
    fetchToolsStatus();
    fetchVcStatus();
  }, []);

  const fetchVcStatus = async () => {
    if (window.electronAPI) {
      try {
        const s = await window.electronAPI.voiceCloneStatus();
        setVcStatus(s);
      } catch {
        setVcStatus(null);
      }
    }
  };

  const handleCleanVenv = async () => {
    if (!confirm("This will delete the Voice Clone virtual environment (~3 GB). You'll need to run Setup Runtime again. Continue?")) return;
    setCleaningVenv(true);
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.voiceCloneClean();
        toast({ title: "Success", description: result.message });
        await fetchVcStatus();
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setCleaningVenv(false);
    }
  };

  const handleCleanup = async () => {
    if (!confirm("Are you sure you want to delete all temporary files?")) return;

    setLoading(true);
    try {
      if (isElectron()) {
        const data = await ipcApi.cleanup();
        toast({ title: "Success", description: `Deleted ${data.deletedCount} files, freed ${data.freedSpaceMb} MB` });
      } else {
        const response = await fetch(`${API_URL}/api/cleanup`, { method: "POST" });
        if (!response.ok) throw new Error("Cleanup failed");
        const data = await response.json();
        toast({ title: "Success", description: data.message });
      }
      await fetchStorageInfo();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateYtdlp = async () => {
    setUpdatingYtdlp(true);
    try {
      if (isElectron()) {
        const data = await ipcApi.ytdlpUpdate();
        toast({ title: "Success", description: `yt-dlp updated to version ${data.version}` });
      } else {
        const response = await fetch(`${API_URL}/api/tools/ytdlp/update`, { method: "POST" });
        const data = await response.json();
        if (data.success) {
          toast({ title: "Success", description: `yt-dlp updated to version ${data.version}` });
        } else {
          throw new Error(data.error || "Update failed");
        }
      }
      await fetchToolsStatus();
    } catch (error: any) {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    } finally {
      setUpdatingYtdlp(false);
    }
  };

  const handleInstallYtdlp = async () => {
    setInstallingYtdlp(true);
    try {
      if (isElectron()) {
        const data = await ipcApi.ytdlpInstall();
        toast({ title: "Success", description: `yt-dlp installed (version ${data.version})` });
      } else {
        const response = await fetch(`${API_URL}/api/tools/ytdlp/install`, { method: "POST" });
        const data = await response.json();
        if (data.success) {
          toast({ title: "Success", description: `yt-dlp installed (version ${data.version})` });
        } else {
          throw new Error(data.error || "Installation failed");
        }
      }
      await fetchToolsStatus();
    } catch (error: any) {
      toast({ title: "Installation Failed", description: error.message, variant: "destructive" });
    } finally {
      setInstallingYtdlp(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Settings</h2>
        <p className="text-zinc-500">Manage your application settings and tools</p>
      </div>

      {/* Tools Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Download className="w-5 h-5" />
                Tools Management
              </CardTitle>
              <CardDescription className="mt-2">
                Install and update required tools for video downloading
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchToolsStatus}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* yt-dlp Status */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {ytdlpStatus?.installed ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
                <div>
                  <h4 className="font-medium">yt-dlp</h4>
                  <p className="text-sm text-zinc-500">Video downloader for YouTube, TikTok, etc.</p>
                </div>
              </div>
              {ytdlpStatus?.installed && (
                <span className="text-sm font-mono bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded">
                  v{ytdlpStatus.version}
                </span>
              )}
            </div>
            
            {ytdlpStatus?.installed ? (
              <Button onClick={handleUpdateYtdlp} disabled={updatingYtdlp} variant="outline" size="sm">
                {updatingYtdlp ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Updating...</>
                ) : (
                  <><RefreshCw className="w-4 h-4 mr-2" />Update yt-dlp</>
                )}
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded text-sm text-amber-700 dark:text-amber-300">
                  <AlertCircle className="w-4 h-4" />
                  yt-dlp is not installed. Video downloading will not work.
                </div>
                <Button onClick={handleInstallYtdlp} disabled={installingYtdlp} size="sm">
                  {installingYtdlp ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Installing...</>
                  ) : (
                    <><Download className="w-4 h-4 mr-2" />Install yt-dlp</>
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* ffmpeg Status */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {ffmpegStatus?.installed ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
                <div>
                  <h4 className="font-medium">ffmpeg</h4>
                  <p className="text-sm text-zinc-500">Audio/video processing tool</p>
                </div>
              </div>
              {ffmpegStatus?.installed && (
                <span className="text-sm font-mono bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded">
                  v{ffmpegStatus.version}
                </span>
              )}
            </div>
            
            {!ffmpegStatus?.installed && (
              <div className="mt-3 flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded text-sm text-amber-700 dark:text-amber-300">
                <AlertCircle className="w-4 h-4" />
                ffmpeg is not installed. Install it from ffmpeg.org
              </div>
            )}
          </div>

          {/* Voice Clone Runtime */}
          {isElectron() && (
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {vcStatus?.runtime_ready ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                  <div>
                    <h4 className="font-medium">Voice Clone Runtime</h4>
                    <p className="text-sm text-zinc-500">Python venv with PyTorch + F5-TTS (~3 GB)</p>
                  </div>
                </div>
                {vcStatus?.runtime_ready && vcStatus?.server_running && (
                  <span className="text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded">
                    Server Running
                  </span>
                )}
              </div>
              <Button
                onClick={handleCleanVenv}
                disabled={cleaningVenv}
                variant="destructive"
                size="sm"
              >
                {cleaningVenv ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Cleaning...</>
                ) : (
                  <><Trash2 className="w-4 h-4 mr-2" />Clean Virtual Environment</>
                )}
              </Button>
              <p className="text-xs text-zinc-400">
                Removes .venv folder for a fresh install. Use Setup Runtime in Voice Clone page afterwards.
              </p>
              {vcStatus?.venv_path && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center gap-2 p-2 bg-zinc-50 dark:bg-zinc-900 rounded border">
                    <FolderOpen className="w-4 h-4 text-zinc-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-zinc-500">Virtual Environment</p>
                      <code className="text-xs break-all">{vcStatus.venv_path}</code>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-zinc-50 dark:bg-zinc-900 rounded border">
                    <FolderOpen className="w-4 h-4 text-zinc-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-zinc-500">ML Models (F5-TTS)</p>
                      <code className="text-xs break-all">{vcStatus.model_path}</code>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Storage Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="w-5 h-5" />
                Storage Management
              </CardTitle>
              <CardDescription className="mt-2">
                Manage temporary files and free up disk space
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchStorageInfo} disabled={loadingInfo}>
              {loadingInfo ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {storageInfo && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4">
                <div className="text-sm text-zinc-500 mb-1">Total Files</div>
                <div className="text-2xl font-bold">{storageInfo.fileCount}</div>
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4">
                <div className="text-sm text-zinc-500 mb-1">Storage Used</div>
                <div className="text-2xl font-bold">{storageInfo.totalSizeMb} MB</div>
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4">
                <div className="text-sm text-zinc-500 mb-1">Location</div>
                <div className="text-xs font-mono break-all">{storageInfo.tempDir}</div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Temporary Files Location</label>
            <div className="flex items-center gap-2 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg border">
              <FolderOpen className="w-4 h-4 text-zinc-500" />
              <code className="text-sm flex-1 break-all">
                {storageInfo?.tempDir || "Loading..."}
              </code>
            </div>
          </div>

          {storageInfo && storageInfo.files.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Recent Files</label>
              <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                {storageInfo.files.map((file, index) => (
                  <div key={index} className="p-3 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-900">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-zinc-500">{formatDate(file.modified)}</p>
                    </div>
                    <div className="text-sm text-zinc-500 ml-4">
                      {formatFileSize(file.size)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-4 border-t">
            <Button
              onClick={handleCleanup}
              disabled={loading || !storageInfo || storageInfo.fileCount === 0}
              variant="destructive"
              className="w-full"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Cleaning...</>
              ) : (
                <><Trash2 className="w-4 h-4 mr-2" />Clean All Temporary Files</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
          <CardDescription>Application information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Version</span>
            <span className="font-medium">1.0.0</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Backend</span>
            <span className="font-medium">Node.js + IPC</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Frontend</span>
            <span className="font-medium">React + TypeScript</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Desktop</span>
            <span className="font-medium">Electron</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
