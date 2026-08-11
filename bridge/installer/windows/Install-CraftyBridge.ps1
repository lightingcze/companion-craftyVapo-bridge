[CmdletBinding()]
param(
  [switch]$NoStart,
  [switch]$SkipAutostart
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$payloadRoot = Join-Path $packageRoot "payload"
$runtimePackageRoot = Join-Path $packageRoot "runtime"
$installRoot = Join-Path $env:LOCALAPPDATA "CraftyBridge"
$appRoot = Join-Path $installRoot "app"
$runtimeRoot = Join-Path $installRoot "runtime"
$logsRoot = Join-Path $installRoot "logs"
$startupRoot = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupRoot "Crafty Bridge.lnk"
$disabledMarker = Join-Path $installRoot "autostart.disabled"

function Write-Step([string]$message) {
  Write-Host "[Crafty Bridge] $message" -ForegroundColor Cyan
}

function Get-Sha256([string]$Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
      return ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace("-", "").ToLowerInvariant()
    } finally {
      $sha256.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

function Stop-ExistingCraftyBridge {
  $health = $null
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:4587/health" -TimeoutSec 2
  } catch {
    # A stale installed process is handled below by its exact executable path.
  }

  if ($health) {
    if (-not $health.ok -or $health.service -ne "crafty-companion-winbridge") {
      throw "Port 4587 is occupied by a service that is not Crafty Bridge. Stop it before installing."
    }

    Write-Step "Stopping the running bridge before upgrade"
    try {
      Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:4587/commands/bridge-shutdown" -TimeoutSec 3 | Out-Null
    } catch {
      # The process can close the connection while it is shutting down.
    }
  }

  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 200
    try {
      $probe = Invoke-RestMethod -Uri "http://127.0.0.1:4587/health" -TimeoutSec 1
      if (-not $probe.ok) {
        break
      }
    } catch {
      break
    }
  }

  $installedNodePath = Join-Path $runtimeRoot "node.exe"
  if (Test-Path -LiteralPath $installedNodePath) {
    $installedNodeFullPath = [System.IO.Path]::GetFullPath($installedNodePath)
    $staleProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
      try {
        [System.IO.Path]::GetFullPath($_.Path) -eq $installedNodeFullPath
      } catch {
        $false
      }
    }

    foreach ($staleProcess in $staleProcesses) {
      Write-Step "Stopping stale installed bridge process $($staleProcess.Id)"
      Stop-Process -Id $staleProcess.Id -Force
      $staleProcess.WaitForExit(5000) | Out-Null
    }
  }

  Start-Sleep -Milliseconds 300
}

function Install-BundledNodeRuntime {
  param([string]$Destination)

  $checksumsPath = Join-Path $runtimePackageRoot "SHASUMS256.txt"
  $runtimeLine = Get-Content $checksumsPath | Where-Object { $_ -match " node-v22\.[0-9.]+-win-x64\.zip$" } | Select-Object -First 1
  if (-not $runtimeLine) {
    throw "Bundled Node 22 runtime checksum is missing."
  }

  $parts = $runtimeLine -split "\s+", 2
  $expectedHash = $parts[0].Trim().ToLowerInvariant()
  $archiveName = $parts[1].Trim()
  $archivePath = Join-Path $runtimePackageRoot $archiveName
  $extractRoot = Join-Path $env:TEMP "crafty-node-runtime"

  if (-not (Test-Path -LiteralPath $archivePath)) {
    throw "Bundled Node runtime is missing: $archiveName"
  }

  Write-Step "Verifying bundled $archiveName"
  $actualHash = Get-Sha256 $archivePath
  if ($actualHash -ne $expectedHash) {
    throw "Node runtime checksum verification failed."
  }

  if (Test-Path -LiteralPath $extractRoot) {
    Remove-Item -LiteralPath $extractRoot -Recurse -Force
  }
  New-Item -ItemType Directory -Path $extractRoot | Out-Null
  Expand-Archive -LiteralPath $archivePath -DestinationPath $extractRoot -Force
  $extractedRuntime = Get-ChildItem -LiteralPath $extractRoot -Directory | Select-Object -First 1
  if (-not $extractedRuntime) {
    throw "Downloaded Node runtime archive did not contain a runtime folder."
  }

  if (Test-Path -LiteralPath $Destination) {
    Remove-Item -LiteralPath $Destination -Recurse -Force
  }
  New-Item -ItemType Directory -Path $Destination | Out-Null
  Copy-Item -Path (Join-Path $extractedRuntime.FullName "*") -Destination $Destination -Recurse -Force
}

