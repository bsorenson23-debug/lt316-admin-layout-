# Gemini Bug-Fix and Code-Review Template - LT316 Admin

Use this template for debugging sessions, incident fixes, and review-focused requests.

## Mode
- Choose one: bug-fix | code-review

## 1) Issue Summary
- Short title:
- Severity: blocker | high | medium | low
- Area: UI | API | export | calibration | 3D | tests | other

## 2) Reproduction (Bug-Fix)
- Preconditions:
- Steps to reproduce:
- Observed result:
- Expected result:
- Frequency: always | intermittent | unknown

## 3) Evidence
- Error messages/logs:
- Screenshots/video (if any):
- Related commits/PRs (if known):

## 4) Suspected Scope
- Likely files:
- Potentially impacted behavior:
- Out-of-scope areas:

## 5) Root Cause Hypothesis (Optional)
- Suspected root cause:
- Why this seems likely:

## 6) Constraints (Must Follow)
- Read AGENTS.md first and treat it as authoritative.
- Keep all domain units in millimeters.
- Preserve tumbler-wrap vs flat-bed mode gating.
- Keep LightBurn palette/order and export assumptions intact.
- Keep changes minimal and avoid unrelated refactors.
- Do not alter established calibration behavior unless required by the issue.

## 7) Implementation Expectations
- Reproduce first, then isolate root cause, then fix.
- If uncertain, add temporary diagnostics and remove them before finalizing.
- Include a regression guard (test) when behavior changes.
- Summarize exactly what changed and why.

## 8) Validation Plan
- Manual checks:
- Automated checks (specific npm scripts):
- Regression checks around adjacent workflows:

## 9) Definition of Done
- Root cause identified:
- Fix implemented:
- Tests/validation passed:
- No unrelated behavior changed:

---

## Code Review Add-On

When mode is code-review, use this review order:

1. Findings first, ordered by severity.
2. For each finding, include:
   - Risk/impact
   - File and symbol
   - Why it is a bug/risk
   - Recommended fix
3. Then list open questions/assumptions.
4. Then give a brief change summary.

Review focus areas for this repo:
- mm-based dimension correctness
- workspace mode gating regressions
- LightBurn export correctness
- calibration math and state transitions
- missing or weak tests around changed logic

---

## Quick Copy Version

Mode: bug-fix | code-review

Issue:
- Title:
- Severity:
- Area:

Repro (bug-fix):
- Preconditions:
- Steps:
- Observed:
- Expected:

Evidence:
- Logs:
- Screenshots:

Scope:
- Likely files:
- Out of scope:

Constraints:
- Read AGENTS.md first.
- Keep all units in mm.
- Preserve mode gating.
- Preserve LightBurn assumptions.
- Keep changes minimal.

Definition of done:
- Root cause:
- Fix/review output:
- Validation/tests:
