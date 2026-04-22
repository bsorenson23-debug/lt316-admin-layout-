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
