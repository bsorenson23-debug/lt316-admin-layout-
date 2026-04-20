import type {
  BodyReferenceOutlineSeedMode,
  CanonicalDimensionCalibration,
  EditableBodyOutline,
} from "@/types/productTemplate";
import type { PrintableSurfaceContract } from "@/types/printableSurface";
import type {
  PrintableSurfaceBoundarySource,
  PrintableSurfaceResolution,
} from "@/lib/printableSurface";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface BodyReferenceCommittedDebugView {
  totalHeightMm: number;
  bodyTopMm: number;
  bodyBottomMm: number;
  bodyHeightMm: number;
  ringTopMm: number | null;
  ringBottomMm: number | null;
  printableTopMm: number;
  printableBottomMm: number;
  printableHeightMm: number;
  printableCenterMm: number;
  topBoundarySource: PrintableSurfaceBoundarySource | null;
  topBoundaryConfidence: number | null;
  topBoundaryWeak: boolean;
}

export interface CommittedBodyReferenceAuthority {
  totalHeightMm: number;
  bodyTopMm: number;
  bodyBottomMm: number;
  source: "matched-profile" | "committed-input";
  lockedToMatchedProfile: boolean;
}

type MatchedProfileCommittedBounds = {
  overallHeightMm: number;
  bodyTopMm: number;
  bodyBottomMm: number;
};

export function resolveCommittedBodyReferenceAuthority(args: {
  overallHeightMm: number;
  bodyTopFromOverallMm?: number | null;
  bodyBottomFromOverallMm?: number | null;
  outlineSeedMode?: BodyReferenceOutlineSeedMode | null;
  matchedProfileBounds?: MatchedProfileCommittedBounds | null;
  bodyOutline?: EditableBodyOutline | null;
}): CommittedBodyReferenceAuthority | null {
  const matchedProfileHeightMm = args.matchedProfileBounds?.overallHeightMm;
  const matchedProfileBodyTopMm = args.matchedProfileBounds?.bodyTopMm;
  const matchedProfileBodyBottomMm = args.matchedProfileBounds?.bodyBottomMm;
  const matchedProfileLocked =
    Number.isFinite(matchedProfileHeightMm) &&
    Number.isFinite(matchedProfileBodyTopMm) &&
    Number.isFinite(matchedProfileBodyBottomMm);

  if (matchedProfileLocked) {
    const totalHeightMm = round2(Math.max(0, matchedProfileHeightMm ?? 0));
    const bodyTopMm = round2(clamp(matchedProfileBodyTopMm ?? 0, 0, totalHeightMm));
    const bodyBottomMm = round2(clamp(matchedProfileBodyBottomMm ?? bodyTopMm, bodyTopMm, totalHeightMm));
    if (!Number.isFinite(totalHeightMm) || totalHeightMm <= 0 || bodyBottomMm <= bodyTopMm) {
      return null;
    }
    return {
      totalHeightMm,
      bodyTopMm,
      bodyBottomMm,
      source: "matched-profile",
      lockedToMatchedProfile: true,
    };
  }

  const totalHeightMm = round2(Math.max(
    0,
    args.overallHeightMm,
    matchedProfileHeightMm ?? 0,
  ));
  const fallbackBodyTopMm = Number.isFinite(matchedProfileBodyTopMm) ? round2(matchedProfileBodyTopMm ?? 0) : null;
  const fallbackBodyBottomMm = Number.isFinite(matchedProfileBodyBottomMm) ? round2(matchedProfileBodyBottomMm ?? 0) : null;
  const rawBodyTopMm = Number.isFinite(args.bodyTopFromOverallMm) ? round2(args.bodyTopFromOverallMm ?? 0) : null;
  const rawBodyBottomMm = Number.isFinite(args.bodyBottomFromOverallMm) ? round2(args.bodyBottomFromOverallMm ?? 0) : null;
  const bodyOnlyOutlineAnchorsBottom = args.bodyOutline?.sourceContourMode === "body-only";
  const bodyTopCandidate = rawBodyTopMm ?? fallbackBodyTopMm;
  const bodyBottomCandidate = bodyOnlyOutlineAnchorsBottom
    ? totalHeightMm
    : (rawBodyBottomMm ?? fallbackBodyBottomMm);

  if (
    !Number.isFinite(totalHeightMm) ||
    totalHeightMm <= 0 ||
    !Number.isFinite(bodyTopCandidate ?? Number.NaN) ||
    !Number.isFinite(bodyBottomCandidate ?? Number.NaN)
  ) {
    return null;
  }

  const bodyTopMm = round2(clamp(bodyTopCandidate ?? 0, 0, totalHeightMm));
  const bodyBottomMm = round2(clamp(bodyBottomCandidate ?? bodyTopMm, bodyTopMm, totalHeightMm));
  if (bodyBottomMm <= bodyTopMm) {
    return null;
  }

  return {
    totalHeightMm,
    bodyTopMm,
    bodyBottomMm,
    source:
      rawBodyTopMm != null && rawBodyBottomMm != null
        ? "committed-input"
        : "matched-profile",
    lockedToMatchedProfile: false,
  };
}

