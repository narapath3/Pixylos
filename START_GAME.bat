@echo off
title PixelWorld Launcher
echo 🚀 Preparing PixelWorld...

:: Start server in a new window
echo 🌍 Starting Game Server...
start "PixelWorld Server" cmd /c "run_server.bat"

:: Wait for server to initialize
echo ⏳ Waiting for server to start...
timeout /t 3 /nobreak > nul

:: Open game in browser
echo 🎮 Opening Game Client...
start http://localhost:3000

echo.
echo ✅ Game started! 
echo 💡 Keep the Server window open while playing.
pause
