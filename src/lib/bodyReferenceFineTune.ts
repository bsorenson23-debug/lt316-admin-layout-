import type { EditableBodyOutline } from "../types/productTemplate.ts";
import type { TumblerItemLookupFitDebug } from "../types/tumblerItemLookup.ts";
import { stableStringifyForHash } from "./hashSha256.ts";
import { resolveBodyReferenceGlbReviewState } from "./bodyReferenceGlbSource.ts";
import {
  insertEditableOutlinePoint,
  rebuildEditableBodyOutline,
  removeEditableOutlinePoint,
  resolveAuthoritativeEditableBodyOutlineContour,
  sortEditableOutlinePoints,
} from "./editableBodyOutline.ts";

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function cloneOutline(outline: EditableBodyOutline | null | undefined): EditableBodyOutline | null {
  if (!outline) return null;
  return {
    ...outline,
    points: outline.points.map((point) => ({
      ...point,
      inHandle: point.inHandle ? { ...point.inHandle } : null,
      outHandle: point.outHandle ? { ...point.outHandle } : null,
    })),
    directContour: outline.directContour?.map((point) => ({ ...point })) ?? undefined,
    sourceContour: outline.sourceContour?.map((point) => ({ ...point })) ?? undefined,
    sourceContourBounds: outline.sourceContourBounds
      ? { ...outline.sourceContourBounds }
      : undefined,
    printableBandContour: outline.printableBandContour?.map((point) => ({ ...point })) ?? undefined,
    printableBandContourBounds: outline.printableBandContourBounds
      ? { ...outline.printableBandContourBounds }
      : undefined,
    contourFrame: outline.contourFrame
      ? {
          ...outline.contourFrame,
          boundsBeforeBandCrop: outline.contourFrame.boundsBeforeBandCrop
            ? { ...outline.contourFrame.boundsBeforeBandCrop }
            : undefined,
          boundsAfterBandCrop: outline.contourFrame.boundsAfterBandCrop
            ? { ...outline.contourFrame.boundsAfterBandCrop }
            : undefined,
          acceptedPreviewBounds: outline.contourFrame.acceptedPreviewBounds
            ? { ...outline.contourFrame.acceptedPreviewBounds }
            : undefined,
          glbInputBounds: outline.contourFrame.glbInputBounds
            ? { ...outline.contourFrame.glbInputBounds }
            : undefined,
          canonicalInputBounds: outline.contourFrame.canonicalInputBounds
            ? { ...outline.contourFrame.canonicalInputBounds }
            : undefined,
        }
      : undefined,
    sourceContourViewport: outline.sourceContourViewport
      ? { ...outline.sourceContourViewport }
      : undefined,
  };
}

export function buildOutlineGeometrySignature(outline: EditableBodyOutline | null | undefined): string {
  if (!outline) return "__none__";
  const directContour = resolveAuthoritativeEditableBodyOutlineContour(outline);
  return stableStringifyForHash({
    closed: outline.closed,
    version: outline.version ?? 1,
    sourceContourMode: outline.sourceContourMode ?? null,
    points: outline.points.map((point) => ({
      x: round2(point.x),
      y: round2(point.y),
      role: point.role ?? null,
      pointType: point.pointType ?? null,
      inHandle: point.inHandle
        ? { x: round2(point.inHandle.x), y: round2(point.inHandle.y) }
        : null,
      outHandle: point.outHandle
        ? { x: round2(point.outHandle.x), y: round2(point.outHandle.y) }
        : null,
    })),
    directContour: directContour?.map((point) => ({
      x: round2(point.x),
      y: round2(point.y),
    })) ?? null,
    sourceContour: outline.sourceContour?.map((point) => ({
      x: round2(point.x),
      y: round2(point.y),
    })) ?? null,
  });
}

function resolveBoundsFromPoints(points: Array<{ x: number; y: number }> | undefined) {
  if (!points || points.length === 0) return null;
  const finite = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (finite.length === 0) return null;
  const xs = finite.map((point) => point.x);
  const ys = finite.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX: round2(minX),
    minY: round2(minY),
    maxX: round2(maxX),
    maxY: round2(maxY),
    width: round2(Math.max(0, maxX - minX)),
    height: round2(Math.max(0, maxY - minY)),
  };
}

