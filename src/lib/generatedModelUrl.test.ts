import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGeneratedModelAuditUrl,
  getGeneratedModelAuditUrlFromModelUrl,
  inferGeneratedModelStatusFromSource,
  resolveGeneratedModelAuditRequestPlan,
} from "./generatedModelUrl.ts";

test("buildGeneratedModelAuditUrl builds the generated-model audit route", () => {
  assert.equal(
    buildGeneratedModelAuditUrl("stanley-cutout.glb"),
    "/api/admin/models/generated-audit/stanley-cutout.glb",
  );
});

test("getGeneratedModelAuditUrlFromModelUrl resolves generated and legacy audit sidecar URLs", () => {
  assert.equal(
    getGeneratedModelAuditUrlFromModelUrl("/api/admin/models/generated/stanley-cutout.glb?viewerRev=abc123"),
    "/api/admin/models/generated-audit/stanley-cutout.glb",
  );
  assert.equal(
    getGeneratedModelAuditUrlFromModelUrl("/models/generated/stanley-cutout.glb?viewerRev=abc123"),
    "/models/generated/stanley-cutout.audit.json",
  );
  assert.equal(
    getGeneratedModelAuditUrlFromModelUrl("/models/templates/yeti-rambler-40oz.glb"),
    null,
  );
});

test("resolveGeneratedModelAuditRequestPlan requires audit fetches for reviewed generated GLBs only", () => {
  assert.deepEqual(
    resolveGeneratedModelAuditRequestPlan({
      modelUrl: "/api/admin/models/generated/stanley-cutout.glb?viewerRev=abc123",
      sourceModelStatus: "generated-reviewed-model",
    }),
    {
      auditUrl: "/api/admin/models/generated-audit/stanley-cutout.glb",
      expectation: "required",
      shouldFetch: true,
    },
  );

  assert.deepEqual(
    resolveGeneratedModelAuditRequestPlan({
      modelUrl: "/api/admin/models/generated/the-quencher-h2-0-flowstate-tumbler-trace-c84baea8c2.glb?viewerRev=abc123",
      sourceModelStatus: "verified-product-model",
    }),
    {
      auditUrl: "/api/admin/models/generated-audit/the-quencher-h2-0-flowstate-tumbler-trace-c84baea8c2.glb",
      expectation: "optional",
      shouldFetch: false,
    },
  );

  assert.deepEqual(
    resolveGeneratedModelAuditRequestPlan({
      modelUrl: "/models/templates/yeti-rambler-40oz.glb",
      sourceModelStatus: "verified-product-model",
    }),
    {
      auditUrl: null,
      expectation: "none",
      shouldFetch: false,
    },
  );
});

test("inferGeneratedModelStatusFromSource distinguishes reviewed cutout GLBs from generated previews", () => {
  assert.equal(
    inferGeneratedModelStatusFromSource({
      modelUrl: "/api/admin/models/generated/stanley-cutout.glb?viewerRev=abc123",
    }),
    "generated-reviewed-model",
  );
  assert.equal(
    inferGeneratedModelStatusFromSource({
      modelUrl: "/models/generated/the-quencher-h2-0-flowstate-tumbler-trace-c84baea8c2.glb",
    }),
    "verified-product-model",
  );
  assert.equal(
    inferGeneratedModelStatusFromSource({
      modelUrl: "/api/admin/models/generated/stanley-review.glb",
      sourceModelLabel: "Generated from accepted BODY REFERENCE cutout",
    }),
    "generated-reviewed-model",
  );
});

test("resolveGeneratedModelAuditRequestPlan falls back to reviewed-vs-preview inference when status is missing", () => {
  assert.deepEqual(
    resolveGeneratedModelAuditRequestPlan({
      modelUrl: "/api/admin/models/generated/unknown-unknown-20oz-cutout-c99ba851f2f6.glb?viewerRev=abc123",
    }),
    {
      auditUrl: "/api/admin/models/generated-audit/unknown-unknown-20oz-cutout-c99ba851f2f6.glb",
      expectation: "required",
      shouldFetch: true,
    },
  );

  assert.deepEqual(
    resolveGeneratedModelAuditRequestPlan({
      modelUrl: "/models/generated/the-quencher-h2-0-flowstate-tumbler-trace-c84baea8c2.glb?viewerRev=abc123",
    }),
    {
      auditUrl: "/models/generated/the-quencher-h2-0-flowstate-tumbler-trace-c84baea8c2.audit.json",
      expectation: "optional",
      shouldFetch: false,
    },
  );
});
