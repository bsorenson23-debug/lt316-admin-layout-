/**
 * laserLayer.ts
 *
 * Color-keyed laser layer system (LightBurn-style).
 *
 * Each layer has a stroke color + laser settings (speed, power, passes, mode).
 * SVG paths are assigned to a layer by matching their stroke color.
 */

export type LayerMode = "line" | "fill" | "offset-fill";

export interface LaserLayer {
  /** Unique id (matches a palette slot, e.g. "layer-0") */
  id: string;
  /** Hex stroke color this layer targets, e.g. "#ff0000" */
  color: string;
  /** Human-readable layer name */
  name: string;
  /** Burn mode */
  mode: LayerMode;
  /** Travel speed in mm/s */
  speedMmS: number;
  /** Laser power 0–100 % */
  powerPct: number;
  /** Number of passes */
  passes: number;
  /** Whether this layer is enabled for export */
  enabled: boolean;
  /**
   * Priority / burn order (0 = first).
   * Lower numbers burn before higher numbers.
   */
  priority: number;

  // ── Advanced MOPA / fiber settings (optional) ──────────────────────────
  /** Pulse repetition frequency in kHz (MOPA/fiber only) */
  frequencyKhz?: number;
  /** Pulse width in nanoseconds (MOPA only) */
  pulseWidthNs?: number;
  /** Hatch/fill line interval in mm */
  lineIntervalMm?: number;

  // ── Smart lookup metadata ───────────────────────────────────────────────
  /** ID of the LaserPreset these settings were auto-filled from */
  matchedPresetId?: string;
  /** Human-readable label of that preset */
  matchedPresetLabel?: string;
  /** ΔE colour-match score (lower = better, 0 = perfect) */
  matchDeltaE?: number;
  /** The target colour name the match resolved to (e.g. "Gold / Yellow") */
  matchTargetName?: string;
  /** The reference hex for the matched target colour */
  matchTargetHex?: string;
}

export const LAYER_MODE_LABELS: Record<LayerMode, string> = {
  "line":        "Line (stroke/cut)",
  "fill":        "Fill (raster engrave)",
  "offset-fill": "Offset Fill",
};

// ─── Standard 20-color palette ───────────────────────────────────────────────
// Mirrors LightBurn's standard color order for compatibility.

export interface PaletteEntry {
  color: string;
  name: string;
}

export const LAYER_PALETTE: PaletteEntry[] = [
  { color: "#000000", name: "Black" },
  { color: "#0000ff", name: "Blue" },
  { color: "#ff0000", name: "Red" },
  { color: "#00ff00", name: "Green" },
  { color: "#ffff00", name: "Yellow" },
  { color: "#00ffff", name: "Cyan" },
  { color: "#ff00ff", name: "Magenta" },
  { color: "#ff6600", name: "Orange" },
  { color: "#00ff80", name: "Spring" },
  { color: "#8000ff", name: "Purple" },
  { color: "#0080ff", name: "Sky Blue" },
  { color: "#ff0080", name: "Hot Pink" },
  { color: "#804000", name: "Brown" },
  { color: "#408000", name: "Olive" },
  { color: "#004080", name: "Navy" },
  { color: "#ff8080", name: "Salmon" },
  { color: "#80ff80", name: "Lime" },
  { color: "#8080ff", name: "Lavender" },
  { color: "#c0c0c0", name: "Silver" },
  { color: "#ffffff", name: "White" },
];

/** Build the default layer set (one per palette entry, all disabled). */
export function buildDefaultLayers(): LaserLayer[] {
  return LAYER_PALETTE.map((entry, idx) => ({
    id: `layer-${idx}`,
    color: entry.color,
    name: entry.name,
    mode: "line" as LayerMode,
    speedMmS: 100,
    powerPct: 80,
    passes: 1,
    enabled: false,
    priority: idx,
    // Advanced fields start undefined
    frequencyKhz:    undefined,
    pulseWidthNs:    undefined,
    lineIntervalMm:  undefined,
    matchedPresetId: undefined,
    matchedPresetLabel: undefined,
    matchDeltaE:     undefined,
    matchTargetName: undefined,
    matchTargetHex:  undefined,
  }));
}

