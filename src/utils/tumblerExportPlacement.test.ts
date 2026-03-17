import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BED_CONFIG } from "../types/admin.ts";
import type { RotaryPlacementPreset } from "../types/export.ts";
import {
  buildLightBurnExportArtifacts,
  buildLightBurnExportPayload,
  buildLightBurnSetupSummary,
  buildLt316Sidecar,
  getLightBurnExportOrigin,
  getRecommendedCircumference,
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

test("exportOriginXmm centers correctly from rotaryCenterXmm and templateWidthMm", () => {
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

test("non-rotary export path remains unchanged", () => {
  const payload = buildLightBurnExportPayload({
    workspaceMode: "flat-bed",
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
      enabled: true,
      preset: PRESET,
      anchorMode: "physical-top",
    },
  });

  assert.equal(payload.rotaryAutoPlacementApplied, false);
  assert.equal(payload.items[0].xMm, 10);
  assert.equal(payload.items[0].yMm, 20);
});

test("toggle OFF preserves current export behavior", () => {
  const artifacts = buildLightBurnExportArtifacts({
    includeLightBurnSetup: false,
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
  // origin=(70,22) => item=(80,37)
  assert.equal(artifacts.artworkPayload.items[0].xMm, 80);
  assert.equal(artifacts.artworkPayload.items[0].yMm, 37);
});

test("toggle ON builds sidecar data and summary", () => {
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
    includeLightBurnSetup: true,
    bedConfig: config,
    workspaceMode: "tumbler-wrap",
    templateWidthMm: 276.15,
    templateHeightMm: 160,
    items: [],
    rotary: {
      enabled: false,
      preset: PRESET,
      anchorMode: "physical-top",
    },
  });

  assert.ok(artifacts.sidecar);
  assert.ok(artifacts.setupSummary);
  assert.equal(artifacts.sidecar?.product.templateWidthMm, 276.15);
  assert.equal(artifacts.sidecar?.rotary.presetId, PRESET.id);
});

test("straight tumbler uses outsideDiameterMm", () => {
  const diameter = getRecommendedRotaryDiameter({
    shapeType: "straight",
    outsideDiameterMm: 87.9,
    topDiameterMm: 85,
    bottomDiameterMm: 90,
  });
  assert.equal(diameter, 87.9);
});

test("tapered tumbler uses largest diameter for recommended object size", () => {
  const diameter = getRecommendedRotaryDiameter({
    shapeType: "tapered",
    outsideDiameterMm: 87,
    topDiameterMm: 95.2,
    bottomDiameterMm: 84.1,
  });
  assert.equal(diameter, 95.2);
});

test("recommended circumference uses template width when available", () => {
  const circumference = getRecommendedCircumference({
    templateWidthMm: 276.15,
    recommendedDiameterMm: 87.9,
  });
  assert.equal(circumference, 276.15);
});

test("lightburn origin helper uses bed-center fallback when preset is missing", () => {
  const origin = getLightBurnExportOrigin({
    templateWidthMm: 276.15,
    preset: null,
    manualRotaryTopYmm: 22,
    bedWidthMm: 300,
    anchorMode: "physical-top",
  });
  assert.ok(origin);
  assert.equal(origin?.xMm, 11.925);
  assert.equal(origin?.yMm, 22);
});

test("incomplete setup adds warnings but keeps artwork export valid", () => {
  const config = {
    ...DEFAULT_BED_CONFIG,
    workspaceMode: "tumbler-wrap" as const,
    tumblerShapeType: "straight" as const,
    tumblerOutsideDiameterMm: Number.NaN,
    tumblerDiameterMm: Number.NaN,
    width: 0,
    height: 160,
  };

  const artifacts = buildLightBurnExportArtifacts({
    includeLightBurnSetup: true,
    bedConfig: config,
    workspaceMode: "tumbler-wrap",
    templateWidthMm: 0,
    templateHeightMm: 160,
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
      preset: null,
      anchorMode: "physical-top",
    },
  });

  assert.ok(artifacts.sidecar);
  assert.equal(artifacts.artworkPayload.items[0].xMm, 10);
  assert.equal(artifacts.artworkPayload.items[0].yMm, 20);
  assert.ok(artifacts.setupWarnings.length > 0);
  assert.match(artifacts.setupWarnings.join(" | "), /No rotary preset selected/i);
});

test("non-tumbler include setup does not break artwork export and omits sidecar", () => {
  const artifacts = buildLightBurnExportArtifacts({
    includeLightBurnSetup: true,
    bedConfig: DEFAULT_BED_CONFIG,
    workspaceMode: "flat-bed",
    templateWidthMm: 300,
    templateHeightMm: 300,
    items: [],
    rotary: {
      enabled: true,
      preset: PRESET,
      anchorMode: "physical-top",
    },
  });

  assert.equal(artifacts.sidecar, null);
  assert.ok(artifacts.setupWarnings.some((warning) => /tumbler mode/i.test(warning)));
});

test("setup summary includes required compact fields", () => {
  const { sidecar } = buildLt316Sidecar({
    bedConfig: {
      ...DEFAULT_BED_CONFIG,
      workspaceMode: "tumbler-wrap",
      tumblerShapeType: "straight",
      tumblerOutsideDiameterMm: 87.9,
      tumblerTopDiameterMm: 87.9,
      tumblerBottomDiameterMm: 87.9,
      width: 276.15,
      height: 160,
    },
    workspaceMode: "tumbler-wrap",
    templateWidthMm: 276.15,
    templateHeightMm: 160,
    rotary: {
      preset: {
        ...PRESET,
        rotaryCenterXmm: 256.275,
        rotaryTopYmm: 32,
        chuckOrRoller: "chuck",
      },
      anchorMode: "physical-top",
    },
  });

  assert.ok(sidecar);
  const summary = buildLightBurnSetupSummary(sidecar!);
  assert.match(summary, /Rotary preset:/);
  assert.match(summary, /Rotary mode: chuck/);
  assert.match(summary, /Origin X: 118\.20 mm/);
  assert.match(summary, /Origin Y: 32\.00 mm/);
});
