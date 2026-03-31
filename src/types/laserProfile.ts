export type LaserSourceType = "co2" | "fiber" | "diode" | "uv" | "green-diode";

export const LASER_SOURCE_LABELS: Record<LaserSourceType, string> = {
  co2: "CO₂",
  fiber: "Fiber",
  diode: "Diode",
  uv: "UV",
  "green-diode": "Green",
};

// Subtle background colors for the type badge
export const LASER_SOURCE_COLORS: Record<LaserSourceType, string> = {
  co2: "#4a6a3a",
  fiber: "#4a3a6a",
  diode: "#6a4a2a",
  uv: "#2a3a6a",
  "green-diode": "#2a5a3a",
};

export interface LaserLens {
  id: string;
  name: string;          // e.g. "100mm Standard"
  focalLengthMm: number;
  kerfMm?: number;       // kerf width in mm
  notes?: string;
}

export interface LaserProfile {
  id: string;
  name: string;          // e.g. "Main CO2 Laser"
  sourceType: LaserSourceType;
  source: string;        // e.g. "RECI W2", "xTool D1 Pro", "Cloudray"
  wattagePeak: number;
  /** Only meaningful for fiber sources. Missing/false defaults to standard fiber. */
  isMopaCapable?: boolean;
  lenses: LaserLens[];
}

export const LASER_PROFILES_KEY = "lt316_laser_profiles";
export const ACTIVE_LASER_PROFILE_KEY = "lt316_active_laser_id";
export const ACTIVE_LENS_KEY = "lt316_active_lens_id";
