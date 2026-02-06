// Electron API types exposed via preload script
interface ElectronAPI {
  platform: string;
  isElectron: boolean;
  showOpenDialog: (options: unknown) => Promise<unknown>;
  showSaveDialog: (options: unknown) => Promise<unknown>;
  getAppVersion: () => Promise<string>;
  openExternal: (url: string) => Promise<void>;
  // Server IPC
  serverSend: (name: string, args: unknown) => Promise<unknown>;
  onServerPush: (callback: (data: unknown) => void) => () => void;
  // Voice Clone runtime
  voiceCloneStatus: () => Promise<{ runtime_ready: boolean; server_running: boolean; venv_path: string; model_path: string }>;
  voiceCloneSetup: () => Promise<{ success: boolean; error?: string }>;
  voiceCloneClean: () => Promise<{ success: boolean; message: string }>;
  onVoiceCloneSetupProgress: (callback: (data: { status: string; percent: number; message?: string; logs?: string[] }) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
