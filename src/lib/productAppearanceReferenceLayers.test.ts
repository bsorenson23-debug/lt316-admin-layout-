import assert from "node:assert/strict";
import test from "node:test";

import {
  createBrandLogoReference,
  createFinishBandReference,
  deriveBackLogoAngle,
  deriveFrontCenterAngleFromLogo,
  isAppearanceLayerBodyCutoutQaSafe,
  summarizeAppearanceReferenceLayers,
  validateAppearanceReferenceLayer,
} from "./productAppearanceReferenceLayers.ts";

test("finish bands are reference-only and excluded from BODY CUTOUT QA", () => {
  const topBand = createFinishBandReference({
    id: "top-band",
    kind: "top-finish-band",
    yMm: 0,
    heightMm: 12,
  });

  assert.equal(topBand.referenceOnly, true);
  assert.equal(topBand.includedInBodyCutoutQa, false);
  assert.equal(topBand.materialToken, "silver-finish");
  assert.equal(isAppearanceLayerBodyCutoutQaSafe(topBand), true);
});

test("brand logos are reference-only and tagged as factory-logo context, not engraving artwork", () => {
  const frontLogo = createBrandLogoReference({
    id: "front-logo",
    kind: "front-brand-logo",
    widthMm: 28,
    heightMm: 12,
    angleDeg: 0,
  });

  assert.equal(frontLogo.referenceOnly, true);
  assert.equal(frontLogo.includedInBodyCutoutQa, false);
  assert.equal(frontLogo.materialToken, "factory-logo");
  assert.equal("assetId" in (frontLogo as unknown as Record<string, unknown>), false);
});

test("front logo angle maps to frontCenterAngleDeg", () => {
  const frontLogo = createBrandLogoReference({
    id: "front-logo",
    kind: "front-brand-logo",
    angleDeg: -90,
  });

  assert.equal(deriveFrontCenterAngleFromLogo(frontLogo), 270);
});

test("back logo angle is front plus 180 modulo 360", () => {
  assert.equal(deriveBackLogoAngle(45), 225);
  assert.equal(deriveBackLogoAngle(225), 45);
});

test("invalid finish band dimensions warn for wrap/export context only", () => {
  const invalidBand = createFinishBandReference({
    id: "bad-band",
    kind: "bottom-finish-band",
    yMm: -5,
    heightMm: 0,
  });

  const validation = validateAppearanceReferenceLayer(invalidBand);

  assert.equal(validation.status, "warn");
  assert.equal(validation.bodyCutoutQaSafe, true);
  assert.match(validation.warnings.join(" "), /yMm must be a finite non-negative/i);
  assert.match(validation.warnings.join(" "), /heightMm must be a finite positive/i);
});

test("missing layers produce an empty safe summary", () => {
  const summary = summarizeAppearanceReferenceLayers([]);

  assert.equal(summary.totalLayers, 0);
  assert.equal(summary.topFinishBandPresent, false);
  assert.equal(summary.bottomFinishBandPresent, false);
  assert.equal(summary.frontLogoReferencePresent, false);
  assert.equal(summary.backLogoReferencePresent, false);
  assert.equal(summary.frontCenterAngleDeg, undefined);
  assert.equal(summary.backLogoAngleDeg, undefined);
  assert.deepEqual(summary.warnings, []);
  assert.equal(summary.bodyCutoutQaSafe, true);
});

test("summary reports finish-band and factory-logo presence without marking BODY CUTOUT QA unsafe", () => {
  const summary = summarizeAppearanceReferenceLayers([
    createFinishBandReference({
      id: "top-band",
      kind: "top-finish-band",
      yMm: 0,
      heightMm: 8,
    }),
    createFinishBandReference({
      id: "bottom-band",
      kind: "bottom-finish-band",
      yMm: 210,
      heightMm: 6,
    }),
    createBrandLogoReference({
      id: "front-logo",
      kind: "front-brand-logo",
      angleDeg: 0,
    }),
    createBrandLogoReference({
      id: "back-logo",
      kind: "back-brand-logo",
      angleDeg: 180,
    }),
  ]);

  assert.equal(summary.totalLayers, 4);
  assert.equal(summary.topFinishBandPresent, true);
  assert.equal(summary.bottomFinishBandPresent, true);
  assert.equal(summary.frontLogoReferencePresent, true);
  assert.equal(summary.backLogoReferencePresent, true);
  assert.equal(summary.frontCenterAngleDeg, 0);
  assert.equal(summary.backLogoAngleDeg, 180);
  assert.equal(summary.bodyCutoutQaSafe, true);
});
