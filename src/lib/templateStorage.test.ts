import assert from "node:assert/strict";
import test from "node:test";

import type { ProductTemplate } from "@/types/productTemplate";
import {
  createBrandLogoReference,
  createFinishBandReference,
} from "./productAppearanceReferenceLayers.ts";
import {
  getTemplate,
  loadTemplates,
  saveTemplate,
} from "./templateStorage.ts";

const STORAGE_KEY = "lt316_product_templates";
const NOW = "2026-04-22T00:00:00.000Z";

class MemoryStorage {
  private readonly entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }
}

const originalLocalStorage = globalThis.localStorage;

function installMemoryStorage(): MemoryStorage {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
    writable: true,
  });
  return storage;
}

function createTemplate(
  overrides: Partial<ProductTemplate> = {},
): ProductTemplate {
  const base: ProductTemplate = {
    id: "template-artwork-placement",
    name: "Template artwork placement",
    brand: "LT316",
    capacity: "30 oz",
    laserType: "fiber",
    productType: "tumbler",
    thumbnailDataUrl: "data:image/png;base64,thumb",
    glbPath: "/models/templates/template-artwork-placement.glb",
    dimensions: {
      diameterMm: 88.9,
      printHeightMm: 220,
      templateWidthMm: 279.29,
      handleArcDeg: 0,
      taperCorrection: "none",
    },
    laserSettings: {
      power: 55,
      speed: 1200,
      frequency: 30,
      lineInterval: 0.08,
      materialProfileId: "fiber-stainless",
      rotaryPresetId: "rotary-default",
    },
    createdAt: NOW,
    updatedAt: NOW,
    builtIn: false,
  };

  return {
    ...base,
    ...overrides,
    dimensions: {
      ...base.dimensions,
      ...overrides.dimensions,
    },
    laserSettings: {
      ...base.laserSettings,
      ...overrides.laserSettings,
    },
  };
}

test.beforeEach(() => {
  installMemoryStorage();
});

test.after(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: originalLocalStorage,
    writable: true,
  });
});

test("saveTemplate persists laser-bed artwork placements in millimeter space", () => {
  const template = createTemplate({
    artworkPlacements: [
      {
        id: "placement-1",
        assetId: "asset-svg-1",
        svgAssetId: "asset-svg-1",
        name: "Front logo",
        xMm: 22.5,
        yMm: 18.25,
        widthMm: 42,
        heightMm: 38.5,
        rotationDeg: 15,
        visible: true,
        mappingSignature: "laser-bed-surface-mapping:abc12345",
      },
    ],
    engravingPreviewState: {
      mode: "cylindrical-v1",
      status: "pass",
      freshness: "fresh",
      readyForPreview: true,
      readyForExactPlacement: true,
      isBodyCutoutQaProof: false,
      mappingSignature: "laser-bed-surface-mapping:abc12345",
      material: {
        key: "unknown",
        label: "Unknown",
      },
      mapping: {
        mode: "cylindrical-v1",
        wrapDiameterMm: 88.9,
        wrapWidthMm: 279.29,
        printableHeightMm: 220,
        sourceHash: "source-hash",
        glbSourceHash: "glb-hash",
      },
      placements: [
        {
          id: "placement-1",
          assetId: "asset-svg-1",
          svgAssetId: "asset-svg-1",
          name: "Front logo",
          xMm: 22.5,
          yMm: 18.25,
          widthMm: 42,
          heightMm: 38.5,
          rotationDeg: 15,
          visible: true,
          mappingSignature: "laser-bed-surface-mapping:abc12345",
        },
      ],
      warnings: [],
      errors: [],
    },
  });

  saveTemplate(template);
  const saved = getTemplate(template.id);

  assert.ok(saved);
  assert.deepEqual(saved.artworkPlacements, template.artworkPlacements);
  assert.equal(saved.artworkPlacements?.[0]?.xMm, 22.5);
  assert.equal(saved.artworkPlacements?.[0]?.yMm, 18.25);
  assert.equal(saved.artworkPlacements?.[0]?.widthMm, 42);
  assert.equal(saved.artworkPlacements?.[0]?.heightMm, 38.5);
  assert.equal(saved.artworkPlacements?.[0]?.rotationDeg, 15);
  assert.equal(saved.engravingPreviewState?.mappingSignature, "laser-bed-surface-mapping:abc12345");
  assert.equal(saved.engravingPreviewState?.mapping?.sourceHash, "source-hash");
  assert.equal(saved.engravingPreviewState?.mapping?.glbSourceHash, "glb-hash");
  assert.equal(saved.engravingPreviewState?.mapping?.wrapDiameterMm, 88.9);
  assert.equal(saved.engravingPreviewState?.mapping?.wrapWidthMm, 279.29);
  assert.equal(saved.engravingPreviewState?.mapping?.printableHeightMm, 220);
});

