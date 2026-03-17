import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BED_CONFIG, normalizeBedConfig } from "../types/admin.ts";
import type {
  TumblerImageAnalysisResult,
  TumblerSpecCandidate,
} from "../types/tumblerAutoSize.ts";
import {
  applyTumblerSuggestion,
  calculateTumblerTemplate,
  getTumblerConfidenceLevel,
  inchesToMm,
  normalizeTumblerSpecs,
  toTumblerSpecDraft,
} from "./tumblerAutoSize.ts";

function buildAnalysis(overrides: Partial<TumblerImageAnalysisResult> = {}): TumblerImageAnalysisResult {
  return {
    productType: "tumbler",
    brand: "YETI",
    model: "Rambler",
    capacityOz: 30,
    hasHandle: false,
    shapeType: "straight",
    confidence: 0.8,
    searchQuery: "YETI Rambler 30 oz tumbler dimensions",
    notes: [],
    ...overrides,
  };
}

test("inchesToMm converts inches to millimetres", () => {
  assert.equal(Number(inchesToMm(1).toFixed(2)), 25.4);
  assert.equal(Number(inchesToMm(3.5).toFixed(2)), 88.9);
});

test("normalizeTumblerSpecs parses mixed-unit candidate values", () => {
  const analysis = buildAnalysis();
  const candidates: TumblerSpecCandidate[] = [
    {
      title: "Official dimensions",
      url: "https://example.com/official",
      kind: "official",
      overallHeight: '7.8"',
      outsideDiameter: "3.4 in",
      usableHeight: "160 mm",
      confidence: 0.9,
    },
  ];

  const normalized = normalizeTumblerSpecs(analysis, candidates);
  assert.equal(Number((normalized.overallHeightMm ?? 0).toFixed(2)), 198.12);
  assert.equal(Number((normalized.outsideDiameterMm ?? 0).toFixed(2)), 86.36);
  assert.equal(normalized.usableHeightMm, 160);
});

test("calculateTumblerTemplate uses circumference for straight tumblers", () => {
  const calculation = calculateTumblerTemplate({
    shapeType: "straight",
    outsideDiameterMm: 87.88,
    topDiameterMm: 87.88,
    bottomDiameterMm: 87.88,
    overallHeightMm: 198,
    usableHeightMm: 160,
  });
  assert.equal(Number(calculation.templateWidthMm.toFixed(2)), 276.08);
  assert.equal(calculation.templateHeightMm, 160);
});

test("calculateTumblerTemplate uses average diameter for tapered fallback", () => {
  const calculation = calculateTumblerTemplate({
    shapeType: "tapered",
    outsideDiameterMm: null,
    topDiameterMm: 98,
    bottomDiameterMm: 78,
    overallHeightMm: 200,
    usableHeightMm: 150,
  });
  assert.equal(Number(calculation.averageDiameterMm?.toFixed(2)), 88);
  assert.equal(Number(calculation.templateWidthMm.toFixed(2)), 276.46);
});

test("low-confidence handling maps to low confidence level", () => {
  const analysis = buildAnalysis({
    brand: null,
    model: null,
    confidence: 0.25,
    shapeType: "unknown",
  });

  const normalized = normalizeTumblerSpecs(analysis, []);
  assert.equal(getTumblerConfidenceLevel(normalized.confidence), "low");
});

test("apply flow writes template dimensions to bed config", () => {
  const analysis = buildAnalysis({
    shapeType: "tapered",
  });
  const candidates: TumblerSpecCandidate[] = [
    {
      title: "Official",
      url: "https://example.com/official",
      kind: "official",
      topDiameter: "3.8 in",
      bottomDiameter: "3.2 in",
      overallHeight: "8.4 in",
      usableHeight: "6.3 in",
      confidence: 0.88,
    },
  ];

  const normalized = normalizeTumblerSpecs(analysis, candidates);
  const draft = toTumblerSpecDraft(normalized);
  const applied = applyTumblerSuggestion(DEFAULT_BED_CONFIG, draft);

  assert.equal(applied.workspaceMode, "tumbler-wrap");
  assert.equal(Number(applied.width.toFixed(2)), Number(draft.templateWidthMm.toFixed(2)));
  assert.equal(Number(applied.height.toFixed(2)), Number(draft.templateHeightMm.toFixed(2)));
  assert.equal(applied.tumblerShapeType, "tapered");
});

