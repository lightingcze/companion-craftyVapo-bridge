$ErrorActionPreference = "Stop"

$installRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$appRoot = Join-Path $installRoot "app"
$nodePath = Join-Path $installRoot "runtime\node.exe"
$serverPath = Join-Path $appRoot "src\server.js"
$logsRoot = Join-Path $installRoot "logs"
$disabledMarker = Join-Path $installRoot "autostart.disabled"

if (Test-Path -LiteralPath $disabledMarker) {
  exit 0
}

try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:4587/health" -TimeoutSec 2
  if ($health.ok) {
    exit 0
  }
} catch {
  # Start a new instance when the local health endpoint is unavailable.
}

if (-not (Test-Path -LiteralPath $nodePath) -or -not (Test-Path -LiteralPath $serverPath)) {
  throw "Crafty Bridge installation is incomplete. Run Install-CraftyBridge.ps1 again."
}

New-Item -ItemType Directory -Path $logsRoot -Force | Out-Null
$stdoutPath = Join-Path $logsRoot "bridge-output.log"
$stderrPath = Join-Path $logsRoot "bridge-error.log"

Start-Process -FilePath $nodePath `
  -ArgumentList @("`"$serverPath`"") `
  -WorkingDirectory $appRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdoutPath `
  -RedirectStandardError $stderrPath
