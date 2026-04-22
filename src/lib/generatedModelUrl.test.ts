import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGeneratedModelAuditUrl,
  getGeneratedModelAuditUrlFromModelUrl,
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
      auditUrl: null,
      expectation: "none",
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
