import type {
  BedOrigin,
  RotaryDriveType,
  RotaryMountBoltSize,
  RotaryMountReferenceMode,
  RotaryPlacementPreset,
  RotaryPresetFamily,
} from "../types/export.ts";

export const CUSTOM_ROTARY_PRESET_ID = "custom";

export interface RotaryModeDraft {
  name: string;
  family: RotaryPresetFamily;
  mountPatternXmm: string;
  mountPatternYmm: string;
  mountBoltSize: RotaryMountBoltSize;
  axisHeightMm: string;
  rotaryCenterXmm: string;
  rotaryTopYmm: string;
  referenceToAxisOffsetXmm: string;
  referenceToAxisOffsetYmm: string;
  chuckOrRoller: RotaryDriveType;
  mountReferenceMode: RotaryMountReferenceMode;
  bedOrigin: BedOrigin;
  notes: string;
}

function parseNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDraftNumber(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return String(value);
}

export function formatRotaryValue(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Measure on machine";
  }
  return `${value.toFixed(2)} mm`;
}

export function formatRotaryMountPattern(
  mountPatternXmm?: number | null,
  mountPatternYmm?: number | null
): string {
  const hasX = typeof mountPatternXmm === "number" && Number.isFinite(mountPatternXmm);
  const hasY = typeof mountPatternYmm === "number" && Number.isFinite(mountPatternYmm);
  if (!hasX || !hasY) return "Measure on machine";
  return `${mountPatternXmm} x ${mountPatternYmm} mm`;
}

export function buildRotaryDraftFromPreset(preset: RotaryPlacementPreset): RotaryModeDraft {
  return {
    name: preset.name,
    family: preset.family ?? "custom",
    mountPatternXmm: toDraftNumber(preset.mountPatternXmm),
    mountPatternYmm: toDraftNumber(preset.mountPatternYmm),
    mountBoltSize: preset.mountBoltSize ?? "unknown",
    axisHeightMm: toDraftNumber(preset.axisHeightMm),
    rotaryCenterXmm: toDraftNumber(preset.rotaryCenterXmm),
    rotaryTopYmm: toDraftNumber(preset.rotaryTopYmm),
    referenceToAxisOffsetXmm: toDraftNumber(preset.referenceToAxisOffsetXmm),
    referenceToAxisOffsetYmm: toDraftNumber(preset.referenceToAxisOffsetYmm),
    chuckOrRoller: preset.chuckOrRoller,
    mountReferenceMode: preset.mountReferenceMode ?? "axis-center",
    bedOrigin: preset.bedOrigin,
    notes: preset.notes ?? "",
  };
}

export function buildEmptyRotaryDraft(bedCenterXmm: number): RotaryModeDraft {
  return {
    name: "",
    family: "custom",
    mountPatternXmm: "",
    mountPatternYmm: "",
    mountBoltSize: "unknown",
    axisHeightMm: "",
    rotaryCenterXmm: String(bedCenterXmm),
    rotaryTopYmm: "",
    referenceToAxisOffsetXmm: "",
    referenceToAxisOffsetYmm: "",
    chuckOrRoller: "chuck",
    mountReferenceMode: "axis-center",
    bedOrigin: "top-left",
    notes: "",
  };
}

export function resolveMountFootprintFromDraft(draft: RotaryModeDraft): {
  widthMm: number;
  heightMm: number;
} | null {
  const widthMm = parseNullableNumber(draft.mountPatternXmm);
  const heightMm = parseNullableNumber(draft.mountPatternYmm);
  if (widthMm === null || heightMm === null) return null;
  if (widthMm <= 0 || heightMm <= 0) return null;
  return { widthMm, heightMm };
}

