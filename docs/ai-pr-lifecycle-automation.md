# AI PR Lifecycle Automation

This repo includes `scripts/agents/run-ai-pr-lifecycle.ps1` to automate the safe parts of the AI PR loop from preflight to final review readiness.

The script never auto-merges. The strongest success state it emits is `READY_FOR_HUMAN_MERGE`.

## Safety Model

- Never merges PRs.
- Never deploys.
- Never modifies stashes.
- Never runs `-RunClaude` unless a human explicitly passes that flag to the separate Claude script.
- Never runs `-RunNextPrompt` unless a human explicitly passes that flag to the separate Codex script.
- Never stages or commits generated `.ai-control`, `.codex-handoff`, `.codex-diagnostics`, `.next`, `node_modules`, `test-results`, screenshots, generated GLBs, public model fixtures, or secrets.
- Keeps generated reports local-only and ignored.

## Modes

### Preflight

Checks that the repo is safe before work starts.

Runs:

```powershell
.\scripts\agents\run-ai-pr-lifecycle.ps1 -Mode Preflight
```

Behavior:

- reports current folder, branch, latest commit, stash count, and fetch status
- runs `git fetch origin --quiet`
- stops if tracked files are dirty unless `-AllowDirty` is passed
- confirms generated `.ai-control` and `.codex-handoff` files remain ignored/local-only
- never touches stash

### LocalValidate

Runs local validation plus the safe AI handoff refresh after an implementation.

Inputs:

- `-ExpectedFiles <string[]>`
- optional `-ValidationCommand <string[]>`

Default validation commands:

- `npx.cmd tsc --noEmit --pretty false`
- `npm.cmd run test:body-reference-contract`
- `git diff --check`
- `git diff --cached --check`

Safe AI workflow commands:

- `.\scripts\agents\write-handoff.ps1`
- `.\scripts\agents\claude-review.ps1`
- `.\scripts\agents\consolidate-reviews.ps1`
- `.\scripts\agents\next-codex-prompt.ps1`

It does not run:

- `.\scripts\agents\claude-review.ps1 -RunClaude`
- `.\scripts\codex-next.ps1 -RunNextPrompt`

Output:

- `.ai-control/current/pr-lifecycle-report.md`

Example:

```powershell
.\scripts\agents\run-ai-pr-lifecycle.ps1 `
  -Mode LocalValidate `
  -ExpectedFiles @(
    'src/components/admin/ModelViewer.tsx',
    'tests/body-contract-viewer.spec.ts'
  )
```

### CommitReady

Verifies the staged set before commit.

Input:

- `-ExpectedFiles <string[]>`

Output:

- `SAFE_TO_COMMIT`
- `STOP`

Example:

```powershell
.\scripts\agents\run-ai-pr-lifecycle.ps1 `
  -Mode CommitReady `
  -ExpectedFiles @(
    'src/components/admin/ModelViewer.tsx',
    'tests/body-contract-viewer.spec.ts'
  )
```

### PushReady

Checks whether the branch is safe to push.

Inputs:

- `-ExpectedFiles <string[]>`
- optional `-ExpectedHeadCommit <sha-or-prefix>`
- optional `-DoPush`

Output:

- `SAFE_TO_PUSH`
- `STOP`

If `-DoPush` is passed, the script pushes the current branch to origin. If no open PR exists, it opens the PR creation URL.

Example:

```powershell
.\scripts\agents\run-ai-pr-lifecycle.ps1 `
  -Mode PushReady `
  -ExpectedHeadCommit 58d89b0 `
  -ExpectedFiles @(
    'src/components/admin/ModelViewer.tsx',
    'tests/body-contract-viewer.spec.ts'
  ) `
  -DoPush
```

### RequestReview

Requests Codex review on an existing PR.

Inputs:

- `-PrNumber <number>`
- optional `-ReviewPrompt <string>`

If `gh` is available, it posts the PR comment. If `gh` is unavailable, it prints the exact comment for a human to paste.

Default comment:

```text
@codex review the latest PR head commit.

Please confirm:
- changed files are limited to the intended scope
- validation passed
- generated reports/artifacts remain ignored/local-only
- no secrets or public model fixtures were committed
- Claude execution remains opt-in only via -RunClaude
- Codex exec remains opt-in only via -RunNextPrompt
- no push/merge/deploy/credential/customer/purchase/laser-machine action was performed by scripts
```

