import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  ensureDirectories,
  getCleanImagesDir,
  getDebugDir,
  getRawImagesDir,
  getStorageRoot,
  readManifest,
  saveManifest,
  writeDebugFile,
} from "../../lib/storage";
import type {
  CleanImageArtifacts,
  ImageDoctorRequestBody,
  ImageDoctorResultPayload,
  ImageDoctorSilhouetteSettings,
  ImageDoctorVectorSettings,
} from "../../types/manifest";

const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const BACKGROUND_LUMA_THRESHOLD = 238;
const HARD_DISTANCE_THRESHOLD = 30;
const SOFT_DISTANCE_THRESHOLD = 64;
const SOFT_LUMA_THRESHOLD = 230;
const TRIM_ALPHA_THRESHOLD = 12;
const PREVIEW_MAX_EDGE = 640;
const VECTOR_PREP_MAX_EDGE = 1800;
const VECTOR_ALPHA_THRESHOLD = 8;
const EDGE_VARIANCE_SOLID_THRESHOLD = 28;
const EDGE_VARIANCE_MIXED_THRESHOLD = 62;
const EDGE_TRANSPARENT_THRESHOLD = 0.35;
const MAX_LOGO_DETAIL_THRESHOLD = 156;
const MAX_LOGO_DETAIL_THRESHOLD_DARK_BACKGROUND = 148;
const DEFAULT_VECTOR_SETTINGS = {
  detailPreset: "balanced",
  threshold: 128,
  contrast: 1.15,
  brightnessOffset: -12,
  sharpenSigma: 1.1,
} as const;
const DEFAULT_SILHOUETTE_SETTINGS = {
  detailPreset: "balanced",
  alphaThreshold: 24,
  edgeGrow: 0,
  blurSigma: 1.9,
} as const;

type ResolvedVectorSettings = {
  detailPreset: "soft" | "balanced" | "fine";
  threshold: number;
  contrast: number;
  brightnessOffset: number;
  sharpenSigma: number;
};

type ResolvedSilhouetteSettings = {
  detailPreset: "tight" | "balanced" | "bold";
  alphaThreshold: number;
  edgeGrow: number;
  blurSigma: number;
};

type BackgroundMode = "transparent" | "light-background" | "dark-background" | "mixed-background";

interface RgbaImage {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  channels: 4;
}

interface GrayscaleImage {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  channels: 1;
}

interface TrimBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface VectorPrepProfile {
  medianSize: number;
  backgroundBlurSigma: number;
  smoothingBlurSigma: number;
  openingRadius: number;
  closingRadius: number;
  maxEdge: number;
}

interface EdgeBackgroundSample {
  r: number;
  g: number;
  b: number;
  luma: number;
  variance: number;
  maxCornerDistance: number;
  transparentFraction: number;
  alphaMean: number;
  dominantHex: string;
  nearWhite: boolean;
}

interface ConnectedComponent {
  id: number;
  pixelCount: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  touchesLeft: boolean;
  touchesRight: boolean;
  touchesTop: boolean;
  touchesBottom: boolean;
}

interface ComponentRemovalRecord {
  id: number;
  pixelCount: number;
  bbox: TrimBounds;
  reason: string;
}

type ComponentKind = "text-like" | "shape-like" | "edge-artifact" | "other";
type GroupedRegionKind = "noise" | "text-group" | "shape-group" | "accent-line-group" | "mixed-group" | "unknown";

interface ComponentSummary {
  id: number;
  pixelCount: number;
  bbox: TrimBounds;
  fillRatio: number;
  aspectRatio: number;
  centerDistance: number;
  edgeTouchCount: number;
  strokeLike: boolean;
  contains: number[];
  dominantRegionId: string | null;
  parentGroupId: string | null;
  removed: boolean;
  kind: ComponentKind;
}

interface GroupedRegionSummary {
  id: string;
  role: GroupedRegionKind;
  pixelCount: number;
  bbox: TrimBounds;
  componentIds: number[];
  dominantRegionId: string | null;
  centerDistance: number;
  edgeTouchCount: number;
  fillRatio: number;
}

interface RegionPrior {
  id: string;
  role: string;
  color: string;
  mask: Uint8Array;
  width: number;
  height: number;
}

interface ImageDoctorDebugPayload {
  stage: "image-doctor";
  ranAt: string;
  sourceFileUsed: string;
  sourceSize: {
    width: number;
    height: number;
    format: string;
    hasAlpha: boolean;
    orientation?: number;
  };
  outputFilePaths: CleanImageArtifacts;
  trimBounds: TrimBounds | null;
  paddingApplied: number;
  thresholdSettings: {
    backgroundLumaThreshold: number;
    hardDistanceThreshold: number;
    softDistanceThreshold: number;
    softLumaThreshold: number;
    vectorThreshold: number;
    silhouetteAlphaThreshold: number;
  };
  contrastSettings: {
    grayscale: boolean;
    normalise: boolean;
    vectorSharpenSigma: number;
    linearMultiplier: number;
    linearOffset: number;
    silhouetteBlurSigma: number;
  };
  morphologySettings: {
    silhouetteEdgeGrow: number;
    vectorOpeningRadius: number;
    vectorClosingRadius: number;
  };
  vectorSettings: ResolvedVectorSettings;
  silhouetteSettings: ResolvedSilhouetteSettings;
  tracePrep: {
    scaleFactor: number;
    scaledWidth: number;
    scaledHeight: number;
    medianSize: number;
    backgroundBlurSigma: number;
    smoothingBlurSigma: number;
  };
  backgroundModeDetected: BackgroundMode;
  edgeSampleColor: string;
  edgeSampleVariance: number;
  backgroundRemovalMethodUsed: string;
  borderArtifactSuppressed: boolean;
  vectorStrategyUsed: string;
  vectorSourceUsed: string;
  foregroundRetentionPct: number;
  thresholdRetryApplied: boolean;
  finalThresholdUsed: number;
  modeSelected: "logo-detail" | "silhouette" | "cut-path";
  vectorBranchSource: string;
  silhouetteBranchSource: string;
  logoDetailFallbackApplied: boolean;
  vectorOverSimplifiedDetected: boolean;
  silhouetteStrategyUsed: string;
  connectedComponentsFound: number;
  componentsRemoved: ComponentRemovalRecord[];
  componentSummary: ComponentSummary[];
  groupedRegionSummary: GroupedRegionSummary[];
  removedTinyComponents: ComponentRemovalRecord[];
  textLikeComponents: number[];
  shapeLikeComponents: number[];
  edgeConnectedComponents: number[];
  groupedTextRegions: string[];
  groupedShapeRegions: string[];
  groupedAccentRegions: string[];
  groupingStrategyUsed: string;
  classificationStrategyUsed: string;
  derivedMasksWritten: Record<string, string>;
  upscaleApplied: boolean;
  textPreserveStrategyUsed: string;
  outerContourStrategyUsed: string;
  backgroundCleanupApplied: boolean;
  warnings: string[];
}

export class ImageDoctorInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageDoctorInputError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.round(clamp(value, min, max));
}

function clampFloat(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Number(clamp(value, min, max).toFixed(2));
}

function resolveVectorSettings(body?: ImageDoctorRequestBody): ResolvedVectorSettings {
  const rawSettings = isRecord(body?.vectorSettings)
    ? (body?.vectorSettings as ImageDoctorVectorSettings)
    : {};

  const preset = rawSettings.detailPreset === "soft" || rawSettings.detailPreset === "fine"
    ? rawSettings.detailPreset
    : "balanced";

  const presetDefaults: Record<ResolvedVectorSettings["detailPreset"], ResolvedVectorSettings> = {
    soft: {
      detailPreset: "soft",
      threshold: 190,
      contrast: 1.0,
      brightnessOffset: -6,
      sharpenSigma: 0.4,
    },
    balanced: {
      detailPreset: "balanced",
      threshold: DEFAULT_VECTOR_SETTINGS.threshold,
      contrast: DEFAULT_VECTOR_SETTINGS.contrast,
      brightnessOffset: DEFAULT_VECTOR_SETTINGS.brightnessOffset,
      sharpenSigma: DEFAULT_VECTOR_SETTINGS.sharpenSigma,
    },
    fine: {
      detailPreset: "fine",
      threshold: 156,
      contrast: 1.28,
      brightnessOffset: -18,
      sharpenSigma: 1.7,
    },
  };

  const fallback = presetDefaults[preset];

  return {
    detailPreset: preset,
    threshold: clampInteger(rawSettings.threshold, fallback.threshold, 80, 240),
    contrast: clampFloat(rawSettings.contrast, fallback.contrast, 0.5, 2.2),
    brightnessOffset: clampInteger(rawSettings.brightnessOffset, fallback.brightnessOffset, -80, 80),
    sharpenSigma: clampFloat(rawSettings.sharpenSigma, fallback.sharpenSigma, 0, 3),
  };
}

