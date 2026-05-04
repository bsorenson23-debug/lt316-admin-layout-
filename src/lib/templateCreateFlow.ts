export type TemplateCreateWorkflowStep = "source" | "detect" | "review" | "generate" | "preview";

export type TemplateCreateWorkflowStatus = "ready" | "action" | "review";

export type TemplateCreateSourceAuthorityState =
  | "lookup-authoritative-profile"
  | "detected-proposal"
  | "manual-fallback"
  | "missing-input";

export type TemplateOperatorSectionCategory =
  | "primary"
  | "proof"
  | "optional"
  | "debug"
  | "reference"
  | "metadata";

export type TemplateBodyCutoutQaGlbLifecycleStatus =
  | "waiting-for-accepted-cutout"
  | "not-generated"
  | "fresh"
  | "stale"
  | "blocked";

export type TemplateBodyReferenceV2OperatorStatus =
  | "optional-inactive"
  | "active-ready"
  | "active-blocked"
  | "draft-pending";

export interface TemplateCreateWorkflowInput {
  productType: string | null | undefined;
  hasProductImage: boolean;
  hasStagedDetectResult: boolean;
  hasAcceptedReview: boolean;
  hasReviewedBodyCutoutQa: boolean;
  hasCanonicalBodyProfile: boolean;
  hasCanonicalDimensionCalibration: boolean;
}

const TEMPLATE_CREATE_PLACEHOLDER_TOKENS = new Set([
  "unknown",
  "generic",
  "manual",
  "fallback",
  "n/a",
  "na",
  "null",
  "none",
]);

function normalizeTemplateCreateIdentityValue(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function isTemplateCreateMeaningfulIdentityValue(
  value: string | null | undefined,
): boolean {
  const normalized = normalizeTemplateCreateIdentityValue(value);
  if (!normalized) return false;
  return !TEMPLATE_CREATE_PLACEHOLDER_TOKENS.has(normalized);
}

export function buildTemplateCreateDetectedIdentityLabel(args: {
  brand?: string | null;
  model?: string | null;
  capacityOz?: number | null;
  productType?: string | null;
}): string {
  const parts: string[] = [];
  const hasMeaningfulBrandOrModel =
    isTemplateCreateMeaningfulIdentityValue(args.brand) ||
    isTemplateCreateMeaningfulIdentityValue(args.model);
  if (isTemplateCreateMeaningfulIdentityValue(args.brand)) {
    parts.push(args.brand!.trim());
  }
  if (isTemplateCreateMeaningfulIdentityValue(args.model)) {
    parts.push(args.model!.trim());
  }
  if (
    hasMeaningfulBrandOrModel &&
    typeof args.capacityOz === "number" &&
    Number.isFinite(args.capacityOz) &&
    args.capacityOz > 0
  ) {
    parts.push(`${args.capacityOz}oz`);
  }
  if (parts.length > 0) {
    return parts.join(" ");
  }

  const fallbackProductType = args.productType?.trim() || "tumbler";
  return typeof args.capacityOz === "number" && Number.isFinite(args.capacityOz) && args.capacityOz > 0
    ? `${args.capacityOz}oz ${fallbackProductType} proposal`
    : `Unknown ${fallbackProductType} proposal`;
}

export function isTemplateCreateLookupInputActionable(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;

  const normalizedTokens = trimmed
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]+/g, ""))
    .filter(Boolean);
  const meaningfulTokens = normalizedTokens.filter((token) => {
    if (TEMPLATE_CREATE_PLACEHOLDER_TOKENS.has(token)) return false;
    if (token === "oz") return false;
    if (/^[0-9]+(?:oz)?$/.test(token)) return false;
    return /[a-z]/.test(token);
  });

  if (meaningfulTokens.length >= 2) return true;
  return meaningfulTokens.length === 1 && trimmed.length >= 12;
}

