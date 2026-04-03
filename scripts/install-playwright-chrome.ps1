$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $repoRoot ".playwright-browsers"

Push-Location $repoRoot
try {
  & npx playwright install chromium
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}

