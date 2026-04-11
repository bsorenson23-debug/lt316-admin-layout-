import type { CanonicalDimensionCalibration } from "../types/productTemplate.ts";
import type { ProductTemplateDimensions } from "../types/productTemplate.ts";
import type { AxialSurfaceBand, PrintableSurfaceContract } from "../types/printableSurface.ts";
import { isFiniteNumber } from "../utils/guards.ts";

export type PrintableSurfaceBoundarySource =
  | "manual-override"
  | "rim-ring"
  | "body-top-fallback"
  | "base-band"
  | "body-bottom-fallback";

export interface PrintableSurfaceDetection {
  source: "fit-debug" | "photo-row-scan" | "none";
  lidSeamFromOverallMm?: number | null;
  rimRingBottomFromOverallMm?: number | null;
  confidence: number;
}

export interface PrintableSurfaceResolution {
  printableSurfaceContract: PrintableSurfaceContract;
  axialSurfaceBands: AxialSurfaceBand[];
  printableTopFromBodyTopMm: number;
  printableBottomFromBodyTopMm: number;
  topBoundarySource: PrintableSurfaceBoundarySource;
  bottomBoundarySource: PrintableSurfaceBoundarySource;
  topConfidence: number;
  bottomConfidence: number;
  automaticDetectionWeak: boolean;
}

