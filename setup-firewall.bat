@echo off
:: Run this script as Administrator to open port 3000 in Windows Firewall
:: Right-click this file -> "Run as administrator"

echo ========================================
echo   Roleplay Engine - Firewall Setup
echo ========================================
echo.
echo Opening port 3000 for external access...
echo.

:: Remove old rule if it exists (clean slate)
netsh advfirewall firewall delete rule name="Roleplay Engine" >nul 2>&1

:: Add the rule
netsh advfirewall firewall add rule name="Roleplay Engine" dir=in action=allow protocol=TCP localport=3000 profile=any

if %errorlevel% equ 0 (
    echo.
    echo SUCCESS: Port 3000 is now open for external connections.
    echo You can now access the app from other devices on your network.
) else (
    echo.
    echo FAILED: Could not add firewall rule.
    echo Make sure you ran this script as Administrator.
)

echo.
pause
