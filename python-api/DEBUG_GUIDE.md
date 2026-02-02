# Video Download Debugging Guide

## What's Been Added

### Backend (Python API)
✅ **Comprehensive logging** to terminal and `api.log` file
✅ **Progress tracking** during download
✅ **Detailed error messages** with full stack traces
✅ **Codec detection** and conversion logging

### Frontend (React)
✅ **Progress bar** showing download status
✅ **Status messages** (Initializing, Downloading, Converting, etc.)
✅ **Error display** with detailed messages
✅ **Console logging** (press F12 to view)
✅ **Visual feedback** for H.264 conversion

## How to Debug

### 1. Start the Python API with Logging

```cmd
cd python-api
python main.py
```

You'll see detailed logs in the terminal like:
```
2024-01-01 12:00:00 - __main__ - INFO - === Starting video download ===
2024-01-01 12:00:00 - __main__ - INFO - URL: https://youtube.com/...
2024-01-01 12:00:00 - __main__ - INFO - Platform: youtube
2024-01-01 12:00:01 - __main__ - INFO - Starting yt-dlp download...
2024-01-01 12:00:05 - __main__ - INFO - Downloading: 45.2% - Speed: 2.5MB/s
```

### 2. Check the Log File

All logs are also saved to `python-api/api.log`:
```cmd
cd python-api
type api.log
```

### 3. Frontend Console Logs

Open browser console (F12) and you'll see:
```
=== Starting download ===
URL: https://youtube.com/...
Platform: youtube
Sending request to API...
Response status: 200
Download response: {...}
```

### 4. Test with Script

Use the test script to isolate backend issues:
```cmd
cd python-api
python test_download.py
```

## Common Issues & Solutions

### Issue: "Download failed" with no details
**Solution**: Check the terminal where Python API is running for detailed error logs

### Issue: FFmpeg not found
**Solution**: 
```cmd
ffmpeg -version
```
If not found, install from https://ffmpeg.org/download.html

### Issue: yt-dlp extraction error
**Solution**: Update yt-dlp:
```cmd
pip install --upgrade yt-dlp
```

### Issue: CORS error in browser
**Solution**: Make sure API is running on http://localhost:8000

### Issue: Slow conversion
**Solution**: Already optimized with:
- `ultrafast` preset
- Audio copy (no re-encoding)
- Smart codec detection (skips if already H.264)

## Log Levels

The API logs at different levels:
- **INFO**: Normal operations (download progress, codec detection)
- **WARNING**: Non-critical issues (temp file cleanup failed)
- **ERROR**: Critical failures (download failed, conversion error)

## What to Look For

When debugging, check for:
1. ✅ "Starting yt-dlp download..." - Download initiated
2. ✅ "Download complete" - Video fetched successfully
3. ✅ "Video codec: h264" or "hevc" - Codec detected
4. ✅ "Conversion complete" - H.264 conversion done
5. ❌ "Download failed" - Check error details below

## Performance Monitoring

The logs show:
- Download speed and progress
- Whether conversion was needed
- Total processing time
- File sizes

Example:
```
Video codec: hevc
Converting hevc to H.264 for Windows compatibility...
FFmpeg command: ffmpeg -i ... -c:v libx264 -preset ultrafast ...
Conversion complete
```

## Need More Help?

1. Share the terminal output from Python API
2. Share browser console logs (F12)
3. Share the `api.log` file
4. Mention the specific URL that failed
