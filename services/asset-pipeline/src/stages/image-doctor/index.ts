import { readdir } from "node:fs/promises";
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
const MASK_THRESHOLD = 24;
const PREVIEW_MAX_EDGE = 640;
const DEFAULT_VECTOR_SETTINGS = {
  detailPreset: "balanced",
  threshold: 176,
  contrast: 1.15,
  brightnessOffset: -12,
  sharpenSigma: 1.1,
} as const;
const DEFAULT_SILHOUETTE_SETTINGS = {
  detailPreset: "balanced",
  alphaThreshold: 24,
  edgeGrow: 0,
  blurSigma: 0,
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

interface BackgroundSample {
  r: number;
  g: number;
  b: number;
  luma: number;
  maxCornerDistance: number;
  nearWhite: boolean;
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
  };
  vectorSettings: ResolvedVectorSettings;
  silhouetteSettings: ResolvedSilhouetteSettings;
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

function computeColorDistance(
  r: number,
  g: number,
  b: number,
  background: Pick<BackgroundSample, "r" | "g" | "b">,
): number {
  return Math.sqrt(
    (r - background.r) ** 2 +
      (g - background.g) ** 2 +
      (b - background.b) ** 2,
  );
}

async function loadRgbaImage(sourcePath: string): Promise<RgbaImage> {
  const { data, info } = await sharp(sourcePath)
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
): Pick<BackgroundSample, "r" | "g" | "b"> {
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

function estimateBackground(image: RgbaImage): BackgroundSample {
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

  const total = corners.reduce(
    (acc, corner) => ({
      r: acc.r + corner.r,
      g: acc.g + corner.g,
      b: acc.b + corner.b,
    }),
    { r: 0, g: 0, b: 0 },
  );
  const background = {
    r: total.r / corners.length,
    g: total.g / corners.length,
    b: total.b / corners.length,
  };
  const maxCornerDistance = Math.max(
    ...corners.map((corner) =>
      computeColorDistance(corner.r, corner.g, corner.b, background),
    ),
  );
  const luma = computeLuma(background.r, background.g, background.b);

  return {
    ...background,
    luma,
    maxCornerDistance,
    nearWhite: luma >= BACKGROUND_LUMA_THRESHOLD && maxCornerDistance <= 18,
  };
}

function applyBackgroundCleanup(
  image: RgbaImage,
  background: BackgroundSample,
): { pixels: Uint8ClampedArray; applied: boolean } {
  if (!background.nearWhite) {
    return { pixels: new Uint8ClampedArray(image.pixels), applied: false };
  }

  const nextPixels = new Uint8ClampedArray(image.pixels);

  for (let offset = 0; offset < nextPixels.length; offset += image.channels) {
    const r = nextPixels[offset];
    const g = nextPixels[offset + 1];
    const b = nextPixels[offset + 2];
    const alpha = nextPixels[offset + 3];

    if (alpha === 0) {
      continue;
    }

    const luma = computeLuma(r, g, b);
    const distance = computeColorDistance(r, g, b, background);

    if (luma >= 245 && distance <= HARD_DISTANCE_THRESHOLD) {
      nextPixels[offset + 3] = 0;
      continue;
    }

    if (luma >= SOFT_LUMA_THRESHOLD && distance <= SOFT_DISTANCE_THRESHOLD) {
      const preserveRatio = clamp(
        Math.max(
          distance / SOFT_DISTANCE_THRESHOLD,
          (255 - luma) / (255 - SOFT_LUMA_THRESHOLD),
        ),
        0,
        1,
      );
      nextPixels[offset + 3] = preserveRatio <= 0.02
        ? 0
        : Math.round(alpha * preserveRatio);
    }
  }

  return { pixels: nextPixels, applied: true };
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

function buildSilhouettePixels(
  image: RgbaImage,
  alphaThreshold: number,
): Buffer {
  const mask = Buffer.alloc(image.width * image.height);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = getPixelOffset(x, y, image.width, image.channels);
      const alpha = image.pixels[offset + 3];
      mask[y * image.width + x] = alpha >= alphaThreshold ? 255 : 0;
    }
  }

  return mask;
}

async function buildPreparedVectorGrayscale(
  subjectTransparentBuffer: Buffer,
  vectorSettings: ResolvedVectorSettings,
): Promise<GrayscaleImage> {
  let pipeline = sharp(subjectTransparentBuffer)
    .flatten({ background: "#ffffff" })
    .grayscale()
    .normalise();

  if (vectorSettings.sharpenSigma > 0) {
    pipeline = pipeline.sharpen({ sigma: vectorSettings.sharpenSigma });
  }

  const { data, info } = await pipeline
    .linear(vectorSettings.contrast, vectorSettings.brightnessOffset)
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    pixels: new Uint8ClampedArray(data),
    width: info.width,
    height: info.height,
    channels: 1,
  };
}

