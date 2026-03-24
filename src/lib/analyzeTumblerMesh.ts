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

  // Step 3: Compute the center of the rim circle (average XZ of rim verts)
  const center = new THREE.Vector3(0, maxY, 0);
  if (rimVertices.length > 0) {
    for (const v of rimVertices) {
      center.x += v.x;
      center.z += v.z;
    }
    center.x /= rimVertices.length;
    center.z /= rimVertices.length;
  }

  // Step 4: Compute radius as average distance from center in XZ plane
  let totalDist = 0;
  for (const v of rimVertices) {
    const dx = v.x - center.x;
    const dz = v.z - center.z;
    totalDist += Math.sqrt(dx * dx + dz * dz);
  }
  const radius =
    rimVertices.length > 0 ? totalDist / rimVertices.length : bodyHeight / 4;

  return {
    center,
    radius,
    topY: maxY,
    bottomY: minY,
    bodyHeight,
    rimVertices,
  };
}
