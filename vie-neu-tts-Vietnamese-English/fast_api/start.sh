#!/bin/bash

# VieNeu-TTS FastAPI Server Start Script

echo "Starting VieNeu-TTS FastAPI Server..."
echo "======================================="

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Start the server
echo "Starting server on http://0.0.0.0:8000"
echo "Press Ctrl+C to stop the server"
echo "======================================="

python main.py
