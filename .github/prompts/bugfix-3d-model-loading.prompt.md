---
mode: ask
description: "Bug fix: review 3D template and model loading reliability for tumbler/product workflows"
---

Mode: bug-fix

Issue:
- Title: Review 3D template and model loading reliability for tumbler/product workflows
- Severity: high
- Area: 3D

Repro:
- Preconditions:
  - a template with GLB path or uploaded model path is available
- Steps:
  - inspect model selection/load path
  - verify blob URL handling and ModelViewer constraints
  - trace how selected template dimensions and GLB path reach the viewer
- Observed:
  - need to identify any risk of model load failure, stale URL state, or dimension/model mismatch
- Expected:
  - selected template should consistently load the correct model and use matching dimensions
- Frequency: unknown

Scope:
- Likely files:
  - src/components/admin/ModelViewer.tsx
  - src/components/admin/Model3DPanel.tsx
  - src/components/admin/AdminLayoutShell.tsx
  - src/data/builtInTemplates.ts
  - src/lib/templateStorage.ts
- Out of scope:
  - redesigning 3D UI
  - replacing loader architecture

Constraints:
- Read AGENTS.md first.
- Keep all units in mm.
- Preserve ModelViewer constraints:
  - blob URLs must be created in useEffect, not useMemo
  - Canvas must keep frameloop="demand"
  - No Environment preset fetches (offline-safe manual lights only)
- Keep changes minimal.

Definition of done:
- Root cause: identify any mismatch or fragility in template → GLB → viewer → dimensions flow.
- Fix: produce severity-ranked findings or smallest implementation fix.
- Validation: validate with focused checks, add regression coverage if behavior changes.

Additional instructions:
Pay special attention to whether product template selection updates all dimension fields and GLB state together atomically, and whether editing the active template keeps workspace state in sync (per AGENTS.md ProductTemplate system notes).

Output format:
- Findings ordered by severity
- Root cause
- Changes made
- Validation
- Residual risks
