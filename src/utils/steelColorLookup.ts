/**
 * steelColorLookup.ts
 *
 * Maps a hex color from an SVG layer to the closest achievable oxide color on
 * stainless steel, then returns the MOPA laser preset that produces it.
 *
 * Color matching uses CIELAB (perceptually uniform) ΔE distance so that, for
 * example, a user's "dark navy" routes to the "Dark Blue" preset rather than
 * accidentally hitting "Black".
 */

import type { LaserPreset } from "@/data/laserMaterialPresets";

// ─── CIELAB conversion helpers ────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace(/^#/, "");
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  if (clean.length === 6) {
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }
  return null;
}

function linearize(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function rgbToXyz(r: number, g: number, b: number): [number, number, number] {
  const rl = linearize(r);
  const gl = linearize(g);
  const bl = linearize(b);
  return [
    0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl,
    0.2126729 * rl + 0.7151522 * gl + 0.0721750 * bl,
    0.0193339 * rl + 0.1191920 * gl + 0.9503041 * bl,
  ];
}

const Xn = 0.95047, Yn = 1.00000, Zn = 1.08883; // D65

function f(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

function xyzToLab(x: number, y: number, z: number): [number, number, number] {
  const fx = f(x / Xn), fy = f(y / Yn), fz = f(z / Zn);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function hexToLab(hex: string): [number, number, number] | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const xyz = rgbToXyz(rgb[0], rgb[1], rgb[2]);
  return xyzToLab(xyz[0], xyz[1], xyz[2]);
}

/** CIE76 perceptual colour distance between two LAB triples. */
export function deltaE(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 + (b[2] - a[2]) ** 2);
}

// ─── Achievable oxide color targets on stainless steel ────────────────────────
//
// These are the visual colours produced by thin-film iron-oxide interference
// at various MOPA parameter combinations.  Hex values are calibrated from
// real-world MOPA samples (304 SS, JPT M7 20W).

export interface SteelColorTarget {
  name: string;
  hex: string;            // representative sample colour
  presetId: string;       // maps to LaserPreset.id
  lab: [number, number, number]; // pre-computed for speed
}

/**
 * Build the target table.  We pre-compute LAB at runtime to avoid
 * duplicating the conversion logic in a static constant.
 */
export function buildSteelColorTargets(): SteelColorTarget[] {
  const entries: { name: string; hex: string; presetId: string }[] = [
    { name: "Silver / Light",  hex: "#c0c0c0", presetId: "mopa-steel-silver-20w"   },
    { name: "Gold / Yellow",   hex: "#c89610", presetId: "mopa-steel-gold-20w"     },
    { name: "Orange / Bronze", hex: "#b86820", presetId: "mopa-steel-orange-20w"   },
    { name: "Red",             hex: "#cc3300", presetId: "mopa-steel-red-20w"      },
    { name: "Purple / Violet", hex: "#7722bb", presetId: "mopa-steel-purple-20w"   },
    { name: "Dark Blue",       hex: "#002299", presetId: "mopa-steel-darkblue-20w" },
    { name: "Bright Blue",     hex: "#2244cc", presetId: "mopa-steel-blue-20w"     },
    { name: "Teal / Cyan",     hex: "#226688", presetId: "mopa-steel-teal-20w"     },
    { name: "Green",           hex: "#226633", presetId: "mopa-steel-green-20w"    },
    { name: "Black",           hex: "#1a1a1a", presetId: "mopa-steel-black-20w"   },
    { name: "White / Ablate",  hex: "#d8d8d8", presetId: "mopa-steel-white-20w"   },
  ];

  return entries.map(e => {
    const lab = hexToLab(e.hex) ?? [0, 0, 0];
    return { ...e, lab };
  });
}

// Singleton so we only build once
let _targets: SteelColorTarget[] | null = null;
function getTargets(): SteelColorTarget[] {
  if (!_targets) _targets = buildSteelColorTargets();
  return _targets;
}

// ─── Main lookup API ──────────────────────────────────────────────────────────

export interface SteelColorMatch {
  /** The closest achievable oxide colour name */
  targetName: string;
  /** The preset id that produces it */
  presetId: string;
  /** The sample hex for the matched colour */
  targetHex: string;
  /** CIE76 ΔE distance (0 = perfect match; <10 = good; >25 = poor) */
  deltaE: number;
  /** Short confidence note */
  note: string;
}

/**
 * Find the best-matching MOPA stainless-steel colour preset for a given hex.
 * Returns null if the hex string is unparseable.
 */
export function matchSteelColor(hex: string): SteelColorMatch | null {
  const inputLab = hexToLab(hex);
  if (!inputLab) return null;

  const targets = getTargets();
  let bestDelta = Infinity;
  let bestTarget: SteelColorTarget | null = null;

  for (const t of targets) {
    const d = deltaE(inputLab, t.lab);
    if (d < bestDelta) { bestDelta = d; bestTarget = t; }
  }

  if (!bestTarget) return null;

  const note =
    bestDelta < 8  ? "Excellent match" :
    bestDelta < 18 ? "Good match — results vary with laser tuning" :
    bestDelta < 30 ? "Approximate — test on scrap before production" :
                     "No close SS colour — consider adjusting your design palette";

  return {
    targetName: bestTarget.name,
    presetId: bestTarget.presetId,
    targetHex: bestTarget.hex,
    deltaE: bestDelta,
    note,
  };
}

/**
 * Given a map of `{layerColor → preset lookup}` and the full preset table,
 * return the full LaserPreset object (or null if not found).
 */
export function getPresetById(presets: LaserPreset[], id: string): LaserPreset | null {
  return presets.find(p => p.id === id) ?? null;
}

// ─── Machine context ──────────────────────────────────────────────────────────

export interface MachineContext {
  machineName: string;
  laserType: string;   // "co2" | "fiber" | "diode" | "uv" | "green-diode"
  wattagePeak: number;
  isMopaCapable: boolean; // fiber lasers may or may not be MOPA; we assume fiber = capable
}

/**
 * Read the active MachineProfile from localStorage.
 * Returns null on SSR or when no machine is configured.
 */
export function getActiveMachineContext(): MachineContext | null {
  if (typeof window === "undefined") return null;
  try {
    const profiles = JSON.parse(localStorage.getItem("lt316_machine_profiles") ?? "[]") as Array<{
      id: string; name: string; laserType: string; wattagePeak: number;
    }>;
    const activeId = localStorage.getItem("lt316_active_machine") ?? "";
    const machine = profiles.find(p => p.id === activeId);
    if (!machine) return null;
    return {
      machineName:  machine.name,
      laserType:    machine.laserType,
      wattagePeak:  machine.wattagePeak,
      isMopaCapable: machine.laserType === "fiber",
    };
  } catch { return null; }
}

// ─── Power scaling ────────────────────────────────────────────────────────────

/**
 * Scale a preset's power% to the user's machine wattage.
 *
 * For MOPA color marking the result colour is driven by pulse energy density
 * (J/cm²).  Frequency, pulse width, speed, and line interval are kept
 * constant, so the only lever is average power.  Average power scales
 * linearly with wattage at a given power%, so to deposit the same energy we
 * scale inversely:
 *
 *   scaledPower = presetPower% × (presetRefWatts / machineWatts)
 *
 * Clamped to [1, 100].
 */
export function scalePowerForMachine(
  presetPowerPct: number,
  preset: LaserPreset,
  machineWatts: number,
): { scaled: number; refWatts: number; note: string } {
  const refWatts = (preset.wattageMin + preset.wattageMax) / 2;
  if (machineWatts <= 0 || !Number.isFinite(machineWatts)) {
    return { scaled: presetPowerPct, refWatts, note: "Machine wattage unknown — using preset default" };
  }
  const ratio   = refWatts / machineWatts;
  const scaled  = Math.max(1, Math.min(100, Math.round(presetPowerPct * ratio)));
  const diff    = Math.abs(scaled - presetPowerPct);
  const note    = diff < 2
    ? `Machine close to preset reference (${refWatts}W) — no adjustment needed`
    : scaled < presetPowerPct
      ? `Power reduced from ${presetPowerPct}% → ${scaled}% for your ${machineWatts}W machine (vs ${refWatts}W reference)`
      : `Power raised from ${presetPowerPct}% → ${scaled}% for your ${machineWatts}W machine (vs ${refWatts}W reference)`;
  return { scaled, refWatts, note };
}

export interface PresetLayerFields {
  mode: "fill";
  speedMmS: number;
  powerPct: number;
  passes: number;
  frequencyKhz?: number;
  pulseWidthNs?: number;
  lineIntervalMm?: number;
  matchedPresetId: string;
  matchedPresetLabel: string;
}

export interface ApplyPresetResult {
  fields: PresetLayerFields;
  powerNote: string;
}

/**
 * Apply a LaserPreset's parameters to a partial LaserLayer-like object,
 * scaling power to the given machine context.
 */
export function applyPresetToLayerFields(
  preset: LaserPreset,
  machine?: MachineContext | null,
): ApplyPresetResult {
  const machineWatts = machine?.wattagePeak ?? 0;
  const { scaled: scaledPower, note: powerNote } = scalePowerForMachine(
    preset.powerPct, preset, machineWatts,
  );

  const fields: PresetLayerFields = {
    mode:           "fill",
    speedMmS:       preset.speedMmS,
    powerPct:       scaledPower,
    passes:         preset.passes,
    frequencyKhz:   preset.frequencyKhz,
    pulseWidthNs:   preset.pulseWidthNs,
    lineIntervalMm: preset.lineIntervalMm,
    matchedPresetId:    preset.id,
    matchedPresetLabel: `${preset.label}${machine ? ` · scaled for ${machine.machineName} (${machineWatts}W)` : ""}`,
  };

  return { fields, powerNote };
}
