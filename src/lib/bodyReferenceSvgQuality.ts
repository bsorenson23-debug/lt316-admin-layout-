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
  appearsBodyOnly?: boolean;
  bodyOnlyConfidence?: "high" | "medium" | "low";
  bodyOnlyReasonCodes?: string[];
  warnings: string[];
  errors: string[];
}

export interface BodyReferenceSvgCutoutLineageInput {
  hasAcceptedCutout?: boolean;
  hasReviewedGlb?: boolean;
  acceptedSourceHash?: string | null;
  correctedDraftSourceHash?: string | null;
  reviewedGlbSourceHash?: string | null;
  svgQualityStatus?: BodyReferenceSvgQualityReport["status"] | null;
}

export interface BodyReferenceSvgCutoutLineageReport {
  status:
    | "missing-accepted-cutout"
    | "quality-failed"
    | "draft-pending"
    | "reviewed-glb-missing"
    | "reviewed-glb-unknown"
    | "reviewed-glb-stale"
    | "reviewed-glb-current";
  acceptedCutoutAuthoritative: boolean;
  correctedDraftAuthoritative: false;
  hasPendingCorrectedDraft: boolean;
  requiresReviewedGlbRegeneration: boolean;
  blocksReviewedGlbGeneration: boolean;
  acceptedSourceHash?: string;
  correctedDraftSourceHash?: string;
  reviewedGlbSourceHash?: string;
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

export interface BodyReferenceSvgQualityOperatorSummary {
  statusLabel: "PASS" | "WARN" | "FAIL" | "UNKNOWN";
  statusTone: "pass" | "warn" | "fail" | "unknown";
  bodyOnlyConfidenceLabel: string;
  bodyOnlySummary: string;
  reasonLabels: string[];
  generationBlocked: boolean;
  generationBlockedReason?: string;
  operatorFixHint?: string;
}

export interface BodyReferenceSvgCutoutLineageOperatorSummary {
  stateLabel: string;
  acceptedSourceLabel: string;
  correctedDraftLabel: string;
  reviewedGlbLabel: string;
  nextActionLabel: string;
  callToActionTone: "neutral" | "warn" | "fail";
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

function normalizeOptionalHash(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function getBodyReferenceSvgQualityStatusLabel(
  status: BodyReferenceSvgQualityReport["status"] | null | undefined,
): BodyReferenceSvgQualityOperatorSummary["statusLabel"] {
  if (status === "pass") return "PASS";
  if (status === "warn") return "WARN";
  if (status === "fail") return "FAIL";
  return "UNKNOWN";
}

export function formatBodyReferenceSvgQualityReasonCode(code: string): string {
  switch (code) {
    case "quality-failed":
      return "SVG quality checks are failing.";
    case "contour-unavailable":
      return "No usable body contour is available.";
    case "too-few-points":
      return "Contour has fewer than 3 usable points.";
    case "invalid-bounds":
      return "Contour bounds are missing or invalid.";
    case "open-contour":
      return "Contour is open and cannot close cleanly.";
    case "open-closeable-contour":
      return "Contour is open but closeable; close it before final review.";
    case "suspicious-jump":
      return "Contour has a suspicious jump segment.";
    case "suspicious-spike":
      return "Contour has a suspicious spike point.";
    case "extreme-aspect-ratio":
      return "Contour aspect ratio does not look like a tumbler body.";
    case "duplicate-points":
      return "Contour includes duplicate adjacent points.";
    case "near-duplicate-points":
      return "Contour includes near-duplicate adjacent points.";
    case "tiny-segments":
      return "Contour includes tiny segments that may chatter during generation.";
    default:
      return code.replace(/-/g, " ");
  }
}

export function summarizeBodyReferenceSvgQualityForOperator(
  report: BodyReferenceSvgQualityReport | null | undefined,
): BodyReferenceSvgQualityOperatorSummary {
  if (!report) {
    return {
      statusLabel: "UNKNOWN",
      statusTone: "unknown",
      bodyOnlyConfidenceLabel: "unknown",
      bodyOnlySummary: "Body-only confidence is unavailable until a cutout is staged.",
      reasonLabels: ["No SVG quality report is available."],
      generationBlocked: true,
      generationBlockedReason: "Generation is blocked because SVG quality is unavailable.",
      operatorFixHint: "Run detection or accept a BODY REFERENCE cutout before generating BODY CUTOUT QA.",
    };
  }

  const statusLabel = getBodyReferenceSvgQualityStatusLabel(report.status);
  const reasonLabels = normalizeStringArray([
    ...(report.bodyOnlyReasonCodes ?? []).map(formatBodyReferenceSvgQualityReasonCode),
    ...report.errors,
    ...report.warnings,
  ]);
  const confidence = report.bodyOnlyConfidence ?? "unknown";
  const bodyOnlySummary = report.appearsBodyOnly
    ? `Looks body-only with ${confidence} confidence.`
    : `Does not yet look body-only; confidence is ${confidence}.`;
  const generationBlocked = report.status === "fail" || !report.appearsBodyOnly;

  return {
    statusLabel,
    statusTone: report.status,
    bodyOnlyConfidenceLabel: confidence,
    bodyOnlySummary,
    reasonLabels,
    generationBlocked,
    generationBlockedReason: generationBlocked
      ? "Generation is blocked until the accepted cutout is body-only and SVG quality is not FAIL."
      : undefined,
    operatorFixHint: generationBlocked
      ? "Fix the listed contour issues in cutout fine-tune, accept the corrected cutout, then regenerate BODY CUTOUT QA."
      : report.status === "warn"
        ? "Review the warnings before regenerating; BODY CUTOUT QA can continue when the operator accepts the risk."
        : "No SVG cutout fix is required.",
  };
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

function isExpectedRoundedBottomClosureSegment(args: {
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

  if (!isNearlyHorizontal(from, to, horizontalTolerance)) return false;

  const averageY = (from.y + to.y) / 2;
  if (Math.abs(averageY - bounds.maxY) > edgeTolerance) return false;

  const horizontalSpan = Math.abs(to.x - from.x);
  if (horizontalSpan < Math.max(8, bounds.width * 0.25)) return false;

  const centerX = bounds.minX + (bounds.width / 2);
  if (!(Math.min(from.x, to.x) <= centerX && Math.max(from.x, to.x) >= centerX)) {
    return false;
  }

  const neighborLengthMax = Math.max(segmentLength * 0.75, bounds.height * 0.08);
  if (!(previousLength > 0) || !(nextLength > 0)) return false;
  if (previousLength > neighborLengthMax || nextLength > neighborLengthMax) return false;

  // Rounded tumbler bases close through short sloped sidewall segments, not vertical sidewalls.
  if (!(previousPoint.y < from.y && nextPoint.y < to.y)) return false;
  const fromIsRightSide = from.x > to.x;
  const outwardTolerance = Math.max(1, bounds.width * 0.02);
  if (fromIsRightSide) {
    return previousPoint.x >= from.x - outwardTolerance && nextPoint.x <= to.x + outwardTolerance;
  }
  return previousPoint.x <= from.x + outwardTolerance && nextPoint.x >= to.x - outwardTolerance;
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
    appearsBodyOnly: false,
    bodyOnlyConfidence: "low",
    bodyOnlyReasonCodes: ["contour-unavailable"],
    warnings: [warning],
    errors: [],
  };
}

function assessBodyOnlyShape(args: {
  status: BodyReferenceSvgQualityReport["status"];
  contourSource: BodyReferenceSvgQualityReport["contourSource"];
  pointCount: number;
  closed: boolean;
  closeable: boolean;
  bounds: BodyReferenceSvgQualityReport["bounds"];
  aspectRatio?: number;
  duplicatePointCount: number;
  nearDuplicatePointCount: number;
  tinySegmentCount: number;
  suspiciousJumpCount: number;
  suspiciousSpikeCount: number;
}): Pick<BodyReferenceSvgQualityReport, "appearsBodyOnly" | "bodyOnlyConfidence" | "bodyOnlyReasonCodes"> {
  const blockingReasons: string[] = [];
  const cautionReasons: string[] = [];

  if (args.status === "fail") blockingReasons.push("quality-failed");
  if (args.contourSource === "unavailable") blockingReasons.push("contour-unavailable");
  if (args.pointCount < 3) blockingReasons.push("too-few-points");
  if (!args.bounds || args.bounds.width <= 0 || args.bounds.height <= 0) {
    blockingReasons.push("invalid-bounds");
  }
  if (!args.closed) {
    if (args.closeable) {
      cautionReasons.push("open-closeable-contour");
    } else {
      blockingReasons.push("open-contour");
    }
  }
  if (args.suspiciousJumpCount > 0) blockingReasons.push("suspicious-jump");
  if (args.suspiciousSpikeCount > 0) blockingReasons.push("suspicious-spike");
  if (
    typeof args.aspectRatio === "number" &&
    (
      args.aspectRatio <= BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.extremeAspectRatioMin ||
      args.aspectRatio >= BODY_REFERENCE_SVG_QUALITY_THRESHOLDS.extremeAspectRatioMax
    )
  ) {
    blockingReasons.push("extreme-aspect-ratio");
  }
  if (args.duplicatePointCount > 0) cautionReasons.push("duplicate-points");
  if (args.nearDuplicatePointCount > 0) cautionReasons.push("near-duplicate-points");
  if (args.tinySegmentCount > 0) cautionReasons.push("tiny-segments");

  if (blockingReasons.length > 0) {
    return {
      appearsBodyOnly: false,
      bodyOnlyConfidence: "low",
      bodyOnlyReasonCodes: normalizeStringArray([...blockingReasons, ...cautionReasons]),
    };
  }

  return {
    appearsBodyOnly: true,
    bodyOnlyConfidence: cautionReasons.length > 0 ? "medium" : "high",
    bodyOnlyReasonCodes: normalizeStringArray(cautionReasons),
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
  const expectedBridgeSegmentIndices = new Set<number>();
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
        ? (closed && bounds && (
            isExpectedHorizontalBridgeSegment({
              points: usablePoints,
              segmentIndex: index,
              segmentLength: length,
              segmentLengths,
              bounds,
            }) ||
            isExpectedRoundedBottomClosureSegment({
            points: usablePoints,
            segmentIndex: index,
            segmentLength: length,
            segmentLengths,
            bounds,
            })
          )
            ? "expected-horizontal-bridge"
            : "suspicious-jump")
        : "normal";
    if (classification === "expected-horizontal-bridge") {
      expectedBridgeSegmentCount += 1;
      expectedBridgeSegmentIndices.add(index);
      continue;
    }
    if (classification === "suspicious-jump") {
      suspiciousJumpCount += 1;
    }
  }

  if (closed && bounds && expectedBridgeSegmentCount < 2) {
    for (let index = 0; index < segmentLengths.length; index += 1) {
      if (expectedBridgeSegmentIndices.has(index)) continue;
      const length = segmentLengths[index]!;
      if (
        isExpectedRoundedBottomClosureSegment({
          points: usablePoints,
          segmentIndex: index,
          segmentLength: length,
          segmentLengths,
          bounds,
        })
      ) {
        expectedBridgeSegmentCount += 1;
        expectedBridgeSegmentIndices.add(index);
      }
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

  const bodyOnlyAssessment = assessBodyOnlyShape({
    status: errors.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass",
    contourSource,
    pointCount: usablePoints.length,
    closed,
    closeable,
    bounds,
    aspectRatio,
    duplicatePointCount,
    nearDuplicatePointCount,
    tinySegmentCount,
    suspiciousJumpCount,
    suspiciousSpikeCount,
  });

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
    ...bodyOnlyAssessment,
    warnings: normalizeStringArray(warnings),
    errors: normalizeStringArray(errors),
  };
}

export function summarizeBodyReferenceSvgCutoutLineage(
  input: BodyReferenceSvgCutoutLineageInput,
): BodyReferenceSvgCutoutLineageReport {
  const acceptedSourceHash = normalizeOptionalHash(input.acceptedSourceHash);
  const correctedDraftSourceHash = normalizeOptionalHash(input.correctedDraftSourceHash);
  const reviewedGlbSourceHash = normalizeOptionalHash(input.reviewedGlbSourceHash);
  const hasAcceptedCutout = Boolean(input.hasAcceptedCutout) && Boolean(acceptedSourceHash);
  const hasReviewedGlb = Boolean(input.hasReviewedGlb);
  const hasPendingCorrectedDraft = Boolean(
    hasAcceptedCutout &&
    correctedDraftSourceHash &&
    correctedDraftSourceHash !== acceptedSourceHash,
  );

  const base = {
    acceptedCutoutAuthoritative: hasAcceptedCutout,
    correctedDraftAuthoritative: false as const,
    hasPendingCorrectedDraft,
    acceptedSourceHash,
    correctedDraftSourceHash,
    reviewedGlbSourceHash,
  };

  if (!hasAcceptedCutout) {
    return {
      ...base,
      status: "missing-accepted-cutout",
      acceptedCutoutAuthoritative: false,
      requiresReviewedGlbRegeneration: false,
      blocksReviewedGlbGeneration: true,
      warnings: [],
      errors: ["Accepted BODY REFERENCE SVG cutout is missing."],
    };
  }

  if (input.svgQualityStatus === "fail") {
    return {
      ...base,
      status: "quality-failed",
      requiresReviewedGlbRegeneration: false,
      blocksReviewedGlbGeneration: true,
      warnings: [],
      errors: ["Accepted BODY REFERENCE SVG cutout quality is failing."],
    };
  }

  if (hasPendingCorrectedDraft) {
    return {
      ...base,
      status: "draft-pending",
      requiresReviewedGlbRegeneration: false,
      blocksReviewedGlbGeneration: true,
      warnings: ["Corrected cutout draft is pending acceptance and is not authoritative yet."],
      errors: [],
    };
  }

  const qualityWarnings =
    input.svgQualityStatus === "warn"
      ? ["Accepted BODY REFERENCE SVG cutout has quality warnings."]
      : [];

  if (!hasReviewedGlb) {
    return {
      ...base,
      status: "reviewed-glb-missing",
      requiresReviewedGlbRegeneration: true,
      blocksReviewedGlbGeneration: false,
      warnings: qualityWarnings,
      errors: [],
    };
  }

  if (!reviewedGlbSourceHash) {
    return {
      ...base,
      status: "reviewed-glb-unknown",
      requiresReviewedGlbRegeneration: true,
      blocksReviewedGlbGeneration: false,
      warnings: [
        ...qualityWarnings,
        "Reviewed BODY CUTOUT QA GLB source hash is unavailable; freshness cannot be trusted.",
      ],
      errors: [],
    };
  }

  if (reviewedGlbSourceHash !== acceptedSourceHash) {
    return {
      ...base,
      status: "reviewed-glb-stale",
      requiresReviewedGlbRegeneration: true,
      blocksReviewedGlbGeneration: false,
      warnings: [
        ...qualityWarnings,
        "Accepted BODY REFERENCE SVG cutout is newer than the reviewed BODY CUTOUT QA GLB.",
      ],
      errors: [],
    };
  }

  return {
    ...base,
    status: "reviewed-glb-current",
    requiresReviewedGlbRegeneration: false,
    blocksReviewedGlbGeneration: false,
    warnings: qualityWarnings,
    errors: [],
  };
}

export function summarizeBodyReferenceSvgCutoutLineageForOperator(
  lineage: BodyReferenceSvgCutoutLineageReport,
): BodyReferenceSvgCutoutLineageOperatorSummary {
  switch (lineage.status) {
    case "missing-accepted-cutout":
      return {
        stateLabel: "Accepted cutout missing",
        acceptedSourceLabel: "No accepted BODY REFERENCE cutout yet.",
        correctedDraftLabel: "No corrected draft is authoritative.",
        reviewedGlbLabel: "Reviewed BODY CUTOUT QA GLB cannot be generated yet.",
        nextActionLabel: "Accept a BODY REFERENCE cutout first.",
        callToActionTone: "fail",
      };
    case "quality-failed":
      return {
        stateLabel: "SVG quality failed",
        acceptedSourceLabel: "Accepted source exists, but it is not safe for BODY CUTOUT QA generation.",
        correctedDraftLabel: "Corrected draft stays pending until accepted.",
        reviewedGlbLabel: "Reviewed BODY CUTOUT QA GLB generation is blocked.",
        nextActionLabel: "Fix SVG quality, accept the corrected cutout, then regenerate.",
        callToActionTone: "fail",
      };
    case "draft-pending":
      return {
        stateLabel: "Corrected draft pending",
        acceptedSourceLabel: "Accepted source remains authoritative.",
        correctedDraftLabel: "Corrected draft is pending and is not authoritative.",
        reviewedGlbLabel: "Reviewed GLB still follows the last accepted source.",
        nextActionLabel: "Accept corrected cutout before regenerating BODY CUTOUT QA.",
        callToActionTone: "warn",
      };
    case "reviewed-glb-missing":
      return {
        stateLabel: "Reviewed GLB missing",
        acceptedSourceLabel: "Accepted cutout is authoritative.",
        correctedDraftLabel: "No authoritative corrected draft is active.",
        reviewedGlbLabel: "No reviewed BODY CUTOUT QA GLB has been generated.",
        nextActionLabel: "Generate BODY CUTOUT QA GLB.",
        callToActionTone: "warn",
      };
    case "reviewed-glb-unknown":
      return {
        stateLabel: "Reviewed GLB freshness unknown",
        acceptedSourceLabel: "Accepted cutout is authoritative.",
        correctedDraftLabel: "No authoritative corrected draft is active.",
        reviewedGlbLabel: "Reviewed GLB source hash is unavailable.",
        nextActionLabel: "Regenerate BODY CUTOUT QA GLB so freshness can be trusted.",
        callToActionTone: "warn",
      };
    case "reviewed-glb-stale":
      return {
        stateLabel: "Reviewed GLB stale",
        acceptedSourceLabel: "Accepted cutout is authoritative and newer than the reviewed GLB.",
        correctedDraftLabel: "No pending draft is authoritative.",
        reviewedGlbLabel: "Reviewed BODY CUTOUT QA GLB is stale.",
        nextActionLabel: "Regenerate BODY CUTOUT QA GLB from the accepted cutout.",
        callToActionTone: "warn",
      };
    case "reviewed-glb-current":
      return {
        stateLabel: "Reviewed GLB current",
        acceptedSourceLabel: "Accepted cutout is authoritative.",
        correctedDraftLabel: "No pending draft is authoritative.",
        reviewedGlbLabel: "Reviewed BODY CUTOUT QA GLB matches the accepted source.",
        nextActionLabel: "No regeneration required.",
        callToActionTone: "neutral",
      };
  }
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
  const expectedBridgeSegmentIndices = new Set<number>();

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
    const isExpectedBridge =
      closed && (
        isExpectedHorizontalBridgeSegment({
          points: usablePoints,
          segmentIndex: index,
          segmentLength: length,
          segmentLengths,
          bounds,
        }) ||
        isExpectedRoundedBottomClosureSegment({
          points: usablePoints,
          segmentIndex: index,
          segmentLength: length,
          segmentLengths,
          bounds,
        })
      );
    const annotation: BodyReferenceSvgQualitySegmentAnnotation = {
      kind: isExpectedBridge ? "expected-horizontal-bridge" : "suspicious-jump",
      segmentIndex: index,
      length: round2(length),
      from: { x: round2(from.x), y: round2(from.y) },
      to: { x: round2(to.x), y: round2(to.y) },
    };

    if (annotation.kind === "expected-horizontal-bridge") {
      expectedBridgeSegments.push(annotation);
      expectedBridgeSegmentIndices.add(index);
    } else {
      suspiciousJumpSegments.push(annotation);
    }
  }

  if (closed && expectedBridgeSegments.length < 2) {
    for (let index = 0; index < segmentLengths.length; index += 1) {
      if (expectedBridgeSegmentIndices.has(index)) continue;
      const length = segmentLengths[index]!;
      if (!isExpectedRoundedBottomClosureSegment({
        points: usablePoints,
        segmentIndex: index,
        segmentLength: length,
        segmentLengths,
        bounds,
      })) {
        continue;
      }
      const { from, to } = getSegmentEndpoints(usablePoints, index);
      expectedBridgeSegments.push({
        kind: "expected-horizontal-bridge",
        segmentIndex: index,
        length: round2(length),
        from: { x: round2(from.x), y: round2(from.y) },
        to: { x: round2(to.x), y: round2(to.y) },
      });
      expectedBridgeSegmentIndices.add(index);
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
