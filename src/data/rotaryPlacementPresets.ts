import type { RotaryPlacementPreset } from "../types/export";

export const DEFAULT_ROTARY_PLACEMENT_PRESETS: RotaryPlacementPreset[] = [
  {
    id: "roller-a-top-left",
    name: "Roller A (Top-left origin)",
    bedOrigin: "top-left",
    rotaryCenterXmm: 160,
    rotaryTopYmm: 24,
    chuckOrRoller: "roller",
    notes: "Standard roller jig with centerline marked at X=160 mm.",
  },
  {
    id: "chuck-a-top-left",
    name: "Chuck A (Top-left origin)",
    bedOrigin: "top-left",
    rotaryCenterXmm: 170,
    rotaryTopYmm: 18,
    chuckOrRoller: "chuck",
    notes: "Chuck mount with upper lip aligned to rotary top marker.",
  },
];

export function getRotaryPlacementPresetById(
  presetId: string
): RotaryPlacementPreset | null {
  return (
    DEFAULT_ROTARY_PLACEMENT_PRESETS.find((preset) => preset.id === presetId) ??
    null
  );
}
