# Gemini Template Chooser - LT316 Admin

Use this quick guide to choose the right prompt/template in under 30 seconds.

## Step 1: Start Every New Gemini Chat

1. Paste the startup prompt from GEMINI_ONBOARDING.md.
2. Attach AGENTS.md plus the relevant template file.

## Step 2: Pick Template By Task Type

- Use GEMINI_TASK_INTAKE_TEMPLATE.md when:
  - building new features
  - refactoring with clear acceptance criteria
  - adding UX/tooling improvements

- Use GEMINI_BUGFIX_REVIEW_TEMPLATE.md when:
  - reproducing and fixing a bug
  - analyzing regressions
  - doing a code review with severity-ranked findings

## Step 3: Fast Decision Rules

- If there is a user-visible bug, failing test, or runtime error: use bug-fix/review template.
- If the goal is net-new behavior with little/no breakage context: use task intake template.
- If unsure: start with bug-fix/review template, because it enforces validation and regression checks.

## Step 4: Minimum Inputs You Should Always Fill

For task intake:
- Task Goal
- Scope (in/out)
- Primary files
- Definition of Done

For bug-fix/review:
- Issue Summary
- Repro steps (or code-review mode)
- Evidence (logs/errors)
- Suspected scope
- Validation plan

## Step 5: Repo-Specific Guardrails To Keep In Every Prompt

- Read AGENTS.md first and treat it as authoritative.
- Keep all domain units in millimeters.
- Preserve tumbler-wrap vs flat-bed mode gating.
- Preserve LightBurn export assumptions and layer behavior.
- Keep changes minimal and avoid unrelated refactors.
- Add/update focused tests when behavior changes.

## Copy/Paste Master Prompt (Recommended)

You are assisting on LT316 Admin. Read AGENTS.md first and treat it as authoritative. Before coding, summarize constraints relevant to this task. Keep all domain logic in millimeters, preserve workspace mode gating, and preserve LightBurn assumptions. Make minimal changes only, avoid unrelated refactors, and add or update focused tests when behavior changes. If this is a bug-fix, reproduce first, isolate root cause, then implement and validate regression checks. If this is a code review, list findings first ordered by severity.
