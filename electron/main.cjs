const { app, BrowserWindow, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const { fork, spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let serverProcess;
let voiceCloneServerProcess;
let ttsFastServerProcess;
let ipcClient = null;
let pendingRequests = new Map();
let requestId = 0;

// Check if dev server is running on port 5000
const isDev = !app.isPackaged;

function getInstallDir() {
  return app.isPackaged ? path.dirname(process.execPath) : process.cwd();
}

function getVenvDir() {
  return process.env.VOICE_CLONE_VENV_DIR || path.join(getInstallDir(), '.venv');
}

function getUvPath() {
  if (process.env.VOICE_CLONE_UV_PATH) {
    return process.env.VOICE_CLONE_UV_PATH;
  }
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'uv', 'uv.exe');
  }
  return 'uv';
}

function getVoiceCloneServerPath() {
  if (app.isPackaged) {
    return path.join(app.getAppPath(), 'electron', 'voice-clone-server.py');
  }
  return path.join(process.cwd(), 'electron', 'voice-clone-server.py');
}

function getAssetsRoot() {
  if (process.env.VOICE_CLONE_ASSETS) {
    return process.env.VOICE_CLONE_ASSETS;
  }
  if (app.isPackaged) {
    return path.join(app.getAppPath(), 'F5-TTS-Vietnamese');
  }
  return path.join(process.cwd(), 'F5-TTS-Vietnamese');
}

function getVoicesJsonPath() {
  if (process.env.VOICE_CLONE_VOICES_JSON) {
    return process.env.VOICE_CLONE_VOICES_JSON;
  }
  if (app.isPackaged) {
    return path.join(app.getAppPath(), 'shared', 'voice-clone', 'voices.json');
  }
  return path.join(process.cwd(), 'shared', 'voice-clone', 'voices.json');
}

function getTtsFastServerPath() {
  if (app.isPackaged) {
    return path.join(app.getAppPath(), 'electron', 'tts-fast-server.py');
  }
  return path.join(process.cwd(), 'electron', 'tts-fast-server.py');
}

function getVieNeuTtsRoot() {
  if (process.env.VIENEU_TTS_ROOT) {
    return process.env.VIENEU_TTS_ROOT;
  }
  if (app.isPackaged) {
    return path.join(app.getAppPath(), 'VieNeu-TTS-Fast-Vietnamese');
  }
  return path.join(process.cwd(), 'VieNeu-TTS-Fast-Vietnamese');
}

function runCommand(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: 'inherit', ...opts });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

function runCommandWithProgress(cmd, args, opts = {}, onData) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout.on('data', (data) => {
      const line = data.toString().trim();
      if (line && onData) onData(line);
    });
    proc.stderr.on('data', (data) => {
      const line = data.toString().trim();
      if (line && onData) onData(line);
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

async function ensureVoiceCloneRuntime() {
  const venvDir = getVenvDir();
  const marker = path.join(venvDir, '.ready.json');
  if (fs.existsSync(marker)) {
    console.log('[VoiceClone] Runtime already ready:', marker);
    return;
  }

  const uvPath = getUvPath();
  console.log('[VoiceClone] Creating venv with uv:', uvPath, venvDir);
  await runCommand(uvPath, ['venv', venvDir], { shell: true });

  const pythonPath = path.join(venvDir, 'Scripts', 'python.exe');
  const extraIndexUrl = 'https://download.pytorch.org/whl/cu124';
  const f5TtsLocalPath = getAssetsRoot(); // F5-TTS-Vietnamese local package

  const packages = [
    'torch==2.4.0+cu124',
    'torchaudio==2.4.0+cu124',
    'fastapi',
    'uvicorn',
  ];

  console.log('[VoiceClone] Installing PyTorch + deps with uv...');
  await runCommand(
    uvPath,
    ['pip', 'install', '--python', pythonPath, '--extra-index-url', extraIndexUrl, ...packages],
    { shell: true }
  );

  console.log('[VoiceClone] Installing f5-tts from local source...');
  await runCommand(
    uvPath,
    ['pip', 'install', '--python', pythonPath, f5TtsLocalPath],
    { shell: true }
  );

  fs.writeFileSync(marker, JSON.stringify({ ready: true, at: new Date().toISOString() }, null, 2));
  console.log('[VoiceClone] Runtime setup complete.');
}

async function startVoiceCloneServer() {
  const venvDir = getVenvDir();
  const marker = path.join(venvDir, '.ready.json');
  if (!fs.existsSync(marker)) {
    console.log('[VoiceClone] Runtime not set up yet — skipping auto-start. Use the UI to set up.');
    return;
  }

  const pythonPath = path.join(venvDir, 'Scripts', 'python.exe');
  const serverPath = getVoiceCloneServerPath();
  const assetsRoot = getAssetsRoot();
  const voicesJson = getVoicesJsonPath();

  if (!fs.existsSync(serverPath)) {
    console.error('[VoiceClone] Server script not found:', serverPath);
    return;
  }

  console.log('[VoiceClone] Starting server:', serverPath);
  console.log('[VoiceClone] Python:', pythonPath);
  console.log('[VoiceClone] Assets:', assetsRoot);
  console.log('[VoiceClone] Voices:', voicesJson);

  voiceCloneServerProcess = spawn(
    pythonPath,
    [serverPath, '--listen', '--port', '8188'],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        VOICE_CLONE_ASSETS: assetsRoot,
        VOICE_CLONE_VOICES_JSON: voicesJson,
      },
    }
  );

  voiceCloneServerProcess.on('exit', (code, signal) => {
    console.log('[VoiceClone] Server exited:', code, signal);
    voiceCloneServerProcess = null;
  });
}

