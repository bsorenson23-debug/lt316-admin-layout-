param(
  [switch]$IncludeBuildCache
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

$paths = @(
  ".next-dev.pid",
  "dev-server.err.log",
  "dev-server.out.log",
  ".playwright-browsers",
  "tmp/audit"
)

if ($IncludeBuildCache) {
  $paths += @(
    ".next",
    "services/asset-pipeline/dist"
  )
}

foreach ($relativePath in $paths) {
  $target = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $relativePath))
  if (-not $target.StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to delete path outside repo root: $target"
  }

  if (Test-Path -LiteralPath $target) {
    try {
      Remove-Item -LiteralPath $target -Recurse -Force
      Write-Host "Removed $relativePath"
    } catch {
      Write-Warning ("Skipped {0}: {1}" -f $relativePath, $_.Exception.Message)
    }
  }
}
