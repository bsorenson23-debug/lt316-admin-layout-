import * as THREE from "three";

import {
  detectAccessoryMeshes,
  detectBodyMeshes,
  detectFallbackMeshes,
} from "./bodyGeometryContract.ts";

export type LoadedSceneBoundsUnits = "mm" | "scene-units";

export interface LoadedSceneBoundsSummary {
  width: number;
  height: number;
  depth: number;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface LoadedGltfSceneInspection {
  meshNames: string[];
  visibleMeshNames: string[];
  materialNames: string[];
  bodyMeshNames: string[];
  accessoryMeshNames: string[];
  fallbackMeshNames: string[];
  fallbackDetected: boolean;
  unexpectedMeshNames: string[];
  totalVertexCount: number;
  totalTriangleCount: number;
  bounds: {
    units: LoadedSceneBoundsUnits;
    fullScene: LoadedSceneBoundsSummary | null;
    body: LoadedSceneBoundsSummary | null;
    accessory: LoadedSceneBoundsSummary | null;
    fallback: LoadedSceneBoundsSummary | null;
  };
  warnings: string[];
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function toBoundsSummary(bounds: THREE.Box3 | null): LoadedSceneBoundsSummary | null {
  if (!bounds || bounds.isEmpty()) return null;
  const size = bounds.getSize(new THREE.Vector3());
  return {
    width: round3(size.x),
    height: round3(size.y),
    depth: round3(size.z),
    minX: round3(bounds.min.x),
    minY: round3(bounds.min.y),
    minZ: round3(bounds.min.z),
    maxX: round3(bounds.max.x),
    maxY: round3(bounds.max.y),
    maxZ: round3(bounds.max.z),
  };
}

function buildBoundsFromMeshes(meshes: readonly THREE.Mesh[]): THREE.Box3 | null {
  const union = new THREE.Box3();
  let hasBounds = false;
  for (const mesh of meshes) {
    const meshBounds = new THREE.Box3().setFromObject(mesh);
    if (meshBounds.isEmpty()) continue;
    if (!hasBounds) {
      union.copy(meshBounds);
      hasBounds = true;
      continue;
    }
    union.union(meshBounds);
  }
  return hasBounds ? union : null;
}

export function inspectLoadedGltfScene(
  scene: THREE.Object3D,
  options?: { boundsUnits?: LoadedSceneBoundsUnits },
): LoadedGltfSceneInspection {
  const boundsUnits = options?.boundsUnits ?? "scene-units";
  const namedMeshes = new Map<string, THREE.Mesh>();
  const visibleMeshNames = new Set<string>();
  const materialNames = new Set<string>();
  const meshes: THREE.Mesh[] = [];
  let totalVertexCount = 0;
  let totalTriangleCount = 0;

  scene.updateMatrixWorld(true);
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    meshes.push(child);

    if (child.name) {
      namedMeshes.set(child.name, child);
      if (child.visible) visibleMeshNames.add(child.name);
    }

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (material?.name) materialNames.add(material.name);
    }

    const geometry = child.geometry;
    if (!(geometry instanceof THREE.BufferGeometry)) return;
    const position = geometry.getAttribute("position");
    if (position) {
      totalVertexCount += position.count;
      totalTriangleCount += geometry.index
        ? Math.floor(geometry.index.count / 3)
        : Math.floor(position.count / 3);
    }
  });

  const meshNames = [...namedMeshes.keys()].sort((left, right) => left.localeCompare(right));
  const bodyMeshNames = detectBodyMeshes(meshNames);
  const accessoryMeshNames = detectAccessoryMeshes(meshNames);
  const fallbackMeshNames = detectFallbackMeshes(meshNames);
  const unexpectedMeshNames = meshNames.filter((name) => (
    !bodyMeshNames.includes(name) &&
    !accessoryMeshNames.includes(name) &&
    !fallbackMeshNames.includes(name)
  ));

  const bodyMeshes = bodyMeshNames.map((name) => namedMeshes.get(name)).filter((mesh): mesh is THREE.Mesh => Boolean(mesh));
  const accessoryMeshes = accessoryMeshNames.map((name) => namedMeshes.get(name)).filter((mesh): mesh is THREE.Mesh => Boolean(mesh));
  const fallbackMeshes = fallbackMeshNames.map((name) => namedMeshes.get(name)).filter((mesh): mesh is THREE.Mesh => Boolean(mesh));

  const warnings: string[] = [];
  if (boundsUnits === "scene-units") {
    warnings.push("Loaded mesh bounds are reported in scene units because physical millimeter scaling is not confirmed.");
  }
  if (meshNames.length === 0) {
    warnings.push("No named meshes were detected in the loaded scene.");
  }

  return {
    meshNames,
    visibleMeshNames: [...visibleMeshNames].sort((left, right) => left.localeCompare(right)),
    materialNames: [...materialNames].sort((left, right) => left.localeCompare(right)),
    bodyMeshNames,
    accessoryMeshNames,
    fallbackMeshNames,
    fallbackDetected: fallbackMeshNames.length > 0,
    unexpectedMeshNames,
    totalVertexCount,
    totalTriangleCount,
    bounds: {
      units: boundsUnits,
      fullScene: toBoundsSummary(buildBoundsFromMeshes(meshes)),
      body: toBoundsSummary(buildBoundsFromMeshes(bodyMeshes)),
      accessory: toBoundsSummary(buildBoundsFromMeshes(accessoryMeshes)),
      fallback: toBoundsSummary(buildBoundsFromMeshes(fallbackMeshes)),
    },
    warnings,
  };
}
