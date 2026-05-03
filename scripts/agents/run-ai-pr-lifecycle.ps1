[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("Preflight", "LocalValidate", "CommitReady", "PushReady", "RequestReview", "ReviewWatch", "FinalMergeReady")]
  [string]$Mode,

  [string[]]$ExpectedFiles = @(),
  [string[]]$ValidationCommand = @(),
  [switch]$AllowDirty,
  [string]$ExpectedHeadCommit = "",
  [switch]$DoPush,
  [int]$PrNumber,
  [string]$ReviewPrompt = "",
  [string]$ExpectedHeadSha = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$AiCurrentDir = Join-Path $RepoRoot ".ai-control\current"
$LifecycleReportPath = Join-Path $AiCurrentDir "pr-lifecycle-report.md"
$DefaultValidationCommands = @(
  "npx.cmd tsc --noEmit --pretty false",
  "npm.cmd run test:body-reference-contract",
  "git diff --check",
  "git diff --cached --check"
)
$SafeAiWorkflowCommands = @(
  ".\scripts\agents\write-handoff.ps1",
  ".\scripts\agents\claude-review.ps1",
  ".\scripts\agents\consolidate-reviews.ps1",
  ".\scripts\agents\next-codex-prompt.ps1"
)
$GeneratedAreaArgs = @(".ai-control", ".codex-handoff")
$ForbiddenCommittedPathPatterns = @(
  @{ Pattern = "^\.ai-control/"; Reason = "generated .ai-control artifact" },
  @{ Pattern = "^\.codex-handoff/"; Reason = "generated .codex-handoff artifact" },
  @{ Pattern = "^\.codex-diagnostics/"; Reason = "generated .codex-diagnostics artifact" },
  @{ Pattern = "^\.next/"; Reason = ".next build output" },
  @{ Pattern = "^node_modules/"; Reason = "node_modules dependency output" },
  @{ Pattern = "^test-results/"; Reason = "test-results artifact" },
  @{ Pattern = "^playwright-report/"; Reason = "Playwright report artifact" },
  @{ Pattern = "^public/models/"; Reason = "public model fixture or generated model asset" },
  @{ Pattern = "\.(?:png|jpg|jpeg|webp)$"; Reason = "screenshot artifact" },
  @{ Pattern = "\.(?:glb|gltf|stl|obj)$"; Reason = "model asset" }
)
$SecretPatterns = @(
  "(?i)\b(?:api[_-]?key|token|secret|password|passwd|pwd|authorization|cookie|account[_-]?key)\b\s*[:=]\s*\S+",
  "(?i)bearer\s+[a-z0-9._~+/\-=]+",
  "sk-ant-[A-Za-z0-9_\-]{20,}",
  "sk-[A-Za-z0-9_\-]{20,}",
  "(?i)(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|sqlserver)://[^\s\)]+"
)

New-Item -ItemType Directory -Force -Path $AiCurrentDir | Out-Null
Set-Location $RepoRoot

function Write-Utf8File {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Content
  )

  $encoding = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function ConvertTo-NormalizedRepoPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  return ($Path.Trim() -replace "\\", "/")
}

function ConvertTo-NormalizedPathSet {
  param([string[]]$Paths)

  return @($Paths | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | ForEach-Object { ConvertTo-NormalizedRepoPath -Path $_ })
}

function Invoke-ScriptCommand {
  param(
    [Parameter(Mandatory = $true)]$Command,
    [object[]]$ArgumentList = @()
  )

  $scriptBlock = if ($Command -is [scriptblock]) {
    $Command
  } else {
    [scriptblock]::Create([string]$Command)
  }

  $output = & $scriptBlock @ArgumentList 2>&1
  $exitCode = if ($null -ne $LASTEXITCODE) { [int]$LASTEXITCODE } else { 0 }
  return [pscustomobject]@{
    Command = $Command.ToString().Trim()
    ExitCode = $exitCode
    Succeeded = $exitCode -eq 0
    Output = (($output | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine).Trim()
  }
}

function ConvertTo-InvariantDateTimeOffset {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $null
  }

  return [DateTimeOffset]::Parse($Value, [System.Globalization.CultureInfo]::InvariantCulture)
}

function Get-CommandOutputLines {
  param([Parameter(Mandatory = $true)][string]$Command)

  $result = Invoke-ScriptCommand -Command $Command
  if (-not $result.Succeeded) {
    return @()
  }

  if ([string]::IsNullOrWhiteSpace($result.Output)) {
    return @()
  }

  return @($result.Output -split "\r?\n" | ForEach-Object { $_.TrimEnd() })
}

function Get-CurrentBranch {
  return ((Get-CommandOutputLines -Command "git branch --show-current") -join "").Trim()
}

function Get-LatestCommit {
  return ((Get-CommandOutputLines -Command "git log -1 --format='%H %s'") -join "").Trim()
}

function Get-TrackedStatusLines {
  return Get-CommandOutputLines -Command "git status --short --untracked-files=no"
}

