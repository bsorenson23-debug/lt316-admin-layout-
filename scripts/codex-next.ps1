[CmdletBinding()]
param(
  [string]$WhatChanged = "",
  [string]$NextPrompt = "",
  [string]$Blockers = "",
  [string[]]$ValidationCommand = @(),
  [switch]$UseDefaultValidation,
  [switch]$SkipValidation,
  [Alias("RunCodex")]
  [switch]$RunNextPrompt,
  [string]$CodexExe = "codex"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$HandoffDir = Join-Path $RepoRoot ".codex-handoff"
$SummaryPath = Join-Path $HandoffDir "current-summary.md"
$NextPromptPath = Join-Path $HandoffDir "next-prompt.md"
$ValidationPath = Join-Path $HandoffDir "validation.md"
$CodexOutputPath = Join-Path $HandoffDir "codex-output.md"

$DefaultValidationCommands = @(
  "if (Test-Path .\node_modules\.bin\tsc.cmd) { .\node_modules\.bin\tsc.cmd --noEmit --pretty false } else { Write-Error 'Missing local TypeScript compiler at node_modules\.bin\tsc.cmd. Run npm.cmd ci before validation.'; exit 1 }",
  "npm.cmd run test:body-reference-contract"
)

New-Item -ItemType Directory -Force -Path $HandoffDir | Out-Null
Set-Location $RepoRoot

function Write-Utf8File {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Content
  )

  $encoding = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Get-TextOrFallback {
  param(
    [Parameter(Mandatory = $true)][scriptblock]$ScriptBlock,
    [AllowEmptyString()][string]$Fallback = ""
  )

  try {
    $output = & $ScriptBlock 2>&1
    if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
      return $Fallback
    }

    $text = ($output | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine
    if ([string]::IsNullOrWhiteSpace($text)) {
      return $Fallback
    }

    return $text.Trim()
  } catch {
    return $Fallback
  }
}

function ConvertTo-MarkdownBullets {
  param(
    [string]$Text,
    [string]$EmptyText = "None."
  )

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return @("- $EmptyText")
  }

  $lines = $Text -split "\r?\n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  if ($lines.Count -eq 0) {
    return @("- $EmptyText")
  }

  return $lines | ForEach-Object { "- ``$($_.Trim())``" }
}

function Get-TailText {
  param(
    [string]$Text,
    [int]$MaxLines = 120
  )

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return "(no output)"
  }

  $lines = $Text -split "\r?\n"
  if ($lines.Count -le $MaxLines) {
    return ($lines -join [Environment]::NewLine).Trim()
  }

  $start = [Math]::Max(0, $lines.Count - $MaxLines)
  $tail = $lines[$start..($lines.Count - 1)] -join [Environment]::NewLine
  return "[showing last $MaxLines of $($lines.Count) lines]`n$($tail.Trim())"
}

function Assert-SafeCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(Mandatory = $true)][string]$Context
  )

  $blockedPatterns = @(
    "\bgit\s+push\b",
    "\bgit\s+merge\b",
    "\bgit\s+reset\b",
    "\bgit\s+clean\b",
    "\bgit\s+branch\s+(-d|-D|--delete)\b",
    "\bgit\s+worktree\s+remove\b",
    "\bgit\s+checkout\s+--\b",
    "\bdeploy\b",
    "\bcredential(s)?\b",
    "\b(secret|token|api[_-]?key)\b",
    "\blaser\b",
    "\bmachine\b",
    "\bRemove-Item\b",
    "\brm\s+(-r|-rf|/s)\b",
    "\brmdir\b",
    "\bdel\s+(/s|/q)\b"
  )

  foreach ($pattern in $blockedPatterns) {
    if ($Command -match $pattern) {
      throw "Refusing to run unsafe $Context command: $Command"
    }
  }
}

