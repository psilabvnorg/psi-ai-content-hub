#!/bin/bash

source /home/psilab/TRANSCRIBE-AUDIO-TO-TEXT-WHISPER/venv/bin/activate

# Start FastAPI server for audio transcription

echo "Starting Audio Transcription API..."
echo "API will be available at: http://localhost:8001"
echo "API docs available at: http://localhost:8001/docs"

cd "$(dirname "$0")"
python main.py
