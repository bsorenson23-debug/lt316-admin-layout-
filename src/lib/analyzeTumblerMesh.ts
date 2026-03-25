import * as THREE from "three";

export interface TumblerGeometry {
  /** Center of the top rim circle (XZ plane, Y = topY) */
  center: THREE.Vector3;
  /** Radius of the top rim circle */
  radius: number;
  /** Y position of the top rim */
  topY: number;
  /** Y position of the lowest point */
  bottomY: number;
  /** Full body height (topY - bottomY) */
  bodyHeight: number;
  /** The actual top rim vertices used for analysis */
  rimVertices: THREE.Vector3[];
}

/**
 * Analyze a Y-up tumbler mesh to find the true cylinder axis and radius
 * by examining the top rim vertices.
 *
 * The top rim is a clean circle — it has no handle geometry, no base taper,
 * and no lid. It gives us the exact center and radius of the cylinder body.
 *
 * Must be called on geometry that has already been normalized to Y-up
 * (e.g., via normalizeGeometry).
 */
export function analyzeTumblerMesh(
  geometry: THREE.BufferGeometry,
): TumblerGeometry {
  const pos = geometry.attributes.position;
  const percentile = (values: number[], p: number): number => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)));
    return sorted[idx];
  };

  // Step 1: Find the Y extent
  let maxY = -Infinity;
  let minY = Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > maxY) maxY = y;
    if (y < minY) minY = y;
  }

  const bodyHeight = maxY - minY;

  // Step 2: Collect vertices near the top — these form the rim circle.
  // Use 2% of body height as tolerance; widen to 5% if too few found.
  let tolerance = bodyHeight * 0.02;
  let rimVertices: THREE.Vector3[] = [];

  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y >= maxY - tolerance) {
      rimVertices.push(
        new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)),
      );
    }
  }

  // Widen tolerance if too few vertices found
  if (rimVertices.length < 4) {
    tolerance = bodyHeight * 0.05;
    rimVertices = [];
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y >= maxY - tolerance) {
        rimVertices.push(
          new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)),
        );
      }
    }
  }

  // Step 3: Robust center/radius detection.
  // Some GLBs include inner/lid vertices on the top plane; averaging all top
  // vertices underestimates radius badly. We refine using outer-distance points.
  const center = new THREE.Vector3(0, maxY, 0);
  let radius = bodyHeight / 4;

  if (rimVertices.length > 0) {
    const xs = rimVertices.map((v) => v.x);
    const zs = rimVertices.map((v) => v.z);
    const xMin = percentile(xs, 0.05);
    const xMax = percentile(xs, 0.95);
    const zMin = percentile(zs, 0.05);
    const zMax = percentile(zs, 0.95);

    // Use trimmed extents instead of raw averaging.
    // This is far more stable when handles/lids leak into the top band.
    center.x = (xMin + xMax) / 2;
    center.z = (zMin + zMax) / 2;

    const radiusX = Math.max(0, (xMax - xMin) / 2);
    const radiusZ = Math.max(0, (zMax - zMin) / 2);
    const extentRadius = Math.max(radiusX, radiusZ);

    const distances = rimVertices
      .map((v) => {
        const dx = v.x - center.x;
        const dz = v.z - center.z;
        return Math.sqrt(dx * dx + dz * dz);
      });

    const outerRadius = percentile(distances, 0.9);
    radius = Math.max(extentRadius, outerRadius);
  }

  return {
    center,
    radius,
    topY: maxY,
    bottomY: minY,
    bodyHeight,
    rimVertices,
  };
}