function resolveSilhouetteSettings(body?: ImageDoctorRequestBody): ResolvedSilhouetteSettings {
  const rawSettings = isRecord(body?.silhouetteSettings)
    ? (body?.silhouetteSettings as ImageDoctorSilhouetteSettings)
    : {};

  const preset = rawSettings.detailPreset === "tight" || rawSettings.detailPreset === "bold"
    ? rawSettings.detailPreset
    : "balanced";

  const presetDefaults: Record<ResolvedSilhouetteSettings["detailPreset"], ResolvedSilhouetteSettings> = {
    tight: {
      detailPreset: "tight",
      alphaThreshold: 48,
      edgeGrow: -1,
      blurSigma: 0,
    },
    balanced: {
      detailPreset: "balanced",
      alphaThreshold: DEFAULT_SILHOUETTE_SETTINGS.alphaThreshold,
      edgeGrow: DEFAULT_SILHOUETTE_SETTINGS.edgeGrow,
      blurSigma: DEFAULT_SILHOUETTE_SETTINGS.blurSigma,
    },
    bold: {
      detailPreset: "bold",
      alphaThreshold: 12,
      edgeGrow: 2,
      blurSigma: 0.8,
    },
  };

  const fallback = presetDefaults[preset];

  return {
    detailPreset: preset,
    alphaThreshold: clampInteger(rawSettings.alphaThreshold, fallback.alphaThreshold, 1, 255),
    edgeGrow: clampInteger(rawSettings.edgeGrow, fallback.edgeGrow, -6, 6),
    blurSigma: clampFloat(rawSettings.blurSigma, fallback.blurSigma, 0, 3),
  };
}

function toStorageRelativePath(filePath: string): string {
  return path.relative(path.resolve(getStorageRoot()), filePath).replaceAll("\\", "/");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getPixelOffset(x: number, y: number, width: number, channels: number): number {
  return (y * width + x) * channels;
}

function computeLuma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function toHexColor(r: number, g: number, b: number): string {
  const channel = (value: number) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function computeChroma(r: number, g: number, b: number): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function computeColorDistance(
  r: number,
  g: number,
  b: number,
  background: Pick<EdgeBackgroundSample, "r" | "g" | "b">,
): number {
  return Math.sqrt(
    (r - background.r) ** 2 +
      (g - background.g) ** 2 +
      (b - background.b) ** 2,
  );
}

async function loadRgbaImage(source: string | Buffer): Promise<RgbaImage> {
  const { data, info } = await sharp(source)
    .rotate()
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

function sampleCornerAverage(
  image: RgbaImage,
  startX: number,
  startY: number,
  sampleSize: number,
): Pick<EdgeBackgroundSample, "r" | "g" | "b"> {
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let count = 0;

  for (let y = startY; y < startY + sampleSize; y += 1) {
    for (let x = startX; x < startX + sampleSize; x += 1) {
      const offset = getPixelOffset(x, y, image.width, image.channels);
      const alpha = image.pixels[offset + 3];
      if (alpha < 8) {
        continue;
      }

      totalR += image.pixels[offset];
      totalG += image.pixels[offset + 1];
      totalB += image.pixels[offset + 2];
      count += 1;
    }
  }

  if (count === 0) {
    return { r: 255, g: 255, b: 255 };
  }

  return {
    r: totalR / count,
    g: totalG / count,
    b: totalB / count,
  };
}

function estimateBackground(image: RgbaImage): EdgeBackgroundSample {
  const edgeThickness = Math.max(
    1,
    Math.min(
      clamp(Math.round(Math.min(image.width, image.height) * 0.035), 8, 36),
      Math.floor(Math.min(image.width, image.height) / 2),
    ),
  );
  const sampleSize = Math.max(
    1,
    Math.min(
      image.width,
      image.height,
      clamp(Math.round(Math.min(image.width, image.height) * 0.06), 12, 40),
    ),
  );
  const corners = [
    sampleCornerAverage(image, 0, 0, sampleSize),
    sampleCornerAverage(image, image.width - sampleSize, 0, sampleSize),
    sampleCornerAverage(image, 0, image.height - sampleSize, sampleSize),
    sampleCornerAverage(
      image,
      image.width - sampleSize,
      image.height - sampleSize,
      sampleSize,
    ),
  ];

  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let totalAlpha = 0;
  let opaqueCount = 0;
  let transparentCount = 0;
  const sampledColors: Array<{ r: number; g: number; b: number }> = [];

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const isEdge =
        x < edgeThickness ||
        y < edgeThickness ||
        x >= image.width - edgeThickness ||
        y >= image.height - edgeThickness;

      if (!isEdge) {
        continue;
      }

      const offset = getPixelOffset(x, y, image.width, image.channels);
      const alpha = image.pixels[offset + 3];
      totalAlpha += alpha;

      if (alpha < 24) {
        transparentCount += 1;
        continue;
      }

      const r = image.pixels[offset];
      const g = image.pixels[offset + 1];
      const b = image.pixels[offset + 2];
      totalR += r;
      totalG += g;
      totalB += b;
      sampledColors.push({ r, g, b });
      opaqueCount += 1;
    }
  }

  if (opaqueCount === 0) {
    return {
      r: 255,
      g: 255,
      b: 255,
      luma: 255,
      variance: 0,
      maxCornerDistance: 0,
      transparentFraction: 1,
      alphaMean: totalAlpha / Math.max(1, transparentCount),
      dominantHex: "#ffffff",
      nearWhite: true,
    };
  }

  const background = {
    r: totalR / opaqueCount,
    g: totalG / opaqueCount,
    b: totalB / opaqueCount,
  };
  const variance =
    sampledColors.reduce(
      (acc, color) => acc + computeColorDistance(color.r, color.g, color.b, background) ** 2,
      0,
    ) / opaqueCount;
  const maxCornerDistance = Math.max(
    ...corners.map((corner) => computeColorDistance(corner.r, corner.g, corner.b, background)),
  );
  const luma = computeLuma(background.r, background.g, background.b);

  return {
    ...background,
    luma,
    variance: Number(Math.sqrt(Math.max(0, variance)).toFixed(2)),
    maxCornerDistance,
    transparentFraction: Number(
      (transparentCount / Math.max(1, transparentCount + opaqueCount)).toFixed(3),
    ),
    alphaMean: Number((totalAlpha / Math.max(1, transparentCount + opaqueCount)).toFixed(2)),
    dominantHex: toHexColor(background.r, background.g, background.b),
    nearWhite: luma >= BACKGROUND_LUMA_THRESHOLD && maxCornerDistance <= 18,
  };
}

function detectBackgroundMode(image: RgbaImage, background: EdgeBackgroundSample): BackgroundMode {
  if (background.transparentFraction >= EDGE_TRANSPARENT_THRESHOLD) {
    return "transparent";
  }

  const variance = Math.max(background.variance, background.maxCornerDistance);
  if (variance <= EDGE_VARIANCE_SOLID_THRESHOLD && background.luma >= 170) {
    return "light-background";
  }

  if (variance <= EDGE_VARIANCE_SOLID_THRESHOLD && background.luma <= 95) {
    return "dark-background";
  }

  if (variance >= EDGE_VARIANCE_MIXED_THRESHOLD) {
    return "mixed-background";
  }

  return background.luma >= 128 ? "light-background" : "dark-background";
}

function buildForegroundAlpha(
  image: RgbaImage,
  background: EdgeBackgroundSample,
  backgroundMode: BackgroundMode,
): Uint8ClampedArray {
  const alphaMask = new Uint8ClampedArray(image.width * image.height);
  const hardDistanceThreshold = backgroundMode === "dark-background" ? 18 : HARD_DISTANCE_THRESHOLD;
  const softDistanceThreshold = backgroundMode === "dark-background" ? 82 : 104;
  const hardLumaDeltaThreshold = backgroundMode === "dark-background" ? 10 : 14;
  const softLumaDeltaThreshold = backgroundMode === "dark-background" ? 62 : 54;
  const hardChromaThreshold = backgroundMode === "dark-background" ? 12 : 18;
  const softChromaThreshold = backgroundMode === "dark-background" ? 48 : 46;

  for (let offset = 0, pixelIndex = 0; offset < image.pixels.length; offset += image.channels, pixelIndex += 1) {
    const originalAlpha = image.pixels[offset + 3];
    if (originalAlpha === 0) {
      alphaMask[pixelIndex] = 0;
      continue;
    }

    if (backgroundMode === "transparent") {
      alphaMask[pixelIndex] = originalAlpha;
      continue;
    }

    const r = image.pixels[offset];
    const g = image.pixels[offset + 1];
    const b = image.pixels[offset + 2];
    const luma = computeLuma(r, g, b);
    const colorDistance = computeColorDistance(r, g, b, background);
    const lumaDelta = Math.abs(luma - background.luma);
    const chroma = computeChroma(r, g, b);

    const hardBackgroundMatch =
      colorDistance <= hardDistanceThreshold &&
      lumaDelta <= hardLumaDeltaThreshold &&
      chroma <= hardChromaThreshold;

    if (hardBackgroundMatch) {
      alphaMask[pixelIndex] = 0;
      continue;
    }

    const distanceScore = clamp(
      (colorDistance - hardDistanceThreshold) / Math.max(1, softDistanceThreshold - hardDistanceThreshold),
      0,
      1,
    );
    const lumaScore = clamp(
      (lumaDelta - hardLumaDeltaThreshold) / Math.max(1, softLumaDeltaThreshold - hardLumaDeltaThreshold),
      0,
      1,
    );
    const chromaScore = clamp(
      (chroma - hardChromaThreshold) / Math.max(1, softChromaThreshold - hardChromaThreshold),
      0,
      1,
    );
    const occupancyScore = clamp(Math.max(distanceScore, lumaScore, chromaScore), 0, 1);

    alphaMask[pixelIndex] = occupancyScore <= 0.01
      ? 0
      : Math.round(originalAlpha * occupancyScore);
  }

  return alphaMask;
}

function applyBackgroundCleanup(
  image: RgbaImage,
  background: EdgeBackgroundSample,
  backgroundMode: BackgroundMode,
): {
  pixels: Uint8ClampedArray;
  alphaMask: Uint8ClampedArray;
  applied: boolean;
  methodUsed: string;
} {
  const alphaMask = buildForegroundAlpha(image, background, backgroundMode);
  const nextPixels = new Uint8ClampedArray(image.pixels);

  for (let offset = 0, pixelIndex = 0; offset < nextPixels.length; offset += image.channels, pixelIndex += 1) {
    nextPixels[offset + 3] = alphaMask[pixelIndex];
  }

  const methodUsed =
    backgroundMode === "transparent"
      ? "existing-alpha"
      : backgroundMode === "light-background"
        ? "edge-color-light-background-distance"
        : backgroundMode === "dark-background"
          ? "edge-color-dark-background-distance"
          : "edge-color-mixed-background-conservative";

  return {
    pixels: nextPixels,
    alphaMask,
    applied: backgroundMode !== "transparent",
    methodUsed,
  };
}

function computeTrimBounds(image: RgbaImage, alphaThreshold: number): TrimBounds | null {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = getPixelOffset(x, y, image.width, image.channels);
      if (image.pixels[offset + 3] < alphaThreshold) {
        continue;
      }

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX === -1 || maxY === -1) {
    return null;
  }

  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function getVectorPrepProfile(
  preset: ResolvedVectorSettings["detailPreset"],
): VectorPrepProfile {
  switch (preset) {
    case "soft":
      return {
        medianSize: 5,
        backgroundBlurSigma: 10,
        smoothingBlurSigma: 0.9,
        openingRadius: 1,
        closingRadius: 2,
        maxEdge: VECTOR_PREP_MAX_EDGE,
      };
    case "fine":
      return {
        medianSize: 3,
        backgroundBlurSigma: 5,
        smoothingBlurSigma: 0.35,
        openingRadius: 0,
        closingRadius: 1,
        maxEdge: 2200,
      };
    default:
      return {
        medianSize: 3,
        backgroundBlurSigma: 7,
        smoothingBlurSigma: 0.6,
        openingRadius: 1,
        closingRadius: 1,
        maxEdge: VECTOR_PREP_MAX_EDGE,
      };
  }
}

function buildBinaryMaskFromAlpha(image: RgbaImage, alphaThreshold: number): Uint8Array {
  const mask = new Uint8Array(image.width * image.height);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = getPixelOffset(x, y, image.width, image.channels);
      const alpha = image.pixels[offset + 3];
      mask[y * image.width + x] = alpha >= alphaThreshold ? 1 : 0;
    }
  }

  return mask;
}

