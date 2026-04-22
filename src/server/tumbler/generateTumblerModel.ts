import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { getTumblerProfileById, type TumblerProfile } from "@/data/tumblerProfiles";
import type {
  TumblerItemLookupFitDebug,
  TumblerItemLookupFitProfilePoint,
} from "@/types/tumblerItemLookup";

const GENERATED_PUBLIC_PREFIX = "/models/generated";
const GENERATED_DIR = path.join(process.cwd(), "public", "models", "generated");
const BODY_SAMPLE_COUNT = 30;

type FileReaderLike = {
  result: string | ArrayBuffer | null;
  onloadend: null | (() => void);
  onerror: null | ((error: unknown) => void);
  readAsArrayBuffer(blob: Blob): Promise<void>;
  readAsDataURL(blob: Blob): Promise<void>;
};

type Rgb = [number, number, number];

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type RowBounds = {
  left: number;
  right: number;
  width: number;
};

type CenterRun = {
  y: number;
  left: number;
  right: number;
  width: number;
  sampleColor: Rgb;
  whole: RowBounds;
};

type StanleySilhouetteFit = {
  bodyProfile: Array<{ yMm: number; radiusMm: number }>;
  bodyTopYmm: number;
  bodyBottomYmm: number;
  rimTopYmm: number;
  rimBottomYmm: number;
  rimHeightMm: number;
  rimRadiusMm: number;
  bodyColorHex: string;
  rimColorHex: string;
  fitDebug?: TumblerItemLookupFitDebug | null;
};

type StanleyCandidateFit = StanleySilhouetteFit & {
  fitScore: number;
};

export type GeneratedTumblerGlbResult = {
  glbPath: string;
  fitDebug: TumblerItemLookupFitDebug | null;
};

class NodeFileReader implements FileReaderLike {
  result: string | ArrayBuffer | null = null;
  onloadend: null | (() => void) = null;
  onerror: null | ((error: unknown) => void) = null;

  async readAsArrayBuffer(blob: Blob) {
    try {
      this.result = await blob.arrayBuffer();
      this.onloadend?.();
    } catch (error) {
      this.onerror?.(error);
    }
  }

  async readAsDataURL(blob: Blob) {
    try {
      const buffer = Buffer.from(await blob.arrayBuffer());
      const type = blob.type || "application/octet-stream";
      this.result = `data:${type};base64,${buffer.toString("base64")}`;
      this.onloadend?.();
    } catch (error) {
      this.onerror?.(error);
    }
  }
}

function ensureFileReaderPolyfill() {
  if (typeof globalThis.FileReader === "undefined") {
    globalThis.FileReader = NodeFileReader as unknown as typeof FileReader;
  }
}

async function exportSceneToGlb(scene: THREE.Scene): Promise<ArrayBuffer> {
  ensureFileReaderPolyfill();
  const exporter = new GLTFExporter();
  return await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(result);
          return;
        }
        reject(new Error("GLTFExporter did not return a binary GLB buffer."));
      },
      (error) => reject(error),
      { binary: true, onlyVisible: true },
    );
  });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeScore(value: number): number {
  return clamp(value, 0, 1);
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = clamp(Math.round((sorted.length - 1) * p), 0, sorted.length - 1);
  return sorted[idx];
}

function colorDistance(a: Rgb, b: Rgb): number {
  return Math.sqrt(
    (a[0] - b[0]) ** 2 +
    (a[1] - b[1]) ** 2 +
    (a[2] - b[2]) ** 2,
  );
}

function averageRgb(values: Rgb[]): Rgb {
  if (values.length === 0) return [0, 0, 0];
  return [
    avg(values.map((value) => value[0])),
    avg(values.map((value) => value[1])),
    avg(values.map((value) => value[2])),
  ];
}

function medianRgb(values: Rgb[], fallback: Rgb): Rgb {
  if (values.length === 0) return fallback;
  return [
    median(values.map((value) => value[0])),
    median(values.map((value) => value[1])),
    median(values.map((value) => value[2])),
  ];
}

function rgbToHex(rgb: Rgb): string {
  return `#${rgb.map((value) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0")).join("")}`;
}

