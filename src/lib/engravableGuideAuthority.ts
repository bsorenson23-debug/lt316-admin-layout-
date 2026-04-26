import type { PrintableSurfaceContract } from "../types/printableSurface.ts";
import type { TumblerItemLookupFitDebug } from "../types/tumblerItemLookup.ts";

export type EngravableGuideSource =
  | "manual-override"
  | "detected-lower-silver-seam"
  | "detected-silver-band-bottom"
  | "saved-printable-surface-contract"
  | "accepted-body-reference"
  | "fallback-body-frame"
  | "unknown";

export type EngravableBodyScaleSource =
  | "accepted-body-reference"
  | "fallback-body-frame"
  | "unknown";

export interface EngravableZoneGuideAuthority {
  bodyScaleSource: EngravableBodyScaleSource;
  topGuideMm: number;
  bottomGuideMm: number;
  topGuideSource: EngravableGuideSource;
  bottomGuideSource: EngravableGuideSource;
  detectedLowerSilverSeamMm: number | null;
  manualTopOverrideActive: boolean;
  manualBottomOverrideActive: boolean;
  warnings: string[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function firstFinite(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    if (isFiniteNumber(value)) return value;
  }
  return null;
}

export function fitDebugYToOverallMm(args: {
  fitDebug: TumblerItemLookupFitDebug | null | undefined;
  yPx: number | null | undefined;
  overallHeightMm: number;
}): number | null {
  const debug = args.fitDebug;
  if (!debug || !isFiniteNumber(args.yPx) || !(args.overallHeightMm > 0)) return null;
  const topPx = debug.fullTopPx;
  const bottomPx = debug.fullBottomPx;
  if (!isFiniteNumber(topPx) || !isFiniteNumber(bottomPx) || bottomPx <= topPx) return null;
  return round2(((args.yPx - topPx) / (bottomPx - topPx)) * args.overallHeightMm);
}

export function resolveDetectedLowerSilverSeamMm(args: {
  overallHeightMm: number;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  savedSilverBandBottomFromOverallMm?: number | null;
  fitDebug?: TumblerItemLookupFitDebug | null;
}): number | null {
  const fromSaved = isFiniteNumber(args.savedSilverBandBottomFromOverallMm)
    ? args.savedSilverBandBottomFromOverallMm
    : null;
  const debugY = firstFinite(
    args.fitDebug?.seamSilverBottomPx,
    args.fitDebug?.engravingStartGuidePx,
    args.fitDebug?.rimBottomPx,
    args.fitDebug?.measurementBandTopPx,
    args.fitDebug?.referenceBandTopPx,
  );
  const fromDebug = fitDebugYToOverallMm({
    fitDebug: args.fitDebug,
    yPx: debugY,
    overallHeightMm: args.overallHeightMm,
  });
  const value = firstFinite(fromSaved, fromDebug);
  if (!isFiniteNumber(value)) return null;
  const min = Math.max(0, args.bodyTopFromOverallMm);
  const max = Math.max(min, args.bodyBottomFromOverallMm);
  return round2(clamp(value, min, max));
}

export function resolvePrintableContractTopMm(
  contract: PrintableSurfaceContract | null | undefined,
): number | null {
  return isFiniteNumber(contract?.printableTopMm) ? contract.printableTopMm : null;
}

export function resolvePrintableContractBottomMm(
  contract: PrintableSurfaceContract | null | undefined,
): number | null {
  return isFiniteNumber(contract?.printableBottomMm) ? contract.printableBottomMm : null;
}

export function resolveEngravableZoneGuideAuthority(args: {
  overallHeightMm: number;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  acceptedBodyReferenceAvailable?: boolean;
  printableTopOverrideMm?: number | null;
  printableBottomOverrideMm?: number | null;
  savedSilverBandBottomFromOverallMm?: number | null;
  fitDebug?: TumblerItemLookupFitDebug | null;
  printableSurfaceContract?: PrintableSurfaceContract | null;
}): EngravableZoneGuideAuthority {
  const warnings: string[] = [];
  const overallHeightMm = Math.max(0, args.overallHeightMm);
  const bodyTopMm = round2(clamp(args.bodyTopFromOverallMm, 0, overallHeightMm));
  const bodyBottomMm = round2(clamp(args.bodyBottomFromOverallMm, bodyTopMm, overallHeightMm));
  const manualTopOverrideActive = isFiniteNumber(args.printableTopOverrideMm);
  const manualBottomOverrideActive = isFiniteNumber(args.printableBottomOverrideMm);
  const detectedLowerSilverSeamMm = resolveDetectedLowerSilverSeamMm({
    overallHeightMm,
    bodyTopFromOverallMm: bodyTopMm,
    bodyBottomFromOverallMm: bodyBottomMm,
    savedSilverBandBottomFromOverallMm: args.savedSilverBandBottomFromOverallMm,
    fitDebug: args.fitDebug,
  });
  const contractTopMm = resolvePrintableContractTopMm(args.printableSurfaceContract);
  const contractBottomMm = resolvePrintableContractBottomMm(args.printableSurfaceContract);

  let topGuideMm: number;
  let topGuideSource: EngravableGuideSource;
  if (manualTopOverrideActive) {
    topGuideMm = args.printableTopOverrideMm ?? bodyTopMm;
    topGuideSource = "manual-override";
  } else if (isFiniteNumber(detectedLowerSilverSeamMm)) {
    topGuideMm = detectedLowerSilverSeamMm;
    topGuideSource = isFiniteNumber(args.savedSilverBandBottomFromOverallMm)
      ? "detected-silver-band-bottom"
      : "detected-lower-silver-seam";
  } else if (isFiniteNumber(contractTopMm)) {
    topGuideMm = contractTopMm;
    topGuideSource = "saved-printable-surface-contract";
  } else {
    topGuideMm = bodyTopMm;
    topGuideSource = args.acceptedBodyReferenceAvailable ? "accepted-body-reference" : "fallback-body-frame";
  }

  let bottomGuideMm: number;
  let bottomGuideSource: EngravableGuideSource;
  if (manualBottomOverrideActive) {
    bottomGuideMm = args.printableBottomOverrideMm ?? bodyBottomMm;
    bottomGuideSource = "manual-override";
  } else if (isFiniteNumber(contractBottomMm)) {
    bottomGuideMm = contractBottomMm;
    bottomGuideSource = "saved-printable-surface-contract";
  } else {
    bottomGuideMm = bodyBottomMm;
    bottomGuideSource = args.acceptedBodyReferenceAvailable ? "accepted-body-reference" : "fallback-body-frame";
  }

  topGuideMm = round2(clamp(topGuideMm, bodyTopMm, bodyBottomMm));
  bottomGuideMm = round2(clamp(bottomGuideMm, topGuideMm, bodyBottomMm));

  if (!manualTopOverrideActive && !isFiniteNumber(detectedLowerSilverSeamMm)) {
    warnings.push("No detected lower silver seam is available; using printable contract or BODY REFERENCE fallback.");
  }

  return {
    bodyScaleSource: args.acceptedBodyReferenceAvailable
      ? "accepted-body-reference"
      : (bodyBottomMm > bodyTopMm ? "fallback-body-frame" : "unknown"),
    topGuideMm,
    bottomGuideMm,
    topGuideSource,
    bottomGuideSource,
    detectedLowerSilverSeamMm,
    manualTopOverrideActive,
    manualBottomOverrideActive,
    warnings,
  };
}
