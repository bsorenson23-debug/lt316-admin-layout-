import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import type {
  CanonicalBodyProfile,
  CanonicalDimensionCalibration,
  CanonicalHandleProfile,
  EditableBodyOutline,
} from "../../types/productTemplate.ts";
import {
  generateBodyReferenceGlb,
  overallYToBottomAnchoredModelY,
  resolveBodyReferenceFallbackAssemblyRadius,
  resolveBodyReferenceGlbRadialFit,
  type GenerateBodyReferenceGlbInput,
} from "./generateTumblerModel.ts";

const UNKNOWN_20OZ_BODY_PROFILE: CanonicalBodyProfile = {
  symmetrySource: "left",
  mirroredFromSymmetrySource: true,
  mirroredRightFromLeft: true,
  axis: {
    xTop: 87,
    yTop: 95.4,
    xBottom: 87,
    yBottom: 462.2,
  },
  samples: [
    { sNorm: 0, yMm: 31.09, yPx: 95.4, xLeft: 14.5, radiusPx: 72.5, radiusMm: 44 },
    { sNorm: 0.1032, yMm: 45.71, yPx: 133.26, xLeft: 21.38, radiusPx: 65.62, radiusMm: 43.51 },
    { sNorm: 0.3032, yMm: 74.04, yPx: 206.62, xLeft: 21, radiusPx: 66, radiusMm: 43.7 },
    { sNorm: 0.5032, yMm: 102.36, yPx: 279.98, xLeft: 21, radiusPx: 66, radiusMm: 44.42 },
    { sNorm: 0.5226, yMm: 105.1, yPx: 287.08, xLeft: 21, radiusPx: 66, radiusMm: 44.49 },
    { sNorm: 0.6, yMm: 116.07, yPx: 315.48, xLeft: 22.04, radiusPx: 64.96, radiusMm: 44.11 },
    { sNorm: 0.7032, yMm: 130.69, yPx: 353.34, xLeft: 30.48, radiusPx: 56.52, radiusMm: 38.79 },
    { sNorm: 0.8, yMm: 144.39, yPx: 388.84, xLeft: 32, radiusPx: 55, radiusMm: 37.28 },
    { sNorm: 0.9032, yMm: 159.01, yPx: 426.7, xLeft: 34, radiusPx: 53, radiusMm: 35.52 },
    { sNorm: 1, yMm: 172.72, yPx: 462.2, xLeft: 43.1, radiusPx: 43.9, radiusMm: 32.4 },
  ],
  svgPath: "",
};

const UNKNOWN_20OZ_DIMENSIONS: CanonicalDimensionCalibration = {
  units: "mm",
  totalHeightMm: 172.72,
  bodyHeightMm: 141.63,
  lidBodyLineMm: 31.09,
  bodyBottomMm: 172.72,
  wrapDiameterMm: 86.36,
  baseDiameterMm: 74,
  wrapWidthMm: 271.31,
  frontVisibleWidthMm: 88.98,
  frontAxisPx: {
    xTop: 87,
    yTop: 95.4,
    xBottom: 87,
    yBottom: 462.2,
  },
  photoToFrontTransform: {
    type: "affine",
    matrix: [0.6689, 0, -58.1943, 0, 0.3861, -5.7439],
  },
  svgFrontViewBoxMm: {
    x: -44.49,
    y: 0,
    width: 88.98,
    height: 172.72,
  },
  wrapMappingMm: {
    frontMeridianMm: 135.66,
    backMeridianMm: 0,
    leftQuarterMm: 67.83,
    rightQuarterMm: 203.49,
  },
  axialSurfaceBands: [
    { id: "lid-1", kind: "lid", sStart: 0, sEnd: 0.21, printable: false, confidence: 1 },
    { id: "rim-ring-2", kind: "rim-ring", sStart: 0.21, sEnd: 0.25, printable: false, confidence: 1 },
    { id: "upper-body-3", kind: "upper-body", sStart: 0.25, sEnd: 1, printable: true, confidence: 1 },
  ],
  printableSurfaceContract: {
    printableTopMm: 43,
    printableBottomMm: 172.72,
    printableHeightMm: 129.72,
    axialExclusions: [
      { kind: "lid", startMm: 0, endMm: 35.9 },
      { kind: "rim-ring", startMm: 35.9, endMm: 43 },
    ],
    circumferentialExclusions: [],
  },
  glbScale: {
    unitsPerMm: 1,
  },
};

