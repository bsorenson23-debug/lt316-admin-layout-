import type {
  BodyReferenceViewSide,
  EditableBodyOutline,
  ManufacturerLogoStamp,
  OrientationLandmarks,
  ProductReferenceImage,
  ProductReferenceLogoBox,
  ProductReferenceSet,
} from "@/types/productTemplate";
import type { TumblerItemLookupFitDebug } from "@/types/tumblerItemLookup";

export const MANUFACTURER_LOGO_STAMP_ALGO_VERSION = "canonical-logo-v2-openai-assist";

type BodyRow = {
  y: number;
  left: number;
  right: number;
  center: number;
  width: number;
};

type LogoCandidate = {
  box: ProductReferenceLogoBox;
  score: number;
  alphaCoverage: number;
  mask: Uint8Array;
};

export interface ExtractManufacturerLogoStampArgs {
  photoDataUrl: string;
  overallHeightMm: number;
  brand?: string | null;
  topMarginMm?: number;
  bottomMarginMm?: number;
  fitDebug?: TumblerItemLookupFitDebug | null;
  source: ManufacturerLogoStamp["source"];
  outline?: EditableBodyOutline | null;
  productReferenceSet?: ProductReferenceSet | null;
  sourceImageId?: string;
  preferredLogoBox?: ProductReferenceLogoBox | null;
  preferredViewSide?: BodyReferenceViewSide;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = clamp(Math.round((sorted.length - 1) * fraction), 0, sorted.length - 1);
  return sorted[index] ?? 0;
}

function median(values: number[]): number {
  return percentile(values, 0.5);
}

function sampleCornerBackgroundColor(imageData: ImageData): { r: number; g: number; b: number } {
  const { data, width, height } = imageData;
  const patch = Math.max(2, Math.round(Math.min(width, height) * 0.03));
  const anchors: Array<[number, number]> = [
    [0, 0],
    [Math.max(0, width - patch), 0],
    [0, Math.max(0, height - patch)],
    [Math.max(0, width - patch), Math.max(0, height - patch)],
  ];
  const rValues: number[] = [];
  const gValues: number[] = [];
  const bValues: number[] = [];
  for (const [startX, startY] of anchors) {
    for (let y = startY; y < Math.min(height, startY + patch); y += 1) {
      for (let x = startX; x < Math.min(width, startX + patch); x += 1) {
        const base = (y * width + x) * 4;
        rValues.push(data[base] ?? 0);
        gValues.push(data[base + 1] ?? 0);
        bValues.push(data[base + 2] ?? 0);
      }
    }
  }
  return {
    r: median(rValues),
    g: median(gValues),
    b: median(bValues),
  };
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load logo source image."));
    image.src = dataUrl;
  });
}

function createBodyMask(
  width: number,
  height: number,
  contour: Array<{ x: number; y: number }>,
): Uint8Array {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new Uint8Array(width * height);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  contour.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  ctx.fill();
  const imageData = ctx.getImageData(0, 0, width, height).data;
  const mask = new Uint8Array(width * height);
  for (let index = 0; index < width * height; index += 1) {
    mask[index] = imageData[(index * 4) + 3] > 0 ? 1 : 0;
  }
  return mask;
}

function buildBodyRows(mask: Uint8Array, width: number, height: number): BodyRow[] {
  const rows: BodyRow[] = [];
  for (let y = 0; y < height; y += 1) {
    let left = -1;
    let right = -1;
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      if (mask[rowOffset + x] !== 1) continue;
      if (left < 0) left = x;
      right = x;
    }
    if (left < 0 || right < left) continue;
    rows.push({
      y,
      left,
      right,
      center: (left + right) / 2,
      width: (right - left) + 1,
    });
  }
  return rows;
}

function buildRowsFromFitDebug(
  width: number,
  fitDebug: TumblerItemLookupFitDebug | null | undefined,
): BodyRow[] {
  if (!fitDebug?.profilePoints?.length) return [];
  return fitDebug.profilePoints.map((point) => {
    const center = fitDebug.centerXPx;
    const radius = point.radiusPx;
    const left = clamp(Math.round(center - radius), 0, width - 1);
    const right = clamp(Math.round(center + radius), 0, width - 1);
    return {
      y: clamp(Math.round(point.yPx), 0, fitDebug.imageHeightPx - 1),
      left,
      right,
      center,
      width: (right - left) + 1,
    };
  });
}