export interface BuildPrintableSurfaceResolutionArgs {
  overallHeightMm: number;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  lidSeamFromOverallMm?: number | null;
  silverBandBottomFromOverallMm?: number | null;
  printableTopOverrideMm?: number | null;
  printableBottomOverrideMm?: number | null;
  baseBandStartMm?: number | null;
  handleKeepOutStartMm?: number | null;
  handleKeepOutEndMm?: number | null;
  detection?: PrintableSurfaceDetection | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeS(valueMm: number, totalHeightMm: number): number {
  if (!(totalHeightMm > 0)) return 0;
  return clamp(valueMm / totalHeightMm, 0, 1);
}

function addBand(
  bands: AxialSurfaceBand[],
  totalHeightMm: number,
  kind: AxialSurfaceBand["kind"],
  startMm: number,
  endMm: number,
  printable: boolean,
  confidence: number,
): void {
  const normalizedStart = clamp(startMm, 0, totalHeightMm);
  const normalizedEnd = clamp(endMm, normalizedStart, totalHeightMm);
  if (normalizedEnd - normalizedStart < 0.1) return;
  bands.push({
    id: `${kind}-${bands.length + 1}`,
    kind,
    sStart: round2(normalizeS(normalizedStart, totalHeightMm)),
    sEnd: round2(normalizeS(normalizedEnd, totalHeightMm)),
    printable,
    confidence: round2(clamp(confidence, 0, 1)),
  });
}

function resolveBodyBottomFromOverallMm(dims: ProductTemplateDimensions, overallHeightMm: number): number | null {
  if (isFiniteNumber(dims.bodyBottomFromOverallMm)) {
    return dims.bodyBottomFromOverallMm ?? null;
  }
  if (isFiniteNumber(dims.bottomMarginMm)) {
    return Math.max(0, overallHeightMm - (dims.bottomMarginMm ?? 0));
  }
  if (isFiniteNumber(dims.bodyHeightMm) && isFiniteNumber(dims.bodyTopFromOverallMm)) {
    return (dims.bodyTopFromOverallMm ?? 0) + (dims.bodyHeightMm ?? 0);
  }
  if (dims.printableSurfaceContract && isFiniteNumber(dims.printableSurfaceContract.printableBottomMm)) {
    return dims.printableSurfaceContract.printableBottomMm;
  }
  return null;
}

function resolveContractTopMm(dims: ProductTemplateDimensions): number | null {
  if (isFiniteNumber(dims.printableTopOverrideMm)) {
    return dims.printableTopOverrideMm ?? null;
  }
  const hasSemanticTopExclusion = Boolean(
    dims.printableSurfaceContract?.axialExclusions.some((band) => band.kind === "lid" || band.kind === "rim-ring"),
  );
  if (
    dims.printableSurfaceContract &&
    isFiniteNumber(dims.printableSurfaceContract.printableTopMm) &&
    (
      hasSemanticTopExclusion ||
      (!isFiniteNumber(dims.lidSeamFromOverallMm) && !isFiniteNumber(dims.silverBandBottomFromOverallMm))
    )
  ) {
    return dims.printableSurfaceContract.printableTopMm;
  }
  return null;
}

function resolveContractBottomMm(dims: ProductTemplateDimensions): number | null {
  if (isFiniteNumber(dims.printableBottomOverrideMm)) {
    return dims.printableBottomOverrideMm ?? null;
  }
  if (dims.printableSurfaceContract && isFiniteNumber(dims.printableSurfaceContract.printableBottomMm)) {
    return dims.printableSurfaceContract.printableBottomMm;
  }
  return null;
}

function resolveBaseBandStartMm(dims: ProductTemplateDimensions): number | null {
  const baseBand = dims.printableSurfaceContract?.axialExclusions.find((band) => band.kind === "base");
  if (baseBand && isFiniteNumber(baseBand.startMm)) {
    return baseBand.startMm;
  }
  return null;
}

export function buildPrintableSurfaceResolution(
  args: BuildPrintableSurfaceResolutionArgs,
): PrintableSurfaceResolution {
  const overallHeightMm = round2(Math.max(0, args.overallHeightMm));
  const bodyTopMm = round2(clamp(args.bodyTopFromOverallMm, 0, overallHeightMm));
  const bodyBottomMm = round2(clamp(args.bodyBottomFromOverallMm, bodyTopMm, overallHeightMm));
  const bodyHeightMm = Math.max(0.1, bodyBottomMm - bodyTopMm);
  const detectedRingBottomMm = isFiniteNumber(args.silverBandBottomFromOverallMm)
    ? args.silverBandBottomFromOverallMm ?? null
    : (isFiniteNumber(args.detection?.rimRingBottomFromOverallMm) ? args.detection?.rimRingBottomFromOverallMm ?? null : null);
  const explicitRingBottomMm = isFiniteNumber(args.silverBandBottomFromOverallMm)
    ? args.silverBandBottomFromOverallMm ?? null
    : null;
  const detectedRingBottomFromPhotoMm = isFiniteNumber(args.detection?.rimRingBottomFromOverallMm)
    ? args.detection?.rimRingBottomFromOverallMm ?? null
    : null;
  const detectedLidSeamMm = isFiniteNumber(args.lidSeamFromOverallMm)
    ? args.lidSeamFromOverallMm ?? null
    : (isFiniteNumber(args.detection?.lidSeamFromOverallMm) ? args.detection?.lidSeamFromOverallMm ?? null : null);

  const hasManualTopOverride = isFiniteNumber(args.printableTopOverrideMm);
  const hasManualBottomOverride = isFiniteNumber(args.printableBottomOverrideMm);
  const resolvedTopCandidate = hasManualTopOverride
    ? (args.printableTopOverrideMm ?? bodyTopMm)
    : (detectedRingBottomMm ?? bodyTopMm);
  const resolvedBottomCandidate = hasManualBottomOverride
    ? (args.printableBottomOverrideMm ?? bodyBottomMm)
    : (isFiniteNumber(args.baseBandStartMm) ? args.baseBandStartMm ?? bodyBottomMm : bodyBottomMm);

  const printableTopMm = round2(clamp(resolvedTopCandidate, bodyTopMm, bodyBottomMm));
  const printableBottomMm = round2(clamp(resolvedBottomCandidate, printableTopMm, bodyBottomMm));
  const printableHeightMm = round2(Math.max(0, printableBottomMm - printableTopMm));
  const printableTopFromBodyTopMm = round2(Math.max(0, printableTopMm - bodyTopMm));
  const printableBottomFromBodyTopMm = round2(Math.min(bodyHeightMm, Math.max(printableTopFromBodyTopMm, printableBottomMm - bodyTopMm)));
  const detectionConfidence = clamp(args.detection?.confidence ?? 0, 0, 1);
  const topBoundarySource: PrintableSurfaceBoundarySource = hasManualTopOverride
    ? "manual-override"
    : detectedRingBottomMm != null
      ? "rim-ring"
      : "body-top-fallback";
  const bottomBoundarySource: PrintableSurfaceBoundarySource = hasManualBottomOverride
    ? "manual-override"
    : isFiniteNumber(args.baseBandStartMm)
      ? "base-band"
      : "body-bottom-fallback";
  const corroboratedByExplicitRing =
    explicitRingBottomMm != null &&
    detectedRingBottomFromPhotoMm != null &&
    Math.abs(explicitRingBottomMm - detectedRingBottomFromPhotoMm) <= Math.max(1.5, bodyHeightMm * 0.015);
  const topConfidence = round2(
    hasManualTopOverride
      ? 1
      : detectedRingBottomMm != null
        ? explicitRingBottomMm != null
          ? Math.max(
            corroboratedByExplicitRing
              ? 0.82
              : 0.72,
            detectionConfidence || 0.72,
          )
          : corroboratedByExplicitRing
          ? Math.max(0.72, detectionConfidence || 0.72)
          : Math.max(0.42, detectionConfidence || 0.72)
        : 0.32,
  );
  const bottomConfidence = round2(
    hasManualBottomOverride
      ? 1
      : isFiniteNumber(args.baseBandStartMm)
        ? Math.max(0.42, detectionConfidence || 0.68)
        : 0.32,
  );
  const automaticDetectionWeak = !hasManualTopOverride && (detectedRingBottomMm == null || topConfidence < 0.7);

  const axialExclusions: PrintableSurfaceContract["axialExclusions"] = [];
  const lidEndMm = detectedLidSeamMm != null
    ? round2(clamp(detectedLidSeamMm, 0, printableTopMm))
    : null;
  if (lidEndMm != null && lidEndMm > 0.1) {
    axialExclusions.push({
      kind: "lid",
      startMm: 0,
      endMm: lidEndMm,
    });
  }
  const rimStartMm = lidEndMm != null ? Math.max(bodyTopMm, lidEndMm) : bodyTopMm;
  if (printableTopMm - rimStartMm >= 0.1) {
    axialExclusions.push({
      kind: "rim-ring",
      startMm: round2(rimStartMm),
      endMm: printableTopMm,
    });
  }
  if (bodyBottomMm - printableBottomMm >= 0.1) {
    axialExclusions.push({
      kind: "base",
      startMm: printableBottomMm,
      endMm: bodyBottomMm,
    });
  }

  const circumferentialExclusions: PrintableSurfaceContract["circumferentialExclusions"] =
    isFiniteNumber(args.handleKeepOutStartMm) && isFiniteNumber(args.handleKeepOutEndMm)
      ? [
          {
            kind: "handle",
            startMm: round2(args.handleKeepOutStartMm ?? 0),
            endMm: round2(args.handleKeepOutEndMm ?? 0),
            wraps: (args.handleKeepOutStartMm ?? 0) > (args.handleKeepOutEndMm ?? 0),
          },
        ]
      : [];

  const axialSurfaceBands: AxialSurfaceBand[] = [];
  if (lidEndMm != null) {
    addBand(axialSurfaceBands, overallHeightMm, "lid", 0, lidEndMm, false, topConfidence);
  }
  if (printableTopMm > rimStartMm) {
    addBand(axialSurfaceBands, overallHeightMm, "rim-ring", rimStartMm, printableTopMm, false, topConfidence);
  }
  addBand(axialSurfaceBands, overallHeightMm, "upper-body", printableTopMm, printableBottomMm, true, Math.max(topConfidence, bottomConfidence));
  if (bodyBottomMm > printableBottomMm) {
    addBand(axialSurfaceBands, overallHeightMm, "base", printableBottomMm, bodyBottomMm, false, bottomConfidence);
  }

  return {
    printableSurfaceContract: {
      printableTopMm,
      printableBottomMm,
      printableHeightMm,
      axialExclusions,
      circumferentialExclusions,
    },
    axialSurfaceBands,
    printableTopFromBodyTopMm,
    printableBottomFromBodyTopMm,
    topBoundarySource,
    bottomBoundarySource,
    topConfidence,
    bottomConfidence,
    automaticDetectionWeak,
  };
}

export function getPrintableSurfaceResolutionFromDimensions(
  dims: ProductTemplateDimensions,
  calibration?: CanonicalDimensionCalibration | null,
): PrintableSurfaceResolution | null {
  const overallHeightMm = dims.overallHeightMm ?? calibration?.totalHeightMm;
  if (!isFiniteNumber(overallHeightMm) || overallHeightMm <= 0) {
    return null;
  }
  const bodyTopFromOverallMm =
    dims.bodyTopFromOverallMm ??
    calibration?.lidBodyLineMm ??
    dims.topMarginMm;
  const bodyBottomFromOverallMm = resolveBodyBottomFromOverallMm(dims, overallHeightMm);
  if (!isFiniteNumber(bodyTopFromOverallMm) || !isFiniteNumber(bodyBottomFromOverallMm)) {
    return null;
  }

  return buildPrintableSurfaceResolution({
    overallHeightMm,
    bodyTopFromOverallMm: bodyTopFromOverallMm ?? 0,
    bodyBottomFromOverallMm: bodyBottomFromOverallMm ?? overallHeightMm,
    lidSeamFromOverallMm: dims.lidSeamFromOverallMm,
    silverBandBottomFromOverallMm: dims.silverBandBottomFromOverallMm,
    printableTopOverrideMm: resolveContractTopMm(dims),
    printableBottomOverrideMm: resolveContractBottomMm(dims),
    baseBandStartMm: resolveBaseBandStartMm(dims),
    handleKeepOutStartMm:
      dims.printableSurfaceContract?.circumferentialExclusions[0]?.startMm ??
      calibration?.wrapMappingMm.handleKeepOutStartMm,
    handleKeepOutEndMm:
      dims.printableSurfaceContract?.circumferentialExclusions[0]?.endMm ??
      calibration?.wrapMappingMm.handleKeepOutEndMm,
  });
}

export function getPrintableSurfaceLocalBounds(args: {
  contract: PrintableSurfaceContract | null | undefined;
  bodyTopFromOverallMm: number | null | undefined;
  bodyBottomFromOverallMm: number | null | undefined;
}): { topMm: number; bottomMm: number; heightMm: number } | null {
  if (!args.contract || !isFiniteNumber(args.bodyTopFromOverallMm) || !isFiniteNumber(args.bodyBottomFromOverallMm)) {
    return null;
  }
  const bodyTopMm = args.bodyTopFromOverallMm ?? 0;
  const bodyBottomMm = args.bodyBottomFromOverallMm ?? bodyTopMm;
  const bodyHeightMm = Math.max(0, bodyBottomMm - bodyTopMm);
  const topMm = clamp(args.contract.printableTopMm - bodyTopMm, 0, bodyHeightMm);
  const bottomMm = clamp(args.contract.printableBottomMm - bodyTopMm, topMm, bodyHeightMm);
  return {
    topMm: round2(topMm),
    bottomMm: round2(bottomMm),
    heightMm: round2(Math.max(0, bottomMm - topMm)),
  };
}
