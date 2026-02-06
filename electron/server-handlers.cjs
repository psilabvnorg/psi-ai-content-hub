/**
 * Server handlers for IPC communication
 * These handle all the API requests from the client
 */

console.log('='.repeat(80));
console.log('[SERVER-HANDLERS] FILE LOADED - VERSION: 2026-02-06-05:20');
console.log('[SERVER-HANDLERS] This message proves the file was freshly loaded');
console.log('='.repeat(80));

const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');

const execAsync = promisify(exec);

// TTS setup paths (Ollama-style: download on-demand)
const APP_DATA = process.env.APPDATA || path.join(os.homedir(), '.config');
const TTS_ROOT = process.env.VIE_NEU_TTS_ROOT
  ? path.resolve(process.env.VIE_NEU_TTS_ROOT)
  : path.join(APP_DATA, 'psi-ai-content-hub', 'vie-neu-tts');
const TTS_MARKER = path.join(TTS_ROOT, 'tts_ready.json');
const TTS_RUNNER = path.join(__dirname, 'tts-runner.mjs');
const NODE_BIN = process.execPath;

// Temp directory for downloads
const TEMP_DIR = path.join(os.tmpdir(), 'psi_ai_content_hub');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Progress tracking for downloads
const progressStore = new Map();
const ttsProgressStore = new Map();

// Broadcast function (set by server.cjs)
let broadcastFn = null;
function setBroadcast(fn) {
  broadcastFn = fn;
}

// Helper: Generate unique filename
function generateFilename(prefix, extension) {
  const timestamp = Date.now();
  return path.join(TEMP_DIR, `${prefix}_${timestamp}.${extension}`);
}

// Helper: Cleanup old files (older than 1 hour)
function cleanupOldFiles() {
  const currentTime = Date.now();
  try {
    const files = fs.readdirSync(TEMP_DIR);
    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        if (currentTime - stats.mtimeMs > 3600000) {
          fs.unlinkSync(filePath);
        }
      } catch (e) {}
    }
  } catch (e) {}
}

// Run cleanup on startup
cleanupOldFiles();

function runFastTts(payload, onProgress = null) {
  if (!fs.existsSync(TTS_RUNNER)) {
    return Promise.reject(new Error(`TTS runner not found at ${TTS_RUNNER}`));
  }

  return new Promise((resolve, reject) => {
    console.log('[runFastTts] Starting TTS runner process');
    const proc = spawn(NODE_BIN, [TTS_RUNNER], { 
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, VIE_NEU_TTS_ROOT: TTS_ROOT }
    });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const chunk = data.toString();
      console.log('[runFastTts] STDOUT:', chunk);
      stdout += chunk;
    });

    proc.stderr.on('data', (data) => {
      const chunk = data.toString();
      console.log('[runFastTts] STDERR:', chunk);
      stderr += chunk;
      
      // Try to parse progress JSON from stderr
      const lines = chunk.split('\n').filter(line => line.trim());
      for (const line of lines) {
        try {
          const progress = JSON.parse(line);
          if (progress.type === 'progress' && onProgress) {
            console.log('[runFastTts] Got progress:', progress.stage, progress.percent);
            onProgress(progress);
          }
        } catch (e) {
          // Not JSON, regular stderr - this is expected for log lines
        }
      }
    });

    proc.on('error', (err) => {
      console.log('[runFastTts] Process error:', err);
      reject(err);
    });

    proc.on('exit', (code, signal) => {
      console.log('[runFastTts] Process exited with code:', code, 'signal:', signal);
      console.log('[runFastTts] STDOUT length:', stdout.length);
      console.log('[runFastTts] STDERR length:', stderr.length);
      
      if (code !== 0) {
        return reject(new Error(stderr || 'TTS process failed'));
      }
      
      // Use setImmediate to ensure we're in a clean execution context
      setImmediate(() => {
        try {
          // Parse only the last line of stdout (final JSON result)
          const lines = stdout.trim().split('\n').filter(line => line.trim());
          console.log('[runFastTts] STDOUT lines count:', lines.length);
          const lastLine = lines[lines.length - 1];
          console.log('[runFastTts] Last line:', lastLine);
          if (!lastLine) {
            return reject(new Error('No output from TTS process'));
          }
          const result = JSON.parse(lastLine);
          console.log('[runFastTts] Parsed result:', result);
          if (result.status !== 'success') {
            return reject(new Error(result.detail || 'TTS process failed'));
          }
          console.log('[runFastTts] About to resolve with result');
          resolve(result);
          console.log('[runFastTts] Resolve called successfully');
        } catch (err) {
          console.log('[runFastTts] Parse error:', err);
          reject(new Error(`Failed to parse TTS output: ${err.message}`));
        }
      });
    });

    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
    
    console.log('[runFastTts] Payload sent, stdin closed, waiting for process to complete...');
  });
}

