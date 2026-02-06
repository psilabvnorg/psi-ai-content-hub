import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { spawn, exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import multer from "multer";

const execAsync = promisify(exec);

// Temp directory for downloads
const TEMP_DIR = path.join(os.tmpdir(), "psi_ai_content_hub");

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Progress tracking for downloads
const progressStore: Map<string, any> = new Map();
const ttsProgressStore: Map<string, any> = new Map();

// Configure multer for file uploads
const upload = multer({
  dest: TEMP_DIR,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
});

// Helper: Generate unique filename
function generateFilename(prefix: string, extension: string): string {
  const timestamp = Date.now();
  return path.join(TEMP_DIR, `${prefix}_${timestamp}.${extension}`);
}

// Helper: Cleanup old files (older than 1 hour)
function cleanupOldFiles() {
  const currentTime = Date.now();
  const files = fs.readdirSync(TEMP_DIR);
  
  for (const file of files) {
    const filePath = path.join(TEMP_DIR, file);
    try {
      const stats = fs.statSync(filePath);
      if (currentTime - stats.mtimeMs > 3600000) {
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      // Ignore errors
    }
  }
}

// Run cleanup on startup
cleanupOldFiles();

// TTS setup paths (Ollama-style: download on-demand)
const APP_DATA = process.env.APPDATA || path.join(os.homedir(), ".config");
const TTS_ROOT = process.env.VIE_NEU_TTS_ROOT
  ? path.resolve(process.env.VIE_NEU_TTS_ROOT)
  : path.join(APP_DATA, "psi-ai-content-hub", "vie-neu-tts");
const TTS_MARKER = path.join(TTS_ROOT, "tts_ready.json");
const TTS_RUNNER = fs.existsSync(path.join(process.cwd(), "electron", "tts-runner.mjs"))
  ? path.join(process.cwd(), "electron", "tts-runner.mjs")
  : path.join(process.cwd(), "tts-runner.mjs");
const NODE_BIN = process.execPath;

async function runFastTts(payload: Record<string, any>, onProgress?: (progress: any) => void) {
  if (!fs.existsSync(TTS_RUNNER)) {
    throw new Error(`TTS runner not found at ${TTS_RUNNER}`);
  }

  return new Promise<Record<string, any>>((resolve, reject) => {
    const proc = spawn(NODE_BIN, [TTS_RUNNER], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        VIE_NEU_TTS_ROOT: TTS_ROOT,
      },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;
      
      // Try to parse progress JSON from stderr
      const lines = chunk.split('\n').filter(line => line.trim());
      for (const line of lines) {
        try {
          const progress = JSON.parse(line);
          if (progress.type === 'progress' && onProgress) {
            onProgress(progress);
          }
        } catch (e) {
          // Not JSON, regular stderr
        }
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(stderr || "TTS process failed"));
      }
      try {
        // Parse only the last line of stdout (final JSON result)
        const lines = stdout.trim().split('\n').filter(line => line.trim());
        const lastLine = lines[lines.length - 1];
        if (!lastLine) {
          return reject(new Error('No output from TTS process'));
        }
        const result = JSON.parse(lastLine);
        if (result.status !== "success") {
          return reject(new Error(result.detail || "TTS process failed"));
        }
        resolve(result);
      } catch (err: any) {
        reject(new Error(`Failed to parse TTS output: ${err.message}`));
      }
    });

    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
  });
}

