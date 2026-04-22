import type { EditableBodyOutline } from "../types/productTemplate.ts";
import { resolveAuthoritativeEditableBodyOutlineContour } from "./editableBodyOutline.ts";

export interface BodyReferenceSvgQualityInput {
  points?: Array<{ x: number; y: number }>;
  pathSvg?: string;
  viewBox?: string;
  widthPx?: number;
  heightPx?: number;
  sourceHash?: string;
  label?: string;
  closed?: boolean;
  contourSource?:
    | "direct-contour"
    | "outline-points"
    | "source-contour"
    | "profile-points"
    | "path-svg"
    | "unavailable"
    | "unknown";
  boundsUnits?: "mm" | "source-px" | "unknown";
}

export interface BodyReferenceSvgQualityReport {
  status: "pass" | "warn" | "fail";
  contourSource:
    | "direct-contour"
    | "outline-points"
    | "source-contour"
    | "profile-points"
    | "path-svg"
    | "unavailable";
  boundsUnits: "mm" | "source-px" | "unknown";
  pointCount: number;
  segmentCount: number;
  closed: boolean;
  closeable: boolean;
  bounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
  viewBox?: string;
  sourceHash?: string;
  duplicatePointCount: number;
  nearDuplicatePointCount: number;
  tinySegmentCount: number;
  suspiciousSpikeCount: number;
  suspiciousJumpCount: number;
  expectedBridgeSegmentCount: number;
  aspectRatio?: number;
  warnings: string[];
  errors: string[];
}

export interface BodyReferenceSvgQualitySegmentAnnotation {
  kind: "expected-horizontal-bridge" | "suspicious-jump";
  segmentIndex: number;
  length: number;
  from: {
    x: number;
    y: number;
  };
  to: {
    x: number;
    y: number;
  };
}

export interface BodyReferenceSvgQualityVisualization {
  bounds?: BodyReferenceSvgQualityReport["bounds"];
  expectedBridgeSegments: BodyReferenceSvgQualitySegmentAnnotation[];
  suspiciousJumpSegments: BodyReferenceSvgQualitySegmentAnnotation[];
}

export const BODY_REFERENCE_SVG_QUALITY_THRESHOLDS = {
  exactDuplicateDistance: 0.000001,
  nearDuplicateDistanceRatio: 0.0005,
  nearDuplicateDistanceAbs: 0.05,
  tinySegmentRatio: 0.002,
  tinySegmentAbs: 0.2,
  suspiciousJumpRatio: 0.2,
  suspiciousJumpAbs: 12,
  suspiciousJumpMultiple: 8,
  expectedBridgeNearEdgeRatio: 0.03,
  expectedBridgeNearEdgeAbs: 2,
  expectedBridgeHorizontalToleranceRatio: 0.01,
  expectedBridgeHorizontalToleranceAbs: 1,
  expectedBridgeWidthSpanRatio: 0.7,
  expectedBridgeNeighborLengthRatioMax: 0.35,
  expectedBridgeVerticalToleranceRatio: 0.01,
  expectedBridgeVerticalToleranceAbs: 1,
  suspiciousSpikeAngleDeg: 18,
  suspiciousSpikeLengthMultiple: 2,
  closeableEndpointRatio: 0.002,
  closeableEndpointAbs: 1.5,
  extremeAspectRatioMin: 0.08,
  extremeAspectRatioMax: 6,
  nearZeroBounds: 0.01,
} as const;

