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
    "Paste a product URL or exact tumbler name to enable lookup.",
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
    "Run lookup or auto-detect first so BODY REFERENCE review has a contour to accept.",
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
    }),
    "Generate the reviewed body-only GLB first to unlock BODY CUTOUT QA.",
  );
  assert.equal(
    getTemplateCreatePreviewActionReason({
      action: "wrap-export",
      hasSourceModel: false,
      hasQaPreview: false,
    }),
    "Load a source model first to unlock WRAP / EXPORT preview.",
  );
});

test("blocked action reasons hide while an action is already busy", () => {
  assert.equal(
    resolveTemplateCreateBlockedActionReason({
      busy: true,
      blockedReason: "Accept BODY REFERENCE review before generating BODY CUTOUT QA.",
    }),
    null,
  );
  assert.equal(
    resolveTemplateCreateBlockedActionReason({
      busy: false,
      blockedReason: "Accept BODY REFERENCE review before generating BODY CUTOUT QA.",
    }),
    "Accept BODY REFERENCE review before generating BODY CUTOUT QA.",
  );
});

test("grouping combines repeated disabled reasons and formats labels cleanly", () => {
  const grouped = groupTemplateCreateDisabledActionReasons([
    { label: "WRAP / EXPORT", reason: "Load a source model first to unlock WRAP / EXPORT preview." },
    { label: "Full model", reason: "Load a source model first to unlock Full model preview." },
    { label: "Source compare", reason: "Load a source model first to unlock Source compare preview." },
    { label: "Capture / seed centerline", reason: "Accept BODY REFERENCE (v1) first, then seed v2 capture from the accepted contour." },
    { label: "Set body-left from accepted BODY REFERENCE", reason: "Accept BODY REFERENCE (v1) first, then seed v2 capture from the accepted contour." },
  ]);

  assert.deepEqual(grouped, [
    {
      labels: ["WRAP / EXPORT"],
      reason: "Load a source model first to unlock WRAP / EXPORT preview.",
    },
    {
      labels: ["Full model"],
      reason: "Load a source model first to unlock Full model preview.",
    },
    {
      labels: ["Source compare"],
      reason: "Load a source model first to unlock Source compare preview.",
    },
    {
      labels: ["Capture / seed centerline", "Set body-left from accepted BODY REFERENCE"],
      reason: "Accept BODY REFERENCE (v1) first, then seed v2 capture from the accepted contour.",
    },
  ]);

  assert.equal(
    formatTemplateCreateDisabledActionLabels(grouped[3]?.labels ?? []),
    "Capture / seed centerline and Set body-left from accepted BODY REFERENCE",
  );
});

test("v2 seed reason stays explicit", () => {
  assert.equal(
    getTemplateCreateV2SeedActionReason({ hasApprovedBodyOutline: false }),
    "Accept BODY REFERENCE (v1) first, then seed v2 capture from the accepted contour.",
  );
  assert.equal(getTemplateCreateV2SeedActionReason({ hasApprovedBodyOutline: true }), null);
});
