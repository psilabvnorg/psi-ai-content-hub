export {};

type ManagedServiceStatusState =
  | "not_configured"
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "error";

type ManagedServiceStatus = {
  id: string;
  name: string;
  status: ManagedServiceStatusState;
  pid: number | null;
  error: string | null;
  api_url: string;
  health_url: string;
  service_root: string;
  venv_python_path: string;
  configured: boolean;
  updated_at: string;
};

type ElectronApiServices = {
  list: () => Promise<ManagedServiceStatus[]>;
  start: (serviceId: string) => Promise<ManagedServiceStatus>;
  stop: (serviceId: string) => Promise<ManagedServiceStatus>;
  restart: (serviceId: string) => Promise<ManagedServiceStatus>;
  onStatusChanged: (callback: (services: ManagedServiceStatus[]) => void) => () => void;
};

type ElectronApi = {
  platform: string;
  isElectron: boolean;
  showOpenDialog: (options: unknown) => Promise<unknown>;
  showSaveDialog: (options: unknown) => Promise<unknown>;
  getAppVersion: () => Promise<string>;
  openExternal: (url: string) => Promise<void>;
  serverSend: (name: string, args: unknown) => Promise<unknown>;
  onServerPush: (callback: (data: unknown) => void) => () => void;
  voiceCloneStatus: () => Promise<unknown>;
  voiceCloneSetup: () => Promise<unknown>;
  voiceCloneClean: () => Promise<unknown>;
  onVoiceCloneSetupProgress: (callback: (data: unknown) => void) => () => void;
  ttsFastStatus: () => Promise<unknown>;
  ttsFastStartServer: () => Promise<unknown>;
  ttsFastStopServer: () => Promise<unknown>;
  ttsFastStartServerInTerminal: () => Promise<unknown>;
  services: ElectronApiServices;
};

declare global {
  interface Window {
    electronAPI?: ElectronApi;
  }
}