function resolveRingTopMm(args: {
  totalHeightMm: number;
  lidSeamFromOverallMm?: number | null;
  contract?: PrintableSurfaceContract | null;
}): number | null {
  if (typeof args.lidSeamFromOverallMm === "number" && Number.isFinite(args.lidSeamFromOverallMm)) {
    return round2(clamp(args.lidSeamFromOverallMm, 0, args.totalHeightMm));
  }
  const lidBandEnd = args.contract?.axialExclusions.find((band) => band.kind === "lid")?.endMm;
  if (typeof lidBandEnd === "number" && Number.isFinite(lidBandEnd)) {
    return round2(clamp(lidBandEnd, 0, args.totalHeightMm));
  }
  return null;
}

function resolveRingBottomMm(args: {
  totalHeightMm: number;
  silverBandBottomFromOverallMm?: number | null;
  contract?: PrintableSurfaceContract | null;
}): number | null {
  if (
    typeof args.silverBandBottomFromOverallMm === "number" &&
    Number.isFinite(args.silverBandBottomFromOverallMm)
  ) {
    return round2(clamp(args.silverBandBottomFromOverallMm, 0, args.totalHeightMm));
  }
  const rimBandEnd = args.contract?.axialExclusions.find((band) => band.kind === "rim-ring")?.endMm;
  if (typeof rimBandEnd === "number" && Number.isFinite(rimBandEnd)) {
    return round2(clamp(rimBandEnd, 0, args.totalHeightMm));
  }
  return null;
}

export function buildBodyReferenceCommittedDebugView(args: {
  overallHeightMm: number;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  lidSeamFromOverallMm?: number | null;
  silverBandBottomFromOverallMm?: number | null;
  printableSurfaceResolution?: PrintableSurfaceResolution | null;
  printableSurfaceContract?: PrintableSurfaceContract | null;
  dimensionCalibration?: CanonicalDimensionCalibration | null;
}): BodyReferenceCommittedDebugView {
  const contract =
    args.printableSurfaceResolution?.printableSurfaceContract ??
    args.printableSurfaceContract ??
    args.dimensionCalibration?.printableSurfaceContract ??
    null;
  const totalHeightMm = round2(Math.max(
    0,
    Math.max(args.overallHeightMm, args.dimensionCalibration?.totalHeightMm ?? 0),
  ));
  const bodyTopMm = round2(clamp(
    args.dimensionCalibration?.lidBodyLineMm ?? args.bodyTopFromOverallMm,
    0,
    totalHeightMm,
  ));
  const bodyBottomMm = round2(clamp(
    args.dimensionCalibration?.bodyBottomMm ?? args.bodyBottomFromOverallMm,
    bodyTopMm,
    totalHeightMm,
  ));
  const printableTopMm = round2(clamp(
    contract?.printableTopMm ?? bodyTopMm,
    bodyTopMm,
    bodyBottomMm,
  ));
  const printableBottomMm = round2(clamp(
    contract?.printableBottomMm ?? bodyBottomMm,
    printableTopMm,
    bodyBottomMm,
  ));

  return {
    totalHeightMm,
    bodyTopMm,
    bodyBottomMm,
    bodyHeightMm: round2(Math.max(0, bodyBottomMm - bodyTopMm)),
    ringTopMm: resolveRingTopMm({
      totalHeightMm,
      lidSeamFromOverallMm: args.lidSeamFromOverallMm,
      contract,
    }),
    ringBottomMm: resolveRingBottomMm({
      totalHeightMm,
      silverBandBottomFromOverallMm: args.silverBandBottomFromOverallMm,
      contract,
    }),
    printableTopMm,
    printableBottomMm,
    printableHeightMm: round2(Math.max(0, printableBottomMm - printableTopMm)),
    printableCenterMm: round2((printableTopMm + printableBottomMm) / 2),
    topBoundarySource: args.printableSurfaceResolution?.topBoundarySource ?? null,
    topBoundaryConfidence: args.printableSurfaceResolution?.topConfidence ?? null,
    topBoundaryWeak: Boolean(args.printableSurfaceResolution?.automaticDetectionWeak),
  };
}
