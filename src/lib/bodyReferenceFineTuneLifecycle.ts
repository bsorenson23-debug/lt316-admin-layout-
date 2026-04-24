export type BodyReferenceFineTuneLifecycleStatus =
  | "no-draft"
  | "draft-pending"
  | "accepted-corrected-cutout"
  | "reviewed-glb-stale"
  | "reviewed-glb-fresh";

export interface BodyReferenceFineTuneLifecycleSummary {
  status: BodyReferenceFineTuneLifecycleStatus;
  label: string;
  operatorMessage: string;
  nextActionLabel: string | null;
  isDraftDirty: boolean;
  hasAcceptedCorrectedCutout: boolean;
  reviewedGlbFreshRelativeToSource: boolean | null;
  reviewedGlbStaleRelativeToSource: boolean;
  acceptedSourceHashLabel: string;
  reviewedGlbSourceHashLabel: string;
  glbFreshnessLabel: "fresh" | "stale" | "unavailable";
  warnings: string[];
}

export function formatBodyReferenceFineTuneLifecycleHash(value: string | null | undefined): string {
  const normalized = value?.trim();
  if (!normalized) return "n/a";
  const [prefix, digest] = normalized.includes(":")
    ? normalized.split(":", 2)
    : ["sig", normalized];
  if (!digest) return normalized;
  return `${prefix}:${digest.slice(0, 8)}...${digest.slice(-6)}`;
}

function resolveReviewedGlbFreshness(args: {
  acceptedSourceHash?: string | null;
  reviewedGlbSourceHash?: string | null;
  reviewedGlbFreshRelativeToSource?: boolean | null;
}): boolean | null {
  if (typeof args.reviewedGlbFreshRelativeToSource === "boolean") {
    return args.reviewedGlbFreshRelativeToSource;
  }
  const acceptedSourceHash = args.acceptedSourceHash?.trim();
  const reviewedGlbSourceHash = args.reviewedGlbSourceHash?.trim();
  if (acceptedSourceHash && reviewedGlbSourceHash) {
    return acceptedSourceHash === reviewedGlbSourceHash;
  }
  return null;
}

export function summarizeBodyReferenceFineTuneLifecycle(args: {
  hasAcceptedCutout: boolean;
  isDraftDirty: boolean;
  hasAcceptedCorrectedCutout?: boolean;
  hasReviewedGlb: boolean;
  acceptedSourceHash?: string | null;
  reviewedGlbSourceHash?: string | null;
  reviewedGlbFreshRelativeToSource?: boolean | null;
}): BodyReferenceFineTuneLifecycleSummary {
  const reviewedGlbFreshRelativeToSource = resolveReviewedGlbFreshness(args);
  const reviewedGlbStaleRelativeToSource = reviewedGlbFreshRelativeToSource === false;
  const glbFreshnessLabel =
    reviewedGlbFreshRelativeToSource === true
      ? "fresh"
      : reviewedGlbStaleRelativeToSource
        ? "stale"
        : "unavailable";
  const acceptedSourceHashLabel = formatBodyReferenceFineTuneLifecycleHash(args.acceptedSourceHash);
  const reviewedGlbSourceHashLabel = formatBodyReferenceFineTuneLifecycleHash(args.reviewedGlbSourceHash);
  const hasAcceptedCorrectedCutout = Boolean(args.hasAcceptedCorrectedCutout);

  if (args.isDraftDirty) {
    return {
      status: "draft-pending",
      label: "Draft pending",
      operatorMessage: "Editing draft only - current BODY CUTOUT QA GLB is unchanged.",
      nextActionLabel: "Accept corrected cutout",
      isDraftDirty: true,
      hasAcceptedCorrectedCutout,
      reviewedGlbFreshRelativeToSource,
      reviewedGlbStaleRelativeToSource,
      acceptedSourceHashLabel,
      reviewedGlbSourceHashLabel,
      glbFreshnessLabel,
      warnings: ["Accepting this cutout will mark the reviewed GLB stale."],
    };
  }

  if (args.hasReviewedGlb && reviewedGlbFreshRelativeToSource === true) {
    return {
      status: "reviewed-glb-fresh",
      label: "Reviewed GLB fresh",
      operatorMessage: "Reviewed GLB is fresh relative to accepted cutout.",
      nextActionLabel: null,
      isDraftDirty: false,
      hasAcceptedCorrectedCutout,
      reviewedGlbFreshRelativeToSource,
      reviewedGlbStaleRelativeToSource,
      acceptedSourceHashLabel,
      reviewedGlbSourceHashLabel,
      glbFreshnessLabel,
      warnings: [],
    };
  }

  if (args.hasReviewedGlb && reviewedGlbFreshRelativeToSource === false) {
    return {
      status: "reviewed-glb-stale",
      label: "Reviewed GLB stale",
      operatorMessage: hasAcceptedCorrectedCutout
        ? "Corrected cutout accepted. Regenerate BODY CUTOUT QA GLB."
        : "Reviewed GLB is stale relative to accepted cutout.",
      nextActionLabel: "Regenerate BODY CUTOUT QA GLB from corrected cutout",
      isDraftDirty: false,
      hasAcceptedCorrectedCutout,
      reviewedGlbFreshRelativeToSource,
      reviewedGlbStaleRelativeToSource,
      acceptedSourceHashLabel,
      reviewedGlbSourceHashLabel,
      glbFreshnessLabel,
      warnings: ["Reviewed GLB is stale relative to accepted cutout."],
    };
  }

  if (hasAcceptedCorrectedCutout) {
    return {
      status: "accepted-corrected-cutout",
      label: "Accepted corrected cutout",
      operatorMessage: "Corrected cutout accepted. The BODY REFERENCE source changed.",
      nextActionLabel: "Regenerate BODY CUTOUT QA GLB",
      isDraftDirty: false,
      hasAcceptedCorrectedCutout: true,
      reviewedGlbFreshRelativeToSource,
      reviewedGlbStaleRelativeToSource,
      acceptedSourceHashLabel,
      reviewedGlbSourceHashLabel,
      glbFreshnessLabel,
      warnings: [],
    };
  }

  return {
    status: "no-draft",
    label: "No draft",
    operatorMessage: "No fine-tune draft is active. The accepted BODY REFERENCE cutout is the current source.",
    nextActionLabel: args.hasAcceptedCutout && !args.hasReviewedGlb
      ? "Regenerate BODY CUTOUT QA GLB"
      : "Edit contour",
    isDraftDirty: false,
    hasAcceptedCorrectedCutout: false,
    reviewedGlbFreshRelativeToSource,
    reviewedGlbStaleRelativeToSource,
    acceptedSourceHashLabel,
    reviewedGlbSourceHashLabel,
    glbFreshnessLabel,
    warnings: args.hasAcceptedCutout && !args.hasReviewedGlb
      ? ["Reviewed GLB freshness is unavailable until BODY CUTOUT QA GLB is generated."]
      : [],
  };
}
