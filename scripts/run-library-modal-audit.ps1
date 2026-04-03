$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $repoRoot ".playwright-browsers"

$portOpen = Test-NetConnection -ComputerName "127.0.0.1" -Port 3000 -InformationLevel Quiet
if (-not $portOpen) {
  throw "The admin app is not reachable on http://127.0.0.1:3000. Start it first with npm run dev:codex or npm run dev."
}

Push-Location $repoRoot
try {
  & node .\scripts\visual-audit.mjs
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}

