export type MappingFreshness = "fresh" | "stale" | "unknown";
export type SurfaceMappingMode = "cylindrical-v1";
export type LaserBedSurfaceMappingStatus = "pass" | "warn" | "fail" | "unknown";

export interface LaserBedArtworkPlacementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LaserBedArtworkPlacementAssetSnapshot {
  svgText?: string;
  sourceSvgText?: string;
  documentBounds?: LaserBedArtworkPlacementBounds;
  artworkBounds?: LaserBedArtworkPlacementBounds;
}

export interface LaserBedArtworkPlacement {
  id: string;
  assetId?: string;
  svgAssetId?: string;
  name?: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotationDeg?: number;
  layerId?: string;
  layerName?: string;
  visible?: boolean;
  mappingSignature?: string;
  assetSnapshot?: LaserBedArtworkPlacementAssetSnapshot;
}

export interface LaserBedSurfaceBodyBounds {
  width: number;
  height: number;
  depth: number;
}

export interface LaserBedSurfaceMapping {
  mode: SurfaceMappingMode;
  wrapDiameterMm?: number;
  wrapWidthMm?: number;
  printableTopMm?: number;
  printableBottomMm?: number;
  printableHeightMm?: number;
  expectedBodyWidthMm?: number;
  expectedBodyHeightMm?: number;
  bodyBounds?: LaserBedSurfaceBodyBounds;
  scaleSource?: string;
  seamAngleDeg?: number;
  frontCenterAngleDeg?: number;
  sourceHash?: string;
  glbSourceHash?: string;
}

export interface EngravingPreviewMaterial {
  key: "unknown";
  label: string;
}

export interface TemplateEngravingPreviewState {
  mode: SurfaceMappingMode;
  status: LaserBedSurfaceMappingStatus;
  freshness: MappingFreshness;
  readyForPreview: boolean;
  readyForExactPlacement: boolean;
  isBodyCutoutQaProof: false;
  mappingSignature?: string;
  material: EngravingPreviewMaterial;
  mapping: LaserBedSurfaceMapping | null;
  placements: LaserBedArtworkPlacement[];
  warnings: string[];
  errors: string[];
}

export interface LaserBedArtworkPlacementValidation {
  status: LaserBedSurfaceMappingStatus;
  freshness: MappingFreshness;
  isBodyCutoutQaProof: false;
  insidePrintableArea: boolean;
  wrapStartAngleDeg?: number;
  wrapEndAngleDeg?: number;
  bodyTopMm?: number;
  bodyBottomMm?: number;
  warnings: string[];
  errors: string[];
}

export interface LaserBedSurfaceMappingFreshnessResult {
  freshness: MappingFreshness;
  reason:
    | "signature-match"
    | "signature-mismatch"
    | "source-lineage-match"
    | "source-lineage-mismatch"
    | "insufficient-data";
}

interface WrapAngleArgs {
  xMm: number;
  wrapWidthMm: number;
  seamAngleDeg?: number | null;
  frontCenterAngleDeg?: number | null;
}

interface BodyHeightArgs {
  yMm: number;
  printableHeightMm: number;
  printableTopMm?: number | null;
}

interface ValidateSurfaceMappingArgs {
  mapping: LaserBedSurfaceMapping | null | undefined;
  placements?: readonly LaserBedArtworkPlacement[] | null;
  savedSignature?: string | null;
  material?: EngravingPreviewMaterial | null;
}

interface ValidateArtworkPlacementArgs {
  placement: LaserBedArtworkPlacement;
  mapping: LaserBedSurfaceMapping | null | undefined;
  savedSignature?: string | null;
}

