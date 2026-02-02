from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.requests import Request
from pydantic import BaseModel, Field
from typing import Optional, Literal, Dict, Any
import uvicorn
import os
import sys
import tempfile
import base64
import time
import torch
import numpy as np
import soundfile as sf
import yaml
import gc
from functools import lru_cache

# Add parent directory to path to import VieNeu-TTS modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vieneu_tts import VieNeuTTS, FastVieNeuTTS
from utils.core_utils import split_text_into_chunks

app = FastAPI(title="VieNeu-TTS Web API", version="1.0.0")

# Get current directory
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))

# Mount static files
app.mount("/static", StaticFiles(directory=os.path.join(CURRENT_DIR, "static")), name="static")

# Templates
templates = Jinja2Templates(directory=os.path.join(CURRENT_DIR, "templates"))

# --- CONFIGURATION ---
CONFIG_PATH = os.path.join(os.path.dirname(CURRENT_DIR), "config.yaml")
try:
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        _config = yaml.safe_load(f) or {}
except Exception as e:
    print(f"Warning: Cannot read config.yaml: {e}")
    _config = {}

BACKBONE_CONFIGS = _config.get("backbone_configs", {})
CODEC_CONFIGS = _config.get("codec_configs", {})
VOICE_SAMPLES = _config.get("voice_samples", {})

_text_settings = _config.get("text_settings", {})
MAX_CHARS_PER_CHUNK = _text_settings.get("max_chars_per_chunk", 256)
MAX_TOTAL_CHARS_STANDARD = 500
MAX_TOTAL_CHARS_STREAMING = _text_settings.get("max_total_chars_streaming", 3000)

# Global model state
tts = None
current_backbone = None
current_codec = None
current_device = None
model_loaded = False
using_lmdeploy = False

# Temporary files storage
TEMP_AUDIO_DIR = tempfile.mkdtemp(prefix="vieneu_audio_")

# Cache for reference texts
@lru_cache(maxsize=32)
def get_ref_text_cached(text_path: str) -> str:
    """Cache reference text loading"""
    with open(text_path, "r", encoding="utf-8") as f:
        return f.read()

def cleanup_gpu_memory():
    """Cleanup GPU memory"""
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.synchronize()
    gc.collect()

def should_use_lmdeploy(backbone_choice: str, device_choice: str) -> bool:
    """Determine if we should use LMDeploy backend"""
    if "gguf" in backbone_choice.lower():
        return False
    
    if device_choice.lower() == "auto":
        has_gpu = torch.cuda.is_available()
    elif device_choice.lower() == "cuda":
        has_gpu = torch.cuda.is_available()
    else:
        has_gpu = False
    
    return has_gpu


# --- PYDANTIC MODELS ---
class ModelLoadRequest(BaseModel):
    backbone: str = Field(..., description="Backbone model choice")
    codec: str = Field(..., description="Codec model choice")
    device: Literal["auto", "cpu", "cuda"] = Field(default="auto", description="Device selection")
    enable_triton: bool = Field(default=True, description="Enable Triton compilation")
    max_batch_size: int = Field(default=8, ge=1, le=16, description="Maximum batch size for processing")


class TTSRequest(BaseModel):
    text: str = Field(..., description="Text to synthesize", max_length=3000)
    mode: Literal["preset", "custom"] = Field(..., description="Generation mode")
    voice_id: Optional[str] = Field(None, description="Preset voice ID (required for preset mode)")
    sample_voice_id: Optional[str] = Field(None, description="Sample voice ID from static/sample_voice (for custom mode)")
    sample_text_id: Optional[str] = Field(None, description="Sample text ID from static/sample_text (for custom mode)")
    reference_audio: Optional[str] = Field(None, description="Base64 encoded audio (for custom mode with upload)")
    reference_text: Optional[str] = Field(None, description="Reference audio transcription (for custom mode with upload)")
    language: str = Field(default="vi", description="Language code")
    generation_mode: Literal["standard", "streaming"] = Field(default="standard", description="Generation mode")
    use_batch: bool = Field(default=True, description="Enable batch processing")