function Get-WorkingTreeStatusLines {
  return Get-CommandOutputLines -Command "git status --short"
}

function Get-IgnoredGeneratedStatusLines {
  return Get-CommandOutputLines -Command "git status --ignored --short .ai-control .codex-handoff"
}

function Get-StashListLines {
  return Get-CommandOutputLines -Command "git stash list"
}

function Get-BranchDeltaFiles {
  return ConvertTo-NormalizedPathSet -Paths (Get-CommandOutputLines -Command "git diff --name-only origin/main...HEAD")
}

function Get-CachedNameStatusLines {
  return Get-CommandOutputLines -Command "git diff --cached --name-status"
}

function Get-CachedFiles {
  $lines = Get-CachedNameStatusLines
  $files = New-Object System.Collections.Generic.List[string]
  foreach ($line in $lines) {
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }

    $parts = $line -split "\s+", 2
    if ($parts.Count -lt 2) {
      continue
    }

    $files.Add((ConvertTo-NormalizedRepoPath -Path $parts[1]))
  }

  return @($files.ToArray())
}

function Test-ArraysEqual {
  param(
    [string[]]$Left,
    [string[]]$Right
  )

  $leftItems = @($Left)
  $rightItems = @($Right)
  if ($leftItems.Count -ne $rightItems.Count) {
    return $false
  }

  for ($index = 0; $index -lt $leftItems.Count; $index += 1) {
    if ($leftItems[$index] -ne $rightItems[$index]) {
      return $false
    }
  }

  return $true
}

function Test-GeneratedAreasIgnoredOnly {
  param([string[]]$Lines)

  foreach ($line in @($Lines)) {
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }

    if ($line -notmatch '^!!\s+') {
      return $false
    }
  }

  return $true
}

function Get-UnexpectedPaths {
  param(
    [string[]]$Observed,
    [string[]]$Expected
  )

  $expectedSet = @{}
  foreach ($path in (ConvertTo-NormalizedPathSet -Paths $Expected)) {
    $expectedSet[$path.ToLowerInvariant()] = $true
  }

  $unexpected = New-Object System.Collections.Generic.List[string]
  foreach ($path in (ConvertTo-NormalizedPathSet -Paths $Observed)) {
    if (-not $expectedSet.ContainsKey($path.ToLowerInvariant())) {
      $unexpected.Add($path)
    }
  }

  return @($unexpected.ToArray())
}

function Get-ForbiddenPathFindings {
  param([string[]]$Paths)

  $findings = New-Object System.Collections.Generic.List[string]
  foreach ($path in (ConvertTo-NormalizedPathSet -Paths $Paths)) {
    foreach ($rule in $ForbiddenCommittedPathPatterns) {
      if ($path -match $rule.Pattern) {
        $findings.Add("$path ($($rule.Reason))")
        break
      }
    }
  }

  return @($findings.ToArray() | Select-Object -Unique)
}

function Get-StagedSecretFindings {
  $result = Invoke-ScriptCommand -Command "git diff --cached --no-color --unified=0"
  if (-not $result.Succeeded -or [string]::IsNullOrWhiteSpace($result.Output)) {
    return @()
  }

  $findings = New-Object System.Collections.Generic.List[string]
  foreach ($pattern in $SecretPatterns) {
    foreach ($match in [regex]::Matches($result.Output, $pattern)) {
      $value = $match.Value
      if (-not [string]::IsNullOrWhiteSpace($value)) {
        $findings.Add($value)
      }
    }
  }

  return @($findings.ToArray() | Select-Object -Unique -First 10)
}

