import type { BedOrigin } from "../types/export.ts";

export interface CalibrationOverlayToggles {
  bedCenterline: boolean;
  originMarker: boolean;
  rotaryCenterline: boolean;
  tumblerTopAnchorLine: boolean;
  lensFieldOutline: boolean;
}

export type CalibrationOverlayKey = keyof CalibrationOverlayToggles;

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
  bedCenterline: true,
  originMarker: true,
  rotaryCenterline: true,
  tumblerTopAnchorLine: true,
  lensFieldOutline: true,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toPercent(valueMm: number, sizeMm: number): number {
  if (sizeMm <= 0) return 0;
  return clamp((valueMm / sizeMm) * 100, 0, 100);
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

  return {
    bedCenterXPercent: 50,
    bedCenterYPercent: 50,
    rotaryCenterXPercent: toPercent(input.rotaryCenterXmm, safeWidth),
    topAnchorYPercent: toPercent(input.topAnchorYmm, safeHeight),
    originXPercent: origin.x,
    originYPercent: origin.y,
    lensInsetXPercent: toPercent(insetMm, safeWidth),
    lensInsetYPercent: toPercent(insetMm, safeHeight),
    lensWidthPercent: toPercent(safeWidth - insetMm * 2, safeWidth),
    lensHeightPercent: toPercent(safeHeight - insetMm * 2, safeHeight),
  };
}
