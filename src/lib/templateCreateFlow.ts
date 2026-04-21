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

export interface TemplateCreateReviewProjectionInput {
  lidBodyLineMm: number;
  bodyBottomMm: number;
  bodyHeightMm: number;
  diameterMm: number;
  wrapWidthMm: number;
  printableTopMm: number;
  printableBottomMm: number;
  printableHeightMm: number;
  topExclusions: string;
  hasHandleKeepOut: boolean;
  frontTransform: string;
  visibleOuterDiameterLabel: string;
  silverRingTopMm: number | null;
  silverRingBottomMm: number | null;
  bandDetectLabel: string;
  handleMetricsLabel: string;
  warnings: string[];
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

export function buildTemplateCreateReviewProjection(
  input: TemplateCreateReviewProjectionInput,
) {
  return {
    bodyBounds: [
      { label: "Lid / body line", value: `${input.lidBodyLineMm} mm` },
      { label: "Body bottom", value: `${input.bodyBottomMm} mm` },
      { label: "Body height", value: `${input.bodyHeightMm} mm` },
      { label: "Diameter", value: `${input.diameterMm} mm` },
      { label: "Wrap width", value: `${input.wrapWidthMm} mm` },
    ],
    printableBand: [
      { label: "Printable top", value: `${input.printableTopMm} mm` },
      { label: "Printable bottom", value: `${input.printableBottomMm} mm` },
      { label: "Printable height", value: `${input.printableHeightMm} mm` },
    ],
    exclusions: [
      { label: "Top exclusions", value: input.topExclusions || "none" },
      { label: "Handle keep-out", value: input.hasHandleKeepOut ? "yes" : "no" },
    ],
    advanced: [
      { label: "Front transform", value: input.frontTransform },
      { label: "Visible outer diameter", value: input.visibleOuterDiameterLabel },
      {
        label: "Silver ring top",
        value: input.silverRingTopMm == null ? "—" : `${input.silverRingTopMm} mm`,
      },
      {
        label: "Silver ring bottom",
        value: input.silverRingBottomMm == null ? "—" : `${input.silverRingBottomMm} mm`,
      },
      { label: "Band detect", value: input.bandDetectLabel },
      { label: "Handle metrics", value: input.handleMetricsLabel },
      { label: "Warnings", value: input.warnings.length > 0 ? input.warnings.join(" | ") : "none" },
    ],
  };
}