function makeStandardMaterial(
  color: string,
  options?: Partial<THREE.MeshStandardMaterialParameters>,
) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.25,
    roughness: 0.65,
    ...options,
  });
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; lt316-admin/1.0)" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Image fetch failed (${response.status})`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function sampleBackgroundColor(data: Uint8Array, width: number, height: number): Rgb {
  const samples: Rgb[] = [];
  const stepX = Math.max(1, Math.floor(width / 24));
  const stepY = Math.max(1, Math.floor(height / 24));

  const addSample = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    samples.push([data[idx], data[idx + 1], data[idx + 2]]);
  };

  for (let x = 0; x < width; x += stepX) {
    addSample(x, 0);
    addSample(x, height - 1);
  }
  for (let y = 0; y < height; y += stepY) {
    addSample(0, y);
    addSample(width - 1, y);
  }

  return medianRgb(samples, [255, 255, 255]);
}

function buildForegroundMask(data: Uint8Array, width: number, height: number): Uint8Array {
  const bg = sampleBackgroundColor(data, width, height);
  const bgLuma = bg[0] * 0.2126 + bg[1] * 0.7152 + bg[2] * 0.0722;
  const mask = new Uint8Array(width * height);

  for (let i = 0; i < width * height; i += 1) {
    const idx = i * 4;
    const alpha = data[idx + 3];
    if (alpha < 18) continue;

    const rgb: Rgb = [data[idx], data[idx + 1], data[idx + 2]];
    const diff = colorDistance(rgb, bg);
    const luma = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    const lumaDiff = Math.abs(luma - bgLuma);
    const channelDelta = Math.max(
      Math.abs(rgb[0] - bg[0]),
      Math.abs(rgb[1] - bg[1]),
      Math.abs(rgb[2] - bg[2]),
    );

    if (diff > 20 || channelDelta > 12 || lumaDiff > 10) {
      mask[i] = 1;
    }
  }

  return mask;
}

function findMaskBounds(mask: Uint8Array, width: number, height: number): Bounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return { minX, minY, maxX, maxY };
}

function findRowBounds(mask: Uint8Array, width: number, y: number): RowBounds | null {
  let left = -1;
  let right = -1;
  for (let x = 0; x < width; x += 1) {
    if (!mask[y * width + x]) continue;
    if (left === -1) left = x;
    right = x;
  }
  if (left === -1 || right === -1) return null;
  return { left, right, width: right - left + 1 };
}

function estimateBodyCenterX(mask: Uint8Array, width: number, bounds: Bounds): number {
  const mids: number[] = [];
  const startY = Math.round(bounds.minY + (bounds.maxY - bounds.minY) * 0.38);
  const endY = Math.round(bounds.minY + (bounds.maxY - bounds.minY) * 0.9);
  const minWidth = (bounds.maxX - bounds.minX + 1) * 0.18;

  for (let y = startY; y <= endY; y += 1) {
    const row = findRowBounds(mask, width, y);
    if (!row || row.width < minWidth) continue;
    mids.push((row.left + row.right) / 2);
  }

  if (mids.length === 0) {
    return (bounds.minX + bounds.maxX) / 2;
  }
  return median(mids);
}

function sampleRunColor(
  data: Uint8Array,
  width: number,
  y: number,
  left: number,
  right: number,
): Rgb {
  const runWidth = right - left + 1;
  const sampleLeft = left + Math.floor(runWidth * 0.14);
  const sampleRight = left + Math.floor(runWidth * 0.34);
  const values: Rgb[] = [];

  for (let x = sampleLeft; x <= sampleRight; x += 1) {
    const idx = (y * width + x) * 4;
    if (data[idx + 3] < 18) continue;
    values.push([data[idx], data[idx + 1], data[idx + 2]]);
  }

  return averageRgb(values);
}

