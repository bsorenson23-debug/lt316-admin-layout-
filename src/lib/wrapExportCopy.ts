import type { MappingFreshness } from "./laserBedSurfaceMapping.ts";
import type { WrapExportMappingStatus } from "./wrapExportPreviewState.ts";

export function getWrapExportSummaryTitle(): string {
  return "WRAP / EXPORT status";
}

export function getWrapExportSummarySubtitle(): string {
  return "Saved laser-bed millimeter placement is the WRAP / EXPORT source of truth. The 3D overlay is preview-only and stays separate from BODY CUTOUT QA.";
}

export function getWrapExportMappingFreshnessLabel(args: {
  freshness: MappingFreshness;
  hasSavedPlacements: boolean;
}): string {
  if (!args.hasSavedPlacements) {
    return "No saved placement yet";
  }
  switch (args.freshness) {
    case "fresh":
      return "Fresh for current reviewed geometry";
    case "stale":
      return "Stale after body-geometry change";
    default:
      return "Unknown - review geometry agreement";
  }
}

export function getWrapExportExportAuthorityLabel(authority: string | null | undefined): string {
  if (authority === "laser-bed-mm-placement") {
    return "Saved laser-bed mm placement";
  }
  return authority?.trim() || "Saved laser-bed mm placement";
}

export function getWrapExportBadgeNote(mappingStatus: WrapExportMappingStatus): string {
  switch (mappingStatus) {
    case "ready":
      return "Separate from BODY CUTOUT QA · Preview and export checks ready";
    case "no-reviewed-glb":
      return "Separate from BODY CUTOUT QA · Preview only until a reviewed GLB is loaded";
    case "stale-geometry":
      return "Separate from BODY CUTOUT QA · Regenerate reviewed geometry for exact placement";
    case "missing-dimensions":
      return "Separate from BODY CUTOUT QA · Missing wrap dimensions";
    default:
      return "Separate from BODY CUTOUT QA · Wrap/export readiness unknown";
  }
}

export function getWrapExportAuthorityNote(): string {
  return "Saved laser-bed millimeter placement stays authoritative for WRAP / EXPORT. BODY CUTOUT QA remains the body-only geometry check.";
}

export function getWrapExportOverlayPreviewNote(materialLabel: string): string {
  return `The 3D engraving overlay is derived from saved placement and uses ${materialLabel}. Moving artwork updates the preview without GLB regeneration.`;
}

export function getWrapExportRegenerateNote(): string {
  return "Regenerate the reviewed BODY CUTOUT QA GLB only after body geometry changes. Artwork moves and overlay updates do not require regeneration.";
}

export function getWrapExportAppearanceReferenceNote(): string {
  return "Product appearance layers are reference-only orientation guides. They stay out of BODY CUTOUT QA and body_mesh.";
}

export function getWrapExportNoSavedPlacementMessage(): string {
  return "No saved laser-bed artwork placements yet. Save artwork in millimeter space to unlock WRAP / EXPORT preview and export agreement checks.";
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
    return "One or more saved placements sit outside the printable wrap area. Move or resize the artwork in laser-bed millimeter space; no GLB regenerate is required.";
  }
  if (args.freshness === "stale" || args.staleMappingWarningCount > 0) {
    return "Saved placements remain authoritative, but viewer agreement is stale because body geometry changed. Regenerate the reviewed BODY CUTOUT QA GLB to refresh exact wrap/export placement.";
  }
  if (args.freshness === "unknown") {
    return "Saved placements exist, but viewer agreement cannot be confirmed yet because mapping freshness is unknown.";
  }
  return null;
}