function Invoke-ValidationCommand {
  param([Parameter(Mandatory = $true)][string]$Command)

  Assert-SafeCommand -Command $Command -Context "validation"

  $started = Get-Date
  $childCommand = @"
`$ErrorActionPreference = 'Stop'
try {
  $Command
  if (`$null -ne `$LASTEXITCODE) {
    exit `$LASTEXITCODE
  }
  exit 0
} catch {
  Write-Error (`$_ | Out-String)
  exit 1
}
"@

  $encodedCommand = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($childCommand))
  $parentErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $output = & powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand $encodedCommand 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $parentErrorActionPreference
  }
  $finished = Get-Date

  return [pscustomobject]@{
    Command = $Command
    ExitCode = $exitCode
    Started = $started
    Finished = $finished
    DurationSeconds = [Math]::Round(($finished - $started).TotalSeconds, 1)
    Output = (($output | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine).Trim()
  }
}

function Get-Diagnostics {
  $knownPaths = @(
    ".codex-diagnostics",
    "test-results",
    "playwright-report",
    "dev-server.err.log",
    "dev-server.out.log",
    ".localhost3000.err.log",
    ".localhost3000.out.log"
  )

  $items = @()
  foreach ($relativePath in $knownPaths) {
    $path = Join-Path $RepoRoot $relativePath
    if (Test-Path -LiteralPath $path) {
      $item = Get-Item -LiteralPath $path
      $kind = if ($item.PSIsContainer) { "directory" } else { "file" }
      $items += "$relativePath ($kind, updated $($item.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')))"
    }
  }

  if ($items.Count -eq 0) {
    return @("None detected by script.")
  }

  return $items
}

function New-GeneratedPrompt {
  param(
    [string]$Branch,
    [string]$LatestCommit
  )

  $taskText = if ([string]::IsNullOrWhiteSpace($NextPrompt)) {
    "Continue from the current handoff. Read the summary and validation files, inspect git status, then ask for the next concrete task if the next work item is still unclear."
  } else {
    $NextPrompt.Trim()
  }

  return @"
Continue this LT316 Admin repo from the handoff files.

Context:
- Branch: $Branch
- Latest commit: $LatestCommit
- Read AGENTS.md first.
- Read .codex-handoff/current-summary.md and .codex-handoff/validation.md.
- Inspect git status before editing.
- Do not auto-push.
- Do not merge, deploy, change credentials, contact customers, make purchases, or run physical laser/machine actions.
- Do not delete branches.
- Do not run destructive git commands.
- Require human approval before push, merge, deploy, customer communication, purchase, credential change, or real laser/machine action.
- Stop and report if validation fails.

Task:
$taskText
"@.Trim()
}

function New-ValidationMarkdown {
  param(
    [object[]]$Results,
    [bool]$Skipped,
    [bool]$Failed
  )

  $lines = @("# Validation", "")
  $lines += "- Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"

  if ($Skipped) {
    $lines += "- Overall: SKIPPED"
    $lines += ""
    $lines += "Validation was skipped by script arguments."
    return ($lines -join [Environment]::NewLine) + [Environment]::NewLine
  }

  if ($Results.Count -eq 0) {
    $lines += "- Overall: NOT RUN"
    $lines += ""
    $lines += "No validation commands were provided. Use `-UseDefaultValidation` or pass `-ValidationCommand`."
    return ($lines -join [Environment]::NewLine) + [Environment]::NewLine
  }

  $overall = if ($Failed) { "FAIL" } else { "PASS" }
  $lines += "- Overall: $overall"
  $lines += ""

  foreach ($result in $Results) {
    $status = if ($result.ExitCode -eq 0) { "PASS" } else { "FAIL" }
    $lines += "## $status - $($result.Command)"
    $lines += ""
    $lines += "- Exit code: $($result.ExitCode)"
    $lines += "- Duration: $($result.DurationSeconds)s"
    $lines += "- Started: $($result.Started.ToString('yyyy-MM-dd HH:mm:ss'))"
    $lines += "- Finished: $($result.Finished.ToString('yyyy-MM-dd HH:mm:ss'))"
    $lines += ""
    $lines += "~~~text"
    $lines += Get-TailText -Text $result.Output
    $lines += "~~~"
    $lines += ""
  }

  if ($Failed) {
    $lines += "Blocker: validation failed. `codex exec` was not run."
    $lines += ""
  }

  return ($lines -join [Environment]::NewLine) + [Environment]::NewLine
}

function New-SummaryMarkdown {
  param(
    [string]$Branch,
    [string]$Upstream,
    [string]$LatestCommit,
    [string]$StatusText,
    [string]$DiffStat,
    [object[]]$ValidationResults,
    [bool]$ValidationSkipped,
    [bool]$ValidationFailed,
    [string[]]$Diagnostics,
    [string]$GeneratedPrompt
  )

  $validationSummary = if ($ValidationSkipped) {
    @("- SKIPPED: validation was skipped by script arguments.")
  } elseif ($ValidationResults.Count -eq 0) {
    @("- NOT RUN: no validation commands were provided.")
  } else {
    $ValidationResults | ForEach-Object {
      $status = if ($_.ExitCode -eq 0) { "PASS" } else { "FAIL" }
      "- ${status}: ``$($_.Command)`` (exit $($_.ExitCode), $($_.DurationSeconds)s)"
    }
  }

  $passFailResult = if ($ValidationSkipped) {
    "SKIPPED"
  } elseif ($ValidationResults.Count -eq 0) {
    "NOT RUN"
  } elseif ($ValidationFailed) {
    "FAIL"
  } else {
    "PASS"
  }

  $blockerText = if ($ValidationFailed) {
    "Validation failed. Fix the failing command(s) in `.codex-handoff/validation.md` before continuing."
  } elseif (-not [string]::IsNullOrWhiteSpace($Blockers)) {
    $Blockers.Trim()
  } else {
    "None reported by script."
  }

  $whatChangedText = if (-not [string]::IsNullOrWhiteSpace($WhatChanged)) {
    $WhatChanged.Trim()
  } elseif (-not [string]::IsNullOrWhiteSpace($DiffStat)) {
    "Auto-generated from `git diff --stat`:`n`n~~~text`n$DiffStat`n~~~"
  } else {
    "No working tree changes detected by script."
  }

  $lines = @(
    "# Codex Handoff Summary",
    "",
    "- Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')",
    "- Branch: $Branch",
    "- Upstream: $Upstream",
    "- Latest commit: $LatestCommit",
    "",
    "## Changed Files"
  )
  $lines += ConvertTo-MarkdownBullets -Text $StatusText -EmptyText "No working tree changes."
  $lines += @(
    "",
    "## What Changed",
    "",
    $whatChangedText,
    "",
    "## Validation Commands Run"
  )
  $lines += $validationSummary
  $lines += @(
    "",
    "## Pass/Fail Results",
    "",
    $passFailResult,
    "",
    "## Screenshots Or Diagnostics"
  )
  $lines += $Diagnostics | ForEach-Object { "- $_" }
  $lines += @(
    "",
    "## Blockers",
    "",
    $blockerText,
    "",
    "## Exact Recommended Next Prompt",
    "",
    "~~~text",
    $GeneratedPrompt,
    "~~~",
    ""
  )

  return ($lines -join [Environment]::NewLine)
}

$branch = Get-TextOrFallback -ScriptBlock { git branch --show-current } -Fallback "(unknown branch)"
$upstream = Get-TextOrFallback -ScriptBlock { git rev-parse --abbrev-ref --symbolic-full-name "@{u}" } -Fallback "(no upstream)"
$latestCommit = Get-TextOrFallback -ScriptBlock { git log -1 --format="%H %s" } -Fallback "(no commit)"
$statusText = Get-TextOrFallback -ScriptBlock { git status --short } -Fallback ""
$diffStat = Get-TextOrFallback -ScriptBlock { git diff --stat } -Fallback ""

if ($UseDefaultValidation -and $ValidationCommand.Count -eq 0) {
  $ValidationCommand = $DefaultValidationCommands
}

if ($SkipValidation -and $ValidationCommand.Count -gt 0) {
  throw "Use either -SkipValidation or validation commands, not both."
}

$validationResults = @()
$validationFailed = $false

if (-not $SkipValidation) {
  foreach ($command in $ValidationCommand) {
    $result = Invoke-ValidationCommand -Command $command
    $validationResults += $result
    if ($result.ExitCode -ne 0) {
      $validationFailed = $true
    }
  }
}

$generatedPrompt = New-GeneratedPrompt -Branch $branch -LatestCommit $latestCommit
$diagnostics = Get-Diagnostics

Write-Utf8File -Path $NextPromptPath -Content ($generatedPrompt + [Environment]::NewLine)
Write-Utf8File -Path $ValidationPath -Content (New-ValidationMarkdown -Results $validationResults -Skipped ([bool]$SkipValidation) -Failed $validationFailed)
Write-Utf8File -Path $SummaryPath -Content (New-SummaryMarkdown -Branch $branch -Upstream $upstream -LatestCommit $latestCommit -StatusText $statusText -DiffStat $diffStat -ValidationResults $validationResults -ValidationSkipped ([bool]$SkipValidation) -ValidationFailed $validationFailed -Diagnostics $diagnostics -GeneratedPrompt $generatedPrompt)

if ($validationFailed) {
  if ($RunNextPrompt) {
    Write-Utf8File -Path $CodexOutputPath -Content "# Codex Output`n`n`codex exec` was skipped because validation failed. See `.codex-handoff/validation.md`.`n"
  }
  Write-Error "Validation failed. See .codex-handoff/validation.md. codex exec was not run."
  exit 1
}

