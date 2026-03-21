// Fiber laser color marking — energy density → predicted oxide color
// Baseline predictions before machine calibration is applied.
// Source: oxide layer interference physics on stainless steel / titanium.

import type { FiberColorEntry } from "../types/fiberColor.ts";

/**
 * Color spectrum ordered by increasing energy density.
 * Each entry spans [edMin, edMax) in J/mm².
 * The last entry (Charcoal) extends to Infinity.
 */
export const FIBER_COLOR_SPECTRUM: FiberColorEntry[] = [
  { color: "Bare metal",  hex: "#c8c8c8", edMin: 0,     edMax: 0.30  },
  { color: "Pale straw",  hex: "#eaddaa", edMin: 0.30,  edMax: 0.60  },
  { color: "Gold",         hex: "#d4a017", edMin: 0.60,  edMax: 1.10  },
  { color: "Bronze",       hex: "#a06828", edMin: 1.10,  edMax: 1.70  },
  { color: "Brown",        hex: "#7a4520", edMin: 1.70,  edMax: 2.20  },
  { color: "Purple",       hex: "#7b5ea7", edMin: 2.20,  edMax: 3.00  },
  { color: "Violet",       hex: "#5040a0", edMin: 3.00,  edMax: 4.00  },
  { color: "Dark blue",    hex: "#1e3a6e", edMin: 4.00,  edMax: 5.50  },
  { color: "Blue",         hex: "#2878c8", edMin: 5.50,  edMax: 7.00  },
  { color: "Light blue",   hex: "#5ab4d4", edMin: 7.00,  edMax: 9.00  },
  { color: "Teal",         hex: "#2a9d8f", edMin: 9.00,  edMax: 12.00 },
  { color: "Charcoal",     hex: "#383838", edMin: 12.00, edMax: Infinity },
];

/**
 * Representative midpoint ED for each color entry.
 * Used as `baseED` in calibrated color mappings.
 * Bare metal → 0.15, Charcoal → 14.0 (reasonable representative value).
 */
export function getSpectrumMidpoint(entry: FiberColorEntry): number {
  if (!Number.isFinite(entry.edMax)) return 14.0;   // Charcoal
  if (entry.edMin === 0)             return entry.edMax / 2; // Bare metal
  return (entry.edMin + entry.edMax) / 2;
}
