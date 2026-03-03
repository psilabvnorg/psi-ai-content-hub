const { contextBridge, ipcRenderer } = require('electron');

// Expose APIs to renderer - use Electron IPC to communicate with main process
// Main process will relay to the server via node-ipc
contextBridge.exposeInMainWorld('electronAPI', {
  // Platform info
  platform: process.platform,
  isElectron: true,
  
  // File dialogs
  showOpenDialog: (options) => ipcRenderer.invoke('dialog:open', options),
  showSaveDialog: (options) => ipcRenderer.invoke('dialog:save', options),
  
  // App info
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  getAppPaths: () => ipcRenderer.invoke('app:paths'),
  
  // Shell operations
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  
  // Server IPC - relay through main process
  serverSend: (name, args) => ipcRenderer.invoke('server:send', name, args),
  
  // Listen for server push messages
  onServerPush: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('server:push', handler);
    return () => ipcRenderer.removeListener('server:push', handler);
  },

  // Voice Clone runtime
  voiceCloneStatus: () => ipcRenderer.invoke('voice-clone:status'),
  voiceCloneSetup: () => ipcRenderer.invoke('voice-clone:setup'),
  voiceCloneClean: () => ipcRenderer.invoke('voice-clone:clean'),
  onVoiceCloneSetupProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('voice-clone:setup-progress', handler);
    return () => ipcRenderer.removeListener('voice-clone:setup-progress', handler);
  },

  // Fast TTS runtime
  ttsFastStatus: () => ipcRenderer.invoke('tts-fast:status'),
  ttsFastStartServer: () => ipcRenderer.invoke('tts-fast:start-server'),
  ttsFastStopServer: () => ipcRenderer.invoke('tts-fast:stop-server'),

  // Thumbnail templates
  templates: {
    listPrebuilt: ()           => ipcRenderer.invoke('server:send', 'template:list-prebuilt', {}),
    listUser:     ()           => ipcRenderer.invoke('server:send', 'template:list-user', {}),
    save:         (name, tmpl) => ipcRenderer.invoke('server:send', 'template:save',      { name, template: tmpl }),
    get:          (slug)       => ipcRenderer.invoke('server:send', 'template:get',       { slug }),
    delete:       (slug)       => ipcRenderer.invoke('server:send', 'template:delete',    { slug }),
  },

  services: {
    list: () => ipcRenderer.invoke('services:list'),
    start: (serviceId) => ipcRenderer.invoke('services:start', serviceId),
    stop: (serviceId) => ipcRenderer.invoke('services:stop', serviceId),
    restart: (serviceId) => ipcRenderer.invoke('services:restart', serviceId),
    onStatusChanged: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('services:status-changed', handler);
      return () => ipcRenderer.removeListener('services:status-changed', handler);
    },
  },
});

console.log('Preload script loaded');
