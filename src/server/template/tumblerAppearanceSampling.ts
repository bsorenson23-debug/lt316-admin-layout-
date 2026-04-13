import type {
  ProductReferenceImage,
  ProductReferenceSet,
  ProductReferenceViewClass,
} from "@/types/productTemplate";
import type {
  TumblerItemLookupFitDebug,
  TumblerItemLookupResponse,
} from "@/types/tumblerItemLookup";

type Rgb = [number, number, number];

type LidSampleWindow = {
  top: number;
  bottom: number;
  leftStart: number;
  leftEnd: number;
  rightStart: number;
  rightEnd: number;
};

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

type AppearanceBands = {
  bodyColorHex: string | null;
  rimColorHex: string | null;
  lidColorHex: string | null;
};

export type FrontAppearanceReference = {
  url: string;
  viewClass: ProductReferenceViewClass | null;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = clamp(Math.round((sorted.length - 1) * p), 0, sorted.length - 1);
  return sorted[idx];
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

function isAllowedFrontViewClass(viewClass: ProductReferenceViewClass | null | undefined): boolean {
  return viewClass == null || viewClass === "front" || viewClass === "front-3q";
}

function resolveCanonicalFrontImage(referenceSet: ProductReferenceSet | null | undefined): ProductReferenceImage | null {
  if (!referenceSet) return null;
  const canonicalFrontImageId =
    referenceSet.canonicalViewSelection?.canonicalFrontImageId ??
    referenceSet.canonicalFrontImageId;
  if (!canonicalFrontImageId) return null;
  return referenceSet.images.find((image) => image.id === canonicalFrontImageId) ?? null;
}

export function resolvePreferredFrontAppearanceReference(
  result: TumblerItemLookupResponse | null,
): FrontAppearanceReference | null {
  if (!result) return null;
  const images = result.productReferenceSet?.images ?? [];
  const strictFront = images
    .filter((image) => image.viewClass === "front")
    .sort((a, b) => b.confidence - a.confidence)[0];
  if (strictFront) {
    return { url: strictFront.url, viewClass: strictFront.viewClass };
  }

  const canonicalFront = resolveCanonicalFrontImage(result.productReferenceSet);
  if (canonicalFront && canonicalFront.viewClass === "front-3q") {
    return { url: canonicalFront.url, viewClass: canonicalFront.viewClass };
  }

  const front3q = images
    .filter((image) => image.viewClass === "front-3q")
    .sort((a, b) => b.confidence - a.confidence)[0];
  if (front3q) {
    return { url: front3q.url, viewClass: front3q.viewClass };
  }

  if (result.imageUrl) {
    return { url: result.imageUrl, viewClass: null };
  }
  return null;
}

export function resolveLidSampleWindow(args: {
  fitDebug: TumblerItemLookupFitDebug | null | undefined;
  width: number;
  height: number;
}): LidSampleWindow | null {
  const fitDebug = args.fitDebug;
  if (!fitDebug || args.width <= 0 || args.height <= 0) return null;

  const sourceWidth = Math.max(1, fitDebug.imageWidthPx);
  const sourceHeight = Math.max(1, fitDebug.imageHeightPx);
  const centerX = Math.round((fitDebug.centerXPx / sourceWidth) * args.width);
  const fullTop = Math.round((fitDebug.fullTopPx / sourceHeight) * args.height);
  const rimTop = Math.round((fitDebug.rimTopPx / sourceHeight) * args.height);
  const referenceHalfWidth = Math.max(
    8,
    Math.round(((fitDebug.referenceHalfWidthPx || (fitDebug.referenceBandWidthPx / 2) || 0) / sourceWidth) * args.width),
  );
  const lidBandHeight = rimTop - fullTop;
  if (!Number.isFinite(lidBandHeight) || lidBandHeight < 6) return null;

  const top = clamp(Math.round(fullTop + lidBandHeight * 0.16), 0, args.height - 1);
  const bottom = clamp(Math.round(rimTop - Math.max(2, lidBandHeight * 0.18)), top + 1, args.height - 1);
  if (bottom - top < 4) return null;

  const innerGap = Math.max(3, Math.round(referenceHalfWidth * 0.14));
  const outerReach = Math.max(innerGap + 4, Math.round(referenceHalfWidth * 0.38));

  const leftStart = clamp(centerX - outerReach, 0, args.width - 1);
  const leftEnd = clamp(centerX - innerGap, leftStart + 1, args.width - 1);
  const rightStart = clamp(centerX + innerGap, 0, args.width - 1);
  const rightEnd = clamp(centerX + outerReach, rightStart + 1, args.width - 1);

  if (leftEnd - leftStart < 2 || rightEnd - rightStart < 2) return null;

  return {
    top,
    bottom,
    leftStart,
    leftEnd,
    rightStart,
    rightEnd,
  };
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

function resolveGenericLidSampleWindow(args: {
  fullTop: number;
  rimTop: number;
  centerX: number;
  referenceHalfWidthPx: number;
  width: number;
  height: number;
}): LidSampleWindow | null {
  const lidBandHeight = args.rimTop - args.fullTop;
  if (!Number.isFinite(lidBandHeight) || lidBandHeight < 6) return null;

  const top = clamp(Math.round(args.fullTop + lidBandHeight * 0.16), 0, args.height - 1);
  const bottom = clamp(Math.round(args.rimTop - Math.max(2, lidBandHeight * 0.18)), top + 1, args.height - 1);
  if (bottom - top < 4) return null;

  const innerGap = Math.max(3, Math.round(args.referenceHalfWidthPx * 0.14));
  const outerReach = Math.max(innerGap + 4, Math.round(args.referenceHalfWidthPx * 0.38));
  const leftStart = clamp(Math.round(args.centerX - outerReach), 0, args.width - 1);
  const leftEnd = clamp(Math.round(args.centerX - innerGap), leftStart + 1, args.width - 1);
  const rightStart = clamp(Math.round(args.centerX + innerGap), 0, args.width - 1);
  const rightEnd = clamp(Math.round(args.centerX + outerReach), rightStart + 1, args.width - 1);
  if (leftEnd - leftStart < 2 || rightEnd - rightStart < 2) return null;

  return {
    top,
    bottom,
    leftStart,
    leftEnd,
    rightStart,
    rightEnd,
  };
}

function collectLidSamples(
  data: Uint8Array,
  mask: Uint8Array | null,
  width: number,
  window: LidSampleWindow,
): Rgb[] {
  const samples: Rgb[] = [];
  const appendRange = (startX: number, endX: number, y: number) => {
    for (let x = startX; x <= endX; x += 1) {
      if (mask && !mask[y * width + x]) continue;
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3];
      if (alpha < 40) continue;
      samples.push([data[idx], data[idx + 1], data[idx + 2]]);
    }
  };

  for (let y = window.top; y <= window.bottom; y += 1) {
    appendRange(window.leftStart, window.leftEnd, y);
    appendRange(window.rightStart, window.rightEnd, y);
  }

  return samples;
}

export async function sampleDrinkwareAppearanceColors(args: {
  imageUrl?: string | null;
  imageBytes?: Uint8Array | null;
  fitDebug?: TumblerItemLookupFitDebug | null;
  sourceViewClass?: ProductReferenceViewClass | null;
}): Promise<AppearanceBands | null> {
  if (!isAllowedFrontViewClass(args.sourceViewClass)) return null;

  const sourceBuffer =
    args.imageBytes && args.imageBytes.length > 0
      ? Buffer.from(args.imageBytes)
      : (args.imageUrl ? await fetchBuffer(args.imageUrl) : null);
  if (!sourceBuffer) return null;

  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(sourceBuffer)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const mask = buildForegroundMask(data, info.width, info.height);
  const bounds = findMaskBounds(mask, info.width, info.height);
  if (!bounds) return null;

  const centerX = estimateBodyCenterX(mask, info.width, bounds);
  const runs: CenterRun[] = [];
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    const run = findCenterRun(mask, data, info.width, y, centerX);
    if (run) runs.push(run);
  }
  if (runs.length < 40) return null;

  const maxCenterWidth = percentile(runs.map((run) => run.width), 0.95);
  const stableRows = runs.filter((run) => run.width >= maxCenterWidth * 0.72);
  if (stableRows.length < 20) return null;

  const fullTop = stableRows[0].y;
  const fullBottom = stableRows[stableRows.length - 1].y;
  const fullHeightPx = fullBottom - fullTop + 1;
  if (fullHeightPx < 120) return null;

  const lowerColorRows = runs.filter((run) =>
    run.y >= fullTop + fullHeightPx * 0.58 &&
    run.y <= fullTop + fullHeightPx * 0.88 &&
    run.width >= maxCenterWidth * 0.35
  );
  const bodyColor = medianRgb(
    lowerColorRows.map((run) => run.sampleColor),
    [160, 160, 160],
  );

  const bodyLuma = bodyColor[0] * 0.2126 + bodyColor[1] * 0.7152 + bodyColor[2] * 0.0722;
  const upperCandidateRuns = runs.filter((run) =>
    run.y >= fullTop + fullHeightPx * 0.04 &&
    run.y <= fullTop + fullHeightPx * 0.32 &&
    run.whole.width >= maxCenterWidth * 0.7
  );
  const upperCandidateLumas = upperCandidateRuns.map((run) =>
    run.sampleColor[0] * 0.2126 + run.sampleColor[1] * 0.7152 + run.sampleColor[2] * 0.0722
  );
  const silverLumaThreshold = Math.max(
    bodyLuma + 12,
    Math.max(...upperCandidateLumas, bodyLuma + 12) - 8,
  );
  const silverRowYs = upperCandidateRuns
    .filter((run) => {
      const luma = run.sampleColor[0] * 0.2126 + run.sampleColor[1] * 0.7152 + run.sampleColor[2] * 0.0722;
      return luma >= silverLumaThreshold && colorDistance(run.sampleColor, bodyColor) > 24;
    })
    .map((run) => run.y);
  const silverSegment = findLongestRowSegment(silverRowYs);
  const rimRows = silverSegment
    ? runs.filter((run) => run.y >= silverSegment.start && run.y <= silverSegment.end)
    : [];
  const rimColor = rimRows.length > 0
    ? medianRgb(rimRows.map((run) => run.sampleColor), [214, 216, 220])
    : null;

  const referenceHalfWidthPx =
    rimRows.length > 0
      ? avg(rimRows.map((run) => Math.max(1, run.whole.right - centerX)))
      : maxCenterWidth / 2;

  const sampleWindow = args.fitDebug
    ? resolveLidSampleWindow({
        fitDebug: args.fitDebug,
        width: info.width,
        height: info.height,
      })
    : resolveGenericLidSampleWindow({
        fullTop,
        rimTop: silverSegment?.start ?? Math.round(fullTop + fullHeightPx * 0.12),
        centerX,
        referenceHalfWidthPx,
        width: info.width,
        height: info.height,
      });

  const lidSamples = sampleWindow
    ? collectLidSamples(data, mask, info.width, sampleWindow)
    : [];
  const lidColor = lidSamples.length >= 60
    ? medianRgb(lidSamples, bodyColor)
    : null;

  return {
    bodyColorHex: rgbToHex(bodyColor),
    rimColorHex: rimColor ? rgbToHex(rimColor) : null,
    lidColorHex: lidColor ? rgbToHex(lidColor) : null,
  };
}

export async function sampleLidColorHex(args: {
  imageUrl?: string | null;
  imageBytes?: Uint8Array | null;
  fitDebug?: TumblerItemLookupFitDebug | null;
  sourceViewClass?: ProductReferenceViewClass | null;
}): Promise<string | null> {
  return (await sampleDrinkwareAppearanceColors(args))?.lidColorHex ?? null;
}
