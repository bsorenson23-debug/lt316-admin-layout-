---
mode: ask
description: "Bug fix: validate environment-backed vision features and graceful fallback behavior"
---

Mode: bug-fix

Issue:
- Title: Validate environment-backed vision features and graceful fallback behavior
- Severity: high
- Area: API

Repro:
- Preconditions:
  - .env.local may be missing or partially configured
- Steps:
  - inspect env usage for ANTHROPIC_API_KEY and REPLICATE_API_TOKEN
  - trace affected API routes
  - verify how missing env vars are handled
- Observed:
  - need to confirm whether features fail gracefully and whether setup guidance matches code
- Expected:
  - clear setup path and graceful fallback behavior without ambiguous failures
- Frequency: unknown

Scope:
- Likely files:
  - .env.example
  - AGENTS.md
  - src/app/api/admin/tumbler/auto-size/route.ts
  - src/app/api/admin/flatbed/auto-detect/route.ts
  - src/app/api/admin/image/remove-bg/route.ts
  - src/app/api/admin/image/segment/route.ts
- Out of scope:
  - changing provider implementations
  - unrelated API cleanup

Constraints:
- Read AGENTS.md first.
- Keep changes minimal.
- Preserve existing fallback behavior unless clearly broken.

Definition of done:
- Root cause: identify whether env guidance, route behavior, or error messaging is incomplete.
- Fix: tighten setup docs and/or route handling in the narrowest place needed.
- Validation: add focused checks if behavior changes.

Additional instructions:
Review whether .env.example fully reflects actual runtime expectations. If there is drift, fix the template and the narrowest related docs.

Output format:
- Findings by route
- Root cause
- Changes made
- Validation