function getRowAtY(rows: BodyRow[], y: number): BodyRow | null {
  if (rows.length === 0) return null;
  let best = rows[0]!;
  let bestDelta = Math.abs(best.y - y);
  for (let index = 1; index < rows.length; index += 1) {
    const candidate = rows[index]!;
    const delta = Math.abs(candidate.y - y);
    if (delta < bestDelta) {
      best = candidate;
      bestDelta = delta;
    }
  }
  return best;
}

function estimateAxis(rows: BodyRow[]): {
  xTop: number;
  yTop: number;
  xBottom: number;
  yBottom: number;
  centerX: number;
  topY: number;
  bottomY: number;
} | null {
  if (rows.length < 12) return null;
  const stableRows = rows
    .slice()
    .sort((a, b) => b.width - a.width)
    .slice(0, Math.max(10, Math.round(rows.length * 0.22)));
  const centerX = median(stableRows.map((row) => row.center));
  const topY = rows[0]!.y;
  const bottomY = rows[rows.length - 1]!.y;
  return {
    xTop: centerX,
    yTop: topY,
    xBottom: centerX,
    yBottom: bottomY,
    centerX,
    topY,
    bottomY,
  };
}

function estimateForegroundMask(imageData: ImageData): Uint8Array {
  const { data, width, height } = imageData;
  const alphaValues: number[] = [];
  let transparentCount = 0;
  for (let index = 3; index < data.length; index += 4) {
    const alpha = data[index] ?? 0;
    if (alpha < 250) transparentCount += 1;
    if (alpha > 0) alphaValues.push(alpha);
  }
  const mask = new Uint8Array(width * height);
  const mostlyOpaque = transparentCount < (width * height * 0.02);

  if (mostlyOpaque) {
    const bg = sampleCornerBackgroundColor(imageData);
    const bgLum = bg.r * 0.2126 + bg.g * 0.7152 + bg.b * 0.0722;
    for (let index = 0; index < width * height; index += 1) {
      const base = index * 4;
      const r = data[base] ?? 0;
      const g = data[base + 1] ?? 0;
      const b = data[base + 2] ?? 0;
      const dist = Math.hypot(r - bg.r, g - bg.g, b - bg.b);
      const lum = r * 0.2126 + g * 0.7152 + b * 0.0722;
      const lumDiff = Math.abs(lum - bgLum);
      mask[index] = dist >= 18 || lumDiff >= 14 ? 1 : 0;
    }
    return mask;
  }

  const threshold = alphaValues.length > 0
    ? clamp(percentile(alphaValues, 0.34), 72, 232)
    : 96;
  for (let index = 0; index < width * height; index += 1) {
    const alpha = data[(index * 4) + 3] ?? 0;
    mask[index] = alpha >= threshold ? 1 : 0;
  }
  return mask;
}

function detectBodyColor(
  data: Uint8ClampedArray,
  width: number,
  rows: BodyRow[],
  axis: ReturnType<typeof estimateAxis>,
): { r: number; g: number; b: number } {
  const rValues: number[] = [];
  const gValues: number[] = [];
  const bValues: number[] = [];
  const usableTop = axis ? axis.topY + (axis.bottomY - axis.topY) * 0.18 : rows[0]?.y ?? 0;
  const usableBottom = axis ? axis.topY + (axis.bottomY - axis.topY) * 0.62 : rows[rows.length - 1]?.y ?? 0;

  for (const row of rows) {
    if (row.y < usableTop || row.y > usableBottom) continue;
    const inset = Math.max(3, Math.round(row.width * 0.24));
    const start = clamp(Math.round(row.left + inset), 0, width - 1);
    const end = clamp(Math.round(row.right - inset), 0, width - 1);
    if (end <= start) continue;
    const rowOffset = row.y * width;
    for (let x = start; x <= end; x += 2) {
      const base = (rowOffset + x) * 4;
      rValues.push(data[base] ?? 0);
      gValues.push(data[base + 1] ?? 0);
      bValues.push(data[base + 2] ?? 0);
    }
  }

  return {
    r: median(rValues),
    g: median(gValues),
    b: median(bValues),
  };
}

