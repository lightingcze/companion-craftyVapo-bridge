[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$packageJson = Get-Content -Raw -LiteralPath (Join-Path $workspaceRoot "package.json") | ConvertFrom-Json
$version = $packageJson.version
$stagingRoot = Join-Path $workspaceRoot "windows-installer-staging"
$payloadRoot = Join-Path $stagingRoot "payload"
$runtimeStagingRoot = Join-Path $stagingRoot "runtime"
$assetRoot = Join-Path $workspaceRoot "installer\windows\assets"
$productionModules = Join-Path $assetRoot "bridge-production\node_modules"
$archivePath = Join-Path $workspaceRoot "crafty-bridge-windows-$version.zip"
$modulePackage = Join-Path $workspaceRoot "companion-module-crafty-bridge-$version-official-rc.tgz"

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

if (-not (Test-Path -LiteralPath $modulePackage)) {
  throw "Missing Companion module package: $modulePackage"
}

if (Test-Path -LiteralPath $stagingRoot) {
  Remove-Item -LiteralPath $stagingRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $payloadRoot -Force | Out-Null
New-Item -ItemType Directory -Path $runtimeStagingRoot -Force | Out-Null

Copy-Item -LiteralPath (Join-Path $workspaceRoot "installer\windows\Install-CraftyBridge.ps1") -Destination $stagingRoot
Copy-Item -LiteralPath (Join-Path $workspaceRoot "installer\windows\INSTALL.cmd") -Destination $stagingRoot
Copy-Item -LiteralPath (Join-Path $workspaceRoot "installer\windows\Start-CraftyBridge.ps1") -Destination $stagingRoot
Copy-Item -LiteralPath (Join-Path $workspaceRoot "installer\windows\Uninstall-CraftyBridge.ps1") -Destination $stagingRoot
Copy-Item -LiteralPath (Join-Path $workspaceRoot "installer\windows\README.txt") -Destination $stagingRoot
Copy-Item -LiteralPath $modulePackage -Destination $stagingRoot

Copy-Item -LiteralPath (Join-Path $workspaceRoot "package.json") -Destination $payloadRoot
Copy-Item -LiteralPath (Join-Path $workspaceRoot "package-lock.json") -Destination $payloadRoot
Copy-Item -LiteralPath (Join-Path $workspaceRoot "src") -Destination $payloadRoot -Recurse
if (-not (Test-Path -LiteralPath $productionModules)) {
  throw "Missing offline production dependencies: $productionModules"
}
Copy-Item -LiteralPath $productionModules -Destination $payloadRoot -Recurse
New-Item -ItemType Directory -Path (Join-Path $payloadRoot "tools") -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $workspaceRoot "tools\stop-bridge.ps1") -Destination (Join-Path $payloadRoot "tools")

$runtimeArchive = Get-ChildItem -LiteralPath $assetRoot -Filter "node-v22.*-win-x64.zip" -File | Select-Object -First 1
if (-not $runtimeArchive) {
  throw "Missing bundled Node 22 Windows x64 runtime archive."
}
$runtimeHash = Get-Sha256 $runtimeArchive.FullName
Copy-Item -LiteralPath $runtimeArchive.FullName -Destination $runtimeStagingRoot
Set-Content -LiteralPath (Join-Path $runtimeStagingRoot "SHASUMS256.txt") -Value "$runtimeHash  $($runtimeArchive.Name)" -Encoding ASCII

if (Test-Path -LiteralPath $archivePath) {
  Remove-Item -LiteralPath $archivePath -Force
}
Compress-Archive -Path (Join-Path $stagingRoot "*") -DestinationPath $archivePath -CompressionLevel Optimal
Remove-Item -LiteralPath $stagingRoot -Recurse -Force

Write-Host "Created $archivePath"
