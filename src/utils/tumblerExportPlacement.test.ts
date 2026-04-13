import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BED_CONFIG } from "../types/admin.ts";
import type { RotaryPlacementPreset } from "../types/export.ts";
import {
  buildLightBurnAlignmentGuidePayload,
  buildLightBurnExportArtifacts,
  buildLightBurnExportPayload,
  buildLightBurnSetupSummary,
  collectHandleKeepOutWarnings,
  collectLogoPrintableSurfaceWarnings,
  collectPrintableSurfaceWarnings,
  buildLt316Sidecar,
  collectLogoKeepOutWarnings,
  getLightBurnExportOrigin,
  getRecommendedCircumference,
  getRecommendedRotaryDiameter,
  getRotaryExportOrigin,
  mapLogoPlacementToWrapRegion,
  resolvePrintableTopOffsetForWorkspace,
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
    bedConfig: DEFAULT_BED_CONFIG,
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

test("alignment guide payload uses canonical wrap mapping", () => {
  const guidePayload = buildLightBurnAlignmentGuidePayload({
    workspaceMode: "tumbler-wrap",
    templateWidthMm: 345.58,
    templateHeightMm: 240,
    calibration: {
      units: "mm",
      totalHeightMm: 297,
      bodyHeightMm: 240,
      lidBodyLineMm: 30,
      bodyBottomMm: 270,
      wrapDiameterMm: 110,
      baseDiameterMm: 78.7,
      wrapWidthMm: 345.58,
      frontVisibleWidthMm: 110,
      frontAxisPx: { xTop: 120, yTop: 10, xBottom: 120, yBottom: 260 },
      photoToFrontTransform: { type: "affine", matrix: [1, 0, 0, 0, 1, 0] },
      svgFrontViewBoxMm: { x: -55, y: 0, width: 110, height: 297 },
      wrapMappingMm: {
        frontMeridianMm: 259.19,
        backMeridianMm: 86.4,
        leftQuarterMm: 172.79,
        rightQuarterMm: 345.58 * 0.0,
        handleMeridianMm: 86.4,
        handleKeepOutArcDeg: 90,
        handleKeepOutWidthMm: 86.4,
        handleKeepOutStartMm: 43.2,
        handleKeepOutEndMm: 129.6,
      },
      printableSurfaceContract: {
        printableTopMm: 48,
        printableBottomMm: 258,
        printableHeightMm: 210,
        axialExclusions: [
          { kind: "lid", startMm: 0, endMm: 36 },
          { kind: "rim-ring", startMm: 36, endMm: 48 },
        ],
        circumferentialExclusions: [
          { kind: "handle", startMm: 43.2, endMm: 129.6, wraps: false },
        ],
      },
      axialSurfaceBands: [
        { id: "lid-1", kind: "lid", sStart: 0, sEnd: 0.12, printable: false, confidence: 0.9 },
        { id: "rim-1", kind: "rim-ring", sStart: 0.12, sEnd: 0.16, printable: false, confidence: 0.9 },
      ],
      glbScale: { unitsPerMm: 1 },
    },
  });

  assert.ok(guidePayload);
  assert.equal(guidePayload?.lines.find((line) => line.kind === "front-meridian")?.xMm, 259.19);
  assert.equal(guidePayload?.keepOutRegion?.startMm, 43.2);
  assert.equal(guidePayload?.lines.find((line) => line.kind === "printable-top")?.orientation, "horizontal");
  assert.equal(guidePayload?.lines.find((line) => line.kind === "printable-top")?.yMm, 18);
  assert.equal(guidePayload?.lines.find((line) => line.kind === "printable-bottom")?.yMm, 228);
  assert.equal(guidePayload?.bodyOnlyWrapSpace, true);
  assert.equal(guidePayload?.wrapWidthAuthoritative, true);
});

test("alignment guide payload rebases printable boundaries into cropped printable-local workspace", () => {
  const guidePayload = buildLightBurnAlignmentGuidePayload({
    workspaceMode: "tumbler-wrap",
    templateWidthMm: 345.58,
    templateHeightMm: 210,
    calibration: {
      units: "mm",
      totalHeightMm: 297,
      bodyHeightMm: 240,
      lidBodyLineMm: 30,
      bodyBottomMm: 270,
      wrapDiameterMm: 110,
      baseDiameterMm: 78.7,
      wrapWidthMm: 345.58,
      frontVisibleWidthMm: 110,
      frontAxisPx: { xTop: 120, yTop: 10, xBottom: 120, yBottom: 260 },
      photoToFrontTransform: { type: "affine", matrix: [1, 0, 0, 0, 1, 0] },
      svgFrontViewBoxMm: { x: -55, y: 0, width: 110, height: 297 },
      wrapMappingMm: {
        frontMeridianMm: 259.19,
        backMeridianMm: 86.4,
        leftQuarterMm: 172.79,
        rightQuarterMm: 0,
        handleMeridianMm: 86.4,
        handleKeepOutArcDeg: 90,
        handleKeepOutWidthMm: 86.4,
        handleKeepOutStartMm: 43.2,
        handleKeepOutEndMm: 129.6,
      },
      printableSurfaceContract: {
        printableTopMm: 48,
        printableBottomMm: 258,
        printableHeightMm: 210,
        axialExclusions: [
          { kind: "lid", startMm: 0, endMm: 36 },
          { kind: "rim-ring", startMm: 36, endMm: 48 },
        ],
        circumferentialExclusions: [
          { kind: "handle", startMm: 43.2, endMm: 129.6, wraps: false },
        ],
      },
      axialSurfaceBands: [],
      glbScale: { unitsPerMm: 1 },
    },
    manufacturerLogoStamp: {
      dataUrl: "data:image/png;base64,fixture",
      placement: { offsetXMm: 0, centerYFromTopMm: 150, widthMm: 28, heightMm: 18 },
      logoPlacement: {
        source: "manual",
        sCenter: 0.5,
        sSpan: 0.1,
        thetaCenter: 0,
        thetaSpan: 0.1,
        confidence: 1,
      },
      orientationLandmarks: {
        thetaFront: 0,
        thetaBack: Math.PI,
        confidence: 1,
      },
      source: "front-photo",
    },
  });

  assert.ok(guidePayload);
  assert.equal(guidePayload?.lines.find((line) => line.kind === "printable-top")?.yMm, 0);
  assert.equal(guidePayload?.lines.find((line) => line.kind === "printable-bottom")?.yMm, 210);
  assert.equal(guidePayload?.lines.find((line) => line.kind === "lid-boundary")?.yMm, 0);
  assert.equal(guidePayload?.lines.find((line) => line.kind === "rim-boundary")?.yMm, 0);
  assert.equal(guidePayload?.logoRegion?.centerYMm, 102);
});

test("resolvePrintableTopOffsetForWorkspace returns zero when the workspace is already printable-local", () => {
  assert.equal(
    resolvePrintableTopOffsetForWorkspace({
      workspaceHeightMm: 210,
      printableHeightMm: 210,
      printableTopOffsetMm: 18,
    }),
    0,
  );
  assert.equal(
    resolvePrintableTopOffsetForWorkspace({
      workspaceHeightMm: 240,
      printableHeightMm: 210,
      printableTopOffsetMm: 18,
    }),
    18,
  );
});

test("logo placement maps from canonical theta/s into wrap coordinates", () => {
  const logoRegion = mapLogoPlacementToWrapRegion({
    templateWidthMm: 345.58,
    templateHeightMm: 240,
    calibration: {
      units: "mm",
      totalHeightMm: 297,
      bodyHeightMm: 240,
      lidBodyLineMm: 30,
      bodyBottomMm: 270,
      wrapDiameterMm: 110,
      baseDiameterMm: 78.7,
      wrapWidthMm: 345.58,
      frontVisibleWidthMm: 110,
      frontAxisPx: { xTop: 120, yTop: 10, xBottom: 120, yBottom: 260 },
      photoToFrontTransform: { type: "affine", matrix: [1, 0, 0, 0, 1, 0] },
      svgFrontViewBoxMm: { x: -55, y: 0, width: 110, height: 297 },
      wrapMappingMm: {
        frontMeridianMm: 259.19,
        backMeridianMm: 86.4,
        leftQuarterMm: 172.79,
        rightQuarterMm: 0,
        handleMeridianMm: 86.4,
        handleKeepOutArcDeg: 90,
        handleKeepOutWidthMm: 86.4,
        handleKeepOutStartMm: 43.2,
        handleKeepOutEndMm: 129.6,
      },
      glbScale: { unitsPerMm: 1 },
    },
    stamp: {
      dataUrl: "data:image/png;base64,abc",
      source: "front-photo",
      placement: {
        offsetXMm: 0,
        centerYFromTopMm: 100,
        widthMm: 30,
        heightMm: 20,
      },
      logoPlacement: {
        source: "uploaded-image",
        thetaCenter: 0,
        thetaSpan: 0.4,
        sCenter: 0.35,
        sSpan: 0.12,
        confidence: 0.91,
      },
      orientationLandmarks: {
        thetaFront: 0,
        thetaBack: Math.PI,
        confidence: 0.8,
      },
    },
  });

  assert.ok(logoRegion);
  assert.equal(logoRegion?.centerXMm, 259.19);
  assert.equal(logoRegion?.centerYMm, 84);
  assert.equal(logoRegion?.source, "uploaded-image");
});

test("locked production export warns when artwork crosses handle keep-out sector", () => {
  const warnings = collectHandleKeepOutWarnings({
    wrapWidthMm: 345.58,
    lockedProductionGeometry: true,
    calibration: {
      units: "mm",
      totalHeightMm: 297,
      bodyHeightMm: 240,
      lidBodyLineMm: 30,
      bodyBottomMm: 270,
      wrapDiameterMm: 110,
      baseDiameterMm: 78.7,
      wrapWidthMm: 345.58,
      frontVisibleWidthMm: 110,
      frontAxisPx: { xTop: 120, yTop: 10, xBottom: 120, yBottom: 260 },
      photoToFrontTransform: { type: "affine", matrix: [1, 0, 0, 0, 1, 0] },
      svgFrontViewBoxMm: { x: -55, y: 0, width: 110, height: 297 },
      wrapMappingMm: {
        frontMeridianMm: 259.19,
        backMeridianMm: 86.4,
        leftQuarterMm: 172.79,
        rightQuarterMm: 0,
        handleMeridianMm: 86.4,
        handleKeepOutArcDeg: 90,
        handleKeepOutWidthMm: 86.4,
        handleKeepOutStartMm: 43.2,
        handleKeepOutEndMm: 129.6,
      },
      glbScale: { unitsPerMm: 1 },
    },
    items: [
      { id: "a", name: "Logo", x: 60, width: 40 },
    ],
  });

  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? "", /crosses the handle keep-out sector/i);
});

