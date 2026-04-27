---
mode: ask
description: "Bug fix: dimension drift between selected tumbler template and exported placement"
---

Mode: bug-fix

Issue:
- Title: Investigate dimension drift between selected tumbler template and exported placement
- Severity: high
- Area: export

Repro:
- Preconditions:
  - App running locally
  - A tumbler template/profile selected
  - At least one SVG placed on the workspace
- Steps:
  - Select a tumbler template or profile
  - Place artwork on the tumbler workspace
  - Export for LightBurn
  - Compare workspace dimensions/placement against exported result
- Observed:
  - Suspected mismatch between chosen tumbler dimensions and final export placement/scale
- Expected:
  - Exported artwork placement should reflect the same mm-based dimensions and positioning shown in the workspace
- Frequency: unknown

Scope:
- Likely files:
  - src/components/admin/AdminLayoutShell.tsx
  - src/utils/tumblerExportPlacement.ts
  - src/utils/lightBurnSvgExport.ts
  - src/types/admin.ts
  - src/data/tumblerProfiles.ts
- Out of scope:
  - UI redesign
  - unrelated refactors

Constraints:
- Read AGENTS.md first.
- Keep all units in mm.
- Preserve mode gating.
- Preserve LightBurn assumptions.
- Keep changes minimal.

Definition of done:
- Root cause: identify where dimension authority drifts across profile/template, bed config, placement, and export.
- Fix: reproduce first, isolate root cause, implement smallest fix, explain exactly why it resolves the drift.
- Validation: run focused tests, add/update regression tests if behavior changes.

Additional instructions:
Reproduce first, then identify the exact controlling code path before editing.
If multiple plausible causes, choose the one with cheapest discriminating validation.

Output format:
- Reproduction summary
- Root cause
- Changes made
- Validation performed
- Residual risks
