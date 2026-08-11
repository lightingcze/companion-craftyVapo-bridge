$ErrorActionPreference = "Stop"

$port = [int]($env:CRAFTY_BRIDGE_PORT)
if (-not $port) {
  $port = 4587
}

$listeners = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $port -State Listen -ErrorAction SilentlyContinue

if (-not $listeners) {
  Write-Host "Crafty bridge is not listening on 127.0.0.1:$port"
  exit 0
}

$processIds = $listeners | Select-Object -ExpandProperty OwningProcess -Unique

foreach ($processId in $processIds) {
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if (-not $process) {
    continue
  }

  Write-Host "Stopping Crafty bridge process $processId ($($process.ProcessName)) on port $port"
  Stop-Process -Id $processId -Force
}
