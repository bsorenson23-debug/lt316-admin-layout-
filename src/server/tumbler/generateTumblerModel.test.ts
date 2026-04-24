import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import type {
  CanonicalBodyProfile,
  CanonicalDimensionCalibration,
  EditableBodyOutline,
} from "../../types/productTemplate.ts";
import type { BodyReferenceV2Draft } from "../../lib/bodyReferenceV2Layers.ts";
import {
  createBodyReferenceV2Layer,
  createCenterlineAxis,
} from "../../lib/bodyReferenceV2Layers.ts";
import {
  deriveStanleyIceFlowBodyTraceExtents,
  deriveStanleyIceFlowEngravingStartGuidePx,
  deriveStanleyIceFlowReferenceMeasurementBand,
  generateBodyReferenceGlb,
  type GenerateBodyReferenceGlbInput,
} from "./generateTumblerModel.ts";

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
  const scale = widthMm / 49.9;
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
      { x: 49.9 * scale, y: 28 },
      { x: 49.9 * scale, y: 31.1 },
      { x: 49.9 * scale, y: 45 },
      { x: 49 * scale, y: 70 },
      { x: 48 * scale, y: 100 },
      { x: 46 * scale, y: 130 },
      { x: 44 * scale, y: 160 },
      { x: 42 * scale, y: 190 },
      { x: 40 * scale, y: 220 },
      { x: 38 * scale, y: 250 },
      { x: 37.4 * scale, y: 272.3 },
      { x: 37.4 * scale, y: 273.8 },
      { x: -37.4 * scale, y: 273.8 },
      { x: -37.4 * scale, y: 272.3 },
      { x: -38 * scale, y: 250 },
      { x: -40 * scale, y: 220 },
      { x: -42 * scale, y: 190 },
      { x: -44 * scale, y: 160 },
      { x: -46 * scale, y: 130 },
      { x: -48 * scale, y: 100 },
      { x: -49 * scale, y: 70 },
      { x: -49.9 * scale, y: 45 },
      { x: -49.9 * scale, y: 31.1 },
      { x: -49.9 * scale, y: 28 },
    ],
  };
}

function createInput(overrides: Partial<GenerateBodyReferenceGlbInput> = {}): GenerateBodyReferenceGlbInput {
  return {
    renderMode: "body-cutout-qa",
    templateName: "Stanley Quencher 40oz",
    matchedProfileId: "stanley-quencher-h2.0-flowstate-40oz",
    generationSourceMode: "v1-approved-contour",
    bodyOutlineSourceMode: "body-only",
    bodyOutline: createOutline(),
    canonicalBodyProfile: BODY_PROFILE,
    canonicalDimensionCalibration: DIMENSION_CALIBRATION,
    bodyColorHex: "#184f90",
    rimColorHex: "#b6b6b6",
    ...overrides,
  };
}

test("Stanley IceFlow reference measurement band uses seam body rows instead of wider lid rows", () => {
  const centerXPx = 250;
  const bodyTopPx = 170;
  const bodyBottomPx = 620;
  const runs = Array.from({ length: bodyBottomPx - bodyTopPx + 1 }, (_, index) => {
    const y = bodyTopPx + index;
    const seamBand = y >= 172 && y <= 188;
    const width = seamBand ? 181 : 160;
    const left = centerXPx - Math.floor(width / 2);
    const right = left + width - 1;
    return { y, left, right, width };
  });
  const widerLidHalfWidthPx = 140;

  const band = deriveStanleyIceFlowReferenceMeasurementBand({
    runs,
    bodyTopPx,
    bodyBottomPx,
    centerXPx,
    fallbackHalfWidthPx: widerLidHalfWidthPx,
  });

  assert.equal(band.usedFallback, false);
  assert.equal(band.rowCount > 0, true);
  assert.equal(band.widthPx <= widerLidHalfWidthPx * 2, true);
  assert.equal(band.referenceHalfWidthPx, band.widthPx / 2);
  assert.equal(band.referenceHalfWidthPx < widerLidHalfWidthPx, true);
  assert.equal(band.widthPx <= 280, true);
});

