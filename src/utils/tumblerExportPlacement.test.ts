import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BED_CONFIG } from "../types/admin.ts";
import type { RotaryPlacementPreset } from "../types/export.ts";
import {
  buildLightBurnExportArtifacts,
  buildLightBurnExportPayload,
  buildLightBurnSetupSummary,
  buildLt316Sidecar,
  getRecommendedRotaryDiameter,
  getRotaryExportOrigin,
} from "./tumblerExportPlacement.ts";

const PRESET: RotaryPlacementPreset = {
  id: "preset-a",
  name: "Preset A",
  bedOrigin: "top-left",
  rotaryCenterXmm: 170,
  rotaryTopYmm: 22,
  chuckOrRoller: "roller",
};

test("exportOriginXmm centers from template width", () => {
  const origin = getRotaryExportOrigin({
    templateWidthMm: 276.08,
    rotaryCenterXmm: 170,
    rotaryTopYmm: 22,
    anchorMode: "physical-top",
  });
  assert.equal(origin.xMm, 31.96);
});

test("exportOriginYmm uses rotaryTopYmm", () => {
  const origin = getRotaryExportOrigin({
    templateWidthMm: 250,
    rotaryCenterXmm: 170,
    rotaryTopYmm: 22,
    anchorMode: "physical-top",
  });
  assert.equal(origin.yMm, 22);
});

test("printable-top anchor adds topToSafeZoneStartMm", () => {
  const origin = getRotaryExportOrigin({
    templateWidthMm: 250,
    rotaryCenterXmm: 170,
    rotaryTopYmm: 22,
    anchorMode: "printable-top",
    placementProfile: {
      topToSafeZoneStartMm: 7.5,
    },
  });
  assert.equal(origin.yMm, 29.5);
});

test("non-rotary path remains unchanged", () => {
  const payload = buildLightBurnExportPayload({
    workspaceMode: "tumbler-wrap",
    templateWidthMm: 250,
    templateHeightMm: 140,
    items: [
      {
        id: "item-1",
        assetId: "asset-1",
        name: "A",
        x: 10,
        y: 20,
        width: 30,
        height: 40,
        rotation: 0,
        svgText: "<svg />",
      },
    ],
    rotary: {
      enabled: false,
      preset: PRESET,
      anchorMode: "physical-top",
    },
  });

  assert.equal(payload.rotaryAutoPlacementApplied, false);
  assert.equal(payload.items[0].xMm, 10);
  assert.equal(payload.items[0].yMm, 20);
});

test("items are shifted by preset origin when rotary placement is enabled", () => {
  const payload = buildLightBurnExportPayload({
    workspaceMode: "tumbler-wrap",
    templateWidthMm: 200,
    templateHeightMm: 140,
    items: [
      {
        id: "item-1",
        assetId: "asset-1",
        name: "A",
        x: 10,
        y: 15,
        width: 30,
        height: 40,
        rotation: 0,
        svgText: "<svg />",
      },
    ],
    rotary: {
      enabled: true,
      preset: PRESET,
      anchorMode: "physical-top",
    },
  });

  // origin = (170 - 100, 22) => (70, 22)
  assert.equal(payload.rotaryAutoPlacementApplied, true);
  assert.equal(payload.rotary.exportOriginXmm, 70);
  assert.equal(payload.rotary.exportOriginYmm, 22);
  assert.equal(payload.items[0].xMm, 80);
  assert.equal(payload.items[0].yMm, 37);
});

test("toggle off keeps export unchanged and does not include sidecar", () => {
  const artifacts = buildLightBurnExportArtifacts({
    includeLightBurnRotarySetup: false,
    bedConfig: DEFAULT_BED_CONFIG,
    workspaceMode: "tumbler-wrap",
    templateWidthMm: 200,
    templateHeightMm: 140,
    items: [
      {
        id: "item-1",
        assetId: "asset-1",
        name: "A",
        x: 10,
        y: 15,
        width: 30,
        height: 40,
        rotation: 0,
        svgText: "<svg />",
      },
    ],
    rotary: {
      enabled: true,
      preset: PRESET,
      anchorMode: "physical-top",
    },
  });

  assert.equal(artifacts.sidecar, null);
  assert.equal(artifacts.setupSummary, null);
  assert.equal(artifacts.artworkPayload.items[0].xMm, 80);
  assert.equal(artifacts.artworkPayload.items[0].yMm, 37);
});

test("toggle on includes sidecar and summary", () => {
  const config = {
    ...DEFAULT_BED_CONFIG,
    workspaceMode: "tumbler-wrap" as const,
    tumblerShapeType: "straight" as const,
    tumblerOutsideDiameterMm: 87.9,
    tumblerTopDiameterMm: 87.9,
    tumblerBottomDiameterMm: 87.9,
    tumblerOverallHeightMm: 266,
    tumblerUsableHeightMm: 160,
    width: 276.15,
    height: 160,
  };

  const artifacts = buildLightBurnExportArtifacts({
    includeLightBurnRotarySetup: true,
    bedConfig: config,
    workspaceMode: "tumbler-wrap",
    templateWidthMm: 276.15,
    templateHeightMm: 160,
    items: [],
    rotary: {
      enabled: true,
      preset: PRESET,
      anchorMode: "physical-top",
    },
  });

  assert.ok(artifacts.sidecar);
  assert.ok(artifacts.setupSummary);
  assert.equal(artifacts.sidecar?.product.diameterMm, 87.9);
  assert.equal(artifacts.sidecar?.rotary.recommendedCircumferenceMm, 276.15);
});

test("straight recommended diameter uses outsideDiameterMm", () => {
  const diameter = getRecommendedRotaryDiameter({
    shapeType: "straight",
    outsideDiameterMm: 87.9,
    topDiameterMm: 85,
    bottomDiameterMm: 90,
  });
  assert.equal(diameter, 87.9);
});

test("tapered recommended diameter uses largest end", () => {
  const diameter = getRecommendedRotaryDiameter({
    shapeType: "tapered",
    outsideDiameterMm: 87,
    topDiameterMm: 95.2,
    bottomDiameterMm: 84.1,
  });
  assert.equal(diameter, 95.2);
});

test("setup summary values match sidecar/export math", () => {
  const sidecar = buildLt316Sidecar({
    bedConfig: {
      ...DEFAULT_BED_CONFIG,
      workspaceMode: "tumbler-wrap",
      tumblerShapeType: "straight",
      tumblerOutsideDiameterMm: 87.9,
      tumblerTopDiameterMm: 87.9,
      tumblerBottomDiameterMm: 87.9,
      tumblerOverallHeightMm: 266,
      tumblerUsableHeightMm: 160,
      width: 276.15,
      height: 160,
    },
    artworkPayload: buildLightBurnExportPayload({
      workspaceMode: "tumbler-wrap",
      templateWidthMm: 276.15,
      templateHeightMm: 160,
      items: [],
      rotary: {
        enabled: true,
        preset: {
          ...PRESET,
          rotaryCenterXmm: 256.275,
          rotaryTopYmm: 32,
          chuckOrRoller: "chuck",
        },
        anchorMode: "physical-top",
      },
    }),
  });

  const summary = buildLightBurnSetupSummary(sidecar, "physical-top");
  assert.match(summary, /Rotary type: chuck/);
  assert.match(summary, /Object diameter: 87\.90 mm/);
  assert.match(summary, /Wrap width: 276\.15 mm/);
  assert.match(summary, /Origin X: 118\.20 mm/);
  assert.match(summary, /Origin Y: 32\.00 mm/);
});
