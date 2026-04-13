import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPrintableSurfaceResolution,
  getPrintableSurfaceResolutionFromDimensions,
  normalizeProductTemplatePrintableSurface,
} from "./printableSurface.ts";

test("buildPrintableSurfaceResolution keeps body bounds authoritative while preserving lid/ring exclusions", () => {
  const resolution = buildPrintableSurfaceResolution({
    overallHeightMm: 297,
    bodyTopFromOverallMm: 30,
    bodyBottomFromOverallMm: 270,
    detection: {
      source: "photo-row-scan",
      lidSeamFromOverallMm: 36,
      rimRingBottomFromOverallMm: 49,
      confidence: 0.78,
    },
    handleKeepOutStartMm: 42,
    handleKeepOutEndMm: 128,
  });

  assert.equal(resolution.printableSurfaceContract.printableTopMm, 30);
  assert.equal(resolution.printableSurfaceContract.printableBottomMm, 270);
  assert.equal(resolution.printableSurfaceContract.printableHeightMm, 240);
  assert.deepEqual(
    resolution.printableSurfaceContract.axialExclusions,
    [
      { kind: "lid", startMm: 0, endMm: 36 },
      { kind: "rim-ring", startMm: 36, endMm: 49 },
    ],
  );
  assert.deepEqual(
    resolution.printableSurfaceContract.axialExclusions.map((band) => band.kind),
    ["lid", "rim-ring"],
  );
  assert.equal(resolution.printableSurfaceContract.circumferentialExclusions[0]?.kind, "handle");
  assert.equal(resolution.topBoundarySource, "body-top-fallback");
  assert.equal(resolution.authoritySource, "derived-fallback");
});

test("getPrintableSurfaceResolutionFromDimensions preserves saved printable boundaries without live detection", () => {
  const resolution = getPrintableSurfaceResolutionFromDimensions({
    diameterMm: 99.8,
    printHeightMm: 210.5,
    templateWidthMm: 313.6,
    handleArcDeg: 90,
    taperCorrection: "bottom-narrow",
    overallHeightMm: 297,
    bodyTopFromOverallMm: 30,
    bodyBottomFromOverallMm: 270,
    printableSurfaceContract: {
      printableTopMm: 48.5,
      printableBottomMm: 259,
      printableHeightMm: 210.5,
      axialExclusions: [
        { kind: "lid", startMm: 0, endMm: 35 },
        { kind: "rim-ring", startMm: 35, endMm: 48.5 },
        { kind: "base", startMm: 259, endMm: 270 },
      ],
      circumferentialExclusions: [
        { kind: "handle", startMm: 40, endMm: 126, wraps: false },
      ],
    },
  }, null);

  assert.ok(resolution);
  assert.equal(resolution?.printableSurfaceContract.printableTopMm, 48.5);
  assert.equal(resolution?.printableSurfaceContract.printableBottomMm, 259);
  assert.equal(resolution?.printableTopFromBodyTopMm, 18.5);
  assert.equal(resolution?.printableBottomFromBodyTopMm, 229);
});

test("getPrintableSurfaceResolutionFromDimensions rebuilds semantic top exclusions from saved seam/ring dimensions", () => {
  const resolution = getPrintableSurfaceResolutionFromDimensions({
    diameterMm: 99.8,
    printHeightMm: 214,
    templateWidthMm: 313.59,
    handleArcDeg: 90,
    taperCorrection: "bottom-narrow",
    overallHeightMm: 273.8,
    bodyTopFromOverallMm: 18,
    bodyBottomFromOverallMm: 244,
    lidSeamFromOverallMm: 24,
    silverBandBottomFromOverallMm: 30,
    printableSurfaceContract: {
      printableTopMm: 30,
      printableBottomMm: 244,
      printableHeightMm: 214,
      axialExclusions: [],
      circumferentialExclusions: [],
    },
  }, null);

  assert.ok(resolution);
  assert.equal(resolution?.printableSurfaceContract.printableTopMm, 30);
  assert.equal(resolution?.authoritySource, "persisted-contract");
  assert.deepEqual(
    resolution?.printableSurfaceContract.axialExclusions,
    [
      { kind: "lid", startMm: 0, endMm: 24 },
      { kind: "rim-ring", startMm: 24, endMm: 30 },
    ],
  );
  assert.equal(resolution?.topBoundarySource, "persisted-contract");
});

