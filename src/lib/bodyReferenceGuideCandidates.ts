import type {
  EditableBodyOutline,
  EditableBodyOutlineContourPoint,
} from "../types/productTemplate.ts";
import {
  buildBodyReferenceSvgQualityVisualizationFromOutline,
  type BodyReferenceSvgQualityReport,
} from "./bodyReferenceSvgQuality.ts";
import { resolveAuthoritativeEditableBodyOutlineContour } from "./editableBodyOutline.ts";

export type BodyReferenceGuideCoordinateSpace =
  | "raw-svg"
  | "viewbox"
  | "image-pixels"
  | "millimeters";

export type BodyReferenceGuideReportCoordinateSpace =
  | BodyReferenceGuideCoordinateSpace
  | "unknown";

export type BodyReferenceGuideCandidateKind =
  | "top-bridge"
  | "bottom-bridge"
  | "body-bounds"
  | "centerline"
  | "outline";

export type BodyReferenceGuideCandidateConfidence = "high" | "medium" | "low";

export type BodyReferenceGuideCandidateSource =
  | "svg-quality"
  | "direct-contour"
  | "outline-bounds"
  | "derived-ui-only";

export interface BodyReferenceGuidePoint {
  x: number;
  y: number;
}

export interface BodyReferenceGuideCandidate {
  id: string;
  kind: BodyReferenceGuideCandidateKind;
  coordinateSpace: BodyReferenceGuideCoordinateSpace;
  points: BodyReferenceGuidePoint[];
  confidence: BodyReferenceGuideCandidateConfidence;
  source: BodyReferenceGuideCandidateSource;
  readOnly: true;
  affectsSourceHash: false;
  affectsGlbInput: false;
  affectsBodyCutoutQa: false;
  affectsWrapExport: false;
  affectsV2Authority: false;
  warnings: string[];
}

export interface BodyReferenceGuideCandidateReport {
  status: "pass" | "warn" | "fail" | "unknown";
  coordinateSpace: BodyReferenceGuideReportCoordinateSpace;
  candidates: BodyReferenceGuideCandidate[];
  expectedBridgeSegmentCount: number;
  suspiciousJumpCount: number;
  warnings: string[];
  errors: string[];
}

export interface BuildBodyReferenceGuideCandidateReportInput {
  outline: EditableBodyOutline | null | undefined;
  svgQualityReport?: BodyReferenceSvgQualityReport | null;
  coordinateSpace?: BodyReferenceGuideCoordinateSpace | null;
}

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeMessages(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function clonePoint(point: EditableBodyOutlineContourPoint): BodyReferenceGuidePoint {
  return {
    x: round2(point.x),
    y: round2(point.y),
  };
}

function getBounds(points: readonly BodyReferenceGuidePoint[]): Bounds | null {
  const finite = points.filter((point) => (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y)
  ));
  if (finite.length === 0) return null;
  const xs = finite.map((point) => point.x);
  const ys = finite.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return {
    minX: round2(minX),
    minY: round2(minY),
    maxX: round2(maxX),
    maxY: round2(maxY),
    width: round2(maxX - minX),
    height: round2(maxY - minY),
  };
}

function resolveCoordinateSpace(
  input: BuildBodyReferenceGuideCandidateReportInput,
): BodyReferenceGuideReportCoordinateSpace {
  if (input.coordinateSpace) return input.coordinateSpace;
  if (input.svgQualityReport?.boundsUnits === "mm") return "millimeters";
  if (input.svgQualityReport?.boundsUnits === "source-px") return "image-pixels";
  return "unknown";
}

function resolveContour(
  outline: EditableBodyOutline | null | undefined,
): {
  points: BodyReferenceGuidePoint[];
  source: BodyReferenceGuideCandidateSource;
} {
  if (!outline) {
    return { points: [], source: "derived-ui-only" };
  }
  const authoritativeContour = resolveAuthoritativeEditableBodyOutlineContour(outline);
  if (authoritativeContour?.length) {
    return {
      points: authoritativeContour.map(clonePoint),
      source: "direct-contour",
    };
  }
  if (outline.sourceContour?.length) {
    return {
      points: outline.sourceContour.map(clonePoint),
      source: "svg-quality",
    };
  }
  return {
    points: outline.points.map((point) => ({
      x: round2(point.x),
      y: round2(point.y),
    })),
    source: "outline-bounds",
  };
}