type QualityPoint = { x: number; y: number };
type SegmentClassification = "normal" | "suspicious-jump" | "expected-horizontal-bridge";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeStringArray(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function parseLinearContourPathPoints(path: string | null): {
  points: QualityPoint[];
  closed: boolean;
} | null {
  if (!path) return null;
  const tokens = path.trim().split(/\s+/);
  const points: QualityPoint[] = [];
  let closed = false;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    if (token === "M" || token === "L") {
      const x = Number(tokens[index + 1]);
      const y = Number(tokens[index + 2]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      points.push({ x, y });
      index += 2;
      continue;
    }
    if (token === "Z") {
      closed = true;
      continue;
    }
    const x = Number(token);
    const y = Number(tokens[index + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    points.push({ x, y });
    index += 1;
  }
  return points.length >= 2 ? { points, closed } : null;
}

function isFinitePoint(point: { x: number; y: number } | null | undefined): point is QualityPoint {
  return Boolean(
    point &&
    typeof point.x === "number" &&
    Number.isFinite(point.x) &&
    typeof point.y === "number" &&
    Number.isFinite(point.y),
  );
}

function distance(left: QualityPoint, right: QualityPoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function isNearlyHorizontal(
  from: QualityPoint,
  to: QualityPoint,
  tolerance: number,
): boolean {
  return Math.abs(from.y - to.y) <= tolerance;
}

function isNearVertical(
  from: QualityPoint,
  to: QualityPoint,
  tolerance: number,
): boolean {
  const deltaX = Math.abs(from.x - to.x);
  const deltaY = Math.abs(from.y - to.y);
  return deltaX <= tolerance && deltaY >= deltaX;
}

function getBounds(points: readonly QualityPoint[]) {
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
    return undefined;
  }

  return {
    minX: round2(minX),
    minY: round2(minY),
    maxX: round2(maxX),
    maxY: round2(maxY),
    width: round2(maxX - minX),
    height: round2(maxY - minY),
  };
}

function median(values: number[]): number {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function buildSegmentLengths(points: readonly QualityPoint[], closed: boolean): number[] {
  if (points.length < 2) return [];
  const lengths: number[] = [];
  for (let index = 1; index < points.length; index += 1) {
    lengths.push(distance(points[index - 1]!, points[index]!));
  }
  if (closed && points.length > 2) {
    lengths.push(distance(points[points.length - 1]!, points[0]!));
  }
  return lengths;
}

function getSegmentEndpoints(
  points: readonly QualityPoint[],
  segmentIndex: number,
): { from: QualityPoint; to: QualityPoint } {
  const fromIndex = segmentIndex;
  const toIndex = (segmentIndex + 1) % points.length;
  return {
    from: points[fromIndex]!,
    to: points[toIndex]!,
  };
}

function isExpectedHorizontalBridgeSegment(args: {
  points: readonly QualityPoint[];
  segmentIndex: number;
  segmentLength: number;
  segmentLengths: readonly number[];
  bounds: NonNullable<ReturnType<typeof getBounds>>;
}): boolean {
  const { points, segmentIndex, segmentLength, segmentLengths, bounds } = args;
  if (points.length < 4 || segmentLengths.length !== points.length) return false;
  if (!(bounds.width > 0) || !(bounds.height > 0)) return false;

  const { from, to } = getSegmentEndpoints(points, segmentIndex);
  const previousPoint = points[(segmentIndex - 1 + points.length) % points.length]!;
  const nextPoint = points[(segmentIndex + 2) % points.length]!;
  const previousLength = segmentLengths[(segmentIndex - 1 + segmentLengths.length) % segmentLengths.length] ?? 0;
  const nextLength = segmentLengths[(segmentIndex + 1) % segmentLengths.length] ?? 0;

  const edgeTolerance = Math.max(
    BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.expectedBridgeNearEdgeAbs,
    bounds.height * BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.expectedBridgeNearEdgeRatio,
  );
  const horizontalTolerance = Math.max(
    BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.expectedBridgeHorizontalToleranceAbs,
    bounds.height * BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.expectedBridgeHorizontalToleranceRatio,
  );
  const verticalTolerance = Math.max(
    BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.expectedBridgeVerticalToleranceAbs,
    bounds.height * BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.expectedBridgeVerticalToleranceRatio,
  );

  if (!isNearlyHorizontal(from, to, horizontalTolerance)) return false;

  const averageY = (from.y + to.y) / 2;
  const nearTop = Math.abs(averageY - bounds.minY) <= edgeTolerance;
  const nearBottom = Math.abs(averageY - bounds.maxY) <= edgeTolerance;
  if (!nearTop && !nearBottom) return false;

  const horizontalSpan = Math.abs(to.x - from.x);
  if (horizontalSpan < bounds.width * BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.expectedBridgeWidthSpanRatio) {
    return false;
  }

  const centerX = bounds.minX + (bounds.width / 2);
  if (!(Math.min(from.x, to.x) <= centerX && Math.max(from.x, to.x) >= centerX)) {
    return false;
  }

  const neighborLengthMax = segmentLength * BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.expectedBridgeNeighborLengthRatioMax;
  if (!(previousLength > 0) || !(nextLength > 0)) return false;
  if (previousLength > neighborLengthMax || nextLength > neighborLengthMax) return false;

  if (!isNearVertical(previousPoint, from, verticalTolerance)) return false;
  if (!isNearVertical(to, nextPoint, verticalTolerance)) return false;

  return true;
}

function calculateAngleDegrees(
  previous: QualityPoint,
  current: QualityPoint,
  next: QualityPoint,
): number {
  const leftX = previous.x - current.x;
  const leftY = previous.y - current.y;
  const rightX = next.x - current.x;
  const rightY = next.y - current.y;
  const leftLength = Math.hypot(leftX, leftY);
  const rightLength = Math.hypot(rightX, rightY);
  if (!(leftLength > 0) || !(rightLength > 0)) return 180;
  const cosine = ((leftX * rightX) + (leftY * rightY)) / (leftLength * rightLength);
  const clamped = Math.min(1, Math.max(-1, cosine));
  return Math.acos(clamped) * (180 / Math.PI);
}

function createUnavailableReport(input: BodyReferenceSvgQualityInput, warning: string): BodyReferenceSvgQualityReport {
  return {
    status: "warn",
    contourSource: "unavailable",
    boundsUnits: input.boundsUnits ?? "unknown",
    pointCount: 0,
    segmentCount: 0,
    closed: Boolean(input.closed),
    closeable: false,
    bounds: undefined,
    viewBox: input.viewBox,
    sourceHash: input.sourceHash,
    duplicatePointCount: 0,
    nearDuplicatePointCount: 0,
    tinySegmentCount: 0,
    suspiciousSpikeCount: 0,
    suspiciousJumpCount: 0,
    expectedBridgeSegmentCount: 0,
    aspectRatio: undefined,
    warnings: [warning],
    errors: [],
  };
}

function resolveVisualizationInput(input: BodyReferenceSvgQualityInput): {
  usablePoints: QualityPoint[];
  closed: boolean;
  bounds: NonNullable<ReturnType<typeof getBounds>>;
  segmentLengths: number[];
} | null {
  let parsedClosed = input.closed;
  let usablePoints: QualityPoint[] = [];

  if (input.points && input.points.length > 0) {
    const invalidPoint = input.points.find((point) => !isFinitePoint(point));
    if (invalidPoint) {
      return null;
    }
    usablePoints = input.points.map((point) => ({ x: point.x, y: point.y }));
  } else if (input.pathSvg?.trim()) {
    const parsed = parseLinearContourPathPoints(input.pathSvg);
    if (!parsed) return null;
    usablePoints = parsed.points;
    parsedClosed = input.closed ?? parsed.closed;
  }

  if (usablePoints.length < 2) return null;
  const bounds = getBounds(usablePoints);
  if (!bounds) return null;

  const diagonal = Math.max(1, Math.hypot(bounds.width, bounds.height));
  const nearDuplicateThreshold = Math.max(
    BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.nearDuplicateDistanceAbs,
    diagonal * BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.nearDuplicateDistanceRatio,
  );
  const closed = (() => {
    if (typeof parsedClosed === "boolean") return parsedClosed;
    if (usablePoints.length < 3) return false;
    return distance(usablePoints[0]!, usablePoints[usablePoints.length - 1]!) <= nearDuplicateThreshold;
  })();

  return {
    usablePoints,
    closed,
    bounds,
    segmentLengths: buildSegmentLengths(usablePoints, closed),
  };
}

export function buildBodyReferenceSvgQualityReport(
  input: BodyReferenceSvgQualityInput,
): BodyReferenceSvgQualityReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  let contourSource: BodyReferenceSvgQualityReport["contourSource"] =
    input.contourSource && input.contourSource !== "unknown"
      ? input.contourSource
      : (input.points?.length ? "profile-points" : "unavailable");
  let parsedClosed = input.closed;
  let usablePoints: QualityPoint[] = [];

  if (input.points && input.points.length > 0) {
    const invalidPoint = input.points.find((point) => !isFinitePoint(point));
    if (invalidPoint) {
      errors.push("Contour contains an invalid numeric point.");
    } else {
      usablePoints = input.points.map((point) => ({ x: point.x, y: point.y }));
    }
  } else if (input.pathSvg?.trim()) {
    const parsed = parseLinearContourPathPoints(input.pathSvg);
    if (!parsed) {
      return createUnavailableReport(
        input,
        "SVG path quality unavailable because sampled contour points were not provided.",
      );
    }
    contourSource =
      input.contourSource && input.contourSource !== "unknown"
        ? input.contourSource
        : "path-svg";
    parsedClosed = input.closed ?? parsed.closed;
    usablePoints = parsed.points;
  }

  if (usablePoints.length === 0 && errors.length === 0) {
    errors.push("Approved contour is missing.");
  }

  const bounds = usablePoints.length > 0 ? getBounds(usablePoints) : undefined;
  const diagonal = bounds
    ? Math.max(1, Math.hypot(bounds.width, bounds.height))
    : 1;
  const nearDuplicateThreshold = Math.max(
    BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.nearDuplicateDistanceAbs,
    diagonal * BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.nearDuplicateDistanceRatio,
  );
  const tinySegmentThreshold = Math.max(
    BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.tinySegmentAbs,
    diagonal * BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.tinySegmentRatio,
  );
  const closeableThreshold = Math.max(
    BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.closeableEndpointAbs,
    diagonal * BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.closeableEndpointRatio,
  );

  const closed = (() => {
    if (typeof parsedClosed === "boolean") return parsedClosed;
    if (usablePoints.length < 3) return false;
    return distance(usablePoints[0]!, usablePoints[usablePoints.length - 1]!)
      <= nearDuplicateThreshold;
  })();
  const endpointDistance =
    usablePoints.length >= 2
      ? distance(usablePoints[0]!, usablePoints[usablePoints.length - 1]!)
      : Number.POSITIVE_INFINITY;
  const closeable = !closed && usablePoints.length >= 3 && endpointDistance <= closeableThreshold;

  if (usablePoints.length > 0 && usablePoints.length < 3) {
    errors.push("Contour has fewer than 3 usable points.");
  }

  if (bounds && (
    bounds.width <= BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.nearZeroBounds ||
    bounds.height <= BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.nearZeroBounds
  )) {
    errors.push("Contour bounds are zero or near-zero.");
  }

  if (usablePoints.length >= 3 && !closed) {
    warnings.push(
      closeable
        ? "Contour is open but endpoints are close enough to close automatically."
        : "Contour is open.",
    );
  }

  const segmentLengths = buildSegmentLengths(usablePoints, closed);
  const nonZeroSegmentLengths = segmentLengths.filter((length) => length > BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.exactDuplicateDistance);
  const medianSegmentLength = median(nonZeroSegmentLengths);
  const duplicatePointCount = segmentLengths.filter(
    (length) => length <= BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.exactDuplicateDistance,
  ).length;
  const nearDuplicatePointCount = segmentLengths.filter((length) => (
    length > BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.exactDuplicateDistance &&
    length <= nearDuplicateThreshold
  )).length;
  const tinySegmentCount = segmentLengths.filter((length) => length <= tinySegmentThreshold).length;
  const suspiciousJumpBaseThreshold = Math.max(
    BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.suspiciousJumpAbs,
    diagonal * BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.suspiciousJumpRatio,
  );
  let suspiciousJumpCount = 0;
  let expectedBridgeSegmentCount = 0;
  for (let index = 0; index < segmentLengths.length; index += 1) {
    const length = segmentLengths[index]!;
    if (length < suspiciousJumpBaseThreshold) continue;
    const previousLength = segmentLengths[(index - 1 + segmentLengths.length) % segmentLengths.length] ?? 0;
    const nextLength = segmentLengths[(index + 1) % segmentLengths.length] ?? 0;
    const localRatioSuspicious =
      (previousLength > 0 && length >= previousLength * BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.suspiciousJumpMultiple) ||
      (nextLength > 0 && length >= nextLength * BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.suspiciousJumpMultiple);
    const globalRatioSuspicious =
      medianSegmentLength > 0 &&
      length >= medianSegmentLength * BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.suspiciousJumpMultiple;
    const classification: SegmentClassification =
      (localRatioSuspicious || globalRatioSuspicious)
        ? (closed && bounds && isExpectedHorizontalBridgeSegment({
            points: usablePoints,
            segmentIndex: index,
            segmentLength: length,
            segmentLengths,
            bounds,
          })
            ? "expected-horizontal-bridge"
            : "suspicious-jump")
        : "normal";
    if (classification === "expected-horizontal-bridge") {
      expectedBridgeSegmentCount += 1;
      continue;
    }
    if (classification === "suspicious-jump") {
      suspiciousJumpCount += 1;
    }
  }

  let suspiciousSpikeCount = 0;
  if (usablePoints.length >= 3) {
    const pointIndices = closed
      ? usablePoints.map((_, index) => index)
      : usablePoints.map((_, index) => index).slice(1, -1);
    const spikeLengthThreshold =
      tinySegmentThreshold * BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.suspiciousSpikeLengthMultiple;

    for (const index of pointIndices) {
      const previous = usablePoints[(index - 1 + usablePoints.length) % usablePoints.length]!;
      const current = usablePoints[index]!;
      const next = usablePoints[(index + 1) % usablePoints.length]!;
      const previousLength = distance(previous, current);
      const nextLength = distance(current, next);
      if (previousLength < spikeLengthThreshold || nextLength < spikeLengthThreshold) {
        continue;
      }
      const angleDegrees = calculateAngleDegrees(previous, current, next);
      if (angleDegrees <= BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.suspiciousSpikeAngleDeg) {
        suspiciousSpikeCount += 1;
      }
    }
  }

  const aspectRatio = bounds && bounds.height > 0
    ? round2(bounds.width / bounds.height)
    : undefined;

  if (duplicatePointCount > 0) {
    warnings.push(`Contour contains ${duplicatePointCount} duplicate adjacent point(s).`);
  }
  if (nearDuplicatePointCount > 0) {
    warnings.push(`Contour contains ${nearDuplicatePointCount} near-duplicate adjacent point pair(s).`);
  }
  if (tinySegmentCount > 0) {
    warnings.push(`Contour contains ${tinySegmentCount} tiny segment(s).`);
  }
  if (suspiciousJumpCount > 0) {
    warnings.push(`Contour contains ${suspiciousJumpCount} suspicious large jump segment(s).`);
  }
  if (suspiciousSpikeCount > 0) {
    warnings.push(`Contour contains ${suspiciousSpikeCount} suspicious spike point(s).`);
  }
  if (
    typeof aspectRatio === "number" &&
    (
      aspectRatio <= BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.extremeAspectRatioMin ||
      aspectRatio >= BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.extremeAspectRatioMax
    )
  ) {
    warnings.push(`Contour aspect ratio ${aspectRatio} looks suspicious.`);
  }

  return {
    status: errors.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass",
    contourSource,
    boundsUnits: input.boundsUnits ?? "unknown",
    pointCount: usablePoints.length,
    segmentCount: segmentLengths.length,
    closed,
    closeable,
    bounds,
    viewBox: input.viewBox,
    sourceHash: input.sourceHash,
    duplicatePointCount,
    nearDuplicatePointCount,
    tinySegmentCount,
    suspiciousSpikeCount,
    suspiciousJumpCount,
    expectedBridgeSegmentCount,
    aspectRatio,
    warnings: normalizeStringArray(warnings),
    errors: normalizeStringArray(errors),
  };
}

export function buildBodyReferenceSvgQualityVisualization(
  input: BodyReferenceSvgQualityInput,
): BodyReferenceSvgQualityVisualization {
  const geometry = resolveVisualizationInput(input);
  if (!geometry) {
    return {
      bounds: undefined,
      expectedBridgeSegments: [],
      suspiciousJumpSegments: [],
    };
  }

  const { usablePoints, closed, bounds, segmentLengths } = geometry;
  if (segmentLengths.length === 0) {
    return {
      bounds,
      expectedBridgeSegments: [],
      suspiciousJumpSegments: [],
    };
  }

  const diagonal = Math.max(1, Math.hypot(bounds.width, bounds.height));
  const nonZeroSegmentLengths = segmentLengths.filter(
    (length) => length > BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.exactDuplicateDistance,
  );
  const medianSegmentLength = median(nonZeroSegmentLengths);
  const suspiciousJumpBaseThreshold = Math.max(
    BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.suspiciousJumpAbs,
    diagonal * BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.suspiciousJumpRatio,
  );

  const expectedBridgeSegments: BodyReferenceSvgQualitySegmentAnnotation[] = [];
  const suspiciousJumpSegments: BodyReferenceSvgQualitySegmentAnnotation[] = [];

  for (let index = 0; index < segmentLengths.length; index += 1) {
    const length = segmentLengths[index]!;
    if (length < suspiciousJumpBaseThreshold) continue;
    const previousLength = segmentLengths[(index - 1 + segmentLengths.length) % segmentLengths.length] ?? 0;
    const nextLength = segmentLengths[(index + 1) % segmentLengths.length] ?? 0;
    const localRatioSuspicious =
      (previousLength > 0 && length >= previousLength * BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.suspiciousJumpMultiple) ||
      (nextLength > 0 && length >= nextLength * BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.suspiciousJumpMultiple);
    const globalRatioSuspicious =
      medianSegmentLength > 0 &&
      length >= medianSegmentLength * BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.suspiciousJumpMultiple;
    if (!localRatioSuspicious && !globalRatioSuspicious) continue;

    const { from, to } = getSegmentEndpoints(usablePoints, index);
    const annotation: BodyReferenceSvgQualitySegmentAnnotation = {
      kind:
        closed && isExpectedHorizontalBridgeSegment({
          points: usablePoints,
          segmentIndex: index,
          segmentLength: length,
          segmentLengths,
          bounds,
        })
          ? "expected-horizontal-bridge"
          : "suspicious-jump",
      segmentIndex: index,
      length: round2(length),
      from: { x: round2(from.x), y: round2(from.y) },
      to: { x: round2(to.x), y: round2(to.y) },
    };

    if (annotation.kind === "expected-horizontal-bridge") {
      expectedBridgeSegments.push(annotation);
    } else {
      suspiciousJumpSegments.push(annotation);
    }
  }

  return {
    bounds,
    expectedBridgeSegments,
    suspiciousJumpSegments,
  };
}

export function buildBodyReferenceSvgQualityReportFromOutline(args: {
  outline: EditableBodyOutline | null | undefined;
  sourceHash?: string;
  label?: string;
}): BodyReferenceSvgQualityReport {
  const outline = args.outline;
  const sourceViewport = outline?.sourceContourViewport;
  const viewBox = sourceViewport
    ? `${round2(sourceViewport.minX)} ${round2(sourceViewport.minY)} ${round2(sourceViewport.width)} ${round2(sourceViewport.height)}`
    : undefined;

  if (!outline) {
    return buildBodyReferenceSvgQualityReport({
      viewBox,
      widthPx: sourceViewport?.width,
      heightPx: sourceViewport?.height,
      sourceHash: args.sourceHash,
      label: args.label,
      closed: false,
      contourSource: "unavailable",
      boundsUnits: "unknown",
    });
  }

  const authoritativeContour = resolveAuthoritativeEditableBodyOutlineContour(outline);
  const usesAuthoritativeOutlinePoints =
    outline.sourceContourMode === "body-only" &&
    (!outline.sourceContour || outline.sourceContour.length < 3) &&
    Boolean(outline.directContour && outline.directContour.length >= 3) &&
    authoritativeContour != null &&
    authoritativeContour !== outline.directContour;
  if (usesAuthoritativeOutlinePoints && authoritativeContour?.length) {
    return buildBodyReferenceSvgQualityReport({
      points: authoritativeContour,
      viewBox,
      widthPx: sourceViewport?.width,
      heightPx: sourceViewport?.height,
      sourceHash: args.sourceHash,
      label: args.label,
      closed: outline.closed,
      contourSource:
        outline.sourceContourMode === "body-only" &&
        (!outline.sourceContour || outline.sourceContour.length < 3)
          ? "outline-points"
          : "direct-contour",
      boundsUnits: "mm",
    });
  }

  if (outline.directContour?.length) {
    return buildBodyReferenceSvgQualityReport({
      points: outline.directContour,
      viewBox,
      widthPx: sourceViewport?.width,
      heightPx: sourceViewport?.height,
      sourceHash: args.sourceHash,
      label: args.label,
      closed: outline.closed,
      contourSource: "direct-contour",
      boundsUnits: "mm",
    });
  }

  if (outline.sourceContour?.length) {
    return buildBodyReferenceSvgQualityReport({
      points: outline.sourceContour,
      viewBox,
      widthPx: sourceViewport?.width,
      heightPx: sourceViewport?.height,
      sourceHash: args.sourceHash,
      label: args.label,
      closed: outline.closed,
      contourSource: "source-contour",
      boundsUnits: "source-px",
    });
  }

  if (outline.points.length > 0) {
    return buildBodyReferenceSvgQualityReport({
      points: outline.points.map((point) => ({ x: point.x, y: point.y })),
      viewBox,
      widthPx: sourceViewport?.width,
      heightPx: sourceViewport?.height,
      sourceHash: args.sourceHash,
      label: args.label,
      closed: outline.closed,
      contourSource: "profile-points",
      boundsUnits: "mm",
    });
  }

  return buildBodyReferenceSvgQualityReport({
    viewBox,
    widthPx: sourceViewport?.width,
    heightPx: sourceViewport?.height,
    sourceHash: args.sourceHash,
    label: args.label,
    closed: outline.closed,
    contourSource: "unavailable",
    boundsUnits: "unknown",
  });
}

export function buildBodyReferenceSvgQualityVisualizationFromOutline(args: {
  outline: EditableBodyOutline | null | undefined;
}): BodyReferenceSvgQualityVisualization {
  const outline = args.outline;
  if (!outline) {
    return {
      bounds: undefined,
      expectedBridgeSegments: [],
      suspiciousJumpSegments: [],
    };
  }

  const authoritativeContour = resolveAuthoritativeEditableBodyOutlineContour(outline);
  const usesAuthoritativeOutlinePoints =
    outline.sourceContourMode === "body-only" &&
    (!outline.sourceContour || outline.sourceContour.length < 3) &&
    Boolean(outline.directContour && outline.directContour.length >= 3) &&
    authoritativeContour != null &&
    authoritativeContour !== outline.directContour;
  if (usesAuthoritativeOutlinePoints && authoritativeContour?.length) {
    return buildBodyReferenceSvgQualityVisualization({
      points: authoritativeContour,
      closed: outline.closed,
    });
  }

  if (outline.directContour?.length) {
    return buildBodyReferenceSvgQualityVisualization({
      points: outline.directContour,
      closed: outline.closed,
    });
  }

  if (outline.sourceContour?.length) {
    return buildBodyReferenceSvgQualityVisualization({
      points: outline.sourceContour,
      closed: outline.closed,
    });
  }

  if (outline.points.length > 0) {
    return buildBodyReferenceSvgQualityVisualization({
      points: outline.points.map((point) => ({ x: point.x, y: point.y })),
      closed: outline.closed,
    });
  }

  return {
    bounds: undefined,
    expectedBridgeSegments: [],
    suspiciousJumpSegments: [],
  };
}