function buildMaskBuffer(
  mask: Uint8Array,
  foregroundValue = 255,
  backgroundValue = 0,
): Buffer {
  const output = Buffer.alloc(mask.length);
  for (let index = 0; index < mask.length; index += 1) {
    output[index] = mask[index] ? foregroundValue : backgroundValue;
  }
  return output;
}

async function buildMaskedColorComposite(
  source: Buffer,
  targetWidth: number,
  targetHeight: number,
  mask: Uint8Array,
): Promise<Buffer> {
  const { data, info } = await sharp(source)
    .resize({
      width: targetWidth,
      height: targetHeight,
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const output = Buffer.alloc(info.width * info.height * 4, 0);
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] === 0) {
      continue;
    }

    const offset = index * 4;
    output[offset] = data[offset];
    output[offset + 1] = data[offset + 1];
    output[offset + 2] = data[offset + 2];
    output[offset + 3] = data[offset + 3];
  }

  return sharp(output, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();
}

function findConnectedComponents(
  mask: Uint8Array,
  width: number,
  height: number,
): { components: ConnectedComponent[]; labels: Int32Array } {
  const visited = new Uint8Array(mask.length);
  const labels = new Int32Array(mask.length);
  const components: ConnectedComponent[] = [];
  const queueX = new Int32Array(mask.length);
  const queueY = new Int32Array(mask.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const startIndex = y * width + x;
      if (mask[startIndex] === 0 || visited[startIndex] === 1) {
        continue;
      }

      let head = 0;
      let tail = 0;
      queueX[tail] = x;
      queueY[tail] = y;
      tail += 1;
      visited[startIndex] = 1;
      const componentId = components.length + 1;
      labels[startIndex] = componentId;

      const component: ConnectedComponent = {
        id: componentId,
        pixelCount: 0,
        minX: x,
        minY: y,
        maxX: x,
        maxY: y,
        touchesLeft: x === 0,
        touchesRight: x === width - 1,
        touchesTop: y === 0,
        touchesBottom: y === height - 1,
      };

      while (head < tail) {
        const currentX = queueX[head];
        const currentY = queueY[head];
        head += 1;
        const currentIndex = currentY * width + currentX;
        component.pixelCount += 1;
        if (currentX < component.minX) component.minX = currentX;
        if (currentY < component.minY) component.minY = currentY;
        if (currentX > component.maxX) component.maxX = currentX;
        if (currentY > component.maxY) component.maxY = currentY;
        if (currentX === 0) component.touchesLeft = true;
        if (currentX === width - 1) component.touchesRight = true;
        if (currentY === 0) component.touchesTop = true;
        if (currentY === height - 1) component.touchesBottom = true;

        for (let neighborY = currentY - 1; neighborY <= currentY + 1; neighborY += 1) {
          for (let neighborX = currentX - 1; neighborX <= currentX + 1; neighborX += 1) {
            if (
              neighborX < 0 ||
              neighborY < 0 ||
              neighborX >= width ||
              neighborY >= height ||
              (neighborX === currentX && neighborY === currentY)
            ) {
              continue;
            }

            const neighborIndex = neighborY * width + neighborX;
            if (mask[neighborIndex] === 0 || visited[neighborIndex] === 1) {
              continue;
            }

            visited[neighborIndex] = 1;
            labels[neighborIndex] = componentId;
            queueX[tail] = neighborX;
            queueY[tail] = neighborY;
            tail += 1;
          }
        }
      }

      components.push(component);
    }
  }

  return { components, labels };
}

function suppressBorderArtifacts(
  mask: Uint8Array,
  width: number,
  height: number,
): {
  mask: Uint8Array;
  componentsFound: number;
  componentsRemoved: ComponentRemovalRecord[];
  borderArtifactSuppressed: boolean;
} {
  const { components, labels } = findConnectedComponents(mask, width, height);
  const nextMask = new Uint8Array(mask);
  const componentsRemoved: ComponentRemovalRecord[] = [];
  const imageArea = width * height;

  for (const component of components) {
    const bboxWidth = component.maxX - component.minX + 1;
    const bboxHeight = component.maxY - component.minY + 1;
    const bboxArea = bboxWidth * bboxHeight;
    const fillRatio = component.pixelCount / Math.max(1, bboxArea);
    const edgeTouchCount = Number(component.touchesLeft) +
      Number(component.touchesRight) +
      Number(component.touchesTop) +
      Number(component.touchesBottom);
    const spansOppositeEdges =
      (component.touchesLeft && component.touchesRight) ||
      (component.touchesTop && component.touchesBottom);
    const largeFrameLike =
      bboxArea >= imageArea * 0.38 &&
      fillRatio <= 0.22 &&
      (edgeTouchCount >= 3 || spansOppositeEdges);

    if (!largeFrameLike) {
      continue;
    }

    for (let index = 0; index < nextMask.length; index += 1) {
      if (labels[index] === component.id) {
        nextMask[index] = 0;
      }
    }

    componentsRemoved.push({
      id: component.id,
      pixelCount: component.pixelCount,
      bbox: {
        left: component.minX,
        top: component.minY,
        width: bboxWidth,
        height: bboxHeight,
      },
      reason: "edge-connected frame artifact",
    });
  }

  return {
    mask: nextMask,
    componentsFound: components.length,
    componentsRemoved,
    borderArtifactSuppressed: componentsRemoved.length > 0,
  };
}

async function loadRegionPriors(
  manifest: Awaited<ReturnType<typeof readManifest>>,
): Promise<RegionPrior[]> {
  const masks = manifest.images.regions?.masks ?? [];
  const priors: RegionPrior[] = [];

  for (const maskRecord of masks) {
    try {
      const filePath = path.resolve(getStorageRoot(), maskRecord.mask);
      const { data, info } = await sharp(await readFile(filePath))
        .ensureAlpha()
        .extractChannel(0)
        .raw()
        .toBuffer({ resolveWithObject: true });
      priors.push({
        id: maskRecord.id,
        role: maskRecord.role,
        color: maskRecord.color,
        mask: Uint8Array.from(data, (value) => (value >= 128 ? 1 : 0)),
        width: info.width,
        height: info.height,
      });
    } catch {
      continue;
    }
  }

  return priors;
}

function computeBoundingBoxDistance(left: TrimBounds, right: TrimBounds): number {
  const horizontalGap = Math.max(
    0,
    Math.max(left.left - (right.left + right.width), right.left - (left.left + left.width)),
  );
  const verticalGap = Math.max(
    0,
    Math.max(left.top - (right.top + right.height), right.top - (left.top + left.height)),
  );
  return Math.sqrt(horizontalGap ** 2 + verticalGap ** 2);
}

function resizeBinaryMaskNearest(
  mask: Uint8Array,
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number,
): Uint8Array {
  if (width === targetWidth && height === targetHeight) {
    return new Uint8Array(mask);
  }

  const output = new Uint8Array(targetWidth * targetHeight);
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.min(height - 1, Math.floor((y / Math.max(1, targetHeight)) * height));
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(width - 1, Math.floor((x / Math.max(1, targetWidth)) * width));
      output[y * targetWidth + x] = mask[sourceY * width + sourceX];
    }
  }
  return output;
}

