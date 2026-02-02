#!/usr/bin/env python3
"""
Test script to verify SSE progress tracking
"""
import requests
import json
import time
from sseclient import SSEClient  # pip install sseclient-py

API_URL = "http://localhost:8000"

def test_download_with_progress():
    """Test video download with real-time progress tracking"""
    
    # Start download
    print("Starting download...")
    response = requests.post(
        f"{API_URL}/api/download/video",
        json={
            "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",  # Short test video
            "platform": "youtube"
        }
    )
    
    if response.status_code != 200:
        print(f"Error: {response.json()}")
        return
    
    data = response.json()
    download_id = data.get('download_id')
    
    if not download_id:
        print("No download_id returned!")
        return
    
    print(f"Download ID: {download_id}")
    print("Connecting to progress stream...\n")
    
    # Connect to SSE endpoint
    messages = SSEClient(f"{API_URL}/api/progress/{download_id}")
    
    for msg in messages:
        if msg.data:
            progress = json.loads(msg.data)
            status = progress.get('status')
            
            if status == 'downloading':
                print(f"📥 {progress.get('percent', '0%')} | "
                      f"Speed: {progress.get('speed', 'N/A')} | "
                      f"ETA: {progress.get('eta', 'N/A')}")
            elif status == 'processing':
                print(f"⚙️  {progress.get('message', 'Processing...')}")
            elif status == 'converting':
                print(f"🔄 {progress.get('message', 'Converting...')}")
            elif status == 'complete':
                print(f"✅ Download complete!")
                break
            elif status == 'error':
                print(f"❌ Error: {progress.get('message', 'Unknown error')}")
                break
            else:
                print(f"⏳ {progress.get('message', status)}")

if __name__ == "__main__":
    try:
        test_download_with_progress()
    except KeyboardInterrupt:
        print("\n\nTest interrupted")
    except Exception as e:
        print(f"\nError: {e}")
        print("\nNote: Install sseclient-py if not installed:")
        print("  pip install sseclient-py")
