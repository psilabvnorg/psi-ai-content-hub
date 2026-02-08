#!/usr/bin/env python3
"""
Simple FastAPI for Audio Transcription
Input: WAV file
Output: Transcribed text
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse, RedirectResponse, FileResponse, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn
import tempfile
import os
from pathlib import Path
import sys
import json
import re

# Add parent directory to path to import transcription module
sys.path.append(str(Path(__file__).parent.parent))

try:
    from scripts.transcribe_phowhisper import transcribe_with_timestamps
except ImportError:
    print("Warning: Could not import transcribe_phowhisper, using fallback")
    transcribe_with_timestamps = None

app = FastAPI(
    title="Audio Transcription API",
    description="Simple API to transcribe WAV audio files to text",
    version="1.0.0",
    docs_url="/docs"
)

# Enable CORS for local development and simple frontends
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files
STATIC_DIR = Path(__file__).parent / "static"
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
    app.mount("/ui", StaticFiles(directory=str(STATIC_DIR), html=True), name="ui")

# Configure model path (adjust as needed)
MODEL_PATH = "/home/psilab/TRANSCRIBE-AUDIO-TO-TEXT-WHISPER/model/snapshots/55a7e3eb6c906de891f8f06a107754427dd3be79"


def clean_unk_tokens(text):
    """Remove 'unk' tokens and excessive punctuation from transcription."""
    if not text:
        return text
    
    # Remove standalone 'unk' tokens (with or without punctuation)
    text = re.sub(r'\bunk\b\.?\s*', '', text, flags=re.IGNORECASE)
    
    # Remove multiple consecutive spaces
    text = re.sub(r'\s+', ' ', text)
    
    # Remove multiple consecutive periods
    text = re.sub(r'\.{2,}', '.', text)
    
    # Remove trailing/leading whitespace
    text = text.strip()
    
    return text


@app.get("/")
def read_root():
    """Serve the frontend at root path."""
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    # Fallback: redirect to static path
    return RedirectResponse(url="/static/index.html")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    language: str = "vi",
    add_punctuation: bool = True
):
    """
    Transcribe audio file to text.
    
    Args:
        file: WAV or MP3 audio file
        language: Language code (default: "vi" for Vietnamese)
        add_punctuation: Whether to restore punctuation (default: True)
    
    Returns:
        Plain text file with transcribed text and metadata
    """
    # Validate file extension
    if not (file.filename.lower().endswith('.wav') or file.filename.lower().endswith('.mp3')):
        raise HTTPException(
            status_code=400,
            detail="Only WAV and MP3 files are supported. Please upload a .wav or .mp3 file."
        )
    
    # Check if transcription function is available
    if transcribe_with_timestamps is None:
        raise HTTPException(
            status_code=500,
            detail="Transcription module not available. Please check dependencies."
        )
    
    # Create temporary file to save uploaded audio
    try:
        # Get file extension
        file_ext = '.wav' if file.filename.lower().endswith('.wav') else '.mp3'
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as temp_file:
            # Write uploaded file to temporary file
            content = await file.read()
            temp_file.write(content)
            temp_path = temp_file.name
        
        # Perform transcription
        result = transcribe_with_timestamps(
            audio_path=temp_path,
            model_path=MODEL_PATH,
            language=language,
            verbose=False,
            add_punctuation=add_punctuation
        )
        
        # Clean up temporary file
        os.unlink(temp_path)
        
        # Clean up unk tokens from the text
        cleaned_text = clean_unk_tokens(result['text'])
        
        # Create text file content with metadata as comments
        output_text = f"# Transcription of: {file.filename}\n"
        output_text += f"# Language: {result['language']}\n"
        output_text += f"# Duration: {result['duration']:.2f}s\n"
        output_text += f"# Segments: {len(result['segments'])}\n"
        output_text += f"# Punctuation restored: {result.get('punctuation_restored', False)}\n"
        output_text += f"# ----------------------------------------\n\n"
        output_text += cleaned_text
        
        # Return as plain text
        return PlainTextResponse(
            content=output_text,
            media_type="text/plain; charset=utf-8"
        )
        
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=404,
            detail=f"Model not found: {str(e)}"
        )
    except Exception as e:
        # Clean up temporary file if it exists
        if 'temp_path' in locals() and os.path.exists(temp_path):
            os.unlink(temp_path)
        
        raise HTTPException(
            status_code=500,
            detail=f"Transcription failed: {str(e)}"
        )


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8001,
        reload=True
    )
