import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveTumblerPreviewModelState,
  getTumblerPreviewModelStateSignature,
  type TumblerPreviewBoundsSnapshot,
} from "./tumblerPreviewModelState.ts";

const canonicalBounds: TumblerPreviewBoundsSnapshot = {
  widthMm: 101,
  heightMm: 216,
  depthMm: 101,
};

test("deriveTumblerPreviewModelState keeps full-model ready when the source bounds are tumbler-like", () => {
  const state = deriveTumblerPreviewModelState({
    requestedMode: "full-model",
    hasCanonicalAlignmentModel: true,
    hasSourceModel: true,
    sourceModelPath: "/models/templates/yeti-rambler-40oz.glb",
    sourceBounds: {
      widthMm: 103,
      heightMm: 216,
      depthMm: 98,
    },
    canonicalBounds,
  });

  assert.equal(state.effectiveMode, "full-model");
  assert.equal(state.glbPreviewStatus, "ready");
  assert.equal(state.message, null);
});

test("deriveTumblerPreviewModelState degrades a generated Stanley trace profile to alignment-model", () => {
  const state = deriveTumblerPreviewModelState({
    requestedMode: "full-model",
    hasCanonicalAlignmentModel: true,
    hasSourceModel: true,
    sourceModelPath: "/models/generated/the-quencher-h2-0-flowstate-tumbler-trace-c84baea8c2.glb",
    sourceBounds: {
      widthMm: 86,
      heightMm: 216,
      depthMm: 4.4,
    },
    canonicalBounds,
  });

  assert.equal(state.effectiveMode, "alignment-model");
  assert.equal(state.glbPreviewStatus, "degraded");
  assert.equal(state.reason, "generated-trace-profile");
  assert.match(state.message ?? "", /saved printable geometry remain canonical/i);
});

test("deriveTumblerPreviewModelState degrades generated trace paths even when the mesh bounds look tumbler-like", () => {
  const state = deriveTumblerPreviewModelState({
    requestedMode: "full-model",
    hasCanonicalAlignmentModel: true,
    hasSourceModel: true,
    sourceModelPath: "/models/generated/the-quencher-h2-0-flowstate-tumbler-trace-c84baea8c2.glb",
    sourceBounds: {
      widthMm: 101,
      heightMm: 216,
      depthMm: 96,
    },
    canonicalBounds,
  });

  assert.equal(state.effectiveMode, "alignment-model");
  assert.equal(state.glbPreviewStatus, "degraded");
  assert.equal(state.reason, "generated-trace-profile");
  assert.match(state.message ?? "", /generated front trace/i);
});

test("deriveTumblerPreviewModelState degrades generated trace paths before source bounds finish loading", () => {
  const state = deriveTumblerPreviewModelState({
    requestedMode: "full-model",
    hasCanonicalAlignmentModel: true,
    hasSourceModel: true,
    sourceModelPath: "/models/generated/the-quencher-h2-0-flowstate-tumbler-trace-c84baea8c2.glb",
    sourceBounds: null,
    canonicalBounds: { widthMm: 99.8, heightMm: 273.8, depthMm: 99.8 },
  });

  assert.equal(state.effectiveMode, "alignment-model");
  assert.equal(state.glbPreviewStatus, "degraded");
  assert.equal(state.reason, "generated-trace-profile");
  assert.match(state.message ?? "", /generated front trace/i);
});

test("preview state signature captures requested versus effective preview mismatch", () => {
  const state = deriveTumblerPreviewModelState({
    requestedMode: "full-model",
    hasCanonicalAlignmentModel: true,
    hasSourceModel: true,
    sourceModelPath: "/models/generated/the-quencher-h2-0-flowstate-tumbler-trace-c84baea8c2.glb",
    sourceBounds: null,
    canonicalBounds: { widthMm: 99.8, heightMm: 273.8, depthMm: 99.8 },
  });

  assert.equal(
    getTumblerPreviewModelStateSignature(state),
    [
      "full-model",
      "alignment-model",
      "degraded",
      "/models/generated/the-quencher-h2-0-flowstate-tumbler-trace-c84baea8c2.glb",
      "generated-trace-profile",
      state.message ?? "",
    ].join("|"),
  );
});

test("deriveTumblerPreviewModelState degrades flat profile bounds even without a generated path", () => {
  const state = deriveTumblerPreviewModelState({
    requestedMode: "full-model",
    hasCanonicalAlignmentModel: true,
    hasSourceModel: true,
    sourceModelPath: "/models/templates/custom-proxy.glb",
    sourceBounds: {
      widthMm: 99,
      heightMm: 216,
      depthMm: 10,
    },
    canonicalBounds,
  });

  assert.equal(state.effectiveMode, "alignment-model");
  assert.equal(state.glbPreviewStatus, "degraded");
  assert.equal(state.reason, "flat-profile-bounds");
});

test("deriveTumblerPreviewModelState remaps reviewed generated models to BODY CUTOUT QA", () => {
  const state = deriveTumblerPreviewModelState({
    requestedMode: "full-model",
    hasCanonicalAlignmentModel: true,
    hasSourceModel: true,
    sourceModelPath: "/api/admin/models/generated/stanley-cutout.glb",
    sourceModelStatus: "generated-reviewed-model",
    sourceBounds: {
      widthMm: 99,
      heightMm: 216,
      depthMm: 98,
    },
    canonicalBounds,
  });

  assert.equal(state.effectiveMode, "body-cutout-qa");
  assert.equal(state.glbPreviewStatus, "ready");
  assert.equal(state.reason, "body-cutout-qa-ready");
  assert.match(state.message ?? "", /body cutout qa/i);
  assert.doesNotMatch(state.message ?? "", /preview-only fallback silhouette/i);
});

