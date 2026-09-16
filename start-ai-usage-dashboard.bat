@echo off
setlocal

REM ---------------------------------------------------------------------------
REM Starts the AI Usage Dashboard and opens it in your browser.
REM
REM Double-click this file. It will, in order:
REM   1. install dependencies if node_modules is missing
REM   2. build the production bundle ONLY if there isn't one - after a code
REM      change you rebuild yourself with `npm run build`; this warns if you
REM      forgot rather than rebuilding behind your back
REM   3. start the server on http://localhost:7842
REM   4. open your browser once the server is actually responding
REM
REM By default only this machine can reach it. To let other devices on your
REM network in, set DASHBOARD_LAN=1 before running this - and only with a strong
REM DASHBOARD_PASSWORD set (see the README).
REM
REM Keep this window open - closing it stops the dashboard.
REM ---------------------------------------------------------------------------

cd /d "%~dp0"

set "PORT=7842"
set "URL=http://localhost:%PORT%"
set "START_SCRIPT=start"
if "%DASHBOARD_LAN%"=="1" set "START_SCRIPT=start:lan"

where npm >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm was not found on your PATH.
    echo Install Node.js 20+ from https://nodejs.org and try again.
    echo.
    pause
    exit /b 1
)

REM --- Is the dashboard already running? ------------------------------------
netstat -ano | findstr /r /c:"LISTENING" | findstr /c:":%PORT% " >nul 2>&1
if not errorlevel 1 (
    echo The dashboard is already running on port %PORT%.
    echo.
    echo NOTE: this window did not start it - something else is already serving
    echo that port, most likely the "Start AI Usage Dashboard" logon task. Nothing to
    echo do; opening the browser.
    start "" "%URL%"
    echo.
    pause
    exit /b 0
)

REM --- Dependencies ----------------------------------------------------------
if not exist "node_modules" (
    echo Installing dependencies. This happens once and takes a minute...
    call npm install
    if errorlevel 1 (
        echo.
        echo ERROR: npm install failed. See the messages above.
        pause
        exit /b 1
    )
)

REM --- Production build ------------------------------------------------------
REM Build only when there ISN'T one. This used to rebuild on every single launch
REM - which cost ~15s each time and turned a broken build into a start-up
REM failure. Building is now a thing you do after changing code (`npm run
REM build`), where the output is in front of you and a failure is obvious.
REM
REM A MISSING build is the one case that still has to build here: `npm start`
REM against no `.next` exits immediately, so there would be nothing to open.
REM
REM Set FORCE_BUILD=1 before running this to rebuild anyway.
set "DO_BUILD="
if not exist ".next\BUILD_ID" set "DO_BUILD=1"
if not "%FORCE_BUILD%"=="" set "DO_BUILD=1"

REM Stale builds are reported, not fixed. Serving the previous build silently is
REM what this warning exists to prevent - for this app that would once have
REM meant serving a version from before the password gate existed. PowerShell
REM signals it through its exit code rather than stdout, so nothing here has to
REM survive `for /f` quoting - and the whole check sits inside the block so a
REM leftover errorlevel from npm install can never be read as "stale".
set "STALE="
if not defined DO_BUILD (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$b = (Get-Item '.next\BUILD_ID' -ErrorAction SilentlyContinue).LastWriteTime; if (-not $b) { exit 0 }; $s = @(); foreach ($d in 'src', 'config') { if (Test-Path $d) { $s += Get-ChildItem $d -Recurse -File -ErrorAction SilentlyContinue } }; foreach ($f in 'package.json', 'next.config.mjs') { if (Test-Path $f) { $s += Get-Item $f } }; $n = ($s | Measure-Object -Property LastWriteTime -Maximum).Maximum; if ($n -and $n -gt $b) { exit 1 }; exit 0"
    if errorlevel 1 set "STALE=1"
)

if defined STALE (
    echo.
    echo WARNING: your source files are newer than the production build.
    echo          This window will serve the OLD build. Run "npm run build"
    echo          - or set FORCE_BUILD=1 - to pick up your changes.
    echo.
)

if not exist ".next\BUILD_ID" echo No production build found - this is the one case that builds here.
if defined DO_BUILD (
    echo Building the dashboard. This takes about 15 seconds...
    call npm run build
    if errorlevel 1 (
        echo.
        echo ERROR: build failed. See the messages above.
        pause
        exit /b 1
    )
)

REM --- Open the browser once the server responds -----------------------------
REM Launched first, in the background, so it can poll while the server boots.
REM Opening the URL immediately would just show a connection error.
start "" /min powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "for ($i = 0; $i -lt 60; $i++) { try { $r = Invoke-WebRequest '%URL%' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { Start-Process '%URL%'; break } } catch { Start-Sleep -Seconds 1 } }"

echo.
echo Starting the dashboard on %URL%
if "%START_SCRIPT%"=="start:lan" (
    echo Listening on every network interface - other devices can reach it.
) else (
    echo Listening on this machine only. Set DASHBOARD_LAN=1 to allow other devices.
)
echo Your browser will open automatically once it is ready.
echo.
echo Close this window to stop the dashboard.
echo.

call npm run %START_SCRIPT%
