import type {
  CanonicalHandleContourPoint,
  CanonicalHandleProfile,
  EditableBodyOutline,
} from "@/types/productTemplate";

type BodyRow = {
  y: number;
  left: number;
  right: number;
  center: number;
  width: number;
};

type HandleRow = {
  y: number;
  bodyEdge: number;
  start: number;
  end: number;
  gap: number;
  width: number;
  extension: number;
};

type AttachmentMetrics = {
  widthPx?: number;
  gapPx?: number;
};

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

function medianWindow(values: number[], index: number, radius: number): number {
  const start = Math.max(0, index - radius);
  const end = Math.min(values.length, index + radius + 1);
  return median(values.slice(start, end));
}

function colorDistance(
  r: number,
  g: number,
  b: number,
  background: { r: number; g: number; b: number },
): number {
  const dr = r - background.r;
  const dg = g - background.g;
  const db = b - background.b;
  return Math.sqrt((dr * dr) + (dg * dg) + (db * db));
}

function estimateBackgroundColor(data: Uint8ClampedArray, width: number, height: number): { r: number; g: number; b: number } {
  const samplePoints = [
    [0, 0],
    [Math.max(0, width - 1), 0],
    [0, Math.max(0, height - 1)],
    [Math.max(0, width - 1), Math.max(0, height - 1)],
    [Math.round(width * 0.5), 0],
    [Math.round(width * 0.5), Math.max(0, height - 1)],
  ];
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;
  for (const [x, y] of samplePoints) {
    const clampedX = clamp(x, 0, Math.max(0, width - 1));
    const clampedY = clamp(y, 0, Math.max(0, height - 1));
    const index = ((clampedY * width) + clampedX) * 4;
    sumR += data[index] ?? 0;
    sumG += data[index + 1] ?? 0;
    sumB += data[index + 2] ?? 0;
    count += 1;
  }
  return {
    r: Math.round(sumR / Math.max(1, count)),
    g: Math.round(sumG / Math.max(1, count)),
    b: Math.round(sumB / Math.max(1, count)),
  };
}

function buildClosedPath(points: CanonicalHandleContourPoint[]): string | undefined {
  if (points.length < 4) return undefined;
  return `M ${points
    .map((point, index) => `${index === 0 ? "" : "L "}${round3(point.x)} ${round3(point.y)}`)
    .join(" ")} Z`;
}

function simplifyPoints<T extends { x: number; y: number }>(points: T[], targetCount = 84): T[] {
  if (points.length <= targetCount) return points;
  const result: T[] = [];
  for (let index = 0; index < targetCount; index += 1) {
    const start = Math.floor((index / targetCount) * points.length);
    const end = Math.max(start + 1, Math.floor(((index + 1) / targetCount) * points.length));
    const slice = points.slice(start, end);
    const x = slice.reduce((sum, point) => sum + point.x, 0) / slice.length;
    const y = slice.reduce((sum, point) => sum + point.y, 0) / slice.length;
    result.push({ ...slice[0]!, x: round3(x), y: round3(y) });
  }
  return result;
}

function findLongestSegment(values: number[]): { start: number; end: number } | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  let best = { start: sorted[0]!, end: sorted[0]! };
  let current = { start: sorted[0]!, end: sorted[0]! };
  for (let index = 1; index < sorted.length; index += 1) {
    const value = sorted[index]!;
    if (value - current.end <= 2) {
      current.end = value;
      continue;
    }
    if ((current.end - current.start) > (best.end - best.start)) {
      best = { ...current };
    }
    current = { start: value, end: value };
  }
  if ((current.end - current.start) > (best.end - best.start)) {
    best = current;
  }
  return best;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load handle-analysis image."));
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
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
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

function computeForegroundMask(imageData: ImageData): Uint8Array {
  const { data, width, height } = imageData;
  const alphaValues: number[] = [];
  let transparentPixels = 0;
  for (let index = 3; index < data.length; index += 4) {
    const alpha = data[index] ?? 0;
    if (alpha > 0) alphaValues.push(alpha);
    if (alpha < 245) transparentPixels += 1;
  }
  const mask = new Uint8Array(width * height);
  const totalPixels = Math.max(1, width * height);
  const hasTransparency = transparentPixels > totalPixels * 0.01;
  if (hasTransparency) {
    const threshold = alphaValues.length > 0
      ? clamp(percentile(alphaValues, 0.38), 64, 224)
      : 96;
    for (let index = 0; index < width * height; index += 1) {
      const alpha = data[(index * 4) + 3] ?? 0;
      mask[index] = alpha >= threshold ? 1 : 0;
    }
    return mask;
  }

  const background = estimateBackgroundColor(data, width, height);
  for (let index = 0; index < width * height; index += 1) {
    const dataIndex = index * 4;
    const alpha = data[dataIndex + 3] ?? 0;
    const r = data[dataIndex] ?? 0;
    const g = data[dataIndex + 1] ?? 0;
    const b = data[dataIndex + 2] ?? 0;
    mask[index] = alpha > 8 && colorDistance(r, g, b, background) > 22 ? 1 : 0;
  }
  return mask;
}

