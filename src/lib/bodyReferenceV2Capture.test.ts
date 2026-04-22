import assert from "node:assert/strict";
import test from "node:test";

import type { EditableBodyOutline } from "../types/productTemplate.ts";
import {
  acceptBodyReferenceV2Draft,
  addBlockedRegion,
  buildBodyReferenceV2GenerationReadinessFromDraft,
  createEmptyBodyReferenceV2Draft,
  removeBlockedRegion,
  resetBodyReferenceV2Draft,
  seedBodyLeftOutlineFromApprovedBodyOutline,
  seedCenterlineFromApprovedBodyOutline,
  setBodyLeftOutline,
  setCenterlineAxis,
  setReferenceLayer,
  summarizeBodyReferenceV2CaptureReadiness,
} from "./bodyReferenceV2Capture.ts";
import { createCenterlineAxis, type BodyReferenceV2Draft } from "./bodyReferenceV2Layers.ts";

function createOutline(): EditableBodyOutline {
  return {
    version: 1,
    closed: false,
    points: [
      { id: "top", x: 42, y: 12, pointType: "corner", role: "topOuter" },
      { id: "mid", x: 44, y: 96, pointType: "smooth", role: "body" },
      { id: "bottom", x: 38, y: 188, pointType: "corner", role: "base" },
    ],
    sourceContourMode: "body-only",
  };
}

function createDraft(overrides: Partial<BodyReferenceV2Draft> = {}): BodyReferenceV2Draft {
  return {
    sourceImageUrl: "data:image/png;base64,v2",
    centerline: createCenterlineAxis({
      id: "centerline",
      xPx: 0,
      topYPx: 12,
      bottomYPx: 188,
      source: "operator",
    }),
    layers: [
      {
        id: "body-left",
        kind: "body-left",
        points: [
          { xPx: -42, yPx: 12 },
          { xPx: -44, yPx: 96 },
          { xPx: -38, yPx: 188 },
        ],
        closed: false,
        editable: true,
        visible: true,
        referenceOnly: false,
        includedInBodyCutoutQa: true,
      },
    ],
    blockedRegions: [],
    scaleCalibration: {
      scaleSource: "lookup-diameter",
      lookupDiameterMm: 88,
      resolvedDiameterMm: 88,
      wrapDiameterMm: 88,
      wrapWidthMm: Math.PI * 88,
      expectedBodyHeightMm: 176,
      expectedBodyWidthMm: 88,
    },
    ...overrides,
  };
}

test("createEmptyBodyReferenceV2Draft returns an empty scaffold", () => {
  const draft = createEmptyBodyReferenceV2Draft({
    sourceImageUrl: "data:image/png;base64,empty",
    scaleCalibration: {
      scaleSource: "unknown",
    },
  });

  assert.equal(draft.sourceImageUrl, "data:image/png;base64,empty");
  assert.equal(draft.centerline, null);
  assert.deepEqual(draft.layers, []);
  assert.deepEqual(draft.blockedRegions, []);
  assert.equal(draft.scaleCalibration.scaleSource, "unknown");
});

test("seed helpers build operator-friendly centerline and body-left geometry from the approved contour", () => {
  const outline = createOutline();
  const centerline = seedCenterlineFromApprovedBodyOutline(outline);
  const bodyLeft = seedBodyLeftOutlineFromApprovedBodyOutline(outline);

  assert.ok(centerline);
  assert.equal(centerline?.xPx, 0);
  assert.equal(centerline?.topYPx, 12);
  assert.equal(centerline?.bottomYPx, 188);
  assert.deepEqual(bodyLeft, [
    { xPx: -42, yPx: 12 },
    { xPx: -44, yPx: 96 },
    { xPx: -38, yPx: 188 },
  ]);
  assert.equal(outline.points[0]?.x, 42);
  assert.equal(outline.points[1]?.x, 44);
});

test("setCenterlineAxis and setBodyLeftOutline update the draft without mutating the source outline", () => {
  const outline = createOutline();
  const seedPoints = seedBodyLeftOutlineFromApprovedBodyOutline(outline);
  const draft = createEmptyBodyReferenceV2Draft({
    scaleCalibration: {
      scaleSource: "lookup-diameter",
      lookupDiameterMm: 88,
      wrapWidthMm: Math.PI * 88,
    },
  });

  const withCenterline = setCenterlineAxis(
    draft,
    seedCenterlineFromApprovedBodyOutline(outline),
  );
  const withBodyLeft = setBodyLeftOutline(withCenterline, seedPoints);

  assert.equal(withBodyLeft.centerline?.xPx, 0);
  assert.equal(withBodyLeft.layers.find((layer) => layer.kind === "body-left")?.points.length, 3);
  assert.equal(withBodyLeft.layers.find((layer) => layer.kind === "body-right-mirrored")?.editable, false);
  assert.equal(outline.points[0]?.x, 42);
});

test("setReferenceLayer keeps lid and handle capture data reference-only", () => {
  const withLid = setReferenceLayer(createDraft(), {
    kind: "lid-reference",
    points: [
      { xPx: -48, yPx: 0 },
      { xPx: 48, yPx: 0 },
      { xPx: 48, yPx: 10 },
      { xPx: -48, yPx: 10 },
    ],
  });

  const lidLayer = withLid.layers.find((layer) => layer.kind === "lid-reference");
  assert.ok(lidLayer);
  assert.equal(lidLayer?.referenceOnly, true);
  assert.equal(lidLayer?.includedInBodyCutoutQa, false);
});

