import assert from "node:assert/strict";
import test from "node:test";

import {
  parseFlatItemLookupResponse,
  parseLogoPlacementAssistResponse,
  parseTraceSettingsAssistResponse,
  parseTumblerAutoSizeResponse,
  parseTumblerItemLookupResponse,
} from "./adminApi.schema.ts";

test("admin api tumbler auto-size schema parses a valid response", () => {
  const parsed = parseTumblerAutoSizeResponse({
    analysis: {
      productType: "tumbler",
      brand: "Stanley",
      model: "Quencher",
      capacityOz: 40,
      hasHandle: true,
      shapeType: "straight",
      confidence: 0.9,
      searchQuery: "stanley quencher 40oz",
      notes: [],
    },
    suggestion: {
      productType: "tumbler",
      brand: "Stanley",
      model: "Quencher",
      capacityOz: 40,
      hasHandle: true,
      shapeType: "straight",
      overallHeightMm: 273.8,
      outsideDiameterMm: 99.8,
      topDiameterMm: 99.8,
      bottomDiameterMm: 78.7,
      usableHeightMm: 216,
      confidence: 0.9,
      sources: [],
      notes: [],
    },
    calculation: {
      shapeType: "straight",
      templateWidthMm: 313.6,
      templateHeightMm: 216,
      diameterUsedMm: 99.8,
      averageDiameterMm: 99.8,
    },
    confidenceLevel: "high",
  });
  assert.ok(parsed);
  assert.equal(parsed?.calculation.templateHeightMm, 216);
});

test("admin api tumbler item lookup schema rejects malformed envelopes", () => {
  const parsed = parseTumblerItemLookupResponse({
    lookupInput: "stanley",
    glbPath: "/models/generated/stanley.glb",
  });
  assert.equal(parsed, null);
});

test("admin api auxiliary schemas validate lookup and assist payloads", () => {
  assert.ok(parseFlatItemLookupResponse({
    lookupInput: "zippo lighter",
    resolvedUrl: null,
    title: null,
    brand: null,
    label: "Zippo",
    matchedItemId: null,
    familyKey: "lighter",
    category: "accessory",
    widthMm: 38,
    heightMm: 57,
    thicknessMm: 13,
    material: "metal",
    materialLabel: "Metal",
    imageUrl: null,
    imageUrls: [],
    glbPath: "",
    modelStrategy: "family-generated",
    modelSourceUrl: null,
    requiresReview: false,
    isProxy: false,
    traceScore: null,
    traceDebug: null,
    confidence: 0.8,
    mode: "safe-fallback",
    notes: [],
    sources: [],
  }));
  assert.ok(parseLogoPlacementAssistResponse({
    detected: true,
    logoBox: { x: 1, y: 2, w: 3, h: 4 },
    viewClass: "front",
    confidence: 0.8,
    rationale: "Detected from the front photo.",
  }));
  assert.ok(parseTraceSettingsAssistResponse({
    traceMode: "bitmap-trace",
    traceRecipe: {},
    backgroundStrategy: "alpha-mask",
    preserveText: false,
    thresholdMode: "auto",
    threshold: 0.5,
    invert: false,
    turdSize: 2,
    alphaMax: 1,
    optTolerance: 0.2,
    posterizeSteps: 4,
    confidence: 0.7,
    rationale: "Default trace settings.",
  }));
});
