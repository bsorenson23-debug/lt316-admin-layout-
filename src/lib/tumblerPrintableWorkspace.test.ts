import test from "node:test";
import assert from "node:assert/strict";
import type { ProductTemplate } from "../types/productTemplate.ts";
import type { EngravableDimensions } from "./engravableDimensions.ts";
import {
  deriveTumblerPrintableWorkspaceFrame,
  deriveTumblerWorkspaceGeometry,
  deriveTumblerWorkspaceRuntimeState,
} from "./tumblerPrintableWorkspace.ts";

function createDims(
  overrides: Partial<EngravableDimensions> = {},
): EngravableDimensions {
  return {
    diameterMm: 100,
    radiusMm: 50,
    circumferenceMm: 314.16,
    totalHeightMm: 240,
    topMarginMm: 20,
    bottomMarginMm: 20,
    engravableHeightMm: 200,
    bodyTopOffsetMm: 20,
    bodyBottomOffsetMm: 220,
    printableSurfaceContract: {
      printableTopMm: 38,
      printableBottomMm: 200,
      printableHeightMm: 162,
      axialExclusions: [
        { kind: "lid", startMm: 0, endMm: 30 },
        { kind: "rim-ring", startMm: 30, endMm: 38 },
      ],
      circumferentialExclusions: [
        { kind: "handle", startMm: 40, endMm: 120, wraps: false },
      ],
    },
    axialSurfaceBands: [],
    printableTopFromBodyTopMm: 18,
    printableBottomFromBodyTopMm: 180,
    printableHeightMm: 162,
    automaticPrintableDetectionWeak: false,
    handleArcDeg: 90,
    handleWidthMm: 78.54,
    printableArcDeg: 270,
    printableWidthMm: 235.62,
    engravableOffsetY: 0,
    ...overrides,
  };
}

