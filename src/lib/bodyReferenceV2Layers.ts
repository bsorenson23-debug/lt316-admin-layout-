import type { DimensionAuthority } from "@/types/tumblerItemLookup";

export type BodyReferenceV2LayerKind =
  | "centerline"
  | "body-left"
  | "body-right-mirrored"
  | "lid-reference"
  | "handle-reference"
  | "blocked-region";

export type BodyReferenceV2ScaleSource =
  | "lookup-diameter"
  | "manual-diameter"
  | "svg-viewbox"
  | "unknown";

export type BodyReferenceV2LookupScaleStatus =
  | "pass"
  | "warn"
  | "fail"
  | "unknown";

export interface CenterlineAxis {
  id: string;
  xPx: number;
  topYPx: number;
  bottomYPx: number;
  confidence?: number;
  source: "operator" | "auto-detect" | "unknown";
}

export interface BodyReferenceV2Point {
  xPx: number;
  yPx: number;
}

export interface BodyReferenceV2Layer {
  id: string;
  kind: BodyReferenceV2LayerKind;
  points: BodyReferenceV2Point[];
  closed: boolean;
  editable: boolean;
  visible: boolean;
  referenceOnly: boolean;
  includedInBodyCutoutQa: boolean;
}

export interface BodyReferenceV2ScaleCalibration {
  scaleSource: BodyReferenceV2ScaleSource;
  lookupDiameterMm?: number;
  resolvedDiameterMm?: number;
  mmPerPx?: number;
  wrapDiameterMm?: number;
  wrapWidthMm?: number;
  expectedBodyHeightMm?: number;
  expectedBodyWidthMm?: number;
  lookupVariantLabel?: string;
  lookupSizeOz?: number;
  lookupDimensionAuthority?: DimensionAuthority;
  lookupScaleStatus?: BodyReferenceV2LookupScaleStatus;
  lookupFullProductHeightMm?: number;
  lookupBodyHeightMm?: number;
  lookupHeightIgnoredForScale?: boolean;
  lookupWarnings?: string[];
  lookupErrors?: string[];
}

export interface BlockedBodyRegion {
  id: string;
  reason: "handle-overlap" | "lid-overlap" | "manual-mask" | "unknown";
  points: BodyReferenceV2Point[];
}

export interface BodyReferenceV2Draft {
  sourceImageUrl?: string;
  centerline: CenterlineAxis | null;
  layers: BodyReferenceV2Layer[];
  blockedRegions: BlockedBodyRegion[];
  scaleCalibration: BodyReferenceV2ScaleCalibration;
}

export interface BodyReferenceV2Validation {
  status: "pass" | "warn" | "fail";
  errors: string[];
  warnings: string[];
}

export interface BodyReferenceV2DraftSummary {
  status: BodyReferenceV2Validation["status"];
  configured: boolean;
  totalLayerCount: number;
  centerlineCaptured: boolean;
  bodyLeftCaptured: boolean;
  bodyRightMirroredPresent: boolean;
  lidReferenceCount: number;
  handleReferenceCount: number;
  blockedRegionCount: number;
  referenceOnlyLayerCount: number;
  lookupDiameterPresent: boolean;
  scaleSource: BodyReferenceV2ScaleSource;
  currentGenerationSource: false;
  v1BodyCutoutQaRemainsActive: true;
  validation: BodyReferenceV2Validation;
}

interface ValidateBlockedRegionsOptions {
  invalidSeverity?: "warn" | "fail";
}

interface DraftValidationOptions extends ValidateBlockedRegionsOptions {}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizePoints(points: readonly BodyReferenceV2Point[] | null | undefined): BodyReferenceV2Point[] {
  return (points ?? []).map((point) => ({
    xPx: point.xPx,
    yPx: point.yPx,
  }));
}