test("locked production export warns when canonical logo crosses handle keep-out sector", () => {
  const warnings = collectLogoKeepOutWarnings({
    wrapWidthMm: 345.58,
    lockedProductionGeometry: true,
    calibration: {
      units: "mm",
      totalHeightMm: 297,
      bodyHeightMm: 240,
      lidBodyLineMm: 30,
      bodyBottomMm: 270,
      wrapDiameterMm: 110,
      baseDiameterMm: 78.7,
      wrapWidthMm: 345.58,
      frontVisibleWidthMm: 110,
      frontAxisPx: { xTop: 120, yTop: 10, xBottom: 120, yBottom: 260 },
      photoToFrontTransform: { type: "affine", matrix: [1, 0, 0, 0, 1, 0] },
      svgFrontViewBoxMm: { x: -55, y: 0, width: 110, height: 297 },
      wrapMappingMm: {
        frontMeridianMm: 259.19,
        backMeridianMm: 86.4,
        leftQuarterMm: 172.79,
        rightQuarterMm: 0,
        handleMeridianMm: 86.4,
        handleKeepOutArcDeg: 90,
        handleKeepOutWidthMm: 86.4,
        handleKeepOutStartMm: 43.2,
        handleKeepOutEndMm: 129.6,
      },
      glbScale: { unitsPerMm: 1 },
    },
    logoRegion: {
      label: "Front logo region",
      centerXMm: 86.4,
      centerYMm: 96,
      widthMm: 40,
      heightMm: 22,
      wrapsAround: false,
      source: "uploaded-image",
      confidence: 0.85,
    },
  });

  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? "", /logo region overlaps the handle keep-out sector/i);
});

