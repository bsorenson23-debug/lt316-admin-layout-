import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_IMAGE_TO_SVG_SESSION,
  clearImageToSvgSession,
  normalizeImageToSvgSession,
  readImageToSvgSession,
  writeImageToSvgSession,
} from "./imageToSvgSession.ts";
import { createTemplatePipelineDiagnostics, upsertTemplatePipelineStage } from "./templatePipelineDiagnostics.ts";

test("normalizeImageToSvgSession restores valid fields and falls back on invalid values", () => {
  const snapshot = normalizeImageToSvgSession({
    sourceFile: {
      name: "photo.png",
      type: "image/png",
      dataUrl: "data:image/png;base64,abc123",
    },
    workingFile: {
      name: "photo-cutout.png",
      type: "image/png",
      dataUrl: "data:image/png;base64,def456",
    },
    traceMode: "posterize",
    traceRecipe: "line-art",
    thresholdMode: "manual",
    threshold: 188,
    invert: true,
    hiddenSvgColors: ["#111111", "", 42],
    branchPreviews: {
      colorPreview: "data:image/png;base64,zzz",
      invalidPreview: "ignore-me",
    },
    bgEngine: "BiRefNet",
    cleanupEngine: "OpenAI cleanup",
    outputColor: "#112233",
    previewBackground: "dark",
    bedPreviewTarget: "shapePreview",
    stats: { pathCount: 12, width: 80, height: 40 },
    traceEngine: "asset-pipeline",
    despeckleLevel: 3,
  });

  assert.equal(snapshot.sourceFile?.name, "photo.png");
  assert.equal(snapshot.workingFile?.name, "photo-cutout.png");
  assert.equal(snapshot.traceMode, "posterize");
  assert.equal(snapshot.traceRecipe, "line-art");
  assert.equal(snapshot.thresholdMode, "manual");
  assert.equal(snapshot.threshold, 188);
  assert.equal(snapshot.invert, true);
  assert.deepEqual(snapshot.hiddenSvgColors, ["#111111"]);
  assert.deepEqual(snapshot.branchPreviews, { colorPreview: "data:image/png;base64,zzz" });
  assert.equal(snapshot.traceEngine, "asset-pipeline");
  assert.equal(snapshot.despeckleLevel, 3);
});

test("normalizeImageToSvgSession restores diagnostics envelope when present", () => {
  const diagnostics = upsertTemplatePipelineStage(
    createTemplatePipelineDiagnostics({
      runId: "tpl-stanley-replay",
      startedAt: "2026-04-10T12:00:00.000Z",
    }),
    {
      id: "vectorize",
      status: "warning",
      authority: "server-vectorize",
      engine: "potrace",
      fallback: {
        used: true,
        from: "asset-pipeline",
        reason: "asset pipeline unavailable",
      },
      warnings: ["Asset pipeline fallback used: asset pipeline unavailable"],
      errors: [],
      artifacts: {
        branchPreviewsAvailable: true,
      },
    },
  );

  const snapshot = normalizeImageToSvgSession({
    ...DEFAULT_IMAGE_TO_SVG_SESSION,
    diagnostics,
  });

  assert.equal(snapshot.diagnostics?.runId, "tpl-stanley-replay");
  assert.equal(snapshot.diagnostics?.stages[0]?.id, "vectorize");
  assert.equal(snapshot.diagnostics?.stages[0]?.fallback?.used, true);
});

test("readImageToSvgSession and clearImageToSvgSession handle storage lifecycle safely", () => {
  const storage = new Map<string, string>();
  const mockStorage = {
    getItem(key: string) {
      return storage.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      storage.set(key, value);
    },
    removeItem(key: string) {
      storage.delete(key);
    },
  };

  writeImageToSvgSession("image-session", DEFAULT_IMAGE_TO_SVG_SESSION, mockStorage);
  const restored = readImageToSvgSession("image-session", mockStorage);
  assert.deepEqual(restored, DEFAULT_IMAGE_TO_SVG_SESSION);

  clearImageToSvgSession("image-session", mockStorage);
  assert.equal(readImageToSvgSession("image-session", mockStorage), null);
});
