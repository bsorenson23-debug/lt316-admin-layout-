import type { ProductTemplate } from "@/types/productTemplate";
import {
  inferGeneratedModelStatusFromSource,
  isGeneratedModelUrl,
  isLegacyGeneratedModelPath,
} from "./generatedModelUrl.ts";

export type PreviewModelMode =
  | "alignment-model"
  | "full-model"
  | "wrap-export"
  | "source-traced"
  | "body-cutout-qa";

export type TumblerGlbPreviewStatus = "not-requested" | "loading" | "ready" | "degraded" | "unavailable";

export interface TumblerPreviewBoundsSnapshot {
  widthMm: number;
  heightMm: number;
  depthMm: number;
}

export interface TumblerPreviewModelState {
  requestedMode: PreviewModelMode;
  effectiveMode: PreviewModelMode;
  glbPreviewStatus: TumblerGlbPreviewStatus;
  sourceModelPath: string | null;
  reason:
    | "not-requested"
    | "loading"
    | "missing-source-model"
    | "qa-source-unavailable"
    | "reviewed-generated-model"
    | "body-cutout-qa-ready"
    | "generated-trace-profile"
    | "flat-profile-bounds"
    | "pathological-diameter"
    | "full-model-ready"
    | "wrap-export-ready";
  message: string | null;
}

export interface TumblerPreviewModelSourceSelection {
  modelPath: string | null;
  modelStatus: ProductTemplate["glbStatus"] | null;
  modelSourceLabel: string | null;
  reviewedBodyCutoutQaAvailable: boolean;
  reviewedBodyCutoutQaActive: boolean;
  reviewedBodyCutoutQaAvailableButInactive: boolean;
  hasOriginalModel: boolean;
  originalModelPreferred: boolean;
}

export interface ResolveTumblerPreviewModelSourceArgs {
  requestedMode: PreviewModelMode;
  currentModelPath?: string | null;
  currentModelStatus?: ProductTemplate["glbStatus"] | null;
  currentModelSourceLabel?: string | null;
  originalModelPath?: string | null;
  originalModelStatus?: ProductTemplate["glbStatus"] | null;
  originalModelSourceLabel?: string | null;
}

export function getTumblerPreviewModelStateSignature(state: TumblerPreviewModelState | null): string {
  if (!state) return "null";
  return [
    state.requestedMode,
    state.effectiveMode,
    state.glbPreviewStatus,
    state.sourceModelPath ?? "",
    state.reason,
    state.message ?? "",
  ].join("|");
}

interface DeriveTumblerPreviewModelStateArgs {
  requestedMode: PreviewModelMode;
  hasCanonicalAlignmentModel: boolean;
  hasSourceModel: boolean;
  sourceModelPath?: string | null;
  sourceModelStatus?: ProductTemplate["glbStatus"] | null;
  sourceBounds?: TumblerPreviewBoundsSnapshot | null;
  canonicalBounds?: TumblerPreviewBoundsSnapshot | null;
}

function isFinitePositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function getExpectedDiameterMm(bounds?: TumblerPreviewBoundsSnapshot | null): number | null {
  if (!bounds) return null;
  const diameter = Math.max(bounds.widthMm, bounds.depthMm);
  return isFinitePositive(diameter) ? diameter : null;
}

