import type {
  EditableBodyOutline,
  EditableBodyOutlineContourPoint,
  EditableBodyOutlinePoint,
  EditableOutlineHandle,
  NormalizedMeasurementContour,
  EditableOutlinePointType,
  ReferenceLayerKey,
  ReferenceLayerState,
  ReferencePaths,
} from "@/types/productTemplate";
import type { FlatItemLookupTraceDebug } from "@/types/flatItemLookup";
import type { TumblerItemLookupFitDebug } from "@/types/tumblerItemLookup";

export interface ImportedEditableBodyOutlineSource {
  svgText: string;
  pathData: string;
  viewport: {
    minX: number;
    minY: number;
    width: number;
    height: number;
  };
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
  contour: EditableBodyOutlineContourPoint[];
}

type CreateOutlineArgs = {
  overallHeightMm: number;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  diameterMm: number;
  topOuterDiameterMm?: number | null;
  baseDiameterMm?: number | null;
  shoulderDiameterMm?: number | null;
  taperUpperDiameterMm?: number | null;
  taperLowerDiameterMm?: number | null;
  bevelDiameterMm?: number | null;
  fitDebug?: TumblerItemLookupFitDebug | null;
};

type ImportOutlineArgs = {
  source: ImportedEditableBodyOutlineSource;
  overallHeightMm: number;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  diameterMm: number;
  topOuterDiameterMm?: number | null;
  scalePct?: number;
  widthScalePct?: number;
  heightScalePct?: number;
  offsetYMm?: number;
  side?: "left" | "right";
  sourceMode?: "auto" | "body-only";
};

type TraceImportArgs = {
  traceDebug: FlatItemLookupTraceDebug;
  overallHeightMm: number;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  diameterMm: number;
  topOuterDiameterMm?: number | null;
};

type DerivedOutlineDimensions = {
  bodyTopFromOverallMm?: number;
  bodyBottomFromOverallMm?: number;
  diameterMm?: number;
  topOuterDiameterMm?: number;
  baseDiameterMm?: number;
  shoulderDiameterMm?: number;
  taperUpperDiameterMm?: number;
  taperLowerDiameterMm?: number;
  bevelDiameterMm?: number;
};

const DEFAULT_LAYER_VISIBILITY: Record<ReferenceLayerKey, boolean> = {
  bodyOutline: true,
  lidProfile: true,
  silverProfile: true,
};

const DEFAULT_LAYER_LOCKS: Record<ReferenceLayerKey, boolean> = {
  bodyOutline: false,
  lidProfile: false,
  silverProfile: false,
};

const ROLE_ORDER: Array<EditableBodyOutlinePoint["role"]> = [
  "topOuter",
  "body",
  "shoulder",
  "upperTaper",
  "lowerTaper",
  "bevel",
  "base",
  "custom",
];

type SeededOutlineRole =
  | "topOuter"
  | "body"
  | "shoulder"
  | "upperTaper"
  | "lowerTaper"
  | "bevel"
  | "base";

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function makeId(prefix = "outline"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneHandle(handle?: EditableOutlineHandle | null): EditableOutlineHandle | null {
  return handle ? { x: handle.x, y: handle.y } : null;
}

function roleIndex(role?: EditableBodyOutlinePoint["role"]): number {
  const index = ROLE_ORDER.indexOf(role ?? "custom");
  return index >= 0 ? index : ROLE_ORDER.length;
}

function getBounds(points: EditableBodyOutlineContourPoint[]) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export function buildContourSvgPath(points: Array<{ x: number; y: number }>): string | null {
  if (points.length < 3) return null;
  return `M ${points
    .map((point, index) => `${index === 0 ? "" : "L "}${round1(point.x)} ${round1(point.y)}`)
    .join(" ")} Z`;
}

function getRolePoint(points: EditableBodyOutlinePoint[], role: EditableBodyOutlinePoint["role"]) {
  return points.find((point) => point.role === role) ?? null;
}

function widthForRole(points: EditableBodyOutlinePoint[], role: EditableBodyOutlinePoint["role"]) {
  const point = getRolePoint(points, role);
  return point ? round1(point.x * 2) : undefined;
}

function resolveFitDebugAnchorRadius(args: {
  role: EditableBodyOutlinePoint["role"];
  measuredRadiusMm: number;
  seedRadiusMm: number;
}): number {
  const { role, measuredRadiusMm, seedRadiusMm } = args;
  if (!(seedRadiusMm > 0)) {
    return round1(Math.max(0.1, measuredRadiusMm));
  }
  if (!(measuredRadiusMm > 0)) {
    return round1(seedRadiusMm);
  }

  const config = role === "body" || role === "shoulder"
    ? { minRatio: 0.88, maxRatio: 1.12, measuredWeight: 0.55 }
    : role === "upperTaper" || role === "lowerTaper"
      ? { minRatio: 0.78, maxRatio: 1.18, measuredWeight: 0.35 }
      : { minRatio: 0.72, maxRatio: 1.16, measuredWeight: 0.2 };

  if (
    measuredRadiusMm < seedRadiusMm * config.minRatio ||
    measuredRadiusMm > seedRadiusMm * config.maxRatio
  ) {
    return round1(seedRadiusMm);
  }

  return round1(
    (seedRadiusMm * (1 - config.measuredWeight))
    + (measuredRadiusMm * config.measuredWeight),
  );
}

function nearestHalfWidthAtY(contour: EditableBodyOutlineContourPoint[], y: number): number {
  if (contour.length === 0) return 0;
  const bounds = getBounds(contour);
  if (!bounds) return 0;

  const sampleYs = [y];
  const window = Math.max(2, bounds.height * 0.015);
  for (let offset = window * 0.5; offset <= window; offset += window * 0.5) {
    sampleYs.push(y - offset, y + offset);
  }

  const segments = sampleYs
    .flatMap((sampleY) => getContourSegmentsAtY(contour, sampleY))
    .filter((segment) => Number.isFinite(segment.width) && segment.width > 0.1);

  if (segments.length > 0) {
    const centeredSegment = segments.reduce((best, segment) => {
      const bestDistance = Math.abs(best.centerX);
      const segmentDistance = Math.abs(segment.centerX);
      if (segmentDistance < bestDistance - 0.05) return segment;
      if (bestDistance < segmentDistance - 0.05) return best;
      return segment.width < best.width ? segment : best;
    });
    return round1(Math.max(Math.abs(centeredSegment.leftX), Math.abs(centeredSegment.rightX)));
  }

  const matching = contour.filter((point) => Math.abs(point.y - y) <= window);
  const source = matching.length > 0 ? matching : contour;
  const widths = source.map((point) => Math.abs(point.x));
  return round1(Math.max(...widths));
}

function buildProfilePointsFromContour(args: {
  contour: EditableBodyOutlineContourPoint[];
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  topOuterHalfWidthMm?: number;
}): EditableBodyOutlinePoint[] {
  const { contour, bodyTopFromOverallMm, bodyBottomFromOverallMm, topOuterHalfWidthMm } = args;
  const bodyHeight = Math.max(10, bodyBottomFromOverallMm - bodyTopFromOverallMm);
  const anchors: Array<{ role: EditableBodyOutlinePoint["role"]; y: number }> = [
    { role: "topOuter", y: bodyTopFromOverallMm },
    { role: "body", y: bodyTopFromOverallMm + bodyHeight * 0.14 },
    { role: "shoulder", y: bodyTopFromOverallMm + bodyHeight * 0.58 },
    { role: "upperTaper", y: bodyTopFromOverallMm + bodyHeight * 0.72 },
    { role: "lowerTaper", y: bodyTopFromOverallMm + bodyHeight * 0.86 },
    { role: "bevel", y: bodyTopFromOverallMm + bodyHeight * 0.96 },
    { role: "base", y: bodyBottomFromOverallMm },
  ];

  return anchors.map(({ role, y }) => {
    const tracedHalfWidth = nearestHalfWidthAtY(contour, y);
    const x = role === "topOuter" && topOuterHalfWidthMm != null
      ? round1(Math.max(tracedHalfWidth, topOuterHalfWidthMm))
      : tracedHalfWidth;
    return {
      id: makeId(role ?? "point"),
      x,
      y: round1(y),
      inHandle: null,
      outHandle: null,
      pointType: role === "body" || role === "shoulder" ? "smooth" : "corner",
      role,
    };
  });
}

function buildContourFromProfile(points: EditableBodyOutlinePoint[]): EditableBodyOutlineContourPoint[] {
  const sorted = sortEditableOutlinePoints(points);
  const right = sorted.map((point) => ({ x: round1(point.x), y: round1(point.y) }));
  const left = [...sorted]
    .reverse()
    .map((point) => ({ x: round1(-point.x), y: round1(point.y) }));
  return [...right, ...left];
}

function interpolateFitDebugRadius(
  profilePoints: TumblerItemLookupFitDebug["profilePoints"],
  yMm: number,
): number {
  const sorted = [...profilePoints]
    .filter((point) => Number.isFinite(point.yMm) && Number.isFinite(point.radiusMm))
    .sort((a, b) => a.yMm - b.yMm);
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return round1(sorted[0]!.radiusMm);

  const clampedY = clamp(yMm, sorted[0]!.yMm, sorted[sorted.length - 1]!.yMm);
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index]!;
    const next = sorted[index + 1]!;
    if (clampedY < current.yMm || clampedY > next.yMm) continue;
    const span = next.yMm - current.yMm;
    if (Math.abs(span) < 0.001) return round1(current.radiusMm);
    const t = (clampedY - current.yMm) / span;
    return round1(current.radiusMm + ((next.radiusMm - current.radiusMm) * t));
  }

  return round1(sorted[sorted.length - 1]!.radiusMm);
}

