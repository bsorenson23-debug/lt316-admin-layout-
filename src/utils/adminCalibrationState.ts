import { getDefaultRotaryPresetSeeds } from "../data/rotaryPlacementPresets.ts";
import { DEFAULT_BED_CONFIG } from "../types/admin.ts";
import type {
  BedOrigin,
  RotaryPlacementPreset,
  RotaryPresetFamily,
  RotaryMountBoltSize,
  RotaryMountReferenceMode,
} from "../types/export.ts";
import { getBedCenterXmm } from "./rotaryCenter.ts";

const CALIBRATION_VISIBILITY_KEY = "lt316.admin.calibration.visible";
const ROTARY_PRESETS_KEY = "lt316.admin.calibration.rotaryPresets";
const DEFAULT_BED_CENTER_X_MM = getBedCenterXmm(DEFAULT_BED_CONFIG.flatWidth);
const SEEDED_ROTARY_PRESET_IDS = new Set(
  getDefaultRotaryPresetSeeds(DEFAULT_BED_CONFIG.flatWidth).map((preset) => preset.id)
);

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function cloneDefaultPresets(): RotaryPlacementPreset[] {
  return getDefaultRotaryPresetSeeds(DEFAULT_BED_CONFIG.flatWidth).map((preset) => ({
    ...preset,
  }));
}

function getSeedPresetById(
  presetId: string,
  bedWidthMm: number = DEFAULT_BED_CONFIG.flatWidth
): RotaryPlacementPreset | null {
  return (
    getDefaultRotaryPresetSeeds(bedWidthMm).find((preset) => preset.id === presetId) ?? null
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function asOptionalMm(value: unknown): number | undefined {
  if (!isFiniteNumber(value) || value < 0) return undefined;
  return value;
}

function normalizeBedOrigin(value: unknown): BedOrigin {
  if (
    value === "top-left" ||
    value === "top-right" ||
    value === "bottom-left" ||
    value === "bottom-right"
  ) {
    return value;
  }
  return "top-left";
}

function normalizeFamily(value: unknown, presetId: string): RotaryPresetFamily {
  if (
    value === "rotoboss-talon" ||
    value === "d80c" ||
    value === "d100c" ||
    value === "custom"
  ) {
    return value;
  }

  if (presetId === "d80c-chuck") return "d80c";
  if (presetId === "d100c-chuck") return "d100c";
  if (presetId === "rotoboss-talon") return "rotoboss-talon";
  return "custom";
}

function normalizeMountBoltSize(value: unknown): RotaryMountBoltSize | undefined {
  if (value === "M6" || value === "unknown") return value;
  return undefined;
}

function normalizeMountReferenceMode(
  value: unknown,
  family: RotaryPresetFamily
): RotaryMountReferenceMode {
  if (
    value === "axis-center" ||
    value === "front-left-bolt" ||
    value === "front-edge-center" ||
    value === "custom"
  ) {
    return value;
  }
  return family === "custom" ? "custom" : "axis-center";
}

function normalizePreset(
  input: unknown,
  bedCenterXmm: number = DEFAULT_BED_CENTER_X_MM
): RotaryPlacementPreset | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Partial<RotaryPlacementPreset>;
  if (typeof value.id !== "string" || typeof value.name !== "string") return null;

  const centerXmm =
    asOptionalMm(value.rotaryCenterXmm) ??
    asOptionalMm(value.axisCenterXmm) ??
    bedCenterXmm;

  const family = normalizeFamily(value.family, value.id);

  return {
    ...value,
    id: value.id,
    name: value.name,
    family,
    mountPatternXmm: asOptionalMm(value.mountPatternXmm),
    mountPatternYmm: asOptionalMm(value.mountPatternYmm),
    mountBoltSize: normalizeMountBoltSize(value.mountBoltSize),
    axisHeightMm: asOptionalMm(value.axisHeightMm),
    bedOrigin: normalizeBedOrigin(value.bedOrigin),
    rotaryCenterXmm: centerXmm,
    axisCenterXmm: centerXmm,
    rotaryTopYmm: asOptionalMm(value.rotaryTopYmm),
    chuckOrRoller: value.chuckOrRoller === "roller" ? "roller" : "chuck",
    mountReferenceMode: normalizeMountReferenceMode(
      value.mountReferenceMode,
      family
    ),
    notes: typeof value.notes === "string" && value.notes.trim() ? value.notes : undefined,
  };
}

function parsePresets(raw: string | null): RotaryPlacementPreset[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    if (parsed.length === 0) return [];
    const normalized = parsed
      .map((preset) => normalizePreset(preset))
      .filter((preset): preset is RotaryPlacementPreset => preset !== null);
    return normalized.length === parsed.length ? normalized : null;
  } catch {
    return null;
  }
}

