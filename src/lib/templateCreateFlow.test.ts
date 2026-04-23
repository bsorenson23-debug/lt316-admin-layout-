import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTemplateCreateWorkflowSteps,
  deriveTemplateCreateWorkflowStep,
  getTemplateCreateGenerateGateReason,
  getTemplateCreateNextActionHint,
  getTemplateCreatePreviewGateNotes,
  getTemplateCreateSaveGateReason,
  getTemplateCreateSourceReadiness,
} from "./templateCreateFlow.ts";

test("template create workflow stays on source before detect prerequisites exist", () => {
  const input = {
    productType: "tumbler",
    hasProductImage: false,
    hasStagedDetectResult: false,
    hasAcceptedReview: false,
    hasReviewedBodyCutoutQa: false,
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
  assert.equal(steps[3]?.status, "review");
  assert.equal(steps[4]?.status, "review");
  assert.equal(
    getTemplateCreateNextActionHint(input),
    "Run lookup or upload a product image so detection and BODY REFERENCE review can start.",
  );
});

test("template create workflow moves to review when a detection proposal is staged", () => {
  const input = {
    productType: "tumbler",
    hasProductImage: true,
    hasStagedDetectResult: true,
    hasAcceptedReview: false,
    hasReviewedBodyCutoutQa: false,
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
  assert.equal(steps[3]?.status, "review");
  assert.equal(steps[4]?.status, "review");
  assert.equal(
    getTemplateCreateNextActionHint(input),
    "Accept BODY REFERENCE review to lock the current v1 contour before QA generation.",
  );
});

test("template create workflow clears the save gate after review is accepted", () => {
  const input = {
    productType: "tumbler",
    hasProductImage: true,
    hasStagedDetectResult: false,
    hasAcceptedReview: true,
    hasReviewedBodyCutoutQa: false,
    hasCanonicalBodyProfile: true,
    hasCanonicalDimensionCalibration: true,
  } as const;

  assert.equal(deriveTemplateCreateWorkflowStep(input), "generate");
  assert.equal(getTemplateCreateSaveGateReason(input), null);

  const steps = buildTemplateCreateWorkflowSteps(input);
  assert.equal(steps[2]?.status, "ready");
  assert.equal(steps[3]?.status, "action");
  assert.equal(steps[4]?.status, "review");
});

test("source and detect readiness stay blocked until a detectable product image exists", () => {
  const readiness = getTemplateCreateSourceReadiness({
    productType: "tumbler",
    hasProductImage: false,
  });

  assert.equal(readiness.sourceReady, false);
  assert.equal(readiness.detectReady, false);
  assert.deepEqual(readiness.missing, ["productImage"]);
  assert.equal(readiness.blockedReason, "Upload a product image in Source before photo auto-detect.");
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
    hasReviewedBodyCutoutQa: false,
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
    hasReviewedBodyCutoutQa: false,
    hasCanonicalBodyProfile: false,
    hasCanonicalDimensionCalibration: false,
  } as const;

  assert.equal(deriveTemplateCreateWorkflowStep(input), "source");
  assert.equal(getTemplateCreateSaveGateReason(input), null);

  const steps = buildTemplateCreateWorkflowSteps(input);
  assert.equal(steps[1]?.detail, "Detection is not required for flat templates.");
  assert.equal(steps[2]?.status, "ready");
  assert.equal(steps[3]?.detail, "BODY CUTOUT QA generation is only used for drinkware review.");
  assert.equal(steps[4]?.detail, "Use preview and save when the flat template is ready.");
});

test("workflow moves to preview after the reviewed QA GLB exists", () => {
  const input = {
    productType: "tumbler",
    hasProductImage: true,
    hasStagedDetectResult: false,
    hasAcceptedReview: true,
    hasReviewedBodyCutoutQa: true,
    hasCanonicalBodyProfile: true,
    hasCanonicalDimensionCalibration: true,
  } as const;

  assert.equal(deriveTemplateCreateWorkflowStep(input), "preview");

  const steps = buildTemplateCreateWorkflowSteps(input);
  assert.equal(steps[3]?.status, "ready");
  assert.equal(steps[4]?.status, "action");
  assert.equal(
    getTemplateCreateNextActionHint(input),
    "Use BODY CUTOUT QA, WRAP / EXPORT, or compare views as needed, then save when the template is ready.",
  );
});

test("lookup-first review hint stays actionable even before photo auto-detect is available", () => {
  const input = {
    productType: "tumbler",
    hasProductImage: false,
    hasStagedDetectResult: true,
    hasAcceptedReview: false,
    hasReviewedBodyCutoutQa: false,
    hasCanonicalBodyProfile: true,
    hasCanonicalDimensionCalibration: true,
  } as const;

  assert.equal(deriveTemplateCreateWorkflowStep(input), "review");
  assert.equal(
    getTemplateCreateNextActionHint(input),
    "Review the staged BODY REFERENCE now. Upload a product image later if you want to rerun photo auto-detect.",
  );
});

test("generate gate reason explains why BODY CUTOUT QA generation is disabled", () => {
  assert.equal(
    getTemplateCreateGenerateGateReason({
      productType: "tumbler",
      hasAcceptedReview: false,
      canGenerate: false,
      hasPendingSourceDraft: false,
    }),
    "Accept BODY REFERENCE review before generating BODY CUTOUT QA.",
  );
  assert.equal(
    getTemplateCreateGenerateGateReason({
      productType: "tumbler",
      hasAcceptedReview: true,
      canGenerate: true,
      hasPendingSourceDraft: true,
    }),
    "Accept corrected cutout changes before generating BODY CUTOUT QA.",
  );
});

test("preview gate notes explain why preview buttons stay disabled", () => {
  assert.deepEqual(
    getTemplateCreatePreviewGateNotes({
      hasSourceModel: false,
      hasQaPreview: false,
    }),
    [
      "Full model, WRAP / EXPORT, and Source compare stay disabled until a source model is loaded.",
      "BODY CUTOUT QA preview unlocks after generating the reviewed body-only GLB.",
    ],
  );
  assert.deepEqual(
    getTemplateCreatePreviewGateNotes({
      hasSourceModel: true,
      hasQaPreview: false,
    }),
    ["BODY CUTOUT QA preview unlocks after generating the reviewed body-only GLB."],
  );
});