function getContourIntersectionsAtY(
  contour: EditableBodyOutlineContourPoint[],
  y: number,
): number[] {
  if (contour.length < 2) return [];
  const xs: number[] = [];
  for (let index = 0; index < contour.length; index += 1) {
    const current = contour[index];
    const next = contour[(index + 1) % contour.length];
    if (!current || !next) continue;
    const minY = Math.min(current.y, next.y);
    const maxY = Math.max(current.y, next.y);
    if (y < minY || y > maxY) continue;
    if (Math.abs(next.y - current.y) < 0.0001) {
      xs.push(current.x, next.x);
      continue;
    }
    const t = (y - current.y) / (next.y - current.y);
    if (t < 0 || t > 1) continue;
    xs.push(round1(current.x + ((next.x - current.x) * t)));
  }
  return xs;
}

type ContourSegment = {
  leftX: number;
  rightX: number;
  width: number;
  centerX: number;
};

function getContourSegmentsAtY(
  contour: EditableBodyOutlineContourPoint[],
  y: number,
): ContourSegment[] {
  const xs = getContourIntersectionsAtY(contour, y)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const segments: ContourSegment[] = [];

  for (let index = 0; index + 1 < xs.length; index += 2) {
    const leftX = round1(xs[index]!);
    const rightX = round1(xs[index + 1]!);
    const width = round1(rightX - leftX);
    if (width <= 0.1) continue;
    segments.push({
      leftX,
      rightX,
      width,
      centerX: round1((leftX + rightX) / 2),
    });
  }

  return segments;
}

function sampleHalfWidthFromContour(
  contour: EditableBodyOutlineContourPoint[],
  centerX: number,
  y: number,
): number {
  const segments = getContourSegmentsAtY(contour, y);
  if (segments.length === 0) {
    return nearestHalfWidthAtY(
      contour.map((point) => ({ x: round1(point.x - centerX), y: point.y })),
      y,
    );
  }

  const bodySegment = segments.reduce((best, segment) => {
    const bestDistance = Math.abs(best.centerX - centerX);
    const segmentDistance = Math.abs(segment.centerX - centerX);
    if (segmentDistance < bestDistance - 0.05) return segment;
    if (bestDistance < segmentDistance - 0.05) return best;
    return segment.width > best.width ? segment : best;
  });

  return round1(Math.max(centerX - bodySegment.leftX, bodySegment.rightX - centerX));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = clamp(Math.round((sorted.length - 1) * ratio), 0, sorted.length - 1);
  return sorted[index] ?? 0;
}

function computeHalfWidthRoughness(values: number[]): number {
  if (values.length < 3) return Number.POSITIVE_INFINITY;
  const deltas: number[] = [];
  const curvature: number[] = [];

  for (let index = 1; index < values.length; index += 1) {
    deltas.push(Math.abs(values[index]! - values[index - 1]!));
  }
  for (let index = 1; index < deltas.length; index += 1) {
    curvature.push(Math.abs(deltas[index]! - deltas[index - 1]!));
  }

  return percentile(deltas, 0.9) + (percentile(curvature, 0.9) * 1.5);
}

