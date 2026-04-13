import test from "node:test";
import assert from "node:assert/strict";
import { deriveTumblerPreviewModelState, type TumblerPreviewBoundsSnapshot } from "./tumblerPreviewModelState.ts";

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
  assert.match(state.message ?? "", /workspace remains canonical/i);
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
