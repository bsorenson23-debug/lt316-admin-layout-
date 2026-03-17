import test from "node:test";
import assert from "node:assert/strict";
import type {
  CandidateScore,
  TumblerBrandCandidate,
  TumblerImageFeatures,
  TumblerLogoDetectionResult,
} from "../../types/tumblerAutoSize.ts";
import { DEFAULT_BED_CONFIG } from "../../types/admin.ts";
import {
  applyTumblerSuggestion,
  normalizeTumblerSpecs,
  toTumblerSpecDraft,
} from "../../utils/tumblerAutoSize.ts";
import {
  identifyTumblerBrand,
  resolveBestBrandCandidate,
} from "./identifyTumblerBrand.ts";

const BASE_FEATURES: TumblerImageFeatures = {
  rawText: "test tumbler",
  tokens: ["test", "tumbler"],
  visibleLogoText: [],
  hasHandle: false,
  hasStraw: null,
  lidStyle: "unknown",
  shapeType: "tapered",
  hasGrooveBands: null,
  silhouetteRatio: 1.9,
  baseTopDiameterRatio: 0.8,
};

const NO_LOGO: TumblerLogoDetectionResult = {
  matchedBrand: null,
  detectedText: [],
  confidence: 0.2,
  method: "unknown",
};

test("visible YETI text strongly prefers YETI", async () => {
  const identified = await identifyTumblerBrand({
    fileName: "studio-shot_yeti_rambler_30oz.png",
    mimeType: "image/png",
    byteLength: 320_000,
  });

  assert.equal(identified.analysis.brand, "YETI");
  assert.equal(identified.analysis.brandResolution?.isUnknown, false);
  assert.equal(identified.analysis.brandResolution?.topCandidates[0]?.brand, "YETI");
});

test("weak generic tumbler image resolves to unknown instead of forcing Stanley", async () => {
  const identified = await identifyTumblerBrand({
    fileName: "stainless_tumbler_product_photo.jpg",
    mimeType: "image/jpeg",
    byteLength: 220_000,
  });

  assert.equal(identified.analysis.brand, "unknown");
  assert.equal(identified.analysis.model, "unknown");
  assert.equal(identified.analysis.productType, "tumbler");
});

test("close candidate scores return unknown", () => {
  const candidates: TumblerBrandCandidate[] = [
    {
      id: "yeti",
      brand: "YETI",
      model: "Rambler",
      searchQuery: "YETI Rambler tumbler dimensions",
      preliminaryScore: 0.6,
      reasons: [],
    },
    {
      id: "stanley",
      brand: "Stanley",
      model: "Quencher H2.0",
      searchQuery: "Stanley Quencher tumbler dimensions",
      preliminaryScore: 0.6,
      reasons: [],
    },
    {
      id: "unknown",
      brand: "unknown",
      model: "unknown",
      searchQuery: "insulated tumbler dimensions",
      preliminaryScore: 0.3,
      reasons: [],
    },
  ];
  const scores: CandidateScore[] = [
    {
      brand: "YETI",
      visionScore: 0.7,
      ocrScore: 0.2,
      shapeScore: 0.6,
      logoTextScore: 0.2,
      silhouetteScore: 0.6,
      handleScore: 0.6,
      lidScore: 0.5,
      grooveScore: 0.5,
      searchConsistencyScore: 0.6,
      sourceScore: 0.7,
      conflictPenalty: 0,
      totalScore: 0.66,
    },
    {
      brand: "Stanley",
      visionScore: 0.72,
      ocrScore: 0.2,
      shapeScore: 0.58,
      logoTextScore: 0.2,
      silhouetteScore: 0.58,
      handleScore: 0.6,
      lidScore: 0.5,
      grooveScore: 0.5,
      searchConsistencyScore: 0.6,
      sourceScore: 0.72,
      conflictPenalty: 0,
      totalScore: 0.61,
    },
    {
      brand: "unknown",
      visionScore: 0.2,
      ocrScore: 0.2,
      shapeScore: 0.5,
      logoTextScore: 0.2,
      silhouetteScore: 0.5,
      handleScore: 0.5,
      lidScore: 0.5,
      grooveScore: 0.5,
      searchConsistencyScore: 0.5,
      sourceScore: 0.4,
      conflictPenalty: 0,
      totalScore: 0.3,
    },
  ];

  const resolution = resolveBestBrandCandidate({
    candidates,
    scores,
    features: BASE_FEATURES,
    logoDetection: NO_LOGO,
  });

  assert.equal(resolution.isUnknown, true);
  assert.equal(resolution.brand, "unknown");
});