function estimateBodyCenterX(contour: EditableBodyOutlineContourPoint[]): number {
  const bounds = getBounds(contour);
  if (!bounds) return 0;

  const sampleRanges: Array<[number, number]> = [
    [0.04, 0.22],
    [0.74, 0.98],
  ];
  const sampleCount = Math.max(18, Math.min(64, Math.round(bounds.height * 0.18)));
  const centers: number[] = [];

  for (const [startRatio, endRatio] of sampleRanges) {
    const minSampleY = bounds.minY + (bounds.height * startRatio);
    const maxSampleY = bounds.minY + (bounds.height * endRatio);

    for (let index = 0; index < sampleCount; index += 1) {
      const t = sampleCount === 1 ? 0 : index / (sampleCount - 1);
      const y = round1(minSampleY + ((maxSampleY - minSampleY) * t));
      const segments = getContourSegmentsAtY(contour, y);
      if (segments.length === 0) continue;
      const bodySegment = segments.reduce((best, segment) =>
        segment.width > best.width ? segment : best,
      );
      centers.push(bodySegment.centerX);
    }
  }

  if (centers.length === 0) {
    return round1((bounds.minX + bounds.maxX) / 2);
  }

  return round1(median(centers));
}

function estimateReferenceWidth(contour: EditableBodyOutlineContourPoint[]): number {
  const bounds = getBounds(contour);
  if (!bounds) return 0;

  const sampleCount = Math.max(18, Math.min(80, Math.round(bounds.height * 0.8)));
  const minSampleY = bounds.minY + (bounds.height * 0.04);
  const maxSampleY = bounds.minY + (bounds.height * 0.22);
  const widths: number[] = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const t = sampleCount === 1 ? 0 : index / (sampleCount - 1);
    const y = round1(minSampleY + ((maxSampleY - minSampleY) * t));
    const segments = getContourSegmentsAtY(contour, y);
    if (segments.length === 0) continue;
    const bodySegment = segments.reduce((best, segment) =>
      segment.width > best.width ? segment : best,
    );
    widths.push(bodySegment.width);
  }

  if (widths.length === 0) return bounds.width;
  return Math.max(0.1, round1(median(widths)));
}

function selectCenteredContourSegment(
  segments: ContourSegment[],
  centerX: number,
): ContourSegment {
  return segments.reduce((best, segment) => {
    const bestDistance = Math.abs(best.centerX - centerX);
    const segmentDistance = Math.abs(segment.centerX - centerX);
    if (segmentDistance < bestDistance - 0.25) return segment;
    if (bestDistance < segmentDistance - 0.25) return best;
    if (segment.width < best.width - 0.25) return segment;
    if (best.width < segment.width - 0.25) return best;
    return segment;
  });
}

function buildMirroredSourceContour(contour: EditableBodyOutlineContourPoint[]): EditableBodyOutlineContourPoint[] | null {
  const bounds = getBounds(contour);
  if (!bounds) return null;
  const sampleCount = Math.max(48, Math.min(220, Math.round(bounds.height * 2)));
  const centerX = estimateBodyCenterX(contour);
  const rows: Array<{
    y: number;
    leftX: number;
    rightX: number;
    leftHalfWidth: number;
    rightHalfWidth: number;
  }> = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const t = sampleCount === 1 ? 0 : index / (sampleCount - 1);
    const y = round1(bounds.minY + (bounds.height * t));
    const segments = getContourSegmentsAtY(contour, y);
    if (segments.length === 0) continue;
    const bodySegment = segments.reduce((best, segment) => {
      if (segment.width > best.width + 0.1) return segment;
      if (best.width > segment.width + 0.1) return best;
      return Math.abs(segment.centerX - centerX) < Math.abs(best.centerX - centerX) ? segment : best;
    });
    rows.push({
      y,
      leftX: bodySegment.leftX,
      rightX: bodySegment.rightX,
      leftHalfWidth: Math.max(0.1, centerX - bodySegment.leftX),
      rightHalfWidth: Math.max(0.1, bodySegment.rightX - centerX),
    });
  }

  if (rows.length < 8) return null;
  const midBandStartY = bounds.minY + (bounds.height * 0.12);
  const midBandEndY = bounds.minY + (bounds.height * 0.88);
  const midBandRows = rows.filter((row) => row.y >= midBandStartY && row.y <= midBandEndY);
  const leftBand = midBandRows.map((row) => row.leftHalfWidth).filter((value) => value > 0);
  const rightBand = midBandRows.map((row) => row.rightHalfWidth).filter((value) => value > 0);
  const leftSpread = percentile(leftBand, 0.9);
  const rightSpread = percentile(rightBand, 0.9);
  const leftRoughness = computeHalfWidthRoughness(leftBand);
  const rightRoughness = computeHalfWidthRoughness(rightBand);
  const sourceSide = Number.isFinite(leftRoughness) && Number.isFinite(rightRoughness)
    ? (
      leftRoughness < rightRoughness * 0.92
        ? "left"
        : rightRoughness < leftRoughness * 0.92
          ? "right"
          : rightSpread > leftSpread * 1.06
            ? "left"
            : leftSpread > rightSpread * 1.06
              ? "right"
              : leftRoughness <= rightRoughness
                ? "left"
                : "right"
    )
    : (rightSpread > leftSpread * 1.06 ? "left" : leftSpread > rightSpread * 1.06 ? "right" : "left");

  const left = rows.map((row) => ({
    x: round1(sourceSide === "left" ? row.leftX : (2 * centerX) - row.rightX),
    y: row.y,
  }));
  const right = [...rows].reverse().map((row) => ({
    x: round1(sourceSide === "left" ? (2 * centerX) - row.leftX : row.rightX),
    y: row.y,
  }));

  return [...left, ...right];
}

function buildBodyOnlySourceContour(args: {
  contour: EditableBodyOutlineContourPoint[];
  overallHeightMm: number;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
}): EditableBodyOutlineContourPoint[] | null {
  const bounds = getBounds(args.contour);
  if (!bounds) return null;

  const bodyHeightMm = Math.max(1, args.bodyBottomFromOverallMm - args.bodyTopFromOverallMm);
  const overallHeightMm = Math.max(bodyHeightMm, args.overallHeightMm);
  const sourceBodyTopY = bounds.minY + (bounds.height * clamp(args.bodyTopFromOverallMm / overallHeightMm, 0, 1));
  const sourceBodyBottomY = bounds.minY + (bounds.height * clamp(args.bodyBottomFromOverallMm / overallHeightMm, 0, 1));
  const croppedHeight = sourceBodyBottomY - sourceBodyTopY;
  if (croppedHeight < Math.max(12, bounds.height * 0.22)) {
    return null;
  }

  const centerX = estimateBodyCenterX(args.contour);
  const sampleCount = Math.max(48, Math.min(240, Math.round(croppedHeight * 1.6)));
  const rows: Array<{ y: number; leftX: number; rightX: number }> = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const t = sampleCount === 1 ? 0 : index / (sampleCount - 1);
    const y = round1(sourceBodyTopY + (croppedHeight * t));
    const segments = getContourSegmentsAtY(args.contour, y);
    if (segments.length === 0) continue;
    const bodySegment = selectCenteredContourSegment(segments, centerX);
    rows.push({
      y,
      leftX: bodySegment.leftX,
      rightX: bodySegment.rightX,
    });
  }

  if (rows.length < 8) return null;

  const left = rows.map((row) => ({ x: round1(row.leftX), y: row.y }));
  const right = [...rows].reverse().map((row) => ({ x: round1(row.rightX), y: row.y }));
  return [...left, ...right];
}