function buildAlphaMask(image: RgbaImage, alphaThreshold: number): Uint8Array {
  const mask = new Uint8Array(image.width * image.height);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = getPixelOffset(x, y, image.width, image.channels);
      mask[y * image.width + x] = image.pixels[offset + 3] >= alphaThreshold ? 1 : 0;
    }
  }

  return mask;
}

function sampleGray(image: GrayscaleImage, x: number, y: number): number {
  const clampedX = clamp(x, 0, image.width - 1);
  const clampedY = clamp(y, 0, image.height - 1);
  return image.pixels[clampedY * image.width + clampedX];
}

function isMaskContour(mask: Uint8Array, width: number, height: number, x: number, y: number): boolean {
  if (mask[y * width + x] === 0) {
    return false;
  }

  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) {
        continue;
      }

      const nextX = x + offsetX;
      const nextY = y + offsetY;
      if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
        return true;
      }

      if (mask[nextY * width + nextX] === 0) {
        return true;
      }
    }
  }

  return false;
}

function buildVectorInputPixels(
  image: GrayscaleImage,
  alphaMask: Uint8Array,
  vectorSettings: ResolvedVectorSettings,
): Buffer {
  const output = Buffer.alloc(image.width * image.height, 255);
  const edgeThreshold = clampInteger(vectorSettings.threshold, DEFAULT_VECTOR_SETTINGS.threshold, 24, 255);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const index = y * image.width + x;
      if (alphaMask[index] === 0) {
        output[index] = 255;
        continue;
      }

      const contourPixel = isMaskContour(alphaMask, image.width, image.height, x, y);
      const gx =
        -sampleGray(image, x - 1, y - 1) +
        sampleGray(image, x + 1, y - 1) +
        -2 * sampleGray(image, x - 1, y) +
        2 * sampleGray(image, x + 1, y) +
        -sampleGray(image, x - 1, y + 1) +
        sampleGray(image, x + 1, y + 1);
      const gy =
        -sampleGray(image, x - 1, y - 1) +
        -2 * sampleGray(image, x, y - 1) +
        -sampleGray(image, x + 1, y - 1) +
        sampleGray(image, x - 1, y + 1) +
        2 * sampleGray(image, x, y + 1) +
        sampleGray(image, x + 1, y + 1);
      const edgeStrength = Math.min(255, Math.round(Math.sqrt(gx * gx + gy * gy) / 4));
      const localAverage = Math.round(
        (
          sampleGray(image, x - 1, y - 1) +
          sampleGray(image, x, y - 1) +
          sampleGray(image, x + 1, y - 1) +
          sampleGray(image, x - 1, y) +
          sampleGray(image, x + 1, y) +
          sampleGray(image, x - 1, y + 1) +
          sampleGray(image, x, y + 1) +
          sampleGray(image, x + 1, y + 1)
        ) / 8,
      );
      const localContrast = Math.min(255, Math.abs(image.pixels[index] - localAverage) * 2);
      const detailStrength = Math.min(
        255,
        Math.round(edgeStrength * 0.75 + localContrast * 0.65),
      );

      output[index] = contourPixel || detailStrength >= edgeThreshold ? 0 : 255;
    }
  }

  return output;
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
  const background = estimateBackground(sourceRgba);
  const cleanupResult = applyBackgroundCleanup(sourceRgba, background);
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

  if (!background.nearWhite) {
    warnings.push(
      "Background cleanup was skipped because the detected background was not a clean light backdrop.",
    );
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

  const subjectTransparentBuffer = await paddedTransparent.png().toBuffer();
  await sharp(subjectTransparentBuffer).png().toFile(subjectTransparentPath);

  const subjectCleanBuffer = await sharp(subjectTransparentBuffer)
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer();
  await sharp(subjectCleanBuffer).png().toFile(subjectCleanPath);

  const silhouetteSource = await loadRgbaImage(subjectTransparentPath);
  const vectorSource = await buildPreparedVectorGrayscale(subjectTransparentBuffer, vectorSettings);
  const vectorAlphaMask = buildAlphaMask(silhouetteSource, silhouetteSettings.alphaThreshold);
  await sharp(buildVectorInputPixels(vectorSource, vectorAlphaMask, vectorSettings), {
    raw: {
      width: vectorSource.width,
      height: vectorSource.height,
      channels: 1,
    },
  })
    .png()
    .toFile(vectorInputPath);

  let silhouettePipeline = sharp(buildSilhouettePixels(silhouetteSource, silhouetteSettings.alphaThreshold), {
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
      vectorSharpenSigma: vectorSettings.sharpenSigma,
      linearMultiplier: vectorSettings.contrast,
      linearOffset: vectorSettings.brightnessOffset,
      silhouetteBlurSigma: silhouetteSettings.blurSigma,
    },
    morphologySettings: {
      silhouetteEdgeGrow: silhouetteSettings.edgeGrow,
    },
    vectorSettings,
    silhouetteSettings,
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
