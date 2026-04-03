import { writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { trace, type PotraceOptions } from "potrace";
import {
  ensureDirectories,
  getJobFilePath,
  getStorageRoot,
  readManifest,
  saveManifest,
  writeDebugFile,
} from "../../lib/storage";
import { runVectorDoctorStage } from "../vector-doctor";
import type {
  JobManifest,
  RegionMaskArtifact,
  VectorizeRequestBody,
  VectorizeTraceRecipe,
} from "../../types/manifest";

const ALPHA_THRESHOLD = 16;
const DEFAULT_LIGHT_COLOR = "#ffffff";
const DEFAULT_OUTPUT_COLOR = "#000000";

type VectorizeOutputKey =
  | "shape-preview"
  | "contour-preview"
  | "arc-text-preview"
  | "script-text-preview";

type ThresholdMode = "auto" | "manual";

interface RgbaImage {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  channels: 4;
}

interface VectorDoctorRegionRecord {
  id: string;
  role: string;
  colorHex: string;
}

interface VectorDoctorMergedOutput {
  output: string;
  regionIds: string[];
}

interface VectorDoctorArtifactsRecord {
  colorPreview?: string | null;
  arcTextPreview?: string | null;
  scriptTextPreview?: string | null;
  shapePreview?: string | null;
  contourPreview?: string | null;
}

interface TraceLayer {
  branch: VectorizeOutputKey;
  colorHex: string;
  pixelCount: number;
  pathCount: number;
  paths: string[];
  luminance: number;
  protectedTextLike: boolean;
}

interface ResolvedVectorizeOptions {
  mode: "trace" | "posterize";
  recipe: VectorizeTraceRecipe;
  outputColor: string;
  preserveText: boolean;
  invert: boolean;
  thresholdMode: ThresholdMode;
  threshold: number;
  turdSize: number;
  alphaMax: number;
  optTolerance: number;
}

interface MonochromeLayerStyle {
  include: boolean;
  fill: string;
  stroke: string;
  strokeWidth: number;
}

interface VectorizeDebugPayload {
  stage: "vectorize";
  ranAt: string;
  sourceImageUsed: string;
  vectorDoctorDebugPath: string | null;
  outputFiles: {
    logo: string | null;
    detail: string | null;
    silhouette: string | null;
    monochrome: string | null;
  };
  optionsUsed: ResolvedVectorizeOptions;
  shapeThresholdUsed: number;
  layers: Array<{
    branch: VectorizeOutputKey;
    colorHex: string;
    pixelCount: number;
    pathCount: number;
    luminance: number;
    protectedTextLike: boolean;
  }>;
  warnings: string[];
}

export class VectorizeInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VectorizeInputError";
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.round(clamp(value, min, max));
}

function clampFloat(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return clamp(value, min, max);
}

function normalizeHexColor(value: string): string {
  return value.trim().toLowerCase();
}

function sanitizeHexColor(value: unknown, fallback = DEFAULT_OUTPUT_COLOR): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toLowerCase() : fallback;
}

