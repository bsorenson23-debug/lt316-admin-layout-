import assert from "node:assert/strict";
import test from "node:test";

import type { EditableBodyOutline } from "../types/productTemplate.ts";
import type { TumblerItemLookupFitDebug } from "../types/tumblerItemLookup.ts";
import {
  mapBodyReferenceGuideFrameToDisplayedImage,
  mapRawImageBoundsToDisplayedImage,
  resolveBodyReferenceGuideFrame,
  resolveContainedImageBounds,
} from "./bodyReferenceGuideFrame.ts";

function createFitDebug(overrides: Partial<TumblerItemLookupFitDebug> = {}): TumblerItemLookupFitDebug {
  return {
    kind: "lathe-body-fit",
    sourceImageUrl: "https://example.test/tumbler.png",
    imageWidthPx: 500,
    imageHeightPx: 700,
    silhouetteBoundsPx: { minX: 110, minY: 20, maxX: 390, maxY: 660 },
    centerXPx: 250,
    fullTopPx: 20,
    fullBottomPx: 660,
    bodyTopPx: 170,
    bodyBottomPx: 620,
    rimTopPx: 120,
    rimBottomPx: 168,
    referenceBandTopPx: 176,
    referenceBandBottomPx: 226,
    referenceBandCenterYPx: 201,
    referenceBandWidthPx: 180,
    maxCenterWidthPx: 260,
    referenceHalfWidthPx: 90,
    fitScore: 8.4,
    profilePoints: [
      { yPx: 182, yMm: 25, radiusPx: 89, radiusMm: 44.5 },
      { yPx: 620, yMm: 175, radiusPx: 70, radiusMm: 35 },
    ],
    ...overrides,
  };
}

function createAcceptedOutline(): EditableBodyOutline {
  return {
    closed: true,
    version: 1,
    points: [
      { id: "top", x: 44.5, y: 25, pointType: "corner", role: "topOuter" },
      { id: "base", x: 35, y: 175, pointType: "corner", role: "base" },
    ],
    directContour: [
      { x: 44.5, y: 25 },
      { x: 35, y: 175 },
      { x: -35, y: 175 },
      { x: -44.5, y: 25 },
    ],
    sourceContourBounds: {
      minX: 160,
      minY: 180,
      maxX: 340,
      maxY: 630,
      width: 180,
      height: 450,
    },
    sourceContourViewport: {
      minX: 0,
      minY: 0,
      width: 500,
      height: 700,
    },
    sourceContourMode: "body-only",
  };
}

test("referenceBand fields beat silhouette bounds", () => {
  const frame = resolveBodyReferenceGuideFrame({
    fitDebug: createFitDebug(),
  });

  assert.equal(frame.guideSource, "fit-debug-reference-band");
  assert.equal(frame.coordinateSpace, "raw-image-px");
  assert.equal(frame.rawImageBounds?.top, 176);
  assert.equal(frame.rawImageBounds?.bottom, 226);
  assert.equal(frame.rawImageBounds?.width, 180);
  assert.notEqual(frame.rawImageBounds?.top, 20);
});

test("accepted BODY REFERENCE contour beats fitDebug", () => {
  const frame = resolveBodyReferenceGuideFrame({
    acceptedBodyReferenceOutline: createAcceptedOutline(),
    acceptedSourceHash: "accepted-a",
    fitDebug: createFitDebug(),
  });

  assert.equal(frame.guideSource, "accepted-body-reference");
  assert.equal(frame.sourceHash, "accepted-a");
  assert.equal(frame.rawImageBounds?.top, 180);
  assert.equal(frame.rawImageBounds?.bottom, 630);
  assert.equal(frame.rawImageBounds?.width, 180);
});

test("fullTop and fullBottom are not body guide authority when referenceBand exists", () => {
  const frame = resolveBodyReferenceGuideFrame({
    fitDebug: createFitDebug({
      fullTopPx: 1,
      fullBottomPx: 699,
      referenceBandTopPx: 190,
      referenceBandBottomPx: 220,
      referenceBandCenterYPx: 205,
      referenceBandWidthPx: 164,
    }),
  });

  assert.equal(frame.guideSource, "fit-debug-reference-band");
  assert.equal(frame.rawImageBounds?.top, 190);
  assert.equal(frame.rawImageBounds?.bottom, 220);
  assert.notEqual(frame.rawImageBounds?.top, 1);
  assert.notEqual(frame.rawImageBounds?.bottom, 699);
});

test("missing referenceBand falls back with a visible warning", () => {
  const frame = resolveBodyReferenceGuideFrame({
    fitDebug: createFitDebug({
      referenceBandTopPx: Number.NaN,
      referenceBandBottomPx: Number.NaN,
      referenceBandWidthPx: Number.NaN,
    }),
  });

  assert.equal(frame.guideSource, "body-band");
  assert.match(frame.warnings.join(" "), /reference band is missing/i);
  assert.equal(frame.rawImageBounds?.top, 170);
  assert.equal(frame.rawImageBounds?.bottom, 620);
});

test("raw image pixels map to displayed DOM pixels", () => {
  const mapped = mapRawImageBoundsToDisplayedImage({
    rawImageBounds: {
      left: 100,
      top: 50,
      right: 300,
      bottom: 150,
      width: 200,
      height: 100,
      centerX: 200,
      centerY: 100,
    },
    rawImageSize: { width: 500, height: 250 },
    displayedImageBounds: { left: 20, top: 30, width: 1000, height: 500 },
  });

  assert.equal(mapped?.left, 220);
  assert.equal(mapped?.top, 130);
  assert.equal(mapped?.width, 400);
  assert.equal(mapped?.height, 200);
});

test("contain image bounds include letterbox offsets", () => {
  const displayed = resolveContainedImageBounds({
    naturalSize: { width: 1000, height: 500 },
    containerBounds: { left: 0, top: 0, width: 400, height: 400 },
  });

  assert.equal(displayed?.left, 0);
  assert.equal(displayed?.top, 100);
  assert.equal(displayed?.width, 400);
  assert.equal(displayed?.height, 200);
});

test("mapping a guide frame preserves source-hash stale state", () => {
  const frame = resolveBodyReferenceGuideFrame({
    acceptedBodyReferenceOutline: createAcceptedOutline(),
    acceptedSourceHash: "accepted-new",
    generatedSourceHash: "generated-old",
    fitDebug: createFitDebug(),
  });
  const mapped = mapBodyReferenceGuideFrameToDisplayedImage(frame, {
    left: 10,
    top: 20,
    width: 1000,
    height: 1400,
  });

  assert.equal(frame.freshRelativeToGeneratedSource, false);
  assert.equal(mapped?.freshRelativeToGeneratedSource, false);
  assert.match(mapped?.warnings.join(" "), /differs from the generated GLB source hash/i);
});

test("guide frame resolution is UI-only and does not mutate inputs", () => {
  const outline = createAcceptedOutline();
  const before = JSON.stringify(outline);

  const frame = resolveBodyReferenceGuideFrame({
    acceptedBodyReferenceOutline: outline,
    acceptedSourceHash: "same",
    generatedSourceHash: "same",
    fitDebug: createFitDebug(),
  });

  assert.equal(JSON.stringify(outline), before);
  assert.equal(frame.freshRelativeToGeneratedSource, true);
});
