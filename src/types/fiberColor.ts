// Fiber laser color marking — types
// Physics: oxide layer interference on metal, controlled by energy density.
// ED (J/mm²) = Power (W) / (Speed (mm/s) × Line Spacing (mm))

// ---------------------------------------------------------------------------
// Color spectrum
// ---------------------------------------------------------------------------

export interface FiberColorEntry {
  /** Human-readable color name */
  color: string;
  /** Display hex */
  hex: string;
  /** Energy density lower bound (inclusive), J/mm² */
  edMin: number;
  /** Energy density upper bound (exclusive), J/mm² — Infinity for last entry */
  edMax: number;
}

// ---------------------------------------------------------------------------
// Bracket calibration test
// ---------------------------------------------------------------------------

/** Which parameter the 5-line bracket test varies */
export type BracketParam = "speed" | "power" | "pulseWidth";

/** Step size preset for bracket sweep */
export type BracketStepSize = "fine" | "normal" | "coarse";

/** MOPA wavelength in nm */
export type Wavelength = 1064 | 532 | 355;

/** Substrate material for color marking */
export type SubstrateMaterial = "ti" | "ss";

/** Base laser parameters — the starting point for line 3 (center) */
export interface FiberBaseParams {
  power_w: number;
  speed_mms: number;
  pulseWidth_ns: number;
  frequency_khz: number;
  lineSpacing_mm: number;
}

/** Configuration for generating a 5-line bracket test */
export interface BracketTestConfig {
  param: BracketParam;
  stepSize: BracketStepSize;
  baseParams: FiberBaseParams;
}

/** One of the 5 test lines with computed parameters and predicted color */
export interface BracketTestLine {
  /** 1-based line number (1 = coolest, 3 = center, 5 = hottest) */
  line: 1 | 2 | 3 | 4 | 5;
  /** Offset from center: -2, -1, 0, +1, +2 */
  offset: number;
  /** Adjusted parameters for this line */
  params: FiberBaseParams;
  /** Computed energy density (J/mm²) */
  energyDensity: number;
  /** Predicted color from the spectrum table */
  predictedColor: FiberColorEntry;
}

// ---------------------------------------------------------------------------
// Machine profile — one per physical machine, stored in localStorage
// ---------------------------------------------------------------------------

export interface FiberMachineProfile {
  id: string;
  /** Operator-given name, e.g. "MOPA-100W #1" */
  machine: string;
  /** Rated laser power in watts */
  ratedPower: number;
  wavelength: Wavelength;
  material: SubstrateMaterial;
  /** ISO date string when calibration was locked */
  lockedAt: string;
  /** Which bracket line the operator selected (1–5) */
  selectedLine: 1 | 2 | 3 | 4 | 5;
  /** Signed percentage, e.g. +10 means machine runs 10% hot */
  offsetPercent: number;
  /** Multiplicative factor applied to all ED calculations */
  offsetMultiplier: number;
  /** The actual parameters of the selected line */
  physicalTruth: FiberBaseParams & {
    energyDensity_Jmm2: number;
  };
  /** Full color map with base and corrected energy densities */
  colorMapping: FiberCalibratedColor[];
}

export interface FiberCalibratedColor {
  color: string;
  hex: string;
  /** Midpoint ED from the spectrum table (J/mm²) */
  baseED: number;
  /** baseED × offsetMultiplier */
  correctedED: number;
}

// ---------------------------------------------------------------------------
// Reverse lookup result
// ---------------------------------------------------------------------------

export interface FiberColorLookupResult {
  color: string;
  hex: string;
  correctedED: number;
  params: FiberBaseParams;
}

// ---------------------------------------------------------------------------
// localStorage key
// ---------------------------------------------------------------------------

export const FIBER_PROFILES_STORAGE_KEY = "lt316_fiber_profiles";
export const ACTIVE_FIBER_PROFILE_KEY = "lt316_active_fiber_id";
