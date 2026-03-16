/**
 * Admin Layout Module – Core Type Definitions
 *
 * All dimensional values are in millimetres (mm) unless explicitly noted.
 * The coordinate origin is TOP-LEFT: (0,0) is at the upper-left corner of the
 * laser bed, x increases to the right, y increases downward.
 */

// ---------------------------------------------------------------------------
// Bed configuration
// ---------------------------------------------------------------------------

export interface BedConfig {
  /** Bed width in mm */
  width: number;
  /** Bed height in mm */
  height: number;
  /** Grid cell spacing in mm */
  gridSpacing: number;
  /** Show origin indicator on the canvas */
  showOrigin: boolean;
  /**
   * Which corner is (0, 0).
   * Currently only 'top-left' is fully supported; 'bottom-left' is reserved
   * for future laser-head coordinate-system parity.
   */
  originPosition: "top-left" | "bottom-left";
}

export const DEFAULT_BED_CONFIG: BedConfig = {
  width: 300,
  height: 300,
  gridSpacing: 20,
  showOrigin: true,
  originPosition: "top-left",
};

// ---------------------------------------------------------------------------
// SVG asset (uploaded file)
// ---------------------------------------------------------------------------

export interface SvgAsset {
  /** Unique identifier */
  id: string;
  /** Original file name */
  name: string;
  /** Raw SVG string as read from the file */
  content: string;
  /** Parsed viewBox string, e.g. "0 0 200 150" */
  viewBox?: string;
  /** Intrinsic width derived from viewBox or width attribute (px) */
  naturalWidth?: number;
  /** Intrinsic height derived from viewBox or height attribute (px) */
  naturalHeight?: number;
  /** When the asset was added to the session */
  uploadedAt: Date;
}

// ---------------------------------------------------------------------------
// Placed item (an asset instance on the bed)
// ---------------------------------------------------------------------------

export interface PlacedItem {
  /** Unique identifier for this instance */
  id: string;
  /** References the SvgAsset.id it was sourced from */
  assetId: string;
  /** X position in mm from the origin */
  x: number;
  /** Y position in mm from the origin */
  y: number;
  /** Rendered width in mm */
  width: number;
  /** Rendered height in mm */
  height: number;
  /** Rotation in degrees (clockwise) */
  rotation: number;
  /** Future: prevent editing / moving */
  locked?: boolean;
  /** Future: hide without deleting */
  visible?: boolean;
}
