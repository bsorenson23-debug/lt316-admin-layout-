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
$handoffExists = Test-Path -LiteralPath $handoffPath
$claudeReviewExists = Test-Path -LiteralPath $claudeReviewPath
$chatGptReviewExists = Test-Path -LiteralPath $chatGptReviewPath
$chatGptRequestExists = Test-Path -LiteralPath $chatGptRequestPath

$handoffSummary = if ($handoffExists) {
  Redact-SecretText (Get-Content -Raw -LiteralPath $handoffPath)
} else {
  "No .ai-control/current/handoff.md found. Run scripts/agents/write-handoff.ps1 first."
}
$claudeReview = if ($claudeReviewExists) {
  Redact-SecretText (Get-Content -Raw -LiteralPath $claudeReviewPath)
} else {
  "No .ai-control/reviews/claude-review.md found. Manual Claude review is pending."
}
$chatGptReview = if ($chatGptReviewExists) {
  Redact-SecretText (Get-Content -Raw -LiteralPath $chatGptReviewPath)
} else {
  "No .ai-control/reviews/chatgpt-review.md found. Manual ChatGPT review is pending; the outbox request is not review findings."
}
$chatGptRequest = if ($chatGptRequestExists) {
  Redact-SecretText (Get-Content -Raw -LiteralPath $chatGptRequestPath)
} else {
  "No .ai-control/outbox/chatgpt-review-request.md found. Run scripts/agents/write-handoff.ps1 first."
}

function Test-ClaudeManualPlaceholder {
  param([string]$Text)

  return $Text -match "(?m)^-\s+Mode:\s+Manual read-only review request\s*$" -and
    $Text -match "(?s)## Findings\s+Pending\.?\s*$"
}

function Get-ActualReviewTexts {
  $texts = New-Object System.Collections.Generic.List[string]

  if ($claudeReviewExists -and -not (Test-ClaudeManualPlaceholder -Text $claudeReview)) {
    $texts.Add($claudeReview)
  }

  if ($chatGptReviewExists) {
    $texts.Add($chatGptReview)
  }

  if (-not [string]::IsNullOrWhiteSpace($ReviewerNotes)) {
    $texts.Add((Redact-SecretText $ReviewerNotes.Trim()))
  }

  return $texts.ToArray()
}

function Get-MatchingReviewLines {
  param(
    [string[]]$Texts,
    [string]$Pattern
  )

  $ignorePattern = "(?i)^\s*$|^\s*#|^\s*~~~|^\s*-\s*(Generated|Branch|Commit|Mode|Status):|^\s*Read-only review\b|^\s*Claude was not executed\b|^\s*Paste \.ai-control\b|^\s*See \.ai-control\b|^\s*No \.ai-control\b"
  $collectedLines = New-Object System.Collections.Generic.List[string]
  foreach ($text in $Texts) {
    foreach ($line in ($text -split "\r?\n")) {
      $trimmed = $line.Trim()
      if ($trimmed -match $Pattern -and $trimmed -notmatch $ignorePattern) {
        $collectedLines.Add($trimmed)
      }
    }
  }

  return @($collectedLines.ToArray() | Select-Object -First 20)
}

