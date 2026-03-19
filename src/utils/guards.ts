/**
 * Type guard utilities shared across the codebase.
 * Centralises the repeated isFiniteNumber / isFinitePositive patterns.
 */

/** Returns true when value is a finite number (not null / undefined / NaN / Infinity). */
export function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Returns true when value is a finite number that is >= 0.
 * Use this for dimensions, diameters, and other non-negative measurements.
 */
export function isFinitePositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