function createTemplate(): ProductTemplate {
  return {
    id: "template-1",
    name: "Fixture tumbler",
    brand: "Fixture",
    capacity: "40",
    productType: "tumbler",
    thumbnailDataUrl: "",
    glbPath: "/models/templates/fixture.glb",
    dimensions: {
      diameterMm: 100,
      printHeightMm: 200,
      templateWidthMm: 314.16,
      handleArcDeg: 90,
      taperCorrection: "none",
      canonicalDimensionCalibration: {
        units: "mm",
        totalHeightMm: 240,
        bodyHeightMm: 200,
        lidBodyLineMm: 20,
        bodyBottomMm: 220,
        wrapDiameterMm: 100,
        baseDiameterMm: 80,
        wrapWidthMm: 314.16,
        frontVisibleWidthMm: 100,
        frontAxisPx: { xTop: 0, yTop: 0, xBottom: 0, yBottom: 0 },
        photoToFrontTransform: { type: "affine", matrix: [1, 0, 0, 0, 1, 0] },
        svgFrontViewBoxMm: { x: -50, y: 0, width: 100, height: 240 },
        wrapMappingMm: {
          frontMeridianMm: 235.62,
          backMeridianMm: 78.54,
          leftQuarterMm: 157.08,
          rightQuarterMm: 0,
          handleMeridianMm: 78.54,
          handleKeepOutStartMm: 40,
          handleKeepOutEndMm: 120,
        },
        printableSurfaceContract: {
          printableTopMm: 38,
          printableBottomMm: 200,
          printableHeightMm: 162,
          axialExclusions: [
            { kind: "lid", startMm: 0, endMm: 30 },
            { kind: "rim-ring", startMm: 30, endMm: 38 },
          ],
          circumferentialExclusions: [
            { kind: "handle", startMm: 40, endMm: 120, wraps: false },
          ],
        },
        axialSurfaceBands: [],
        glbScale: { unitsPerMm: 1 },
      },
    } as ProductTemplate["dimensions"],
    laserSettings: {
      power: 0,
      speed: 0,
      frequency: 0,
      lineInterval: 0,
      materialProfileId: "",
      rotaryPresetId: "",
    },
    manufacturerLogoStamp: {
      dataUrl: "data:image/png;base64,fixture",
      placement: {
        offsetXMm: 0,
        centerYFromTopMm: 120,
        widthMm: 30,
        heightMm: 18,
      },
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
    createdAt: "2026-04-12T00:00:00.000Z",
    updatedAt: "2026-04-12T00:00:00.000Z",
    builtIn: false,
  };
}

test("deriveTumblerPrintableWorkspaceFrame rebases printable-local Y when the printable band crops the body shell", () => {
  const frame = deriveTumblerPrintableWorkspaceFrame(createDims());

  assert.equal(frame.hasPrintableBand, true);
  assert.equal(frame.usesPrintableWorkspace, true);
  assert.equal(frame.workspaceHeightMm, 162);
  assert.equal(frame.workspaceTopFromBodyTopMm, 18);
  assert.equal(frame.workspaceTopFromOverallMm, 38);
  assert.equal(frame.printableTopY, 0);
  assert.equal(frame.printableBottomY, 162);
  assert.equal(frame.printableCenterY, 81);
  assert.equal(frame.overallTopMarginMm, 38);
  assert.equal(frame.overallBottomMarginMm, 40);
});

test("deriveTumblerWorkspaceGeometry preserves wrap X guides while rebasing only Y values", () => {
  const geometry = deriveTumblerWorkspaceGeometry(createTemplate(), createDims());

  assert.equal(geometry.legacyZone.frontCenterX, geometry.workspaceZone.frontCenterX);
  assert.equal(geometry.legacyZone.backCenterX, geometry.workspaceZone.backCenterX);
  assert.equal(geometry.legacyZone.leftQuarterX, geometry.workspaceZone.leftQuarterX);
  assert.equal(geometry.legacyZone.rightQuarterX, geometry.workspaceZone.rightQuarterX);
  assert.equal(geometry.legacyZone.handleCenterX, geometry.workspaceZone.handleCenterX);
  assert.equal(geometry.legacyZone.handleKeepOutStartX, geometry.workspaceZone.handleKeepOutStartX);
  assert.equal(geometry.legacyZone.handleKeepOutEndX, geometry.workspaceZone.handleKeepOutEndX);
  assert.equal(geometry.legacyZone.y, 18);
  assert.equal(geometry.workspaceZone.y, 0);
  assert.equal(geometry.workspaceZone.height, 162);
  assert.equal(geometry.workspaceZone.printableTopY, 0);
  assert.equal(geometry.workspaceZone.printableBottomY, 162);
  assert.equal(geometry.workspaceZone.lidBoundaryY, 0);
  assert.equal(geometry.workspaceZone.rimBoundaryY, 0);
  assert.equal(geometry.legacyZone.logoCenterY, 100);
  assert.equal(geometry.workspaceZone.logoCenterY, 82);
});

test("deriveTumblerPrintableWorkspaceFrame falls back to the body-shell workspace when the printable band does not crop", () => {
  const frame = deriveTumblerPrintableWorkspaceFrame(
    createDims({
      printableTopFromBodyTopMm: 0,
      printableBottomFromBodyTopMm: 200,
      printableHeightMm: 200,
    }),
  );

  assert.equal(frame.hasPrintableBand, true);
  assert.equal(frame.usesPrintableWorkspace, false);
  assert.equal(frame.workspaceHeightMm, 200);
  assert.equal(frame.workspaceTopFromBodyTopMm, 0);
  assert.equal(frame.workspaceBottomFromBodyTopMm, 200);
  assert.equal(frame.printableTopY, 0);
  assert.equal(frame.printableBottomY, 200);
});

test("deriveTumblerPrintableWorkspaceFrame falls back cleanly for an invalid printable band", () => {
  const frame = deriveTumblerPrintableWorkspaceFrame(
    createDims({
      printableTopFromBodyTopMm: 100,
      printableBottomFromBodyTopMm: 100,
      printableHeightMm: 0,
    }),
  );

  assert.equal(frame.hasPrintableBand, false);
  assert.equal(frame.usesPrintableWorkspace, false);
  assert.equal(frame.workspaceHeightMm, 200);
  assert.equal(frame.overallTopMarginMm, 20);
  assert.equal(frame.overallBottomMarginMm, 20);
});

test("deriveTumblerWorkspaceRuntimeState centralizes the cropped workspace values used by the shell and template workflow", () => {
  const runtime = deriveTumblerWorkspaceRuntimeState(createTemplate(), createDims());

  assert.equal(runtime.workspaceHeightMm, 162);
  assert.equal(runtime.usableHeightMm, 162);
  assert.equal(runtime.overallHeightMm, 240);
  assert.equal(runtime.templateWidthMm, 314.16);
  assert.equal(runtime.templateHeightMm, 162);
  assert.equal(runtime.geometry.workspaceZone.height, 162);
  assert.equal(runtime.geometry.frame.usesPrintableWorkspace, true);
});