export function validateRotaryPresetDraft(
  draft: RotaryModeDraft
): { ok: true; value: Omit<RotaryPlacementPreset, "id"> } | { ok: false; error: string } {
  const name = draft.name.trim();
  if (!name) {
    return { ok: false, error: "Preset name is required." };
  }

  const rotaryCenterXmm = parseNullableNumber(draft.rotaryCenterXmm);
  if (rotaryCenterXmm === null || rotaryCenterXmm < 0) {
    return { ok: false, error: "Rotary Center X must be a valid non-negative mm value." };
  }

  const rotaryTopYmm = parseNullableNumber(draft.rotaryTopYmm);
  if (rotaryTopYmm !== null && rotaryTopYmm < 0) {
    return { ok: false, error: "Top Anchor Y must be a valid non-negative mm value." };
  }

  const mountPatternXmm = parseNullableNumber(draft.mountPatternXmm);
  if (mountPatternXmm !== null && mountPatternXmm < 0) {
    return { ok: false, error: "Mount Pattern X must be a valid non-negative mm value." };
  }

  const mountPatternYmm = parseNullableNumber(draft.mountPatternYmm);
  if (mountPatternYmm !== null && mountPatternYmm < 0) {
    return { ok: false, error: "Mount Pattern Y must be a valid non-negative mm value." };
  }

  const axisHeightMm = parseNullableNumber(draft.axisHeightMm);
  if (axisHeightMm !== null && axisHeightMm < 0) {
    return { ok: false, error: "Axis Height must be a valid non-negative mm value." };
  }

  const referenceToAxisOffsetXmm = parseNullableNumber(draft.referenceToAxisOffsetXmm);
  if (
    draft.referenceToAxisOffsetXmm.trim() &&
    referenceToAxisOffsetXmm === null
  ) {
    return {
      ok: false,
      error: "Reference to Axis Offset X must be a valid mm value.",
    };
  }

  const referenceToAxisOffsetYmm = parseNullableNumber(draft.referenceToAxisOffsetYmm);
  if (
    draft.referenceToAxisOffsetYmm.trim() &&
    referenceToAxisOffsetYmm === null
  ) {
    return {
      ok: false,
      error: "Reference to Axis Offset Y must be a valid mm value.",
    };
  }

  return {
    ok: true,
    value: {
      name,
      family: draft.family,
      mountPatternXmm: mountPatternXmm ?? undefined,
      mountPatternYmm: mountPatternYmm ?? undefined,
      mountBoltSize: draft.mountBoltSize,
      axisHeightMm: axisHeightMm ?? undefined,
      axisCenterXmm: rotaryCenterXmm,
      bedOrigin: draft.bedOrigin,
      rotaryCenterXmm,
      rotaryTopYmm: rotaryTopYmm ?? undefined,
      chuckOrRoller: draft.chuckOrRoller,
      mountReferenceMode: draft.mountReferenceMode,
      referenceToAxisOffsetXmm: referenceToAxisOffsetXmm ?? undefined,
      referenceToAxisOffsetYmm: referenceToAxisOffsetYmm ?? undefined,
      notes: draft.notes.trim() || undefined,
    },
  };
}

export function formatRotaryPresetReadout(args: {
  preset: RotaryPlacementPreset | null;
  draft: RotaryModeDraft;
  resolvedRotaryCenterXmm: number;
  resolvedRotaryTopYmm: number | null;
}): {
  presetName: string;
  family: RotaryPresetFamily;
  mountPattern: string;
  boltSize: string;
  axisHeight: string;
  axisCenterX: string;
  topAnchorY: string;
  referenceToAxisOffsetX: string;
  referenceToAxisOffsetY: string;
  rotaryType: RotaryDriveType;
  notes: string;
} {
  return {
    presetName: args.preset?.name ?? (args.draft.name.trim() || "Custom"),
    family: args.draft.family,
    mountPattern: formatRotaryMountPattern(
      parseNullableNumber(args.draft.mountPatternXmm),
      parseNullableNumber(args.draft.mountPatternYmm)
    ),
    boltSize: args.draft.mountBoltSize,
    axisHeight: formatRotaryValue(parseNullableNumber(args.draft.axisHeightMm)),
    axisCenterX: formatRotaryValue(args.resolvedRotaryCenterXmm),
    topAnchorY: formatRotaryValue(args.resolvedRotaryTopYmm),
    referenceToAxisOffsetX: formatRotaryValue(
      parseNullableNumber(args.draft.referenceToAxisOffsetXmm)
    ),
    referenceToAxisOffsetY: formatRotaryValue(
      parseNullableNumber(args.draft.referenceToAxisOffsetYmm)
    ),
    rotaryType: args.draft.chuckOrRoller,
    notes: args.draft.notes.trim() || "None",
  };
}
