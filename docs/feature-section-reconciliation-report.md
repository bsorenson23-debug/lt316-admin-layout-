# Feature Section Reconciliation Report

## 1. Executive Summary

This was a docs-only reconciliation pass on current `main` after the BODY CUTOUT QA, WRAP / EXPORT, product appearance, BODY REFERENCE v2, and recent polish branches were merged.

Result: no major intended feature section appears to have been skipped on `main`.

- Validation baseline passed on current `main`.
- A fresh real UI reconciliation smoke passed on `http://127.0.0.1:3300/admin?debug=1`.
- BODY CUTOUT QA, WRAP / EXPORT, product appearance references, and BODY REFERENCE v2 remain present and behaviorally separate in the operator flow.
- Recent polish branches for generic 404 console noise, template-create navigation, and v2 guidance are also present on `main`.

The remaining work is polish and coverage follow-up, not missing architecture.

## 2. Current Main HEAD

- Audited `main` HEAD: `b66cc68a23fde6acec93d83a807dc91a304be948`
- Audit branch: `codex/feature-section-reconciliation-review`

## 3. Validation Results

Fresh validation logs were captured under `.codex-diagnostics/feature-section-reconciliation-review/validation/`.

Commands run:

- `npx.cmd tsc --noEmit --pretty false`
- `npm.cmd run build`
- `npm.cmd run test:body-reference-contract`
- `npm.cmd run validate:gltf`
- `node --experimental-strip-types --test src/lib/bodyGeometryContract.test.ts src/lib/bodyReferenceFineTune.test.ts src/lib/bodyReferenceSvgQuality.test.ts src/lib/bodyReferenceV2Capture.test.ts src/lib/bodyReferenceV2GenerationSource.test.ts src/lib/bodyReferenceV2ScaleMirror.test.ts src/lib/bodyReferenceV2Layers.test.ts src/lib/productDimensionAuthority.test.ts src/lib/wrapExportProductionValidation.test.ts src/lib/wrapExportPreviewState.test.ts src/lib/laserBedSurfaceMapping.test.ts src/lib/engravingOverlayPreview.test.ts src/lib/productAppearanceReferenceLayers.test.ts src/lib/templateStorage.test.ts src/server/tumbler/generateTumblerModel.test.ts`

Results:

- `tsc`: pass
- `build`: pass
- `test:body-reference-contract`: pass
- `validate:gltf`: pass
- targeted tests: pass, `190` passed, `0` failed

Observed non-blocking noise:

- `MODULE_TYPELESS_PACKAGE_JSON` warnings during direct Node test execution
- `THREE.GLTFExporter` normalized normal warnings in GLB export tests
- `validate:gltf` reported only informational validator warnings such as `UNUSED_OBJECT` and one `KHR_draco_mesh_compression` unsupported-extension note on an existing template GLB

Known unrelated local artifact noise was not hit in this pass; `.local/generated-models/stanley-iceflow-30-bodyfit-v5.glb` did not block validation.

## 4. Real UI Reconciliation Result

Fresh UI reconciliation artifacts were captured under `.codex-diagnostics/feature-section-reconciliation-review/`.

Overall result: pass.

Confirmed in the fresh smoke:

- Source pending -> Detect blocked before upload
- Source ready -> Detect actionable after upload
- product lookup / diameter authority visible and correct
- BODY REFERENCE accept works
- reviewed GLB generation works
- BODY CUTOUT QA passes
- fine-tune draft / accept / regenerate path works
- WRAP / EXPORT appears and remains separate from BODY CUTOUT QA
- saved artwork placement persists
- engraving overlay appears in WRAP / EXPORT and stays hidden in BODY CUTOUT QA
- product appearance references are clearly reference-only
- BODY REFERENCE v2 scaffold and capture controls appear
- v2 generation stays gated until readiness passes
- v2 generated output remains `body_mesh` only
- normal and v2 debug reports still download / generate correctly

Fresh smoke highlights:

- `generated-audit` requests: `5`
- `generated-audit` response statuses: all `200`
- browser `404` responses: `0`
- console errors: `0`

Fresh normal BODY CUTOUT QA debug report:

