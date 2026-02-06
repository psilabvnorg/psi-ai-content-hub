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

// NOTE: Fast TTS is now handled by tts-fast-server.py (Python REST API on port 8189)
// All TTS routes have been removed from this file.

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

  // SSE Progress endpoint (for video downloads)
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

  // Download video endpoint
  app.post("/api/download/video", async (req: Request, res: Response) => {
    const { url, platform, convert_to_h264 = false } = req.body;
    
    if (!url || !platform) {
      return res.status(400).json({ detail: "URL and platform are required" });
    }
    
    const downloadId = `download_${Date.now()}`;
    
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
      setTimeout(() => {
        try { fs.unlinkSync(filePath); } catch (e) {}
      }, 3600000);
    });
  });

  // Check yt-dlp version and status
  app.get("/api/tools/ytdlp/status", async (_req: Request, res: Response) => {
    try {
      const { stdout } = await execAsync("yt-dlp --version");
      res.json({ installed: true, version: stdout.trim() });
    } catch (error: any) {
      res.json({ installed: false, version: null, error: "yt-dlp not found." });
    }
  });

  // Check ffmpeg status
  app.get("/api/tools/ffmpeg/status", async (_req: Request, res: Response) => {
    try {
      const { stdout } = await execAsync("ffmpeg -version");
      const versionMatch = stdout.match(/ffmpeg version ([^\s]+)/);
      res.json({ installed: true, version: versionMatch ? versionMatch[1] : "unknown" });
    } catch (error: any) {
      res.json({ installed: false, version: null, error: "ffmpeg not found." });
    }
  });

  // Update yt-dlp
  app.post("/api/tools/ytdlp/update", async (_req: Request, res: Response) => {
    try {
      try {
        await execAsync("pip install -U yt-dlp", { timeout: 120000 });
        const { stdout: versionOut } = await execAsync("yt-dlp --version");
        return res.json({ success: true, message: "yt-dlp updated via pip", version: versionOut.trim() });
      } catch {
        // fallback
      }
      await execAsync("yt-dlp -U", { timeout: 120000 });
      const { stdout: versionOut } = await execAsync("yt-dlp --version");
      res.json({ success: true, message: "yt-dlp updated", version: versionOut.trim() });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || "Update failed" });
    }
  });

  // Install yt-dlp via pip
  app.post("/api/tools/ytdlp/install", async (_req: Request, res: Response) => {
    try {
      await execAsync("pip install yt-dlp", { timeout: 120000 });
      const { stdout: versionOut } = await execAsync("yt-dlp --version");
      res.json({ success: true, message: "yt-dlp installed", version: versionOut.trim() });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || "Installation failed." });
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

    progressStore.set(downloadId, {
      status: "downloading",
      message: "Starting download...",
      percent: "0%",
    });

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

    ytdlp.stdout.on("data", (data: Buffer) => {
      const output = data.toString();
      const progressMatch = output.match(/(\d+\.?\d*)%/);
      if (progressMatch) {
        progressStore.set(downloadId, {
          status: "downloading",
          percent: `${progressMatch[1]}%`,
          message: `Downloading: ${progressMatch[1]}%`,
        });
      }
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
        if (code === 0) resolve();
        else reject(new Error(`yt-dlp exited with code ${code}`));
      });
      ytdlp.on("error", reject);
    });

    progressStore.set(downloadId, { status: "processing", message: "Checking video codec..." });

    let videoCodec = "unknown";
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${tempDownload}"`
      );
      videoCodec = stdout.trim();
    } catch (e) {}

    let converted = false;

    if (convertToH264 && videoCodec !== "h264") {
      progressStore.set(downloadId, { status: "converting", message: `Converting ${videoCodec} to H.264...` });
      const ffmpegCmd = `ffmpeg -i "${tempDownload}" -c:v libx264 -crf 18 -preset medium -c:a copy -movflags +faststart -y "${outputFile}"`;
      await execAsync(ffmpegCmd);
      converted = true;
      try { fs.unlinkSync(tempDownload); } catch (e) {}
    } else {
      fs.renameSync(tempDownload, outputFile);
    }

    progressStore.set(downloadId, {
      status: "complete",
      message: "Download complete!",
      filePath: outputFile,
      filename: path.basename(outputFile),
      platform,
      title: videoTitle,
      codec: converted ? "h264" : videoCodec,
      originalCodec: videoCodec,
      converted,
    });
  } catch (error: any) {
    progressStore.set(downloadId, {
      status: "error",
      message: error.message,
    });
  }
}
