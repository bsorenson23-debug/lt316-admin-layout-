import type {
  BodyGeometryContract,
  BodyGeometryRuntimeInspectionValueSource,
} from "./bodyGeometryContract.ts";
import type {
  EngravingOverlayPreviewItem,
  EngravingOverlayPreviewState,
} from "./engravingOverlayPreview.ts";
import {
  buildEngravingOverlayPreviewItems,
  buildEngravingOverlayPreviewState,
} from "./engravingOverlayPreview.ts";
import type {
  LaserBedArtworkPlacement,
  LaserBedArtworkPlacementValidation,
  LaserBedSurfaceMapping,
  MappingFreshness,
} from "./laserBedSurfaceMapping.ts";
import {
  buildLaserBedSurfaceMappingSignature,
  validateLaserBedArtworkPlacement,
  validateLaserBedSurfaceMapping,
} from "./laserBedSurfaceMapping.ts";
import type { ProductAppearanceReferenceLayer } from "./productAppearanceReferenceLayers.ts";
import {
  summarizeAppearanceReferenceLayers,
} from "./productAppearanceReferenceLayers.ts";
import type { PreviewModelMode } from "./tumblerPreviewModelState.ts";
import type { WrapExportPreviewState } from "./wrapExportPreviewState.ts";
import { buildWrapExportPreviewState } from "./wrapExportPreviewState.ts";

export type WrapExportProductionValidationStatus = "pass" | "warn" | "fail" | "unknown";
export type WrapExportBodyBoundsSource =
  | BodyGeometryRuntimeInspectionValueSource
  | "contract-dimensions";

interface WrapExportValidationResult {
  status: WrapExportProductionValidationStatus;
  warnings: string[];
  errors: string[];
}

export interface WrapExportMappingFreshnessValidation
  extends WrapExportValidationResult {
  freshness: MappingFreshness;
  mappingSignature?: string;
  staleMappingWarningCount: number;
}

export interface WrapExportPlacementAgreementValidation
  extends WrapExportValidationResult {
  placementCount: number;
  comparedPlacementCount: number;
  overlayCount: number;
  overlayEnabled: boolean;
  outsidePrintableAreaWarningCount: number;
}

export interface WrapExportBodyCutoutQaValidation
  extends WrapExportValidationResult {
  exportAuthority: "laser-bed-mm-placement";
  notBodyCutoutQa: true;
}

export interface WrapExportProductionReadinessSummary
  extends WrapExportValidationResult {
  status: WrapExportProductionValidationStatus;
  readyForPreview: boolean;
  readyForExactPlacement: boolean;
  readyForViewerAgreement: boolean;
  mappingStatus: WrapExportPreviewState["mappingStatus"];
  mappingFreshness: MappingFreshness;
  placementCount: number;
  overlayCount: number;
  overlayTotalCount: number;
  overlayEnabled: boolean;
  mappingSignature?: string;
  wrapDiameterMm?: number;
  wrapWidthMm?: number;
  printableHeightMm?: number;
  bodyBoundsSource: WrapExportBodyBoundsSource | "unavailable";
  outsidePrintableAreaWarningCount: number;
  staleMappingWarningCount: number;
  sourceHash?: string;
  glbSourceHash?: string;
  exportAuthority: "laser-bed-mm-placement";
  notBodyCutoutQa: true;
  appearanceReferenceLayerCount: number;
  appearanceReferenceContextOnly: boolean;
}

interface ValidateOverlayDescriptorMatchesSavedPlacementArgs {
  placement: LaserBedArtworkPlacement;
  mapping?: LaserBedSurfaceMapping | null;
  savedSignature?: string | null;
  overlayItem?: EngravingOverlayPreviewItem | null;
  previewMode?: PreviewModelMode | null;
}

interface ValidateWrapExportPlacementAgreementArgs {
  placements?: readonly LaserBedArtworkPlacement[] | null;
  mapping?: LaserBedSurfaceMapping | null;
  savedSignature?: string | null;
  previewMode?: PreviewModelMode | null;
  overlayState?: EngravingOverlayPreviewState | null;
}

