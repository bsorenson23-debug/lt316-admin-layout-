# ADR 0001: Admin Sections and Trace Envelope

## Status

Accepted

## Context

The admin workflow accumulated state and rendering logic in a few large files. That made it hard to tell:

- which section owned a value
- which diagnostic state was currently authoritative
- how a UI change mapped back to a branch, issue, or verification run

## Decision

We standardize on:

1. a stable admin section taxonomy
2. a shared `AdminTraceEnvelope`
3. feature-local entrypoints under `src/features/admin/`
4. worktree and PR conventions tied to issues and section IDs

## Consequences

- Runtime debug state is easier to inspect in React DevTools and in the admin debug drawer.
- Screens and PRs can be discussed in terms of stable section IDs instead of transient UI wording.
- The repo can add structural guardrails without freezing legacy files in place forever.