const UNKNOWN_20OZ_INPUT: GenerateBodyReferenceGlbInput = {
  templateName: "unknown unknown 20oz",
  matchedProfileId: null,
  bodyOutline: reviewedBodyOutline(UNKNOWN_20OZ_BODY_PROFILE, UNKNOWN_20OZ_DIMENSIONS),
  canonicalBodyProfile: UNKNOWN_20OZ_BODY_PROFILE,
  canonicalDimensionCalibration: UNKNOWN_20OZ_DIMENSIONS,
  lidProfile: null,
  silverProfile: null,
  bodyColorHex: "#0459b8",
  lidColorHex: "#d8ef80",
  rimColorHex: "#b6b6b6",
  lidSeamFromOverallMm: 35.9,
  silverBandBottomFromOverallMm: 43,
  topOuterDiameterMm: 88.98,
};

const CONTAMINATED_UNKNOWN_20OZ_BODY_PROFILE: CanonicalBodyProfile = {
  ...UNKNOWN_20OZ_BODY_PROFILE,
  samples: [
    { sNorm: 0, yMm: 31.09, yPx: 331.4, xLeft: 139, radiusPx: 372.5, radiusMm: 47.5 },
    { sNorm: 0.2, yMm: 59.42, yPx: 568.88, xLeft: 139, radiusPx: 372.5, radiusMm: 47.5 },
    { sNorm: 0.4, yMm: 87.74, yPx: 806.36, xLeft: 139, radiusPx: 372.5, radiusMm: 47.5 },
    { sNorm: 0.6, yMm: 116.07, yPx: 1043.84, xLeft: 139, radiusPx: 372.5, radiusMm: 47.5 },
    { sNorm: 0.7032, yMm: 130.69, yPx: 1166.41, xLeft: 145.62, radiusPx: 365.88, radiusMm: 47.49 },
    { sNorm: 0.7806, yMm: 141.65, yPx: 1258.34, xLeft: 183.83, radiusPx: 327.67, radiusMm: 44.21 },
    { sNorm: 0.8581, yMm: 152.62, yPx: 1350.27, xLeft: 204.36, radiusPx: 307.14, radiusMm: 39.39 },
    { sNorm: 1, yMm: 172.72, yPx: 1518.8, xLeft: 212.54, radiusPx: 298.96, radiusMm: 38.1 },
  ],
};

const CONTAMINATED_UNKNOWN_20OZ_DIMENSIONS: CanonicalDimensionCalibration = {
  ...UNKNOWN_20OZ_DIMENSIONS,
  baseDiameterMm: 75,
  frontVisibleWidthMm: 95,
  svgFrontViewBoxMm: {
    x: -47.5,
    y: 0,
    width: 95,
    height: 172.72,
  },
  axialSurfaceBands: [
    { id: "lid-1", kind: "lid", sStart: 0, sEnd: 0.39, printable: false, confidence: 1 },
    { id: "rim-ring-2", kind: "rim-ring", sStart: 0.39, sEnd: 0.43, printable: false, confidence: 1 },
    { id: "upper-body-3", kind: "upper-body", sStart: 0.43, sEnd: 1, printable: true, confidence: 1 },
  ],
  printableSurfaceContract: {
    printableTopMm: 73.8,
    printableBottomMm: 172.72,
    printableHeightMm: 98.92,
    axialExclusions: [
      { kind: "lid", startMm: 0, endMm: 67.2 },
      { kind: "rim-ring", startMm: 67.2, endMm: 73.8 },
    ],
    circumferentialExclusions: [],
  },
};

const CONTAMINATED_UNKNOWN_20OZ_INPUT: GenerateBodyReferenceGlbInput = {
  ...UNKNOWN_20OZ_INPUT,
  templateName: "unknown unknown 20oz contaminated top band",
  bodyOutline: reviewedBodyOutline(CONTAMINATED_UNKNOWN_20OZ_BODY_PROFILE, CONTAMINATED_UNKNOWN_20OZ_DIMENSIONS),
  canonicalBodyProfile: CONTAMINATED_UNKNOWN_20OZ_BODY_PROFILE,
  canonicalDimensionCalibration: CONTAMINATED_UNKNOWN_20OZ_DIMENSIONS,
  lidSeamFromOverallMm: 67.2,
  silverBandBottomFromOverallMm: 73.8,
  topOuterDiameterMm: 95,
};

