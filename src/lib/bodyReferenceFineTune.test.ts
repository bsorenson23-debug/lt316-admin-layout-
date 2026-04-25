import assert from "node:assert/strict";
import test from "node:test";

import type { EditableBodyOutline } from "../types/productTemplate.ts";
import type { TumblerItemLookupFitDebug } from "../types/tumblerItemLookup.ts";
import { buildBodyReferenceSvgQualityReportFromOutline } from "./bodyReferenceSvgQuality.ts";
import {
  buildOutlineGeometrySignature,
  cloneOutline,
  deleteFineTunePoint,
  hasFineTuneDraftChanges,
  insertFineTunePointOnSegment,
  nudgeOutlinePoint,
  resolveFineTuneGlbReviewState,
  resolveOutlineBounds,
  resolveOutlinePointCount,
  resolvePrimaryBodyReferenceVisualContour,
  resolveUiOnlyRimReferenceGuide,
} from "./bodyReferenceFineTune.ts";

function makeOutline(): EditableBodyOutline {
  return {
    closed: true,
    version: 1,
    sourceContourMode: "body-only",
    points: [
      { id: "p1", x: 10, y: 10, role: "topOuter", pointType: "corner", inHandle: null, outHandle: null },
      { id: "p2", x: 40, y: 10, role: "body", pointType: "corner", inHandle: null, outHandle: null },
      { id: "p3", x: 40, y: 60, role: "base", pointType: "corner", inHandle: null, outHandle: null },
      { id: "p4", x: 10, y: 60, role: "bevel", pointType: "corner", inHandle: null, outHandle: null },
    ],
    directContour: [
      { x: 10, y: 10 },
      { x: 40, y: 10 },
      { x: 40, y: 60 },
      { x: 10, y: 60 },
      { x: 10, y: 10 },
    ],
    sourceContour: [
      { x: 100, y: 20 },
      { x: 180, y: 20 },
      { x: 180, y: 200 },
      { x: 100, y: 200 },
      { x: 100, y: 20 },
    ],
  };
}

function makeManualOutlineWithStaleContour(): EditableBodyOutline {
  return {
    closed: true,
    version: 1,
    sourceContourMode: "body-only",
    points: [
      { id: "p1", x: 54, y: 30, role: "topOuter", pointType: "corner", inHandle: null, outHandle: null },
      { id: "p2", x: 54, y: 80, role: "body", pointType: "smooth", inHandle: null, outHandle: null },
      { id: "p3", x: 50, y: 180, role: "shoulder", pointType: "smooth", inHandle: null, outHandle: null },
      { id: "p4", x: 50, y: 250, role: "base", pointType: "corner", inHandle: null, outHandle: null },
    ],
    directContour: [
      { x: 50, y: 30 },
      { x: 50, y: 80 },
      { x: 50, y: 180 },
      { x: 50, y: 250 },
      { x: -50, y: 250 },
      { x: -50, y: 180 },
      { x: -50, y: 80 },
      { x: -50, y: 30 },
    ],
  };
}

function makeFitDebug(overrides: Partial<TumblerItemLookupFitDebug> = {}): TumblerItemLookupFitDebug {
  return {
    kind: "lathe-body-fit",
    sourceImageUrl: "https://example.test/source.png",
    imageWidthPx: 600,
    imageHeightPx: 700,
    silhouetteBoundsPx: { minX: 120, minY: 40, maxX: 480, maxY: 660 },
    centerXPx: 300,
    fullTopPx: 40,
    fullBottomPx: 660,
    bodyTopPx: 220,
    bodyBottomPx: 635,
    rimTopPx: 165,
    rimBottomPx: 210,
    referenceBandTopPx: 224,
    referenceBandBottomPx: 238,
    referenceBandCenterYPx: 231,
    referenceBandWidthPx: 169,
    maxCenterWidthPx: 191,
    referenceHalfWidthPx: 84.5,
    fitScore: 8.9,
    profilePoints: [],
    ...overrides,
  };
}

