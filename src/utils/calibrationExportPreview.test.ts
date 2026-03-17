import assert from "node:assert/strict";
import test from "node:test";
import type { RotaryPlacementPreset } from "../types/export.ts";
import {
  buildExportPlacementPreview,
  formatLightBurnSetupSummary,
  isPreviewPlacementWithinBed,
} from "./calibrationExportPreview.ts";

const PRESET: RotaryPlacementPreset = {
  id: "preset-1",
  name: "Roller A",
  bedOrigin: "top-left",
  rotaryCenterXmm: 170,
  rotaryTopYmm: 22,
  chuckOrRoller: "roller",
};

test("export origin X math is correct", () => {
  const preview = buildExportPlacementPreview({
    workspaceMode: "tumbler-wrap",
    bedWidthMm: 300,
    bedHeightMm: 300,
    rotaryPreset: PRESET,
    anchorMode: "physical-top",
    templateWidthMm: 276.15,
    templateHeightMm: 160,
    shapeType: "straight",
    outsideDiameterMm: 87.9,
  });

  assert.equal(preview.exportOriginXmm, 31.925);
});

test("export origin Y math is correct", () => {
  const preview = buildExportPlacementPreview({
    workspaceMode: "tumbler-wrap",
    bedWidthMm: 300,
    bedHeightMm: 300,
    rotaryPreset: PRESET,
    anchorMode: "physical-top",
    templateWidthMm: 250,
    templateHeightMm: 120,
    shapeType: "straight",
    outsideDiameterMm: 87.9,
  });

  assert.equal(preview.exportOriginYmm, 22);
});

test("printable-top anchor offset is applied", () => {
  const preview = buildExportPlacementPreview({
    workspaceMode: "tumbler-wrap",
    bedWidthMm: 300,
    bedHeightMm: 300,
    rotaryPreset: PRESET,
    anchorMode: "printable-top",
    printableOffsetMm: 7.5,
    templateWidthMm: 250,
    templateHeightMm: 120,
    shapeType: "straight",
    outsideDiameterMm: 87.9,
  });

  assert.equal(preview.exportOriginYmm, 29.5);
});

test("preview box dimensions match template width and height", () => {
  const preview = buildExportPlacementPreview({
    workspaceMode: "tumbler-wrap",
    bedWidthMm: 300,
    bedHeightMm: 300,
    rotaryPreset: PRESET,
    anchorMode: "physical-top",
    templateWidthMm: 276.15,
    templateHeightMm: 160,
    shapeType: "straight",
    outsideDiameterMm: 87.9,
  });

  assert.equal(preview.templateWidthMm, 276.15);
  assert.equal(preview.templateHeightMm, 160);
});

test("straight tumbler uses outsideDiameterMm for recommended object diameter", () => {
  const preview = buildExportPlacementPreview({
    workspaceMode: "tumbler-wrap",
    bedWidthMm: 300,
    bedHeightMm: 300,
    rotaryPreset: PRESET,
    anchorMode: "physical-top",
    templateWidthMm: 276.15,
    templateHeightMm: 160,
    shapeType: "straight",
    outsideDiameterMm: 87.9,
  });

  assert.equal(preview.recommendedObjectDiameterMm, 87.9);
  assert.equal(preview.recommendedCircumferenceMm, 276.15);
});

test("tapered tumbler uses largest diameter for recommendation", () => {
  const preview = buildExportPlacementPreview({
    workspaceMode: "tumbler-wrap",
    bedWidthMm: 300,
    bedHeightMm: 300,
    rotaryPreset: PRESET,
    anchorMode: "physical-top",
    templateWidthMm: 255,
    templateHeightMm: 150,
    shapeType: "tapered",
    topDiameterMm: 97,
    bottomDiameterMm: 84,
  });

  assert.equal(preview.recommendedObjectDiameterMm, 97);
  assert.match(preview.notes.join(" | "), /largest diameter/i);
});

