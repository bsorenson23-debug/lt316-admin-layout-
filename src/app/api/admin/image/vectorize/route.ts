import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import type {
  RasterTraceMode,
  RasterTraceRecipe,
  RasterVectorizeBranchPreviews,
  RasterVectorizeResponse,
} from "@/types/rasterVectorize";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_ASSET_PIPELINE_URL = "http://127.0.0.1:3100";
const DEFAULT_TRACE_MAX_DIMENSION = 6144;
const MIN_TRACE_MAX_DIMENSION = 1024;
const MAX_TRACE_MAX_DIMENSION = 8192;
const TRACE_INPUT_DENSITY = 600;

interface ImageDoctorRequestBody {
  vectorSettings?: {
    detailPreset?: "soft" | "balanced" | "fine";
    threshold?: number;
    contrast?: number;
    brightnessOffset?: number;
    sharpenSigma?: number;
  };
  silhouetteSettings?: {
    detailPreset?: "tight" | "balanced" | "bold";
    alphaThreshold?: number;
    edgeGrow?: number;
    blurSigma?: number;
  };
}

function getAssetPipelineUrl(): string {
  const configured = process.env.ASSET_PIPELINE_URL?.trim();
  return (configured && configured.length > 0 ? configured : DEFAULT_ASSET_PIPELINE_URL).replace(/\/+$/, "");
}

