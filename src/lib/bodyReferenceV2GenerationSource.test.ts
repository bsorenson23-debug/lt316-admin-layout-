import assert from "node:assert/strict";
import test from "node:test";

import { hashJsonSha256Node } from "./hashSha256.node.ts";
import {
  createBodyReferenceV2Layer,
  createCenterlineAxis,
  type BodyReferenceV2Draft,
} from "./bodyReferenceV2Layers.ts";
import { createFinishBandReference } from "./productAppearanceReferenceLayers.ts";
import {
  buildBodyReferenceV2GenerationSource,
  buildBodyReferenceV2MirroredProfile,
  buildBodyReferenceV2SourceHashPayload,
  isBodyReferenceV2GenerationReady,
  summarizeBodyReferenceV2GenerationReadiness,
  validateBodyReferenceV2GenerationSource,
} from "./bodyReferenceV2GenerationSource.ts";

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
          { xPx: 84, yPx: 20 },
          { xPx: 78, yPx: 120 },
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
      expectedBodyHeightMm: 185,
      expectedBodyWidthMm: 88.9,
    },
    ...overrides,
  };
}

test("v2 generation source is not ready without a centerline", () => {
  const readiness = summarizeBodyReferenceV2GenerationReadiness(createDraft({
    centerline: null,
  }));

  assert.equal(readiness.ready, false);
  assert.equal(readiness.status, "fail");
  assert.match(readiness.errors.join(" "), /centerline is not captured/i);
  assert.equal(buildBodyReferenceV2GenerationSource(createDraft({ centerline: null })), null);
});

test("v2 generation source is not ready without a body-left outline", () => {
  const readiness = summarizeBodyReferenceV2GenerationReadiness(createDraft({
    layers: [],
  }));

  assert.equal(readiness.ready, false);
  assert.equal(readiness.status, "fail");
  assert.match(readiness.errors.join(" "), /body-left outline is not captured/i);
});

test("v2 generation source is not ready when body-left crosses the centerline", () => {
  const validation = validateBodyReferenceV2GenerationSource(createDraft({
    layers: [
      createBodyReferenceV2Layer({
        id: "body-left",
        kind: "body-left",
        points: [
          { xPx: 84, yPx: 20 },
          { xPx: 102, yPx: 120 },
          { xPx: 82, yPx: 205 },
        ],
      }),
    ],
  }));

  assert.equal(validation.status, "fail");
  assert.match(validation.errors.join(" "), /crosses the centerline/i);
});

test("v2 generation source is not ready with invalid scale calibration", () => {
  const readiness = summarizeBodyReferenceV2GenerationReadiness(createDraft({
    scaleCalibration: {
      scaleSource: "manual-diameter",
      resolvedDiameterMm: 88.9,
    },
  }));

  assert.equal(readiness.ready, false);
  assert.equal(readiness.status, "fail");
  assert.match(readiness.errors.join(" "), /lookup diameter/i);
});

test("v2 generation source is ready when centerline, body-left, and lookup scale are valid", () => {
  const draft = createDraft();
  const readiness = summarizeBodyReferenceV2GenerationReadiness(draft);
  const source = buildBodyReferenceV2GenerationSource(draft);

  assert.equal(readiness.ready, true);
  assert.equal(readiness.status, "pass");
  assert.equal(isBodyReferenceV2GenerationReady(draft), true);
  assert.ok(source);
  assert.equal(source?.sourceMode, "body-reference-v2");
  assert.equal(source?.wrapDiameterMm, 88.9);
  assert.equal(source?.wrapWidthMm, 279.2876);
  assert.equal(source?.blockedRegionCount, 0);
});

test("mirrored-right output and source-hash payload are deterministic", () => {
  const draft = createDraft();
  const first = buildBodyReferenceV2GenerationSource(draft);
  const second = buildBodyReferenceV2GenerationSource(draft);

  assert.ok(first);
  assert.ok(second);
  assert.deepEqual(first?.mirroredRightOutline, second?.mirroredRightOutline);
  assert.equal(
    hashJsonSha256Node(buildBodyReferenceV2SourceHashPayload(first!)),
    hashJsonSha256Node(buildBodyReferenceV2SourceHashPayload(second!)),
  );
});

