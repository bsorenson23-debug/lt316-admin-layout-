import type { EditableBodyOutline } from "../types/productTemplate.ts";
import type {
  BlockedBodyRegion,
  BodyReferenceV2Draft,
  BodyReferenceV2Layer,
  BodyReferenceV2Point,
  BodyReferenceV2ScaleCalibration,
  CenterlineAxis,
} from "./bodyReferenceV2Layers.ts";
import {
  createBodyReferenceV2Layer,
  createCenterlineAxis,
} from "./bodyReferenceV2Layers.ts";
import { buildMirroredBodyPreview } from "./bodyReferenceV2ScaleMirror.ts";
import {
  summarizeBodyReferenceV2GenerationReadiness,
  type BodyReferenceV2GenerationReadinessSummary,
} from "./bodyReferenceV2GenerationSource.ts";
import { sortEditableOutlinePoints } from "./editableBodyOutline.ts";

export interface BodyReferenceV2CaptureReadinessSummary {
  status: "pass" | "warn" | "fail" | "unknown";
  accepted: boolean;
  hasDraftChanges: boolean;
  generationReady: boolean;
  acceptedGenerationReady: boolean;
  centerlineCaptured: boolean;
  leftBodyPointCount: number;
  blockedRegionCount: number;
  warnings: string[];
  errors: string[];
}

interface CreateEmptyDraftOptions {
  sourceImageUrl?: string;
  scaleCalibration?: BodyReferenceV2ScaleCalibration | null;
}

interface ResetDraftOptions extends CreateEmptyDraftOptions {
  acceptedDraft?: BodyReferenceV2Draft | null;
}