// Handlers
const handlers = {
  // Health check
  'health': async () => {
    return { status: 'healthy', timestamp: new Date().toISOString() };
  },

  // Get progress for a download
  'get-progress': async ({ downloadId }) => {
    return progressStore.get(downloadId) || { status: 'waiting', message: 'Waiting...' };
  },

  // Get TTS progress
  'get-tts-progress': async ({ ttsId }) => {
    const progress = ttsProgressStore.get(ttsId) || { status: 'waiting', message: 'Waiting...', percent: 0 };
    console.log('[Handler] get-tts-progress called for:', ttsId);
    console.log('[Handler] Store size:', ttsProgressStore.size);
    console.log('[Handler] Store keys:', Array.from(ttsProgressStore.keys()));
    console.log('[Handler] Returning progress:', progress);
    return progress;
  },

  // Download video
  'download-video': async ({ url, platform, convertToH264 = false }) => {
    if (!url || !platform) {
      throw new Error('URL and platform are required');
    }

    const downloadId = `download_${Date.now()}`;
    
    progressStore.set(downloadId, {
      status: 'starting',
      message: 'Initializing download...',
    });

    // Start download in background
    downloadVideoTask(downloadId, url, platform, convertToH264);

    return {
      status: 'started',
      downloadId,
      message: 'Download started',
    };
  },

  // Extract audio from video path
  'extract-audio': async ({ videoPath, format = 'mp3' }) => {
    if (!videoPath) throw new Error('videoPath is required');
    if (!fs.existsSync(videoPath)) throw new Error('Video file not found');

    const outputFile = generateFilename('extracted_audio', format);
    const codec = format === 'mp3' ? 'libmp3lame' : 'pcm_s16le';
    const cmd = `ffmpeg -i "${videoPath}" -vn -acodec ${codec} -ar 44100 -ac 2 -y "${outputFile}"`;

    await execAsync(cmd);

    return {
      status: 'success',
      filePath: outputFile,
      filename: path.basename(outputFile),
      format,
    };
  },

  // Convert audio format
  'convert-audio': async ({ audioPath, outputFormat }) => {
    if (!audioPath || !outputFormat) throw new Error('audioPath and outputFormat are required');
    if (!fs.existsSync(audioPath)) throw new Error('Audio file not found');

    const outputFile = generateFilename('converted_audio', outputFormat);
    const codec = outputFormat === 'mp3' ? 'libmp3lame' : 'pcm_s16le';
    const cmd = `ffmpeg -i "${audioPath}" -acodec ${codec} -y "${outputFile}"`;

    await execAsync(cmd);

    return {
      status: 'success',
      filePath: outputFile,
      filename: path.basename(outputFile),
      format: outputFormat,
    };
  },

  // Super Fast TTS
  'tts-fast': async ({ text, voiceId, backbone, codec, device }) => {
    if (!text || !String(text).trim()) throw new Error('text is required');

    // Check if TTS is set up
    if (!fs.existsSync(TTS_MARKER)) {
      throw new Error('TTS_NOT_INSTALLED');
    }

    const outputFile = generateFilename('tts_fast', 'wav');

    const result = await runFastTts({
      text,
      voice_id: voiceId,
      backbone,
      codec,
      device,
      output_path: outputFile,
    });

    return {
      status: 'success',
      filePath: outputFile,
      filename: path.basename(outputFile),
      duration: result.duration,
      sampleRate: result.sample_rate,
      processTime: result.process_time,
      voiceId: result.voice_id,
      backbone: result.backbone,
      codec: result.codec,
    };
  },

  // TTS Fast with Progress - starts in background
  'tts-fast-progress': async ({ text, voiceId, backbone, codec, device }) => {
    console.log('[Handler] tts-fast-progress called');
    console.log('[Handler] Text length:', text?.length);
    if (!text || !String(text).trim()) throw new Error('text is required');

    // Check if TTS is set up
    if (!fs.existsSync(TTS_MARKER)) {
      throw new Error('TTS_NOT_INSTALLED');
    }

    const ttsId = `tts_${Date.now()}`;
    console.log('[Handler] Created TTS ID:', ttsId);
    const initialProgress = {
      status: 'starting',
      message: 'Initializing TTS...',
      percent: 0,
    };
    console.log('[Handler] Setting initial progress:', initialProgress);
    ttsProgressStore.set(ttsId, initialProgress);
    console.log('[Handler] Progress store size after set:', ttsProgressStore.size);
    console.log('[Handler] Can retrieve progress:', ttsProgressStore.has(ttsId));
    console.log('[Handler] Initial progress value:', ttsProgressStore.get(ttsId));

    // Start TTS in background - don't await, let it run async
    console.log('[Handler] ========== ABOUT TO CALL runTtsFastTask ==========');
    console.log('[Handler] Function exists:', typeof runTtsFastTask);
    console.log('[Handler] Calling with ttsId:', ttsId);
    
    runTtsFastTask(ttsId, text, { voiceId, backbone, codec, device }).catch(err => {
      console.error('[Handler] ========== BACKGROUND TTS TASK FAILED ==========');
      console.error('[Handler] Error:', err);
      console.error('[Handler] Error stack:', err.stack);
    });

    console.log('[Handler] ========== runTtsFastTask CALLED (running in background) ==========');

    return {
      status: 'started',
      ttsId,
      message: 'TTS generation started',
    };
  },

  // Trim video
  'trim-video': async ({ videoPath, startTime, endTime, duration }) => {
    if (!videoPath || !startTime) throw new Error('videoPath and startTime are required');
    if (!fs.existsSync(videoPath)) throw new Error('Video file not found');

    const outputFile = generateFilename('trimmed_video', 'mp4');
    let cmd = `ffmpeg -i "${videoPath}" -ss ${startTime}`;
    if (endTime) cmd += ` -to ${endTime}`;
    else if (duration) cmd += ` -t ${duration}`;
    cmd += ` -c copy "${outputFile}" -y`;

    await execAsync(cmd);

    return {
      status: 'success',
      filePath: outputFile,
      filename: path.basename(outputFile),
    };
  },

  // Adjust video speed
  'adjust-speed': async ({ videoPath, speed }) => {
    if (!videoPath || speed === undefined) throw new Error('videoPath and speed are required');
    if (speed < 0.5 || speed > 2.0) throw new Error('Speed must be between 0.5 and 2.0');
    if (!fs.existsSync(videoPath)) throw new Error('Video file not found');

    const outputFile = generateFilename('speed_adjusted', 'mp4');
    const ptsMultiplier = 1.0 / speed;
    const cmd = `ffmpeg -i "${videoPath}" -filter:v "setpts=${ptsMultiplier}*PTS" -filter:a "atempo=${speed}" "${outputFile}" -y`;

    await execAsync(cmd);

    return {
      status: 'success',
      filePath: outputFile,
      filename: path.basename(outputFile),
      speed,
    };
  },

  // Cleanup temp files
  'cleanup': async () => {
    let deletedCount = 0;
    let totalSize = 0;

    const files = fs.readdirSync(TEMP_DIR);
    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          totalSize += stats.size;
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      } catch (e) {}
    }

    return {
      status: 'success',
      deletedCount,
      freedSpaceMb: Math.round((totalSize / (1024 * 1024)) * 100) / 100,
    };
  },

  // Storage info
  'storage-info': async () => {
    let fileCount = 0;
    let totalSize = 0;
    const filesInfo = [];

    const files = fs.readdirSync(TEMP_DIR);
    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          fileCount++;
          totalSize += stats.size;
          filesInfo.push({
            name: file,
            size: stats.size,
            modified: stats.mtimeMs,
          });
        }
      } catch (e) {}
    }

    filesInfo.sort((a, b) => b.modified - a.modified);

    return {
      tempDir: TEMP_DIR,
      fileCount,
      totalSizeMb: Math.round((totalSize / (1024 * 1024)) * 100) / 100,
      files: filesInfo.slice(0, 10),
    };
  },

  // Get file (returns file path for client to read)
  'get-file': async ({ filename }) => {
    const filePath = path.join(TEMP_DIR, filename);
    if (!fs.existsSync(filePath)) throw new Error('File not found');
    return { filePath, filename };
  },

  // Read file as base64 (for download)
  'read-file-base64': async ({ filePath }) => {
    if (!fs.existsSync(filePath)) throw new Error('File not found');
    const data = fs.readFileSync(filePath);
    return {
      data: data.toString('base64'),
      filename: path.basename(filePath),
    };
  },

  // Save uploaded file from base64 data to temp directory
  'save-uploaded-file': async ({ data, filename }) => {
    if (!data || !filename) throw new Error('data and filename are required');
    const ext = path.extname(filename) || '.mp4';
    const outputFile = generateFilename('uploaded', ext.replace('.', ''));
    const buffer = Buffer.from(data, 'base64');
    fs.writeFileSync(outputFile, buffer);
    return {
      status: 'success',
      filePath: outputFile,
      filename: path.basename(outputFile),
    };
  },

  // Check yt-dlp status
  'ytdlp-status': async () => {
    try {
      const { stdout } = await execAsync('yt-dlp --version');
      return { installed: true, version: stdout.trim() };
    } catch (e) {
      return { installed: false, version: null, error: 'yt-dlp not found' };
    }
  },

  // Check ffmpeg status
  'ffmpeg-status': async () => {
    try {
      const { stdout } = await execAsync('ffmpeg -version');
      const match = stdout.match(/ffmpeg version ([^\s]+)/);
      return { installed: true, version: match ? match[1] : 'unknown' };
    } catch (e) {
      return { installed: false, version: null, error: 'ffmpeg not found' };
    }
  },

  // Update yt-dlp
  'ytdlp-update': async () => {
    try {
      await execAsync('pip install -U yt-dlp', { timeout: 120000 });
      const { stdout } = await execAsync('yt-dlp --version');
      return { success: true, version: stdout.trim() };
    } catch (e) {
      try {
        await execAsync('yt-dlp -U', { timeout: 120000 });
        const { stdout } = await execAsync('yt-dlp --version');
        return { success: true, version: stdout.trim() };
      } catch (e2) {
        throw new Error('Update failed. Try: pip install -U yt-dlp');
      }
    }
  },

  // Install yt-dlp
  'ytdlp-install': async () => {
    const { stdout } = await execAsync('pip install yt-dlp', { timeout: 120000 });
    const { stdout: version } = await execAsync('yt-dlp --version');
    return { success: true, version: version.trim() };
  },

  // TTS Setup Status (Ollama-style)
  'tts-status': async () => {
    const runnerExists = fs.existsSync(TTS_RUNNER);
    const ttsInstalled = fs.existsSync(TTS_MARKER);
    const modelsExist = ttsInstalled;
    
    return {
      ready: runnerExists && ttsInstalled && modelsExist,
      runnerExists,
      ttsInstalled,
      modelsExist,
      ttsPath: TTS_ROOT,
    };
  },

  // Setup TTS (download models & dependencies)
  'tts-setup': async ({ forceReinstall = false }) => {
    if (!fs.existsSync(TTS_RUNNER)) {
      throw new Error('TTS runner is missing. Please reinstall the app.');
    }

    if (forceReinstall && fs.existsSync(TTS_ROOT)) {
      fs.rmSync(TTS_ROOT, { recursive: true, force: true });
    }

    await new Promise((resolve, reject) => {
      const proc = spawn(NODE_BIN, [TTS_RUNNER, '--download'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, VIE_NEU_TTS_ROOT: TTS_ROOT }
      });
      let stderr = '';
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(stderr || 'TTS setup failed'));
        } else {
          resolve();
        }
      });
    });

    return {
      success: true,
      message: 'TTS setup completed successfully',
      ttsPath: TTS_ROOT,
    };
  },

  // Cleanup TTS installation
  'tts-cleanup': async () => {
    if (fs.existsSync(TTS_ROOT)) {
      fs.rmSync(TTS_ROOT, { recursive: true, force: true });
      return { success: true, message: 'TTS cleaned up' };
    }
    return { success: true, message: 'TTS was not installed' };
  },
};

