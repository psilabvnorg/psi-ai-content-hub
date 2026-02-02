@echo off
echo Starting AI Content Hub Python API...
echo.
echo Checking Python installation...
python --version
if errorlevel 1 (
    echo Python is not installed or not in PATH!
    echo Please install Python 3.9+ from https://www.python.org/
    pause
    exit /b 1
)

echo.
echo Checking FFmpeg installation...
ffmpeg -version >nul 2>&1
if errorlevel 1 (
    echo WARNING: FFmpeg is not installed or not in PATH!
    echo Please install FFmpeg for video/audio processing
    echo Download from: https://ffmpeg.org/download.html
    echo.
    echo Continue anyway? (Y/N)
    set /p continue=
    if /i not "%continue%"=="Y" exit /b 1
)

echo.
echo Installing Python dependencies...
pip install -r requirements.txt

echo.
echo Starting FastAPI server on http://localhost:8000
echo API Documentation: http://localhost:8000/docs
echo.
python main.py