interface ReferenceLayerOptions {
  id?: string;
  kind: "lid-reference" | "handle-reference";
  points?: readonly BodyReferenceV2Point[] | null;
  visible?: boolean;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function cloneScaleCalibration(
  scaleCalibration: BodyReferenceV2ScaleCalibration | null | undefined,
): BodyReferenceV2ScaleCalibration {
  return {
    scaleSource: scaleCalibration?.scaleSource ?? "unknown",
    lookupDiameterMm: scaleCalibration?.lookupDiameterMm,
    resolvedDiameterMm: scaleCalibration?.resolvedDiameterMm,
    mmPerPx: scaleCalibration?.mmPerPx,
    wrapDiameterMm: scaleCalibration?.wrapDiameterMm,
    wrapWidthMm: scaleCalibration?.wrapWidthMm,
    expectedBodyHeightMm: scaleCalibration?.expectedBodyHeightMm,
    expectedBodyWidthMm: scaleCalibration?.expectedBodyWidthMm,
    lookupVariantLabel: scaleCalibration?.lookupVariantLabel,
    lookupSizeOz: scaleCalibration?.lookupSizeOz,
    lookupDimensionAuthority: scaleCalibration?.lookupDimensionAuthority,
    lookupScaleStatus: scaleCalibration?.lookupScaleStatus,
    lookupFullProductHeightMm: scaleCalibration?.lookupFullProductHeightMm,
    lookupBodyHeightMm: scaleCalibration?.lookupBodyHeightMm,
    lookupHeightIgnoredForScale: scaleCalibration?.lookupHeightIgnoredForScale,
    lookupWarnings: scaleCalibration?.lookupWarnings ? [...scaleCalibration.lookupWarnings] : undefined,
    lookupErrors: scaleCalibration?.lookupErrors ? [...scaleCalibration.lookupErrors] : undefined,
  };
}

function clonePoint(point: BodyReferenceV2Point): BodyReferenceV2Point {
  return {
    xPx: round4(point.xPx),
    yPx: round4(point.yPx),
  };
}

function clonePoints(points: readonly BodyReferenceV2Point[] | null | undefined): BodyReferenceV2Point[] {
  return (points ?? []).map(clonePoint);
}

function cloneLayer(layer: BodyReferenceV2Layer): BodyReferenceV2Layer {
  return createBodyReferenceV2Layer({
    ...layer,
    points: clonePoints(layer.points),
  });
}

function cloneBlockedRegion(region: BlockedBodyRegion): BlockedBodyRegion {
  return {
    id: region.id,
    reason: region.reason,
    points: clonePoints(region.points),
  };
}

function cloneCenterline(centerline: CenterlineAxis | null | undefined): CenterlineAxis | null {
  if (!centerline) return null;
  return createCenterlineAxis({
    id: centerline.id,
    xPx: round4(centerline.xPx),
    topYPx: round4(centerline.topYPx),
    bottomYPx: round4(centerline.bottomYPx),
    confidence: centerline.confidence,
    source: centerline.source,
  });
}

function cloneDraft(draft: BodyReferenceV2Draft): BodyReferenceV2Draft {
  return {
    sourceImageUrl: draft.sourceImageUrl,
    centerline: cloneCenterline(draft.centerline),
    layers: draft.layers.map(cloneLayer),
    blockedRegions: draft.blockedRegions.map(cloneBlockedRegion),
    scaleCalibration: cloneScaleCalibration(draft.scaleCalibration),
  };
}

function findLayerIndex(
  layers: readonly BodyReferenceV2Layer[],
  kind: BodyReferenceV2Layer["kind"],
): number {
  return layers.findIndex((layer) => layer.kind === kind);
}

function replaceLayer(
  layers: readonly BodyReferenceV2Layer[],
  layer: BodyReferenceV2Layer,
): BodyReferenceV2Layer[] {
  const index = findLayerIndex(layers, layer.kind);
  if (index === -1) {
    return [...layers, layer];
  }
  const nextLayers = [...layers];
  nextLayers[index] = layer;
  return nextLayers;
}

function syncMirroredBodyRightLayer(draft: BodyReferenceV2Draft): BodyReferenceV2Draft {
  const nextDraft = cloneDraft(draft);
  const preview = buildMirroredBodyPreview(nextDraft, {
    missingCenterlineSeverity: "warn",
    missingBodyLeftSeverity: "warn",
    missingLookupSeverity: "warn",
  });
  const mirroredIndex = findLayerIndex(nextDraft.layers, "body-right-mirrored");

  if (preview.mirroredRightOutline.length === 0) {
    if (mirroredIndex !== -1) {
      nextDraft.layers.splice(mirroredIndex, 1);
    }
    return nextDraft;
  }

  const mirroredLayer = createBodyReferenceV2Layer({
    id:
      mirroredIndex === -1
        ? "body-reference-v2-body-right-mirrored"
        : nextDraft.layers[mirroredIndex]?.id ?? "body-reference-v2-body-right-mirrored",
    kind: "body-right-mirrored",
    points: preview.mirroredRightOutline,
    visible: true,
  });
  nextDraft.layers = replaceLayer(nextDraft.layers, mirroredLayer);
  return nextDraft;
}

function buildCaptureSignature(draft: BodyReferenceV2Draft | null | undefined): string {
  if (!draft) return "";
  const normalized = syncMirroredBodyRightLayer(draft);
  return JSON.stringify({
    centerline: normalized.centerline,
    layers: normalized.layers.map((layer) => ({
      id: layer.id,
      kind: layer.kind,
      points: layer.points,
      closed: layer.closed,
      editable: layer.editable,
      visible: layer.visible,
      referenceOnly: layer.referenceOnly,
      includedInBodyCutoutQa: layer.includedInBodyCutoutQa,
    })),
    blockedRegions: normalized.blockedRegions,
  });
}

export function createEmptyBodyReferenceV2Draft(
  options: CreateEmptyDraftOptions = {},
): BodyReferenceV2Draft {
  return {
    sourceImageUrl: options.sourceImageUrl,
    centerline: null,
    layers: [],
    blockedRegions: [],
    scaleCalibration: cloneScaleCalibration(options.scaleCalibration),
  };
}

export function seedCenterlineFromApprovedBodyOutline(
  outline: EditableBodyOutline | null | undefined,
): CenterlineAxis | null {
  const sorted = sortEditableOutlinePoints(outline?.points ?? []);
  if (sorted.length < 2) return null;

  const topYPx = sorted[0]?.y;
  const bottomYPx = sorted[sorted.length - 1]?.y;
  if (!isFiniteNumber(topYPx) || !isFiniteNumber(bottomYPx) || bottomYPx <= topYPx) {
    return null;
  }

  return createCenterlineAxis({
    id: "body-reference-v2-centerline",
    xPx: 0,
    topYPx: round4(topYPx),
    bottomYPx: round4(bottomYPx),
    confidence: 1,
    source: "operator",
  });
}

export function seedBodyLeftOutlineFromApprovedBodyOutline(
  outline: EditableBodyOutline | null | undefined,
): BodyReferenceV2Point[] {
  const sorted = sortEditableOutlinePoints(outline?.points ?? []);
  return sorted
    .filter((point) => isFiniteNumber(point.x) && isFiniteNumber(point.y))
    .map((point) => ({
      xPx: round4(-Math.max(Math.abs(point.x), 0.01)),
      yPx: round4(point.y),
    }));
}

export function setCenterlineAxis(
  draft: BodyReferenceV2Draft,
  centerline: CenterlineAxis | null,
): BodyReferenceV2Draft {
  return syncMirroredBodyRightLayer({
    ...cloneDraft(draft),
    centerline: cloneCenterline(centerline),
  });
}

export function setBodyLeftOutline(
  draft: BodyReferenceV2Draft,
  points: readonly BodyReferenceV2Point[],
  options: {
    id?: string;
    visible?: boolean;
  } = {},
): BodyReferenceV2Draft {
  const nextDraft = cloneDraft(draft);
  const existingIndex = findLayerIndex(nextDraft.layers, "body-left");
  const bodyLeftLayer = createBodyReferenceV2Layer({
    id:
      options.id
      ?? (existingIndex === -1
        ? "body-reference-v2-body-left"
        : nextDraft.layers[existingIndex]?.id)
      ?? "body-reference-v2-body-left",
    kind: "body-left",
    points: clonePoints(points),
    visible: options.visible ?? true,
  });
  nextDraft.layers = replaceLayer(nextDraft.layers, bodyLeftLayer);
  return syncMirroredBodyRightLayer(nextDraft);
}

export function setReferenceLayer(
  draft: BodyReferenceV2Draft,
  options: ReferenceLayerOptions,
): BodyReferenceV2Draft {
  const nextDraft = cloneDraft(draft);
  const existingIndex = findLayerIndex(nextDraft.layers, options.kind);
  const referenceLayer = createBodyReferenceV2Layer({
    id:
      options.id
      ?? (existingIndex === -1
        ? `body-reference-v2-${options.kind}`
        : nextDraft.layers[existingIndex]?.id)
      ?? `body-reference-v2-${options.kind}`,
    kind: options.kind,
    points: clonePoints(options.points),
    visible: options.visible ?? true,
  });
  nextDraft.layers = replaceLayer(nextDraft.layers, referenceLayer);
  return nextDraft;
}

export function addBlockedRegion(
  draft: BodyReferenceV2Draft,
  blockedRegion: BlockedBodyRegion,
): BodyReferenceV2Draft {
  const nextDraft = cloneDraft(draft);
  nextDraft.blockedRegions = [...nextDraft.blockedRegions, cloneBlockedRegion(blockedRegion)];
  return nextDraft;
}

export function removeBlockedRegion(
  draft: BodyReferenceV2Draft,
  regionId: string,
): BodyReferenceV2Draft {
  const nextDraft = cloneDraft(draft);
  nextDraft.blockedRegions = nextDraft.blockedRegions.filter((region) => region.id !== regionId);
  return nextDraft;
}

export function buildBodyReferenceV2GenerationReadinessFromDraft(
  draft: BodyReferenceV2Draft,
): BodyReferenceV2GenerationReadinessSummary {
  return summarizeBodyReferenceV2GenerationReadiness(syncMirroredBodyRightLayer(draft));
}

export function acceptBodyReferenceV2Draft(
  draft: BodyReferenceV2Draft,
): BodyReferenceV2Draft {
  return syncMirroredBodyRightLayer(draft);
}

export function resetBodyReferenceV2Draft(
  options: ResetDraftOptions = {},
): BodyReferenceV2Draft {
  const baseline = options.acceptedDraft
    ? cloneDraft(options.acceptedDraft)
    : createEmptyBodyReferenceV2Draft(options);

  return {
    ...baseline,
    sourceImageUrl: options.sourceImageUrl,
    scaleCalibration: cloneScaleCalibration(options.scaleCalibration ?? baseline.scaleCalibration),
  };
}

export function summarizeBodyReferenceV2CaptureReadiness(args: {
  draft: BodyReferenceV2Draft;
  acceptedDraft?: BodyReferenceV2Draft | null;
}): BodyReferenceV2CaptureReadinessSummary {
  const generationReadiness = buildBodyReferenceV2GenerationReadinessFromDraft(args.draft);
  const acceptedGenerationReadiness = args.acceptedDraft
    ? buildBodyReferenceV2GenerationReadinessFromDraft(args.acceptedDraft)
    : null;
  const hasDraftChanges = buildCaptureSignature(args.draft) !== buildCaptureSignature(args.acceptedDraft ?? null);
  const warnings = [
    ...generationReadiness.warnings,
  ];

  if (!args.acceptedDraft) {
    warnings.push("BODY REFERENCE v2 draft is not accepted yet.");
  } else if (hasDraftChanges) {
    warnings.push("BODY REFERENCE v2 draft changes are pending acceptance.");
  }

  return {
    status: generationReadiness.status,
    accepted: Boolean(args.acceptedDraft),
    hasDraftChanges,
    generationReady:
      Boolean(args.acceptedDraft) &&
      !hasDraftChanges &&
      (acceptedGenerationReadiness?.ready ?? false),
    acceptedGenerationReady: acceptedGenerationReadiness?.ready ?? false,
    centerlineCaptured: generationReadiness.centerlineCaptured,
    leftBodyPointCount: generationReadiness.leftBodyPointCount,
    blockedRegionCount: generationReadiness.blockedRegionCount,
    warnings: [...new Set(warnings)],
    errors: generationReadiness.errors,
  };
}
