// Fiber laser color marking — core calculations
//
// Energy Density (J/mm²) = Power (W) / (Speed (mm/s) × Line Spacing (mm))
//
// MOPA pulse width is always an independent parameter — never derived from
// power or speed. This is what distinguishes MOPA from Q-switch for color work.

import { FIBER_COLOR_SPECTRUM, getSpectrumMidpoint } from "../data/fiberColorSpectrum.ts";
import type {
  FiberColorEntry,
  FiberBaseParams,
  BracketTestConfig,
  BracketTestLine,
  BracketStepSize,
  FiberMachineProfile,
  FiberCalibratedColor,
  FiberColorLookupResult,
} from "../types/fiberColor.ts";

// ---------------------------------------------------------------------------
// Step size constants
// ---------------------------------------------------------------------------

const STEP_PCT: Record<BracketStepSize, number> = {
  fine:   0.05,
  normal: 0.10,
  coarse: 0.20,
};

/** Resolve a named step size to its fractional value */
export function getStepPct(size: BracketStepSize): number {
  return STEP_PCT[size];
}

// ---------------------------------------------------------------------------
// Energy density
// ---------------------------------------------------------------------------

/** Compute energy density in J/mm². Returns 0 for degenerate inputs. */
export function computeEnergyDensity(
  power_w: number,
  speed_mms: number,
  lineSpacing_mm: number,
): number {
  if (speed_mms <= 0 || lineSpacing_mm <= 0) return 0;
  return power_w / (speed_mms * lineSpacing_mm);
}

/** Compute ED from a FiberBaseParams object */
export function edFromParams(p: FiberBaseParams): number {
  return computeEnergyDensity(p.power_w, p.speed_mms, p.lineSpacing_mm);
}

// ---------------------------------------------------------------------------
// Spectrum lookup
// ---------------------------------------------------------------------------

/** Find the spectrum entry whose ED range contains the given value */
export function predictColorFromED(ed: number): FiberColorEntry {
  for (const entry of FIBER_COLOR_SPECTRUM) {
    if (ed >= entry.edMin && ed < entry.edMax) return entry;
  }
  return FIBER_COLOR_SPECTRUM[FIBER_COLOR_SPECTRUM.length - 1];
}

// ---------------------------------------------------------------------------
// 5-line bracket test generation
// ---------------------------------------------------------------------------

/**
 * Generate 5 test lines from a baseline.
 * Line 3 = center (offset 0, baseline params).
 * Lines 1–2 = cooler (less energy), lines 4–5 = hotter (more energy).
 *
 * Speed adjustment: divide (lower speed → more dwell → more energy).
 * Power adjustment: multiply (higher power → more energy).
 * PulseWidth adjustment: multiply (longer pulse → more peak energy).
 */
