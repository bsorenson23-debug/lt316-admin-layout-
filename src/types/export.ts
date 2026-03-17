import type { WorkspaceMode } from "./admin";

export type BedOrigin = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type RotaryDriveType = "chuck" | "roller";
export type TopAnchorMode = "physical-top" | "printable-top";

export interface RotaryPlacementPreset {
  id: string;
  name: string;
  bedOrigin: BedOrigin;
  rotaryCenterXmm: number;
  rotaryTopYmm: number;
  defaultRotationDeg?: number;
  chuckOrRoller: RotaryDriveType;
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
    shapeType: "straight" | "tapered" | "unknown";
    diameterMm: number;
    topDiameterMm: number;
    bottomDiameterMm: number;
    overallHeightMm: number;
    usableHeightMm: number;
  };
  rotary: {
    mode: RotaryDriveType;
    recommendedObjectDiameterMm: number;
    recommendedCircumferenceMm: number;
    topAnchorYmm: number;
    exportOriginXmm: number;
    exportOriginYmm: number;
    note: string;
  };
  export: {
    artworkWidthMm: number;
    artworkHeightMm: number;
  };
}

export interface LightBurnExportArtifacts {
  artworkPayload: LightBurnExportPayload;
  sidecar: Lt316LightBurnSetupSidecar | null;
  setupSummary: string | null;
}
