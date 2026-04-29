import assert from "node:assert/strict";
import test from "node:test";

import type { TumblerItemLookupFitDebug } from "../types/tumblerItemLookup.ts";
import {
  fitDebugYToOverallMm,
  mapBodyLocalGuideMmToOverallMm,
  mapOverallGuideMmToBodyLocalMm,
  resolveAcceptedBodyReferenceOverallHeightMm,
  resolveEngravableZoneGuideAuthority,
} from "./engravableGuideAuthority.ts";

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
    seamSilverBottomPx: 176,
    maxCenterWidthPx: 260,
    referenceHalfWidthPx: 90,
    fitScore: 8.4,
    profilePoints: [],
    ...overrides,
  };
}

test("lower silver seam seeds top engravable guide when no manual override exists", () => {
  const authority = resolveEngravableZoneGuideAuthority({
    overallHeightMm: 256,
    bodyTopFromOverallMm: 25,
    bodyBottomFromOverallMm: 224,
    fitDebug: createFitDebug({ seamSilverBottomPx: 176 }),
    acceptedBodyReferenceAvailable: true,
  });

  assert.equal(authority.bodyScaleSource, "accepted-body-reference");
  assert.equal(authority.topGuideSource, "detected-lower-silver-seam");
  assert.equal(authority.topGuideMm, 62.4);
  assert.equal(authority.bottomGuideMm, 224);
});

test("manual top override wins over detected lower silver seam", () => {
  const authority = resolveEngravableZoneGuideAuthority({
    overallHeightMm: 256,
    bodyTopFromOverallMm: 25,
    bodyBottomFromOverallMm: 224,
    printableTopOverrideMm: 71.2,
    fitDebug: createFitDebug({ seamSilverBottomPx: 176 }),
    acceptedBodyReferenceAvailable: true,
  });

  assert.equal(authority.topGuideSource, "manual-override");
  assert.equal(authority.topGuideMm, 71.2);
  assert.equal(authority.manualTopOverrideActive, true);
});

test("manual bottom override wins only when active", () => {
  const withManual = resolveEngravableZoneGuideAuthority({
    overallHeightMm: 256,
    bodyTopFromOverallMm: 25,
    bodyBottomFromOverallMm: 224,
    printableBottomOverrideMm: 210.5,
    printableSurfaceContract: {
      printableTopMm: 64.5,
      printableBottomMm: 218,
      printableHeightMm: 153.5,
      axialExclusions: [],
      circumferentialExclusions: [],
    },
  });
  const withoutManual = resolveEngravableZoneGuideAuthority({
    overallHeightMm: 256,
    bodyTopFromOverallMm: 25,
    bodyBottomFromOverallMm: 224,
    printableSurfaceContract: {
      printableTopMm: 64.5,
      printableBottomMm: 218,
      printableHeightMm: 153.5,
      axialExclusions: [],
      circumferentialExclusions: [],
    },
  });

  assert.equal(withManual.bottomGuideSource, "manual-override");
  assert.equal(withManual.bottomGuideMm, 210.5);
  assert.equal(withManual.manualBottomOverrideActive, true);
  assert.equal(withoutManual.bottomGuideSource, "saved-printable-surface-contract");
  assert.equal(withoutManual.bottomGuideMm, 218);
});

test("clearing manual override returns to lower silver seam", () => {
  const withManual = resolveEngravableZoneGuideAuthority({
    overallHeightMm: 256,
    bodyTopFromOverallMm: 25,
    bodyBottomFromOverallMm: 224,
    printableTopOverrideMm: 71.2,
    fitDebug: createFitDebug({ seamSilverBottomPx: 176 }),
  });
  const cleared = resolveEngravableZoneGuideAuthority({
    overallHeightMm: 256,
    bodyTopFromOverallMm: 25,
    bodyBottomFromOverallMm: 224,
    printableTopOverrideMm: null,
    fitDebug: createFitDebug({ seamSilverBottomPx: 176 }),
  });

  assert.equal(withManual.topGuideSource, "manual-override");
  assert.equal(cleared.topGuideSource, "detected-lower-silver-seam");
  assert.equal(cleared.topGuideMm, 62.4);
});

test("engravable guide source and body scale source are not conflated", () => {
  const authority = resolveEngravableZoneGuideAuthority({
    overallHeightMm: 256,
    bodyTopFromOverallMm: 25,
    bodyBottomFromOverallMm: 224,
    savedSilverBandBottomFromOverallMm: 64.5,
    acceptedBodyReferenceAvailable: true,
  });

  assert.equal(authority.bodyScaleSource, "accepted-body-reference");
  assert.equal(authority.topGuideSource, "detected-silver-band-bottom");
  assert.equal(authority.topGuideMm, 64.5);
});

test("fallback to BODY REFERENCE only occurs when no seam or override is available", () => {
  const authority = resolveEngravableZoneGuideAuthority({
    overallHeightMm: 256,
    bodyTopFromOverallMm: 25,
    bodyBottomFromOverallMm: 224,
    acceptedBodyReferenceAvailable: true,
  });

  assert.equal(authority.topGuideSource, "accepted-body-reference");
  assert.equal(authority.topGuideMm, 25);
  assert.match(authority.warnings.join(" "), /No detected lower silver seam/i);
});

test("pixel to mm seam mapping is stable within round-trip tolerance", () => {
  const mm = fitDebugYToOverallMm({
    overallHeightMm: 256,
    yPx: 176.4,
    fitDebug: createFitDebug(),
  });

  assert.ok(mm != null);
  assert.ok(Math.abs(mm - 62.56) <= 0.2);
});

test("saved printable contract is lower priority than detected seam", () => {
  const authority = resolveEngravableZoneGuideAuthority({
    overallHeightMm: 256,
    bodyTopFromOverallMm: 25,
    bodyBottomFromOverallMm: 224,
    fitDebug: createFitDebug({ seamSilverBottomPx: 176 }),
    printableSurfaceContract: {
      printableTopMm: 25,
      printableBottomMm: 224,
      printableHeightMm: 199,
      axialExclusions: [],
      circumferentialExclusions: [],
    },
  });

  assert.equal(authority.topGuideSource, "detected-lower-silver-seam");
  assert.equal(authority.topGuideMm, 62.4);
});

test("accepted BODY REFERENCE full product height ignores body-only contour height", () => {
  const resolved = resolveAcceptedBodyReferenceOverallHeightMm({
    canonicalTotalHeightMm: 256,
    lookupFullProductHeightMm: 255.8,
    currentOverallHeightMm: 199,
  });

  assert.equal(resolved, 256);
});

test("body-only editor maps silver seam from full-product to body-local coordinates", () => {
  const local = mapOverallGuideMmToBodyLocalMm({
    overallGuideMm: 63,
    bodyTopFromOverallMm: 25,
    bodyOnlyHeightMm: 199,
  });

  assert.equal(local, 38);
});

test("body-only drag override maps back to full-product coordinates", () => {
  const overall = mapBodyLocalGuideMmToOverallMm({
    localGuideMm: 38,
    bodyTopFromOverallMm: 25,
    bodyBottomFromOverallMm: 224,
  });

  assert.equal(overall, 63);
});
