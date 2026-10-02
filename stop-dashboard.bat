@echo off
REM ---------------------------------------------------------------------------
REM Stops the AI Usage Dashboard. Double-click this.
REM
REM When the dashboard runs from its logon task it runs HIDDEN - there is no
REM console window to Ctrl+C - so this is the off switch. It also works on a
REM server started by start-ai-usage-dashboard.bat or `npm run dev`: it stops
REM THIS checkout's server on port 7842, however it was started, and leaves any
REM other program on that port alone (scripts\dashboard-process.ps1 has the
REM rule).
REM
REM Run it before `npm run dev` or `npm run build`: they share .next with the
REM running server, and a build under a live server replaces chunks it holds
REM open.
REM
REM It stops the SERVER only. It also leaves the logon task REGISTERED, so the
REM dashboard comes back at your next sign-in; to unregister it as well, run
REM   powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1 -Remove
REM ---------------------------------------------------------------------------
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\dashboard-stop.ps1"
echo.
pause