function parseHexColor(hex: string): { red: number; green: number; blue: number } {
  const normalized = normalizeHexColor(hex).replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    throw new VectorizeInputError(`Invalid region color "${hex}" in vector-doctor debug payload.`);
  }

  return {
    red: Number.parseInt(normalized.slice(0, 2), 16),
    green: Number.parseInt(normalized.slice(2, 4), 16),
    blue: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function toStorageRelativePath(filePath: string): string {
  return path.relative(path.resolve(getStorageRoot()), filePath).replaceAll("\\", "/");
}

function getJobFilePathFromManifestPath(jobId: string, manifestPath: string): string {
  const segments = manifestPath.split("/").filter(Boolean);
  if (segments[0] !== jobId) {
    throw new VectorizeInputError(`Stored path "${manifestPath}" does not belong to job "${jobId}".`);
  }

  return getJobFilePath(jobId, ...segments.slice(1));
}

function normalizeVectorizeOptions(requestBody?: VectorizeRequestBody): ResolvedVectorizeOptions {
  const trace = requestBody?.trace;
  const recipe =
    trace?.recipe === "line-art" ||
    trace?.recipe === "script-logo" ||
    trace?.recipe === "stamp"
      ? trace.recipe
      : "badge";

  return {
    mode: trace?.mode === "posterize" ? "posterize" : "trace",
    recipe,
    outputColor: sanitizeHexColor(trace?.outputColor, DEFAULT_OUTPUT_COLOR),
    preserveText: typeof trace?.preserveText === "boolean" ? trace.preserveText : true,
    invert: typeof trace?.invert === "boolean" ? trace.invert : false,
    thresholdMode: trace?.thresholdMode === "manual" ? "manual" : "auto",
    threshold: clampInt(trace?.threshold, 160, 0, 255),
    turdSize: clampInt(trace?.turdSize, 0, 0, 25),
    alphaMax: clampFloat(trace?.alphaMax, 0.35, 0.05, 2),
    optTolerance: clampFloat(trace?.optTolerance, 0.05, 0.05, 1),
  };
}

function srgbToLinear(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function computeHexLuminance(colorHex: string): number {
  const { red, green, blue } = parseHexColor(colorHex);
  return (
    0.2126 * srgbToLinear(red) +
    0.7152 * srgbToLinear(green) +
    0.0722 * srgbToLinear(blue)
  );
}

async function loadRgbaImage(filePath: string): Promise<RgbaImage> {
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    pixels: new Uint8ClampedArray(data),
    width: info.width,
    height: info.height,
    channels: 4,
  };
}

function buildAlphaMask(image: RgbaImage): Uint8Array {
  const mask = new Uint8Array(image.width * image.height);
  for (let index = 0; index < mask.length; index += 1) {
    const alpha = image.pixels[(index * image.channels) + 3] ?? 0;
    mask[index] = alpha >= ALPHA_THRESHOLD ? 1 : 0;
  }
  return mask;
}

function countMaskPixels(mask: Uint8Array): number {
  let total = 0;
  for (let index = 0; index < mask.length; index += 1) {
    total += mask[index];
  }
  return total;
}

function buildColorMask(
  colorPreviewImage: RgbaImage,
  branchMask: Uint8Array,
  colorHex: string,
): Uint8Array {
  const target = parseHexColor(colorHex);
  const mask = new Uint8Array(branchMask.length);

  for (let index = 0; index < branchMask.length; index += 1) {
    if (branchMask[index] !== 1) {
      continue;
    }

    const offset = index * colorPreviewImage.channels;
    const alpha = colorPreviewImage.pixels[offset + 3] ?? 0;
    if (alpha < ALPHA_THRESHOLD) {
      continue;
    }

    const red = colorPreviewImage.pixels[offset];
    const green = colorPreviewImage.pixels[offset + 1];
    const blue = colorPreviewImage.pixels[offset + 2];
    if (red === target.red && green === target.green && blue === target.blue) {
      mask[index] = 1;
    }
  }

  return mask;
}

async function buildPotraceInput(mask: Uint8Array, width: number, height: number): Promise<Buffer> {
  const output = Buffer.alloc(mask.length);
  for (let index = 0; index < mask.length; index += 1) {
    output[index] = mask[index] === 1 ? 0 : 255;
  }

  return sharp(output, {
    raw: {
      width,
      height,
      channels: 1,
    },
  })
    .png()
    .toBuffer();
}

function traceSvg(input: Buffer, options: PotraceOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    trace(input, options, (error, svg) => {
      if (error) {
        reject(error);
        return;
      }

      if (!svg) {
        reject(new VectorizeInputError("Potrace completed without returning SVG output."));
        return;
      }

      resolve(svg);
    });
  });
}

function extractPathData(svg: string): string[] {
  const matches = [...svg.matchAll(/<path\b[^>]*\sd="([^"]+)"[^>]*\/?>/gi)];
  return matches.map((match) => match[1]).filter(Boolean);
}

function getRecipeAdjustedValue(
  recipe: VectorizeTraceRecipe,
  adjustments: Record<VectorizeTraceRecipe, number>,
): number {
  return adjustments[recipe];
}

