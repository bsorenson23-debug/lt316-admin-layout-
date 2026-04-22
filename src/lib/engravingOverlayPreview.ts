import type { PreviewModelMode } from "./tumblerPreviewModelState.ts";
import {
  buildLaserBedSurfaceMappingSignature,
  computeBodyHeightFromYMm,
  computeWrapAngleFromXMm,
  type LaserBedArtworkPlacement,
  type LaserBedSurfaceMapping,
  type LaserBedSurfaceMappingStatus,
  type MappingFreshness,
  validateLaserBedArtworkPlacement,
  validateLaserBedSurfaceMapping,
} from "./laserBedSurfaceMapping.ts";

export const ENGRAVING_OVERLAY_PREVIEW_MATERIAL_TOKEN = "engraving-preview-silver";
export const ENGRAVING_OVERLAY_PREVIEW_MATERIAL_LABEL = "Engraving preview silver";

export interface EngravingOverlayPreviewItem {
  id: string;
  assetId: string;
  name: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotationDeg: number;
  angleDeg: number;
  bodyYMm: number;
  normalizedWrapX: number;
  normalizedBodyY: number;
  materialToken: typeof ENGRAVING_OVERLAY_PREVIEW_MATERIAL_TOKEN;
  visible: boolean;
  warnings: string[];
  errors: string[];
}

export interface EngravingOverlayPreviewState {
  status: LaserBedSurfaceMappingStatus | "unknown";
  freshness: MappingFreshness;
  enabled: boolean;
  readyForPreview: boolean;
  readyForExactPlacement: boolean;
  isBodyCutoutQaProof: false;
  materialToken: typeof ENGRAVING_OVERLAY_PREVIEW_MATERIAL_TOKEN;
  materialLabel: string;
  mappingSignature?: string;
  totalCount: number;
  visibleCount: number;
  outsidePrintableAreaCount: number;
  disabledReason?: string;
  warnings: string[];
  errors: string[];
  items: EngravingOverlayPreviewItem[];
}

