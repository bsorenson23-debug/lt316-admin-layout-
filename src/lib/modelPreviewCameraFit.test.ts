import assert from "node:assert/strict";
import test from "node:test";

import { resolvePreviewPerspectiveCameraFit } from "./modelPreviewCameraFit.ts";

test("full-model preview camera fits a 172.72mm generated tumbler without front-face crop", () => {
  const fit = resolvePreviewPerspectiveCameraFit({
    previewMode: "full-model",
    size: {
      x: 89.76,
      y: 172.72,
      z: 89.76,
    },
    fovDeg: 35,
    aspect: 2.4,
  });

  assert.ok(fit.fitMargin > 1);
  assert.ok(
    fit.visibleHeightAtFrontMm >= 172.72 * 1.05,
    `Expected at least 5% vertical headroom at the front face, received ${fit.visibleHeightAtFrontMm}`,
  );
});

test("alignment preview camera keeps the tighter non-full fit", () => {
  const fit = resolvePreviewPerspectiveCameraFit({
    previewMode: "alignment-model",
    size: {
      x: 89.76,
      y: 172.72,
      z: 89.76,
    },
    fovDeg: 35,
    aspect: 2.4,
  });

  assert.equal(fit.fitMargin, 1.02);
});