export function generateBracketTest(config: BracketTestConfig): BracketTestLine[] {
  const stepPct = STEP_PCT[config.stepSize];
  const lines: BracketTestLine[] = [];

  for (let i = 1; i <= 5; i++) {
    const offset = i - 3; // -2, -1, 0, +1, +2
    const params: FiberBaseParams = { ...config.baseParams };

    switch (config.param) {
      case "speed":
        // Lower speed = more energy — divide so positive offset → slower
        params.speed_mms = config.baseParams.speed_mms / (1 + offset * stepPct);
        break;
      case "power":
        params.power_w = config.baseParams.power_w * (1 + offset * stepPct);
        break;
      case "pulseWidth":
        params.pulseWidth_ns = config.baseParams.pulseWidth_ns * (1 + offset * stepPct);
        break;
    }

    const energyDensity = edFromParams(params);

    lines.push({
      line: i as 1 | 2 | 3 | 4 | 5,
      offset,
      params,
      energyDensity,
      predictedColor: predictColorFromED(energyDensity),
    });
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Calibration offset
// ---------------------------------------------------------------------------

/**
 * Compute the calibration offset from the operator's selected line.
 *
 * @param selectedLine  Which of the 5 lines matched the target color (1–5)
 * @param stepPct       Fractional step (e.g. 0.10 for 10%)
 * @returns offsetPercent (signed %) and offsetMultiplier
 */
export function applyCalibration(
  selectedLine: 1 | 2 | 3 | 4 | 5,
  stepPct: number,
): { offsetPercent: number; offsetMultiplier: number } {
  const offset = selectedLine - 3;
  return {
    offsetPercent: offset * stepPct * 100,
    offsetMultiplier: 1 + offset * stepPct,
  };
}

// ---------------------------------------------------------------------------
// Calibrated color mapping
// ---------------------------------------------------------------------------

/**
 * Build the full color map with corrected EDs.
 * correctedED = baseED × offsetMultiplier — always recomputed, never stored
 * as a final value. The profile stores both so the UI can display deltas.
 */
export function buildCalibratedColorMapping(
  offsetMultiplier: number,
): FiberCalibratedColor[] {
  return FIBER_COLOR_SPECTRUM.map((entry) => {
    const baseED = getSpectrumMidpoint(entry);
    return {
      color: entry.color,
      hex: entry.hex,
      baseED,
      correctedED: baseED * offsetMultiplier,
    };
  });
}

// ---------------------------------------------------------------------------
// Reverse lookup: target color → laser parameters
// ---------------------------------------------------------------------------

/**
 * Given a target color name and a calibrated machine profile, compute the
 * laser parameters that should produce that color.
 *
 * Holds power and line spacing constant (from physicalTruth), solves for speed.
 * Pulse width and frequency come from baseParams (design choices per job).
 *
 * Speed = Power / (correctedED × lineSpacing)
 */
export function getParamsForColor(
  targetColor: string,
  profile: FiberMachineProfile,
  baseParams: { lineSpacing_mm: number; pulseWidth_ns: number; frequency_khz: number },
): FiberColorLookupResult | null {
  const colorEntry = profile.colorMapping.find((c) => c.color === targetColor);
  if (!colorEntry) return null;

  const correctedED = colorEntry.baseED * profile.offsetMultiplier;
  if (correctedED <= 0 || baseParams.lineSpacing_mm <= 0) return null;

  const speed_mms = profile.physicalTruth.power_w / (correctedED * baseParams.lineSpacing_mm);

  return {
    color: colorEntry.color,
    hex: colorEntry.hex,
    correctedED,
    params: {
      power_w: profile.physicalTruth.power_w,
      speed_mms: Math.round(speed_mms * 10) / 10, // 0.1 mm/s precision
      pulseWidth_ns: baseParams.pulseWidth_ns,
      frequency_khz: baseParams.frequency_khz,
      lineSpacing_mm: baseParams.lineSpacing_mm,
    },
  };
}

// ---------------------------------------------------------------------------
// Unit conversions — bridge between fiber calc (mm/s, W) and LaserLayer
// (mm/min, power %)
// ---------------------------------------------------------------------------

/** mm/s → mm/min */
export function mmsToMmMin(mms: number): number {
  return mms * 60;
}

/** mm/min → mm/s */
export function mmMinToMms(mmMin: number): number {
  return mmMin / 60;
}

/** Absolute watts → percentage of rated power */
export function wattsToPercent(watts: number, ratedPower: number): number {
  if (ratedPower <= 0) return 0;
  return (watts / ratedPower) * 100;
}

/** Percentage of rated power → absolute watts */
export function percentToWatts(pct: number, ratedPower: number): number {
  return (pct / 100) * ratedPower;
}

// ---------------------------------------------------------------------------
// Profile persistence helpers
// ---------------------------------------------------------------------------

import {
  FIBER_PROFILES_STORAGE_KEY,
  ACTIVE_FIBER_PROFILE_KEY,
} from "../types/fiberColor.ts";

export function loadFiberProfiles(): FiberMachineProfile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FIBER_PROFILES_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FiberMachineProfile[]) : [];
  } catch {
    return [];
  }
}

export function saveFiberProfiles(profiles: FiberMachineProfile[]): void {
  localStorage.setItem(FIBER_PROFILES_STORAGE_KEY, JSON.stringify(profiles));
}

export function getActiveFiberProfileId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_FIBER_PROFILE_KEY);
}

export function setActiveFiberProfileId(id: string | null): void {
  if (id) {
    localStorage.setItem(ACTIVE_FIBER_PROFILE_KEY, id);
  } else {
    localStorage.removeItem(ACTIVE_FIBER_PROFILE_KEY);
  }
}