interface BuildEngravingOverlayPreviewArgs {
  placements?: readonly LaserBedArtworkPlacement[] | null;
  mapping?: LaserBedSurfaceMapping | null;
  savedSignature?: string | null;
  previewMode?: PreviewModelMode | null;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function normalizeMessages(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizePlacementIssueSeverity(args: {
  warnings: string[];
  errors: string[];
}): { warnings: string[]; errors: string[] } {
  const warnings = [...args.warnings];
  const errors: string[] = [];

  for (const error of args.errors) {
    if (/outside the printable wrap\/export area/i.test(error)) {
      warnings.push(error);
      continue;
    }
    errors.push(error);
  }

  return {
    warnings: normalizeMessages(warnings),
    errors: normalizeMessages(errors),
  };
}

function resolveOverlayDisabledReason(args: {
  previewMode?: PreviewModelMode | null;
  totalCount: number;
  mappingStateReadyForPreview: boolean;
  freshness: MappingFreshness;
  visibleCount: number;
  outsidePrintableAreaCount: number;
  errors: string[];
}): string | undefined {
  if (args.totalCount === 0) {
    return "No saved artwork placements are available for overlay preview.";
  }
  if (args.previewMode !== "wrap-export") {
    return "Artwork overlay preview renders only in WRAP / EXPORT mode.";
  }
  if (!args.mappingStateReadyForPreview) {
    return "Artwork overlay preview is disabled until wrap/export mapping dimensions are available.";
  }
  if (args.freshness === "stale") {
    return "Artwork overlay preview is disabled until the saved mapping is refreshed to the current body geometry.";
  }
  if (args.freshness === "unknown") {
    return "Artwork overlay preview is disabled until mapping freshness can be confirmed.";
  }
  if (args.visibleCount === 0 && args.outsidePrintableAreaCount > 0) {
    return "Artwork overlay preview is disabled because every saved placement falls outside the printable area.";
  }
  if (args.visibleCount === 0 && args.errors.length > 0) {
    return "Artwork overlay preview is disabled until saved artwork placement errors are resolved.";
  }
  return undefined;
}

export function buildEngravingOverlayPreviewItems(
  args: BuildEngravingOverlayPreviewArgs,
): EngravingOverlayPreviewItem[] {
  const placements = args.placements ?? [];
  const mappingState = validateLaserBedSurfaceMapping({
    mapping: args.mapping,
    placements,
    savedSignature: args.savedSignature ?? null,
  });

  return placements.map((placement) => {
    const validation = validateLaserBedArtworkPlacement({
      placement,
      mapping: args.mapping,
      savedSignature: args.savedSignature ?? null,
    });
    const normalizedIssues = normalizePlacementIssueSeverity({
      warnings: validation.warnings,
      errors: validation.errors,
    });
    const centerXMm = placement.xMm + (placement.widthMm / 2);
    const centerYMm = placement.yMm + (placement.heightMm / 2);
    const wrapPosition = isFiniteNumber(args.mapping?.wrapWidthMm)
      ? computeWrapAngleFromXMm({
          xMm: centerXMm,
          wrapWidthMm: args.mapping.wrapWidthMm,
          seamAngleDeg: args.mapping?.seamAngleDeg,
          frontCenterAngleDeg: args.mapping?.frontCenterAngleDeg,
        })
      : null;
    const bodyPosition = isFiniteNumber(args.mapping?.printableHeightMm)
      ? computeBodyHeightFromYMm({
          yMm: centerYMm,
          printableTopMm: args.mapping?.printableTopMm,
          printableHeightMm: args.mapping.printableHeightMm,
        })
      : null;
    const warnings = [...normalizedIssues.warnings];

    if (args.previewMode !== "wrap-export") {
      warnings.push("Artwork overlay preview renders only in WRAP / EXPORT mode.");
    }
    if (mappingState.freshness !== "fresh") {
      warnings.push(
        mappingState.freshness === "stale"
          ? "Artwork overlay preview is disabled because the saved mapping is stale."
          : "Artwork overlay preview is disabled because mapping freshness is unknown.",
      );
    }

    const visible = Boolean(
      placement.visible !== false &&
      args.previewMode === "wrap-export" &&
      mappingState.readyForPreview &&
      mappingState.freshness === "fresh" &&
      validation.insidePrintableArea &&
      normalizedIssues.errors.length === 0,
    );

    return {
      id: placement.id,
      assetId: placement.assetId ?? placement.svgAssetId ?? placement.id,
      name: placement.name ?? "Saved artwork",
      xMm: placement.xMm,
      yMm: placement.yMm,
      widthMm: placement.widthMm,
      heightMm: placement.heightMm,
      rotationDeg:
        isFiniteNumber(placement.rotationDeg)
          ? round4(placement.rotationDeg)
          : 0,
      angleDeg: wrapPosition?.angleDeg ?? 0,
      bodyYMm: bodyPosition?.bodyHeightMm ?? 0,
      normalizedWrapX: wrapPosition?.normalizedWrapX ?? 0,
      normalizedBodyY: bodyPosition?.normalizedHeight ?? 0,
      materialToken: ENGRAVING_OVERLAY_PREVIEW_MATERIAL_TOKEN,
      visible,
      warnings: normalizeMessages(warnings),
      errors: normalizedIssues.errors,
    };
  });
}

export function buildEngravingOverlayPreviewState(
  args: BuildEngravingOverlayPreviewArgs,
): EngravingOverlayPreviewState {
  const placements = args.placements ?? [];
  const mappingState = validateLaserBedSurfaceMapping({
    mapping: args.mapping,
    placements,
    savedSignature: args.savedSignature ?? null,
  });
  const items = buildEngravingOverlayPreviewItems(args);
  const visibleCount = items.filter((item) => item.visible).length;
  const outsidePrintableAreaCount = items.filter((item) => (
    item.warnings.some((warning) => /outside the printable wrap\/export area/i.test(warning))
  )).length;
  const warnings = normalizeMessages([
    ...(args.previewMode !== "wrap-export"
      ? ["Artwork overlay preview renders only in WRAP / EXPORT mode."]
      : []),
    ...mappingState.warnings,
    ...items.flatMap((item) => item.warnings),
  ]);
  const errors = normalizeMessages([
    ...mappingState.errors,
    ...items.flatMap((item) => item.errors),
  ]);
  const enabled = Boolean(
    args.previewMode === "wrap-export" &&
    mappingState.readyForPreview &&
    mappingState.freshness === "fresh" &&
    visibleCount > 0 &&
    errors.length === 0,
  );
  const status: EngravingOverlayPreviewState["status"] =
    errors.length > 0
      ? "fail"
      : warnings.length > 0
        ? "warn"
        : enabled
          ? "pass"
          : "unknown";

  return {
    status,
    freshness: mappingState.freshness,
    enabled,
    readyForPreview: mappingState.readyForPreview,
    readyForExactPlacement: mappingState.readyForExactPlacement,
    isBodyCutoutQaProof: false,
    materialToken: ENGRAVING_OVERLAY_PREVIEW_MATERIAL_TOKEN,
    materialLabel: ENGRAVING_OVERLAY_PREVIEW_MATERIAL_LABEL,
    mappingSignature: args.mapping
      ? buildLaserBedSurfaceMappingSignature(args.mapping)
      : undefined,
    totalCount: items.length,
    visibleCount,
    outsidePrintableAreaCount,
    disabledReason: resolveOverlayDisabledReason({
      previewMode: args.previewMode,
      totalCount: items.length,
      mappingStateReadyForPreview: mappingState.readyForPreview,
      freshness: mappingState.freshness,
      visibleCount,
      outsidePrintableAreaCount,
      errors,
    }),
    warnings,
    errors,
    items,
  };
}
