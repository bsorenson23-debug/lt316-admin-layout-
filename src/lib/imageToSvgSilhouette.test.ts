import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeAlphaSilhouette,
  percentileUint8,
} from "./imageToSvgSilhouette.ts";

test("percentileUint8 clamps the requested fraction and returns the nearest byte", () => {
  assert.equal(percentileUint8([0, 10, 20, 30, 40], -1), 0);
  assert.equal(percentileUint8([0, 10, 20, 30, 40], 0.5), 20);
  assert.equal(percentileUint8([0, 10, 20, 30, 40], 5), 40);
});

test("analyzeAlphaSilhouette detects when a cutout has enough translucent edge data", () => {
  const analysis = analyzeAlphaSilhouette([255, 255, 220, 210, 180, 160, 120], 100);

  assert.equal(analysis.hasUsefulAlpha, true);
  assert.equal(analysis.tightThreshold, 180);
  assert.equal(analysis.translucentPixelRatio, 0.05);
});

test("analyzeAlphaSilhouette ignores fully opaque rasters", () => {
  const analysis = analyzeAlphaSilhouette(new Array(50).fill(255), 50);

  assert.equal(analysis.hasUsefulAlpha, false);
  assert.equal(analysis.tightThreshold, 0);
  assert.equal(analysis.translucentPixelRatio, 0);
});