test("getPrintableSurfaceResolutionFromDimensions keeps persisted printable bounds when seam and ring metadata drift", () => {
  const resolution = getPrintableSurfaceResolutionFromDimensions({
    diameterMm: 99.82,
    printHeightMm: 216,
    templateWidthMm: 313.59,
    handleArcDeg: 90,
    taperCorrection: "bottom-narrow",
    overallHeightMm: 273.8,
    bodyTopFromOverallMm: 28,
    bodyBottomFromOverallMm: 244,
    lidSeamFromOverallMm: 17.5,
    silverBandBottomFromOverallMm: 73.7,
    printableSurfaceContract: {
      printableTopMm: 28,
      printableBottomMm: 244,
      printableHeightMm: 216,
      axialExclusions: [
        { kind: "lid", startMm: 0, endMm: 17.5 },
        { kind: "rim-ring", startMm: 17.5, endMm: 28 },
      ],
      circumferentialExclusions: [
        { kind: "handle", startMm: 39.2, endMm: 117.6, wraps: false },
      ],
    },
  }, null);

  assert.ok(resolution);
  assert.equal(resolution?.printableSurfaceContract.printableTopMm, 28);
  assert.equal(resolution?.printableSurfaceContract.printableBottomMm, 244);
  assert.equal(resolution?.printableSurfaceContract.printableHeightMm, 216);
  assert.equal(resolution?.authoritySource, "persisted-contract");
  assert.equal(resolution?.automaticDetectionWeak, false);
});

test("normalizeProductTemplatePrintableSurface repairs canonical printable drift from the top-level BODY REFERENCE contract", () => {
  const normalized = normalizeProductTemplatePrintableSurface({
    id: "stanley-drifted",
    name: "Stanley Quencher H2.0 40oz",
    brand: "Stanley",
    capacity: "40oz",
    laserType: "fiber",
    productType: "tumbler",
    materialSlug: "powder-coat",
    materialLabel: "Powder Coat",
    thumbnailDataUrl: "",
    glbPath: "",
    laserSettings: {
      power: 22,
      speed: 350,
      frequency: 100,
      lineInterval: 0.05,
      materialProfileId: "",
      rotaryPresetId: "",
    },
    dimensions: {
      diameterMm: 99.82,
      printHeightMm: 216,
      templateWidthMm: 313.59,
      handleArcDeg: 90,
      taperCorrection: "bottom-narrow",
      overallHeightMm: 273.8,
      bodyTopFromOverallMm: 28,
      bodyBottomFromOverallMm: 244,
      lidSeamFromOverallMm: 17.5,
      silverBandBottomFromOverallMm: 73.7,
      printableSurfaceContract: {
        printableTopMm: 28,
        printableBottomMm: 244,
        printableHeightMm: 216,
        axialExclusions: [
          { kind: "lid", startMm: 0, endMm: 17.5 },
          { kind: "rim-ring", startMm: 17.5, endMm: 28 },
        ],
        circumferentialExclusions: [
          { kind: "handle", startMm: 39.2, endMm: 117.6, wraps: false },
        ],
      },
      canonicalDimensionCalibration: {
        units: "mm",
        totalHeightMm: 273.8,
        bodyHeightMm: 216,
        lidBodyLineMm: 28,
        bodyBottomMm: 244,
        wrapDiameterMm: 99.82,
        baseDiameterMm: 78.7,
        wrapWidthMm: 313.59,
        frontVisibleWidthMm: 101,
        frontAxisPx: { xTop: 0, yTop: 0, xBottom: 0, yBottom: 1 },
        photoToFrontTransform: { type: "affine", matrix: [1, 0, 0, 0, 1, 0] },
        svgFrontViewBoxMm: { x: -50.5, y: 0, width: 101, height: 273.8 },
        wrapMappingMm: {
          frontMeridianMm: 235.19,
          backMeridianMm: 78.4,
          leftQuarterMm: 156.79,
          rightQuarterMm: 313.59,
          handleMeridianMm: 78.4,
          handleKeepOutArcDeg: 90,
          handleKeepOutWidthMm: 78.4,
          handleKeepOutStartMm: 39.2,
          handleKeepOutEndMm: 117.6,
        },
        glbScale: {
          unitsPerMm: 1,
        },
        printableSurfaceContract: {
          printableTopMm: 73.7,
          printableBottomMm: 244,
          printableHeightMm: 170.3,
          axialExclusions: [],
          circumferentialExclusions: [
            { kind: "handle", startMm: 39.2, endMm: 117.6, wraps: false },
          ],
        },
      },
    },
    createdAt: "2026-04-12T00:00:00.000Z",
    updatedAt: "2026-04-12T00:00:00.000Z",
    builtIn: false,
  });

  assert.equal(normalized.changed, true);
  assert.equal(normalized.resolution?.authoritySource, "persisted-contract");
  assert.equal(normalized.template.dimensions.printableSurfaceContract?.printableTopMm, 28);
  assert.equal(
    normalized.template.dimensions.canonicalDimensionCalibration?.printableSurfaceContract?.printableTopMm,
    28,
  );
  assert.equal(
    normalized.template.dimensions.canonicalDimensionCalibration?.printableSurfaceContract?.printableHeightMm,
    216,
  );
});