function assetPipelineUrl(pathname: string): string {
  return `${getAssetPipelineUrl()}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function clampFloat(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseFloat(value ?? "");
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseBoolean(value: string | null, fallback = false): boolean {
  if (value == null) return fallback;
  return value === "true" || value === "1" || value === "yes";
}

function sanitizeHexColor(value: string | null, fallback = "#000000"): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : fallback;
}

function formString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}

function parseTraceRecipe(value: string | null): RasterTraceRecipe {
  switch (value) {
    case "line-art":
    case "script-logo":
    case "stamp":
      return value;
    case "badge":
    default:
      return "badge";
  }
}

function parseViewBox(svg: string): { width: number; height: number } | null {
  const match = svg.match(/viewBox=["']\s*([\d.+-]+)[\s,]+([\d.+-]+)[\s,]+([\d.+-]+)[\s,]+([\d.+-]+)\s*["']/i);
  if (!match) return null;
  const width = Number.parseFloat(match[3]);
  const height = Number.parseFloat(match[4]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

function countPaths(svg: string): number {
  return (svg.match(/<path\b/gi) ?? []).length;
}

function sanitizeFileName(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return "upload.png";
  }

  return trimmed.replace(/[^\w.\-]+/g, "-");
}

function buildTraceInputFileName(fileName: string): string {
  return `${basenameForTrace(fileName)}-trace.png`;
}

function basenameForTrace(fileName: string): string {
  const trimmed = fileName.trim();
  return (trimmed || "upload").replace(/\.[^.]+$/, "").replace(/[^\w.\-]+/g, "-");
}

async function prepareTraceInputBuffer(
  sourceBuffer: Buffer,
  options: {
    fileName: string;
    maxDimension: number;
  },
): Promise<{ buffer: Buffer; contentType: string; fileName: string }> {
  const metadata = await sharp(sourceBuffer, { limitInputPixels: false }).rotate().metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (width <= 0 || height <= 0) {
    return {
      buffer: sourceBuffer,
      contentType: "image/png",
      fileName: buildTraceInputFileName(options.fileName),
    };
  }

  const longestSide = Math.max(width, height);
  const targetDimension = Math.max(MIN_TRACE_MAX_DIMENSION, Math.min(MAX_TRACE_MAX_DIMENSION, options.maxDimension));
  const shouldResize = longestSide !== targetDimension;

  const pipeline = sharp(sourceBuffer, { limitInputPixels: false }).rotate();
  if (shouldResize) {
    pipeline.resize({
      width: targetDimension,
      height: targetDimension,
      fit: "inside",
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: false,
    });
  }

  const buffer = await pipeline
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
      palette: false,
    })
    .withMetadata({ density: TRACE_INPUT_DENSITY })
    .toBuffer();

  return {
    buffer,
    contentType: "image/png",
    fileName: buildTraceInputFileName(options.fileName),
  };
}

function normalizeSoftness(turdSize: number, alphaMax: number, optTolerance: number): number {
  const turdScore = turdSize / 25;
  const cornerScore = alphaMax / 2;
  const curveScore = (optTolerance - 0.05) / 0.95;
  return Math.min(1, Math.max(0, (turdScore + cornerScore + curveScore) / 3));
}

function resolveVectorDetailPreset(softness: number): "soft" | "balanced" | "fine" {
  if (softness <= 0.28) return "fine";
  if (softness >= 0.68) return "soft";
  return "balanced";
}

function resolveSilhouetteDetailPreset(softness: number, invert: boolean): "tight" | "balanced" | "bold" {
  if (invert) return "bold";
  if (softness <= 0.3) return "tight";
  if (softness >= 0.72) return "bold";
  return "balanced";
}

function buildImageDoctorRequestBody(options: {
  thresholdMode: "auto" | "manual";
  threshold: number;
  invert: boolean;
  turdSize: number;
  alphaMax: number;
  optTolerance: number;
  preserveText: boolean;
  recipe: RasterTraceRecipe;
}): ImageDoctorRequestBody {
  let softness = normalizeSoftness(options.turdSize, options.alphaMax, options.optTolerance);

  if (options.recipe === "line-art") softness = Math.max(0, softness * 0.7);
  if (options.recipe === "script-logo") softness = Math.min(softness, 0.22);
  if (options.recipe === "stamp") softness = Math.max(softness, 0.52);
  if (options.preserveText) softness = Math.min(softness, 0.28);

  let detailPreset = resolveVectorDetailPreset(softness);
  let silhouettePreset = resolveSilhouetteDetailPreset(softness, options.invert);

  if (options.recipe === "line-art" || options.recipe === "script-logo" || options.preserveText) {
    detailPreset = "fine";
  }

  if (options.recipe === "script-logo" || options.preserveText) {
    silhouettePreset = "tight";
  }

  let contrast = 1.32 - softness * 0.34;
  let brightnessOffset = -18 + softness * 12;
  let sharpenSigma = 1.75 - softness * 1.3;
  let rawBlurSigma = softness * 1.15;

  if (options.recipe === "line-art") {
    contrast += 0.06;
    brightnessOffset -= 4;
    sharpenSigma += 0.1;
  } else if (options.recipe === "script-logo") {
    contrast += 0.12;
    brightnessOffset -= 6;
    sharpenSigma += 0.16;
    rawBlurSigma *= 0.6;
  } else if (options.recipe === "stamp") {
    contrast += 0.03;
    brightnessOffset -= 10;
  } else {
    contrast += 0.03;
  }

  if (options.preserveText) {
    contrast += 0.06;
    brightnessOffset -= 3;
    sharpenSigma += 0.08;
    rawBlurSigma *= 0.72;
  }

  contrast = Number(contrast.toFixed(2));
  brightnessOffset = Math.round(brightnessOffset);
  sharpenSigma = Number(sharpenSigma.toFixed(2));
  rawBlurSigma = Number(rawBlurSigma.toFixed(2));
  const blurSigma = rawBlurSigma >= 0.3 ? rawBlurSigma : 0;

  return {
    vectorSettings: {
      detailPreset,
      ...(options.thresholdMode === "manual" ? { threshold: options.threshold } : {}),
      contrast,
      brightnessOffset,
      sharpenSigma,
    },
    silhouetteSettings: {
      detailPreset: silhouettePreset,
      alphaThreshold: options.invert ? 18 : 24,
      edgeGrow: options.invert ? 1 : 0,
      ...(blurSigma > 0 ? { blurSigma } : {}),
    },
  };
}

function chooseManifestSvgPath(
  manifest: {
    jobId: string;
    svg: {
      logo: string | null;
      silhouette: string | null;
      detail: string | null;
      monochrome: string | null;
    };
  },
  options: {
    traceMode: RasterTraceMode;
    invert: boolean;
  },
): string | null {
  if (options.traceMode === "posterize") {
    return manifest.svg.detail ?? manifest.svg.logo ?? manifest.svg.silhouette;
  }

  if (options.invert) {
    return manifest.svg.silhouette ?? manifest.svg.monochrome ?? manifest.svg.detail ?? manifest.svg.logo;
  }

  return manifest.svg.monochrome ?? manifest.svg.logo ?? manifest.svg.detail ?? manifest.svg.silhouette;
}

function storagePathToAssetPipelineUrl(storagePath: string): string {
  const segments = storagePath.split("/").filter(Boolean);
  if (segments.length < 2) {
    throw new Error(`Invalid asset-pipeline storage path "${storagePath}".`);
  }

  const [jobId, ...relative] = segments;
  return assetPipelineUrl(`/storage/${jobId}/${relative.join("/")}`);
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const errorPayload =
      payload && typeof payload === "object"
        ? (payload as { error?: string; detail?: string })
        : null;
    const detail =
      errorPayload?.detail ?? errorPayload?.error ?? null;
    throw new Error(detail || `Asset pipeline request failed (${response.status}).`);
  }

  return payload as T;
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const response = await fetch(url, init);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(body || `Asset pipeline request failed (${response.status}).`);
  }

  return body;
}

interface ParsedColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

function isPaintNone(value: string | null | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return normalized === "" || normalized === "none" || normalized === "transparent";
}

function isPaintServer(value: string | null | undefined): boolean {
  return !!value && /^url\(/i.test(value.trim());
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function parseRgbChannel(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.endsWith("%")) {
    const parsedPercent = Number.parseFloat(trimmed.slice(0, -1));
    if (!Number.isFinite(parsedPercent)) return null;
    return Math.round((Math.min(100, Math.max(0, parsedPercent)) / 100) * 255);
  }

  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(255, Math.max(0, parsed));
}

function parseAlphaChannel(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.endsWith("%")) {
    const parsedPercent = Number.parseFloat(trimmed.slice(0, -1));
    if (!Number.isFinite(parsedPercent)) return null;
    return clampUnit(parsedPercent / 100);
  }

  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return clampUnit(parsed);
}

function parsePaintColor(value: string | null | undefined): ParsedColor | null {
  if (!value || isPaintNone(value) || isPaintServer(value)) return null;

  const normalized = value.trim();
  if (/^currentColor$/i.test(normalized)) {
    return null;
  }

  const hexMatch = normalized.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3 || hex.length === 4) {
      const r = Number.parseInt(hex[0] + hex[0], 16);
      const g = Number.parseInt(hex[1] + hex[1], 16);
      const b = Number.parseInt(hex[2] + hex[2], 16);
      const a = hex.length === 4 ? Number.parseInt(hex[3] + hex[3], 16) / 255 : 1;
      return { r, g, b, a };
    }

    if (hex.length === 6 || hex.length === 8) {
      const r = Number.parseInt(hex.slice(0, 2), 16);
      const g = Number.parseInt(hex.slice(2, 4), 16);
      const b = Number.parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
  }

  const rgbMatch = normalized.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgbMatch) return null;

  const parts = rgbMatch[1].split(",").map((part) => part.trim());
  if (parts.length < 3) return null;

  const r = parseRgbChannel(parts[0]);
  const g = parseRgbChannel(parts[1]);
  const b = parseRgbChannel(parts[2]);
  const a = parts[3] ? parseAlphaChannel(parts[3]) : 1;

  if (r == null || g == null || b == null || a == null) {
    return null;
  }

  return { r, g, b, a };
}

function srgbToLinear(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function computeRelativeLuminance(color: ParsedColor): number {
  return (
    0.2126 * srgbToLinear(color.r) +
    0.7152 * srgbToLinear(color.g) +
    0.0722 * srgbToLinear(color.b)
  );
}

function computeSmartThreshold(samples: number[]): number {
  if (samples.length === 0) return 0.55;

  let dark = Math.min(...samples);
  let light = Math.max(...samples);
  if (!Number.isFinite(dark) || !Number.isFinite(light)) return 0.55;

  for (let index = 0; index < 12; index += 1) {
    const darkGroup: number[] = [];
    const lightGroup: number[] = [];

    for (const sample of samples) {
      if (Math.abs(sample - dark) <= Math.abs(sample - light)) {
        darkGroup.push(sample);
      } else {
        lightGroup.push(sample);
      }
    }

    const nextDark =
      darkGroup.length > 0 ? darkGroup.reduce((sum, sample) => sum + sample, 0) / darkGroup.length : dark;
    const nextLight =
      lightGroup.length > 0 ? lightGroup.reduce((sum, sample) => sum + sample, 0) / lightGroup.length : light;

    if (Math.abs(nextDark - dark) < 0.0005 && Math.abs(nextLight - light) < 0.0005) {
      dark = nextDark;
      light = nextLight;
      break;
    }

    dark = nextDark;
    light = nextLight;
  }

  const spread = Math.abs(light - dark);
  if (spread < 0.1) {
    const sorted = [...samples].sort((left, right) => left - right);
    const percentileIndex = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * 0.72)));
    return Math.min(0.7, Math.max(0.45, sorted[percentileIndex] ?? 0.55));
  }

  return Math.min(0.78, Math.max(0.22, (dark + light) / 2));
}

function collectPaintSamples(svg: string): number[] {
  const samples = new Map<string, number>();
  const attributeRegex = /\b(?:fill|stroke|stop-color|color)=(["'])(.*?)\1/gi;
  const styleRegex = /\b(?:fill|stroke|stop-color|color)\s*:\s*([^;"'}]+)/gi;

  const addValue = (rawValue: string) => {
    const value = rawValue.trim();
    if (samples.has(value)) return;

    const parsed = parsePaintColor(value);
    if (!parsed || parsed.a <= 0.04) return;
    samples.set(value, computeRelativeLuminance(parsed));
  };

  let attributeMatch: RegExpExecArray | null;
  while ((attributeMatch = attributeRegex.exec(svg)) !== null) {
    addValue(attributeMatch[2]);
  }

  let styleMatch: RegExpExecArray | null;
  while ((styleMatch = styleRegex.exec(svg)) !== null) {
    addValue(styleMatch[1]);
  }

  return [...samples.values()];
}

function remapPaintValue(value: string, threshold: number, darkColor: string, lightColor: string): string {
  const parsed = parsePaintColor(value);
  if (!parsed || parsed.a <= 0.04) {
    return value;
  }

  return computeRelativeLuminance(parsed) <= threshold ? darkColor : lightColor;
}

function makeSmartMonochromeSvg(svg: string, darkColor: string, lightColor = "#ffffff"): string {
  const samples = collectPaintSamples(svg);
  const threshold = computeSmartThreshold(samples);

  const replacePaintValue = (rawValue: string) => remapPaintValue(rawValue.trim(), threshold, darkColor, lightColor);

  const withAttributes = svg.replace(
    /\b(fill|stroke|stop-color|color)=(["'])(.*?)\2/gi,
    (_match, attributeName: string, quote: string, rawValue: string) =>
      `${attributeName}=${quote}${replacePaintValue(rawValue)}${quote}`,
  );

  return withAttributes.replace(
    /\b(fill|stroke|stop-color|color)\s*:\s*([^;"'}]+)/gi,
    (_match, propertyName: string, rawValue: string) => `${propertyName}: ${replacePaintValue(rawValue)}`,
  );
}

function replacePaintsInMarkup(
  markup: string,
  mapPaint: (value: string) => string,
): string {
  const withAttributes = markup.replace(
    /\b(fill|stroke|stop-color|color)=(["'])(.*?)\2/gi,
    (_match, attributeName: string, quote: string, rawValue: string) =>
      `${attributeName}=${quote}${mapPaint(rawValue.trim())}${quote}`,
  );

  return withAttributes.replace(
    /\b(fill|stroke|stop-color|color)\s*:\s*([^;"'}]+)/gi,
    (_match, propertyName: string, rawValue: string) => `${propertyName}: ${mapPaint(rawValue.trim())}`,
  );
}

function readSvgTagAttribute(tag: string, attributeName: string): string | null {
  const match = tag.match(new RegExp(`\\b${attributeName}=(["'])(.*?)\\1`, "i"));
  return match?.[2] ?? null;
}

function setSvgTagAttribute(tag: string, attributeName: string, attributeValue: string): string {
  const attributePattern = new RegExp(`\\b${attributeName}=(["'])(.*?)\\1`, "i");
  if (attributePattern.test(tag)) {
    return tag.replace(attributePattern, `${attributeName}="${attributeValue}"`);
  }

  return tag.replace(/\/?>$/, ` ${attributeName}="${attributeValue}"$&`);
}

function removeSvgTagAttribute(tag: string, attributeName: string): string {
  const attributePattern = new RegExp(`\\s+${attributeName}=(["'])(.*?)\\1`, "gi");
  return tag.replace(attributePattern, "");
}

function normalizeHex(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePaintKey(value: string | null | undefined): string | null {
  const parsed = parsePaintColor(value);
  if (!parsed || parsed.a <= 0.04) {
    return null;
  }

  const channel = (channelValue: number) =>
    Math.min(255, Math.max(0, Math.round(channelValue))).toString(16).padStart(2, "0");
  return `#${channel(parsed.r)}${channel(parsed.g)}${channel(parsed.b)}`;
}

function decorateMonochromePaths(
  markup: string,
  options: {
    fillMapper: (fillValue: string) => string;
    darkColor: string;
    lightColor: string;
    darkStrokeWidth: number;
    strokeAll?: boolean;
  },
): string {
  const darkHex = normalizeHex(options.darkColor);

  return markup.replace(/<path\b[^>]*\/?>/gi, (pathTag) => {
    const originalFill = readSvgTagAttribute(pathTag, "fill") ?? "none";
    const mappedFill = options.fillMapper(originalFill);
    const isDarkFill = normalizeHex(mappedFill) === darkHex;

    let nextTag = setSvgTagAttribute(pathTag, "fill", mappedFill);
    nextTag = removeSvgTagAttribute(nextTag, "style");

    if (isDarkFill || options.strokeAll) {
      nextTag = setSvgTagAttribute(nextTag, "stroke", options.lightColor);
      nextTag = setSvgTagAttribute(nextTag, "stroke-width", options.darkStrokeWidth.toFixed(2));
      nextTag = setSvgTagAttribute(nextTag, "stroke-linejoin", "round");
      nextTag = setSvgTagAttribute(nextTag, "stroke-linecap", "round");
      nextTag = setSvgTagAttribute(nextTag, "paint-order", "stroke fill");
    } else {
      nextTag = setSvgTagAttribute(nextTag, "stroke", "none");
      nextTag = removeSvgTagAttribute(nextTag, "stroke-width");
      nextTag = removeSvgTagAttribute(nextTag, "stroke-linejoin");
      nextTag = removeSvgTagAttribute(nextTag, "stroke-linecap");
      nextTag = removeSvgTagAttribute(nextTag, "paint-order");
    }

    return nextTag;
  });
}

function buildProtectedTextColorSet(manifest: AssetPipelineManifest): Set<string> {
  return new Set(
    (manifest.images?.regions?.masks ?? [])
      .filter((mask) => mask.role === "text-like")
      .map((mask) => normalizePaintKey(mask.color))
      .filter((value): value is string => value !== null),
  );
}

function computeShapeThreshold(samples: number[], recipe: RasterTraceRecipe): number {
  if (samples.length <= 1) {
    switch (recipe) {
      case "stamp":
        return 0.62;
      case "line-art":
        return 0.42;
      case "script-logo":
        return 0.48;
      case "badge":
      default:
        return 0.5;
    }
  }

  let threshold = computeSmartThreshold(samples);
  switch (recipe) {
    case "stamp":
      threshold += 0.1;
      break;
    case "line-art":
      threshold -= 0.06;
      break;
    case "script-logo":
      threshold -= 0.02;
      break;
    case "badge":
    default:
      break;
  }

  return Math.min(0.7, Math.max(0.38, threshold));
}

function makeRoleAwareMonochromeSvg(
  svg: string,
  darkColor: string,
  recipe: RasterTraceRecipe,
  protectedTextColors: Set<string>,
  lightColor = "#ffffff",
): string {
  const hasVectorGroups = /<g\b[^>]*id=["'](?:shape-preview|contour-preview|arc-text-preview|script-text-preview)["']/i.test(svg);
  if (!hasVectorGroups) {
    return makeSmartMonochromeSvg(svg, darkColor, lightColor);
  }

  return svg.replace(
    /<g\b([^>]*)id=(["'])(shape-preview|contour-preview|arc-text-preview|script-text-preview)\2([^>]*)>([\s\S]*?)<\/g>/gi,
    (
      match: string,
      beforeId: string,
      quote: string,
      groupId: string,
      afterId: string,
      groupBody: string,
    ) => {
      const shapeStrokeWidth =
        recipe === "stamp" ? 2.4 : recipe === "line-art" ? 1.1 : recipe === "script-logo" ? 1.8 : 1.5;
      const textStrokeWidth =
        recipe === "stamp" ? 3.4 : recipe === "line-art" ? 1.8 : recipe === "script-logo" ? 2.8 : 2.4;
      const contourStrokeWidth =
        recipe === "stamp" ? 1.6 : recipe === "line-art" ? 0.9 : recipe === "script-logo" ? 1.3 : 1.1;

      if (groupId === "shape-preview") {
        const threshold = computeShapeThreshold(collectPaintSamples(groupBody), recipe);
        const remappedBody = groupBody.replace(/<path\b[^>]*\/?>/gi, (pathTag) => {
          const originalFill = readSvgTagAttribute(pathTag, "fill") ?? "none";
          const normalizedFill = normalizePaintKey(originalFill);
          const parsedFill = parsePaintColor(originalFill);

          if (
            normalizedFill &&
            protectedTextColors.has(normalizedFill) &&
            parsedFill &&
            parsedFill.a > 0.04
          ) {
            const useDarkText = computeRelativeLuminance(parsedFill) <= 0.46;
            let nextTag = setSvgTagAttribute(pathTag, "fill", useDarkText ? darkColor : lightColor);
            nextTag = removeSvgTagAttribute(nextTag, "style");

            if (useDarkText) {
              nextTag = setSvgTagAttribute(nextTag, "stroke", lightColor);
              nextTag = setSvgTagAttribute(nextTag, "stroke-width", textStrokeWidth.toFixed(2));
              nextTag = setSvgTagAttribute(nextTag, "stroke-linejoin", "round");
              nextTag = setSvgTagAttribute(nextTag, "stroke-linecap", "round");
              nextTag = setSvgTagAttribute(nextTag, "paint-order", "stroke fill");
            } else {
              nextTag = setSvgTagAttribute(nextTag, "stroke", "none");
              nextTag = removeSvgTagAttribute(nextTag, "stroke-width");
              nextTag = removeSvgTagAttribute(nextTag, "stroke-linejoin");
              nextTag = removeSvgTagAttribute(nextTag, "stroke-linecap");
              nextTag = removeSvgTagAttribute(nextTag, "paint-order");
            }

            return nextTag;
          }

          return decorateMonochromePaths(pathTag, {
            fillMapper: (value) => remapPaintValue(value, threshold, darkColor, lightColor),
            darkColor,
            lightColor,
            darkStrokeWidth: shapeStrokeWidth,
          });
        });
        return `<g${beforeId}id=${quote}${groupId}${quote}${afterId}>${remappedBody}</g>`;
      }

      if (groupId === "contour-preview") {
        const remappedBody = decorateMonochromePaths(groupBody, {
          fillMapper: () => darkColor,
          darkColor,
          lightColor,
          darkStrokeWidth: contourStrokeWidth,
          strokeAll: true,
        });
        return `<g${beforeId}id=${quote}${groupId}${quote}${afterId}>${remappedBody}</g>`;
      }

      const remappedBody = decorateMonochromePaths(groupBody, {
        fillMapper: () => darkColor,
        darkColor,
        lightColor,
        darkStrokeWidth: textStrokeWidth,
        strokeAll: true,
      });
      return `<g${beforeId}id=${quote}${groupId}${quote}${afterId}>${remappedBody}</g>`;
    },
  );
}

interface AssetPipelineManifest {
  jobId: string;
  svg: {
    logo: string | null;
    silhouette: string | null;
    detail: string | null;
    monochrome: string | null;
  };
  images?: {
    regions?: {
      masks?: Array<{
        id: string;
        color: string;
        role: string;
      }>;
    };
  };
}

interface VectorDoctorArtifacts {
  colorPreview: string;
  textPreview: string | null;
  arcTextPreview: string | null;
  scriptTextPreview: string | null;
  shapePreview: string | null;
  contourPreview: string | null;
}

interface VectorDoctorResultPayload {
  artifacts: VectorDoctorArtifacts;
}

function inferMimeTypeFromPath(filePath: string): string {
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (filePath.endsWith(".webp")) {
    return "image/webp";
  }

  if (filePath.endsWith(".svg")) {
    return "image/svg+xml";
  }

  return "image/png";
}

async function fetchStorageAsDataUrl(storagePath: string | null | undefined): Promise<string | null> {
  if (!storagePath) {
    return null;
  }

  const response = await fetch(storagePathToAssetPipelineUrl(storagePath));
  if (!response.ok) {
    throw new Error(`Could not read preview artifact "${storagePath}".`);
  }

  const contentType = response.headers.get("content-type") || inferMimeTypeFromPath(storagePath);
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const imageFile = formData.get("image") as File | null;
  if (!imageFile) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }

  if (imageFile.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "Image too large (max 25 MB)" }, { status: 413 });
  }

  const traceMode = (formString(formData, "mode") === "posterize" ? "posterize" : "trace") as RasterTraceMode;
  const thresholdMode = formString(formData, "thresholdMode") === "manual" ? "manual" : "auto";
  const invert = parseBoolean(formString(formData, "invert"), false);
  const threshold = clampInt(formString(formData, "threshold"), 160, 0, 255);
  const turdSize = clampInt(formString(formData, "turdSize"), 0, 0, 25);
  const alphaMax = clampFloat(formString(formData, "alphaMax"), 0.35, 0, 2);
  const optTolerance = clampFloat(formString(formData, "optTolerance"), 0.05, 0.05, 1);
  const outputColor = sanitizeHexColor(formString(formData, "outputColor"), "#000000");
  const preserveText = parseBoolean(formString(formData, "preserveText"), true);
  const recipe = parseTraceRecipe(formString(formData, "recipe"));
  const maxDimension = clampInt(
    formString(formData, "maxDimension"),
    DEFAULT_TRACE_MAX_DIMENSION,
    MIN_TRACE_MAX_DIMENSION,
    MAX_TRACE_MAX_DIMENSION,
  );

  try {
    const job = await fetchJson<AssetPipelineManifest>(assetPipelineUrl("/jobs"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        input: imageFile.name,
      }),
    });

    const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
    const preparedTraceInput = await prepareTraceInputBuffer(imageBuffer, {
      fileName: imageFile.name,
      maxDimension,
    });

    await fetchJson(assetPipelineUrl(`/jobs/${job.jobId}/raw-image?filename=${encodeURIComponent(preparedTraceInput.fileName)}`), {
      method: "PUT",
      headers: {
        "content-type": preparedTraceInput.contentType,
        "x-filename": preparedTraceInput.fileName,
      },
      body: new Uint8Array(preparedTraceInput.buffer),
    });

    await fetchJson(assetPipelineUrl(`/jobs/${job.jobId}/image-doctor`), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(
        buildImageDoctorRequestBody({
          thresholdMode,
          threshold,
        invert,
        turdSize,
        alphaMax,
        optTolerance,
        preserveText,
        recipe,
      }),
      ),
    });

    const vectorDoctor = await fetchJson<VectorDoctorResultPayload>(assetPipelineUrl(`/jobs/${job.jobId}/vector-doctor`), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{}",
    });

    const manifest = await fetchJson<AssetPipelineManifest>(assetPipelineUrl(`/jobs/${job.jobId}/vectorize`), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        trace: {
          mode: traceMode,
          recipe,
          outputColor,
          preserveText,
          invert,
          thresholdMode,
          threshold,
          turdSize,
          alphaMax,
          optTolerance,
        },
      }),
    });

    const selectedSvgPath = chooseManifestSvgPath(manifest, { traceMode, invert });
    if (!selectedSvgPath) {
      throw new Error("Asset pipeline completed, but no SVG output was produced.");
    }

    const svg = await fetchText(storagePathToAssetPipelineUrl(selectedSvgPath));

    const viewBox = parseViewBox(svg);
    const branchPreviews: RasterVectorizeBranchPreviews = {
      colorPreview: await fetchStorageAsDataUrl(vectorDoctor.artifacts.colorPreview),
      textPreview: await fetchStorageAsDataUrl(vectorDoctor.artifacts.textPreview),
      arcTextPreview: await fetchStorageAsDataUrl(vectorDoctor.artifacts.arcTextPreview),
      scriptTextPreview: await fetchStorageAsDataUrl(vectorDoctor.artifacts.scriptTextPreview),
      shapePreview: await fetchStorageAsDataUrl(vectorDoctor.artifacts.shapePreview),
      contourPreview: await fetchStorageAsDataUrl(vectorDoctor.artifacts.contourPreview),
    };

    const response: RasterVectorizeResponse = {
      svg,
      mode: traceMode,
      pathCount: countPaths(svg),
      width: viewBox?.width ?? 0,
      height: viewBox?.height ?? 0,
      engine: "asset-pipeline",
      jobId: manifest.jobId,
      sourcePath: selectedSvgPath,
      branchPreviews,
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vectorization failed";
    console.error("[vectorize] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
