import type { ProductTemplate } from "../types/productTemplate.ts";
import type { AxialSurfaceBand, PrintableSurfaceContract } from "../types/printableSurface.ts";
import {
  findTumblerProfileIdForBrandModel,
  getTumblerProfileById,
  getProfileHandleArcDeg,
} from "../data/tumblerProfiles.ts";
import type { TumblerItemLookupFitDebug } from "../types/tumblerItemLookup.ts";
import {
  buildPrintableSurfaceResolution,
  getPrintableSurfaceResolutionFromDimensions,
} from "./printableSurface.ts";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface EngravableDimensions {
  /** Outside diameter from template/profile (mm) */
  diameterMm: number;
  /** diameter / 2 */
  radiusMm: number;
  /** PI x diameter */
  circumferenceMm: number;
  /** Full tumbler height from profile or estimated (mm) */
  totalHeightMm: number;
  /** Legacy overall top margin to the body shell (mm) */
  topMarginMm: number;
  /** Legacy overall bottom margin below the body shell (mm) */
  bottomMarginMm: number;
  /** Legacy body-shell height used by the alignment workspace (mm) */
  engravableHeightMm: number;
  /** Legacy alias for the body shell top measured from the overall top. */
  bodyTopOffsetMm: number;
  /** Legacy alias for the body shell bottom measured from the overall top. */
  bodyBottomOffsetMm: number;
  /** Canonical printable-surface contract in absolute mm space. */
  printableSurfaceContract: PrintableSurfaceContract;
  /** Canonical normalized axial surface segmentation. */
  axialSurfaceBands: AxialSurfaceBand[];
  /** Printable top offset measured from the body-shell top. */
  printableTopFromBodyTopMm: number;
  /** Printable bottom offset measured from the body-shell top. */
  printableBottomFromBodyTopMm: number;
  /** Printable height inside the body shell. */
  printableHeightMm: number;
  /** True when auto band detection is weak and manual override should be surfaced. */
  automaticPrintableDetectionWeak: boolean;
  /** Handle exclusion arc (degrees, 0 = no handle) */
  handleArcDeg: number;
  /** Physical handle width on the surface (mm) */
  handleWidthMm: number;
  /** 360 - handleArcDeg */
  printableArcDeg: number;
  /** Printable wrap width = (printableArcDeg / 360) x circumference (mm) */
  printableWidthMm: number;
  /**
   * Y offset of the body-shell center from the mesh center (mm).
   * Positive = zone is higher than mesh center.
   */
  engravableOffsetY: number;
}