function collectSideMass(
  foregroundMask: Uint8Array,
  bodyRows: BodyRow[],
  width: number,
): { left: number; right: number } {
  let left = 0;
  let right = 0;
  for (const row of bodyRows) {
    const rowOffset = row.y * width;
    for (let x = 0; x < row.left; x += 1) {
      left += foregroundMask[rowOffset + x] === 1 ? 1 : 0;
    }
    for (let x = row.right + 1; x < width; x += 1) {
      right += foregroundMask[rowOffset + x] === 1 ? 1 : 0;
    }
  }
  return { left, right };
}

function findRuns(mask: Uint8Array, width: number, rowOffset: number, startX: number, endX: number): Array<{ start: number; end: number; width: number }> {
  const runs: Array<{ start: number; end: number; width: number }> = [];
  let x = startX;
  while (x <= endX) {
    while (x <= endX && mask[rowOffset + x] !== 1) {
      x += 1;
    }
    if (x > endX) break;
    const runStart = x;
    while (x <= endX && mask[rowOffset + x] === 1) {
      x += 1;
    }
    const runEnd = x - 1;
    runs.push({ start: runStart, end: runEnd, width: (runEnd - runStart) + 1 });
  }
  return runs;
}

function buildHandleRows(
  foregroundMask: Uint8Array,
  bodyRows: BodyRow[],
  width: number,
  side: "left" | "right",
): HandleRow[] {
  const rows: HandleRow[] = [];
  for (const row of bodyRows) {
    const rowOffset = row.y * width;
    const runs = side === "right"
      ? findRuns(foregroundMask, width, rowOffset, row.right + 1, width - 1)
      : findRuns(foregroundMask, width, rowOffset, 0, Math.max(0, row.left - 1));
    if (runs.length === 0) continue;
    const chosen = [...runs].sort((a, b) => {
      const distanceA = side === "right" ? (a.start - row.right) : (row.left - a.end);
      const distanceB = side === "right" ? (b.start - row.right) : (row.left - b.end);
      if (Math.abs(distanceA - distanceB) > 0.001) return distanceA - distanceB;
      return b.width - a.width;
    })[0];
    if (!chosen) continue;
    const gap = side === "right" ? chosen.start - row.right : row.left - chosen.end;
    const extension = side === "right" ? chosen.end - row.right : row.left - chosen.start;
    rows.push({
      y: row.y,
      bodyEdge: side === "right" ? row.right : row.left,
      start: chosen.start,
      end: chosen.end,
      gap,
      width: chosen.width,
      extension,
    });
  }
  return rows;
}

function smoothHandleRows(rows: HandleRow[]): HandleRow[] {
  if (rows.length < 5) return rows;
  const starts = rows.map((row) => row.start);
  const ends = rows.map((row) => row.end);
  const bodyEdges = rows.map((row) => row.bodyEdge);
  return rows.map((row, index) => {
    const start = medianWindow(starts, index, 2);
    const end = medianWindow(ends, index, 2);
    const bodyEdge = medianWindow(bodyEdges, index, 2);
    return {
      ...row,
      start,
      end,
      bodyEdge,
      gap: row.bodyEdge < row.start ? start - bodyEdge : bodyEdge - end,
      width: Math.max(1, end - start + 1),
      extension: row.bodyEdge < row.start ? end - bodyEdge : bodyEdge - start,
    };
  });
}

function boundsFromPoints(points: CanonicalHandleContourPoint[]): { x: number; y: number; w: number; h: number } | undefined {
  if (points.length === 0) return undefined;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: round3(minX),
    y: round3(minY),
    w: round3(Math.max(1, maxX - minX)),
    h: round3(Math.max(1, maxY - minY)),
  };
}

