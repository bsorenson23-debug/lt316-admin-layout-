[CmdletBinding()]
param(
  [string]$WhatChanged = "",
  [string]$TestsRun = "",
  [string]$PassFailResults = "",
  [string]$Blockers = "",
  [string]$NextPrompt = "",
  [string[]]$EvidencePath = @(),
  [int]$MaxEvidenceItems = 80
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$AiRoot = Join-Path $RepoRoot ".ai-control"
$CurrentDir = Join-Path $AiRoot "current"
$EvidenceDir = Join-Path $AiRoot "evidence"
$OutboxDir = Join-Path $AiRoot "outbox"
$HandoffPath = Join-Path $CurrentDir "handoff.md"
$NextPromptPath = Join-Path $CurrentDir "next-codex-prompt.md"
$ChatGptRequestPath = Join-Path $OutboxDir "chatgpt-review-request.md"

New-Item -ItemType Directory -Force -Path $CurrentDir, $EvidenceDir, $OutboxDir | Out-Null
Set-Location $RepoRoot

function Write-Utf8File {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Content
  )

  $encoding = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Invoke-Text {
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

function ConvertTo-RelativePath {
  param([Parameter(Mandatory = $true)][string]$Path)

  $fullPath = (Resolve-Path -LiteralPath $Path).Path
  if ($fullPath.StartsWith($RepoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $fullPath.Substring($RepoRoot.Length).TrimStart([char[]]@('\', '/'))
  }

  return $fullPath
}

function Redact-SecretText {
  param([AllowNull()][string]$Text)

  if ($null -eq $Text) {
    return ""
  }

  $redacted = $Text
  $redacted = [regex]::Replace($redacted, '(?i)(api[_-]?key|token|secret|password|authorization|cookie)\s*[:=]\s*\S+', '$1=[REDACTED]')
  $redacted = [regex]::Replace($redacted, "(?i)bearer\s+[a-z0-9._\-]+", "Bearer [REDACTED]")
  $redacted = [regex]::Replace($redacted, "sk-ant-[A-Za-z0-9_\-]{20,}", "[REDACTED_API_KEY]")
  $redacted = [regex]::Replace($redacted, "sk-[A-Za-z0-9_\-]{20,}", "[REDACTED_API_KEY]")
  return $redacted
}

function ConvertTo-Bullets {
  param(
    [AllowNull()][string[]]$Items,
    [string]$EmptyText = "None."
  )

  $values = @($Items | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($values.Count -eq 0) {
    return @("- $EmptyText")
  }

  return $values | ForEach-Object { "- $($_.Trim())" }
}

function ConvertTextTo-Bullets {
  param(
    [AllowNull()][string]$Text,
    [string]$EmptyText = "None."
  )

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return @("- $EmptyText")
  }

  $lines = $Text -split "\r?\n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  return ConvertTo-Bullets -Items $lines -EmptyText $EmptyText
}

function Get-ValidationSummary {
  $validationPath = Join-Path $RepoRoot ".codex-handoff\validation.md"
  if (-not (Test-Path -LiteralPath $validationPath)) {
    return [pscustomobject]@{
      TestsRun = "Not provided."
      Results = "Not provided."
    }
  }

  $content = Redact-SecretText (Get-Content -Raw -LiteralPath $validationPath)
  $commandLines = @()
  foreach ($match in [regex]::Matches($content, "(?m)^##\s+(PASS|FAIL)\s+-\s+(.+)$")) {
    $commandLines += "$($match.Groups[1].Value): $($match.Groups[2].Value)"
  }

  $overall = "Unknown"
  $overallMatch = [regex]::Match($content, "(?m)^-\s+Overall:\s+(.+)$")
  if ($overallMatch.Success) {
    $overall = $overallMatch.Groups[1].Value.Trim()
  }

  return [pscustomobject]@{
    TestsRun = if ($commandLines.Count -gt 0) { $commandLines -join [Environment]::NewLine } else { "See .codex-handoff/validation.md." }
    Results = "Overall: $overall"
  }
}

function Get-EvidenceInventory {
  $roots = @(
    ".ai-control\evidence",
    ".codex-diagnostics",
    "test-results",
    "playwright-report"
  )
  $roots += $EvidencePath

  $files = @()
  foreach ($root in $roots) {
    if ([string]::IsNullOrWhiteSpace($root)) {
      continue
    }

    $path = if ([System.IO.Path]::IsPathRooted($root)) { $root } else { Join-Path $RepoRoot $root }
    if (-not (Test-Path -LiteralPath $path)) {
      continue
    }

    $item = Get-Item -LiteralPath $path
    if ($item.PSIsContainer) {
      $files += Get-ChildItem -LiteralPath $path -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -ne ".gitkeep" } |
        Select-Object -First $MaxEvidenceItems
    } else {
      $files += $item
    }
  }

  foreach ($rootLog in @("dev-server.err.log", "dev-server.out.log", ".localhost3000.err.log", ".localhost3000.out.log")) {
    $path = Join-Path $RepoRoot $rootLog
    if (Test-Path -LiteralPath $path) {
      $files += Get-Item -LiteralPath $path
    }
  }

  $docReports = Join-Path $RepoRoot "docs"
  if (Test-Path -LiteralPath $docReports) {
    $files += Get-ChildItem -LiteralPath $docReports -Filter "*report*.md" -File -ErrorAction SilentlyContinue |
      Select-Object -First 20
  }

  $uniqueFiles = $files |
    Sort-Object FullName -Unique |
    Select-Object -First $MaxEvidenceItems

  $inventory = [ordered]@{
    Screenshots = New-Object System.Collections.Generic.List[string]
    Logs = New-Object System.Collections.Generic.List[string]
    JsonArtifacts = New-Object System.Collections.Generic.List[string]
    MarkdownReports = New-Object System.Collections.Generic.List[string]
    Other = New-Object System.Collections.Generic.List[string]
  }

  foreach ($file in $uniqueFiles) {
    $relative = ConvertTo-RelativePath -Path $file.FullName
    $entry = "$relative (updated $($file.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')))"
    $lower = $relative.ToLowerInvariant()

    if ($lower -match "\.(png|jpg|jpeg|webp)$") {
      $inventory.Screenshots.Add($entry)
    } elseif ($lower -match "(console\.log|\.log$)") {
      $inventory.Logs.Add($entry)
    } elseif ($lower -match "\.json$") {
      $inventory.JsonArtifacts.Add($entry)
    } elseif ($lower -match "\.md$") {
      $inventory.MarkdownReports.Add($entry)
    } else {
      $inventory.Other.Add($entry)
    }
  }

  return $inventory
}

function New-DefaultNextPrompt {
  param(
    [string]$Branch,
    [string]$Commit
  )

  $text = @"
Continue this LT316 Admin repo from the AI handoff.

Context:
- Branch: $Branch
- Commit: $Commit
- Read AGENTS.md first.
- Read .ai-control/agent-registry.json.
- Read .ai-control/current/handoff.md.
- Treat Claude and ChatGPT review outputs as read-only advisory input.
- Codex remains the only default code-writing agent.
- Inspect git status before editing.
- Do not push, merge, deploy, delete branches, change credentials, contact customers, make purchases, or run any physical laser/machine action.
- Require human approval before push, merge, deploy, customer communication, purchase, credential change, or real laser/machine action.
- Do not include API keys or secrets in committed files.
- Keep generated reports local unless explicitly requested.

Task:
Continue from the handoff, verify any reviewer findings against the codebase, implement only the approved next code change, then run targeted validation and refresh the handoff.
"@
  return $text.Trim()
}

function New-ChatGptReviewRequest {
  param(
    [string]$Branch,
    [string]$Commit,
    [string]$StatusText,
    [string]$TestsText,
    [string]$ResultsText,
    [object]$Evidence,
    [string]$PromptText
  )

  $lines = @(
    "# ChatGPT Review Request",
    "",
    "Read-only review. Do not propose direct edits as already-applied changes. Do not ask for secrets, environment values, API keys, tokens, credentials, cookies, customer data, or machine-control actions.",
    "",
    "Codex is the only default code-writing agent for this repo. Your job is to review the handoff and return findings for Codex to verify.",
    "",
    "## Repo State",
    "",
    "- Branch: $Branch",
    "- Commit: $Commit",
    "",
    "## Changed Files"
  )
  $lines += ConvertTextTo-Bullets -Text $StatusText -EmptyText "No working tree changes reported."
  $lines += @(
    "",
    "## Tests Run",
    ""
  )
  $lines += ConvertTextTo-Bullets -Text $TestsText -EmptyText "Not provided."
  $lines += @(
    "",
    "## Pass/Fail Results",
    ""
  )
  $lines += ConvertTextTo-Bullets -Text $ResultsText -EmptyText "Not provided."
  $lines += @(
    "",
    "## Evidence Paths",
    "",
    "### Screenshots"
  )
  $lines += ConvertTo-Bullets -Items $Evidence.Screenshots -EmptyText "None found."
  $lines += @("", "### Logs")
  $lines += ConvertTo-Bullets -Items $Evidence.Logs -EmptyText "None found."
  $lines += @("", "### JSON Artifacts")
  $lines += ConvertTo-Bullets -Items $Evidence.JsonArtifacts -EmptyText "None found."
  $lines += @("", "### Markdown Reports")
  $lines += ConvertTo-Bullets -Items $Evidence.MarkdownReports -EmptyText "None found."
  $lines += @(
    "",
    "## Requested Review Output",
    "",
    "Return concise findings in this format:",
    "",
    "- Findings: bugs, regressions, safety risks, or missing validation, ordered by severity",
    "- Questions: only blockers that Codex cannot verify locally",
    "- Suggested next validation",
    "",
    "## Exact Next Prompt For Codex",
    "",
    "~~~text",
    $PromptText,
    "~~~",
    ""
  )

  return (Redact-SecretText (($lines -join [Environment]::NewLine) + [Environment]::NewLine))
}

$branch = Invoke-Text -ScriptBlock { git branch --show-current } -Fallback "(unknown branch)"
$commit = Invoke-Text -ScriptBlock { git log -1 '--format=%H %s' } -Fallback "(no commit)"
$statusText = Invoke-Text -ScriptBlock { git status --short } -Fallback ""
$diffStat = Invoke-Text -ScriptBlock { git diff --stat } -Fallback ""
$validation = Get-ValidationSummary
$testsText = if ([string]::IsNullOrWhiteSpace($TestsRun)) { $validation.TestsRun } else { $TestsRun.Trim() }
$resultsText = if ([string]::IsNullOrWhiteSpace($PassFailResults)) { $validation.Results } else { $PassFailResults.Trim() }
$evidence = Get-EvidenceInventory
$promptText = if ([string]::IsNullOrWhiteSpace($NextPrompt)) {
  New-DefaultNextPrompt -Branch $branch -Commit $commit
} else {
  $NextPrompt.Trim()
}

$whatChangedText = if ([string]::IsNullOrWhiteSpace($WhatChanged)) {
  if ([string]::IsNullOrWhiteSpace($diffStat)) {
    "No implementation summary was provided."
  } else {
    "Auto-generated from git diff --stat:`n`n~~~text`n$diffStat`n~~~"
  }
} else {
  $WhatChanged.Trim()
}

$blockerText = if ([string]::IsNullOrWhiteSpace($Blockers)) { "None reported." } else { $Blockers.Trim() }

$handoffLines = @(
  "# AI Control Handoff",
  "",
  "- Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')",
  "- Branch: $branch",
  "- Commit: $commit",
  "",
  "## Changed Files"
)
$handoffLines += ConvertTextTo-Bullets -Text $statusText -EmptyText "No working tree changes reported."
$handoffLines += @(
  "",
  "## What Changed",
  "",
  $whatChangedText,
  "",
  "## Tests Run"
)
$handoffLines += ConvertTextTo-Bullets -Text $testsText -EmptyText "Not provided."
$handoffLines += @(
  "",
  "## Pass/Fail Results"
)
$handoffLines += ConvertTextTo-Bullets -Text $resultsText -EmptyText "Not provided."
$handoffLines += @(
  "",
  "## Evidence",
  "",
  "### Screenshots"
)
$handoffLines += ConvertTo-Bullets -Items $evidence.Screenshots -EmptyText "None found."
$handoffLines += @("", "### Logs")
$handoffLines += ConvertTo-Bullets -Items $evidence.Logs -EmptyText "None found."
$handoffLines += @("", "### JSON Artifacts")
$handoffLines += ConvertTo-Bullets -Items $evidence.JsonArtifacts -EmptyText "None found."
$handoffLines += @("", "### Markdown Reports")
$handoffLines += ConvertTo-Bullets -Items $evidence.MarkdownReports -EmptyText "None found."
$handoffLines += @("", "### Other")
$handoffLines += ConvertTo-Bullets -Items $evidence.Other -EmptyText "None found."
$handoffLines += @(
  "",
  "## Blockers",
  "",
  $blockerText,
  "",
  "## Safety Gates",
  "",
  "- Codex is the only default code-writing agent.",
  "- Claude and ChatGPT are read-only reviewers unless a human explicitly changes the workflow.",
  "- Do not push, merge, deploy, delete branches, change credentials, contact customers, make purchases, or run physical laser/machine actions.",
  "- Require human approval before push, merge, deploy, customer communication, purchase, credential change, or real laser/machine action.",
  "- Do not include API keys or secrets in committed files.",
  "- Keep generated reports local unless explicitly requested.",
  "",
  "## Exact Next Prompt",
  "",
  "~~~text",
  $promptText,
  "~~~",
  ""
)

$handoff = Redact-SecretText (($handoffLines -join [Environment]::NewLine) + [Environment]::NewLine)
$nextPromptContent = Redact-SecretText ($promptText + [Environment]::NewLine)
$chatGptRequest = New-ChatGptReviewRequest -Branch $branch -Commit $commit -StatusText $statusText -TestsText $testsText -ResultsText $resultsText -Evidence $evidence -PromptText $promptText

Write-Utf8File -Path $HandoffPath -Content $handoff
Write-Utf8File -Path $NextPromptPath -Content $nextPromptContent
Write-Utf8File -Path $ChatGptRequestPath -Content $chatGptRequest

Write-Host "Wrote $HandoffPath"
Write-Host "Wrote $NextPromptPath"
Write-Host "Wrote $ChatGptRequestPath"