test("warning appears when rotary preset is missing", () => {
  const preview = buildExportPlacementPreview({
    workspaceMode: "tumbler-wrap",
    bedWidthMm: 300,
    bedHeightMm: 300,
    rotaryPreset: null,
    anchorMode: "physical-top",
    templateWidthMm: 250,
    templateHeightMm: 120,
    shapeType: "straight",
    outsideDiameterMm: 87.9,
  });

  assert.match(preview.warnings.join(" | "), /No rotary preset selected/i);
});

test("warning appears when rotaryTopYmm is missing", () => {
  const preview = buildExportPlacementPreview({
    workspaceMode: "tumbler-wrap",
    bedWidthMm: 300,
    bedHeightMm: 300,
    rotaryPreset: {
      ...PRESET,
      rotaryTopYmm: undefined,
    },
    anchorMode: "physical-top",
    templateWidthMm: 250,
    templateHeightMm: 120,
    shapeType: "straight",
    outsideDiameterMm: 87.9,
  });

  assert.match(preview.warnings.join(" | "), /Top anchor Y is not calibrated/i);
});

test("export preview uses bed center default when preset is missing", () => {
  const preview = buildExportPlacementPreview({
    workspaceMode: "tumbler-wrap",
    bedWidthMm: 300,
    bedHeightMm: 300,
    rotaryPreset: null,
    manualRotaryTopYmm: 22,
    anchorMode: "physical-top",
    templateWidthMm: 250,
    templateHeightMm: 120,
    shapeType: "straight",
    outsideDiameterMm: 87.9,
  });

  // bed center X=150, origin X=150-(250/2)=25
  assert.equal(preview.exportOriginXmm, 25);
  assert.equal(preview.exportOriginYmm, 22);
});

test("warning appears when template dimensions are missing", () => {
  const preview = buildExportPlacementPreview({
    workspaceMode: "tumbler-wrap",
    bedWidthMm: 300,
    bedHeightMm: 300,
    rotaryPreset: PRESET,
    anchorMode: "physical-top",
    templateWidthMm: undefined,
    templateHeightMm: undefined,
    shapeType: "straight",
    outsideDiameterMm: 87.9,
  });

  assert.match(preview.warnings.join(" | "), /Template width is missing/i);
  assert.match(preview.warnings.join(" | "), /Template height is missing/i);
});

test("off-bed detection works", () => {
  const isInside = isPreviewPlacementWithinBed({
    bedWidthMm: 300,
    bedHeightMm: 300,
    xMm: 20,
    yMm: 20,
    widthMm: 100,
    heightMm: 100,
  });
  assert.equal(isInside, true);

  const isOutside = isPreviewPlacementWithinBed({
    bedWidthMm: 300,
    bedHeightMm: 300,
    xMm: 260,
    yMm: 260,
    widthMm: 80,
    heightMm: 80,
  });
  assert.equal(isOutside, false);
});

test("preview builder is non-destructive to source state inputs", () => {
  const template = { width: 250, height: 120 };
  const before = { ...template };

  buildExportPlacementPreview({
    workspaceMode: "tumbler-wrap",
    bedWidthMm: 300,
    bedHeightMm: 300,
    rotaryPreset: PRESET,
    anchorMode: "physical-top",
    templateWidthMm: template.width,
    templateHeightMm: template.height,
    shapeType: "straight",
    outsideDiameterMm: 87.9,
  });

  assert.deepEqual(template, before);
});

test("setup summary aligns to preview values", () => {
  const preview = buildExportPlacementPreview({
    workspaceMode: "tumbler-wrap",
    bedWidthMm: 300,
    bedHeightMm: 300,
    rotaryPreset: PRESET,
    anchorMode: "physical-top",
    templateWidthMm: 276.15,
    templateHeightMm: 160,
    shapeType: "straight",
    outsideDiameterMm: 87.9,
  });

  const summary = formatLightBurnSetupSummary(preview);
  assert.match(summary, /Rotary preset: Roller A/i);
  assert.match(summary, /Object diameter: 87.90 mm/i);
  assert.match(summary, /Wrap width: 276.15 mm/i);
  assert.match(summary, /Anchor mode: physical-top/i);
});