function resampleCenterline(rows: HandleRow[], sampleCount = 28): Array<{ x: number; y: number; widthPx: number }> {
  if (rows.length === 0) return [];
  const centers = rows.map((row) => (row.start + row.end) / 2);
  const smoothedCenters = centers.map((_, index) => medianWindow(centers, index, 3));
  const widths = rows.map((row) => row.width);
  const result: Array<{ x: number; y: number; widthPx: number }> = [];

  const count = Math.min(sampleCount, rows.length);
  for (let index = 0; index < count; index += 1) {
    const sourceIndex = Math.round((index / Math.max(1, count - 1)) * (rows.length - 1));
    const row = rows[sourceIndex]!;
    result.push({
      x: round3(smoothedCenters[sourceIndex] ?? (row.start + row.end) / 2),
      y: round3(row.y),
      widthPx: round3(widths[sourceIndex] ?? row.width),
    });
  }
  return result;
}

function normalizeCenterline(points: Array<{ x: number; y: number; widthPx: number }>): Pick<CanonicalHandleProfile, "centerline" | "widthProfile"> {
  if (points.length === 0) {
    return { centerline: [], widthProfile: [] };
  }
  let total = 0;
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1]!;
    const next = points[index]!;
    total += Math.hypot(next.x - prev.x, next.y - prev.y);
    distances.push(total);
  }
  const safeTotal = total > 0 ? total : Math.max(1, points.length - 1);
  return {
    centerline: points.map((point, index) => ({
      t: round3((distances[index] ?? 0) / safeTotal),
      x: round3(point.x),
      y: round3(point.y),
    })),
    widthProfile: points.map((point, index) => ({
      t: round3((distances[index] ?? 0) / safeTotal),
      widthPx: round3(point.widthPx),
    })),
  };
}

function pickAnchorRow(rows: HandleRow[], side: "left" | "right", fromStart: boolean): HandleRow | null {
  if (rows.length === 0) return null;
  const sliceLength = Math.max(3, Math.round(rows.length * 0.24));
  const slice = fromStart ? rows.slice(0, sliceLength) : rows.slice(-sliceLength);
  const gapValues = slice.map((row) => row.gap);
  const tightGap = Math.min(...gapValues);
  const candidates = slice.filter((row) => row.gap <= tightGap + 2);
  if (candidates.length > 0) {
    return candidates[Math.floor(candidates.length / 2)] ?? candidates[0]!;
  }
  return fromStart ? slice[0]! : slice[slice.length - 1]!;
}

function pickAttachmentMetrics(rows: HandleRow[], fromStart: boolean): AttachmentMetrics {
  if (rows.length === 0) return {};
  const sliceLength = Math.max(3, Math.min(rows.length, Math.round(rows.length * 0.18)));
  const slice = fromStart ? rows.slice(0, sliceLength) : rows.slice(-sliceLength);
  const widths = slice
    .map((row) => row.width)
    .filter((value) => Number.isFinite(value) && value > 0);
  const gaps = slice
    .map((row) => row.gap)
    .filter((value) => Number.isFinite(value) && value >= 0);
  return {
    widthPx: widths.length ? round3(median(widths)) : undefined,
    gapPx: gaps.length ? round3(median(gaps)) : undefined,
  };
}

