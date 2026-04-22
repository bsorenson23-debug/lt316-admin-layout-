export type TemplateCreateWorkflowStep = "source" | "detect" | "review";

export type TemplateCreateWorkflowStatus = "ready" | "action" | "review";

export interface TemplateCreateWorkflowInput {
  productType: string | null | undefined;
  hasProductImage: boolean;
  hasStagedDetectResult: boolean;
  hasAcceptedReview: boolean;
  hasCanonicalBodyProfile: boolean;
  hasCanonicalDimensionCalibration: boolean;
}

export interface TemplateCreateWorkflowStepState {
  step: TemplateCreateWorkflowStep;
  label: string;
  status: TemplateCreateWorkflowStatus;
  detail: string;
}

export interface TemplateCreateSourceReadiness {
  sourceReady: boolean;
  detectReady: boolean;
  missing: Array<"productType" | "productImage">;
  blockedReason?: string;
}

export function isTemplateCreateReviewFlowProductType(
  productType: string | null | undefined,
): boolean {
  return productType !== "flat";
}

export function getTemplateCreateSourceReadiness(
  input: Pick<TemplateCreateWorkflowInput, "productType" | "hasProductImage">,
): TemplateCreateSourceReadiness {
  if (!input.productType) {
    return {
      sourceReady: false,
      detectReady: false,
      missing: ["productType"],
      blockedReason: "Choose a drinkware product type in Source first.",
    };
  }

  if (!isTemplateCreateReviewFlowProductType(input.productType)) {
    return {
      sourceReady: true,
      detectReady: false,
      missing: [],
    };
  }

  if (!input.hasProductImage) {
    return {
      sourceReady: false,
      detectReady: false,
      missing: ["productImage"],
      blockedReason: "Upload a product image in Source before detection.",
    };
  }

  return {
    sourceReady: true,
    detectReady: true,
    missing: [],
  };
}

export function deriveTemplateCreateWorkflowStep(
  input: TemplateCreateWorkflowInput,
): TemplateCreateWorkflowStep {
  if (!isTemplateCreateReviewFlowProductType(input.productType)) {
    return "source";
  }
  if (
    input.hasAcceptedReview ||
    input.hasStagedDetectResult ||
    (input.hasCanonicalBodyProfile && input.hasCanonicalDimensionCalibration)
  ) {
    return "review";
  }
  if (input.hasProductImage) {
    return "detect";
  }
  return "source";
}

export function getTemplateCreateSaveGateReason(
  input: TemplateCreateWorkflowInput,
): string | null {
  if (!isTemplateCreateReviewFlowProductType(input.productType)) {
    return null;
  }
  if (!input.productType) {
    return "Choose a drinkware product type, run auto-detect, and accept the body reference before saving.";
  }
  if (!input.hasProductImage) {
    return "Add a product image, run auto-detect, and accept the body reference before saving.";
  }
  if (!input.hasAcceptedReview) {
    if (input.hasCanonicalBodyProfile && input.hasCanonicalDimensionCalibration) {
      return "Review and accept the body reference before saving.";
    }
    return input.hasStagedDetectResult
      ? "Accept the detected body reference before saving."
      : "Run auto-detect and accept the detected body reference before saving.";
  }
  if (!input.hasCanonicalBodyProfile || !input.hasCanonicalDimensionCalibration) {
    return "Finish BODY REFERENCE before saving.";
  }
  return null;
}

export function buildTemplateCreateWorkflowSteps(
  input: TemplateCreateWorkflowInput,
): TemplateCreateWorkflowStepState[] {
  const reviewFlow = isTemplateCreateReviewFlowProductType(input.productType);
  const productTypeChosen = Boolean(input.productType);
  const sourceReadiness = getTemplateCreateSourceReadiness(input);

  return [
    {
      step: "source",
      label: "Source",
      status:
        input.productType && (!reviewFlow || sourceReadiness.sourceReady)
          ? "ready"
          : "action",
      detail: input.productType
        ? !reviewFlow || sourceReadiness.sourceReady
          ? "Product type and source imagery are ready."
          : "Add a product image before detection."
        : "Choose a product type and load source material.",
    },
    {
      step: "detect",
      label: "Detect",
      status: !reviewFlow
        ? "review"
        : input.hasStagedDetectResult || input.hasAcceptedReview
          ? "ready"
          : input.hasProductImage
            ? "action"
            : "review",
      detail: !reviewFlow
        ? "Detection is not required for flat templates."
        : !productTypeChosen
          ? "Choose a drinkware product type to enable auto-detect."
          : input.hasStagedDetectResult
            ? "Detection proposal is ready for review."
            : input.hasAcceptedReview
              ? "Detected body reference has been accepted."
              : sourceReadiness.detectReady
                ? "Run auto-detect to stage a body reference proposal."
                : (sourceReadiness.blockedReason ?? "Add a product image first."),
    },
    {
      step: "review",
      label: "Review & Save",
      status: !reviewFlow
        ? "ready"
        : input.hasAcceptedReview && input.hasCanonicalBodyProfile && input.hasCanonicalDimensionCalibration
          ? "ready"
          : input.hasStagedDetectResult
            ? "action"
            : "review",
      detail: !reviewFlow
        ? "Review and save when the flat template is ready."
        : !productTypeChosen
          ? "Complete the source step before review."
          : input.hasAcceptedReview
            ? "Printable body reference is locked and ready to save."
            : input.hasStagedDetectResult
              ? "Accept or discard the staged body reference."
              : "Run detection before review.",
    },
  ];
}