/**
 * Scan an SVG string and return the unique stroke hex colors it uses,
 * normalised to lowercase 6-digit hex (or null for "none" / missing).
 */
export function extractSvgColors(svgContent: string): string[] {
  if (typeof window === "undefined") return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  if (doc.querySelector("parsererror")) return [];

  const SHAPE_TAGS = ["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"];
  const colorSet = new Set<string>();

  for (const tag of SHAPE_TAGS) {
    for (const el of Array.from(doc.querySelectorAll(tag))) {
      // stroke attribute
      const strokeAttr = el.getAttribute("stroke");
      const styleAttr  = el.getAttribute("style") ?? "";
      const styleMatch = styleAttr.match(/stroke\s*:\s*([^;]+)/);
      const rawStroke  = styleMatch ? styleMatch[1].trim() : (strokeAttr ?? "");

      // fill attribute (for fill-mode layers)
      const fillAttr   = el.getAttribute("fill");
      const fillMatch  = styleAttr.match(/fill\s*:\s*([^;]+)/);
      const rawFill    = fillMatch ? fillMatch[1].trim() : (fillAttr ?? "");

      for (const raw of [rawStroke, rawFill]) {
        const norm = normalizeColor(raw);
        if (norm) colorSet.add(norm);
      }
    }
  }

  return Array.from(colorSet);
}

/** Normalise a CSS color string to lowercase 6-digit hex, or null if invalid/none. */
function normalizeColor(raw: string): string | null {
  if (!raw || raw === "none" || raw === "transparent" || raw === "currentColor") return null;

  // Already 6-digit hex
  const hex6 = raw.match(/^#([0-9a-fA-F]{6})$/);
  if (hex6) return `#${hex6[1].toLowerCase()}`;

  // 3-digit hex
  const hex3 = raw.match(/^#([0-9a-fA-F]{3})$/);
  if (hex3) {
    const [r, g, b] = hex3[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  // For named colors / rgb() — use a canvas trick if available
  if (typeof document !== "undefined") {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = raw;
        const computed = ctx.fillStyle; // browser normalises to hex or rgba
        const h6 = computed.match(/^#([0-9a-fA-F]{6})$/);
        if (h6) return `#${h6[1].toLowerCase()}`;
      }
    } catch { /* ignore */ }
  }

  return null;
}

/**
 * Recolour all strokes in an SVG that match `fromColor` to `toColor`.
 * Returns the modified SVG string.
 */
export function recolorSvgLayer(
  svgContent: string,
  fromColor: string,
  toColor: string,
): string {
  if (typeof window === "undefined") return svgContent;

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, "image/svg+xml");
  if (doc.querySelector("parsererror")) return svgContent;

  const SHAPE_TAGS = ["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"];
  const fromNorm = normalizeColor(fromColor);
  if (!fromNorm) return svgContent;

  for (const tag of SHAPE_TAGS) {
    for (const el of Array.from(doc.querySelectorAll(tag))) {
      const strokeAttr = el.getAttribute("stroke");
      if (strokeAttr && normalizeColor(strokeAttr) === fromNorm) {
        el.setAttribute("stroke", toColor);
      }
      const style = el.getAttribute("style");
      if (style) {
        const updated = style.replace(
          /stroke\s*:\s*[^;]+/,
          (match) => {
            const val = match.split(":")[1]?.trim() ?? "";
            return normalizeColor(val) === fromNorm ? `stroke:${toColor}` : match;
          },
        );
        if (updated !== style) el.setAttribute("style", updated);
      }
    }
  }

  return new XMLSerializer().serializeToString(doc);
}
