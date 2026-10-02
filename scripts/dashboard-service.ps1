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

# The log is written by more than one process at once. While the server runs,
# its output streams in here for hours - and a second copy of this script (a
# re-run task, a double-clicked .vbs) still has to be able to add its line.
# Out-File and Add-Content both open the file refusing other writers, which
# made that second copy die on an IOException with nothing logged at all.
#
# So every writer opens the file sharing it (FileShare.ReadWrite), with the
# AppendData right and nothing else. That is what makes sharing safe: with no
# general write access, Windows places each write at the end of the file as
# one operation, wherever the file has grown to since. A plain write handle
# keeps its own position, and seeking to the end before each write is not
# enough - measured with two processes appending at once, seek-then-write lost
# 2677 of 6000 lines, each written over by the other process. AppendData lost
# none, in Windows PowerShell 5.1 and PowerShell 7 alike.
#
# One Write() per line keeps each line one operation. The bytes are what
# Out-File wrote: UTF-8, CRLF, and a BOM on a new file.
$logEncoding = New-Object System.Text.UTF8Encoding $false
$logPreamble = (New-Object System.Text.UTF8Encoding $true).GetPreamble()

function Open-LogStream {
    $mode = [System.IO.FileMode]::Append
    $rights = [System.Security.AccessControl.FileSystemRights]::AppendData
    $share = [System.IO.FileShare]::ReadWrite
    $none = [System.IO.FileOptions]::None
    if ($PSVersionTable.PSEdition -eq 'Core') {
        # .NET Core dropped this FileStream constructor; the same call lives here.
        return [System.IO.FileSystemAclExtensions]::Create((New-Object System.IO.FileInfo $log),
            $mode, $rights, $share, 4096, $none, $null)
    }
    return New-Object System.IO.FileStream($log, $mode, $rights, $share, 4096, $none)
}

function Add-LogLine([System.IO.FileStream]$stream, [string]$text) {
    $bytes = $logEncoding.GetBytes($text + [Environment]::NewLine)
    if ($stream.Length -eq 0) { $bytes = [byte[]]($logPreamble + $bytes) }
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush()
}

function Write-Log($message) {
    $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $message
    # Logging is never what stops this script. A writer that does not share -
    # a copy of this script from before the log was shared, still serving -
    # can hold the file for hours, so try briefly and then carry on without.
    for ($try = 0; $try -lt 5; $try++) {
        try {
            $stream = Open-LogStream
            try { Add-LogLine $stream $line } finally { $stream.Dispose() }
            return
        }
        catch { Start-Sleep -Milliseconds 200 }
    }
}

# Streams a command's output into the log line by line as it arrives; the
# server runs for hours, so nothing may wait for it to finish. Strings go in as
# they are, anything else through the same formatting Out-File applied.
function Write-LogOutput {
    begin { $stream = Open-LogStream }
    process {
        $lines = if ($_ -is [string]) { $_ } else { $_ | Out-String -Stream }
        foreach ($text in $lines) { Add-LogLine $stream $text }
    }
    end { $stream.Dispose() }
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

    # Dependencies, and a current build. The rule lives in ensure-build.ps1,
    # shared with start-ai-usage-dashboard.bat so the two launchers can never
    # disagree. -RebuildStale is this launcher's half of it: the .bat only
    # warns, but this has no window to warn in, and a WARNING here was a line
    # nobody reads at logon. It rebuilds only when the source is newer than
    # the build, so the ~15s lands on the first logon after a change. A build
    # that fails leaves no dashboard, and this log says why.
    & (Join-Path $PSScriptRoot 'ensure-build.ps1') -RebuildStale *>&1 | Write-LogOutput
    if ($LASTEXITCODE -ne 0) {
        Write-Log "ERROR: no build to serve (ensure-build exited $LASTEXITCODE). Dashboard not started."
        exit 1
    }
    Set-Location $root

    $script = if ($Lan) { 'start:lan' } else { 'start' }
    $scope = if ($Lan) { 'every network interface' } else { 'this machine only' }
    Write-Log "Starting the dashboard on port $port, listening on $scope."
    & $npm run $script *>&1 | Write-LogOutput
    Write-Log "Server exited with code $LASTEXITCODE."
}
catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    exit 1
}