test("v2 source hash changes when the captured centerline or body-left outline changes", () => {
  const baseSource = buildBodyReferenceV2GenerationSource(createDraft());
  const shiftedCenterlineSource = buildBodyReferenceV2GenerationSource(createDraft({
    centerline: createCenterlineAxis({
      id: "centerline",
      xPx: 104,
      topYPx: 10,
      bottomYPx: 210,
      source: "operator",
    }),
  }));
  const shiftedBodyLeftSource = buildBodyReferenceV2GenerationSource(createDraft({
    layers: [
      createBodyReferenceV2Layer({
        id: "body-left",
        kind: "body-left",
        points: [
          { xPx: 82, yPx: 20 },
          { xPx: 77, yPx: 120 },
          { xPx: 80, yPx: 205 },
        ],
      }),
    ],
  }));

  assert.ok(baseSource);
  assert.ok(shiftedCenterlineSource);
  assert.ok(shiftedBodyLeftSource);
  assert.notEqual(
    hashJsonSha256Node(buildBodyReferenceV2SourceHashPayload(baseSource!)),
    hashJsonSha256Node(buildBodyReferenceV2SourceHashPayload(shiftedCenterlineSource!)),
  );
  assert.notEqual(
    hashJsonSha256Node(buildBodyReferenceV2SourceHashPayload(baseSource!)),
    hashJsonSha256Node(buildBodyReferenceV2SourceHashPayload(shiftedBodyLeftSource!)),
  );
});

test("v2 mirrored profile uses diameter-derived uniform scalar for y-scale", () => {
  const source = buildBodyReferenceV2GenerationSource(createDraft({
    scaleCalibration: {
      scaleSource: "lookup-diameter",
      lookupDiameterMm: 88.9,
      resolvedDiameterMm: 88.9,
      wrapDiameterMm: 88.9,
      wrapWidthMm: 279.29,
      expectedBodyHeightMm: 220,
      expectedBodyWidthMm: 88.9,
    },
  }));

  assert.ok(source);
  const profile = buildBodyReferenceV2MirroredProfile(source!);
  const expectedHeight = Math.round(185 * source!.mmPerPx * 10000) / 10000;

  assert.equal(profile.bodyHeightMm, expectedHeight);
  assert.equal(profile.samples[0]?.yMm, 0);
  assert.equal(profile.samples.at(-1)?.yMm, expectedHeight);
  assert.notEqual(profile.bodyHeightMm, 220);
});

test("v2 mirrored profile ignores expected height as independent y-scale", () => {
  const source = buildBodyReferenceV2GenerationSource(createDraft({
    scaleCalibration: {
      scaleSource: "lookup-diameter",
      lookupDiameterMm: 88.9,
      resolvedDiameterMm: 88.9,
      wrapDiameterMm: 88.9,
      wrapWidthMm: 279.29,
      expectedBodyHeightMm: 185,
      expectedBodyWidthMm: 88.9,
    },
  }));

  assert.ok(source);
  const profile = buildBodyReferenceV2MirroredProfile(source!);

  assert.notEqual(profile.bodyHeightMm, 185);
  assert.equal(profile.bodyHeightMm, Math.round(185 * source!.mmPerPx * 10000) / 10000);
});

test("lid and handle reference layers stay excluded from the v2 body generation source", () => {
  const source = buildBodyReferenceV2GenerationSource(createDraft({
    layers: [
      createBodyReferenceV2Layer({
        id: "body-left",
        kind: "body-left",
        points: [
          { xPx: 84, yPx: 20 },
          { xPx: 78, yPx: 120 },
          { xPx: 82, yPx: 205 },
        ],
      }),
      createBodyReferenceV2Layer({
        id: "lid",
        kind: "lid-reference",
        points: [
          { xPx: 76, yPx: 6 },
          { xPx: 124, yPx: 6 },
          { xPx: 124, yPx: 18 },
          { xPx: 76, yPx: 18 },
        ],
      }),
      createBodyReferenceV2Layer({
        id: "handle",
        kind: "handle-reference",
        points: [
          { xPx: 118, yPx: 45 },
          { xPx: 138, yPx: 45 },
          { xPx: 138, yPx: 155 },
          { xPx: 118, yPx: 155 },
        ],
      }),
    ],
  }));

  assert.ok(source);
  const payloadText = JSON.stringify(source?.sourceHashPayload);
  assert.equal(source?.leftBodyOutline.length, 3);
  assert.equal(source?.mirroredRightOutline.length, 3);
  assert.equal(payloadText.includes("lid-reference"), false);
  assert.equal(payloadText.includes("handle-reference"), false);
});

test("ambiguous lookup dimension authority keeps v2 generation not ready", () => {
  const readiness = summarizeBodyReferenceV2GenerationReadiness(createDraft({
    scaleCalibration: {
      scaleSource: "unknown",
      lookupVariantLabel: "40 oz",
      lookupDimensionAuthority: "unknown",
      lookupScaleStatus: "fail",
      lookupWarnings: [
        "Lookup dimensions are ambiguous because the product page exposes multiple size or variant options and no exact selection was captured.",
      ],
      lookupErrors: [
        "Lookup dimensions are ambiguous because the product page exposes multiple size or variant options and no exact selection was captured.",
      ],
    },
  }));

  assert.equal(readiness.ready, false);
  assert.equal(readiness.status, "fail");
  assert.match(readiness.errors.join(" "), /ambiguous/i);
});

