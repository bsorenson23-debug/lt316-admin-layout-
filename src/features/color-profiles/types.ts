import type { LaserSourceType } from "../../types/laserProfile.ts";

export type MarkingProcessFamily =
  | "oxide-color"
  | "oxide-black"
  | "oxide-dark"
  | "anneal-dark"
  | "engrave"
  | "anodized-black-gray"
  | "white-ablation"
  | "plastic-color-change"
  | "plastic-foaming"
  | "plastic-ablation"
  | "coating-ablation"
  | "consumable-dark-mark";

export interface OutcomeParameterOverrides {
  powerPct?: number;
  speedMmS?: number;
  lineIntervalMm?: number;
  passes?: number;
  frequencyKhz?: number;
  pulseWidthNs?: number;
  crossHatch?: boolean;
}

export interface AchievableOutcome {
  id: string;
  label: string;
  processFamily: MarkingProcessFamily;
  description?: string;
  targetHex?: string;
  requiresMopa?: boolean;
  basePresetId?: string;
  parameterOverrides?: OutcomeParameterOverrides;
  notes?: string;
}

export interface MaterialLaserCapability {
  id: string;
  materialSlug: string;
  materialLabel: string;
  laserSourceType: LaserSourceType;
  requiresMopa?: boolean;
  productHints?: string[];
  processFamilies: MarkingProcessFamily[];
  outcomes: AchievableOutcome[];
  notes?: string[];
}

export interface ResolvedLaserContext {
  id: string | null;
  name: string;
  sourceType: LaserSourceType;
  wattagePeak: number;
  isMopaCapable: boolean;
}

export interface ResolvedProcessContext {
  materialSlug: string;
  materialLabel: string;
  productHint?: string;
  activeLaser: ResolvedLaserContext | null;
  capabilities: MaterialLaserCapability[];
  warnings: string[];
}

export interface ResolvedOutcome extends AchievableOutcome {
  capabilityId: string;
  materialSlug: string;
  materialLabel: string;
  sourceType: LaserSourceType;
  suggested: boolean;
  presetAvailable: boolean;
  warning?: string;
}

export interface MaterialSelectionContext {
  materialSlug?: string | null;
  materialLabel?: string | null;
  productHint?: string | null;
}
