/**
 * SVG parsing helpers.
 *
 * These utilities extract just enough information from an uploaded SVG string
 * to preview and place it on the laser bed canvas.
 */

import { SvgAsset } from "@/types/admin";

// ---------------------------------------------------------------------------
// Attribute extraction
// ---------------------------------------------------------------------------

/** Pull the value of a named attribute from an SVG string (first match). */
function extractAttr(svg: string, attr: string): string | undefined {
  const re = new RegExp(`${attr}\\s*=\\s*["']([^"']*)["']`, "i");
  const m = svg.match(re);
  return m?.[1];
}

/** Parse a numeric px value from an SVG width/height attribute like "200px" or "200". */
function parseDimension(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = parseFloat(value);
  return isNaN(n) ? undefined : n;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a raw SVG string into an SvgAsset record.
 * Only the metadata that can be derived cheaply from the string is populated.
 */
export function parseSvgAsset(
  id: string,
  name: string,
  content: string
): SvgAsset {
  const viewBox = extractAttr(content, "viewBox");
  let naturalWidth: number | undefined;
  let naturalHeight: number | undefined;

  if (viewBox) {
    const parts = viewBox.trim().split(/\s+|,/);
    if (parts.length === 4) {
      naturalWidth = parseDimension(parts[2]);
      naturalHeight = parseDimension(parts[3]);
    }
  }

  // Fall back to explicit width/height attributes
  if (!naturalWidth) naturalWidth = parseDimension(extractAttr(content, "width"));
  if (!naturalHeight) naturalHeight = parseDimension(extractAttr(content, "height"));

  return {
    id,
    name,
    content,
    viewBox,
    naturalWidth,
    naturalHeight,
    uploadedAt: new Date(),
  };
}

/**
 * Create a data URL from an SVG string so it can be used in <img> or CSS.
 */
export function svgToDataUrl(svgContent: string): string {
  const encoded = encodeURIComponent(svgContent);
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}

/**
 * Return a safe viewBox string, defaulting to "0 0 100 100" if none is available.
 */
export function resolveViewBox(asset: SvgAsset): string {
  if (asset.viewBox) return asset.viewBox;
  const w = asset.naturalWidth ?? 100;
  const h = asset.naturalHeight ?? 100;
  return `0 0 ${w} ${h}`;
}

/**
 * Compute a default placed-item size (in mm) from an asset's intrinsic
 * dimensions. Scales so the longest side equals `maxSizeMm`.
 */
export function defaultPlacedSize(
  asset: SvgAsset,
  maxSizeMm: number = 80
): { width: number; height: number } {
  const w = asset.naturalWidth ?? 100;
  const h = asset.naturalHeight ?? 100;
  const ratio = w / (h || 1);
  if (w >= h) {
    return { width: maxSizeMm, height: maxSizeMm / ratio };
  }
  return { width: maxSizeMm * ratio, height: maxSizeMm };
}