function buildRelaxedPreferredCandidate(args: {
  imageData: ImageData;
  foregroundMask: Uint8Array;
  bodyColor: { r: number; g: number; b: number };
  searchBox: ProductReferenceLogoBox;
}): LogoCandidate | null {
  const { imageData, foregroundMask, bodyColor, searchBox } = args;
  const { data, width, height } = imageData;
  const candidateMask = new Uint8Array(width * height);
  const scores: number[] = [];

  const maxX = Math.min(width, searchBox.x + searchBox.w);
  const maxY = Math.min(height, searchBox.y + searchBox.h);
  for (let y = searchBox.y; y < maxY; y += 1) {
    const rowOffset = y * width;
    for (let x = searchBox.x; x < maxX; x += 1) {
      if (foregroundMask[rowOffset + x] !== 1) continue;
      const base = (rowOffset + x) * 4;
      const r = data[base] ?? 0;
      const g = data[base + 1] ?? 0;
      const b = data[base + 2] ?? 0;
      const dist = Math.hypot(r - bodyColor.r, g - bodyColor.g, b - bodyColor.b);
      const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
      const baseLum = bodyColor.r * 0.2126 + bodyColor.g * 0.7152 + bodyColor.b * 0.0722;
      const lumDiff = Math.abs(luminance - baseLum);
      scores.push(dist * 0.7 + lumDiff * 1.1);
    }
  }

  if (scores.length < 8) return null;
  const threshold = Math.max(8, percentile(scores, 0.32));
  let hits = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxHitX = Number.NEGATIVE_INFINITY;
  let maxHitY = Number.NEGATIVE_INFINITY;

  for (let y = searchBox.y; y < maxY; y += 1) {
    const rowOffset = y * width;
    for (let x = searchBox.x; x < maxX; x += 1) {
      if (foregroundMask[rowOffset + x] !== 1) continue;
      const base = (rowOffset + x) * 4;
      const r = data[base] ?? 0;
      const g = data[base + 1] ?? 0;
      const b = data[base + 2] ?? 0;
      const dist = Math.hypot(r - bodyColor.r, g - bodyColor.g, b - bodyColor.b);
      const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
      const baseLum = bodyColor.r * 0.2126 + bodyColor.g * 0.7152 + bodyColor.b * 0.0722;
      const lumDiff = Math.abs(luminance - baseLum);
      const score = dist * 0.7 + lumDiff * 1.1;
      if (score < threshold) continue;
      candidateMask[rowOffset + x] = 1;
      hits += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxHitX = Math.max(maxHitX, x);
      maxHitY = Math.max(maxHitY, y);
    }
  }

  if (!Number.isFinite(minX) || hits < 6) return null;
  const box = {
    x: clamp(Math.floor(minX) - 2, 0, width - 1),
    y: clamp(Math.floor(minY) - 2, 0, height - 1),
    w: clamp(Math.ceil(maxHitX - minX) + 4, 1, width),
    h: clamp(Math.ceil(maxHitY - minY) + 4, 1, height),
  };
  const alphaCoverage = hits / Math.max(1, box.w * box.h);
  if (alphaCoverage < 0.01 || alphaCoverage > 0.88) return null;
  return {
    box,
    score: clamp(0.34 + alphaCoverage * 1.15, 0, 0.78),
    alphaCoverage,
    mask: candidateMask,
  };
}

