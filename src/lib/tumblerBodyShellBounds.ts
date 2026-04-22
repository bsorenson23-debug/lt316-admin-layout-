import type { TumblerProfile } from "../data/tumblerProfiles.ts";

export interface BottomAnchoredBodyShellBounds {
  overallHeightMm: number;
  bodyTopMm: number;
  bodyBottomMm: number;
  topMarginMm: number;
  bottomMarginMm: number;
}

export interface MatchedProfilePrintableBandBounds {
  printableTopMm: number;
  printableBottomMm: number;
  printableHeightMm: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return Number.isFinite(value);
}

export function resolveBottomAnchoredBodyShellBounds(args: {
  overallHeightMm: number | null | undefined;
  usableHeightMm?: number | null | undefined;
  explicitBodyTopMm?: number | null | undefined;
}): BottomAnchoredBodyShellBounds | null {
  if (!isFiniteNumber(args.overallHeightMm)) {
    return null;
  }

  const overallHeightMm = round2(Math.max(0, args.overallHeightMm ?? 0));
  const bodyBottomMm = overallHeightMm;
  const fallbackBodyTopMm = isFiniteNumber(args.usableHeightMm)
    ? overallHeightMm - Math.max(0, args.usableHeightMm ?? 0)
    : 0;
  const bodyTopMm = round2(clamp(
    isFiniteNumber(args.explicitBodyTopMm) ? args.explicitBodyTopMm ?? 0 : fallbackBodyTopMm,
    0,
    bodyBottomMm,
  ));

  return {
    overallHeightMm,
    bodyTopMm,
    bodyBottomMm,
    topMarginMm: bodyTopMm,
    bottomMarginMm: round2(Math.max(0, overallHeightMm - bodyBottomMm)),
  };
}

export function resolveMatchedProfileBodyShellBounds(
  profile: TumblerProfile | null | undefined,
): BottomAnchoredBodyShellBounds | null {
  if (!profile) {
    return null;
  }

  return resolveBottomAnchoredBodyShellBounds({
    overallHeightMm: profile.overallHeightMm,
    usableHeightMm: profile.usableHeightMm,
    explicitBodyTopMm: profile.guideBand?.upperGrooveYmm,
  });
}

export function resolveMatchedProfilePrintableBandBounds(
  profile: TumblerProfile | null | undefined,
): MatchedProfilePrintableBandBounds | null {
  if (
    !profile ||
    !isFiniteNumber(profile.overallHeightMm) ||
    !isFiniteNumber(profile.guideBand?.upperGrooveYmm) ||
    !isFiniteNumber(profile.guideBand?.lowerGrooveYmm)
  ) {
    return null;
  }

  const overallHeightMm = round2(Math.max(0, profile.overallHeightMm ?? 0));
  const printableTopMm = round2(clamp(profile.guideBand?.upperGrooveYmm ?? 0, 0, overallHeightMm));
  const printableBottomMm = round2(
    clamp(profile.guideBand?.lowerGrooveYmm ?? printableTopMm, printableTopMm, overallHeightMm),
  );

  return {
    printableTopMm,
    printableBottomMm,
    printableHeightMm: round2(Math.max(0, printableBottomMm - printableTopMm)),
  };
}