function assignDominantRegionId(
  component: ConnectedComponent,
  priors: RegionPrior[],
  width: number,
  height: number,
  labels: Int32Array,
): string | null {
  if (priors.length === 0) {
    return null;
  }

  let bestRegionId: string | null = null;
  let bestOverlap = 0;

  for (const prior of priors) {
    const priorMask = resizeBinaryMaskNearest(prior.mask, prior.width, prior.height, width, height);
    let overlap = 0;
    for (let y = component.minY; y <= component.maxY; y += 1) {
      for (let x = component.minX; x <= component.maxX; x += 1) {
        const index = y * width + x;
        if (labels[index] === component.id && priorMask[index] === 1) {
          overlap += 1;
        }
      }
    }

    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestRegionId = prior.id;
    }
  }

  return bestOverlap >= Math.max(24, component.pixelCount * 0.18) ? bestRegionId : null;
}

function groupComponents(
  summaries: ComponentSummary[],
  width: number,
  height: number,
): GroupedRegionSummary[] {
  const active = summaries.filter((summary) => !summary.removed && summary.kind !== "edge-artifact");
  const visited = new Set<number>();
  const groups: GroupedRegionSummary[] = [];
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  for (const seed of active) {
    if (visited.has(seed.id)) {
      continue;
    }

    const queue = [seed];
    const members: ComponentSummary[] = [];
    visited.add(seed.id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      members.push(current);

      for (const candidate of active) {
        if (visited.has(candidate.id) || candidate.id === current.id) {
          continue;
        }

        const distance = computeBoundingBoxDistance(current.bbox, candidate.bbox);
        const verticalAligned = Math.abs(current.bbox.top - candidate.bbox.top) <= height * 0.08;
        const horizontalAligned = Math.abs(current.bbox.left - candidate.bbox.left) <= width * 0.08;
        const similarBand =
          Math.abs(
            (current.bbox.top + current.bbox.height / 2) - (candidate.bbox.top + candidate.bbox.height / 2),
          ) <= height * 0.12;
        const sameRegion =
          current.dominantRegionId !== null &&
          current.dominantRegionId === candidate.dominantRegionId;
        const sameStrokeFamily =
          current.strokeLike === candidate.strokeLike &&
          Math.abs(current.fillRatio - candidate.fillRatio) <= 0.22;
        const similarScale =
          Math.abs(current.bbox.height - candidate.bbox.height) <= height * 0.08 &&
          Math.abs(current.bbox.width - candidate.bbox.width) <= width * 0.18;
        const closeEnough =
          (sameRegion && distance <= Math.max(width, height) * 0.06) ||
          (sameStrokeFamily && similarBand && distance <= Math.max(width, height) * 0.028) ||
          (sameStrokeFamily && verticalAligned && distance <= width * 0.032) ||
          (sameStrokeFamily && horizontalAligned && distance <= height * 0.032) ||
          (sameStrokeFamily && similarScale && distance <= Math.max(width, height) * 0.022);

        if (!closeEnough) {
          continue;
        }

        visited.add(candidate.id);
        queue.push(candidate);
      }
    }

    const minX = Math.min(...members.map((member) => member.bbox.left));
    const minY = Math.min(...members.map((member) => member.bbox.top));
    const maxX = Math.max(...members.map((member) => member.bbox.left + member.bbox.width - 1));
    const maxY = Math.max(...members.map((member) => member.bbox.top + member.bbox.height - 1));
    const bbox: TrimBounds = {
      left: minX,
      top: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };
    const pixelCount = members.reduce((sum, member) => sum + member.pixelCount, 0);
    const bboxArea = bbox.width * bbox.height;
    const fillRatio = pixelCount / Math.max(1, bboxArea);
    const centerX = bbox.left + bbox.width / 2;
    const centerY = bbox.top + bbox.height / 2;
    const centerDistance = Math.sqrt(
      ((centerX - halfWidth) / Math.max(1, halfWidth)) ** 2 +
        ((centerY - halfHeight) / Math.max(1, halfHeight)) ** 2,
    );
    const edgeTouchCount = Math.max(...members.map((member) => member.edgeTouchCount));
    const dominantRegionId =
      members.find((member) => member.dominantRegionId !== null)?.dominantRegionId ?? null;
    const textMemberCount = members.filter((member) => member.strokeLike).length;
    const thinWideGroup = bbox.width >= width * 0.18 && bbox.height <= height * 0.22;
    const sideAccentGroup =
      centerDistance >= 0.72 &&
      fillRatio <= 0.28 &&
      (bbox.width <= width * 0.28 || bbox.height <= height * 0.22);
    const dominantCentralShape =
      pixelCount >= width * height * 0.02 &&
      centerDistance <= 0.52 &&
      fillRatio >= 0.18;
    const mostlyText =
      textMemberCount >= Math.max(1, Math.ceil(members.length * 0.55)) &&
      thinWideGroup &&
      !sideAccentGroup;
    const topBandText =
      bbox.top <= height * 0.22 &&
      bbox.width >= width * 0.25 &&
      bbox.height <= height * 0.18 &&
      fillRatio <= 0.24;
    const scriptBandText =
      textMemberCount >= Math.max(1, Math.ceil(members.length * 0.5)) &&
      bbox.width >= width * 0.18 &&
      bbox.height <= height * 0.18 &&
      fillRatio <= 0.28;

    let role: GroupedRegionKind = "unknown";
    if (pixelCount <= width * height * 0.0004 || bboxArea <= width * height * 0.0008) {
      role = "noise";
    } else if (mostlyText || topBandText || scriptBandText || (dominantRegionId === "region-04" && thinWideGroup)) {
      role = "text-group";
    } else if (dominantCentralShape || dominantRegionId === "region-01" || dominantRegionId === "region-02") {
      role = "shape-group";
    } else if (sideAccentGroup || dominantRegionId?.startsWith("region-04")) {
      role = "accent-line-group";
    } else if (members.some((member) => member.kind === "shape-like") && members.some((member) => member.strokeLike)) {
      role = "mixed-group";
    }

    const groupId = `group-${String(groups.length + 1).padStart(2, "0")}`;
    for (const member of members) {
      member.parentGroupId = groupId;
    }

    groups.push({
      id: groupId,
      role,
      pixelCount,
      bbox,
      componentIds: members.map((member) => member.id),
      dominantRegionId,
      centerDistance: Number(centerDistance.toFixed(3)),
      edgeTouchCount,
      fillRatio: Number(fillRatio.toFixed(3)),
    });
  }

  return groups;
}

function classifyConnectedComponents(
  mask: Uint8Array,
  width: number,
  height: number,
  priors: RegionPrior[],
): {
  summaries: ComponentSummary[];
  labels: Int32Array;
  textLikeIds: number[];
  shapeLikeIds: number[];
  edgeConnectedIds: number[];
  groups: GroupedRegionSummary[];
  removedTinyComponents: ComponentRemovalRecord[];
  groupedTextRegions: string[];
  groupedShapeRegions: string[];
  groupedAccentRegions: string[];
} {
  const { components, labels } = findConnectedComponents(mask, width, height);
  const imageArea = width * height;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const tinyPixelThreshold = Math.max(6, Math.round(imageArea * 0.00003));
  const tinyBboxThreshold = Math.max(4, Math.round(Math.min(width, height) * 0.01));
  const removedTinyComponents: ComponentRemovalRecord[] = [];

  const summaries: ComponentSummary[] = components.map((component) => {
    const bboxWidth = component.maxX - component.minX + 1;
    const bboxHeight = component.maxY - component.minY + 1;
    const bboxArea = bboxWidth * bboxHeight;
    const fillRatio = component.pixelCount / Math.max(1, bboxArea);
    const aspectRatio = bboxWidth / Math.max(1, bboxHeight);
    const centerX = component.minX + bboxWidth / 2;
    const centerY = component.minY + bboxHeight / 2;
    const centerDistance = Math.sqrt(
      ((centerX - halfWidth) / Math.max(1, halfWidth)) ** 2 +
        ((centerY - halfHeight) / Math.max(1, halfHeight)) ** 2,
    );
    const edgeTouchCount = Number(component.touchesLeft) +
      Number(component.touchesRight) +
      Number(component.touchesTop) +
      Number(component.touchesBottom);
    const dominantRegionId = assignDominantRegionId(component, priors, width, height, labels);
    const tinyFragment =
      component.pixelCount <= tinyPixelThreshold ||
      (bboxWidth <= tinyBboxThreshold && bboxHeight <= tinyBboxThreshold) ||
      (component.pixelCount <= tinyPixelThreshold * 2 && fillRatio <= 0.18);
    const strokeLike =
      fillRatio <= 0.42 ||
      aspectRatio >= 2.1 ||
      bboxHeight <= height * 0.16;
    const largeShape =
      component.pixelCount >= imageArea * 0.02 ||
      bboxArea >= imageArea * 0.045;
    const edgeArtifact =
      edgeTouchCount >= 2 &&
      bboxArea >= imageArea * 0.02 &&
      fillRatio <= 0.32 &&
      centerDistance >= 0.45;
    const textLike =
      !edgeArtifact &&
      strokeLike &&
      !largeShape &&
      bboxHeight <= height * 0.32 &&
      (aspectRatio >= 1.45 || component.pixelCount <= imageArea * 0.008);
    const shapeLike =
      !edgeArtifact &&
      !textLike &&
      (largeShape || fillRatio >= 0.3 || centerDistance <= 0.7);

    if (tinyFragment) {
      removedTinyComponents.push({
        id: component.id,
        pixelCount: component.pixelCount,
        bbox: {
          left: component.minX,
          top: component.minY,
          width: bboxWidth,
          height: bboxHeight,
        },
        reason: "tiny fragment suppressed before grouping",
      });
    }

    return {
      id: component.id,
      pixelCount: component.pixelCount,
      bbox: {
        left: component.minX,
        top: component.minY,
        width: bboxWidth,
        height: bboxHeight,
      },
      fillRatio: Number(fillRatio.toFixed(3)),
      aspectRatio: Number(aspectRatio.toFixed(3)),
      centerDistance: Number(centerDistance.toFixed(3)),
      edgeTouchCount,
      strokeLike,
      contains: [],
      dominantRegionId,
      parentGroupId: null,
      removed: tinyFragment,
      kind: edgeArtifact ? "edge-artifact" : textLike ? "text-like" : shapeLike ? "shape-like" : "other",
    };
  });

  for (const outer of summaries) {
    outer.contains = summaries
      .filter((inner) =>
        inner.id !== outer.id &&
        inner.bbox.left >= outer.bbox.left &&
        inner.bbox.top >= outer.bbox.top &&
        inner.bbox.left + inner.bbox.width <= outer.bbox.left + outer.bbox.width &&
        inner.bbox.top + inner.bbox.height <= outer.bbox.top + outer.bbox.height,
      )
      .map((inner) => inner.id);
  }

  const groups = groupComponents(summaries, width, height);
  const groupedTextRegions = groups.filter((group) => group.role === "text-group").map((group) => group.id);
  const groupedShapeRegions = groups.filter((group) => group.role === "shape-group").map((group) => group.id);
  const groupedAccentRegions = groups.filter((group) => group.role === "accent-line-group").map((group) => group.id);
  const textLikeIds = groups
    .filter((group) => group.role === "text-group")
    .flatMap((group) => group.componentIds);
  const shapeLikeIds = groups
    .filter((group) => group.role === "shape-group" || group.role === "mixed-group")
    .flatMap((group) => group.componentIds);

  return {
    summaries,
    labels,
    textLikeIds,
    shapeLikeIds,
    edgeConnectedIds: summaries
      .filter((summary) => summary.kind === "edge-artifact" || summary.edgeTouchCount > 0)
      .map((summary) => summary.id),
    groups,
    removedTinyComponents,
    groupedTextRegions,
    groupedShapeRegions,
    groupedAccentRegions,
  };
}

