import type {
  DetectedSvgTextNode,
  ImageTextDetectionResult,
  TextStylePreset,
} from "@/types/textDetection";

const DEFAULT_FONT_FAMILY = "Arial";
const DEFAULT_FONT_SIZE = 48;
const DEFAULT_FILL = "#000000";
const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function parseNumber(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function parseStyleAttribute(styleText: string | null): Record<string, string> {
  if (!styleText) return {};
  return styleText
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, part) => {
      const colonIndex = part.indexOf(":");
      if (colonIndex === -1) return acc;
      const key = part.slice(0, colonIndex).trim().toLowerCase();
      const value = part.slice(colonIndex + 1).trim();
      if (key) acc[key] = value;
      return acc;
    }, {});
}

function getStyleValue(element: Element, attributeName: string, cssName: string): string | null {
  let current: Element | null = element;
  while (current) {
    const attributeValue = current.getAttribute(attributeName);
    if (attributeValue) return attributeValue;
    const styleValue = parseStyleAttribute(current.getAttribute("style"))[cssName];
    if (styleValue) return styleValue;
    current = current.parentElement;
  }
  return null;
}

function parseRotateValue(transform: string | null): number {
  if (!transform) return 0;
  const matches = transform.match(/rotate\(([-+]?\d*\.?\d+)/gi);
  if (!matches) return 0;
  return matches.reduce((total, match) => {
    const numeric = Number.parseFloat(match.replace(/rotate\(/i, ""));
    return Number.isFinite(numeric) ? total + numeric : total;
  }, 0);
}

function getRotationDegrees(element: Element): number {
  let total = 0;
  let current: Element | null = element;
  while (current) {
    total += parseRotateValue(current.getAttribute("transform"));
    current = current.parentElement;
  }
  return total;
}

function parseAnchor(value: string | null | undefined): "start" | "middle" | "end" {
  if (value === "middle" || value === "end") return value;
  return "start";
}

function normalizeEditableColor(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (trimmed && HEX_COLOR_PATTERN.test(trimmed)) {
    return trimmed;
  }
  return DEFAULT_FILL;
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function extractSvgTextNodes(svgContent: string): DetectedSvgTextNode[] {
  if (typeof DOMParser === "undefined") return [];
  try {
    const parser = new DOMParser();
    const document = parser.parseFromString(svgContent, "image/svg+xml");
    const textNodes = Array.from(document.querySelectorAll("text"));

    return textNodes
      .map((node, index) => {
        const text = sanitizeText(node.textContent);
        if (!text) return null;

        return {
          index,
          text,
          fontFamily: getStyleValue(node, "font-family", "font-family") ?? DEFAULT_FONT_FAMILY,
          fontSize: parseNumber(getStyleValue(node, "font-size", "font-size"), DEFAULT_FONT_SIZE),
          fontWeight: getStyleValue(node, "font-weight", "font-weight") ?? "normal",
          fontStyle: getStyleValue(node, "font-style", "font-style") ?? "normal",
          fill: normalizeEditableColor(getStyleValue(node, "fill", "fill")),
          letterSpacing: parseNumber(
            getStyleValue(node, "letter-spacing", "letter-spacing"),
            0,
          ),
          angleDeg: getRotationDegrees(node),
          x: parseNumber(node.getAttribute("x"), 0),
          y: parseNumber(node.getAttribute("y"), DEFAULT_FONT_SIZE),
          textAnchor: parseAnchor(
            getStyleValue(node, "text-anchor", "text-anchor") ?? node.getAttribute("text-anchor"),
          ),
        } satisfies DetectedSvgTextNode;
      })
      .filter((value): value is DetectedSvgTextNode => value !== null);
  } catch {
    return [];
  }
}

function setOrRemoveAttribute(element: Element, name: string, value: string | null) {
  if (!value) {
    element.removeAttribute(name);
    return;
  }
  element.setAttribute(name, value);
}

export function applyTextReplacementToSvg(
  svgContent: string,
  targetIndex: number,
  preset: TextStylePreset,
): string {
  const parser = new DOMParser();
  const document = parser.parseFromString(svgContent, "image/svg+xml");
  const textNodes = Array.from(document.querySelectorAll("text"));
  const target = textNodes[targetIndex];

  if (!target) {
    throw new Error("Selected text element could not be found.");
  }

  target.textContent = preset.text;
  setOrRemoveAttribute(target, "font-family", preset.fontFamily || DEFAULT_FONT_FAMILY);
  setOrRemoveAttribute(target, "font-size", String(preset.fontSize || DEFAULT_FONT_SIZE));
  setOrRemoveAttribute(target, "font-weight", preset.fontWeight || "normal");
  setOrRemoveAttribute(target, "font-style", preset.fontStyle || "normal");
  setOrRemoveAttribute(target, "fill", preset.fill || DEFAULT_FILL);
  setOrRemoveAttribute(target, "letter-spacing", String(preset.letterSpacing || 0));
  setOrRemoveAttribute(target, "text-anchor", preset.textAnchor || "start");

  const x = parseNumber(target.getAttribute("x"), 0);
  const y = parseNumber(target.getAttribute("y"), preset.fontSize || DEFAULT_FONT_SIZE);
  const nextAngle = Number.isFinite(preset.angleDeg) ? preset.angleDeg : 0;
  if (Math.abs(nextAngle) > 0.01) {
    target.setAttribute("transform", `rotate(${nextAngle} ${x} ${y})`);
  } else {
    target.removeAttribute("transform");
  }

  return new XMLSerializer().serializeToString(document.documentElement);
}

export function buildTextSvgFromPreset(preset: TextStylePreset): string {
  const fontSize = Math.max(8, preset.fontSize || DEFAULT_FONT_SIZE);
  const text = preset.text.trim();
  const textAnchor = preset.textAnchor || "start";
  const padding = Math.max(16, Math.round(fontSize * 0.5));
  const textWidth = Math.max(
    fontSize * 1.5,
    text.length * fontSize * (0.52 + Math.max(-0.05, preset.letterSpacing * 0.01)),
  );
  const svgWidth = Math.ceil(textWidth + padding * 2);
  const svgHeight = Math.ceil(fontSize * 1.9 + padding);
  const baselineY = Math.round(padding + fontSize);
  const anchorX =
    textAnchor === "middle" ? svgWidth / 2 : textAnchor === "end" ? svgWidth - padding : padding;
  const rotation = Number.isFinite(preset.angleDeg) ? preset.angleDeg : 0;
  const transform =
    Math.abs(rotation) > 0.01 ? ` transform="rotate(${rotation} ${anchorX} ${baselineY})"` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}"><text x="${anchorX}" y="${baselineY}" font-size="${fontSize}" font-family="${escapeXml(preset.fontFamily || DEFAULT_FONT_FAMILY)}" font-weight="${escapeXml(preset.fontWeight || "normal")}" font-style="${escapeXml(preset.fontStyle || "normal")}" fill="${escapeXml(preset.fill || DEFAULT_FILL)}" letter-spacing="${preset.letterSpacing || 0}" text-anchor="${textAnchor}"${transform}>${escapeXml(text)}</text></svg>`;
}

function titleCase(value: string): string {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeWeight(value: string | null): string {
  if (!value) return "normal";
  const lower = value.toLowerCase();
  if (["bold", "bolder", "600", "700", "800", "900", "semibold"].includes(lower)) {
    return "bold";
  }
  return "normal";
}

function normalizeStyle(value: string | null): string {
  return value?.toLowerCase() === "italic" ? "italic" : "normal";
}

function normalizeFontFamily(value: string | null, candidates: string[]): string {
  const candidate = sanitizeText(value);
  if (candidate) return candidate;
  return candidates[0] || DEFAULT_FONT_FAMILY;
}

export function buildPresetFromImageDetection(
  detection: ImageTextDetectionResult,
): TextStylePreset | null {
  const text = sanitizeText(detection.text);
  if (!text) return null;

  const family = normalizeFontFamily(detection.fontFamily, detection.fontCandidates);
  return {
    text,
    fontFamily: family,
    fontSize: Math.max(8, Math.round(detection.estimatedFontSizePx ?? DEFAULT_FONT_SIZE)),
    fontWeight: normalizeWeight(detection.fontWeight),
    fontStyle: normalizeStyle(detection.fontStyle),
    fill: normalizeEditableColor(detection.fill),
    letterSpacing: detection.letterSpacing ?? 0,
    angleDeg: Number.isFinite(detection.angleDeg) ? Number(detection.angleDeg) : 0,
    textAnchor: "start",
  };
}

export function buildPresetFromSvgTextNode(node: DetectedSvgTextNode): TextStylePreset {
  return {
    text: node.text,
    fontFamily: node.fontFamily || DEFAULT_FONT_FAMILY,
    fontSize: node.fontSize || DEFAULT_FONT_SIZE,
    fontWeight: node.fontWeight || "normal",
    fontStyle: node.fontStyle || "normal",
    fill: normalizeEditableColor(node.fill),
    letterSpacing: node.letterSpacing || 0,
    angleDeg: node.angleDeg || 0,
    textAnchor: node.textAnchor || "start",
  };
}

export function summarizeFontCandidates(result: ImageTextDetectionResult): string {
  if (result.fontCandidates.length > 0) {
    return result.fontCandidates.map(titleCase).join(", ");
  }
  if (result.fontCategory) return titleCase(result.fontCategory);
  return "No candidate fonts returned";
}