test("locked production export warns when artwork crosses printable top or bottom boundaries", () => {
  const calibration = {
    units: "mm" as const,
    totalHeightMm: 297,
    bodyHeightMm: 240,
    lidBodyLineMm: 30,
    bodyBottomMm: 270,
    wrapDiameterMm: 110,
    baseDiameterMm: 78.7,
    wrapWidthMm: 345.58,
    frontVisibleWidthMm: 110,
    frontAxisPx: { xTop: 120, yTop: 10, xBottom: 120, yBottom: 260 },
    photoToFrontTransform: { type: "affine" as const, matrix: [1, 0, 0, 0, 1, 0] },
    svgFrontViewBoxMm: { x: -55, y: 0, width: 110, height: 297 },
    wrapMappingMm: {
      frontMeridianMm: 259.19,
      backMeridianMm: 86.4,
      leftQuarterMm: 172.79,
      rightQuarterMm: 0,
    },
    glbScale: { unitsPerMm: 1 },
  };
  const warnings = collectPrintableSurfaceWarnings({
    lockedProductionGeometry: true,
    templateHeightMm: 240,
    items: [
      { id: "a", name: "Logo", y: 4, height: 24 },
      { id: "b", name: "Wrap", y: 200, height: 36 },
    ],
    calibration,
    printableSurfaceContract: {
      printableTopMm: 48,
      printableBottomMm: 210,
      printableHeightMm: 192,
      axialExclusions: [],
      circumferentialExclusions: [],
    },
  });

  assert.equal(warnings.length, 2);
  assert.match(warnings[0] ?? "", /locked printable-height boundary/i);
  assert.match(warnings[1] ?? "", /locked printable-height boundary/i);
});

