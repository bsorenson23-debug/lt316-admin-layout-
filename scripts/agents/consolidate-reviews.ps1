[CmdletBinding()]
param(
  [string]$ReviewerNotes = "",
  [string]$OutputPath = ".ai-control/current/consolidated-review.md"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$ReviewDir = Join-Path $RepoRoot ".ai-control\reviews"
$CurrentDir = Join-Path $RepoRoot ".ai-control\current"
$OutboxDir = Join-Path $RepoRoot ".ai-control\outbox"
$ResolvedOutputPath = if ([System.IO.Path]::IsPathRooted($OutputPath)) { $OutputPath } else { Join-Path $RepoRoot $OutputPath }

New-Item -ItemType Directory -Force -Path $ReviewDir, $CurrentDir, $OutboxDir | Out-Null
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
  $secretName = '(?:api[_-]?key|token|secret|password|passwd|pwd|authorization|cookie|connection(?:[_-]?string)?|database[_-]?url|db[_-]?url|mongo(?:db)?[_-]?uri|postgres(?:ql)?[_-]?url|mysql[_-]?url|redis[_-]?url|account[_-]?key)'
  $secretValue = '(?:"[^"\r\n]*"|''[^''\r\n]*''|[^\r\n]*)'

  $redacted = [regex]::Replace($redacted, "(?im)^(\s*(?:export\s+)?[A-Za-z_][\w.-]*$secretName[\w.-]*\s*=\s*)$secretValue", '$1[REDACTED]')
  $redacted = [regex]::Replace($redacted, "(?im)^(\s*\`$env:[A-Za-z_][\w.-]*$secretName[\w.-]*\s*=\s*)$secretValue", '$1[REDACTED]')
  $redacted = [regex]::Replace($redacted, "(?im)^(\s*setx\s+[A-Za-z_][\w.-]*$secretName[\w.-]*\s+)$secretValue", '$1[REDACTED]')
  $redacted = [regex]::Replace($redacted, "(?im)^(\s*[-*]?\s*[A-Za-z0-9_. -]*$secretName[A-Za-z0-9_. -]*\s*[:=]\s*)$secretValue", '$1[REDACTED]')
  $redacted = [regex]::Replace($redacted, '(?i)\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|sqlserver)://[^\s`''")]+', '[REDACTED_CONNECTION_STRING]')
  $redacted = [regex]::Replace($redacted, '(?i)\b(?:Server|Data Source|Host|User Id|Uid|Password|Pwd|AccountKey)\s*=\s*[^;\r\n]+(?:;[^\r\n]*)?', '[REDACTED_CONNECTION_STRING]')
  $redacted = [regex]::Replace($redacted, "(?i)bearer\s+[a-z0-9._~+/\-=]+", "Bearer [REDACTED]")
  $redacted = [regex]::Replace($redacted, "sk-ant-[A-Za-z0-9_\-]{20,}", "[REDACTED_API_KEY]")
  $redacted = [regex]::Replace($redacted, "sk-[A-Za-z0-9_\-]{20,}", "[REDACTED_API_KEY]")
  return $redacted
}

