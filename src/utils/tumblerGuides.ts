import type { BedConfig, TumblerGuideBand } from "../types/admin";
import { mmToPx } from "./geometry.ts";

function isFinitePositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function getActiveTumblerGuideBand(
  bedConfig: Pick<BedConfig, "workspaceMode" | "tumblerGuideBand">
): TumblerGuideBand | null {
  if (bedConfig.workspaceMode !== "tumbler-wrap") return null;
  const band = bedConfig.tumblerGuideBand;
  if (!band) return null;
  if (!isFinitePositive(band.upperGrooveYmm) || !isFinitePositive(band.lowerGrooveYmm)) {
    return null;
  }
  if (band.lowerGrooveYmm <= band.upperGrooveYmm) return null;
  return band;
}

export function shouldRenderTumblerGuideBand(
  bedConfig: Pick<
    BedConfig,
    "workspaceMode" | "tumblerGuideBand" | "showTumblerGuideBand"
  >
): boolean {
  return Boolean(bedConfig.showTumblerGuideBand && getActiveTumblerGuideBand(bedConfig));
}

export function getGuideBandMetrics(
  band: Pick<TumblerGuideBand, "upperGrooveYmm" | "lowerGrooveYmm">
): { bandCenterYmm: number; bandHeightMm: number } {
  const bandCenterYmm = (band.upperGrooveYmm + band.lowerGrooveYmm) / 2;
  const bandHeightMm = band.lowerGrooveYmm - band.upperGrooveYmm;
  return {
    bandCenterYmm,
    bandHeightMm,
  };
}

export function getGrooveGuideOverlayMetrics(args: {
  bedWidthMm: number;
  scale: number;
  band: Pick<TumblerGuideBand, "upperGrooveYmm" | "lowerGrooveYmm">;
}): {
  widthPx: number;
  upperYpx: number;
  lowerYpx: number;
  bandHeightPx: number;
} {
  const widthPx = mmToPx(args.bedWidthMm, args.scale);
  const upperYpx = mmToPx(args.band.upperGrooveYmm, args.scale);
  const lowerYpx = mmToPx(args.band.lowerGrooveYmm, args.scale);
  const bandHeightPx = Math.max(0, lowerYpx - upperYpx);
  return {
    widthPx,
    upperYpx,
    lowerYpx,
    bandHeightPx,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function computeCenteredItemYBetweenGuides(args: {
  itemHeightMm: number;
  workspaceHeightMm: number;
  band: Pick<TumblerGuideBand, "upperGrooveYmm" | "lowerGrooveYmm">;
}): number {
  const { bandCenterYmm } = getGuideBandMetrics(args.band);
  const rawY = bandCenterYmm - args.itemHeightMm / 2;
  const maxY = Math.max(0, args.workspaceHeightMm - args.itemHeightMm);
  return clamp(rawY, 0, maxY);
}

export function centerArtworkBetweenGrooves(args: {
  currentYmm: number;
  itemHeightMm: number;
  workspaceHeightMm: number;
  band: Pick<TumblerGuideBand, "upperGrooveYmm" | "lowerGrooveYmm">;
}): {
  yMm: number;
  bandCenterYmm: number;
  previousCenterYmm: number;
  nextCenterYmm: number;
} {
  const { bandCenterYmm } = getGuideBandMetrics(args.band);
  const yMm = computeCenteredItemYBetweenGuides({
    itemHeightMm: args.itemHeightMm,
    workspaceHeightMm: args.workspaceHeightMm,
    band: args.band,
  });
  return {
    yMm,
    bandCenterYmm,
    previousCenterYmm: args.currentYmm + args.itemHeightMm / 2,
    nextCenterYmm: yMm + args.itemHeightMm / 2,
  };
}
