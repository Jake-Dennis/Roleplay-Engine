# Self-elevating firewall setup for Roleplay Engine
# Right-click -> Run with PowerShell

$ruleName = "Roleplay Engine"
$port = 3000

# Check if running as admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    # Relaunch as admin
    $scriptPath = $MyInvocation.MyCommand.Path
    Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" -Verb RunAs
    exit
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Roleplay Engine - Firewall Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Remove old rule if exists
netsh advfirewall firewall delete rule name="$ruleName" | Out-Null

# Add new rule
$result = netsh advfirewall firewall add rule name="$ruleName" dir=in action=allow protocol=TCP localport=$port profile=any

if ($LASTEXITCODE -eq 0) {
    Write-Host "SUCCESS: Port $port is now open for external connections." -ForegroundColor Green
    Write-Host "You can now access the app from other devices on your network." -ForegroundColor Green
} else {
    Write-Host "FAILED: Could not add firewall rule." -ForegroundColor Red
    Write-Host "Error: $result" -ForegroundColor Red
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
