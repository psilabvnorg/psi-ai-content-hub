# VieNeu-TTS API Design

## Overview
RESTful API for Vietnamese Text-to-Speech synthesis with instant voice cloning.

## Base URL
```
http://localhost:8000
```

---

## Endpoints

### 1. Health Check
**GET** `/api/health`

Check if the API service is running.

**Response:**
```json
{
  "status": "healthy",
  "service": "VieNeu-TTS API",
  "model_loaded": true,
  "backend": "lmdeploy" | "standard",
  "device": "cuda" | "cpu"
}
```

---

### 2. Get Available Voices
**GET** `/api/voices`

Retrieve list of available preset voices with localized descriptions.

**Query Parameters:**
- `language` (optional): `vi` | `en` (default: `vi`)

**Response:**
```json
{
  "voices": [
    {
      "id": "binh",
      "name": "Bình",
      "description": "Nam miền Bắc",
      "region": "north",
      "gender": "male",
      "audio_sample": "/static/audio/samples/binh.wav"
    }
  ]
}
```

---

### 3. Load Model Configuration
**POST** `/api/model/load`

Load TTS model with specified configuration. Must be called before generating audio.

**Request Body:**
```json
{
  "backbone": "VieNeu-TTS (GPU)" | "VieNeu-TTS-q4-gguf (CPU)" | "VieNeu-TTS-q8-gguf (CPU)",
  "codec": "NeuCodec (Standard)" | "NeuCodec (ONNX)",
  "device": "auto" | "cpu" | "cuda",
  "enable_triton": true,
  "max_batch_size": 8
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Model loaded successfully",
  "backend": "lmdeploy" | "standard",
  "device": "cuda",
  "codec_device": "cuda",
  "streaming_support": true,
  "optimization": {
    "triton_enabled": true,
    "max_batch_size": 8,
    "cached_references": 10,
    "prefix_caching": true
  }
}
```

**Error Response:**
```json
{
  "status": "error",
  "message": "Failed to load model: ...",
  "details": "..."
}
```

---

### 4. Generate Audio (Main Endpoint)
**POST** `/api/generate`

Generate speech from text using preset voice or custom voice cloning.

> **Note:** For larger audio files or better efficiency, use `/api/generate/upload` with multipart/form-data instead.

#### Request Body Schema

##### Mode 1: Preset Voice
```json
{
  "text": "Văn bản cần chuyển đổi thành giọng nói",
  "mode": "preset",
  "voice_id": "binh",
  "language": "vi",
  "generation_mode": "standard",
  "use_batch": true
}
```

##### Mode 2: Voice Cloning
```json
{
  "text": "Văn bản cần chuyển đổi thành giọng nói",
  "mode": "custom",
  "reference_audio": "base64_encoded_audio_data",
  "reference_text": "Nội dung audio mẫu - phải khớp chính xác",
  "language": "vi",
  "generation_mode": "standard",
  "use_batch": true
}
```

**Field Descriptions:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | Yes | Text to synthesize (max 500 chars for standard, 3000 for streaming) |
| `mode` | string | Yes | `"preset"` or `"custom"` |
| `voice_id` | string | Yes (preset) | ID of preset voice (e.g., "binh", "ngoc") |
| `reference_audio` | string | Yes (custom) | Base64 encoded WAV audio (10-15 seconds) |
| `reference_text` | string | Yes (custom) | Exact transcription of reference audio |
| `language` | string | No | `"vi"` or `"en"` (default: `"vi"`) |
| `generation_mode` | string | No | `"standard"` or `"streaming"` (default: `"standard"`) |
| `use_batch` | boolean | No | Enable batch processing for multiple chunks (default: `true`) |

#### Inference Logic Flow

