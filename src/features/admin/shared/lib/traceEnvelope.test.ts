import test from "node:test";
import assert from "node:assert/strict";

import { buildAdminTraceHeaders, createAdminTraceEnvelope } from "./traceEnvelope.ts";
import type { AdminSectionRegistryContext } from "../types";

const context: AdminSectionRegistryContext = {
  selection: {
    templateId: "template-1",
    selectedItemId: "item-1",
  },
  templateEditor: {
    open: true,
    activeStep: "review",
    reviewAccepted: false,
    stagedDetectionPending: true,
    saveGateReason: "Review pending",
    runId: "run-1",
    authority: "staged-detection",
    warnings: ["warn-1"],
    errors: ["err-1"],
    sourceFingerprints: {
      sourceImage: "img:1",
    },
  },
  workspace: null,
  preview: null,
  readiness: null,
  exportBundle: null,
};

test("createAdminTraceEnvelope prefers active section authority", () => {
  const trace = createAdminTraceEnvelope({
    traceId: "trace-1",
    currentSectionId: "template.review",
    context,
  });

  assert.equal(trace.traceId, "trace-1");
  assert.equal(trace.runId, "run-1");
  assert.equal(trace.sectionId, "template.review");
  assert.equal(trace.authority, "staged-detection");
  assert.deepEqual(trace.sourceFingerprints, { sourceImage: "img:1" });
  assert.deepEqual(trace.warnings, ["warn-1"]);
  assert.deepEqual(trace.errors, ["err-1"]);
});

test("buildAdminTraceHeaders emits admin trace headers", () => {
  assert.deepEqual(
    buildAdminTraceHeaders({
      traceId: "trace-1",
      runId: "run-1",
      sectionId: "export.bundle",
    }),
    {
      "x-admin-trace-id": "trace-1",
      "x-admin-run-id": "run-1",
      "x-admin-section-id": "export.bundle",
    },
  );
});