const DEFAULT_PREVIEW_MATERIAL: EngravingPreviewMaterial = {
  key: "unknown",
  label: "Unknown",
};

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isFinitePositive(value: number | null | undefined): value is number {
  return isFiniteNumber(value) && value > 0;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function normalizeAngleDeg(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function normalizeSignedAngleDeg(value: number): number {
  const normalized = normalizeAngleDeg(value);
  return normalized >= 180 ? normalized - 360 : normalized;
}

function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function computeWrapAngleFromXMm(args: WrapAngleArgs): {
  angleDeg: number;
  frontRelativeAngleDeg: number | null;
  normalizedWrapX: number;
} {
  const seamAngleDeg = isFiniteNumber(args.seamAngleDeg) ? args.seamAngleDeg : 0;
  const normalizedWrapX = isFinitePositive(args.wrapWidthMm)
    ? args.xMm / args.wrapWidthMm
    : 0;
  const angleDeg = normalizeAngleDeg(seamAngleDeg + (normalizedWrapX * 360));
  return {
    angleDeg: round4(angleDeg),
    frontRelativeAngleDeg: isFiniteNumber(args.frontCenterAngleDeg)
      ? round4(normalizeSignedAngleDeg(angleDeg - args.frontCenterAngleDeg))
      : null,
    normalizedWrapX: round4(normalizedWrapX),
  };
}

export function computeBodyHeightFromYMm(args: BodyHeightArgs): {
  bodyHeightMm: number;
  normalizedHeight: number;
} {
  const printableTopMm = isFiniteNumber(args.printableTopMm) ? args.printableTopMm : 0;
  const normalizedHeight = isFinitePositive(args.printableHeightMm)
    ? args.yMm / args.printableHeightMm
    : 0;
  return {
    bodyHeightMm: round4(printableTopMm + args.yMm),
    normalizedHeight: round4(normalizedHeight),
  };
}

export function buildLaserBedSurfaceMappingSignature(
  mapping: LaserBedSurfaceMapping | null | undefined,
): string {
  if (!mapping) return "laser-bed-surface-mapping:null";

  const payload = {
    mode: mapping.mode,
    wrapDiameterMm: isFiniteNumber(mapping.wrapDiameterMm) ? round4(mapping.wrapDiameterMm) : null,
    wrapWidthMm: isFiniteNumber(mapping.wrapWidthMm) ? round4(mapping.wrapWidthMm) : null,
    printableTopMm: isFiniteNumber(mapping.printableTopMm) ? round4(mapping.printableTopMm) : null,
    printableBottomMm: isFiniteNumber(mapping.printableBottomMm) ? round4(mapping.printableBottomMm) : null,
    printableHeightMm: isFiniteNumber(mapping.printableHeightMm) ? round4(mapping.printableHeightMm) : null,
    expectedBodyWidthMm: isFiniteNumber(mapping.expectedBodyWidthMm) ? round4(mapping.expectedBodyWidthMm) : null,
    expectedBodyHeightMm: isFiniteNumber(mapping.expectedBodyHeightMm) ? round4(mapping.expectedBodyHeightMm) : null,
    bodyBounds: mapping.bodyBounds
      ? {
          width: round4(mapping.bodyBounds.width),
          height: round4(mapping.bodyBounds.height),
          depth: round4(mapping.bodyBounds.depth),
        }
      : null,
    scaleSource: mapping.scaleSource ?? null,
    seamAngleDeg: isFiniteNumber(mapping.seamAngleDeg) ? round4(mapping.seamAngleDeg) : null,
    frontCenterAngleDeg: isFiniteNumber(mapping.frontCenterAngleDeg) ? round4(mapping.frontCenterAngleDeg) : null,
    sourceHash: mapping.sourceHash ?? null,
    glbSourceHash: mapping.glbSourceHash ?? null,
  };
  return `laser-bed-surface-mapping:${fnv1aHash(JSON.stringify(payload))}`;
}

export function compareLaserBedSurfaceMappingFreshness(args: {
  currentSignature?: string | null;
  savedSignature?: string | null;
  sourceHash?: string | null;
  glbSourceHash?: string | null;
}): LaserBedSurfaceMappingFreshnessResult {
  const currentSignature = args.currentSignature?.trim();
  const savedSignature = args.savedSignature?.trim();
  const sourceHash = args.sourceHash?.trim();
  const glbSourceHash = args.glbSourceHash?.trim();

  if (currentSignature && savedSignature) {
    return currentSignature === savedSignature
      ? { freshness: "fresh", reason: "signature-match" }
      : { freshness: "stale", reason: "signature-mismatch" };
  }

  if (sourceHash && glbSourceHash) {
    return sourceHash === glbSourceHash
      ? { freshness: "fresh", reason: "source-lineage-match" }
      : { freshness: "stale", reason: "source-lineage-mismatch" };
  }

  return {
    freshness: "unknown",
    reason: "insufficient-data",
  };
}

export function validateLaserBedSurfaceMapping(
  args: ValidateSurfaceMappingArgs,
): TemplateEngravingPreviewState {
  const mapping = args.mapping ?? null;
  if (!mapping) {
    return {
      mode: "cylindrical-v1",
      status: "unknown",
      freshness: "unknown",
      readyForPreview: false,
      readyForExactPlacement: false,
      isBodyCutoutQaProof: false,
      mappingSignature: undefined,
      material: args.material ?? DEFAULT_PREVIEW_MATERIAL,
      mapping: null,
      placements: [...(args.placements ?? [])],
      warnings: [],
      errors: [],
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isFinitePositive(mapping.wrapDiameterMm)) {
    errors.push("Wrap/export mapping is missing wrapDiameterMm.");
  }
  if (!isFinitePositive(mapping.wrapWidthMm)) {
    errors.push("Wrap/export mapping is missing wrapWidthMm.");
  }
  if (!isFinitePositive(mapping.printableHeightMm)) {
    errors.push("Wrap/export mapping is missing printableHeightMm.");
  }
  if (!mapping.bodyBounds) {
    warnings.push("Wrap/export mapping is missing bodyBounds.");
  }
  if (!isFiniteNumber(mapping.seamAngleDeg)) {
    warnings.push("Wrap/export mapping is missing seamAngleDeg.");
  }
  if (!isFiniteNumber(mapping.frontCenterAngleDeg)) {
    warnings.push("Wrap/export mapping is missing frontCenterAngleDeg.");
  }

  const freshnessResult = compareLaserBedSurfaceMappingFreshness({
    currentSignature: buildLaserBedSurfaceMappingSignature(mapping),
    savedSignature: args.savedSignature,
    sourceHash: mapping.sourceHash,
    glbSourceHash: mapping.glbSourceHash,
  });
  if (freshnessResult.freshness === "stale") {
    warnings.push("Wrap/export mapping signature is stale relative to the saved geometry state.");
  } else if (freshnessResult.freshness === "unknown") {
    warnings.push("Wrap/export mapping freshness is unknown.");
  }

  for (const placement of args.placements ?? []) {
    const placementValidation = validateLaserBedArtworkPlacement({
      placement,
      mapping,
      savedSignature: args.savedSignature,
    });
    warnings.push(...placementValidation.warnings);
    errors.push(...placementValidation.errors);
  }

  const readyForPreview = errors.length === 0;
  const readyForExactPlacement =
    errors.length === 0 &&
    warnings.length === 0 &&
    freshnessResult.freshness === "fresh" &&
    Boolean(mapping.bodyBounds);
  const status: LaserBedSurfaceMappingStatus =
    errors.length > 0
      ? "fail"
      : warnings.length > 0
        ? "warn"
        : "pass";

  return {
    mode: mapping.mode,
    status,
    freshness: freshnessResult.freshness,
    readyForPreview,
    readyForExactPlacement,
    isBodyCutoutQaProof: false,
    mappingSignature: buildLaserBedSurfaceMappingSignature(mapping),
    material: args.material ?? DEFAULT_PREVIEW_MATERIAL,
    mapping,
    placements: [...(args.placements ?? [])],
    warnings,
    errors,
  };
}

export function validateLaserBedArtworkPlacement(
  args: ValidateArtworkPlacementArgs,
): LaserBedArtworkPlacementValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const mapping = args.mapping ?? null;

  if (!mapping) {
    return {
      status: "unknown",
      freshness: "unknown",
      isBodyCutoutQaProof: false,
      insidePrintableArea: false,
      warnings: [],
      errors: ["Wrap/export mapping is unavailable for this artwork placement."],
    };
  }

  const mappingState = validateLaserBedSurfaceMapping({
    mapping,
    savedSignature: args.savedSignature,
  });
  warnings.push(...mappingState.warnings);
  errors.push(...mappingState.errors);

  const placement = args.placement;
  if (!isFiniteNumber(placement.xMm) || !isFiniteNumber(placement.yMm)) {
    errors.push("Artwork placement is missing finite x/y coordinates.");
  }
  if (!isFinitePositive(placement.widthMm) || !isFinitePositive(placement.heightMm)) {
    errors.push("Artwork placement must include positive width and height values.");
  }

  const insidePrintableArea =
    isFinitePositive(mapping.wrapWidthMm) &&
    isFinitePositive(mapping.printableHeightMm) &&
    isFiniteNumber(placement.xMm) &&
    isFiniteNumber(placement.yMm) &&
    isFinitePositive(placement.widthMm) &&
    isFinitePositive(placement.heightMm) &&
    placement.xMm >= 0 &&
    placement.yMm >= 0 &&
    placement.xMm + placement.widthMm <= mapping.wrapWidthMm &&
    placement.yMm + placement.heightMm <= mapping.printableHeightMm;

  if (!insidePrintableArea && errors.length === 0) {
    errors.push("Artwork placement falls outside the printable wrap/export area.");
  }

  const wrapStartAngle = isFinitePositive(mapping.wrapWidthMm) && isFiniteNumber(placement.xMm)
    ? computeWrapAngleFromXMm({
        xMm: placement.xMm,
        wrapWidthMm: mapping.wrapWidthMm,
        seamAngleDeg: mapping.seamAngleDeg,
        frontCenterAngleDeg: mapping.frontCenterAngleDeg,
      }).angleDeg
    : undefined;
  const wrapEndAngle = isFinitePositive(mapping.wrapWidthMm) && isFiniteNumber(placement.xMm) && isFinitePositive(placement.widthMm)
    ? computeWrapAngleFromXMm({
        xMm: placement.xMm + placement.widthMm,
        wrapWidthMm: mapping.wrapWidthMm,
        seamAngleDeg: mapping.seamAngleDeg,
        frontCenterAngleDeg: mapping.frontCenterAngleDeg,
      }).angleDeg
    : undefined;
  const bodyTopMm = isFinitePositive(mapping.printableHeightMm) && isFiniteNumber(placement.yMm)
    ? computeBodyHeightFromYMm({
        yMm: placement.yMm,
        printableTopMm: mapping.printableTopMm,
        printableHeightMm: mapping.printableHeightMm,
      }).bodyHeightMm
    : undefined;
  const bodyBottomMm = isFinitePositive(mapping.printableHeightMm) && isFiniteNumber(placement.yMm) && isFinitePositive(placement.heightMm)
    ? computeBodyHeightFromYMm({
        yMm: placement.yMm + placement.heightMm,
        printableTopMm: mapping.printableTopMm,
        printableHeightMm: mapping.printableHeightMm,
      }).bodyHeightMm
    : undefined;

  const status: LaserBedSurfaceMappingStatus =
    errors.length > 0
      ? "fail"
      : warnings.length > 0
        ? "warn"
        : "pass";

  return {
    status,
    freshness: mappingState.freshness,
    isBodyCutoutQaProof: false,
    insidePrintableArea,
    wrapStartAngleDeg: wrapStartAngle,
    wrapEndAngleDeg: wrapEndAngle,
    bodyTopMm,
    bodyBottomMm,
    warnings,
    errors,
  };
}