export type BodyReferenceVisualContourSource =
  | "direct-contour"
  | "control-points"
  | "source-contour";

export interface BodyReferencePrimaryVisualContour {
  points: Array<{ x: number; y: number }>;
  source: BodyReferenceVisualContourSource;
  bounds: NonNullable<ReturnType<typeof resolveBoundsFromPoints>>;
  topGuideY: number;
}

export interface BodyReferenceUiOnlyRimReferenceGuide {
  y: number;
  source: "rim-reference-ui-only";
  authority: "visual-only";
  excludedFromBodyCutout: true;
  affectsSourceHash: false;
  affectsGlbInput: false;
  affectsWrapExport: false;
  affectsV2Authority: false;
  sourceField: "fitDebug.rimBottomPx";
  coordinateSpace: "contour-units";
  warnings: string[];
}

export function resolvePrimaryBodyReferenceVisualContour(
  outline: EditableBodyOutline | null | undefined,
): BodyReferencePrimaryVisualContour | null {
  if (!outline) return null;
  const authoritativeContour = resolveAuthoritativeEditableBodyOutlineContour(outline);
  if (authoritativeContour && authoritativeContour.length >= 3) {
    const bounds = resolveBoundsFromPoints(authoritativeContour);
    if (bounds) {
      return {
        points: authoritativeContour.map((point) => ({ x: point.x, y: point.y })),
        source: authoritativeContour === outline.directContour ? "direct-contour" : "control-points",
        bounds,
        topGuideY: bounds.minY,
      };
    }
  }

  if (outline.sourceContour && outline.sourceContour.length >= 3) {
    const bounds = resolveBoundsFromPoints(outline.sourceContour);
    if (bounds) {
      return {
        points: outline.sourceContour.map((point) => ({ x: point.x, y: point.y })),
        source: "source-contour",
        bounds,
        topGuideY: bounds.minY,
      };
    }
  }

  const profilePoints = outline.points.map((point) => ({ x: point.x, y: point.y }));
  if (profilePoints.length >= 2) {
    const bounds = resolveBoundsFromPoints(profilePoints);
    if (bounds) {
      return {
        points: profilePoints,
        source: "control-points",
        bounds,
        topGuideY: bounds.minY,
      };
    }
  }

  return null;
}

export function resolveUiOnlyRimReferenceGuide(args: {
  outline: EditableBodyOutline | null | undefined;
  fitDebug?: TumblerItemLookupFitDebug | null;
}): BodyReferenceUiOnlyRimReferenceGuide | null {
  const outline = args.outline;
  const fitDebug = args.fitDebug ?? null;
  if (!outline || !fitDebug || !Number.isFinite(fitDebug.rimBottomPx)) {
    return null;
  }
  const outlineBounds = resolvePrimaryBodyReferenceVisualContour(outline)?.bounds ?? null;
  const sourceBounds = outline.sourceContourBounds;
  if (
    !outlineBounds ||
    !sourceBounds ||
    !Number.isFinite(sourceBounds.minY) ||
    !Number.isFinite(sourceBounds.height) ||
    sourceBounds.height <= 0
  ) {
    return null;
  }

  const y = round2(outlineBounds.minY + ((fitDebug.rimBottomPx - sourceBounds.minY) * (outlineBounds.height / sourceBounds.height)));
  const warnings: string[] = [];
  if (y > outlineBounds.minY + 0.5) {
    warnings.push("Rim reference guide overlaps the accepted body contour; keep it visual-only and do not promote it to BODY CUTOUT geometry.");
  }

  return {
    y,
    source: "rim-reference-ui-only",
    authority: "visual-only",
    excludedFromBodyCutout: true,
    affectsSourceHash: false,
    affectsGlbInput: false,
    affectsWrapExport: false,
    affectsV2Authority: false,
    sourceField: "fitDebug.rimBottomPx",
    coordinateSpace: "contour-units",
    warnings,
  };
}

export function resolveOutlineBounds(outline: EditableBodyOutline | null | undefined) {
  if (!outline) return null;
  return resolveBoundsFromPoints(resolveAuthoritativeEditableBodyOutlineContour(outline) ?? undefined)
    ?? resolveBoundsFromPoints(outline.sourceContour)
    ?? resolveBoundsFromPoints(outline.points.map((point) => ({ x: point.x, y: point.y })));
}