function buildImportedBodySeedContour(
  contour: EditableBodyOutlineContourPoint[],
): EditableBodyOutlineContourPoint[] | null {
  const bounds = getBounds(contour);
  if (!bounds) return null;

  const centerX = estimateBodyCenterX(contour);
  const sampleCount = Math.max(56, Math.min(260, Math.round(bounds.height * 1.4)));
  const rows: Array<{ y: number; leftX: number; rightX: number; width: number }> = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const t = sampleCount === 1 ? 0 : index / (sampleCount - 1);
    const y = round1(bounds.minY + (bounds.height * t));
    const segments = getContourSegmentsAtY(contour, y);
    if (segments.length === 0) continue;
    const bodySegment = selectCenteredContourSegment(segments, centerX);
    rows.push({
      y,
      leftX: bodySegment.leftX,
      rightX: bodySegment.rightX,
      width: bodySegment.width,
    });
  }

  if (rows.length < 10) return null;

  const stableUpperBandRows = rows.filter((row) =>
    row.y >= bounds.minY + (bounds.height * 0.1)
    && row.y <= bounds.minY + (bounds.height * 0.38)
    && row.width > bounds.width * 0.2,
  );
  const stableUpperWidths = stableUpperBandRows.map((row) => row.width);
  const stableUpperWidth = stableUpperWidths.length > 0
    ? median(stableUpperWidths)
    : percentile(rows.map((row) => row.width), 0.8);
  const minimumBodyWidth = Math.max(bounds.width * 0.32, stableUpperWidth * 0.72);
  const confirmationWindow = Math.max(4, Math.min(10, Math.round(rows.length * 0.035)));
  let topIndex = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const window = rows.slice(index, Math.min(rows.length, index + confirmationWindow));
    const qualifyingRows = window.filter((row) => row.width >= minimumBodyWidth).length;
    if (qualifyingRows >= Math.max(3, Math.ceil(window.length * 0.65))) {
      topIndex = index;
      break;
    }
  }

  const trimmedRows = rows.slice(topIndex);
  if (trimmedRows.length < 8) return null;

  const left = trimmedRows.map((row) => ({ x: round1(row.leftX), y: row.y }));
  const right = [...trimmedRows].reverse().map((row) => ({ x: round1(row.rightX), y: row.y }));
  return [...left, ...right];
}

function parsePathContour(path: SVGGeometryElement, sampleCount = 240): EditableBodyOutlineContourPoint[] {
  const totalLength = typeof path.getTotalLength === "function" ? path.getTotalLength() : 0;
  const count = Math.max(24, Math.min(600, Math.round(totalLength / 3) || sampleCount));
  const points: EditableBodyOutlineContourPoint[] = [];

  for (let index = 0; index < count; index += 1) {
    const point = path.getPointAtLength((totalLength * index) / count);
    points.push({ x: round1(point.x), y: round1(point.y) });
  }

  if (points.length > 0) {
    points.push({ ...points[0] });
  }

  return points;
}