function findCenterRun(
  mask: Uint8Array,
  data: Uint8Array,
  width: number,
  y: number,
  centerX: number,
): CenterRun | null {
  const searchRadius = 24;
  let seedX = -1;
  const center = Math.round(centerX);

  for (let offset = 0; offset <= searchRadius; offset += 1) {
    const left = center - offset;
    const right = center + offset;
    if (left >= 0 && mask[y * width + left]) {
      seedX = left;
      break;
    }
    if (right < width && mask[y * width + right]) {
      seedX = right;
      break;
    }
  }

  if (seedX === -1) return null;

  let left = seedX;
  let right = seedX;
  while (left > 0 && mask[y * width + (left - 1)]) left -= 1;
  while (right + 1 < width && mask[y * width + (right + 1)]) right += 1;

  const whole = findRowBounds(mask, width, y);
  if (!whole) return null;

  return {
    y,
    left,
    right,
    width: right - left + 1,
    sampleColor: sampleRunColor(data, width, y, left, right),
    whole,
  };
}

function smoothSeries(values: number[], radius: number): number[] {
  return values.map((_, index) => {
    const start = Math.max(0, index - radius);
    const end = Math.min(values.length - 1, index + radius);
    const slice = values.slice(start, end + 1);
    return avg(slice);
  });
}

function findLongestRowSegment(rows: number[]): { start: number; end: number } | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => a - b);
  let bestStart = sorted[0];
  let bestEnd = sorted[0];
  let currentStart = sorted[0];
  let currentEnd = sorted[0];

  for (let index = 1; index < sorted.length; index += 1) {
    const y = sorted[index];
    if (y - currentEnd <= 2) {
      currentEnd = y;
      continue;
    }

    if (currentEnd - currentStart > bestEnd - bestStart) {
      bestStart = currentStart;
      bestEnd = currentEnd;
    }
    currentStart = y;
    currentEnd = y;
  }

  if (currentEnd - currentStart > bestEnd - bestStart) {
    bestStart = currentStart;
    bestEnd = currentEnd;
  }

  return { start: bestStart, end: bestEnd };
}

function buildLatheProfileFromRows(args: {
  profile: TumblerProfile;
  runs: CenterRun[];
  fullTop: number;
  fullHeightPx: number;
  bodyTop: number;
  bodyBottom: number;
  centerX: number;
  referenceHalfWidthPx: number;
}): {
  bodyProfile: Array<{ yMm: number; radiusMm: number }>;
  bodyTopYmm: number;
  bodyBottomYmm: number;
  mmPerPxY: number;
  pxToMmX: number;
  debugProfilePoints: TumblerItemLookupFitProfilePoint[];
} {
  const { profile, runs, fullTop, fullHeightPx, bodyTop, bodyBottom, centerX, referenceHalfWidthPx } = args;
  const mmPerPxY = profile.overallHeightMm / Math.max(1, fullHeightPx);
  const bodyRuns = runs.filter((run) => run.y >= bodyTop && run.y <= bodyBottom);
  const widths = smoothSeries(
    bodyRuns.map((run) => Math.max(1, run.whole.right - centerX)),
    2,
  );
  const topRadiusMm = (profile.topDiameterMm ?? profile.outsideDiameterMm ?? 88.9) / 2;
  const pxToMmX = topRadiusMm / Math.max(1, referenceHalfWidthPx);
  const overallTopYmm = profile.overallHeightMm / 2;

  const bodyProfile: Array<{ yMm: number; radiusMm: number }> = [];
  const debugProfilePoints: TumblerItemLookupFitProfilePoint[] = [];
  for (let index = 0; index < BODY_SAMPLE_COUNT; index += 1) {
    const sourceIndex = Math.round(((widths.length - 1) * index) / Math.max(1, BODY_SAMPLE_COUNT - 1));
    const run = bodyRuns[sourceIndex];
    const radiusPx = widths[sourceIndex];
    const radiusMm = radiusPx * pxToMmX;
    const yMm = overallTopYmm - (run.y - fullTop) * mmPerPxY;
    bodyProfile.push({
      yMm: round2(yMm),
      radiusMm: round2(radiusMm),
    });
    debugProfilePoints.push({
      yPx: run.y,
      yMm: round2(yMm),
      radiusPx: round2(radiusPx),
      radiusMm: round2(radiusMm),
    });
  }

  const bodyTopYmm = overallTopYmm - (bodyTop - fullTop) * mmPerPxY;
  const bodyBottomYmm = overallTopYmm - (bodyBottom - fullTop) * mmPerPxY;

  return {
    bodyProfile,
    bodyTopYmm: round2(bodyTopYmm),
    bodyBottomYmm: round2(bodyBottomYmm),
    mmPerPxY,
    pxToMmX,
    debugProfilePoints,
  };
}

