import assert from "node:assert/strict";
import test from "node:test";

import {
  createBodyReferenceV2Layer,
  createCenterlineAxis,
  isBodyReferenceV2LayerIncludedInBodyCutoutQa,
  isBodyReferenceV2LayerReferenceOnly,
  summarizeBodyReferenceV2Draft,
  validateBlockedRegions,
  validateBodyLeftLayer,
  validateBodyReferenceV2Draft,
  validateCenterlineAxis,
  validateReferenceLayerSeparation,
  type BodyReferenceV2Draft,
} from "./bodyReferenceV2Layers.ts";

function createDraft(overrides: Partial<BodyReferenceV2Draft> = {}): BodyReferenceV2Draft {
  return {
    sourceImageUrl: "data:image/png;base64,body-reference",
    centerline: createCenterlineAxis({
      id: "centerline",
      xPx: 100,
      topYPx: 10,
      bottomYPx: 210,
      confidence: 0.92,
      source: "operator",
    }),
    layers: [
      createBodyReferenceV2Layer({
        id: "body-left",
        kind: "body-left",
        points: [
          { xPx: 80, yPx: 20 },
          { xPx: 76, yPx: 120 },
          { xPx: 82, yPx: 205 },
        ],
      }),
      createBodyReferenceV2Layer({
        id: "body-right",
        kind: "body-right-mirrored",
        points: [
          { xPx: 120, yPx: 20 },
          { xPx: 124, yPx: 120 },
          { xPx: 118, yPx: 205 },
        ],
      }),
      createBodyReferenceV2Layer({
        id: "lid",
        kind: "lid-reference",
        points: [
          { xPx: 75, yPx: 5 },
          { xPx: 125, yPx: 5 },
          { xPx: 125, yPx: 18 },
          { xPx: 75, yPx: 18 },
        ],
      }),
      createBodyReferenceV2Layer({
        id: "handle",
        kind: "handle-reference",
        points: [
          { xPx: 126, yPx: 45 },
          { xPx: 145, yPx: 45 },
          { xPx: 145, yPx: 155 },
          { xPx: 126, yPx: 155 },
        ],
      }),
    ],
    blockedRegions: [],
    scaleCalibration: {
      scaleSource: "lookup-diameter",
      lookupDiameterMm: 88.9,
      resolvedDiameterMm: 88.9,
      wrapDiameterMm: 88.9,
      wrapWidthMm: 279.29,
      expectedBodyHeightMm: 220,
      expectedBodyWidthMm: 88.9,
    },
    ...overrides,
  };
}

test("centerline validation passes for a finite vertical axis and warns when missing", () => {
  const valid = validateCenterlineAxis(createCenterlineAxis({
    id: "centerline",
    xPx: 102,
    topYPx: 8,
    bottomYPx: 208,
    source: "auto-detect",
  }));
  const missing = validateCenterlineAxis(null);

  assert.equal(valid.status, "pass");
  assert.equal(missing.status, "warn");
  assert.match(missing.warnings.join(" "), /centerline is not configured/i);
});

test("body-left validation passes when the contour stays left of the centerline", () => {
  const centerline = createCenterlineAxis({
    id: "centerline",
    xPx: 100,
    topYPx: 10,
    bottomYPx: 210,
    source: "operator",
  });
  const bodyLeft = createBodyReferenceV2Layer({
    id: "body-left",
    kind: "body-left",
    points: [
      { xPx: 90, yPx: 15 },
      { xPx: 80, yPx: 120 },
      { xPx: 92, yPx: 205 },
    ],
  });

  const validation = validateBodyLeftLayer(bodyLeft, centerline);

  assert.equal(validation.status, "pass");
});

test("body-left validation fails when the contour crosses the centerline", () => {
  const centerline = createCenterlineAxis({
    id: "centerline",
    xPx: 100,
    topYPx: 10,
    bottomYPx: 210,
    source: "operator",
  });
  const bodyLeft = createBodyReferenceV2Layer({
    id: "body-left",
    kind: "body-left",
    points: [
      { xPx: 88, yPx: 15 },
      { xPx: 104, yPx: 120 },
      { xPx: 92, yPx: 205 },
    ],
  });

  const validation = validateBodyLeftLayer(bodyLeft, centerline);

  assert.equal(validation.status, "fail");
  assert.match(validation.errors.join(" "), /crosses the centerline/i);
});