function ConvertTo-Bullets {
  param(
    [string[]]$Items,
    [string]$EmptyText = "None."
  )

  $values = @($Items | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($values.Count -eq 0) {
    return @("- $EmptyText")
  }

  return @($values | ForEach-Object { "- $($_.Trim())" })
}

function Test-GhAvailable {
  return $null -ne (Get-Command gh -ErrorAction SilentlyContinue)
}

function Get-RepositoryInfo {
  $remoteUrl = ((Get-CommandOutputLines -Command "git remote get-url origin") -join "").Trim()
  if ([string]::IsNullOrWhiteSpace($remoteUrl)) {
    throw "Unable to resolve git remote origin URL."
  }

  $match = [regex]::Match($remoteUrl, '(?i)(?:github\.com[:/])(?<owner>[^/]+)/(?<repo>[^/.]+)(?:\.git)?$')
  if (-not $match.Success) {
    throw "Unable to parse GitHub owner/repo from origin URL: $remoteUrl"
  }

  return [pscustomobject]@{
    Owner = $match.Groups['owner'].Value
    Name = $match.Groups['repo'].Value
  }
}

function Get-OpenPrForBranch {
  param([Parameter(Mandatory = $true)][string]$Branch)

  if (-not (Test-GhAvailable)) {
    return $null
  }

  $result = Invoke-ScriptCommand -Command {
    param($HeadBranch)
    gh pr list --head $HeadBranch --state open --json number,url
  } -ArgumentList @($Branch)
  if (-not $result.Succeeded -or [string]::IsNullOrWhiteSpace($result.Output)) {
    return $null
  }

  $items = $result.Output | ConvertFrom-Json
  if ($items.Count -eq 0) {
    return $null
  }

  return $items[0]
}

function Get-DefaultReviewPrompt {
  return @"
@codex review the latest PR head commit.

Please confirm:
- changed files are limited to the intended scope
- validation passed
- generated reports/artifacts remain ignored/local-only
- no secrets or public model fixtures were committed
- Claude execution remains opt-in only via -RunClaude
- Codex exec remains opt-in only via -RunNextPrompt
- no push/merge/deploy/credential/customer/purchase/laser-machine action was performed by scripts
"@.Trim()
}

function Get-PrReviewData {
  param([Parameter(Mandatory = $true)][int]$Number)

  if (-not (Test-GhAvailable)) {
    throw "gh CLI is not available."
  }

  $viewResult = Invoke-ScriptCommand -Command {
    param($PullRequestNumber)
    gh pr view $PullRequestNumber --json headRefOid,mergeStateStatus,reviewDecision,files,comments,reviews,commits,url
  } -ArgumentList @($Number)
  if (-not $viewResult.Succeeded -or [string]::IsNullOrWhiteSpace($viewResult.Output)) {
    throw "Unable to read PR #$Number via gh pr view."
  }

  $repoInfo = Get-RepositoryInfo
  $graphQl = @'
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      mergeable
      reviewThreads(first: 100) {
        nodes {
          isResolved
          path
          line
          originalLine
          comments(last: 20) {
            nodes {
              author {
                login
              }
              body
              createdAt
              publishedAt
              commit {
                oid
              }
              url
            }
          }
        }
      }
    }
  }
}
'@
  $threadResult = Invoke-ScriptCommand -Command {
    param($GraphQlQuery, $Owner, $RepoName, $PullRequestNumber)
    gh api graphql -f query=$GraphQlQuery -F owner=$Owner -F name=$RepoName -F number=$PullRequestNumber
  } -ArgumentList @($graphQl, $repoInfo.Owner, $repoInfo.Name, $Number)
  if (-not $threadResult.Succeeded -or [string]::IsNullOrWhiteSpace($threadResult.Output)) {
    throw "Unable to read PR review threads for #$Number via gh api graphql."
  }

  $view = $viewResult.Output | ConvertFrom-Json
  $threadPayload = $threadResult.Output | ConvertFrom-Json
  return [pscustomobject]@{
    View = $view
    Threads = $threadPayload.data.repository.pullRequest.reviewThreads.nodes
    Mergeable = $threadPayload.data.repository.pullRequest.mergeable
  }
}

function Get-PrCheckSummary {
  param([Parameter(Mandatory = $true)][int]$Number)

  if (-not (Test-GhAvailable)) {
    return [pscustomobject]@{
      Available = $false
      Failures = @()
      Pending = @()
      Raw = "gh CLI unavailable"
    }
  }

  $result = Invoke-ScriptCommand -Command {
    param($PullRequestNumber)
    gh pr checks $PullRequestNumber --json name,status,conclusion
  } -ArgumentList @($Number)
  if (-not $result.Succeeded) {
    return [pscustomobject]@{
      Available = $false
      Failures = @()
      Pending = @()
      Raw = $result.Output
    }
  }

  $failures = New-Object System.Collections.Generic.List[string]
  $pending = New-Object System.Collections.Generic.List[string]
  $checks = @()
  if (-not [string]::IsNullOrWhiteSpace($result.Output)) {
    $checks = @($result.Output | ConvertFrom-Json)
  }

  foreach ($check in $checks) {
    $checkName = [string]$check.name
    $status = [string]$check.status
    $conclusion = [string]$check.conclusion
    $normalizedStatus = $status.ToLowerInvariant()
    $normalizedConclusion = $conclusion.ToLowerInvariant()

    if ($normalizedConclusion -in @('failure', 'cancelled', 'timed_out', 'action_required')) {
      $failures.Add("${checkName}: $conclusion")
      continue
    }

    if ($normalizedStatus -ne 'completed') {
      $pending.Add("${checkName}: $status")
    }
  }

  return [pscustomobject]@{
    Available = $true
    Failures = @($failures.ToArray())
    Pending = @($pending.ToArray())
    Raw = $result.Output
  }
}

function Get-SeverityLabel {
  param([string]$Text)

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return "unspecified"
  }

  if ($Text -match '(?i)\bP1\b|\bblocker\b|\bcritical\b|\bhigh\b') {
    return "high"
  }

  if ($Text -match '(?i)\bP2\b|\bmedium\b') {
    return "medium"
  }

  return "unspecified"
}