function buildExactPreferredBoxCandidate(args: {
  imageData: ImageData;
  foregroundMask: Uint8Array;
  bodyColor: { r: number; g: number; b: number };
  box: ProductReferenceLogoBox;
}): LogoCandidate | null {
  const { imageData, foregroundMask, bodyColor } = args;
  const { data, width, height } = imageData;
  const box = {
    x: clamp(Math.floor(args.box.x), 0, width - 1),
    y: clamp(Math.floor(args.box.y), 0, height - 1),
    w: clamp(Math.ceil(args.box.w), 1, width),
    h: clamp(Math.ceil(args.box.h), 1, height),
  };
  const maxX = Math.min(width, box.x + box.w);
  const maxY = Math.min(height, box.y + box.h);
  const candidateMask = new Uint8Array(width * height);
  let hits = 0;

  for (let y = box.y; y < maxY; y += 1) {
    const rowOffset = y * width;
    for (let x = box.x; x < maxX; x += 1) {
      if (foregroundMask[rowOffset + x] !== 1) continue;
      const base = (rowOffset + x) * 4;
      const r = data[base] ?? 0;
      const g = data[base + 1] ?? 0;
      const b = data[base + 2] ?? 0;
      const dist = Math.hypot(r - bodyColor.r, g - bodyColor.g, b - bodyColor.b);
      const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
      const baseLum = bodyColor.r * 0.2126 + bodyColor.g * 0.7152 + bodyColor.b * 0.0722;
      const lumDiff = Math.abs(luminance - baseLum);
      if (dist >= 6 || lumDiff >= 6) {
        candidateMask[rowOffset + x] = 1;
        hits += 1;
      }
    }
  }

  if (hits < 4) {
    for (let y = box.y; y < maxY; y += 1) {
      const rowOffset = y * width;
      for (let x = box.x; x < maxX; x += 1) {
        candidateMask[rowOffset + x] = 1;
      }
    }
    hits = Math.max(1, box.w * box.h);
  }

  return {
    box,
    score: 0.32,
    alphaCoverage: hits / Math.max(1, box.w * box.h),
    mask: candidateMask,
  };
}