test("acceptBodyReferenceV2Draft clones the accepted state and reset can restore it", () => {
  const accepted = acceptBodyReferenceV2Draft(createDraft());
  const edited = setCenterlineAxis(accepted, createCenterlineAxis({
    id: "centerline",
    xPx: 3,
    topYPx: 12,
    bottomYPx: 188,
    source: "operator",
  }));
  const reset = resetBodyReferenceV2Draft({
    sourceImageUrl: accepted.sourceImageUrl,
    scaleCalibration: accepted.scaleCalibration,
    acceptedDraft: accepted,
  });

  assert.equal(accepted.centerline?.xPx, 0);
  assert.equal(edited.centerline?.xPx, 3);
  assert.equal(reset.centerline?.xPx, 0);
});

test("addBlockedRegion and removeBlockedRegion manage blocked-region capture state", () => {
  const draft = createDraft();
  const withRegion = addBlockedRegion(draft, {
    id: "blocked-1",
    reason: "manual-mask",
    points: [
      { xPx: -50, yPx: 80 },
      { xPx: -30, yPx: 80 },
      { xPx: -30, yPx: 110 },
      { xPx: -50, yPx: 110 },
    ],
  });
  const removed = removeBlockedRegion(withRegion, "blocked-1");

  assert.equal(withRegion.blockedRegions.length, 1);
  assert.equal(removed.blockedRegions.length, 0);
});

test("generation readiness fails when centerline is missing", () => {
  const readiness = buildBodyReferenceV2GenerationReadinessFromDraft(createDraft({
    centerline: null,
  }));

  assert.equal(readiness.ready, false);
  assert.match(readiness.errors.join(" "), /centerline/i);
});

test("generation readiness fails when body-left is missing", () => {
  const readiness = buildBodyReferenceV2GenerationReadinessFromDraft(createDraft({
    layers: [],
  }));

  assert.equal(readiness.ready, false);
  assert.match(readiness.errors.join(" "), /body-left outline is not captured/i);
});

test("generation readiness fails when body-left crosses the centerline", () => {
  const readiness = buildBodyReferenceV2GenerationReadinessFromDraft(createDraft({
    layers: [
      {
        id: "body-left",
        kind: "body-left",
        points: [
          { xPx: -42, yPx: 12 },
          { xPx: 2, yPx: 96 },
          { xPx: -38, yPx: 188 },
        ],
        closed: false,
        editable: true,
        visible: true,
        referenceOnly: false,
        includedInBodyCutoutQa: true,
      },
    ],
  }));

  assert.equal(readiness.ready, false);
  assert.match(readiness.errors.join(" "), /crosses the centerline/i);
});

test("generation readiness fails when lookup diameter authority is invalid", () => {
  const readiness = buildBodyReferenceV2GenerationReadinessFromDraft(createDraft({
    scaleCalibration: {
      scaleSource: "unknown",
      wrapWidthMm: Math.PI * 88,
    },
  }));

  assert.equal(readiness.ready, false);
  assert.match(readiness.errors.join(" "), /lookup diameter/i);
});

test("generation readiness passes with valid centerline, body-left, and lookup scale", () => {
  const readiness = buildBodyReferenceV2GenerationReadinessFromDraft(createDraft());

  assert.equal(readiness.ready, true);
  assert.equal(readiness.status, "pass");
});

test("blocked regions surface readiness failures when they overlap the body-left outline", () => {
  const readiness = buildBodyReferenceV2GenerationReadinessFromDraft(addBlockedRegion(createDraft(), {
    id: "blocked-1",
    reason: "handle-overlap",
    points: [
      { xPx: -46, yPx: 80 },
      { xPx: -20, yPx: 80 },
      { xPx: -20, yPx: 110 },
      { xPx: -46, yPx: 110 },
    ],
  }));

  assert.equal(readiness.ready, false);
  assert.match(readiness.errors.join(" "), /blocked region blocked-1 overlaps/i);
});

test("capture readiness keeps v2 generation disabled until an accepted ready draft exists", () => {
  const readyDraft = createDraft();
  const unaccepted = summarizeBodyReferenceV2CaptureReadiness({
    draft: readyDraft,
    acceptedDraft: null,
  });
  const accepted = acceptBodyReferenceV2Draft(readyDraft);
  const acceptedSummary = summarizeBodyReferenceV2CaptureReadiness({
    draft: accepted,
    acceptedDraft: accepted,
  });
  const edited = setCenterlineAxis(accepted, createCenterlineAxis({
    id: "centerline",
    xPx: 2,
    topYPx: 12,
    bottomYPx: 188,
    source: "operator",
  }));
  const pendingSummary = summarizeBodyReferenceV2CaptureReadiness({
    draft: edited,
    acceptedDraft: accepted,
  });

  assert.equal(unaccepted.generationReady, false);
  assert.match(unaccepted.warnings.join(" "), /not accepted yet/i);
  assert.equal(acceptedSummary.accepted, true);
  assert.equal(acceptedSummary.generationReady, true);
  assert.equal(pendingSummary.generationReady, false);
  assert.equal(pendingSummary.hasDraftChanges, true);
  assert.match(pendingSummary.warnings.join(" "), /pending acceptance/i);
});