test("locked production export warns when logo region crosses printable top boundary", () => {
  const calibration = {
    units: "mm" as const,
    totalHeightMm: 297,
    bodyHeightMm: 240,
    lidBodyLineMm: 30,
    bodyBottomMm: 270,
    wrapDiameterMm: 110,
    baseDiameterMm: 78.7,
    wrapWidthMm: 345.58,
    frontVisibleWidthMm: 110,
    frontAxisPx: { xTop: 120, yTop: 10, xBottom: 120, yBottom: 260 },
    photoToFrontTransform: { type: "affine" as const, matrix: [1, 0, 0, 0, 1, 0] },
    svgFrontViewBoxMm: { x: -55, y: 0, width: 110, height: 297 },
    wrapMappingMm: {
      frontMeridianMm: 259.19,
      backMeridianMm: 86.4,
      leftQuarterMm: 172.79,
      rightQuarterMm: 0,
    },
    glbScale: { unitsPerMm: 1 },
  };
  const warnings = collectLogoPrintableSurfaceWarnings({
    lockedProductionGeometry: true,
    templateHeightMm: 240,
    logoRegion: {
      label: "Front logo region",
      centerXMm: 120,
      centerYMm: 10,
      widthMm: 30,
      heightMm: 16,
      wrapsAround: false,
      source: "uploaded-image",
      confidence: 0.91,
    },
    calibration,
    printableSurfaceContract: {
      printableTopMm: 48,
      printableBottomMm: 220,
      printableHeightMm: 202,
      axialExclusions: [],
      circumferentialExclusions: [],
    },
  });

  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? "", /logo region overlaps the locked printable-height boundary/i);
});
