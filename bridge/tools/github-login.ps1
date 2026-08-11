$GhExe = "C:\Users\ondra\AppData\Local\Programs\GitHub CLI Portable\bin\gh.exe"

if (-not (Test-Path -LiteralPath $GhExe)) {
  Write-Error "GitHub CLI was not found at: $GhExe"
  exit 1
}

& $GhExe auth login --hostname github.com --git-protocol https --web --clipboard --scopes repo,workflow