test("moving a point changes signature and bounds", () => {
  const approved = makeOutline();
  const draft = cloneOutline(approved)!;
  draft.points[1]!.x += 5;
  draft.directContour![1]!.x += 5;

  assert.notEqual(buildOutlineGeometrySignature(approved), buildOutlineGeometrySignature(draft));
  assert.equal(hasFineTuneDraftChanges({ approved, draft }), true);

  const approvedBounds = resolveOutlineBounds(approved);
  const draftBounds = resolveOutlineBounds(draft);
  assert.ok(approvedBounds);
  assert.ok(draftBounds);
  assert.equal(approvedBounds!.width, 30);
  assert.equal(draftBounds!.width, 35);
});

test("primary review outline prefers approved direct contour over sparse edit controls", () => {
  const outline = makeOutline();
  outline.points = [
    { id: "top", x: 44.5, y: 40, role: "topOuter", pointType: "corner", inHandle: null, outHandle: null },
    { id: "body", x: 44.5, y: 80, role: "body", pointType: "corner", inHandle: null, outHandle: null },
    { id: "base", x: 42, y: 175, role: "base", pointType: "corner", inHandle: null, outHandle: null },
  ];
  outline.directContour = [
    { x: -44.45, y: 25 },
    { x: 44.45, y: 25 },
    { x: 44.45, y: 120 },
    { x: 41, y: 224.8 },
    { x: -41, y: 224.8 },
    { x: -44.45, y: 120 },
  ];

  const visual = resolvePrimaryBodyReferenceVisualContour(outline);

  assert.ok(visual);
  assert.equal(visual!.source, "direct-contour");
  assert.equal(visual!.topGuideY, 25);
  assert.equal(visual!.bounds.height, 199.8);
  assert.equal(visual!.points.length, outline.directContour.length);
});

test("printable band metadata cannot replace approved SVG visual authority", () => {
  const outline = makeOutline();
  outline.printableBandContourBounds = {
    minX: -44.45,
    minY: 50,
    maxX: 44.45,
    maxY: 175,
    width: 88.9,
    height: 125,
  };
  outline.printableBandContour = [
    { x: -44.45, y: 50 },
    { x: 44.45, y: 50 },
    { x: 44.45, y: 175 },
    { x: -44.45, y: 175 },
  ];
  outline.directContour = [
    { x: -44.45, y: 25 },
    { x: 44.45, y: 25 },
    { x: 44.45, y: 224.8 },
    { x: -44.45, y: 224.8 },
  ];

  const visual = resolvePrimaryBodyReferenceVisualContour(outline);

  assert.ok(visual);
  assert.equal(visual!.source, "direct-contour");
  assert.equal(visual!.topGuideY, 25);
  assert.equal(visual!.bounds.minY, 25);
  assert.equal(visual!.bounds.maxY, 224.8);
});

test("rim reference guide is visual-only and does not expand body-only contour authority", () => {
  const outline = makeOutline();
  outline.sourceContourMode = "body-only";
  outline.sourceContourBounds = {
    minX: 215,
    minY: 220,
    maxX: 384,
    maxY: 635,
    width: 169,
    height: 415,
  };
  outline.sourceContourViewport = {
    minX: 0,
    minY: 0,
    width: 600,
    height: 700,
  };
  outline.directContour = [
    { x: -44.45, y: 25 },
    { x: 44.45, y: 25 },
    { x: 44.45, y: 243.29 },
    { x: -44.45, y: 243.29 },
  ];
  const beforeSignature = buildOutlineGeometrySignature(outline);
  const beforeQuality = buildBodyReferenceSvgQualityReportFromOutline({ outline });

  const guide = resolveUiOnlyRimReferenceGuide({
    outline,
    fitDebug: makeFitDebug({ rimBottomPx: 210 }),
  });
  const visual = resolvePrimaryBodyReferenceVisualContour(outline);

  assert.ok(guide);
  assert.ok(visual);
  assert.equal(guide!.source, "rim-reference-ui-only");
  assert.equal(guide!.authority, "visual-only");
  assert.equal(guide!.excludedFromBodyCutout, true);
  assert.equal(guide!.affectsSourceHash, false);
  assert.equal(guide!.affectsGlbInput, false);
  assert.equal(guide!.affectsWrapExport, false);
  assert.equal(guide!.affectsV2Authority, false);
  assert.equal(guide!.sourceField, "fitDebug.rimBottomPx");
  assert.ok(guide!.y < visual!.bounds.minY);
  assert.equal(visual!.bounds.minY, 25);
  assert.equal(visual!.bounds.height, 218.29);
  assert.equal(buildOutlineGeometrySignature(outline), beforeSignature);
  assert.deepEqual(buildBodyReferenceSvgQualityReportFromOutline({ outline }), beforeQuality);
});

