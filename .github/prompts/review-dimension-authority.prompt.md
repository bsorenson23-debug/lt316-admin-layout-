---
mode: ask
description: "Code review: dimension authority and export correctness across tumbler workflow"
---

Mode: code-review

Issue:
- Title: Review dimension authority and export correctness across tumbler workflow
- Severity: high
- Area: export

Scope:
- Likely files:
  - src/components/admin/AdminLayoutShell.tsx
  - src/types/admin.ts
  - src/utils/lightBurnSvgExport.ts
  - src/utils/tumblerExportPlacement.ts
  - src/data/tumblerProfiles.ts
- Out of scope:
  - UI restyling
  - dependency upgrades
  - broad refactors

Constraints:
- Read AGENTS.md first.
- Keep all units in mm.
- Preserve mode gating.
- Preserve LightBurn assumptions.
- Keep changes minimal.

Definition of done:
- Root cause: identify any places where dimension authority can drift between selected template/profile, bed config, placement math, and export output.
- Fix/review output: findings first, ordered by severity, with impacted file/symbol and recommended fix.
- Validation/tests: identify which focused tests exist, which are missing, and what should be added if behavior changes.

Review goals:
1. Verify that tumbler dimensions from product/template remain source of truth through workspace state.
2. Check for mm-to-px leakage into domain logic.
3. Check that export preserves absolute mm coordinates expected by LightBurn.
4. Check whether tumbler-wrap vs flat-bed mode separation can be violated by shared state or handlers.
5. Identify missing regression tests around dimension propagation and export placement.

Output format:
- Findings first, ordered by severity
- For each finding: risk/impact, file and symbol, why it is a bug/risk, recommended fix
- Open questions
- Short summary
