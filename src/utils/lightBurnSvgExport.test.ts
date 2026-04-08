import test from "node:test";
import assert from "node:assert/strict";

import { buildLightBurnAlignmentGuideSvg, buildLightBurnExportSvg } from "./lightBurnSvgExport.ts";
import type { LightBurnAlignmentGuidePayload, LightBurnExportPayload } from "../types/export.ts";

const LIGHTBURN_PX_PER_MM = 96 / 25.4;

function buildPayload(itemOverrides: Partial<LightBurnExportPayload["items"][number]> = {}): LightBurnExportPayload {
  return {
    kind: "lt316-lightburn-export",
    workspaceMode: "tumbler-wrap",
    templateWidthMm: 276.15,
    templateHeightMm: 160,
    generatedAt: "2026-03-26T00:00:00.000Z",
    rotaryAutoPlacementApplied: true,
    cylinder: {
      objectDiameterMm: 87.9,
      splitWidthMm: 276.15,
      printableHeightMm: 160,
      shapeType: "straight",
    },
    rotary: {
      enabled: true,
      presetId: "preset-a",
      presetName: "Preset A",
      bedOrigin: "top-left",
      chuckOrRoller: "roller",
      stepsPerRotation: null,
      sprCorrectionFactor: null,
      anchorMode: "physical-top",
      rotaryCenterXmm: 170,
      rotaryTopYmm: 22,
      exportOriginXmm: 31.96,
      exportOriginYmm: 22,
    },
    warnings: [],
    items: [
      {
        id: "item-1",
        assetId: "asset-1",
        name: "Scrollwork",
        xMm: 40,
        yMm: 18,
        widthMm: 120,
        heightMm: 60,
        rotationDeg: 0,
        svgText: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 30 15"><path d="M10 20 L40 35" /></svg>`,
        ...itemOverrides,
      },
    ],
  };
}

test("buildLightBurnExportSvg bakes simple geometry into world-space paths", () => {
  const svg = buildLightBurnExportSvg(buildPayload());

  assert.match(svg, /width="1043\.7165"/);
  assert.match(svg, /height="604\.7244"/);
  const scaleX = ((120 / 30) * LIGHTBURN_PX_PER_MM).toFixed(6);
  const scaleY = ((60 / 15) * LIGHTBURN_PX_PER_MM).toFixed(6);
  assert.match(
    svg,
    new RegExp(
      `<g transform="translate\\(151\\.1811 68\\.0315\\) scale\\(${scaleX} ${scaleY}\\) translate\\(-10\\.0000 -20\\.0000\\)">`
    )
  );
  assert.match(svg, /<path d="M10 20 L40 35"\s*\/>/);
});

test("buildLightBurnExportSvg preserves item rotation as a wrapper transform", () => {
  const svg = buildLightBurnExportSvg(
    buildPayload({
      rotationDeg: 12.5,
      xMm: 25,
      yMm: 10,
      widthMm: 80,
      heightMm: 40,
    })
  );

  assert.match(svg, /<g transform="rotate\(12\.5000 245\.6693 113\.3858\)">/);
});

test("buildLightBurnExportSvg preserves bezier path commands and original styling", () => {
  const svg = buildLightBurnExportSvg(
    buildPayload({
      svgText: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><path d="M0 5 C5 0, 15 10, 20 5" fill="none" stroke="#123456" stroke-width="2"/></svg>`,
    })
  );

  assert.match(svg, /d="M0 5 C5 0, 15 10, 20 5"/);
  assert.match(svg, /stroke="#123456"/);
  assert.match(svg, /fill="none"/);
});

test("buildLightBurnExportSvg keeps text items as transformed original svg content", () => {
  const svg = buildLightBurnExportSvg(
    buildPayload({
      svgText: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text x="1" y="5">ABC</text></svg>`,
    })
  );

  const scaleX = ((120 / 10) * LIGHTBURN_PX_PER_MM).toFixed(6);
  const scaleY = ((60 / 10) * LIGHTBURN_PX_PER_MM).toFixed(6);
  assert.match(
    svg,
    new RegExp(
      `<g transform="translate\\(151\\.1811 68\\.0315\\) scale\\(${scaleX} ${scaleY}\\) translate\\(0\\.0000 0\\.0000\\)">`
    )
  );
  assert.match(svg, /<text x="1" y="5">ABC<\/text>/);
});

test("buildLightBurnAlignmentGuideSvg renders horizontal printable boundary guides", () => {
  const payload: LightBurnAlignmentGuidePayload = {
    kind: "lt316-lightburn-alignment-guides",
    workspaceMode: "tumbler-wrap",
    templateWidthMm: 276.15,
    templateHeightMm: 160,
    generatedAt: "2026-04-06T00:00:00.000Z",
    units: "mm",
    origin: "top-left",
    wrapWidthAuthoritative: true,
    bodyOnlyWrapSpace: true,
    wrapMappingMm: {
      frontMeridianMm: 207.1,
      backMeridianMm: 69.05,
      leftQuarterMm: 138.08,
      rightQuarterMm: 0,
    },
    keepOutRegion: null,
    logoRegion: null,
    warnings: [],
    lines: [
      {
        id: "guide-printable-top",
        kind: "printable-top",
        label: "Printable top",
        orientation: "horizontal",
        yMm: 18,
      },
      {
        id: "guide-front-meridian",
        kind: "front-meridian",
        label: "Front center",
        orientation: "vertical",
        xMm: 207.1,
      },
    ],
  };

  const svg = buildLightBurnAlignmentGuideSvg(payload);

  assert.match(svg, /<line x1="0" y1="68\.0315" x2="1043\.7165" y2="68\.0315"/);
  assert.match(svg, /<line x1="782\.7402" y1="0" x2="782\.7402" y2="604\.7244"/);
});
