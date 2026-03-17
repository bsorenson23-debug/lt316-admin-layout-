import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BED_CONFIG } from "../types/admin.ts";
import {
  centerArtworkBetweenGrooves,
  computeCenteredItemYBetweenGuides,
  getActiveTumblerGuideBand,
  getGrooveGuideOverlayMetrics,
  getGuideBandMetrics,
  shouldRenderTumblerGuideBand,
} from "./tumblerGuides.ts";

test("getGuideBandMetrics computes midpoint and band height", () => {
  const metrics = getGuideBandMetrics({
    upperGrooveYmm: 24,
    lowerGrooveYmm: 124,
  });

  assert.equal(metrics.bandCenterYmm, 74);
  assert.equal(metrics.bandHeightMm, 100);
});

test("computeCenteredItemYBetweenGuides centers item vertically in band", () => {
  const y = computeCenteredItemYBetweenGuides({
    itemHeightMm: 40,
    workspaceHeightMm: 180,
    band: {
      upperGrooveYmm: 30,
      lowerGrooveYmm: 130,
    },
  });

  // band center=80, item center should become 80 => y=60
  assert.equal(y, 60);
});

test("getGrooveGuideOverlayMetrics maps groove Y values to canvas positions", () => {
  const overlay = getGrooveGuideOverlayMetrics({
    bedWidthMm: 280,
    scale: 2,
    band: {
      upperGrooveYmm: 20,
      lowerGrooveYmm: 120,
    },
  });

  assert.equal(overlay.widthPx, 560);
  assert.equal(overlay.upperYpx, 40);
  assert.equal(overlay.lowerYpx, 240);
  assert.equal(overlay.bandHeightPx, 200);
});

test("computeCenteredItemYBetweenGuides clamps when item exceeds workspace", () => {
  const y = computeCenteredItemYBetweenGuides({
    itemHeightMm: 170,
    workspaceHeightMm: 180,
    band: {
      upperGrooveYmm: 30,
      lowerGrooveYmm: 130,
    },
  });

  assert.equal(y, 0);
});

test("computeCenteredItemYBetweenGuides clamps to maxY when band midpoint is low", () => {
  const y = computeCenteredItemYBetweenGuides({
    itemHeightMm: 170,
    workspaceHeightMm: 180,
    band: {
      upperGrooveYmm: 120,
      lowerGrooveYmm: 170,
    },
  });

  assert.equal(y, 10);
});

test("centerArtworkBetweenGrooves returns Y-only placement with preserved center intent", () => {
  const centered = centerArtworkBetweenGrooves({
    currentYmm: 12,
    itemHeightMm: 40,
    workspaceHeightMm: 180,
    band: {
      upperGrooveYmm: 30,
      lowerGrooveYmm: 130,
    },
  });

  assert.equal(centered.yMm, 60);
  assert.equal(centered.bandCenterYmm, 80);
  assert.equal(centered.previousCenterYmm, 32);
  assert.equal(centered.nextCenterYmm, 80);
});

test("getActiveTumblerGuideBand is inactive outside tumbler mode or without data", () => {
  const inactive = getActiveTumblerGuideBand(DEFAULT_BED_CONFIG);
  assert.equal(inactive, null);

  const active = getActiveTumblerGuideBand({
    ...DEFAULT_BED_CONFIG,
    workspaceMode: "tumbler-wrap",
    tumblerGuideBand: {
      id: "band-1",
      label: "Main",
      upperGrooveYmm: 20,
      lowerGrooveYmm: 120,
    },
  });
  assert.ok(active);
  assert.equal(active?.id, "band-1");
});

test("shouldRenderTumblerGuideBand requires tumbler mode, data, and toggle enabled", () => {
  assert.equal(
    shouldRenderTumblerGuideBand({
      ...DEFAULT_BED_CONFIG,
      workspaceMode: "flat-bed",
      showTumblerGuideBand: true,
      tumblerGuideBand: {
        id: "band-1",
        label: "Main",
        upperGrooveYmm: 20,
        lowerGrooveYmm: 120,
      },
    }),
    false
  );

  assert.equal(
    shouldRenderTumblerGuideBand({
      ...DEFAULT_BED_CONFIG,
      workspaceMode: "tumbler-wrap",
      showTumblerGuideBand: false,
      tumblerGuideBand: {
        id: "band-1",
        label: "Main",
        upperGrooveYmm: 20,
        lowerGrooveYmm: 120,
      },
    }),
    false
  );

  assert.equal(
    shouldRenderTumblerGuideBand({
      ...DEFAULT_BED_CONFIG,
      workspaceMode: "tumbler-wrap",
      showTumblerGuideBand: true,
      tumblerGuideBand: {
        id: "band-1",
        label: "Main",
        upperGrooveYmm: 20,
        lowerGrooveYmm: 120,
      },
    }),
    true
  );
});