function splitPathSubpaths(pathData: string): string[] {
  const matches = pathData.match(/[Mm][^Mm]*/g);
  if (!matches || matches.length === 0) return pathData.trim() ? [pathData] : [];
  return matches
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function ensureSvgGeometryElement(element: Element): element is SVGGeometryElement {
  return typeof (element as SVGGeometryElement).getTotalLength === "function";
}

function scoreImportedOutlineBounds(
  bbox: { x: number; y: number; width: number; height: number },
  viewport: { minX: number; minY: number; width: number; height: number } | null,
): number {
  const area = bbox.width * bbox.height;
  if (!viewport) return area;

  const viewportMaxX = viewport.minX + viewport.width;
  const viewportMaxY = viewport.minY + viewport.height;
  const bboxMaxX = bbox.x + bbox.width;
  const bboxMaxY = bbox.y + bbox.height;
  const widthFill = bbox.width / Math.max(1, viewport.width);
  const heightFill = bbox.height / Math.max(1, viewport.height);
  const marginX = Math.max(4, viewport.width * 0.03);
  const marginY = Math.max(4, viewport.height * 0.03);
  const hugsViewport =
    widthFill >= 0.92 &&
    heightFill >= 0.92 &&
    Math.abs(bbox.x - viewport.minX) <= marginX &&
    Math.abs(bboxMaxX - viewportMaxX) <= marginX &&
    Math.abs(bbox.y - viewport.minY) <= marginY &&
    Math.abs(bboxMaxY - viewportMaxY) <= marginY;

  if (hugsViewport) {
    return area * 0.001;
  }

  return area;
}

function parseImportedSvg(svgText: string): ImportedEditableBodyOutlineSource {
  if (typeof DOMParser === "undefined" || typeof document === "undefined") {
    throw new Error("SVG outline import requires a browser environment.");
  }

  const parser = new DOMParser();
  const documentRoot = parser.parseFromString(svgText, "image/svg+xml");
  const parsedSvg = documentRoot.documentElement;
  if (!parsedSvg || parsedSvg.nodeName.toLowerCase() !== "svg") {
    throw new Error("SVG outline import requires a valid SVG document.");
  }

  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "-10000px";
  host.style.width = "1px";
  host.style.height = "1px";
  host.style.pointerEvents = "none";
  host.style.opacity = "0";

  const liveSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const widthAttr = parsedSvg.getAttribute("width");
  const heightAttr = parsedSvg.getAttribute("height");
  const viewBox = parsedSvg.getAttribute("viewBox");
  if (widthAttr) liveSvg.setAttribute("width", widthAttr);
  if (heightAttr) liveSvg.setAttribute("height", heightAttr);
  if (viewBox) liveSvg.setAttribute("viewBox", viewBox);
  liveSvg.innerHTML = parsedSvg.innerHTML;
  host.appendChild(liveSvg);
  document.body.appendChild(host);

  try {
    const viewportFromViewBox = (() => {
      if (!viewBox) return null;
      const values = viewBox
        .trim()
        .split(/[\s,]+/)
        .map((value) => Number.parseFloat(value))
        .filter(Number.isFinite);
      if (values.length !== 4) return null;
      return {
        minX: round1(values[0] ?? 0),
        minY: round1(values[1] ?? 0),
        width: Math.max(0.1, round1(values[2] ?? 0)),
        height: Math.max(0.1, round1(values[3] ?? 0)),
      };
    })();
    const viewportFromDimensions = (() => {
      const width = Number.parseFloat(widthAttr ?? "");
      const height = Number.parseFloat(heightAttr ?? "");
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return null;
      }
      return {
        minX: 0,
        minY: 0,
        width: round1(width),
        height: round1(height),
      };
    })();

    const geometryCandidates = Array.from(
      liveSvg.querySelectorAll("path, rect, circle, ellipse, polygon"),
    ).filter(ensureSvgGeometryElement);

    if (geometryCandidates.length === 0) {
      throw new Error("SVG does not contain a supported closed outline path.");
    }

    let bestElement: SVGGeometryElement | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const candidate of geometryCandidates) {
      const bbox = candidate.getBBox();
      const score = scoreImportedOutlineBounds(bbox, viewportFromViewBox ?? viewportFromDimensions);
      if (score > bestScore && bbox.width > 0 && bbox.height > 0) {
        bestScore = score;
        bestElement = candidate;
      }
    }

    if (!bestElement) {
      throw new Error("SVG body outline could not be resolved.");
    }

    let resolvedElement: SVGGeometryElement = bestElement;
    let resolvedPathData =
      bestElement.tagName.toLowerCase() === "path"
        ? bestElement.getAttribute("d") ?? ""
        : "";

    if (bestElement.tagName.toLowerCase() === "path" && resolvedPathData) {
      const subpaths = splitPathSubpaths(resolvedPathData);
      if (subpaths.length > 1) {
        let bestSubpathElement: SVGGeometryElement | null = null;
        let bestSubpathData = resolvedPathData;
        let bestSubpathScore = Number.NEGATIVE_INFINITY;
        const tempPaths: SVGGeometryElement[] = [];

        for (const subpath of subpaths) {
          const candidate = document.createElementNS("http://www.w3.org/2000/svg", "path");
          candidate.setAttribute("d", subpath);
          liveSvg.appendChild(candidate);
          tempPaths.push(candidate);
          const bbox = candidate.getBBox();
          const score = scoreImportedOutlineBounds(bbox, viewportFromViewBox ?? viewportFromDimensions);
          if (bbox.width > 0 && bbox.height > 0 && score > bestSubpathScore) {
            bestSubpathScore = score;
            bestSubpathElement = candidate;
            bestSubpathData = subpath;
          }
        }

        if (bestSubpathElement) {
          resolvedElement = bestSubpathElement;
          resolvedPathData = bestSubpathData;
        }

        for (const candidate of tempPaths) {
          if (candidate !== bestSubpathElement) {
            candidate.remove();
          }
        }
      }
    }

    const contour = parsePathContour(resolvedElement);
    const bounds = getBounds(contour);
    if (!bounds) {
      throw new Error("SVG body outline did not produce a usable contour.");
    }
    const viewport = viewportFromViewBox
      ?? viewportFromDimensions
      ?? {
        minX: bounds.minX,
        minY: bounds.minY,
        width: bounds.width,
        height: bounds.height,
      };

    return {
      svgText,
      pathData: resolvedPathData,
      viewport,
      bounds,
      contour,
    };
  } finally {
    host.remove();
  }
}

export function createDefaultReferenceLayerState(): ReferenceLayerState {
  return {
    activeLayer: "bodyOutline",
    visibility: { ...DEFAULT_LAYER_VISIBILITY },
    locked: { ...DEFAULT_LAYER_LOCKS },
  };
}

export function cloneReferenceLayerState(
  state?: ReferenceLayerState | null,
): ReferenceLayerState {
  const source = state ?? createDefaultReferenceLayerState();
  return {
    activeLayer: source.activeLayer ?? "bodyOutline",
    visibility: {
      ...DEFAULT_LAYER_VISIBILITY,
      ...(source.visibility ?? {}),
    },
    locked: {
      ...DEFAULT_LAYER_LOCKS,
      ...(source.locked ?? {}),
    },
  };
}

export function createReferencePaths(paths?: Partial<ReferencePaths> | null): ReferencePaths {
  return {
    bodyOutline: paths?.bodyOutline ?? null,
    lidProfile: paths?.lidProfile ?? null,
    silverProfile: paths?.silverProfile ?? null,
  };
}

export function cloneEditableBodyOutline(
  outline?: EditableBodyOutline | null,
): EditableBodyOutline | undefined {
  if (!outline) return undefined;
  return {
    closed: outline.closed,
    version: 1,
    points: outline.points.map((point) => ({
      ...point,
      inHandle: cloneHandle(point.inHandle),
      outHandle: cloneHandle(point.outHandle),
    })),
    directContour: outline.directContour?.map((point) => ({ ...point })),
    sourceContour: outline.sourceContour?.map((point) => ({ ...point })),
    sourceContourBounds: outline.sourceContourBounds ? { ...outline.sourceContourBounds } : undefined,
    sourceContourMode: outline.sourceContourMode,
    sourceContourViewport: outline.sourceContourViewport ? { ...outline.sourceContourViewport } : undefined,
  };
}

export function normalizeMeasurementContour(args: {
  outline: EditableBodyOutline | null | undefined;
  overallHeightMm: number;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
}): NormalizedMeasurementContour | null {
  const baseContour =
    args.outline?.sourceContour && args.outline.sourceContour.length >= 3
      ? args.outline.sourceContour
      : (args.outline?.directContour && args.outline.directContour.length >= 3
          ? args.outline.directContour
          : null);
  if (!baseContour || baseContour.length < 3) return null;

  const usesBodyOnlyContour = args.outline?.sourceContourMode === "body-only";
  const mirroredContour = usesBodyOnlyContour
    ? baseContour
    : (buildMirroredSourceContour(baseContour) ?? baseContour);
  const bodyOnlyContour = usesBodyOnlyContour
    ? baseContour
    : (
      buildBodyOnlySourceContour({
        contour: mirroredContour,
        overallHeightMm: args.overallHeightMm,
        bodyTopFromOverallMm: args.bodyTopFromOverallMm,
        bodyBottomFromOverallMm: args.bodyBottomFromOverallMm,
      }) ?? mirroredContour
    );
  const bounds = getBounds(bodyOnlyContour) ?? getBounds(mirroredContour) ?? getBounds(baseContour);
  if (!bounds) return null;

  return {
    contour: bodyOnlyContour,
    bounds,
    mirrored: mirroredContour !== baseContour,
    bodyOnly: bodyOnlyContour !== mirroredContour,
  };
}