function getTraceOptions(branch: VectorizeOutputKey, options: ResolvedVectorizeOptions): PotraceOptions {
  const isTextBranch = branch === "arc-text-preview" || branch === "script-text-preview";
  const isContourBranch = branch === "contour-preview";

  const baseTurdSize =
    branch === "shape-preview" ? 3 : branch === "contour-preview" ? 1 : 1;
  const baseAlphaMax =
    branch === "shape-preview" ? 1.05 : branch === "contour-preview" ? 0.72 : 0.84;
  const baseOptTolerance =
    branch === "shape-preview" ? 0.32 : branch === "contour-preview" ? 0.22 : 0.18;

  let turdSize = options.turdSize;
  if (isTextBranch && options.preserveText) {
    turdSize = Math.min(options.turdSize, 1);
  } else if (isContourBranch) {
    turdSize = Math.min(options.turdSize, 2);
  }

  turdSize = clampInt(
    baseTurdSize + turdSize + getRecipeAdjustedValue(options.recipe, {
      badge: 0,
      "line-art": -1,
      "script-logo": -1,
      stamp: 1,
    }),
    baseTurdSize,
    0,
    25,
  );

  let alphaMax = clampFloat(
    baseAlphaMax +
      (options.alphaMax - 0.35) * (isTextBranch ? 0.55 : 0.8) +
      getRecipeAdjustedValue(options.recipe, {
        badge: 0,
        "line-art": isContourBranch ? -0.14 : -0.1,
        "script-logo": isTextBranch ? -0.22 : -0.08,
        stamp: 0.12,
      }),
    baseAlphaMax,
    0.05,
    2,
  );

  if (isTextBranch && options.preserveText) {
    alphaMax = Math.min(alphaMax, branch === "arc-text-preview" ? 0.72 : 0.68);
  }

  let optTolerance = clampFloat(
    baseOptTolerance +
      (options.optTolerance - 0.05) * (isTextBranch ? 0.55 : 0.8) +
      getRecipeAdjustedValue(options.recipe, {
        badge: 0,
        "line-art": isContourBranch ? -0.05 : -0.03,
        "script-logo": isTextBranch ? -0.06 : -0.02,
        stamp: 0.07,
      }),
    baseOptTolerance,
    0.05,
    1,
  );

  if (isTextBranch && options.preserveText) {
    optTolerance = Math.min(optTolerance, branch === "arc-text-preview" ? 0.14 : 0.12);
  }

  return {
    turdSize,
    alphaMax,
    optCurve: true,
    optTolerance,
    threshold: options.thresholdMode === "manual" ? options.threshold : 128,
    blackOnWhite: true,
  };
}

function parseVectorDoctorDebug(debugPayload: Record<string, unknown> | null): {
  groupedRegions: VectorDoctorRegionRecord[];
  mergedIntoOutputs: VectorDoctorMergedOutput[];
  artifacts: VectorDoctorArtifactsRecord;
  debugPath: string | null;
} {
  const groupedRegions = Array.isArray(debugPayload?.groupedRegions)
    ? (debugPayload?.groupedRegions as VectorDoctorRegionRecord[])
    : [];
  const mergedIntoOutputs = Array.isArray(debugPayload?.mergedIntoOutputs)
    ? (debugPayload?.mergedIntoOutputs as VectorDoctorMergedOutput[])
    : [];
  const artifacts = (debugPayload?.artifacts ?? {}) as VectorDoctorArtifactsRecord;
  const debugPath = typeof debugPayload?.debugPath === "string" ? debugPayload.debugPath : null;

  return { groupedRegions, mergedIntoOutputs, artifacts, debugPath };
}

function getRegionIdsForOutput(
  mergedIntoOutputs: VectorDoctorMergedOutput[],
  output: VectorizeOutputKey,
): string[] {
  return mergedIntoOutputs.find((entry) => entry.output === output)?.regionIds ?? [];
}

function buildCompositeSvg(
  width: number,
  height: number,
  title: string,
  layers: TraceLayer[],
  branchOrder: VectorizeOutputKey[],
): string {
  const groups = branchOrder.flatMap((branch) => {
    const branchLayers = layers.filter((layer) => layer.branch === branch && layer.paths.length > 0);
    if (branchLayers.length === 0) {
      return [];
    }

    const paths = branchLayers.flatMap((layer, layerIndex) =>
      layer.paths.map((pathData, pathIndex) =>
        `    <path id="${escapeXml(`${branch}-${layerIndex + 1}-${pathIndex + 1}`)}" d="${escapeXml(pathData)}" fill="${escapeXml(layer.colorHex)}" stroke="none" />`,
      ),
    );

    return [`  <g id="${escapeXml(branch)}">`, ...paths, "  </g>"];
  });

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title">`,
    `  <title id="title">${escapeXml(title)}</title>`,
    ...groups,
    `</svg>`,
    "",
  ].join("\n");
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
    return clamp(sorted[percentileIndex] ?? 0.55, 0.45, 0.7);
  }

  return clamp((dark + light) / 2, 0.22, 0.78);
}

