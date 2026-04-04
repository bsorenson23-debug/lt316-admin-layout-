import type { ProductTemplate } from "../types/productTemplate.ts";
import {
  findTumblerProfileIdForBrandModel,
  getTumblerProfileById,
  getProfileHandleArcDeg,
} from "../data/tumblerProfiles.ts";
import type { TumblerItemLookupFitDebug } from "../types/tumblerItemLookup.ts";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface EngravableDimensions {
  /** Outside diameter from template/profile (mm) */
  diameterMm: number;
  /** diameter / 2 */
  radiusMm: number;
  /** π × diameter */
  circumferenceMm: number;
  /** Full tumbler height — from profile or estimated (mm) */
  totalHeightMm: number;
  /** Top non-engravable margin — lid seat / rim (mm) */
  topMarginMm: number;
  /** Bottom non-engravable margin — base taper (mm) */
  bottomMarginMm: number;
  /** Engravable zone height = printHeightMm from template (mm) */
  engravableHeightMm: number;
  /** Legacy alias for the body/engravable zone top measured from the overall top. */
  bodyTopOffsetMm: number;
  /** Legacy alias for the body/engravable zone bottom measured from the overall top. */
  bodyBottomOffsetMm: number;
  /** Handle exclusion arc (degrees, 0 = no handle) */
  handleArcDeg: number;
  /** Physical handle width on the surface (mm) */
  handleWidthMm: number;
  /** 360 - handleArcDeg */
  printableArcDeg: number;
  /** Printable wrap width = (printableArcDeg / 360) × circumference (mm) */
  printableWidthMm: number;
  /**
   * Y offset of the engravable zone center from the mesh center (mm).
   * Positive = zone is higher than mesh center.
   * Zero when margins are symmetric (e.g. YETI Rambler 40oz).
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

/**
 * Compute engravable dimensions from raw values.
 *
 * @param opts.totalHeightMm   Total mesh or tumbler height. If omitted,
 *                              defaults to printHeightMm (no margins).
 * @param opts.topMarginMm     Top non-engravable margin. If omitted,
 *                              margins are split evenly.
 */
export function computeEngravableDimensions(opts: {
  diameterMm: number;
  printHeightMm: number;
  handleArcDeg: number;
  totalHeightMm?: number;
  topMarginMm?: number;
  bottomMarginMm?: number;
}): EngravableDimensions {
  const d = opts.diameterMm;
  const r = d / 2;
  const circ = Math.PI * d;
  const totalH = opts.totalHeightMm ?? opts.printHeightMm;

  let engH = Math.max(0, opts.printHeightMm);
  let topMargin = opts.topMarginMm ?? 0;
  let bottomMargin = opts.bottomMarginMm ?? 0;

  if (Number.isFinite(opts.topMarginMm) && Number.isFinite(opts.bottomMarginMm)) {
    topMargin = Math.max(0, opts.topMarginMm ?? 0);
    bottomMargin = Math.max(0, opts.bottomMarginMm ?? 0);
    engH = Math.max(0, totalH - topMargin - bottomMargin);
  } else if (Number.isFinite(opts.topMarginMm)) {
    topMargin = Math.max(0, opts.topMarginMm ?? 0);
    engH = Math.min(engH, Math.max(0, totalH - topMargin));
    bottomMargin = Math.max(0, totalH - engH - topMargin);
  } else if (Number.isFinite(opts.bottomMarginMm)) {
    bottomMargin = Math.max(0, opts.bottomMarginMm ?? 0);
    engH = Math.min(engH, Math.max(0, totalH - bottomMargin));
    topMargin = Math.max(0, totalH - engH - bottomMargin);
  } else {
    topMargin = Math.max(0, (totalH - engH) / 2);
    bottomMargin = Math.max(0, totalH - engH - topMargin);
  }

  const handleArc = opts.handleArcDeg;
  const handleWidth = (handleArc / 360) * circ;
  const printableArc = 360 - handleArc;
  const printableWidth = (printableArc / 360) * circ;

  // Mesh is bbox-centered at Y=0, so meshTop = totalH / 2.
  // Engravable zone top = meshTop − topMargin = totalH/2 − topMargin
  // Engravable zone center = engravableTop − engH/2
  const engravableOffsetY = totalH / 2 - topMargin - engH / 2;

  return {
    diameterMm: d,
    radiusMm: r,
    circumferenceMm: circ,
    totalHeightMm: totalH,
    topMarginMm: topMargin,
    bottomMarginMm: bottomMargin,
    engravableHeightMm: engH,
    bodyTopOffsetMm: topMargin,
    bodyBottomOffsetMm: totalH - bottomMargin,
    handleArcDeg: handleArc,
    handleWidthMm: handleWidth,
    printableArcDeg: printableArc,
    printableWidthMm: printableWidth,
    engravableOffsetY,
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

/**
 * Compute engravable dimensions from a ProductTemplate.
 * Looks up the tumbler profile for total height and groove data.
 */
export function getEngravableDimensions(
  template: ProductTemplate,
): EngravableDimensions {
  const profileId = findTumblerProfileIdForBrandModel({
    brand: template.brand,
    model: template.name,
    capacityOz: template.capacity ? parseInt(template.capacity, 10) : undefined,
  });
  const profile = profileId ? getTumblerProfileById(profileId) : null;

  const handleArc = template.dimensions.handleArcDeg > 0
    ? template.dimensions.handleArcDeg
    : getProfileHandleArcDeg(profile);

  const explicitTotalH = template.dimensions.overallHeightMm;
  const explicitPrintH = template.dimensions.printHeightMm;
  const explicitTopM = template.dimensions.topMarginMm;
  const explicitBottomM = template.dimensions.bottomMarginMm;
  const profileTotalH = profile?.overallHeightMm;
  const profileUsableH = profile?.usableHeightMm;
  const profileTopM = profile?.guideBand?.upperGrooveYmm;
  const profileLowerY = profile?.guideBand?.lowerGrooveYmm;

  const totalH = explicitTotalH ?? profileTotalH ?? explicitPrintH;
  const resolvedTotalH = totalH ?? 0;
  const resolvedPrintH = explicitPrintH ?? 0;
  const resolvedProfileTopM = profileTopM ?? 0;
  const resolvedProfileLowerY = profileLowerY ?? resolvedTotalH;
  const resolvedProfileUsableH = profileUsableH ?? resolvedTotalH;

  let printHeightMm = explicitPrintH;
  let topMarginMm = explicitTopM;
  let bottomMarginMm = explicitBottomM;

  if (Number.isFinite(explicitTopM) && Number.isFinite(explicitBottomM) && Number.isFinite(totalH)) {
    printHeightMm = Math.max(0, resolvedTotalH - (explicitTopM ?? 0) - (explicitBottomM ?? 0));
  } else if (
    Number.isFinite(profileUsableH) &&
    Number.isFinite(totalH) &&
    (resolvedPrintH <= 0 || resolvedPrintH > resolvedTotalH + 0.5 || resolvedPrintH === resolvedTotalH)
  ) {
    printHeightMm = Math.min(resolvedProfileUsableH, resolvedTotalH);
    topMarginMm = explicitTopM ?? profileTopM ?? Math.max(0, (resolvedTotalH - printHeightMm) / 2);
    bottomMarginMm = explicitBottomM ?? Math.max(0, resolvedTotalH - printHeightMm - (topMarginMm ?? 0));
  } else if (
    Number.isFinite(profileTopM) &&
    Number.isFinite(profileLowerY) &&
    Number.isFinite(totalH) &&
    (resolvedPrintH <= 0 || (explicitTopM ?? resolvedProfileTopM) + resolvedPrintH > resolvedTotalH + 0.5)
  ) {
    topMarginMm = resolvedProfileTopM;
    bottomMarginMm = Math.max(0, resolvedTotalH - resolvedProfileLowerY);
    printHeightMm = Math.max(0, resolvedProfileLowerY - resolvedProfileTopM);
  } else if (Number.isFinite(totalH)) {
    printHeightMm = Math.min(Math.max(0, resolvedPrintH), resolvedTotalH);
    topMarginMm = explicitTopM ?? Math.max(0, (resolvedTotalH - printHeightMm) / 2);
    bottomMarginMm = explicitBottomM ?? Math.max(0, resolvedTotalH - printHeightMm - (topMarginMm ?? 0));
  }

  return computeEngravableDimensions({
    diameterMm: template.dimensions.diameterMm,
    printHeightMm,
    handleArcDeg: handleArc,
    totalHeightMm: totalH,
    topMarginMm,
    bottomMarginMm,
  });
}