test("Stanley IceFlow reference measurement band falls back deterministically when seam rows are unavailable", () => {
  const band = deriveStanleyIceFlowReferenceMeasurementBand({
    runs: [],
    bodyTopPx: 170,
    bodyBottomPx: 620,
    centerXPx: 250,
    fallbackHalfWidthPx: 140,
  });

  assert.equal(band.usedFallback, true);
  assert.equal(band.referenceHalfWidthPx, 140);
  assert.equal(band.widthPx, 280);
  assert.equal(band.centerXPx, 250);
});

test("Stanley IceFlow engraving start guide is the midpoint between rim bottom and painted body top", () => {
  assert.equal(deriveStanleyIceFlowEngravingStartGuidePx({
    rimBottomPx: 168,
    paintedBodyTopPx: 182,
  }), 175);
});

test("Stanley IceFlow engraving start guide prefers the seam-adjacent silver edge", () => {
  assert.equal(deriveStanleyIceFlowEngravingStartGuidePx({
    rimBottomPx: 168,
    seamSilverBottomPx: 180,
    paintedBodyTopPx: 184,
  }), 182);
});

test("Stanley IceFlow body trace reaches lower rounded body beyond color-matched sidewall", () => {
  const centerXPx = 250;
  const paintedBodyTopPx = 182;
  const colorBodyBottomPx = 540;
  const roundedBottomPx = 628;
  const maxCenterWidthPx = 190;
  const runs = Array.from({ length: roundedBottomPx - paintedBodyTopPx + 1 }, (_, index) => {
    const y = paintedBodyTopPx + index;
    const taperT = Math.max(0, (y - colorBodyBottomPx) / Math.max(1, roundedBottomPx - colorBodyBottomPx));
    const width = y <= colorBodyBottomPx
      ? 180
      : Math.max(28, Math.round(180 - taperT * 145));
    const left = centerXPx - Math.floor(width / 2);
    const right = left + width - 1;
    return { y, left, right, width };
  });

  const trace = deriveStanleyIceFlowBodyTraceExtents({
    runs,
    paintedBodyTopPx,
    colorBodyBottomPx,
    centerXPx,
    maxCenterWidthPx,
  });

  assert.equal(trace.usedFallback, false);
  assert.equal(trace.topPx, paintedBodyTopPx);
  assert.equal(trace.bottomPx, roundedBottomPx);
  assert.equal(trace.bottomPx > colorBodyBottomPx, true);
});