function computeShapeThreshold(
  layers: TraceLayer[],
  options: ResolvedVectorizeOptions,
): number {
  if (options.thresholdMode === "manual") {
    return clamp(options.threshold / 255, 0.1, 0.9);
  }

  const shapeSamples = layers
    .filter((layer) => layer.branch === "shape-preview" && !layer.protectedTextLike)
    .map((layer) => layer.luminance);
  let threshold = computeSmartThreshold(shapeSamples);

  switch (options.recipe) {
    case "stamp":
      threshold += 0.1;
      break;
    case "line-art":
      threshold -= 0.06;
      break;
    case "script-logo":
      threshold -= 0.03;
      break;
    case "badge":
    default:
      break;
  }

  return clamp(threshold, 0.34, 0.72);
}

function buildProtectedTextColorSet(manifest: JobManifest): Set<string> {
  return new Set(
    (manifest.images.regions?.masks ?? [])
      .filter((mask: RegionMaskArtifact) => mask.role === "text-like")
      .map((mask: RegionMaskArtifact) => normalizeHexColor(mask.color))
      .filter(Boolean),
  );
}

function getMonochromeStrokeWidth(
  branch: VectorizeOutputKey,
  options: ResolvedVectorizeOptions,
): number {
  switch (branch) {
    case "script-text-preview":
      return options.recipe === "stamp"
        ? 3.2
        : options.recipe === "script-logo" || options.preserveText
          ? 2.8
          : options.recipe === "line-art"
            ? 1.8
            : 2.3;
    case "arc-text-preview":
      return options.recipe === "stamp"
        ? 2.8
        : options.recipe === "script-logo" || options.preserveText
          ? 2.3
          : options.recipe === "line-art"
            ? 1.4
            : 1.9;
    case "contour-preview":
      return options.recipe === "stamp"
        ? 1.7
        : options.recipe === "line-art"
          ? 0.9
          : options.recipe === "script-logo"
            ? 1.2
            : 1.1;
    case "shape-preview":
    default:
      return options.recipe === "stamp"
        ? 2.1
        : options.recipe === "line-art"
          ? 0.9
          : options.recipe === "script-logo"
            ? 1.5
            : 1.35;
  }
}

function resolveMonochromeLayerStyle(
  layer: TraceLayer,
  options: ResolvedVectorizeOptions,
  shapeThreshold: number,
): MonochromeLayerStyle {
  const darkColor = options.outputColor;
  const isProtectedText = layer.protectedTextLike;
  const isTextBranch = layer.branch === "arc-text-preview" || layer.branch === "script-text-preview";
  const isContourBranch = layer.branch === "contour-preview";

  if (isTextBranch || isContourBranch || isProtectedText) {
    return {
      include: true,
      fill: darkColor,
      stroke: DEFAULT_LIGHT_COLOR,
      strokeWidth: getMonochromeStrokeWidth(layer.branch, options),
    };
  }

  const isDarkShape = options.invert
    ? layer.luminance >= shapeThreshold
    : layer.luminance <= shapeThreshold;

  if (!isDarkShape) {
    return {
      include: false,
      fill: "none",
      stroke: "none",
      strokeWidth: 0,
    };
  }

  return {
    include: true,
    fill: darkColor,
    stroke: DEFAULT_LIGHT_COLOR,
    strokeWidth: getMonochromeStrokeWidth(layer.branch, options),
  };
}