// Background task for TTS generation
async function runTtsFastTask(ttsId: string, text: string, options: Record<string, any> = {}) {
  console.log('[TTS Task] Starting background TTS generation');
  console.log('[TTS Task] TTS ID:', ttsId);
  console.log('[TTS Task] Text length:', text.length);
  try {
    const outputFile = generateFilename("tts_fast", "wav");
    console.log('[TTS Task] Output file:', outputFile);

    const onProgress = (progress: any) => {
      const progressData = {
        status: progress.stage,
        message: progress.message,
        percent: progress.percent || 0,
      };
      console.log('[TTS Task] Progress update:', progressData);
      ttsProgressStore.set(ttsId, progressData);
    };

    const result = await runFastTts({
      text,
      voice_id: options.voice_id,
      backbone: options.backbone,
      codec: options.codec,
      device: options.device,
      output_path: outputFile,
    }, onProgress);

    const completeData = {
      status: "complete",
      message: "Audio generation complete!",
      percent: 100,
      filePath: outputFile,
      filename: path.basename(outputFile),
      downloadUrl: `/api/files/${path.basename(outputFile)}`,
      duration: result.duration,
      sampleRate: result.sample_rate,
      processTime: result.process_time,
    };

    console.log('[TTS Task] Generation complete:', completeData);
    ttsProgressStore.set(ttsId, completeData);
  } catch (error: any) {
    console.error('[TTS Task] Generation failed:', error);
    const errorData = {
      status: "error",
      message: error.message || "TTS generation failed",
      percent: 0,
    };
    ttsProgressStore.set(ttsId, errorData);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Health check
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
    });
  });

  // Root endpoint
  app.get("/api", (_req: Request, res: Response) => {
    res.json({
      service: "AI Content Hub API",
      version: "1.0.0",
      status: "running",
    });
  });

  // SSE Progress endpoint
  app.get("/api/progress/:downloadId", (req: Request, res: Response) => {
    const downloadId = req.params.downloadId as string;
    
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    
    const sendProgress = () => {
      const progress = progressStore.get(downloadId);
      if (progress) {
        res.write(`data: ${JSON.stringify(progress)}\n\n`);
        
        if (progress.status === "complete" || progress.status === "error") {
          setTimeout(() => {
            progressStore.delete(downloadId);
          }, 5000);
          res.end();
          return;
        }
      } else {
        res.write(`data: ${JSON.stringify({ status: "waiting", message: "Waiting for download to start..." })}\n\n`);
      }
    };
    
    const interval = setInterval(sendProgress, 500);
    sendProgress();
    
    req.on("close", () => {
      clearInterval(interval);
    });
  });

  // SSE TTS Progress endpoint
  app.get("/api/tts/progress/:ttsId", (req: Request, res: Response) => {
    const ttsId = req.params.ttsId as string;
    
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    
    const sendProgress = () => {
      const progress = ttsProgressStore.get(ttsId);
      if (progress) {
        res.write(`data: ${JSON.stringify(progress)}\n\n`);
        
        if (progress.status === "complete" || progress.status === "error") {
          setTimeout(() => {
            ttsProgressStore.delete(ttsId);
          }, 5000);
          res.end();
          return;
        }
      } else {
        res.write(`data: ${JSON.stringify({ status: "waiting", message: "Initializing...", percent: 0 })}\n\n`);
      }
    };
    
    const interval = setInterval(sendProgress, 300);
    sendProgress();
    
    req.on("close", () => {
      clearInterval(interval);
    });
  });

  // Download video endpoint
  app.post("/api/download/video", async (req: Request, res: Response) => {
    const { url, platform, convert_to_h264 = false } = req.body;
    
    if (!url || !platform) {
      return res.status(400).json({ detail: "URL and platform are required" });
    }
    
    const downloadId = `download_${Date.now()}`;
    
    console.log(`=== Starting video download ===`);
    console.log(`Download ID: ${downloadId}`);
    console.log(`URL: ${url}`);
    console.log(`Platform: ${platform}`);
    console.log(`Convert to H.264: ${convert_to_h264}`);
    
    progressStore.set(downloadId, {
      status: "starting",
      message: "Initializing download...",
    });
    
    // Start download in background
    downloadVideoTask(downloadId, url, platform, convert_to_h264);
    
    res.json({
      status: "started",
      download_id: downloadId,
      message: "Download started. Use /api/progress/{download_id} to track progress.",
    });
  });

  // Extract audio from video path
  app.post("/api/extract/audio", async (req: Request, res: Response) => {
    try {
      const { video_path, format = "mp3" } = req.body;
      
      if (!video_path) {
        return res.status(400).json({ detail: "video_path is required" });
      }
      
      if (!fs.existsSync(video_path)) {
        return res.status(404).json({ detail: "Video file not found" });
      }
      
      const outputFile = generateFilename("extracted_audio", format);
      const codec = format === "mp3" ? "libmp3lame" : "pcm_s16le";
      
      const cmd = `ffmpeg -i "${video_path}" -vn -acodec ${codec} -ar 44100 -ac 2 -y "${outputFile}"`;
      
      await execAsync(cmd);
      
      res.json({
        status: "success",
        file_path: outputFile,
        filename: path.basename(outputFile),
        format,
        download_url: `/api/files/${path.basename(outputFile)}`,
      });
    } catch (error: any) {
      console.error("Audio extraction failed:", error);
      res.status(500).json({ detail: `Audio extraction failed: ${error.message}` });
    }
  });

  // Extract audio from uploaded file
  app.post("/api/extract/audio/upload", upload.single("file"), async (req: Request, res: Response) => {
    try {
      const file = req.file;
      const format = (req.body.format || "mp3") as string;
      
      if (!file) {
        return res.status(400).json({ detail: "No file uploaded" });
      }
      
      if (!["mp3", "wav"].includes(format)) {
        return res.status(400).json({ detail: "Format must be mp3 or wav" });
      }
      
      const videoFile = file.path;
      const outputFile = generateFilename("extracted_audio", format);
      const codec = format === "mp3" ? "libmp3lame" : "pcm_s16le";
      
      const cmd = `ffmpeg -i "${videoFile}" -vn -acodec ${codec} -ar 44100 -ac 2 -y "${outputFile}"`;
      
      console.log(`Running ffmpeg: ${cmd}`);
      await execAsync(cmd);
      
      // Cleanup uploaded file
      try { fs.unlinkSync(videoFile); } catch (e) {}
      
      res.json({
        status: "success",
        file_path: outputFile,
        filename: path.basename(outputFile),
        format,
        download_url: `/api/files/${path.basename(outputFile)}`,
      });
    } catch (error: any) {
      console.error("Audio extraction failed:", error);
      res.status(500).json({ detail: `Audio extraction failed: ${error.message}` });
    }
  });

  // Convert audio format
  app.post("/api/convert/audio", async (req: Request, res: Response) => {
    try {
      const { audio_path, output_format } = req.body;
      
      if (!audio_path || !output_format) {
        return res.status(400).json({ detail: "audio_path and output_format are required" });
      }
      
      if (!fs.existsSync(audio_path)) {
        return res.status(404).json({ detail: "Audio file not found" });
      }
      
      const outputFile = generateFilename("converted_audio", output_format);
      const codec = output_format === "mp3" ? "libmp3lame" : "pcm_s16le";
      
      const cmd = `ffmpeg -i "${audio_path}" -acodec ${codec} -y "${outputFile}"`;
      
      await execAsync(cmd);
      
      res.json({
        status: "success",
        file_path: outputFile,
        filename: path.basename(outputFile),
        format: output_format,
        download_url: `/api/files/${path.basename(outputFile)}`,
      });
    } catch (error: any) {
      console.error("Audio conversion failed:", error);
      res.status(500).json({ detail: `Audio conversion failed: ${error.message}` });
    }
  });

  // Super Fast TTS
  app.post("/api/tts/fast", async (req: Request, res: Response) => {
    try {
      const { text, voice_id, backbone, codec, device } = req.body || {};

      if (!text || !String(text).trim()) {
        return res.status(400).json({ detail: "text is required" });
      }

      if (!fs.existsSync(TTS_MARKER)) {
        return res.status(412).json({ detail: "TTS_NOT_INSTALLED" });
      }

      const outputFile = generateFilename("tts_fast", "wav");

      const result = await runFastTts({
        text,
        voice_id,
        backbone,
        codec,
        device,
        output_path: outputFile,
      });

      res.json({
        status: "success",
        file_path: outputFile,
        filename: path.basename(outputFile),
        download_url: `/api/files/${path.basename(outputFile)}`,
        duration: result.duration,
        sample_rate: result.sample_rate,
        process_time: result.process_time,
        voice_id: result.voice_id,
        backbone: result.backbone,
        codec: result.codec,
      });
    } catch (error: any) {
      console.error("TTS failed:", error);
      res.status(500).json({ detail: `TTS failed: ${error.message}` });
    }
  });

  // TTS Fast with Progress - starts in background
  app.post("/api/tts/fast/progress", async (req: Request, res: Response) => {
    console.log('[API] POST /api/tts/fast/progress called');
    try {
      const { text, voice_id, backbone, codec, device } = req.body || {};
      console.log('[API] Text length:', text?.length);

      if (!text || !String(text).trim()) {
        return res.status(400).json({ detail: "text is required" });
      }

      if (!fs.existsSync(TTS_MARKER)) {
        return res.status(412).json({ detail: "TTS_NOT_INSTALLED" });
      }

      const ttsId = `tts_${Date.now()}`;
      console.log('[API] Created TTS ID:', ttsId);
      
      ttsProgressStore.set(ttsId, {
        status: "starting",
        message: "Initializing TTS...",
        percent: 0,
      });

      // Start TTS generation in background
      runTtsFastTask(ttsId, text, { voice_id, backbone, codec, device });

      res.json({
        status: "started",
        tts_id: ttsId,
        message: "TTS generation started. Use /api/tts/progress/{tts_id} to track progress.",
      });
    } catch (error: any) {
      console.error("TTS start failed:", error);
      res.status(500).json({ detail: `TTS start failed: ${error.message}` });
    }
  });

  // TTS Status Check
  app.get("/api/tts/status", (req: Request, res: Response) => {
    try {
      const ttsInstalled = fs.existsSync(TTS_MARKER);
      res.json({
        ready: ttsInstalled,
        ttsInstalled,
        runnerExists: true, // Web mode always has runner
        modelsExist: ttsInstalled,
        ttsPath: TTS_ROOT,
      });
    } catch (error: any) {
      console.error("Failed to check TTS status:", error);
      res.status(500).json({ detail: "Failed to check TTS status" });
    }
  });

  // TTS Setup - Download models
  app.post("/api/tts/setup", async (req: Request, res: Response) => {
    try {
      const { forceReinstall } = req.body || {};
      
      if (!fs.existsSync(TTS_RUNNER)) {
        return res.status(400).json({ detail: "TTS runner is missing. Please reinstall the app." });
      }

      if (forceReinstall && fs.existsSync(TTS_ROOT)) {
        fs.rmSync(TTS_ROOT, { recursive: true, force: true });
      }

      // Start TTS download in background
      const { spawn } = await import('child_process');
      const proc = spawn(NODE_BIN, [TTS_RUNNER, '--download'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, VIE_NEU_TTS_ROOT: TTS_ROOT }
      });

      let stderr = '';
      let isComplete = false;

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        isComplete = true;
        if (code !== 0) {
          console.error('TTS setup failed:', stderr);
        }
      });

      // Wait for process to complete (with timeout of 30 minutes)
      const startTime = Date.now();
      const timeout = 30 * 60 * 1000; // 30 minutes
      
      const checkCompletion = () => {
        return new Promise((resolve) => {
          const interval = setInterval(() => {
            if (isComplete) {
              clearInterval(interval);
              resolve(null);
            }
            if (Date.now() - startTime > timeout) {
              clearInterval(interval);
              proc.kill();
              resolve(null);
            }
          }, 1000);
        });
      };

      await checkCompletion();

      if (stderr) {
        return res.status(500).json({ detail: `TTS setup failed: ${stderr}` });
      }

      res.json({
        success: true,
        message: "TTS models downloaded successfully",
        ttsPath: TTS_ROOT,
      });
    } catch (error: any) {
      console.error("TTS setup failed:", error);
      res.status(500).json({ detail: `TTS setup failed: ${error.message}` });
    }
  });

  // Trim video from path
  app.post("/api/trim/video", async (req: Request, res: Response) => {
    try {
      const { video_path, start_time, end_time, duration } = req.body;
      
      if (!video_path || !start_time) {
        return res.status(400).json({ detail: "video_path and start_time are required" });
      }
      
      if (!fs.existsSync(video_path)) {
        return res.status(404).json({ detail: "Video file not found" });
      }
      
      const outputFile = generateFilename("trimmed_video", "mp4");
      
      let cmd = `ffmpeg -i "${video_path}" -ss ${start_time}`;
      if (end_time) cmd += ` -to ${end_time}`;
      else if (duration) cmd += ` -t ${duration}`;
      cmd += ` -c copy "${outputFile}" -y`;
      
      await execAsync(cmd);
      
      res.json({
        status: "success",
        file_path: outputFile,
        filename: path.basename(outputFile),
        download_url: `/api/files/${path.basename(outputFile)}`,
      });
    } catch (error: any) {
      console.error("Video trimming failed:", error);
      res.status(500).json({ detail: `Video trimming failed: ${error.message}` });
    }
  });

  // Trim video from upload
  app.post("/api/trim/video/upload", upload.single("file"), async (req: Request, res: Response) => {
    try {
      const file = req.file;
      const { start_time, end_time } = req.body;
      
      if (!file) {
        return res.status(400).json({ detail: "No file uploaded" });
      }
      
      if (!start_time) {
        return res.status(400).json({ detail: "start_time is required" });
      }
      
      const videoFile = file.path;
      const outputFile = generateFilename("trimmed_video", "mp4");
      
      let cmd = `ffmpeg -i "${videoFile}" -ss ${start_time}`;
      if (end_time) cmd += ` -to ${end_time}`;
      cmd += ` -c copy "${outputFile}" -y`;
      
      console.log(`Running ffmpeg: ${cmd}`);
      await execAsync(cmd);
      
      // Cleanup uploaded file
      try { fs.unlinkSync(videoFile); } catch (e) {}
      
      res.json({
        status: "success",
        file_path: outputFile,
        filename: path.basename(outputFile),
        download_url: `/api/files/${path.basename(outputFile)}`,
      });
    } catch (error: any) {
      console.error("Video trimming failed:", error);
      res.status(500).json({ detail: `Video trimming failed: ${error.message}` });
    }
  });

  // Adjust video speed from path
  app.post("/api/adjust/speed", async (req: Request, res: Response) => {
    try {
      const { video_path, speed } = req.body;
      
      if (!video_path || speed === undefined) {
        return res.status(400).json({ detail: "video_path and speed are required" });
      }
      
      if (speed < 0.5 || speed > 2.0) {
        return res.status(400).json({ detail: "Speed must be between 0.5 and 2.0" });
      }
      
      if (!fs.existsSync(video_path)) {
        return res.status(404).json({ detail: "Video file not found" });
      }
      
      const outputFile = generateFilename("speed_adjusted", "mp4");
      const ptsMultiplier = 1.0 / speed;
      
      const cmd = `ffmpeg -i "${video_path}" -filter:v "setpts=${ptsMultiplier}*PTS" -filter:a "atempo=${speed}" "${outputFile}" -y`;
      
      await execAsync(cmd);
      
      res.json({
        status: "success",
        file_path: outputFile,
        filename: path.basename(outputFile),
        speed,
        download_url: `/api/files/${path.basename(outputFile)}`,
      });
    } catch (error: any) {
      console.error("Speed adjustment failed:", error);
      res.status(500).json({ detail: `Speed adjustment failed: ${error.message}` });
    }
  });

  // Adjust video speed from upload
  app.post("/api/adjust/speed/upload", upload.single("file"), async (req: Request, res: Response) => {
    try {
      const file = req.file;
      const speed = parseFloat(req.body.speed);
      
      if (!file) {
        return res.status(400).json({ detail: "No file uploaded" });
      }
      
      if (isNaN(speed) || speed < 0.5 || speed > 2.0) {
        return res.status(400).json({ detail: "Speed must be between 0.5 and 2.0" });
      }
      
      const videoFile = file.path;
      const outputFile = generateFilename("speed_adjusted", "mp4");
      const ptsMultiplier = 1.0 / speed;
      
      const cmd = `ffmpeg -i "${videoFile}" -filter:v "setpts=${ptsMultiplier}*PTS" -filter:a "atempo=${speed}" "${outputFile}" -y`;
      
      console.log(`Running ffmpeg: ${cmd}`);
      await execAsync(cmd);
      
      // Cleanup uploaded file
      try { fs.unlinkSync(videoFile); } catch (e) {}
      
      res.json({
        status: "success",
        file_path: outputFile,
        filename: path.basename(outputFile),
        speed,
        download_url: `/api/files/${path.basename(outputFile)}`,
      });
    } catch (error: any) {
      console.error("Speed adjustment failed:", error);
      res.status(500).json({ detail: `Speed adjustment failed: ${error.message}` });
    }
  });

  // Cleanup temp files
  app.post("/api/cleanup", async (_req: Request, res: Response) => {
    try {
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
        } catch (e) {
          console.warn(`Failed to delete ${filePath}`);
        }
      }
      
      const freedMb = Math.round((totalSize / (1024 * 1024)) * 100) / 100;
      
      res.json({
        status: "success",
        deleted_count: deletedCount,
        freed_space_mb: freedMb,
        message: `Deleted ${deletedCount} files, freed ${freedMb} MB`,
      });
    } catch (error: any) {
      console.error("Cleanup failed:", error);
      res.status(500).json({ detail: `Cleanup failed: ${error.message}` });
    }
  });

  // Storage info
  app.get("/api/storage/info", async (_req: Request, res: Response) => {
    try {
      let fileCount = 0;
      let totalSize = 0;
      const filesInfo: any[] = [];
      
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
      
      // Sort by modified time, newest first
      filesInfo.sort((a, b) => b.modified - a.modified);
      
      res.json({
        temp_dir: TEMP_DIR,
        file_count: fileCount,
        total_size_mb: Math.round((totalSize / (1024 * 1024)) * 100) / 100,
        files: filesInfo.slice(0, 10),
      });
    } catch (error: any) {
      console.error("Failed to get storage info:", error);
      res.status(500).json({ detail: `Failed to get storage info: ${error.message}` });
    }
  });

  // File download endpoint
  app.get("/api/files/:filename", (req: Request, res: Response) => {
    const filename = req.params.filename as string;
    const filePath = path.join(TEMP_DIR, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ detail: "File not found" });
    }
    
    res.download(filePath, filename, (err) => {
      if (err) {
        console.error("Download error:", err);
      }
      // Schedule cleanup after 1 hour
      setTimeout(() => {
        try { fs.unlinkSync(filePath); } catch (e) {}
      }, 3600000);
    });
  });

  // Check yt-dlp version and status
  app.get("/api/tools/ytdlp/status", async (_req: Request, res: Response) => {
    try {
      const { stdout, stderr } = await execAsync("yt-dlp --version");
      const version = stdout.trim();
      
      res.json({
        installed: true,
        version,
        path: "yt-dlp", // Could use 'where yt-dlp' on Windows to get full path
      });
    } catch (error: any) {
      res.json({
        installed: false,
        version: null,
        error: "yt-dlp not found. Please install it.",
      });
    }
  });

  // Check ffmpeg status
  app.get("/api/tools/ffmpeg/status", async (_req: Request, res: Response) => {
    try {
      const { stdout } = await execAsync("ffmpeg -version");
      const versionMatch = stdout.match(/ffmpeg version ([^\s]+)/);
      const version = versionMatch ? versionMatch[1] : "unknown";
      
      res.json({
        installed: true,
        version,
      });
    } catch (error: any) {
      res.json({
        installed: false,
        version: null,
        error: "ffmpeg not found. Please install it.",
      });
    }
  });

  // Update yt-dlp
  app.post("/api/tools/ytdlp/update", async (_req: Request, res: Response) => {
    try {
      console.log("Updating yt-dlp...");
      
      // Try pip update first (most common on Windows)
      try {
        const { stdout, stderr } = await execAsync("pip install -U yt-dlp", { timeout: 120000 });
        console.log("pip update output:", stdout);
        
        // Get new version
        const { stdout: versionOut } = await execAsync("yt-dlp --version");
        
        res.json({
          success: true,
          message: "yt-dlp updated successfully via pip",
          version: versionOut.trim(),
        });
        return;
      } catch (pipError: any) {
        console.log("pip update failed, trying yt-dlp -U...");
      }
      
      // Try yt-dlp self-update
      try {
        const { stdout } = await execAsync("yt-dlp -U", { timeout: 120000 });
        
        // Get new version
        const { stdout: versionOut } = await execAsync("yt-dlp --version");
        
        res.json({
          success: true,
          message: "yt-dlp updated successfully",
          version: versionOut.trim(),
        });
        return;
      } catch (selfUpdateError: any) {
        throw new Error("Update failed. Try manually: pip install -U yt-dlp");
      }
      
    } catch (error: any) {
      console.error("yt-dlp update failed:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Update failed",
      });
    }
  });

  // Install yt-dlp via pip
  app.post("/api/tools/ytdlp/install", async (_req: Request, res: Response) => {
    try {
      console.log("Installing yt-dlp...");
      
      const { stdout, stderr } = await execAsync("pip install yt-dlp", { timeout: 120000 });
      console.log("Install output:", stdout);
      
      // Verify installation
      const { stdout: versionOut } = await execAsync("yt-dlp --version");
      
      res.json({
        success: true,
        message: "yt-dlp installed successfully",
        version: versionOut.trim(),
      });
    } catch (error: any) {
      console.error("yt-dlp install failed:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Installation failed. Make sure Python/pip is installed.",
      });
    }
  });

  return httpServer;
}


