// Electron API types exposed via preload script
interface ElectronAPI {
  platform: string;
  isElectron: boolean;
  showOpenDialog: (options: any) => Promise<any>;
  showSaveDialog: (options: any) => Promise<any>;
  getAppVersion: () => Promise<string>;
  openExternal: (url: string) => Promise<void>;
  // Server IPC
  serverSend: (name: string, args: any) => Promise<any>;
  onServerPush: (callback: (data: any) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
