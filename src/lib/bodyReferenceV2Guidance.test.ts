import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBodyReferenceV2GuidanceMessages,
  formatBodyReferenceV2ScaleSourceLabel,
  getBodyReferenceV2AcceptDraftReason,
  getBodyReferenceV2CurrentQaSourceLabel,
  getBodyReferenceV2GenerateGateReason,
  getBodyReferenceV2ReferenceOnlyNote,
  getBodyReferenceV2SourceAuthorityNote,
  getBodyReferenceV2WrapExportDistinctionNote,
  humanizeBodyReferenceV2GuidanceMessage,
} from "./bodyReferenceV2Guidance.ts";

test("humanizeBodyReferenceV2GuidanceMessage explains lookup height as context only", () => {
  assert.equal(
    humanizeBodyReferenceV2GuidanceMessage(
      "Full product height is stored for context and ignored for lookup-based body contour scale.",
    ),
    "Full product height is context only. Lookup diameter remains the scale authority for v2.",
  );
});

test("buildBodyReferenceV2GuidanceMessages dedupes repeated warnings and preserves severity", () => {
  const messages = buildBodyReferenceV2GuidanceMessages({
    errors: ["BODY REFERENCE v2 body-left crosses the centerline."],
    warnings: [
      "BODY REFERENCE v2 lid-reference layer is missing.",
      "BODY REFERENCE v2 lid-reference layer is missing.",
      "BODY REFERENCE v2 body-left crosses the centerline.",
    ],
  });

  assert.deepEqual(messages, [
    {
      level: "error",
      message: "Move the body-left outline so every point stays left of the centerline before v2 generation.",
    },
    {
      level: "warning",
      message: "No lid reference is captured yet. That is optional and stays reference-only.",
    },
  ]);
});

test("getBodyReferenceV2GenerateGateReason explains accepted draft gating", () => {
  assert.equal(
    getBodyReferenceV2GenerateGateReason({
      hasPendingV1FineTune: false,
      accepted: false,
      hasDraftChanges: true,
      generationReady: true,
    }),
    "Accept the current v2 draft first. v2 generation only uses the accepted v2 capture.",
  );
});

test("getBodyReferenceV2GenerateGateReason explains readiness requirements", () => {
  assert.equal(
    getBodyReferenceV2GenerateGateReason({
      hasPendingV1FineTune: false,
      accepted: true,
      hasDraftChanges: false,
      generationReady: false,
    }),
    "v2 generation stays disabled until centerline, body-left, lookup-diameter scale, and mirror validation all pass.",
  );
});

test("getBodyReferenceV2AcceptDraftReason explains empty draft state", () => {
  assert.equal(
    getBodyReferenceV2AcceptDraftReason({
      hasCenterline: false,
      hasBodyLeft: false,
    }),
    "Capture a centerline axis or a body-left outline before accepting the v2 draft.",
  );
  assert.equal(
    getBodyReferenceV2AcceptDraftReason({
      hasCenterline: true,
      hasBodyLeft: false,
    }),
    null,
  );
});

test("source authority and wrap/export notes stay explicit", () => {
  assert.equal(getBodyReferenceV2CurrentQaSourceLabel(false), "v1 approved contour");
  assert.equal(getBodyReferenceV2CurrentQaSourceLabel(true), "v2 mirrored profile");
  assert.match(
    getBodyReferenceV2SourceAuthorityNote({
      isCurrentGenerationSource: false,
      hasDraftChanges: false,
    }),
    /v1 approved contour/i,
  );
  assert.match(getBodyReferenceV2ReferenceOnlyNote(), /body_mesh/i);
  assert.match(getBodyReferenceV2ReferenceOnlyNote(), /product appearance layers/i);
  assert.match(getBodyReferenceV2WrapExportDistinctionNote(), /never proves BODY CUTOUT QA geometry/i);
});

test("formatBodyReferenceV2ScaleSourceLabel humanizes known sources", () => {
  assert.equal(formatBodyReferenceV2ScaleSourceLabel("lookup-diameter"), "Lookup diameter");
  assert.equal(formatBodyReferenceV2ScaleSourceLabel("manual-diameter"), "Manual diameter");
  assert.equal(formatBodyReferenceV2ScaleSourceLabel("svg-viewbox"), "SVG viewBox");
  assert.equal(formatBodyReferenceV2ScaleSourceLabel("unknown"), "Unknown");
});
