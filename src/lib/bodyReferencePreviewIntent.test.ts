import assert from "node:assert/strict";
import test from "node:test";

import {
  getBodyReferencePreviewModeHint,
  getBodyReferencePreviewModeLabel,
  getDrinkwareGlbStatusLabel,
  isBodyCutoutQaPreviewAvailable,
} from "./bodyReferencePreviewIntent.ts";

test("preview labels keep BODY CUTOUT QA explicit and operator-readable", () => {
  assert.equal(
    getBodyReferencePreviewModeLabel({
      productType: "tumbler",
      mode: "body-cutout-qa",
      glbStatus: "verified-product-model",
    }),
    "BODY CUTOUT QA · BODY ONLY",
  );
  assert.match(
    getBodyReferencePreviewModeHint({
      productType: "tumbler",
      mode: "body-cutout-qa",
    }) ?? "",
    /validates the loaded geometry/i,
  );
});

test("preview scaffold still exposes source compare and full-model labels", () => {
  assert.equal(
    getBodyReferencePreviewModeLabel({
      productType: "tumbler",
      mode: "full-model",
      glbStatus: "verified-product-model",
    }),
    "FULL MODEL · GEOMETRY REFERENCE",
  );
  assert.equal(
    getBodyReferencePreviewModeLabel({
      productType: "tumbler",
      mode: "source-traced",
      glbStatus: "placeholder-model",
    }),
    "PLACEHOLDER MODEL · SOURCE COMPARE",
  );
  assert.equal(
    getBodyReferencePreviewModeLabel({
      productType: "tumbler",
      mode: "wrap-export",
      glbStatus: "verified-product-model",
    }),
    "WRAP / EXPORT · PLACEMENT READINESS",
  );
  assert.match(
    getBodyReferencePreviewModeHint({
      productType: "tumbler",
      mode: "alignment-model",
    }) ?? "",
    /visual reference only/i,
  );
  assert.match(
    getBodyReferencePreviewModeHint({
      productType: "tumbler",
      mode: "full-model",
    }) ?? "",
    /not BODY CUTOUT QA proof/i,
  );
  assert.match(
    getBodyReferencePreviewModeHint({
      productType: "tumbler",
      mode: "wrap-export",
    }) ?? "",
    /without claiming body cutout qa proof/i,
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
