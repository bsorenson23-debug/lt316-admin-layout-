import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { inspectGlbFile } from "./inspectGlbFile.ts";

test("inspectGlbFile reports mesh classifications for a generated tumbler GLB", async () => {
  const report = await inspectGlbFile(
    path.join(process.cwd(), "public", "models", "generated", "stanley-iceflow-30-bodyfit-v5.glb"),
  );

  assert.equal(report.file.format, "glb");
  assert.equal(report.scenes.count >= 1, true);
  assert.equal(report.meshes.meshNames.includes("body_mesh"), true);
  assert.equal(report.meshes.bodyMeshNames.includes("body_mesh"), true);
  assert.equal(report.meshes.accessoryMeshNames.includes("rim_mesh"), true);
  assert.equal(report.meshes.fallbackDetected, false);
  assert.equal(report.meshes.primitiveCount > 0, true);
  assert.equal(report.meshes.totalVertexCount > 0, true);
  assert.equal(report.meshes.totalTriangleCount > 0, true);
});