export function sortEditableOutlinePoints(points: EditableBodyOutlinePoint[]): EditableBodyOutlinePoint[] {
  return [...points].sort((a, b) => {
    const deltaY = a.y - b.y;
    if (Math.abs(deltaY) > 0.05) return deltaY;
    return roleIndex(a.role) - roleIndex(b.role);
  });
}

export function createEditableBodyOutline(args: CreateOutlineArgs): EditableBodyOutline {
  const bodyTop = round1(args.bodyTopFromOverallMm);
  const bodyBottom = round1(args.bodyBottomFromOverallMm);
  const bodyHeight = Math.max(10, bodyBottom - bodyTop);
  const bodyDiameter = round1(args.diameterMm);
  const topOuterDiameter = round1(args.topOuterDiameterMm ?? Math.max(args.diameterMm, bodyDiameter));
  const baseDiameter = round1(args.baseDiameterMm ?? Math.max(20, bodyDiameter * 0.78));
  const shoulderDiameter = round1(args.shoulderDiameterMm ?? Math.max(baseDiameter, bodyDiameter * 0.98));
  const taperUpperDiameter = round1(args.taperUpperDiameterMm ?? Math.max(baseDiameter, shoulderDiameter * 0.88));
  const taperLowerDiameter = round1(args.taperLowerDiameterMm ?? Math.max(baseDiameter, taperUpperDiameter * 0.76));
  const bevelDiameter = round1(args.bevelDiameterMm ?? Math.max(baseDiameter, taperLowerDiameter * 0.92));
  const roleSeedRadiusMm: Record<SeededOutlineRole, number> = {
    topOuter: topOuterDiameter / 2,
    body: bodyDiameter / 2,
    shoulder: shoulderDiameter / 2,
    upperTaper: taperUpperDiameter / 2,
    lowerTaper: taperLowerDiameter / 2,
    bevel: bevelDiameter / 2,
    base: baseDiameter / 2,
  };

  const fitProfilePoints = args.fitDebug?.profilePoints ?? null;
  if (fitProfilePoints && fitProfilePoints.length > 1) {
    const anchors: Array<{ role: EditableBodyOutlinePoint["role"]; y: number; pointType: EditableOutlinePointType }> = [
      { role: "topOuter", y: bodyTop, pointType: "corner" },
      { role: "body", y: round1(bodyTop + bodyHeight * 0.14), pointType: "smooth" },
      { role: "shoulder", y: round1(bodyTop + bodyHeight * 0.58), pointType: "smooth" },
      { role: "upperTaper", y: round1(bodyTop + bodyHeight * 0.72), pointType: "corner" },
      { role: "lowerTaper", y: round1(bodyTop + bodyHeight * 0.86), pointType: "corner" },
      { role: "bevel", y: round1(bodyTop + bodyHeight * 0.96), pointType: "corner" },
      { role: "base", y: bodyBottom, pointType: "corner" },
    ];
    const points = anchors.map(({ role, y, pointType }) => {
      const seedRadiusMm =
        roleSeedRadiusMm[role as SeededOutlineRole]
        ?? (bodyDiameter / 2);
      const measuredRadiusMm = interpolateFitDebugRadius(fitProfilePoints, y);
      return {
        id: makeId(role ?? "point"),
        x: Math.max(0.1, resolveFitDebugAnchorRadius({
          role,
          measuredRadiusMm,
          seedRadiusMm,
        })),
        y,
        inHandle: null,
        outHandle: null,
        pointType,
        role,
      };
    });
    const fitDebug = args.fitDebug!;
    const sourceContour = [
      ...fitProfilePoints.map((point) => ({
        x: round1((fitDebug.centerXPx ?? 0) + point.radiusPx),
        y: round1(point.yPx),
      })),
      ...[...fitProfilePoints].reverse().map((point) => ({
        x: round1((fitDebug.centerXPx ?? 0) - point.radiusPx),
        y: round1(point.yPx),
      })),
    ];
    const sourceContourBounds = getBounds(sourceContour) ?? {
      minX: fitDebug.silhouetteBoundsPx.minX,
      minY: fitDebug.bodyTopPx,
      maxX: fitDebug.silhouetteBoundsPx.maxX,
      maxY: fitDebug.bodyBottomPx,
      width: Math.max(1, fitDebug.silhouetteBoundsPx.maxX - fitDebug.silhouetteBoundsPx.minX),
      height: Math.max(1, fitDebug.bodyBottomPx - fitDebug.bodyTopPx),
    };

    return {
      closed: true,
      version: 1,
      points,
      directContour: buildContourFromProfile(points),
      sourceContour,
      sourceContourBounds,
      sourceContourViewport: {
        minX: 0,
        minY: 0,
        width: Math.max(1, fitDebug.imageWidthPx),
        height: Math.max(1, fitDebug.imageHeightPx),
      },
    };
  }

  const pointDefs: Array<Omit<EditableBodyOutlinePoint, "id" | "inHandle" | "outHandle">> = [
    { role: "topOuter", x: topOuterDiameter / 2, y: bodyTop, pointType: "corner" },
    { role: "body", x: bodyDiameter / 2, y: round1(bodyTop + bodyHeight * 0.14), pointType: "smooth" },
    { role: "shoulder", x: shoulderDiameter / 2, y: round1(bodyTop + bodyHeight * 0.58), pointType: "smooth" },
    { role: "upperTaper", x: taperUpperDiameter / 2, y: round1(bodyTop + bodyHeight * 0.72), pointType: "corner" },
    { role: "lowerTaper", x: taperLowerDiameter / 2, y: round1(bodyTop + bodyHeight * 0.86), pointType: "corner" },
    { role: "bevel", x: bevelDiameter / 2, y: round1(bodyTop + bodyHeight * 0.96), pointType: "corner" },
    { role: "base", x: baseDiameter / 2, y: bodyBottom, pointType: "corner" },
  ];

  const points = pointDefs.map((point) => ({
    ...point,
    id: makeId(point.role ?? "point"),
    inHandle: null,
    outHandle: null,
  }));

  return {
    closed: true,
    version: 1,
    points,
    directContour: buildContourFromProfile(points),
  };
}