Example:

```powershell
.\scripts\agents\run-ai-pr-lifecycle.ps1 -Mode RequestReview -PrNumber 66
```

### ReviewWatch

Checks whether a PR review came back clean.

Inputs:

- `-PrNumber <number>`
- optional `-ExpectedHeadSha <sha>`

Uses `gh` when available to inspect:

- PR head SHA
- merge state / mergeability
- changed files
- review comments and review bodies
- unresolved review threads on changed files
- PR checks output when available

Output:

- `READY_FOR_HUMAN_MERGE`
- `STOP_REVIEW_FEEDBACK_FOUND`

When it stops, it lists:

- reviewer
- severity if visible
- file
- line
- comment summary
- an exact suggested next prompt for Copilot/Codex

Example for PR #66:

```powershell
.\scripts\agents\run-ai-pr-lifecycle.ps1 `
  -Mode ReviewWatch `
  -PrNumber 66 `
  -ExpectedHeadSha 8ee65760eb1fda5c73e72370929c4f89fea54d0a
```

### FinalMergeReady

Final report only. Never merges.

Inputs:

- `-PrNumber <number>`
- `-ExpectedFiles <string[]>`
- optional `-ExpectedHeadSha <sha>`

It checks:

- local branch is up to date with upstream
- working tree is clean
- branch delta is limited to expected files
- validation report exists
- PR review is clean
- no generated reports are staged or committed
- no secrets were staged or committed
- stash remained untouched

Output:

- `READY_FOR_HUMAN_MERGE`
- `STOP`

## Recommended Flow

1. Human provides an approved narrow task.
2. Run:

```powershell
.\scripts\agents\run-ai-pr-lifecycle.ps1 -Mode Preflight
```

3. Copilot/Codex implements the task.
4. Run:

```powershell
.\scripts\agents\run-ai-pr-lifecycle.ps1 `
  -Mode LocalValidate `
  -ExpectedFiles <files> `
  -ValidationCommand <commands>
```

5. Run:

```powershell
.\scripts\agents\run-ai-pr-lifecycle.ps1 `
  -Mode CommitReady `
  -ExpectedFiles <files>
```

6. Human approves commit.
7. Run:

```powershell
.\scripts\agents\run-ai-pr-lifecycle.ps1 `
  -Mode PushReady `
  -ExpectedFiles <files> `
  -DoPush
```

8. Open or create the PR.
9. Run:

```powershell
.\scripts\agents\run-ai-pr-lifecycle.ps1 -Mode RequestReview -PrNumber <number>
```

10. Run:

```powershell
.\scripts\agents\run-ai-pr-lifecycle.ps1 -Mode ReviewWatch -PrNumber <number>
```

11. If feedback appears, generate a narrow fix prompt and stop.
12. If clean, run:

```powershell
.\scripts\agents\run-ai-pr-lifecycle.ps1 `
  -Mode FinalMergeReady `
  -PrNumber <number> `
  -ExpectedFiles <files>
```

13. Human manually clicks Merge pull request.

## Current-Style Examples

Example expected files for PR #66:

- `src/components/admin/ModelViewer.tsx`
- `tests/body-contract-viewer.spec.ts`

Example PR #66 review check:

```powershell
.\scripts\agents\run-ai-pr-lifecycle.ps1 `
  -Mode ReviewWatch `
  -PrNumber 66 `
  -ExpectedHeadSha 8ee65760eb1fda5c73e72370929c4f89fea54d0a
```

Example PR #66 merge-readiness check:

```powershell
.\scripts\agents\run-ai-pr-lifecycle.ps1 `
  -Mode FinalMergeReady `
  -PrNumber 66 `
  -ExpectedHeadSha 8ee65760eb1fda5c73e72370929c4f89fea54d0a `
  -ExpectedFiles @(
    'src/components/admin/ModelViewer.tsx',
    'tests/body-contract-viewer.spec.ts'
  )
```

The script may report `READY_FOR_HUMAN_MERGE`, but it never merges the PR itself.