/**
 * IPC Client for Electron
 * Uses Electron IPC to communicate with main process, which relays to server
 */

// Check if running in Electron
export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;
}

// Send a message to the server and wait for reply
export async function send<T = any>(name: string, args: any = {}): Promise<T> {
  if (!isElectron()) {
    throw new Error('Not in Electron');
  }
  return (window as any).electronAPI.serverSend(name, args);
}

// Listen for server push messages
export function listen(name: string, callback: (data: any) => void): () => void {
  if (!isElectron()) {
    return () => {};
  }
  return (window as any).electronAPI.onServerPush((data: any) => {
    if (data.name === name) {
      callback(data);
    }
  });
}

// API wrapper functions
export const ipcApi = {
  health: () => send<{ status: string; timestamp: string }>('health'),
  
  downloadVideo: (url: string, platform: string, convertToH264 = false) => 
    send<{ status: string; downloadId: string }>('download-video', { url, platform, convertToH264 }),
  
  getProgress: (downloadId: string) => 
    send<{ status: string; message?: string; percent?: string }>('get-progress', { downloadId }),
  
  extractAudio: (videoPath: string, format: 'mp3' | 'wav' = 'mp3') =>
    send<{ status: string; filePath: string; filename: string }>('extract-audio', { videoPath, format }),
  
  convertAudio: (audioPath: string, outputFormat: 'mp3' | 'wav') =>
    send<{ status: string; filePath: string; filename: string }>('convert-audio', { audioPath, outputFormat }),
  
  ttsFast: (text: string, options?: { voiceId?: string; backbone?: string; codec?: string; device?: string }) =>
    send<{
      status: string;
      filePath: string;
      filename: string;
      duration?: number;
      sampleRate?: number;
      processTime?: number;
      voiceId?: string;
      backbone?: string;
      codec?: string;
    }>('tts-fast', { text, ...(options || {}) }),

  trimVideo: (videoPath: string, startTime: string, endTime?: string, duration?: string) =>
    send<{ status: string; filePath: string; filename: string }>('trim-video', { videoPath, startTime, endTime, duration }),
  
  adjustSpeed: (videoPath: string, speed: number) =>
    send<{ status: string; filePath: string; filename: string }>('adjust-speed', { videoPath, speed }),
  
  cleanup: () => send<{ status: string; deletedCount: number; freedSpaceMb: number }>('cleanup'),
  
  storageInfo: () => send<{ tempDir: string; fileCount: number; totalSizeMb: number; files: any[] }>('storage-info'),
  
  getFile: (filename: string) => send<{ filePath: string; filename: string }>('get-file', { filename }),
  
  readFileBase64: (filePath: string) => send<{ data: string; filename: string }>('read-file-base64', { filePath }),
  
  saveUploadedFile: (data: string, filename: string) => 
    send<{ status: string; filePath: string; filename: string }>('save-uploaded-file', { data, filename }),
  
  ytdlpStatus: () => send<{ installed: boolean; version: string | null }>('ytdlp-status'),
  
  ffmpegStatus: () => send<{ installed: boolean; version: string | null }>('ffmpeg-status'),
  
  ytdlpUpdate: () => send<{ success: boolean; version: string }>('ytdlp-update'),
  
  ytdlpInstall: () => send<{ success: boolean; version: string }>('ytdlp-install'),
  
  // TTS Setup (Ollama-style)
  ttsStatus: () => send<{ 
    ready: boolean; 
    runnerExists: boolean; 
    ttsInstalled: boolean; 
    modelsExist: boolean;
    ttsPath: string;
  }>('tts-status'),
  
  ttsSetup: (forceReinstall = false) => send<{ 
    success: boolean; 
    message: string; 
    ttsPath: string;
  }>('tts-setup', { forceReinstall }),
  
  ttsCleanup: () => send<{ success: boolean; message: string }>('tts-cleanup'),
};

export default ipcApi;
