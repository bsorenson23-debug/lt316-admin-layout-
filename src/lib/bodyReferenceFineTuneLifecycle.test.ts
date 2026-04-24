import assert from "node:assert/strict";
import test from "node:test";

import {
  formatBodyReferenceFineTuneLifecycleHash,
  summarizeBodyReferenceFineTuneLifecycle,
} from "./bodyReferenceFineTuneLifecycle.ts";

test("no draft reports the accepted cutout as the current source", () => {
  const summary = summarizeBodyReferenceFineTuneLifecycle({
    hasAcceptedCutout: true,
    isDraftDirty: false,
    hasReviewedGlb: false,
    acceptedSourceHash: "source-hash",
  });

  assert.equal(summary.status, "no-draft");
  assert.equal(summary.label, "No draft");
  assert.equal(
    summary.operatorMessage,
    "No fine-tune draft is active. The accepted BODY REFERENCE cutout is the current source.",
  );
  assert.equal(summary.reviewedGlbFreshRelativeToSource, null);
  assert.equal(summary.glbFreshnessLabel, "unavailable");
  assert.equal(summary.nextActionLabel, "Regenerate BODY CUTOUT QA GLB");
});

test("dirty draft reports draft-only lifecycle copy", () => {
  const summary = summarizeBodyReferenceFineTuneLifecycle({
    hasAcceptedCutout: true,
    isDraftDirty: true,
    hasReviewedGlb: true,
    acceptedSourceHash: "source-v1",
    reviewedGlbSourceHash: "source-v1",
  });

  assert.equal(summary.status, "draft-pending");
  assert.equal(summary.label, "Draft pending");
  assert.equal(summary.operatorMessage, "Editing draft only - current BODY CUTOUT QA GLB is unchanged.");
  assert.equal(summary.nextActionLabel, "Accept corrected cutout");
  assert.equal(summary.warnings.includes("Accepting this cutout will mark the reviewed GLB stale."), true);
});

test("accepted corrected cutout with old GLB reports stale regenerate copy", () => {
  const summary = summarizeBodyReferenceFineTuneLifecycle({
    hasAcceptedCutout: true,
    isDraftDirty: false,
    hasAcceptedCorrectedCutout: true,
    hasReviewedGlb: true,
    acceptedSourceHash: "source-v2",
    reviewedGlbSourceHash: "source-v1",
  });

  assert.equal(summary.status, "reviewed-glb-stale");
  assert.equal(summary.label, "Reviewed GLB stale");
  assert.equal(summary.operatorMessage, "Corrected cutout accepted. Regenerate BODY CUTOUT QA GLB.");
  assert.equal(summary.nextActionLabel, "Regenerate BODY CUTOUT QA GLB from corrected cutout");
  assert.equal(summary.reviewedGlbFreshRelativeToSource, false);
  assert.equal(summary.reviewedGlbStaleRelativeToSource, true);
  assert.equal(summary.warnings.includes("Reviewed GLB is stale relative to accepted cutout."), true);
});

test("matching source and GLB hashes report a fresh reviewed GLB", () => {
  const summary = summarizeBodyReferenceFineTuneLifecycle({
    hasAcceptedCutout: true,
    isDraftDirty: false,
    hasReviewedGlb: true,
    acceptedSourceHash: "source-v2",
    reviewedGlbSourceHash: "source-v2",
  });

  assert.equal(summary.status, "reviewed-glb-fresh");
  assert.equal(summary.label, "Reviewed GLB fresh");
  assert.equal(summary.operatorMessage, "Reviewed GLB is fresh relative to accepted cutout.");
  assert.equal(summary.nextActionLabel, null);
  assert.equal(summary.reviewedGlbFreshRelativeToSource, true);
  assert.equal(summary.glbFreshnessLabel, "fresh");
});

test("explicit GLB freshness wins when display hashes use different domains", () => {
  const summary = summarizeBodyReferenceFineTuneLifecycle({
    hasAcceptedCutout: true,
    isDraftDirty: false,
    hasReviewedGlb: true,
    acceptedSourceHash: "{\"source\":\"signature-payload\"}",
    reviewedGlbSourceHash: "sha256:7ba3737f1234567890",
    reviewedGlbFreshRelativeToSource: true,
  });

  assert.equal(summary.status, "reviewed-glb-fresh");
  assert.equal(summary.glbFreshnessLabel, "fresh");
});

test("missing reviewed GLB keeps freshness unavailable and points at regeneration", () => {
  const summary = summarizeBodyReferenceFineTuneLifecycle({
    hasAcceptedCutout: true,
    isDraftDirty: false,
    hasReviewedGlb: false,
    acceptedSourceHash: "source-v2",
    reviewedGlbSourceHash: null,
  });

  assert.equal(summary.status, "no-draft");
  assert.equal(summary.glbFreshnessLabel, "unavailable");
  assert.equal(summary.reviewedGlbFreshRelativeToSource, null);
  assert.equal(summary.nextActionLabel, "Regenerate BODY CUTOUT QA GLB");
  assert.equal(summary.warnings.length, 1);
});

test("hash labels are shortened and safe for missing hashes", () => {
  assert.equal(formatBodyReferenceFineTuneLifecycleHash(null), "n/a");
  assert.equal(formatBodyReferenceFineTuneLifecycleHash(""), "n/a");
  assert.equal(
    formatBodyReferenceFineTuneLifecycleHash("sha256:0123456789abcdef0123456789abcdef"),
    "sha256:01234567...abcdef",
  );
  assert.equal(
    formatBodyReferenceFineTuneLifecycleHash("0123456789abcdef0123456789abcdef"),
    "sig:01234567...abcdef",
  );
});
