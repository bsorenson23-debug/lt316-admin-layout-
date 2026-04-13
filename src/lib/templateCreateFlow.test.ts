import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTemplateCreateReviewProjection,
  buildTemplateCreateWorkflowSteps,
  deriveTemplateCreateWorkflowStep,
  getTemplateCreateSaveGateReason,
} from "./templateCreateFlow.ts";

test("template create workflow stays on source before detect prerequisites exist", () => {
  const input = {
    productType: "tumbler",
    hasProductImage: false,
    hasStagedDetectResult: false,
    hasAcceptedReview: false,
    hasCanonicalBodyProfile: false,
    hasCanonicalDimensionCalibration: false,
  } as const;

  assert.equal(deriveTemplateCreateWorkflowStep(input), "source");
  assert.equal(
    getTemplateCreateSaveGateReason(input),
    "Add a product image, run auto-detect, and accept the body reference before saving.",
  );

  const steps = buildTemplateCreateWorkflowSteps(input);
  assert.equal(steps[0]?.status, "action");
  assert.equal(steps[1]?.status, "review");
  assert.equal(steps[2]?.status, "review");
});

test("template create workflow moves to review when a detection proposal is staged", () => {
  const input = {
    productType: "tumbler",
    hasProductImage: true,
    hasStagedDetectResult: true,
    hasAcceptedReview: false,
    hasCanonicalBodyProfile: true,
    hasCanonicalDimensionCalibration: true,
  } as const;

  assert.equal(deriveTemplateCreateWorkflowStep(input), "review");
  assert.equal(
    getTemplateCreateSaveGateReason(input),
    "Review and accept the body reference before saving.",
  );

  const steps = buildTemplateCreateWorkflowSteps(input);
  assert.equal(steps[1]?.status, "ready");
  assert.equal(steps[2]?.status, "action");
});

test("template create workflow clears the save gate after review is accepted", () => {
  const input = {
    productType: "tumbler",
    hasProductImage: true,
    hasStagedDetectResult: false,
    hasAcceptedReview: true,
    hasCanonicalBodyProfile: true,
    hasCanonicalDimensionCalibration: true,
  } as const;

  assert.equal(deriveTemplateCreateWorkflowStep(input), "review");
  assert.equal(getTemplateCreateSaveGateReason(input), null);

  const steps = buildTemplateCreateWorkflowSteps(input);
  assert.equal(steps[2]?.status, "ready");
});

test("review projection keeps operator fields separate from advanced diagnostics", () => {
  const projection = buildTemplateCreateReviewProjection({
    lidBodyLineMm: 28,
    bodyBottomMm: 244,
    bodyHeightMm: 216,
    diameterMm: 99.8,
    wrapWidthMm: 313.6,
    printableTopMm: 28,
    printableBottomMm: 244,
    printableHeightMm: 216,
    topExclusions: "lid / ring",
    hasHandleKeepOut: true,
    frontTransform: "0.717, 0.000, -58.395, 0.000, 0.583, -25.841",
    visibleOuterDiameterLabel: "visible outer diameter",
    silverRingTopMm: 62.8,
    silverRingBottomMm: 73.7,
    bandDetectLabel: "body-top-fallback 100%",
    handleMetricsLabel: "79.7 -> 170.6 mm",
    warnings: ["Fallback review required."],
  });

  assert.deepEqual(
    projection.printableBand.map((field) => field.value),
    ["28 mm", "244 mm", "216 mm"],
  );
  assert.deepEqual(
    projection.exclusions.map((field) => field.value),
    ["lid / ring", "yes"],
  );
  assert.equal(projection.advanced[0]?.label, "Front transform");
  assert.equal(projection.advanced[2]?.value, "62.8 mm");
  assert.match(projection.advanced[6]?.value ?? "", /Fallback review required/);
});

test("flat templates do not require the guided detect review gate", () => {
  const input = {
    productType: "flat",
    hasProductImage: false,
    hasStagedDetectResult: false,
    hasAcceptedReview: false,
    hasCanonicalBodyProfile: false,
    hasCanonicalDimensionCalibration: false,
  } as const;

  assert.equal(deriveTemplateCreateWorkflowStep(input), "source");
  assert.equal(getTemplateCreateSaveGateReason(input), null);

  const steps = buildTemplateCreateWorkflowSteps(input);
  assert.equal(steps[1]?.detail, "Detection is not required for flat templates.");
  assert.equal(steps[2]?.status, "ready");
});