function ConvertLinesTo-Bullets {
  param(
    [AllowNull()][string[]]$Lines,
    [string]$EmptyText
  )

  $values = @($Lines | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($values.Count -eq 0) {
    return @("- $EmptyText")
  }

  return $values | ForEach-Object { ConvertTo-SafeBulletLine -Line $_ }
}

function Get-ReviewerExecutionFailures {
  param([string[]]$Texts)

  $failurePattern = "(?i)(^\s*[-*+]?\s*Exit code\s*:\s*[1-9]\d*\b|^\s*[-*+]?\s*Write guard\s*:\s*FAIL\b|review command failed|failed reviewer execution)"
  $failures = New-Object System.Collections.Generic.List[string]
  foreach ($text in $Texts) {
    foreach ($line in ($text -split "\r?\n")) {
      $trimmed = $line.Trim()
      if ([string]::IsNullOrWhiteSpace($trimmed)) {
        continue
      }

      if ($trimmed -match $failurePattern) {
        $failures.Add($trimmed)
      }
    }
  }

  return @($failures.ToArray() | Select-Object -Unique -First 20)
}

function Test-HandoffValidationFailure {
  param([string]$Text)

  $section = Get-MarkdownSection -Text $Text -Heading "Pass/Fail Results"
  if ([string]::IsNullOrWhiteSpace($section)) {
    return $false
  }

  return $section -match "(?im)^\s*-\s*(FAIL|FAILED|BLOCKED|ERROR)\b|^\s*-\s*Overall:\s*(FAIL|FAILED|BLOCKED|ERROR)\b"
}

function Get-HandoffBlockers {
  param([string]$Text)

  $section = Get-MarkdownSection -Text $Text -Heading "Blockers"
  if ([string]::IsNullOrWhiteSpace($section)) {
    return @()
  }

  return @($section -split "\r?\n" |
    ForEach-Object { $_.Trim() } |
    Where-Object {
      -not [string]::IsNullOrWhiteSpace($_) -and
      $_ -notmatch "(?i)^-?\s*none reported\.?$"
    })
}

function Test-ValidationPending {
  param([string]$Text)

  $tests = Get-MarkdownSection -Text $Text -Heading "Tests Run"
  $results = Get-MarkdownSection -Text $Text -Heading "Pass/Fail Results"
  return $tests -match "(?i)not provided|not run|pending|skipped" -or
    $results -match "(?i)not provided|not run|pending|skipped|unknown"
}

function Get-OverallStatus {
  param(
    [string[]]$ReviewerExecutionFailureLines,
    [string[]]$CriticalLines,
    [string[]]$ImportantLines,
    [string[]]$PendingLines
  )

  if (-not $handoffExists) {
    return "BLOCKED: missing required handoff input."
  }

  $blockers = @(Get-HandoffBlockers -Text $handoffSummary)
  if ($blockers.Count -gt 0) {
    return "BLOCKED: explicit blocker reported in handoff."
  }

  if (Test-HandoffValidationFailure -Text $handoffSummary) {
    return "BLOCKED: validation failure reported in handoff."
  }

  if ($ReviewerExecutionFailureLines.Count -gt 0) {
    return "BLOCKED: failed reviewer execution detected in review output."
  }

  if ($CriticalLines.Count -gt 0) {
    return "BLOCKED: critical reviewer finding requires Codex verification."
  }

  if ($ImportantLines.Count -gt 0 -or $PendingLines.Count -gt 0) {
    return "NEEDS_REVIEW: no blocking findings, but review or validation follow-up is pending."
  }

  return "PASS: required handoff files are present and no reviewer findings were detected."
}

function Get-ExactNextPrompt {
  param([string]$HandoffText)

  $match = [regex]::Match($HandoffText, '(?s)## Exact Next Prompt\s+(?:```|~~~)text\s*(.*?)\s*(?:```|~~~)')
  if ($match.Success) {
    return $match.Groups[1].Value.Trim()
  }

  return "Continue from .ai-control/current/handoff.md and inspect git status before editing."
}

$actualReviewTexts = @(Get-ActualReviewTexts)
$reviewerExecutionFailureLines = @(Get-ReviewerExecutionFailures -Texts $actualReviewTexts)
$criticalLines = @(Get-MatchingReviewLines -Texts $actualReviewTexts -Pattern "(?i)\b(P0|critical|severe|unsafe|secret leak|credential leak|blocked|blocker)\b")
if ($reviewerExecutionFailureLines.Count -gt 0) {
  foreach ($failureLine in $reviewerExecutionFailureLines) {
    $criticalLines += "Reviewer execution failure: $failureLine"
  }
}
$importantLines = @(Get-MatchingReviewLines -Texts $actualReviewTexts -Pattern "(?i)\b(P1|P2|important|bug|regression|risk|missing|warning|question)\b")
$pendingLines = New-Object System.Collections.Generic.List[string]
if (-not $claudeReviewExists) {
  $pendingLines.Add("Manual Claude review has not been requested yet.")
} elseif (Test-ClaudeManualPlaceholder -Text $claudeReview) {
  $pendingLines.Add("Manual Claude review is pending; safe placeholder mode was used.")
}
if (-not $chatGptReviewExists) {
  $pendingLines.Add("Manual ChatGPT review output is pending; outbox request stub is not treated as findings.")
}
if (-not $chatGptRequestExists) {
  $pendingLines.Add("ChatGPT review request stub is missing; run write-handoff.ps1 to regenerate local outbox files.")
}
if (Test-ValidationPending -Text $handoffSummary) {
  $pendingLines.Add("Validation summary is not provided in the handoff.")
}

$overallStatus = Get-OverallStatus -ReviewerExecutionFailureLines $reviewerExecutionFailureLines -CriticalLines $criticalLines -ImportantLines $importantLines -PendingLines @($pendingLines)
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
$lines += ConvertLinesTo-Bullets -Lines $criticalLines -EmptyText "None detected in available review text."
$lines += @(
  "",
  "## Important Findings"
)
$lines += ConvertLinesTo-Bullets -Lines $importantLines -EmptyText "None detected in available review text."
$lines += @(
  "",
  "## Missing Validation"
)
$lines += ConvertLinesTo-Bullets -Lines @($pendingLines) -EmptyText "None detected in available handoff/review text."
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
