import assert from "node:assert/strict";
import test from "node:test";

import type { EngravableZoneGuideAuthority } from "./engravableGuideAuthority.ts";
import { createBrandLogoReference } from "./productAppearanceReferenceLayers.ts";
import { resolveProductAppearanceSurfaceAuthority } from "./productAppearanceSurface.ts";

function createGuideAuthority(
  overrides: Partial<EngravableZoneGuideAuthority> = {},
): EngravableZoneGuideAuthority {
  return {
    bodyScaleSource: "accepted-body-reference",
    topGuideMm: 63,
    bottomGuideMm: 224,
    topGuideSource: "detected-lower-silver-seam",
    bottomGuideSource: "accepted-body-reference",
    detectedLowerSilverSeamMm: 63,
    manualTopOverrideActive: false,
    manualBottomOverrideActive: false,
    warnings: [],
    ...overrides,
  };
}

test("detected silver ring becomes appearance layer and top engrave guide source", () => {
  const authority = resolveProductAppearanceSurfaceAuthority({
    overallHeightMm: 256,
    bodyTopFromOverallMm: 25,
    bodyBottomFromOverallMm: 224,
    lidSeamFromOverallMm: 58,
    silverBandBottomFromOverallMm: 63,
    engravableGuideAuthority: createGuideAuthority(),
  });

  assert.equal(authority.coordinateSpace, "full-product-mm");
  assert.equal(authority.engravableSurface.printableTopMm, 63);
  assert.equal(authority.engravableSurface.topGuideSource, "detected-lower-silver-seam");
  assert.equal(authority.engravableSurface.authoritySource, "silver-band");
  assert.equal(authority.silverBandLayer?.kind, "top-finish-band");
  assert.equal(authority.silverBandLayer?.yMm, 58);
  assert.equal(authority.silverBandLayer?.heightMm, 5);
  assert.equal(authority.silverBandLayer?.includedInBodyCutoutQa, false);
});

test("saved printable surface contract remains engravable surface source when stronger than live detection", () => {
  const authority = resolveProductAppearanceSurfaceAuthority({
    overallHeightMm: 256,
    bodyTopFromOverallMm: 25,
    bodyBottomFromOverallMm: 224,
    printableSurfaceContract: {
      printableTopMm: 70,
      printableBottomMm: 210,
      printableHeightMm: 140,
      axialExclusions: [{ kind: "rim-ring", startMm: 58, endMm: 70 }],
      circumferentialExclusions: [],
    },
    engravableGuideAuthority: createGuideAuthority({
      topGuideMm: 70,
      bottomGuideMm: 210,
      topGuideSource: "saved-printable-surface-contract",
      bottomGuideSource: "saved-printable-surface-contract",
      detectedLowerSilverSeamMm: null,
    }),
  });

  assert.equal(authority.engravableSurface.authoritySource, "printable-surface-contract");
  assert.equal(authority.printableSurfaceContract.printableTopMm, 70);
  assert.equal(authority.printableSurfaceContract.printableBottomMm, 210);
  assert.deepEqual(authority.printableSurfaceContract.axialExclusions, [
    { kind: "rim-ring", startMm: 58, endMm: 70 },
  ]);
});

test("accepted body-reference bottom guide is raised above rounded bowl bottom by fallback inset", () => {
  const authority = resolveProductAppearanceSurfaceAuthority({
    overallHeightMm: 228.3,
    bodyTopFromOverallMm: 57.3,
    bodyBottomFromOverallMm: 228.3,
    engravableGuideAuthority: createGuideAuthority({
      topGuideMm: 57.3,
      bottomGuideMm: 228.3,
      topGuideSource: "accepted-body-reference",
      bottomGuideSource: "accepted-body-reference",
      detectedLowerSilverSeamMm: null,
    }),
  });

  assert.equal(authority.engravableSurface.printableTopMm, 57.3);
  assert.equal(authority.engravableSurface.printableBottomMm, 219.75);
  assert.equal(authority.engravableSurface.printableBottomMm < 228.3, true);
  assert.equal(authority.engravableSurface.bottomSafeInsetMm, 8.55);
  assert.equal(authority.engravableSurface.bottomSafeInsetSource, "rounded-base-fallback");
  assert.equal(authority.engravableSurface.bottomGuideAdjustedForLowerBowl, true);
});

test("manual bottom override is not moved by lower bowl fallback", () => {
  const authority = resolveProductAppearanceSurfaceAuthority({
    overallHeightMm: 228.3,
    bodyTopFromOverallMm: 57.3,
    bodyBottomFromOverallMm: 228.3,
    engravableGuideAuthority: createGuideAuthority({
      topGuideMm: 57.3,
      bottomGuideMm: 224.2,
      topGuideSource: "accepted-body-reference",
      bottomGuideSource: "manual-override",
      manualBottomOverrideActive: true,
      detectedLowerSilverSeamMm: null,
    }),
  });

  assert.equal(authority.engravableSurface.printableBottomMm, 224.2);
  assert.equal(authority.engravableSurface.bottomSafeInsetSource, "manual-override");
  assert.equal(authority.engravableSurface.bottomGuideAdjustedForLowerBowl, false);
});