export function createEditableBodyOutlineFromTraceDebug(args: TraceImportArgs): EditableBodyOutline {
  const {
    traceDebug,
    overallHeightMm,
    bodyTopFromOverallMm,
    bodyBottomFromOverallMm,
    diameterMm,
    topOuterDiameterMm,
  } = args;
  const rawSourceContour = traceDebug.outlinePointsPx.map((point) => ({
    x: round1(point.xPx),
    y: round1(point.yPx),
  }));
  const rawBounds = getBounds(rawSourceContour) ?? {
    minX: traceDebug.silhouetteBoundsPx.minX,
    minY: traceDebug.silhouetteBoundsPx.minY,
    maxX: traceDebug.silhouetteBoundsPx.maxX,
    maxY: traceDebug.silhouetteBoundsPx.maxY,
    width: Math.max(1, traceDebug.silhouetteBoundsPx.maxX - traceDebug.silhouetteBoundsPx.minX),
    height: Math.max(1, traceDebug.silhouetteBoundsPx.maxY - traceDebug.silhouetteBoundsPx.minY),
  };
  const mirroredContour = buildMirroredSourceContour(rawSourceContour) ?? rawSourceContour;
  const bodySourceContour = buildBodyOnlySourceContour({
    contour: mirroredContour,
    overallHeightMm,
    bodyTopFromOverallMm,
    bodyBottomFromOverallMm,
  }) ?? mirroredContour;
  const contour = bodySourceContour;
  const bounds = getBounds(contour) ?? rawBounds;
  const bodyHeightMm = Math.max(10, bodyBottomFromOverallMm - bodyTopFromOverallMm);
  const resolvedTopOuterDiameterMm =
    topOuterDiameterMm && topOuterDiameterMm > Math.max(1, diameterMm * 0.6)
      ? topOuterDiameterMm
      : diameterMm;
  const topOuterDiameter = round1(resolvedTopOuterDiameterMm);
  const centerX = estimateBodyCenterX(contour);
  const usesBodyOnlyContour = bodySourceContour.length > 0 && bodySourceContour !== mirroredContour;
  const scaleY = Math.max(0.001, bodyHeightMm / Math.max(1, bounds.height));
  const resolveSourceY = (yMm: number) => (
    usesBodyOnlyContour
      ? bounds.minY + (clamp((yMm - bodyTopFromOverallMm) / Math.max(1, bodyHeightMm), 0, 1) * bounds.height)
      : rawBounds.minY + (clamp(yMm / Math.max(1, overallHeightMm), 0, 1) * rawBounds.height)
  );
  const sourceBodyY = bodyTopFromOverallMm + (bodyHeightMm * 0.14);
  const sourceSampleY = resolveSourceY(sourceBodyY);
  const sourceHalfWidth = Math.max(0.1, sampleHalfWidthFromContour(contour, centerX, sourceSampleY));
  const scaleX = Math.max(0.001, diameterMm / Math.max(0.2, sourceHalfWidth * 2));
  const anchors: Array<{ role: EditableBodyOutlinePoint["role"]; y: number; pointType: EditableOutlinePointType }> = [
    { role: "topOuter", y: round1(bodyTopFromOverallMm), pointType: "corner" },
    { role: "body", y: round1(bodyTopFromOverallMm + bodyHeightMm * 0.14), pointType: "smooth" },
    { role: "shoulder", y: round1(bodyTopFromOverallMm + bodyHeightMm * 0.58), pointType: "smooth" },
    { role: "upperTaper", y: round1(bodyTopFromOverallMm + bodyHeightMm * 0.72), pointType: "corner" },
    { role: "lowerTaper", y: round1(bodyTopFromOverallMm + bodyHeightMm * 0.86), pointType: "corner" },
    { role: "bevel", y: round1(bodyTopFromOverallMm + bodyHeightMm * 0.96), pointType: "corner" },
    { role: "base", y: round1(bodyBottomFromOverallMm), pointType: "corner" },
  ];
  const points = anchors.map(({ role, y, pointType }) => {
    const sourceY = resolveSourceY(y);
    const halfWidthMm = round1(sampleHalfWidthFromContour(contour, centerX, sourceY) * scaleX);
    const seedRadiusMm =
      role === "topOuter"
        ? topOuterDiameter / 2
        : diameterMm / 2;
    return {
      id: makeId(role ?? "point"),
      x: Math.max(0.1, (
        role === "topOuter"
          ? seedRadiusMm
          : halfWidthMm
      )),
      y,
      inHandle: null,
      outHandle: null,
      pointType,
      role,
    };
  });
  const rawDirectContour = contour.map((point) => ({
    x: round1((point.x - centerX) * scaleX),
    y: round1(bodyTopFromOverallMm + ((point.y - bounds.minY) * scaleY)),
  }));
  const directContour = rawDirectContour.filter((point) =>
    point.y >= bodyTopFromOverallMm - 2 && point.y <= bodyBottomFromOverallMm + 2,
  );
  const normalizedDirectContour = directContour.length >= 8 ? directContour : rawDirectContour;

  return {
    closed: true,
    version: 1,
    points,
    directContour: normalizedDirectContour,
    sourceContour: contour,
    sourceContourBounds: bounds,
    sourceContourMode: "body-only",
    sourceContourViewport: {
      minX: 0,
      minY: 0,
      width: Math.max(1, traceDebug.imageWidthPx),
      height: Math.max(1, traceDebug.imageHeightPx),
    },
  };
}

