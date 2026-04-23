# Current App Capability Summary

Current `main` snapshot audited at `984133c968ad8ced7656303d107971721c2a50d9`.

## 1. What Is Working Now

- BODY CUTOUT QA is production-valid for reviewed BODY REFERENCE output, with runtime-truth contract checks, audit sidecars, loaded-scene inspection, freshness checks, and a pass/fail inspector flow.
- SVG cutout quality and fit tooling is live, including passive quality diagnostics, bridge refinement, fine-tune draft/accept/regenerate flow, and visual fit controls.
- Preview-mode separation is in place: BODY CUTOUT QA, 3D full-model preview, and WRAP / EXPORT each keep their own purpose and validation expectations.
- WRAP / EXPORT is working end to end: saved laser-bed millimeter placement persists, the 3D overlay is derived from saved placement, outside-printable warnings work, and overlay state remains separate from BODY CUTOUT QA.
- Product appearance references are working as reference-only context: finish bands and front/back logo guides are visible without contaminating `body_mesh`.
- BODY REFERENCE v2 is working as an operator-gated secondary path: semantic layers, capture tools, scale/mirror preview, readiness gating, guarded v2 generation, and `body_mesh`-only output are all merged and verified.
- Recent polish is present on `main`: generic optional-probe 404 console spam is removed, template-create step flow is clearer, and BODY REFERENCE v2 guidance copy is clearer.

## 2. What Is Intentionally Separate

- BODY CUTOUT QA is not WRAP / EXPORT proof.
- WRAP / EXPORT is not BODY CUTOUT QA proof.
- BODY REFERENCE v1 approved contour remains the default authoritative source until the operator explicitly generates from an accepted v2 draft.
- Product appearance references, lid/handle/reference layers, and engraving artwork overlays remain out of `body_mesh`.
- The 3D engraving overlay is preview-only and derived from saved placement; it is not generation authority.

## 3. What Is Operator-Reachable Now

- Create a template from lookup plus product image.
- Accept BODY REFERENCE v1 and generate a reviewed BODY CUTOUT QA GLB.
- Run the fine-tune draft/accept/regenerate loop and recover fresh lineage.
- Enter WRAP / EXPORT, place artwork, save placement, reload, and keep overlay/viewer agreement.
- See product appearance reference summaries as context-only guidance.
- Seed BODY REFERENCE v2 capture from the accepted v1 contour, capture centerline and body-left, accept the v2 draft, and generate BODY CUTOUT QA from the v2 mirrored profile once readiness passes.
- Open the Body Contract Inspector and export normal or v2 debug reports.

## 4. What Still Needs Polish

- WRAP / EXPORT status wording can still be tighter so readiness, freshness, and mapping state read faster.
- The current smoke path is strong but still lives mostly in diagnostics rather than a fully committed stable e2e regression suite.
- Normal-mode UI still gets dense once review, preview, WRAP / EXPORT, and v2 surfaces are all visible together.
- Some blocked actions still rely on nearby prose more than strong inline reason labels.

## 5. Recommended Next Branches

1. `codex/polish-wrap-export-status-copy`
2. `codex/harden-v2-e2e-playwright-coverage`
3. `codex/polish-debug-density-normal-mode`
4. `codex/polish-disabled-action-reasons`
5. `codex/cleanup-local-worktree-guidance-docs`

## 6. Known Non-Blocking Noise

- Direct Node test runs still emit `MODULE_TYPELESS_PACKAGE_JSON` warnings.
- GLB export and validation paths still emit some `THREE.GLTFExporter` normal-attribute warnings and benign validator info like `UNUSED_OBJECT`.
- Rapid viewer transitions can still produce aborted `HEAD` or generated-model requests without breaking the operator flow.
- The large generic placeholder-probe 404 spam is no longer part of the normal main-branch smoke path.
