import * as THREE from "three";

/**
 * Detect the up-axis of a loaded GLB/model geometry and return a correction
 * rotation that orients it to Three.js's Y-up convention.
 *
 * Many 3D tools (Blender Z-up, Luma Genie, etc.) export with Z or X as the
 * tallest axis. This mirrors the detection logic in ModelViewer.tsx's
 * `computeModelTransform()`.
 */
export function detectAxisCorrection(
  sizeX: number,
  sizeY: number,
  sizeZ: number,
): [number, number, number] {
  // If Z is tallest by >15%, the model is Z-up → rotate to Y-up
  if (sizeZ > sizeY * 1.15 && sizeZ > sizeX) {
    return [-Math.PI / 2, 0, 0];
  }
  // If X is tallest by >15%, the model is X-up → rotate to Y-up
  if (sizeX > sizeY * 1.15 && sizeX > sizeZ) {
    return [0, 0, Math.PI / 2];
  }
  // Y is already tallest — no correction needed
  return [0, 0, 0];
}

/**
 * Identify which raw axis is the model's actual height (tallest dimension)
 * so scaling can reference the correct axis before rotation is applied.
 */
export function getTallestAxisSize(
  sizeX: number,
  sizeY: number,
  sizeZ: number,
): number {
  return Math.max(sizeX, sizeY, sizeZ);
}

/**
 * After axis correction, the two shorter dimensions become the horizontal
 * cross-section (diameter). This returns the max of the two non-height axes.
 */
export function getDiameterAxesMax(
  sizeX: number,
  sizeY: number,
  sizeZ: number,
): number {
  if (sizeZ > sizeY * 1.15 && sizeZ > sizeX) {
    // Z was height → X and Y are diameter axes
    return Math.max(sizeX, sizeY);
  }
  if (sizeX > sizeY * 1.15 && sizeX > sizeZ) {
    // X was height → Y and Z are diameter axes
    return Math.max(sizeY, sizeZ);
  }
  // Y is height → X and Z are diameter axes
  return Math.max(sizeX, sizeZ);
}

/**
 * Clone a geometry, rotate it to Y-up if needed, and center it at the origin.
 * Returns a normalized geometry where:
 *   - Y is the tallest axis (height)
 *   - The bounding box is centered at (0,0,0)
 *   - Vertex normals are recomputed
 *
 * Safe to call multiple times — always clones first.
 */
export function normalizeGeometry(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const clone = geo.clone();
  clone.computeBoundingBox();
  const box = clone.boundingBox!;
  const sizeX = box.max.x - box.min.x;
  const sizeY = box.max.y - box.min.y;
  const sizeZ = box.max.z - box.min.z;

  const [rx, ry, rz] = detectAxisCorrection(sizeX, sizeY, sizeZ);
  if (rx !== 0) clone.rotateX(rx);
  if (ry !== 0) clone.rotateY(ry);
  if (rz !== 0) clone.rotateZ(rz);

  // Center at origin after rotation
  clone.computeBoundingBox();
  clone.center();
  // Recompute bbox after centering so callers see the centered bounds
  clone.computeBoundingBox();
  clone.computeVertexNormals();

  return clone;
}
