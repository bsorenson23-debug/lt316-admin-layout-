import type { EditableBodyOutline } from "../types/productTemplate.ts";
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
