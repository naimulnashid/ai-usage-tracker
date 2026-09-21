<#
    Runs the AI Usage Dashboard in the background, with no console window.

    Invoked by scripts\dashboard-hidden.vbs, which is what the "Start AI Usage
    Dashboard" scheduled task runs at logon. Safe to run by hand too.

    By default the server listens on this machine only (127.0.0.1). Pass -Lan
    to listen on every interface so other devices on your network can reach it
    - only with a strong DASHBOARD_PASSWORD set; see the README.

    Because nothing is visible when this runs, everything it does is appended to
    logs\dashboard.log - that file is the only way to find out why the dashboard
    did not come up.
#>

param([switch]$Lan)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$port = 7842
$logDir = Join-Path $root 'logs'
$log = Join-Path $logDir 'dashboard.log'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

function Write-Log($message) {
    "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $message |
        Add-Content -Path $log -Encoding utf8
}

try {
    # Already listening? Never start a second server on the port. If it is
    # another copy of this dashboard, there is nothing to do. If it is some
    # other program, say so: a bare "already running" here would leave the
    # dashboard down until the next logon with a log claiming it was up. And do
    # not start alongside it either - a different bind address would let both
    # listen, with this machine's browser reaching whichever is more specific.
    . (Join-Path $PSScriptRoot 'dashboard-process.ps1')
    $held = @(Get-PortListener -Port $port -Root $root)
    if ($held.Count -gt 0) {
        $ours = @($held | Where-Object { $_.IsDashboard })
        if ($ours.Count -gt 0) {
            Write-Log "Already running on port $port (PID $(($ours.ProcessId) -join ', ')) - nothing to do."
            exit 0
        }
        $others = ($held | ForEach-Object { "'$($_.Name)' PID $($_.ProcessId) on $($_.Address)" }) -join '; '
        Write-Log "ERROR: port $port is held by another program ($others), not this dashboard. Dashboard not started."
        exit 1
    }

    # npm is npm.cmd on Windows, and a scheduled task's PATH is not the one from
    # an interactive shell, so resolve it explicitly rather than assuming.
    # Note: no ?. operator here - this runs under Windows PowerShell 5.1, where
    # that is a parse error and the whole script dies before it can even log why.
    $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    $npm = if ($npmCommand) { $npmCommand.Source } else { $null }
    if (-not $npm) {
        Write-Log 'ERROR: npm.cmd not found on PATH. Is Node.js installed?'
        exit 1
    }

    if (-not (Test-Path 'node_modules')) {
        Write-Log 'Installing dependencies...'
        & $npm install *>&1 | Out-File -FilePath $log -Append -Encoding utf8
    }

    # Never build at logon. Building here delayed every boot by ~15s and, worse,
    # made a broken build a *startup* failure - the dashboard simply never
    # appeared and the only trace was a line in this log. Building is now a
    # thing you do after changing code (`npm run build`), which is where a
    # failure is visible and fixable.
    #
    # The one exception is having no build at all, which is not a stale-code
    # risk but a can't-start-at-all one: `npm start` against a missing `.next`
    # exits immediately. So build when, and only when, BUILD_ID is absent.
    #
    # Staleness is still detected - it just warns instead of acting. That
    # matters because serving the previous build silently would once have meant
    # serving a version of this app from before the password gate existed. The
    # warning in dashboard.log is how you find out you forgot to rebuild.
    $buildId = Join-Path $root '.next\BUILD_ID'

    if (-not (Test-Path $buildId)) {
        Write-Log 'No production build found - building once (about 15s)...'
        & $npm run build *>&1 | Out-File -FilePath $log -Append -Encoding utf8
        if ($LASTEXITCODE -ne 0) {
            Write-Log "ERROR: build failed with exit code $LASTEXITCODE. Dashboard not started."
            exit 1
        }
    }
    else {
        $builtAt = (Get-Item $buildId).LastWriteTime
        $sources = @()
        foreach ($dir in 'src', 'config') {
            if (Test-Path $dir) {
                $sources += Get-ChildItem -Path $dir -Recurse -File -ErrorAction SilentlyContinue
            }
        }
        foreach ($file in 'package.json', 'next.config.mjs') {
            if (Test-Path $file) { $sources += Get-Item $file }
        }
        $newest = ($sources | Measure-Object -Property LastWriteTime -Maximum).Maximum
        if ($null -ne $newest -and $newest -gt $builtAt) {
            Write-Log "WARNING: source is newer than the build ($($newest.ToString('yyyy-MM-dd HH:mm:ss')) vs $($builtAt.ToString('yyyy-MM-dd HH:mm:ss'))). Serving the OLD build - run 'npm run build' and restart to pick up the changes."
        }
    }

    $script = if ($Lan) { 'start:lan' } else { 'start' }
    $scope = if ($Lan) { 'every network interface' } else { 'this machine only' }
    Write-Log "Starting the dashboard on port $port, listening on $scope."
    & $npm run $script *>&1 | Out-File -FilePath $log -Append -Encoding utf8
    Write-Log "Server exited with code $LASTEXITCODE."
}
catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    exit 1
}
