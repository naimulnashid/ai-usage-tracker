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
REM Beyond the obvious "the logon task already started it", `npm run dev` binds
REM 7842 as well - and a `next build` underneath a live server replaces chunks
REM it holds open. Exiting here means this window can never do that to one.
netstat -ano | findstr /r /c:"LISTENING" | findstr /c:":%PORT% " >nul 2>&1
if not errorlevel 1 (
    echo The dashboard is already running on port %PORT%.
    echo.
    echo NOTE: this window did not start it - something else is already serving
    echo that port. Most likely the "Start AI Usage Dashboard" logon task, or an
    echo "npm run dev" you left running. Nothing to do; opening the browser.
    echo Run stop-dashboard.bat first if you want this window to serve it instead.
    start "" "%URL%"
    echo.
    pause
    exit /b 0
)

REM --- Dependencies and a production build -----------------------------------
REM scripts\ensure-build.ps1 decides, and it is the SAME script the logon task
REM runs, so the two launchers never disagree about what "a build" or "stale"
REM means. It:
REM   - installs dependencies if node_modules is missing
REM   - builds ONLY when there is no complete build (BUILD_ID and .next\server)
REM     - `npm start` against no `.next` exits immediately, so there would be
REM     nothing to open. This used to rebuild on every single launch, which
REM     cost ~15s each time and turned a broken build into a start-up failure.
REM   - WARNS when the source is newer than the build, rather than serving the
REM     old one silently - for this app that would once have meant serving a
REM     version from before the password gate existed. (The logon task
REM     rebuilds instead: it has no window to warn in.)
REM
REM Set FORCE_BUILD=1 before running this to rebuild anyway.
set "FORCE="
if not "%FORCE_BUILD%"=="" set "FORCE=-Force"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\ensure-build.ps1" %FORCE%
if errorlevel 1 (
    echo.
    echo ERROR: there is no build to serve. See the messages above.
    pause
    exit /b 1
)

REM --- Open the browser once the server is listening -------------------------
REM A listening port is the signal, not an HTTP answer. `next start` opens the
REM port a moment before it has finished starting, but holds any request that
REM arrives in that moment until it is ready, rather than refusing it - so once
REM the port listens, the browser's request will be answered. Nothing else can
REM be the listener: the check above exits if anything held the port already.
REM
REM This is what the Data Usage dashboard's launcher does, and it sidesteps
REM everything an HTTP probe has to get right: localhost resolving to ::1 first
REM (a ~2 s fallback against a server on 127.0.0.1 alone), a login redirect
REM that names localhost, and a password gate answering 401.
REM
REM /b keeps the waiter in this console, so closing the window takes it along,
REM and its "did not start" message lands here rather than in a window of its
REM own.
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline = (Get-Date).AddSeconds(180); while ((Get-Date) -lt $deadline) { if (Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue) { Start-Process '%URL%'; exit 0 }; Start-Sleep -Milliseconds 400 }; Write-Host 'The server did not start within 3 minutes - see the output above.'; exit 1"

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
