import type {
  CanonicalBodyProfile,
  CanonicalDimensionCalibration,
  CanonicalHandleProfile,
  EditableBodyOutline,
} from "../types/productTemplate.ts";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function hasReviewedOutline(outline: EditableBodyOutline | null | undefined): boolean {
  return Boolean(
    (outline?.directContour && outline.directContour.length >= 3) ||
    (outline?.points && outline.points.length >= 2),
  );
}

function clampScore(score: number): number {
  return round2(Math.max(0, Math.min(1, score)));
}

export type BodyReferenceVisualLikenessStatus = "pass" | "review" | "fail";

export interface BodyReferenceVisualLikenessReport {
  status: BodyReferenceVisualLikenessStatus;
  score: number;
  authority: "body-reference-visual-qa";
  issues: string[];
  recommendations: string[];
  metrics: {
    frontVisibleWidthMm: number;
    wrapDiameterMm: number;
    frontOverwrapMm: number;
    frontOverwrapRatio: number;
    hasReviewedLidOutline: boolean;
    hasReviewedRingOutline: boolean;
    handleConfidence: number | null;
    hasHandleEvidence: boolean;
    bodyRadiusSpreadMm: number | null;
    lidExclusionHeightMm: number | null;
    printableTopMm: number | null;
  };
}

export function resolveBodyReferenceVisualLikeness(args: {
  canonicalDimensionCalibration: CanonicalDimensionCalibration;
  canonicalBodyProfile: CanonicalBodyProfile;
  canonicalHandleProfile?: CanonicalHandleProfile | null;
  lidProfile?: EditableBodyOutline | null;
  silverProfile?: EditableBodyOutline | null;
  fallbackTopGeometryOmitted?: boolean;
}): BodyReferenceVisualLikenessReport {
  const {
    canonicalDimensionCalibration: calibration,
    canonicalBodyProfile,
    canonicalHandleProfile,
    lidProfile,
    silverProfile,
    fallbackTopGeometryOmitted,
  } = args;

  const issues: string[] = [];
  const recommendations: string[] = [];
  let score = 1;

  const hasReviewedLidOutline = hasReviewedOutline(lidProfile);
  const hasReviewedRingOutline = hasReviewedOutline(silverProfile);
  const frontVisibleWidthMm = Math.max(0, calibration.frontVisibleWidthMm);
  const wrapDiameterMm = Math.max(0, calibration.wrapDiameterMm);
  const frontOverwrapMm = round2(Math.max(0, frontVisibleWidthMm - wrapDiameterMm));
  const frontOverwrapRatio = wrapDiameterMm > 0 ? round2(frontOverwrapMm / wrapDiameterMm) : 0;
  const handleConfidence = canonicalHandleProfile?.confidence;
  const hasHandleEvidence = typeof handleConfidence === "number" && handleConfidence >= 0.5;
  const bodyRadii = canonicalBodyProfile.samples
    .map((sample) => sample.radiusMm)
    .filter((value) => Number.isFinite(value));
  const bodyRadiusSpreadMm = bodyRadii.length
    ? round2(Math.max(...bodyRadii) - Math.min(...bodyRadii))
    : null;
  const printableTopMm = calibration.printableSurfaceContract?.printableTopMm ?? null;
  const lidExclusion = calibration.printableSurfaceContract?.axialExclusions.find((band) => band.kind === "lid");
  const lidExclusionHeightMm = lidExclusion
    ? round2(Math.max(0, lidExclusion.endMm - lidExclusion.startMm))
    : null;

  if (frontOverwrapMm > Math.max(2, wrapDiameterMm * 0.05)) {
    score -= 0.16;
    issues.push(
      `Front silhouette is ${frontOverwrapMm.toFixed(2)} mm wider than the physical wrap diameter, so photo artifacts can still affect visual likeness.`,
    );
    recommendations.push("Keep wrap diameter reserved for engraving/export math and make any wide visible-outline GLB radius explicit in review.");
  }

  if (!hasReviewedLidOutline) {
    score -= hasHandleEvidence ? 0.18 : 0.08;
    issues.push(
      fallbackTopGeometryOmitted
        ? "Visual QA only: lid geometry is omitted because the accepted BODY REFERENCE source is body-only and no reviewed lid outline is present. Saved printable geometry is unchanged."
        : "Visual QA only: lid geometry is still parametric fallback geometry, not a reviewed lid silhouette. Saved printable geometry is unchanged.",
    );
    recommendations.push("Add or review a lid outline before treating the generated GLB as photo-faithful.");
  }

  if (!hasReviewedRingOutline) {
    score -= 0.06;
    issues.push(
      fallbackTopGeometryOmitted
        ? "Visual QA only: silver/rim ring geometry is omitted because the accepted BODY REFERENCE source is body-only and no reviewed ring outline is present. Saved printable geometry is unchanged."
        : "Visual QA only: silver/rim ring geometry is still parametric fallback geometry. Saved printable geometry is unchanged.",
    );
    recommendations.push("Review the ring outline when exact ring placement or thickness matters.");
  }

  if (hasHandleEvidence) {
    score -= 0.18;
    issues.push(
      `Handle evidence is present at ${(handleConfidence ?? 0).toFixed(3)} confidence, but generated GLB handle geometry is not yet reviewed/manual-traced.`,
    );
    recommendations.push("Add a reviewed handle trace or manual handle profile before using this GLB as a photo-matched model.");
  }

  if ((lidExclusionHeightMm ?? 0) > calibration.totalHeightMm * 0.28 && !hasReviewedLidOutline && !fallbackTopGeometryOmitted) {
    score -= 0.16;
    issues.push("Visual QA only: the top lid/ring exclusion is unusually tall for fallback geometry. Treat it as a preview estimate, not a printable-band change.");
    recommendations.push("Treat tall lid/ring boundaries as visual estimates until confirmed by reviewed outlines.");
  }

  if ((bodyRadiusSpreadMm ?? 0) > Math.max(10, wrapDiameterMm * 0.18) && frontOverwrapRatio > 0.04) {
    score -= 0.1;
    issues.push("Body contour radius spread is high while the front trace is overwide.");
    recommendations.push("Compare the generated front silhouette against the source image before accepting production geometry.");
  }

  const normalizedScore = clampScore(score);
  const status: BodyReferenceVisualLikenessStatus =
    normalizedScore < 0.45
      ? "fail"
      : issues.length > 0
        ? "review"
        : "pass";

  return {
    status,
    score: normalizedScore,
    authority: "body-reference-visual-qa",
    issues,
    recommendations: Array.from(new Set(recommendations)),
    metrics: {
      frontVisibleWidthMm: round2(frontVisibleWidthMm),
      wrapDiameterMm: round2(wrapDiameterMm),
      frontOverwrapMm,
      frontOverwrapRatio,
      hasReviewedLidOutline,
      hasReviewedRingOutline,
      handleConfidence: typeof handleConfidence === "number" ? round2(handleConfidence) : null,
      hasHandleEvidence,
      bodyRadiusSpreadMm,
      lidExclusionHeightMm,
      printableTopMm: printableTopMm == null ? null : round2(printableTopMm),
    },
  };
}
