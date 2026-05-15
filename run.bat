@echo off
title Roleplay Engine
echo ========================================
echo   Roleplay Engine - Starting...
echo ========================================
echo.

:: Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed.
    echo Download from https://nodejs.org/
    pause
    exit /b 1
)

:: Check Ollama connectivity
echo Checking Ollama connection at 192.168.4.2:11434...
curl -s http://192.168.4.2:11434/api/tags >nul 2>&1
if errorlevel 1 (
    echo WARNING: Cannot reach Ollama at 192.168.4.2:11434
    echo The engine will start but generation will fail until Ollama is reachable.
    echo.
) else (
    echo Ollama: Connected.
    echo.
)

:: Check Kokoro TTS connectivity
echo Checking Kokoro TTS connection at 192.168.4.2:8880...
curl -s http://192.168.4.2:8880/v1/audio/voices >nul 2>&1
if errorlevel 1 (
    echo WARNING: Cannot reach Kokoro TTS at 192.168.4.2:8880
    echo The engine will start but TTS will be unavailable.
    echo.
) else (
    echo TTS: Connected - voices available.
    echo.
)

:: Install dependencies if needed
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    echo.
)

:: Initialize database if needed
if not exist "data\global.db" (
    echo Initializing database...
    mkdir data 2>nul
    node scripts\init-db.js
    echo.
)

:: Start the application
echo Starting Roleplay Engine...
echo Server: http://localhost:3000
echo Ollama: http://192.168.4.2:11434
echo TTS:    http://192.168.4.2:8880
echo.
echo Press Ctrl+C to stop.
echo.

:: Start Next.js dev server
call npm run dev
