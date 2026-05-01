import assert from "node:assert/strict";
import test from "node:test";

import {
  APPEARANCE_REFERENCE_USER_DATA,
  resolveGenericTopFinishBandOverlay,
} from "./genericAppearanceReferenceOverlay.ts";
import { createFinishBandReference } from "./productAppearanceReferenceLayers.ts";

const nativeBounds = {
  minX: -40,
  maxX: 40,
  minY: -100,
  maxY: 100,
  minZ: -42,
  maxZ: 42,
};

test("generic preview maps visible top-finish-band onto native tumbler bounds", () => {
  const overlay = resolveGenericTopFinishBandOverlay({
    appearanceReferenceLayers: [
      createFinishBandReference({
        id: "upstream-silver-ring",
        kind: "top-finish-band",
        label: "Silver ring / lower band edge",
        yMm: 28,
        heightMm: 4,
      }),
    ],
    showTemplateSurfaceZones: true,
    overallHeightMm: 220,
    modelScale: 1.1,
    nativeBounds,
    heightAxis: "y",
  });

  assert.ok(overlay);
  assert.equal(overlay.layerId, "upstream-silver-ring");
  assert.equal(overlay.label, "Silver ring / lower band edge");
  assert.deepEqual(overlay.userData, APPEARANCE_REFERENCE_USER_DATA);
  assert.equal(overlay.userData.bodyContractIgnore, true);
  assert.equal(overlay.userData.appearanceReferenceLayer, true);
  assert.equal(overlay.userData.referenceOnly, true);
  assert.equal(Math.round(overlay.position[1] * 1000) / 1000, 72.727);
  assert.equal(Math.round(overlay.height * 1000) / 1000, 3.636);
  assert.equal(Math.round(overlay.radius * 1000) / 1000, 43.091);
});

test("generic preview hides reference overlay outside explicit surface-zone modes", () => {
  const overlay = resolveGenericTopFinishBandOverlay({
    appearanceReferenceLayers: [
      createFinishBandReference({
        id: "top-band",
        kind: "top-finish-band",
        yMm: 20,
        heightMm: 3,
      }),
    ],
    showTemplateSurfaceZones: false,
    overallHeightMm: 220,
    modelScale: 1,
    nativeBounds,
    heightAxis: "y",
  });

  assert.equal(overlay, null);
});

test("generic preview ignores hidden and malformed top-finish-band layers", () => {
  const hidden = resolveGenericTopFinishBandOverlay({
    appearanceReferenceLayers: [
      createFinishBandReference({
        id: "hidden-band",
        kind: "top-finish-band",
        visibility: "hidden",
        yMm: 20,
        heightMm: 3,
      }),
    ],
    showTemplateSurfaceZones: true,
    overallHeightMm: 220,
    modelScale: 1,
    nativeBounds,
    heightAxis: "y",
  });

  const malformed = resolveGenericTopFinishBandOverlay({
    appearanceReferenceLayers: [
      createFinishBandReference({
        id: "bad-band",
        kind: "top-finish-band",
        yMm: 20,
        heightMm: -1,
      }),
    ],
    showTemplateSurfaceZones: true,
    overallHeightMm: 220,
    modelScale: 1,
    nativeBounds,
    heightAxis: "y",
  });

  assert.equal(hidden, null);
  assert.equal(malformed, null);
});

test("generic preview orients reference band for non-Y-up source axes", () => {
  const layer = createFinishBandReference({
    id: "top-band",
    kind: "top-finish-band",
    yMm: 24,
    heightMm: 4,
  });
  const xAxis = resolveGenericTopFinishBandOverlay({
    appearanceReferenceLayers: [layer],
    showTemplateSurfaceZones: true,
    overallHeightMm: 220,
    modelScale: 1,
    nativeBounds,
    heightAxis: "x",
  });
  const zAxis = resolveGenericTopFinishBandOverlay({
    appearanceReferenceLayers: [layer],
    showTemplateSurfaceZones: true,
    overallHeightMm: 220,
    modelScale: 1,
    nativeBounds,
    heightAxis: "z",
  });

  assert.deepEqual(xAxis?.rotation, [0, 0, -Math.PI / 2]);
  assert.deepEqual(zAxis?.rotation, [Math.PI / 2, 0, 0]);
  assert.equal(xAxis?.position[0], 14);
  assert.equal(zAxis?.position[2], 16);
});
