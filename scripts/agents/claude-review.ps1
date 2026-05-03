[CmdletBinding()]
param(
  [switch]$RunClaude,
  [string]$ClaudeExe = "claude",
  [string]$HandoffPath = ".ai-control/current/handoff.md"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$OutboxDir = Join-Path $RepoRoot ".ai-control\outbox"
$ReviewDir = Join-Path $RepoRoot ".ai-control\reviews"
$PromptPath = Join-Path $OutboxDir "claude-review-prompt.md"
$ReviewPath = Join-Path $ReviewDir "claude-review.md"
$ResolvedHandoffPath = if ([System.IO.Path]::IsPathRooted($HandoffPath)) { $HandoffPath } else { Join-Path $RepoRoot $HandoffPath }

New-Item -ItemType Directory -Force -Path $OutboxDir, $ReviewDir | Out-Null
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

function Get-GitStatusText {
  $status = & git status --short 2>$null
  return (($status | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine).Trim()
}

if (-not (Test-Path -LiteralPath $ResolvedHandoffPath)) {
  Write-Error "Missing handoff at $ResolvedHandoffPath. Run scripts/agents/write-handoff.ps1 first."
  exit 1
}

$branch = (& git branch --show-current 2>$null) -join ""
$commit = (& git log -1 '--format=%H %s' 2>$null) -join ""
$handoff = Redact-SecretText (Get-Content -Raw -LiteralPath $ResolvedHandoffPath)

$prompt = @"
You are Claude acting as a read-only reviewer for the LT316 Admin repo.

Rules:
- Do not edit files.
- Do not use tools to modify files.
- Do not run push, merge, deploy, branch deletion, credential changes, customer communication, purchases, or physical laser/machine actions.
- Do not request or reveal secrets, API keys, tokens, credentials, cookies, or local environment values.
- Review only this prompt, the handoff text, git state, changed-file list, and evidence paths.
- Do not request .env, .env.local, credentials, node_modules, .next, generated GLBs, local diagnostics contents, or hidden environment values.
- Return findings only. Codex remains the only default code-writing implementer.

Repo state:
- Branch: $branch
- Commit: $commit

Review output format:
- Findings: bugs, regressions, safety risks, or missing validation, ordered by severity
- Questions: only blockers that Codex cannot verify locally
- Suggested validation
- Overall read-only recommendation

Handoff:
$handoff
"@
$prompt = $prompt.Trim()
$promptFileContent = @"
# Claude Review Prompt

- Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')
- Mode: Read-only review prompt
- Branch: $branch
- Commit: $commit

~~~text
$prompt
~~~
"@

Write-Utf8File -Path $PromptPath -Content ((Redact-SecretText $promptFileContent.TrimEnd()) + [Environment]::NewLine)

if ($RunClaude) {
  $claude = Get-Command $ClaudeExe -ErrorAction SilentlyContinue
  if ($null -eq $claude) {
    Write-Error "Unable to find $ClaudeExe on PATH. Re-run without -RunClaude to write a manual review request."
    exit 1
  }

  $statusBefore = Get-GitStatusText
  $output = & $claude.Source -p $prompt 2>&1
  $exitCode = $LASTEXITCODE
  $statusAfter = Get-GitStatusText
  $outputText = Redact-SecretText (($output | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine)
  $writeGuard = if ($statusBefore -eq $statusAfter) {
    "PASS: git status was unchanged by Claude review."
  } else {
    "FAIL: git status changed during Claude review. Inspect and revert only if explicitly approved by a human."
  }

  $content = @"
# Claude Review

- Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')
- Mode: Claude CLI read-only review
- Branch: $branch
- Commit: $commit
- Exit code: $exitCode
- Write guard: $writeGuard

## Review

$outputText
"@

  Write-Utf8File -Path $ReviewPath -Content ($content.TrimEnd() + [Environment]::NewLine)

  if ($exitCode -ne 0) {
    Write-Error "Claude review command failed with exit code $exitCode. See $ReviewPath."
    exit $exitCode
  }

  if ($statusBefore -ne $statusAfter) {
    Write-Error "Claude review changed git status. See $ReviewPath."
    exit 1
  }
} else {
  $content = @"
# Claude Review

- Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')
- Mode: Manual read-only review request
- Branch: $branch
- Commit: $commit

Claude was not executed. Paste `.ai-control/outbox/claude-review-prompt.md` into Claude, or re-run with -RunClaude if the Claude CLI is installed and human-approved for read-only review.

## Request

See `.ai-control/outbox/claude-review-prompt.md`.

## Findings

Pending.
"@

  Write-Utf8File -Path $ReviewPath -Content ($content.TrimEnd() + [Environment]::NewLine)
}

Write-Host "Wrote $ReviewPath"
Write-Host "Wrote $PromptPath"
