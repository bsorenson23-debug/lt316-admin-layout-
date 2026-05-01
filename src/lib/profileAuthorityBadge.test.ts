import assert from "node:assert/strict";
import test from "node:test";

import {
  getDimensionSourceLabel,
  getProfileAuthorityLabel,
  getSourceModelAvailabilityLabel,
  summarizeProfileAuthorityBadge,
} from "./profileAuthorityBadge.ts";

test("profile authority labels stay operator-safe and distinct from source type", () => {
  assert.equal(getProfileAuthorityLabel("exact-internal-profile"), "Exact profile");
  assert.equal(getProfileAuthorityLabel("official-dimensions-over-profile"), "Official dimensions");
  assert.equal(getProfileAuthorityLabel("inferred-profile"), "Inferred profile");
  assert.equal(getProfileAuthorityLabel("needs-body-reference"), "Needs BODY REFERENCE");
  assert.equal(getDimensionSourceLabel("official-page"), "official page");
  assert.equal(getSourceModelAvailabilityLabel("missing-source-model"), "Source model unavailable");
});

test("matched profile with source model summarizes as exact profile", () => {
  const summary = summarizeProfileAuthorityBadge({
    mode: "matched-profile",
    matchedProfileId: "rtic-20",
    sourceModelAvailability: "generated-source-model",
    hasAcceptedBodyReference: false,
  });

  assert.equal(summary.authority, "exact-internal-profile");
  assert.equal(summary.label, "Exact profile");
  assert.equal(summary.sourceModelAvailabilityLabel, "Generated source model");
  assert.equal(summary.requiresBodyReferenceReview, false);
});

test("matched profile without source model requires BODY REFERENCE", () => {
  const summary = summarizeProfileAuthorityBadge({
    mode: "matched-profile",
    matchedProfileId: "rtic-20",
    sourceModelAvailability: "missing-source-model",
    hasAcceptedBodyReference: false,
  });

  assert.equal(summary.authority, "needs-body-reference");
  assert.equal(summary.label, "Needs BODY REFERENCE");
  assert.equal(summary.requiresBodyReferenceReview, true);
});

test("parsed official dimensions remain lookup-dimensions-only until accepted", () => {
  const summary = summarizeProfileAuthorityBadge({
    mode: "parsed-page",
    dimensionSourceKind: "official-page",
    sourceModelAvailability: "missing-source-model",
    hasAcceptedBodyReference: false,
  });

  assert.equal(summary.authority, "lookup-dimensions-only");
  assert.equal(summary.dimensionSourceLabel, "official page");
  assert.equal(summary.requiresBodyReferenceReview, true);
});
