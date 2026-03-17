import type {
  LightBurnPathSettings,
  LightBurnPathValidationResult,
} from "../types/export.ts";

const LIGHTBURN_PATH_SETTINGS_KEY = "lt316.integration.lightburn.paths";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function normalizePath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizePathSettings(value: unknown): LightBurnPathSettings {
  if (!value || typeof value !== "object") return {};
  const parsed = value as Partial<LightBurnPathSettings>;
  return {
    templateProjectPath: normalizePath(parsed.templateProjectPath),
    outputFolderPath: normalizePath(parsed.outputFolderPath),
    deviceBundlePath: normalizePath(parsed.deviceBundlePath),
  };
}

export function buildDefaultLightBurnPathValidationResult(): LightBurnPathValidationResult {
  return {
    templateProjectPath: {
      status: "missing",
      message: "Missing",
    },
    outputFolderPath: {
      status: "missing",
      message: "Missing",
    },
    deviceBundlePath: {
      status: "missing",
      message: "Missing",
    },
  };
}

export function loadLightBurnPathSettings(
  storage: StorageLike | null = getBrowserStorage()
): LightBurnPathSettings {
  if (!storage) return {};
  const raw = storage.getItem(LIGHTBURN_PATH_SETTINGS_KEY);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    return normalizePathSettings(parsed);
  } catch {
    return {};
  }
}

export function saveLightBurnPathSettings(
  settings: LightBurnPathSettings,
  storage: StorageLike | null = getBrowserStorage()
): LightBurnPathSettings {
  const normalized = normalizePathSettings(settings);
  if (!storage) return normalized;
  storage.setItem(LIGHTBURN_PATH_SETTINGS_KEY, JSON.stringify(normalized));
  return normalized;
}

export function resetLightBurnPathSettings(
  storage: StorageLike | null = getBrowserStorage()
): LightBurnPathSettings {
  if (storage) {
    storage.removeItem(LIGHTBURN_PATH_SETTINGS_KEY);
  }
  return {};
}

export function hasAnyLightBurnPath(
  settings: LightBurnPathSettings | null | undefined
): boolean {
  return Boolean(
    settings?.templateProjectPath ||
      settings?.outputFolderPath ||
      settings?.deviceBundlePath
  );
}

