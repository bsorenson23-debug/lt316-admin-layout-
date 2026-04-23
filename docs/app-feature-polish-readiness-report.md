# App Feature Polish Readiness Audit

## 1. Executive Summary

This pass was an audit-only branch after the BODY REFERENCE, WRAP / EXPORT, laser-bed mapping, appearance reference, engraving overlay, and BODY REFERENCE v2 merge train. No app behavior was intentionally changed.

Current state is strong enough to start narrow polish branches:

- Validation passed end to end on the `main`-derived audit branch.
- The real operator flow passed on a fresh local server at `http://127.0.0.1:3285/admin?debug=1`.
- BODY REFERENCE v1 remains authoritative by default, fine-tune draft acceptance/regeneration works, and BODY CUTOUT QA lineage stays correct.
- WRAP / EXPORT persists millimeter placement, derives overlay state from saved placement, and stays separate from BODY CUTOUT QA.
- BODY REFERENCE v2 capture, acceptance, readiness gating, and operator-triggered v2 generation all worked, with `body_mesh`-only output and explicit `body-reference-v2` authority.

No hard release blocker was found in the audited operator flow. The highest-value polish work is now around clarity and signal quality rather than core correctness:

- repeated generic 404 console noise from missing template-asset probes
- dense template-create modal hierarchy and next-step clarity
- v1 vs v2 authority guidance
- WRAP / EXPORT readiness/status wording
- local repo/worktree and Docker hygiene guidance

## 2. Current Main HEAD

- Audited `main` baseline: `c5957475433db4c0afcae1f45a5c646aa1d421fc`
- Audit branch created from that baseline: `codex/app-feature-polish-readiness`

## 3. Validation Results

Validation logs were captured under:

- `.codex-diagnostics/app-feature-polish-readiness/validation/01-tsc.log`
- `.codex-diagnostics/app-feature-polish-readiness/validation/02-build.log`
- `.codex-diagnostics/app-feature-polish-readiness/validation/03-body-reference-contract.log`
- `.codex-diagnostics/app-feature-polish-readiness/validation/04-validate-gltf.log`
- `.codex-diagnostics/app-feature-polish-readiness/validation/05-targeted-tests.log`

Results:

- `npx.cmd tsc --noEmit --pretty false`: pass
- `npm.cmd run build`: pass
- `npm.cmd run test:body-reference-contract`: pass
- `npm.cmd run validate:gltf`: pass
- targeted Node test run: pass, `190` tests passed, `0` failed

Observed non-blocking validation noise:

- existing Turbopack NFT warning during `build`
- Node `MODULE_TYPELESS_PACKAGE_JSON` warning during TypeScript test/runtime execution
- `THREE.GLTFExporter: Creating normalized normal attribute...` warnings during GLTF-related tests/export paths

None of the above changed the pass/fail outcome.

## 4. End-to-End UI Audit Result

UI audit artifacts were captured under:

- `.codex-diagnostics/app-feature-polish-readiness/ui-audit/ui-smoke-results.json`
- `.codex-diagnostics/app-feature-polish-readiness/ui-audit/final-body-contract-debug-report.json`
- `.codex-diagnostics/app-feature-polish-readiness/ui-audit/v2-body-contract-debug-report.json`
- `.codex-diagnostics/app-feature-polish-readiness/ui-audit/server-stdout.log`
- `.codex-diagnostics/app-feature-polish-readiness/ui-audit/server-stderr.log`
- screenshots in `.codex-diagnostics/app-feature-polish-readiness/ui-audit/`

Overall result: pass.

### A. Source / Detect

- Source started as pending before upload.
- Detect stayed blocked before upload.
- Product lookup resolved the correct `40 oz` variant.
- Lookup copy kept diameter as primary authority.
- Full product height stayed context-only.
- Upload moved the template into source-ready / detect-actionable state.

### B. BODY REFERENCE v1

- BODY REFERENCE accept worked.
- Reviewed GLB generation worked.
- BODY CUTOUT QA passed.
- `source.hash === glb.sourceHash` held.
- Fine-tune draft stayed non-authoritative until accepted.
- Accepting the corrected cutout made the old GLB stale.
- Regenerating restored fresh lineage and BODY CUTOUT QA pass.

