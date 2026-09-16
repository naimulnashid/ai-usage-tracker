@echo off
REM Stops the background dashboard. Double-click this.
REM There is no console window to Ctrl+C when it runs hidden, so this is the off switch.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\dashboard-stop.ps1"
echo.
pause