if ($RunNextPrompt) {
  $codex = Get-Command $CodexExe -ErrorAction SilentlyContinue
  if ($null -eq $codex) {
    Write-Utf8File -Path $CodexOutputPath -Content "# Codex Output`n`nUnable to find `$CodexExe on PATH. No command was run.`n"
    Write-Error "Unable to find $CodexExe on PATH."
    exit 1
  }

  $promptText = Get-Content -Raw -LiteralPath $NextPromptPath
  $header = "# Codex Output`n`n- Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')`n- Command: $($codex.Source) exec <.codex-handoff/next-prompt.md>`n`n~~~text`n"
  Write-Utf8File -Path $CodexOutputPath -Content $header

  $codexOutput = & $codex.Source exec $promptText 2>&1
  $codexExitCode = $LASTEXITCODE
  $codexOutputText = (($codexOutput | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine).Trim()
  Add-Content -LiteralPath $CodexOutputPath -Encoding UTF8 -Value $codexOutputText
  Add-Content -LiteralPath $CodexOutputPath -Encoding UTF8 -Value "`n~~~`n`nExit code: $codexExitCode`n"

  if ($codexExitCode -ne 0) {
    Write-Error "codex exec failed with exit code $codexExitCode. See .codex-handoff/codex-output.md."
    exit $codexExitCode
  }
} else {
  if (Test-Path -LiteralPath $CodexOutputPath) {
    Write-Host "Skipped codex exec. Existing .codex-handoff/codex-output.md was left untouched."
  }
}

Write-Host "Wrote handoff files to $HandoffDir"
if ($RunNextPrompt) {
  Write-Host "codex exec output logged to $CodexOutputPath"
}