test("saved printable surface contract bottom is not moved by lower bowl fallback", () => {
  const authority = resolveProductAppearanceSurfaceAuthority({
    overallHeightMm: 228.3,
    bodyTopFromOverallMm: 57.3,
    bodyBottomFromOverallMm: 228.3,
    printableSurfaceContract: {
      printableTopMm: 63,
      printableBottomMm: 222,
      printableHeightMm: 159,
      axialExclusions: [],
      circumferentialExclusions: [],
    },
    engravableGuideAuthority: createGuideAuthority({
      topGuideMm: 63,
      bottomGuideMm: 222,
      topGuideSource: "saved-printable-surface-contract",
      bottomGuideSource: "saved-printable-surface-contract",
      detectedLowerSilverSeamMm: null,
    }),
  });

  assert.equal(authority.engravableSurface.authoritySource, "printable-surface-contract");
  assert.equal(authority.engravableSurface.printableBottomMm, 222);
  assert.equal(authority.engravableSurface.bottomSafeInsetSource, "none");
  assert.equal(authority.engravableSurface.bottomGuideAdjustedForLowerBowl, false);
});

test("manual top and bottom overrides remain full-product coordinates", () => {
  const authority = resolveProductAppearanceSurfaceAuthority({
    overallHeightMm: 256,
    bodyTopFromOverallMm: 25,
    bodyBottomFromOverallMm: 224,
    engravableGuideAuthority: createGuideAuthority({
      topGuideMm: 82,
      bottomGuideMm: 205,
      topGuideSource: "manual-override",
      bottomGuideSource: "manual-override",
      manualTopOverrideActive: true,
      manualBottomOverrideActive: true,
    }),
  });

  assert.equal(authority.engravableSurface.authoritySource, "manual-override");
  assert.equal(authority.engravableSurface.printableTopMm, 82);
  assert.equal(authority.engravableSurface.printableBottomMm, 205);
  assert.equal(authority.printableSurfaceContract.printableHeightMm, 123);
});

test("logo detection unavailable returns no logo layer", () => {
  const authority = resolveProductAppearanceSurfaceAuthority({
    overallHeightMm: 256,
    bodyTopFromOverallMm: 25,
    bodyBottomFromOverallMm: 224,
    engravableGuideAuthority: createGuideAuthority(),
  });

  assert.equal(authority.manufacturerLogoLayer, null);
  assert.equal(authority.appearanceReferenceLayers.some((layer) => layer.kind === "front-brand-logo"), false);
});

test("unknown or generic logo labels do not create fake manufacturer logo layers", () => {
  for (const label of ["unknown", "unknown unknown", "Unknown Brand", "generic", "n/a", ""]) {
    const authority = resolveProductAppearanceSurfaceAuthority({
      overallHeightMm: 256,
      bodyTopFromOverallMm: 25,
      bodyBottomFromOverallMm: 224,
      engravableGuideAuthority: createGuideAuthority(),
      manufacturerLogo: {
        label,
        source: "lookup",
      },
    });

    assert.equal(authority.manufacturerLogoLayer, null);
    assert.equal(authority.appearanceReferenceLayers.some((layer) => layer.kind === "front-brand-logo"), false);
  }
});

test("lookup manufacturer logo layer is generated once and preserved as reference-only", () => {
  const authority = resolveProductAppearanceSurfaceAuthority({
    overallHeightMm: 256,
    bodyTopFromOverallMm: 25,
    bodyBottomFromOverallMm: 224,
    engravableGuideAuthority: createGuideAuthority(),
    manufacturerLogo: {
      label: "YETI",
      source: "lookup",
      confidence: 0.84,
    },
  });

  assert.equal(authority.manufacturerLogoLayer?.kind, "front-brand-logo");
  assert.equal(authority.manufacturerLogoLayer?.label, "YETI");
  assert.equal(authority.manufacturerLogoLayer?.source, "lookup");
  assert.equal(authority.manufacturerLogoLayer?.referenceOnly, true);
  assert.equal(authority.manufacturerLogoLayer?.includedInBodyCutoutQa, false);
});

test("existing operator logo wins over generated lookup logo", () => {
  const existingLogo = createBrandLogoReference({
    id: "operator-front-logo",
    kind: "front-brand-logo",
    label: "Operator logo",
    source: "operator",
    centerYMm: 96,
  });
  const authority = resolveProductAppearanceSurfaceAuthority({
    overallHeightMm: 256,
    bodyTopFromOverallMm: 25,
    bodyBottomFromOverallMm: 224,
    existingAppearanceReferenceLayers: [existingLogo],
    engravableGuideAuthority: createGuideAuthority(),
    manufacturerLogo: {
      label: "YETI",
      source: "lookup",
    },
  });

  assert.equal(authority.manufacturerLogoLayer?.id, "operator-front-logo");
  assert.equal(authority.manufacturerLogoLayer?.label, "Operator logo");
  assert.equal(
    authority.appearanceReferenceLayers.filter((layer) => layer.kind === "front-brand-logo").length,
    1,
  );
});

test("body-only editor display remains a downstream coordinate view of upstream full-product surface", () => {
  const authority = resolveProductAppearanceSurfaceAuthority({
    overallHeightMm: 256,
    bodyTopFromOverallMm: 25,
    bodyBottomFromOverallMm: 224,
    engravableGuideAuthority: createGuideAuthority({
      topGuideMm: 63,
      bottomGuideMm: 205,
      topGuideSource: "detected-lower-silver-seam",
      bottomGuideSource: "manual-override",
      manualBottomOverrideActive: true,
    }),
  });
  const bodyLocalTopMm = authority.engravableSurface.printableTopMm - 25;
  const savedFullProductTopMm = 25 + bodyLocalTopMm;

  assert.equal(authority.engravableSurface.coordinateSpace, "full-product-mm");
  assert.equal(bodyLocalTopMm, 38);
  assert.equal(savedFullProductTopMm, authority.engravableSurface.printableTopMm);
});
