import type {
  BodyReferenceV2Draft,
  BodyReferenceV2Layer,
  BodyReferenceV2Point,
  BodyReferenceV2ScaleCalibration,
  BodyReferenceV2Validation,
  CenterlineAxis,
} from "./bodyReferenceV2Layers.ts";
import {
  validateBodyLeftLayer,
  validateCenterlineAxis,
  validateReferenceLayerSeparation,
} from "./bodyReferenceV2Layers.ts";
import {
  buildMirroredBodyPreview,
  computeDiameterPxFromCenterlineToLeftWall,
  computeMmPerPxFromLookupDiameter,
  computeWrapWidthFromDiameter,
  validateMirroredBodySymmetry,
} from "./bodyReferenceV2ScaleMirror.ts";

export interface BodyReferenceV2GenerationSource {
  sourceMode: "body-reference-v2";
  centerline: CenterlineAxis;
  leftBodyOutline: BodyReferenceV2Point[];
  mirroredRightOutline: BodyReferenceV2Point[];
  scaleCalibration: BodyReferenceV2ScaleCalibration;
  wrapWidthMm: number;
  wrapDiameterMm: number;
  mmPerPx: number;
  sourceHashPayload: Record<string, unknown>;
  blockedRegionCount: number;
  warnings: string[];
  errors: string[];
}

export interface BodyReferenceV2MirroredProfileSample {
  index: number;
  yPx: number;
  yMm: number;
  xLeftPx: number;
  xRightPx: number;
  xLeftMm: number;
  xRightMm: number;
  radiusPx: number;
  radiusMm: number;
}

export interface BodyReferenceV2MirroredProfile {
  bodyHeightMm: number;
  minYPx: number;
  maxYPx: number;
  samples: BodyReferenceV2MirroredProfileSample[];
}

export interface BodyReferenceV2GenerationReadinessSummary {
  status: "pass" | "warn" | "fail" | "unknown";
  ready: boolean;
  centerlineCaptured: boolean;
  leftBodyPointCount: number;
  mirroredRightPointCount: number;
  blockedRegionCount: number;
  lookupDiameterMm?: number;
  diameterPx?: number;
  mmPerPx?: number;
  wrapDiameterMm?: number;
  wrapWidthMm?: number;
  warnings: string[];
  errors: string[];
  isCurrentGenerationSource: false;
}