```
1. Validate Input
   ├─ Check text length (max 500 standard, 3000 streaming)
   ├─ Validate mode (preset/custom)
   └─ Check model is loaded

2. Load Reference
   ├─ Preset Mode:
   │  ├─ Load audio from VOICE_SAMPLES[voice_id]["audio"]
   │  ├─ Load text from VOICE_SAMPLES[voice_id]["text"]
   │  └─ Load pre-encoded codes if available (.pt file)
   └─ Custom Mode:
      ├─ Decode base64 audio
      ├─ Validate audio format (WAV, 10-15s)
      └─ Use provided reference_text

3. Encode Reference
   ├─ If pre-encoded codes exist → Load from .pt file
   ├─ If LMDeploy + preset mode → Use cached reference
   └─ Otherwise → Encode with tts.encode_reference()

4. Split Text into Chunks
   ├─ Use split_text_into_chunks()
   ├─ Max chars per chunk: 256 (from config.yaml)
   └─ Total chunks: N

5. Generate Audio
   ├─ Standard Mode:
   │  ├─ If use_batch + LMDeploy + multiple chunks:
   │  │  └─ Use tts.infer_batch(chunks, ref_codes, ref_text)
   │  └─ Otherwise:
   │     └─ Loop: tts.infer(chunk, ref_codes, ref_text)
   │  
   │  ├─ Add 0.15s silence between chunks
   │  └─ Concatenate all segments
   │
   └─ Streaming Mode:
      ├─ For each chunk:
      │  └─ tts.infer_stream() → yields audio parts
      ├─ Apply crossfade (0.03s overlap)
      └─ Stream chunks to client

6. Save & Return
   ├─ Standard: Save to temp file → return file path
   └─ Streaming: Return audio stream
```

#### Response (Standard Mode)

**Success:**
```json
{
  "status": "success",
  "audio_url": "/api/audio/temp_abc123.wav",
  "duration": 12.5,
  "sample_rate": 24000,
  "process_time": 2.3,
  "speed": "5.4x realtime",
  "backend": "lmdeploy",
  "chunks_processed": 5,
  "batch_mode": true
}
```

**Error Response:**
```json
{
  "status": "error",
  "error": "Text exceeds maximum length",
  "details": "Text length: 3500 chars, max: 500 chars"
}
```

#### Response (Streaming Mode)

**Content-Type:** `audio/wav` or `application/octet-stream`

Server-Sent Events stream with audio chunks.

---

### 5. Generate Audio with File Upload (Recommended for Custom Mode)
**POST** `/api/generate/upload`

Generate speech from text using multipart/form-data file upload. **More efficient than base64 encoding** for custom voice cloning.

**Content-Type:** `multipart/form-data`

#### Form Fields

##### Mode 1: Preset Voice
```
text: "Văn bản cần chuyển đổi thành giọng nói"
mode: "preset"
voice_id: "binh"
language: "vi"
generation_mode: "standard"
use_batch: true
```

##### Mode 2: Voice Cloning (with file upload)
```
text: "Văn bản cần chuyển đổi thành giọng nói"
mode: "custom"
reference_audio: <audio file upload>
reference_text: "Nội dung audio mẫu - phải khớp chính xác"
language: "vi"
generation_mode: "standard"
use_batch: true
```

**Field Descriptions:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | Yes | Text to synthesize (max 500 chars for standard, 3000 for streaming) |
| `mode` | string | Yes | `"preset"` or `"custom"` |
| `voice_id` | string | Yes (preset) | ID of preset voice (e.g., "binh", "ngoc") |
| `reference_audio` | file | Yes (custom) | Audio file upload (WAV format, 10-15 seconds) |
| `reference_text` | string | Yes (custom) | Exact transcription of reference audio |
| `language` | string | No | `"vi"` or `"en"` (default: `"vi"`) |
| `generation_mode` | string | No | `"standard"` or `"streaming"` (default: `"standard"`) |
| `use_batch` | boolean | No | Enable batch processing for multiple chunks (default: `true`) |

#### Response

Same as `/api/generate` endpoint.

**Advantages over `/api/generate`:**
- ✅ No base64 encoding overhead (~33% smaller payload)
- ✅ Direct file upload, easier integration
- ✅ Better for larger audio files
- ✅ More efficient memory usage

---

### 6. Get Generated Audio
**GET** `/api/audio/{filename}`

Retrieve generated audio file.

**Response:**
- **Content-Type:** `audio/wav`
- **Body:** Audio file binary data

---

### 7. Model Status
**GET** `/api/model/status`

Get current model configuration and status.

**Response:**
```json
{
  "loaded": true,
  "backend": "lmdeploy",
  "backbone": "VieNeu-TTS (GPU)",
  "codec": "NeuCodec (Standard)",
  "device": "cuda",
  "codec_device": "cuda",
  "streaming_support": true,
  "optimization": {
    "triton_enabled": true,
    "max_batch_size": 8,
    "cached_references": 10
  }
}
```

---

## Error Codes

| Status Code | Description |
|-------------|-------------|
| 200 | Success |
| 400 | Bad Request (invalid input) |
| 404 | Resource not found |
| 500 | Internal Server Error |
| 503 | Model not loaded |

---

## Implementation Notes

### Text Processing
- Use `utils.core_utils.split_text_into_chunks()`
- Max chars per chunk: 256 (configurable in config.yaml)
- Add 0.15s silence padding between chunks

