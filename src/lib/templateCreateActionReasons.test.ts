import assert from "node:assert/strict";
import test from "node:test";

import {
  formatTemplateCreateDisabledActionLabels,
  getTemplateCreateLookupActionReason,
  getTemplateCreatePreviewActionReason,
  getTemplateCreateReviewAcceptActionReason,
  getTemplateCreateV2SeedActionReason,
  groupTemplateCreateDisabledActionReasons,
  resolveTemplateCreateBlockedActionReason,
} from "./templateCreateActionReasons.ts";

test("lookup reason explains empty lookup input", () => {
  assert.equal(
    getTemplateCreateLookupActionReason({
      lookupInput: "   ",
      lookingUp: false,
    }),
    "Enter a product URL or exact tumbler name first.",
  );
  assert.equal(
    getTemplateCreateLookupActionReason({
      lookupInput: "YETI Rambler 40 oz",
      lookingUp: false,
    }),
    null,
  );
});

test("review accept reason only appears before v1 review is available", () => {
  assert.equal(
    getTemplateCreateReviewAcceptActionReason({
      hasAcceptedReview: false,
      hasLivePipeline: false,
    }),
    "Run lookup or auto-detect before accepting BODY REFERENCE.",
  );
  assert.equal(
    getTemplateCreateReviewAcceptActionReason({
      hasAcceptedReview: true,
      hasLivePipeline: true,
    }),
    null,
  );
});

test("preview action reasons stay specific to the blocked control", () => {
  assert.equal(
    getTemplateCreatePreviewActionReason({
      action: "body-cutout-qa",
      hasSourceModel: false,
      hasQaPreview: false,
      hasAcceptedBodyReference: false,
    }),
    "Accept BODY REFERENCE first.",
  );
  assert.equal(
    getTemplateCreatePreviewActionReason({
      action: "body-cutout-qa",
      hasSourceModel: false,
      hasQaPreview: false,
      hasAcceptedBodyReference: true,
    }),
    "Generate reviewed GLB first.",
  );
  assert.equal(
    getTemplateCreatePreviewActionReason({
      action: "body-cutout-qa",
      hasSourceModel: false,
      hasQaPreview: true,
      hasAcceptedBodyReference: true,
    }),
    null,
  );
  assert.equal(
    getTemplateCreatePreviewActionReason({
      action: "wrap-export",
      hasSourceModel: false,
      hasQaPreview: false,
    }),
    "Load or generate a model first.",
  );
});

test("blocked action reasons hide while an action is already busy", () => {
  assert.equal(
    resolveTemplateCreateBlockedActionReason({
      busy: true,
      blockedReason: "Accept BODY REFERENCE first.",
    }),
    null,
  );
  assert.equal(
    resolveTemplateCreateBlockedActionReason({
      busy: false,
      blockedReason: "Accept BODY REFERENCE first.",
    }),
    "Accept BODY REFERENCE first.",
  );
});

test("grouping combines repeated disabled reasons and formats labels cleanly", () => {
  const grouped = groupTemplateCreateDisabledActionReasons([
    { label: "WRAP / EXPORT", reason: "Load or generate a model first." },
    { label: "Full model", reason: "Load or generate a model first." },
    { label: "Source compare", reason: "Load or generate a model first." },
    { label: "Capture / seed centerline", reason: "Accept BODY REFERENCE (v1) first." },
    { label: "Set body-left from accepted BODY REFERENCE", reason: "Accept BODY REFERENCE (v1) first." },
  ]);

  assert.deepEqual(grouped, [
    {
      labels: ["WRAP / EXPORT", "Full model", "Source compare"],
      reason: "Load or generate a model first.",
    },
    {
      labels: ["Capture / seed centerline", "Set body-left from accepted BODY REFERENCE"],
      reason: "Accept BODY REFERENCE (v1) first.",
    },
  ]);

  assert.equal(
    formatTemplateCreateDisabledActionLabels(grouped[1]?.labels ?? []),
    "Capture / seed centerline and Set body-left from accepted BODY REFERENCE",
  );
});

test("v2 seed reason stays explicit", () => {
  assert.equal(
    getTemplateCreateV2SeedActionReason({ hasApprovedBodyOutline: false }),
    "Accept BODY REFERENCE (v1) first.",
  );
  assert.equal(getTemplateCreateV2SeedActionReason({ hasApprovedBodyOutline: true }), null);
});