class VoiceInfo(BaseModel):
    id: str
    name: str
    description: str
    region: Optional[str] = None
    gender: Optional[str] = None
    audio_sample: Optional[str] = None


# Voice metadata mapping
VOICE_METADATA = {
    "binh": {"region": "north", "gender": "male"},
    "doan": {"region": "south", "gender": "female"},
    "dung": {"region": "south", "gender": "female"},
    "huong": {"region": "north", "gender": "female"},
    "ly": {"region": "north", "gender": "female"},
    "ngoc": {"region": "north", "gender": "female"},
    "nguyen": {"region": "south", "gender": "male"},
    "son": {"region": "south", "gender": "male"},
    "tuyen": {"region": "north", "gender": "male"},
    "vinh": {"region": "south", "gender": "male"},
}

# Voice descriptions
VOICES = [
    {
        "id": "binh",
        "name": "Bình",
        "description": {"vi": "Nam miền Bắc", "en": "Northern Male"},
    },
    {
        "id": "doan",
        "name": "Đoan",
        "description": {"vi": "Nữ miền Nam", "en": "Southern Female"},
    },
    {
        "id": "dung",
        "name": "Dung",
        "description": {"vi": "Nữ miền Nam", "en": "Southern Female"},
    },
    {
        "id": "huong",
        "name": "Hương",
        "description": {"vi": "Nữ miền Bắc", "en": "Northern Female"},
    },
    {
        "id": "ly",
        "name": "Ly",
        "description": {"vi": "Nữ miền Bắc", "en": "Northern Female"},
    },
    {
        "id": "ngoc",
        "name": "Ngọc",
        "description": {"vi": "Nữ miền Bắc", "en": "Northern Female"},
    },
    {
        "id": "nguyen",
        "name": "Nguyên",
        "description": {"vi": "Nam miền Nam", "en": "Southern Male"},
    },
    {
        "id": "son",
        "name": "Sơn",
        "description": {"vi": "Nam miền Nam", "en": "Southern Male"},
    },
    {
        "id": "tuyen",
        "name": "Tuyên",
        "description": {"vi": "Nam miền Bắc", "en": "Northern Male"},
    },
    {
        "id": "vinh",
        "name": "Vĩnh",
        "description": {"vi": "Nam miền Nam", "en": "Southern Male"},
    }
]


# --- ROUTES ---
@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    """Serve the main UI page"""
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "VieNeu-TTS API",
        "model_loaded": model_loaded,
        "backend": "lmdeploy" if using_lmdeploy else "standard" if model_loaded else None,
        "device": current_device if model_loaded else None
    }


@app.get("/api/voices")
async def get_voices(language: str = "vi"):
    """Get list of available voices"""
    voices_with_localized_desc = []
    for voice in VOICES:
        metadata = VOICE_METADATA.get(voice["id"], {})
        voices_with_localized_desc.append({
            "id": voice["id"],
            "name": voice["name"],
            "description": voice["description"].get(language, voice["description"]["vi"]),
            "region": metadata.get("region"),
            "gender": metadata.get("gender"),
            "audio_sample": f"/static/audio/samples/{voice['id']}.wav" if os.path.exists(
                os.path.join(CURRENT_DIR, f"static/audio/samples/{voice['id']}.wav")
            ) else None
        })
    return {"voices": voices_with_localized_desc}


