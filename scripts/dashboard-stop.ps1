<#
    Stops the background dashboard.

    With no console window there is no Ctrl+C, so this is how you turn it off.

    It stops only a server running THIS checkout's Next.js - never "whatever is
    listening on the port". Other local apps can share this port through a
    different bind address, and some of them are node too, so neither the
    port nor the process name is enough. dashboard-process.ps1 has the rule.

        -WhatIf    show which process would be stopped, and stop nothing
        -Port      try the rule on a spare port; the dashboard is on 7842
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param([int]$Port = 7842)

# -WhatIf would otherwise reach PowerShell's automatic import of the two
# modules dashboard-process.ps1 uses and print a "What if: Set Alias" line for
# every alias they define. Import them first with it off; ShouldProcess still
# sees -WhatIf.
$dryRun = $WhatIfPreference
$WhatIfPreference = $false
Import-Module NetTCPIP, CimCmdlets
$WhatIfPreference = $dryRun

$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'dashboard-process.ps1')

# Tell dashboard-service.ps1 this stop is wanted, before anything is stopped:
# it restarts a server that exits on its own, and without this marker a stop
# would look exactly like a crash. Written even when nothing is listening,
# because the service may be in its 60-second wait before a restart. A
# marker nobody reads is cleared when the service next starts.
if (-not $dryRun) {
    $logDir = Join-Path $root 'logs'
    if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
    Set-Content -Path (Join-Path $logDir 'dashboard.stop') -Value (Get-Date -Format o) -Encoding ascii
}

$listeners = @(Get-PortListener -Port $Port -Root $root)

if ($listeners.Count -eq 0) {
    Write-Host "The dashboard is not running (nothing is listening on port $Port)."
    exit 0
}

# Stopping the listener is enough: the npm and PowerShell wrappers above it
# exit on their own once it is gone, and the service logs the exit.
$ours = 0
foreach ($listener in $listeners) {
    if (-not $listener.IsDashboard) {
        $why = if ($listener.CommandLine) { "it runs: $($listener.CommandLine)" } else { 'its command line could not be read' }
        Write-Host "Port $Port ($($listener.Address)) is held by '$($listener.Name)' (PID $($listener.ProcessId)), which is not this dashboard - $why. Leaving it alone."
        continue
    }
    $ours++
    if ($PSCmdlet.ShouldProcess("$($listener.Name), PID $($listener.ProcessId), port $Port", 'Stop the dashboard')) {
        Stop-Process -Id $listener.ProcessId -Force
        Write-Host "Stopped the dashboard ($($listener.Name), PID $($listener.ProcessId), on $($listener.Address))."
    }
}

if ($ours -eq 0) { exit 1 }