function Get-SummaryLine {
  param([string]$Text)

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return "No comment summary provided."
  }

  $firstLine = (($Text -split "\r?\n")[0]).Trim()
  if ($firstLine.Length -le 160) {
    return $firstLine
  }

  return ($firstLine.Substring(0, 157) + "...")
}

function New-ReviewFinding {
  param(
    [string]$Reviewer,
    [string]$Severity,
    [string]$File,
    [string]$Line,
    [string]$Summary,
    [string]$Url
  )

  return [pscustomobject]@{
    Reviewer = if ([string]::IsNullOrWhiteSpace($Reviewer)) { "unknown" } else { $Reviewer }
    Severity = if ([string]::IsNullOrWhiteSpace($Severity)) { "unspecified" } else { $Severity }
    File = if ([string]::IsNullOrWhiteSpace($File)) { "n/a" } else { $File }
    Line = if ([string]::IsNullOrWhiteSpace($Line)) { "n/a" } else { $Line }
    Summary = $Summary
    Url = $Url
  }
}

function Get-FirstNonEmptyValue {
  param(
    [object[]]$Values,
    [object]$Default = $null
  )

  foreach ($value in @($Values)) {
    if ($null -eq $value) {
      continue
    }

    $stringValue = [string]$value
    if (-not [string]::IsNullOrWhiteSpace($stringValue)) {
      return $value
    }
  }

  return $Default
}

function Get-ReviewWatchAssessment {
  param(
    [Parameter(Mandatory = $true)][int]$Number,
    [string]$ExpectedHead
  )

  $data = Get-PrReviewData -Number $Number
  $checkSummary = Get-PrCheckSummary -Number $Number
  $view = $data.View
  $headSha = [string]$view.headRefOid
  $changedFiles = @($view.files | ForEach-Object { ConvertTo-NormalizedRepoPath -Path $_.path })

  $latestCommitDate = $null
  if ($view.commits.Count -gt 0) {
    $latestCommit = $view.commits[-1]
    if ($latestCommit.committedDate) {
      $latestCommitDate = ConvertTo-InvariantDateTimeOffset -Value $latestCommit.committedDate
    } elseif ($latestCommit.commit.committedDate) {
      $latestCommitDate = ConvertTo-InvariantDateTimeOffset -Value $latestCommit.commit.committedDate
    }
  }

  $findings = New-Object System.Collections.Generic.List[object]
  $reasons = New-Object System.Collections.Generic.List[string]

  if (-not [string]::IsNullOrWhiteSpace($ExpectedHead) -and $headSha -ne $ExpectedHead) {
    $reasons.Add("PR head SHA does not match expected head SHA.")
  }

  $mergeStateStatus = [string]$view.mergeStateStatus
  $mergeable = [string]$data.Mergeable
  $mergeStateAllowed = @("CLEAN", "HAS_HOOKS")
  $mergeableAllowed = @("MERGEABLE")
  if ($mergeStateAllowed -notcontains $mergeStateStatus -and $mergeableAllowed -notcontains $mergeable) {
    $reasons.Add("PR merge state is not clean/mergeable (mergeStateStatus=$mergeStateStatus, mergeable=$mergeable).")
  }

  if ($checkSummary.Failures.Count -gt 0) {
    $reasons.Add("One or more PR checks are failing.")
  }

  foreach ($thread in @($data.Threads)) {
    $threadPath = if ($thread.path) { ConvertTo-NormalizedRepoPath -Path $thread.path } else { "n/a" }
    $latestThreadComment = @($thread.comments.nodes)[-1]
    if ($null -eq $latestThreadComment) {
      continue
    }

    $commentBody = [string]$latestThreadComment.body
    $commentAuthor = [string]$latestThreadComment.author.login
    $commentDate = if ($latestThreadComment.publishedAt) {
      ConvertTo-InvariantDateTimeOffset -Value $latestThreadComment.publishedAt
    } elseif ($latestThreadComment.createdAt) {
      ConvertTo-InvariantDateTimeOffset -Value $latestThreadComment.createdAt
    } else {
      $null
    }
    $severity = Get-SeverityLabel -Text $commentBody
    $isCurrentFile = $changedFiles -contains $threadPath
    $afterLatestHead = $null -eq $latestCommitDate -or ($null -ne $commentDate -and $commentDate -ge $latestCommitDate)
    $needsFix = $commentBody -match '(?i)\b(P1|P2|high|medium|required|must fix|needs fix|should fix|blocker|regression|bug)\b'
    $lineValue = [string](Get-FirstNonEmptyValue -Values @($thread.line, $thread.originalLine) -Default "n/a")

    if ((-not $thread.isResolved) -and $isCurrentFile) {
      $findings.Add((New-ReviewFinding -Reviewer $commentAuthor -Severity $severity -File $threadPath -Line $lineValue -Summary (Get-SummaryLine -Text $commentBody) -Url $latestThreadComment.url))
      continue
    }

    if ($afterLatestHead -and $needsFix) {
      $findings.Add((New-ReviewFinding -Reviewer $commentAuthor -Severity $severity -File $threadPath -Line $lineValue -Summary (Get-SummaryLine -Text $commentBody) -Url $latestThreadComment.url))
    }
  }

  foreach ($review in @($view.reviews)) {
    $author = [string]$review.author.login
    $body = [string]$review.body
    if ([string]::IsNullOrWhiteSpace($body)) {
      continue
    }

    $submittedAt = if ($review.submittedAt) { ConvertTo-InvariantDateTimeOffset -Value $review.submittedAt } else { $null }
    $afterLatestHead = $null -eq $latestCommitDate -or ($null -ne $submittedAt -and $submittedAt -ge $latestCommitDate)
    $isAiReviewer = $author -match '(?i)codex|gemini|copilot'
    $needsFix = $body -match '(?i)\b(P1|P2|high|medium|required|must fix|needs fix|should fix|blocker|regression|bug|major issue)\b'
    if ($afterLatestHead -and $isAiReviewer -and $needsFix) {
      $findings.Add((New-ReviewFinding -Reviewer $author -Severity (Get-SeverityLabel -Text $body) -File "n/a" -Line "n/a" -Summary (Get-SummaryLine -Text $body) -Url ""))
    }
  }

  foreach ($comment in @($view.comments)) {
    $author = [string]$comment.author.login
    $body = [string]$comment.body
    if ([string]::IsNullOrWhiteSpace($body)) {
      continue
    }

    $createdAt = if ($comment.createdAt) { ConvertTo-InvariantDateTimeOffset -Value $comment.createdAt } else { $null }
    $afterLatestHead = $null -eq $latestCommitDate -or ($null -ne $createdAt -and $createdAt -ge $latestCommitDate)
    $isAiReviewer = $author -match '(?i)codex|gemini|copilot'
    $needsFix = $body -match '(?i)\b(P1|P2|high|medium|required|must fix|needs fix|should fix|blocker|regression|bug|major issue)\b'
    if ($afterLatestHead -and $isAiReviewer -and $needsFix) {
      $findings.Add((New-ReviewFinding -Reviewer $author -Severity (Get-SeverityLabel -Text $body) -File "n/a" -Line "n/a" -Summary (Get-SummaryLine -Text $body) -Url $comment.url))
    }
  }

  $suggestedPrompt = if ($findings.Count -gt 0) {
    $findingLines = @($findings | Select-Object -First 5 | ForEach-Object { "- $($_.File):$($_.Line) [$($_.Severity)] $($_.Summary)" })
    @(
      "Address the latest PR review feedback on PR #$Number with a narrow follow-up commit.",
      "",
      "Focus only on these findings:",
      $findingLines,
      "",
      "Verify each comment against the current head commit, keep scope limited to the touched files, rerun targeted validation, refresh the AI handoff, and stop before push."
    ) -join [Environment]::NewLine
  } else {
    "No review feedback prompt needed."
  }

  return [pscustomobject]@{
    HeadSha = $headSha
    MergeStateStatus = $mergeStateStatus
    Mergeable = $mergeable
    ReviewDecision = [string]$view.reviewDecision
    CheckSummary = $checkSummary
    Findings = @($findings.ToArray())
    Reasons = @($reasons.ToArray())
    SuggestedPrompt = $suggestedPrompt
    IsClean = ($reasons.Count -eq 0) -and ($checkSummary.Failures.Count -eq 0) -and ($findings.Count -eq 0)
  }
}

