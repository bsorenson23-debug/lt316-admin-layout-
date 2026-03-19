export type LaserType = "co2" | "diode" | "fiber";
export type TumblerFinish = "powder-coat" | "raw-stainless" | "painted" | "anodized" | "chrome-plated" | "matte-finish";

export const LASER_TYPE_LABELS: Record<LaserType, string> = {
  co2: "CO₂",
  diode: "Diode",
  fiber: "Fiber",
};

export const TUMBLER_FINISH_LABELS: Record<TumblerFinish, string> = {
  "powder-coat": "Powder Coat",
  "raw-stainless": "Raw Stainless",
  "painted": "Painted",
  "anodized": "Anodized",
  "chrome-plated": "Chrome Plated",
  "matte-finish": "Matte Finish",
};

export interface MaterialProfile {
  id: string;
  label: string;
  laserType: LaserType;
  /** Typical wattage range this profile was calibrated for */
  wattageRange: string;
  finishType: TumblerFinish;
  /** Power % (min power in LightBurn) */
  powerPct: number;
  /** Max power % */
  maxPowerPct: number;
  /** Speed in mm/s */
  speedMmS: number;
  /** Lines per inch */
  lpi: number;
  /** Number of passes */
  passes: number;
  notes?: string;
}
