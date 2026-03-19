import type { LaserType } from "./materials";

export type RotaryAxis = "Y" | "A";
export type BedOriginCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface MachineProfile {
  id: string;
  name: string;
  laserType: LaserType;
  wattagePeak: number;
  bedWidthMm: number;
  bedHeightMm: number;
  rotaryAxis: RotaryAxis;
  bedOrigin: BedOriginCorner;
  notes?: string;
}

export const MACHINE_PROFILES_KEY = "lt316_machine_profiles";
export const ACTIVE_MACHINE_ID_KEY = "lt316_active_machine";