function buildMonochromeSvg(
  width: number,
  height: number,
  title: string,
  layers: TraceLayer[],
  branchOrder: VectorizeOutputKey[],
  options: ResolvedVectorizeOptions,
  shapeThreshold: number,
): string {
  const groups = branchOrder.flatMap((branch) => {
    const branchLayers = layers.filter((layer) => layer.branch === branch && layer.paths.length > 0);
    const renderedPaths = branchLayers.flatMap((layer, layerIndex) => {
      const style = resolveMonochromeLayerStyle(layer, options, shapeThreshold);
      if (!style.include) {
        return [];
      }

      return layer.paths.map((pathData, pathIndex) => [
        `    <path`,
        `      id="${escapeXml(`mono-${branch}-${layerIndex + 1}-${pathIndex + 1}`)}"`,
        `      d="${escapeXml(pathData)}"`,
        `      fill="${escapeXml(style.fill)}"`,
        `      stroke="${escapeXml(style.stroke)}"`,
        `      stroke-width="${style.strokeWidth.toFixed(2)}"`,
        `      stroke-linejoin="round"`,
        `      stroke-linecap="round"`,
        `      paint-order="stroke fill"`,
        `    />`,
      ].join(" "));
    });

    if (renderedPaths.length === 0) {
      return [];
    }

    return [`  <g id="${escapeXml(`mono-${branch}`)}">`, ...renderedPaths, "  </g>"];
  });

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title">`,
    `  <title id="title">${escapeXml(title)}</title>`,
    ...groups,
    `</svg>`,
    "",
  ].join("\n");
}