function normalizePath(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function resolveStatusFromPath(args: {
  modelPath: string | null;
  modelStatus?: ProductTemplate["glbStatus"] | null;
  modelSourceLabel?: string | null;
}): ProductTemplate["glbStatus"] | null {
  if (args.modelStatus) return args.modelStatus;
  return inferGeneratedModelStatusFromSource({
    modelUrl: args.modelPath,
    sourceModelLabel: args.modelSourceLabel,
  });
}

export function resolveTumblerPreviewModelSource(
  args: ResolveTumblerPreviewModelSourceArgs,
): TumblerPreviewModelSourceSelection {
  const currentModelPath = normalizePath(args.currentModelPath);
  const originalModelPath = normalizePath(args.originalModelPath);
  const currentModelStatus = resolveStatusFromPath({
    modelPath: currentModelPath || null,
    modelStatus: args.currentModelStatus,
    modelSourceLabel: args.currentModelSourceLabel,
  });
  const originalModelStatus = resolveStatusFromPath({
    modelPath: originalModelPath || null,
    modelStatus: args.originalModelStatus,
    modelSourceLabel: args.originalModelSourceLabel,
  });
  const currentIsReviewedBodyCutoutQa = currentModelStatus === "generated-reviewed-model";
  const originalIsDistinct = Boolean(
    originalModelPath &&
    originalModelPath !== currentModelPath &&
    originalModelStatus !== "generated-reviewed-model",
  );
  const reviewedBodyCutoutQaAvailable = Boolean(currentModelPath && currentIsReviewedBodyCutoutQa);
  const wantsReviewedBodyCutoutQa =
    args.requestedMode === "body-cutout-qa" ||
    args.requestedMode === "wrap-export";
  const originalModelPreferred =
    originalIsDistinct &&
    (
      args.requestedMode === "alignment-model" ||
      args.requestedMode === "full-model" ||
      args.requestedMode === "source-traced"
    );

  if (wantsReviewedBodyCutoutQa && currentModelPath) {
    return {
      modelPath: currentModelPath,
      modelStatus: currentModelStatus,
      modelSourceLabel: args.currentModelSourceLabel ?? null,
      reviewedBodyCutoutQaAvailable,
      reviewedBodyCutoutQaActive: reviewedBodyCutoutQaAvailable,
      reviewedBodyCutoutQaAvailableButInactive: false,
      hasOriginalModel: originalIsDistinct,
      originalModelPreferred: false,
    };
  }

  if (originalModelPreferred) {
    return {
      modelPath: originalModelPath,
      modelStatus: originalModelStatus ?? "verified-product-model",
      modelSourceLabel: args.originalModelSourceLabel ?? null,
      reviewedBodyCutoutQaAvailable,
      reviewedBodyCutoutQaActive: false,
      reviewedBodyCutoutQaAvailableButInactive: reviewedBodyCutoutQaAvailable,
      hasOriginalModel: true,
      originalModelPreferred: true,
    };
  }

  if (args.requestedMode === "full-model" && reviewedBodyCutoutQaAvailable) {
    return {
      modelPath: null,
      modelStatus: null,
      modelSourceLabel: null,
      reviewedBodyCutoutQaAvailable,
      reviewedBodyCutoutQaActive: false,
      reviewedBodyCutoutQaAvailableButInactive: true,
      hasOriginalModel: false,
      originalModelPreferred: false,
    };
  }

  return {
    modelPath: currentModelPath || null,
    modelStatus: currentModelStatus,
    modelSourceLabel: args.currentModelSourceLabel ?? null,
    reviewedBodyCutoutQaAvailable,
    reviewedBodyCutoutQaActive: reviewedBodyCutoutQaAvailable && args.requestedMode === "body-cutout-qa",
    reviewedBodyCutoutQaAvailableButInactive: reviewedBodyCutoutQaAvailable && args.requestedMode !== "body-cutout-qa",
    hasOriginalModel: originalIsDistinct,
    originalModelPreferred: false,
  };
}

function isGeneratedTracePath(path?: string | null): boolean {
  if (!path) return false;
  const normalized = path.toLowerCase();
  return isLegacyGeneratedModelPath(path) || isGeneratedModelUrl(path) || normalized.includes("trace");
}

export function deriveTumblerPreviewModelState(
  args: DeriveTumblerPreviewModelStateArgs,
): TumblerPreviewModelState {
  const wantsBodyCutoutQa = args.requestedMode === "body-cutout-qa";
  if (
    args.requestedMode !== "full-model" &&
    args.requestedMode !== "wrap-export" &&
    args.requestedMode !== "body-cutout-qa"
  ) {
    return {
      requestedMode: args.requestedMode,
      effectiveMode: args.requestedMode,
      glbPreviewStatus: "not-requested",
      sourceModelPath: args.sourceModelPath ?? null,
      reason: "not-requested",
      message: null,
    };
  }

  if (wantsBodyCutoutQa) {
    if (!args.hasSourceModel) {
      return {
        requestedMode: args.requestedMode,
        effectiveMode: args.hasCanonicalAlignmentModel ? "alignment-model" : "source-traced",
        glbPreviewStatus: "unavailable",
        sourceModelPath: args.sourceModelPath ?? null,
        reason: "missing-source-model",
        message: args.hasCanonicalAlignmentModel
          ? "BODY CUTOUT QA unavailable; workspace remains canonical until a reviewed body-only GLB is generated."
          : "BODY CUTOUT QA unavailable.",
      };
    }
    if (args.sourceModelStatus !== "generated-reviewed-model") {
      return {
        requestedMode: args.requestedMode,
        effectiveMode: args.hasCanonicalAlignmentModel ? "alignment-model" : "source-traced",
        glbPreviewStatus: "unavailable",
        sourceModelPath: args.sourceModelPath ?? null,
        reason: "qa-source-unavailable",
        message: "BODY CUTOUT QA requires a generated reviewed body-only GLB. This source model stays outside BODY CUTOUT QA.",
      };
    }
    if (!args.sourceBounds) {
      return {
        requestedMode: args.requestedMode,
        effectiveMode: "body-cutout-qa",
        glbPreviewStatus: "loading",
        sourceModelPath: args.sourceModelPath ?? null,
        reason: "loading",
        message: null,
      };
    }
    return {
      requestedMode: args.requestedMode,
      effectiveMode: "body-cutout-qa",
      glbPreviewStatus: "ready",
      sourceModelPath: args.sourceModelPath ?? null,
      reason: "body-cutout-qa-ready",
      message: "BODY CUTOUT QA is using the generated reviewed body-only GLB. No fallback lid, ring, handle, or straw geometry is treated as authoritative in this mode.",
    };
  }

  if (args.requestedMode === "wrap-export") {
    if (!args.hasSourceModel) {
      return {
        requestedMode: args.requestedMode,
        effectiveMode: "wrap-export",
        glbPreviewStatus: "unavailable",
        sourceModelPath: args.sourceModelPath ?? null,
        reason: "missing-source-model",
        message: "WRAP / EXPORT preview requires a current source model before it can show wrap geometry. It stays separate from BODY CUTOUT QA.",
      };
    }

    const generatedTracePath = isGeneratedTracePath(args.sourceModelPath);

    if (
      args.hasCanonicalAlignmentModel &&
      generatedTracePath &&
      args.sourceModelStatus !== "verified-product-model" &&
      args.sourceModelStatus !== "generated-reviewed-model"
    ) {
      return {
        requestedMode: args.requestedMode,
        effectiveMode: "wrap-export",
        glbPreviewStatus: "degraded",
        sourceModelPath: args.sourceModelPath ?? null,
        reason: "generated-trace-profile",
        message: "WRAP / EXPORT preview is using a generated trace profile. Exact placement stays provisional until a reviewed body-only GLB exists.",
      };
    }

    if (!args.sourceBounds) {
      return {
        requestedMode: args.requestedMode,
        effectiveMode: "wrap-export",
        glbPreviewStatus: "loading",
        sourceModelPath: args.sourceModelPath ?? null,
        reason: "loading",
        message: null,
      };
    }

    const radialMax = Math.max(args.sourceBounds.widthMm, args.sourceBounds.depthMm);
    const radialMin = Math.min(args.sourceBounds.widthMm, args.sourceBounds.depthMm);
    const flatProfileBounds = radialMin <= Math.max(6, radialMax * 0.18);
    const expectedDiameterMm = getExpectedDiameterMm(args.canonicalBounds);
    const pathologicalDiameter = isFinitePositive(expectedDiameterMm)
      ? (
          radialMax < expectedDiameterMm * 0.58 ||
          radialMax > expectedDiameterMm * 1.75 ||
          radialMin < expectedDiameterMm * 0.22
        )
      : false;

    if (flatProfileBounds) {
      return {
        requestedMode: args.requestedMode,
        effectiveMode: "wrap-export",
        glbPreviewStatus: "degraded",
        sourceModelPath: args.sourceModelPath ?? null,
        reason: "flat-profile-bounds",
        message: "WRAP / EXPORT preview has wrap dimensions, but the current model bounds are too flat for exact placement proof.",
      };
    }

    if (pathologicalDiameter) {
      return {
        requestedMode: args.requestedMode,
        effectiveMode: "wrap-export",
        glbPreviewStatus: "degraded",
        sourceModelPath: args.sourceModelPath ?? null,
        reason: "pathological-diameter",
        message: "WRAP / EXPORT preview has wrap dimensions, but the current model diameter does not match the canonical tumbler closely enough for exact placement proof.",
      };
    }

    return {
      requestedMode: args.requestedMode,
      effectiveMode: "wrap-export",
      glbPreviewStatus: "ready",
      sourceModelPath: args.sourceModelPath ?? null,
      reason: "wrap-export-ready",
      message: args.sourceModelStatus === "generated-reviewed-model"
        ? "WRAP / EXPORT preview is using the reviewed body geometry to show printable-surface readiness. It is not BODY CUTOUT QA proof."
        : "WRAP / EXPORT preview is using current product geometry. Exact placement stays provisional until a reviewed body-only GLB exists.",
    };
  }

  if (!args.hasSourceModel) {
    return {
      requestedMode: args.requestedMode,
      effectiveMode: args.hasCanonicalAlignmentModel ? "alignment-model" : "source-traced",
      glbPreviewStatus: "unavailable",
      sourceModelPath: args.sourceModelPath ?? null,
      reason: "missing-source-model",
      message: args.hasCanonicalAlignmentModel
        ? "3D full model unavailable; workspace remains canonical."
        : "3D full model unavailable.",
    };
  }

  if (args.sourceModelStatus === "generated-reviewed-model") {
    if (args.requestedMode === "full-model") {
      return {
        requestedMode: args.requestedMode,
        effectiveMode: "full-model",
        glbPreviewStatus: "unavailable",
        sourceModelPath: args.sourceModelPath ?? null,
        reason: "reviewed-generated-model",
        message: "Full product model is unavailable in this preview. The reviewed body-only GLB is ready; click BODY CUTOUT QA to inspect body contour QA.",
      };
    }
    if (!args.sourceBounds) {
      return {
        requestedMode: args.requestedMode,
        effectiveMode: args.requestedMode,
        glbPreviewStatus: "loading",
        sourceModelPath: args.sourceModelPath ?? null,
        reason: "loading",
        message: null,
      };
    }
    return {
      requestedMode: args.requestedMode,
      effectiveMode: args.requestedMode,
      glbPreviewStatus: "ready",
      sourceModelPath: args.sourceModelPath ?? null,
      reason: "reviewed-generated-model",
      message: "3D full model is using generated BODY REFERENCE geometry. Body shape is authoritative; lid/ring may still be preview-only fallback silhouette. Saved printable geometry remains canonical.",
    };
  }

  const generatedTracePath = isGeneratedTracePath(args.sourceModelPath);

  if (
    args.hasCanonicalAlignmentModel &&
    generatedTracePath &&
    args.sourceModelStatus !== "verified-product-model"
  ) {
    return {
      requestedMode: args.requestedMode,
      effectiveMode: "alignment-model",
      glbPreviewStatus: "degraded",
      sourceModelPath: args.sourceModelPath ?? null,
      reason: "generated-trace-profile",
      message: "3D full model preview degraded; workspace and saved printable geometry remain canonical. This GLB looks like a generated front trace, not a full tumbler mesh.",
    };
  }

  if (!args.sourceBounds) {
    return {
      requestedMode: args.requestedMode,
      effectiveMode: args.requestedMode,
      glbPreviewStatus: "loading",
      sourceModelPath: args.sourceModelPath ?? null,
      reason: "loading",
      message: null,
    };
  }

  const radialMax = Math.max(args.sourceBounds.widthMm, args.sourceBounds.depthMm);
  const radialMin = Math.min(args.sourceBounds.widthMm, args.sourceBounds.depthMm);
  const flatProfileBounds = radialMin <= Math.max(6, radialMax * 0.18);
  const expectedDiameterMm = getExpectedDiameterMm(args.canonicalBounds);
  const pathologicalDiameter = isFinitePositive(expectedDiameterMm)
    ? (
        radialMax < expectedDiameterMm * 0.58 ||
        radialMax > expectedDiameterMm * 1.75 ||
        radialMin < expectedDiameterMm * 0.22
      )
    : false;

  if (args.hasCanonicalAlignmentModel && flatProfileBounds) {
    return {
      requestedMode: args.requestedMode,
      effectiveMode: "alignment-model",
      glbPreviewStatus: "degraded",
      sourceModelPath: args.sourceModelPath ?? null,
      reason: "flat-profile-bounds",
      message: "3D full model preview degraded; workspace and saved printable geometry remain canonical. The source GLB bounds are too flat to trust as a revolved tumbler preview.",
    };
  }

  if (args.hasCanonicalAlignmentModel && pathologicalDiameter) {
    return {
      requestedMode: args.requestedMode,
      effectiveMode: "alignment-model",
      glbPreviewStatus: "degraded",
      sourceModelPath: args.sourceModelPath ?? null,
      reason: "pathological-diameter",
      message: "3D full model preview degraded; workspace and saved printable geometry remain canonical. The source GLB diameter does not match canonical tumbler dimensions closely enough for a trustworthy preview.",
    };
  }

  return {
    requestedMode: args.requestedMode,
    effectiveMode: args.requestedMode,
    glbPreviewStatus: "ready",
    sourceModelPath: args.sourceModelPath ?? null,
    reason: "full-model-ready",
    message: null,
  };
}