function detectLogoCandidate(args: {
  imageData: ImageData;
  foregroundMask: Uint8Array;
  rows: BodyRow[];
  axis: NonNullable<ReturnType<typeof estimateAxis>>;
  preferredLogoBox?: ProductReferenceLogoBox | null;
}): LogoCandidate | null {
  const { imageData, foregroundMask, rows, axis, preferredLogoBox } = args;
  const { data, width, height } = imageData;
  const bodyColor = detectBodyColor(data, width, rows, axis);

  if (preferredLogoBox) {
    const paddedBox = {
      x: clamp(Math.floor(preferredLogoBox.x - preferredLogoBox.w * 0.7), 0, width - 1),
      y: clamp(Math.floor(preferredLogoBox.y - preferredLogoBox.h * 0.7), 0, height - 1),
      w: clamp(Math.ceil(preferredLogoBox.w * 2.4), 1, width),
      h: clamp(Math.ceil(preferredLogoBox.h * 2.8), 1, height),
    };
    const candidateMask = new Uint8Array(width * height);
    const scores: number[] = [];
    for (let y = paddedBox.y; y < Math.min(height, paddedBox.y + paddedBox.h); y += 1) {
      const rowOffset = y * width;
      for (let x = paddedBox.x; x < Math.min(width, paddedBox.x + paddedBox.w); x += 1) {
        if (foregroundMask[rowOffset + x] !== 1) continue;
        const base = (rowOffset + x) * 4;
        const r = data[base] ?? 0;
        const g = data[base + 1] ?? 0;
        const b = data[base + 2] ?? 0;
        const dist = Math.hypot(r - bodyColor.r, g - bodyColor.g, b - bodyColor.b);
        const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
        const baseLum = bodyColor.r * 0.2126 + bodyColor.g * 0.7152 + bodyColor.b * 0.0722;
        const lumDiff = Math.abs(luminance - baseLum);
        const score = dist * 0.8 + lumDiff * 1.2;
        scores.push(score);
      }
    }
    if (scores.length > 12) {
      const threshold = Math.max(14, percentile(scores, 0.58));
      let hits = 0;
      for (let y = paddedBox.y; y < Math.min(height, paddedBox.y + paddedBox.h); y += 1) {
        const rowOffset = y * width;
        for (let x = paddedBox.x; x < Math.min(width, paddedBox.x + paddedBox.w); x += 1) {
          if (foregroundMask[rowOffset + x] !== 1) continue;
          const base = (rowOffset + x) * 4;
          const r = data[base] ?? 0;
          const g = data[base + 1] ?? 0;
          const b = data[base + 2] ?? 0;
          const dist = Math.hypot(r - bodyColor.r, g - bodyColor.g, b - bodyColor.b);
          const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
          const baseLum = bodyColor.r * 0.2126 + bodyColor.g * 0.7152 + bodyColor.b * 0.0722;
          const lumDiff = Math.abs(luminance - baseLum);
          const score = dist * 0.8 + lumDiff * 1.2;
          if (score >= threshold) {
            candidateMask[rowOffset + x] = 1;
            hits += 1;
          }
        }
      }
      const alphaCoverage = hits / Math.max(1, paddedBox.w * paddedBox.h);
      if (hits >= 10 && alphaCoverage >= 0.01) {
        return {
          box: paddedBox,
          score: clamp(0.48 + alphaCoverage * 1.3, 0, 0.94),
          alphaCoverage,
          mask: candidateMask,
        };
      }
    }
  }

  let sampleTop = Math.round(axis.topY + (axis.bottomY - axis.topY) * 0.1);
  let sampleBottom = Math.round(axis.topY + (axis.bottomY - axis.topY) * 0.64);
  if (preferredLogoBox) {
    sampleTop = clamp(Math.round(preferredLogoBox.y - preferredLogoBox.h * 1.4), 0, height - 1);
    sampleBottom = clamp(Math.round(preferredLogoBox.y + preferredLogoBox.h * 2.6), 0, height - 1);
  }
  const candidateMask = new Uint8Array(width * height);
  const diffScores: number[] = [];

  for (let y = sampleTop; y <= sampleBottom; y += 1) {
    const row = getRowAtY(rows, y);
    if (!row) continue;
    const rowOffset = y * width;
    const leftLimit = clamp(
      preferredLogoBox ? Math.round(preferredLogoBox.x - preferredLogoBox.w * 0.9) : Math.round(row.left + row.width * 0.16),
      0,
      width - 1,
    );
    const rightLimit = clamp(
      preferredLogoBox ? Math.round(preferredLogoBox.x + preferredLogoBox.w * 1.9) : Math.round(row.right - row.width * 0.16),
      0,
      width - 1,
    );
    for (let x = leftLimit; x <= rightLimit; x += 1) {
      if (foregroundMask[rowOffset + x] !== 1) continue;
      const base = (rowOffset + x) * 4;
      const r = data[base] ?? 0;
      const g = data[base + 1] ?? 0;
      const b = data[base + 2] ?? 0;
      const dist = Math.hypot(r - bodyColor.r, g - bodyColor.g, b - bodyColor.b);
      const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
      const baseLum = bodyColor.r * 0.2126 + bodyColor.g * 0.7152 + bodyColor.b * 0.0722;
      const lumDiff = Math.abs(luminance - baseLum);
      const horizontalEdge = x < rightLimit
        ? Math.abs(luminance - ((data[base + 4] ?? r) * 0.2126 + (data[base + 5] ?? g) * 0.7152 + (data[base + 6] ?? b) * 0.0722))
        : 0;
      const verticalBase = base + (width * 4);
      const verticalEdge = y < sampleBottom
        ? Math.abs(luminance - ((data[verticalBase] ?? r) * 0.2126 + (data[verticalBase + 1] ?? g) * 0.7152 + (data[verticalBase + 2] ?? b) * 0.0722))
        : 0;
      const score = dist * 0.7 + lumDiff * 1.1 + Math.max(horizontalEdge, verticalEdge) * 0.8;
      diffScores.push(score);
      candidateMask[rowOffset + x] = score > 0 ? 1 : 0;
    }
  }

  const hasDiffScores = diffScores.length >= 24;
  const threshold = hasDiffScores
    ? (preferredLogoBox
        ? Math.max(16, percentile(diffScores, 0.44))
        : Math.max(22, percentile(diffScores, 0.72)))
    : 0;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let hits = 0;
  for (let y = sampleTop; y <= sampleBottom; y += 1) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      if (candidateMask[rowOffset + x] !== 1) continue;
      const base = (rowOffset + x) * 4;
      const r = data[base] ?? 0;
      const g = data[base + 1] ?? 0;
      const b = data[base + 2] ?? 0;
      const dist = Math.hypot(r - bodyColor.r, g - bodyColor.g, b - bodyColor.b);
      const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
      const baseLum = bodyColor.r * 0.2126 + bodyColor.g * 0.7152 + bodyColor.b * 0.0722;
      const lumDiff = Math.abs(luminance - baseLum);
      const horizontalEdge = x + 1 < width
        ? Math.abs(luminance - ((data[base + 4] ?? r) * 0.2126 + (data[base + 5] ?? g) * 0.7152 + (data[base + 6] ?? b) * 0.0722))
        : 0;
      const verticalBase = base + (width * 4);
      const verticalEdge = y + 1 < height
        ? Math.abs(luminance - ((data[verticalBase] ?? r) * 0.2126 + (data[verticalBase + 1] ?? g) * 0.7152 + (data[verticalBase + 2] ?? b) * 0.0722))
        : 0;
      const score = dist * 0.7 + lumDiff * 1.1 + Math.max(horizontalEdge, verticalEdge) * 0.8;
      if (score < threshold) {
        candidateMask[rowOffset + x] = 0;
        continue;
      }
      hits += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (hasDiffScores && Number.isFinite(minX) && hits >= 28) {
    const box = {
      x: clamp(Math.floor(minX) - 2, 0, width - 1),
      y: clamp(Math.floor(minY) - 2, 0, height - 1),
      w: clamp(Math.ceil(maxX - minX) + 4, 1, width),
      h: clamp(Math.ceil(maxY - minY) + 4, 1, height),
    };
    const alphaCoverage = hits / Math.max(1, box.w * box.h);
    if (box.w >= 10 && box.h >= 8 && alphaCoverage >= 0.02 && alphaCoverage <= 0.62) {
      const score = clamp((hits / 220) + alphaCoverage * 1.7, 0, 1);
      return { box, score, alphaCoverage, mask: candidateMask };
    }
  }

  if (preferredLogoBox) {
    return buildRelaxedPreferredCandidate({
      imageData,
      foregroundMask,
      bodyColor,
      searchBox: {
        x: clamp(Math.floor(preferredLogoBox.x - preferredLogoBox.w * 0.8), 0, width - 1),
        y: clamp(Math.floor(preferredLogoBox.y - preferredLogoBox.h * 0.9), 0, height - 1),
        w: clamp(Math.ceil(preferredLogoBox.w * 2.1), 1, width),
        h: clamp(Math.ceil(preferredLogoBox.h * 2.6), 1, height),
      },
    });
  }

  return null;
}

