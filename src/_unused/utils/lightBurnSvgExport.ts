/**
 * Generates a composite SVG file from a LightBurn export payload.
 *
 * The resulting SVG is in millimetre units with a viewBox matching the
 * template dimensions, so LightBurn places artwork at the correct absolute
 * coordinates when imported via File → Import.
 *
 * Each placed item's svgText is embedded as a nested <svg> element that is
 * translated and scaled to its mm position and size.  The original path data
 * is preserved at full precision — no rasterisation.
 *
 * LightBurn import notes:
 *  - Use File → Import (NOT File → Open) to add the SVG to an existing project
 *  - LightBurn reads the mm width/height and positions shapes accordingly
 *  - After import, set "Start From → Absolute Coords" so coordinates match
 */

import type { LightBurnExportPayload } from "@/types/export";

// ---------------------------------------------------------------------------
// SVG string helpers (no DOM — safe in SSR and workers)
// ---------------------------------------------------------------------------

/**
 * Extract the `viewBox` attribute value from an SVG string.
 * Returns null if not found.
 */
function extractViewBox(svgText: string): string | null {
  const match = svgText.match(/viewBox\s*=\s*["']([^"']+)["']/);
  return match ? match[1] : null;
}

/**
 * Extract everything between the outermost <svg …> and </svg> tags.
 */
function extractSvgInner(svgText: string): string {
  const open = svgText.indexOf(">");
  const close = svgText.lastIndexOf("</svg>");
  if (open === -1 || close === -1) return svgText;
  return svgText.slice(open + 1, close);
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Per-item nested SVG
// ---------------------------------------------------------------------------

interface ItemBlock {
  id: string;
  name: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  svgText: string;
}

function buildItemGroup(item: ItemBlock): string {
  const vb = extractViewBox(item.svgText);
  const inner = extractSvgInner(item.svgText);

  // If we have a viewBox, use a nested <svg> so the artwork scales correctly.
  // Otherwise fall back to a translate-only group.
  if (vb) {
    return [
      `  <!-- ${esc(item.name)} (id: ${esc(item.id)}) -->`,
      `  <svg`,
      `    x="${item.xMm.toFixed(4)}"`,
      `    y="${item.yMm.toFixed(4)}"`,
      `    width="${item.widthMm.toFixed(4)}"`,
      `    height="${item.heightMm.toFixed(4)}"`,
      `    viewBox="${vb}"`,
      `    xmlns="http://www.w3.org/2000/svg"`,
      `    overflow="visible"`,
      `  >`,
      `    ${inner.trim()}`,
      `  </svg>`,
    ].join("\n");
  }

  // Fallback: just translate, no scale
  return [
    `  <!-- ${esc(item.name)} (id: ${esc(item.id)}) -->`,
    `  <g transform="translate(${item.xMm.toFixed(4)}, ${item.yMm.toFixed(4)})">`,
    `    ${inner.trim()}`,
    `  </g>`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Build a composite SVG string from a LightBurnExportPayload.
 * The document is in mm units, viewBox matches the template dimensions.
 */
export function buildLightBurnExportSvg(payload: LightBurnExportPayload): string {
  const W = payload.templateWidthMm.toFixed(4);
  const H = payload.templateHeightMm.toFixed(4);
  const generatedAt = new Date().toISOString();

  const itemGroups = payload.items
    .map((item) =>
      buildItemGroup({
        id: item.id,
        name: item.name,
        xMm: item.xMm,
        yMm: item.yMm,
        widthMm: item.widthMm,
        heightMm: item.heightMm,
        svgText: item.svgText,
      })
    )
    .join("\n\n");

  const rotaryNote = payload.rotaryAutoPlacementApplied
    ? `rotary-offset applied (origin ${payload.rotary.exportOriginXmm.toFixed(2)}, ${payload.rotary.exportOriginYmm.toFixed(2)} mm)`
    : "template-space coordinates (no rotary offset)";

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- LT316 LightBurn Export — generated ${generatedAt} -->`,
    `<!-- ${rotaryNote} -->`,
    `<!-- Import into LightBurn via File → Import, then set Start From → Absolute Coords -->`,
    `<svg`,
    `  xmlns="http://www.w3.org/2000/svg"`,
    `  width="${W}mm"`,
    `  height="${H}mm"`,
    `  viewBox="0 0 ${W} ${H}"`,
    `>`,
    itemGroups || `  <!-- no items -->`,
    `</svg>`,
  ].join("\n");
}

/**
 * Trigger a browser download for an SVG string.
 */
export function downloadSvgFile(svgContent: string, filename: string): void {
  const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