test("deriveTumblerPreviewModelState keeps WRAP / EXPORT distinct from BODY CUTOUT QA for reviewed GLBs", () => {
  const state = deriveTumblerPreviewModelState({
    requestedMode: "wrap-export",
    hasCanonicalAlignmentModel: true,
    hasSourceModel: true,
    sourceModelPath: "/api/admin/models/generated/stanley-cutout.glb",
    sourceModelStatus: "generated-reviewed-model",
    sourceBounds: {
      widthMm: 99,
      heightMm: 216,
      depthMm: 98,
    },
    canonicalBounds,
  });

  assert.equal(state.effectiveMode, "wrap-export");
  assert.equal(state.glbPreviewStatus, "ready");
  assert.equal(state.reason, "wrap-export-ready");
  assert.match(state.message ?? "", /not body cutout qa proof/i);
});

test("deriveTumblerPreviewModelState keeps WRAP / EXPORT explicit when only provisional product geometry exists", () => {
  const state = deriveTumblerPreviewModelState({
    requestedMode: "wrap-export",
    hasCanonicalAlignmentModel: true,
    hasSourceModel: true,
    sourceModelPath: "/models/templates/yeti-rambler-40oz.glb",
    sourceModelStatus: "verified-product-model",
    sourceBounds: {
      widthMm: 103,
      heightMm: 216,
      depthMm: 98,
    },
    canonicalBounds,
  });

  assert.equal(state.effectiveMode, "wrap-export");
  assert.equal(state.glbPreviewStatus, "ready");
  assert.equal(state.reason, "wrap-export-ready");
  assert.match(state.message ?? "", /provisional until a reviewed body-only glb exists/i);
});

test("deriveTumblerPreviewModelState keeps WRAP / EXPORT unavailable instead of silently degrading when no source model exists", () => {
  const state = deriveTumblerPreviewModelState({
    requestedMode: "wrap-export",
    hasCanonicalAlignmentModel: true,
    hasSourceModel: false,
    sourceModelPath: null,
    sourceBounds: null,
    canonicalBounds,
  });

  assert.equal(state.effectiveMode, "wrap-export");
  assert.equal(state.glbPreviewStatus, "unavailable");
  assert.equal(state.reason, "missing-source-model");
  assert.match(state.message ?? "", /requires a current source model/i);
});

test("deriveTumblerPreviewModelState keeps BODY CUTOUT QA loading while reviewed bounds are unresolved", () => {
  const state = deriveTumblerPreviewModelState({
    requestedMode: "body-cutout-qa",
    hasCanonicalAlignmentModel: true,
    hasSourceModel: true,
    sourceModelPath: "/api/admin/models/generated/stanley-cutout.glb",
    sourceModelStatus: "generated-reviewed-model",
    sourceBounds: null,
    canonicalBounds,
  });

  assert.equal(state.effectiveMode, "body-cutout-qa");
  assert.equal(state.glbPreviewStatus, "loading");
  assert.equal(state.reason, "loading");
  assert.equal(state.message, null);
});

test("deriveTumblerPreviewModelState reports BODY CUTOUT QA unavailable for non-reviewed sources", () => {
  const state = deriveTumblerPreviewModelState({
    requestedMode: "body-cutout-qa",
    hasCanonicalAlignmentModel: true,
    hasSourceModel: true,
    sourceModelPath: "/models/templates/yeti-rambler-40oz.glb",
    sourceModelStatus: "verified-product-model",
    sourceBounds: {
      widthMm: 103,
      heightMm: 216,
      depthMm: 98,
    },
    canonicalBounds,
  });

  assert.equal(state.effectiveMode, "alignment-model");
  assert.equal(state.glbPreviewStatus, "unavailable");
  assert.equal(state.reason, "qa-source-unavailable");
  assert.match(state.message ?? "", /requires a generated reviewed body-only glb/i);
});

test("deriveTumblerPreviewModelState keeps verified product models on generated paths in full-model loading", () => {
  const state = deriveTumblerPreviewModelState({
    requestedMode: "full-model",
    hasCanonicalAlignmentModel: true,
    hasSourceModel: true,
    sourceModelPath: "/models/generated/stanley-verified-product.glb",
    sourceModelStatus: "verified-product-model",
    sourceBounds: null,
    canonicalBounds,
  });

  assert.equal(state.effectiveMode, "full-model");
  assert.equal(state.glbPreviewStatus, "loading");
  assert.equal(state.reason, "loading");
  assert.equal(state.message, null);
});

test("deriveTumblerPreviewModelState reports unavailable full-model preview when no source model exists", () => {
  const state = deriveTumblerPreviewModelState({
    requestedMode: "full-model",
    hasCanonicalAlignmentModel: true,
    hasSourceModel: false,
    sourceModelPath: null,
    sourceBounds: null,
    canonicalBounds,
  });

  assert.equal(state.effectiveMode, "alignment-model");
  assert.equal(state.glbPreviewStatus, "unavailable");
  assert.equal(state.reason, "missing-source-model");
});

test("deriveTumblerPreviewModelState leaves non-full preview requests unchanged", () => {
  const state = deriveTumblerPreviewModelState({
    requestedMode: "alignment-model",
    hasCanonicalAlignmentModel: true,
    hasSourceModel: true,
    sourceModelPath: "/models/generated/the-quencher-h2-0-flowstate-tumbler-trace-c84baea8c2.glb",
    sourceBounds: {
      widthMm: 86,
      heightMm: 216,
      depthMm: 4.4,
    },
    canonicalBounds,
  });

  assert.equal(state.effectiveMode, "alignment-model");
  assert.equal(state.glbPreviewStatus, "not-requested");
  assert.equal(state.reason, "not-requested");
});
