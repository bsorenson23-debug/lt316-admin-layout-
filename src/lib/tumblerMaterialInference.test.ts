import assert from "node:assert/strict";
import test from "node:test";

import { resolveTumblerMaterialSetup } from "./tumblerMaterialInference.ts";

test("resolveTumblerMaterialSetup honors an explicit finish override", () => {
  const result = resolveTumblerMaterialSetup({
    laserType: null,
    explicitFinishType: "powder-coat",
  });

  assert.equal(result.laserType, "co2");
  assert.equal(result.materialSlug, "powder-coat");
  assert.equal(result.materialLabel, "Powder Coat");
  assert.equal(result.materialFinishType, "powder-coat");
  assert.ok(result.materialProfileId);
});

test("resolveTumblerMaterialSetup infers stainless steel from text hints", () => {
  const result = resolveTumblerMaterialSetup({
    laserType: null,
    textHints: ["raw stainless travel tumbler"],
  });

  assert.equal(result.laserType, "fiber");
  assert.equal(result.materialSlug, "stainless-steel");
  assert.equal(result.materialLabel, "Stainless Steel");
  assert.equal(result.materialFinishType, "raw-stainless");
});

test("resolveTumblerMaterialSetup falls back to color cues for powder-coated drinkware", () => {
  const result = resolveTumblerMaterialSetup({
    laserType: null,
    bodyColorHex: "#1f4f8f",
    rimColorHex: "#c0c2c5",
  });

  assert.equal(result.laserType, "co2");
  assert.equal(result.materialSlug, "powder-coat");
  assert.equal(result.materialFinishType, "powder-coat");
});
