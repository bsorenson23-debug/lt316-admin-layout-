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
    return "No saved artwork placement yet. Place artwork on the workspace, then save the template to persist WRAP / EXPORT placement.";
  }
  if (args.previewMode !== "wrap-export") {
    return "Overlay preview unavailable. Switch to WRAP / EXPORT to review saved artwork placement.";
  }
  if (!args.mappingStateReadyForPreview) {
    return "Overlay preview unavailable. Generate a reviewed body GLB and save artwork placement before WRAP / EXPORT preview.";
  }
  if (args.freshness === "stale") {
    return "Mapping stale. Saved placement is preserved, but the current body source changed.";
  }
  if (args.freshness === "unknown") {
    return "Overlay preview unavailable. Mapping freshness is not confirmed for the current body source.";
  }
  if (args.visibleCount === 0 && args.outsidePrintableAreaCount > 0) {
    return "Overlay preview unavailable. Every saved placement sits outside the printable wrap area.";
  }
  if (args.visibleCount === 0 && args.errors.length > 0) {
    return "Overlay preview unavailable. Resolve saved artwork placement issues first.";
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
      warnings.push("Overlay preview unavailable. Switch to WRAP / EXPORT to review saved artwork placement.");
    }
    if (mappingState.freshness !== "fresh") {
      warnings.push(
        mappingState.freshness === "stale"
          ? "Mapping stale. Saved placement is preserved, but the current body source changed."
          : "Overlay preview unavailable. Mapping freshness is not confirmed for the current body source.",
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
      ? ["Overlay preview unavailable. Switch to WRAP / EXPORT to review saved artwork placement."]
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