### Reference Audio
- **Preset Mode:**
  - Load from `sample/` directory
  - Pre-encoded codes available as `.pt` files
  - Cached in LMDeploy for faster inference
  
- **Custom Mode:**
  - **Option 1:** Accept base64 encoded audio (via `/api/generate`)
  - **Option 2:** Accept file upload (via `/api/generate/upload` - **recommended**)
  - Validate format: WAV, 10-15 seconds
  - Encode on-the-fly (no caching)

### Optimization Features
1. **LMDeploy Backend:**
   - Automatic if GPU available and not GGUF model
   - Prefix caching enabled
   - Triton compilation (optional)
   - Reference audio caching

2. **Batch Processing:**
   - Only with LMDeploy + multiple chunks
   - Controlled by `max_batch_size` parameter
   - Process multiple chunks in parallel
   - Fallback to sequential if disabled

3. **Memory Management:**
   - Call `tts.cleanup_memory()` after generation (LMDeploy)
   - Call `cleanup_gpu_memory()` to clear CUDA cache
   - Handle CUDA OOM gracefully

### Audio Processing
- **Sample Rate:** 24,000 Hz
- **Format:** 32-bit float WAV
- **Crossfade (streaming):** 0.03s overlap between chunks
- **Silence padding:** 0.15s between chunks

---

## Configuration (config.yaml)

```yaml
backbone_configs:
  "VieNeu-TTS (GPU)":
    repo: "pnnbao-ump/VieNeu-TTS"
    supports_streaming: true

codec_configs:
  "NeuCodec (Standard)":
    repo: "pnnbao-ump/VieNeuCodec"
    use_preencoded: true

voice_samples:
  "Bình (nam miền Bắc)":
    audio: "sample/Bình (nam miền Bắc).wav"
    text: "sample/Bình (nam miền Bắc).txt"
    codes: "sample/Bình (nam miền Bắc).pt"

text_settings:
  max_chars_per_chunk: 256
  max_total_chars_streaming: 3000
```

---

## Example Usage

### 1. Load Model
```bash
curl -X POST http://localhost:8000/api/model/load \
  -H "Content-Type: application/json" \
  -d '{
    "backbone": "VieNeu-TTS (GPU)",
    "codec": "NeuCodec (Standard)",
    "device": "auto",
    "enable_triton": true,
    "max_batch_size": 8
  }'
```

### 2. Generate with Preset Voice
```bash
curl -X POST http://localhost:8000/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Xin chào, đây là giọng nói tự động của VieNeu-TTS",
    "mode": "preset",
    "voice_id": "binh",
    "generation_mode": "standard",
    "use_batch": true
  }'
```

### 3. Generate with Voice Cloning (Base64)
```bash
curl -X POST http://localhost:8000/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Xin chào, đây là giọng nói nhân bản",
    "mode": "custom",
    "reference_audio": "UklGRi4AAABXQVZFZm10...",
    "reference_text": "Đây là nội dung audio mẫu",
    "generation_mode": "standard"
  }'
```

### 4. Generate with Voice Cloning (File Upload - Recommended)
```bash
curl -X POST http://localhost:8000/api/generate/upload \
  -F "text=Xin chào, đây là giọng nói nhân bản từ file upload" \
  -F "mode=custom" \
  -F "reference_audio=@/path/to/your/voice_sample.wav" \
  -F "reference_text=Đây là nội dung audio mẫu" \
  -F "generation_mode=standard" \
  -F "use_batch=true"
```

---

## Performance Tips

1. **GPU Users:**
   - Use VieNeu-TTS (GPU) with CUDA
   - Enable Triton compilation
   - Set max_batch_size based on VRAM (8GB → 4-6, 16GB+ → 8-12)

2. **CPU Users:**
   - Use GGUF models (Q4 for speed, Q8 for quality)
   - Disable batch processing
   - Lower max_batch_size

3. **Memory Issues:**
   - Reduce max_batch_size
   - Shorten text length
   - Use CPU for codec if GPU memory limited

---

## Dependencies

- `fastapi` - Web framework
- `uvicorn` - ASGI server
- `soundfile` - Audio I/O
- `numpy` - Array operations
- `torch` - PyTorch backend
- `pyyaml` - Config loading
- VieNeu-TTS modules:
  - `vieneu_tts.VieNeuTTS` - Standard backend
  - `vieneu_tts.FastVieNeuTTS` - LMDeploy backend
  - `utils.core_utils.split_text_into_chunks` - Text processing
