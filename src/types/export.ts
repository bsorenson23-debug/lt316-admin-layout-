import type { WorkspaceMode } from "./admin";
import type { CanonicalDimensionCalibration, LogoPlacement } from "./productTemplate";
import type { AxialSurfaceBand, PrintableSurfaceContract } from "./printableSurface";

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
  /** Calibrated steps-per-rotation value to enter in LightBurn rotary setup */
  stepsPerRotation?: number;
  /** Correction factor computed from SPR calibration (actual / commanded) */
  sprCorrectionFactor?: number;
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

export interface LightBurnExportCylinder {
  /** Outside diameter to enter in LightBurn's rotary setup (mm) */
  objectDiameterMm: number | null;
  /** Circumference / split width = template width (mm) */
  splitWidthMm: number;
  /** Printable/usable height of the cylinder (mm) */
  printableHeightMm: number;
  shapeType: "straight" | "tapered" | "unknown";
}

export interface LightBurnExportPayload {
  kind: "lt316-lightburn-export";
  workspaceMode: WorkspaceMode;
  templateWidthMm: number;
  templateHeightMm: number;
  generatedAt: string;
  rotaryAutoPlacementApplied: boolean;
  /** Cylinder / tumbler dimensions for LightBurn rotary setup. Present in tumbler-wrap mode. */
  cylinder: LightBurnExportCylinder | null;
  rotary: {
    enabled: boolean;
    presetId: string | null;
    presetName: string | null;
    bedOrigin: BedOrigin | null;
    chuckOrRoller: RotaryDriveType | null;
    stepsPerRotation: number | null;
    sprCorrectionFactor: number | null;
    anchorMode: TopAnchorMode;
    rotaryCenterXmm: number | null;
    rotaryTopYmm: number | null;
    exportOriginXmm: number;
    exportOriginYmm: number;
  };
  warnings: string[];
  items: LightBurnExportItem[];
}

export type LightBurnGuideKind =
  | "front-meridian"
  | "back-meridian"
  | "left-quarter"
  | "right-quarter"
  | "handle-meridian"
  | "keep-out-start"
  | "keep-out-end"
  | "logo-center"
  | "printable-top"
  | "printable-bottom"
  | "lid-boundary"
  | "rim-boundary"
  | "base-boundary";

export interface LightBurnAlignmentGuideLine {
  id: string;
  kind: LightBurnGuideKind;
  label: string;
  orientation: "vertical" | "horizontal";
  xMm?: number;
  yMm?: number;
}

export interface LightBurnAlignmentKeepOutRegion {
  label: string;
  startMm: number;
  endMm: number;
  wrapsAround: boolean;
}

export interface LightBurnAlignmentLogoRegion {
  label: string;
  centerXMm: number;
  centerYMm: number;
  widthMm: number;
  heightMm: number;
  wrapsAround: boolean;
  source: LogoPlacement["source"];
  confidence: number;
}

export interface LightBurnAlignmentGuidePayload {
  kind: "lt316-lightburn-alignment-guides";
  workspaceMode: WorkspaceMode;
  templateWidthMm: number;
  templateHeightMm: number;
  generatedAt: string;
  units: "mm";
  origin: "top-left";
  bodyOnlyWrapSpace: boolean;
  wrapWidthAuthoritative: boolean;
  wrapMappingMm: CanonicalDimensionCalibration["wrapMappingMm"];
  printableSurfaceContract?: PrintableSurfaceContract | null;
  axialSurfaceBands?: AxialSurfaceBand[];
  lines: LightBurnAlignmentGuideLine[];
  keepOutRegion: LightBurnAlignmentKeepOutRegion | null;
  logoRegion: LightBurnAlignmentLogoRegion | null;
  warnings: string[];
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
    stepsPerRotation?: number;
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
  alignmentGuides: LightBurnAlignmentGuidePayload | null;
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