function buildStampDataUrl(args: {
  imageData: ImageData;
  candidateMask: Uint8Array;
  box: ProductReferenceLogoBox;
}): string | null {
  const { imageData, candidateMask, box } = args;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, box.w);
  canvas.height = Math.max(1, box.h);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const output = ctx.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const srcX = box.x + x;
      const srcY = box.y + y;
      const srcIndex = (srcY * imageData.width + srcX) * 4;
      const dstIndex = (y * canvas.width + x) * 4;
      output.data[dstIndex] = imageData.data[srcIndex] ?? 0;
      output.data[dstIndex + 1] = imageData.data[srcIndex + 1] ?? 0;
      output.data[dstIndex + 2] = imageData.data[srcIndex + 2] ?? 0;
      output.data[dstIndex + 3] = candidateMask[srcY * imageData.width + srcX] === 1 ? 255 : 0;
    }
  }
  ctx.putImageData(output, 0, 0);
  return canvas.toDataURL("image/png");
}

function buildOrientationLandmarks(args: {
  productReferenceSet?: ProductReferenceSet | null;
  sourceImageId?: string;
  sourceImage?: ProductReferenceImage | null;
  preferredViewSide?: BodyReferenceViewSide;
}): OrientationLandmarks {
  const selection = args.productReferenceSet?.canonicalViewSelection;
  const handleReferenceId = args.productReferenceSet?.canonicalHandleSideImageId;
  const handleImage = handleReferenceId
    ? args.productReferenceSet?.images.find((image) => image.id === handleReferenceId) ?? null
    : null;
  const thetaHandle = handleImage?.handleVisible
    ? (handleImage.handleSide === "left" ? -Math.PI / 2 : handleImage.handleSide === "right" ? Math.PI / 2 : undefined)
    : undefined;
  const preferredViewSide = args.preferredViewSide === "back" ? "back" : "front";
  const canonicalSourceImageId =
    preferredViewSide === "back"
      ? (selection?.canonicalBackImageId ?? args.productReferenceSet?.canonicalBackImageId)
      : (selection?.canonicalFrontImageId ?? args.productReferenceSet?.canonicalFrontImageId);
  const orientationConfidence =
    preferredViewSide === "back"
      ? (selection?.backConfidence ?? args.productReferenceSet?.orientationConfidence ?? 0.56)
      : (selection?.frontConfidence ?? args.productReferenceSet?.orientationConfidence ?? 0.56);
  return {
    thetaFront: 0,
    thetaBack: Math.PI,
    thetaHandle,
    sourceImageId: args.sourceImageId ?? canonicalSourceImageId ?? args.sourceImage?.id,
    confidence: round3(
      clamp(
        orientationConfidence *
          (
            preferredViewSide === "back"
              ? (args.sourceImage?.viewClass === "back" ? 1 : 0.92)
              : (args.sourceImage?.viewClass === "front" ? 1 : 0.92)
          ),
        0,
        1,
      ),
    ),
  };
}

