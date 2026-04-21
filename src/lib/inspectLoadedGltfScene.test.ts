import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";

import { inspectLoadedGltfScene } from "./inspectLoadedGltfScene.ts";

test("inspectLoadedGltfScene classifies meshes, bounds, and counts after load", () => {
  const scene = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(88, 225, 88, 2, 2, 2),
    new THREE.MeshStandardMaterial({ name: "powdercoat" }),
  );
  body.name = "tumbler_body_shell";
  body.position.set(0, 112.5, 0);
  scene.add(body);

  const lid = new THREE.Mesh(
    new THREE.CylinderGeometry(46, 46, 18, 16),
    new THREE.MeshStandardMaterial({ name: "lid-finish" }),
  );
  lid.name = "lid_mesh";
  lid.position.set(0, 232, 0);
  scene.add(lid);

  const fallback = new THREE.Mesh(
    new THREE.BoxGeometry(20, 12, 8),
    new THREE.MeshStandardMaterial({ name: "debug-fallback" }),
  );
  fallback.name = "generated-placeholder_handle_mesh";
  fallback.visible = false;
  fallback.position.set(52, 180, 0);
  scene.add(fallback);

  const inspection = inspectLoadedGltfScene(scene, { boundsUnits: "mm" });

  assert.deepEqual(inspection.meshNames, [
    "generated-placeholder_handle_mesh",
    "lid_mesh",
    "tumbler_body_shell",
  ]);
  assert.deepEqual(inspection.visibleMeshNames, [
    "lid_mesh",
    "tumbler_body_shell",
  ]);
  assert.deepEqual(inspection.materialNames, [
    "debug-fallback",
    "lid-finish",
    "powdercoat",
  ]);
  assert.deepEqual(inspection.bodyMeshNames, ["tumbler_body_shell"]);
  assert.deepEqual(inspection.accessoryMeshNames, ["lid_mesh"]);
  assert.deepEqual(inspection.fallbackMeshNames, ["generated-placeholder_handle_mesh"]);
  assert.equal(inspection.fallbackDetected, true);
  assert.equal(inspection.bounds.units, "mm");
  assert.equal(inspection.bounds.body?.width, 88);
  assert.equal(inspection.bounds.body?.height, 225);
  assert.equal(inspection.bounds.accessory?.height, 18);
  assert.ok((inspection.bounds.fullScene?.height ?? 0) > 225);
  assert.ok(inspection.totalVertexCount > 0);
  assert.ok(inspection.totalTriangleCount > 0);
  assert.deepEqual(inspection.warnings, []);
});

test("inspectLoadedGltfScene warns when only scene units are known", () => {
  const scene = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 2, 3),
    new THREE.MeshStandardMaterial(),
  );
  mesh.name = "body_mesh";
  scene.add(mesh);

  const inspection = inspectLoadedGltfScene(scene);

  assert.equal(inspection.bounds.units, "scene-units");
  assert.match(inspection.warnings.join(" "), /scene units/i);
});