function persistPresets(
  presets: RotaryPlacementPreset[],
  storage: StorageLike | null
): RotaryPlacementPreset[] {
  const next = presets.map((preset) => normalizePreset(preset) ?? { ...preset });
  if (storage) {
    storage.setItem(ROTARY_PRESETS_KEY, JSON.stringify(next));
  }
  return next;
}

function createPresetId(): string {
  return `rotary-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function getCalibrationToolsVisible(
  storage: StorageLike | null = getBrowserStorage()
): boolean {
  if (!storage) return false;
  return storage.getItem(CALIBRATION_VISIBILITY_KEY) === "1";
}

export function setCalibrationToolsVisible(
  visible: boolean,
  storage: StorageLike | null = getBrowserStorage()
): void {
  if (!storage) return;
  if (visible) {
    storage.setItem(CALIBRATION_VISIBILITY_KEY, "1");
  } else {
    storage.removeItem(CALIBRATION_VISIBILITY_KEY);
  }
}

export function getRotaryPresets(
  storage: StorageLike | null = getBrowserStorage()
): RotaryPlacementPreset[] {
  if (!storage) return cloneDefaultPresets();
  const parsed = parsePresets(storage.getItem(ROTARY_PRESETS_KEY));
  if (!parsed) return cloneDefaultPresets();
  return parsed.map((preset) => ({ ...preset }));
}

export function saveRotaryPreset(
  preset: Omit<RotaryPlacementPreset, "id">,
  storage: StorageLike | null = getBrowserStorage()
): RotaryPlacementPreset[] {
  const current = getRotaryPresets(storage);
  const created = normalizePreset({
    ...preset,
    id: createPresetId(),
  });
  if (!created) return current;
  return persistPresets([...current, created], storage);
}

export function saveRotaryPresetAsCustom(
  preset: Omit<RotaryPlacementPreset, "id">,
  storage: StorageLike | null = getBrowserStorage()
): RotaryPlacementPreset[] {
  const normalized: Omit<RotaryPlacementPreset, "id"> = {
    ...preset,
    family: "custom",
    name: preset.name.trim() || "Custom Rotary Preset",
  };
  return saveRotaryPreset(normalized, storage);
}

export function updateRotaryPreset(
  presetId: string,
  patch: Partial<Omit<RotaryPlacementPreset, "id">>,
  storage: StorageLike | null = getBrowserStorage()
): RotaryPlacementPreset[] {
  const current = getRotaryPresets(storage);
  const next = current.map((preset) => {
    if (preset.id !== presetId) return preset;
    return normalizePreset({ ...preset, ...patch }) ?? preset;
  });
  return persistPresets(next, storage);
}

export function resolvePresetMountDetails(
  preset: RotaryPlacementPreset
): {
  family: RotaryPresetFamily;
  mountPatternXmm?: number;
  mountPatternYmm?: number;
  mountBoltSize?: RotaryMountBoltSize;
  axisHeightMm?: number;
  mountReferenceMode: RotaryMountReferenceMode;
} {
  const normalized = normalizePreset(preset) ?? preset;
  return {
    family: normalized.family ?? "custom",
    mountPatternXmm: normalized.mountPatternXmm,
    mountPatternYmm: normalized.mountPatternYmm,
    mountBoltSize: normalized.mountBoltSize,
    axisHeightMm: normalized.axisHeightMm,
    mountReferenceMode: normalized.mountReferenceMode ?? "custom",
  };
}

export function withResolvedPresetCenter(
  preset: RotaryPlacementPreset,
  bedCenterXmm: number = DEFAULT_BED_CENTER_X_MM
): RotaryPlacementPreset {
  return (
    normalizePreset(preset, bedCenterXmm) ?? {
      ...preset,
      rotaryCenterXmm: bedCenterXmm,
      axisCenterXmm: bedCenterXmm,
    }
  );
}

export function deleteRotaryPreset(
  presetId: string,
  storage: StorageLike | null = getBrowserStorage()
): RotaryPlacementPreset[] {
  const current = getRotaryPresets(storage);
  const next = current.filter((preset) => preset.id !== presetId);
  return persistPresets(next, storage);
}

export function isSeededRotaryPresetId(presetId: string): boolean {
  return SEEDED_ROTARY_PRESET_IDS.has(presetId);
}

export function resetRotaryPresetToDefault(
  presetId: string,
  storage: StorageLike | null = getBrowserStorage()
): RotaryPlacementPreset[] {
  const seedPreset = getSeedPresetById(presetId);
  if (!seedPreset) {
    return getRotaryPresets(storage);
  }

  const current = getRotaryPresets(storage);
  const index = current.findIndex((preset) => preset.id === presetId);
  if (index === -1) {
    return persistPresets([...current, seedPreset], storage);
  }

  const next = [...current];
  next[index] = seedPreset;
  return persistPresets(next, storage);
}
