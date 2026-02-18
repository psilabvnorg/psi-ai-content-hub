A Multilingual Video Pipeline (multilingual-video-pipeline) — an automated system that downloads YouTube videos, transcribes them, translates the script into multiple languages, replaces visuals with sourced images, generates new narration audio, adds subtitles, and renders platform-ready output videos. Authored by PsiLab Technology.

Architecture: 9-Stage Sequential Pipeline
The core is in src/multilingual_video_pipeline/, with each stage implemented as a dedicated service:

#	Stage / Service	File	Purpose
1	Video Ingestion	video_ingestion.py	Downloads YouTube videos via yt-dlp, extracts audio and metadata. Supports channel fetching with date filters and rate limiting.
2	Transcription	transcription.py	Dual-model speech-to-text: PhoWhisper for Vietnamese, OpenAI Whisper / faster-whisper for other languages (EN, JA, DE). Produces word-level timestamps.
3	Translation	translation.py	Translates transcripts using Tencent HY-MT1.5-1.8B-FP8 model via HuggingFace Transformers. Includes quality scoring (fluency, accuracy, naturalness) and duration-ratio validation (±20%).
4	Visual Asset Manager	visual_asset_manager.py	Searches / downloads replacement images (Picsum, local placeholders), resizes and letterboxes them for target resolutions, and maps them to transcript scenes.
5	TTS (Text-to-Speech)	edge_tts_service.py + tts.py	Two TTS backends: Microsoft Edge TTS (neural voices, no reference audio needed, internet-required) and F5-TTS (local model with voice cloning via reference audio). Supports VI, JA, DE, EN.
6	Scene Assembler	scene_assembler.py	Creates one scene per transcript segment, aligns visuals with audio timing. Supports transitions (fade, crossfade, dissolve, wipe) and Ken Burns effect for static images.
7	Subtitle Generator	subtitle_generator.py	Generates time-synced subtitles from audio via Whisper word-level timing. Exports to .srt format with configurable styling (font, outline, positioning).
8	Video Renderer	video_renderer.py	Combines scenes, audio, and subtitles into final video using MoviePy + FFmpeg. Supports H.264 (GPU h264_nvenc or CPU libx264), two-pass encoding, and multi-resolution (1080p horizontal/vertical).
9	Export Manager	export_manager.py	Platform-specific packaging for YouTube, TikTok, and Facebook. Generates metadata JSON, creates thumbnails, and organizes export bundles.
Additional services:

remotion_renderer.py — Alternative rendering via Remotion (Node.js subprocess bridge).
validation_service.py — Quality checks: resolution ≥ 1080p, audio levels (-20 to -12 LUFS), subtitle sync (≤100ms drift), format completeness.
Orchestration
pipeline.py (~1316 lines) — The MultilingualVideoPipeline class initializes all 9+ services, manages job submission/processing, checkpoint persistence, and progress callbacks.
job_orchestrator.py — Lower-level job management with retry logic (exponential backoff), JSON-based state persistence, and crash recovery/resume.
run_pipeline_english.py — CLI entry point to process a single YouTube URL into English output.
Data Models
models.py (~711 lines) defines rich dataclasses with validation:

VideoMetadata, TranscriptSegment, Transcript, TranslatedScript, Scene, VisualAsset, Job, OutputFormat, ProcessingMetrics
Full JSON serialization/deserialization, file I/O, and chronological ordering validation.
Configuration
config.py — Pydantic BaseSettings with .env support. Key settings:

Paths to local ML models (PhoWhisper, HY-MT, F5-TTS checkpoints)
Transcription/translation/TTS device selection (auto/cuda/cpu)
Video codec (h264_nvenc for GPU), bitrate, sample rate
Rate limiting for YouTube and image downloads
Target languages defaulting to ['vi', 'ja', 'de', 'en']
Key Dependencies
yt-dlp, openai-whisper, faster-whisper, moviepy, ffmpeg-python, Pillow, edge-tts, f5-tts, transformers + torch, pydantic, structlog, redis, pyloudnorm, librosa, hypothesis (property-based testing)

Testing
16 test files in tests/ covering every service: unit tests, property-based tests (Hypothesis), integration tests, and Remotion integration tests. Configured via pytest.ini with markers for unit, integration, property, slow, gpu, external.

Scripts
Standalone utility scripts in scripts/:

F5-TTS voice sample generation
Translation service manual testing
KeyBERT keyword extraction
Semantic image search
Data Layout
data/ contains pre-organized subdirectories: audio/, images/, subtitles/, transcripts/, translations/, videos/, voice_refs/ — used as intermediate storage across pipeline stages.