test("reference layers marked for BODY CUTOUT QA fail v2 generation readiness", () => {
  const validation = validateBodyReferenceV2GenerationSource(createDraft({
    layers: [
      createBodyReferenceV2Layer({
        id: "body-left",
        kind: "body-left",
        points: [
          { xPx: 84, yPx: 20 },
          { xPx: 78, yPx: 120 },
          { xPx: 82, yPx: 205 },
        ],
      }),
      createBodyReferenceV2Layer({
        id: "handle",
        kind: "handle-reference",
        includedInBodyCutoutQa: true,
      }),
    ],
  }));

  assert.equal(validation.status, "fail");
  assert.match(validation.errors.join(" "), /handle-reference must remain excluded from BODY CUTOUT QA/i);
});

test("product appearance layers and artwork placements are excluded from the v2 source payload", () => {
  const baseDraft = createDraft();
  const draftWithExtras = {
    ...createDraft(),
    appearanceReferenceLayers: [
      createFinishBandReference({
        id: "finish-band",
        kind: "top-finish-band",
        yMm: 0,
        heightMm: 10,
      }),
    ],
    artworkPlacements: [
      {
        id: "art-1",
        assetId: "asset-1",
        name: "Front logo",
      },
    ],
  } as BodyReferenceV2Draft;

  const baseSource = buildBodyReferenceV2GenerationSource(baseDraft);
  const extrasSource = buildBodyReferenceV2GenerationSource(draftWithExtras);

  assert.ok(baseSource);
  assert.ok(extrasSource);
  assert.equal(
    hashJsonSha256Node(buildBodyReferenceV2SourceHashPayload(baseSource!)),
    hashJsonSha256Node(buildBodyReferenceV2SourceHashPayload(extrasSource!)),
  );
});

test("engraving overlay preview descriptors are excluded from the v2 source payload", () => {
  const baseSource = buildBodyReferenceV2GenerationSource(createDraft());
  const draftWithOverlayPreview = {
    ...createDraft(),
    engravingOverlayPreview: [
      {
        id: "overlay-1",
        assetId: "asset-1",
        name: "Front logo",
        xMm: 12,
        yMm: 18,
        widthMm: 24,
        heightMm: 12,
        rotationDeg: 0,
        angleDeg: 90,
        bodyYMm: 40,
        normalizedWrapX: 0.25,
        normalizedBodyY: 0.2,
        materialToken: "engraving-preview-silver",
        visible: true,
        warnings: [],
        errors: [],
      },
    ],
  } as BodyReferenceV2Draft;
  const overlaySource = buildBodyReferenceV2GenerationSource(draftWithOverlayPreview);

  assert.ok(baseSource);
  assert.ok(overlaySource);
  assert.equal(
    hashJsonSha256Node(buildBodyReferenceV2SourceHashPayload(baseSource!)),
    hashJsonSha256Node(buildBodyReferenceV2SourceHashPayload(overlaySource!)),
  );
});

test("blocked regions can stop v2 generation readiness when they overlap the body-left outline", () => {
  const validation = validateBodyReferenceV2GenerationSource(createDraft({
    blockedRegions: [
      {
        id: "blocked-1",
        reason: "manual-mask",
        points: [
          { xPx: 76, yPx: 110 },
          { xPx: 92, yPx: 110 },
          { xPx: 92, yPx: 140 },
          { xPx: 76, yPx: 140 },
        ],
      },
    ],
  }));

  assert.equal(validation.status, "fail");
  assert.match(validation.errors.join(" "), /blocked region blocked-1 overlaps the body-left outline/i);
});

test("blocked region severity can warn without blocking generation readiness", () => {
  const draft = createDraft({
    blockedRegions: [
      {
        id: "blocked-1",
        reason: "manual-mask",
        points: [
          { xPx: 76, yPx: 110 },
          { xPx: 92, yPx: 110 },
          { xPx: 92, yPx: 140 },
          { xPx: 76, yPx: 140 },
        ],
      },
    ],
  });
  const validation = validateBodyReferenceV2GenerationSource(draft, {
    blockedOverlapSeverity: "warn",
  });
  const readiness = summarizeBodyReferenceV2GenerationReadiness(draft, {
    blockedOverlapSeverity: "warn",
  });

  assert.equal(validation.status, "warn");
  assert.equal(validation.errors.length, 0);
  assert.match(validation.warnings.join(" "), /blocked region blocked-1 overlaps the body-left outline/i);
  assert.equal(readiness.ready, true);
});

test("mirrored profile builds mm-space radii and height from the accepted v2 source", () => {
  const source = buildBodyReferenceV2GenerationSource(createDraft());
  assert.ok(source);

  const profile = buildBodyReferenceV2MirroredProfile(source!);

  assert.equal(profile.samples.length, 3);
  assert.ok(profile.bodyHeightMm > 180);
  assert.equal(profile.samples[0]?.radiusPx, 16);
  assert.ok((profile.samples[0]?.radiusMm ?? 0) > 14);
  assert.equal(profile.samples[0]?.xLeftPx, 84);
  assert.equal(profile.samples[0]?.xRightPx, 116);
});
