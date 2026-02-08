@echo off
echo Stopping Python API server...

REM Kill by port 8788
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8788 ^| findstr LISTENING') do (
    echo Killing process %%a
    taskkill /PID %%a /F
)

REM Also kill any uvicorn processes
taskkill /IM python.exe /FI "WINDOWTITLE eq *uvicorn*" /F 2>nul

echo Python API server stopped.
pause
