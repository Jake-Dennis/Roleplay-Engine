@echo off
title Roleplay Engine

:: Save the script's directory so we can return after any elevation
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
    echo Download from https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js: OK

:: Get local IP for display (prefer 192.168.x.x or 10.x.x.x, skip Hyper-V)
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4" ^| findstr /v "172." ^| findstr /v "169."') do (
    set "LOCAL_IP=%%a"
    goto :ip_found
)
:ip_found
set "LOCAL_IP=%LOCAL_IP: =%"

:: Check Ollama connectivity
echo Checking Ollama connection at 192.168.4.2:11434...
curl -sf http://192.168.4.2:11434/api/tags >nul 2>&1
if errorlevel 1 (
    echo WARNING: Cannot reach Ollama at 192.168.4.2:11434
    echo The engine will start but generation will fail until Ollama is reachable.
    echo.
) else (
    echo Ollama: Connected
    echo.
)

:: Check Kokoro TTS connectivity
echo Checking Kokoro TTS connection at 192.168.4.2:8880...
curl -sf http://192.168.4.2:8880/v1/audio/voices >nul 2>&1
if errorlevel 1 (
    echo WARNING: Cannot reach Kokoro TTS at 192.168.4.2:8880
    echo The engine will start but TTS will be unavailable.
    echo.
) else (
    echo TTS: Connected - voices available.
    echo.
)

:: Firewall check - ensure port 3000 is accessible externally
echo Checking firewall for port 3000...
netsh advfirewall firewall show rule name="Roleplay Engine" >nul 2>&1
if errorlevel 1 (
    echo Firewall rule not found. Opening firewall setup...
    echo A UAC prompt will appear - click Yes to allow external access.
    echo.
    cd /d "%SCRIPT_DIR%"
    powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%setup-firewall.ps1"
    cd /d "%SCRIPT_DIR%"
    echo.
    :: Check again after setup
    netsh advfirewall firewall show rule name="Roleplay Engine" >nul 2>&1
    if errorlevel 1 (
        echo WARNING: Firewall rule was not added. External connections may be blocked.
        echo.
    ) else (
        echo Firewall: Port 3000 opened for external access.
        echo.
    )
) else (
    echo Firewall: Port 3000 already allowed.
    echo.
)

:: Kill any existing server on port 3000
echo Checking for existing server...
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force" >nul 2>&1
timeout /t 2 /nobreak >nul
echo No existing server found.
echo.

:: UPnP Port Forwarding check
echo Checking UPnP port forwarding...
cd /d "%SCRIPT_DIR%"
powershell -ExecutionPolicy Bypass -Command "$upnp = New-Object -ComObject HNetCfg.NATUPnP -ErrorAction SilentlyContinue; if ($upnp -and $upnp.StaticPortMappingCollection) { $mappings = $upnp.StaticPortMappingCollection; $found = $false; foreach ($m in $mappings) { if ($m.ExternalPort -eq 3000) { $found = $true; Write-Host 'UPnP: Port 3000 already forwarded' -ForegroundColor Green; break } }; if (-not $found) { $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*' } | Select-Object -First 1).IPAddress; if ($ip) { try { $mappings.Add(3000, 'TCP', 3000, $ip, $true, 'Roleplay Engine'); Write-Host 'UPnP: Port 3000 forwarded to' $ip -ForegroundColor Green } catch { Write-Host 'UPnP: Router does not support automatic forwarding' -ForegroundColor Yellow } } else { Write-Host 'UPnP: Could not determine local IP' -ForegroundColor Yellow } } } else { Write-Host 'UPnP: Not supported by router - please add port forwarding manually:' -ForegroundColor Yellow; Write-Host '  1. Open http://192.168.4.1 in browser' -ForegroundColor Yellow; Write-Host '  2. Find Port Forwarding / Virtual Server' -ForegroundColor Yellow; Write-Host '  3. Add rule: External 3000 -> Internal 3000 on 192.168.6.76 (TCP)' -ForegroundColor Yellow }"
cd /d "%SCRIPT_DIR%"
echo.

:: Ensure we're in the correct directory
cd /d "%SCRIPT_DIR%"

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
    cd /d "%SCRIPT_DIR%"
    call npx tsx scripts\init-db.ts
    echo.
)

:: Get external IP for display
for /f "delims=" %%a in ('curl -sf https://api.ipify.org 2^>nul') do set "EXT_IP=%%a"

:: Start the application
echo Starting Roleplay Engine...
echo Local:    http://localhost:3000
echo Network:  http://%LOCAL_IP%:3000
echo External: http://ragecage.ddns.net:3000
echo Ollama:   http://192.168.4.2:11434
echo TTS:      http://192.168.4.2:8880
echo.
echo Press Ctrl+C to stop.
echo.

:: Start Next.js production server
cd /d "%SCRIPT_DIR%"
call npm start

echo.
echo ========================================
echo   Server stopped.
echo ========================================
pause
