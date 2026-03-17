import type { WorkspaceMode } from "./admin";

export type BedOrigin = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type RotaryDriveType = "chuck" | "roller";
export type TopAnchorMode = "physical-top" | "printable-top";
export type RotaryPresetFamily = "rotoboss-talon" | "d80c" | "d100c" | "custom";
export type RotaryMountBoltSize = "M6" | "unknown";
export type RotaryMountReferenceMode =
  | "axis-center"
  | "front-left-bolt"
  | "front-right-bolt"
  | "front-edge-center"
  | "custom";

export interface RotaryMountHoleOffset {
  id: string;
  xMm: number;
  yMm: number;
}

export interface RotaryAnchorReferencePoint {
  xMm: number;
  yMm: number;
  label?: string;
}

export interface RotaryPlacementPreset {
  id: string;
  name: string;
  family?: RotaryPresetFamily;
  mountPatternXmm?: number;
  mountPatternYmm?: number;
  mountBoltSize?: RotaryMountBoltSize;
  axisHeightMm?: number;
  /** Alias for rotary center used by machine-mechanical reference workflows */
  axisCenterXmm?: number;
  bedOrigin: BedOrigin;
  rotaryCenterXmm: number;
  rotaryTopYmm?: number;
  defaultRotationDeg?: number;
  chuckOrRoller: RotaryDriveType;
  mountReferenceMode?: RotaryMountReferenceMode;
  referenceToAxisOffsetXmm?: number;
  referenceToAxisOffsetYmm?: number;
  baseVisualWidthMm?: number;
  baseVisualDepthMm?: number;
  mountHoleOffsetsMm?: RotaryMountHoleOffset[];
  anchorReferencePointMm?: RotaryAnchorReferencePoint;
  baseVisualPlaceholder?: boolean;
  notes?: string;
}

export interface TumblerPlacementProfile {
  overallHeightMm: number;
  usableHeightMm?: number;
  topToSafeZoneStartMm?: number;
  bottomMarginMm?: number;
  topAnchorMode: TopAnchorMode;
}

export interface RotaryExportOrigin {
  xMm: number;
  yMm: number;
}

export interface LightBurnExportItem {
  id: string;
  assetId: string;
  name: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotationDeg: number;
  svgText: string;
}

export interface LightBurnExportPayload {
  kind: "lt316-lightburn-export";
  workspaceMode: WorkspaceMode;
  templateWidthMm: number;
  templateHeightMm: number;
  generatedAt: string;
  rotaryAutoPlacementApplied: boolean;
  rotary: {
    enabled: boolean;
    presetId: string | null;
    presetName: string | null;
    bedOrigin: BedOrigin | null;
    chuckOrRoller: RotaryDriveType | null;
    anchorMode: TopAnchorMode;
    rotaryCenterXmm: number | null;
    rotaryTopYmm: number | null;
    exportOriginXmm: number;
    exportOriginYmm: number;
  };
  warnings: string[];
  items: LightBurnExportItem[];
}

export interface Lt316LightBurnSetupSidecar {
  product: {
    profileId?: string | null;
    shapeType: "straight" | "tapered" | "unknown";
    outsideDiameterMm?: number;
    topDiameterMm?: number;
    bottomDiameterMm?: number;
    overallHeightMm?: number;
    usableHeightMm?: number;
    templateWidthMm: number;
    templateHeightMm: number;
  };
  rotary: {
    presetId?: string | null;
    presetName?: string | null;
    mode: RotaryDriveType | "unknown";
    rotaryCenterXmm?: number;
    rotaryTopYmm?: number;
    anchorMode: TopAnchorMode;
  };
  lightburn: {
    recommendedObjectDiameterMm?: number;
    recommendedCircumferenceMm?: number;
    exportOriginXmm?: number;
    exportOriginYmm?: number;
    notes: string[];
  };
  meta: {
    createdAt: string;
    source: "lt316";
  };
}

export interface LightBurnExportArtifacts {
  artworkPayload: LightBurnExportPayload;
  sidecar: Lt316LightBurnSetupSidecar | null;
  setupSummary: string | null;
  setupWarnings: string[];
}

export interface LightBurnPathSettings {
  templateProjectPath?: string;
  outputFolderPath?: string;
  deviceBundlePath?: string;
}

export type LightBurnPathValidationStatus =
  | "valid"
  | "missing"
  | "invalid-extension"
  | "not-found"
  | "not-writable"
  | "error";

export interface LightBurnPathValidationItem {
  status: LightBurnPathValidationStatus;
  message: string;
}

export interface LightBurnPathValidationResult {
  templateProjectPath: LightBurnPathValidationItem;
  outputFolderPath: LightBurnPathValidationItem;
  deviceBundlePath: LightBurnPathValidationItem;
}
