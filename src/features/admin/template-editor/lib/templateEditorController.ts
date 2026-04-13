import {
  buildTemplateCreateWorkflowSteps,
  deriveTemplateCreateWorkflowStep,
  getTemplateCreateSaveGateReason,
  isTemplateCreateReviewFlowProductType,
  type TemplateCreateWorkflowInput,
  type TemplateCreateWorkflowStep,
} from "../../../../lib/templateCreateFlow.ts";
import type {
  TemplateEditorControllerAction,
  TemplateEditorControllerState,
  TemplateEditorSectionState,
  TemplateEditorWorkflowContext,
  TemplateEditorWorkflowState,
} from "../types.ts";

export function createInitialTemplateEditorControllerState(args: {
  productType: string | null | undefined;
  hasAcceptedReview: boolean;
  hasCanonicalBodyProfile: boolean;
  hasCanonicalDimensionCalibration: boolean;
}): TemplateEditorControllerState {
  return {
    workflowStep: deriveTemplateCreateWorkflowStep({
      productType: args.productType,
      hasProductImage: false,
      hasStagedDetectResult: false,
      hasAcceptedReview: args.hasAcceptedReview,
      hasCanonicalBodyProfile: args.hasCanonicalBodyProfile,
      hasCanonicalDimensionCalibration: args.hasCanonicalDimensionCalibration,
    }),
    reviewAccepted: args.hasAcceptedReview,
    stagedDetectResult: null,
    acceptedDetectResult: null,
    detectError: null,
    detectDraftSnapshot: null,
  };
}

export function templateEditorControllerReducer(
  state: TemplateEditorControllerState,
  action: TemplateEditorControllerAction,
): TemplateEditorControllerState {
  switch (action.type) {
    case "set-workflow-step":
      return { ...state, workflowStep: action.step };
    case "set-review-accepted":
      return { ...state, reviewAccepted: action.value };
    case "set-staged-detect-result":
      return { ...state, stagedDetectResult: action.value };
    case "set-accepted-detect-result":
      return { ...state, acceptedDetectResult: action.value };
    case "set-detect-error":
      return { ...state, detectError: action.value };
    case "set-detect-draft-snapshot":
      return { ...state, detectDraftSnapshot: action.value };
    case "restore-detect-draft-snapshot":
      return {
        ...state,
        acceptedDetectResult: action.snapshot.acceptedDetectResult,
        detectError: action.snapshot.detectError,
        detectDraftSnapshot: action.snapshot,
        reviewAccepted: action.snapshot.reviewAccepted,
        workflowStep: action.snapshot.workflowStep,
      };
    default:
      return state;
  }
}

export const templateEditorControllerActions = {
  setWorkflowStep(step: TemplateCreateWorkflowStep): TemplateEditorControllerAction {
    return { type: "set-workflow-step", step };
  },
  setReviewAccepted(value: boolean): TemplateEditorControllerAction {
    return { type: "set-review-accepted", value };
  },
  setStagedDetectResult(value: TemplateEditorControllerState["stagedDetectResult"]): TemplateEditorControllerAction {
    return { type: "set-staged-detect-result", value };
  },
  setAcceptedDetectResult(value: TemplateEditorControllerState["acceptedDetectResult"]): TemplateEditorControllerAction {
    return { type: "set-accepted-detect-result", value };
  },
  setDetectError(value: string | null): TemplateEditorControllerAction {
    return { type: "set-detect-error", value };
  },
  setDetectDraftSnapshot(
    value: TemplateEditorControllerState["detectDraftSnapshot"],
  ): TemplateEditorControllerAction {
    return { type: "set-detect-draft-snapshot", value };
  },
  restoreDetectDraftSnapshot(
    snapshot: NonNullable<TemplateEditorControllerState["detectDraftSnapshot"]>,
  ): TemplateEditorControllerAction {
    return { type: "restore-detect-draft-snapshot", snapshot };
  },
};

function buildWorkflowInput(
  state: TemplateEditorControllerState,
  context: TemplateEditorWorkflowContext,
): TemplateCreateWorkflowInput {
  return {
    productType: context.productType,
    hasProductImage: context.hasProductImage,
    hasStagedDetectResult: Boolean(state.stagedDetectResult),
    hasAcceptedReview: state.reviewAccepted,
    hasCanonicalBodyProfile: context.hasCanonicalBodyProfile,
    hasCanonicalDimensionCalibration: context.hasCanonicalDimensionCalibration,
  };
}

export function selectTemplateEditorWorkflowState(
  state: TemplateEditorControllerState,
  context: TemplateEditorWorkflowContext,
): TemplateEditorWorkflowState {
  const workflowInput = buildWorkflowInput(state, context);
  const usesGuidedReviewFlow = isTemplateCreateReviewFlowProductType(context.productType);
  const workflowSteps = buildTemplateCreateWorkflowSteps(workflowInput);
  const derivedWorkflowStep = deriveTemplateCreateWorkflowStep(workflowInput);
  const effectiveWorkflowStep = usesGuidedReviewFlow
    ? (
        state.workflowStep === "review" &&
        derivedWorkflowStep !== "review" &&
        !state.stagedDetectResult &&
        !state.reviewAccepted
          ? derivedWorkflowStep
          : state.workflowStep
      )
    : "source";
  const reviewFlowSaveGateReason = getTemplateCreateSaveGateReason(workflowInput);
  const stagedDetectionPending = Boolean(state.stagedDetectResult) && !state.reviewAccepted;

  return {
    usesGuidedReviewFlow,
    workflowSteps,
    derivedWorkflowStep,
    effectiveWorkflowStep,
    reviewFlowSaveGateReason,
    stagedDetectionPending,
    activeSectionId: usesGuidedReviewFlow ? `template.${effectiveWorkflowStep}` : "template.source",
  };
}

export function selectTemplateEditorSectionState(
  state: TemplateEditorControllerState,
  context: TemplateEditorWorkflowContext,
): TemplateEditorSectionState | null {
  if (!context.open) return null;

  const workflow = selectTemplateEditorWorkflowState(state, context);
  return {
    open: true,
    activeStep: workflow.effectiveWorkflowStep,
    reviewAccepted: state.reviewAccepted,
    stagedDetectionPending: workflow.stagedDetectionPending,
    saveGateReason: workflow.reviewFlowSaveGateReason,
    runId: context.runId,
    authority: state.reviewAccepted
      ? "accepted-body-reference"
      : workflow.stagedDetectionPending
        ? "staged-detection"
        : "guided-review-flow",
    warnings: context.warnings,
    errors: context.errors,
    sourceFingerprints: context.sourceFingerprints,
  };
}
