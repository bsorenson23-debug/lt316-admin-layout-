import type {
  CalibrationOverlayKey,
  CalibrationOverlayToggles,
} from "./calibrationBedReference";

export type CalibrationMode =
  | "rotary"
  | "export"
  | "lens"
  | "laser"
  | "geometry"
  | "red-light"
  | "distortion";

export interface CalibrationModeDefinition {
  id: CalibrationMode;
  label: string;
  implemented: boolean;
}

export const DEFAULT_CALIBRATION_MODE: CalibrationMode = "rotary";

export const CALIBRATION_MODE_DEFINITIONS: CalibrationModeDefinition[] = [
  { id: "rotary", label: "Rotary", implemented: true },
  { id: "export", label: "Export", implemented: true },
  { id: "lens", label: "Lens", implemented: false },
  { id: "laser", label: "Laser", implemented: true },
  { id: "geometry", label: "Geometry", implemented: false },
  { id: "red-light", label: "Red Light", implemented: false },
  { id: "distortion", label: "Distortion", implemented: false },
];

const ROTARY_OVERLAY_KEYS: CalibrationOverlayKey[] = [
  "showHoleGrid",
  "showCenterline",
  "showOrigin",
  "showRotaryCenterline",
  "showTopAnchorLine",
  "showMountFootprint",
];

const EXPORT_OVERLAY_KEYS: CalibrationOverlayKey[] = [
  "showHoleGrid",
  "showCenterline",
  "showOrigin",
  "showRotaryCenterline",
  "showTopAnchorLine",
  "showExportPreview",
];

const LENS_OVERLAY_KEYS: CalibrationOverlayKey[] = [
  "showHoleGrid",
  "showCenterline",
  "showLensFieldOutline",
];

const LASER_OVERLAY_KEYS: CalibrationOverlayKey[] = [
  "showHoleGrid",
  "showCenterline",
  "showOrigin",
];

const GEOMETRY_OVERLAY_KEYS: CalibrationOverlayKey[] = [
  "showHoleGrid",
  "showCenterline",
  "showOrigin",
];

const RED_LIGHT_OVERLAY_KEYS: CalibrationOverlayKey[] = [
  "showHoleGrid",
  "showCenterline",
  "showOrigin",
];

const DISTORTION_OVERLAY_KEYS: CalibrationOverlayKey[] = [
  "showHoleGrid",
  "showCenterline",
  "showOrigin",
];

const MODE_OVERLAY_KEYS: Record<CalibrationMode, CalibrationOverlayKey[]> = {
  rotary: ROTARY_OVERLAY_KEYS,
  export: EXPORT_OVERLAY_KEYS,
  lens: LENS_OVERLAY_KEYS,
  laser: LASER_OVERLAY_KEYS,
  geometry: GEOMETRY_OVERLAY_KEYS,
  "red-light": RED_LIGHT_OVERLAY_KEYS,
  distortion: DISTORTION_OVERLAY_KEYS,
};

const OVERLAY_KEY_SET: CalibrationOverlayKey[] = [
  "showHoleGrid",
  "showCenterline",
  "showOrigin",
  "showRotaryCenterline",
  "showTopAnchorLine",
  "showMountFootprint",
  "showLensFieldOutline",
  "showExportPreview",
];

export function getVisibleOverlayKeysForMode(
  mode: CalibrationMode
): CalibrationOverlayKey[] {
  return MODE_OVERLAY_KEYS[mode];
}

export function getDefaultOverlayTogglesForMode(
  mode: CalibrationMode
): CalibrationOverlayToggles {
  const visible = new Set(getVisibleOverlayKeysForMode(mode));
  return {
    showHoleGrid: visible.has("showHoleGrid"),
    showCenterline: visible.has("showCenterline"),
    showOrigin: visible.has("showOrigin"),
    showRotaryCenterline: visible.has("showRotaryCenterline"),
    showTopAnchorLine: visible.has("showTopAnchorLine"),
    showMountFootprint: visible.has("showMountFootprint"),
    showLensFieldOutline:
      mode === "lens" ? true : visible.has("showLensFieldOutline"),
    showExportPreview:
      mode === "export" ? true : visible.has("showExportPreview"),
  };
}

export function buildOverlayStateForMode(args: {
  mode: CalibrationMode;
  toggles: CalibrationOverlayToggles;
}): CalibrationOverlayToggles {
  const visible = new Set(getVisibleOverlayKeysForMode(args.mode));
  const next: CalibrationOverlayToggles = {
    showHoleGrid: false,
    showCenterline: false,
    showOrigin: false,
    showRotaryCenterline: false,
    showTopAnchorLine: false,
    showMountFootprint: false,
    showLensFieldOutline: false,
    showExportPreview: false,
  };

  for (const key of OVERLAY_KEY_SET) {
    if (!visible.has(key)) continue;
    next[key] = args.toggles[key];
  }

  return next;
}

export function resolveCalibrationMode(nextMode: CalibrationMode): CalibrationMode {
  return nextMode;
}

export function isImplementedCalibrationMode(mode: CalibrationMode): boolean {
  return (
    CALIBRATION_MODE_DEFINITIONS.find((definition) => definition.id === mode)?.implemented ??
    false
  );
}