const CONTAMINATED_HANDLE_PROFILE: CanonicalHandleProfile = {
  side: "right",
  confidence: 0.536,
  anchors: {
    upper: { sNorm: 0.002, xPx: 840, yPx: 72 },
    lower: { sNorm: 0.047, xPx: 881, yPx: 138 },
  },
  outerContour: [
    { x: 812, y: 69 },
    { x: 928, y: 75.5 },
    { x: 928, y: 142 },
    { x: 902, y: 141.5 },
    { x: 902, y: 76 },
  ],
  innerContour: [
    { x: 873, y: 75 },
    { x: 902, y: 75.5 },
    { x: 902, y: 142 },
    { x: 882, y: 141.5 },
    { x: 877, y: 79.5 },
  ],
  centerline: [
    { t: 0, x: 849, y: 69 },
    { t: 0.5, x: 914.5, y: 77 },
    { t: 1, x: 914.5, y: 142 },
  ],
  widthProfile: [
    { t: 0, widthPx: 60 },
    { t: 0.5, widthPx: 26 },
    { t: 1, widthPx: 26 },
  ],
  upperAttachmentWidthPx: 26,
  lowerAttachmentWidthPx: 26,
  upperOpeningGapPx: 25,
  lowerOpeningGapPx: 21,
  symmetricExtrusionWidthPx: 26,
  openingBox: { x: 873, y: 75, w: 29, h: 67 },
};

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

function getObjectSize(scene: THREE.Object3D, name: string): THREE.Vector3 {
  const object = scene.getObjectByName(name);
  assert.ok(object, `Expected generated GLB to contain ${name}`);
  return new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
}

function getObjectBounds(scene: THREE.Object3D, name: string): THREE.Box3 {
  const object = scene.getObjectByName(name);
  assert.ok(object, `Expected generated GLB to contain ${name}`);
  return new THREE.Box3().setFromObject(object);
}