test("lid-reference and handle-reference layers stay reference-only and excluded from BODY CUTOUT QA", () => {
  const lid = createBodyReferenceV2Layer({
    id: "lid",
    kind: "lid-reference",
  });
  const handle = createBodyReferenceV2Layer({
    id: "handle",
    kind: "handle-reference",
  });

  assert.equal(isBodyReferenceV2LayerReferenceOnly(lid), true);
  assert.equal(isBodyReferenceV2LayerIncludedInBodyCutoutQa(lid), false);
  assert.equal(isBodyReferenceV2LayerReferenceOnly(handle), true);
  assert.equal(isBodyReferenceV2LayerIncludedInBodyCutoutQa(handle), false);
});

test("body-right-mirrored layers are derived and read-only by default", () => {
  const layer = createBodyReferenceV2Layer({
    id: "body-right",
    kind: "body-right-mirrored",
  });

  assert.equal(layer.editable, false);
  assert.equal(layer.referenceOnly, false);
  assert.equal(layer.includedInBodyCutoutQa, true);
});

test("lid-reference and handle-reference layers fail separation validation when marked for BODY CUTOUT QA", () => {
  const validation = validateReferenceLayerSeparation([
    createBodyReferenceV2Layer({
      id: "lid",
      kind: "lid-reference",
      includedInBodyCutoutQa: true,
    }),
    createBodyReferenceV2Layer({
      id: "handle",
      kind: "handle-reference",
      includedInBodyCutoutQa: true,
    }),
  ]);

  assert.equal(validation.status, "fail");
  assert.match(validation.errors.join(" "), /lid-reference must remain excluded from BODY CUTOUT QA/i);
  assert.match(validation.errors.join(" "), /handle-reference must remain excluded from BODY CUTOUT QA/i);
});

test("blocked region validation warns by default and can fail when requested", () => {
  const warnValidation = validateBlockedRegions([
    {
      id: "blocked-1",
      reason: "manual-mask",
      points: [{ xPx: 100, yPx: 50 }],
    },
  ]);
  const failValidation = validateBlockedRegions([
    {
      id: "blocked-1",
      reason: "manual-mask",
      points: [{ xPx: 100, yPx: 50 }],
    },
  ], { invalidSeverity: "fail" });

  assert.equal(warnValidation.status, "warn");
  assert.match(warnValidation.warnings.join(" "), /needs at least three points/i);
  assert.equal(failValidation.status, "fail");
  assert.match(failValidation.errors.join(" "), /needs at least three points/i);
});

test("draft validation warns when lookup diameter is missing even if a manual diameter exists", () => {
  const validation = validateBodyReferenceV2Draft(createDraft({
    scaleCalibration: {
      scaleSource: "manual-diameter",
      resolvedDiameterMm: 88.9,
      wrapDiameterMm: 88.9,
      wrapWidthMm: 279.29,
    },
  }));

  assert.equal(validation.status, "warn");
  assert.match(validation.warnings.join(" "), /lookup diameter is not configured/i);
});

test("draft summary reports scaffold counts and marks v2 as not current generation source", () => {
  const summary = summarizeBodyReferenceV2Draft(createDraft());

  assert.equal(summary.status, "pass");
  assert.equal(summary.centerlineCaptured, true);
  assert.equal(summary.bodyLeftCaptured, true);
  assert.equal(summary.bodyRightMirroredPresent, true);
  assert.equal(summary.lidReferenceCount, 1);
  assert.equal(summary.handleReferenceCount, 1);
  assert.equal(summary.blockedRegionCount, 0);
  assert.equal(summary.currentGenerationSource, false);
  assert.equal(summary.v1BodyCutoutQaRemainsActive, true);
});

test("empty BODY REFERENCE v2 drafts stay warn-only as not configured scaffold data", () => {
  const validation = validateBodyReferenceV2Draft({
    sourceImageUrl: undefined,
    centerline: null,
    layers: [],
    blockedRegions: [],
    scaleCalibration: {
      scaleSource: "unknown",
    },
  });

  assert.equal(validation.status, "warn");
  assert.match(validation.warnings.join(" "), /not configured yet/i);
  assert.match(validation.warnings.join(" "), /lookup diameter is not configured/i);
});