// Background task for video download
async function downloadVideoTask(downloadId, url, platform, convertToH264) {
  try {
    const tempDownload = generateFilename(`${platform}_temp`, 'mp4');
    const outputFile = generateFilename(`${platform}_video`, 'mp4');

    progressStore.set(downloadId, {
      status: 'downloading',
      message: 'Starting download...',
      percent: '0%',
    });

    const ytdlpArgs = [
      '-f', 'bestvideo[vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '-o', tempDownload,
      '--merge-output-format', 'mp4',
      '--no-warnings',
      '--progress',
      '--newline',
      url,
    ];

    const ytdlp = spawn('yt-dlp', ytdlpArgs);
    let videoTitle = 'Unknown';

    ytdlp.stdout.on('data', (data) => {
      const output = data.toString();
      const progressMatch = output.match(/(\d+\.?\d*)%/);
      if (progressMatch) {
        const progress = {
          status: 'downloading',
          percent: `${progressMatch[1]}%`,
          message: `Downloading: ${progressMatch[1]}%`,
        };
        progressStore.set(downloadId, progress);
        // Broadcast progress to client
        if (broadcastFn) {
          broadcastFn('download-progress', { downloadId, ...progress });
        }
      }
    });

    ytdlp.stderr.on('data', (data) => {
      console.error('yt-dlp stderr:', data.toString());
    });

    await new Promise((resolve, reject) => {
      ytdlp.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`yt-dlp exited with code ${code}`));
      });
      ytdlp.on('error', reject);
    });

    progressStore.set(downloadId, { status: 'processing', message: 'Checking codec...' });

    // Check video codec
    let videoCodec = 'unknown';
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${tempDownload}"`
      );
      videoCodec = stdout.trim();
    } catch (e) {}

    let converted = false;

    if (convertToH264 && videoCodec !== 'h264') {
      progressStore.set(downloadId, { status: 'converting', message: `Converting ${videoCodec} to H.264...` });
      const ffmpegCmd = `ffmpeg -i "${tempDownload}" -c:v libx264 -crf 18 -preset medium -c:a copy -movflags +faststart -y "${outputFile}"`;
      await execAsync(ffmpegCmd);
      converted = true;
      try { fs.unlinkSync(tempDownload); } catch (e) {}
    } else {
      fs.renameSync(tempDownload, outputFile);
    }

    const result = {
      status: 'complete',
      message: 'Download complete!',
      filePath: outputFile,
      filename: path.basename(outputFile),
      platform,
      title: videoTitle,
      codec: converted ? 'h264' : videoCodec,
      originalCodec: videoCodec,
      converted,
    };

    progressStore.set(downloadId, result);
    if (broadcastFn) {
      broadcastFn('download-progress', { downloadId, ...result });
    }

  } catch (error) {
    const errorResult = {
      status: 'error',
      message: error.message,
    };
    progressStore.set(downloadId, errorResult);
    if (broadcastFn) {
      broadcastFn('download-progress', { downloadId, ...errorResult });
    }
  }
}

