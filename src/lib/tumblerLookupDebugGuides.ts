import type { TumblerItemLookupFitDebug } from "../types/tumblerItemLookup.ts";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export interface TumblerLookupMeasurementBandGuide {
  topPx: number;
  bottomPx: number;
  centerYPx: number;
  centerXPx: number;
  leftPx: number;
  rightPx: number;
  widthPx: number;
}

export interface TumblerLookupDebugGuideModel {
  measurementBand: TumblerLookupMeasurementBandGuide | null;
  engravingStartGuideYPx: number;
  showBottomBodyGuide: boolean;
  bottomBodyGuideYPx: number | null;
  caption: string;
}

export function buildTumblerLookupDebugGuideModel(
  debug: TumblerItemLookupFitDebug,
): TumblerLookupDebugGuideModel {
  const hasMeasurementBand =
    isFiniteNumber(debug.measurementBandTopPx) &&
    isFiniteNumber(debug.measurementBandBottomPx) &&
    isFiniteNumber(debug.measurementBandCenterYPx) &&
    isFiniteNumber(debug.measurementBandCenterXPx) &&
    isFiniteNumber(debug.measurementBandLeftPx) &&
    isFiniteNumber(debug.measurementBandRightPx) &&
    isFiniteNumber(debug.measurementBandWidthPx);
  const hasBaseBandGuide =
    isFiniteNumber(debug.baseBandTopPx) &&
    isFiniteNumber(debug.baseBandBottomPx) &&
    debug.baseBandBottomPx > debug.baseBandTopPx;

  return {
    measurementBand: hasMeasurementBand
      ? {
          topPx: debug.measurementBandTopPx!,
          bottomPx: debug.measurementBandBottomPx!,
          centerYPx: debug.measurementBandCenterYPx!,
          centerXPx: debug.measurementBandCenterXPx!,
          leftPx: debug.measurementBandLeftPx!,
          rightPx: debug.measurementBandRightPx!,
          widthPx: debug.measurementBandWidthPx!,
        }
      : null,
    engravingStartGuideYPx: isFiniteNumber(debug.engravingStartGuidePx)
      ? debug.engravingStartGuidePx
      : debug.referenceBandCenterYPx,
    showBottomBodyGuide: hasBaseBandGuide,
    bottomBodyGuideYPx: hasBaseBandGuide ? debug.baseBandTopPx! : null,
    caption: hasBaseBandGuide
      ? "Rim split, engravable start guide, diameter measurement band, and detected bottom base ring guide."
      : "Rim split, engravable start guide, and diameter measurement band. Bottom body extent is profile context only, not a silver-ring guide.",
  };
}
