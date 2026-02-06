const { app, BrowserWindow, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const fs = require('fs');

let mainWindow;
let serverProcess;
let ipcClient = null;
let pendingRequests = new Map();
let requestId = 0;

// Check if dev server is running on port 5000
const isDev = !app.isPackaged;

// Setup IPC handlers
function setupIpcHandlers() {
  ipcMain.handle('dialog:open', async (event, options) => {
    return dialog.showOpenDialog(mainWindow, options);
  });
  
  ipcMain.handle('dialog:save', async (event, options) => {
    return dialog.showSaveDialog(mainWindow, options);
  });
  
  ipcMain.handle('app:version', async () => {
    return app.getVersion();
  });
  
  ipcMain.handle('shell:openExternal', async (event, url) => {
    return shell.openExternal(url);
  });
  
  // Relay messages to server process
  ipcMain.handle('server:send', async (event, name, args) => {
    return sendToServer(name, args);
  });
}

// Long-running operations that need extended timeout (5 minutes)
const LONG_RUNNING_OPS = new Set(['tts-fast', 'tts-fast-progress', 'tts-setup', 'download-video', 'ytdlp-update', 'ytdlp-install']);

// Send message to server and wait for reply
function sendToServer(name, args) {
  return new Promise((resolve, reject) => {
    if (!serverProcess) {
      reject(new Error('Server not running'));
      return;
    }
    
    const id = ++requestId;
    pendingRequests.set(id, { resolve, reject });
    
    serverProcess.send({ type: 'request', id, name, args });
    
    // Use 5 minute timeout for long-running ops, 60s for others
    const timeout = LONG_RUNNING_OPS.has(name) ? 300000 : 60000;
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }
    }, timeout);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    title: 'AI Content Hub',
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Load the client HTML
  if (isDev) {
    mainWindow.loadURL('http://localhost:5000');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load from bundled files
    const indexPath = path.join(app.getAppPath(), 'dist', 'public', 'index.html');
    console.log('Loading:', indexPath);
    console.log('Exists:', fs.existsSync(indexPath));
    
    if (fs.existsSync(indexPath)) {
      mainWindow.loadFile(indexPath);
    } else {
      // Try alternative path
      const altPath = path.join(__dirname, '..', 'dist', 'public', 'index.html');
      console.log('Trying alt path:', altPath);
      if (fs.existsSync(altPath)) {
        mainWindow.loadFile(altPath);
      } else {
        mainWindow.loadURL(`data:text/html,<h1>Error: Could not find index.html</h1><p>Checked: ${indexPath}</p><p>And: ${altPath}</p>`);
      }
    }
  }

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Load failed:', errorCode, errorDescription);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startServer() {
  const serverPath = path.join(__dirname, 'server.cjs');
  console.log('Starting server:', serverPath);
  
  serverProcess = fork(serverPath, [], {
    stdio: ['pipe', 'pipe', 'pipe', 'ipc']
  });

  serverProcess.stdout.on('data', (data) => {
    console.log('[Server]', data.toString().trim());
  });

  serverProcess.stderr.on('data', (data) => {
    console.error('[Server Error]', data.toString().trim());
  });

  // Handle messages from server
  serverProcess.on('message', (msg) => {
    if (msg.type === 'reply') {
      const pending = pendingRequests.get(msg.id);
      if (pending) {
        pendingRequests.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(msg.error));
        } else {
          pending.resolve(msg.result);
        }
      }
    } else if (msg.type === 'push') {
      // Forward push messages to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('server:push', msg.data);
      }
    }
  });

  serverProcess.on('error', (err) => {
    console.error('Server process error:', err);
  });

  serverProcess.on('exit', (code, signal) => {
    console.log('Server process exited:', code, signal);
    serverProcess = null;
  });
}

app.whenReady().then(async () => {
  console.log('App ready, isDev:', isDev);
  console.log('App path:', app.getAppPath());
  
  // Setup IPC handlers
  setupIpcHandlers();
  
  // Start the server process
  startServer();
  
  // Wait a bit for server to initialize
  await new Promise(r => setTimeout(r, 500));
  
  // Create the main window
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    console.log('Killing server process');
    serverProcess.kill();
    serverProcess = null;
  }
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
