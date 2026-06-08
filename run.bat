@echo off
title Roleplay Engine

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo ========================================
echo   Roleplay Engine - Starting...
echo ========================================
echo.

:: Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed.
    pause
    exit /b 1
)
echo Node.js: OK

:: Read service addresses from .env.local (or use defaults)
if exist ".env.local" (
    for /f "tokens=2 delims==" %%a in ('findstr /b "OLLAMA_HOST=" .env.local') do set "OLLAMA_HOST=%%a"
    for /f "tokens=2 delims==" %%a in ('findstr /b "OLLAMA_PORT=" .env.local') do set "OLLAMA_PORT=%%a"
    for /f "tokens=2 delims==" %%a in ('findstr /b "TTS_HOST=" .env.local') do set "TTS_HOST=%%a"
    for /f "tokens=2 delims==" %%a in ('findstr /b "TTS_PORT=" .env.local') do set "TTS_PORT=%%a"
)
if not defined OLLAMA_HOST set "OLLAMA_HOST=192.168.6.1"
if not defined OLLAMA_PORT set "OLLAMA_PORT=11434"
if not defined TTS_HOST set "TTS_HOST=192.168.4.2"
if not defined TTS_PORT set "TTS_PORT=8880"

:: Quick Ollama check (timeout after 4s)
echo Checking Ollama connection at %OLLAMA_HOST%:%OLLAMA_PORT%...
powershell -NoProfile -Command "try { Invoke-RestMethod -Uri 'http://%OLLAMA_HOST%:%OLLAMA_PORT%/api/tags' -TimeoutSec 4 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
    echo WARNING: Cannot reach Ollama at %OLLAMA_HOST%:%OLLAMA_PORT%
    echo The engine will start but generation will fail until Ollama is reachable.
) else (
    echo Ollama: Connected
)
echo.

:: Quick TTS check (timeout after 4s)
echo Checking TTS connection at %TTS_HOST%:%TTS_PORT%...
powershell -NoProfile -Command "try { Invoke-RestMethod -Uri 'http://%TTS_HOST%:%TTS_PORT%/v1/audio/voices' -TimeoutSec 4 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
    echo WARNING: Cannot reach TTS at %TTS_HOST%:%TTS_PORT%
    echo The engine will start but TTS will be unavailable.
) else (
    echo TTS: Connected
)
echo.

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
    call npx tsx scripts\init-db.ts
    echo.
)

:: Clear stale build cache
if exist ".next" (
    rmdir /s /q ".next" >nul 2>&1
)

:: Start the application
echo Starting Roleplay Engine (development mode)...
echo Local:    http://localhost:3000
echo Ollama:   http://%OLLAMA_HOST%:%OLLAMA_PORT%
echo TTS:      http://%TTS_HOST%:%TTS_PORT%
echo.
echo Press Ctrl+C to stop.
echo.

call npm run dev

echo.
echo ========================================
echo   Server stopped.
echo ========================================
pause