function New-ValidationRecord {
  param([Parameter(Mandatory = $true)][pscustomobject]$Result)

  $status = if ($Result.Succeeded) { "PASS" } else { "FAIL" }
  return "${status}: $($Result.Command)"
}

function Write-LifecycleReport {
  param(
    [string]$OverallStatus,
    [string[]]$ValidationSummary,
    [string[]]$WorkflowSummary,
    [string[]]$Findings,
    [string[]]$BranchDelta,
    [string[]]$WorkingTree,
    [string[]]$StashLines
  )

  $lines = @(
    "# AI PR Lifecycle Report",
    "",
    "- Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')",
    "- Mode: LocalValidate",
    "- Branch: $(Get-CurrentBranch)",
    "- Commit: $(Get-LatestCommit)",
    "- Status: $OverallStatus",
    "",
    "## Validation",
    ""
  )
  $lines += ConvertTo-Bullets -Items $ValidationSummary -EmptyText "No validation commands were run."
  $lines += @("", "## AI Workflow", "")
  $lines += ConvertTo-Bullets -Items $WorkflowSummary -EmptyText "No AI workflow commands were run."
  $lines += @("", "## Findings", "")
  $lines += ConvertTo-Bullets -Items $Findings -EmptyText "No findings."
  $lines += @("", "## Branch Delta", "")
  $lines += ConvertTo-Bullets -Items $BranchDelta -EmptyText "No files differ from origin/main."
  $lines += @("", "## Working Tree", "")
  $lines += ConvertTo-Bullets -Items $WorkingTree -EmptyText "Working tree is clean."
  $lines += @("", "## Stash Snapshot", "")
  $lines += ConvertTo-Bullets -Items $StashLines -EmptyText "No stashes present."
  $lines += ""

  Write-Utf8File -Path $LifecycleReportPath -Content (($lines -join [Environment]::NewLine) + [Environment]::NewLine)
}

