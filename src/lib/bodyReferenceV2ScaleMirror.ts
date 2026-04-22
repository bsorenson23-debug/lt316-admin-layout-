import type {
  BodyReferenceV2Draft,
  BodyReferenceV2Layer,
  BodyReferenceV2Point,
  BodyReferenceV2Validation,
  CenterlineAxis,
} from "./bodyReferenceV2Layers.ts";
import type { DimensionAuthority } from "@/types/tumblerItemLookup";
import {
  validateBodyLeftLayer,
  validateCenterlineAxis,
} from "./bodyReferenceV2Layers.ts";

export interface LookupDiameterScaleValidation {
  status: "pass" | "warn" | "fail";
  diameterPx?: number;
  mmPerPx?: number;
  wrapWidthMm?: number;
  warnings: string[];
  errors: string[];
}

export interface BodyReferenceV2ScaleMirrorPreview {
  status: "pass" | "warn" | "fail" | "unknown";
  centerline: CenterlineAxis | null;
  leftBodyPointCount: number;
  mirroredRightPointCount: number;
  lookupDiameterMm?: number;
  lookupVariantLabel?: string;
  lookupSizeOz?: number;
  lookupDimensionAuthority?: DimensionAuthority;
  lookupFullProductHeightMm?: number;
  lookupBodyHeightMm?: number;
  lookupHeightIgnoredForScale?: boolean;
  diameterPx?: number;
  mmPerPx?: number;
  wrapWidthMm?: number;
  mirroredRightOutline: BodyReferenceV2Point[];
  warnings: string[];
  errors: string[];
  isCurrentGenerationSource: false;
}

