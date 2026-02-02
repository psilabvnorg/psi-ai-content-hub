#!/bin/bash

echo "Starting AI Content Hub Python API..."
echo ""

# Check Python
echo "Checking Python installation..."
if ! command -v python3 &> /dev/null; then
    echo "Python 3 is not installed!"
    echo "Please install Python 3.9+ from https://www.python.org/"
    exit 1
fi
python3 --version

# Check FFmpeg
echo ""
echo "Checking FFmpeg installation..."
if ! command -v ffmpeg &> /dev/null; then
    echo "WARNING: FFmpeg is not installed!"
    echo "Please install FFmpeg for video/audio processing"
    echo "  Ubuntu/Debian: sudo apt install ffmpeg"
    echo "  macOS: brew install ffmpeg"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Install dependencies
echo ""
echo "Installing Python dependencies..."
pip3 install -r requirements.txt

# Start server
echo ""
echo "Starting FastAPI server on http://localhost:8000"
echo "API Documentation: http://localhost:8000/docs"
echo ""
python3 main.py