### C. SVG Visual Fit

- Overlay/fit surfaces were present.
- Point selection and nudge flow worked through the fine-tune editor.
- Fit summary remained visible.
- Bridge guidance remained consistent.
- No false suspicious-jump warning surfaced.

### D. WRAP / EXPORT

- WRAP / EXPORT appeared in the template flow.
- Saved artwork placement persisted.
- Overlay derived from saved millimeter placement.
- Moving artwork changed overlay placement without GLB regeneration.
- Outside-printable warning appeared when forced outside range and cleared after restoring placement.
- Overlay remained hidden in BODY CUTOUT QA.

### E. Product Appearance References

- Appearance summary was visible.
- Reference-only labeling was clear enough to avoid contaminating BODY CUTOUT QA.
- Appearance layers did not affect `body_mesh`.

### F. BODY REFERENCE v2

- v2 scaffold appeared.
- Mirror preview appeared.
- Centerline/body-left capture controls worked.
- Accepted v2 draft stayed separate from the v1 approved contour.
- Readiness gating worked.
- Operator-reachable v2 generation worked once v2 readiness passed and the draft was accepted.
- v2 GLB stayed `body_mesh` only.
- v2 report identified `body-reference-v2` authority.
- Non-body exclusions were present.

### G. Debug / Inspector / Reporting

- Generated-audit requests consistently returned `200`.
- Normal BODY CUTOUT QA debug report was captured.
- v2 BODY CUTOUT QA debug report was captured.
- Body lineage stayed coherent in BODY CUTOUT QA.
- No fresh/stale contradiction appeared in the v1 generation lineage.
- There is still some status-copy ambiguity in WRAP / EXPORT, detailed below.

## 5. BODY CUTOUT QA Baseline

Normal BODY CUTOUT QA stayed healthy after the full audit flow:

- `mode = body-cutout-qa`
- `runtimeInspection.status = complete`
- `bodyMeshNames = ["body_mesh"]`
- `bodyBounds` present and non-null
- `fallbackDetected = false`
- `accessoryMeshNames = []`
- `source.type = approved-svg`
- `source.hash === glb.sourceHash`
- `glb.freshRelativeToSource = true`
- `validation.status = pass`
- `svgQuality.status = pass`
- `suspiciousJumpCount = 0`
- `expectedBridgeSegmentCount = 2`

This remains the reliable baseline for further polish work.

## 6. WRAP / EXPORT Baseline

WRAP / EXPORT production behavior is functionally ready:

- export authority remains saved laser-bed millimeter placement
- saved placement persisted through reload
- overlay remained preview-only and derived from saved placement
- overlay hid correctly in BODY CUTOUT QA
- moving artwork did not require GLB regeneration
- outside-printable warnings behaved correctly
- product appearance references stayed reference-only

Current friction is primarily copy and hierarchy, not behavior:

- the panel shows enough data to diagnose state
- the most important operator state is not always the most visually obvious
- `Mapping status` can read as `Unknown` while the same panel also reports fresh saved mapping and a working overlay

## 7. BODY REFERENCE v2 Baseline

BODY REFERENCE v2 is now operator-reachable and functionally compatible with the current main flow:

- capture can be seeded from the accepted v1 contour
- centerline and body-left remain explicit inputs
- accepted v2 draft remains separate from v1 authority until explicit generation
- v2 generation stays gated until readiness passes
- generated v2 output stays `body_mesh` only
- non-body exclusions were preserved:
  - `artwork-placements`
  - `engraving-overlay-preview`
  - `product-appearance-layers`

Final v2 debug report baseline:

- `source.type = body-reference-v2`
- `centerlineCaptured = true`
- `leftBodyOutlineCaptured = true`
- `mirroredBodyGenerated = true`
- `bodyMeshNames = ["body_mesh"]`
- `accessoryMeshNames = []`
- `source.hash === glb.sourceHash`
- `validation.status = pass`

One remaining clarity gap is reporting language, not core behavior:

- the v2 debug report captured `lookupDimensionAuthorityStatus = warn`
- the report did not surface a top-level `scaleSource` field in the same place older audit asks expected
- neither item blocked the audited v2 flow, but both are worth tightening before broader polish or support handoff

## 8. Console / Network Noise

