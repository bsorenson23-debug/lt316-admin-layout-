param(
  [switch]$Build,
  [switch]$Detached
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Push-Location $repoRoot
try {
  $null = Get-Command docker -ErrorAction Stop

  $composeArgs = @("compose", "up", "--remove-orphans")
  if ($Build) {
    $composeArgs += "--build"
  }
  if ($Detached) {
    $composeArgs += "-d"
  }
  $composeArgs += @("web", "asset-pipeline")

  & docker @composeArgs
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}