export async function runVectorizeStage(
  jobId: string,
  requestBody: VectorizeRequestBody = {},
): Promise<JobManifest> {
  let manifest = await readManifest(jobId);
  const warnings: string[] = [];
  const options = normalizeVectorizeOptions(requestBody);
  let vectorDoctorDebug = manifest.debug.vectorDoctor;

  const hasVectorDoctorArtifacts =
    vectorDoctorDebug &&
    typeof (vectorDoctorDebug as Record<string, unknown>)?.artifacts === "object";

  if (!hasVectorDoctorArtifacts) {
    await runVectorDoctorStage(jobId);
    manifest = await readManifest(jobId);
    vectorDoctorDebug = manifest.debug.vectorDoctor;
    warnings.push("Vectorize auto-ran vector-doctor because no vector-doctor output was present.");
  }

  const parsedVectorDoctor = parseVectorDoctorDebug(vectorDoctorDebug);
  if (!parsedVectorDoctor.artifacts.colorPreview) {
    throw new VectorizeInputError("Vector-doctor color preview is missing. Run vector-doctor first.");
  }

  const colorPreviewStoragePath = parsedVectorDoctor.artifacts.colorPreview;
  const colorPreviewPath = getJobFilePathFromManifestPath(jobId, colorPreviewStoragePath);
  const colorPreviewImage = await loadRgbaImage(colorPreviewPath);
  const regionColorMap = new Map(
    parsedVectorDoctor.groupedRegions.map((region) => [region.id, normalizeHexColor(region.colorHex)]),
  );
  const protectedTextColors = buildProtectedTextColorSet(manifest);

  const branchOutputs: VectorizeOutputKey[] = [
    "shape-preview",
    "contour-preview",
    "arc-text-preview",
    "script-text-preview",
  ];
  const layers: TraceLayer[] = [];

  for (const branch of branchOutputs) {
    const branchStoragePath = parsedVectorDoctor.artifacts[
      branch === "shape-preview"
        ? "shapePreview"
        : branch === "contour-preview"
          ? "contourPreview"
          : branch === "arc-text-preview"
            ? "arcTextPreview"
            : "scriptTextPreview"
    ];

    if (!branchStoragePath) {
      continue;
    }

    const branchImage = await loadRgbaImage(getJobFilePathFromManifestPath(jobId, branchStoragePath));
    if (
      branchImage.width !== colorPreviewImage.width ||
      branchImage.height !== colorPreviewImage.height
    ) {
      throw new VectorizeInputError(`Vector-doctor artifact "${branch}" does not match color preview dimensions.`);
    }

    const branchMask = buildAlphaMask(branchImage);
    const regionIds = getRegionIdsForOutput(parsedVectorDoctor.mergedIntoOutputs, branch);
    const uniqueColors = [
      ...new Set(
        regionIds
          .map((regionId) => regionColorMap.get(regionId))
          .filter((value): value is string => typeof value === "string"),
      ),
    ];

    for (const colorHex of uniqueColors) {
      const colorMask = buildColorMask(colorPreviewImage, branchMask, colorHex);
      const pixelCount = countMaskPixels(colorMask);
      if (pixelCount < 32) {
        continue;
      }

      const potraceInput = await buildPotraceInput(colorMask, colorPreviewImage.width, colorPreviewImage.height);
      const tracedSvg = await traceSvg(potraceInput, getTraceOptions(branch, options));
      const paths = extractPathData(tracedSvg);
      if (paths.length === 0) {
        continue;
      }

      layers.push({
        branch,
        colorHex,
        pixelCount,
        pathCount: paths.length,
        paths,
        luminance: computeHexLuminance(colorHex),
        protectedTextLike: protectedTextColors.has(colorHex),
      });
    }
  }

  if (layers.length === 0) {
    throw new VectorizeInputError("Vectorize could not trace any SVG paths from the vector-doctor branches.");
  }

  const shapeThreshold = computeShapeThreshold(layers, options);
  const vectorDir = getJobFilePath(jobId, "images", "vector");
  await ensureDirectories([vectorDir]);

  const logoSvg = buildCompositeSvg(
    colorPreviewImage.width,
    colorPreviewImage.height,
    "Layered logo vector",
    layers,
    ["shape-preview", "contour-preview", "arc-text-preview", "script-text-preview"],
  );
  const detailSvg = buildCompositeSvg(
    colorPreviewImage.width,
    colorPreviewImage.height,
    "Detailed logo vector",
    layers,
    ["shape-preview", "arc-text-preview", "script-text-preview", "contour-preview"],
  );
  const silhouetteSvg = buildCompositeSvg(
    colorPreviewImage.width,
    colorPreviewImage.height,
    "Silhouette vector",
    layers.filter((layer) => layer.branch === "shape-preview" || layer.branch === "contour-preview"),
    ["shape-preview", "contour-preview"],
  );
  const monochromeSvg = buildMonochromeSvg(
    colorPreviewImage.width,
    colorPreviewImage.height,
    "Monochrome logo vector",
    layers,
    ["shape-preview", "contour-preview", "arc-text-preview", "script-text-preview"],
    options,
    shapeThreshold,
  );

  const logoPath = path.join(vectorDir, "logo-layered.svg");
  const detailPath = path.join(vectorDir, "logo-detail.svg");
  const silhouettePath = path.join(vectorDir, "logo-silhouette.svg");
  const monochromePath = path.join(vectorDir, "logo-monochrome.svg");

  await writeFile(logoPath, logoSvg, "utf8");
  await writeFile(detailPath, detailSvg, "utf8");
  await writeFile(silhouettePath, silhouetteSvg, "utf8");
  await writeFile(monochromePath, monochromeSvg, "utf8");

  const logoStoragePath = toStorageRelativePath(logoPath);
  const detailStoragePath = toStorageRelativePath(detailPath);
  const silhouetteStoragePath = toStorageRelativePath(silhouettePath);
  const monochromeStoragePath = toStorageRelativePath(monochromePath);

  manifest.status = "vectorize";
  manifest.svg.logo = logoStoragePath;
  manifest.svg.detail = detailStoragePath;
  manifest.svg.silhouette = silhouetteStoragePath;
  manifest.svg.monochrome = monochromeStoragePath;

  const debugPayload: VectorizeDebugPayload = {
    stage: "vectorize",
    ranAt: new Date().toISOString(),
    sourceImageUsed: colorPreviewStoragePath,
    vectorDoctorDebugPath: parsedVectorDoctor.debugPath,
    outputFiles: {
      logo: logoStoragePath,
      detail: detailStoragePath,
      silhouette: silhouetteStoragePath,
      monochrome: monochromeStoragePath,
    },
    optionsUsed: options,
    shapeThresholdUsed: shapeThreshold,
    layers: layers.map((layer) => ({
      branch: layer.branch,
      colorHex: layer.colorHex,
      pixelCount: layer.pixelCount,
      pathCount: layer.pathCount,
      luminance: layer.luminance,
      protectedTextLike: layer.protectedTextLike,
    })),
    warnings,
  };

  manifest.debug.vectorize = debugPayload as unknown as Record<string, unknown>;
  await writeDebugFile(jobId, "vectorize", debugPayload as unknown as Record<string, unknown>);
  await saveManifest(manifest);

  return manifest;
}