export interface DerivedEngravableZoneFromFitDebug {
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  bodyHeightMm: number;
  topMarginMm: number;
  bottomMarginMm: number;
  printHeightMm: number;
  straightWallBottomYFromTopMm: number | null;
  straightWallHeightMm: number | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pxToMmFromOverallTop(
  px: number,
  fitDebug: TumblerItemLookupFitDebug,
  overallHeightMm: number,
): number {
  const fullHeightPx = fitDebug.fullBottomPx - fitDebug.fullTopPx;
  if (!(fullHeightPx > 0)) return 0;
  const ratio = (px - fitDebug.fullTopPx) / fullHeightPx;
  return round2(clamp(ratio, 0, 1) * overallHeightMm);
}

function findStraightWallBottomFromProfile(args: {
  overallHeightMm: number;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  fitDebug: TumblerItemLookupFitDebug;
}): number | null {
  const points = [...args.fitDebug.profilePoints]
    .filter((point) => Number.isFinite(point.yPx) && Number.isFinite(point.radiusMm))
    .sort((left, right) => left.yPx - right.yPx);
  if (points.length < 4) return null;

  const maxRadiusMm = Math.max(...points.map((point) => point.radiusMm));
  const toleranceMm = Math.max(0.8, maxRadiusMm * 0.025);

  let candidate: number | null = null;
  for (let index = points.length - 2; index >= 1; index -= 1) {
    const point = points[index];
    const nextPoint = points[index + 1];
    if (point.radiusMm >= maxRadiusMm - toleranceMm && nextPoint.radiusMm < maxRadiusMm - toleranceMm) {
      candidate = round2(args.overallHeightMm / 2 - point.yMm);
      break;
    }
  }

  if (candidate == null) return null;

  return round2(clamp(
    candidate,
    args.bodyTopFromOverallMm,
    args.bodyBottomFromOverallMm,
  ));
}

// ---------------------------------------------------------------------------
// Low-level: compute from raw values (used by wizard/model components)
// ---------------------------------------------------------------------------

export function computeEngravableDimensions(opts: {
  diameterMm: number;
  printHeightMm: number;
  handleArcDeg: number;
  totalHeightMm?: number;
  topMarginMm?: number;
  bottomMarginMm?: number;
  bodyTopFromOverallMm?: number;
  bodyBottomFromOverallMm?: number;
  printableSurfaceContract?: PrintableSurfaceContract;
  axialSurfaceBands?: AxialSurfaceBand[];
  automaticPrintableDetectionWeak?: boolean;
}): EngravableDimensions {
  const diameterMm = opts.diameterMm;
  const radiusMm = diameterMm / 2;
  const circumferenceMm = Math.PI * diameterMm;
  const totalHeightMm = opts.totalHeightMm ?? opts.printHeightMm;

  let bodyShellHeightMm = Math.max(0, opts.printHeightMm);
  let topMarginMm = opts.topMarginMm ?? 0;
  let bottomMarginMm = opts.bottomMarginMm ?? 0;

  if (Number.isFinite(opts.topMarginMm) && Number.isFinite(opts.bottomMarginMm)) {
    topMarginMm = Math.max(0, opts.topMarginMm ?? 0);
    bottomMarginMm = Math.max(0, opts.bottomMarginMm ?? 0);
    bodyShellHeightMm = Math.max(0, totalHeightMm - topMarginMm - bottomMarginMm);
  } else if (Number.isFinite(opts.topMarginMm)) {
    topMarginMm = Math.max(0, opts.topMarginMm ?? 0);
    bodyShellHeightMm = Math.min(bodyShellHeightMm, Math.max(0, totalHeightMm - topMarginMm));
    bottomMarginMm = Math.max(0, totalHeightMm - bodyShellHeightMm - topMarginMm);
  } else if (Number.isFinite(opts.bottomMarginMm)) {
    bottomMarginMm = Math.max(0, opts.bottomMarginMm ?? 0);
    bodyShellHeightMm = Math.min(bodyShellHeightMm, Math.max(0, totalHeightMm - bottomMarginMm));
    topMarginMm = Math.max(0, totalHeightMm - bodyShellHeightMm - bottomMarginMm);
  } else {
    topMarginMm = Math.max(0, (totalHeightMm - bodyShellHeightMm) / 2);
    bottomMarginMm = Math.max(0, totalHeightMm - bodyShellHeightMm - topMarginMm);
  }

  const bodyTopOffsetMm = round2(
    clamp(
      Number.isFinite(opts.bodyTopFromOverallMm) ? (opts.bodyTopFromOverallMm ?? topMarginMm) : topMarginMm,
      0,
      totalHeightMm,
    ),
  );
  const bodyBottomOffsetMm = round2(
    clamp(
      Number.isFinite(opts.bodyBottomFromOverallMm)
        ? (opts.bodyBottomFromOverallMm ?? (bodyTopOffsetMm + bodyShellHeightMm))
        : (bodyTopOffsetMm + bodyShellHeightMm),
      bodyTopOffsetMm,
      totalHeightMm,
    ),
  );
  bodyShellHeightMm = round2(Math.max(0, bodyBottomOffsetMm - bodyTopOffsetMm));

  const printableSurfaceContract = opts.printableSurfaceContract ?? {
    printableTopMm: bodyTopOffsetMm,
    printableBottomMm: bodyBottomOffsetMm,
    printableHeightMm: bodyShellHeightMm,
    axialExclusions: [],
    circumferentialExclusions: [],
  };
  const printableTopFromBodyTopMm = round2(
    clamp(printableSurfaceContract.printableTopMm - bodyTopOffsetMm, 0, bodyShellHeightMm),
  );
  const printableBottomFromBodyTopMm = round2(
    clamp(printableSurfaceContract.printableBottomMm - bodyTopOffsetMm, printableTopFromBodyTopMm, bodyShellHeightMm),
  );
  const printableHeightMm = round2(Math.max(0, printableBottomFromBodyTopMm - printableTopFromBodyTopMm));

  const handleArcDeg = opts.handleArcDeg;
  const handleWidthMm = (handleArcDeg / 360) * circumferenceMm;
  const printableArcDeg = 360 - handleArcDeg;
  const printableWidthMm = (printableArcDeg / 360) * circumferenceMm;

  // Mesh is bbox-centered at Y=0, so meshTop = totalHeightMm / 2.
  // Body shell top = meshTop - topMarginMm.
  const engravableOffsetY = totalHeightMm / 2 - topMarginMm - bodyShellHeightMm / 2;

  return {
    diameterMm,
    radiusMm,
    circumferenceMm,
    totalHeightMm,
    topMarginMm: round2(topMarginMm),
    bottomMarginMm: round2(bottomMarginMm),
    engravableHeightMm: bodyShellHeightMm,
    bodyTopOffsetMm,
    bodyBottomOffsetMm,
    printableSurfaceContract,
    axialSurfaceBands: opts.axialSurfaceBands ?? [],
    printableTopFromBodyTopMm,
    printableBottomFromBodyTopMm,
    printableHeightMm,
    automaticPrintableDetectionWeak: Boolean(opts.automaticPrintableDetectionWeak),
    handleArcDeg,
    handleWidthMm: round2(handleWidthMm),
    printableArcDeg: round2(printableArcDeg),
    printableWidthMm: round2(printableWidthMm),
    engravableOffsetY: round2(engravableOffsetY),
  };
}

export function deriveEngravableZoneFromFitDebug(args: {
  overallHeightMm: number | null | undefined;
  fitDebug: TumblerItemLookupFitDebug | null | undefined;
}): DerivedEngravableZoneFromFitDebug | null {
  if (!args.fitDebug || !args.overallHeightMm || !Number.isFinite(args.overallHeightMm) || args.overallHeightMm <= 0) {
    return null;
  }

  const overallHeightMm = args.overallHeightMm;
  const fitDebug = args.fitDebug;
  const bodyTopFromOverallMm = pxToMmFromOverallTop(fitDebug.bodyTopPx, fitDebug, overallHeightMm);
  const bodyBottomFromOverallMm = pxToMmFromOverallTop(fitDebug.bodyBottomPx, fitDebug, overallHeightMm);
  if (!(bodyBottomFromOverallMm > bodyTopFromOverallMm)) {
    return null;
  }

  const bodyHeightMm = round2(bodyBottomFromOverallMm - bodyTopFromOverallMm);
  const topMarginMm = round2(bodyTopFromOverallMm);
  const bottomMarginMm = round2(Math.max(0, overallHeightMm - bodyBottomFromOverallMm));
  const straightWallBottomYFromTopMm = findStraightWallBottomFromProfile({
    overallHeightMm,
    bodyTopFromOverallMm,
    bodyBottomFromOverallMm,
    fitDebug,
  });
  const straightWallHeightMm = straightWallBottomYFromTopMm == null
    ? null
    : round2(Math.max(0, straightWallBottomYFromTopMm - bodyTopFromOverallMm));

  return {
    bodyTopFromOverallMm,
    bodyBottomFromOverallMm,
    bodyHeightMm,
    topMarginMm,
    bottomMarginMm,
    printHeightMm: bodyHeightMm,
    straightWallBottomYFromTopMm,
    straightWallHeightMm,
  };
}

// ---------------------------------------------------------------------------
// High-level: compute from a ProductTemplate (with profile lookup)
// ---------------------------------------------------------------------------

export function getEngravableDimensions(
  template: ProductTemplate,
): EngravableDimensions {
  const profileId = findTumblerProfileIdForBrandModel({
    brand: template.brand,
    model: template.name,
    capacityOz: template.capacity ? parseInt(template.capacity, 10) : undefined,
  });
  const profile = profileId ? getTumblerProfileById(profileId) : null;

  const handleArcDeg = template.dimensions.handleArcDeg > 0
    ? template.dimensions.handleArcDeg
    : getProfileHandleArcDeg(profile);

  const explicitTotalHeightMm = template.dimensions.overallHeightMm;
  const explicitBodyShellHeightMm = template.dimensions.printHeightMm;
  const explicitTopMarginMm = template.dimensions.topMarginMm;
  const explicitBottomMarginMm = template.dimensions.bottomMarginMm;
  const explicitBodyTopMm = template.dimensions.bodyTopFromOverallMm;
  const explicitBodyBottomMm = template.dimensions.bodyBottomFromOverallMm;
  const profileTotalHeightMm = profile?.overallHeightMm;
  const profileUsableHeightMm = profile?.usableHeightMm;
  const profileTopMarginMm = profile?.guideBand?.upperGrooveYmm;
  const profileLowerYmm = profile?.guideBand?.lowerGrooveYmm;

  const totalHeightMm = explicitTotalHeightMm ?? profileTotalHeightMm ?? explicitBodyShellHeightMm;
  const resolvedTotalHeightMm = totalHeightMm ?? 0;
  const resolvedBodyShellHeightMm = explicitBodyShellHeightMm ?? 0;
  const resolvedProfileTopMarginMm = profileTopMarginMm ?? 0;
  const resolvedProfileLowerYmm = profileLowerYmm ?? resolvedTotalHeightMm;
  const resolvedProfileUsableHeightMm = profileUsableHeightMm ?? resolvedTotalHeightMm;

  let bodyTopFromOverallMm = explicitBodyTopMm;
  let bodyBottomFromOverallMm = explicitBodyBottomMm;
  let bodyShellHeightMm = resolvedBodyShellHeightMm;
  let topMarginMm = explicitTopMarginMm;
  let bottomMarginMm = explicitBottomMarginMm;

  if (
    Number.isFinite(explicitBodyTopMm) &&
    Number.isFinite(explicitBodyBottomMm) &&
    Number.isFinite(totalHeightMm)
  ) {
    bodyTopFromOverallMm = explicitBodyTopMm;
    bodyBottomFromOverallMm = explicitBodyBottomMm;
    bodyShellHeightMm = Math.max(0, (explicitBodyBottomMm ?? 0) - (explicitBodyTopMm ?? 0));
    topMarginMm = explicitTopMarginMm ?? explicitBodyTopMm ?? 0;
    bottomMarginMm = explicitBottomMarginMm ?? Math.max(0, resolvedTotalHeightMm - (explicitBodyBottomMm ?? resolvedTotalHeightMm));
  } else if (
    Number.isFinite(explicitTopMarginMm) &&
    Number.isFinite(explicitBottomMarginMm) &&
    Number.isFinite(totalHeightMm)
  ) {
    bodyTopFromOverallMm = explicitTopMarginMm;
    bodyBottomFromOverallMm = Math.max(explicitTopMarginMm ?? 0, resolvedTotalHeightMm - (explicitBottomMarginMm ?? 0));
    bodyShellHeightMm = Math.max(0, (bodyBottomFromOverallMm ?? 0) - (bodyTopFromOverallMm ?? 0));
    topMarginMm = explicitTopMarginMm ?? 0;
    bottomMarginMm = explicitBottomMarginMm ?? 0;
  } else if (
    Number.isFinite(profileUsableHeightMm) &&
    Number.isFinite(totalHeightMm) &&
    (resolvedBodyShellHeightMm <= 0 || resolvedBodyShellHeightMm > resolvedTotalHeightMm + 0.5 || resolvedBodyShellHeightMm === resolvedTotalHeightMm)
  ) {
    bodyShellHeightMm = Math.min(resolvedProfileUsableHeightMm, resolvedTotalHeightMm);
    bodyTopFromOverallMm = explicitTopMarginMm ?? profileTopMarginMm ?? Math.max(0, (resolvedTotalHeightMm - bodyShellHeightMm) / 2);
    bodyBottomFromOverallMm = Math.max(bodyTopFromOverallMm ?? 0, (bodyTopFromOverallMm ?? 0) + bodyShellHeightMm);
    topMarginMm = bodyTopFromOverallMm ?? 0;
    bottomMarginMm = Math.max(0, resolvedTotalHeightMm - (bodyBottomFromOverallMm ?? resolvedTotalHeightMm));
  } else if (
    Number.isFinite(profileTopMarginMm) &&
    Number.isFinite(profileLowerYmm) &&
    Number.isFinite(totalHeightMm) &&
    (resolvedBodyShellHeightMm <= 0 || (explicitTopMarginMm ?? resolvedProfileTopMarginMm) + resolvedBodyShellHeightMm > resolvedTotalHeightMm + 0.5)
  ) {
    bodyTopFromOverallMm = resolvedProfileTopMarginMm;
    bodyBottomFromOverallMm = resolvedProfileLowerYmm;
    bodyShellHeightMm = Math.max(0, resolvedProfileLowerYmm - resolvedProfileTopMarginMm);
    topMarginMm = resolvedProfileTopMarginMm;
    bottomMarginMm = Math.max(0, resolvedTotalHeightMm - resolvedProfileLowerYmm);
  } else if (Number.isFinite(totalHeightMm)) {
    bodyShellHeightMm = Math.min(Math.max(0, resolvedBodyShellHeightMm), resolvedTotalHeightMm);
    bodyTopFromOverallMm = explicitTopMarginMm ?? Math.max(0, (resolvedTotalHeightMm - bodyShellHeightMm) / 2);
    bodyBottomFromOverallMm = Math.max(bodyTopFromOverallMm ?? 0, (bodyTopFromOverallMm ?? 0) + bodyShellHeightMm);
    topMarginMm = bodyTopFromOverallMm ?? 0;
    bottomMarginMm = Math.max(0, resolvedTotalHeightMm - (bodyBottomFromOverallMm ?? resolvedTotalHeightMm));
  }

  const printableSurface =
    getPrintableSurfaceResolutionFromDimensions(
      template.dimensions,
      template.dimensions.canonicalDimensionCalibration,
    ) ??
    buildPrintableSurfaceResolution({
      overallHeightMm: resolvedTotalHeightMm,
      bodyTopFromOverallMm: bodyTopFromOverallMm ?? 0,
      bodyBottomFromOverallMm: bodyBottomFromOverallMm ?? resolvedTotalHeightMm,
      lidSeamFromOverallMm: template.dimensions.lidSeamFromOverallMm,
      silverBandBottomFromOverallMm: template.dimensions.silverBandBottomFromOverallMm,
      printableTopOverrideMm: template.dimensions.printableTopOverrideMm,
      printableBottomOverrideMm: template.dimensions.printableBottomOverrideMm,
      handleKeepOutStartMm: template.dimensions.canonicalDimensionCalibration?.wrapMappingMm.handleKeepOutStartMm,
      handleKeepOutEndMm: template.dimensions.canonicalDimensionCalibration?.wrapMappingMm.handleKeepOutEndMm,
    });

  return computeEngravableDimensions({
    diameterMm: template.dimensions.diameterMm,
    printHeightMm: Math.max(0, bodyShellHeightMm),
    handleArcDeg,
    totalHeightMm,
    topMarginMm,
    bottomMarginMm,
    bodyTopFromOverallMm,
    bodyBottomFromOverallMm,
    printableSurfaceContract: printableSurface.printableSurfaceContract,
    axialSurfaceBands: printableSurface.axialSurfaceBands,
    automaticPrintableDetectionWeak: printableSurface.automaticDetectionWeak,
  });
}
