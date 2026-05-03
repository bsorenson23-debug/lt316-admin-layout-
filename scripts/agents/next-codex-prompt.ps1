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
$taskText = if (-not [string]::IsNullOrWhiteSpace($Task)) {
  $Task.Trim()
} elseif (-not [string]::IsNullOrWhiteSpace($handoffPrompt)) {
  $handoffPrompt
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
