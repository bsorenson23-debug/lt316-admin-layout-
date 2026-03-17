import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BED_CONFIG } from "../types/admin.ts";
import {
  computeCenteredItemYBetweenGuides,
  getActiveTumblerGuideBand,
  getGuideBandMetrics,
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
