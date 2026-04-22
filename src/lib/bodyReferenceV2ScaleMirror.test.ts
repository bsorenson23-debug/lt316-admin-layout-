import assert from "node:assert/strict";
import test from "node:test";

import {
  createBodyReferenceV2Layer,
  createCenterlineAxis,
  type BodyReferenceV2Draft,
} from "./bodyReferenceV2Layers.ts";
import {
  buildMirroredBodyPreview,
  computeDiameterPxFromCenterlineToLeftWall,
  computeMmPerPxFromLookupDiameter,
  computeWrapWidthFromDiameter,
  mirrorLeftOutlineAcrossCenterline,
  summarizeBodyReferenceV2ScaleMirrorPreview,
  validateLookupDiameterScale,
  validateMirroredBodySymmetry,
} from "./bodyReferenceV2ScaleMirror.ts";

function createDraft(overrides: Partial<BodyReferenceV2Draft> = {}): BodyReferenceV2Draft {
  return {
    sourceImageUrl: "data:image/png;base64,body-reference-v2",
    centerline: createCenterlineAxis({
      id: "centerline",
      xPx: 100,
      topYPx: 10,
      bottomYPx: 210,
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

test("diameterPx doubles the centerline-to-left-wall distance", () => {
  const centerline = createCenterlineAxis({
    id: "centerline",
    xPx: 100,
    topYPx: 10,
    bottomYPx: 210,
    source: "operator",
  });
  const diameterPx = computeDiameterPxFromCenterlineToLeftWall(centerline, [
    { xPx: 78, yPx: 30 },
    { xPx: 82, yPx: 90 },
  ]);

  assert.equal(diameterPx, 44);
});

test("mmPerPx resolves from lookup diameter over diameterPx", () => {
  assert.equal(computeMmPerPxFromLookupDiameter(88.9, 44), 2.020455);
});

test("wrap width approximates PI times lookup diameter", () => {
  const wrapWidthMm = computeWrapWidthFromDiameter(88.9);

  assert.ok(wrapWidthMm);
  assert.ok(Math.abs(wrapWidthMm! - (Math.PI * 88.9)) < 0.0002);
});

test("mirrorLeftOutlineAcrossCenterline returns symmetric points on the right side", () => {
  const centerline = createCenterlineAxis({
    id: "centerline",
    xPx: 100,
    topYPx: 10,
    bottomYPx: 210,
    source: "operator",
  });
  const mirrored = mirrorLeftOutlineAcrossCenterline(centerline, [
    { xPx: 80, yPx: 20 },
    { xPx: 76, yPx: 120 },
    { xPx: 82, yPx: 205 },
  ]);

  assert.deepEqual(mirrored, [
    { xPx: 120, yPx: 20 },
    { xPx: 124, yPx: 120 },
    { xPx: 118, yPx: 205 },
  ]);
});

test("lookup diameter scale validation fails when body-left crosses the centerline", () => {
  const validation = validateLookupDiameterScale({
    centerline: createCenterlineAxis({
      id: "centerline",
      xPx: 100,
      topYPx: 10,
      bottomYPx: 210,
      source: "operator",
    }),
    bodyLeftLayer: createBodyReferenceV2Layer({
      id: "body-left",
      kind: "body-left",
      points: [
        { xPx: 82, yPx: 20 },
        { xPx: 104, yPx: 120 },
        { xPx: 80, yPx: 205 },
      ],
    }),
    scaleCalibration: {
      scaleSource: "lookup-diameter",
      lookupDiameterMm: 88.9,
    },
  });

  assert.equal(validation.status, "fail");
  assert.match(validation.errors.join(" "), /crosses the centerline/i);
});

test("mirrored-right remains derived read-only under existing v2 layer semantics", () => {
  const preview = buildMirroredBodyPreview(createDraft());
  const mirroredLayer = createBodyReferenceV2Layer({
    id: "body-right-mirrored",
    kind: "body-right-mirrored",
    points: preview.mirroredRightOutline,
  });

  assert.equal(mirroredLayer.editable, false);
  assert.equal(mirroredLayer.referenceOnly, false);
  assert.equal(mirroredLayer.includedInBodyCutoutQa, true);
});

test("missing centerline can warn or fail depending on helper options", () => {
  const warnPreview = buildMirroredBodyPreview(createDraft({
    centerline: null,
  }));
  const failPreview = buildMirroredBodyPreview(createDraft({
    centerline: null,
  }), {
    missingCenterlineSeverity: "fail",
  });

  assert.equal(warnPreview.status, "warn");
  assert.match(warnPreview.warnings.join(" "), /centerline is not captured/i);
  assert.equal(failPreview.status, "fail");
  assert.match(failPreview.errors.join(" "), /centerline is not captured/i);
});

test("missing lookup diameter can warn or fail depending on helper options", () => {
  const warnPreview = buildMirroredBodyPreview(createDraft({
    scaleCalibration: {
      scaleSource: "manual-diameter",
      resolvedDiameterMm: 88.9,
    },
  }));
  const failPreview = buildMirroredBodyPreview(createDraft({
    scaleCalibration: {
      scaleSource: "manual-diameter",
      resolvedDiameterMm: 88.9,
    },
  }), {
    missingLookupSeverity: "fail",
  });

  assert.equal(warnPreview.status, "warn");
  assert.match(warnPreview.warnings.join(" "), /lookup diameter is not configured/i);
  assert.equal(failPreview.status, "fail");
  assert.match(failPreview.errors.join(" "), /lookup diameter is not configured/i);
});

test("invalid mmPerPx fails validation", () => {
  const validation = validateLookupDiameterScale({
    centerline: createCenterlineAxis({
      id: "centerline",
      xPx: 100,
      topYPx: 10,
      bottomYPx: 210,
      source: "operator",
    }),
    bodyLeftLayer: createBodyReferenceV2Layer({
      id: "body-left",
      kind: "body-left",
      points: [
        { xPx: 80, yPx: 20 },
        { xPx: 76, yPx: 120 },
        { xPx: 82, yPx: 205 },
      ],
    }),
    scaleCalibration: {
      scaleSource: "lookup-diameter",
      lookupDiameterMm: 88.9,
      mmPerPx: Number.NaN,
    },
  });

  assert.equal(validation.status, "fail");
  assert.match(validation.errors.join(" "), /mmPerPx must be finite and positive/i);
});

test("lookup body height mismatch warns while mmPerPx still resolves from diameter only", () => {
  const preview = buildMirroredBodyPreview(createDraft({
    scaleCalibration: {
      scaleSource: "lookup-diameter",
      lookupDiameterMm: 88.9,
      lookupBodyHeightMm: 260,
      lookupFullProductHeightMm: 290,
      lookupHeightIgnoredForScale: true,
      expectedBodyHeightMm: 220,
    },
  }));

  assert.equal(preview.mmPerPx, 1.852083);
  assert.equal(preview.status, "warn");
  assert.match(preview.warnings.join(" "), /diameter remains the scale authority/i);
});

test("mirror preview is always marked as not current generation source", () => {
  const preview = summarizeBodyReferenceV2ScaleMirrorPreview(createDraft());

  assert.equal(preview.isCurrentGenerationSource, false);
});

test("lid, handle, blocked, and existing mirrored layers are ignored when building the derived mirror preview", () => {
  const preview = buildMirroredBodyPreview(createDraft({
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
        id: "body-right-existing",
        kind: "body-right-mirrored",
        points: [
          { xPx: 150, yPx: 20 },
          { xPx: 155, yPx: 120 },
          { xPx: 151, yPx: 205 },
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
      createBodyReferenceV2Layer({
        id: "blocked",
        kind: "blocked-region",
        points: [
          { xPx: 92, yPx: 40 },
          { xPx: 104, yPx: 40 },
          { xPx: 104, yPx: 58 },
          { xPx: 92, yPx: 58 },
        ],
      }),
    ],
  }));

  assert.equal(preview.leftBodyPointCount, 3);
  assert.equal(preview.mirroredRightPointCount, 3);
  assert.deepEqual(preview.mirroredRightOutline, [
    { xPx: 120, yPx: 20 },
    { xPx: 124, yPx: 120 },
    { xPx: 118, yPx: 205 },
  ]);
});

test("validateMirroredBodySymmetry passes for the derived symmetric outline", () => {
  const draft = createDraft();
  const preview = buildMirroredBodyPreview(draft);
  const bodyLeft = draft.layers.find((layer) => layer.kind === "body-left");
  const validation = validateMirroredBodySymmetry({
    centerline: draft.centerline,
    leftOutline: bodyLeft?.points,
    mirroredRightOutline: preview.mirroredRightOutline,
  });

  assert.equal(validation.status, "pass");
});
