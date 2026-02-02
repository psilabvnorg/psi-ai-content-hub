#!/usr/bin/env python3
"""
Simple test script to verify API endpoints are working
"""

import requests
import json

API_URL = "http://localhost:8000"

def test_health():
    """Test health check endpoint"""
    print("Testing health check...")
    try:
        response = requests.get(f"{API_URL}/api/health")
        if response.status_code == 200:
            print("✅ Health check passed")
            print(f"   Response: {response.json()}")
            return True
        else:
            print(f"❌ Health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Health check error: {e}")
        return False


def test_download_video():
    """Test video download endpoint"""
    print("\nTesting video download...")
    print("⚠️  This will actually download a video. Skip? (y/n)")
    skip = input().lower()
    if skip == 'y':
        print("⏭️  Skipped video download test")
        return True
    
    try:
        data = {
            "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "platform": "youtube"
        }
        print(f"   Downloading: {data['url']}")
        response = requests.post(
            f"{API_URL}/api/download/video",
            json=data,
            timeout=60
        )
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Video download passed")
            print(f"   Title: {result.get('title')}")
            print(f"   File: {result.get('filename')}")
            return True
        else:
            print(f"❌ Video download failed: {response.status_code}")
            print(f"   Error: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Video download error: {e}")
        return False


def main():
    print("=" * 60)
    print("AI Content Hub API Test Suite")
    print("=" * 60)
    print()
    print("Make sure the API is running on http://localhost:8000")
    print("Start it with: python main.py")
    print()
    input("Press Enter to continue...")
    print()
    
    results = []
    
    # Test health check
    results.append(("Health Check", test_health()))
    
    # Test video download (optional)
    results.append(("Video Download", test_download_video()))
    
    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print()
    print(f"Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed! API is working correctly.")
    else:
        print("\n⚠️  Some tests failed. Check the output above.")


if __name__ == "__main__":
    main()
