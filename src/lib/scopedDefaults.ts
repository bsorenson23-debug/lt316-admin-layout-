/**
 * scopedDefaults.ts — Scoped configuration fallback
 *
 * Provides sensible default laser settings based on product type and laser type.
 * When creating a new template, these defaults are inherited so operators don't
 * start from scratch every time.
 *
 * Fallback hierarchy:
 *   1. Template's own laserSettings (if edited)
 *   2. Surface-type defaults (tumbler/mug/bottle/flat × fiber/co2/diode)
 *   3. Global defaults
 */

import type { ProductTemplateLaserSettings } from "@/types/productTemplate";

type ProductType = "tumbler" | "mug" | "bottle" | "flat";
type LaserType = "fiber" | "co2" | "diode";

// ── Global baseline ──────────────────────────────────────────────────────────

const GLOBAL_DEFAULT: ProductTemplateLaserSettings = {
  power: 50,
  speed: 300,
  frequency: 30,
  lineInterval: 0.06,
  materialProfileId: "",
  rotaryPresetId: "",
};

// ── Per surface-type × laser-type defaults ───────────────────────────────────
// Keys: `${productType}:${laserType}`

const SCOPED_DEFAULTS: Record<string, Partial<ProductTemplateLaserSettings>> = {
  // Tumblers — fiber (MOPA) — stainless steel oxide coloring
  "tumbler:fiber": {
    power: 40,
    speed: 200,
    frequency: 30,
    lineInterval: 0.05,
  },
  // Tumblers — CO₂ — powder-coated surface ablation
  "tumbler:co2": {
    power: 25,
    speed: 350,
    frequency: 20,
    lineInterval: 0.08,
  },
  // Tumblers — diode — low power, slow
  "tumbler:diode": {
    power: 80,
    speed: 150,
    frequency: 20,
    lineInterval: 0.08,
  },
  // Mugs — typically ceramic coating
  "mug:co2": {
    power: 30,
    speed: 300,
    frequency: 20,
    lineInterval: 0.08,
  },
  "mug:fiber": {
    power: 35,
    speed: 250,
    frequency: 30,
    lineInterval: 0.06,
  },
  // Bottles — similar to tumblers
  "bottle:fiber": {
    power: 40,
    speed: 200,
    frequency: 30,
    lineInterval: 0.05,
  },
  "bottle:co2": {
    power: 25,
    speed: 350,
    frequency: 20,
    lineInterval: 0.08,
  },
  // Flat items — typically wood, acrylic, leather
  "flat:co2": {
    power: 20,
    speed: 400,
    frequency: 20,
    lineInterval: 0.1,
  },
  "flat:fiber": {
    power: 30,
    speed: 300,
    frequency: 30,
    lineInterval: 0.06,
  },
  "flat:diode": {
    power: 70,
    speed: 200,
    frequency: 20,
    lineInterval: 0.1,
  },
};

/**
 * Get default laser settings for a given product type and laser type.
 * Falls back through: scoped → global.
 */
export function getDefaultLaserSettings(
  productType: ProductType,
  laserType: LaserType,
): ProductTemplateLaserSettings {
  const scopeKey = `${productType}:${laserType}`;
  const scoped = SCOPED_DEFAULTS[scopeKey];
  return { ...GLOBAL_DEFAULT, ...scoped };
}

/**
 * Merge operator-edited settings over scoped defaults.
 * Only non-empty overrides are kept; unset fields fall back.
 */
export function mergeWithDefaults(
  productType: ProductType,
  laserType: LaserType,
  overrides: Partial<ProductTemplateLaserSettings>,
): ProductTemplateLaserSettings {
  const base = getDefaultLaserSettings(productType, laserType);
  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(overrides).filter(([, v]) => v !== undefined && v !== "" && v !== 0),
    ),
  };
}
