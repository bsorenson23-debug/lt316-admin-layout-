import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import {
  detectAccessoryMeshes,
  detectBodyMeshes,
  detectFallbackMeshes,
} from "../../lib/bodyGeometryContract.ts";
import {
  inspectLoadedGltfScene,
  type LoadedGltfSceneInspection,
  type LoadedSceneBoundsSummary,
  type LoadedSceneBoundsUnits,
} from "../../lib/inspectLoadedGltfScene.ts";
import { hashBufferSha256Node } from "../../lib/hashSha256.node.ts";

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK_TYPE = 0x4e4f534a;

interface GlbPrimitiveLike {
  attributes?: Record<string, number>;
  indices?: number;
  mode?: number;
}

interface GlbAccessorLike {
  count?: number;
}

interface GlbMeshLike {
  name?: string;
  primitives?: GlbPrimitiveLike[];
}

interface GlbNodeLike {
  name?: string;
  mesh?: number;
}

interface GlbSceneLike {
  name?: string;
}

interface GlbAssetMetadata {
  version?: string;
  generator?: string;
  copyright?: string;
  minVersion?: string;
  extensionsUsed: string[];
  extensionsRequired: string[];
}

interface GlbJsonDocument {
  asset?: {
    version?: string;
    generator?: string;
    copyright?: string;
    minVersion?: string;
  };
  scene?: number;
  scenes?: GlbSceneLike[];
  nodes?: GlbNodeLike[];
  meshes?: GlbMeshLike[];
  materials?: Array<{ name?: string }>;
  accessors?: GlbAccessorLike[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
}

export interface GlbInspectionReport {
  file: {
    path: string;
    name: string;
    sizeBytes: number;
    sha256: string;
    format: "glb";
  };
  asset: GlbAssetMetadata;
  scenes: {
    count: number;
    defaultSceneIndex: number | null;
    names: string[];
  };
  nodes: {
    count: number;
    names: string[];
    unnamedCount: number;
  };
  meshes: {
    meshNames: string[];
    visibleMeshNames: string[];
    bodyMeshNames: string[];
    accessoryMeshNames: string[];
    fallbackMeshNames: string[];
    fallbackDetected: boolean;
    unexpectedMeshNames: string[];
    materialNames: string[];
    primitiveCount: number;
    totalVertexCount: number;
    totalTriangleCount: number;
  };
  bounds: {
    source: "runtime-scene" | "unavailable";
    units: LoadedSceneBoundsUnits;
    fullScene: LoadedSceneBoundsSummary | null;
    body: LoadedSceneBoundsSummary | null;
    accessory: LoadedSceneBoundsSummary | null;
    fallback: LoadedSceneBoundsSummary | null;
  };
  warnings: string[];
}

function normalizeStringArray(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value?.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function toUint8Array(buffer: Buffer): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function decodeJsonChunk(bytes: Uint8Array): GlbJsonDocument {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 20) {
    throw new Error("GLB file is too small to contain a JSON chunk.");
  }
  const magic = view.getUint32(0, true);
  if (magic !== GLB_MAGIC) {
    throw new Error("Input is not a binary glTF 2.0 (.glb) file.");
  }

  let offset = 12;
  while (offset + 8 <= view.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    offset += 8;
    if (offset + chunkLength > view.byteLength) {
      throw new Error("GLB chunk length exceeds the file size.");
    }

    if (chunkType === JSON_CHUNK_TYPE) {
      const chunkBytes = bytes.subarray(offset, offset + chunkLength);
      const chunkText = new TextDecoder("utf-8").decode(chunkBytes).replace(/\0+$/u, "");
      return JSON.parse(chunkText) as GlbJsonDocument;
    }

    offset += chunkLength;
  }

  throw new Error("GLB file does not contain a JSON chunk.");
}

function getAccessorCount(document: GlbJsonDocument, accessorIndex: number | undefined): number {
  if (typeof accessorIndex !== "number") return 0;
  return document.accessors?.[accessorIndex]?.count ?? 0;
}

function estimatePrimitiveTriangleCount(document: GlbJsonDocument, primitive: GlbPrimitiveLike): number {
  const primitiveMode = primitive.mode ?? 4;
  const count = primitive.indices != null
    ? getAccessorCount(document, primitive.indices)
    : getAccessorCount(document, primitive.attributes?.POSITION);

  switch (primitiveMode) {
    case 4:
      return Math.floor(count / 3);
    case 5:
    case 6:
      return Math.max(0, count - 2);
    default:
      return 0;
  }
}

function collectPrimitiveMetrics(document: GlbJsonDocument): {
  primitiveCount: number;
  totalVertexCount: number;
  totalTriangleCount: number;
} {
  let primitiveCount = 0;
  let totalVertexCount = 0;
  let totalTriangleCount = 0;

  for (const mesh of document.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      primitiveCount += 1;
      totalVertexCount += getAccessorCount(document, primitive.attributes?.POSITION);
      totalTriangleCount += estimatePrimitiveTriangleCount(document, primitive);
    }
  }

  return {
    primitiveCount,
    totalVertexCount,
    totalTriangleCount,
  };
}

function collectDocumentNodeNames(document: GlbJsonDocument): {
  names: string[];
  unnamedCount: number;
} {
  const names = normalizeStringArray((document.nodes ?? []).map((node) => node.name ?? "").filter(Boolean));
  const unnamedCount = (document.nodes ?? []).filter((node) => !node.name?.trim()).length;
  return {
    names,
    unnamedCount,
  };
}

