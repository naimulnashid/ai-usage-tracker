<#
    Stops the background dashboard.

    With no console window there is no Ctrl+C, so this is how you turn it off.

    It stops only a server running THIS checkout's Next.js - never "whatever is
    listening on the port". Other local apps can share this port through a
    different bind address, and some of them are node too, so neither the
    port nor the process name is enough. dashboard-process.ps1 has the rule.

    -Port exists for testing that rule on a spare port. The dashboard itself
    always runs on 7842.
#>

param([int]$Port = 7842)

$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'dashboard-process.ps1')

$listeners = @(Get-PortListener -Port $Port -Root $root)

if ($listeners.Count -eq 0) {
    Write-Host "The dashboard is not running (nothing is listening on port $Port)."
    exit 0
}

# Stopping the listener is enough: the npm and PowerShell wrappers above it
# exit on their own once it is gone, and the service logs the exit.
$stopped = 0
foreach ($listener in $listeners) {
    if (-not $listener.IsDashboard) {
        $why = if ($listener.CommandLine) { "it runs: $($listener.CommandLine)" } else { 'its command line could not be read' }
        Write-Host "Port $Port ($($listener.Address)) is held by '$($listener.Name)' (PID $($listener.ProcessId)), which is not this dashboard - $why. Leaving it alone."
        continue
    }
    Stop-Process -Id $listener.ProcessId -Force
    Write-Host "Stopped the dashboard ($($listener.Name), PID $($listener.ProcessId), on $($listener.Address))."
    $stopped++
}

if ($stopped -eq 0) { exit 1 }