function createCandidate(args: {
  id: string;
  kind: BodyReferenceGuideCandidateKind;
  coordinateSpace: BodyReferenceGuideCoordinateSpace;
  points: BodyReferenceGuidePoint[];
  confidence: BodyReferenceGuideCandidateConfidence;
  source: BodyReferenceGuideCandidateSource;
  warnings?: string[];
}): BodyReferenceGuideCandidate {
  return {
    id: args.id,
    kind: args.kind,
    coordinateSpace: args.coordinateSpace,
    points: args.points.map((point) => ({ x: round2(point.x), y: round2(point.y) })),
    confidence: args.confidence,
    source: args.source,
    readOnly: true,
    affectsSourceHash: false,
    affectsGlbInput: false,
    affectsBodyCutoutQa: false,
    affectsWrapExport: false,
    affectsV2Authority: false,
    warnings: normalizeMessages(args.warnings ?? []),
  };
}

function addBoundsCandidates(args: {
  candidates: BodyReferenceGuideCandidate[];
  bounds: Bounds;
  coordinateSpace: BodyReferenceGuideCoordinateSpace;
}): void {
  const { bounds, candidates, coordinateSpace } = args;
  candidates.push(
    createCandidate({
      id: "body-bounds-vertical-left",
      kind: "body-bounds",
      coordinateSpace,
      points: [
        { x: bounds.minX, y: bounds.minY },
        { x: bounds.minX, y: bounds.maxY },
      ],
      confidence: "medium",
      source: "outline-bounds",
    }),
    createCandidate({
      id: "body-bounds-vertical-right",
      kind: "body-bounds",
      coordinateSpace,
      points: [
        { x: bounds.maxX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.maxY },
      ],
      confidence: "medium",
      source: "outline-bounds",
    }),
    createCandidate({
      id: "body-bounds-horizontal-top",
      kind: "body-bounds",
      coordinateSpace,
      points: [
        { x: bounds.minX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.minY },
      ],
      confidence: "medium",
      source: "outline-bounds",
    }),
    createCandidate({
      id: "body-bounds-horizontal-bottom",
      kind: "body-bounds",
      coordinateSpace,
      points: [
        { x: bounds.minX, y: bounds.maxY },
        { x: bounds.maxX, y: bounds.maxY },
      ],
      confidence: "medium",
      source: "outline-bounds",
    }),
  );
}

function addCenterlineCandidate(args: {
  candidates: BodyReferenceGuideCandidate[];
  bounds: Bounds;
  coordinateSpace: BodyReferenceGuideCoordinateSpace;
}): void {
  const centerX = round2(args.bounds.minX + (args.bounds.width / 2));
  args.candidates.push(createCandidate({
    id: "centerline-ui-only",
    kind: "centerline",
    coordinateSpace: args.coordinateSpace,
    points: [
      { x: centerX, y: args.bounds.minY },
      { x: centerX, y: args.bounds.maxY },
    ],
    confidence: "medium",
    source: "derived-ui-only",
    warnings: ["UI-only centerline guide; not BODY REFERENCE v2 authority."],
  }));
}

