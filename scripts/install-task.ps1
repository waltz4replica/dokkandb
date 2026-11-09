# Creates (or replaces) the Windows scheduled task that runs update-from-pc.ps1
# every 3 hours and when you sign in. It runs hidden and only while you are signed in.
# Remove it with:  Unregister-ScheduledTask -TaskName 'DokkanDB - actualizar datos' -Confirm:$false

$name = 'DokkanDB - actualizar datos'
$script = Join-Path $PSScriptRoot 'update-from-pc.ps1'

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""
$every3h = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Hours 3)
$atLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $name -Action $action -Trigger @($every3h, $atLogon) -Settings $settings `
  -Principal $principal -Description 'Lee la tier list y los eventos de DokkanStats y los sube a GitHub para la app DokkanDB.' -Force | Out-Null
Get-ScheduledTask -TaskName $name | Select-Object TaskName, State
