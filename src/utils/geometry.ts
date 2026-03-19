/**
 * Geometry / transform utilities for the laser bed workspace.
 *
 * All internal values are in mm. Canvas rendering uses a pixels-per-mm scale
 * factor that is calculated from the available container size.
 */

// ---------------------------------------------------------------------------
// Unit conversion
// ---------------------------------------------------------------------------

/** Convert millimetres to pixels given a scale (px/mm). */
export function mmToPx(mm: number, scale: number): number {
  return mm * scale;
}

/** Convert pixels to millimetres given a scale (px/mm). */
export function pxToMm(px: number, scale: number): number {
  return scale > 0 ? px / scale : 0;
}

// ---------------------------------------------------------------------------
// Scale calculation
// ---------------------------------------------------------------------------

/**
 * Calculate the best uniform scale factor so that a bed of `bedWidthMm` ×
 * `bedHeightMm` fits within `containerWidthPx` × `containerHeightPx` with
 * the given padding on each side.
 */
export function calcBedScale(
  bedWidthMm: number,
  bedHeightMm: number,
  containerWidthPx: number,
  containerHeightPx: number,
  paddingPx: number = 32
): number {
  const availW = containerWidthPx - paddingPx * 2;
  const availH = containerHeightPx - paddingPx * 2;
  if (availW <= 0 || availH <= 0) return 1;
  const scaleX = availW / bedWidthMm;
  const scaleY = availH / bedHeightMm;
  return Math.min(scaleX, scaleY);
}

// ---------------------------------------------------------------------------
// Numeric helpers
// ---------------------------------------------------------------------------

/** Clamp a number between min and max (inclusive). */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Round to 4 decimal places (used for mm coordinate precision). */
export function round4(value: number): number {
  return Number(value.toFixed(4));
}

/** Round to 2 decimal places (used for display-quality mm values). */
export function round2(value: number): number {
  return Number(value.toFixed(2));
}

// ---------------------------------------------------------------------------
// Snapping (reserved for future snap-to-grid / jig features)
// ---------------------------------------------------------------------------

/**
 * Snap a value to the nearest multiple of `snapMm`.
 * Pass `snapMm = 0` to disable snapping.
 */
export function snapToGrid(valueMm: number, snapMm: number): number {
  if (snapMm <= 0) return valueMm;
  return Math.round(valueMm / snapMm) * snapMm;
}

// ---------------------------------------------------------------------------
// Bounding-box helpers
// ---------------------------------------------------------------------------

/** Clamp a placed-item's position so it stays within the bed boundaries. */
export function clampToBed(
  x: number,
  y: number,
  itemWidth: number,
  itemHeight: number,
  bedWidth: number,
  bedHeight: number
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(x, bedWidth - itemWidth)),
    y: Math.max(0, Math.min(y, bedHeight - itemHeight)),
  };
}