export interface SummarizeWrapExportProductionReadinessArgs {
  contract?: BodyGeometryContract | null;
  placements?: readonly LaserBedArtworkPlacement[] | null;
  mapping?: LaserBedSurfaceMapping | null;
  savedSignature?: string | null;
  previewMode?: PreviewModelMode | null;
  overlayState?: EngravingOverlayPreviewState | null;
  appearanceReferenceLayers?: readonly ProductAppearanceReferenceLayer[] | null;
}

function normalizeMessages(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function resolveStatus(args: {
  errors: readonly string[];
  warnings: readonly string[];
  hasMeaningfulData?: boolean;
}): WrapExportProductionValidationStatus {
  if (args.errors.length > 0) return "fail";
  if (args.warnings.length > 0) return "warn";
  if (args.hasMeaningfulData === false) return "unknown";
  return "pass";
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function nearlyEqual(
  left: number,
  right: number,
  tolerance = 0.0001,
): boolean {
  return Math.abs(left - right) <= tolerance;
}

function resolveBodyBoundsSource(
  contract: BodyGeometryContract | null | undefined,
): WrapExportProductionReadinessSummary["bodyBoundsSource"] {
  const runtimeSource = contract?.runtimeInspection?.bodyBoundsSource;
  if (runtimeSource && runtimeSource !== "unavailable") {
    return runtimeSource;
  }
  if (contract?.dimensionsMm.bodyBounds) {
    return "contract-dimensions";
  }
  return "unavailable";
}

function countStaleMappingWarnings(values: readonly string[]): number {
  return values.filter((value) => /stale/i.test(value)).length;
}

function deriveOverlayState(args: ValidateWrapExportPlacementAgreementArgs): EngravingOverlayPreviewState {
  return args.overlayState ?? buildEngravingOverlayPreviewState({
    placements: args.placements,
    mapping: args.mapping,
    savedSignature: args.savedSignature ?? null,
    previewMode: args.previewMode,
  });
}

export function validateWrapExportMappingFreshness(args: {
  mapping?: LaserBedSurfaceMapping | null;
  savedSignature?: string | null;
}): WrapExportMappingFreshnessValidation {
  const mapping = args.mapping ?? null;
  if (!mapping) {
    return {
      status: "unknown",
      freshness: "unknown",
      mappingSignature: undefined,
      staleMappingWarningCount: 0,
      warnings: [],
      errors: [],
    };
  }

  const validation = validateLaserBedSurfaceMapping({
    mapping,
    savedSignature: args.savedSignature ?? null,
  });

  return {
    status: resolveStatus({
      errors: validation.errors,
      warnings: validation.warnings,
      hasMeaningfulData: true,
    }),
    freshness: validation.freshness,
    mappingSignature: buildLaserBedSurfaceMappingSignature(mapping),
    staleMappingWarningCount: countStaleMappingWarnings(validation.warnings),
    warnings: normalizeMessages(validation.warnings),
    errors: normalizeMessages(validation.errors),
  };
}

export function validateArtworkPlacementWithinPrintableArea(args: {
  placement: LaserBedArtworkPlacement;
  mapping?: LaserBedSurfaceMapping | null;
  savedSignature?: string | null;
}): LaserBedArtworkPlacementValidation {
  return validateLaserBedArtworkPlacement({
    placement: args.placement,
    mapping: args.mapping,
    savedSignature: args.savedSignature ?? null,
  });
}

export function validateOverlayDescriptorMatchesSavedPlacement(
  args: ValidateOverlayDescriptorMatchesSavedPlacementArgs,
): WrapExportValidationResult {
  const expected = buildEngravingOverlayPreviewItems({
    placements: [args.placement],
    mapping: args.mapping,
    savedSignature: args.savedSignature ?? null,
    previewMode: args.previewMode,
  })[0];
  const actual = args.overlayItem ?? null;
  const errors: string[] = [];

  if (!expected || !actual) {
    errors.push("Overlay descriptor is missing for a saved artwork placement.");
    return {
      status: "fail",
      warnings: [],
      errors,
    };
  }

  if (actual.id !== expected.id) {
    errors.push(`Overlay descriptor id ${actual.id} does not match saved placement id ${expected.id}.`);
  }
  if (actual.assetId !== expected.assetId) {
    errors.push(`Overlay descriptor assetId ${actual.assetId} does not match saved placement assetId ${expected.assetId}.`);
  }
  if (!nearlyEqual(actual.xMm, expected.xMm)) {
    errors.push(`Overlay descriptor xMm ${actual.xMm} does not match saved placement xMm ${expected.xMm}.`);
  }
  if (!nearlyEqual(actual.yMm, expected.yMm)) {
    errors.push(`Overlay descriptor yMm ${actual.yMm} does not match saved placement yMm ${expected.yMm}.`);
  }
  if (!nearlyEqual(actual.widthMm, expected.widthMm)) {
    errors.push(`Overlay descriptor widthMm ${actual.widthMm} does not match saved placement widthMm ${expected.widthMm}.`);
  }
  if (!nearlyEqual(actual.heightMm, expected.heightMm)) {
    errors.push(`Overlay descriptor heightMm ${actual.heightMm} does not match saved placement heightMm ${expected.heightMm}.`);
  }
  if (!nearlyEqual(actual.rotationDeg, expected.rotationDeg)) {
    errors.push(`Overlay descriptor rotationDeg ${actual.rotationDeg} does not match saved placement rotationDeg ${expected.rotationDeg}.`);
  }
  if (!nearlyEqual(actual.angleDeg, expected.angleDeg)) {
    errors.push(`Overlay descriptor angleDeg ${actual.angleDeg} does not match derived angleDeg ${expected.angleDeg}.`);
  }
  if (!nearlyEqual(actual.bodyYMm, expected.bodyYMm)) {
    errors.push(`Overlay descriptor bodyYMm ${actual.bodyYMm} does not match derived bodyYMm ${expected.bodyYMm}.`);
  }
  if (!nearlyEqual(actual.normalizedWrapX, expected.normalizedWrapX)) {
    errors.push(`Overlay descriptor normalizedWrapX ${actual.normalizedWrapX} does not match derived normalizedWrapX ${expected.normalizedWrapX}.`);
  }
  if (!nearlyEqual(actual.normalizedBodyY, expected.normalizedBodyY)) {
    errors.push(`Overlay descriptor normalizedBodyY ${actual.normalizedBodyY} does not match derived normalizedBodyY ${expected.normalizedBodyY}.`);
  }
  if (actual.materialToken !== expected.materialToken) {
    errors.push(`Overlay descriptor materialToken ${actual.materialToken} does not match ${expected.materialToken}.`);
  }
  if (actual.visible !== expected.visible) {
    errors.push(`Overlay descriptor visibility ${String(actual.visible)} does not match derived visibility ${String(expected.visible)}.`);
  }

  return {
    status: resolveStatus({ errors, warnings: [], hasMeaningfulData: true }),
    warnings: [],
    errors,
  };
}

export function validateWrapExportPlacementAgreement(
  args: ValidateWrapExportPlacementAgreementArgs,
): WrapExportPlacementAgreementValidation {
  const placements = [...(args.placements ?? [])];
  const overlayState = deriveOverlayState(args);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (placements.length === 0) {
    return {
      status: "unknown",
      placementCount: 0,
      comparedPlacementCount: 0,
      overlayCount: overlayState.visibleCount,
      overlayEnabled: overlayState.enabled,
      outsidePrintableAreaWarningCount: overlayState.outsidePrintableAreaCount,
      warnings,
      errors,
    };
  }

  const overlayItemsById = new Map(overlayState.items.map((item) => [item.id, item]));
  for (const placement of placements) {
    const overlayItem = overlayItemsById.get(placement.id);
    const comparison = validateOverlayDescriptorMatchesSavedPlacement({
      placement,
      mapping: args.mapping,
      savedSignature: args.savedSignature,
      previewMode: args.previewMode,
      overlayItem,
    });
    warnings.push(...comparison.warnings);
    errors.push(...comparison.errors);
  }

  if (overlayState.totalCount !== placements.length) {
    errors.push(
      `Overlay descriptor count ${overlayState.totalCount} does not match saved placement count ${placements.length}.`,
    );
  }

  return {
    status: resolveStatus({
      errors,
      warnings,
      hasMeaningfulData: true,
    }),
    placementCount: placements.length,
    comparedPlacementCount: placements.length,
    overlayCount: overlayState.visibleCount,
    overlayEnabled: overlayState.enabled,
    outsidePrintableAreaWarningCount: overlayState.outsidePrintableAreaCount,
    warnings: normalizeMessages(warnings),
    errors: normalizeMessages(errors),
  };
}

export function validateWrapExportNotBodyCutoutQa(): WrapExportBodyCutoutQaValidation {
  return {
    status: "pass",
    exportAuthority: "laser-bed-mm-placement",
    notBodyCutoutQa: true,
    warnings: [],
    errors: [],
  };
}

export function summarizeWrapExportProductionReadiness(
  args: SummarizeWrapExportProductionReadinessArgs,
): WrapExportProductionReadinessSummary {
  const contract = args.contract ?? null;
  const previewState = buildWrapExportPreviewState(contract);
  const mappingFreshnessValidation = validateWrapExportMappingFreshness({
    mapping: args.mapping,
    savedSignature: args.savedSignature ?? null,
  });
  const overlayState = args.overlayState ?? buildEngravingOverlayPreviewState({
    placements: args.placements,
    mapping: args.mapping,
    savedSignature: args.savedSignature ?? null,
    previewMode: args.previewMode,
  });
  const placementAgreement = validateWrapExportPlacementAgreement({
    placements: args.placements,
    mapping: args.mapping,
    savedSignature: args.savedSignature ?? null,
    previewMode: args.previewMode,
    overlayState,
  });
  const nonQaValidation = validateWrapExportNotBodyCutoutQa();
  const appearanceSummary = summarizeAppearanceReferenceLayers(
    args.appearanceReferenceLayers ?? [],
  );

  const warnings = normalizeMessages([
    ...previewState.warnings,
    ...mappingFreshnessValidation.warnings,
    ...placementAgreement.warnings,
    ...overlayState.warnings,
  ]);
  const errors = normalizeMessages([
    ...previewState.errors,
    ...mappingFreshnessValidation.errors,
    ...placementAgreement.errors,
    ...overlayState.errors,
  ]);
  const hasMeaningfulData = Boolean(
    contract ||
    args.mapping ||
    (args.placements?.length ?? 0) > 0,
  );

  return {
    status: resolveStatus({ errors, warnings, hasMeaningfulData }),
    readyForPreview: previewState.readyForPreview,
    readyForExactPlacement: previewState.readyForExactPlacement,
    readyForViewerAgreement: Boolean(
      (args.placements?.length ?? 0) > 0 &&
      previewState.readyForPreview &&
      overlayState.enabled &&
      mappingFreshnessValidation.freshness === "fresh" &&
      placementAgreement.errors.length === 0
    ),
    mappingStatus: previewState.mappingStatus,
    mappingFreshness: mappingFreshnessValidation.freshness,
    placementCount: args.placements?.length ?? 0,
    overlayCount: overlayState.visibleCount,
    overlayTotalCount: overlayState.totalCount,
    overlayEnabled: overlayState.enabled,
    mappingSignature:
      mappingFreshnessValidation.mappingSignature ??
      (args.mapping ? buildLaserBedSurfaceMappingSignature(args.mapping) : undefined),
    wrapDiameterMm: previewState.wrapDiameterMm,
    wrapWidthMm: previewState.wrapWidthMm,
    printableHeightMm: previewState.printableHeightMm,
    bodyBoundsSource: resolveBodyBoundsSource(contract),
    outsidePrintableAreaWarningCount: overlayState.outsidePrintableAreaCount,
    staleMappingWarningCount: mappingFreshnessValidation.staleMappingWarningCount,
    sourceHash: contract?.source.hash,
    glbSourceHash: contract?.glb.sourceHash,
    exportAuthority: nonQaValidation.exportAuthority,
    notBodyCutoutQa: nonQaValidation.notBodyCutoutQa,
    appearanceReferenceLayerCount: appearanceSummary.totalLayers,
    appearanceReferenceContextOnly: appearanceSummary.bodyCutoutQaSafe,
    warnings,
    errors,
  };
}
