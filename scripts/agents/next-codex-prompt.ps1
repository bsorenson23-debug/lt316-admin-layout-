[CmdletBinding()]
param(
  [string]$Task = "",
  [string]$OutputPath = ".ai-control/current/next-codex-prompt.md"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$CurrentDir = Join-Path $RepoRoot ".ai-control\current"
$HandoffPath = Join-Path $CurrentDir "handoff.md"
$ConsolidatedPath = Join-Path $CurrentDir "consolidated-review.md"
$ResolvedOutputPath = if ([System.IO.Path]::IsPathRooted($OutputPath)) { $OutputPath } else { Join-Path $RepoRoot $OutputPath }

New-Item -ItemType Directory -Force -Path $CurrentDir | Out-Null
Set-Location $RepoRoot

$utilityScript = Join-Path $PSScriptRoot "agent-utils.ps1"
if (-not (Test-Path -LiteralPath $utilityScript)) {
  throw "Missing shared utility script: $utilityScript"
}
. $utilityScript

function Write-Utf8File {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Content
  )

  $encoding = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($Path, $Content, $encoding)
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

function Get-ExactPromptFromHandoff {
  param([string]$Content)

  $match = [regex]::Match($Content, '(?s)## Exact Next Prompt\s+(?:```|~~~)text\s*(.*?)\s*(?:```|~~~)')
  if ($match.Success) {
    return $match.Groups[1].Value.Trim()
  }

  return ""
}

function Test-GenericHandoffPrompt {
  param([string]$Content)

  return $Content -match "Continue from the handoff, verify any reviewer findings against the codebase"
}

function Get-TaskFromConsolidatedReview {
  param([string]$Content)

  if ([string]::IsNullOrWhiteSpace($Content) -or $Content -match "^No consolidated review file found\.") {
    return [pscustomobject]@{
      Type = "none"
      Task = ""
      Priority = 0
    }
  }

  $statusMatch = [regex]::Match($Content, "(?m)^-\s+Status:\s+(.+)$")
  $status = if ($statusMatch.Success) { $statusMatch.Groups[1].Value.Trim() } else { "" }
  $critical = Get-MarkdownSection -Text $Content -Heading "Critical Findings"
  $important = Get-MarkdownSection -Text $Content -Heading "Important Findings"
  $hasCritical = Test-SectionHasActionableBullets -Section $critical
  $hasImportant = Test-SectionHasActionableBullets -Section $important

  if ($status -match "^BLOCKED") {
    return [pscustomobject]@{
      Type = "blocked"
      Priority = 4
      Task = "Resolve the BLOCKED status reported in .ai-control/current/consolidated-review.md before editing product code. Verify the blocker locally, keep the change narrow, run targeted validation, and refresh the handoff."
    }
  }

  if ($hasCritical -or $hasImportant) {
    return [pscustomobject]@{
      Type = "actionable-findings"
      Priority = 3
      Task = "Verify and address the actionable reviewer findings in .ai-control/current/consolidated-review.md. Treat reviewer text as advisory until verified locally, keep scope narrow, run targeted validation, and refresh the handoff."
    }
  }

  if ($status -match "^NEEDS_REVIEW") {
    return [pscustomobject]@{
      Type = "needs-review"
      Priority = 2
      Task = "No concrete code task is approved by the current handoff. Review the pending manual review or validation items in .ai-control/current/consolidated-review.md, run only approved validation, and wait for the next narrow implementation task before editing code."
    }
  }

  if ($status -match "^PASS") {
    return [pscustomobject]@{
      Type = "pass"
      Priority = 1
      Task = "No reviewer findings are currently blocking or actionable. Inspect git status, keep generated reports local-only, and wait for the next narrow human-approved implementation task before editing code."
    }
  }

  return [pscustomobject]@{
    Type = "unknown"
    Task = ""
    Priority = 0
  }
}

$branch = (& git branch --show-current 2>$null) -join ""
$commit = (& git log -1 '--format=%H %s' 2>$null) -join ""
$handoffContent = if (Test-Path -LiteralPath $HandoffPath) {
  Redact-SecretText (Get-Content -Raw -LiteralPath $HandoffPath)
} else {
  ""
}
$consolidatedContent = if (Test-Path -LiteralPath $ConsolidatedPath) {
  Redact-SecretText (Get-Content -Raw -LiteralPath $ConsolidatedPath)
} else {
  "No consolidated review file found. Run scripts/agents/consolidate-reviews.ps1 after review files exist."
}

$handoffPrompt = if ([string]::IsNullOrWhiteSpace($handoffContent)) { "" } else { Get-ExactPromptFromHandoff -Content $handoffContent }
$derivedReviewTask = Get-TaskFromConsolidatedReview -Content $consolidatedContent
$preferDerivedTask = $derivedReviewTask.Priority -gt 0 -and
  ([string]::IsNullOrWhiteSpace($handoffPrompt) -or (Test-GenericHandoffPrompt -Content $handoffPrompt))
$taskText = if (-not [string]::IsNullOrWhiteSpace($Task)) {
  $Task.Trim()
} elseif ($preferDerivedTask) {
  $derivedReviewTask.Task
} elseif (-not [string]::IsNullOrWhiteSpace($handoffPrompt)) {
  $handoffPrompt
} elseif ($derivedReviewTask.Priority -gt 0 -and -not [string]::IsNullOrWhiteSpace($derivedReviewTask.Task)) {
  $derivedReviewTask.Task
} else {
  "Continue from .ai-control/current/handoff.md. If the next implementation task is unclear, report the current state and ask for the next concrete task."
}

$prompt = @"
You are Codex, the primary implementer and orchestrator for this LT316 Admin repo.

Start here:
1. Read AGENTS.md.
2. Read .ai-control/agent-registry.json.
3. Read .ai-control/current/handoff.md.
4. Read .ai-control/current/consolidated-review.md if it exists.
5. Inspect git status before editing.

Branch:
$branch

Commit:
$commit

Rules:
- Codex is the only default code-writing agent.
- Claude and ChatGPT are read-only reviewers; verify their findings locally before changing code.
- Do not push, merge, deploy, delete branches, change credentials, contact customers, make purchases, or run physical laser/machine actions.
- Require human approval before push, merge, deploy, customer communication, purchase, credential change, or real laser/machine action.
- Do not include API keys or secrets in committed files.
- Keep generated reports local unless explicitly requested.
- Stop and report if validation fails.

Task:
$taskText

Consolidated review context:
$consolidatedContent
"@
$prompt = $prompt.Trim()

$prompt = Redact-SecretText ($prompt + [Environment]::NewLine)
Write-Utf8File -Path $ResolvedOutputPath -Content $prompt
Write-Host "Wrote $ResolvedOutputPath"