async function startTtsFastServer() {
  const venvDir = getVenvDir();
  const marker = path.join(venvDir, '.ready.json');
  if (!fs.existsSync(marker)) {
    console.log('[TtsFast] Runtime not set up yet — skipping auto-start. Use Voice Clone setup first.');
    return;
  }

  const pythonPath = path.join(venvDir, 'Scripts', 'python.exe');
  const serverPath = getTtsFastServerPath();
  const vieneuRoot = getVieNeuTtsRoot();

  if (!fs.existsSync(serverPath)) {
    console.error('[TtsFast] Server script not found:', serverPath);
    return;
  }

  console.log('[TtsFast] Starting server:', serverPath);
  console.log('[TtsFast] Python:', pythonPath);
  console.log('[TtsFast] VieNeu root:', vieneuRoot);

  ttsFastServerProcess = spawn(
    pythonPath,
    [serverPath, '--listen', '--port', '8189'],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        VIENEU_TTS_ROOT: vieneuRoot,
      },
    }
  );

  ttsFastServerProcess.on('exit', (code, signal) => {
    console.log('[TtsFast] Server exited:', code, signal);
    ttsFastServerProcess = null;
  });
}

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

  // Voice Clone: check runtime + server status
  ipcMain.handle('voice-clone:status', async () => {
    const venvDir = getVenvDir();
    const marker = path.join(venvDir, '.ready.json');
    const runtimeReady = fs.existsSync(marker);
    const serverRunning = voiceCloneServerProcess !== null;
    const appdata = process.env.APPDATA || path.join(require('os').homedir(), '.config');
    const modelDir = path.join(appdata, 'psi-ai-content-hub', 'models', 'f5-tts');
    return {
      runtime_ready: runtimeReady,
      server_running: serverRunning,
      venv_path: venvDir,
      model_path: modelDir,
    };
  });

  // Voice Clone: clean venv for fresh install
  ipcMain.handle('voice-clone:clean', async () => {
    const venvDir = getVenvDir();
    if (voiceCloneServerProcess) {
      console.log('[VoiceClone] Stopping server before cleanup...');
      voiceCloneServerProcess.kill();
      voiceCloneServerProcess = null;
    }
    if (fs.existsSync(venvDir)) {
      console.log('[VoiceClone] Removing venv:', venvDir);
      fs.rmSync(venvDir, { recursive: true, force: true });
      console.log('[VoiceClone] Venv removed.');
      return { success: true, message: 'Virtual environment removed.' };
    }
    return { success: true, message: 'No virtual environment found.' };
  });

  // Fast TTS: check server status
  ipcMain.handle('tts-fast:status', async () => {
    const venvDir = getVenvDir();
    const marker = path.join(venvDir, '.ready.json');
    const runtimeReady = fs.existsSync(marker);
    const serverRunning = ttsFastServerProcess !== null;
    return {
      runtime_ready: runtimeReady,
      server_running: serverRunning,
      vieneu_root: getVieNeuTtsRoot(),
    };
  });

  // Fast TTS: start server if not running
  ipcMain.handle('tts-fast:start-server', async () => {
    if (ttsFastServerProcess) {
      return { success: true, message: 'Server already running' };
    }
    try {
      await startTtsFastServer();
      return { success: true, message: 'Server started' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Fast TTS: stop server
  ipcMain.handle('tts-fast:stop-server', async () => {
    if (ttsFastServerProcess) {
      ttsFastServerProcess.kill();
      ttsFastServerProcess = null;
      return { success: true, message: 'Server stopped' };
    }
    return { success: true, message: 'Server was not running' };
  });

  // Voice Clone: install runtime (venv + deps), then start server
  ipcMain.handle('voice-clone:setup', async (event) => {
    const setupLogs = [];
    const sendProgress = (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('voice-clone:setup-progress', { ...data, logs: setupLogs.slice() });
      }
    };
    const log = (line) => {
      console.log('[VoiceClone:Setup]', line);
      setupLogs.push(line);
      if (setupLogs.length > 200) setupLogs.shift();
    };

    try {
      const venvDir = getVenvDir();
      const marker = path.join(venvDir, '.ready.json');

      if (fs.existsSync(marker)) {
        log('Runtime already installed.');
        sendProgress({ status: 'complete', percent: 100, message: 'Runtime already installed.' });
        if (!voiceCloneServerProcess) await startVoiceCloneServer();
        return { success: true };
      }

      const uvPath = getUvPath();

      // Step 1: Create venv (remove partial leftovers first)
      log('Creating Python virtual environment at: ' + venvDir);
      sendProgress({ status: 'installing', percent: 5, message: 'Creating Python virtual environment...' });
      if (fs.existsSync(venvDir)) {
        log('Removing existing partial venv...');
        fs.rmSync(venvDir, { recursive: true, force: true });
      }
      await runCommandWithProgress(uvPath, ['venv', venvDir], { shell: true }, (line) => {
        log(line);
        sendProgress({ status: 'installing', percent: 10, message: line });
      });
      log('Venv created successfully.');

      const pythonPath = path.join(venvDir, 'Scripts', 'python.exe');
      const extraIndexUrl = 'https://download.pytorch.org/whl/cu124';
      const packages = ['torch==2.4.0+cu124', 'torchaudio==2.4.0+cu124', 'fastapi', 'uvicorn'];

      // Step 2: Install PyTorch + deps
      log('Installing: ' + packages.join(', '));
      log('Extra index: ' + extraIndexUrl);
      sendProgress({ status: 'installing', percent: 15, message: 'Installing PyTorch + dependencies (this may take a while)...' });
      await runCommandWithProgress(
        uvPath,
        ['pip', 'install', '--python', pythonPath, '--extra-index-url', extraIndexUrl, ...packages],
        { shell: true },
        (line) => {
          log(line);
          sendProgress({ status: 'installing', percent: 40, message: line });
        }
      );
      log('PyTorch + deps installed successfully.');

      // Step 3: Install f5-tts from local source
      const f5TtsLocalPath = getAssetsRoot();
      log('Installing F5-TTS from: ' + f5TtsLocalPath);
      sendProgress({ status: 'installing', percent: 70, message: 'Installing F5-TTS from local source...' });
      await runCommandWithProgress(
        uvPath,
        ['pip', 'install', '--python', pythonPath, f5TtsLocalPath],
        { shell: true },
        (line) => {
          log(line);
          sendProgress({ status: 'installing', percent: 85, message: line });
        }
      );
      log('F5-TTS installed successfully.');

      // Step 4: Write marker
      fs.writeFileSync(marker, JSON.stringify({ ready: true, at: new Date().toISOString() }, null, 2));
      log('Starting voice clone server...');
      sendProgress({ status: 'installing', percent: 95, message: 'Starting voice clone server...' });

      // Step 5: Start the Python server
      await startVoiceCloneServer();

      log('Voice clone runtime ready!');
      sendProgress({ status: 'complete', percent: 100, message: 'Voice clone runtime ready!' });
      return { success: true };
    } catch (err) {
      log('ERROR: ' + err.message);
      console.error('[VoiceClone] Setup failed:', err);
      sendProgress({ status: 'error', percent: 0, message: `Setup failed: ${err.message}` });
      return { success: false, error: err.message };
    }
  });
}

// Long-running operations that need extended timeout (5 minutes)
const LONG_RUNNING_OPS = new Set(['download-video', 'ytdlp-update', 'ytdlp-install']);

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

  // Start Voice Clone Python server (REST-only)
  startVoiceCloneServer();

  // Start Fast TTS Python server (REST-only)
  startTtsFastServer();
  
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
  if (voiceCloneServerProcess) {
    console.log('Killing Voice Clone server process');
    voiceCloneServerProcess.kill();
    voiceCloneServerProcess = null;
  }
  if (ttsFastServerProcess) {
    console.log('Killing Fast TTS server process');
    ttsFastServerProcess.kill();
    ttsFastServerProcess = null;
  }
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
