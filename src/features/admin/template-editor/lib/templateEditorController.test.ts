import assert from "node:assert/strict";
import test from "node:test";

import {
  createInitialTemplateEditorControllerState,
  selectTemplateEditorSectionState,
  selectTemplateEditorWorkflowState,
  templateEditorControllerActions,
  templateEditorControllerReducer,
} from "./templateEditorController.ts";

test("template editor controller stages detection and keeps save gated until review is accepted", () => {
  let state = createInitialTemplateEditorControllerState({
    productType: "tumbler",
    hasAcceptedReview: false,
    hasCanonicalBodyProfile: false,
    hasCanonicalDimensionCalibration: false,
  });

  const beforeDetect = selectTemplateEditorWorkflowState(state, {
    open: true,
    productType: "tumbler",
    hasProductImage: true,
    hasCanonicalBodyProfile: false,
    hasCanonicalDimensionCalibration: false,
    runId: "run-1",
    warnings: [],
    errors: [],
    sourceFingerprints: {},
  });
  assert.equal(beforeDetect.effectiveWorkflowStep, "source");
  assert.match(beforeDetect.reviewFlowSaveGateReason ?? "", /run auto-detect/i);

  state = templateEditorControllerReducer(
    state,
    templateEditorControllerActions.setWorkflowStep("detect"),
  );

  state = templateEditorControllerReducer(
    state,
    templateEditorControllerActions.setStagedDetectResult({
      response: {} as never,
      draft: {} as never,
    }),
  );
  state = templateEditorControllerReducer(
    state,
    templateEditorControllerActions.setWorkflowStep("review"),
  );
  const staged = selectTemplateEditorWorkflowState(state, {
    open: true,
    productType: "tumbler",
    hasProductImage: true,
    hasCanonicalBodyProfile: true,
    hasCanonicalDimensionCalibration: true,
    runId: "run-1",
    warnings: [],
    errors: [],
    sourceFingerprints: {},
  });
  assert.equal(staged.effectiveWorkflowStep, "review");
  assert.equal(staged.stagedDetectionPending, true);
  assert.match(staged.reviewFlowSaveGateReason ?? "", /accept/i);

  state = templateEditorControllerReducer(state, templateEditorControllerActions.setReviewAccepted(true));
  state = templateEditorControllerReducer(state, templateEditorControllerActions.setStagedDetectResult(null));

  const accepted = selectTemplateEditorSectionState(state, {
    open: true,
    productType: "tumbler",
    hasProductImage: true,
    hasCanonicalBodyProfile: true,
    hasCanonicalDimensionCalibration: true,
    runId: "run-1",
    warnings: [],
    errors: [],
    sourceFingerprints: {},
  });
  assert.equal(accepted?.reviewAccepted, true);
  assert.equal(accepted?.saveGateReason, null);
  assert.equal(accepted?.authority, "accepted-body-reference");
});

test("template editor controller restores the prior review snapshot on discard", () => {
  const snapshot = {
    name: "Stanley",
    brand: "Stanley",
    capacity: "40 oz",
    laserType: "fiber" as const,
    productType: "tumbler" as const,
    flatFamilyKey: "",
    resolvedMaterialSlug: "powder-coat",
    resolvedMaterialLabel: "Powder Coat",
    materialProfileId: "profile-1",
    power: 20,
    speed: 300,
    frequency: 30,
    lineInterval: 0.05,
    materialProfileTouched: false,
    diameterMm: 99.8,
    wrapWidthInputMm: 313.6,
    topOuterDiameterMm: 99.8,
    baseDiameterMm: 78.7,
    printHeightMm: 216,
    handleArcDeg: 90,
    taperCorrection: "none" as const,
    overallHeightMm: 273.8,
    bodyTopFromOverallMm: 28,
    bodyBottomFromOverallMm: 244,
    topMarginMm: 28,
    bottomMarginMm: 29.8,
    detectError: null,
    acceptedDetectResult: null,
    workflowStep: "detect" as const,
    reviewAccepted: false,
  };
  let state = createInitialTemplateEditorControllerState({
    productType: "tumbler",
    hasAcceptedReview: false,
    hasCanonicalBodyProfile: false,
    hasCanonicalDimensionCalibration: false,
  });
  state = templateEditorControllerReducer(
    state,
    templateEditorControllerActions.setDetectDraftSnapshot(snapshot),
  );
  state = templateEditorControllerReducer(
    state,
    templateEditorControllerActions.restoreDetectDraftSnapshot(snapshot),
  );
  assert.equal(state.workflowStep, "detect");
  assert.equal(state.reviewAccepted, false);
  assert.deepEqual(state.detectDraftSnapshot, snapshot);
});