// Background task for video download using yt-dlp
async function downloadVideoTask(
  downloadId: string,
  url: string,
  platform: string,
  convertToH264: boolean = false
) {
  try {
    const tempDownload = generateFilename(`${platform}_temp`, "mp4");
    const outputFile = generateFilename(`${platform}_video`, "mp4");
    
    console.log(`Temp file: ${tempDownload}`);
    console.log(`Output file: ${outputFile}`);
    
    progressStore.set(downloadId, {
      status: "downloading",
      message: "Starting download...",
      percent: "0%",
    });
    
    // Use yt-dlp CLI
    const ytdlpArgs = [
      "-f", "bestvideo[vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
      "-o", tempDownload,
      "--merge-output-format", "mp4",
      "--no-warnings",
      "--progress",
      "--newline",
      url,
    ];
    
    const ytdlp = spawn("yt-dlp", ytdlpArgs);
    
    let videoTitle = "Unknown";
    let videoDuration = 0;
    
    ytdlp.stdout.on("data", (data: Buffer) => {
      const output = data.toString();
      console.log(`yt-dlp: ${output}`);
      
      // Parse progress from yt-dlp output
      const progressMatch = output.match(/(\d+\.?\d*)%/);
      if (progressMatch) {
        progressStore.set(downloadId, {
          status: "downloading",
          percent: `${progressMatch[1]}%`,
          message: `Downloading: ${progressMatch[1]}%`,
        });
      }
      
      // Parse title
      const titleMatch = output.match(/\[download\] Destination: (.+)/);
      if (titleMatch) {
        videoTitle = path.basename(titleMatch[1], path.extname(titleMatch[1]));
      }
    });
    
    ytdlp.stderr.on("data", (data: Buffer) => {
      console.error(`yt-dlp stderr: ${data.toString()}`);
    });
    
    await new Promise<void>((resolve, reject) => {
      ytdlp.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`yt-dlp exited with code ${code}`));
        }
      });
      
      ytdlp.on("error", (err) => {
        reject(err);
      });
    });
    
    console.log("Download complete, checking codec...");
    progressStore.set(downloadId, {
      status: "processing",
      message: "Checking video codec...",
    });
    
    // Check video codec using ffprobe
    let videoCodec = "unknown";
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${tempDownload}"`
      );
      videoCodec = stdout.trim();
      console.log(`Video codec: ${videoCodec}`);
    } catch (e) {
      console.warn("Could not detect codec:", e);
    }
    
    let converted = false;
    
    // Convert to H.264 if requested and not already H.264
    if (convertToH264 && videoCodec !== "h264") {
      console.log(`Converting ${videoCodec} to H.264...`);
      progressStore.set(downloadId, {
        status: "converting",
        message: `Converting ${videoCodec} to H.264...`,
      });
      
      const ffmpegCmd = `ffmpeg -i "${tempDownload}" -c:v libx264 -crf 18 -preset medium -c:a copy -movflags +faststart -y "${outputFile}"`;
      
      await execAsync(ffmpegCmd);
      converted = true;
      
      // Cleanup temp file
      try { fs.unlinkSync(tempDownload); } catch (e) {}
    } else {
      // Just rename the file
      if (convertToH264 && videoCodec === "h264") {
        console.log("Video is already H.264, no conversion needed");
      } else {
        console.log("Keeping original codec (conversion not requested)");
      }
      
      fs.renameSync(tempDownload, outputFile);
    }
    
    // Mark as complete
    progressStore.set(downloadId, {
      status: "complete",
      message: "Download complete!",
      file_path: outputFile,
      filename: path.basename(outputFile),
      platform,
      title: videoTitle,
      duration: videoDuration,
      download_url: `/api/files/${path.basename(outputFile)}`,
      codec: converted ? "h264" : videoCodec,
      original_codec: videoCodec,
      converted,
    });
    
    console.log("=== Video download successful ===");
    
  } catch (error: any) {
    console.error("=== Video download failed ===");
    console.error(`Error: ${error.message}`);
    
    let errorMsg = error.message;
    
    // Provide helpful error messages
    if (errorMsg.includes("bot") || errorMsg.includes("sign in")) {
      errorMsg = "YouTube bot detection error. Try a different video or use the Upload File button.";
    } else if (errorMsg.includes("private") || errorMsg.includes("unavailable")) {
      errorMsg = "Video is private or unavailable.";
    }
    
    progressStore.set(downloadId, {
      status: "error",
      message: errorMsg,
    });
  }
}