if (-not (Test-Path -LiteralPath (Join-Path $payloadRoot "package.json")) -or
    -not (Test-Path -LiteralPath (Join-Path $payloadRoot "node_modules\@abandonware\noble"))) {
  throw "Installer payload is incomplete. Extract the whole ZIP before running this script."
}

Write-Step "Installing to $installRoot"
New-Item -ItemType Directory -Path $installRoot, $appRoot, $logsRoot -Force | Out-Null
New-Item -ItemType File -Path $disabledMarker -Force | Out-Null
Stop-ExistingCraftyBridge

$preservedFiles = @("crafty-bridge-config.json", "crafty-session-state.json")
$preserved = @{}
foreach ($fileName in $preservedFiles) {
  $filePath = Join-Path $appRoot $fileName
  if (Test-Path -LiteralPath $filePath) {
    $preserved[$fileName] = Get-Content -Raw -LiteralPath $filePath
  }
}

Copy-Item -Path (Join-Path $payloadRoot "*") -Destination $appRoot -Recurse -Force
foreach ($entry in $preserved.GetEnumerator()) {
  Set-Content -LiteralPath (Join-Path $appRoot $entry.Key) -Value $entry.Value -Encoding UTF8 -NoNewline
}

if (-not (Test-Path -LiteralPath (Join-Path $runtimeRoot "node.exe"))) {
  Install-BundledNodeRuntime -Destination $runtimeRoot
}

$nodePath = Join-Path $runtimeRoot "node.exe"
Write-Step "Verifying bundled BLE dependency"
& $nodePath -e "require(process.argv[1])" (Join-Path $appRoot "node_modules\@abandonware\noble")
if ($LASTEXITCODE -ne 0) {
  throw "Bundled BLE dependency could not be loaded."
}

if (-not (Test-Path -LiteralPath (Join-Path $appRoot "crafty-bridge-config.json"))) {
  @{
    preferredPeripheralId = $null
    matchNamePattern = "crafty|storz\s*&\s*bickel|storz&bickel"
    knownDevices = @()
  } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $appRoot "crafty-bridge-config.json") -Encoding UTF8
}

Copy-Item -LiteralPath (Join-Path $packageRoot "Start-CraftyBridge.ps1") -Destination $installRoot -Force
Copy-Item -LiteralPath (Join-Path $packageRoot "Uninstall-CraftyBridge.ps1") -Destination $installRoot -Force
Remove-Item -LiteralPath $disabledMarker -Force -ErrorAction SilentlyContinue

if (-not $SkipAutostart) {
  Write-Step "Creating automatic startup"
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $shortcut.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$installRoot\Start-CraftyBridge.ps1`""
  $shortcut.WorkingDirectory = $installRoot
  $shortcut.Description = "Start Crafty Bridge for Bitfocus Companion"
  $shortcut.Save()
}

if (-not $NoStart) {
  Write-Step "Starting bridge"
  & (Join-Path $installRoot "Start-CraftyBridge.ps1")

  $healthy = $false
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 500
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:4587/health" -TimeoutSec 2
      if ($health.ok) {
        $healthy = $true
        break
      }
    } catch {
      # The native BLE dependency can take a few seconds to initialize.
    }
  }

  if (-not $healthy) {
    throw "Bridge was installed but did not answer on http://127.0.0.1:4587/health. Check $logsRoot."
  }
}

Write-Host ""
Write-Host "Crafty Bridge installation completed." -ForegroundColor Green
Write-Host "Bridge URL: http://127.0.0.1:4587"
Write-Host "Companion module: import the included .tgz file in Companion Settings > Modules."
Write-Host "Uninstall: $installRoot\Uninstall-CraftyBridge.ps1"
