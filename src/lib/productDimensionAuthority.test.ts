import assert from "node:assert/strict";
import test from "node:test";

import type { TumblerItemLookupDimensions } from "@/types/tumblerItemLookup";
import {
  computeWrapWidthFromDiameterMm,
  summarizeProductDimensionAuthority,
} from "./productDimensionAuthority.ts";

function createDimensions(
  overrides: Partial<TumblerItemLookupDimensions> = {},
): TumblerItemLookupDimensions {
  return {
    lookupProductId: "product-lookup",
    productUrl: "https://example.com/products/tumbler",
    selectedVariantId: "40oz-stainless",
    selectedVariantLabel: "40 oz / Stainless",
    selectedSizeOz: 40,
    selectedColorOrFinish: "Stainless",
    availableVariantLabels: ["30 oz / Stainless", "40 oz / Stainless"],
    availableSizeOz: [30, 40],
    dimensionSourceUrl: "https://example.com/products/tumbler",
    dimensionSourceText: "40 oz product dimensions 4.0 x 4.0 x 11.2 in",
    dimensionSourceSizeOz: 40,
    titleSizeOz: 40,
    confidence: 0.91,
    dimensionAuthority: "diameter-primary",
    diameterMm: 101.6,
    bodyDiameterMm: 99.2,
    wrapDiameterMm: 101.6,
    wrapWidthMm: 319.19,
    fullProductHeightMm: 284.48,
    bodyHeightMm: 236.22,
    heightIncludesLidOrStraw: true,
    overallHeightMm: 284.48,
    outsideDiameterMm: 101.6,
    topDiameterMm: null,
    bottomDiameterMm: null,
    usableHeightMm: 236.22,
    ...overrides,
  };
}

test("diameter-first authority resolves lookup scale from diameter and not height", () => {
  const summary = summarizeProductDimensionAuthority(createDimensions(), {
    requireScaleDiameter: true,
    requireExactVariantMatch: true,
  });

  assert.equal(summary.status, "warn");
  assert.equal(summary.readyForLookupScale, true);
  assert.equal(summary.dimensionAuthority, "diameter-primary");
  assert.equal(summary.scaleDiameterMm, 101.6);
  assert.equal(summary.wrapWidthMm, 319.19);
  assert.equal(summary.heightIgnoredForScale, true);
  assert.match(summary.warnings.join(" "), /ignored for lookup-based body contour scale/i);
});

test("body-diameter authority can drive scale when outside diameter is absent", () => {
  const summary = summarizeProductDimensionAuthority(createDimensions({
    dimensionAuthority: "body-diameter-primary",
    diameterMm: null,
    outsideDiameterMm: null,
    wrapDiameterMm: null,
    bodyDiameterMm: 87.2,
  }), {
    requireScaleDiameter: true,
  });

  assert.equal(summary.readyForLookupScale, true);
  assert.equal(summary.dimensionAuthority, "body-diameter-primary");
  assert.equal(summary.scaleDiameterMm, 87.2);
});

test("manual override can provide scale authority when requested", () => {
  const summary = summarizeProductDimensionAuthority(createDimensions({
    dimensionAuthority: "unknown",
    diameterMm: null,
    outsideDiameterMm: null,
    wrapDiameterMm: null,
    bodyDiameterMm: null,
  }), {
    requireScaleDiameter: true,
    manualOverrideDiameterMm: 90.4,
  });

  assert.equal(summary.status, "warn");
  assert.equal(summary.dimensionAuthority, "manual-override");
  assert.equal(summary.scaleDiameterMm, 90.4);
  assert.equal(summary.readyForLookupScale, true);
});

test("ambiguous multi-variant pages fail when the selected variant is unknown", () => {
  const summary = summarizeProductDimensionAuthority(createDimensions({
    selectedVariantId: null,
    selectedVariantLabel: null,
    selectedSizeOz: null,
    dimensionSourceSizeOz: null,
    titleSizeOz: null,
  }), {
    requireScaleDiameter: true,
    requireExactVariantMatch: true,
  });

  assert.equal(summary.status, "fail");
  assert.equal(summary.readyForLookupScale, false);
  assert.equal(summary.variantStatus, "ambiguous");
  assert.match(summary.errors.join(" "), /multiple size or variant options/i);
});

test("wrong-size dimension blocks are rejected instead of used silently", () => {
  const summary = summarizeProductDimensionAuthority(createDimensions({
    dimensionSourceText: "30 oz product dimensions 3.6 x 3.6 x 10.8 in",
    dimensionSourceSizeOz: 30,
    titleSizeOz: 40,
  }), {
    requireScaleDiameter: true,
    requireExactVariantMatch: true,
  });

  assert.equal(summary.status, "fail");
  assert.equal(summary.readyForLookupScale, false);
  assert.equal(summary.variantStatus, "mismatch");
  assert.match(summary.errors.join(" "), /belong to 30 oz/i);
});

test("color-only variants can inherit dimensions when the size still matches", () => {
  const summary = summarizeProductDimensionAuthority(createDimensions({
    selectedVariantLabel: "40 oz / Rose Quartz",
    selectedColorOrFinish: "Rose Quartz",
    availableVariantLabels: ["40 oz / Rose Quartz", "40 oz / Ash"],
    availableSizeOz: [40],
  }), {
    requireScaleDiameter: true,
    requireExactVariantMatch: true,
  });

  assert.equal(summary.readyForLookupScale, true);
  assert.equal(summary.variantStatus, "exact");
});

test("missing diameter prevents a required lookup-scale pass", () => {
  const summary = summarizeProductDimensionAuthority(createDimensions({
    dimensionAuthority: "unknown",
    diameterMm: null,
    outsideDiameterMm: null,
    bodyDiameterMm: null,
    wrapDiameterMm: null,
    wrapWidthMm: null,
  }), {
    requireScaleDiameter: true,
  });

  assert.equal(summary.status, "fail");
  assert.equal(summary.readyForLookupScale, false);
  assert.match(summary.errors.join(" "), /missing a usable diameter/i);
});

test("generic single-size dimensions can warn without blocking lookup scale", () => {
  const summary = summarizeProductDimensionAuthority(createDimensions({
    availableVariantLabels: ["40 oz / Stainless"],
    availableSizeOz: [40],
  }), {
    requireScaleDiameter: true,
    requireExactVariantMatch: true,
  });

  assert.equal(summary.readyForLookupScale, true);
  assert.equal(summary.variantStatus, "exact");
});

test("wrap width is derived from diameter using pi times diameter", () => {
  assert.equal(computeWrapWidthFromDiameterMm(88.9), 279.29);
});