function buildComponentMask(
  labels: Int32Array,
  keepIds: Iterable<number>,
): Uint8Array {
  const keep = new Set(keepIds);
  const mask = new Uint8Array(labels.length);

  for (let index = 0; index < labels.length; index += 1) {
    mask[index] = keep.has(labels[index]) ? 1 : 0;
  }

  return mask;
}

function mergeMasks(...masks: Uint8Array[]): Uint8Array {
  const merged = new Uint8Array(masks[0]?.length ?? 0);

  for (const mask of masks) {
    for (let index = 0; index < merged.length; index += 1) {
      if (mask[index] === 1) {
        merged[index] = 1;
      }
    }
  }

  return merged;
}

async function resizeMask(
  mask: Uint8Array,
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number,
): Promise<Uint8Array> {
  if (width === targetWidth && height === targetHeight) {
    return new Uint8Array(mask);
  }

  const buffer = await sharp(buildMaskBuffer(mask), {
    raw: { width, height, channels: 1 },
  })
    .resize({
      width: targetWidth,
      height: targetHeight,
      fit: "fill",
      kernel: sharp.kernel.nearest,
    })
    .raw()
    .toBuffer();

  return Uint8Array.from(buffer, (value) => (value >= 128 ? 1 : 0));
}

async function writeDerivedMask(
  mask: Uint8Array,
  width: number,
  height: number,
  targetPath: string,
  foregroundBlackOnWhite = false,
): Promise<void> {
  await sharp(
    buildMaskBuffer(
      mask,
      foregroundBlackOnWhite ? 0 : 255,
      foregroundBlackOnWhite ? 255 : 0,
    ),
    {
    raw: { width, height, channels: 1 },
    },
  )
    .png()
    .toFile(targetPath);
}

async function loadSingleChannelImage(pipeline: sharp.Sharp): Promise<GrayscaleImage> {
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });

  return {
    pixels: new Uint8ClampedArray(data),
    width: info.width,
    height: info.height,
    channels: 1,
  };
}

async function buildPreparedVectorGrayscale(
  subjectTransparentBuffer: Buffer,
  vectorSettings: ResolvedVectorSettings,
): Promise<{
  image: GrayscaleImage;
  alphaMask: Uint8Array;
  profile: VectorPrepProfile;
  scaleFactor: number;
}> {
  const metadata = await sharp(subjectTransparentBuffer).metadata();
  const sourceWidth = metadata.width ?? 0;
  const sourceHeight = metadata.height ?? 0;
  const profile = getVectorPrepProfile(vectorSettings.detailPreset);
  const maxEdge = Math.max(sourceWidth, sourceHeight, 1);
  const scaleFactor = clamp(profile.maxEdge / maxEdge, 1, 2);
  const scaledWidth = Math.max(1, Math.round(sourceWidth * scaleFactor));
  const scaledHeight = Math.max(1, Math.round(sourceHeight * scaleFactor));

  let basePipeline = sharp(subjectTransparentBuffer)
    .flatten({ background: "#ffffff" })
    .grayscale()
    .normalise()
    .median(profile.medianSize)
    .resize({
      width: scaledWidth,
      height: scaledHeight,
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    });

  if (vectorSettings.sharpenSigma > 0) {
    basePipeline = basePipeline.sharpen({ sigma: vectorSettings.sharpenSigma });
  }

  const [baseImage, blurredImage, alphaImage] = await Promise.all([
    loadSingleChannelImage(basePipeline.clone()),
    loadSingleChannelImage(
      sharp(subjectTransparentBuffer)
        .flatten({ background: "#ffffff" })
        .grayscale()
        .resize({
          width: scaledWidth,
          height: scaledHeight,
          fit: "fill",
          kernel: sharp.kernel.lanczos3,
        })
        .blur(profile.backgroundBlurSigma),
    ),
    loadSingleChannelImage(
      sharp(subjectTransparentBuffer)
        .ensureAlpha()
        .extractChannel(3)
        .resize({
          width: scaledWidth,
          height: scaledHeight,
          fit: "fill",
          kernel: sharp.kernel.nearest,
        }),
    ),
  ]);

  let minPixel = 255;
  let maxPixel = 0;
  const compensated = new Uint8ClampedArray(baseImage.pixels.length);

  for (let index = 0; index < compensated.length; index += 1) {
    if (alphaImage.pixels[index] < VECTOR_ALPHA_THRESHOLD) {
      compensated[index] = 255;
      continue;
    }

    const localBackground = blurredImage.pixels[index];
    const localValue = baseImage.pixels[index];
    const backgroundCompensated = clamp(localValue - localBackground + 255, 0, 255);
    const contrastAdjusted = clamp(
      (backgroundCompensated - 128) * vectorSettings.contrast + 128 + vectorSettings.brightnessOffset,
      0,
      255,
    );
    const blended = clamp(
      contrastAdjusted * 0.8 + localValue * 0.2,
      0,
      255,
    );

    const rounded = Math.round(blended);
    compensated[index] = rounded;
    if (rounded < minPixel) minPixel = rounded;
    if (rounded > maxPixel) maxPixel = rounded;
  }

  const normalized = new Uint8ClampedArray(compensated.length);
  const range = Math.max(1, maxPixel - minPixel);

  for (let index = 0; index < normalized.length; index += 1) {
    if (alphaImage.pixels[index] < VECTOR_ALPHA_THRESHOLD) {
      normalized[index] = 255;
      continue;
    }

    normalized[index] = Math.round(
      clamp(((compensated[index] - minPixel) * 255) / range, 0, 255),
    );
  }

  return {
    image: {
      pixels: normalized,
      width: baseImage.width,
      height: baseImage.height,
      channels: 1,
    },
    alphaMask: Uint8Array.from(
      alphaImage.pixels,
      (value) => (value >= VECTOR_ALPHA_THRESHOLD ? 1 : 0),
    ),
    profile,
    scaleFactor: Number(scaleFactor.toFixed(2)),
  };
}

function buildAlphaMask(image: RgbaImage, alphaThreshold: number): Uint8Array {
  return buildBinaryMaskFromAlpha(image, alphaThreshold);
}

function computeLocalMeanImage(image: GrayscaleImage, radius: number): Uint8ClampedArray {
  const integral = new Float64Array((image.width + 1) * (image.height + 1));

  for (let y = 1; y <= image.height; y += 1) {
    let rowSum = 0;
    for (let x = 1; x <= image.width; x += 1) {
      rowSum += image.pixels[(y - 1) * image.width + (x - 1)];
      integral[y * (image.width + 1) + x] = integral[(y - 1) * (image.width + 1) + x] + rowSum;
    }
  }

  const output = new Uint8ClampedArray(image.width * image.height);
  for (let y = 0; y < image.height; y += 1) {
    const top = Math.max(0, y - radius);
    const bottom = Math.min(image.height - 1, y + radius);
    for (let x = 0; x < image.width; x += 1) {
      const left = Math.max(0, x - radius);
      const right = Math.min(image.width - 1, x + radius);
      const area = (right - left + 1) * (bottom - top + 1);
      const sum =
        integral[(bottom + 1) * (image.width + 1) + (right + 1)] -
        integral[top * (image.width + 1) + (right + 1)] -
        integral[(bottom + 1) * (image.width + 1) + left] +
        integral[top * (image.width + 1) + left];
      output[y * image.width + x] = Math.round(sum / Math.max(1, area));
    }
  }

  return output;
}

