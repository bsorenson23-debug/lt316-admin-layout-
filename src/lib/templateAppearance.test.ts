import test from "node:test";
import assert from "node:assert/strict";

import {
  applyManualTemplateAppearanceColor,
  applySampledTemplateAppearance,
  applyTemplateRingFinish,
  applyUseSampledTemplateAppearanceColor,
  hydrateTemplateAppearanceState,
  hydrateProductTemplateAppearance,
} from "./templateAppearance.ts";
import type { ProductTemplate } from "@/types/productTemplate";

test("legacy appearance hydration defaults lid to fallback-body and ring finish to metallic silver", () => {
  const state = hydrateTemplateAppearanceState({
    bodyColorHex: "#112233",
    lidColorHex: "#112233",
    rimColorHex: "#445566",
  });

  assert.equal(state.bodyColorHex, "#112233");
  assert.equal(state.lidColorHex, "#112233");
  assert.equal(state.rimColorHex, "#445566");
  assert.equal(state.appearance.body.source, "sampled");
  assert.equal(state.appearance.lid.source, "fallback-body");
  assert.equal(state.appearance.rim.source, "sampled");
  assert.equal(state.appearance.ringFinish, "metallic-silver");
});

test("manual overrides are not overwritten by later sampled colors", () => {
  const base = hydrateTemplateAppearanceState({
    bodyColorHex: "#334455",
    lidColorHex: "#8899aa",
    rimColorHex: "#ddeeff",
  });
  const manual = applyManualTemplateAppearanceColor(base, "lid", "#123456");
  const sampled = applySampledTemplateAppearance(manual, {
    lidColorHex: "#abcdef",
  });

  assert.equal(sampled.lidColorHex, "#123456");
  assert.equal(sampled.appearance.lid.source, "manual");
  assert.equal(sampled.appearance.lid.sampledHex, "#abcdef");
});

test("use sampled restores the latest sampled value and source", () => {
  const base = hydrateTemplateAppearanceState({
    bodyColorHex: "#334455",
    lidColorHex: "#8899aa",
    rimColorHex: "#ddeeff",
  });
  const manual = applyManualTemplateAppearanceColor(base, "rim", "#123456");
  const sampled = applySampledTemplateAppearance(manual, {
    rimColorHex: "#fedcba",
  });
  const restored = applyUseSampledTemplateAppearanceColor(sampled, "rim");

  assert.equal(restored.rimColorHex, "#fedcba");
  assert.equal(restored.appearance.rim.source, "sampled");
});

test("fallback-body lid stays locked to body after later body changes", () => {
  const base = hydrateTemplateAppearanceState({
    bodyColorHex: "#223344",
    lidColorHex: "#223344",
    rimColorHex: "#ccddee",
  });
  const updated = applySampledTemplateAppearance(base, {
    bodyColorHex: "#556677",
  });

  assert.equal(updated.lidColorHex, "#556677");
  assert.equal(updated.appearance.lid.source, "fallback-body");
  assert.equal(updated.appearance.lid.sampledHex, undefined);
});

test("tinted ring finish is opt-in and metallic silver remains the default", () => {
  const base = hydrateTemplateAppearanceState({
    bodyColorHex: "#223344",
    lidColorHex: "#223344",
    rimColorHex: "#ccddee",
  });
  const tinted = applyTemplateRingFinish(base, "tinted");
  const restored = hydrateTemplateAppearanceState({
    bodyColorHex: tinted.bodyColorHex,
    lidColorHex: tinted.lidColorHex,
    rimColorHex: tinted.rimColorHex,
    appearance: tinted.appearance,
  });

  assert.equal(tinted.appearance.ringFinish, "tinted");
  assert.equal(restored.appearance.ringFinish, "tinted");
});

test("hydrateProductTemplateAppearance preserves manual appearance metadata on saved templates", () => {
  const template = {
    id: "template-1",
    builtIn: false,
    productType: "tumbler",
    name: "Example",
    brand: "",
    capacityLabel: "",
    dimensions: {
      overallHeightMm: 100,
      bodyHeightMm: 80,
      topDiameterMm: 90,
      bottomDiameterMm: 70,
      wrapWidthMm: 282.74,
      bodyColorHex: "#111111",
      lidColorHex: "#222222",
      rimColorHex: "#333333",
    },
    laserType: "fiber",
    laserSettings: {
      power: 50,
      speed: 500,
      frequency: 30,
      lineInterval: 0.05,
    },
    appearance: {
      body: { source: "sampled", sampledHex: "#111111" },
      lid: { source: "manual", sampledHex: "#777777" },
      rim: { source: "sampled", sampledHex: "#333333" },
      ringFinish: "tinted",
    },
  } as unknown as ProductTemplate;

  const hydrated = hydrateProductTemplateAppearance(template);

  assert.equal(hydrated.dimensions.lidColorHex, "#222222");
  assert.equal(hydrated.appearance?.lid.source, "manual");
  assert.equal(hydrated.appearance?.lid.sampledHex, "#777777");
  assert.equal(hydrated.appearance?.ringFinish, "tinted");
});