// Background task for TTS generation
async function runTtsFastTask(ttsId, text, options = {}) {
  console.log('[TTS Task] ========== STARTING TTS TASK ==========');
  console.log('[TTS Task] CODE VERSION: 2026-02-06-05:15 - WITH DETAILED AWAIT LOGGING');
  console.log('[TTS Task] TTS ID:', ttsId);
  console.log('[TTS Task] Text length:', text.length);
  console.log('[TTS Task] Broadcast function available:', !!broadcastFn);
  console.log('[TTS Task] Store size at start:', ttsProgressStore.size);
  console.log('[TTS Task] Store keys at start:', Array.from(ttsProgressStore.keys()));
  
  try {
    const outputFile = generateFilename('tts_fast', 'wav');
    console.log('[TTS Task] Output file:', outputFile);

    const onProgress = (progress) => {
      console.log(`[TTS Task] [${ttsId}] Progress callback - stage: ${progress.stage}, percent: ${progress.percent}`);
      
      // Don't update on 'complete' stage - we'll handle that after getting the result
      if (progress.stage === 'complete') {
        console.log(`[TTS Task] [${ttsId}] Skipping complete stage in onProgress - will update after result`);
        return;
      }
      
      const progressData = {
        status: progress.stage,
        message: progress.message,
        percent: progress.percent || 0,
      };
      console.log(`[TTS Task] [${ttsId}] Storing progress:`, progressData);
      ttsProgressStore.set(ttsId, progressData);
      console.log(`[TTS Task] [${ttsId}] Progress stored, store size:`, ttsProgressStore.size);
      console.log(`[TTS Task] [${ttsId}] Can retrieve:`, ttsProgressStore.has(ttsId));
      console.log(`[TTS Task] [${ttsId}] Retrieved value:`, ttsProgressStore.get(ttsId));
      
      if (broadcastFn) {
        console.log(`[TTS Task] [${ttsId}] Broadcasting progress`);
        broadcastFn('tts-progress', { ttsId, ...progressData });
      } else {
        console.log(`[TTS Task] [${ttsId}] No broadcast function available!`);
      }
    };

    console.log(`[TTS Task] [${ttsId}] Calling runFastTts...`);
    console.log(`[TTS Task] [${ttsId}] About to await runFastTts`);
    
    let result;
    try {
      result = await runFastTts({
        text,
        voice_id: options.voiceId,
        backbone: options.backbone,
        codec: options.codec,
        device: options.device,
        output_path: outputFile,
      }, onProgress);
      console.log(`[TTS Task] [${ttsId}] runFastTts COMPLETED successfully`);
      console.log(`[TTS Task] [${ttsId}] Result type:`, typeof result);
      console.log(`[TTS Task] [${ttsId}] Result:`, JSON.stringify(result));
    } catch (err) {
      console.error(`[TTS Task] [${ttsId}] runFastTts FAILED with error:`, err);
      throw err;
    }

    console.log(`[TTS Task] [${ttsId}] After await, continuing to final update...`);

    console.log(`[TTS Task] [${ttsId}] After await, continuing to final update...`);

    console.log(`[TTS Task] [${ttsId}] ========== PREPARING FINAL COMPLETE DATA ==========`);
    const completeData = {
      status: 'complete',
      message: 'Audio generation complete!',
      percent: 100,
      filePath: outputFile,
      filename: path.basename(outputFile),
      duration: result.duration,
      sampleRate: result.sample_rate,
      processTime: result.process_time,
    };
    console.log(`[TTS Task] [${ttsId}] Complete data prepared:`, completeData);

    console.log(`[TTS Task] [${ttsId}] ========== STORING FINAL COMPLETE DATA ==========`);
    console.log(`[TTS Task] [${ttsId}] Complete data:`, completeData);
    console.log(`[TTS Task] [${ttsId}] Store size before set:`, ttsProgressStore.size);
    console.log(`[TTS Task] [${ttsId}] Store keys before set:`, Array.from(ttsProgressStore.keys()));
    
    ttsProgressStore.set(ttsId, completeData);
    
    console.log(`[TTS Task] [${ttsId}] Store size after set:`, ttsProgressStore.size);
    console.log(`[TTS Task] [${ttsId}] Store keys after set:`, Array.from(ttsProgressStore.keys()));
    console.log(`[TTS Task] [${ttsId}] Can retrieve:`, ttsProgressStore.has(ttsId));
    
    const storedData = ttsProgressStore.get(ttsId);
    console.log(`[TTS Task] [${ttsId}] Retrieved stored data:`, storedData);
    console.log(`[TTS Task] [${ttsId}] Status in store:`, storedData?.status);
    console.log(`[TTS Task] [${ttsId}] Percent in store:`, storedData?.percent);
    console.log(`[TTS Task] [${ttsId}] FilePath in store:`, storedData?.filePath);
    
    if (broadcastFn) {
      console.log(`[TTS Task] [${ttsId}] Broadcasting complete`);
      broadcastFn('tts-progress', { ttsId, ...completeData });
    }
    
    console.log(`[TTS Task] [${ttsId}] ========== TTS TASK COMPLETE ==========`);
  } catch (error) {
    console.error(`[TTS Task] [${ttsId}] ========== TTS TASK FAILED ==========`);
    console.error(`[TTS Task] [${ttsId}] Error:`, error);
    console.error(`[TTS Task] [${ttsId}] Error message:`, error.message);
    console.error(`[TTS Task] [${ttsId}] Error stack:`, error.stack);
    console.error(`[TTS Task] [${ttsId}] Error name:`, error.name);
    
    const errorData = {
      status: 'error',
      message: error.message || 'TTS generation failed',
      percent: 0,
    };
    console.log(`[TTS Task] [${ttsId}] Storing error data:`, errorData);
    ttsProgressStore.set(ttsId, errorData);
    
    if (broadcastFn) {
      console.log(`[TTS Task] [${ttsId}] Broadcasting error`);
      broadcastFn('tts-progress', { ttsId, ...errorData });
    }
    
    console.error(`[TTS Task] [${ttsId}] ========== ERROR HANDLING COMPLETE ==========`);
  }
}

module.exports = { handlers, setBroadcast };