test("printable top cannot create the rim reference guide or top-band body geometry", () => {
  const outline = makeOutline();
  outline.printableBandContourBounds = {
    minX: -44.45,
    minY: 25,
    maxX: 44.45,
    maxY: 175,
    width: 88.9,
    height: 150,
  };
  outline.directContour = [
    { x: -44.45, y: 25 },
    { x: 44.45, y: 25 },
    { x: 44.45, y: 243.29 },
    { x: -44.45, y: 243.29 },
  ];

  const guide = resolveUiOnlyRimReferenceGuide({ outline, fitDebug: null });
  const visual = resolvePrimaryBodyReferenceVisualContour(outline);

  assert.equal(guide, null);
  assert.ok(visual);
  assert.equal(visual!.source, "direct-contour");
  assert.equal(visual!.bounds.minY, 25);
  assert.equal(visual!.bounds.maxY, 243.29);
});

test("point count falls back to the effective point-derived contour when cached geometry is sparse", () => {
  const approved = makeOutline();
  const draftAdded = cloneOutline(approved)!;
  draftAdded.points.push({
    id: "p5",
    x: 25,
    y: 35,
    role: "custom",
    pointType: "smooth",
    inHandle: null,
    outHandle: null,
  });
  draftAdded.directContour?.splice(2, 0, { x: 25, y: 35 });

  assert.equal(resolveOutlinePointCount(approved), 5);
  assert.equal(resolveOutlinePointCount(draftAdded), 6);

  const draftRemoved = cloneOutline(draftAdded)!;
  draftRemoved.directContour = draftRemoved.directContour?.slice(0, 2);
  assert.ok(resolveOutlinePointCount(draftRemoved) > draftAdded.points.length);
});

test("too-few contour points fails svg quality", () => {
  const sparse = makeOutline();
  sparse.directContour = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
  const report = buildBodyReferenceSvgQualityReportFromOutline({ outline: sparse, label: "sparse" });
  assert.equal(report.status, "fail");
});

test("resetting draft to approved clears change state", () => {
  const approved = makeOutline();
  const draft = cloneOutline(approved)!;
  draft.points[0]!.x += 12;
  draft.directContour![0]!.x += 12;
  assert.equal(hasFineTuneDraftChanges({ approved, draft }), true);

  const resetDraft = cloneOutline(approved)!;
  assert.equal(hasFineTuneDraftChanges({ approved, draft: resetDraft }), false);
});

test("draft edits do not mutate approved until accepted", () => {
  const approved = makeOutline();
  const originalApprovedSignature = buildOutlineGeometrySignature(approved);
  const draft = cloneOutline(approved)!;
  draft.points[2]!.y += 9;
  draft.directContour![2]!.y += 9;

  assert.equal(buildOutlineGeometrySignature(approved), originalApprovedSignature);

  const accepted = cloneOutline(draft)!;
  assert.notEqual(buildOutlineGeometrySignature(accepted), originalApprovedSignature);
});