function assertNear(actual: number, expected: number, tolerance: number, message: string): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected}, received ${actual}`,
  );
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function reviewedBodyOutline(
  profile: CanonicalBodyProfile,
  calibration: CanonicalDimensionCalibration,
): EditableBodyOutline {
  const maxRadiusMm = Math.max(
    ...profile.samples.map((sample) => round2(sample.radiusMm)),
    0.1,
  );
  const targetRadiusMm = round2(calibration.wrapDiameterMm / 2);
  const scale = targetRadiusMm > 0 ? targetRadiusMm / maxRadiusMm : 1;
  return {
    version: 1,
    closed: true,
    points: profile.samples.map((sample, index, samples) => ({
      id: `body-${index}`,
      x: round2(sample.radiusMm * scale),
      y: round2(sample.yMm),
      role:
        index === 0
          ? "topOuter"
          : index === samples.length - 1
            ? "base"
            : "body",
      pointType: index === 0 || index === samples.length - 1 ? "corner" : "smooth",
      inHandle: null,
      outHandle: null,
    })),
  };
}

function reviewedLidOutline(radiusMm: number): EditableBodyOutline {
  return {
    version: 1,
    closed: true,
    points: [],
    directContour: [
      { x: -radiusMm, y: 0 },
      { x: radiusMm, y: 0 },
      { x: radiusMm, y: 35.9 },
      { x: -radiusMm, y: 35.9 },
    ],
  };
}

function reviewedRingOutline(radiusMm: number): EditableBodyOutline {
  return {
    version: 1,
    closed: true,
    points: [],
    directContour: [
      { x: -radiusMm, y: 35.9 },
      { x: radiusMm, y: 35.9 },
      { x: radiusMm, y: 43 },
      { x: -radiusMm, y: 43 },
    ],
  };
}

test("BODY REFERENCE GLB bottom anchor maps overall coordinates to y-up model space", () => {
  assert.equal(overallYToBottomAnchoredModelY(172.72, 172.72), 0);
  assert.equal(overallYToBottomAnchoredModelY(172.72, 0), 172.72);
  assert.equal(overallYToBottomAnchoredModelY(172.72, 31.09), 141.63);
});

test("BODY REFERENCE GLB radial fit caps fallback assembly radius to wrap diameter", () => {
  const radialFit = resolveBodyReferenceGlbRadialFit({
    sourceRadiiMm: UNKNOWN_20OZ_BODY_PROFILE.samples.map((sample) => sample.radiusMm),
    wrapDiameterMm: UNKNOWN_20OZ_DIMENSIONS.wrapDiameterMm,
  });

  assert.equal(radialFit.normalized, true);
  assert.equal(radialFit.sourceMaxRadiusMm, 44.49);
  assert.equal(radialFit.targetMaxRadiusMm, 43.18);
  assert.ok(radialFit.scale < 1);

  const normalizedRadii = UNKNOWN_20OZ_BODY_PROFILE.samples.map((sample) => sample.radiusMm * radialFit.scale);
  const fallbackRadius = resolveBodyReferenceFallbackAssemblyRadius({
    normalizedBodyRadiiMm: normalizedRadii,
    wrapDiameterMm: UNKNOWN_20OZ_DIMENSIONS.wrapDiameterMm,
  });

  assert.equal(fallbackRadius, 43.18);
});

test("BODY REFERENCE GLB body preserves approved front-visible silhouette instead of normalizing to wrap diameter", async () => {
  assert.ok(
    CONTAMINATED_UNKNOWN_20OZ_DIMENSIONS.frontVisibleWidthMm > CONTAMINATED_UNKNOWN_20OZ_DIMENSIONS.wrapDiameterMm,
    "Fixture should model a wider photo-visible shell than the physical wrap diameter",
  );
  assert.equal(
    round2(Math.PI * CONTAMINATED_UNKNOWN_20OZ_DIMENSIONS.wrapDiameterMm),
    CONTAMINATED_UNKNOWN_20OZ_DIMENSIONS.wrapWidthMm,
  );

  const radialFit = resolveBodyReferenceGlbRadialFit({
    sourceRadiiMm: CONTAMINATED_UNKNOWN_20OZ_BODY_PROFILE.samples.map((sample) => sample.radiusMm),
    wrapDiameterMm: CONTAMINATED_UNKNOWN_20OZ_DIMENSIONS.wrapDiameterMm,
  });

  assert.equal(radialFit.normalized, true);
  assert.equal(radialFit.sourceMaxRadiusMm, CONTAMINATED_UNKNOWN_20OZ_DIMENSIONS.frontVisibleWidthMm / 2);
  assert.equal(radialFit.targetMaxRadiusMm, CONTAMINATED_UNKNOWN_20OZ_DIMENSIONS.wrapDiameterMm / 2);

  const result = await generateBodyReferenceGlb(CONTAMINATED_UNKNOWN_20OZ_INPUT);
  const scene = await loadGeneratedScene(result.glbPath);
  const bodySize = getObjectSize(scene, "body_mesh");

  assert.equal(result.bodyGeometrySource, "approved contour -> mirrored body profile -> revolved body_mesh");
  assertNear(
    bodySize.x,
    CONTAMINATED_UNKNOWN_20OZ_DIMENSIONS.frontVisibleWidthMm,
    0.12,
    "Body mesh should preserve the approved front-visible width",
  );
  assertNear(
    bodySize.z,
    CONTAMINATED_UNKNOWN_20OZ_DIMENSIONS.frontVisibleWidthMm,
    0.12,
    "Body mesh should preserve the approved front-visible depth",
  );
  assert.ok(result.silhouetteAudit?.pass, "Expected silhouette audit to pass for the generated body mesh");
  assert.equal(result.silhouetteAudit?.meshWidthMm, CONTAMINATED_UNKNOWN_20OZ_DIMENSIONS.frontVisibleWidthMm);
  assert.equal(result.silhouetteAudit?.wrapDiameterMm, CONTAMINATED_UNKNOWN_20OZ_DIMENSIONS.wrapDiameterMm);
});

test("generated unknown 20oz body preserves approved contour width while fallback lid and ring stay physically capped", async () => {
  const result = await generateBodyReferenceGlb(UNKNOWN_20OZ_INPUT);
  const scene = await loadGeneratedScene(result.glbPath);
  const maxFallbackDiameterMm = UNKNOWN_20OZ_DIMENSIONS.wrapDiameterMm + 0.08;

  const bodySize = getObjectSize(scene, "body_mesh");
  assertNear(bodySize.x, UNKNOWN_20OZ_DIMENSIONS.frontVisibleWidthMm, 0.12, "Body mesh should match approved front-visible width");
  assertNear(bodySize.z, UNKNOWN_20OZ_DIMENSIONS.frontVisibleWidthMm, 0.12, "Body mesh should match approved front-visible depth");

  for (const meshName of ["lid_mesh", "rim_mesh"]) {
    const size = getObjectSize(scene, meshName);
    assert.ok(size.x <= maxFallbackDiameterMm, `${meshName} width ${size.x} exceeded ${maxFallbackDiameterMm}`);
    assert.ok(size.z <= maxFallbackDiameterMm, `${meshName} depth ${size.z} exceeded ${maxFallbackDiameterMm}`);
  }

  const totalBounds = new THREE.Box3().setFromObject(scene);
  const totalSize = totalBounds.getSize(new THREE.Vector3());
  assertNear(totalBounds.min.y, 0, 0.08, "Generated GLB should be bottom anchored at y=0");
  assertNear(
    totalBounds.max.y,
    UNKNOWN_20OZ_DIMENSIONS.totalHeightMm,
    0.08,
    "Generated GLB should end at the physical top",
  );
  assertNear(
    totalSize.y,
    UNKNOWN_20OZ_DIMENSIONS.totalHeightMm,
    0.08,
    "Expected generated height near totalHeightMm",
  );

  const bodyBounds = getObjectBounds(scene, "body_mesh");
  assertNear(bodyBounds.min.y, 0, 0.08, "Body mesh should start at the physical base");
  assertNear(
    bodyBounds.max.y,
    UNKNOWN_20OZ_DIMENSIONS.totalHeightMm - UNKNOWN_20OZ_DIMENSIONS.lidBodyLineMm,
    0.08,
    "Body mesh should preserve the reviewed cutout shell top",
  );

  const rimTopYmm = UNKNOWN_20OZ_DIMENSIONS.totalHeightMm - (UNKNOWN_20OZ_INPUT.lidSeamFromOverallMm ?? 35.9);
  const rimBottomYmm = UNKNOWN_20OZ_DIMENSIONS.totalHeightMm - (UNKNOWN_20OZ_INPUT.silverBandBottomFromOverallMm ?? 43);
  const lidBounds = getObjectBounds(scene, "lid_mesh");
  assert.ok(lidBounds.max.y <= UNKNOWN_20OZ_DIMENSIONS.totalHeightMm + 0.08, `Lid exceeded physical top: ${lidBounds.max.y}`);
  assert.ok(lidBounds.min.y >= rimTopYmm - 0.08, `Lid dropped below rim top: ${lidBounds.min.y}`);

  const rimBounds = getObjectBounds(scene, "rim_mesh");
  assertNear(rimBounds.min.y, rimBottomYmm, 0.08, "Rim mesh should start at the rim band bottom");
  assertNear(rimBounds.max.y, rimTopYmm, 0.08, "Rim mesh should end at the rim band top");
});

test("generated body-only BODY REFERENCE QA GLB omits lid and ring fallback meshes", async () => {
  const result = await generateBodyReferenceGlb({
    ...CONTAMINATED_UNKNOWN_20OZ_INPUT,
    renderMode: "body-cutout-qa",
    bodyOutlineSourceMode: "body-only",
  });
  const scene = await loadGeneratedScene(result.glbPath);

  assert.equal(result.renderMode, "body-cutout-qa");
  assert.equal(result.lidGeometrySource, "excluded in BODY CUTOUT QA mode");
  assert.equal(result.ringGeometrySource, "excluded in BODY CUTOUT QA mode");
  assert.deepEqual(result.meshNames, ["body_mesh"]);
  assert.deepEqual(result.fallbackMeshNames, []);
  assert.ok(result.bodyGeometryContract.source.hash);
  assert.ok(result.bodyGeometryContract.glb.hash);
  assert.equal(result.bodyGeometryContract.glb.freshRelativeToSource, true);
  assert.deepEqual(result.bodyGeometryContract.meshes.names, ["body_mesh"]);
  assert.deepEqual(result.bodyGeometryContract.meshes.accessoryMeshNames, []);
  assert.deepEqual(result.bodyGeometryContract.meshes.fallbackMeshNames, []);
  assert.equal(result.bodyGeometryContract.validation.status, "pass");
  assert.ok(result.generatedSourceSignature.length > 8);
  assert.ok(result.bodyMeshBounds);
  assertNear(
    result.bodyMeshBounds?.sizeMm.x ?? 0,
    CONTAMINATED_UNKNOWN_20OZ_DIMENSIONS.frontVisibleWidthMm,
    0.12,
    "Reported body mesh bounds should match approved front-visible width",
  );
  assert.ok(result.silhouetteAudit?.pass, "Expected BODY CUTOUT QA silhouette audit to pass");
  assert.equal(
    result.silhouetteAudit?.meshWidthMm,
    CONTAMINATED_UNKNOWN_20OZ_DIMENSIONS.frontVisibleWidthMm,
  );
  assert.equal(
    result.silhouetteAudit?.wrapDiameterMm,
    CONTAMINATED_UNKNOWN_20OZ_DIMENSIONS.wrapDiameterMm,
  );
  assert.ok(result.silhouetteAudit?.artifactPaths?.jsonPath);
  assert.ok(result.silhouetteAudit?.artifactPaths?.svgPath);
  await access(result.silhouetteAudit?.artifactPaths?.jsonPath ?? "");
  await access(result.silhouetteAudit?.artifactPaths?.svgPath ?? "");
  assert.ok(result.auditJsonPath);
  assert.equal(result.auditJsonPath, generatedAuditFilePath(result.glbPath));
  await access(result.auditJsonPath ?? "");
  const auditArtifact = JSON.parse(await readFile(result.auditJsonPath ?? "", "utf8")) as {
    contractVersion: string;
    mode: string;
    source: { hash?: string };
    glb: { path?: string; hash?: string; sourceHash?: string };
    meshes: { names: string[]; bodyMeshNames: string[]; accessoryMeshNames: string[]; fallbackMeshNames: string[]; fallbackDetected: boolean };
    dimensionsMm: { bodyBounds?: { width: number; height: number; depth: number }; wrapDiameterMm?: number; wrapWidthMm?: number };
    validation: { status: string; errors: string[]; warnings: string[] };
  };
  assert.equal(auditArtifact.mode, "body-cutout-qa");
  assert.equal(auditArtifact.glb.path, result.glbPath);
  assert.equal(auditArtifact.glb.hash, result.bodyGeometryContract.glb.hash);
  assert.equal(auditArtifact.source.hash, result.bodyGeometryContract.source.hash);
  assert.deepEqual(auditArtifact.meshes.names, ["body_mesh"]);
  assert.deepEqual(auditArtifact.meshes.bodyMeshNames, ["body_mesh"]);
  assert.deepEqual(auditArtifact.meshes.accessoryMeshNames, []);
  assert.deepEqual(auditArtifact.meshes.fallbackMeshNames, []);
  assert.equal(auditArtifact.meshes.fallbackDetected, false);
  assert.equal(auditArtifact.dimensionsMm.bodyBounds?.width, result.bodyMeshBounds?.sizeMm.x);
  assert.equal(auditArtifact.dimensionsMm.wrapDiameterMm, CONTAMINATED_UNKNOWN_20OZ_DIMENSIONS.wrapDiameterMm);
  assert.equal(auditArtifact.validation.status, "pass");
  assert.ok(
    /BODY CUTOUT QA mode/i.test(result.modelSourceLabel),
    `Source label should describe BODY CUTOUT QA mode: ${result.modelSourceLabel}`,
  );
  assert.ok(
    scene.getObjectByName("lid_mesh") === undefined,
    "Body-only QA GLB should not render a lid mesh",
  );
  assert.ok(
    scene.getObjectByName("silver_ring_mesh") === undefined && scene.getObjectByName("rim_mesh") === undefined,
    "Body-only QA GLB should not render a silver-ring mesh",
  );

  const bodyBounds = getObjectBounds(scene, "body_mesh");
  const bodyTopYmm =
    CONTAMINATED_UNKNOWN_20OZ_DIMENSIONS.totalHeightMm -
    CONTAMINATED_UNKNOWN_20OZ_DIMENSIONS.lidBodyLineMm;
  assertNear(bodyBounds.max.y, bodyTopYmm, 0.08, "Body mesh should preserve the reviewed cutout shell top");
});

test("generated body-only BODY REFERENCE hybrid-preview mode still reports preview fallback geometry", async () => {
  const result = await generateBodyReferenceGlb({
    ...CONTAMINATED_UNKNOWN_20OZ_INPUT,
    renderMode: "hybrid-preview",
    bodyOutlineSourceMode: "body-only",
  });

  assert.equal(result.renderMode, "hybrid-preview");
  assert.equal(result.bodyGeometrySource, "approved contour -> mirrored body profile -> revolved body_mesh (body-only trace)");
  assert.equal(result.lidGeometrySource, "parametric lid fallback (body-only trace)");
  assert.equal(result.ringGeometrySource, "parametric silver-ring fallback (body-only trace)");
  assert.ok(result.meshNames.includes("body_mesh"));
  assert.ok(result.fallbackMeshNames.includes("lid_mesh"));
  assert.ok(result.fallbackMeshNames.includes("rim_mesh"));
  assert.match(result.modelSourceLabel, /Body geometry authority: approved contour -> mirrored body profile -> revolved body_mesh \(body-only trace\)/i);
  assert.match(result.modelSourceLabel, /Lid preview geometry: parametric lid fallback \(body-only trace\) as preview-only silhouette/i);
  assert.match(result.modelSourceLabel, /Ring preview geometry: parametric silver-ring fallback \(body-only trace\) as preview-only silhouette/i);
  assert.doesNotMatch(result.modelSourceLabel, /omitted/i);
  assert.ok(result.silhouetteAudit?.pass, "Expected hybrid-preview body silhouette audit to pass");
});

test("generated unknown 20oz rejects overwide top-band fallback lid and ring geometry while preserving approved body silhouette", async () => {
  const result = await generateBodyReferenceGlb(CONTAMINATED_UNKNOWN_20OZ_INPUT);
  const scene = await loadGeneratedScene(result.glbPath);
  const maxFallbackDiameterMm = CONTAMINATED_UNKNOWN_20OZ_DIMENSIONS.wrapDiameterMm + 0.08;

  const bodySize = getObjectSize(scene, "body_mesh");
  assertNear(
    bodySize.x,
    CONTAMINATED_UNKNOWN_20OZ_DIMENSIONS.frontVisibleWidthMm,
    0.12,
    "Body mesh should preserve the approved front-visible body width",
  );

  for (const meshName of ["lid_mesh", "rim_mesh"]) {
    const size = getObjectSize(scene, meshName);
    assert.ok(size.x <= maxFallbackDiameterMm, `${meshName} width ${size.x} exceeded ${maxFallbackDiameterMm}`);
    assert.ok(size.z <= maxFallbackDiameterMm, `${meshName} depth ${size.z} exceeded ${maxFallbackDiameterMm}`);
  }

  const totalBounds = new THREE.Box3().setFromObject(scene);
  const bodyBounds = getObjectBounds(scene, "body_mesh");
  const lidBounds = getObjectBounds(scene, "lid_mesh");
  const rimBounds = getObjectBounds(scene, "rim_mesh");
  const correctedRimTopYmm = CONTAMINATED_UNKNOWN_20OZ_DIMENSIONS.totalHeightMm - 35.9;
  const correctedRimBottomYmm = CONTAMINATED_UNKNOWN_20OZ_DIMENSIONS.totalHeightMm - 43;

  assertNear(totalBounds.min.y, 0, 0.08, "Generated GLB should stay bottom anchored");
  assertNear(
    totalBounds.max.y,
    CONTAMINATED_UNKNOWN_20OZ_DIMENSIONS.totalHeightMm,
    0.08,
    "Generated GLB should stay bounded by the physical top",
  );
  assertNear(
    bodyBounds.max.y,
    CONTAMINATED_UNKNOWN_20OZ_DIMENSIONS.totalHeightMm - CONTAMINATED_UNKNOWN_20OZ_DIMENSIONS.lidBodyLineMm,
    0.08,
    "Body shell top should remain the orange BODY REFERENCE body top, not the bad lid seam",
  );
  assertNear(lidBounds.min.y, correctedRimTopYmm, 0.08, "Fallback lid should use compact corrected rim top");
  assertNear(rimBounds.min.y, correctedRimBottomYmm, 0.08, "Fallback rim should use compact corrected ring bottom");
  assertNear(rimBounds.max.y, correctedRimTopYmm, 0.08, "Fallback rim should use compact corrected ring top");
});

test("generated unknown 20oz visual QA flags dimensionally safe but photo-unfaithful fallback geometry", async () => {
  const result = await generateBodyReferenceGlb({
    ...CONTAMINATED_UNKNOWN_20OZ_INPUT,
    canonicalHandleProfile: CONTAMINATED_HANDLE_PROFILE,
  });

  assert.equal(result.visualLikeness.status, "fail");
  assert.equal(result.visualLikeness.metrics.hasHandleEvidence, true);
  assert.equal(result.visualLikeness.metrics.hasReviewedLidOutline, false);
  assert.equal(result.visualLikeness.metrics.hasReviewedRingOutline, false);
  assert.ok(
    result.visualLikeness.issues.some((issue) => issue.includes("Handle evidence is present")),
    "Expected visual QA to call out unreviewed handle evidence",
  );
  assert.ok(
    result.modelSourceLabel.includes("Preview trust: fail"),
    `Expected model source label to expose visual QA review status, got ${result.modelSourceLabel}`,
  );
});

test("generated unknown 20oz visual QA passes reviewed lid and ring when no handle evidence is present", async () => {
  const result = await generateBodyReferenceGlb({
    ...UNKNOWN_20OZ_INPUT,
    templateName: "unknown unknown 20oz fully reviewed top",
    lidProfile: reviewedLidOutline(43.18),
    silverProfile: reviewedRingOutline(43.18),
  });

  assert.equal(result.visualLikeness.status, "pass");
  assert.equal(result.visualLikeness.metrics.hasReviewedLidOutline, true);
  assert.equal(result.visualLikeness.metrics.hasReviewedRingOutline, true);
  assert.deepEqual(result.visualLikeness.issues, []);
});

test("generated unknown 20oz BODY REFERENCE fallback does not add unreviewed handle details", async () => {
  const result = await generateBodyReferenceGlb(UNKNOWN_20OZ_INPUT);
  const scene = await loadGeneratedScene(result.glbPath);

  for (const meshName of [
    "iceflow_handle_top_bar_mesh",
    "iceflow_handle_left_post_mesh",
    "iceflow_handle_right_post_mesh",
    "iceflow_flip_tab_mesh",
    "iceflow_front_logo_marker_mesh",
  ]) {
    assert.equal(scene.getObjectByName(meshName), undefined, `Generated BODY REFERENCE GLB should not contain unreviewed ${meshName}`);
  }

  const handleAssembly = scene.getObjectByName("iceflow_fallback_visual_assembly");
  assert.equal(handleAssembly, undefined, "Generated BODY REFERENCE GLB should not contain unreviewed fallback handle assembly");

  const totalBounds = new THREE.Box3().setFromObject(scene);
  const totalSize = totalBounds.getSize(new THREE.Vector3());
  assertNear(totalBounds.min.y, 0, 0.08, "Generated GLB should be bottom anchored at y=0");
  assertNear(
    totalSize.y,
    UNKNOWN_20OZ_DIMENSIONS.totalHeightMm,
    0.08,
    "Expected generated height near totalHeightMm",
  );
});

test("reviewed lid outlines bypass fallback radius caps", async () => {
  const result = await generateBodyReferenceGlb({
    ...UNKNOWN_20OZ_INPUT,
    templateName: "unknown unknown 20oz reviewed lid",
    lidProfile: reviewedLidOutline(48),
  });
  const scene = await loadGeneratedScene(result.glbPath);
  const lidSize = getObjectSize(scene, "lid_mesh");
  const lidBounds = getObjectBounds(scene, "lid_mesh");

  assert.equal(result.lidGeometrySource, "reviewed lid outline");
  assert.ok(lidSize.x > 95, `Expected reviewed lid outline to remain wider than fallback cap, received ${lidSize.x}`);
  assert.ok(lidSize.z > 95, `Expected reviewed lid outline to remain wider than fallback cap, received ${lidSize.z}`);
  assertNear(lidBounds.min.y, UNKNOWN_20OZ_DIMENSIONS.totalHeightMm - 35.9, 0.08, "Reviewed lid should start at the bottom-anchored rim top");
  assertNear(lidBounds.max.y, UNKNOWN_20OZ_DIMENSIONS.totalHeightMm, 0.08, "Reviewed lid should end at the physical top");
});

test("reviewed silver ring outlines bypass fallback radius caps", async () => {
  const result = await generateBodyReferenceGlb({
    ...UNKNOWN_20OZ_INPUT,
    templateName: "unknown unknown 20oz reviewed silver ring",
    silverProfile: reviewedRingOutline(47),
  });
  const scene = await loadGeneratedScene(result.glbPath);
  const ringSize = getObjectSize(scene, "silver_ring_mesh");
  const ringBounds = getObjectBounds(scene, "silver_ring_mesh");

  assert.equal(result.ringGeometrySource, "reviewed silver-ring outline");
  assert.ok(ringSize.x > 93, `Expected reviewed ring outline to remain wider than fallback cap, received ${ringSize.x}`);
  assert.ok(ringSize.z > 93, `Expected reviewed ring outline to remain wider than fallback cap, received ${ringSize.z}`);
  assertNear(ringBounds.min.y, UNKNOWN_20OZ_DIMENSIONS.totalHeightMm - 43, 0.08, "Reviewed ring should start at the bottom-anchored rim bottom");
  assertNear(ringBounds.max.y, UNKNOWN_20OZ_DIMENSIONS.totalHeightMm - 35.9, 0.08, "Reviewed ring should end at the bottom-anchored rim top");
});
