import type { TopAnchorMode } from "../types/export.ts";
import type {
  CalibrationOverlayToggles,
} from "./calibrationBedReference.ts";
import {
  DEFAULT_CALIBRATION_MODE,
  type CalibrationMode,
  getDefaultOverlayTogglesForMode,
} from "./calibrationModes.ts";
import type { RotaryModeDraft } from "./rotaryMode.ts";

const CALIBRATION_WORKSPACE_STATE_KEY = "lt316.admin.calibration.workspace";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type CalibrationOverlayStateByMode = Record<
  CalibrationMode,
  CalibrationOverlayToggles
>;

export interface PersistedCalibrationWorkspaceState {
  activeCalibrationMode: CalibrationMode;
  selectedRotaryPresetId: string | null;
  overlayStateByMode: CalibrationOverlayStateByMode;
  anchorMode: TopAnchorMode;
  customRotaryDraft?: RotaryModeDraft;
  currentRotaryDraft?: RotaryModeDraft;
}

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function isCalibrationMode(value: unknown): value is CalibrationMode {
  return (
    value === "rotary" ||
    value === "export" ||
    value === "lens" ||
    value === "geometry" ||
    value === "red-light" ||
    value === "distortion"
  );
}

function normalizeAnchorMode(value: unknown): TopAnchorMode {
  return value === "printable-top" ? "printable-top" : "physical-top";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeRotaryDraft(value: unknown): RotaryModeDraft | undefined {
  if (!isPlainObject(value)) return undefined;
  if (
    typeof value.name !== "string" ||
    typeof value.family !== "string" ||
    typeof value.mountPatternXmm !== "string" ||
    typeof value.mountPatternYmm !== "string" ||
    typeof value.axisHeightMm !== "string" ||
    typeof value.rotaryCenterXmm !== "string" ||
    typeof value.rotaryTopYmm !== "string" ||
    typeof value.notes !== "string"
  ) {
    return undefined;
  }

  if (value.chuckOrRoller !== "chuck" && value.chuckOrRoller !== "roller") {
    return undefined;
  }
  if (value.mountBoltSize !== "M6" && value.mountBoltSize !== "unknown") {
    return undefined;
  }
  if (
    value.mountReferenceMode !== "axis-center" &&
    value.mountReferenceMode !== "front-left-bolt" &&
    value.mountReferenceMode !== "front-edge-center" &&
    value.mountReferenceMode !== "custom"
  ) {
    return undefined;
  }
  if (
    value.family !== "d80c" &&
    value.family !== "d100c" &&
    value.family !== "rotoboss-talon" &&
    value.family !== "custom"
  ) {
    return undefined;
  }
  if (
    value.bedOrigin !== "top-left" &&
    value.bedOrigin !== "top-right" &&
    value.bedOrigin !== "bottom-left" &&
    value.bedOrigin !== "bottom-right"
  ) {
    return undefined;
  }

  return {
    name: value.name,
    family: value.family,
    mountPatternXmm: value.mountPatternXmm,
    mountPatternYmm: value.mountPatternYmm,
    mountBoltSize: value.mountBoltSize,
    axisHeightMm: value.axisHeightMm,
    rotaryCenterXmm: value.rotaryCenterXmm,
    rotaryTopYmm: value.rotaryTopYmm,
    chuckOrRoller: value.chuckOrRoller,
    mountReferenceMode: value.mountReferenceMode,
    bedOrigin: value.bedOrigin,
    notes: value.notes,
  };
}

export function buildDefaultCalibrationOverlayStateByMode(): CalibrationOverlayStateByMode {
  return {
    rotary: getDefaultOverlayTogglesForMode("rotary"),
    export: getDefaultOverlayTogglesForMode("export"),
    lens: getDefaultOverlayTogglesForMode("lens"),
    geometry: getDefaultOverlayTogglesForMode("geometry"),
    "red-light": getDefaultOverlayTogglesForMode("red-light"),
    distortion: getDefaultOverlayTogglesForMode("distortion"),
  };
}

function normalizeOverlayToggles(
  value: unknown,
  fallback: CalibrationOverlayToggles
): CalibrationOverlayToggles {
  if (!isPlainObject(value)) return { ...fallback };
  return {
    showHoleGrid:
      typeof value.showHoleGrid === "boolean"
        ? value.showHoleGrid
        : fallback.showHoleGrid,
    showCenterline:
      typeof value.showCenterline === "boolean"
        ? value.showCenterline
        : fallback.showCenterline,
    showOrigin:
      typeof value.showOrigin === "boolean" ? value.showOrigin : fallback.showOrigin,
    showRotaryCenterline:
      typeof value.showRotaryCenterline === "boolean"
        ? value.showRotaryCenterline
        : fallback.showRotaryCenterline,
    showTopAnchorLine:
      typeof value.showTopAnchorLine === "boolean"
        ? value.showTopAnchorLine
        : fallback.showTopAnchorLine,
    showLensFieldOutline:
      typeof value.showLensFieldOutline === "boolean"
        ? value.showLensFieldOutline
        : fallback.showLensFieldOutline,
    showMountFootprint:
      typeof value.showMountFootprint === "boolean"
        ? value.showMountFootprint
        : fallback.showMountFootprint,
    showExportPreview:
      typeof value.showExportPreview === "boolean"
        ? value.showExportPreview
        : fallback.showExportPreview,
  };
}

function normalizeOverlayStateByMode(value: unknown): CalibrationOverlayStateByMode {
  const defaults = buildDefaultCalibrationOverlayStateByMode();
  if (!isPlainObject(value)) return defaults;

  return {
    rotary: normalizeOverlayToggles(value.rotary, defaults.rotary),
    export: normalizeOverlayToggles(value.export, defaults.export),
    lens: normalizeOverlayToggles(value.lens, defaults.lens),
    geometry: normalizeOverlayToggles(value.geometry, defaults.geometry),
    "red-light": normalizeOverlayToggles(value["red-light"], defaults["red-light"]),
    distortion: normalizeOverlayToggles(value.distortion, defaults.distortion),
  };
}

export function buildDefaultCalibrationWorkspaceState(): PersistedCalibrationWorkspaceState {
  return {
    activeCalibrationMode: DEFAULT_CALIBRATION_MODE,
    selectedRotaryPresetId: null,
    overlayStateByMode: buildDefaultCalibrationOverlayStateByMode(),
    anchorMode: "physical-top",
    customRotaryDraft: undefined,
    currentRotaryDraft: undefined,
  };
}

function normalizeWorkspaceState(
  value: unknown
): PersistedCalibrationWorkspaceState | null {
  if (!isPlainObject(value)) return null;

  const activeCalibrationMode = isCalibrationMode(value.activeCalibrationMode)
    ? value.activeCalibrationMode
    : DEFAULT_CALIBRATION_MODE;

  const selectedRotaryPresetId =
    typeof value.selectedRotaryPresetId === "string"
      ? value.selectedRotaryPresetId
      : null;

  return {
    activeCalibrationMode,
    selectedRotaryPresetId,
    overlayStateByMode: normalizeOverlayStateByMode(value.overlayStateByMode),
    anchorMode: normalizeAnchorMode(value.anchorMode),
    customRotaryDraft: normalizeRotaryDraft(value.customRotaryDraft),
    currentRotaryDraft: normalizeRotaryDraft(value.currentRotaryDraft),
  };
}

export function loadCalibrationWorkspaceState(
  storage: StorageLike | null = getBrowserStorage()
): PersistedCalibrationWorkspaceState {
  if (!storage) return buildDefaultCalibrationWorkspaceState();

  const raw = storage.getItem(CALIBRATION_WORKSPACE_STATE_KEY);
  if (!raw) return buildDefaultCalibrationWorkspaceState();
  try {
    const parsed = JSON.parse(raw) as unknown;
    return normalizeWorkspaceState(parsed) ?? buildDefaultCalibrationWorkspaceState();
  } catch {
    return buildDefaultCalibrationWorkspaceState();
  }
}

export function saveCalibrationWorkspaceState(
  state: PersistedCalibrationWorkspaceState,
  storage: StorageLike | null = getBrowserStorage()
): void {
  if (!storage) return;
  storage.setItem(CALIBRATION_WORKSPACE_STATE_KEY, JSON.stringify(state));
}

export function resetCalibrationWorkspaceState(
  storage: StorageLike | null = getBrowserStorage()
): PersistedCalibrationWorkspaceState {
  const defaults = buildDefaultCalibrationWorkspaceState();
  if (!storage) return defaults;
  storage.removeItem(CALIBRATION_WORKSPACE_STATE_KEY);
  return defaults;
}
