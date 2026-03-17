import { DEFAULT_ROTARY_PLACEMENT_PRESETS } from "../data/rotaryPlacementPresets.ts";
import type { RotaryPlacementPreset } from "../types/export.ts";

const CALIBRATION_VISIBILITY_KEY = "lt316.admin.calibration.visible";
const ROTARY_PRESETS_KEY = "lt316.admin.calibration.rotaryPresets";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function cloneDefaultPresets(): RotaryPlacementPreset[] {
  return DEFAULT_ROTARY_PLACEMENT_PRESETS.map((preset) => ({ ...preset }));
}

function isValidPreset(input: unknown): input is RotaryPlacementPreset {
  if (!input || typeof input !== "object") return false;
  const value = input as Partial<RotaryPlacementPreset>;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.rotaryCenterXmm === "number" &&
    Number.isFinite(value.rotaryCenterXmm) &&
    typeof value.rotaryTopYmm === "number" &&
    Number.isFinite(value.rotaryTopYmm) &&
    (value.chuckOrRoller === "chuck" || value.chuckOrRoller === "roller") &&
    (value.bedOrigin === "top-left" ||
      value.bedOrigin === "top-right" ||
      value.bedOrigin === "bottom-left" ||
      value.bedOrigin === "bottom-right")
  );
}

function parsePresets(raw: string | null): RotaryPlacementPreset[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const valid = parsed.filter(isValidPreset);
    return valid.length === parsed.length ? valid : null;
  } catch {
    return null;
  }
}

function persistPresets(
  presets: RotaryPlacementPreset[],
  storage: StorageLike | null
): RotaryPlacementPreset[] {
  const next = presets.map((preset) => ({ ...preset }));
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
  const created: RotaryPlacementPreset = {
    ...preset,
    id: createPresetId(),
  };
  return persistPresets([...current, created], storage);
}

export function updateRotaryPreset(
  presetId: string,
  patch: Partial<Omit<RotaryPlacementPreset, "id">>,
  storage: StorageLike | null = getBrowserStorage()
): RotaryPlacementPreset[] {
  const current = getRotaryPresets(storage);
  const next = current.map((preset) =>
    preset.id === presetId ? { ...preset, ...patch } : preset
  );
  return persistPresets(next, storage);
}

export function deleteRotaryPreset(
  presetId: string,
  storage: StorageLike | null = getBrowserStorage()
): RotaryPlacementPreset[] {
  const current = getRotaryPresets(storage);
  const next = current.filter((preset) => preset.id !== presetId);
  return persistPresets(next, storage);
}
