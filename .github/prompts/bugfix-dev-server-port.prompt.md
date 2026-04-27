---
mode: ask
description: "Bug fix: dev server port mismatch and Playwright webServer startup behavior"
---

Mode: bug-fix

Issue:
- Title: Investigate dev server port mismatch and Playwright webServer startup behavior
- Severity: medium
- Area: tests

Repro:
- Preconditions:
  - dependencies installed
- Steps:
  - run npm run dev
  - compare active dev server port with Playwright expectations
  - inspect playwright.config.ts webServer settings
- Observed:
  - mismatch between manual dev server port (3000) and Playwright-expected port (3210)
- Expected:
  - local dev guidance and Playwright config should be consistent and easy to validate
- Frequency: always

Scope:
- Likely files:
  - playwright.config.ts
  - package.json
  - README.md
- Out of scope:
  - unrelated test rewrites
  - broad infra changes

Constraints:
- Read AGENTS.md first.
- Keep changes minimal.
- Do not broaden scope beyond startup/test behavior.

Definition of done:
- Root cause: identify whether the issue is documentation, config mismatch, or runtime startup failure.
- Fix: implement the smallest fix or guidance improvement.
- Validation: verify with the narrowest startup check possible.

Additional instructions:
Reproduce the port expectation first before editing. If no code change is needed, propose minimal documentation/config clarification.

Note for reference:
- Manual dev server: npm run dev → http://localhost:3000
- Playwright-specific: npm run dev -- -p 3210 → http://127.0.0.1:3210

Output format:
- Reproduction summary
- Root cause
- Changes/recommendations
- Validation