export interface BodyReferenceV2ScaleMirrorOptions {
  missingCenterlineSeverity?: "warn" | "fail";
  missingBodyLeftSeverity?: "warn" | "fail";
  missingLookupSeverity?: "warn" | "fail";
  symmetryTolerancePx?: number;
  wrapWidthToleranceMm?: number;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isFinitePositive(value: number | null | undefined): value is number {
  return isFiniteNumber(value) && value > 0;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
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

function pushMissingMessage(args: {
  severity: "warn" | "fail";
  message: string;
  errors: string[];
  warnings: string[];
}) {
  if (args.severity === "fail") {
    args.errors.push(args.message);
    return;
  }
  args.warnings.push(args.message);
}

function findBodyLeftLayer(
  layers: readonly BodyReferenceV2Layer[] | null | undefined,
): BodyReferenceV2Layer | null {
  return (layers ?? []).find((layer) => layer.kind === "body-left") ?? null;
}

function hasFinitePoints(points: readonly BodyReferenceV2Point[] | null | undefined): boolean {
  return Boolean(
    points &&
    points.length > 0 &&
    points.every((point) => isFiniteNumber(point.xPx) && isFiniteNumber(point.yPx)),
  );
}

export function computeDiameterPxFromCenterlineToLeftWall(
  centerline: CenterlineAxis | null | undefined,
  leftOutline: readonly BodyReferenceV2Point[] | null | undefined,
): number | undefined {
  if (!centerline || !hasFinitePoints(leftOutline)) {
    return undefined;
  }

  const normalizedLeftOutline = leftOutline ?? [];
  const minLeftX = Math.min(...normalizedLeftOutline.map((point) => point.xPx));
  return round4((centerline.xPx - minLeftX) * 2);
}

export function computeMmPerPxFromLookupDiameter(
  lookupDiameterMm: number | null | undefined,
  diameterPx: number | null | undefined,
): number | undefined {
  if (!isFinitePositive(lookupDiameterMm) || !isFinitePositive(diameterPx)) {
    return undefined;
  }
  return round6(lookupDiameterMm / diameterPx);
}

export function computeWrapWidthFromDiameter(
  diameterMm: number | null | undefined,
): number | undefined {
  if (!isFinitePositive(diameterMm)) {
    return undefined;
  }
  return round4(Math.PI * diameterMm);
}

export function validateLookupDiameterScale(args: {
  centerline: CenterlineAxis | null | undefined;
  bodyLeftLayer: BodyReferenceV2Layer | null | undefined;
  scaleCalibration: BodyReferenceV2Draft["scaleCalibration"] | null | undefined;
  options?: BodyReferenceV2ScaleMirrorOptions;
}): LookupDiameterScaleValidation {
  const options = args.options ?? {};
  const errors: string[] = [];
  const warnings: string[] = [];

  const centerline = args.centerline ?? null;
  const bodyLeftLayer = args.bodyLeftLayer ?? null;
  const scaleCalibration = args.scaleCalibration ?? { scaleSource: "unknown" as const };

  if (!centerline) {
    pushMissingMessage({
      severity: options.missingCenterlineSeverity ?? "warn",
      message: "BODY REFERENCE v2 centerline is not captured for scale calibration.",
      errors,
      warnings,
    });
  } else {
    const centerlineValidation = validateCenterlineAxis(centerline);
    errors.push(...centerlineValidation.errors);
    warnings.push(...centerlineValidation.warnings);
  }

  if (!bodyLeftLayer || bodyLeftLayer.points.length === 0) {
    pushMissingMessage({
      severity: options.missingBodyLeftSeverity ?? "warn",
      message: "BODY REFERENCE v2 body-left outline is not captured for mirror preview.",
      errors,
      warnings,
    });
  } else {
    const bodyLeftValidation = validateBodyLeftLayer(bodyLeftLayer, centerline);
    errors.push(...bodyLeftValidation.errors);
    warnings.push(...bodyLeftValidation.warnings);
  }

  const lookupDiameterMm = isFinitePositive(scaleCalibration.lookupDiameterMm)
    ? scaleCalibration.lookupDiameterMm
    : undefined;
  if (!lookupDiameterMm) {
    pushMissingMessage({
      severity: options.missingLookupSeverity ?? "warn",
      message: "BODY REFERENCE v2 lookup diameter is not configured for scale calibration.",
      errors,
      warnings,
    });
  }

  warnings.push(...normalizeMessages(scaleCalibration.lookupWarnings ?? []));
  errors.push(...normalizeMessages(scaleCalibration.lookupErrors ?? []));

  if (scaleCalibration.mmPerPx != null && !isFinitePositive(scaleCalibration.mmPerPx)) {
    errors.push("BODY REFERENCE v2 mmPerPx must be finite and positive when provided.");
  }

  const diameterPx = computeDiameterPxFromCenterlineToLeftWall(centerline, bodyLeftLayer?.points);
  if (diameterPx != null && !isFinitePositive(diameterPx)) {
    errors.push("BODY REFERENCE v2 diameterPx must be finite and positive.");
  }

  const mmPerPx = computeMmPerPxFromLookupDiameter(lookupDiameterMm, diameterPx);
  if (lookupDiameterMm && diameterPx && !isFinitePositive(mmPerPx)) {
    errors.push("BODY REFERENCE v2 mmPerPx must resolve to a finite positive value.");
  }

  const wrapWidthMm = computeWrapWidthFromDiameter(lookupDiameterMm);
  if (lookupDiameterMm && !isFinitePositive(wrapWidthMm)) {
    errors.push("BODY REFERENCE v2 wrapWidthMm must resolve to a finite positive value.");
  }

  if (lookupDiameterMm && wrapWidthMm && isFinitePositive(scaleCalibration.wrapWidthMm)) {
    const toleranceMm = options.wrapWidthToleranceMm ?? 0.25;
    const expectedWrapWidthMm = Math.PI * lookupDiameterMm;
    if (Math.abs(scaleCalibration.wrapWidthMm - expectedWrapWidthMm) > toleranceMm) {
      errors.push("BODY REFERENCE v2 wrapWidthMm does not match Math.PI * lookup diameter within tolerance.");
    }
  }

  if (
    isFinitePositive(scaleCalibration.lookupBodyHeightMm) &&
    isFinitePositive(scaleCalibration.expectedBodyHeightMm) &&
    Math.abs(scaleCalibration.lookupBodyHeightMm - scaleCalibration.expectedBodyHeightMm) > 5
  ) {
    warnings.push(
      "Lookup body height differs from the current body contour height. Diameter remains the scale authority.",
    );
  }

  const validation = normalizeValidation({ errors, warnings });
  return {
    status: validation.status,
    diameterPx,
    mmPerPx,
    wrapWidthMm,
    warnings: validation.warnings,
    errors: validation.errors,
  };
}

export function mirrorLeftOutlineAcrossCenterline(
  centerline: CenterlineAxis | null | undefined,
  leftOutline: readonly BodyReferenceV2Point[] | null | undefined,
): BodyReferenceV2Point[] {
  if (!centerline || !hasFinitePoints(leftOutline)) {
    return [];
  }

  const normalizedLeftOutline = leftOutline ?? [];
  return normalizedLeftOutline.map((point) => ({
    xPx: round4((centerline.xPx * 2) - point.xPx),
    yPx: round4(point.yPx),
  }));
}

export function validateMirroredBodySymmetry(args: {
  centerline: CenterlineAxis | null | undefined;
  leftOutline: readonly BodyReferenceV2Point[] | null | undefined;
  mirroredRightOutline: readonly BodyReferenceV2Point[] | null | undefined;
  tolerancePx?: number;
}): BodyReferenceV2Validation {
  const centerline = args.centerline ?? null;
  const leftOutline = args.leftOutline ?? [];
  const mirroredRightOutline = args.mirroredRightOutline ?? [];
  const tolerancePx = isFinitePositive(args.tolerancePx) ? args.tolerancePx : 0.01;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!centerline) {
    warnings.push("BODY REFERENCE v2 mirror preview cannot validate symmetry until a centerline is captured.");
    return normalizeValidation({ errors, warnings });
  }

  if (!hasFinitePoints(leftOutline)) {
    warnings.push("BODY REFERENCE v2 mirror preview cannot validate symmetry until a body-left outline is captured.");
    return normalizeValidation({ errors, warnings });
  }

  if (!hasFinitePoints(mirroredRightOutline)) {
    warnings.push("BODY REFERENCE v2 mirrored-right preview is not available.");
    return normalizeValidation({ errors, warnings });
  }

  const normalizedLeftOutline = leftOutline ?? [];
  const normalizedMirroredRightOutline = mirroredRightOutline ?? [];

  if (normalizedLeftOutline.length !== normalizedMirroredRightOutline.length) {
    errors.push("BODY REFERENCE v2 mirrored-right preview must keep the same point count as body-left.");
    return normalizeValidation({ errors, warnings });
  }

  for (let index = 0; index < normalizedLeftOutline.length; index += 1) {
    const leftPoint = normalizedLeftOutline[index]!;
    const rightPoint = normalizedMirroredRightOutline[index]!;
    const expectedRightX = (centerline.xPx * 2) - leftPoint.xPx;
    if (Math.abs(rightPoint.xPx - expectedRightX) > tolerancePx) {
      errors.push(`BODY REFERENCE v2 mirrored-right point ${index} is not symmetric around the centerline.`);
      break;
    }
    if (Math.abs(rightPoint.yPx - leftPoint.yPx) > tolerancePx) {
      errors.push(`BODY REFERENCE v2 mirrored-right point ${index} does not preserve y alignment.`);
      break;
    }
    if (rightPoint.xPx <= centerline.xPx) {
      errors.push("BODY REFERENCE v2 mirrored-right preview must stay on the right side of the centerline.");
      break;
    }
  }

  return normalizeValidation({ errors, warnings });
}

export function buildMirroredBodyPreview(
  draft: BodyReferenceV2Draft,
  options: BodyReferenceV2ScaleMirrorOptions = {},
): BodyReferenceV2ScaleMirrorPreview {
  const bodyLeftLayer = findBodyLeftLayer(draft.layers);
  const scaleValidation = validateLookupDiameterScale({
    centerline: draft.centerline,
    bodyLeftLayer,
    scaleCalibration: draft.scaleCalibration,
    options,
  });

  const centerlineValidation = draft.centerline
    ? validateCenterlineAxis(draft.centerline)
    : normalizeValidation({ warnings: [] });
  const bodyLeftValidation = bodyLeftLayer
    ? validateBodyLeftLayer(bodyLeftLayer, draft.centerline)
    : normalizeValidation({ warnings: [] });
  const hasUsableGeometry =
    Boolean(draft.centerline) &&
    Boolean(bodyLeftLayer) &&
    centerlineValidation.errors.length === 0 &&
    bodyLeftValidation.errors.length === 0;

  const mirroredRightOutline = hasUsableGeometry
    ? mirrorLeftOutlineAcrossCenterline(draft.centerline, bodyLeftLayer?.points)
    : [];
  const symmetryValidation = validateMirroredBodySymmetry({
    centerline: draft.centerline,
    leftOutline: bodyLeftLayer?.points,
    mirroredRightOutline,
    tolerancePx: options.symmetryTolerancePx,
  });
  const combinedValidation = mergeValidation(
    normalizeValidation({
      errors: scaleValidation.errors,
      warnings: scaleValidation.warnings,
    }),
    symmetryValidation,
  );

  const hasAnyV2Geometry = Boolean(draft.centerline) || Boolean(bodyLeftLayer?.points.length);
  const lookupDiameterMm = isFinitePositive(draft.scaleCalibration.lookupDiameterMm)
    ? draft.scaleCalibration.lookupDiameterMm
    : undefined;
  const status: BodyReferenceV2ScaleMirrorPreview["status"] =
    combinedValidation.errors.length > 0
      ? "fail"
      : !hasAnyV2Geometry
        ? "unknown"
        : combinedValidation.warnings.length > 0
          ? "warn"
          : "pass";

  return {
    status,
    centerline: draft.centerline ?? null,
    leftBodyPointCount: bodyLeftLayer?.points.length ?? 0,
    mirroredRightPointCount: mirroredRightOutline.length,
    lookupDiameterMm,
    lookupVariantLabel: draft.scaleCalibration.lookupVariantLabel,
    lookupSizeOz: isFinitePositive(draft.scaleCalibration.lookupSizeOz)
      ? draft.scaleCalibration.lookupSizeOz
      : undefined,
    lookupDimensionAuthority: draft.scaleCalibration.lookupDimensionAuthority,
    lookupFullProductHeightMm: isFinitePositive(draft.scaleCalibration.lookupFullProductHeightMm)
      ? draft.scaleCalibration.lookupFullProductHeightMm
      : undefined,
    lookupBodyHeightMm: isFinitePositive(draft.scaleCalibration.lookupBodyHeightMm)
      ? draft.scaleCalibration.lookupBodyHeightMm
      : undefined,
    lookupHeightIgnoredForScale: draft.scaleCalibration.lookupHeightIgnoredForScale === true,
    diameterPx: scaleValidation.diameterPx,
    mmPerPx: scaleValidation.mmPerPx,
    wrapWidthMm: scaleValidation.wrapWidthMm,
    mirroredRightOutline,
    warnings: combinedValidation.warnings,
    errors: combinedValidation.errors,
    isCurrentGenerationSource: false,
  };
}

export function summarizeBodyReferenceV2ScaleMirrorPreview(
  draft: BodyReferenceV2Draft,
  options: BodyReferenceV2ScaleMirrorOptions = {},
): BodyReferenceV2ScaleMirrorPreview {
  return buildMirroredBodyPreview(draft, options);
}
