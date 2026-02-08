@echo off
echo Killing all Node.js and Electron processes...
taskkill /F /IM node.exe 2>nul
taskkill /F /IM electron.exe 2>nul
echo Done! All processes killed.
echo.
echo Now run: npm run electron:dev
pause