function normalizeValidation(args: {
  errors?: readonly string[] | null;
  warnings?: readonly string[] | null;
}): BodyReferenceV2Validation {
  const errors = [...new Set((args.errors ?? []).map((value) => value.trim()).filter(Boolean))];
  const warnings = [...new Set((args.warnings ?? []).map((value) => value.trim()).filter(Boolean))];
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

function isReferenceOnlyLayerKind(kind: BodyReferenceV2LayerKind): boolean {
  return kind === "centerline" || kind === "lid-reference" || kind === "handle-reference" || kind === "blocked-region";
}

function isFutureBodyTruthLayerKind(kind: BodyReferenceV2LayerKind): boolean {
  return kind === "body-left" || kind === "body-right-mirrored";
}

function isDerivedReadOnlyLayerKind(kind: BodyReferenceV2LayerKind): boolean {
  return kind === "body-right-mirrored";
}

function labelForLayerKind(kind: BodyReferenceV2LayerKind): string {
  switch (kind) {
    case "centerline":
      return "centerline";
    case "body-left":
      return "body-left";
    case "body-right-mirrored":
      return "body-right-mirrored";
    case "lid-reference":
      return "lid-reference";
    case "handle-reference":
      return "handle-reference";
    case "blocked-region":
      return "blocked-region";
    default:
      return kind;
  }
}

export function createCenterlineAxis(args: CenterlineAxis): CenterlineAxis {
  return {
    id: args.id,
    xPx: args.xPx,
    topYPx: args.topYPx,
    bottomYPx: args.bottomYPx,
    confidence: args.confidence,
    source: args.source,
  };
}

export function createBodyReferenceV2Layer(
  args: Pick<BodyReferenceV2Layer, "id" | "kind"> & Partial<Omit<BodyReferenceV2Layer, "id" | "kind">>,
): BodyReferenceV2Layer {
  const referenceOnly = args.referenceOnly ?? isReferenceOnlyLayerKind(args.kind);
  const includedInBodyCutoutQa = args.includedInBodyCutoutQa ?? isFutureBodyTruthLayerKind(args.kind);
  const editable = args.editable ?? !isDerivedReadOnlyLayerKind(args.kind);
  const closed = args.closed ?? args.kind === "blocked-region";

  return {
    id: args.id,
    kind: args.kind,
    points: normalizePoints(args.points),
    closed,
    editable,
    visible: args.visible ?? true,
    referenceOnly,
    includedInBodyCutoutQa,
  };
}

export function isBodyReferenceV2LayerReferenceOnly(layer: BodyReferenceV2Layer): boolean {
  return layer.referenceOnly === true;
}

export function isBodyReferenceV2LayerIncludedInBodyCutoutQa(layer: BodyReferenceV2Layer): boolean {
  return layer.includedInBodyCutoutQa === true;
}

export function validateCenterlineAxis(centerline: CenterlineAxis | null | undefined): BodyReferenceV2Validation {
  if (!centerline) {
    return normalizeValidation({
      warnings: ["BODY REFERENCE v2 centerline is not configured."],
    });
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isFiniteNumber(centerline.xPx)) {
    errors.push("BODY REFERENCE v2 centerline xPx must be a finite number.");
  }
  if (!isFiniteNumber(centerline.topYPx) || !isFiniteNumber(centerline.bottomYPx)) {
    errors.push("BODY REFERENCE v2 centerline top/bottom Y must be finite numbers.");
  } else if (centerline.bottomYPx <= centerline.topYPx) {
    errors.push("BODY REFERENCE v2 centerline bottomYPx must be greater than topYPx.");
  }
  if (centerline.confidence != null && (!isFiniteNumber(centerline.confidence) || centerline.confidence < 0 || centerline.confidence > 1)) {
    warnings.push("BODY REFERENCE v2 centerline confidence should stay between 0 and 1.");
  }

  return normalizeValidation({ errors, warnings });
}

export function validateBodyLeftLayer(
  layer: BodyReferenceV2Layer | null | undefined,
  centerline: CenterlineAxis | null | undefined,
): BodyReferenceV2Validation {
  if (!layer) {
    return normalizeValidation({
      warnings: ["BODY REFERENCE v2 body-left layer is not configured."],
    });
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  if (layer.kind !== "body-left") {
    errors.push(`Expected body-left layer, received ${labelForLayerKind(layer.kind)}.`);
  }
  if (layer.points.length < 2) {
    errors.push("BODY REFERENCE v2 body-left layer needs at least two points.");
  }
  for (const point of layer.points) {
    if (!isFiniteNumber(point.xPx) || !isFiniteNumber(point.yPx)) {
      errors.push("BODY REFERENCE v2 body-left layer points must contain finite x/y values.");
      break;
    }
  }
  if (layer.referenceOnly) {
    warnings.push("BODY REFERENCE v2 body-left should stay future body truth, not reference-only.");
  }
  if (!centerline) {
    warnings.push("BODY REFERENCE v2 body-left cannot be checked for centerline crossing until a centerline is configured.");
  } else if (layer.points.some((point) => point.xPx > centerline.xPx)) {
    errors.push("BODY REFERENCE v2 body-left crosses the centerline.");
  }

  return normalizeValidation({ errors, warnings });
}

export function validateReferenceLayerSeparation(
  layers: readonly BodyReferenceV2Layer[] | null | undefined,
): BodyReferenceV2Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const normalizedLayers = layers ?? [];
  const lidLayers = normalizedLayers.filter((layer) => layer.kind === "lid-reference");
  const handleLayers = normalizedLayers.filter((layer) => layer.kind === "handle-reference");

  if (lidLayers.length === 0) {
    warnings.push("BODY REFERENCE v2 lid-reference layer is missing.");
  }
  if (handleLayers.length === 0) {
    warnings.push("BODY REFERENCE v2 handle-reference layer is missing.");
  }

  for (const layer of normalizedLayers) {
    if (isReferenceOnlyLayerKind(layer.kind) && !layer.referenceOnly) {
      errors.push(`${labelForLayerKind(layer.kind)} must stay reference-only.`);
    }
    if (isReferenceOnlyLayerKind(layer.kind) && layer.includedInBodyCutoutQa) {
      errors.push(`${labelForLayerKind(layer.kind)} must remain excluded from BODY CUTOUT QA.`);
    }
    if (isDerivedReadOnlyLayerKind(layer.kind) && layer.editable) {
      errors.push("body-right-mirrored must stay read-only.");
    }
  }

  return normalizeValidation({ errors, warnings });
}

export function validateBlockedRegions(
  blockedRegions: readonly BlockedBodyRegion[] | null | undefined,
  options: ValidateBlockedRegionsOptions = {},
): BodyReferenceV2Validation {
  const invalidSeverity = options.invalidSeverity ?? "warn";
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const region of blockedRegions ?? []) {
    const regionErrors: string[] = [];
    if (normalizePoints(region.points).length < 3) {
      regionErrors.push(`Blocked region ${region.id} needs at least three points.`);
    }
    if (region.points.some((point) => !isFiniteNumber(point.xPx) || !isFiniteNumber(point.yPx))) {
      regionErrors.push(`Blocked region ${region.id} contains non-finite points.`);
    }

    if (regionErrors.length > 0) {
      if (invalidSeverity === "fail") {
        errors.push(...regionErrors);
      } else {
        warnings.push(...regionErrors);
      }
    }
  }

  return normalizeValidation({ errors, warnings });
}

