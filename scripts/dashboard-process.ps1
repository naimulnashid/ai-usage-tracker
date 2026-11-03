<#
    Tells THIS dashboard's server apart from anything else on its port.
    Dot-sourced by dashboard-stop.ps1 and dashboard-service.ps1.

    A port is not an identity. On Windows a server bound to 127.0.0.1 starts
    happily on a port another program already holds with a wildcard (0.0.0.0
    or ::) listener, so Get-NetTCPConnection -LocalPort can return two owners,
    and "the node process on 7842" can be somebody else's Next.js app. Killing
    by port is how a demo run once took down another local dashboard.

    So a listener counts as this dashboard only when its command line runs
    Next.js out of THIS checkout's node_modules:

        "node" "<repo>\node_modules\.bin\\..\next\dist\bin\next" start -p 7842

    Anchoring on "<repo>\node_modules\" rather than on "<repo>" alone is
    deliberate. The bare path would also match a sibling folder whose name
    merely starts with this one's (a backup copy, say), or any process that
    only mentions the repo in an argument.

    Anything that cannot be confirmed - including a command line Windows will
    not show us, as for an elevated process - is treated as NOT ours. The
    callers leave it alone and say why: refusing to act is recoverable, killing
    the wrong server is not.

    Windows PowerShell 5.1 runs this: no ?. or ?? operators, and ASCII only.
#>

function ConvertTo-ComparablePath([string]$Text) {
    # Launchers spell the same path differently: forward slashes, and doubled
    # separators such as the "\\.." npm writes into its shims.
    return (($Text -replace '/', '\') -replace '\\{2,}', '\')
}

function Test-DashboardCommandLine([string]$CommandLine, [string]$Root) {
    if ([string]::IsNullOrWhiteSpace($CommandLine)) { return $false }
    $needle = (ConvertTo-ComparablePath $Root).TrimEnd('\') + '\node_modules\'
    $haystack = ConvertTo-ComparablePath $CommandLine
    return $haystack.IndexOf($needle, [StringComparison]::OrdinalIgnoreCase) -ge 0
}

# One entry per process listening on $Port, whatever address it bound.
# A listener by its shape, not its State: Windows' TCP table misreports that
# (measured 2026-10-29, build 26300 -- a live listener read Closed, FinWait1
# or blank, while a row with PID 0 and remote 127.0.0.1:0 read Listen, so
# -State Listen said "not running" over a running server). A listener is the
# row with no remote end and a real owner; every connection has a remote port,
# and the phantom has neither a wildcard remote nor a PID. Both callers
# get the rule from here.
function Get-PortListener([int]$Port, [string]$Root) {
    $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
        Where-Object { $_.RemotePort -eq 0 -and $_.RemoteAddress -in '0.0.0.0', '::' -and $_.OwningProcess -gt 0 }
    foreach ($procId in ($connections.OwningProcess | Select-Object -Unique)) {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
        if (-not $proc) { continue }  # exited between the two calls
        $addresses = ($connections | Where-Object { $_.OwningProcess -eq $procId }).LocalAddress
        [pscustomobject]@{
            ProcessId   = [int]$procId
            Name        = $proc.Name
            Address     = ($addresses | Select-Object -Unique) -join ', '
            CommandLine = $proc.CommandLine
            IsDashboard = Test-DashboardCommandLine $proc.CommandLine $Root
        }
    }
}
