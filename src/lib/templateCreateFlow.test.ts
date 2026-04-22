import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTemplateCreateWorkflowSteps,
  deriveTemplateCreateWorkflowStep,
  getTemplateCreateSaveGateReason,
  getTemplateCreateSourceReadiness,
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

test("source and detect readiness stay blocked until a detectable product image exists", () => {
  const readiness = getTemplateCreateSourceReadiness({
    productType: "tumbler",
    hasProductImage: false,
  });

  assert.equal(readiness.sourceReady, false);
  assert.equal(readiness.detectReady, false);
  assert.deepEqual(readiness.missing, ["productImage"]);
  assert.equal(readiness.blockedReason, "Upload a product image in Source before detection.");
});

test("source and detect readiness agree once a detectable product image exists", () => {
  const readiness = getTemplateCreateSourceReadiness({
    productType: "tumbler",
    hasProductImage: true,
  });

  assert.equal(readiness.sourceReady, true);
  assert.equal(readiness.detectReady, true);
  assert.deepEqual(readiness.missing, []);
  assert.equal(readiness.blockedReason, undefined);
});

test("review and save remain blocked until body reference acceptance", () => {
  const input = {
    productType: "tumbler",
    hasProductImage: true,
    hasStagedDetectResult: false,
    hasAcceptedReview: false,
    hasCanonicalBodyProfile: true,
    hasCanonicalDimensionCalibration: true,
  } as const;

  assert.equal(
    getTemplateCreateSaveGateReason(input),
    "Review and accept the body reference before saving.",
  );

  const steps = buildTemplateCreateWorkflowSteps(input);
  assert.equal(steps[0]?.status, "ready");
  assert.equal(steps[1]?.status, "action");
  assert.equal(steps[2]?.status, "review");
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