### Classification Summary

| Class | Issue | Impact | Recommendation |
|---|---|---|---|
| A. Harmless dev/build noise | HMR logs, React DevTools tip, WebGL context lost on page close, GLTF exporter warnings | Low | Ignore in product audit reports unless they correlate with a user-visible failure |
| B. Missing asset but not user-visible in the audited path | Repeated `HEAD` 404s for missing placeholder template GLBs | Medium signal pollution | Fix the availability probe or provide an explicit availability manifest |
| C. User-visible issue | WRAP / EXPORT status wording can read as contradictory even when the overlay and saved mapping are healthy | Medium | Polish copy and hierarchy |
| D. Performance issue | None clearly surfaced in this pass | None | Monitor later |
| E. Real app bug | Console collapses all 404s into the same generic error text, which hides whether the error is a real broken generated asset vs an intentional placeholder probe | Medium | Reduce or silence expected missing-asset probes |
| F. Needs separate investigation | Stale sibling worktrees and long-lived Docker containers tied to older worktrees | Medium environment risk | Triage separately; do not mix into UI polish branches |

### 404 Detail

The repeated generic 404 errors were traced to the template availability probe in `src/components/admin/Model3DPanel.tsx`, which issues `fetch(tpl.glbPath, { method: "HEAD" })` for each filtered template to disable missing assets instead of failing on click.

Relevant code path:

- `src/components/admin/Model3DPanel.tsx:149-172`

404s observed during this audit:

| URL | Initiator / Source | Expected file | UI impact | Recommendation |
|---|---|---|---|---|
| `/models/templates/tumbler-20oz-skinny.glb` | `Model3DPanel` template availability `HEAD` probe | placeholder GLB from `src/data/glbTemplates.ts` | No break in the audited flow; console noise only | Stop probing known-missing placeholders or mark missing assets in data |
| `/models/templates/tumbler-30oz.glb` | same | placeholder GLB from `src/data/glbTemplates.ts` | No break in the audited flow; console noise only | same |
| `/models/templates/tumbler-wine.glb` | same | placeholder GLB from `src/data/glbTemplates.ts` | No break in the audited flow; console noise only | same |
| `/models/templates/mug-12oz.glb` | same | placeholder GLB from `src/data/glbTemplates.ts` | No break in the audited flow; console noise only | same |
| `/models/templates/bottle-24oz.glb` | same | placeholder GLB from `src/data/glbTemplates.ts` | No break in the audited flow; console noise only | same |

Additional non-404 request noise:

- aborted `HEAD` requests against the active generated GLB during view switches were observed with `net::ERR_ABORTED`
- aborted `HEAD` requests for `/models/templates/yeti-40oz-body.glb` were also observed even though the file exists locally
- both looked like fetch cancellation during model/viewer transitions rather than asset absence, and neither caused a visible failure in the audited path

## 9. UI / Operator Friction

Prioritized polish opportunities:

| Priority | Area | Issue | User impact | Suggested small branch | Risk |
|---|---|---|---|---|---|
| P1 | Console / diagnostics | Generic 404 console errors from missing template-asset probes bury real failures | Harder smoke triage and noisier operator debugging | `codex/resolve-generic-404-console-noise` | Low |
| P1 | Template create flow | The create/edit modal is dense and mixes gating, debug, review, preview-mode, and next-step actions in one stack | Slower operator comprehension and more automation brittleness | `codex/polish-template-create-step-navigation` | Medium |
| P1 | BODY REFERENCE authority copy | v1 vs v2 authority is technically correct but still cognitively heavy: accepted draft, readiness, current source, and explicit generation are spread across several cards | Risk of operator confusion about what is authoritative | `codex/polish-body-reference-v2-guidance` | Low |
| P2 | WRAP / EXPORT status copy | The panel exposes the right data, but readiness/freshness/mapping language is not aligned enough for fast operator reading | Looks contradictory even when behavior is correct | `codex/polish-wrap-export-status-copy` | Low |
| P2 | Normal-mode hierarchy | Debug-heavy chips and metrics crowd the modal even when the operator mainly needs the next action | Important controls are easy to miss | `codex/polish-debug-density-normal-mode` | Medium |
| P2 | Disabled action reasons | Some gated buttons depend on nearby prose rather than strong inline reason labels/tooltips | More clicks and slower recovery when blocked | `codex/polish-disabled-action-reasons` | Low |
| P3 | Automated coverage | The most reliable e2e audit exists as a diagnostics script rather than a committed stable regression test | Regressions may be caught late | `codex/harden-v2-e2e-playwright-coverage` | Medium |
| P3 | Local environment hygiene | Dirty sibling worktrees and old Docker state increase the chance of false positives during future audits | Audit/repro friction | `codex/cleanup-local-worktree-guidance-docs` | Low |

