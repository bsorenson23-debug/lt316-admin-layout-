import { isFiniteNumber } from "../utils/guards.ts";

export type BodyReferenceTopBandArtifactGuardResult = {
  lidSeamFromOverallMm: number;
  silverBandBottomFromOverallMm: number;
  printableTopOverrideMm: number;
  reason: "top-band-artifact";
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finitePositive(value: number | null | undefined): number | null {
  return isFiniteNumber(value) && (value ?? 0) > 0 ? value ?? null : null;
}

export function resolveCompactBodyReferenceFallbackTopBand(args: {
  totalHeightMm: number;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
}): BodyReferenceTopBandArtifactGuardResult {
  const totalHeightMm = Math.max(1, args.totalHeightMm);
  const bodyTopMm = clamp(args.bodyTopFromOverallMm, 0, args.bodyBottomFromOverallMm);
  const bodyBottomMm = Math.max(bodyTopMm + 0.5, args.bodyBottomFromOverallMm);
  const lidHeightMm = clamp(totalHeightMm * 0.0278, 4, 5);
  const rimBottomOffsetMm = clamp(totalHeightMm * 0.06895, 10, 12);
  const lidSeamFromOverallMm = round1(clamp(bodyTopMm + lidHeightMm, bodyTopMm + 0.5, bodyBottomMm));
  const silverBandBottomFromOverallMm = round1(
    clamp(bodyTopMm + rimBottomOffsetMm, lidSeamFromOverallMm + 0.5, bodyBottomMm),
  );

  return {
    lidSeamFromOverallMm,
    silverBandBottomFromOverallMm,
    printableTopOverrideMm: silverBandBottomFromOverallMm,
    reason: "top-band-artifact",
  };
}

export function resolveBodyReferenceTopBandArtifactGuard(args: {
  totalHeightMm: number;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  wrapDiameterMm?: number | null;
  frontVisibleWidthMm?: number | null;
  lidSeamFromOverallMm?: number | null;
  silverBandBottomFromOverallMm?: number | null;
  printableTopOverrideMm?: number | null;
}): BodyReferenceTopBandArtifactGuardResult | null {
  const totalHeightMm = finitePositive(args.totalHeightMm);
  const bodyTopMm = finitePositive(args.bodyTopFromOverallMm);
  const bodyBottomMm = finitePositive(args.bodyBottomFromOverallMm);
  const wrapDiameterMm = finitePositive(args.wrapDiameterMm);
  const frontVisibleWidthMm = finitePositive(args.frontVisibleWidthMm);
  if (
    totalHeightMm == null ||
    bodyTopMm == null ||
    bodyBottomMm == null ||
    wrapDiameterMm == null ||
    frontVisibleWidthMm == null ||
    bodyBottomMm <= bodyTopMm
  ) {
    return null;
  }

  const widthExcessMm = round2(frontVisibleWidthMm - wrapDiameterMm);
  const overwideThresholdMm = Math.max(2, wrapDiameterMm * 0.05);
  if (widthExcessMm <= overwideThresholdMm) {
    return null;
  }

  const compactFallback = resolveCompactBodyReferenceFallbackTopBand({
    totalHeightMm,
    bodyTopFromOverallMm: bodyTopMm,
    bodyBottomFromOverallMm: bodyBottomMm,
  });
  const suspiciousTopBandLimitMm = round2(
    bodyTopMm + Math.max(18, (compactFallback.silverBandBottomFromOverallMm - bodyTopMm) * 1.6),
  );
  const candidates = [
    args.lidSeamFromOverallMm,
    args.silverBandBottomFromOverallMm,
    args.printableTopOverrideMm,
  ].filter((value): value is number => isFiniteNumber(value));
  const hasSuspiciousTopBandValue = candidates.some((value) => value > suspiciousTopBandLimitMm);
  if (!hasSuspiciousTopBandValue) {
    return null;
  }

  return compactFallback;
}