export async function extractCanonicalHandleProfileFromCutout(args: {
  imageDataUrl: string;
  outline: EditableBodyOutline | null | undefined;
}): Promise<CanonicalHandleProfile | null> {
  const contour = args.outline?.sourceContour;
  if (!contour || contour.length < 3) return null;

  const image = await loadImage(args.imageDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const foregroundMask = computeForegroundMask(imageData);
  const bodyMask = createBodyMask(canvas.width, canvas.height, contour);
  const bodyRows = buildBodyRows(bodyMask, canvas.width, canvas.height);
  if (bodyRows.length < 12) return null;

  const sideMass = collectSideMass(foregroundMask, bodyRows, canvas.width);
  const totalSideMass = sideMass.left + sideMass.right;
  if (totalSideMass < Math.max(160, bodyRows.length * 4)) {
    return null;
  }

  const side: "left" | "right" = sideMass.right >= sideMass.left ? "right" : "left";
  const dominantMass = side === "right" ? sideMass.right : sideMass.left;
  const sideConfidence = clamp(dominantMass / Math.max(1, totalSideMass), 0, 1);

  const rawHandleRows = buildHandleRows(foregroundMask, bodyRows, canvas.width, side);
  if (rawHandleRows.length < 8) {
    return null;
  }

  const peakExtension = percentile(rawHandleRows.map((row) => row.extension), 0.9);
  const candidateYs = rawHandleRows
    .filter((row) => row.extension >= Math.max(4, peakExtension * 0.28))
    .map((row) => row.y);
  const span = findLongestSegment(candidateYs);
  if (!span) return null;

  const spanRows = smoothHandleRows(
    rawHandleRows.filter((row) => row.y >= span.start && row.y <= span.end),
  );
  if (spanRows.length < 8) return null;

  const rawOuterContour = simplifyPoints([
    ...spanRows.map((row) => ({ x: row.start, y: row.y })),
    ...[...spanRows].reverse().map((row) => ({ x: row.end, y: row.y })),
  ]);

  const holeRows = spanRows.filter((row) => row.gap >= 4);
  const innerContour = holeRows.length >= 4
    ? simplifyPoints([
        ...holeRows.map((row) => ({
          x: side === "right" ? row.bodyEdge : row.end,
          y: row.y,
        })),
        ...[...holeRows].reverse().map((row) => ({
          x: side === "right" ? row.start : row.bodyEdge,
          y: row.y,
        })),
      ])
    : [];

  const upperAttachmentMetrics = pickAttachmentMetrics(
    holeRows.length >= 3 ? holeRows : spanRows,
    true,
  );
  const lowerAttachmentMetrics = pickAttachmentMetrics(
    holeRows.length >= 3 ? holeRows : spanRows,
    false,
  );
  const symmetricExtrusionWidthPx = round3(
    upperAttachmentMetrics.widthPx ??
      lowerAttachmentMetrics.widthPx ??
      median(spanRows.map((row) => row.width)),
  );
  const outerContour = holeRows.length >= 4 && symmetricExtrusionWidthPx > 0
    ? simplifyPoints([
        ...spanRows.map((row) => ({
          x: round3(
            side === "right"
              ? row.start
              : clamp(row.end - symmetricExtrusionWidthPx, 0, canvas.width - 1),
          ),
          y: round3(row.y),
        })),
        ...[...spanRows].reverse().map((row) => ({
          x: round3(
            side === "right"
              ? clamp(row.start + symmetricExtrusionWidthPx, 0, canvas.width - 1)
              : row.end,
          ),
          y: round3(row.y),
        })),
      ])
    : rawOuterContour;

  const upperAnchorRow = pickAnchorRow(spanRows, side, true);
  const lowerAnchorRow = pickAnchorRow(spanRows, side, false);
  if (!upperAnchorRow || !lowerAnchorRow) return null;

  const bodyTop = bodyRows[0]!.y;
  const bodyBottom = bodyRows[bodyRows.length - 1]!.y;
  const bodyHeight = Math.max(1, bodyBottom - bodyTop);
  const centerlineSeed = resampleCenterline(spanRows);
  const centerline = normalizeCenterline(centerlineSeed);

  const continuity = spanRows.length / Math.max(1, rawHandleRows.length);
  const holeCoverage = holeRows.length / Math.max(1, spanRows.length);
  const anchorQuality = 1 - clamp(((upperAnchorRow.gap + lowerAnchorRow.gap) / 2) / Math.max(8, peakExtension), 0, 1);
  const confidence = round3(clamp(
    (sideConfidence * 0.4) +
      (continuity * 0.25) +
      (holeCoverage * 0.2) +
      (anchorQuality * 0.15),
    0,
    1,
  ));

  return {
    side,
    confidence,
    anchors: {
      upper: {
        sNorm: round3(clamp((upperAnchorRow.y - bodyTop) / bodyHeight, 0, 1)),
        xPx: round3(upperAnchorRow.bodyEdge),
        yPx: round3(upperAnchorRow.y),
      },
      lower: {
        sNorm: round3(clamp((lowerAnchorRow.y - bodyTop) / bodyHeight, 0, 1)),
        xPx: round3(lowerAnchorRow.bodyEdge),
        yPx: round3(lowerAnchorRow.y),
      },
    },
    outerContour,
    innerContour,
    centerline: centerline.centerline,
    widthProfile: centerline.widthProfile,
    upperAttachmentWidthPx: upperAttachmentMetrics.widthPx,
    lowerAttachmentWidthPx: lowerAttachmentMetrics.widthPx,
    upperOpeningGapPx: upperAttachmentMetrics.gapPx,
    lowerOpeningGapPx: lowerAttachmentMetrics.gapPx,
    symmetricExtrusionWidthPx,
    openingBox: boundsFromPoints(innerContour),
    svgPathOuter: buildClosedPath(outerContour),
    svgPathInner: buildClosedPath(innerContour),
  };
}
