export interface RotaryPreviewInput {
  templateWidthMm: number;
  rotaryCenterXmm: number;
  rotaryTopYmm: number;
  topAnchorOffsetMm: number;
}

export interface RotaryPreviewValues {
  effectiveTopAnchorYmm: number;
  exportOriginXmm: number;
  exportOriginYmm: number;
}

import { round4 } from "./geometry.ts";

export function buildRotaryPlacementPreview(
  input: RotaryPreviewInput
): RotaryPreviewValues {
  const effectiveTopAnchorYmm = input.rotaryTopYmm + input.topAnchorOffsetMm;
  return {
    effectiveTopAnchorYmm: round4(effectiveTopAnchorYmm),
    exportOriginXmm: round4(input.rotaryCenterXmm - input.templateWidthMm / 2),
    exportOriginYmm: round4(effectiveTopAnchorYmm),
  };
}