test("empty artwork placement list remains a valid saved template state", () => {
  const template = createTemplate({
    id: "template-empty-artwork-placement",
    artworkPlacements: [],
  });

  saveTemplate(template);
  const saved = getTemplate(template.id);

  assert.ok(saved);
  assert.deepEqual(saved.artworkPlacements, []);
});

test("old templates without artwork placement data still load", () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      templates: [
        createTemplate({
          id: "template-legacy-artwork-placement",
          artworkPlacements: undefined,
          engravingPreviewState: undefined,
        }),
      ],
      lastUpdated: NOW,
    }),
  );

  const loaded = loadTemplates().find((template) => template.id === "template-legacy-artwork-placement");

  assert.ok(loaded);
  assert.equal(loaded.artworkPlacements, undefined);
  assert.equal(loaded.engravingPreviewState, undefined);
});

test("saveTemplate preserves appearance reference layers exactly", () => {
  const template = createTemplate({
    id: "template-appearance-reference-layers",
    appearanceReferenceLayers: [
      createFinishBandReference({
        id: "top-band",
        kind: "top-finish-band",
        yMm: 0,
        heightMm: 10,
        source: "lookup",
      }),
      createBrandLogoReference({
        id: "front-logo",
        kind: "front-brand-logo",
        widthMm: 28,
        heightMm: 12,
        angleDeg: 0,
        source: "operator",
      }),
    ],
  });

  saveTemplate(template);
  const saved = getTemplate(template.id);

  assert.ok(saved);
  assert.deepEqual(saved.appearanceReferenceLayers, template.appearanceReferenceLayers);
  assert.equal(saved.appearanceReferenceLayers?.[0]?.referenceOnly, true);
  assert.equal(saved.appearanceReferenceLayers?.[0]?.includedInBodyCutoutQa, false);
  assert.equal(saved.appearanceReferenceLayers?.[1]?.kind, "front-brand-logo");
});

test("saveTemplate preserves lookup dimension authority metadata exactly", () => {
  const template = createTemplate({
    id: "template-lookup-dimension-authority",
    lookupDimensions: {
      lookupProductId: "stanley-iceflow-40",
      productUrl: "https://example.com/products/iceflow",
      selectedVariantId: "40oz-stainless",
      selectedVariantLabel: "40 oz / Stainless",
      selectedSizeOz: 40,
      selectedColorOrFinish: "Stainless",
      availableVariantLabels: ["30 oz / Stainless", "40 oz / Stainless"],
      availableSizeOz: [30, 40],
      dimensionSourceUrl: "https://example.com/products/iceflow",
      dimensionSourceText: "40 oz dimensions 4.0 x 4.0 x 11.2 in",
      dimensionSourceSizeOz: 40,
      titleSizeOz: 40,
      confidence: 0.92,
      dimensionAuthority: "diameter-primary",
      diameterMm: 101.6,
      bodyDiameterMm: 101.6,
      wrapDiameterMm: 101.6,
      wrapWidthMm: 319.19,
      fullProductHeightMm: 284.48,
      bodyHeightMm: 236.22,
      heightIncludesLidOrStraw: true,
      overallHeightMm: 284.48,
      outsideDiameterMm: 101.6,
      topDiameterMm: null,
      bottomDiameterMm: null,
      usableHeightMm: 236.22,
    },
  });

  saveTemplate(template);
  const saved = getTemplate(template.id);

  assert.ok(saved);
  assert.deepEqual(saved.lookupDimensions, template.lookupDimensions);
  assert.equal(saved.lookupDimensions?.dimensionAuthority, "diameter-primary");
  assert.equal(saved.lookupDimensions?.selectedVariantLabel, "40 oz / Stainless");
  assert.equal(saved.lookupDimensions?.wrapWidthMm, 319.19);
});

