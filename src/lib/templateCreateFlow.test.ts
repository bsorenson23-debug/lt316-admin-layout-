import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTemplateOperatorSectionStates,
  buildTemplateCreateWorkflowSteps,
  deriveTemplateCreateWorkflowStep,
  getTemplateBodyCutoutQaGlbLifecycle,
  getTemplateBodyReferenceV2OperatorState,
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
  assert.equal(readiness.blockedReason, "Upload a product photo first.");
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
    "Accept BODY REFERENCE first.",
  );
  assert.equal(
    getTemplateCreateGenerateGateReason({
      productType: "tumbler",
      hasAcceptedReview: true,
      canGenerate: true,
      hasPendingSourceDraft: true,
    }),
    "Accept corrected cutout changes first.",
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

test("BODY CUTOUT QA GLB lifecycle distinguishes missing generated state from stale state", () => {
  assert.deepEqual(
    getTemplateBodyCutoutQaGlbLifecycle({
      hasAcceptedBodyReference: true,
      hasReviewedGlb: false,
      hasPendingSourceDraft: false,
      freshnessStatus: "stale",
    }),
    {
      status: "not-generated",
      label: "BODY CUTOUT QA GLB: not generated yet",
      nextActionLabel: "Generate BODY CUTOUT QA GLB",
      canRequestGeneration: true,
      canShowFullBodyCutoutQaPass: false,
    },
  );
});

test("BODY CUTOUT QA GLB lifecycle reports fresh and stale reviewed artifacts", () => {
  const fresh = getTemplateBodyCutoutQaGlbLifecycle({
    hasAcceptedBodyReference: true,
    hasReviewedGlb: true,
    hasPendingSourceDraft: false,
    freshnessStatus: "current",
    runtimeInspectionStatus: "complete",
    validationStatus: "pass",
  });

  assert.equal(fresh.status, "fresh");
  assert.equal(fresh.label, "BODY CUTOUT QA GLB: fresh");
  assert.equal(fresh.nextActionLabel, null);
  assert.equal(fresh.canShowFullBodyCutoutQaPass, true);

  const stale = getTemplateBodyCutoutQaGlbLifecycle({
    hasAcceptedBodyReference: true,
    hasReviewedGlb: true,
    hasPendingSourceDraft: false,
    freshnessStatus: "stale",
  });

  assert.equal(stale.status, "stale");
  assert.equal(stale.label, "BODY CUTOUT QA GLB: stale");
  assert.equal(stale.nextActionLabel, "Regenerate BODY CUTOUT QA GLB");
  assert.equal(stale.canShowFullBodyCutoutQaPass, false);
});

test("pending fine-tune draft blocks BODY CUTOUT QA regeneration until accepted", () => {
  const state = getTemplateBodyCutoutQaGlbLifecycle({
    hasAcceptedBodyReference: true,
    hasReviewedGlb: true,
    hasPendingSourceDraft: true,
    freshnessStatus: "current",
    runtimeInspectionStatus: "complete",
    validationStatus: "pass",
  });

  assert.equal(state.status, "waiting-for-accepted-cutout");
  assert.equal(state.label, "BODY CUTOUT QA GLB: waiting for accepted cutout");
  assert.equal(state.nextActionLabel, "Accept corrected cutout");
  assert.equal(state.canRequestGeneration, false);
  assert.equal(state.canShowFullBodyCutoutQaPass, false);
});

test("BODY CUTOUT QA cannot show full pass before runtime inspection completes", () => {
  const state = getTemplateBodyCutoutQaGlbLifecycle({
    hasAcceptedBodyReference: true,
    hasReviewedGlb: true,
    hasPendingSourceDraft: false,
    glbFreshRelativeToSource: true,
    runtimeInspectionStatus: "idle",
    validationStatus: "pass",
  });

  assert.equal(state.status, "fresh");
  assert.equal(state.canShowFullBodyCutoutQaPass, false);
  assert.equal(state.nextActionLabel, "Run BODY CUTOUT QA runtime inspection");
});

test("inactive BODY REFERENCE v2 remains optional and does not promote errors to the main path", () => {
  const state = getTemplateBodyReferenceV2OperatorState({
    isActiveGenerationSource: false,
    accepted: false,
    generationReady: false,
    hasDraftChanges: false,
    errorCount: 2,
    warningCount: 1,
  });

  assert.equal(state.status, "optional-inactive");
  assert.equal(state.label, "BODY REFERENCE v2 optional · not active");
  assert.equal(state.promoteMessagesToMainPath, false);
});

test("active BODY REFERENCE v2 promotes readiness errors", () => {
  const state = getTemplateBodyReferenceV2OperatorState({
    isActiveGenerationSource: true,
    accepted: true,
    generationReady: false,
    hasDraftChanges: false,
    errorCount: 1,
    warningCount: 0,
  });

  assert.equal(state.status, "active-blocked");
  assert.equal(state.promoteMessagesToMainPath, true);
});

test("template operator sections keep debug collapsed by default", () => {
  const sections = buildTemplateOperatorSectionStates({
    debugVisible: true,
    bodyReferenceV2Active: false,
  });

  const debug = sections.find((section) => section.id === "advanced-debug");
  const v2 = sections.find((section) => section.id === "body-reference-v2");
  const qa = sections.find((section) => section.id === "body-cutout-qa");

  assert.equal(debug?.category, "debug");
  assert.equal(debug?.defaultCollapsed, true);
  assert.equal(v2?.category, "optional");
  assert.equal(v2?.defaultCollapsed, true);
  assert.equal(v2?.visibleInMainPath, false);
  assert.equal(qa?.category, "proof");
  assert.equal(qa?.visibleInMainPath, true);
});
