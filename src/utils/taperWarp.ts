/**
 * taperWarp.ts
 *
 * Computes the horizontal scale correction needed to compensate for the
 * conical taper of a tumbler when engraving.
 *
 * Problem: the template width is computed from the AVERAGE diameter
 * (D_top + D_bot) / 2.  Artwork placed near the top of the template sits
 * on a circumference that is wider than D_avg, so it will appear compressed
 * horizontally.  Artwork near the base sits on a narrower circumference and
 * will appear stretched.  The taper warp correction pre-scales the artwork
 * so it engraves as intended.
 *
 * All diameters and Y positions are in mm.
 * Y=0 is the top of the printable zone (opening of the cup).
 * Y=templateHeight is the bottom (base of the cup).
 */

import type { BedConfig } from "@/types/admin";
import type { LightBurnExportItem } from "@/types/export";

// ---------------------------------------------------------------------------
// Eligibility check
// ---------------------------------------------------------------------------

export function isTaperWarpApplicable(bedConfig: BedConfig): boolean {
  if (bedConfig.workspaceMode !== "tumbler-wrap") return false;
  if (bedConfig.tumblerShapeType !== "tapered") return false;
  const top = bedConfig.tumblerTopDiameterMm;
  const bot = bedConfig.tumblerBottomDiameterMm;
  return (
    typeof top === "number" && Number.isFinite(top) && top > 0 &&
    typeof bot === "number" && Number.isFinite(bot) && bot > 0 &&
    Math.abs(top - bot) > 0.5 // ignore negligible taper (< 0.5 mm total delta)
  );
}

// ---------------------------------------------------------------------------
// Scale computation
// ---------------------------------------------------------------------------

/**
 * Returns the horizontal scale factor (scaleX) for artwork whose vertical
 * center sits at `itemYcenterMm` within the template.
 *
 * scaleX > 1 means the artwork needs to be made wider (near the top/opening).
 * scaleX < 1 means it needs to be narrower (near the base).
 */
export function computeTaperScaleX(
  itemYcenterMm: number,
  bedConfig: BedConfig,
): number {
  const topDiam = bedConfig.tumblerTopDiameterMm!;
  const botDiam = bedConfig.tumblerBottomDiameterMm!;
  const templateH = bedConfig.height;

  if (templateH <= 0) return 1;

  const avgDiam = (topDiam + botDiam) / 2;
  if (avgDiam <= 0) return 1;

  // Clamp Y center to template bounds
  const yClamped = Math.max(0, Math.min(templateH, itemYcenterMm));
  const yRel = yClamped / templateH; // 0 = top, 1 = bottom

  // Linear interpolation of diameter at this Y position
  const diamAtY = topDiam + (botDiam - topDiam) * yRel;

  return diamAtY / avgDiam;
}

// ---------------------------------------------------------------------------
// Apply to export item (in template space, before rotary offset is added)
// ---------------------------------------------------------------------------

/**
 * Returns a copy of `item` with `widthMm` and `xMm` adjusted for taper warp.
 *
 * The item is scaled horizontally about its center, preserving the midpoint X
 * position in template space.
 *
 * `itemYcenterTemplateMm` is the item's Y center in *template* coordinates
 * (not export/LightBurn coordinates), i.e. item.y + item.height / 2.
 */
export function applyTaperWarpToExportItem(
  item: LightBurnExportItem,
  itemYcenterTemplateMm: number,
  bedConfig: BedConfig,
): LightBurnExportItem {
  const scaleX = computeTaperScaleX(itemYcenterTemplateMm, bedConfig);
  if (Math.abs(scaleX - 1) < 0.001) return item; // negligible — skip

  const newWidth = item.widthMm * scaleX;
  const dx = (item.widthMm - newWidth) / 2; // shift right to keep center

  return {
    ...item,
    xMm: +(item.xMm + dx).toFixed(4),
    widthMm: +newWidth.toFixed(4),
  };
}
