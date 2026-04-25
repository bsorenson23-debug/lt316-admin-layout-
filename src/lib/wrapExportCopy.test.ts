import assert from "node:assert/strict";
import test from "node:test";

import {
  getWrapExportAppearanceReferenceNote,
  getWrapExportBadgeNote,
  getWrapExportExportAuthorityLabel,
  getWrapExportMappingFreshnessLabel,
  getWrapExportNoAppearanceReferenceMessage,
  getWrapExportNoSavedPlacementMessage,
  getWrapExportOperatorWarningNote,
  getWrapExportOverlayPreviewNote,
  getWrapExportRegenerateNote,
  getWrapExportSummarySubtitle,
  getWrapExportSummaryTitle,
} from "./wrapExportCopy.ts";

test("wrap export summary copy calls out authority and preview separation", () => {
  assert.equal(getWrapExportSummaryTitle(), "WRAP / EXPORT status");
  assert.match(getWrapExportSummarySubtitle(), /saved artwork placement/i);
  assert.match(getWrapExportSummarySubtitle(), /BODY CUTOUT QA remains body-only/i);
});

test("mapping freshness copy is operator-readable", () => {
  assert.equal(
    getWrapExportMappingFreshnessLabel({ freshness: "fresh", hasSavedPlacements: true }),
    "Mapped to current body source",
  );
  assert.equal(
    getWrapExportMappingFreshnessLabel({ freshness: "stale", hasSavedPlacements: true }),
    "Mapping stale",
  );
  assert.equal(
    getWrapExportMappingFreshnessLabel({ freshness: "unknown", hasSavedPlacements: false }),
    "No saved artwork placement yet",
  );
});

test("export authority and badge notes explain wrap export intent", () => {
  assert.equal(
    getWrapExportExportAuthorityLabel("laser-bed-mm-placement"),
    "Saved artwork placement",
  );
  assert.match(getWrapExportBadgeNote("ready"), /WRAP \/ EXPORT ready/i);
  assert.match(getWrapExportBadgeNote("no-reviewed-glb"), /Overlay preview unavailable/i);
});

test("empty-state and reference-only copy stay explicit", () => {
  assert.match(getWrapExportNoSavedPlacementMessage(), /Place artwork on the workspace/i);
  assert.match(getWrapExportNoAppearanceReferenceMessage(), /stay out of BODY CUTOUT QA and body_mesh/i);
  assert.match(getWrapExportAppearanceReferenceNote(), /reference-only/i);
});

test("overlay and regenerate notes explain what does and does not require regeneration", () => {
  assert.match(
    getWrapExportOverlayPreviewNote("Engraving preview silver"),
    /available for export review/i,
  );
  assert.match(getWrapExportRegenerateNote(), /body geometry changes/i);
  assert.match(getWrapExportRegenerateNote(), /Artwork-only moves do not require GLB regeneration/i);
});

test("operator warning note prioritizes outside-printable and stale guidance", () => {
  assert.match(
    getWrapExportOperatorWarningNote({
      freshness: "fresh",
      placementCount: 1,
      outsidePrintableWarningCount: 1,
      staleMappingWarningCount: 0,
    }) ?? "",
    /outside the printable wrap area/i,
  );
  assert.match(
    getWrapExportOperatorWarningNote({
      freshness: "stale",
      placementCount: 1,
      outsidePrintableWarningCount: 0,
      staleMappingWarningCount: 1,
    }) ?? "",
    /Saved placement is preserved, but the current body source changed/i,
  );
  assert.equal(
    getWrapExportOperatorWarningNote({
      freshness: "fresh",
      placementCount: 0,
      outsidePrintableWarningCount: 0,
      staleMappingWarningCount: 0,
    }),
    null,
  );
});