function Assert-ExpectedFilesProvided {
  param([string]$TargetMode)

  if ($ExpectedFiles.Count -eq 0) {
    throw "-ExpectedFiles is required for mode $TargetMode."
  }
}

$initialStash = @(Get-StashListLines)

switch ($Mode) {
  "Preflight" {
    $findings = New-Object System.Collections.Generic.List[string]
    $trackedStatus = @(Get-TrackedStatusLines)
    $workingTree = @(Get-WorkingTreeStatusLines)
    $ignoredStatus = @(Get-IgnoredGeneratedStatusLines)
    $fetchResult = Invoke-ScriptCommand -Command "git fetch origin --quiet"

    if (-not $fetchResult.Succeeded) {
      $findings.Add("git fetch origin failed.")
    }

    if (-not $AllowDirty -and $trackedStatus.Count -gt 0) {
      $findings.Add("Tracked files are dirty. Re-run with -AllowDirty only if the human has approved working from a dirty tree.")
    }

    if (-not (Test-GeneratedAreasIgnoredOnly -Lines $ignoredStatus)) {
      $findings.Add("Generated .ai-control/.codex-handoff paths are not ignored/local-only.")
    }

    $lines = @(
      "Current folder: $RepoRoot",
      "Current branch: $(Get-CurrentBranch)",
      "Latest commit: $(Get-LatestCommit)",
      "Tracked status entries: $($trackedStatus.Count)",
      "Working tree entries: $($workingTree.Count)",
      "Stash entries: $($initialStash.Count)",
      "origin/main fetch status: $(if ($fetchResult.Succeeded) { 'OK' } else { 'FAILED' })",
      "Generated report status: $(if (Test-GeneratedAreasIgnoredOnly -Lines $ignoredStatus) { 'ignored/local-only' } else { 'NOT SAFE' })"
    )
    $lines | ForEach-Object { Write-Output $_ }

    if ($findings.Count -gt 0) {
      Write-Output "STOP"
      $findings | ForEach-Object { Write-Output $_ }
      break
    }

    Write-Output "PRECHECK_OK"
  }

  "LocalValidate" {
    Assert-ExpectedFilesProvided -TargetMode $Mode
    $findings = New-Object System.Collections.Generic.List[string]
    $branchDelta = @(Get-BranchDeltaFiles)
    $unexpectedDelta = @(Get-UnexpectedPaths -Observed $branchDelta -Expected $ExpectedFiles)
    if ($unexpectedDelta.Count -gt 0) {
      $findings.Add("Branch delta contains unexpected files: $($unexpectedDelta -join ', ')")
    }

    $validationResults = New-Object System.Collections.Generic.List[string]
    $validationCommandsToRun = if ($ValidationCommand.Count -gt 0) { $ValidationCommand } else { $DefaultValidationCommands }
    foreach ($command in $validationCommandsToRun) {
      $result = Invoke-ScriptCommand -Command $command
      $validationResults.Add((New-ValidationRecord -Result $result))
      if (-not $result.Succeeded) {
        $findings.Add("Validation failed: $command")
      }
    }

    $workflowResults = New-Object System.Collections.Generic.List[string]
    foreach ($command in $SafeAiWorkflowCommands) {
      $result = Invoke-ScriptCommand -Command $command
      $workflowResults.Add((New-ValidationRecord -Result $result))
      if (-not $result.Succeeded) {
        $findings.Add("AI workflow command failed: $command")
      }
    }

    $cachedFiles = @(Get-CachedFiles)
    $forbiddenStaged = @(Get-ForbiddenPathFindings -Paths $cachedFiles)
    if ($forbiddenStaged.Count -gt 0) {
      $findings.Add("Forbidden staged files detected: $($forbiddenStaged -join ', ')")
    }

    $stagedSecrets = @(Get-StagedSecretFindings)
    if ($stagedSecrets.Count -gt 0) {
      $findings.Add("Potential staged secrets detected in cached diff.")
    }

    $ignoredStatus = @(Get-IgnoredGeneratedStatusLines)
    if (-not (Test-GeneratedAreasIgnoredOnly -Lines $ignoredStatus)) {
      $findings.Add("Generated .ai-control/.codex-handoff paths are not ignored/local-only.")
    }

    $endingStash = @(Get-StashListLines)
    if (-not (Test-ArraysEqual -Left $initialStash -Right $endingStash)) {
      $findings.Add("Stash list changed during LocalValidate.")
    }

    $overallStatus = if ($findings.Count -eq 0) { "PASS" } else { "STOP" }
    Write-LifecycleReport -OverallStatus $overallStatus -ValidationSummary @($validationResults.ToArray()) -WorkflowSummary @($workflowResults.ToArray()) -Findings @($findings.ToArray()) -BranchDelta $branchDelta -WorkingTree (Get-WorkingTreeStatusLines) -StashLines $endingStash

    Write-Output $overallStatus
    Write-Output $LifecycleReportPath
  }

  "CommitReady" {
    Assert-ExpectedFilesProvided -TargetMode $Mode
    $findings = New-Object System.Collections.Generic.List[string]
    $cachedFiles = @(Get-CachedFiles)
    $unexpectedCached = @(Get-UnexpectedPaths -Observed $cachedFiles -Expected $ExpectedFiles)
    if ($unexpectedCached.Count -gt 0) {
      $findings.Add("Staged files exceed expected scope: $($unexpectedCached -join ', ')")
    }

    $cachedCheck = Invoke-ScriptCommand -Command "git diff --cached --check"
    if (-not $cachedCheck.Succeeded) {
      $findings.Add("git diff --cached --check failed.")
    }

    $forbiddenStaged = @(Get-ForbiddenPathFindings -Paths $cachedFiles)
    if ($forbiddenStaged.Count -gt 0) {
      $findings.Add("Forbidden staged files detected: $($forbiddenStaged -join ', ')")
    }

    $stagedSecrets = @(Get-StagedSecretFindings)
    if ($stagedSecrets.Count -gt 0) {
      $findings.Add("Potential staged secrets detected in cached diff.")
    }

    if ($findings.Count -gt 0) {
      Write-Output "STOP"
      $findings | ForEach-Object { Write-Output $_ }
      break
    }

    Write-Output "SAFE_TO_COMMIT"
  }

  "PushReady" {
    Assert-ExpectedFilesProvided -TargetMode $Mode
    $findings = New-Object System.Collections.Generic.List[string]
    $branch = Get-CurrentBranch
    if ($branch -eq "main") {
      $findings.Add("Current branch is main. Refusing push automation on main.")
    }

    $workingTree = @(Get-WorkingTreeStatusLines)
    if ($workingTree.Count -gt 0) {
      $findings.Add("Working tree is not clean.")
    }

    $latestCommit = Get-LatestCommit
    if (-not [string]::IsNullOrWhiteSpace($ExpectedHeadCommit) -and $latestCommit -notlike "$ExpectedHeadCommit*") {
      $findings.Add("Latest commit does not match -ExpectedHeadCommit.")
    }

    $branchDelta = @(Get-BranchDeltaFiles)
    $unexpectedDelta = @(Get-UnexpectedPaths -Observed $branchDelta -Expected $ExpectedFiles)
    if ($unexpectedDelta.Count -gt 0) {
      $findings.Add("Branch delta contains unexpected files: $($unexpectedDelta -join ', ')")
    }

    $forbiddenCommitted = @(Get-ForbiddenPathFindings -Paths $branchDelta)
    if ($forbiddenCommitted.Count -gt 0) {
      $findings.Add("Forbidden committed/generated files detected in branch delta: $($forbiddenCommitted -join ', ')")
    }

    $endingStash = @(Get-StashListLines)
    if (-not (Test-ArraysEqual -Left $initialStash -Right $endingStash)) {
      $findings.Add("Stash list changed during PushReady.")
    }

    if ($findings.Count -gt 0) {
      Write-Output "STOP"
      $findings | ForEach-Object { Write-Output $_ }
      break
    }

    Write-Output "SAFE_TO_PUSH"
    if ($DoPush) {
      $pushResult = Invoke-ScriptCommand -Command "git push -u origin $branch"
      if (-not $pushResult.Succeeded) {
        Write-Output "STOP"
        Write-Output "git push failed."
        if (-not [string]::IsNullOrWhiteSpace($pushResult.Output)) {
          Write-Output $pushResult.Output
        }
        break
      }

      Write-Output "PUSH_OK"
      $existingPr = Get-OpenPrForBranch -Branch $branch
      if ($null -eq $existingPr) {
        $repoInfo = Get-RepositoryInfo
        $url = "https://github.com/$($repoInfo.Owner)/$($repoInfo.Name)/pull/new/$branch"
        Start-Process $url
        Write-Output $url
      } else {
        Write-Output $existingPr.url
      }
    }
  }

  "RequestReview" {
    if ($PrNumber -le 0) {
      throw "-PrNumber is required for RequestReview."
    }

    $comment = if ([string]::IsNullOrWhiteSpace($ReviewPrompt)) { Get-DefaultReviewPrompt } else { $ReviewPrompt.Trim() }
    if (Test-GhAvailable) {
      $result = Invoke-ScriptCommand -Command {
        param($PullRequestNumber, $CommentBody)
        gh pr comment $PullRequestNumber --body $CommentBody
      } -ArgumentList @($PrNumber, $comment)
      if ($result.Succeeded) {
        Write-Output "REVIEW_REQUEST_POSTED"
        if (-not [string]::IsNullOrWhiteSpace($result.Output)) {
          Write-Output $result.Output
        }
      } else {
        Write-Output "STOP"
        Write-Output "Unable to post PR comment via gh. Paste this manually:"
        Write-Output $comment
      }
    } else {
      Write-Output "gh CLI unavailable. Paste this PR comment manually:"
      Write-Output $comment
    }
  }

  "ReviewWatch" {
    if ($PrNumber -le 0) {
      throw "-PrNumber is required for ReviewWatch."
    }

    if (-not (Test-GhAvailable)) {
      Write-Output "STOP_REVIEW_FEEDBACK_FOUND"
      Write-Output "gh CLI is unavailable; cannot inspect PR review state automatically."
      break
    }

    try {
      $assessment = Get-ReviewWatchAssessment -Number $PrNumber -ExpectedHead $ExpectedHeadSha
    } catch {
      Write-Output "STOP_REVIEW_FEEDBACK_FOUND"
      Write-Output "Reason: Unable to inspect PR review state automatically: $($_.Exception.Message)"
      break
    }

    if ($assessment.IsClean) {
      Write-Output "READY_FOR_HUMAN_MERGE"
      break
    }

    Write-Output "STOP_REVIEW_FEEDBACK_FOUND"
    foreach ($reason in @($assessment.Reasons)) {
      Write-Output "Reason: $reason"
    }
    foreach ($failure in @($assessment.CheckSummary.Failures)) {
      Write-Output "Failing check: $failure"
    }
    foreach ($finding in @($assessment.Findings)) {
      Write-Output "Reviewer: $($finding.Reviewer)"
      Write-Output "Severity: $($finding.Severity)"
      Write-Output "File: $($finding.File)"
      Write-Output "Line: $($finding.Line)"
      Write-Output "Comment: $($finding.Summary)"
      if (-not [string]::IsNullOrWhiteSpace($finding.Url)) {
        Write-Output "URL: $($finding.Url)"
      }
    }
    Write-Output "Suggested next prompt:"
    Write-Output $assessment.SuggestedPrompt
  }

  "FinalMergeReady" {
    if ($PrNumber -le 0) {
      throw "-PrNumber is required for FinalMergeReady."
    }

    Assert-ExpectedFilesProvided -TargetMode $Mode
    $findings = New-Object System.Collections.Generic.List[string]
    $fetchResult = Invoke-ScriptCommand -Command "git fetch origin --quiet"
    if (-not $fetchResult.Succeeded) {
      $findings.Add("git fetch origin failed.")
    }

    $workingTree = @(Get-WorkingTreeStatusLines)
    if ($workingTree.Count -gt 0) {
      $findings.Add("Working tree is not clean.")
    }

    $upstreamStatus = Invoke-ScriptCommand -Command "git rev-list --left-right --count HEAD...@{upstream}"
    if (-not $upstreamStatus.Succeeded -or [string]::IsNullOrWhiteSpace($upstreamStatus.Output)) {
      $findings.Add("Unable to confirm local branch is current with upstream.")
    } else {
      $parts = $upstreamStatus.Output.Trim() -split "\s+"
      if ($parts.Count -eq 2 -and [int]$parts[1] -gt 0) {
        $findings.Add("Local branch is behind upstream by $($parts[1]) commit(s).")
      }
    }

    $branchDelta = @(Get-BranchDeltaFiles)
    $unexpectedDelta = @(Get-UnexpectedPaths -Observed $branchDelta -Expected $ExpectedFiles)
    if ($unexpectedDelta.Count -gt 0) {
      $findings.Add("Branch delta contains unexpected files: $($unexpectedDelta -join ', ')")
    }

    if (-not (Test-Path -LiteralPath $LifecycleReportPath)) {
      $findings.Add("Validation report is missing: $LifecycleReportPath")
    }

    $reviewAssessment = Get-ReviewWatchAssessment -Number $PrNumber -ExpectedHead $ExpectedHeadSha
    if (-not $reviewAssessment.IsClean) {
      $findings.Add("PR review is not clean.")
    }

    $forbiddenCommitted = @(Get-ForbiddenPathFindings -Paths $branchDelta)
    if ($forbiddenCommitted.Count -gt 0) {
      $findings.Add("Forbidden committed/generated files detected in branch delta: $($forbiddenCommitted -join ', ')")
    }

    $endingStash = @(Get-StashListLines)
    if (-not (Test-ArraysEqual -Left $initialStash -Right $endingStash)) {
      $findings.Add("Stash list changed during FinalMergeReady.")
    }

    if ($findings.Count -gt 0) {
      Write-Output "STOP"
      $findings | ForEach-Object { Write-Output $_ }
      break
    }

    Write-Output "READY_FOR_HUMAN_MERGE"
  }
}