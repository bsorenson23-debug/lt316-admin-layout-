import test from "node:test";
import assert from "node:assert/strict";

import { buildLightBurnLbrn } from "./lightBurnLbrnExport.ts";
import type { LightBurnExportPayload } from "../types/export.ts";

function buildPayload(): LightBurnExportPayload {
  return {
    kind: "lt316-lightburn-export",
    workspaceMode: "tumbler-wrap",
    templateWidthMm: 200,
    templateHeightMm: 100,
    generatedAt: "2026-03-27T00:00:00.000Z",
    rotaryAutoPlacementApplied: true,
    cylinder: {
      objectDiameterMm: 98,
      splitWidthMm: 307.88,
      printableHeightMm: 100,
      shapeType: "straight",
    },
    rotary: {
      enabled: true,
      presetId: "preset-1",
      presetName: "Preset 1",
      bedOrigin: "top-left",
      chuckOrRoller: "roller",
      anchorMode: "physical-top",
      rotaryCenterXmm: 150,
      rotaryTopYmm: 10,
      exportOriginXmm: 5,
      exportOriginYmm: 7,
    },
    warnings: [],
    items: [
      {
        id: "item-1",
        assetId: "asset-1",
        name: "Artwork",
        xMm: 10,
        yMm: 20,
        widthMm: 80,
        heightMm: 40,
        rotationDeg: 0,
        svgText: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0 L10 10" /></svg>`,
      },
    ],
  };
}

test("buildLightBurnLbrn minimal mode emits artwork-only project", () => {
  const xml = buildLightBurnLbrn(
    buildPayload(),
    undefined,
    undefined,
    { mode: "minimal" },
  );

  assert.match(xml, /Minimal artwork-only export/);
  assert.match(xml, /<CutSetting type="Cut">/);
  assert.doesNotMatch(xml, /<RotarySetup\b/);
  assert.doesNotMatch(xml, /Template Bounds/);
  assert.doesNotMatch(xml, /<Shape Type="Text"/);
  assert.match(xml, /<Shape Type="Group" CutIndex="0">/);
  assert.match(xml, /<XForm>1 0 0 1 5\.0000 107\.0000<\/XForm>/);
  assert.match(xml, /<Shape Type="Path"/);
  assert.match(xml, /<VertList>V10\.0000 -20\.0000V90\.0000 -60\.0000<\/VertList>/);
});
