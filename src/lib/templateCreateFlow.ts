export type TemplateCreateWorkflowStep = "source" | "detect" | "review" | "generate" | "preview";

export type TemplateCreateWorkflowStatus = "ready" | "action" | "review";

export interface TemplateCreateWorkflowInput {
  productType: string | null | undefined;
  hasProductImage: boolean;
  hasStagedDetectResult: boolean;
  hasAcceptedReview: boolean;
  hasReviewedBodyCutoutQa: boolean;
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

export interface TemplateCreateGenerateGateInput {
  productType: string | null | undefined;
  hasAcceptedReview: boolean;
  canGenerate: boolean;
  hasPendingSourceDraft: boolean;
}

export interface TemplateCreatePreviewGateInput {
  hasSourceModel: boolean;
  hasQaPreview: boolean;
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
      blockedReason: "Choose a drinkware product type first.",
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
      blockedReason: "Upload a product photo first.",
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
  if (input.hasReviewedBodyCutoutQa) {
    return "preview";
  }
  if (input.hasAcceptedReview) {
    return "generate";
  }
  if (
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
      label: "1. Source",
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
      label: "2. Detect",
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
      label: "3. Review BODY REFERENCE",
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
    {
      step: "generate",
      label: "4. Generate QA GLB",
      status: !reviewFlow
        ? "review"
        : input.hasReviewedBodyCutoutQa
          ? "ready"
          : input.hasAcceptedReview
            ? "action"
            : "review",
      detail: !reviewFlow
        ? "BODY CUTOUT QA generation is only used for drinkware review."
        : input.hasReviewedBodyCutoutQa
          ? "Reviewed body-only GLB is ready for BODY CUTOUT QA."
          : input.hasAcceptedReview
            ? "Generate the reviewed body-only GLB for BODY CUTOUT QA."
            : "Accept BODY REFERENCE review before QA generation.",
    },
    {
      step: "preview",
      label: "5. Preview & Export",
      status: !reviewFlow
        ? "review"
        : input.hasReviewedBodyCutoutQa
          ? "action"
          : "review",
      detail: !reviewFlow
        ? "Use preview and save when the flat template is ready."
        : input.hasReviewedBodyCutoutQa
          ? "Switch between BODY CUTOUT QA, WRAP / EXPORT, and comparison views."
          : "BODY CUTOUT QA preview unlocks after the reviewed GLB is generated.",
    },
  ];
}

export function getTemplateCreateNextActionHint(
  input: TemplateCreateWorkflowInput,
): string {
  if (!isTemplateCreateReviewFlowProductType(input.productType)) {
    return "Finish the flat template fields, preview if needed, then save.";
  }
  if (!input.productType) {
    return "Choose a drinkware product type, then add lookup or photo source material.";
  }
  if (input.hasReviewedBodyCutoutQa) {
    return "Use BODY CUTOUT QA, WRAP / EXPORT, or compare views as needed, then save when the template is ready.";
  }
  if (input.hasAcceptedReview) {
    return "Generate BODY CUTOUT QA GLB next, then switch to BODY CUTOUT QA or WRAP / EXPORT preview modes.";
  }
  if (input.hasStagedDetectResult) {
    if (!input.hasProductImage) {
      return "Review the staged BODY REFERENCE now. Upload a product image later if you want to rerun photo auto-detect.";
    }
    return "Accept BODY REFERENCE review to lock the current v1 contour before QA generation.";
  }
  if (!input.hasProductImage) {
    return "Run lookup or upload a product image so detection and BODY REFERENCE review can start.";
  }
  return "Run lookup or auto-detect to stage the BODY REFERENCE proposal.";
}

export function getTemplateCreateGenerateGateReason(
  input: TemplateCreateGenerateGateInput,
): string | null {
  if (!isTemplateCreateReviewFlowProductType(input.productType)) {
    return null;
  }
  if (!input.hasAcceptedReview) {
    return "Accept BODY REFERENCE first.";
  }
  if (!input.canGenerate) {
    return "Finish BODY REFERENCE review data first.";
  }
  if (input.hasPendingSourceDraft) {
    return "Accept corrected cutout changes first.";
  }
  return null;
}

export function getTemplateCreatePreviewGateNotes(
  input: TemplateCreatePreviewGateInput,
): string[] {
  const notes: string[] = [];
  if (!input.hasSourceModel) {
    notes.push("Full model, WRAP / EXPORT, and Source compare stay disabled until a source model is loaded.");
  }
  if (!input.hasQaPreview) {
    notes.push("BODY CUTOUT QA preview unlocks after generating the reviewed body-only GLB.");
  }
  return notes;
}
