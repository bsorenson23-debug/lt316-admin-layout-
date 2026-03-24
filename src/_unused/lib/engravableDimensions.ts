import type { ProductTemplate } from "@/types/productTemplate";
import {
  findTumblerProfileIdForBrandModel,
  getTumblerProfileById,
  getProfileHandleArcDeg,
} from "@/data/tumblerProfiles";

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
}): EngravableDimensions {
  const d = opts.diameterMm;
  const r = d / 2;
  const circ = Math.PI * d;
  const engH = opts.printHeightMm;
  const totalH = opts.totalHeightMm ?? engH;
  const topMargin = opts.topMarginMm ?? (totalH - engH) / 2;
  const bottomMargin = Math.max(0, totalH - engH - topMargin);
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
    handleArcDeg: handleArc,
    handleWidthMm: handleWidth,
    printableArcDeg: printableArc,
    printableWidthMm: printableWidth,
    engravableOffsetY,
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

  return computeEngravableDimensions({
    diameterMm: template.dimensions.diameterMm,
    printHeightMm: template.dimensions.printHeightMm,
    handleArcDeg: handleArc,
    totalHeightMm: profile?.overallHeightMm,
    topMarginMm: profile?.guideBand?.upperGrooveYmm,
  });
}
