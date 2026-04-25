import type { MappingFreshness } from "./laserBedSurfaceMapping.ts";
import type { WrapExportMappingStatus } from "./wrapExportPreviewState.ts";

export function getWrapExportSummaryTitle(): string {
  return "WRAP / EXPORT status";
}

export function getWrapExportSummarySubtitle(): string {
  return "WRAP / EXPORT checks saved artwork placement and export preview. BODY CUTOUT QA remains body-only.";
}

export function getWrapExportMappingFreshnessLabel(args: {
  freshness: MappingFreshness;
  hasSavedPlacements: boolean;
}): string {
  if (!args.hasSavedPlacements) {
    return "No saved artwork placement yet";
  }
  switch (args.freshness) {
    case "fresh":
      return "Mapped to current body source";
    case "stale":
      return "Mapping stale";
    default:
      return "Mapping not confirmed";
  }
}

export function getWrapExportExportAuthorityLabel(authority: string | null | undefined): string {
  if (authority === "laser-bed-mm-placement") {
    return "Saved artwork placement";
  }
  return authority?.trim() || "Saved artwork placement";
}

export function getWrapExportBadgeNote(mappingStatus: WrapExportMappingStatus): string {
  switch (mappingStatus) {
    case "ready":
      return "WRAP / EXPORT ready. BODY CUTOUT QA remains body-only.";
    case "no-reviewed-glb":
      return "Overlay preview unavailable. Generate a reviewed body GLB first.";
    case "stale-geometry":
      return "Mapping stale. Refresh the reviewed body source before trusting placement preview.";
    case "missing-dimensions":
      return "WRAP / EXPORT blocked. Wrap dimensions are missing.";
    default:
      return "WRAP / EXPORT status unknown. BODY CUTOUT QA remains body-only.";
  }
}

export function getWrapExportAuthorityNote(): string {
  return "WRAP / EXPORT uses saved artwork placement. BODY CUTOUT QA proves body-only geometry.";
}

export function getWrapExportOverlayPreviewNote(materialLabel: string): string {
  return `Engraving overlay preview is available for export review with ${materialLabel} when saved placement matches the current body source.`;
}

export function getWrapExportRegenerateNote(): string {
  return "Regenerate or refresh the reviewed body source when body geometry changes. Artwork-only moves do not require GLB regeneration.";
}

export function getWrapExportAppearanceReferenceNote(): string {
  return "Product appearance layers are reference-only orientation guides. They stay out of BODY CUTOUT QA and body_mesh.";
}

export function getWrapExportNoSavedPlacementMessage(): string {
  return "No saved artwork placement yet. Place artwork on the workspace, then save the template to persist WRAP / EXPORT placement.";
}

export function getWrapExportNoAppearanceReferenceMessage(): string {
  return "No product appearance reference layers saved yet. These guides are optional and stay out of BODY CUTOUT QA and body_mesh.";
}

export function getWrapExportOperatorWarningNote(args: {
  freshness: MappingFreshness;
  placementCount: number;
  outsidePrintableWarningCount: number;
  staleMappingWarningCount: number;
}): string | null {
  if (args.placementCount <= 0) {
    return null;
  }
  if (args.outsidePrintableWarningCount > 0) {
    return "One or more saved placements sit outside the printable wrap area. Move or resize artwork in the workspace; no GLB regeneration is required.";
  }
  if (args.freshness === "stale" || args.staleMappingWarningCount > 0) {
    return "Mapping stale. Saved placement is preserved, but the current body source changed. Refresh the reviewed body source before trusting placement preview.";
  }
  if (args.freshness === "unknown") {
    return "Saved placement exists, but mapping freshness is not confirmed for the current body source.";
  }
  return null;
}
