import type { LightBurnAlignmentGuidePayload, LightBurnExportPayload } from "../types/export";

const LIGHTBURN_SVG_DPI = 96;
const LIGHTBURN_PX_PER_MM = LIGHTBURN_SVG_DPI / 25.4;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMm(value: number): string {
  return value.toFixed(4);
}

function formatScale(value: number): string {
  return value.toFixed(6);
}

function formatPx(value: number): string {
  return value.toFixed(4);
}

function mmToLightBurnPx(valueMm: number): number {
  return valueMm * LIGHTBURN_PX_PER_MM;
}

function extractSvgInner(svgText: string): string {
  const open = svgText.indexOf(">");
  const close = svgText.lastIndexOf("</svg>");
  if (open === -1 || close === -1 || close <= open) {
    return svgText.trim();
  }
  return svgText.slice(open + 1, close).trim();
}

function parseSvgViewport(svgText: string): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  const viewBoxMatch = /viewBox\s*=\s*["']([^"']+)["']/i.exec(svgText);
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number);
    if (
      parts.length >= 4 &&
      Number.isFinite(parts[0]) &&
      Number.isFinite(parts[1]) &&
      Number.isFinite(parts[2]) &&
      Number.isFinite(parts[3]) &&
      parts[2] > 0 &&
      parts[3] > 0
    ) {
      return {
        x: parts[0],
        y: parts[1],
        width: parts[2],
        height: parts[3],
      };
    }
  }

  const svgTagMatch = /<svg[^>]*>/i.exec(svgText);
  if (!svgTagMatch) return null;
  const svgTag = svgTagMatch[0];
  const widthMatch = /width\s*=\s*["']([^"']+)["']/i.exec(svgTag);
  const heightMatch = /height\s*=\s*["']([^"']+)["']/i.exec(svgTag);
  if (!widthMatch || !heightMatch) return null;

  const width = Number.parseFloat(widthMatch[1]);
  const height = Number.parseFloat(heightMatch[1]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return { x: 0, y: 0, width, height };
}

function buildItemGroup(item: LightBurnExportPayload["items"][number]): string {
  const inner = extractSvgInner(item.svgText);
  const viewport = parseSvgViewport(item.svgText);
  const xPx = mmToLightBurnPx(item.xMm);
  const yPx = mmToLightBurnPx(item.yMm);
  const widthPx = mmToLightBurnPx(item.widthMm);
  const heightPx = mmToLightBurnPx(item.heightMm);

  if (!viewport) {
    const centerX = xPx + widthPx / 2;
    const centerY = yPx + heightPx / 2;
    if (Math.abs(item.rotationDeg) > 0.0001) {
      return [
        `  <!-- ${escapeXml(item.name)} (${escapeXml(item.id)}) -->`,
        `  <g transform="rotate(${formatMm(item.rotationDeg)} ${formatPx(centerX)} ${formatPx(centerY)})">`,
        `    <g transform="translate(${formatPx(xPx)} ${formatPx(yPx)})">`,
        `      ${inner || "<!-- empty item -->"}`,
        `    </g>`,
        `  </g>`,
      ].join("\n");
    }

    return [
      `  <!-- ${escapeXml(item.name)} (${escapeXml(item.id)}) -->`,
      `  <g transform="translate(${formatPx(xPx)} ${formatPx(yPx)})">`,
      `    ${inner || "<!-- empty item -->"}`,
      `  </g>`,
    ].join("\n");
  }

  const scaleX = widthPx / viewport.width;
  const scaleY = heightPx / viewport.height;
  const centerX = xPx + widthPx / 2;
  const centerY = yPx + heightPx / 2;
  const baseTransform = [
    `translate(${formatPx(xPx)} ${formatPx(yPx)})`,
    `scale(${formatScale(scaleX)} ${formatScale(scaleY)})`,
    `translate(${formatMm(-viewport.x)} ${formatMm(-viewport.y)})`,
  ].join(" ");

  if (Math.abs(item.rotationDeg) > 0.0001) {
    return [
      `  <!-- ${escapeXml(item.name)} (${escapeXml(item.id)}) -->`,
      `  <g transform="rotate(${formatMm(item.rotationDeg)} ${formatPx(centerX)} ${formatPx(centerY)})">`,
      `    <g transform="${baseTransform}">`,
      `      ${inner || "<!-- empty item -->"}`,
      `    </g>`,
      `  </g>`,
    ].join("\n");
  }

  return [
    `  <!-- ${escapeXml(item.name)} (${escapeXml(item.id)}) -->`,
    `  <g transform="${baseTransform}">`,
    `    ${inner || "<!-- empty item -->"}`,
    `  </g>`,
  ].join("\n");
}

export function buildLightBurnExportSvg(payload: LightBurnExportPayload): string {
  const widthPx = formatPx(mmToLightBurnPx(payload.templateWidthMm));
  const heightPx = formatPx(mmToLightBurnPx(payload.templateHeightMm));
  const rotaryNote = payload.rotaryAutoPlacementApplied
    ? `rotary-offset applied (${payload.rotary.exportOriginXmm.toFixed(2)}, ${payload.rotary.exportOriginYmm.toFixed(2)} mm)`
    : "template-space coordinates";
  const itemGroups = payload.items.map((item) => buildItemGroup(item)).join("\n\n");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- LT316 LightBurn SVG export -->`,
    `<!-- Original SVG geometry preserved; export applies placement transforms only -->`,
    `<!-- SVG coordinates emitted in 96 DPI px so LightBurn imports the intended mm size -->`,
    `<!-- ${rotaryNote} -->`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}">`,
    itemGroups || `  <!-- no items -->`,
    `</svg>`,
  ].join("\n");
}

