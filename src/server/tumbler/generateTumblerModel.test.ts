import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import type {
  CanonicalBodyProfile,
  CanonicalDimensionCalibration,
  EditableBodyOutline,
} from "../../types/productTemplate.ts";
import { generateBodyReferenceGlb, type GenerateBodyReferenceGlbInput } from "./generateTumblerModel.ts";

const BODY_PROFILE: CanonicalBodyProfile = {
  symmetrySource: "left",
  mirroredFromSymmetrySource: true,
  axis: {
    xTop: 0,
    yTop: 31.09,
    xBottom: 0,
    yBottom: 245.8,
  },
  samples: [
    { sNorm: 0, yMm: 31.09, yPx: 80, xLeft: -44.45, radiusPx: 44.45, radiusMm: 44.45 },
    { sNorm: 0.5, yMm: 138.45, yPx: 320, xLeft: -44.45, radiusPx: 44.45, radiusMm: 44.45 },
    { sNorm: 1, yMm: 245.8, yPx: 560, xLeft: -44.45, radiusPx: 44.45, radiusMm: 44.45 },
  ],
  svgPath: "M 44.45 31.09 L 44.45 138.45 L 44.45 245.8 Z",
};

const DIMENSION_CALIBRATION: CanonicalDimensionCalibration = {
  units: "mm",
  totalHeightMm: 245.8,
  bodyHeightMm: 214.71,
  lidBodyLineMm: 31.09,
  bodyBottomMm: 245.8,
  wrapDiameterMm: 88.9,
  baseDiameterMm: 88.9,
  wrapWidthMm: 279.29,
  frontVisibleWidthMm: 88.9,
  frontAxisPx: {
    xTop: 0,
    yTop: 80,
    xBottom: 0,
    yBottom: 560,
  },
  photoToFrontTransform: {
    type: "affine",
    matrix: [1, 0, 0, 0, 0.4473, -4.694],
  },
  svgFrontViewBoxMm: {
    x: -44.45,
    y: 0,
    width: 88.9,
    height: 245.8,
  },
  wrapMappingMm: {
    frontMeridianMm: 139.645,
    backMeridianMm: 0,
    leftQuarterMm: 69.8225,
    rightQuarterMm: 209.4675,
  },
  printableSurfaceContract: {
    printableTopMm: 31.09,
    printableBottomMm: 245.8,
    printableHeightMm: 214.71,
    axialExclusions: [],
    circumferentialExclusions: [],
  },
  glbScale: {
    unitsPerMm: 1,
  },
};

function createOutline(widthMm = 44.45): EditableBodyOutline {
  return {
    closed: true,
    version: 1,
    sourceContourMode: "body-only",
    points: [
      { id: "top", x: widthMm, y: 31.09, role: "topOuter", pointType: "corner", inHandle: null, outHandle: null },
      { id: "mid", x: widthMm, y: 138.45, role: "body", pointType: "smooth", inHandle: null, outHandle: null },
      { id: "bottom", x: widthMm, y: 245.8, role: "base", pointType: "corner", inHandle: null, outHandle: null },
    ],
    directContour: [
      { x: widthMm, y: 31.09 },
      { x: widthMm, y: 138.45 },
      { x: widthMm, y: 245.8 },
      { x: -widthMm, y: 245.8 },
      { x: -widthMm, y: 138.45 },
      { x: -widthMm, y: 31.09 },
    ],
  };
}

function createInput(overrides: Partial<GenerateBodyReferenceGlbInput> = {}): GenerateBodyReferenceGlbInput {
  return {
    renderMode: "body-cutout-qa",
    templateName: "Stanley Quencher 40oz",
    matchedProfileId: "stanley-quencher-h2.0-flowstate-40oz",
    bodyOutlineSourceMode: "body-only",
    bodyOutline: createOutline(),
    canonicalBodyProfile: BODY_PROFILE,
    canonicalDimensionCalibration: DIMENSION_CALIBRATION,
    bodyColorHex: "#184f90",
    rimColorHex: "#b6b6b6",
    ...overrides,
  };
}

function generatedModelFilePath(glbPath: string): string {
  const fileName = glbPath.split("/").pop();
  assert.ok(fileName, `Expected generated model path to include a file name: ${glbPath}`);
  return path.join(process.cwd(), ".local", "generated-models", fileName);
}

function generatedAuditFilePath(glbPath: string): string {
  const glbFilePath = generatedModelFilePath(glbPath);
  const parsedPath = path.parse(glbFilePath);
  return path.join(parsedPath.dir, `${parsedPath.name}.audit.json`);
}

