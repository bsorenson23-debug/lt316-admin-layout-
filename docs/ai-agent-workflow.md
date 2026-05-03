# AI Agent Workflow

This repo uses Codex as the primary implementer and orchestrator. Claude and ChatGPT are read-only reviewers unless a human explicitly changes the workflow for a specific task.

Generated reports under `.ai-control/current`, `.ai-control/reviews`, `.ai-control/outbox`, `.ai-control/evidence`, and `.codex-handoff` are local by default and ignored by git. The tracked files are the registry, scripts, docs, `.ai-control/**/.gitkeep`, and `.codex-handoff/README.md`.

## Safety Rules

- Codex is the only default code-writing agent.
- Claude review is read-only and writes `.ai-control/reviews/claude-review.md`.
- ChatGPT review requests are written to `.ai-control/outbox/chatgpt-review-request.md`.
- Claude review prompts are written to `.ai-control/outbox/claude-review-prompt.md`.
- Do not push, merge, deploy, delete branches, change credentials, contact customers, make purchases, or run physical laser/machine actions from these scripts.
- Require human approval before push, merge, deploy, customer communication, purchase, credential change, or any real laser/machine action.
- Do not include API keys, tokens, credentials, cookies, customer data, or local environment values in committed files.
- Keep generated reports local unless explicitly requested.

## Evidence Style

Put evidence in `.ai-control/evidence` or leave it in existing local diagnostic folders such as `.codex-diagnostics`, `test-results`, or `playwright-report`.

Preferred artifact names match the current repo style:

- `smoke-summary.json`
- `body-contract-debug-report.json`
- `console.log`
- `network.json`
- before/after screenshots, for example `before.png` and `after.png`
- PR report markdown, for example `wrap-export-pr-report.md`

The scripts list evidence paths in the handoff. They do not embed `.env` files or secret values.

## 1. Write Handoff

Run after a coding task and validation pass:

```powershell
.\scripts\agents\write-handoff.ps1 `
  -WhatChanged "Implemented the requested change and updated the relevant tests." `
  -TestsRun "npm.cmd run test:body-reference-contract" `
  -PassFailResults "PASS: body-reference-contract" `
  -NextPrompt "Continue with the next requested task. Read the handoff first and inspect git status."
```

Useful options:

```powershell
.\scripts\agents\write-handoff.ps1 -EvidencePath ".codex-diagnostics\my-run"
```

Outputs:

- `.ai-control/current/handoff.md`
- `.ai-control/current/next-codex-prompt.md`
- `.ai-control/outbox/chatgpt-review-request.md`

The handoff includes branch, commit, changed files, tests run, pass/fail results, screenshots, logs, JSON artifacts, blockers, and the exact next prompt.

## 2. Claude Review

Default mode is safe/manual. It writes a Claude prompt to outbox and refreshes the review placeholder:

```powershell
.\scripts\agents\claude-review.ps1
```

Outputs:

- `.ai-control/outbox/claude-review-prompt.md`
- `.ai-control/reviews/claude-review.md`

If the Claude CLI is installed and human-approved for this read-only review, run:

```powershell
.\scripts\agents\claude-review.ps1 -RunClaude
```

Claude receives only the prepared prompt and sanitized handoff text. The script does not pass `.env`, `.env.local`, credentials, `node_modules`, `.next`, generated GLBs, or diagnostics contents. Claude is instructed not to edit files, run deployment actions, change credentials, or perform machine/laser actions. The script snapshots `git status --short` before and after `-RunClaude` and fails if the review changed the worktree.

## 3. ChatGPT Review

`write-handoff.ps1` writes:

```text
.ai-control/outbox/chatgpt-review-request.md
```

Use that file as the read-only ChatGPT review request. If ChatGPT returns findings, place them in:

```text
.ai-control/reviews/chatgpt-review.md
```

Do not paste secrets, customer data, or local environment values into ChatGPT.

## 4. Consolidate Reviews

Run after Claude and/or ChatGPT review files exist:

```powershell
.\scripts\agents\consolidate-reviews.ps1
```

Optional inline notes:

```powershell
.\scripts\agents\consolidate-reviews.ps1 -ReviewerNotes "Treat the missing browser smoke as follow-up validation."
```

Output:

- `.ai-control/current/consolidated-review.md`

The consolidated report includes pass/fail/blocked status, critical findings, important findings, missing validation, reviewer inputs, and the exact next Codex prompt. Codex should treat review findings as advisory until verified against the local codebase.

`BLOCKED` is reserved for missing required handoff input, explicit handoff blockers, failed validation, or real critical reviewer findings. Manual Claude placeholders, missing manual ChatGPT review output, and outbox request prompts are reported as pending review state rather than reviewer findings. When no concrete findings exist but manual review or validation is still pending, the status should be `NEEDS_REVIEW`.

## 5. Create Next Codex Prompt

Run:

```powershell
.\scripts\agents\next-codex-prompt.ps1
```

Or override the task:

```powershell
.\scripts\agents\next-codex-prompt.ps1 -Task "Fix the verified P1 findings from the consolidated review, then refresh the handoff."
```

Output:

- `.ai-control/current/next-codex-prompt.md`

The generated prompt reminds Codex to read `AGENTS.md`, the agent registry, the handoff, and the consolidated review before editing.

If the consolidated review contains only pending/manual placeholders and the handoff has no concrete approved implementation task, the next prompt should ask Codex to wait for the next narrow human-approved task instead of creating a coding task from placeholder review text.

## 6. Optional Codex Exec

`scripts/codex-next.ps1` writes `.codex-handoff/current-summary.md`, `.codex-handoff/validation.md`, and `.codex-handoff/next-prompt.md` by default. It does not run `codex exec` unless explicitly requested:

```powershell
.\scripts\codex-next.ps1 -RunNextPrompt
```

If validation fails, `codex-next.ps1` stops before any Codex exec run.

## Recommended Loop

1. Codex implements the approved task.
2. Codex runs targeted validation and gathers evidence.
3. Run `.\scripts\agents\write-handoff.ps1`.
4. Run `.\scripts\agents\claude-review.ps1`.
5. Optional: run `.\scripts\agents\claude-review.ps1 -RunClaude`.
6. Run `.\scripts\agents\consolidate-reviews.ps1`.
7. Run `.\scripts\agents\next-codex-prompt.ps1`.
8. Optional: run `.\scripts\codex-next.ps1 -RunNextPrompt`.
9. Codex verifies reviewer findings locally before making any follow-up code changes.
