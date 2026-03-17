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

function round4(value: number): number {
  return Number(value.toFixed(4));
}

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