test("normalizeProductTemplatePrintableSurface repairs Stanley-style ring-derived drift when both persisted contracts were overwritten", () => {
  const normalized = normalizeProductTemplatePrintableSurface({
    id: "stanley-ring-drift",
    name: "Stanley Quencher H2.0 40oz",
    brand: "Stanley",
    capacity: "40oz",
    laserType: "fiber",
    productType: "tumbler",
    materialSlug: "powder-coat",
    materialLabel: "Powder Coat",
    thumbnailDataUrl: "",
    glbPath: "",
    laserSettings: {
      power: 22,
      speed: 350,
      frequency: 100,
      lineInterval: 0.05,
      materialProfileId: "",
      rotaryPresetId: "",
    },
    dimensions: {
      diameterMm: 99.82,
      printHeightMm: 216,
      templateWidthMm: 313.59,
      handleArcDeg: 90,
      taperCorrection: "bottom-narrow",
      overallHeightMm: 273.8,
      bodyTopFromOverallMm: 28,
      bodyBottomFromOverallMm: 244,
      lidSeamFromOverallMm: 17.5,
      silverBandBottomFromOverallMm: 73.7,
      bodyReferenceQA: {
        pass: true,
        severity: "review",
        shellAuthority: "outline-profile",
        scaleAuthority: "validated-midband-ratio",
        acceptedRowCount: 133,
        rejectedRowCount: 0,
        fallbackMode: "outline-only",
        issues: [],
      },
      bodyReferenceContractVersion: 1,
      printableSurfaceContract: {
        printableTopMm: 73.7,
        printableBottomMm: 244,
        printableHeightMm: 170.3,
        axialExclusions: [
          { kind: "lid", startMm: 0, endMm: 50 },
          { kind: "rim-ring", startMm: 50, endMm: 73.7 },
          { kind: "base", startMm: 244, endMm: 297 },
        ],
        circumferentialExclusions: [
          { kind: "handle", startMm: 39.2, endMm: 117.6, wraps: false },
        ],
      },
      canonicalDimensionCalibration: {
        units: "mm",
        totalHeightMm: 273.8,
        bodyHeightMm: 216,
        lidBodyLineMm: 28,
        bodyBottomMm: 244,
        wrapDiameterMm: 99.82,
        baseDiameterMm: 78.7,
        wrapWidthMm: 313.59,
        frontVisibleWidthMm: 101,
        frontAxisPx: { xTop: 0, yTop: 0, xBottom: 0, yBottom: 1 },
        photoToFrontTransform: { type: "affine", matrix: [1, 0, 0, 0, 1, 0] },
        svgFrontViewBoxMm: { x: -50.5, y: 0, width: 101, height: 273.8 },
        wrapMappingMm: {
          frontMeridianMm: 235.19,
          backMeridianMm: 78.4,
          leftQuarterMm: 156.79,
          rightQuarterMm: 313.59,
          handleMeridianMm: 78.4,
          handleKeepOutArcDeg: 90,
          handleKeepOutWidthMm: 78.4,
          handleKeepOutStartMm: 39.2,
          handleKeepOutEndMm: 117.6,
        },
        glbScale: {
          unitsPerMm: 1,
        },
        printableSurfaceContract: {
          printableTopMm: 73.7,
          printableBottomMm: 244,
          printableHeightMm: 170.3,
          axialExclusions: [
            { kind: "lid", startMm: 0, endMm: 50 },
            { kind: "rim-ring", startMm: 50, endMm: 73.7 },
            { kind: "base", startMm: 244, endMm: 297 },
          ],
          circumferentialExclusions: [
            { kind: "handle", startMm: 39.2, endMm: 117.6, wraps: false },
          ],
        },
      },
    },
    createdAt: "2026-04-12T00:00:00.000Z",
    updatedAt: "2026-04-12T00:00:00.000Z",
    builtIn: false,
  });

  assert.equal(normalized.changed, true);
  assert.equal(normalized.template.dimensions.printableSurfaceContract?.printableTopMm, 28);
  assert.equal(normalized.template.dimensions.printableSurfaceContract?.printableBottomMm, 244);
  assert.equal(normalized.template.dimensions.printableSurfaceContract?.printableHeightMm, 216);
  assert.equal(
    normalized.template.dimensions.canonicalDimensionCalibration?.printableSurfaceContract?.printableTopMm,
    28,
  );
  assert.equal(
    normalized.template.dimensions.canonicalDimensionCalibration?.printableSurfaceContract?.printableHeightMm,
    216,
  );
});
