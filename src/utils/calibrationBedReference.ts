import type { BedOrigin } from "../types/export.ts";
import { mapBedMmToCanvasPercent } from "./staggeredBedPattern.ts";

export type RotaryCalibrationOverlay = {
  showHoleGrid: boolean;
  showCenterline: boolean;
  showOrigin: boolean;
  showRotaryCenterline: boolean;
  showTopAnchorLine: boolean;
  showLensFieldOutline: boolean;
  showMountFootprint: boolean;
  showExportPreview: boolean;
};

export type CalibrationOverlayToggles = RotaryCalibrationOverlay;
export type CalibrationOverlayKey = keyof RotaryCalibrationOverlay;

export interface CalibrationBedOverlayInput {
  bedWidthMm: number;
  bedHeightMm: number;
  rotaryCenterXmm: number;
  topAnchorYmm: number;
  lensInsetMm: number;
  bedOrigin: BedOrigin;
}

export interface CalibrationBedOverlayMetrics {
  bedCenterXPercent: number;
  bedCenterYPercent: number;
  rotaryCenterXPercent: number;
  topAnchorYPercent: number;
  originXPercent: number;
  originYPercent: number;
  lensInsetXPercent: number;
  lensInsetYPercent: number;
  lensWidthPercent: number;
  lensHeightPercent: number;
}

export const DEFAULT_CALIBRATION_OVERLAY_TOGGLES: CalibrationOverlayToggles = {
  showHoleGrid: true,
  showCenterline: true,
  showOrigin: true,
  showRotaryCenterline: true,
  showTopAnchorLine: true,
  showLensFieldOutline: false,
  showMountFootprint: false,
  showExportPreview: true,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveOriginPercent(origin: BedOrigin): { x: number; y: number } {
  switch (origin) {
    case "top-right":
      return { x: 100, y: 0 };
    case "bottom-left":
      return { x: 0, y: 100 };
    case "bottom-right":
      return { x: 100, y: 100 };
    case "top-left":
    default:
      return { x: 0, y: 0 };
  }
}

export function isCalibrationOverlayVisible(
  toggles: CalibrationOverlayToggles,
  key: CalibrationOverlayKey
): boolean {
  return toggles[key];
}

export function buildCalibrationBedOverlayMetrics(
  input: CalibrationBedOverlayInput
): CalibrationBedOverlayMetrics {
  const safeWidth = Math.max(1, input.bedWidthMm);
  const safeHeight = Math.max(1, input.bedHeightMm);
  const maxInset = Math.min(safeWidth / 2, safeHeight / 2);
  const insetMm = clamp(input.lensInsetMm, 0, maxInset);
  const origin = resolveOriginPercent(input.bedOrigin);

  const rotary = mapBedMmToCanvasPercent(input.rotaryCenterXmm, 0, {
    widthMm: safeWidth,
    heightMm: safeHeight,
  });
  const topAnchor = mapBedMmToCanvasPercent(0, input.topAnchorYmm, {
    widthMm: safeWidth,
    heightMm: safeHeight,
  });
  const lensInset = mapBedMmToCanvasPercent(insetMm, insetMm, {
    widthMm: safeWidth,
    heightMm: safeHeight,
  });
  const lensSize = mapBedMmToCanvasPercent(
    safeWidth - insetMm * 2,
    safeHeight - insetMm * 2,
    {
      widthMm: safeWidth,
      heightMm: safeHeight,
    }
  );

  return {
    bedCenterXPercent: 50,
    bedCenterYPercent: 50,
    rotaryCenterXPercent: clamp(rotary.xPercent, 0, 100),
    topAnchorYPercent: clamp(topAnchor.yPercent, 0, 100),
    originXPercent: origin.x,
    originYPercent: origin.y,
    lensInsetXPercent: clamp(lensInset.xPercent, 0, 100),
    lensInsetYPercent: clamp(lensInset.yPercent, 0, 100),
    lensWidthPercent: clamp(lensSize.xPercent, 0, 100),
    lensHeightPercent: clamp(lensSize.yPercent, 0, 100),
  };
}