@app.get("/api/samples")
async def get_samples():
    """Get list of available sample voices and texts for custom mode"""
    sample_voice_dir = os.path.join(CURRENT_DIR, "static", "sample_voice")
    sample_text_dir = os.path.join(CURRENT_DIR, "static", "sample_text")
    
    # Get available voice samples
    voices = []
    if os.path.exists(sample_voice_dir):
        for filename in sorted(os.listdir(sample_voice_dir)):
            if filename.endswith('.wav'):
                voice_id = filename[:-4]  # Remove .wav extension
                voices.append({
                    "id": voice_id,
                    "filename": filename,
                    "url": f"/static/sample_voice/{filename}"
                })
    
    # Get available text samples
    texts = []
    if os.path.exists(sample_text_dir):
        for filename in sorted(os.listdir(sample_text_dir)):
            if filename.endswith('.txt'):
                text_id = filename[:-4]  # Remove .txt extension
                text_path = os.path.join(sample_text_dir, filename)
                
                # Read preview (first 100 chars)
                try:
                    with open(text_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        preview = content[:100] + "..." if len(content) > 100 else content
                except:
                    preview = ""
                
                texts.append({
                    "id": text_id,
                    "filename": filename,
                    "preview": preview
                })
    
    return {
        "sample_voices": voices,
        "sample_texts": texts
    }


@app.post("/api/model/load")
async def load_model_endpoint(request: ModelLoadRequest):
    """Load TTS model with specified configuration"""
    global tts, current_backbone, current_codec, current_device, model_loaded, using_lmdeploy
    
    if not BACKBONE_CONFIGS or not CODEC_CONFIGS:
        raise HTTPException(status_code=500, detail="Model configuration not available. Please check config.yaml")
    
    if request.backbone not in BACKBONE_CONFIGS:
        raise HTTPException(status_code=400, detail=f"Invalid backbone: {request.backbone}")
    
    if request.codec not in CODEC_CONFIGS:
        raise HTTPException(status_code=400, detail=f"Invalid codec: {request.codec}")
    
    try:
        # Cleanup before loading new model
        if model_loaded and tts is not None:
            del tts
            cleanup_gpu_memory()
        
        backbone_config = BACKBONE_CONFIGS[request.backbone]
        codec_config = CODEC_CONFIGS[request.codec]
        
        use_lmdeploy = should_use_lmdeploy(request.backbone, request.device)
        
        if use_lmdeploy:
            try:
                print(f"Loading with LMDeploy backend...")
                
                backbone_device = "cuda"
                codec_device = "cpu" if "ONNX" in request.codec else "cuda"
                
                tts = FastVieNeuTTS(
                    backbone_repo=backbone_config["repo"],
                    backbone_device=backbone_device,
                    codec_repo=codec_config["repo"],
                    codec_device=codec_device,
                    memory_util=0.3,
                    tp=1,
                    enable_prefix_caching=True,
                    enable_triton=request.enable_triton,
                    max_batch_size=request.max_batch_size,
                )
                using_lmdeploy = True
                current_device = "cuda"
                
                # Pre-cache voice references
                if VOICE_SAMPLES:
                    for voice_name, voice_info in VOICE_SAMPLES.items():
                        audio_path = voice_info["audio"]
                        text_path = voice_info["text"]
                        if os.path.exists(audio_path) and os.path.exists(text_path):
                            ref_text = get_ref_text_cached(text_path)
                            tts.get_cached_reference(voice_name, audio_path, ref_text)
                
            except Exception as e:
                print(f"LMDeploy init error: {e}, falling back to standard backend")
                use_lmdeploy = False
                using_lmdeploy = False
        
        if not use_lmdeploy:
            print(f"Loading with standard backend...")
            
            if request.device == "auto":
                if "gguf" in request.backbone.lower():
                    backbone_device = "gpu" if torch.cuda.is_available() else "cpu"
                else:
                    backbone_device = "cuda" if torch.cuda.is_available() else "cpu"
                
                codec_device = "cpu" if "ONNX" in request.codec else ("cuda" if torch.cuda.is_available() else "cpu")
            else:
                backbone_device = request.device.lower()
                codec_device = "cpu" if "ONNX" in request.codec else request.device.lower()
                
                if "gguf" in request.backbone.lower() and backbone_device == "cuda":
                    backbone_device = "gpu"
            
            tts = VieNeuTTS(
                backbone_repo=backbone_config["repo"],
                backbone_device=backbone_device,
                codec_repo=codec_config["repo"],
                codec_device=codec_device
            )
            using_lmdeploy = False
            current_device = backbone_device
        
        current_backbone = request.backbone
        current_codec = request.codec
        model_loaded = True
        
        response = {
            "status": "success",
            "message": "Model loaded successfully",
            "backend": "lmdeploy" if using_lmdeploy else "standard",
            "device": current_device,
            "codec_device": codec_device,
            "streaming_support": backbone_config.get('supports_streaming', False),
        }
        
        if using_lmdeploy and hasattr(tts, 'get_optimization_stats'):
            stats = tts.get_optimization_stats()
            response["optimization"] = {
                "triton_enabled": stats.get('triton_enabled', False),
                "max_batch_size": request.max_batch_size,
                "cached_references": stats.get('cached_references', 0),
                "prefix_caching": True
            }
        
        return response
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        model_loaded = False
        using_lmdeploy = False
        raise HTTPException(status_code=500, detail=f"Failed to load model: {str(e)}")


@app.get("/api/model/status")
async def get_model_status():
    """Get current model configuration and status"""
    if not model_loaded:
        return {"loaded": False}
    
    response = {
        "loaded": True,
        "backend": "lmdeploy" if using_lmdeploy else "standard",
        "backbone": current_backbone,
        "codec": current_codec,
        "device": current_device,
        "streaming_support": BACKBONE_CONFIGS.get(current_backbone, {}).get('supports_streaming', False) if current_backbone else False
    }
    
    if using_lmdeploy and hasattr(tts, 'get_optimization_stats'):
        stats = tts.get_optimization_stats()
        response["optimization"] = stats
    
    return response

@app.post("/api/generate")
async def generate_speech(request: TTSRequest, background_tasks: BackgroundTasks):
    """Generate speech from text using preset voice or custom voice cloning"""
    global tts, model_loaded, using_lmdeploy
    
    # Validate model is loaded
    if not model_loaded or tts is None:
        raise HTTPException(status_code=503, detail="Model not loaded. Please load model first using /api/model/load")
    
    # Validate input
    if not request.text or request.text.strip() == "":
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    
    text = request.text.strip()
    
    # Check text length limits
    max_chars = MAX_TOTAL_CHARS_STREAMING if request.generation_mode == "streaming" else MAX_TOTAL_CHARS_STANDARD
    if len(text) > max_chars:
        raise HTTPException(
            status_code=400,
            detail=f"Text exceeds maximum length. Max: {max_chars} chars, provided: {len(text)} chars"
        )
    
    # Validate mode-specific requirements
    if request.mode == "preset":
        if not request.voice_id:
            raise HTTPException(status_code=400, detail="voice_id is required for preset mode")
        
        if request.voice_id not in VOICE_SAMPLES:
            raise HTTPException(status_code=400, detail=f"Invalid voice_id: {request.voice_id}")
    
    elif request.mode == "custom":
        # Check if using predefined samples or upload
        using_predefined = request.sample_voice_id and request.sample_text_id
        using_upload = request.reference_audio and request.reference_text
        
        if not using_predefined and not using_upload:
            raise HTTPException(
                status_code=400,
                detail="For custom mode, provide either (sample_voice_id + sample_text_id) or (reference_audio + reference_text)"
            )
    
    start_time = time.time()
    
    try:
        # Setup reference
        if request.mode == "preset":
            voice_info = VOICE_SAMPLES[request.voice_id]
            ref_audio_path = voice_info["audio"]
            text_path = voice_info["text"]
            ref_codes_path = voice_info.get("codes")
            
            if not os.path.exists(ref_audio_path):
                raise HTTPException(status_code=404, detail="Reference audio file not found")
            
            ref_text_raw = get_ref_text_cached(text_path)
        
        else:  # custom mode
            if request.sample_voice_id and request.sample_text_id:
                # Use predefined sample from static folder
                ref_audio_path = os.path.join(CURRENT_DIR, "static", "sample_voice", f"{request.sample_voice_id}.wav")
                ref_text_path = os.path.join(CURRENT_DIR, "static", "sample_text", f"{request.sample_text_id}.txt")
                
                if not os.path.exists(ref_audio_path):
                    raise HTTPException(status_code=404, detail=f"Sample voice not found: {request.sample_voice_id}")
                if not os.path.exists(ref_text_path):
                    raise HTTPException(status_code=404, detail=f"Sample text not found: {request.sample_text_id}")
                
                with open(ref_text_path, "r", encoding="utf-8") as f:
                    ref_text_raw = f.read().strip()
                
                ref_codes_path = None
            else:
                # Decode base64 audio (upload mode)
                try:
                    audio_bytes = base64.b64decode(request.reference_audio)
                    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
                        tmp.write(audio_bytes)
                        ref_audio_path = tmp.name
                except Exception as e:
                    raise HTTPException(status_code=400, detail=f"Invalid base64 audio data: {str(e)}")
                
                ref_text_raw = request.reference_text
                ref_codes_path = None
        
        # Encode reference
        codec_config = CODEC_CONFIGS[current_codec]
        use_preencoded = codec_config.get('use_preencoded', False)
        
        if use_preencoded and ref_codes_path and os.path.exists(ref_codes_path):
            ref_codes = torch.load(ref_codes_path, map_location="cpu", weights_only=True)
        else:
            # Use cached reference if available (LMDeploy only)
            if using_lmdeploy and hasattr(tts, 'get_cached_reference') and request.mode == "preset":
                ref_codes = tts.get_cached_reference(request.voice_id, ref_audio_path, ref_text_raw)
            else:
                ref_codes = tts.encode_reference(ref_audio_path)
        
        if isinstance(ref_codes, torch.Tensor):
            ref_codes = ref_codes.cpu().numpy()
        
        # Split text into chunks
        text_chunks = split_text_into_chunks(text, max_chars=MAX_CHARS_PER_CHUNK)
        total_chunks = len(text_chunks)
        
        # Generate audio
        all_audio_segments = []
        sr = 24000
        silence_pad = np.zeros(int(sr * 0.15), dtype=np.float32)
        
        # Use batch processing if enabled and using LMDeploy
        if request.use_batch and using_lmdeploy and hasattr(tts, 'infer_batch') and total_chunks > 1:
            chunk_wavs = tts.infer_batch(text_chunks, ref_codes, ref_text_raw)
            
            for i, chunk_wav in enumerate(chunk_wavs):
                if chunk_wav is not None and len(chunk_wav) > 0:
                    all_audio_segments.append(chunk_wav)
                    if i < total_chunks - 1:
                        all_audio_segments.append(silence_pad)
        else:
            # Sequential processing
            for i, chunk in enumerate(text_chunks):
                chunk_wav = tts.infer(chunk, ref_codes, ref_text_raw)
                
                if chunk_wav is not None and len(chunk_wav) > 0:
                    all_audio_segments.append(chunk_wav)
                    if i < total_chunks - 1:
                        all_audio_segments.append(silence_pad)
        
        if not all_audio_segments:
            raise HTTPException(status_code=500, detail="Failed to generate audio")
        
        # Concatenate and save
        final_wav = np.concatenate(all_audio_segments)
        
        # Generate unique filename
        filename = f"vieneu_tts_{int(time.time() * 1000)}.wav"
        output_path = os.path.join(TEMP_AUDIO_DIR, filename)
        
        sf.write(output_path, final_wav, sr)
        
        process_time = time.time() - start_time
        duration = len(final_wav) / sr
        speed = duration / process_time if process_time > 0 else 0
        
        # Cleanup GPU memory
        if using_lmdeploy and hasattr(tts, 'cleanup_memory'):
            tts.cleanup_memory()
        cleanup_gpu_memory()
        
        # Cleanup custom audio if exists
        if request.mode == "custom":
            background_tasks.add_task(cleanup_file, ref_audio_path)
        
        return {
            "status": "success",
            "audio_url": f"/api/audio/{filename}",
            "duration": round(duration, 2),
            "sample_rate": sr,
            "process_time": round(process_time, 2),
            "speed": f"{speed:.2f}x realtime",
            "backend": "lmdeploy" if using_lmdeploy else "standard",
            "chunks_processed": total_chunks,
            "batch_mode": request.use_batch and using_lmdeploy and total_chunks > 1
        }
        
    except HTTPException:
        raise
    except torch.cuda.OutOfMemoryError as e:
        cleanup_gpu_memory()
        raise HTTPException(
            status_code=500,
            detail=f"GPU out of memory. Try reducing max_batch_size or text length. Details: {str(e)}"
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        cleanup_gpu_memory()
        raise HTTPException(status_code=500, detail=f"Error generating speech: {str(e)}")


@app.post("/api/generate/upload")
async def generate_speech_upload(
    background_tasks: BackgroundTasks,
    text: str = Form(..., description="Text to synthesize", max_length=3000),
    mode: Literal["preset", "custom"] = Form(..., description="Generation mode"),
    voice_id: Optional[str] = Form(None, description="Preset voice ID (required for preset mode)"),
    sample_voice_id: Optional[str] = Form(None, description="Sample voice ID from static/sample_voice (required for custom mode)"),
    sample_text_id: Optional[str] = Form(None, description="Sample text ID from static/sample_text (required for custom mode)"),
    language: str = Form(default="vi", description="Language code"),
    generation_mode: Literal["standard", "streaming"] = Form(default="standard", description="Generation mode"),
    use_batch: bool = Form(default=True, description="Enable batch processing")
):
    """
    Generate speech from text using predefined reference voices and texts.
    For custom mode, select from available samples in /api/samples endpoint.
    """
    global tts, model_loaded, using_lmdeploy
    
    # Validate model is loaded
    if not model_loaded or tts is None:
        raise HTTPException(status_code=503, detail="Model not loaded. Please load model first using /api/model/load")
    
    # Validate input
    if not text or text.strip() == "":
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    
    text = text.strip()
    
    # Check text length limits
    max_chars = MAX_TOTAL_CHARS_STREAMING if generation_mode == "streaming" else MAX_TOTAL_CHARS_STANDARD
    if len(text) > max_chars:
        raise HTTPException(
            status_code=400,
            detail=f"Text exceeds maximum length. Max: {max_chars} chars, provided: {len(text)} chars"
        )
    
    # Validate mode-specific requirements
    if mode == "preset":
        if not voice_id:
            raise HTTPException(status_code=400, detail="voice_id is required for preset mode")
        
        if voice_id not in VOICE_SAMPLES:
            raise HTTPException(status_code=400, detail=f"Invalid voice_id: {voice_id}")
    
    elif mode == "custom":
        # For custom mode, require predefined sample IDs
        if not sample_voice_id or not sample_text_id:
            raise HTTPException(status_code=400, detail="sample_voice_id and sample_text_id are required for custom mode")
    
    start_time = time.time()
    
    try:
        # Setup reference
        if mode == "preset":
            voice_info = VOICE_SAMPLES[voice_id]
            ref_audio_path = voice_info["audio"]
            text_path = voice_info["text"]
            ref_codes_path = voice_info.get("codes")
            
            if not os.path.exists(ref_audio_path):
                raise HTTPException(status_code=404, detail="Reference audio file not found")
            
            ref_text_raw = get_ref_text_cached(text_path)
        
        else:  # custom mode
            # Use predefined sample from static folder
            ref_audio_path = os.path.join(CURRENT_DIR, "static", "sample_voice", f"{sample_voice_id}.wav")
            ref_text_path = os.path.join(CURRENT_DIR, "static", "sample_text", f"{sample_text_id}.txt")
            
            if not os.path.exists(ref_audio_path):
                raise HTTPException(status_code=404, detail=f"Sample voice not found: {sample_voice_id}")
            if not os.path.exists(ref_text_path):
                raise HTTPException(status_code=404, detail=f"Sample text not found: {sample_text_id}")
            
            with open(ref_text_path, "r", encoding="utf-8") as f:
                ref_text_raw = f.read().strip()
            
            ref_codes_path = None
        
        # Encode reference
        codec_config = CODEC_CONFIGS[current_codec]
        use_preencoded = codec_config.get('use_preencoded', False)
        
        if use_preencoded and ref_codes_path and os.path.exists(ref_codes_path):
            ref_codes = torch.load(ref_codes_path, map_location="cpu", weights_only=True)
        else:
            # Use cached reference if available (LMDeploy only)
            if using_lmdeploy and hasattr(tts, 'get_cached_reference') and mode == "preset":
                ref_codes = tts.get_cached_reference(voice_id, ref_audio_path, ref_text_raw)
            else:
                ref_codes = tts.encode_reference(ref_audio_path)
        
        if isinstance(ref_codes, torch.Tensor):
            ref_codes = ref_codes.cpu().numpy()
        
        # Split text into chunks
        text_chunks = split_text_into_chunks(text, max_chars=MAX_CHARS_PER_CHUNK)
        total_chunks = len(text_chunks)
        
        # Generate audio
        all_audio_segments = []
        sr = 24000
        silence_pad = np.zeros(int(sr * 0.15), dtype=np.float32)
        
        # Use batch processing if enabled and using LMDeploy
        if use_batch and using_lmdeploy and hasattr(tts, 'infer_batch') and total_chunks > 1:
            chunk_wavs = tts.infer_batch(text_chunks, ref_codes, ref_text_raw)
            
            for i, chunk_wav in enumerate(chunk_wavs):
                if chunk_wav is not None and len(chunk_wav) > 0:
                    all_audio_segments.append(chunk_wav)
                    if i < total_chunks - 1:
                        all_audio_segments.append(silence_pad)
        else:
            # Sequential processing
            for i, chunk in enumerate(text_chunks):
                chunk_wav = tts.infer(chunk, ref_codes, ref_text_raw)
                
                if chunk_wav is not None and len(chunk_wav) > 0:
                    all_audio_segments.append(chunk_wav)
                    if i < total_chunks - 1:
                        all_audio_segments.append(silence_pad)
        
        if not all_audio_segments:
            raise HTTPException(status_code=500, detail="Failed to generate audio")
        
        # Concatenate and save
        final_wav = np.concatenate(all_audio_segments)
        
        # Generate unique filename
        filename = f"vieneu_tts_{int(time.time() * 1000)}.wav"
        output_path = os.path.join(TEMP_AUDIO_DIR, filename)
        
        sf.write(output_path, final_wav, sr)
        
        process_time = time.time() - start_time
        duration = len(final_wav) / sr
        speed = duration / process_time if process_time > 0 else 0
        
        # Cleanup GPU memory
        if using_lmdeploy and hasattr(tts, 'cleanup_memory'):
            tts.cleanup_memory()
        cleanup_gpu_memory()
        
        # No cleanup needed for predefined samples (they are static files)
        
        return {
            "status": "success",
            "audio_url": f"/api/audio/{filename}",
            "duration": round(duration, 2),
            "sample_rate": sr,
            "process_time": round(process_time, 2),
            "speed": f"{speed:.2f}x realtime",
            "backend": "lmdeploy" if using_lmdeploy else "standard",
            "chunks_processed": total_chunks,
            "batch_mode": use_batch and using_lmdeploy and total_chunks > 1
        }
        
    except HTTPException:
        raise
    except torch.cuda.OutOfMemoryError as e:
        cleanup_gpu_memory()
        raise HTTPException(
            status_code=500,
            detail=f"GPU out of memory. Try reducing max_batch_size or text length. Details: {str(e)}"
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        cleanup_gpu_memory()
        raise HTTPException(status_code=500, detail=f"Error generating speech: {str(e)}")


@app.get("/api/audio/{filename}")
async def get_audio(filename: str, background_tasks: BackgroundTasks):
    """Retrieve generated audio file"""
    file_path = os.path.join(TEMP_AUDIO_DIR, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")
    
    # Schedule file cleanup after sending
    background_tasks.add_task(cleanup_file, file_path)
    
    return FileResponse(
        file_path,
        media_type="audio/wav",
        filename=filename
    )


def cleanup_file(file_path: str):
    """Cleanup temporary file"""
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception as e:
        print(f"Error cleaning up file {file_path}: {e}")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8004)
