import type { TextDetectionResult } from "./textDetect";

export interface TextReplacementRequest {
  requestedMode: "auto" | "font-match" | "trace";
  replacementText: string | null;
  preferredFontFamily: string | null;
  preferredFill: string | null;
  preferredWeight: string | null;
  preferredStyle: string | null;
  preferredLetterSpacing: number | null;
  preferredAngleDeg: number | null;
  preferredFontSizePx: number | null;
  preferredTextAnchor: "start" | "middle" | "end" | null;
}

export interface TextReplacementResult {
  svg: string;
  debug: Record<string, unknown>;
  mode: "font-match" | "trace";
  fileName: string;
}

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 800;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizeFontWeight(weight: string | null): string {
  if (!weight) return "normal";
  const normalized = weight.trim().toLowerCase();
  if (["light", "regular", "medium", "semibold", "bold", "black", "normal"].includes(normalized)) {
    return normalized;
  }
  return "normal";
}

function normalizeFontStyle(style: string | null): "normal" | "italic" {
  return style?.trim().toLowerCase() === "italic" ? "italic" : "normal";
}

function resolveMode(
  detection: TextDetectionResult,
  requestedMode: TextReplacementRequest["requestedMode"],
): "font-match" | "trace" {
  if (requestedMode === "font-match" || requestedMode === "trace") {
    return requestedMode;
  }

  if (detection.recommendedMode === "font-match" || detection.recommendedMode === "trace") {
    return detection.recommendedMode;
  }

  return detection.fontMatchConfidence >= 0.55 ? "font-match" : "trace";
}

export async function generateTextReplacement(
  imageBytes: Uint8Array,
  detection: TextDetectionResult,
  request: TextReplacementRequest,
): Promise<TextReplacementResult> {
  void imageBytes;

  const mode = resolveMode(detection, request.requestedMode);
  const text = (request.replacementText ?? detection.text ?? "").trim() || "TEXT";
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const renderLines = lines.length > 0 ? lines : ["TEXT"];

  const region = detection.region;
  const width = DEFAULT_WIDTH;
  const height = DEFAULT_HEIGHT;
  const regionLeft = region ? clamp(region.left, 0, 1) * width : width * 0.18;
  const regionTop = region ? clamp(region.top, 0, 1) * height : height * 0.35;
  const regionWidth = region ? clamp(region.width, 0.05, 1) * width : width * 0.64;
  const regionHeight = region ? clamp(region.height, 0.05, 1) * height : height * 0.28;

  const textAnchor = request.preferredTextAnchor ?? "start";
  const x =
    textAnchor === "middle"
      ? regionLeft + regionWidth / 2
      : textAnchor === "end"
        ? regionLeft + regionWidth
        : regionLeft;
  const y = regionTop + regionHeight * 0.72;

  const fontFamily =
    request.preferredFontFamily ??
    detection.fontFamily ??
    detection.fontCandidates[0] ??
    (mode === "trace" ? "Arial Black" : "Arial");
  const fontSize = clamp(
    request.preferredFontSizePx ?? detection.estimatedFontSizePx ?? 72,
    8,
    380,
  );
  const letterSpacing = request.preferredLetterSpacing ?? detection.letterSpacing ?? 0;
  const fill = request.preferredFill ?? detection.fill ?? "#000000";
  const fontWeight = normalizeFontWeight(request.preferredWeight ?? detection.fontWeight);
  const fontStyle = normalizeFontStyle(request.preferredStyle ?? detection.fontStyle);
  const angle = request.preferredAngleDeg ?? detection.angleDeg ?? 0;

  const lineHeight = fontSize * 1.16;
  const tspans = renderLines
    .map((line, index) => {
      const dy = index === 0 ? 0 : lineHeight;
      return `<tspan x="${x.toFixed(2)}" dy="${dy.toFixed(2)}">${escapeXml(line)}</tspan>`;
    })
    .join("");

  const transform = angle
    ? ` transform="rotate(${angle.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)})"`
    : "";

  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">\n  <g id="replacement-text">\n    <text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-family="${escapeXml(fontFamily)}" font-size="${fontSize.toFixed(2)}" font-weight="${escapeXml(fontWeight)}" font-style="${fontStyle}" fill="${escapeXml(fill)}" letter-spacing="${letterSpacing.toFixed(2)}" text-anchor="${textAnchor}" dominant-baseline="alphabetic"${transform}>${tspans}</text>\n  </g>\n</svg>\n`;

  return {
    svg,
    mode,
    fileName: "replacement-text.svg",
    debug: {
      requestedMode: request.requestedMode,
      mode,
      finalChosenFont: fontFamily,
      confidenceScore: mode === "font-match" ? detection.fontMatchConfidence : detection.confidence,
      fallbackReason:
        request.requestedMode === "auto"
          ? "Auto mode selected from detection confidence."
          : null,
      geometry: {
        width,
        height,
        x,
        y,
        regionLeft,
        regionTop,
        regionWidth,
        regionHeight,
        textAnchor,
        angle,
      },
      style: {
        fontFamily,
        fontSize,
        fontWeight,
        fontStyle,
        fill,
        letterSpacing,
      },
      lineCount: renderLines.length,
    },
  };
}
