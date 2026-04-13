import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_BED_CONFIG, normalizeBedConfig } from "../../../../types/admin.ts";
import type { ProductTemplate } from "../../../../types/productTemplate.ts";
import { getEngravableDimensions } from "../../../../lib/engravableDimensions.ts";
import {
  createInitialWorkspaceControllerState,
  selectWorkspaceDerivedState,
  workspaceControllerActions,
  workspaceControllerReducer,
} from "./workspaceController.ts";

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
        totalHeightMm: 244,
        bodyHeightMm: 216,
        lidBodyLineMm: 28,
        bodyBottomMm: 244,
        wrapDiameterMm: 100,
        baseDiameterMm: 80,
        wrapWidthMm: 314.16,
        frontVisibleWidthMm: 100,
        frontAxisPx: { xTop: 0, yTop: 0, xBottom: 0, yBottom: 0 },
        photoToFrontTransform: { type: "affine", matrix: [1, 0, 0, 0, 1, 0] },
        svgFrontViewBoxMm: { x: -50, y: 0, width: 100, height: 244 },
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
          printableTopMm: 28,
          printableBottomMm: 244,
          printableHeightMm: 216,
          axialExclusions: [
            { kind: "lid", startMm: 0, endMm: 20 },
            { kind: "rim-ring", startMm: 20, endMm: 28 },
          ],
          circumferentialExclusions: [
            { kind: "handle", startMm: 40, endMm: 120, wraps: false },
          ],
        },
        axialSurfaceBands: [],
        glbScale: { unitsPerMm: 1 },
      },
      printableSurfaceContract: {
        printableTopMm: 28,
        printableBottomMm: 244,
        printableHeightMm: 216,
        axialExclusions: [
          { kind: "lid", startMm: 0, endMm: 20 },
          { kind: "rim-ring", startMm: 20, endMm: 28 },
        ],
        circumferentialExclusions: [
          { kind: "handle", startMm: 40, endMm: 120, wraps: false },
        ],
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
    createdAt: "2026-04-12T00:00:00.000Z",
    updatedAt: "2026-04-12T00:00:00.000Z",
    builtIn: false,
  };
}

test("workspace controller derives printable workspace truth from the template runtime", () => {
  const template = createTemplate();
  const dims = getEngravableDimensions(template);
  const bedConfig = normalizeBedConfig({
    ...DEFAULT_BED_CONFIG,
    workspaceMode: "tumbler-wrap",
    tumblerDiameterMm: 100,
    tumblerPrintableHeightMm: 216,
    tumblerOverallHeightMm: 244,
    tumblerUsableHeightMm: 216,
  });

  const derived = selectWorkspaceDerivedState(createInitialWorkspaceControllerState(), {
    bedConfig,
    selectedTemplate: template,
    templateEngravableDims: dims,
  });

  assert.equal(derived.isTumblerMode, true);
  assert.equal(derived.is3DPlacement, false);
  assert.equal(derived.sectionState.authority, "body-reference-printable-band");
  assert.equal(derived.sectionState.printableBandLabel, "28.00 -> 244.00");
  assert.match(derived.sectionState.summary, /BODY REFERENCE printable band/);
});

test("workspace controller toggles into 3d placement without duplicating geometry truth", () => {
  const template = createTemplate();
  const dims = getEngravableDimensions(template);
  const bedConfig = normalizeBedConfig({
    ...DEFAULT_BED_CONFIG,
    workspaceMode: "tumbler-wrap",
    tumblerDiameterMm: 100,
    tumblerPrintableHeightMm: 216,
    tumblerOverallHeightMm: 244,
    tumblerUsableHeightMm: 216,
  });

  let state = createInitialWorkspaceControllerState();
  state = workspaceControllerReducer(state, workspaceControllerActions.setViewMode("3d-placement"));
  const derived = selectWorkspaceDerivedState(state, {
    bedConfig,
    selectedTemplate: template,
    templateEngravableDims: dims,
  });

  assert.equal(derived.is3DPlacement, true);
  assert.equal(derived.sectionState.visible, false);
  assert.ok(derived.workspaceRenderKey.includes("template-1"));
});