export function resolveOutlinePointCount(outline: EditableBodyOutline | null | undefined): number {
  if (!outline) return 0;
  return resolveAuthoritativeEditableBodyOutlineContour(outline)?.length
    ?? outline.sourceContour?.length
    ?? outline.points.length;
}

export function canDeleteFineTunePoint(outline: EditableBodyOutline | null | undefined): boolean {
  return Boolean(outline && outline.points.length > 4);
}

export function updateOutlinePointPosition(args: {
  outline: EditableBodyOutline | null | undefined;
  pointId: string;
  nextX: number;
  nextY: number;
  overallHeightMm?: number | null;
}): EditableBodyOutline | null {
  const outline = args.outline;
  if (!outline) return null;

  const ordered = sortEditableOutlinePoints(outline.points);
  const index = ordered.findIndex((point) => point.id === args.pointId);
  if (index < 0) return outline;

  const targetPoint = ordered[index]!;
  const previousPoint = ordered[index - 1] ?? null;
  const nextPoint = ordered[index + 1] ?? null;
  const minY = previousPoint ? previousPoint.y + 1 : 0;
  const maxY = nextPoint
    ? nextPoint.y - 1
    : (
      typeof args.overallHeightMm === "number" &&
      Number.isFinite(args.overallHeightMm) &&
      args.overallHeightMm > minY
        ? args.overallHeightMm
        : Math.max(minY, targetPoint.y)
    );

  const resolvedX = round1(Math.max(0.5, args.nextX));
  const resolvedY = round1(clamp(args.nextY, minY, maxY));
  if (resolvedX === round1(targetPoint.x) && resolvedY === round1(targetPoint.y)) {
    return outline;
  }

  return rebuildEditableBodyOutline({
    ...outline,
    points: outline.points.map((point) => {
      if (point.id !== args.pointId) return point;
      return {
        ...point,
        x: resolvedX,
        y: resolvedY,
      };
    }),
  });
}

export function nudgeOutlinePoint(args: {
  outline: EditableBodyOutline | null | undefined;
  pointId: string;
  deltaX?: number;
  deltaY?: number;
  overallHeightMm?: number | null;
}): EditableBodyOutline | null {
  const outline = args.outline;
  if (!outline) return null;
  const point = outline.points.find((candidate) => candidate.id === args.pointId);
  if (!point) return outline;
  return updateOutlinePointPosition({
    outline,
    pointId: args.pointId,
    nextX: point.x + (args.deltaX ?? 0),
    nextY: point.y + (args.deltaY ?? 0),
    overallHeightMm: args.overallHeightMm,
  });
}

export function insertFineTunePointOnSegment(args: {
  outline: EditableBodyOutline | null | undefined;
  segmentIndex: number;
}): EditableBodyOutline | null {
  const outline = args.outline;
  if (!outline) return null;
  if (args.segmentIndex < 0 || args.segmentIndex >= outline.points.length - 1) {
    return outline;
  }
  return insertEditableOutlinePoint(outline, args.segmentIndex);
}

export function deleteFineTunePoint(args: {
  outline: EditableBodyOutline | null | undefined;
  pointId: string;
}): EditableBodyOutline | null {
  const outline = args.outline;
  if (!outline) return null;
  if (!canDeleteFineTunePoint(outline)) return outline;
  return removeEditableOutlinePoint(outline, args.pointId);
}

export function hasFineTuneDraftChanges(args: {
  approved: EditableBodyOutline | null | undefined;
  draft: EditableBodyOutline | null | undefined;
}): boolean {
  return buildOutlineGeometrySignature(args.approved) !== buildOutlineGeometrySignature(args.draft);
}

export function resolveFineTuneGlbReviewState(args: {
  canGenerate: boolean;
  hasGeneratedArtifact: boolean;
  currentSourceSignature: string | null;
  generatedSourceSignature: string | null;
  hasPendingSourceDraft: boolean;
}) {
  return resolveBodyReferenceGlbReviewState({
    canGenerate: args.canGenerate,
    hasGeneratedArtifact: args.hasGeneratedArtifact,
    currentSourceSignature: args.currentSourceSignature,
    generatedSourceSignature: args.generatedSourceSignature,
    hasPendingSourceDraft: args.hasPendingSourceDraft,
  });
}
