#!/usr/bin/env python3
"""
Quick test script for video download with logging
"""
import requests
import json

API_URL = "http://localhost:8000"

def test_download():
    print("=== Testing Video Download ===")
    
    # Test with a YouTube URL
    test_url = input("Enter YouTube URL to test (or press Enter for default): ").strip()
    if not test_url:
        test_url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"  # Rick Roll for testing
    
    print(f"\nTesting with URL: {test_url}")
    print("Sending request to API...")
    
    try:
        response = requests.post(
            f"{API_URL}/api/download/video",
            json={
                "url": test_url,
                "platform": "youtube"
            },
            timeout=300  # 5 minute timeout
        )
        
        print(f"\nResponse Status: {response.status_code}")
        
        if response.ok:
            data = response.json()
            print("\n=== SUCCESS ===")
            print(json.dumps(data, indent=2))
        else:
            print("\n=== ERROR ===")
            print(response.text)
            
    except requests.exceptions.ConnectionError:
        print("\n❌ ERROR: Cannot connect to API server")
        print("Make sure the Python API is running on http://localhost:8000")
        print("Run: cd python-api && python main.py")
    except Exception as e:
        print(f"\n❌ ERROR: {e}")

if __name__ == "__main__":
    test_download()
