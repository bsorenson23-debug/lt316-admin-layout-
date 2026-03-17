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

export type WorkspaceMode = "flat-bed" | "tumbler-wrap";

export interface TumblerGuideBand {
  id: string;
  label: string;
  upperGrooveYmm: number;
  lowerGrooveYmm: number;
}

export interface BedConfig {
  /** Active workspace mode */
  workspaceMode: WorkspaceMode;
  /** Flat-bed base width in mm */
  flatWidth: number;
  /** Flat-bed base height in mm */
  flatHeight: number;
  /** Tumbler diameter in mm */
  tumblerDiameterMm: number;
  /** Tumbler printable height in mm */
  tumblerPrintableHeightMm: number;
  /** Optional tumbler metadata for future tapered workflows */
  tumblerShapeType?: "straight" | "tapered" | "unknown";
  tumblerOutsideDiameterMm?: number;
  tumblerTopDiameterMm?: number;
  tumblerBottomDiameterMm?: number;
  tumblerOverallHeightMm?: number;
  tumblerUsableHeightMm?: number;
  tumblerCapacityOz?: number;
  tumblerHasHandle?: boolean;
  tumblerBrand?: string;
  tumblerModel?: string;
  tumblerProfileId?: string;
  tumblerGuideBand?: TumblerGuideBand;
  /** Show editor-only groove guide overlays for tumbler profiles */
  showTumblerGuideBand: boolean;
  /** Derived template dimensions from raw tumbler spec */
  tumblerTemplateWidthMm?: number;
  tumblerTemplateHeightMm?: number;
  /** Active workspace width in mm (flat width or tumbler circumference) */
  width: number;
  /** Active workspace height in mm (flat height or tumbler printable height) */
  height: number;
  /** Grid cell spacing in mm */
  gridSpacing: number;
  /** Snap dragged item movement to the current grid spacing */
  snapToGrid: boolean;
  /** Show origin indicator on the canvas */
  showOrigin: boolean;
  /** Show guide crosshair overlays on the canvas */
  showCrosshair: boolean;
  /** Which crosshair guides are visible */
  crosshairMode: "origin" | "center" | "both";
  /**
   * Which corner is (0, 0).
   * Currently only 'top-left' is fully supported; 'bottom-left' is reserved
   * for future laser-head coordinate-system parity.
   */
  originPosition: "top-left" | "bottom-left";
}

export function computeTumblerWrapWidthMm(diameterMm: number): number {
  return Math.PI * diameterMm;
}

export function normalizeBedConfig(config: BedConfig): BedConfig {
  const isTumbler = config.workspaceMode === "tumbler-wrap";
  let width = config.flatWidth;
  let height = config.flatHeight;

  if (isTumbler) {
    const hasTop = Number.isFinite(config.tumblerTopDiameterMm);
    const hasBottom = Number.isFinite(config.tumblerBottomDiameterMm);
    const hasOutside = Number.isFinite(config.tumblerOutsideDiameterMm);
    const isTapered = config.tumblerShapeType === "tapered" && hasTop && hasBottom;

    if (isTapered) {
      const top = config.tumblerTopDiameterMm ?? config.tumblerDiameterMm;
      const bottom = config.tumblerBottomDiameterMm ?? config.tumblerDiameterMm;
      width = Math.PI * ((top + bottom) / 2);
    } else if (hasOutside) {
      width = Math.PI * (config.tumblerOutsideDiameterMm ?? config.tumblerDiameterMm);
    } else {
      width = computeTumblerWrapWidthMm(config.tumblerDiameterMm);
    }

    if (Number.isFinite(config.tumblerUsableHeightMm)) {
      height = config.tumblerUsableHeightMm ?? config.tumblerPrintableHeightMm;
    } else if (Number.isFinite(config.tumblerOverallHeightMm)) {
      height = config.tumblerOverallHeightMm ?? config.tumblerPrintableHeightMm;
    } else {
      height = config.tumblerPrintableHeightMm;
    }
  }

  return {
    ...config,
    width,
    height,
    showTumblerGuideBand: config.showTumblerGuideBand ?? true,
    tumblerTemplateWidthMm: width,
    tumblerTemplateHeightMm: height,
  };
}

export const DEFAULT_BED_CONFIG: BedConfig = {
  workspaceMode: "flat-bed",
  flatWidth: 300,
  flatHeight: 300,
  tumblerDiameterMm: 87,
  tumblerPrintableHeightMm: 145,
  width: 300,
  height: 300,
  showTumblerGuideBand: true,
  gridSpacing: 25,
  snapToGrid: false,
  showOrigin: true,
  showCrosshair: true,
  crosshairMode: "center",
  originPosition: "top-left",
};

// ---------------------------------------------------------------------------
// SVG asset (uploaded file)
// ---------------------------------------------------------------------------

export interface SvgBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

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
  /** SVG document bounds (typically viewBox bounds) */
  documentBounds: SvgBounds;
  /** Visible artwork bounds measured from rendered SVG content */
  artworkBounds: SvgBounds;
  /** When the asset was added to the session */
  uploadedAt: Date;
}

// ---------------------------------------------------------------------------
// Placed item (an asset instance on the bed)
// ---------------------------------------------------------------------------

export interface PlacedItemDefaults {
  /** Default X position in mm (top-left of item box) */
  x: number;
  /** Default Y position in mm (top-left of item box) */
  y: number;
  /** Default width in mm */
  width: number;
  /** Default height in mm */
  height: number;
  /** Default rotation in degrees */
  rotation: number;
}

export interface PlacedItem {
  /** Unique identifier for this instance */
  id: string;
  /** References the SvgAsset.id it was sourced from */
  assetId: string;
  /** Snapshot name from source asset at creation time */
  name: string;
  /** Snapshot SVG payload from source asset at creation time */
  svgText: string;
  /** Preserves the imported source payload for optional normalization workflows */
  sourceSvgText: string;
  /** Document bounds snapshot used for placement math */
  documentBounds: SvgBounds;
  /** Artwork bounds snapshot used for alignment math */
  artworkBounds: SvgBounds;
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
  /** Initial values used by inspector reset */
  defaults: PlacedItemDefaults;
  /** Future: prevent editing / moving */
  locked?: boolean;
  /** Future: hide without deleting */
  visible?: boolean;
}

export type PlacedItemPatch = Partial<
  Omit<
    PlacedItem,
    | "id"
    | "assetId"
    | "name"
    | "svgText"
    | "sourceSvgText"
    | "documentBounds"
    | "artworkBounds"
    | "defaults"
    | "locked"
    | "visible"
  >
>;

export type ItemAlignmentMode =
  | "center-bed"
  | "center-x"
  | "center-y"
  | "fit-bed";
