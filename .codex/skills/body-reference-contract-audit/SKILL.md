# BODY REFERENCE Contract Audit

Use this skill when working on the BODY REFERENCE / orange cutout pipeline in LT316 Admin.

## Goal

Verify that BODY REFERENCE is behaving as one hard-gated contract:

- shell geometry
- mm calibration
- printable surface contract
- warning ledger
- save blocking

Do not accept fixes that only make the overlay look better while leaving the canonical contract inconsistent.

## Required Checks

1. Run the contract fixtures:

```powershell
npm run test:body-reference-contract
```

2. Run typecheck after any contract change:

```powershell
npx tsc --noEmit
```

3. Inspect the BODY REFERENCE debug JSON in `Create new template` and confirm these objects agree:

- `canonicalBodyProfile`
- `canonicalDimensionCalibration`
- `printableSurfaceContract`
- `bodyReferenceQA`
- `warnings`

4. Visually inspect the Stanley Quencher path and confirm:

- the orange cutout starts at the lid/body line
- the straight wall stays full-width through the main body
- taper begins at the lower shoulder, not near the top band
- the handle-side bite does not pull the shell inward
- the visible BODY REFERENCE warning text matches the debug JSON warning text exactly

5. Confirm save gating:

- `bodyReferenceQA.severity === "action"` must block save
- review-only warnings must not silently rewrite the shell or calibration

## Reject These Fixes

- Any fix that patches only Konva/SVG/Three overlay rendering
- Any fix that introduces a second preview-only body/calibration derivation
- Any fix that uses `fitDebug` as final shell authority
- Any fix that reintroduces separate warning sources for UI, debug JSON, and save blocking

## Files To Check First

- `C:\Users\brennen\Documents\GitHub\lt316-admin-layout-\src\lib\bodyReferencePipeline.ts`
- `C:\Users\brennen\Documents\GitHub\lt316-admin-layout-\src\lib\canonicalDimensionCalibration.ts`
- `C:\Users\brennen\Documents\GitHub\lt316-admin-layout-\src\components\admin\TemplateCreateForm.tsx`
- `C:\Users\brennen\Documents\GitHub\lt316-admin-layout-\src\lib\bodyReferencePipeline.test.ts`

## Sign-off Standard

Do not sign off unless the contract tests pass, typecheck passes, and the Stanley visual check matches the canonical JSON.