function inferThetaCenter(args: {
  axisX: number;
  row: BodyRow;
  bbox: ProductReferenceLogoBox;
}): number {
  const centerX = args.bbox.x + args.bbox.w / 2;
  const visibleHalfWidth = Math.max(8, (args.row.right - args.row.left + 1) / 2);
  const offsetRatio = clamp((centerX - args.axisX) / visibleHalfWidth, -0.92, 0.92);
  return round3(Math.asin(offsetRatio));
}

function inferThetaSpan(args: {
  row: BodyRow;
  bbox: ProductReferenceLogoBox;
}): number {
  const visibleHalfWidth = Math.max(8, (args.row.right - args.row.left + 1) / 2);
  const spanRatio = clamp((args.bbox.w / 2) / visibleHalfWidth, 0.02, 0.95);
  return round3(Math.max(0.08, Math.asin(spanRatio) * 2));
}

function chooseReferenceFallback(
  productReferenceSet?: ProductReferenceSet | null,
  preferredViewSide: BodyReferenceViewSide = "front",
): {
  image: ProductReferenceImage | null;
  box: ProductReferenceLogoBox | null;
} {
  if (!productReferenceSet?.images?.length) {
    return { image: null, box: null };
  }
  const selection = productReferenceSet.canonicalViewSelection;
  const canonicalImageId =
    preferredViewSide === "back"
      ? (
          selection?.canonicalBackStatus === "true-back"
            ? (selection?.canonicalBackImageId ?? productReferenceSet.canonicalBackImageId)
            : undefined
        )
      : (selection?.canonicalFrontImageId ?? productReferenceSet.canonicalFrontImageId);
  const canonicalCandidate = canonicalImageId
    ? productReferenceSet.images.find((image) => image.id === canonicalImageId && image.logoDetected && image.logoBox) ?? null
    : null;
  if (canonicalCandidate?.logoBox) {
    return { image: canonicalCandidate, box: canonicalCandidate.logoBox };
  }
  const best = productReferenceSet.images
    .filter((image) => {
      if (!image.logoDetected || !image.logoBox) return false;
      if (preferredViewSide === "back") {
        return image.viewClass === "back";
      }
      return true;
    })
    .sort((a, b) => b.confidence - a.confidence)[0] ?? null;
  return { image: best, box: best?.logoBox ?? null };
}