export function resolveTemplateCreateSourceAuthorityState(args: {
  hasLookupAuthoritativeProfile: boolean;
  hasDetectedProposal: boolean;
  hasManualFallback: boolean;
}): TemplateCreateSourceAuthorityState {
  if (args.hasLookupAuthoritativeProfile) return "lookup-authoritative-profile";
  if (args.hasManualFallback) return "manual-fallback";
  if (args.hasDetectedProposal) return "detected-proposal";
  return "missing-input";
}

export function shouldTemplateCreateRequireLookupBeforeManualFallback(args: {
  sourceAuthorityState: TemplateCreateSourceAuthorityState;
  lookupInput: string;
}): boolean {
  return (
    args.sourceAuthorityState === "detected-proposal" &&
    isTemplateCreateLookupInputActionable(args.lookupInput)
  );
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

export interface TemplateBodyCutoutQaGlbLifecycleInput {
  hasAcceptedBodyReference: boolean;
  hasReviewedGlb: boolean;
  hasPendingSourceDraft: boolean;
  freshnessStatus?: "unavailable" | "draft-pending" | "current" | "stale" | null;
  glbFreshRelativeToSource?: boolean | null;
  runtimeInspectionStatus?: string | null;
  validationStatus?: string | null;
}

export interface TemplateBodyCutoutQaGlbLifecycleState {
  status: TemplateBodyCutoutQaGlbLifecycleStatus;
  label: string;
  nextActionLabel: string | null;
  canRequestGeneration: boolean;
  canShowFullBodyCutoutQaPass: boolean;
}

export interface TemplateBodyReferenceV2OperatorInput {
  isActiveGenerationSource: boolean;
  accepted: boolean;
  generationReady: boolean;
  hasDraftChanges: boolean;
  errorCount: number;
  warningCount: number;
}

export interface TemplateBodyReferenceV2OperatorState {
  status: TemplateBodyReferenceV2OperatorStatus;
  label: string;
  detail: string;
  promoteMessagesToMainPath: boolean;
}

export interface TemplateOperatorSectionState {
  id:
    | "source"
    | "detect"
    | "body-reference-v1"
    | "body-cutout-qa"
    | "wrap-export"
    | "body-reference-v2"
    | "appearance-references"
    | "advanced-debug"
    | "template-metadata";
  label: string;
  category: TemplateOperatorSectionCategory;
  defaultCollapsed: boolean;
  visibleInMainPath: boolean;
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

export function getTemplateBodyCutoutQaGlbLifecycle(
  input: TemplateBodyCutoutQaGlbLifecycleInput,
): TemplateBodyCutoutQaGlbLifecycleState {
  if (input.hasPendingSourceDraft) {
    return {
      status: "waiting-for-accepted-cutout",
      label: "BODY CUTOUT QA GLB: waiting for accepted cutout",
      nextActionLabel: "Accept corrected cutout",
      canRequestGeneration: false,
      canShowFullBodyCutoutQaPass: false,
    };
  }

  if (!input.hasAcceptedBodyReference) {
    return {
      status: "waiting-for-accepted-cutout",
      label: "BODY CUTOUT QA GLB: waiting for accepted cutout",
      nextActionLabel: "Accept BODY REFERENCE",
      canRequestGeneration: false,
      canShowFullBodyCutoutQaPass: false,
    };
  }

  if (!input.hasReviewedGlb) {
    return {
      status: "not-generated",
      label: "BODY CUTOUT QA GLB: not generated yet",
      nextActionLabel: "Generate BODY CUTOUT QA GLB",
      canRequestGeneration: true,
      canShowFullBodyCutoutQaPass: false,
    };
  }

  const freshRelativeToSource =
    typeof input.glbFreshRelativeToSource === "boolean"
      ? input.glbFreshRelativeToSource
      : input.freshnessStatus === "current"
        ? true
        : input.freshnessStatus === "stale"
          ? false
          : null;

  if (freshRelativeToSource === true) {
    return {
      status: "fresh",
      label: "BODY CUTOUT QA GLB: fresh",
      nextActionLabel:
        input.runtimeInspectionStatus === "complete" && input.validationStatus === "pass"
          ? null
          : "Run BODY CUTOUT QA runtime inspection",
      canRequestGeneration: false,
      canShowFullBodyCutoutQaPass:
        input.runtimeInspectionStatus === "complete" && input.validationStatus === "pass",
    };
  }

  if (freshRelativeToSource === false) {
    return {
      status: "stale",
      label: "BODY CUTOUT QA GLB: stale",
      nextActionLabel: "Regenerate BODY CUTOUT QA GLB",
      canRequestGeneration: true,
      canShowFullBodyCutoutQaPass: false,
    };
  }

  return {
    status: "blocked",
    label: "BODY CUTOUT QA GLB: freshness unknown",
    nextActionLabel: "Regenerate BODY CUTOUT QA GLB",
    canRequestGeneration: true,
    canShowFullBodyCutoutQaPass: false,
  };
}

export function getTemplateBodyReferenceV2OperatorState(
  input: TemplateBodyReferenceV2OperatorInput,
): TemplateBodyReferenceV2OperatorState {
  if (!input.isActiveGenerationSource) {
    return {
      status: "optional-inactive",
      label: "BODY REFERENCE v2 optional · not active",
      detail: "Current BODY CUTOUT QA source stays on accepted v1 until v2 is explicitly generated.",
      promoteMessagesToMainPath: false,
    };
  }

  if (input.generationReady) {
    return {
      status: "active-ready",
      label: "BODY REFERENCE v2 active · ready",
      detail: "v2 is the active BODY CUTOUT QA generation source.",
      promoteMessagesToMainPath: true,
    };
  }

  if (input.hasDraftChanges || !input.accepted) {
    return {
      status: "draft-pending",
      label: "BODY REFERENCE v2 active · draft pending",
      detail: "Accept or reset the v2 draft before generating from v2.",
      promoteMessagesToMainPath: true,
    };
  }

  return {
    status: "active-blocked",
    label: "BODY REFERENCE v2 active · needs review",
    detail:
      input.errorCount > 0
        ? "Resolve v2 readiness errors before generating from v2."
        : input.warningCount > 0
          ? "Review v2 warnings before generating from v2."
          : "Resolve v2 readiness before generating from v2.",
    promoteMessagesToMainPath: true,
  };
}

export function buildTemplateOperatorSectionStates(args: {
  debugVisible: boolean;
  bodyReferenceV2Active: boolean;
}): TemplateOperatorSectionState[] {
  return [
    {
      id: "source",
      label: "Source",
      category: "primary",
      defaultCollapsed: false,
      visibleInMainPath: true,
    },
    {
      id: "detect",
      label: "Detect",
      category: "primary",
      defaultCollapsed: false,
      visibleInMainPath: true,
    },
    {
      id: "body-reference-v1",
      label: "BODY REFERENCE v1",
      category: "primary",
      defaultCollapsed: false,
      visibleInMainPath: true,
    },
    {
      id: "body-cutout-qa",
      label: "BODY CUTOUT QA",
      category: "proof",
      defaultCollapsed: false,
      visibleInMainPath: true,
    },
    {
      id: "wrap-export",
      label: "WRAP / EXPORT separate",
      category: "reference",
      defaultCollapsed: true,
      visibleInMainPath: false,
    },
    {
      id: "body-reference-v2",
      label: "Optional BODY REFERENCE v2",
      category: "optional",
      defaultCollapsed: !args.bodyReferenceV2Active,
      visibleInMainPath: args.bodyReferenceV2Active,
    },
    {
      id: "appearance-references",
      label: "Reference-only appearance",
      category: "reference",
      defaultCollapsed: true,
      visibleInMainPath: false,
    },
    {
      id: "advanced-debug",
      label: "Advanced debug",
      category: "debug",
      defaultCollapsed: true,
      visibleInMainPath: args.debugVisible,
    },
    {
      id: "template-metadata",
      label: "Template metadata",
      category: "metadata",
      defaultCollapsed: false,
      visibleInMainPath: true,
    },
  ];
}