async function fitStanleyIceFlow30FromImage(
  profile: TumblerProfile,
  imageUrl: string,
): Promise<StanleyCandidateFit | null> {
  const sharp = (await import("sharp")).default;
  const sourceBuffer = await fetchBuffer(imageUrl);
  const { data, info } = await sharp(sourceBuffer)
    .rotate()
    .resize({ height: 1400, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const mask = buildForegroundMask(data, width, height);
  const bounds = findMaskBounds(mask, width, height);
  if (!bounds) return null;

  const centerX = estimateBodyCenterX(mask, width, bounds);
  const runs: CenterRun[] = [];
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    const run = findCenterRun(mask, data, width, y, centerX);
    if (run) runs.push(run);
  }
  if (runs.length < 40) return null;

  const maxCenterWidth = percentile(runs.map((run) => run.width), 0.95);
  const stableRows = runs.filter((run) => run.width >= maxCenterWidth * 0.72);
  if (stableRows.length < 20) return null;

  const fullTop = stableRows[0].y;
  const fullBottom = stableRows[stableRows.length - 1].y;
  const fullHeightPx = fullBottom - fullTop + 1;
  if (fullHeightPx < 300) return null;

  const lowerColorRows = runs.filter((run) =>
    run.y >= fullTop + fullHeightPx * 0.58 &&
    run.y <= fullTop + fullHeightPx * 0.88 &&
    run.width >= maxCenterWidth * 0.35,
  );
  const bodyColor = medianRgb(
    lowerColorRows.map((run) => run.sampleColor),
    [213, 215, 117],
  );

  const bodyRowYs = runs
    .filter((run) =>
      run.y >= fullTop &&
      run.y <= fullBottom &&
      run.width >= maxCenterWidth * 0.28 &&
      colorDistance(run.sampleColor, bodyColor) <= 58,
    )
    .map((run) => run.y);

  const bodySegment = findLongestRowSegment(bodyRowYs);
  if (!bodySegment) return null;

  const bodyLuma = bodyColor[0] * 0.2126 + bodyColor[1] * 0.7152 + bodyColor[2] * 0.0722;
  const silverRowYs = runs
    .filter((run) => {
      if (run.y > fullTop + fullHeightPx * 0.28) return false;
      if (run.whole.width < maxCenterWidth * 0.7) return false;
      const luma = run.sampleColor[0] * 0.2126 + run.sampleColor[1] * 0.7152 + run.sampleColor[2] * 0.0722;
      return luma > bodyLuma + 12 && colorDistance(run.sampleColor, bodyColor) > 24;
    })
    .map((run) => run.y);
  const silverSegment = findLongestRowSegment(silverRowYs);

  const bodyTop = silverSegment ? silverSegment.end + 1 : bodySegment.start;
  const bodyBottom = bodySegment.end;
  if (bodyBottom - bodyTop < fullHeightPx * 0.5) return null;

  const bodyRuns = runs.filter((run) => run.y >= bodyTop && run.y <= bodyBottom);

  const rimTop = silverSegment ? silverSegment.start : fullTop;
  const rimBottom = silverSegment ? silverSegment.end : Math.max(fullTop, bodyTop - 1);
  const rimRows = runs.filter((run) => run.y >= rimTop && run.y <= rimBottom);
  const rimHalfWidthPx = avg(rimRows.map((run) => Math.max(1, run.whole.right - centerX)));

  const profileFit = buildLatheProfileFromRows({
    profile,
    runs,
    fullTop,
    fullHeightPx,
    bodyTop,
    bodyBottom,
    centerX,
    referenceHalfWidthPx: rimHalfWidthPx > 0 ? rimHalfWidthPx : maxCenterWidth / 2,
  });

  const rimHeightMm = round2(Math.max(4, (rimBottom - rimTop + 1) * profileFit.mmPerPxY));
  const rimRadiusMm = round2(avg(rimRows.map((run) => (run.whole.width / 2) * profileFit.pxToMmX)) || profileFit.bodyProfile[0].radiusMm * 1.02);
  const rimColor = medianRgb(rimRows.map((run) => run.sampleColor), [185, 185, 185]);
  const overallTopYmm = profile.overallHeightMm / 2;
  const rimTopYmm = round2(overallTopYmm - (rimTop - fullTop) * profileFit.mmPerPxY);
  const rimBottomYmm = round2(overallTopYmm - (rimBottom - fullTop) * profileFit.mmPerPxY);
  const referenceBandCenterYPx = Math.round(bodyTop + ((bodyBottom - bodyTop) * 0.22));
  const referenceBandHeightPx = Math.max(12, Math.round((bodyBottom - bodyTop + 1) * 0.12));
  const referenceBandTopPx = Math.max(bodyTop, referenceBandCenterYPx - Math.floor(referenceBandHeightPx / 2));
  const referenceBandBottomPx = Math.min(bodyBottom, referenceBandTopPx + referenceBandHeightPx - 1);
  const centerOffsetScore = normalizeScore(1 - Math.abs(centerX - width / 2) / Math.max(1, width * 0.18));
  const portraitRatio = width / Math.max(1, height);
  const portraitScore = normalizeScore(1 - Math.abs(portraitRatio - 0.44) / 0.32);
  const bodyCoverage = (bodyBottom - bodyTop + 1) / Math.max(1, fullHeightPx);
  const bodyCoverageScore = normalizeScore(1 - Math.abs(bodyCoverage - 0.74) / 0.2);
  const symmetryScore = normalizeScore(avg(bodyRuns.map((run) => {
    const leftSpan = centerX - run.whole.left;
    const rightSpan = run.whole.right - centerX;
    const maxSpan = Math.max(1, Math.max(leftSpan, rightSpan));
    return 1 - Math.abs(leftSpan - rightSpan) / maxSpan;
  })));
  const topBodyRadius = bodyRuns[0] ? Math.max(1, bodyRuns[0].whole.right - centerX) : rimHalfWidthPx;
  const bottomBodyRadius = bodyRuns[bodyRuns.length - 1] ? Math.max(1, bodyRuns[bodyRuns.length - 1].whole.right - centerX) : topBodyRadius;
  const taperRatio = bottomBodyRadius / Math.max(1, topBodyRadius);
  const taperScore = normalizeScore(1 - Math.abs(taperRatio - 0.82) / 0.18);
  const silverScore = silverSegment ? 1 : 0.2;
  const fitScore = round2(
    silverScore * 3 +
    centerOffsetScore * 2.4 +
    symmetryScore * 2 +
    bodyCoverageScore * 1.6 +
    taperScore * 1.2 +
    portraitScore * 0.8,
  );

  const fitDebug: TumblerItemLookupFitDebug = {
    kind: "lathe-body-fit",
    sourceImageUrl: imageUrl,
    imageWidthPx: width,
    imageHeightPx: height,
    silhouetteBoundsPx: bounds,
    centerXPx: round2(centerX),
    fullTopPx: fullTop,
    fullBottomPx: fullBottom,
    bodyTopPx: bodyTop,
    bodyBottomPx: bodyBottom,
    rimTopPx: rimTop,
    rimBottomPx: rimBottom,
    referenceBandTopPx,
    referenceBandBottomPx,
    referenceBandCenterYPx,
    referenceBandWidthPx: round2(maxCenterWidth),
    maxCenterWidthPx: round2(maxCenterWidth),
    referenceHalfWidthPx: round2(rimHalfWidthPx > 0 ? rimHalfWidthPx : maxCenterWidth / 2),
    fitScore,
    profilePoints: profileFit.debugProfilePoints,
  };

  return {
    bodyProfile: profileFit.bodyProfile,
    bodyTopYmm: profileFit.bodyTopYmm,
    bodyBottomYmm: profileFit.bodyBottomYmm,
    rimTopYmm,
    rimBottomYmm,
    rimHeightMm,
    rimRadiusMm,
    bodyColorHex: rgbToHex(bodyColor),
    rimColorHex: rgbToHex(rimColor),
    fitScore,
    fitDebug,
  };
}

async function fitBestStanleyIceFlow30FromImages(
  profile: TumblerProfile,
  imageUrls: string[],
): Promise<StanleySilhouetteFit | null> {
  const seen = new Set<string>();
  const candidates = imageUrls.filter((url) => {
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  }).slice(0, 12);

  let bestFit: StanleyCandidateFit | null = null;
  for (const imageUrl of candidates) {
    try {
      const fit = await fitStanleyIceFlow30FromImage(profile, imageUrl);
      if (!fit) continue;
      if (!bestFit || fit.fitScore > bestFit.fitScore) {
        bestFit = fit;
      }
    } catch (error) {
      console.warn("[generateTumblerModel] candidate fit failed:", imageUrl, error);
    }
  }

  if (!bestFit) return null;
  console.info(
    "[generateTumblerModel] selected Stanley image:",
    bestFit.fitDebug?.sourceImageUrl ?? "unknown",
    "score",
    bestFit.fitScore,
  );
  return bestFit;
}

function buildFallbackBodyProfile(profile: TumblerProfile) {
  const overallHeight = profile.overallHeightMm;
  const topDiameter = profile.topDiameterMm ?? profile.outsideDiameterMm ?? 88.9;
  const bottomDiameter = profile.bottomDiameterMm ?? profile.outsideDiameterMm ?? topDiameter;
  const bodyTopYmm = overallHeight / 2 - 30;
  const bodyBottomYmm = -overallHeight / 2;
  const halfHeight = bodyTopYmm - bodyBottomYmm;
  const topRadius = topDiameter / 2;
  const bottomRadius = bottomDiameter / 2;

  return {
    bodyTopYmm: round2(bodyTopYmm),
    bodyBottomYmm: round2(bodyBottomYmm),
    rimTopYmm: round2(overallHeight / 2),
    rimBottomYmm: round2(bodyTopYmm),
    bodyProfile: [
      { yMm: bodyBottomYmm, radiusMm: bottomRadius * 0.92 },
      { yMm: bodyBottomYmm + 12, radiusMm: bottomRadius },
      { yMm: bodyBottomYmm + halfHeight * 0.32, radiusMm: bottomRadius + (topRadius - bottomRadius) * 0.45 },
      { yMm: bodyBottomYmm + halfHeight * 0.68, radiusMm: topRadius * 0.985 },
      { yMm: bodyTopYmm, radiusMm: topRadius },
    ],
    rimHeightMm: 12,
    rimRadiusMm: topRadius * 1.02,
    bodyColorHex: "#d5d775",
    rimColorHex: "#c2c5c7",
    fitDebug: null,
  } satisfies StanleySilhouetteFit;
}

function createBodyMesh(fit: StanleySilhouetteFit): THREE.Mesh {
  const orderedProfile = [...fit.bodyProfile]
    .map((point) => ({
      yMm: round2(point.yMm),
      radiusMm: round2(Math.max(1, point.radiusMm)),
    }))
    .sort((a, b) => a.yMm - b.yMm);

  const bottomRadiusMm = orderedProfile[0]?.radiusMm ?? 1;
  const topRadiusMm = orderedProfile[orderedProfile.length - 1]?.radiusMm ?? bottomRadiusMm;
  const contour: Array<{ radiusMm: number; yMm: number }> = [
    { radiusMm: bottomRadiusMm, yMm: round2(fit.bodyBottomYmm) },
    ...orderedProfile,
    { radiusMm: topRadiusMm, yMm: round2(fit.bodyTopYmm) },
  ].filter((point, index, array) => {
    if (index === 0) return true;
    const prev = array[index - 1];
    return !(prev.radiusMm === point.radiusMm && prev.yMm === point.yMm);
  });

  const points = [
    new THREE.Vector2(0, fit.bodyBottomYmm),
    ...contour.map((point) => new THREE.Vector2(point.radiusMm, point.yMm)),
    new THREE.Vector2(0, fit.bodyTopYmm),
  ];

  const geometry = new THREE.LatheGeometry(points, 112);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geometry,
    makeStandardMaterial(fit.bodyColorHex, { metalness: 0.18, roughness: 0.72 }),
  );
  mesh.name = "body_mesh";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createRimMesh(fit: StanleySilhouetteFit): THREE.Mesh {
  const orderedProfile = [...fit.bodyProfile]
    .map((point) => ({
      yMm: round2(point.yMm),
      radiusMm: round2(Math.max(1, point.radiusMm)),
    }))
    .sort((a, b) => a.yMm - b.yMm);
  const topBodyRadiusMm = orderedProfile[orderedProfile.length - 1]?.radiusMm ?? fit.rimRadiusMm;
  const outerRadiusMm = round2(
    Math.min(Math.max(topBodyRadiusMm * 1.002, fit.rimRadiusMm), topBodyRadiusMm * 1.02),
  );
  const wallThicknessMm = round2(Math.max(1.2, outerRadiusMm * 0.04));
  const innerRadiusMm = round2(Math.max(1, outerRadiusMm - wallThicknessMm));
  const rimProfile = [
    new THREE.Vector2(innerRadiusMm, fit.rimBottomYmm),
    new THREE.Vector2(outerRadiusMm, fit.rimBottomYmm),
    new THREE.Vector2(outerRadiusMm, fit.rimTopYmm),
    new THREE.Vector2(innerRadiusMm, fit.rimTopYmm),
  ];
  const geometry = new THREE.LatheGeometry(rimProfile, 96);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geometry,
    makeStandardMaterial(fit.rimColorHex, { metalness: 0.82, roughness: 0.22 }),
  );
  mesh.name = "rim_mesh";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildStanleyIceFlow30Scene(profile: TumblerProfile, fit: StanleySilhouetteFit): THREE.Scene {
  const scene = new THREE.Scene();
  scene.name = "stanley_iceflow_30_generated";

  const body = createBodyMesh(fit);
  const rim = createRimMesh(fit);

  scene.add(body);
  scene.add(rim);

  return scene;
}

async function writeGeneratedGlb(
  fileName: string,
  scene: THREE.Scene,
): Promise<string> {
  const absolutePath = path.join(GENERATED_DIR, fileName);
  await mkdir(GENERATED_DIR, { recursive: true });
  const arrayBuffer = await exportSceneToGlb(scene);
  await writeFile(absolutePath, Buffer.from(arrayBuffer));
  return `${GENERATED_PUBLIC_PREFIX}/${fileName}`;
}

export async function ensureGeneratedTumblerGlb(
  profileId: string,
  options?: { imageUrl?: string | null; imageUrls?: string[] },
) : Promise<GeneratedTumblerGlbResult> {
  if (profileId !== "stanley-iceflow-30") {
    return { glbPath: "", fitDebug: null };
  }

  const profile = getTumblerProfileById(profileId);
  if (!profile) return { glbPath: "", fitDebug: null };

  let fit: StanleySilhouetteFit = buildFallbackBodyProfile(profile);

  const candidateImageUrls = [
    ...(options?.imageUrls ?? []),
    ...(options?.imageUrl ? [options.imageUrl] : []),
  ].filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index);

  if (candidateImageUrls.length > 0) {
    try {
      const silhouetteFit = await fitBestStanleyIceFlow30FromImages(profile, candidateImageUrls);
      if (silhouetteFit) {
        fit = silhouetteFit;
      }
    } catch (error) {
      console.warn("[generateTumblerModel] silhouette fit failed:", error);
    }
  }

  const fileName = `${profileId}-bodyfit-v5.glb`;
  return {
    glbPath: await writeGeneratedGlb(fileName, buildStanleyIceFlow30Scene(profile, fit)),
    fitDebug: fit.fitDebug ?? null,
  };
}