function createV2Draft(overrides: Partial<BodyReferenceV2Draft> = {}): BodyReferenceV2Draft {
  return {
    sourceImageUrl: "data:image/png;base64,body-reference-v2",
    centerline: createCenterlineAxis({
      id: "centerline",
      xPx: 100,
      topYPx: 8,
      bottomYPx: 208,
      source: "operator",
    }),
    layers: [
      createBodyReferenceV2Layer({
        id: "body-left",
        kind: "body-left",
        points: [
          { xPx: 84, yPx: 20 },
          { xPx: 80, yPx: 120 },
          { xPx: 82, yPx: 205 },
        ],
      }),
      createBodyReferenceV2Layer({
        id: "lid",
        kind: "lid-reference",
        points: [
          { xPx: 74, yPx: 4 },
          { xPx: 126, yPx: 4 },
          { xPx: 126, yPx: 18 },
          { xPx: 74, yPx: 18 },
        ],
      }),
      createBodyReferenceV2Layer({
        id: "handle",
        kind: "handle-reference",
        points: [
          { xPx: 118, yPx: 45 },
          { xPx: 138, yPx: 45 },
          { xPx: 138, yPx: 155 },
          { xPx: 118, yPx: 155 },
        ],
      }),
    ],
    blockedRegions: [],
    scaleCalibration: {
      scaleSource: "lookup-diameter",
      lookupDiameterMm: 88.9,
      resolvedDiameterMm: 88.9,
      wrapDiameterMm: 88.9,
      wrapWidthMm: 279.29,
      expectedBodyHeightMm: 185,
      expectedBodyWidthMm: 88.9,
    },
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

async function listGeneratedArtifactsByToken(token: string): Promise<string[]> {
  const generatedModelsDir = path.join(process.cwd(), ".local", "generated-models");
  const entries = await readdir(generatedModelsDir);
  return entries.filter((entry) => entry.includes(token));
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
  assert.equal(result.bodyGeometryContract.svgQuality?.status, "pass");
  assert.equal(result.bodyGeometryContract.svgQuality?.suspiciousJumpCount, 0);
  assert.equal(result.bodyGeometryContract.svgQuality?.expectedBridgeSegmentCount, 2);
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
    svgQuality?: { status: string; suspiciousJumpCount: number; expectedBridgeSegmentCount: number };
  };
  assert.equal(auditArtifact.glb.hash, result.bodyGeometryContract.glb.hash);
  assert.equal(auditArtifact.glb.sourceHash, result.bodyGeometryContract.glb.sourceHash);
  assert.equal(auditArtifact.source.hash, result.bodyGeometryContract.source.hash);
  assert.deepEqual(auditArtifact.meshes.names, ["body_mesh"]);
  assert.deepEqual(auditArtifact.meshes.bodyMeshNames, ["body_mesh"]);
  assert.deepEqual(auditArtifact.meshes.accessoryMeshNames, []);
  assert.equal(auditArtifact.meshes.fallbackDetected, false);
  assert.equal(auditArtifact.validation.status, "pass");
  assert.equal(auditArtifact.svgQuality?.status, "pass");
  assert.equal(auditArtifact.svgQuality?.suspiciousJumpCount, 0);
  assert.equal(auditArtifact.svgQuality?.expectedBridgeSegmentCount, 2);
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

test("generateBodyReferenceGlb can generate BODY CUTOUT QA from a ready v2 mirrored profile with body_mesh only", async () => {
  const result = await generateBodyReferenceGlb(createInput({
    generationSourceMode: "v2-mirrored-profile",
    bodyOutline: undefined,
    canonicalBodyProfile: undefined,
    canonicalDimensionCalibration: undefined,
    bodyReferenceV2Draft: createV2Draft(),
  }));

  assert.equal(result.modelStatus, "generated-reviewed-model");
  assert.equal(result.renderMode, "body-cutout-qa");
  assert.equal(result.modelSourceLabel, "Generated from BODY REFERENCE v2 mirrored profile");
  assert.deepEqual(result.meshNames, ["body_mesh"]);
  assert.deepEqual(result.fallbackMeshNames, []);
  assert.equal(result.bodyGeometryContract.source.type, "body-reference-v2");
  assert.equal(result.bodyGeometryContract.source.centerlineCaptured, true);
  assert.equal(result.bodyGeometryContract.source.leftBodyOutlineCaptured, true);
  assert.equal(result.bodyGeometryContract.source.mirroredBodyGenerated, true);
  assert.equal(result.bodyGeometryContract.source.blockedRegionCount, 0);
  assert.equal(result.bodyGeometryContract.source.lookupDimensionAuthorityStatus, "unknown");
  assert.deepEqual(result.bodyGeometryContract.source.referenceLayersExcluded, ["handle-reference", "lid-reference"]);
  assert.deepEqual(result.bodyGeometryContract.source.nonBodyGenerationExclusions, [
    "artwork-placements",
    "engraving-overlay-preview",
    "product-appearance-layers",
  ]);
  assert.equal(result.bodyGeometryContract.source.fallbackGenerationModeAvailable, true);
  assert.equal(result.bodyGeometryContract.source.generationSourceMode, "v2-mirrored-profile");
  assert.equal(result.bodyGeometryContract.glb.sourceHash, result.bodyGeometryContract.source.hash);
  assert.equal(result.bodyGeometryContract.validation.status, "pass");
  assert.equal(result.bodyGeometryContract.dimensionsMm.scaleSource, "lookup-diameter");
  assert.deepEqual(result.bodyGeometryContract.meshes.bodyMeshNames, ["body_mesh"]);
  assert.deepEqual(result.bodyGeometryContract.meshes.accessoryMeshNames, []);

  const scene = await loadGeneratedScene(result.glbPath);
  const sceneMeshNames = scene.children.map((child) => child.name).filter(Boolean);
  assert.deepEqual(sceneMeshNames, ["body_mesh"]);
  const bounds = getObjectBounds(scene, "body_mesh").getSize(new THREE.Vector3());
  assert.ok(bounds.x > 80);
  assert.ok(bounds.y > 180);
  assert.ok(bounds.z > 80);

  const auditArtifact = JSON.parse(await readFile(result.auditJsonPath ?? "", "utf8")) as {
    source: {
      type?: string;
      hash?: string;
      centerlineCaptured?: boolean;
      mirroredBodyGenerated?: boolean;
      lookupDimensionAuthorityStatus?: string;
      referenceLayersExcluded?: string[];
      nonBodyGenerationExclusions?: string[];
      fallbackGenerationModeAvailable?: boolean;
    };
    glb: { sourceHash?: string };
    meshes: { names: string[]; bodyMeshNames: string[]; accessoryMeshNames: string[] };
    dimensionsMm: { scaleSource?: string };
  };
  assert.equal(auditArtifact.source.type, "body-reference-v2");
  assert.equal(auditArtifact.source.centerlineCaptured, true);
  assert.equal(auditArtifact.source.mirroredBodyGenerated, true);
  assert.equal(auditArtifact.source.lookupDimensionAuthorityStatus, "unknown");
  assert.deepEqual(auditArtifact.source.referenceLayersExcluded, ["handle-reference", "lid-reference"]);
  assert.deepEqual(auditArtifact.source.nonBodyGenerationExclusions, [
    "artwork-placements",
    "engraving-overlay-preview",
    "product-appearance-layers",
  ]);
  assert.equal(auditArtifact.source.fallbackGenerationModeAvailable, true);
  assert.equal(auditArtifact.glb.sourceHash, auditArtifact.source.hash);
  assert.deepEqual(auditArtifact.meshes.names, ["body_mesh"]);
  assert.deepEqual(auditArtifact.meshes.bodyMeshNames, ["body_mesh"]);
  assert.deepEqual(auditArtifact.meshes.accessoryMeshNames, []);
  assert.equal(auditArtifact.dimensionsMm.scaleSource, "lookup-diameter");
});

test("generateBodyReferenceGlb keeps BODY CUTOUT QA pass clean for operator-seeded v2 drafts with context-only warnings", async () => {
  const operatorSeededDraft = createV2Draft({
    layers: [
      createBodyReferenceV2Layer({
        id: "body-left",
        kind: "body-left",
        points: [
          { xPx: 84, yPx: 20 },
          { xPx: 80, yPx: 120 },
          { xPx: 82, yPx: 205 },
        ],
      }),
    ],
    scaleCalibration: {
      scaleSource: "lookup-diameter",
      lookupDiameterMm: 88.9,
      resolvedDiameterMm: 88.9,
      wrapDiameterMm: 88.9,
      wrapWidthMm: 279.29,
      expectedBodyHeightMm: 185,
      expectedBodyWidthMm: 88.9,
      lookupFullProductHeightMm: 222,
      lookupHeightIgnoredForScale: true,
      lookupWarnings: ["Full product height is stored for context and ignored for lookup-based body contour scale."],
    },
  });

  const result = await generateBodyReferenceGlb(createInput({
    generationSourceMode: "v2-mirrored-profile",
    bodyOutline: undefined,
    canonicalBodyProfile: undefined,
    canonicalDimensionCalibration: undefined,
    bodyReferenceV2Draft: operatorSeededDraft,
  }));

  assert.equal(result.bodyGeometryContract.source.type, "body-reference-v2");
  assert.equal(result.bodyGeometryContract.validation.status, "pass");
  assert.deepEqual(result.bodyGeometryContract.validation.errors, []);
  assert.deepEqual(result.bodyGeometryContract.validation.warnings, []);

  const auditArtifact = JSON.parse(await readFile(result.auditJsonPath ?? "", "utf8")) as {
    validation: { status?: string; errors?: string[]; warnings?: string[] };
  };
  assert.equal(auditArtifact.validation.status, "pass");
  assert.deepEqual(auditArtifact.validation.errors ?? [], []);
  assert.deepEqual(auditArtifact.validation.warnings ?? [], []);
});

test("generateBodyReferenceGlb rejects v2 generation when the mirrored profile source is not ready", async () => {
  const templateToken = `invalid-v2-guard-${Date.now()}`;
  const artifactsBefore = await listGeneratedArtifactsByToken(templateToken);

  await assert.rejects(
    generateBodyReferenceGlb(createInput({
      templateName: templateToken,
      generationSourceMode: "v2-mirrored-profile",
      bodyOutline: undefined,
      canonicalBodyProfile: undefined,
      canonicalDimensionCalibration: undefined,
      bodyReferenceV2Draft: createV2Draft({
        centerline: null,
      }),
    })),
    /BODY REFERENCE v2 mirrored profile is not ready/i,
  );

  const artifactsAfter = await listGeneratedArtifactsByToken(templateToken);
  assert.deepEqual(artifactsAfter, artifactsBefore);
});