function buildGuideLineGroup(
  line: LightBurnAlignmentGuidePayload["lines"][number],
  widthMm: number,
  heightMm: number,
): string {
  const xPx = line.xMm != null ? formatPx(mmToLightBurnPx(line.xMm)) : null;
  const yPx = line.yMm != null ? formatPx(mmToLightBurnPx(line.yMm)) : null;
  const heightPx = formatPx(mmToLightBurnPx(heightMm));
  const widthPx = formatPx(mmToLightBurnPx(widthMm));
  const stroke =
    line.kind === "front-meridian"
      ? "#2f84d6"
      : line.kind === "logo-center"
        ? "#34c759"
      : line.kind === "printable-top" || line.kind === "printable-bottom"
        ? "#20c997"
      : line.kind === "lid-boundary" || line.kind === "rim-boundary" || line.kind === "base-boundary"
        ? "#f0c15d"
      : line.kind === "handle-meridian"
        ? "#f5a24a"
        : line.kind.startsWith("keep-out")
          ? "#d96b5f"
          : "#b7c0ca";
  const dash =
    line.kind.startsWith("keep-out")
      ? "10 6"
      : line.kind === "printable-top" || line.kind === "printable-bottom"
        ? "12 5"
        : "8 6";
  return [
    `  <!-- ${escapeXml(line.label)} -->`,
    line.orientation === "horizontal" && yPx != null
      ? `  <line x1="0" y1="${yPx}" x2="${widthPx}" y2="${yPx}" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="${dash}" vector-effect="non-scaling-stroke" />`
      : `  <line x1="${xPx}" y1="0" x2="${xPx}" y2="${heightPx}" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="${dash}" vector-effect="non-scaling-stroke" />`,
  ].join("\n");
}

function buildLogoGuideGroup(logoRegion: NonNullable<LightBurnAlignmentGuidePayload["logoRegion"]>): string {
  const halfWidthMm = logoRegion.widthMm / 2;
  const halfHeightMm = logoRegion.heightMm / 2;
  const topMm = Math.max(0, logoRegion.centerYMm - halfHeightMm);
  const leftMm = logoRegion.centerXMm - halfWidthMm;
  const rightMm = logoRegion.centerXMm + halfWidthMm;
  const rectSegments = logoRegion.wrapsAround
    ? [
        { x: 0, width: rightMm },
        { x: leftMm, width: Math.max(0, logoRegion.widthMm - rightMm) },
      ]
    : [{ x: leftMm, width: logoRegion.widthMm }];

  const rects = rectSegments.map((segment, index) => {
    const xPx = formatPx(mmToLightBurnPx(segment.x));
    const yPx = formatPx(mmToLightBurnPx(topMm));
    const widthPx = formatPx(mmToLightBurnPx(Math.max(0, segment.width)));
    const heightPx = formatPx(mmToLightBurnPx(logoRegion.heightMm));
    return `  <rect x="${xPx}" y="${yPx}" width="${widthPx}" height="${heightPx}" fill="none" stroke="#34c759" stroke-width="1.5" stroke-dasharray="6 4" vector-effect="non-scaling-stroke" data-segment="${index}" />`;
  }).join("\n");

  const centerXPx = formatPx(mmToLightBurnPx(logoRegion.centerXMm));
  const centerYPx = formatPx(mmToLightBurnPx(logoRegion.centerYMm));
  return [
    `  <!-- ${escapeXml(logoRegion.label)} -->`,
    rects,
    `  <line x1="${centerXPx}" y1="0" x2="${centerXPx}" y2="${formatPx(mmToLightBurnPx(logoRegion.centerYMm + halfHeightMm))}" stroke="#34c759" stroke-width="1.2" stroke-dasharray="4 4" vector-effect="non-scaling-stroke" />`,
    `  <line x1="${formatPx(mmToLightBurnPx(logoRegion.centerXMm - halfWidthMm))}" y1="${centerYPx}" x2="${formatPx(mmToLightBurnPx(logoRegion.centerXMm + halfWidthMm))}" y2="${centerYPx}" stroke="#34c759" stroke-width="1.2" stroke-dasharray="4 4" vector-effect="non-scaling-stroke" />`,
    `  <text x="${centerXPx}" y="${formatPx(mmToLightBurnPx(Math.max(4, topMm - 2)))}" text-anchor="middle" font-size="11" fill="#34c759">${escapeXml(`${logoRegion.label} (${Math.round(logoRegion.confidence * 100)}%)`)}</text>`,
  ].join("\n");
}

export function buildLightBurnAlignmentGuideSvg(payload: LightBurnAlignmentGuidePayload): string {
  const widthPx = formatPx(mmToLightBurnPx(payload.templateWidthMm));
  const heightPx = formatPx(mmToLightBurnPx(payload.templateHeightMm));
  const guideLines = payload.lines
    .map((line) => buildGuideLineGroup(line, payload.templateWidthMm, payload.templateHeightMm))
    .join("\n\n");
  const logoGuide = payload.logoRegion ? buildLogoGuideGroup(payload.logoRegion) : "";

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- LT316 LightBurn alignment guides -->`,
    `<!-- Body-only wrap space. Wrap width is authoritative. -->`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}">`,
    guideLines || `  <!-- no guides -->`,
    logoGuide,
    `</svg>`,
  ].join("\n");
}

export function downloadSvgFile(svgContent: string, filename: string): void {
  const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
