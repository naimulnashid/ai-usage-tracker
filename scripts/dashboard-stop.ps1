<#
    Stops the background dashboard.

    With no console window there is no Ctrl+C, so this is how you turn it off.
#>

$port = 7842
$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue

if (-not $listener) {
    Write-Host "The dashboard is not running (nothing is listening on port $port)."
    exit 0
}

# Only ever kill node. If something else has taken the port, say so rather than
# terminating a process the user did not mean to lose.
$stopped = 0
foreach ($procId in ($listener.OwningProcess | Select-Object -Unique)) {
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if (-not $proc) { continue }
    if ($proc.ProcessName -ne 'node') {
        Write-Host "Port $port is held by '$($proc.ProcessName)' (PID $procId), not the dashboard. Leaving it alone."
        continue
    }
    Stop-Process -Id $procId -Force
    Write-Host "Stopped the dashboard (node, PID $procId)."
    $stopped++
}

if ($stopped -eq 0) { exit 1 }