export function buildBodyReferenceGuideCandidateReport(
  input: BuildBodyReferenceGuideCandidateReportInput,
): BodyReferenceGuideCandidateReport {
  const warnings: string[] = [];
  const errors: string[] = [];
  const svgQualityReport = input.svgQualityReport ?? null;
  const coordinateSpace = resolveCoordinateSpace(input);
  const expectedBridgeSegmentCount = svgQualityReport?.expectedBridgeSegmentCount ?? 0;
  const suspiciousJumpCount = svgQualityReport?.suspiciousJumpCount ?? 0;

  if (!input.outline) {
    warnings.push("BODY REFERENCE outline is unavailable; guide candidates were not derived.");
  }
  if (!svgQualityReport) {
    warnings.push("SVG quality report is unavailable; bridge guide candidates were not derived.");
  }
  if (coordinateSpace === "unknown") {
    warnings.push("Guide coordinate space is unknown; candidates were not interpreted as millimeters.");
  }
  if (svgQualityReport?.status === "fail") {
    errors.push(...svgQualityReport.errors);
    warnings.push("SVG quality failed; bridge guide candidates were not promoted.");
  } else if (svgQualityReport?.warnings.length) {
    warnings.push(...svgQualityReport.warnings);
  }
  if (suspiciousJumpCount > 0) {
    warnings.push("Suspicious jump segments are present; bridge guide candidates require operator review.");
  }

  const canDeriveCandidates =
    Boolean(input.outline) &&
    Boolean(svgQualityReport) &&
    coordinateSpace !== "unknown" &&
    svgQualityReport?.status !== "fail";

  if (!canDeriveCandidates) {
    return {
      status: errors.length > 0 ? "fail" : "unknown",
      coordinateSpace,
      candidates: [],
      expectedBridgeSegmentCount,
      suspiciousJumpCount,
      warnings: normalizeMessages(warnings),
      errors: normalizeMessages(errors),
    };
  }

  const resolvedCoordinateSpace = coordinateSpace as BodyReferenceGuideCoordinateSpace;
  const candidates: BodyReferenceGuideCandidate[] = [];
  const contour = resolveContour(input.outline);
  const bounds = svgQualityReport?.bounds
    ? {
        minX: round2(svgQualityReport.bounds.minX),
        minY: round2(svgQualityReport.bounds.minY),
        maxX: round2(svgQualityReport.bounds.maxX),
        maxY: round2(svgQualityReport.bounds.maxY),
        width: round2(svgQualityReport.bounds.width),
        height: round2(svgQualityReport.bounds.height),
      }
    : getBounds(contour.points);

  if (contour.points.length >= 2) {
    candidates.push(createCandidate({
      id: "outline-source",
      kind: "outline",
      coordinateSpace: resolvedCoordinateSpace,
      points: contour.points,
      confidence: contour.source === "direct-contour" ? "high" : "medium",
      source: contour.source,
    }));
  } else {
    warnings.push("Contour outline points are unavailable; outline overlay candidate was not created.");
  }

  if (bounds && bounds.width > 0 && bounds.height > 0) {
    addBoundsCandidates({ candidates, bounds, coordinateSpace: resolvedCoordinateSpace });
    addCenterlineCandidate({ candidates, bounds, coordinateSpace: resolvedCoordinateSpace });
  } else {
    warnings.push("Body bounds are unavailable; bounds and centerline guide candidates were not created.");
  }

  const visualization = buildBodyReferenceSvgQualityVisualizationFromOutline({
    outline: input.outline,
  });
  const bridgeSegments = [...visualization.expectedBridgeSegments].sort((left, right) => {
    const leftY = (left.from.y + left.to.y) / 2;
    const rightY = (right.from.y + right.to.y) / 2;
    return leftY - rightY;
  });

  if (expectedBridgeSegmentCount === 2 && suspiciousJumpCount === 0 && bridgeSegments.length >= 2) {
    const [topBridge, bottomBridge] = bridgeSegments;
    candidates.push(
      createCandidate({
        id: "top-bridge",
        kind: "top-bridge",
        coordinateSpace: resolvedCoordinateSpace,
        points: [topBridge!.from, topBridge!.to],
        confidence: "high",
        source: "svg-quality",
      }),
      createCandidate({
        id: "bottom-bridge",
        kind: "bottom-bridge",
        coordinateSpace: resolvedCoordinateSpace,
        points: [bottomBridge!.from, bottomBridge!.to],
        confidence: "high",
        source: "svg-quality",
      }),
    );
  } else if (svgQualityReport) {
    warnings.push(
      `Expected 2 clean bridge segments but found ${expectedBridgeSegmentCount} expected bridge segment(s) and ${suspiciousJumpCount} suspicious jump segment(s).`,
    );
  }

  const status: BodyReferenceGuideCandidateReport["status"] =
    errors.length > 0
      ? "fail"
      : warnings.length > 0
        ? "warn"
        : "pass";

  return {
    status,
    coordinateSpace: resolvedCoordinateSpace,
    candidates,
    expectedBridgeSegmentCount,
    suspiciousJumpCount,
    warnings: normalizeMessages(warnings),
    errors: normalizeMessages(errors),
  };
}
