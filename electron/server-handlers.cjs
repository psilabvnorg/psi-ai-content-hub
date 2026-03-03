/**
 * Server handlers for IPC communication
 * These handle all the API requests from the client
 * NOTE: Fast TTS is now handled by tts-fast-server.py (Python REST API on port 8189)
 */

const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');

const execAsync = promisify(exec);

// Temp directory for downloads
const TEMP_DIR = path.join(os.tmpdir(), 'psi_ai_content_hub');

// User templates directory (persists in APPDATA)
const USER_TEMPLATES_DIR = path.join(
  process.env.APPDATA || path.join(os.homedir(), '.config'),
  'psi-ai-content-hub', 'templates', 'user'
);
if (!fs.existsSync(USER_TEMPLATES_DIR)) {
  fs.mkdirSync(USER_TEMPLATES_DIR, { recursive: true });
}

// Prebuilt templates directory (shipped with the app in client/public/templates/)
const PREBUILT_TEMPLATES_DIR = (() => {
  const devPath = path.join(__dirname, '..', 'client', 'public', 'templates');
  const prodPath = path.join(__dirname, '..', 'dist', 'public', 'templates');
  return fs.existsSync(devPath) ? devPath : prodPath;
})();

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Progress tracking for downloads
const progressStore = new Map();

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

  // ---------- Thumbnail Templates ----------

  // List all prebuilt templates (auto-discovers subfolders in client/public/templates/)
  'template:list-prebuilt': async () => {
    if (!fs.existsSync(PREBUILT_TEMPLATES_DIR)) return [];
    const entries = fs.readdirSync(PREBUILT_TEMPLATES_DIR, { withFileTypes: true });
    const templates = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const jsonPath = path.join(PREBUILT_TEMPLATES_DIR, entry.name, 'template.json');
      if (!fs.existsSync(jsonPath)) continue;
      try {
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        templates.push({ slug: entry.name, name: data.name || entry.name });
      } catch (e) {}
    }
    return templates;
  },

  // List all user-saved templates (metadata only, no images)
  'template:list-user': async () => {
    if (!fs.existsSync(USER_TEMPLATES_DIR)) return [];
    const entries = fs.readdirSync(USER_TEMPLATES_DIR, { withFileTypes: true });
    const templates = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const jsonPath = path.join(USER_TEMPLATES_DIR, entry.name, 'template.json');
      if (!fs.existsSync(jsonPath)) continue;
      try {
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        templates.push({ slug: entry.name, ...data, elements: [] }); // strip images from list
      } catch (e) {}
    }
    return templates;
  },

  // Save current canvas state as a named template
  'template:save': async ({ name, template }) => {
    if (!name || !template) throw new Error('name and template are required');
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now();
    const templateDir = path.join(USER_TEMPLATES_DIR, slug);
    const elementsDir = path.join(templateDir, 'elements');
    fs.mkdirSync(templateDir, { recursive: true });
    fs.mkdirSync(elementsDir, { recursive: true });

    // Save element images; replace base64 src with file reference
    const savedElements = [];
    for (let i = 0; i < (template.elements || []).length; i++) {
      const { src, ...rest } = template.elements[i];
      if (src && src.startsWith('data:')) {
        const match = src.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          const ext = match[1].split('/')[1] || 'png';
          const filename = `el_${i}.${ext}`;
          fs.writeFileSync(path.join(elementsDir, filename), Buffer.from(match[2], 'base64'));
          savedElements.push({ ...rest, file: `elements/${filename}` });
        }
      } else {
        savedElements.push(rest);
      }
    }

    fs.writeFileSync(
      path.join(templateDir, 'template.json'),
      JSON.stringify({ name, ...template, elements: savedElements }, null, 2)
    );
    return { success: true, slug };
  },

  // Get full template with element images as base64 data URLs
  'template:get': async ({ slug }) => {
    const templateDir = path.join(USER_TEMPLATES_DIR, slug);
    const jsonPath = path.join(templateDir, 'template.json');
    if (!fs.existsSync(jsonPath)) throw new Error('Template not found');
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

    const elements = [];
    for (const el of (data.elements || [])) {
      if (el.file) {
        const imgPath = path.join(templateDir, el.file);
        if (fs.existsSync(imgPath)) {
          const ext = path.extname(imgPath).slice(1);
          const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
          const b64 = fs.readFileSync(imgPath).toString('base64');
          const { file, ...rest } = el;
          elements.push({ ...rest, src: `data:${mime};base64,${b64}` });
        }
      } else {
        elements.push(el);
      }
    }
    return { ...data, elements };
  },

  // Delete a user template
  'template:delete': async ({ slug }) => {
    const templateDir = path.join(USER_TEMPLATES_DIR, slug);
    if (fs.existsSync(templateDir)) {
      fs.rmSync(templateDir, { recursive: true, force: true });
    }
    return { success: true };
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

module.exports = { handlers, setBroadcast };