function buildVectorInputPixels(
  image: GrayscaleImage,
  alphaMask: Uint8Array,
  vectorSettings: ResolvedVectorSettings,
): { pixels: Buffer; strategyUsed: string } {
  const output = Buffer.alloc(image.width * image.height, 255);
  const darknessThreshold = clampInteger(
    vectorSettings.threshold,
    DEFAULT_VECTOR_SETTINGS.threshold,
    24,
    255,
  );
  const adaptiveRadius = clamp(
    Math.round(Math.max(image.width, image.height) * 0.012),
    8,
    28,
  );
  const localMean = computeLocalMeanImage(image, adaptiveRadius);
  const adaptiveOffset = clamp(Math.round((240 - darknessThreshold) * 0.22), 6, 28);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const index = y * image.width + x;
      if (alphaMask[index] === 0) {
        output[index] = 255;
        continue;
      }

      const pixel = image.pixels[index];
      const localThreshold = clamp(localMean[index] - adaptiveOffset, 24, 245);
      output[index] = pixel <= Math.min(darknessThreshold, localThreshold) || pixel <= localThreshold
        ? 0
        : 255;
    }
  }

  return {
    pixels: output,
    strategyUsed: "adaptive-local-threshold-with-occupancy-gating",
  };
}

function buildTextPreservePixels(
  image: GrayscaleImage,
  alphaMask: Uint8Array,
  textMask: Uint8Array,
  vectorSettings: ResolvedVectorSettings,
): { pixels: Buffer; strategyUsed: string } {
  const output = Buffer.alloc(image.width * image.height, 255);
  const adaptiveRadius = clamp(
    Math.round(Math.max(image.width, image.height) * 0.014),
    10,
    32,
  );
  const localMean = computeLocalMeanImage(image, adaptiveRadius);
  const threshold = clampInteger(vectorSettings.threshold + 18, vectorSettings.threshold, 40, 248);
  const localOffset = clamp(Math.round((255 - threshold) * 0.14), 3, 16);

  for (let index = 0; index < output.length; index += 1) {
    if (alphaMask[index] === 0 || textMask[index] === 0) {
      output[index] = 255;
      continue;
    }

    const pixel = image.pixels[index];
    const textThreshold = clamp(localMean[index] - localOffset, 28, 250);
    output[index] = pixel <= Math.max(textThreshold, threshold) ? 0 : 255;
  }

  return {
    pixels: output,
    strategyUsed: "component-aware-gentle-local-threshold",
  };
}

function withVectorThreshold(
  vectorSettings: ResolvedVectorSettings,
  threshold: number,
): ResolvedVectorSettings {
  return {
    ...vectorSettings,
    threshold: clampInteger(threshold, vectorSettings.threshold, 24, 255),
  };
}

function buildCompositeTraceMask(
  vectorPixels: Buffer,
  textPreservePixels: Buffer,
  textMask: Uint8Array,
  shapeMask: Uint8Array,
  accentMask: Uint8Array,
  detailMask: Uint8Array,
  occupancyMask: Uint8Array,
  colorAssistMask: Uint8Array,
): {
  mask: Uint8Array;
  occupancyPixels: number;
  foregroundPixels: number;
  assistOnlyPixels: number;
} {
  const mask = new Uint8Array(occupancyMask.length);
  let occupancyPixels = 0;
  let foregroundPixels = 0;
  let assistOnlyPixels = 0;

  for (let index = 0; index < mask.length; index += 1) {
    const occupancy = occupancyMask[index] === 1;
    if (occupancy) {
      occupancyPixels += 1;
    }

    const shapeHit =
      shapeMask[index] === 1 &&
      vectorPixels[index] === 0;
    const textHit =
      textMask[index] === 1 &&
      (textPreservePixels[index] === 0 || (colorAssistMask[index] === 1 && vectorPixels[index] === 0));
    const accentHit =
      accentMask[index] === 1 &&
      (colorAssistMask[index] === 1 || textPreservePixels[index] === 0);
    const detailHit =
      detailMask[index] === 1 &&
      (textPreservePixels[index] === 0 || (colorAssistMask[index] === 1 && vectorPixels[index] === 0));
    const keepPixel = shapeHit || textHit || accentHit || detailHit;

    if (keepPixel) {
      mask[index] = 1;
      foregroundPixels += 1;
      if (
        colorAssistMask[index] === 1 &&
        vectorPixels[index] !== 0 &&
        textPreservePixels[index] !== 0
      ) {
        assistOnlyPixels += 1;
      }
    }
  }

  return {
    mask,
    occupancyPixels,
    foregroundPixels,
    assistOnlyPixels,
  };
}

function detectOverSimplifiedTracePrep(
  compositeTrace: {
    occupancyPixels: number;
    foregroundPixels: number;
    assistOnlyPixels: number;
  },
  totalPixels: number,
): boolean {
  if (compositeTrace.occupancyPixels === 0 || compositeTrace.foregroundPixels === 0) {
    return false;
  }

  const occupancyRetention = compositeTrace.foregroundPixels / compositeTrace.occupancyPixels;
  const foregroundFillPct = compositeTrace.foregroundPixels / Math.max(1, totalPixels);
  const assistOnlyPct = compositeTrace.assistOnlyPixels / Math.max(1, compositeTrace.foregroundPixels);

  return occupancyRetention >= 0.92 && foregroundFillPct >= 0.2 && assistOnlyPct >= 0.12;
}

async function buildColorAssistMask(
  subjectTransparentBuffer: Buffer,
  background: EdgeBackgroundSample,
  targetWidth: number,
  targetHeight: number,
): Promise<Uint8Array> {
  const rgba = await loadRgbaImage(
    await sharp(subjectTransparentBuffer)
      .resize({
        width: targetWidth,
        height: targetHeight,
        fit: "fill",
        kernel: sharp.kernel.lanczos3,
      })
      .png()
      .toBuffer(),
  );
  const mask = new Uint8Array(targetWidth * targetHeight);

  for (let offset = 0, pixelIndex = 0; offset < rgba.pixels.length; offset += rgba.channels, pixelIndex += 1) {
    const alpha = rgba.pixels[offset + 3];
    if (alpha < VECTOR_ALPHA_THRESHOLD) {
      continue;
    }

    const r = rgba.pixels[offset];
    const g = rgba.pixels[offset + 1];
    const b = rgba.pixels[offset + 2];
    const distance = computeColorDistance(r, g, b, background);
    const chroma = computeChroma(r, g, b);
    const lumaDelta = Math.abs(computeLuma(r, g, b) - background.luma);
    if (distance >= 28 || chroma >= 22 || lumaDelta >= 28) {
      mask[pixelIndex] = 1;
    }
  }

  return mask;
}

async function findFirstSupportedRawImage(rawDir: string): Promise<string> {
  const entries = await readdir(rawDir, { withFileTypes: true });
  const supportedFiles = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => SUPPORTED_EXTENSIONS.has(path.extname(fileName).toLowerCase()))
    .sort((left, right) => left.localeCompare(right));

  if (supportedFiles.length === 0) {
    throw new ImageDoctorInputError(
      "No supported raw image found. Place a .png, .jpg, .jpeg, or .webp file in images/raw.",
    );
  }

  return path.join(rawDir, supportedFiles[0]);
}