async function loadGeneratedScene(glbPath: string): Promise<THREE.Group> {
  const buffer = await readFile(generatedModelFilePath(glbPath));
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  const loader = new GLTFLoader();

  return await new Promise<THREE.Group>((resolve, reject) => {
    loader.parse(
      arrayBuffer,
      "",
      (gltf) => resolve(gltf.scene),
      (error) => reject(error),
    );
  });
}

function getObjectBounds(scene: THREE.Object3D, name: string): THREE.Box3 {
  const object = scene.getObjectByName(name);
  assert.ok(object, `Expected generated GLB to contain ${name}`);
  return new THREE.Box3().setFromObject(object);
}

test("generateBodyReferenceGlb emits a reviewed body-only GLB with runtime-truth audit metadata", async () => {
  const result = await generateBodyReferenceGlb(createInput());

  assert.equal(result.modelStatus, "generated-reviewed-model");
  assert.equal(result.renderMode, "body-cutout-qa");
  assert.equal(result.meshNames.length, 1);
  assert.deepEqual(result.meshNames, ["body_mesh"]);
  assert.deepEqual(result.fallbackMeshNames, []);
  assert.equal(result.bodyGeometryContract.glb.path, result.glbPath);
  assert.equal(result.bodyGeometryContract.glb.freshRelativeToSource, true);
  assert.equal(result.bodyGeometryContract.source.hash, result.bodyGeometryContract.glb.sourceHash);
  assert.deepEqual(result.bodyGeometryContract.meshes.bodyMeshNames, ["body_mesh"]);
  assert.deepEqual(result.bodyGeometryContract.meshes.accessoryMeshNames, []);
  assert.equal(result.bodyGeometryContract.validation.status, "pass");
  assert.equal(result.modelSourceLabel, "Generated from accepted BODY REFERENCE cutout");
  assert.ok(result.auditJsonPath);
  assert.equal(result.auditJsonPath, generatedAuditFilePath(result.glbPath));

  await access(generatedModelFilePath(result.glbPath));
  await access(result.auditJsonPath ?? "");

  const scene = await loadGeneratedScene(result.glbPath);
  const bounds = getObjectBounds(scene, "body_mesh").getSize(new THREE.Vector3());
  assert.ok(bounds.x > 80);
  assert.ok(bounds.y > 200);
  assert.ok(bounds.z > 80);

  const auditArtifact = JSON.parse(await readFile(result.auditJsonPath ?? "", "utf8")) as {
    glb: { hash?: string; sourceHash?: string; freshRelativeToSource?: boolean };
    source: { hash?: string };
    meshes: { names: string[]; bodyMeshNames: string[]; accessoryMeshNames: string[]; fallbackDetected: boolean };
    validation: { status: string };
  };
  assert.equal(auditArtifact.glb.hash, result.bodyGeometryContract.glb.hash);
  assert.equal(auditArtifact.glb.sourceHash, result.bodyGeometryContract.glb.sourceHash);
  assert.equal(auditArtifact.source.hash, result.bodyGeometryContract.source.hash);
  assert.deepEqual(auditArtifact.meshes.names, ["body_mesh"]);
  assert.deepEqual(auditArtifact.meshes.bodyMeshNames, ["body_mesh"]);
  assert.deepEqual(auditArtifact.meshes.accessoryMeshNames, []);
  assert.equal(auditArtifact.meshes.fallbackDetected, false);
  assert.equal(auditArtifact.validation.status, "pass");
});

test("generateBodyReferenceGlb changes source lineage when the approved outline changes", async () => {
  const before = await generateBodyReferenceGlb(createInput());
  const after = await generateBodyReferenceGlb(createInput({
    bodyOutline: createOutline(46.1),
  }));

  assert.notEqual(before.generatedSourceSignature, after.generatedSourceSignature);
  assert.notEqual(before.bodyGeometryContract.source.hash, after.bodyGeometryContract.source.hash);
  assert.equal(after.bodyGeometryContract.source.hash, after.bodyGeometryContract.glb.sourceHash);
  assert.equal(after.bodyGeometryContract.validation.status, "pass");
});

test("generateBodyReferenceGlb requires an approved body outline", async () => {
  await assert.rejects(
    generateBodyReferenceGlb(createInput({ bodyOutline: null })),
    /Approved BODY REFERENCE outline is required/i,
  );
});