test("saveTemplate preserves engravable seam guide and manual printable overrides exactly", () => {
  const template = createTemplate({
    id: "template-engravable-seam-authority",
    dimensions: {
      diameterMm: 88.9,
      templateWidthMm: 279.29,
      handleArcDeg: 0,
      taperCorrection: "none",
      overallHeightMm: 256,
      bodyTopFromOverallMm: 25,
      bodyBottomFromOverallMm: 224.8,
      lidSeamFromOverallMm: 52,
      silverBandBottomFromOverallMm: 63.4,
      printableTopOverrideMm: 70.2,
      printableBottomOverrideMm: 218.6,
      printHeightMm: 148.4,
      printableSurfaceContract: {
        printableTopMm: 70.2,
        printableBottomMm: 218.6,
        printableHeightMm: 148.4,
        axialExclusions: [
          { kind: "lid", startMm: 0, endMm: 52 },
          { kind: "rim-ring", startMm: 52, endMm: 63.4 },
        ],
        circumferentialExclusions: [],
      },
    },
  });

  saveTemplate(template);
  const saved = getTemplate(template.id);

  assert.ok(saved);
  assert.equal(saved.dimensions.silverBandBottomFromOverallMm, 63.4);
  assert.equal(saved.dimensions.printableTopOverrideMm, 70.2);
  assert.equal(saved.dimensions.printableBottomOverrideMm, 218.6);
  assert.deepEqual(saved.dimensions.printableSurfaceContract, template.dimensions.printableSurfaceContract);
});

test("saveTemplate preserves accepted BODY REFERENCE v2 draft metadata exactly", () => {
  const template = createTemplate({
    id: "template-body-reference-v2-accepted",
    acceptedBodyReferenceV2Draft: {
      sourceImageUrl: "data:image/png;base64,v2-draft",
      centerline: {
        id: "centerline",
        xPx: 0,
        topYPx: 12,
        bottomYPx: 188,
        source: "operator",
      },
      layers: [
        {
          id: "body-left",
          kind: "body-left",
          points: [
            { xPx: -42, yPx: 12 },
            { xPx: -44, yPx: 96 },
            { xPx: -38, yPx: 188 },
          ],
          closed: false,
          editable: true,
          visible: true,
          referenceOnly: false,
          includedInBodyCutoutQa: true,
        },
      ],
      blockedRegions: [],
      scaleCalibration: {
        scaleSource: "lookup-diameter",
        lookupDiameterMm: 88,
        wrapDiameterMm: 88,
        wrapWidthMm: 276.46,
      },
    },
  });

  saveTemplate(template);
  const saved = getTemplate(template.id);

  assert.ok(saved);
  assert.deepEqual(saved.acceptedBodyReferenceV2Draft, template.acceptedBodyReferenceV2Draft);
  assert.equal(saved.acceptedBodyReferenceV2Draft?.centerline?.source, "operator");
  assert.equal(saved.acceptedBodyReferenceV2Draft?.layers[0]?.kind, "body-left");
  assert.equal(saved.acceptedBodyReferenceV2Draft?.scaleCalibration.lookupDiameterMm, 88);
});