- `mode = body-cutout-qa`
- `runtimeInspection.status = complete`
- `bodyMeshNames = ["body_mesh"]`
- `bodyBounds` non-null
- `fallbackDetected = false`
- `accessoryMeshNames = []`
- `source.hash === glb.sourceHash`
- `glb.freshRelativeToSource = true`
- `validation.status = pass`
- `svgQuality.status = pass`
- `suspiciousJumpCount = 0`
- `expectedBridgeSegmentCount = 2`

Fresh v2 BODY CUTOUT QA debug report:

- `source.type = body-reference-v2`
- `validation.status = pass`
- `lookupDimensionAuthorityStatus = warn`
- `nonBodyGenerationExclusions = artwork-placements, engraving-overlay-preview, product-appearance-layers`
- `source.hash === glb.sourceHash`
- `bodyMeshNames = ["body_mesh"]`
- `accessoryMeshNames = []`

## 5. Section Inventory Table

| Section | Status | Merged on main? | Operator reachable? | Smoke verified? | Main files / surfaces | Notes / gaps |
|---|---|---:|---:|---:|---|---|
| A. BODY CUTOUT QA foundation | `MERGED_AND_WORKING` | yes | yes | yes | `src/lib/bodyGeometryContract.ts`, `src/server/models/bodyGeometryAuditArtifact.ts`, `src/components/admin/BodyContractInspectorPanel.tsx`, `src/lib/bodyCutoutQaGuard.ts`, `scripts/inspect-glb.mjs`, `scripts/validate-gltf.mjs` | Runtime truth, audit sidecars, runtime inspection, freshness, guard/banner, inspector, and debug export are all present on current `main`. Fresh smoke and validation both passed. |
| B. SVG cutout quality / fit | `MERGED_AND_WORKING` | yes | yes | yes | `src/lib/bodyReferenceSvgQuality.ts`, `src/lib/bodyReferenceFineTune.ts`, `src/components/admin/BodyReferenceFineTuneEditor.tsx` | Passive SVG quality diagnostics, bridge refinement, fine-tune draft/accept flow, and visual fit controls are all present. Fresh smoke confirmed draft -> accept -> regenerate, with `suspiciousJumpCount = 0` and `expectedBridgeSegmentCount = 2`. |
| C. Preview separation | `MERGED_AND_WORKING` | yes | yes | yes | `src/lib/tumblerPreviewModelState.ts`, `src/components/admin/Model3DPanel.tsx`, `src/lib/generatedModelUrl.ts`, `src/lib/templateModelAvailability.ts`, `src/components/admin/TemplateCreateForm.tsx` | BODY CUTOUT QA vs `full-model` vs WRAP / EXPORT remains separate. The pre-generation full-model stabilizers are in place, and the generic optional-probe 404 spam is gone. Remaining aborted `HEAD` requests during rapid transitions are low-signal noise, not missing behavior. |
| D. WRAP / EXPORT / laser-bed foundation | `MERGED_AND_WORKING` | yes | yes | yes | `src/lib/wrapExportPreviewState.ts`, `src/lib/wrapExportProductionValidation.ts`, `src/lib/laserBedSurfaceMapping.ts`, `src/lib/engravingOverlayPreview.ts`, `src/lib/templateStorage.ts`, `src/components/admin/TemplateCreateForm.tsx`, `src/components/admin/BodyContractInspectorPanel.tsx` | WRAP / EXPORT preview mode, mapping helpers, saved mm placement persistence, engraving overlay preview, and production validation are all on `main` and passed fresh smoke. Main remaining gap is wording polish, not missing implementation. |
| E. Product appearance references | `MERGED_AND_WORKING` | yes | yes | yes | `src/lib/productAppearanceReferenceLayers.ts`, `src/components/admin/TemplateCreateForm.tsx`, `src/lib/bodyGeometryContract.ts` | Finish bands and front/back brand references are present, shown as reference-only, and remain excluded from `body_mesh`. Fresh smoke confirmed the summary remains reference-only. |
| F. BODY REFERENCE v2 | `MERGED_AND_WORKING` | yes | yes | yes | `src/lib/bodyReferenceV2Capture.ts`, `src/lib/bodyReferenceV2GenerationSource.ts`, `src/lib/bodyReferenceV2ScaleMirror.ts`, `src/lib/bodyReferenceV2Layers.ts`, `src/lib/productDimensionAuthority.ts`, `src/lib/bodyReferenceV2Guidance.ts`, `src/server/tumbler/generateTumblerModel.ts`, `src/components/admin/TemplateCreateForm.tsx` | Semantic layers, mirror preview, optional body-only generation, dimension authority hardening, capture tools, production guardrails, and guidance polish are all merged and visible. Fresh smoke confirmed gated v2 generation, `body_mesh`-only output, and preserved non-body exclusions. |
| G. Recent polish | `MERGED_AND_WORKING` | yes | yes | yes | `src/components/admin/Model3DPanel.tsx`, `src/lib/templateModelAvailability.ts`, `src/lib/templateCreateFlow.ts`, `src/components/admin/TemplateCreateForm.tsx`, `src/lib/bodyReferenceV2Guidance.ts` | Generic 404 cleanup, template-create step navigation polish, and v2 guidance polish are all present on `main`. Fresh smoke showed zero 404 responses and clearer template/v2 operator messaging. |

