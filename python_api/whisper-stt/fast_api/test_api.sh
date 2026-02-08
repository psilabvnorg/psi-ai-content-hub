#!/bin/bash

# Test script for Audio Transcription API

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

API_URL="http://localhost:8001"

echo -e "${BLUE}Testing Audio Transcription API${NC}"
echo "=================================="

# Test 1: Health check
echo -e "\n${BLUE}1. Testing health check endpoint...${NC}"
curl -s "${API_URL}/health" | python -m json.tool

# Test 2: Root endpoint
echo -e "\n${BLUE}2. Testing root endpoint...${NC}"
curl -s "${API_URL}/" | python -m json.tool

# Test 3: Transcribe audio (you need to provide a WAV file path)
echo -e "\n${BLUE}3. Testing transcription endpoint...${NC}"
if [ -z "$1" ]; then
    echo -e "${RED}Please provide a WAV file path as argument${NC}"
    echo "Usage: $0 /path/to/audio.wav"
else
    if [ -f "$1" ]; then
        echo "Transcribing: $1"
        curl -X POST "${API_URL}/transcribe" \
            -F "file=@$1" \
            -F "language=vi" \
            -F "add_punctuation=true" | python3 -c "import sys, json; data = json.load(sys.stdin); print(json.dumps(data, ensure_ascii=False, indent=2))"
    else
        echo -e "${RED}File not found: $1${NC}"
    fi
fi

echo -e "\n${GREEN}Testing complete!${NC}"
echo "For interactive API docs, visit: ${API_URL}/docs"

# ./fast_api/test_api.sh /home/psilab/TRANSCRIBE-AUDIO-TO-TEXT-WHISPER/input/huan_rose_trimmed.wav