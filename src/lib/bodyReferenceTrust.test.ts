import assert from "node:assert/strict";
import test from "node:test";
import {
  getBodyReferenceTrustMessage,
  isTrustedBodyReferenceSourceTrust,
  resolveBodyReferenceTrust,
} from "./bodyReferenceTrust.ts";

test("manual front photo confirmed in-session resolves to trusted-front", () => {
  const resolved = resolveBodyReferenceTrust({
    outlineSeedMode: "fresh-image-trace",
    frontPhotoOrigin: "manual",
    frontPhotoDataUrl: "data:image/png;base64,front",
    manualFrontConfirmed: true,
    preferredFrontReferenceViewClass: "front",
  });

  assert.equal(resolved.trust, "trusted-front");
  assert.equal(resolved.sourceOrigin, "manual");
  assert.equal(isTrustedBodyReferenceSourceTrust(resolved.trust), true);
  assert.match(getBodyReferenceTrustMessage(resolved), /trusted for calibration/i);
});

test("legacy manual front photo without persisted trust stays review-safe", () => {
  const resolved = resolveBodyReferenceTrust({
    outlineSeedMode: "saved-outline",
    frontPhotoOrigin: "manual",
    frontPhotoDataUrl: "data:image/png;base64,legacy-front",
    manualFrontConfirmed: false,
    preferredFrontReferenceViewClass: null,
  });

  assert.equal(resolved.trust, "manual-front-unclassified");
  assert.equal(resolved.sourceOrigin, "manual");
  assert.match(getBodyReferenceTrustMessage(resolved), /no saved trust provenance/i);
});

test("angled lookup front stays advisory", () => {
  const resolved = resolveBodyReferenceTrust({
    outlineSeedMode: "fresh-image-trace",
    frontPhotoOrigin: "lookup",
    frontPhotoDataUrl: "",
    manualFrontConfirmed: false,
    preferredFrontReferenceViewClass: "front-3q",
  });

  assert.equal(resolved.trust, "advisory-angled");
  assert.equal(resolved.sourceOrigin, "lookup");
  assert.match(getBodyReferenceTrustMessage(resolved), /angled source/i);
});

test("straight-on lookup front remains untrusted review state", () => {
  const resolved = resolveBodyReferenceTrust({
    outlineSeedMode: "fresh-image-trace",
    frontPhotoOrigin: "lookup",
    frontPhotoDataUrl: "",
    manualFrontConfirmed: false,
    preferredFrontReferenceViewClass: "front",
  });

  assert.equal(resolved.trust, "manual-front-unclassified");
  assert.equal(resolved.sourceOrigin, "lookup");
  assert.match(getBodyReferenceTrustMessage(resolved), /uploaded straight-on front photo/i);
});

test("fit-debug fallback always resolves to fit-debug-fallback", () => {
  const resolved = resolveBodyReferenceTrust({
    outlineSeedMode: "fit-debug-fallback",
    frontPhotoOrigin: "lookup",
    frontPhotoDataUrl: "",
    manualFrontConfirmed: false,
    preferredFrontReferenceViewClass: "front-3q",
    persistedTrust: "trusted-front",
    persistedSourceOrigin: "manual",
    persistedSourceViewClass: "front",
  });

  assert.equal(resolved.trust, "fit-debug-fallback");
  assert.equal(resolved.sourceOrigin, "fit-debug");
  assert.match(getBodyReferenceTrustMessage(resolved), /fallback geometry/i);
});

test("persisted trust provenance is reused when live inputs are ambiguous", () => {
  const resolved = resolveBodyReferenceTrust({
    outlineSeedMode: null,
    frontPhotoOrigin: null,
    frontPhotoDataUrl: "",
    manualFrontConfirmed: false,
    preferredFrontReferenceViewClass: null,
    persistedTrust: "advisory-angled",
    persistedOutlineSeedMode: "saved-outline",
    persistedSourceOrigin: "lookup",
    persistedSourceViewClass: "front-3q",
  });

  assert.equal(resolved.trust, "advisory-angled");
  assert.equal(resolved.sourceOrigin, "lookup");
  assert.equal(resolved.outlineSeedMode, "saved-outline");
});
