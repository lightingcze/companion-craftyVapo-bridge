[CmdletBinding()]
param(
  [switch]$KeepConfiguration
)

$ErrorActionPreference = "Stop"
$installRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$appRoot = Join-Path $installRoot "app"
$startupRoot = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupRoot "Crafty Bridge.lnk"
$disabledMarker = Join-Path $installRoot "autostart.disabled"

New-Item -ItemType File -Path $disabledMarker -Force | Out-Null
Remove-Item -LiteralPath $shortcutPath -Force -ErrorAction SilentlyContinue

try {
  Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:4587/commands/bridge-shutdown" -TimeoutSec 3 | Out-Null
  Start-Sleep -Milliseconds 750
} catch {
  # The bridge may already be stopped.
}

if ($KeepConfiguration) {
  Write-Host "Crafty Bridge stopped and autostart removed. Configuration remains in $appRoot."
  exit 0
}

$cleanupScript = Join-Path $env:TEMP "remove-crafty-bridge-$PID.ps1"
$cleanupContent = @"
Start-Sleep -Seconds 1
Remove-Item -LiteralPath '$($installRoot.Replace("'", "''"))' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath `$MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue
"@
Set-Content -LiteralPath $cleanupScript -Value $cleanupContent -Encoding UTF8
Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
  -ArgumentList @("-NoProfile", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-File", "`"$cleanupScript`"") `
  -WindowStyle Hidden

Write-Host "Crafty Bridge was stopped and scheduled for removal."