export function validateBodyReferenceV2Draft(
  draft: BodyReferenceV2Draft,
  options: DraftValidationOptions = {},
): BodyReferenceV2Validation {
  const normalizedDraft: BodyReferenceV2Draft = {
    sourceImageUrl: draft.sourceImageUrl,
    centerline: draft.centerline,
    layers: draft.layers ?? [],
    blockedRegions: draft.blockedRegions ?? [],
    scaleCalibration: draft.scaleCalibration ?? { scaleSource: "unknown" },
  };
  const bodyLeftLayer = normalizedDraft.layers.find((layer) => layer.kind === "body-left") ?? null;
  const validations = [
    validateCenterlineAxis(normalizedDraft.centerline),
    validateBodyLeftLayer(bodyLeftLayer, normalizedDraft.centerline),
    validateReferenceLayerSeparation(normalizedDraft.layers),
    validateBlockedRegions(normalizedDraft.blockedRegions, options),
  ];

  const configured = Boolean(
    normalizedDraft.centerline ||
    normalizedDraft.layers.length > 0 ||
    normalizedDraft.blockedRegions.length > 0,
  );
  const warnings: string[] = [];

  if (!configured) {
    warnings.push("BODY REFERENCE v2 semantic layers are not configured yet.");
  }
  if (!isFiniteNumber(normalizedDraft.scaleCalibration.lookupDiameterMm) || normalizedDraft.scaleCalibration.lookupDiameterMm <= 0) {
    warnings.push("BODY REFERENCE v2 lookup diameter is not configured.");
  }

  return mergeValidation(...validations, normalizeValidation({ warnings }));
}

export function summarizeBodyReferenceV2Draft(
  draft: BodyReferenceV2Draft,
): BodyReferenceV2DraftSummary {
  const layers = draft.layers ?? [];
  const validation = validateBodyReferenceV2Draft(draft);

  return {
    status: validation.status,
    configured: Boolean(draft.centerline || layers.length > 0 || (draft.blockedRegions?.length ?? 0) > 0),
    totalLayerCount: layers.length,
    centerlineCaptured: Boolean(draft.centerline),
    bodyLeftCaptured: layers.some((layer) => layer.kind === "body-left" && layer.points.length > 0),
    bodyRightMirroredPresent: layers.some((layer) => layer.kind === "body-right-mirrored"),
    lidReferenceCount: layers.filter((layer) => layer.kind === "lid-reference").length,
    handleReferenceCount: layers.filter((layer) => layer.kind === "handle-reference").length,
    blockedRegionCount: draft.blockedRegions?.length ?? 0,
    referenceOnlyLayerCount: layers.filter((layer) => layer.referenceOnly).length,
    lookupDiameterPresent: isFiniteNumber(draft.scaleCalibration.lookupDiameterMm) && draft.scaleCalibration.lookupDiameterMm > 0,
    scaleSource: draft.scaleCalibration.scaleSource,
    currentGenerationSource: false,
    v1BodyCutoutQaRemainsActive: true,
    validation,
  };
}
