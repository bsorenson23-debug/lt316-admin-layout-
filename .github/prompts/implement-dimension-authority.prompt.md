---
mode: ask
description: "Implementation: add dimension authority validation layer before LightBurn export"
---

Task goal:
Add a focused validation layer that ensures selected tumbler/template dimensions remain the single source of truth before export.

Scope:
- In:
  - add or tighten validation/checking around tumbler dimension propagation into export flow
  - surface mismatches in the narrowest place that controls export readiness
  - add focused tests for the changed behavior
- Out:
  - redesigning export UX
  - large state-management refactors
  - changes unrelated to tumbler dimension authority

Files:
- Primary:
  - src/components/admin/AdminLayoutShell.tsx
  - src/utils/lightBurnSvgExport.ts
  - src/utils/tumblerExportPlacement.ts
- Related:
  - src/types/admin.ts
  - src/data/tumblerProfiles.ts

Constraints:
- Read AGENTS.md first.
- Keep mm-based domain math.
- Preserve workspace mode gating.
- Keep changes minimal.
- Update tests if behavior changes.

Definition of done:
- Result: export flow rejects or flags inconsistent tumbler dimension state instead of silently proceeding with drift.
- Tests: add or update focused tests around dimension propagation and export readiness.
- Validation: verify behavior with targeted tests and the narrowest possible manual/export validation.

Additional instructions:
Before coding, summarize which existing abstraction currently owns dimension authority and where export consumes it.
Then make the smallest change that hardens that contract.
Avoid speculative refactors.

Output format:
- Plan
- Changes made by file
- Tests/validation
- Follow-up risks
