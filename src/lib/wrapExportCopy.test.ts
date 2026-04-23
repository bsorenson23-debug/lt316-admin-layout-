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
  assert.match(getWrapExportSummarySubtitle(), /source of truth/i);
  assert.match(getWrapExportSummarySubtitle(), /separate from BODY CUTOUT QA/i);
});

test("mapping freshness copy is operator-readable", () => {
  assert.equal(
    getWrapExportMappingFreshnessLabel({ freshness: "fresh", hasSavedPlacements: true }),
    "Fresh for current reviewed geometry",
  );
  assert.equal(
    getWrapExportMappingFreshnessLabel({ freshness: "stale", hasSavedPlacements: true }),
    "Stale after body-geometry change",
  );
  assert.equal(
    getWrapExportMappingFreshnessLabel({ freshness: "unknown", hasSavedPlacements: false }),
    "No saved placement yet",
  );
});

test("export authority and badge notes explain wrap export intent", () => {
  assert.equal(
    getWrapExportExportAuthorityLabel("laser-bed-mm-placement"),
    "Saved laser-bed mm placement",
  );
  assert.match(getWrapExportBadgeNote("ready"), /Separate from BODY CUTOUT QA/i);
  assert.match(getWrapExportBadgeNote("no-reviewed-glb"), /Preview only/i);
});

test("empty-state and reference-only copy stay explicit", () => {
  assert.match(getWrapExportNoSavedPlacementMessage(), /Save artwork in millimeter space/i);
  assert.match(getWrapExportNoAppearanceReferenceMessage(), /stay out of BODY CUTOUT QA and body_mesh/i);
  assert.match(getWrapExportAppearanceReferenceNote(), /reference-only/i);
});

test("overlay and regenerate notes explain what does and does not require regeneration", () => {
  assert.match(
    getWrapExportOverlayPreviewNote("Engraving preview silver"),
    /updates the preview without GLB regeneration/i,
  );
  assert.match(getWrapExportRegenerateNote(), /only after body geometry changes/i);
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
    /Regenerate the reviewed BODY CUTOUT QA GLB/i,
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