function collectDocumentSceneNames(document: GlbJsonDocument): string[] {
  return normalizeStringArray((document.scenes ?? []).map((scene) => scene.name ?? "").filter(Boolean));
}

function collectDocumentMeshNames(document: GlbJsonDocument): string[] {
  const meshNames = (document.meshes ?? []).map((mesh) => mesh.name ?? "").filter(Boolean);
  const nodeBackedMeshNames = (document.nodes ?? [])
    .filter((node) => typeof node.mesh === "number")
    .map((node) => node.name ?? "")
    .filter(Boolean);
  return normalizeStringArray([...meshNames, ...nodeBackedMeshNames]);
}

function collectMaterialNames(document: GlbJsonDocument): string[] {
  return normalizeStringArray((document.materials ?? []).map((material) => material.name ?? "").filter(Boolean));
}

async function parseRuntimeScene(buffer: Buffer): Promise<LoadedGltfSceneInspection> {
  const loader = new GLTFLoader();
  const arrayBuffer = Uint8Array.from(buffer).buffer;
  const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
    loader.parse(
      arrayBuffer,
      "",
      (loaded) => resolve(loaded),
      (error) => reject(error),
    );
  });

  return inspectLoadedGltfScene(gltf.scene, { boundsUnits: "scene-units" });
}

export async function inspectGlbFile(glbPath: string): Promise<GlbInspectionReport> {
  const absolutePath = path.resolve(glbPath);
  const fileName = path.basename(absolutePath);
  const [rawBytes, fileStat] = await Promise.all([
    readFile(absolutePath),
    stat(absolutePath),
  ]);

  const document = decodeJsonChunk(toUint8Array(rawBytes));
  const meshNamesFromDocument = collectDocumentMeshNames(document);
  const materialNamesFromDocument = collectMaterialNames(document);
  const nodeNames = collectDocumentNodeNames(document);
  const sceneNames = collectDocumentSceneNames(document);
  const primitiveMetrics = collectPrimitiveMetrics(document);
  const warnings: string[] = [];

  let runtimeInspection: LoadedGltfSceneInspection | null = null;
  try {
    runtimeInspection = await parseRuntimeScene(rawBytes);
  } catch (error) {
    warnings.push(
      `Runtime scene parsing was unavailable; bounds are not reported. ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const meshNames = normalizeStringArray([
    ...(runtimeInspection?.meshNames ?? []),
    ...meshNamesFromDocument,
  ]);
  const bodyMeshNames = runtimeInspection?.bodyMeshNames ?? detectBodyMeshes(meshNames);
  const accessoryMeshNames = runtimeInspection?.accessoryMeshNames ?? detectAccessoryMeshes(meshNames);
  const fallbackMeshNames = runtimeInspection?.fallbackMeshNames ?? detectFallbackMeshes(meshNames);
  const unexpectedMeshNames = runtimeInspection?.unexpectedMeshNames ?? meshNames.filter((name) => (
    !bodyMeshNames.includes(name) &&
    !accessoryMeshNames.includes(name) &&
    !fallbackMeshNames.includes(name)
  ));

  if (!runtimeInspection) {
    warnings.push("Mesh bounds are unavailable because the GLB could not be loaded into a runtime Three.js scene.");
  }

  return {
    file: {
      path: absolutePath,
      name: fileName,
      sizeBytes: fileStat.size,
      sha256: hashBufferSha256Node(rawBytes),
      format: "glb",
    },
    asset: {
      version: document.asset?.version,
      generator: document.asset?.generator,
      copyright: document.asset?.copyright,
      minVersion: document.asset?.minVersion,
      extensionsUsed: normalizeStringArray(document.extensionsUsed),
      extensionsRequired: normalizeStringArray(document.extensionsRequired),
    },
    scenes: {
      count: document.scenes?.length ?? 0,
      defaultSceneIndex: typeof document.scene === "number" ? document.scene : null,
      names: sceneNames,
    },
    nodes: {
      count: document.nodes?.length ?? 0,
      names: nodeNames.names,
      unnamedCount: nodeNames.unnamedCount,
    },
    meshes: {
      meshNames,
      visibleMeshNames: runtimeInspection?.visibleMeshNames ?? [],
      bodyMeshNames,
      accessoryMeshNames,
      fallbackMeshNames,
      fallbackDetected: runtimeInspection?.fallbackDetected ?? fallbackMeshNames.length > 0,
      unexpectedMeshNames,
      materialNames: normalizeStringArray([
        ...(runtimeInspection?.materialNames ?? []),
        ...materialNamesFromDocument,
      ]),
      primitiveCount: primitiveMetrics.primitiveCount,
      totalVertexCount: runtimeInspection?.totalVertexCount ?? primitiveMetrics.totalVertexCount,
      totalTriangleCount: runtimeInspection?.totalTriangleCount ?? primitiveMetrics.totalTriangleCount,
    },
    bounds: {
      source: runtimeInspection ? "runtime-scene" : "unavailable",
      units: runtimeInspection?.bounds.units ?? "scene-units",
      fullScene: runtimeInspection?.bounds.fullScene ?? null,
      body: runtimeInspection?.bounds.body ?? null,
      accessory: runtimeInspection?.bounds.accessory ?? null,
      fallback: runtimeInspection?.bounds.fallback ?? null,
    },
    warnings: normalizeStringArray([
      ...warnings,
      ...(runtimeInspection?.warnings ?? []),
    ]),
  };
}
