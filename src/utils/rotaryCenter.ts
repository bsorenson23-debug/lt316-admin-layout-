import { isFiniteNumber } from "./guards.ts";

export function getBedCenterXmm(bedWidthMm: number | null | undefined): number {
  if (!isFiniteNumber(bedWidthMm) || bedWidthMm <= 0) return 0;
  return Number((bedWidthMm / 2).toFixed(4));
}

export function resolveRotaryCenterXmm(args: {
  selectedPresetRotaryCenterXmm?: number | null;
  manualRotaryCenterXmm?: number | null;
  bedWidthMm: number | null | undefined;
  preferManualOverride?: boolean;
}): number {
  const presetCenter = isFiniteNumber(args.selectedPresetRotaryCenterXmm)
    ? args.selectedPresetRotaryCenterXmm
    : undefined;
  const manualCenter = isFiniteNumber(args.manualRotaryCenterXmm)
    ? args.manualRotaryCenterXmm
    : undefined;
  const bedCenter = getBedCenterXmm(args.bedWidthMm);

  if (args.preferManualOverride) {
    return Number((manualCenter ?? presetCenter ?? bedCenter).toFixed(4));
  }
  return Number((presetCenter ?? manualCenter ?? bedCenter).toFixed(4));
}