test("conflicting search strength does not override strong OCR brand match", () => {
  const candidates: TumblerBrandCandidate[] = [
    {
      id: "yeti",
      brand: "YETI",
      model: "Rambler",
      searchQuery: "YETI Rambler tumbler dimensions",
      preliminaryScore: 0.75,
      reasons: ["ocr-logo-match"],
    },
    {
      id: "stanley",
      brand: "Stanley",
      model: "Quencher H2.0",
      searchQuery: "Stanley Quencher tumbler dimensions",
      preliminaryScore: 0.8,
      reasons: ["source-heavy"],
    },
  ];
  const scores: CandidateScore[] = [
    {
      brand: "Stanley",
      visionScore: 0.8,
      ocrScore: 0.05,
      shapeScore: 0.65,
      logoTextScore: 0.05,
      silhouetteScore: 0.65,
      handleScore: 0.5,
      lidScore: 0.5,
      grooveScore: 0.5,
      searchConsistencyScore: 0.8,
      sourceScore: 0.9,
      conflictPenalty: 0.06,
      totalScore: 0.67,
    },
    {
      brand: "YETI",
      visionScore: 0.75,
      ocrScore: 0.95,
      shapeScore: 0.68,
      logoTextScore: 0.95,
      silhouetteScore: 0.68,
      handleScore: 0.6,
      lidScore: 0.6,
      grooveScore: 0.5,
      searchConsistencyScore: 0.65,
      sourceScore: 0.7,
      conflictPenalty: 0,
      totalScore: 0.62,
    },
  ];

  const resolution = resolveBestBrandCandidate({
    candidates,
    scores,
    features: {
      ...BASE_FEATURES,
      rawText: "yeti rambler tumbler",
      tokens: ["yeti", "rambler", "tumbler"],
      visibleLogoText: ["YETI"],
    },
    logoDetection: {
      matchedBrand: "YETI",
      detectedText: ["YETI"],
      confidence: 0.95,
      method: "ocr",
    },
  });

  assert.equal(resolution.isUnknown, false);
  assert.equal(resolution.brand, "YETI");
});

test("saved profile applies only after brand validation", () => {
  const validatedDraft = toTumblerSpecDraft({
    productType: "tumbler",
    brand: "YETI",
    model: "Rambler",
    capacityOz: 30,
    hasHandle: false,
    shapeType: "straight",
    overallHeightMm: 198,
    outsideDiameterMm: 87.88,
    topDiameterMm: 87.88,
    bottomDiameterMm: 87.88,
    usableHeightMm: 160,
    confidence: 0.88,
    brandConfidence: 0.91,
    sources: [],
    notes: [],
  });

  const withValidatedBrand = applyTumblerSuggestion(DEFAULT_BED_CONFIG, validatedDraft);
  assert.equal(withValidatedBrand.tumblerProfileId, "yeti-rambler-30");

  const unknownDraft = toTumblerSpecDraft({
    productType: "tumbler",
    brand: "unknown",
    model: "unknown",
    capacityOz: 30,
    hasHandle: false,
    shapeType: "straight",
    overallHeightMm: 198,
    outsideDiameterMm: 88,
    topDiameterMm: 88,
    bottomDiameterMm: 88,
    usableHeightMm: 160,
    confidence: 0.52,
    brandConfidence: 0.4,
    sources: [],
    notes: [],
  });

  const withUnknownBrand = applyTumblerSuggestion(
    {
      ...DEFAULT_BED_CONFIG,
      tumblerProfileId: "stanley-quencher-40",
    },
    unknownDraft
  );
  assert.equal(withUnknownBrand.tumblerProfileId, undefined);
});

test("manual override persists and skips automatic profile substitution", () => {
  const manualOverrideDraft = toTumblerSpecDraft({
    productType: "tumbler",
    brand: "RTIC",
    model: "Road Trip Tumbler",
    capacityOz: 30,
    hasHandle: false,
    shapeType: "straight",
    overallHeightMm: 203,
    outsideDiameterMm: 96,
    topDiameterMm: 96,
    bottomDiameterMm: 96,
    usableHeightMm: 160,
    confidence: 0.55,
    brandConfidence: 0.42,
    manualBrandOverride: true,
    manualProfileOverrideId: "stanley-quencher-40",
    sources: [],
    notes: [],
  });

  const applied = applyTumblerSuggestion(DEFAULT_BED_CONFIG, manualOverrideDraft);
  assert.equal(applied.tumblerBrand, "RTIC");
  assert.equal(applied.tumblerProfileId, "stanley-quencher-40");
});

test("unknown-brand mode still produces best-effort dimensions", async () => {
  const identified = await identifyTumblerBrand({
    fileName: "insulated-stainless-cup-generic-image.png",
    mimeType: "image/png",
    byteLength: 140_000,
  });
  const suggestion = normalizeTumblerSpecs(identified.analysis, identified.selectedSpecs);

  assert.equal(suggestion.brand, "unknown");
  assert.ok((suggestion.outsideDiameterMm ?? 0) > 0);
  assert.ok((suggestion.usableHeightMm ?? suggestion.overallHeightMm ?? 0) > 0);
});
