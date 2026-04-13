import assert from "node:assert/strict";
import test from "node:test";

import {
  parseProductTemplate,
  parseProductTemplateArray,
  parseProductTemplateStore,
} from "./templateStorage.schema.ts";

function createTemplateCandidate() {
  return {
    id: "stanley-1",
    name: "Stanley Quencher H2.0 40oz",
    brand: "Stanley",
    capacity: "40oz",
    productType: "tumbler",
    thumbnailDataUrl: "data:image/png;base64,fixture",
    glbPath: "/models/generated/stanley.glb",
    dimensions: {
      diameterMm: 99.8,
      printHeightMm: 216,
      templateWidthMm: 313.6,
      handleArcDeg: 90,
      taperCorrection: "none",
      canonicalDimensionCalibration: {
        units: "mm",
        totalHeightMm: 273.8,
        bodyHeightMm: 216,
        lidBodyLineMm: 28,
        bodyBottomMm: 244,
        wrapDiameterMm: 99.8,
        baseDiameterMm: 78.7,
        wrapWidthMm: 313.6,
        frontVisibleWidthMm: 101,
        frontAxisPx: { xTop: 0, yTop: 0, xBottom: 0, yBottom: 0 },
        photoToFrontTransform: { type: "affine", matrix: [1, 0, 0, 0, 1, 0] },
        svgFrontViewBoxMm: { x: -50, y: 0, width: 100, height: 273.8 },
        wrapMappingMm: { frontMeridianMm: 0 },
        glbScale: { unitsPerMm: 1 },
      },
      printableSurfaceContract: {
        printableTopMm: 28,
        printableBottomMm: 244,
        printableHeightMm: 216,
      },
    },
    laserSettings: {
      power: 20,
      speed: 300,
      frequency: 30,
      lineInterval: 0.05,
      materialProfileId: "powder",
      rotaryPresetId: "d80c",
    },
    createdAt: "2026-04-12T00:00:00.000Z",
    updatedAt: "2026-04-12T00:00:00.000Z",
    builtIn: false,
  };
}

test("product template schema accepts a valid template envelope", () => {
  const parsed = parseProductTemplate(createTemplateCandidate());
  assert.ok(parsed);
  assert.equal(parsed?.dimensions.printableSurfaceContract?.printableTopMm, 28);
});

test("product template schema filters malformed legacy array entries", () => {
  const parsed = parseProductTemplateArray([
    createTemplateCandidate(),
    { id: "bad-template" },
    null,
  ]);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.id, "stanley-1");
});

test("product template store schema parses the storage envelope", () => {
  const parsed = parseProductTemplateStore({
    templates: [createTemplateCandidate()],
    lastUpdated: "2026-04-12T00:00:00.000Z",
    deletedBuiltInIds: ["old-template"],
  });
  assert.ok(parsed);
  assert.equal(parsed?.templates.length, 1);
  assert.deepEqual(parsed?.deletedBuiltInIds, ["old-template"]);
});
