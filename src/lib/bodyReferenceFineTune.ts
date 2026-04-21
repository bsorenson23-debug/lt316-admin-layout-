import type { EditableBodyOutline } from "../types/productTemplate.ts";
import { stableStringifyForHash } from "./hashSha256.ts";
import { resolveBodyReferenceGlbReviewState } from "./bodyReferenceGlbSource.ts";
import { resolveAuthoritativeEditableBodyOutlineContour } from "./editableBodyOutline.ts";

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
