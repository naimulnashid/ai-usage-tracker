<#
    Registers (or removes) the logon task that starts the dashboard invisibly.

        powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1
        powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1 -Lan
        powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1 -Remove

    Runs as you, only when you are logged on, so Windows never has to store your
    password and no admin rights are needed.

    -Lan registers the task to listen on every network interface, so other
    devices can reach the dashboard. Without it, only this machine can. Running
    the script again replaces the existing task, so switching is just a re-run.
#>

param([switch]$Remove, [switch]$Lan)

$ErrorActionPreference = 'Stop'

$taskName = 'Start AI Usage Dashboard'
$root = Split-Path -Parent $PSScriptRoot
$vbs = Join-Path $root 'scripts\dashboard-hidden.vbs'

if ($Remove) {
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
        Write-Host "Removed the '$taskName' logon task. The dashboard will no longer start automatically."
        Write-Host "Anything already running keeps running - use scripts\dashboard-stop.ps1 to stop it."
    } else {
        Write-Host "No '$taskName' task is registered."
    }
    exit 0
}

if (-not (Test-Path $vbs)) { throw "Launcher not found at $vbs" }

$vbsArgs = if ($Lan) { '"{0}" -Lan' -f $vbs } else { '"{0}"' -f $vbs }
$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument $vbsArgs
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

# Defaults built for laptops actively fight a long-running server: Windows will
# refuse to start it on battery and kill it after three days. Turn all of that
# off. StartWhenAvailable catches a logon the task missed.
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -DontStopOnIdleEnd `
    -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $taskName `
    -Action $action -Trigger $trigger -Settings $settings `
    -Description 'Starts the local AI Usage Dashboard in the background at logon.' `
    -Force | Out-Null

$scope = if ($Lan) { 'every network interface' } else { 'this machine only' }
$startNow = if ($Lan) { 'wscript scripts\dashboard-hidden.vbs -Lan' } else { 'wscript scripts\dashboard-hidden.vbs' }
Write-Host "Registered '$taskName'. It will start the dashboard hidden at every logon, listening on $scope."
Write-Host "Start it now without logging out:  $startNow"