test("nudge updates only the draft contour", () => {
  const approved = makeOutline();
  const draft = cloneOutline(approved)!;
  const nudged = nudgeOutlinePoint({
    outline: draft,
    pointId: "p2",
    deltaX: 4,
    deltaY: 0,
    overallHeightMm: 120,
  });

  assert.ok(nudged);
  assert.equal(approved.points[1]!.x, 40);
  assert.equal(nudged!.points.find((point) => point.id === "p2")?.x, 44);
  assert.equal(hasFineTuneDraftChanges({ approved, draft: nudged }), true);
});

test("shift-sized nudges use the larger step", () => {
  const outline = makeOutline();
  const nudged = nudgeOutlinePoint({
    outline,
    pointId: "p3",
    deltaX: 0,
    deltaY: 5,
    overallHeightMm: 120,
  });

  assert.ok(nudged);
  assert.equal(nudged!.points.find((point) => point.id === "p3")?.y, 65);
});

test("adding a point on a segment changes the draft geometry", () => {
  const outline = makeOutline();
  const inserted = insertFineTunePointOnSegment({
    outline,
    segmentIndex: 1,
  });

  assert.ok(inserted);
  assert.equal(inserted!.points.length, 5);
  assert.notEqual(buildOutlineGeometrySignature(outline), buildOutlineGeometrySignature(inserted));
});

test("deleting a selected point removes it from the draft only", () => {
  const approved = makeOutline();
  const inserted = insertFineTunePointOnSegment({
    outline: cloneOutline(approved)!,
    segmentIndex: 1,
  });
  assert.ok(inserted);
  const insertedPointId = inserted!.points.find((point) => point.role === "custom")?.id;
  assert.ok(insertedPointId);

  const deleted = deleteFineTunePoint({
    outline: inserted,
    pointId: insertedPointId!,
  });

  assert.ok(deleted);
  assert.equal(deleted!.points.length, approved.points.length);
  assert.equal(approved.points.length, 4);
});

test("stale cached contour does not override saved manual outline authority", () => {
  const staleApproved = makeManualOutlineWithStaleContour();
  const rebuiltApproved = cloneOutline(staleApproved)!;
  rebuiltApproved.directContour = [
    { x: 54, y: 30 },
    { x: 54, y: 80 },
    { x: 50, y: 180 },
    { x: 50, y: 250 },
    { x: -50, y: 250 },
    { x: -50, y: 180 },
    { x: -54, y: 80 },
    { x: -54, y: 30 },
  ];

  assert.equal(
    buildOutlineGeometrySignature(staleApproved),
    buildOutlineGeometrySignature(rebuiltApproved),
  );
  assert.equal(hasFineTuneDraftChanges({ approved: staleApproved, draft: rebuiltApproved }), false);
  assert.equal(resolveOutlineBounds(staleApproved)?.width, 108);
});

test("accepted source edit marks generated glb stale", () => {
  const reviewState = resolveFineTuneGlbReviewState({
    canGenerate: true,
    hasGeneratedArtifact: true,
    currentSourceSignature: "current-v2",
    generatedSourceSignature: "current-v1",
    hasPendingSourceDraft: false,
  });
  assert.equal(reviewState.status, "stale");
  assert.equal(reviewState.canRequestGeneration, true);
});

test("pending draft blocks generation until accepted", () => {
  const reviewState = resolveFineTuneGlbReviewState({
    canGenerate: true,
    hasGeneratedArtifact: true,
    currentSourceSignature: "same",
    generatedSourceSignature: "same",
    hasPendingSourceDraft: true,
  });
  assert.equal(reviewState.status, "draft-pending");
  assert.equal(reviewState.canRequestGeneration, false);
});

test("regenerated reviewed glb becomes fresh again after acceptance", () => {
  const reviewState = resolveFineTuneGlbReviewState({
    canGenerate: true,
    hasGeneratedArtifact: true,
    currentSourceSignature: "accepted-v2",
    generatedSourceSignature: "accepted-v2",
    hasPendingSourceDraft: false,
  });

  assert.equal(reviewState.status, "current");
  assert.equal(reviewState.canRequestGeneration, true);
});