function ConvertTo-RelativePath {
  param([Parameter(Mandatory = $true)][string]$Path)

  $fullPath = (Resolve-Path -LiteralPath $Path).Path
  if ($fullPath.StartsWith($RepoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $fullPath.Substring($RepoRoot.Length).TrimStart([char[]]@('\', '/'))
  }

  return $fullPath
}

$branch = (& git branch --show-current 2>$null) -join ""
$commit = (& git log -1 '--format=%H %s' 2>$null) -join ""
$handoffPath = Join-Path $CurrentDir "handoff.md"
$claudeReviewPath = Join-Path $ReviewDir "claude-review.md"
$chatGptReviewPath = Join-Path $ReviewDir "chatgpt-review.md"
$chatGptRequestPath = Join-Path $OutboxDir "chatgpt-review-request.md"
$handoffSummary = if (Test-Path -LiteralPath $handoffPath) {
  Redact-SecretText (Get-Content -Raw -LiteralPath $handoffPath)
} else {
  "No .ai-control/current/handoff.md found. Run scripts/agents/write-handoff.ps1 first."
}
$claudeReview = if (Test-Path -LiteralPath $claudeReviewPath) {
  Redact-SecretText (Get-Content -Raw -LiteralPath $claudeReviewPath)
} else {
  "No .ai-control/reviews/claude-review.md found. Run scripts/agents/claude-review.ps1 first."
}
$chatGptReview = if (Test-Path -LiteralPath $chatGptReviewPath) {
  Redact-SecretText (Get-Content -Raw -LiteralPath $chatGptReviewPath)
} else {
  "No .ai-control/reviews/chatgpt-review.md found. Treat .ai-control/outbox/chatgpt-review-request.md as the request stub, not review findings."
}
$chatGptRequest = if (Test-Path -LiteralPath $chatGptRequestPath) {
  Redact-SecretText (Get-Content -Raw -LiteralPath $chatGptRequestPath)
} else {
  "No .ai-control/outbox/chatgpt-review-request.md found. Run scripts/agents/write-handoff.ps1 first."
}

function Get-SectionStatus {
  param(
    [string[]]$RequiredTexts,
    [string[]]$BlockedTexts
  )

  $missing = @($RequiredTexts | Where-Object { $_ -match "^No \.ai-control/" })
  if ($missing.Count -gt 0) {
    return "BLOCKED: missing required handoff/review inputs."
  }

  $combined = ($RequiredTexts + $BlockedTexts) -join [Environment]::NewLine
  if ($combined -match "(?i)\bFAIL\b|\bBLOCKED\b|\bERROR\b|validation failed") {
    return "BLOCKED: failure or blocked text found in handoff/review inputs."
  }

  return "PASS: required handoff and review request files are present."
}

function Get-LinesMatching {
  param(
    [string]$Text,
    [string]$Pattern,
    [string]$EmptyText
  )

  $matches = @($Text -split "\r?\n" | Where-Object { $_ -match $Pattern } | Select-Object -First 20)
  if ($matches.Count -eq 0) {
    return @("- $EmptyText")
  }

  return $matches | ForEach-Object { "- $($_.Trim())" }
}

function Get-ExactNextPrompt {
  param([string]$HandoffText)

  $match = [regex]::Match($HandoffText, '(?s)## Exact Next Prompt\s+(?:```|~~~)text\s*(.*?)\s*(?:```|~~~)')
  if ($match.Success) {
    return $match.Groups[1].Value.Trim()
  }

  return "Continue from .ai-control/current/handoff.md and inspect git status before editing."
}

$overallStatus = Get-SectionStatus -RequiredTexts @($handoffSummary, $claudeReview, $chatGptRequest) -BlockedTexts @($chatGptReview, $ReviewerNotes)
$exactNextPrompt = Get-ExactNextPrompt -HandoffText $handoffSummary

$lines = @(
  "# Consolidated AI Reviews",
  "",
  "- Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')",
  "- Branch: $branch",
  "- Commit: $commit",
  "- Status: $overallStatus",
  "",
  "## Operating Rules",
  "",
  "- Codex remains the only default code-writing agent.",
  "- Claude and ChatGPT review outputs are advisory until Codex verifies them against the repo.",
  "- Do not push, merge, deploy, delete branches, change credentials, contact customers, make purchases, or run physical laser/machine actions.",
  "- Require human approval before push, merge, deploy, customer communication, purchase, credential change, or real laser/machine action.",
  "- Do not include API keys or secrets in committed files.",
  "- Keep generated reports local unless explicitly requested.",
  "",
  "## Handoff Reference",
  "",
  "~~~text",
  $handoffSummary,
  "~~~",
  "",
  "## Pass/Fail/Blocked Status",
  "",
  $overallStatus,
  "",
  "## Critical Findings"
)
$lines += Get-LinesMatching -Text (($claudeReview, $chatGptReview, $ReviewerNotes) -join [Environment]::NewLine) -Pattern "(?i)\b(P0|critical|severe|unsafe|secret|credential|laser|machine|push|merge|deploy)\b" -EmptyText "None detected in available review text."
$lines += @(
  "",
  "## Important Findings"
)
$lines += Get-LinesMatching -Text (($claudeReview, $chatGptReview, $ReviewerNotes) -join [Environment]::NewLine) -Pattern "(?i)\b(P1|P2|important|bug|regression|risk|missing|warning|question)\b" -EmptyText "None detected in available review text."
$lines += @(
  "",
  "## Missing Validation"
)
$lines += Get-LinesMatching -Text (($handoffSummary, $claudeReview, $chatGptReview, $ReviewerNotes) -join [Environment]::NewLine) -Pattern "(?i)missing validation|not run|skipped|pending|no screenshots|none found|blocked" -EmptyText "None detected in available handoff/review text."
$lines += @(
  "",
  "## Reviewer Inputs",
  "",
  "### .ai-control/reviews/claude-review.md",
  "",
  "~~~text",
  $claudeReview.Trim(),
  "~~~",
  "",
  "### .ai-control/reviews/chatgpt-review.md",
  "",
  "~~~text",
  $chatGptReview.Trim(),
  "~~~",
  "",
  "### .ai-control/outbox/chatgpt-review-request.md (request stub)",
  "",
  "~~~text",
  $chatGptRequest.Trim(),
  "~~~"
)

if (-not [string]::IsNullOrWhiteSpace($ReviewerNotes)) {
  $lines += ""
  $lines += "### Inline Reviewer Notes"
  $lines += ""
  $lines += "~~~text"
  $lines += (Redact-SecretText $ReviewerNotes.Trim())
  $lines += "~~~"
}

$lines += @(
  "",
  "## Exact Next Codex Prompt",
  "",
  "~~~text",
  $exactNextPrompt,
  "~~~",
  "",
  "## Codex Consolidation",
  "",
  "- Verify every reviewer claim against local code before editing.",
  "- Prioritize real bugs, failing validation, operator safety, export correctness, and missing evidence.",
  "- Treat unresolved reviewer requests as questions, not implementation authority.",
  "- After implementation, run targeted validation and refresh .ai-control/current/handoff.md.",
  ""
)

Write-Utf8File -Path $ResolvedOutputPath -Content (($lines -join [Environment]::NewLine) + [Environment]::NewLine)
Write-Host "Wrote $ResolvedOutputPath"
