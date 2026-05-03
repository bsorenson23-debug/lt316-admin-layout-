import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import type { TumblerProfile } from "../../data/tumblerProfiles.ts";
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
import { buildBodyReferenceGlbSourcePayload } from "../../lib/bodyReferenceGlbSource.ts";
import { hashJsonSha256Node } from "../../lib/hashSha256.node.ts";
import { stableStringifyForHash } from "../../lib/hashSha256.ts";
import {
  buildGenericStraightDiameterEnvelopeWarning,
  deriveBodyTraceExtents,
  deriveEngravingStartGuidePx,
  deriveReferenceMeasurementBand,
  evaluateGenericStraightDiameterEnvelope,
  filterStableStraightBodyProfileRuns,
  generateBodyReferenceGlb,
  resolveGeneratedBodyBandPolicy,
  smoothStraightBodyRadiusSeries,
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

const BRAND_REPEATABILITY_PRODUCTION_FILES = [
  new URL("./generateTumblerModel.ts", import.meta.url),
  new URL("./lookupTumblerItem.ts", import.meta.url),
  new URL("../../components/admin/TumblerLookupDebugPanel.tsx", import.meta.url),
];

test("lookup refinement production control flow has no branded literals", async () => {
  const disallowedLiterals = [
    "Stanley",
    "stanley",
    "IceFlow",
    "iceflow",
    "YETI",
    "yeti",
    "Quencher",
    "quencher",
    "Rambler",
    "rambler",
  ];

  for (const fileUrl of BRAND_REPEATABILITY_PRODUCTION_FILES) {
    const source = await readFile(fileUrl, "utf8");
    for (const literal of disallowedLiterals) {
      assert.equal(
        source.includes(literal),
        false,
        `${fileUrl.pathname} contains disallowed production literal ${literal}`,
      );
    }
  }
});

test("generic straight fit rejects shadow-inflated RTIC profile widths", () => {
  const envelope = evaluateGenericStraightDiameterEnvelope({
    trustedOutsideDiameterMm: 93,
    bodyProfile: [
      { radiusMm: 46.5 },
      { radiusMm: 45.8 },
      { radiusMm: 67.4 },
      { radiusMm: 78.5 },
      { radiusMm: 84.7 },
      { radiusMm: 58.4 },
    ],
  });

  assert.equal(envelope.exceedsEnvelope, true);
  assert.equal(envelope.trustedRadiusMm, 46.5);
  assert.equal(envelope.toleranceMm, 3.72);
  assert.equal(envelope.maxAllowedRadiusMm, 50.22);
  assert.equal(envelope.maxRadiusMm, 84.7);
  assert.equal(Math.round(envelope.maxRadiusMm * 2), 169);
});

test("generic straight fit keeps sane widths inside trusted diameter envelope", () => {
  const envelope = evaluateGenericStraightDiameterEnvelope({
    trustedOutsideDiameterMm: 93,
    bodyProfile: [
      { radiusMm: 43.8 },
      { radiusMm: 46.5 },
      { radiusMm: 49.8 },
    ],
  });

  assert.equal(envelope.exceedsEnvelope, false);
  assert.equal(envelope.maxAllowedRadiusMm, 50.22);
  assert.equal(envelope.maxRadiusMm, 49.8);
});

function createStraightRunRows(args: {
  topPx?: number;
  bottomPx?: number;
  centerXPx?: number;
  widthPx?: number;
  lowerShelfStartPx?: number;
  lowerShelfWidthPx?: number;
  spikeYPx?: number;
  spikeWidthPx?: number;
}) {
  const topPx = args.topPx ?? 100;
  const bottomPx = args.bottomPx ?? 560;
  const centerXPx = args.centerXPx ?? 250;
  const widthPx = args.widthPx ?? 186;
  return Array.from({ length: bottomPx - topPx + 1 }, (_, index) => {
    const y = topPx + index;
    const width = args.spikeYPx === y
      ? args.spikeWidthPx ?? widthPx
      : args.lowerShelfStartPx !== undefined && y >= args.lowerShelfStartPx
        ? args.lowerShelfWidthPx ?? widthPx
        : widthPx;
    const left = Math.round(centerXPx - width / 2);
    const right = left + width - 1;
    return { y, left, right, width };
  });
}

test("clean straight-tumbler body runs keep image-derived fit rows", () => {
  const runs = createStraightRunRows({ widthPx: 186 });
  const filtered = filterStableStraightBodyProfileRuns({
    runs,
    centerXPx: 250,
    trustedOutsideDiameterMm: 93,
    referenceBandWidthPx: 186,
  });

  assert.equal(filtered.usedFallback, false);
  assert.equal(filtered.rowCount, runs.length);
  assert.equal(filtered.rejectedWideRunCount, 0);
  assert.equal(filtered.rejectedLowerShelfRunCount, 0);
  assert.equal(filtered.warnings.includes("dimension-fallback-used"), false);
});

test("lower shadow shelf rows cannot inflate a 93 mm straight body toward 169 mm", () => {
  const runs = createStraightRunRows({
    widthPx: 186,
    lowerShelfStartPx: 500,
    lowerShelfWidthPx: 338,
  });
  const filtered = filterStableStraightBodyProfileRuns({
    runs,
    centerXPx: 250,
    trustedOutsideDiameterMm: 93,
    referenceBandWidthPx: 186,
    lowerShelfStartYPx: 500,
  });
  const maxAcceptedWidthPx = Math.max(...filtered.runs.map((run) => run.width));
  const acceptedDiameterMm = Math.round((maxAcceptedWidthPx * (93 / 186)) * 100) / 100;

  assert.equal(filtered.usedFallback, false);
  assert.equal(filtered.rejectedWideRunCount > 0, true);
  assert.equal(filtered.warnings.includes("shadow-run-rejected"), true);
  assert.equal(filtered.warnings.includes("diameter-envelope-clamped"), true);
  assert.equal(acceptedDiameterMm, 93);
});

test("isolated straight-body radius spike is smoothed before profile sampling", () => {
  const smoothed = smoothStraightBodyRadiusSeries(
    [46, 46.2, 84.5, 46.1, 46],
    { maxSpikeRatio: 1.18, minSpikeDeltaPx: 3, windowRadius: 2 },
  );

  assert.equal(smoothed.smoothedSpikeCount, 1);
  assert.equal(smoothed.values[2] < 47, true);
});

test("trusted diameter envelope warning remains the final generic straight guard", () => {
  const warning = buildGenericStraightDiameterEnvelopeWarning({
    trustedOutsideDiameterMm: 93,
    bodyProfile: [
      { radiusMm: 46.5 },
      { radiusMm: 84.7 },
    ],
  });

  assert.ok(warning);
  assert.match(warning, /^diameter-envelope-clamped:/);
  assert.match(warning, /169\.4 mm vs 93 mm/);
});

test("RTIC-like noisy lower photo keeps accepted body width near 93 mm", () => {
  const runs = createStraightRunRows({
    topPx: 80,
    bottomPx: 680,
    widthPx: 186,
    lowerShelfStartPx: 610,
    lowerShelfWidthPx: 338,
    spikeYPx: 430,
    spikeWidthPx: 205,
  });
  const filtered = filterStableStraightBodyProfileRuns({
    runs,
    centerXPx: 250,
    trustedOutsideDiameterMm: 93,
    referenceBandWidthPx: 186,
    lowerShelfStartYPx: 610,
  });
  const maxAcceptedWidthPx = Math.max(...filtered.runs.map((run) => run.width));
  const acceptedDiameterMm = Math.round((maxAcceptedWidthPx * (93 / 186)) * 100) / 100;

  assert.equal(filtered.usedFallback, false);
  assert.equal(filtered.rejectedWideRunCount > 0, true);
  assert.equal(filtered.rejectedSpikeRunCount > 0, true);
  assert.equal(filtered.warnings.includes("straight-body-run-filtered"), true);
  assert.equal(acceptedDiameterMm <= 100.5, true);
});

test("tuned generatedModelPolicy behavior still resolves without generic straight fallback", () => {
  const profile: TumblerProfile = {
    id: "tuned-tapered",
    label: "Tuned tapered profile",
    brand: "Example",
    model: "Tuned",
    capacityOz: 30,
    shapeType: "tapered",
    topDiameterMm: 88.9,
    bottomDiameterMm: 76.2,
    overallHeightMm: 218.4,
    usableHeightMm: 150,
    hasHandle: false,
    chuckRecommended: true,
    generatedModelPolicy: {
      strategy: "body-band-lathe",
      fitDebugProfile: {
        minTraceWidthRatio: 0.12,
      },
    },
  };

  assert.equal(resolveGeneratedBodyBandPolicy(profile, false), profile.generatedModelPolicy);
});

test("generic straight path records useful fit rejection notes", () => {
  const filtered = filterStableStraightBodyProfileRuns({
    runs: createStraightRunRows({
      widthPx: 186,
      lowerShelfStartPx: 500,
      lowerShelfWidthPx: 338,
      spikeYPx: 320,
      spikeWidthPx: 205,
    }),
    centerXPx: 250,
    trustedOutsideDiameterMm: 93,
    referenceBandWidthPx: 186,
    lowerShelfStartYPx: 500,
  });

  assert.equal(filtered.usedFallback, false);
  assert.equal(filtered.warnings.includes("shadow-run-rejected"), true);
  assert.equal(filtered.warnings.includes("diameter-envelope-clamped"), true);
  assert.equal(filtered.warnings.includes("isolated-radius-spike-smoothed"), true);
  assert.equal(filtered.warnings.includes("straight-body-run-filtered"), true);
});

test("tapered product without tuned policy is not auto-faked as straight", () => {
  const profile: TumblerProfile = {
    id: "untuned-tapered",
    label: "Untuned tapered profile",
    brand: "Example",
    model: "Untuned",
    capacityOz: 30,
    shapeType: "tapered",
    topDiameterMm: 88.9,
    bottomDiameterMm: 76.2,
    overallHeightMm: 218.4,
    usableHeightMm: 150,
    hasHandle: false,
    chuckRecommended: true,
  };

  assert.equal(resolveGeneratedBodyBandPolicy(profile, true), null);
});

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

  const band = deriveReferenceMeasurementBand({
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

test("generic profile metadata controls reference measurement band derivation", () => {
  const centerXPx = 250;
  const bodyTopPx = 100;
  const bodyBottomPx = 500;
  const runs = Array.from({ length: bodyBottomPx - bodyTopPx + 1 }, (_, index) => {
    const y = bodyTopPx + index;
    const genericMetadataBand = y >= 220 && y <= 240;
    const width = genericMetadataBand ? 200 : 150;
    const left = centerXPx - Math.floor(width / 2);
    const right = left + width - 1;
    return { y, left, right, width };
  });

  const band = deriveReferenceMeasurementBand({
    runs,
    bodyTopPx,
    bodyBottomPx,
    centerXPx,
    fallbackHalfWidthPx: 130,
    bandTopRatio: 0.3,
    bandHeightRatio: 0.05,
  });

  assert.equal(band.usedFallback, false);
  assert.equal(band.topPx >= 220, true);
  assert.equal(band.bottomPx <= 240, true);
  assert.equal(band.widthPx, 200);
  assert.equal(band.referenceHalfWidthPx, 100);
});

test("Stanley IceFlow reference measurement band falls back deterministically when seam rows are unavailable", () => {
  const band = deriveReferenceMeasurementBand({
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
  assert.equal(deriveEngravingStartGuidePx({
    rimBottomPx: 168,
    paintedBodyTopPx: 182,
  }), 175);
});

test("Stanley IceFlow engraving start guide prefers the seam-adjacent silver edge", () => {
  assert.equal(deriveEngravingStartGuidePx({
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

  const trace = deriveBodyTraceExtents({
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
  const sourcePayload = buildBodyReferenceGlbSourcePayload({
    bodyOutline: createInput().bodyOutline!,
    canonicalBodyProfile: BODY_PROFILE,
    canonicalDimensionCalibration: DIMENSION_CALIBRATION,
  });

  assert.equal(result.modelStatus, "generated-reviewed-model");
  assert.equal(result.renderMode, "body-cutout-qa");
  assert.equal(result.meshNames.length, 1);
  assert.deepEqual(result.meshNames, ["body_mesh"]);
  assert.deepEqual(result.fallbackMeshNames, []);
  assert.equal(result.bodyGeometryContract.glb.path, result.glbPath);
  assert.equal(result.bodyGeometryContract.glb.freshRelativeToSource, true);
  assert.equal(result.generatedSourceSignature, stableStringifyForHash(sourcePayload));
  assert.equal(result.bodyGeometryContract.source.hash, hashJsonSha256Node(sourcePayload));
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
    dimensionsMm: { bodyHeightAuthority?: { kind?: string; status?: string; sourceField?: string; inputHeights?: { canonicalBodyHeightMm?: number } } };
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
  assert.equal(auditArtifact.dimensionsMm.bodyHeightAuthority?.kind, "canonical-body-height-warning");
  assert.equal(auditArtifact.dimensionsMm.bodyHeightAuthority?.status, "warn");
  assert.equal(auditArtifact.dimensionsMm.bodyHeightAuthority?.inputHeights?.canonicalBodyHeightMm, 214.71);
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

test("generateBodyReferenceGlb keeps reviewed source lineage stable across display-only color changes", async () => {
  const before = await generateBodyReferenceGlb(createInput({
    bodyColorHex: "#184f90",
    rimColorHex: "#b6b6b6",
  }));
  const after = await generateBodyReferenceGlb(createInput({
    bodyColorHex: "#ff22aa",
    rimColorHex: "#00ffaa",
  }));

  assert.equal(before.generatedSourceSignature, after.generatedSourceSignature);
  assert.equal(before.bodyGeometryContract.source.hash, after.bodyGeometryContract.source.hash);
  assert.equal(after.bodyGeometryContract.source.hash, after.bodyGeometryContract.glb.sourceHash);
});

test("generateBodyReferenceGlb reports when 150mm body bounds came from non-uniform canonical height", async () => {
  const shortProfile: CanonicalBodyProfile = {
    ...BODY_PROFILE,
    axis: {
      xTop: 0,
      yTop: 25,
      xBottom: 0,
      yBottom: 175,
    },
    samples: [
      { sNorm: 0, yMm: 25, yPx: 170, xLeft: -44.45, radiusPx: 84.5, radiusMm: 44.45 },
      { sNorm: 0.5, yMm: 100, yPx: 380, xLeft: -44.45, radiusPx: 84.5, radiusMm: 44.45 },
      { sNorm: 1, yMm: 175, yPx: 590, xLeft: -36, radiusPx: 68.4, radiusMm: 36 },
    ],
  };
  const shortCalibration: CanonicalDimensionCalibration = {
    ...DIMENSION_CALIBRATION,
    totalHeightMm: 218.4,
    bodyHeightMm: 150,
    lidBodyLineMm: 25,
    bodyBottomMm: 175,
    printableSurfaceContract: {
      printableTopMm: 25,
      printableBottomMm: 175,
      printableHeightMm: 150,
      axialExclusions: [],
      circumferentialExclusions: [],
    },
    svgFrontViewBoxMm: {
      x: -44.45,
      y: 0,
      width: 88.9,
      height: 218.4,
    },
  };

  const result = await generateBodyReferenceGlb(createInput({
    templateName: "usable-height-diagnostic",
    canonicalBodyProfile: shortProfile,
    canonicalDimensionCalibration: shortCalibration,
    bodyHeightAuthorityInput: {
      lookupFullProductHeightMm: 218.4,
      lookupBodyHeightMm: 150,
      lookupBodyHeightSource: "usable-height",
      templateDimensionsPrintHeightMm: 150,
      approvedSvgBoundsHeightMm: 150,
      referenceBandHeightPx: 14,
    },
  }));

  assert.equal(result.bodyGeometryContract.validation.status, "pass");
  assert.equal(result.bodyGeometryContract.source.hash, result.bodyGeometryContract.glb.sourceHash);
  assert.equal(result.bodyGeometryContract.dimensionsMm.bodyBounds?.height, 150);
  assert.equal(result.bodyGeometryContract.dimensionsMm.bodyHeightAuthority?.status, "warn");
  assert.equal(result.bodyGeometryContract.dimensionsMm.bodyHeightAuthority?.kind, "canonical-body-height-warning");
  assert.equal(result.bodyGeometryContract.dimensionsMm.bodyHeightAuthority?.sourceField, "canonicalDimensionCalibration.bodyHeightMm");
  assert.equal(result.bodyGeometryContract.dimensionsMm.bodyHeightAuthority?.isPhysicalBodyHeight, false);
  assert.ok(result.bodyGeometryContract.dimensionsMm.bodyHeightAuthority?.rejectedHeightSources.includes("lookup.usableHeightMm"));
  assert.ok(result.bodyGeometryContract.dimensionsMm.bodyHeightAuthority?.rejectedHeightSources.includes("approvedSvgBounds.height"));
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
  const expectedUniformHeightMm = Math.round(185 * (88.9 / 40) * 100) / 100;
  assert.ok(bounds.x > 80);
  assert.ok(Math.abs(bounds.y - expectedUniformHeightMm) <= 0.5);
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
    dimensionsMm: {
      scaleSource?: string;
      expectedBodyHeightMm?: number;
      bodyHeightAuthority?: {
        kind?: string;
        status?: string;
        sourceField?: string;
        uniformScaleApplied?: boolean;
        derivedBodyHeightMm?: number;
      };
    };
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
  assert.equal(auditArtifact.dimensionsMm.expectedBodyHeightMm, expectedUniformHeightMm);
  assert.equal(auditArtifact.dimensionsMm.bodyHeightAuthority?.kind, "derived-from-diameter-scale");
  assert.equal(auditArtifact.dimensionsMm.bodyHeightAuthority?.sourceField, "sourceContour.heightUnits * mmPerSourceUnit");
  assert.equal(auditArtifact.dimensionsMm.bodyHeightAuthority?.uniformScaleApplied, true);
  assert.equal(auditArtifact.dimensionsMm.bodyHeightAuthority?.derivedBodyHeightMm, expectedUniformHeightMm);
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