interface GenerationValidationOptions {
  blockedOverlapSeverity?: "warn" | "fail";
  symmetryTolerancePx?: number;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isFinitePositive(value: number | null | undefined): value is number {
  return isFiniteNumber(value) && value > 0;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function normalizeMessages(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeValidation(args: {
  errors?: readonly string[] | null;
  warnings?: readonly string[] | null;
}): BodyReferenceV2Validation {
  const errors = normalizeMessages(args.errors ?? []);
  const warnings = normalizeMessages(args.warnings ?? []);
  return {
    status: errors.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass",
    errors,
    warnings,
  };
}

function mergeValidation(...validations: Array<BodyReferenceV2Validation | null | undefined>): BodyReferenceV2Validation {
  return normalizeValidation({
    errors: validations.flatMap((validation) => validation?.errors ?? []),
    warnings: validations.flatMap((validation) => validation?.warnings ?? []),
  });
}

function findBodyLeftLayer(
  layers: readonly BodyReferenceV2Layer[] | null | undefined,
): BodyReferenceV2Layer | null {
  return (layers ?? []).find((layer) => layer.kind === "body-left") ?? null;
}

function normalizePoints(points: readonly BodyReferenceV2Point[] | null | undefined): BodyReferenceV2Point[] {
  return (points ?? []).map((point) => ({
    xPx: round4(point.xPx),
    yPx: round4(point.yPx),
  }));
}

function computePointBounds(points: readonly BodyReferenceV2Point[] | null | undefined) {
  const normalizedPoints = normalizePoints(points);
  if (normalizedPoints.length === 0) return null;
  return {
    minX: Math.min(...normalizedPoints.map((point) => point.xPx)),
    maxX: Math.max(...normalizedPoints.map((point) => point.xPx)),
    minY: Math.min(...normalizedPoints.map((point) => point.yPx)),
    maxY: Math.max(...normalizedPoints.map((point) => point.yPx)),
  };
}

function boundsOverlap(
  left: ReturnType<typeof computePointBounds>,
  right: ReturnType<typeof computePointBounds>,
): boolean {
  if (!left || !right) return false;
  return !(
    left.maxX < right.minX ||
    right.maxX < left.minX ||
    left.maxY < right.minY ||
    right.maxY < left.minY
  );
}

function validateBlockedRegionOverlap(args: {
  draft: BodyReferenceV2Draft;
  bodyLeftLayer: BodyReferenceV2Layer | null;
  severity: "warn" | "fail";
}): BodyReferenceV2Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const bodyBounds = computePointBounds(args.bodyLeftLayer?.points);
  if (!bodyBounds) {
    return normalizeValidation({ errors, warnings });
  }

  for (const region of args.draft.blockedRegions ?? []) {
    const regionBounds = computePointBounds(region.points);
    if (!boundsOverlap(bodyBounds, regionBounds)) {
      continue;
    }
    const message = `BODY REFERENCE v2 blocked region ${region.id} overlaps the body-left outline.`;
    if (args.severity === "fail") {
      errors.push(message);
    } else {
      warnings.push(message);
    }
  }

  return normalizeValidation({ errors, warnings });
}

export function validateBodyReferenceV2GenerationSource(
  draft: BodyReferenceV2Draft,
  options: GenerationValidationOptions = {},
): BodyReferenceV2Validation {
  const bodyLeftLayer = findBodyLeftLayer(draft.layers);
  const mirrorPreview = buildMirroredBodyPreview(draft, {
    missingCenterlineSeverity: "fail",
    missingBodyLeftSeverity: "fail",
    missingLookupSeverity: "fail",
    symmetryTolerancePx: options.symmetryTolerancePx,
  });
  const centerlineValidation = validateCenterlineAxis(draft.centerline);
  const bodyLeftValidation = validateBodyLeftLayer(bodyLeftLayer, draft.centerline);
  const referenceLayerValidation = validateReferenceLayerSeparation(draft.layers);
  const symmetryValidation = validateMirroredBodySymmetry({
    centerline: draft.centerline,
    leftOutline: bodyLeftLayer?.points,
    mirroredRightOutline: mirrorPreview.mirroredRightOutline,
    tolerancePx: options.symmetryTolerancePx,
  });
  const blockedOverlapValidation = validateBlockedRegionOverlap({
    draft,
    bodyLeftLayer,
    severity: options.blockedOverlapSeverity ?? "fail",
  });
  const errors: string[] = [];
  const warnings: string[] = [];

  errors.push(
    ...centerlineValidation.errors,
    ...bodyLeftValidation.errors,
    ...referenceLayerValidation.errors,
    ...symmetryValidation.errors,
    ...blockedOverlapValidation.errors,
  );
  warnings.push(
    ...centerlineValidation.warnings,
    ...bodyLeftValidation.warnings,
    ...referenceLayerValidation.warnings,
    ...symmetryValidation.warnings,
    ...blockedOverlapValidation.warnings,
  );

  const diameterPx = computeDiameterPxFromCenterlineToLeftWall(draft.centerline, bodyLeftLayer?.points);
  const lookupDiameterMm = isFinitePositive(draft.scaleCalibration.lookupDiameterMm)
    ? draft.scaleCalibration.lookupDiameterMm
    : undefined;
  const mmPerPx = computeMmPerPxFromLookupDiameter(lookupDiameterMm, diameterPx);
  const wrapWidthMm = computeWrapWidthFromDiameter(lookupDiameterMm);

  if (!isFinitePositive(diameterPx)) {
    errors.push("BODY REFERENCE v2 diameterPx must resolve to a finite positive value.");
  }
  if (!isFinitePositive(mmPerPx)) {
    errors.push("BODY REFERENCE v2 mmPerPx must resolve from the lookup diameter.");
  }
  if (!isFinitePositive(wrapWidthMm)) {
    errors.push("BODY REFERENCE v2 wrapWidthMm must resolve from the lookup diameter.");
  }

  return mergeValidation(
    normalizeValidation({ errors, warnings }),
    normalizeValidation({
      errors: mirrorPreview.errors,
      warnings: mirrorPreview.warnings,
    }),
  );
}

export function summarizeBodyReferenceV2GenerationReadiness(
  draft: BodyReferenceV2Draft,
  options: GenerationValidationOptions = {},
): BodyReferenceV2GenerationReadinessSummary {
  const bodyLeftLayer = findBodyLeftLayer(draft.layers);
  const mirrorPreview = buildMirroredBodyPreview(draft, {
    missingCenterlineSeverity: "fail",
    missingBodyLeftSeverity: "fail",
    missingLookupSeverity: "fail",
    symmetryTolerancePx: options.symmetryTolerancePx,
  });
  const validation = validateBodyReferenceV2GenerationSource(draft, options);
  const hasGeometry = Boolean(draft.centerline) || Boolean(bodyLeftLayer?.points.length);
  const status: BodyReferenceV2GenerationReadinessSummary["status"] =
    validation.errors.length > 0
      ? "fail"
      : !hasGeometry
        ? "unknown"
        : "pass";

  return {
    status,
    ready: validation.errors.length === 0 && hasGeometry,
    centerlineCaptured: Boolean(draft.centerline),
    leftBodyPointCount: bodyLeftLayer?.points.length ?? 0,
    mirroredRightPointCount: mirrorPreview.mirroredRightPointCount,
    blockedRegionCount: draft.blockedRegions?.length ?? 0,
    lookupDiameterMm: isFinitePositive(draft.scaleCalibration.lookupDiameterMm)
      ? draft.scaleCalibration.lookupDiameterMm
      : undefined,
    diameterPx: mirrorPreview.diameterPx,
    mmPerPx: mirrorPreview.mmPerPx,
    wrapDiameterMm: isFinitePositive(draft.scaleCalibration.lookupDiameterMm)
      ? round4(draft.scaleCalibration.lookupDiameterMm)
      : undefined,
    wrapWidthMm: mirrorPreview.wrapWidthMm,
    warnings: validation.warnings,
    errors: validation.errors,
    isCurrentGenerationSource: false,
  };
}

export function isBodyReferenceV2GenerationReady(
  draft: BodyReferenceV2Draft,
  options: GenerationValidationOptions = {},
): boolean {
  return summarizeBodyReferenceV2GenerationReadiness(draft, options).ready;
}

export function buildBodyReferenceV2SourceHashPayload(
  source: BodyReferenceV2GenerationSource,
): Record<string, unknown> {
  return {
    version: 1,
    sourceMode: source.sourceMode,
    centerline: {
      id: source.centerline.id,
      xPx: round4(source.centerline.xPx),
      topYPx: round4(source.centerline.topYPx),
      bottomYPx: round4(source.centerline.bottomYPx),
      confidence: isFiniteNumber(source.centerline.confidence)
        ? round6(source.centerline.confidence)
        : null,
      source: source.centerline.source,
    },
    leftBodyOutline: normalizePoints(source.leftBodyOutline),
    mirroredRightOutline: normalizePoints(source.mirroredRightOutline),
    scaleCalibration: {
      scaleSource: source.scaleCalibration.scaleSource,
      lookupDiameterMm: round4(source.wrapDiameterMm),
      resolvedDiameterMm: isFinitePositive(source.scaleCalibration.resolvedDiameterMm)
        ? round4(source.scaleCalibration.resolvedDiameterMm)
        : round4(source.wrapDiameterMm),
      mmPerPx: round6(source.mmPerPx),
      wrapDiameterMm: round4(source.wrapDiameterMm),
      wrapWidthMm: round4(source.wrapWidthMm),
      expectedBodyHeightMm: isFinitePositive(source.scaleCalibration.expectedBodyHeightMm)
        ? round4(source.scaleCalibration.expectedBodyHeightMm)
        : null,
      expectedBodyWidthMm: isFinitePositive(source.scaleCalibration.expectedBodyWidthMm)
        ? round4(source.scaleCalibration.expectedBodyWidthMm)
        : round4(source.wrapDiameterMm),
    },
    blockedRegionCount: source.blockedRegionCount,
  };
}

export function buildBodyReferenceV2GenerationSource(
  draft: BodyReferenceV2Draft,
  options: GenerationValidationOptions = {},
): BodyReferenceV2GenerationSource | null {
  const readiness = summarizeBodyReferenceV2GenerationReadiness(draft, options);
  if (!readiness.ready || !draft.centerline) {
    return null;
  }

  const bodyLeftLayer = findBodyLeftLayer(draft.layers);
  const leftBodyOutline = normalizePoints(bodyLeftLayer?.points);
  const mirroredRightOutline = buildMirroredBodyPreview(draft, {
    missingCenterlineSeverity: "fail",
    missingBodyLeftSeverity: "fail",
    missingLookupSeverity: "fail",
    symmetryTolerancePx: options.symmetryTolerancePx,
  }).mirroredRightOutline;
  if (
    leftBodyOutline.length === 0 ||
    mirroredRightOutline.length === 0 ||
    !isFinitePositive(readiness.mmPerPx) ||
    !isFinitePositive(readiness.wrapDiameterMm) ||
    !isFinitePositive(readiness.wrapWidthMm)
  ) {
    return null;
  }

  const source: BodyReferenceV2GenerationSource = {
    sourceMode: "body-reference-v2",
    centerline: {
      ...draft.centerline,
    },
    leftBodyOutline,
    mirroredRightOutline,
    scaleCalibration: {
      ...draft.scaleCalibration,
      mmPerPx: round6(readiness.mmPerPx),
      wrapDiameterMm: round4(readiness.wrapDiameterMm),
      wrapWidthMm: round4(readiness.wrapWidthMm),
      resolvedDiameterMm: isFinitePositive(draft.scaleCalibration.resolvedDiameterMm)
        ? round4(draft.scaleCalibration.resolvedDiameterMm)
        : round4(readiness.wrapDiameterMm),
    },
    wrapWidthMm: round4(readiness.wrapWidthMm),
    wrapDiameterMm: round4(readiness.wrapDiameterMm),
    mmPerPx: round6(readiness.mmPerPx),
    sourceHashPayload: {},
    blockedRegionCount: draft.blockedRegions?.length ?? 0,
    warnings: readiness.warnings,
    errors: readiness.errors,
  };

  return {
    ...source,
    sourceHashPayload: buildBodyReferenceV2SourceHashPayload(source),
  };
}

export function buildBodyReferenceV2MirroredProfile(
  source: BodyReferenceV2GenerationSource,
): BodyReferenceV2MirroredProfile {
  const leftPoints = normalizePoints(source.leftBodyOutline)
    .sort((left, right) => left.yPx - right.yPx || left.xPx - right.xPx);
  const rightPoints = normalizePoints(source.mirroredRightOutline)
    .sort((left, right) => left.yPx - right.yPx || left.xPx - right.xPx);
  const minYPx = Math.min(...leftPoints.map((point) => point.yPx));
  const maxYPx = Math.max(...leftPoints.map((point) => point.yPx));
  const profileHeightPx = Math.max(0, maxYPx - minYPx);
  const bodyHeightMm = round4(profileHeightPx * source.mmPerPx);

  return {
    bodyHeightMm,
    minYPx: round4(minYPx),
    maxYPx: round4(maxYPx),
    samples: leftPoints.map((leftPoint, index) => {
      const rightPoint = rightPoints[index] ?? {
        xPx: round4((source.centerline.xPx * 2) - leftPoint.xPx),
        yPx: leftPoint.yPx,
      };
      const radiusPx = round4(source.centerline.xPx - leftPoint.xPx);
      const yMm = round4((leftPoint.yPx - minYPx) * source.mmPerPx);
      return {
        index,
        yPx: round4(leftPoint.yPx),
        yMm,
        xLeftPx: round4(leftPoint.xPx),
        xRightPx: round4(rightPoint.xPx),
        xLeftMm: round4((leftPoint.xPx - source.centerline.xPx) * source.mmPerPx),
        xRightMm: round4((rightPoint.xPx - source.centerline.xPx) * source.mmPerPx),
        radiusPx,
        radiusMm: round4(radiusPx * source.mmPerPx),
      };
    }),
  };
}