export async function runImageDoctorStage(
  jobId: string,
  body?: ImageDoctorRequestBody,
): Promise<{
  manifest: Awaited<ReturnType<typeof readManifest>>;
  doctor: ImageDoctorResultPayload;
}> {
  const manifest = await readManifest(jobId);
  const rawDir = getRawImagesDir(jobId);
  const cleanDir = getCleanImagesDir(jobId);
  const debugDir = getDebugDir(jobId);
  const vectorSettings = resolveVectorSettings(body);
  const silhouetteSettings = resolveSilhouetteSettings(body);

  await ensureDirectories([rawDir, cleanDir, debugDir]);

  const sourcePath = await findFirstSupportedRawImage(rawDir);
  const sourceMetadata = await sharp(sourcePath).rotate().metadata();
  const sourceRgba = await loadRgbaImage(sourcePath);
  const regionPriors = await loadRegionPriors(manifest);
  const modeSelected: "logo-detail" | "silhouette" | "cut-path" = "logo-detail";
  const background = estimateBackground(sourceRgba);
  const backgroundMode = detectBackgroundMode(sourceRgba, background);
  const cleanupResult = applyBackgroundCleanup(sourceRgba, background, backgroundMode);
  let workingImage: RgbaImage = {
    ...sourceRgba,
    pixels: cleanupResult.pixels,
  };
  const warnings: string[] = [];

  let trimBounds = computeTrimBounds(workingImage, TRIM_ALPHA_THRESHOLD);
  let backgroundCleanupApplied = cleanupResult.applied;

  if (!trimBounds) {
    warnings.push(
      "Background cleanup removed all visible content. Falling back to the unmodified source image.",
    );
    workingImage = sourceRgba;
    trimBounds = computeTrimBounds(workingImage, 1) ?? {
      left: 0,
      top: 0,
      width: workingImage.width,
      height: workingImage.height,
    };
    backgroundCleanupApplied = false;
  }

  if (backgroundMode === "mixed-background") {
    warnings.push(
      "Background cleanup used a conservative mixed-background edge-distance path because the border samples were not uniform.",
    );
  } else if (backgroundMode === "transparent") {
    warnings.push("Existing transparency was preserved as the background source.");
  }

  const paddingApplied = clamp(
    Math.round(Math.max(trimBounds.width, trimBounds.height) * 0.1),
    16,
    96,
  );

  const extracted = sharp(Buffer.from(workingImage.pixels), {
    raw: {
      width: workingImage.width,
      height: workingImage.height,
      channels: workingImage.channels,
    },
  }).extract(trimBounds);

  const paddedTransparent = extracted.extend({
    top: paddingApplied,
    bottom: paddingApplied,
    left: paddingApplied,
    right: paddingApplied,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });

  const subjectTransparentPath = path.join(cleanDir, "subject-transparent.png");
  const subjectCleanPath = path.join(cleanDir, "subject-clean.png");
  const vectorInputPath = path.join(cleanDir, "vector-input.png");
  const silhouetteMaskPath = path.join(cleanDir, "silhouette-mask.png");
  const previewPath = path.join(cleanDir, "preview.jpg");
  const textMaskPath = path.join(debugDir, "text-mask.png");
  const shapeMaskPath = path.join(debugDir, "shape-mask.png");
  const outerContourMaskPath = path.join(debugDir, "outer-contour-mask.png");
  const logoTraceInputPath = path.join(debugDir, "logo-trace-input.png");

  const subjectTransparentBuffer = await paddedTransparent.png().toBuffer();
  await sharp(subjectTransparentBuffer).png().toFile(subjectTransparentPath);

  const subjectCleanBuffer = await sharp(subjectTransparentBuffer)
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer();
  await sharp(subjectCleanBuffer).png().toFile(subjectCleanPath);

  const vectorSourceBuffer = subjectTransparentBuffer ?? subjectCleanBuffer;
  const vectorSourcePath = subjectTransparentPath ?? subjectCleanPath;
  const logoThresholdCap = backgroundMode === "dark-background"
    ? MAX_LOGO_DETAIL_THRESHOLD_DARK_BACKGROUND
    : MAX_LOGO_DETAIL_THRESHOLD;
  const vectorThresholdClamped = vectorSettings.threshold > logoThresholdCap;
  const logoVectorSettings = vectorThresholdClamped
    ? withVectorThreshold(vectorSettings, logoThresholdCap)
    : vectorSettings;
  if (vectorThresholdClamped) {
    warnings.push(
      `Vector threshold ${vectorSettings.threshold} was clamped to ${logoThresholdCap} for logo-detail mode to avoid silhouette-style trace prep.`,
    );
  }
  const silhouetteSource = await loadRgbaImage(subjectTransparentPath);
  const preparedVector = await buildPreparedVectorGrayscale(vectorSourceBuffer, logoVectorSettings);
  const silhouetteOccupancyMask = buildAlphaMask(
    silhouetteSource,
    Math.max(VECTOR_ALPHA_THRESHOLD, Math.min(silhouetteSettings.alphaThreshold, 48)),
  );
  const borderSuppression = suppressBorderArtifacts(
    silhouetteOccupancyMask,
    silhouetteSource.width,
    silhouetteSource.height,
  );
  const componentAnalysis = classifyConnectedComponents(
    borderSuppression.mask,
    silhouetteSource.width,
    silhouetteSource.height,
    regionPriors,
  );
  const groupedTextComponentIds = componentAnalysis.groups
    .filter((group) => group.role === "text-group")
    .flatMap((group) => group.componentIds);
  const groupedShapeComponentIds = componentAnalysis.groups
    .filter((group) => group.role === "shape-group" || group.role === "mixed-group")
    .flatMap((group) => group.componentIds);
  const groupedAccentComponentIds = componentAnalysis.groups
    .filter((group) => group.role === "accent-line-group")
    .flatMap((group) => group.componentIds);
  const groupedDetailComponentIds = componentAnalysis.groups
    .filter((group) =>
      group.role === "accent-line-group" ||
      (group.role === "unknown" &&
        group.fillRatio <= 0.45 &&
        group.pixelCount <= silhouetteSource.width * silhouetteSource.height * 0.025),
    )
    .flatMap((group) => group.componentIds);
  const shapeMaskBase = groupedShapeComponentIds.length > 0
    ? buildComponentMask(componentAnalysis.labels, groupedShapeComponentIds)
    : borderSuppression.mask;
  const textMaskBase = groupedTextComponentIds.length > 0
    ? buildComponentMask(componentAnalysis.labels, groupedTextComponentIds)
    : new Uint8Array(borderSuppression.mask.length);
  const accentMaskBase = groupedAccentComponentIds.length > 0
    ? buildComponentMask(componentAnalysis.labels, groupedAccentComponentIds)
    : new Uint8Array(borderSuppression.mask.length);
  const detailMaskBase = groupedDetailComponentIds.length > 0
    ? buildComponentMask(componentAnalysis.labels, groupedDetailComponentIds)
    : new Uint8Array(borderSuppression.mask.length);
  const occupancyMaskBase = mergeMasks(shapeMaskBase, textMaskBase, accentMaskBase);
  const outerContourSource = groupedShapeComponentIds.length > 0 ? shapeMaskBase : borderSuppression.mask;

  const [textMaskScaled, shapeMaskScaled, accentMaskScaled, detailMaskScaled, occupancyMaskScaled, colorAssistMask] = await Promise.all([
    resizeMask(
      textMaskBase,
      silhouetteSource.width,
      silhouetteSource.height,
      preparedVector.image.width,
      preparedVector.image.height,
    ),
    resizeMask(
      shapeMaskBase,
      silhouetteSource.width,
      silhouetteSource.height,
      preparedVector.image.width,
      preparedVector.image.height,
    ),
    resizeMask(
      accentMaskBase,
      silhouetteSource.width,
      silhouetteSource.height,
      preparedVector.image.width,
      preparedVector.image.height,
    ),
    resizeMask(
      detailMaskBase,
      silhouetteSource.width,
      silhouetteSource.height,
      preparedVector.image.width,
      preparedVector.image.height,
    ),
    resizeMask(
      occupancyMaskBase,
      silhouetteSource.width,
      silhouetteSource.height,
      preparedVector.image.width,
      preparedVector.image.height,
    ),
    buildColorAssistMask(
      subjectTransparentBuffer,
      background,
      preparedVector.image.width,
      preparedVector.image.height,
    ),
  ]);

  const requestedVectorInput = buildVectorInputPixels(
    preparedVector.image,
    preparedVector.alphaMask,
    logoVectorSettings,
  );
  const requestedTextPreserveInput = buildTextPreservePixels(
    preparedVector.image,
    preparedVector.alphaMask,
    textMaskScaled,
    logoVectorSettings,
  );
  let thresholdRetryApplied = false;
  let logoDetailFallbackApplied = vectorThresholdClamped;
  let finalThresholdUsed = clampInteger(
    logoVectorSettings.threshold,
    DEFAULT_VECTOR_SETTINGS.threshold,
    24,
    255,
  );
  let vectorInput = requestedVectorInput;
  let textPreserveInput = requestedTextPreserveInput;
  let compositeTrace = buildCompositeTraceMask(
    vectorInput.pixels,
    textPreserveInput.pixels,
    textMaskScaled,
    shapeMaskScaled,
    accentMaskScaled,
    detailMaskScaled,
    occupancyMaskScaled,
    colorAssistMask,
  );

  const initialForegroundRetention =
    compositeTrace.occupancyPixels > 0
      ? compositeTrace.foregroundPixels / compositeTrace.occupancyPixels
      : 0;
  let vectorOverSimplifiedDetected = detectOverSimplifiedTracePrep(
    compositeTrace,
    preparedVector.image.width * preparedVector.image.height,
  );

  if (initialForegroundRetention < 0.16 || vectorOverSimplifiedDetected) {
    const softerThreshold = clampInteger(
      finalThresholdUsed - (vectorOverSimplifiedDetected ? 20 : 28),
      finalThresholdUsed,
      96,
      logoThresholdCap,
    );
    const retryVectorSettings = withVectorThreshold(logoVectorSettings, softerThreshold);
    const retryVectorInput = buildVectorInputPixels(
      preparedVector.image,
      preparedVector.alphaMask,
      retryVectorSettings,
    );
    const retryTextPreserveInput = buildTextPreservePixels(
      preparedVector.image,
      preparedVector.alphaMask,
      textMaskScaled,
      retryVectorSettings,
    );
    const retryCompositeTrace = buildCompositeTraceMask(
      retryVectorInput.pixels,
      retryTextPreserveInput.pixels,
      textMaskScaled,
      shapeMaskScaled,
      accentMaskScaled,
      detailMaskScaled,
      occupancyMaskScaled,
      colorAssistMask,
    );
    const retryForegroundRetention =
      retryCompositeTrace.occupancyPixels > 0
        ? retryCompositeTrace.foregroundPixels / retryCompositeTrace.occupancyPixels
        : 0;
    const retryOverSimplifiedDetected = detectOverSimplifiedTracePrep(
      retryCompositeTrace,
      preparedVector.image.width * preparedVector.image.height,
    );

    if (
      (initialForegroundRetention < 0.16 && retryForegroundRetention > initialForegroundRetention) ||
      (vectorOverSimplifiedDetected && !retryOverSimplifiedDetected) ||
      (vectorOverSimplifiedDetected &&
        retryForegroundRetention >= Math.max(initialForegroundRetention * 0.82, 0.12))
    ) {
      thresholdRetryApplied = true;
      logoDetailFallbackApplied = true;
      finalThresholdUsed = retryVectorSettings.threshold;
      vectorInput = retryVectorInput;
      textPreserveInput = retryTextPreserveInput;
      compositeTrace = retryCompositeTrace;
      vectorOverSimplifiedDetected = retryOverSimplifiedDetected;
    }
  }

  const logoTraceMask = compositeTrace.mask;
  const foregroundRetentionPct = Number(
    (
      (compositeTrace.occupancyPixels > 0
        ? compositeTrace.foregroundPixels / compositeTrace.occupancyPixels
        : 0) * 100
    ).toFixed(2),
  );
  if (thresholdRetryApplied) {
    warnings.push(
      `Logo-detail trace prep retried with a softer threshold (${finalThresholdUsed}) to avoid destructive or over-simplified vector input.`,
    );
  }
  if (vectorOverSimplifiedDetected) {
    warnings.push(
      "Logo-detail trace prep still appears over-simplified after compositing; inspect text-mask, shape-mask, and logo-trace-input debug artifacts.",
    );
  }

  await Promise.all([
    writeDerivedMask(textMaskBase, silhouetteSource.width, silhouetteSource.height, textMaskPath),
    writeDerivedMask(shapeMaskBase, silhouetteSource.width, silhouetteSource.height, shapeMaskPath),
  ]);

  let vectorPipeline = sharp(buildMaskBuffer(logoTraceMask, 0, 255), {
    raw: {
      width: preparedVector.image.width,
      height: preparedVector.image.height,
      channels: 1,
    },
  });

  if (preparedVector.profile.smoothingBlurSigma > 0) {
    vectorPipeline = vectorPipeline.blur(preparedVector.profile.smoothingBlurSigma).threshold(128);
  }

  if (preparedVector.profile.openingRadius > 0 && componentAnalysis.textLikeIds.length === 0) {
    const kernelSize = preparedVector.profile.openingRadius * 2 + 1;
    vectorPipeline = vectorPipeline.erode(kernelSize).dilate(kernelSize);
  }

  if (preparedVector.profile.closingRadius > 0 || componentAnalysis.textLikeIds.length > 0) {
    const kernelSize = (componentAnalysis.textLikeIds.length > 0 ? preparedVector.profile.closingRadius + 1 : preparedVector.profile.closingRadius) * 2 + 1;
    vectorPipeline = vectorPipeline.dilate(kernelSize).erode(kernelSize);
  }

  await vectorPipeline.png().toFile(logoTraceInputPath);

  const vectorPreviewBuffer = await buildMaskedColorComposite(
    subjectTransparentBuffer,
    preparedVector.image.width,
    preparedVector.image.height,
    logoTraceMask,
  );

  await sharp(vectorPreviewBuffer).png().toFile(vectorInputPath);

  const groupedSilhouetteMask = mergeMasks(shapeMaskBase, accentMaskBase);

  let silhouettePipeline = sharp(buildMaskBuffer(groupedSilhouetteMask), {
    raw: {
      width: silhouetteSource.width,
      height: silhouetteSource.height,
      channels: 1,
    },
  });

  if (silhouetteSettings.edgeGrow > 0) {
    silhouettePipeline = silhouettePipeline.dilate(silhouetteSettings.edgeGrow * 2 + 1);
  } else if (silhouetteSettings.edgeGrow < 0) {
    silhouettePipeline = silhouettePipeline.erode(Math.abs(silhouetteSettings.edgeGrow) * 2 + 1);
  }

  if (silhouetteSettings.blurSigma > 0) {
    silhouettePipeline = silhouettePipeline.blur(silhouetteSettings.blurSigma).threshold(128);
  }

  await silhouettePipeline.png().toFile(silhouetteMaskPath);

  let outerContourPipeline = sharp(buildMaskBuffer(outerContourSource), {
    raw: {
      width: silhouetteSource.width,
      height: silhouetteSource.height,
      channels: 1,
    },
  })
    .dilate(9)
    .blur(1.2)
    .threshold(128)
    .erode(7);

  await outerContourPipeline.png().toFile(outerContourMaskPath);

  await sharp(subjectCleanBuffer)
    .resize({
      width: PREVIEW_MAX_EDGE,
      height: PREVIEW_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(previewPath);

  const cleanArtifacts: CleanImageArtifacts = {
    subjectTransparent: toStorageRelativePath(subjectTransparentPath),
    subjectClean: toStorageRelativePath(subjectCleanPath),
    vectorInput: toStorageRelativePath(vectorInputPath),
    silhouetteMask: toStorageRelativePath(silhouetteMaskPath),
    preview: toStorageRelativePath(previewPath),
  };

  const doctorPayload: ImageDoctorResultPayload = {
    jobId: manifest.jobId,
    status: "image-doctor",
    directories: {
      raw: toStorageRelativePath(rawDir),
      clean: toStorageRelativePath(cleanDir),
      debug: toStorageRelativePath(debugDir),
    },
    views: {
      ...manifest.images.views,
    },
    clean: cleanArtifacts,
    note: "Processed the first supported raw raster into transparent, clean, vector-input, silhouette, and preview artifacts.",
  };

  const debugPayload: ImageDoctorDebugPayload = {
    stage: "image-doctor",
    ranAt: new Date().toISOString(),
    sourceFileUsed: toStorageRelativePath(sourcePath),
    sourceSize: {
      width: sourceMetadata.width ?? sourceRgba.width,
      height: sourceMetadata.height ?? sourceRgba.height,
      format: sourceMetadata.format ?? "unknown",
      hasAlpha: Boolean(sourceMetadata.hasAlpha),
      orientation: sourceMetadata.orientation,
    },
    outputFilePaths: cleanArtifacts,
    trimBounds,
    paddingApplied,
    thresholdSettings: {
      backgroundLumaThreshold: BACKGROUND_LUMA_THRESHOLD,
      hardDistanceThreshold: HARD_DISTANCE_THRESHOLD,
      softDistanceThreshold: SOFT_DISTANCE_THRESHOLD,
      softLumaThreshold: SOFT_LUMA_THRESHOLD,
      vectorThreshold: vectorSettings.threshold,
      silhouetteAlphaThreshold: silhouetteSettings.alphaThreshold,
    },
    contrastSettings: {
      grayscale: true,
      normalise: true,
      vectorSharpenSigma: logoVectorSettings.sharpenSigma,
      linearMultiplier: logoVectorSettings.contrast,
      linearOffset: logoVectorSettings.brightnessOffset,
      silhouetteBlurSigma: silhouetteSettings.blurSigma,
    },
    morphologySettings: {
      silhouetteEdgeGrow: silhouetteSettings.edgeGrow,
      vectorOpeningRadius: preparedVector.profile.openingRadius,
      vectorClosingRadius: preparedVector.profile.closingRadius,
    },
    vectorSettings: logoVectorSettings,
    silhouetteSettings,
    tracePrep: {
      scaleFactor: preparedVector.scaleFactor,
      scaledWidth: preparedVector.image.width,
      scaledHeight: preparedVector.image.height,
      medianSize: preparedVector.profile.medianSize,
      backgroundBlurSigma: preparedVector.profile.backgroundBlurSigma,
      smoothingBlurSigma: preparedVector.profile.smoothingBlurSigma,
    },
    backgroundModeDetected: backgroundMode,
    edgeSampleColor: background.dominantHex,
    edgeSampleVariance: Number(background.variance.toFixed(2)),
    backgroundRemovalMethodUsed: cleanupResult.methodUsed,
    borderArtifactSuppressed: borderSuppression.borderArtifactSuppressed,
    vectorStrategyUsed: thresholdRetryApplied
      ? `logo-detail:region-composited-trace-prep-with-threshold-retry:${vectorInput.strategyUsed}`
      : `logo-detail:region-composited-trace-prep:${vectorInput.strategyUsed}`,
    vectorSourceUsed: toStorageRelativePath(vectorSourcePath),
    foregroundRetentionPct,
    thresholdRetryApplied,
    finalThresholdUsed,
    modeSelected,
    vectorBranchSource: toStorageRelativePath(vectorSourcePath),
    silhouetteBranchSource: "grouped-shape-and-accent-occupancy-from-subject-transparent",
    logoDetailFallbackApplied,
    vectorOverSimplifiedDetected,
    silhouetteStrategyUsed: "occupancy-mask-with-text-shape-component-branching",
    connectedComponentsFound: componentAnalysis.summaries.length,
    componentsRemoved: [
      ...borderSuppression.componentsRemoved,
      ...componentAnalysis.removedTinyComponents,
    ].slice(0, 64),
    componentSummary: componentAnalysis.summaries.slice(0, 32),
    groupedRegionSummary: componentAnalysis.groups,
    removedTinyComponents: componentAnalysis.removedTinyComponents.slice(0, 64),
    textLikeComponents: componentAnalysis.textLikeIds,
    shapeLikeComponents: componentAnalysis.shapeLikeIds,
    edgeConnectedComponents: componentAnalysis.edgeConnectedIds,
    groupedTextRegions: componentAnalysis.groupedTextRegions,
    groupedShapeRegions: componentAnalysis.groupedShapeRegions,
    groupedAccentRegions: componentAnalysis.groupedAccentRegions,
    groupingStrategyUsed: "tiny-fragment-suppression-plus-proximity-color-grouping",
    classificationStrategyUsed: "grouped-region-role-classification-with-color-priors",
    derivedMasksWritten: {
      textMask: toStorageRelativePath(textMaskPath),
      shapeMask: toStorageRelativePath(shapeMaskPath),
      outerContourMask: toStorageRelativePath(outerContourMaskPath),
      logoTraceInput: toStorageRelativePath(logoTraceInputPath),
    },
    upscaleApplied: preparedVector.scaleFactor > 1,
    textPreserveStrategyUsed: textPreserveInput.strategyUsed,
    outerContourStrategyUsed: "shape-components-envelope-close",
    backgroundCleanupApplied,
    warnings,
  };

  manifest.status = "image-doctor";
  manifest.images.raw = [toStorageRelativePath(sourcePath)];
  manifest.images.clean = {
    ...cleanArtifacts,
  };
  manifest.debug.doctor = debugPayload as unknown as Record<string, unknown>;

  await writeDebugFile(jobId, "doctor", debugPayload as unknown as Record<string, unknown>);
  await saveManifest(manifest);

  return {
    manifest,
    doctor: doctorPayload,
  };
}