export async function extractManufacturerLogoStamp(
  args: ExtractManufacturerLogoStampArgs,
): Promise<ManufacturerLogoStamp | null> {
  if (!args.photoDataUrl || !args.overallHeightMm || args.overallHeightMm <= 0) return null;

  const image = await loadImage(args.photoDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  let rows: BodyRow[] = [];
  let foregroundMask = estimateForegroundMask(imageData);
  if (args.outline?.sourceContour?.length) {
    const bodyMask = createBodyMask(canvas.width, canvas.height, args.outline.sourceContour);
    rows = buildBodyRows(bodyMask, canvas.width, canvas.height);
    foregroundMask = bodyMask;
  } else if (args.fitDebug) {
    rows = buildRowsFromFitDebug(canvas.width, args.fitDebug);
  } else {
    rows = buildBodyRows(foregroundMask, canvas.width, canvas.height);
  }

  if (rows.length < 12) {
    rows = buildBodyRows(foregroundMask, canvas.width, canvas.height);
  }

  const axis = estimateAxis(rows);
  if (!axis) return null;

  const preferredViewSide = args.preferredViewSide === "back" ? "back" : "front";
  const referenceFallback = chooseReferenceFallback(args.productReferenceSet, preferredViewSide);
  const normalizedPreferredBox =
    !args.preferredLogoBox &&
    referenceFallback.image?.width &&
    referenceFallback.image?.height &&
    referenceFallback.box
      ? {
          x: round3((referenceFallback.box.x / referenceFallback.image.width) * canvas.width),
          y: round3((referenceFallback.box.y / referenceFallback.image.height) * canvas.height),
          w: round3((referenceFallback.box.w / referenceFallback.image.width) * canvas.width),
          h: round3((referenceFallback.box.h / referenceFallback.image.height) * canvas.height),
        }
      : null;
  const candidate = detectLogoCandidate({
    imageData,
    foregroundMask,
    rows,
    axis,
    preferredLogoBox: args.preferredLogoBox ?? normalizedPreferredBox,
  });
  const resolvedCandidate = candidate ?? (
    args.preferredLogoBox && args.sourceImageId
      ? buildExactPreferredBoxCandidate({
          imageData,
          foregroundMask,
          bodyColor: detectBodyColor(imageData.data, canvas.width, rows, axis),
          box: args.preferredLogoBox,
        })
      : null
  );
  if (!resolvedCandidate) return null;

  const rowAtCenter = getRowAtY(rows, resolvedCandidate.box.y + resolvedCandidate.box.h / 2) ?? rows[Math.floor(rows.length / 2)] ?? null;
  if (!rowAtCenter) return null;

  const stampDataUrl = buildStampDataUrl({
    imageData,
    candidateMask: resolvedCandidate.mask,
    box: resolvedCandidate.box,
  });
  if (!stampDataUrl) return null;

  const bodySpanPx = Math.max(1, axis.bottomY - axis.topY);
  const topMarginMm = Math.max(0, args.topMarginMm ?? 0);
  const bottomMarginMm = Math.max(0, args.bottomMarginMm ?? 0);
  const usableHeightMm = Math.max(1, args.overallHeightMm - topMarginMm - bottomMarginMm);
  const mmPerPx = usableHeightMm / bodySpanPx;
  const centerYPx = resolvedCandidate.box.y + resolvedCandidate.box.h / 2;
  const sCenter = clamp((centerYPx - axis.topY) / bodySpanPx, 0, 1);
  const sSpan = clamp(resolvedCandidate.box.h / bodySpanPx, 0.02, 0.8);
  const thetaCenter = inferThetaCenter({
    axisX: axis.centerX,
    row: rowAtCenter,
    bbox: resolvedCandidate.box,
  });
  const thetaSpan = inferThetaSpan({
    row: rowAtCenter,
    bbox: resolvedCandidate.box,
  });

  const sourceImage = args.sourceImageId
    ? args.productReferenceSet?.images.find((image) => image.id === args.sourceImageId) ?? null
    : referenceFallback.image;
  const orientationLandmarks = buildOrientationLandmarks({
    productReferenceSet: args.productReferenceSet,
    sourceImageId: args.sourceImageId,
    sourceImage,
    preferredViewSide,
  });

  return {
    dataUrl: stampDataUrl,
    source: args.source,
    brand: args.brand ?? undefined,
    placement: {
      offsetXMm: round3(thetaCenter * (Math.max(1, rowAtCenter.width) * mmPerPx / 2)),
      centerYFromTopMm: round3(topMarginMm + sCenter * usableHeightMm),
      widthMm: round3(resolvedCandidate.box.w * mmPerPx),
      heightMm: round3(resolvedCandidate.box.h * mmPerPx),
    },
    logoPlacement: {
      source: args.sourceImageId ? "reference-image" : "uploaded-image",
      sourceImageId: args.sourceImageId ?? undefined,
      sCenter: round3(sCenter),
      sSpan: round3(sSpan),
      thetaCenter,
      thetaSpan,
      bboxPx: resolvedCandidate.box,
      confidence: round3(
        clamp(
          resolvedCandidate.score * 0.68 +
            resolvedCandidate.alphaCoverage * 0.18 +
            (orientationLandmarks.confidence ?? 0.6) * 0.14,
          0,
          1,
        ),
      ),
    },
    orientationLandmarks,
  };
}
