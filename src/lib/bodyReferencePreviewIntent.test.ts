import assert from "node:assert/strict";
import test from "node:test";

import {
  getBodyReferencePreviewModeHint,
  getBodyReferencePreviewModeLabel,
  getDrinkwareGlbStatusLabel,
  isBodyCutoutQaPreviewAvailable,
} from "./bodyReferencePreviewIntent.ts";

test("review scaffold labels reserve BODY CUTOUT QA without runtime-truth wording", () => {
  assert.equal(
    getBodyReferencePreviewModeLabel({
      productType: "tumbler",
      mode: "body-cutout-qa",
      glbStatus: "verified-product-model",
    }),
    "BODY CUTOUT QA · RESERVED",
  );
  assert.match(
    getBodyReferencePreviewModeHint({
      productType: "tumbler",
      mode: "body-cutout-qa",
    }) ?? "",
    /reserved/i,
  );
});

test("preview scaffold still exposes source compare and full-model labels", () => {
  assert.equal(
    getBodyReferencePreviewModeLabel({
      productType: "tumbler",
      mode: "full-model",
      glbStatus: "verified-product-model",
    }),
    "FULL MODEL · REVIEW SCAFFOLD",
  );
  assert.equal(
    getBodyReferencePreviewModeLabel({
      productType: "tumbler",
      mode: "source-traced",
      glbStatus: "placeholder-model",
    }),
    "PLACEHOLDER MODEL · SOURCE COMPARE",
  );
});

test("BODY CUTOUT QA availability stays tied to reviewed generated models", () => {
  assert.equal(isBodyCutoutQaPreviewAvailable("generated-reviewed-model"), true);
  assert.equal(isBodyCutoutQaPreviewAvailable("verified-product-model"), false);
  assert.equal(isBodyCutoutQaPreviewAvailable(null), false);
});

test("drinkware status labels remain operator readable", () => {
  assert.equal(getDrinkwareGlbStatusLabel("verified-product-model"), "Verified product model");
  assert.equal(
    getDrinkwareGlbStatusLabel("generated-reviewed-model"),
    "Reviewed cutout-generated model",
  );
  assert.equal(getDrinkwareGlbStatusLabel(undefined), null);
});
