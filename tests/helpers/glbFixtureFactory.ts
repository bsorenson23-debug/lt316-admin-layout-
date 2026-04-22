import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

export type BodyContractFixtureKey =
  | "body-cutout-qa-valid"
  | "body-cutout-qa-accessory"
  | "body-cutout-qa-fallback"
  | "body-cutout-qa-stale"
  | "full-model-accessory";

let fixtureCachePromise: Promise<Record<BodyContractFixtureKey, Buffer>> | null = null;
const FIXTURE_OUTPUT_DIR = path.join(process.cwd(), "public", "models", "test-fixtures");

type FileReaderLike = {
  result: string | ArrayBuffer | null;
  onloadend: null | (() => void);
  onerror: null | ((error: unknown) => void);
  readAsArrayBuffer(blob: Blob): Promise<void>;
  readAsDataURL(blob: Blob): Promise<void>;
};

class NodeFileReader implements FileReaderLike {
  result: string | ArrayBuffer | null = null;
  onloadend: null | (() => void) = null;
  onerror: null | ((error: unknown) => void) = null;

  async readAsArrayBuffer(blob: Blob) {
    try {
      this.result = await blob.arrayBuffer();
      this.onloadend?.();
    } catch (error) {
      this.onerror?.(error);
    }
  }

  async readAsDataURL(blob: Blob) {
    try {
      const buffer = Buffer.from(await blob.arrayBuffer());
      const type = blob.type || "application/octet-stream";
      this.result = `data:${type};base64,${buffer.toString("base64")}`;
      this.onloadend?.();
    } catch (error) {
      this.onerror?.(error);
    }
  }
}

function ensureFileReaderPolyfill() {
  if (typeof globalThis.FileReader === "undefined") {
    globalThis.FileReader = NodeFileReader as unknown as typeof FileReader;
  }
}

function buildBodyMesh(): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(45, 45, 180, 32, 1, false);
  const material = new THREE.MeshStandardMaterial({ name: "body_material", color: "#d89c2f" });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "body_mesh";
  return mesh;
}

function buildLidMesh(): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(92, 16, 92);
  const material = new THREE.MeshStandardMaterial({ name: "lid_material", color: "#d7d7d7" });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 98, 0);
  mesh.name = "lid_mesh";
  return mesh;
}

function buildHandleMesh(): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(18, 92, 16);
  const material = new THREE.MeshStandardMaterial({ name: "handle_material", color: "#efefef" });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(58, 25, 0);
  mesh.name = "handle_mesh";
  return mesh;
}

function buildFallbackMesh(): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(40, 40, 40);
  const material = new THREE.MeshStandardMaterial({ name: "debug_material", color: "#ff7d4d" });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 30, 0);
  mesh.name = "generated-placeholder-debug-mesh";
  return mesh;
}

function buildSceneForFixture(key: BodyContractFixtureKey): THREE.Scene {
  const scene = new THREE.Scene();
  scene.name = `${key.replace(/[^a-z0-9]+/gi, "_")}_scene`;
  scene.add(buildBodyMesh());

  if (key === "body-cutout-qa-accessory" || key === "full-model-accessory") {
    scene.add(buildLidMesh());
    scene.add(buildHandleMesh());
  }

  if (key === "body-cutout-qa-fallback") {
    scene.add(buildFallbackMesh());
  }

  return scene;
}

async function exportSceneToGlb(scene: THREE.Scene): Promise<Buffer> {
  ensureFileReaderPolyfill();
  const exporter = new GLTFExporter();

  return new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        if (!(result instanceof ArrayBuffer)) {
          reject(new Error("GLTFExporter did not return a binary GLB buffer."));
          return;
        }
        resolve(Buffer.from(result));
      },
      (error) => reject(error),
      { binary: true, onlyVisible: true },
    );
  });
}

export async function getBodyContractFixtureBuffers(): Promise<Record<BodyContractFixtureKey, Buffer>> {
  if (!fixtureCachePromise) {
    fixtureCachePromise = (async () => {
      const entries = await Promise.all(([
        "body-cutout-qa-valid",
        "body-cutout-qa-accessory",
        "body-cutout-qa-fallback",
        "body-cutout-qa-stale",
        "full-model-accessory",
      ] as const).map(async (key) => [key, await exportSceneToGlb(buildSceneForFixture(key))] as const));

      return Object.fromEntries(entries) as Record<BodyContractFixtureKey, Buffer>;
    })();
  }

  return fixtureCachePromise;
}

export async function ensureBodyContractFixtureFiles(): Promise<Record<BodyContractFixtureKey, string>> {
  const buffers = await getBodyContractFixtureBuffers();
  await mkdir(FIXTURE_OUTPUT_DIR, { recursive: true });

  const entries = await Promise.all(
    (Object.entries(buffers) as Array<[BodyContractFixtureKey, Buffer]>).map(async ([key, buffer]) => {
      const absolutePath = path.join(FIXTURE_OUTPUT_DIR, `${key}.glb`);
      await writeFile(absolutePath, buffer);
      return [key, absolutePath] as const;
    }),
  );

  return Object.fromEntries(entries) as Record<BodyContractFixtureKey, string>;
}