## 6. Confirmed Merged Sections

Confirmed on `main` and validated again in this pass:

- BODY CUTOUT QA runtime truth and inspector stack
- SVG cutout quality diagnostics and fine-tune flow
- preview-mode separation between BODY CUTOUT QA, full-model, and WRAP / EXPORT
- WRAP / EXPORT persistence, mapping, overlay preview, and production validation
- product appearance reference layers with reference-only behavior
- BODY REFERENCE v2 scaffold, capture, readiness, guarded generation, and guidance
- recent polish branches for console-noise cleanup and operator navigation/copy clarity

## 7. Pending Sections

No major feature section in the audited list is currently `PENDING_PR`.

The remaining pending work is follow-up polish, not missing merged architecture:

- WRAP / EXPORT status-copy polish
- broader committed e2e coverage for the v2/operator flow
- lower-priority modal-density and disabled-reason polish

## 8. Not-Started Sections

These appear intentionally not started yet, not skipped:

- `codex/polish-wrap-export-status-copy`
- `codex/harden-v2-e2e-playwright-coverage`
- a broader app-feature polish pass beyond the already-merged targeted fixes

## 9. Anything That Appears Skipped

No major intended section from the merged feature train appears skipped on current `main`.

What remains is smaller and clearer:

- polish branches that were already identified in the earlier readiness audit
- committed e2e coverage hardening so the current smoke harness becomes a more durable regression gate
- some UI density / status wording follow-up that does not block the operator workflow

The clearest sign that nothing major was skipped is that the fresh reconciliation smoke exercised the full chain successfully on current `main`:

- source/detect
- lookup authority
- BODY REFERENCE v1 accept and reviewed GLB generation
- BODY CUTOUT QA pass
- fine-tune draft / accept / regenerate
- WRAP / EXPORT persistence and overlay separation
- product appearance reference-only behavior
- BODY REFERENCE v2 capture, acceptance, gated generation, and v2 BODY CUTOUT QA validation

## 10. Recommended Next 5 Small Branches In Order

1. `codex/polish-wrap-export-status-copy`
   - Align readiness, freshness, and mapping wording so WRAP / EXPORT reads faster for operators.
2. `codex/harden-v2-e2e-playwright-coverage`
   - Turn the proven diagnostics smoke into a stable committed regression path.
3. `codex/polish-debug-density-normal-mode`
   - Reduce debug-text crowding when the operator only needs the next action.
4. `codex/polish-disabled-action-reasons`
   - Make blocked actions explain themselves more consistently inline.
5. `codex/cleanup-local-worktree-guidance-docs`
   - Document safe local hygiene and stale worktree / Docker boundaries without mixing it into feature branches.

## 11. Blockers, If Any

No blocker was found for continuing with narrow polish branches.

Current non-blocking follow-up notes:

- rapid viewer transitions still produce some aborted `HEAD` / generated-model requests
- debug mode still surfaces more low-level detail than a normal operator needs
- WRAP / EXPORT behavior is correct, but its status hierarchy can still be tighter

Bottom line: current `main` reflects the expected architecture, and no major intended section appears to have been skipped.
