import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPrintableSurfaceResolution,
  getPrintableSurfaceResolutionFromDimensions,
} from "./printableSurface.ts";

test("buildPrintableSurfaceResolution separates axial lid/ring bands from handle keep-out", () => {
  const resolution = buildPrintableSurfaceResolution({
    overallHeightMm: 297,
    bodyTopFromOverallMm: 30,
    bodyBottomFromOverallMm: 270,
    detection: {
      source: "photo-row-scan",
      lidSeamFromOverallMm: 36,
      rimRingBottomFromOverallMm: 49,
      confidence: 0.78,
    },
    handleKeepOutStartMm: 42,
    handleKeepOutEndMm: 128,
  });

  assert.equal(resolution.printableSurfaceContract.printableTopMm, 49);
  assert.equal(resolution.printableSurfaceContract.printableBottomMm, 270);
  assert.equal(resolution.printableSurfaceContract.printableHeightMm, 221);
  assert.deepEqual(
    resolution.printableSurfaceContract.axialExclusions.map((band) => band.kind),
    ["lid", "rim-ring"],
  );
  assert.equal(resolution.printableSurfaceContract.circumferentialExclusions[0]?.kind, "handle");
  assert.equal(resolution.topBoundarySource, "rim-ring");
});

test("getPrintableSurfaceResolutionFromDimensions preserves saved printable boundaries without live detection", () => {
  const resolution = getPrintableSurfaceResolutionFromDimensions({
    overallHeightMm: 297,
    bodyTopFromOverallMm: 30,
    bodyBottomFromOverallMm: 270,
    printableSurfaceContract: {
      printableTopMm: 48.5,
      printableBottomMm: 259,
      printableHeightMm: 210.5,
      axialExclusions: [
        { kind: "lid", startMm: 0, endMm: 35 },
        { kind: "rim-ring", startMm: 35, endMm: 48.5 },
        { kind: "base", startMm: 259, endMm: 270 },
      ],
      circumferentialExclusions: [
        { kind: "handle", startMm: 40, endMm: 126, wraps: false },
      ],
    },
  }, null);

  assert.ok(resolution);
  assert.equal(resolution?.printableSurfaceContract.printableTopMm, 48.5);
  assert.equal(resolution?.printableSurfaceContract.printableBottomMm, 259);
  assert.equal(resolution?.printableTopFromBodyTopMm, 18.5);
  assert.equal(resolution?.printableBottomFromBodyTopMm, 229);
});