export function createEditableBodyOutlineFromImportedSvg(args: ImportOutlineArgs): EditableBodyOutline {
  const {
    source,
    overallHeightMm,
    bodyTopFromOverallMm,
    bodyBottomFromOverallMm,
    diameterMm,
    topOuterDiameterMm,
    scalePct = 100,
    widthScalePct = 100,
    heightScalePct = 100,
    offsetYMm = 0,
    side = "right",
    sourceMode = "auto",
  } = args;
  const sourceContour = source.contour;
  const normalizedSourceContour = sourceMode === "body-only"
    ? sourceContour
    : (buildMirroredSourceContour(sourceContour) ?? sourceContour);
  const bodyOnlySourceContour = sourceMode === "body-only"
    ? (buildImportedBodySeedContour(normalizedSourceContour) ?? normalizedSourceContour)
    : (
      buildBodyOnlySourceContour({
        contour: normalizedSourceContour,
        overallHeightMm,
        bodyTopFromOverallMm,
        bodyBottomFromOverallMm,
      }) ?? normalizedSourceContour
    );
  const bounds =
    getBounds(bodyOnlySourceContour)
    ?? getBounds(normalizedSourceContour)
    ?? getBounds(sourceContour)
    ?? source.bounds;
  const referenceDiameterMm = round1(topOuterDiameterMm && topOuterDiameterMm > 0 ? topOuterDiameterMm : diameterMm);
  const targetBodyHeightMm = Math.max(10, bodyBottomFromOverallMm - bodyTopFromOverallMm);
  const scaleFactor = scalePct / 100;
  const referenceSourceWidth = estimateReferenceWidth(bodyOnlySourceContour);
  const scaleX = (referenceDiameterMm / Math.max(0.1, referenceSourceWidth)) * (widthScalePct / 100) * scaleFactor;
  const scaleY = (targetBodyHeightMm / Math.max(1, bounds.height)) * (heightScalePct / 100) * scaleFactor;
  const centerX = estimateBodyCenterX(bodyOnlySourceContour);
  const minY = bounds.minY;
  const sign = side === "left" ? -1 : 1;

  const rawContour = bodyOnlySourceContour.map((point) => ({
    x: round1(((point.x - centerX) * scaleX) * sign),
    y: round1(bodyTopFromOverallMm + ((point.y - minY) * scaleY) + offsetYMm),
  }));

  const clippedContour = rawContour.filter((point) =>
    point.y >= bodyTopFromOverallMm - 2 && point.y <= bodyBottomFromOverallMm + 2,
  );
  const bodyContour = clippedContour.length >= 8 ? clippedContour : rawContour;
  const contour = bodyContour;
  const points = buildProfilePointsFromContour({
    contour,
    bodyTopFromOverallMm: round1(bodyTopFromOverallMm + offsetYMm),
    bodyBottomFromOverallMm: round1(bodyBottomFromOverallMm + offsetYMm),
    topOuterHalfWidthMm: referenceDiameterMm / 2,
  });

  return {
    closed: true,
    version: 1,
    points,
    directContour: contour.map((point) => ({ ...point })),
    sourceContour: bodyOnlySourceContour.map((point) => ({ ...point })),
    sourceContourBounds: bounds,
    sourceContourMode: "body-only",
    sourceContourViewport: source.viewport,
  };
}

export function createEditableBodyOutlineFromSeedSvgText(args: {
  svgText: string;
  overallHeightMm: number;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  diameterMm: number;
  topOuterDiameterMm?: number | null;
  side?: "left" | "right";
  sourceMode?: "auto" | "body-only";
}): { source: ImportedEditableBodyOutlineSource; outline: EditableBodyOutline } {
  const source = parseImportedSvg(args.svgText);
  const outline = createEditableBodyOutlineFromImportedSvg({
    source,
    overallHeightMm: args.overallHeightMm,
    bodyTopFromOverallMm: args.bodyTopFromOverallMm,
    bodyBottomFromOverallMm: args.bodyBottomFromOverallMm,
    diameterMm: args.diameterMm,
    topOuterDiameterMm: args.topOuterDiameterMm,
    side: args.side,
    sourceMode: args.sourceMode,
  });
  return { source, outline };
}

export function buildDirectContourSvgPath(args: {
  outline: EditableBodyOutline;
  centerXPx: number;
  pxPerMm: number;
}): string | null {
  const contour = args.outline.directContour;
  if (!contour || contour.length < 3) return null;
  const points = contour.map((point) => ({
    x: args.centerXPx + (point.x * args.pxPerMm),
    y: point.y * args.pxPerMm,
  }));
  return buildContourSvgPath(points);
}

export function buildMirroredOutlineSvgPath(args: {
  outline: EditableBodyOutline;
  centerXPx: number;
  pxPerMm: number;
}): string | null {
  const sorted = sortEditableOutlinePoints(args.outline.points);
  if (sorted.length < 2) return null;
  const right = sorted.map((point) => ({
    x: args.centerXPx + (point.x * args.pxPerMm),
    y: point.y * args.pxPerMm,
  }));
  const left = [...sorted].reverse().map((point) => ({
    x: args.centerXPx - (point.x * args.pxPerMm),
    y: point.y * args.pxPerMm,
  }));
  return buildContourSvgPath([...right, ...left]);
}

export function deriveDimensionsFromEditableBodyOutline(
  outline?: EditableBodyOutline | null,
): DerivedOutlineDimensions {
  if (!outline || outline.points.length === 0) return {};
  const sorted = sortEditableOutlinePoints(outline.points);
  const bodyTopFromOverallMm = round1(sorted[0]?.y ?? 0);
  const bodyBottomFromOverallMm = round1(sorted[sorted.length - 1]?.y ?? bodyTopFromOverallMm);

  return {
    bodyTopFromOverallMm,
    bodyBottomFromOverallMm,
    diameterMm: widthForRole(sorted, "body") ?? widthForRole(sorted, "topOuter"),
    topOuterDiameterMm: widthForRole(sorted, "topOuter"),
    baseDiameterMm: widthForRole(sorted, "base"),
    shoulderDiameterMm: widthForRole(sorted, "shoulder"),
    taperUpperDiameterMm: widthForRole(sorted, "upperTaper"),
    taperLowerDiameterMm: widthForRole(sorted, "lowerTaper"),
    bevelDiameterMm: widthForRole(sorted, "bevel"),
  };
}

export function insertEditableOutlinePoint(
  outline: EditableBodyOutline,
  segmentIndex: number,
): EditableBodyOutline {
  const sorted = sortEditableOutlinePoints(outline.points);
  const current = sorted[segmentIndex];
  const next = sorted[(segmentIndex + 1) % sorted.length];
  if (!current || !next) return outline;
  const inserted: EditableBodyOutlinePoint = {
    id: makeId("custom"),
    x: round1((current.x + next.x) / 2),
    y: round1((current.y + next.y) / 2),
    inHandle: null,
    outHandle: null,
    pointType: "corner",
    role: "custom",
  };
  return {
    ...outline,
    points: sortEditableOutlinePoints([...outline.points, inserted]),
  };
}

export function removeEditableOutlinePoint(
  outline: EditableBodyOutline,
  pointId: string,
): EditableBodyOutline {
  if (outline.points.length <= 4) return outline;
  const nextPoints = outline.points.filter((point) => point.id !== pointId);
  if (nextPoints.length === outline.points.length) return outline;
  return {
    ...outline,
    points: sortEditableOutlinePoints(nextPoints),
  };
}

export function convertEditableOutlinePointType(
  outline: EditableBodyOutline,
  pointId: string,
  pointType: EditableOutlinePointType,
): EditableBodyOutline {
  return {
    ...outline,
    points: outline.points.map((point) => {
      if (point.id !== pointId) return point;
      return {
        ...point,
        pointType,
        inHandle: pointType === "corner" ? null : point.inHandle ?? { x: point.x, y: round1(point.y - 6) },
        outHandle: pointType === "corner" ? null : point.outHandle ?? { x: point.x, y: round1(point.y + 6) },
      };
    }),
  };
}
