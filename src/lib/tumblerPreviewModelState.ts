export type PreviewModelMode = "alignment-model" | "full-model" | "source-traced";

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
    | "generated-trace-profile"
    | "flat-profile-bounds"
    | "pathological-diameter"
    | "full-model-ready";
  message: string | null;
}

interface DeriveTumblerPreviewModelStateArgs {
  requestedMode: PreviewModelMode;
  hasCanonicalAlignmentModel: boolean;
  hasSourceModel: boolean;
  sourceModelPath?: string | null;
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

function isGeneratedTracePath(path?: string | null): boolean {
  if (!path) return false;
  const normalized = path.toLowerCase();
  return normalized.includes("/models/generated/") || normalized.includes("trace");
}

export function deriveTumblerPreviewModelState(
  args: DeriveTumblerPreviewModelStateArgs,
): TumblerPreviewModelState {
  if (args.requestedMode !== "full-model") {
    return {
      requestedMode: args.requestedMode,
      effectiveMode: args.requestedMode,
      glbPreviewStatus: "not-requested",
      sourceModelPath: args.sourceModelPath ?? null,
      reason: "not-requested",
      message: null,
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

  const generatedTracePath = isGeneratedTracePath(args.sourceModelPath);

  if (args.hasCanonicalAlignmentModel && generatedTracePath) {
    return {
      requestedMode: args.requestedMode,
      effectiveMode: "alignment-model",
      glbPreviewStatus: "degraded",
      sourceModelPath: args.sourceModelPath ?? null,
      reason: "generated-trace-profile",
      message: "3D full model degraded; workspace remains canonical. This GLB looks like a generated front trace, not a full tumbler mesh.",
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
      message: "3D full model degraded; workspace remains canonical. The source GLB bounds are too flat to trust as a revolved tumbler preview.",
    };
  }

  if (args.hasCanonicalAlignmentModel && pathologicalDiameter) {
    return {
      requestedMode: args.requestedMode,
      effectiveMode: "alignment-model",
      glbPreviewStatus: "degraded",
      sourceModelPath: args.sourceModelPath ?? null,
      reason: "pathological-diameter",
      message: "3D full model degraded; workspace remains canonical. The source GLB diameter does not match canonical tumbler dimensions closely enough for a trustworthy preview.",
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
