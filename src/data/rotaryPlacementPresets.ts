import { DEFAULT_BED_CONFIG } from "../types/admin.ts";
import type { RotaryPlacementPreset } from "../types/export";
import { getBedCenterXmm } from "../utils/rotaryCenter.ts";

export function getDefaultRotaryPresetSeeds(
  bedWidthMm: number = DEFAULT_BED_CONFIG.flatWidth
): RotaryPlacementPreset[] {
  const bedCenterXmm = getBedCenterXmm(bedWidthMm);

  return [
    {
      id: "d80c-chuck",
      name: "D80C Chuck Rotary",
      family: "d80c",
      mountPatternXmm: 75,
      mountPatternYmm: 100,
      mountBoltSize: "M6",
      axisHeightMm: 129,
      axisCenterXmm: bedCenterXmm,
      bedOrigin: "top-left",
      rotaryCenterXmm: bedCenterXmm,
      chuckOrRoller: "chuck",
      mountReferenceMode: "front-left-bolt",
      referenceToAxisOffsetXmm: 37.5,
      referenceToAxisOffsetYmm: 50,
      baseVisualWidthMm: 128,
      baseVisualDepthMm: 164,
      mountHoleOffsetsMm: [
        { id: "front-left", xMm: 26.5, yMm: 32 },
        { id: "front-right", xMm: 101.5, yMm: 32 },
        { id: "rear-left", xMm: 26.5, yMm: 132 },
        { id: "rear-right", xMm: 101.5, yMm: 132 },
      ],
      anchorReferencePointMm: {
        xMm: 26.5,
        yMm: 32,
        label: "Anchor reference",
      },
      notes: "Default axis centered on bed. Top anchor should be calibrated on machine.",
    },
    {
      id: "d100c-chuck",
      name: "D100C Chuck Rotary",
      family: "d100c",
      mountPatternXmm: 75,
      mountPatternYmm: 100,
      mountBoltSize: "M6",
      axisHeightMm: 129,
      axisCenterXmm: bedCenterXmm,
      bedOrigin: "top-left",
      rotaryCenterXmm: bedCenterXmm,
      chuckOrRoller: "chuck",
      mountReferenceMode: "front-left-bolt",
      referenceToAxisOffsetXmm: 37.5,
      referenceToAxisOffsetYmm: 50,
      baseVisualWidthMm: 140,
      baseVisualDepthMm: 176,
      mountHoleOffsetsMm: [
        { id: "front-left", xMm: 32.5, yMm: 38 },
        { id: "front-right", xMm: 107.5, yMm: 38 },
        { id: "rear-left", xMm: 32.5, yMm: 138 },
        { id: "rear-right", xMm: 107.5, yMm: 138 },
      ],
      anchorReferencePointMm: {
        xMm: 32.5,
        yMm: 38,
        label: "Anchor reference",
      },
      notes: "Default axis centered on bed. Top anchor should be calibrated on machine.",
    },
    {
      id: "rotoboss-talon",
      name: "RotoBoss Talon / Talon Pro",
      family: "rotoboss-talon",
      mountBoltSize: "unknown",
      axisCenterXmm: bedCenterXmm,
      bedOrigin: "top-left",
      rotaryCenterXmm: bedCenterXmm,
      chuckOrRoller: "chuck",
      mountReferenceMode: "custom",
      baseVisualWidthMm: 136,
      baseVisualDepthMm: 188,
      anchorReferencePointMm: {
        xMm: 30,
        yMm: 34,
        label: "Measured anchor",
      },
      baseVisualPlaceholder: true,
      notes: "Public bolt footprint not verified. Use machine-specific measured values.",
    },
  ];
}

export const DEFAULT_ROTARY_PLACEMENT_PRESETS: RotaryPlacementPreset[] =
  getDefaultRotaryPresetSeeds();

export function getRotaryPlacementPresetById(
  presetId: string
): RotaryPlacementPreset | null {
  return (
    DEFAULT_ROTARY_PLACEMENT_PRESETS.find((preset) => preset.id === presetId) ??
    null
  );
}
