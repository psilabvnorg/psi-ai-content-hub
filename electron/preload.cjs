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
});

console.log('Preload script loaded');