test("apply flow persists straight outside diameter and derived width", () => {
  const draft = toTumblerSpecDraft({
    productType: "tumbler",
    brand: "Test",
    model: "Straight 30",
    capacityOz: 30,
    hasHandle: false,
    shapeType: "straight",
    overallHeightMm: 190,
    outsideDiameterMm: 87.88,
    topDiameterMm: 87.88,
    bottomDiameterMm: 87.88,
    usableHeightMm: 160,
    confidence: 0.9,
    sources: [],
    notes: [],
  });

  const applied = applyTumblerSuggestion(DEFAULT_BED_CONFIG, draft);
  assert.equal(Number((applied.tumblerOutsideDiameterMm ?? 0).toFixed(2)), 87.88);
  assert.equal(Number(applied.width.toFixed(2)), 276.08);
});

test("applied values are not overwritten by unrelated config updates", () => {
  const draft = toTumblerSpecDraft({
    productType: "tumbler",
    brand: "Keep",
    model: "Persist",
    capacityOz: 20,
    hasHandle: false,
    shapeType: "straight",
    overallHeightMm: 180,
    outsideDiameterMm: 90,
    topDiameterMm: 90,
    bottomDiameterMm: 90,
    usableHeightMm: 150,
    confidence: 0.8,
    sources: [],
    notes: [],
  });
  const applied = applyTumblerSuggestion(DEFAULT_BED_CONFIG, draft);
  const refreshed = normalizeBedConfig({
    ...applied,
    gridSpacing: 12,
  });

  assert.equal(Number((refreshed.tumblerOutsideDiameterMm ?? 0).toFixed(2)), 90);
  assert.equal(Number(refreshed.width.toFixed(2)), Number((Math.PI * 90).toFixed(2)));
  assert.equal(Number(refreshed.height.toFixed(2)), 150);
});

test("tapered apply keeps workspace diameter bound to outside diameter from lookup", () => {
  const draft = toTumblerSpecDraft({
    productType: "tumbler",
    brand: "Lookup",
    model: "Tapered",
    capacityOz: 30,
    hasHandle: false,
    shapeType: "tapered",
    overallHeightMm: 200,
    outsideDiameterMm: 95,
    topDiameterMm: 98,
    bottomDiameterMm: 78,
    usableHeightMm: 150,
    confidence: 0.7,
    sources: [],
    notes: [],
  });

  const applied = applyTumblerSuggestion(DEFAULT_BED_CONFIG, draft);

  // UI diameter field should reflect lookup outside diameter.
  assert.equal(Number(applied.tumblerDiameterMm.toFixed(2)), 95);
  // Tapered template width remains based on average top/bottom diameter.
  assert.equal(Number(applied.width.toFixed(2)), Number((Math.PI * 88).toFixed(2)));
});

test("raw dimensions and derived template dimensions remain distinct", () => {
  const draft = toTumblerSpecDraft({
    productType: "tumbler",
    brand: "RTIC",
    model: "Road Trip",
    capacityOz: 30,
    hasHandle: false,
    shapeType: "tapered",
    overallHeightMm: 203,
    outsideDiameterMm: 96,
    topDiameterMm: 100,
    bottomDiameterMm: 84,
    usableHeightMm: 160,
    confidence: 0.72,
    sources: [],
    notes: [],
  });

  const applied = applyTumblerSuggestion(DEFAULT_BED_CONFIG, draft);
  const expectedDerivedWidth = Math.PI * ((100 + 84) / 2);

  assert.equal(applied.tumblerOutsideDiameterMm, 96);
  assert.equal(applied.tumblerTopDiameterMm, 100);
  assert.equal(applied.tumblerBottomDiameterMm, 84);
  assert.equal(Number(applied.width.toFixed(2)), Number(expectedDerivedWidth.toFixed(2)));
  assert.notEqual(
    Number(applied.width.toFixed(2)),
    Number((Math.PI * 96).toFixed(2))
  );
});