## 10. Technical-Debt / Worktree / Docker Notes

Current audit worktree:

- path: `C:\Users\brennen\Documents\GitHub\lt316-admin-layout-laserbed-clean`
- branch during audit: `codex/app-feature-polish-readiness`
- branch head before this docs commit: `c5957475433db4c0afcae1f45a5c646aa1d421fc`
- local untracked artifacts in the audit worktree: `.codex-diagnostics/`, `.local/`

Sibling worktrees / checkouts:

- `C:\Users\brennen\Documents\GitHub\lt316-admin-layout-`
- `C:\Users\brennen\Documents\GitHub\lt316-admin-layout-runtime-truth-clean`
- `C:\Users\brennen\.codex\worktrees\843f\lt316-admin-layout-`

Git worktree inventory:

- `lt316-admin-layout-` is attached to `codex/admin-phase-two-runtime-truth`
- `lt316-admin-layout-runtime-truth-clean` is attached to `codex/laser-bed-surface-mapping-v1-clean`
- detached Codex worktree at `C:\Users\brennen\.codex\worktrees\843f\lt316-admin-layout-`

Dirty older worktrees:

- `lt316-admin-layout-` is heavily dirty across source, scripts, Docker files, and generated assets
- `lt316-admin-layout-runtime-truth-clean` is also dirty in tracked source plus local runtime artifacts
- detached Codex worktree appeared clean in this spot check

Docker state:

- multiple long-lived containers exist from older LT316 work
- no inspected running/created LT316 container is mounted to the current `lt316-admin-layout-laserbed-clean` worktree
- active LT316 Docker mounts point at `lt316-admin-layout-runtime-truth-clean` or the older `lt316-admin-layout-` checkout instead

Merged local branches that can be cleaned later:

- `codex/body-reference-v2-scale-mirror-preview`
- `codex/body-reference-v2-body-only-generation`
- `codex/body-reference-v2-capture-tools`
- `codex/body-reference-v2-production-validation`
- `codex/product-lookup-dimension-authority`
- `codex/wrap-export-production-validation`
- other older merged local `codex/*` branches shown by `git branch --merged`

Recommendation:

- do not clean any of this during polish branches
- capture a short repo-hygiene follow-up branch or ops note once UI polish priorities are addressed

## 11. Recommended Next Small Polish Branches

Recommended order:

1. `codex/resolve-generic-404-console-noise`
   - remove or quiet the known-missing template `HEAD` probes so real asset failures stand out
2. `codex/polish-template-create-step-navigation`
   - make the dominant next action in the create/edit modal more obvious
3. `codex/polish-body-reference-v2-guidance`
   - tighten v1/v2 authority copy and reduce operator ambiguity
4. `codex/polish-wrap-export-status-copy`
   - align freshness, readiness, and mapping wording so the panel reads cleanly
5. `codex/harden-v2-e2e-playwright-coverage`
   - turn the proven diagnostics flow into a stable committed regression path
6. `codex/cleanup-local-worktree-guidance-docs`
   - document safe local hygiene and stale worktree/Docker boundaries

## 12. Risks And Blockers

No hard blocker was found for moving into narrow polish branches.

Current risks:

- console 404 noise can hide a real generated-asset failure if left unresolved
- the create/edit modal remains functionally correct but visually dense
- v2 authority/report wording is correct enough for current operators but not yet polished for broader support or handoff
- stale sibling worktrees and old Docker state increase environmental confusion during future audits

Bottom line:

- core flows are ready for polish
- the next work should stay narrow, user-facing, and clarity-first
- avoid mixing environment cleanup with behavior polish unless a future branch is dedicated to repo hygiene
