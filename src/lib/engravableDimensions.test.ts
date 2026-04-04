import assert from "node:assert/strict";
import test from "node:test";

import { deriveEngravableZoneFromFitDebug } from "./engravableDimensions.ts";
import type { TumblerItemLookupFitDebug } from "../types/tumblerItemLookup.ts";

function createFitDebug(): TumblerItemLookupFitDebug {
  return {
    kind: "lathe-body-fit",
    sourceImageUrl: "https://example.com/tumbler.jpg",
    imageWidthPx: 800,
    imageHeightPx: 1000,
    silhouetteBoundsPx: { minX: 120, minY: 0, maxX: 680, maxY: 999 },
    centerXPx: 400,
    fullTopPx: 0,
    fullBottomPx: 199,
    bodyTopPx: 20,
    bodyBottomPx: 170,
    rimTopPx: 0,
    rimBottomPx: 19,
    referenceBandTopPx: 70,
    referenceBandBottomPx: 95,
    referenceBandCenterYPx: 82,
    referenceBandWidthPx: 220,
    maxCenterWidthPx: 220,
    referenceHalfWidthPx: 110,
    fitScore: 0.94,
    profilePoints: [
      { yPx: 20, yMm: 80, radiusPx: 52, radiusMm: 44 },
      { yPx: 60, yMm: 40, radiusPx: 58, radiusMm: 50 },
      { yPx: 100, yMm: 0, radiusPx: 58, radiusMm: 50 },
      { yPx: 140, yMm: -40, radiusPx: 58, radiusMm: 50 },
      { yPx: 160, yMm: -60, radiusPx: 54, radiusMm: 46 },
      { yPx: 170, yMm: -70, radiusPx: 50, radiusMm: 42 },
    ],
  };
}

test("deriveEngravableZoneFromFitDebug maps fit bounds into overall-height millimeters", () => {
  const zone = deriveEngravableZoneFromFitDebug({
    overallHeightMm: 200,
    fitDebug: createFitDebug(),
  });

  assert.ok(zone);
  assert.equal(zone.bodyTopFromOverallMm, 20.1);
  assert.equal(zone.bodyBottomFromOverallMm, 170.85);
  assert.equal(zone.topMarginMm, 20.1);
  assert.equal(zone.bottomMarginMm, 29.15);
  assert.equal(zone.printHeightMm, 150.75);
});

test("deriveEngravableZoneFromFitDebug exposes a straight-wall guide when the profile tapers near the base", () => {
  const zone = deriveEngravableZoneFromFitDebug({
    overallHeightMm: 200,
    fitDebug: createFitDebug(),
  });

  assert.ok(zone);
  assert.equal(zone.straightWallBottomYFromTopMm, 140);
  assert.equal(zone.straightWallHeightMm, 119.9);
});

test("deriveEngravableZoneFromFitDebug returns null for incomplete inputs", () => {
  assert.equal(
    deriveEngravableZoneFromFitDebug({ overallHeightMm: 0, fitDebug: createFitDebug() }),
    null,
  );
  assert.equal(
    deriveEngravableZoneFromFitDebug({ overallHeightMm: 200, fitDebug: null }),
    null,
  );
});
