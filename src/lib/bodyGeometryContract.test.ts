import assert from "node:assert/strict";
import test from "node:test";

import type {
  CanonicalBodyProfile,
  CanonicalDimensionCalibration,
  EditableBodyOutline,
} from "../types/productTemplate.ts";
import { hashJsonSha256Node } from "./hashSha256.node.ts";
import {
  buildEngravingOverlayPreviewState,
} from "./engravingOverlayPreview.ts";
import {
  createBodyReferenceV2Layer,
  createCenterlineAxis,
} from "./bodyReferenceV2Layers.ts";
import {
  buildMirroredBodyPreview,
} from "./bodyReferenceV2ScaleMirror.ts";
import {
  buildLaserBedSurfaceMappingSignature,
} from "./laserBedSurfaceMapping.ts";
import {
  buildBodyGeometrySourceHashPayload,
  createEmptyBodyGeometryContract,
  detectAccessoryMeshes,
  detectBodyMeshes,
  detectFallbackMeshes,
  isBodyOnlyMode,
  isContractPassing,
  mergeAuditContractWithLoadedInspection,
  resolveLoadedGlbFreshRelativeToSource,
  resolveGlbFreshRelativeToSource,
  type BodyGeometryContract,
  updateContractValidation,
} from "./bodyGeometryContract.ts";
import { buildBodyGeometryStatusBadgeState } from "./bodyGeometryStatusBadge.ts";
import { createFinishBandReference } from "./productAppearanceReferenceLayers.ts";

type BodyGeometryContractOverrides =
  Omit<Partial<BodyGeometryContract>, "source" | "glb" | "meshes" | "dimensionsMm" | "validation" | "svgQuality"> & {
    source?: Partial<BodyGeometryContract["source"]>;
    glb?: Partial<BodyGeometryContract["glb"]>;
    meshes?: Partial<BodyGeometryContract["meshes"]>;
    dimensionsMm?: Partial<BodyGeometryContract["dimensionsMm"]>;
    validation?: Partial<BodyGeometryContract["validation"]>;
    svgQuality?: BodyGeometryContract["svgQuality"];
  };

function createTestBodyGeometryContract(
  overrides: BodyGeometryContractOverrides = {},
): BodyGeometryContract {
  const emptyContract = createEmptyBodyGeometryContract();
  return {
    ...emptyContract,
    ...overrides,
    source: {
      ...emptyContract.source,
      ...overrides.source,
    },
    glb: {
      ...emptyContract.glb,
      ...overrides.glb,
    },
    meshes: {
      ...emptyContract.meshes,
      ...overrides.meshes,
    },
    dimensionsMm: {
      ...emptyContract.dimensionsMm,
      ...overrides.dimensionsMm,
    },
    validation: {
      ...emptyContract.validation,
      ...overrides.validation,
    },
    svgQuality: overrides.svgQuality ?? emptyContract.svgQuality,
  };
}

function createCanonicalAuthorityFixture() {
  const outline: EditableBodyOutline = {
    closed: true,
    version: 1,
    sourceContourMode: "body-only" as const,
    points: [
      { id: "top", x: 43.2, y: 15.5, role: "topOuter" as const, pointType: "corner" as const, inHandle: null, outHandle: null },
      { id: "mid", x: 43.2, y: 88.4, role: "body" as const, pointType: "smooth" as const, inHandle: null, outHandle: null },
      { id: "base", x: 43.2, y: 157.2, role: "base" as const, pointType: "corner" as const, inHandle: null, outHandle: null },
    ],
    directContour: [
      { x: 43.2, y: 15.5 },
      { x: 43.2, y: 88.4 },
      { x: 43.2, y: 157.2 },
      { x: -43.2, y: 157.2 },
      { x: -43.2, y: 88.4 },
      { x: -43.2, y: 15.5 },
    ],
  };
  const canonicalBodyProfile: CanonicalBodyProfile = {
    symmetrySource: "left",
    mirroredFromSymmetrySource: true,
    axis: {
      xTop: 0,
      yTop: 15.5,
      xBottom: 0,
      yBottom: 157.2,
    },
    samples: [
      { sNorm: 0, yMm: 15.5, yPx: 28.2, xLeft: -43.2, radiusPx: 43.2, radiusMm: 43.2 },
      { sNorm: 0.5, yMm: 88.4, yPx: 92.4, xLeft: -43.2, radiusPx: 43.2, radiusMm: 43.2 },
      { sNorm: 1, yMm: 157.2, yPx: 156.6, xLeft: -43.2, radiusPx: 43.2, radiusMm: 43.2 },
    ],
    svgPath: "",
  };
  const canonicalDimensionCalibration: CanonicalDimensionCalibration = {
    units: "mm",
    totalHeightMm: 172.72,
    bodyHeightMm: 141.7,
    lidBodyLineMm: 15.5,
    bodyBottomMm: 157.2,
    wrapDiameterMm: 86.4,
    baseDiameterMm: 86.4,
    wrapWidthMm: 271.43,
    frontVisibleWidthMm: 86.4,
    frontAxisPx: {
      xTop: 0,
      yTop: 28.2,
      xBottom: 0,
      yBottom: 156.6,
    },
    photoToFrontTransform: {
      type: "affine",
      matrix: [1, 0, 0, 0, 1.2245, -19.03],
    },
    svgFrontViewBoxMm: {
      x: -43.2,
      y: 0,
      width: 86.4,
      height: 172.72,
    },
    wrapMappingMm: {
      frontMeridianMm: 135.72,
      backMeridianMm: 0,
      leftQuarterMm: 67.86,
      rightQuarterMm: 203.58,
    },
    axialSurfaceBands: undefined,
    printableSurfaceContract: {
      printableTopMm: 15.5,
      printableBottomMm: 172.72,
      printableHeightMm: 157.22,
      axialExclusions: [],
      circumferentialExclusions: [],
    },
    glbScale: {
      unitsPerMm: 1,
    },
  };
  return { outline, canonicalBodyProfile, canonicalDimensionCalibration };
}

test("createEmptyBodyGeometryContract starts as an unknown passive metadata shell", () => {
  const contract = createEmptyBodyGeometryContract();

  assert.equal(contract.contractVersion, "2026-04-20-v1");
  assert.equal(contract.mode, "unknown");
  assert.equal(contract.source.type, "unknown");
  assert.deepEqual(contract.meshes.names, []);
  assert.equal(contract.dimensionsMm.scaleSource, "unknown");
  assert.equal(contract.validation.status, "unknown");
});

test("buildBodyGeometrySourceHashPayload captures effective outline geometry fields", () => {
  const payload = buildBodyGeometrySourceHashPayload({
    closed: true,
    version: 1,
    points: [
      {
        id: "p1",
        x: 1.234,
        y: 5.678,
        pointType: "corner",
        role: "body",
      },
      {
        id: "p2",
        x: 9.876,
        y: 4.321,
        pointType: "smooth",
        role: "base",
        inHandle: { x: 8.765, y: 4.111 },
        outHandle: { x: 10.111, y: 4.555 },
      },
    ],
    directContour: [{ x: 1.111, y: 2.222 }],
    sourceContour: [{ x: 3.333, y: 4.444 }],
    sourceContourBounds: {
      minX: 0,
      minY: 0,
      maxX: 12.345,
      maxY: 45.678,
      width: 12.345,
      height: 45.678,
    },
    sourceContourViewport: {
      minX: 100.123,
      minY: 50.456,
      width: 300.789,
      height: 600.987,
    },
    sourceContourMode: "body-only",
  });

  assert.ok(payload);
  assert.deepEqual(payload.points, [
    {
      x: 1.23,
      y: 5.68,
      role: "body",
      pointType: "corner",
      inHandle: null,
      outHandle: null,
    },
    {
      x: 9.88,
      y: 4.32,
      role: "base",
      pointType: "smooth",
      inHandle: { x: 8.77, y: 4.11 },
      outHandle: { x: 10.11, y: 4.56 },
    },
  ]);
  assert.equal(payload.closed, true);
  assert.equal(payload.version, 1);
  assert.equal(payload.sourceContourMode, "body-only");
  // A one-point source contour is not usable as geometry authority, so the hash
  // payload resolves the effective contour from the saved manual points instead.
  const directContour = payload.directContour as Array<{ x: number; y: number }> | null | undefined;
  assert.ok((directContour?.length ?? 0) > 8);
  assert.deepEqual(directContour?.[0], { x: 9.9, y: 4.3 });
  assert.deepEqual(directContour?.at(-1), { x: -9.9, y: 4.3 });
  assert.deepEqual(payload.sourceContour, [{ x: 3.33, y: 4.44 }]);
  assert.deepEqual(payload.sourceContourBounds, {
    minX: 0,
    minY: 0,
    maxX: 12.35,
    maxY: 45.68,
    width: 12.35,
    height: 45.68,
  });
  assert.deepEqual(payload.sourceContourViewport, {
    minX: 100.12,
    minY: 50.46,
    width: 300.79,
    height: 600.99,
  });
});

test("buildBodyGeometrySourceHashPayload includes canonical body authority when present", () => {
  const authority = createCanonicalAuthorityFixture();
  const payload = buildBodyGeometrySourceHashPayload({
    outline: authority.outline,
    canonicalBodyProfile: authority.canonicalBodyProfile,
    canonicalDimensionCalibration: authority.canonicalDimensionCalibration,
  }) as {
    version: number;
    outline: ReturnType<typeof buildBodyGeometrySourceHashPayload>;
    canonicalBodyProfile: { samples: Array<{ yMm: number }> };
    canonicalDimensionCalibration: { wrapDiameterMm: number };
  };

  assert.ok(payload);
  assert.equal(payload.version, 2);
  assert.deepEqual(payload.outline, buildBodyGeometrySourceHashPayload(authority.outline));
  assert.equal(payload.canonicalDimensionCalibration.wrapDiameterMm, 86.4);
  assert.equal(payload.canonicalBodyProfile.samples[1]?.yMm, 88.4);
});

test("buildBodyGeometrySourceHashPayload changes when canonical authority changes even if outline is unchanged", () => {
  const authority = createCanonicalAuthorityFixture();
  const editedCalibration: CanonicalDimensionCalibration = {
    ...authority.canonicalDimensionCalibration,
    bodyHeightMm: 141.74,
    wrapDiameterMm: 86.44,
    wrapWidthMm: 271.55,
    printableSurfaceContract: {
      ...authority.canonicalDimensionCalibration.printableSurfaceContract!,
      printableHeightMm: 157.26,
    },
  };
  const editedProfile: CanonicalBodyProfile = {
    ...authority.canonicalBodyProfile,
    samples: authority.canonicalBodyProfile.samples.map((sample, index) => ({
      ...sample,
      yMm: index === 0 ? sample.yMm : sample.yMm + 0.04,
    })),
  };

  const beforeHash = hashJsonSha256Node(buildBodyGeometrySourceHashPayload({
    outline: authority.outline,
    canonicalBodyProfile: authority.canonicalBodyProfile,
    canonicalDimensionCalibration: authority.canonicalDimensionCalibration,
  }));
  const afterHash = hashJsonSha256Node(buildBodyGeometrySourceHashPayload({
    outline: authority.outline,
    canonicalBodyProfile: editedProfile,
    canonicalDimensionCalibration: editedCalibration,
  }));

  assert.notEqual(beforeHash, afterHash);
});

test("detectBodyMeshes classifies common body, shell, and cutout mesh names", () => {
  assert.deepEqual(
    detectBodyMeshes([
      "body_mesh",
      "cup_body_main",
      "tumbler_shell",
      "cutout_profile",
      "lid_mesh",
    ]),
    ["body_mesh", "cup_body_main", "tumbler_shell", "cutout_profile"],
  );
});

test("detectAccessoryMeshes classifies non-body tumbler accessories without tagging body_mesh", () => {
  assert.deepEqual(
    detectAccessoryMeshes([
      "body_mesh",
      "lid_mesh",
      "silver_ring_mesh",
      "handle_mesh",
      "straw_mesh",
    ]),
    ["lid_mesh", "silver_ring_mesh", "handle_mesh", "straw_mesh"],
  );
});

test("detectFallbackMeshes only tags explicit fallback or known fake assembly meshes", () => {
  assert.deepEqual(
    detectFallbackMeshes([
      "body_mesh",
      "lid_mesh",
      "rim_mesh",
      "iceflow_fallback_visual_assembly",
      "iceflow_handle_top_bar_mesh",
      "proxy_body_shell_mesh",
    ]),
    [
      "iceflow_fallback_visual_assembly",
      "iceflow_handle_top_bar_mesh",
      "proxy_body_shell_mesh",
    ],
  );
});

test("BODY CUTOUT QA contracts fail when accessory meshes leak into the mesh list", () => {
  const contract = updateContractValidation({
    ...createEmptyBodyGeometryContract(),
    mode: "body-cutout-qa",
    source: {
      type: "approved-svg",
      hash: "json:source",
      detectedBodyOnly: true,
    },
    glb: {
      path: "/api/admin/models/generated/example.glb",
      hash: "json:glb",
      sourceHash: "json:source",
      freshRelativeToSource: true,
    },
    meshes: {
      names: ["body_mesh", "lid_mesh", "handle_mesh"],
      bodyMeshNames: [],
      accessoryMeshNames: [],
      fallbackMeshNames: [],
      fallbackDetected: false,
      unexpectedMeshes: [],
    },
    dimensionsMm: {
      bodyBounds: {
        width: 88.98,
        height: 225,
        depth: 88.98,
      },
      expectedBodyWidthMm: 88.98,
      expectedBodyHeightMm: 225,
    },
    validation: {
      status: "unknown",
      errors: [],
      warnings: [],
    },
  });

  assert.deepEqual(contract.meshes.bodyMeshNames, ["body_mesh"]);
  assert.deepEqual(contract.meshes.accessoryMeshNames, ["lid_mesh", "handle_mesh"]);
  assert.equal(contract.validation.status, "fail");
  assert.equal(isContractPassing(contract), false);
  assert.match(contract.validation.errors.join(" "), /expected exactly body geometry/i);
});

test("BODY CUTOUT QA contracts fail when fallback meshes leak into the mesh list", () => {
  const contract = updateContractValidation({
    ...createEmptyBodyGeometryContract(),
    mode: "body-cutout-qa",
    source: {
      type: "approved-svg",
      hash: "json:source",
      detectedBodyOnly: true,
    },
    glb: {
      path: "/api/admin/models/generated/example.glb",
      hash: "json:glb",
      sourceHash: "json:source",
      freshRelativeToSource: true,
    },
    meshes: {
      names: ["body_mesh", "iceflow_fallback_visual_assembly"],
      bodyMeshNames: [],
      accessoryMeshNames: [],
      fallbackMeshNames: [],
      fallbackDetected: false,
      unexpectedMeshes: [],
    },
    dimensionsMm: {
      bodyBounds: {
        width: 88.98,
        height: 225,
        depth: 88.98,
      },
      bodyBoundsUnits: "mm",
      expectedBodyWidthMm: 88.98,
      expectedBodyHeightMm: 225,
    },
    validation: {
      status: "unknown",
      errors: [],
      warnings: [],
    },
  });

  assert.deepEqual(contract.meshes.fallbackMeshNames, ["iceflow_fallback_visual_assembly"]);
  assert.equal(contract.meshes.fallbackDetected, true);
  assert.equal(contract.validation.status, "fail");
  assert.match(contract.validation.errors.join(" "), /Fallback geometry detected in body-only QA mode/i);
});

test("BODY CUTOUT QA contracts fail when no body mesh is present", () => {
  const contract = updateContractValidation({
    ...createEmptyBodyGeometryContract(),
    mode: "body-cutout-qa",
    source: {
      type: "approved-svg",
      hash: "json:source",
      detectedBodyOnly: true,
    },
    glb: {
      path: "/api/admin/models/generated/example.glb",
      hash: "json:glb",
      sourceHash: "json:source",
      freshRelativeToSource: true,
    },
    meshes: {
      names: ["lid_mesh"],
      bodyMeshNames: [],
      accessoryMeshNames: [],
      fallbackMeshNames: [],
      fallbackDetected: false,
      unexpectedMeshes: [],
    },
    dimensionsMm: {},
    validation: {
      status: "unknown",
      errors: [],
      warnings: [],
    },
  });

  assert.equal(contract.validation.status, "fail");
  assert.match(contract.validation.errors.join(" "), /expected at least one body mesh/i);
});

test("BODY CUTOUT QA contracts fail when the GLB is stale relative to the source contour", () => {
  const contract = updateContractValidation({
    ...createEmptyBodyGeometryContract(),
    mode: "body-cutout-qa",
    source: {
      type: "approved-svg",
      hash: "json:source",
      detectedBodyOnly: true,
    },
    glb: {
      path: "/api/admin/models/generated/example.glb",
      hash: "json:glb",
      sourceHash: "json:source",
      freshRelativeToSource: false,
    },
    meshes: {
      names: ["body_mesh"],
      bodyMeshNames: [],
      accessoryMeshNames: [],
      fallbackMeshNames: [],
      fallbackDetected: false,
      unexpectedMeshes: [],
    },
    dimensionsMm: {
      bodyBounds: {
        width: 88.98,
        height: 225,
        depth: 88.98,
      },
      bodyBoundsUnits: "mm",
      expectedBodyWidthMm: 88.98,
      expectedBodyHeightMm: 225,
    },
    validation: {
      status: "unknown",
      errors: [],
      warnings: [],
    },
  });

  assert.equal(contract.validation.status, "fail");
  assert.match(contract.validation.errors.join(" "), /stale relative to the current source contour/i);
});

test("BODY CUTOUT QA contracts fail when GLB source lineage hash mismatches the source SVG hash", () => {
  const contract = updateContractValidation({
    ...createEmptyBodyGeometryContract(),
    mode: "body-cutout-qa",
    source: {
      type: "approved-svg",
      hash: "json:source-a",
      detectedBodyOnly: true,
    },
    glb: {
      path: "/api/admin/models/generated/example.glb",
      hash: "json:glb",
      sourceHash: "json:source-b",
      freshRelativeToSource: true,
    },
    meshes: {
      names: ["body_mesh"],
      bodyMeshNames: [],
      accessoryMeshNames: [],
      fallbackMeshNames: [],
      fallbackDetected: false,
      unexpectedMeshes: [],
    },
    dimensionsMm: {
      bodyBounds: {
        width: 88.98,
        height: 225,
        depth: 88.98,
      },
      bodyBoundsUnits: "mm",
      expectedBodyWidthMm: 88.98,
      expectedBodyHeightMm: 225,
    },
    validation: {
      status: "unknown",
      errors: [],
      warnings: [],
    },
  });

  assert.equal(contract.validation.status, "fail");
  assert.match(contract.validation.errors.join(" "), /Source SVG hash does not match GLB source hash/i);
});

test("passive validation warns when geometry is stale or dimensionally drifted, but still keeps the contract inspectable", () => {
  const contract = updateContractValidation({
    ...createEmptyBodyGeometryContract(),
    mode: "hybrid-preview",
    source: {
      type: "generated",
      hash: "json:source",
    },
    glb: {
      path: "/api/admin/models/generated/example.glb",
      hash: "json:glb",
      sourceHash: "json:source",
      freshRelativeToSource: false,
    },
    meshes: {
      names: ["body_mesh", "mystery_mesh"],
      bodyMeshNames: [],
      accessoryMeshNames: [],
      fallbackMeshNames: [],
      fallbackDetected: false,
      unexpectedMeshes: [],
    },
    dimensionsMm: {
      bodyBounds: {
        width: 92,
        height: 220,
        depth: 92,
      },
      bodyBoundsUnits: "mm",
      expectedBodyWidthMm: 88.98,
      expectedBodyHeightMm: 225,
    },
    validation: {
      status: "unknown",
      errors: [],
      warnings: [],
    },
  });

  assert.equal(contract.validation.status, "warn");
  assert.deepEqual(contract.meshes.unexpectedMeshes, ["mystery_mesh"]);
  assert.match(contract.validation.warnings.join(" "), /not fresh relative to the current source contour/i);
  assert.match(contract.validation.warnings.join(" "), /differs from expected body width/i);
  assert.equal(isContractPassing(contract), false);
});

test("BODY CUTOUT QA warns when GLB freshness lineage is unavailable", () => {
  const contract = updateContractValidation({
    ...createEmptyBodyGeometryContract(),
    mode: "body-cutout-qa",
    source: {
      type: "approved-svg",
      hash: "sha256:source",
    },
    glb: {
      path: "/api/admin/models/generated/example.glb",
      hash: "sha256:glb",
    },
    meshes: {
      names: ["body_mesh"],
      bodyMeshNames: [],
      accessoryMeshNames: [],
      fallbackMeshNames: [],
      fallbackDetected: false,
      unexpectedMeshes: [],
    },
    dimensionsMm: {
      bodyBounds: {
        width: 88.98,
        height: 225,
        depth: 88.98,
      },
      bodyBoundsUnits: "mm",
    },
    validation: {
      status: "unknown",
      errors: [],
      warnings: [],
    },
  });

  assert.equal(contract.validation.status, "warn");
  assert.match(contract.validation.warnings.join(" "), /GLB freshness could not be verified because source lineage metadata is missing/i);
});

test("BODY CUTOUT QA warns when bounds are only available in scene units", () => {
  const contract = updateContractValidation({
    ...createEmptyBodyGeometryContract(),
    mode: "body-cutout-qa",
    source: {
      type: "approved-svg",
      hash: "sha256:source",
      detectedBodyOnly: true,
    },
    glb: {
      path: "/api/admin/models/generated/example.glb",
      hash: "sha256:glb",
      sourceHash: "sha256:source",
      freshRelativeToSource: true,
    },
    meshes: {
      names: ["body_mesh"],
      bodyMeshNames: [],
      accessoryMeshNames: [],
      fallbackMeshNames: [],
      fallbackDetected: false,
      unexpectedMeshes: [],
    },
    dimensionsMm: {
      bodyBoundsUnits: "scene-units",
      expectedBodyWidthMm: 88.98,
      expectedBodyHeightMm: 225,
    },
    validation: {
      status: "unknown",
      errors: [],
      warnings: [],
    },
  });

  assert.equal(contract.validation.status, "warn");
  assert.match(contract.validation.warnings.join(" "), /scene units/i);
  assert.match(contract.validation.warnings.join(" "), /cannot verify scale/i);
});

test("contracts infer mesh-bounds as the scale source when mm body bounds are available", () => {
  const contract = updateContractValidation({
    ...createEmptyBodyGeometryContract(),
    mode: "body-cutout-qa",
    source: {
      type: "approved-svg",
      hash: "sha256:source",
    },
    glb: {
      path: "/api/admin/models/generated/example.glb",
      hash: "sha256:glb",
      sourceHash: "sha256:source",
      freshRelativeToSource: true,
    },
    meshes: {
      names: ["body_mesh"],
      bodyMeshNames: [],
      accessoryMeshNames: [],
      fallbackMeshNames: [],
      fallbackDetected: false,
      unexpectedMeshes: [],
    },
    dimensionsMm: {
      bodyBounds: {
        width: 88.98,
        height: 225,
        depth: 88.98,
      },
      bodyBoundsUnits: "mm",
    },
    validation: {
      status: "unknown",
      errors: [],
      warnings: [],
    },
  });

  assert.equal(contract.dimensionsMm.scaleSource, "mesh-bounds");
});

test("contracts infer physical-wrap as the scale source when physical dimensions exist without mesh bounds", () => {
  const contract = updateContractValidation({
    ...createEmptyBodyGeometryContract(),
    mode: "hybrid-preview",
    source: {
      type: "generated",
      hash: "sha256:source",
    },
    glb: {
      path: "/api/admin/models/generated/example.glb",
      hash: "sha256:glb",
    },
    meshes: {
      names: ["body_mesh"],
      bodyMeshNames: [],
      accessoryMeshNames: [],
      fallbackMeshNames: [],
      fallbackDetected: false,
      unexpectedMeshes: [],
    },
    dimensionsMm: {
      wrapDiameterMm: 88,
      wrapWidthMm: 276.46,
      expectedBodyWidthMm: 88,
      expectedBodyHeightMm: 225,
    },
    validation: {
      status: "unknown",
      errors: [],
      warnings: [],
    },
  });

  assert.equal(contract.dimensionsMm.scaleSource, "physical-wrap");
});

test("contracts infer svg-viewbox as the scale source when only raw SVG dimensions are available", () => {
  const contract = updateContractValidation({
    ...createEmptyBodyGeometryContract(),
    mode: "unknown",
    source: {
      type: "uploaded-svg",
      widthPx: 420,
      heightPx: 840,
      viewBox: "0 0 420 840",
    },
    glb: {},
    meshes: {
      names: [],
      bodyMeshNames: [],
      accessoryMeshNames: [],
      fallbackMeshNames: [],
      fallbackDetected: false,
      unexpectedMeshes: [],
    },
    dimensionsMm: {},
    validation: {
      status: "unknown",
      errors: [],
      warnings: [],
    },
  });

  assert.equal(contract.dimensionsMm.scaleSource, "svg-viewbox");
});

test("svg-viewbox scale source warns when raw source width and physical wrap width diverge", () => {
  const contract = updateContractValidation({
    ...createEmptyBodyGeometryContract(),
    mode: "hybrid-preview",
    source: {
      type: "uploaded-svg",
      widthPx: 420,
      heightPx: 840,
      viewBox: "0 0 420 840",
    },
    glb: {},
    meshes: {
      names: [],
      bodyMeshNames: [],
      accessoryMeshNames: [],
      fallbackMeshNames: [],
      fallbackDetected: false,
      unexpectedMeshes: [],
    },
    dimensionsMm: {
      wrapWidthMm: 276.46,
      scaleSource: "svg-viewbox",
    },
    validation: {
      status: "unknown",
      errors: [],
      warnings: [],
    },
  });

  assert.equal(contract.validation.status, "warn");
  assert.match(contract.validation.warnings.join(" "), /Source SVG width 420 differs from physical wrap width 276.46/i);
});

test("non-QA modes warn about accessory meshes but do not fail body-only validation", () => {
  const contract = updateContractValidation({
    ...createEmptyBodyGeometryContract(),
    mode: "hybrid-preview",
    source: {
      type: "generated",
      hash: "json:source",
    },
    glb: {
      path: "/api/admin/models/generated/example.glb",
      hash: "json:glb",
      sourceHash: "json:source",
      freshRelativeToSource: true,
    },
    meshes: {
      names: ["body_mesh", "lid_mesh"],
      bodyMeshNames: [],
      accessoryMeshNames: [],
      fallbackMeshNames: [],
      fallbackDetected: false,
      unexpectedMeshes: [],
    },
    dimensionsMm: {
      bodyBounds: {
        width: 88.98,
        height: 225,
        depth: 88.98,
      },
      bodyBoundsUnits: "mm",
      expectedBodyWidthMm: 88.98,
      expectedBodyHeightMm: 225,
    },
    validation: {
      status: "unknown",
      errors: [],
      warnings: [],
    },
  });

  assert.equal(contract.validation.status, "pass");
  assert.deepEqual(contract.meshes.accessoryMeshNames, ["lid_mesh"]);
});

test("audit fallback truth is preserved when runtime name-based inspection does not detect fallback", () => {
  const merged = mergeAuditContractWithLoadedInspection({
    auditContract: createTestBodyGeometryContract({
      mode: "body-cutout-qa",
      source: {
        type: "approved-svg",
        hash: "sha256:source",
      },
      glb: {
        hash: "sha256:glb",
        sourceHash: "sha256:source",
        freshRelativeToSource: true,
      },
      meshes: {
        names: ["body_mesh", "lid_mesh", "silver_ring_mesh"],
        bodyMeshNames: ["body_mesh"],
        accessoryMeshNames: ["lid_mesh", "silver_ring_mesh"],
        fallbackMeshNames: ["lid_mesh"],
        fallbackDetected: true,
      },
      dimensionsMm: {
        expectedBodyWidthMm: 88.98,
        expectedBodyHeightMm: 225,
        wrapDiameterMm: 86.36,
        wrapWidthMm: 271.31,
      },
      validation: {
        status: "pass",
        errors: [],
        warnings: [],
      },
    }),
    loadedInspectionContract: createTestBodyGeometryContract({
      mode: "body-cutout-qa",
      source: {
        type: "approved-svg",
        hash: "sha256:source",
      },
      glb: {
        path: "/api/admin/models/generated/example.glb",
        hash: "sha256:glb",
        sourceHash: "sha256:source",
        freshRelativeToSource: true,
      },
      meshes: {
        names: ["body_mesh", "lid_mesh", "silver_ring_mesh"],
        visibleMeshNames: ["body_mesh", "lid_mesh", "silver_ring_mesh"],
        bodyMeshNames: ["body_mesh"],
        accessoryMeshNames: ["lid_mesh", "silver_ring_mesh"],
        fallbackMeshNames: [],
        fallbackDetected: false,
      },
      dimensionsMm: {
        bodyBounds: { width: 88.98, height: 225, depth: 88.98 },
        bodyBoundsUnits: "mm",
      },
    }),
    currentMode: "body-cutout-qa",
    currentSourceHash: "sha256:source",
    loadedGlbHash: "sha256:glb",
  });

  assert.equal(merged.meshes.fallbackDetected, true);
  assert.deepEqual(merged.meshes.fallbackMeshNames, ["lid_mesh"]);
});

test("pending loaded-scene inspection reports complete status while using audit provisional truth in BODY CUTOUT QA", () => {
  const merged = mergeAuditContractWithLoadedInspection({
    auditContract: createTestBodyGeometryContract({
      mode: "body-cutout-qa",
      source: {
        type: "approved-svg",
        hash: "sha256:source",
      },
      glb: {
        path: "/api/admin/models/generated/example.glb",
        hash: "sha256:glb",
        sourceHash: "sha256:source",
        freshRelativeToSource: true,
      },
      meshes: {
        names: ["body_mesh"],
        bodyMeshNames: ["body_mesh"],
      },
      dimensionsMm: {
        bodyBounds: { width: 102.98, height: 245.8, depth: 102.98 },
        bodyBoundsUnits: "mm",
        expectedBodyWidthMm: 102.98,
        expectedBodyHeightMm: 245.8,
      },
      validation: {
        status: "pass",
        errors: [],
        warnings: [],
      },
    }),
    loadedInspectionContract: createTestBodyGeometryContract({
      mode: "body-cutout-qa",
      glb: {
        path: "/api/admin/models/generated/example.glb",
        hash: "sha256:glb",
      },
    }),
    currentMode: "body-cutout-qa",
    currentSourceHash: "sha256:source",
    loadedGlbHash: "sha256:glb",
    runtimeInspection: {
      status: "pending",
      glbUrl: "/api/admin/models/generated/example.glb",
      auditArtifactPresent: true,
    },
  });

  assert.equal(merged.runtimeInspection?.status, "complete");
  assert.equal(merged.runtimeInspection?.auditArtifactPresent, true);
  assert.equal(merged.runtimeInspection?.auditArtifactUsedAsProvisionalTruth, true);
  assert.equal(merged.runtimeInspection?.loadedMeshNamesSource, "audit-provisional");
  assert.equal(merged.runtimeInspection?.bodyBoundsSource, "audit-provisional");
  assert.deepEqual(merged.meshes.names, ["body_mesh"]);
  assert.deepEqual(merged.meshes.bodyMeshNames, ["body_mesh"]);
  assert.deepEqual(merged.dimensionsMm.bodyBounds, {
    width: 102.98,
    height: 245.8,
    depth: 102.98,
  });
  assert.doesNotMatch(
    merged.validation.warnings.join(" "),
    /Audit mesh list differs from loaded GLB mesh list\./i,
  );
});

test("optional missing audit sidecars do not add freshness warnings for non-reviewed preview models", () => {
  const merged = mergeAuditContractWithLoadedInspection({
    loadedInspectionContract: createTestBodyGeometryContract({
      mode: "full-model",
      source: {
        type: "approved-svg",
        hash: "sha256:source",
      },
      glb: {
        path: "/api/admin/models/generated/generated-trace.glb",
        hash: "sha256:glb",
      },
      meshes: {
        names: ["body_mesh"],
        bodyMeshNames: ["body_mesh"],
      },
      dimensionsMm: {
        bodyBounds: { width: 102.98, height: 245.8, depth: 102.98 },
        bodyBoundsUnits: "mm",
      },
    }),
    currentMode: "full-model",
    currentSourceHash: "sha256:source",
    loadedGlbHash: "sha256:glb",
    runtimeInspection: {
      status: "complete",
      glbUrl: "/api/admin/models/generated/generated-trace.glb",
      auditArtifactOptionalMissing: true,
    },
  });

  assert.equal(merged.runtimeInspection?.auditArtifactOptionalMissing, true);
  assert.equal(merged.runtimeInspection?.auditArtifactRequiredMissing, false);
  assert.doesNotMatch(
    merged.validation.warnings.join(" "),
    /GLB freshness could not be verified because source lineage metadata is missing\./i,
  );
  assert.doesNotMatch(
    merged.validation.warnings.join(" "),
    /Expected generated audit sidecar is missing for this reviewed GLB\./i,
  );
});

test("required missing audit sidecars stay visible for reviewed generated GLBs", () => {
  const merged = mergeAuditContractWithLoadedInspection({
    loadedInspectionContract: createTestBodyGeometryContract({
      mode: "body-cutout-qa",
      source: {
        type: "approved-svg",
        hash: "sha256:source",
      },
      glb: {
        path: "/api/admin/models/generated/reviewed.glb",
        hash: "sha256:glb",
      },
      meshes: {
        names: ["body_mesh"],
        bodyMeshNames: ["body_mesh"],
      },
      dimensionsMm: {
        bodyBounds: { width: 102.98, height: 245.8, depth: 102.98 },
        bodyBoundsUnits: "mm",
        expectedBodyWidthMm: 102.98,
        expectedBodyHeightMm: 245.8,
      },
    }),
    currentMode: "body-cutout-qa",
    currentSourceHash: "sha256:source",
    loadedGlbHash: "sha256:glb",
    runtimeInspection: {
      status: "complete",
      glbUrl: "/api/admin/models/generated/reviewed.glb",
      auditArtifactRequiredMissing: true,
    },
  });

  assert.equal(merged.runtimeInspection?.auditArtifactRequiredMissing, true);
  assert.match(
    merged.validation.warnings.join(" "),
    /Expected generated audit sidecar is missing for this reviewed GLB\./i,
  );
  assert.match(
    merged.validation.warnings.join(" "),
    /GLB freshness could not be verified because source lineage metadata is missing\./i,
  );
});

test("failed loaded-scene inspection keeps audit metadata as provisional truth and adds an inspection warning", () => {
  const merged = mergeAuditContractWithLoadedInspection({
    auditContract: createTestBodyGeometryContract({
      mode: "body-cutout-qa",
      source: {
        type: "approved-svg",
        hash: "sha256:source",
      },
      glb: {
        path: "/api/admin/models/generated/example.glb",
        hash: "sha256:glb",
        sourceHash: "sha256:source",
        freshRelativeToSource: true,
      },
      meshes: {
        names: ["body_mesh"],
        bodyMeshNames: ["body_mesh"],
      },
      dimensionsMm: {
        bodyBounds: { width: 102.98, height: 245.8, depth: 102.98 },
        bodyBoundsUnits: "mm",
        expectedBodyWidthMm: 102.98,
        expectedBodyHeightMm: 245.8,
      },
      validation: {
        status: "pass",
        errors: [],
        warnings: [],
      },
    }),
    loadedInspectionContract: createTestBodyGeometryContract({
      mode: "body-cutout-qa",
      glb: {
        path: "/api/admin/models/generated/example.glb",
        hash: "sha256:glb",
      },
    }),
    currentMode: "body-cutout-qa",
    currentSourceHash: "sha256:source",
    loadedGlbHash: "sha256:glb",
    runtimeInspection: {
      status: "failed",
      glbUrl: "/api/admin/models/generated/example.glb",
      error: "Scene traversal exploded.",
    },
  });

  assert.equal(merged.runtimeInspection?.status, "failed");
  assert.deepEqual(merged.meshes.names, ["body_mesh"]);
  assert.deepEqual(merged.meshes.bodyMeshNames, ["body_mesh"]);
  assert.deepEqual(merged.dimensionsMm.bodyBounds, {
    width: 102.98,
    height: 245.8,
    depth: 102.98,
  });
  assert.match(
    merged.validation.warnings.join(" "),
    /Loaded-scene inspection failed; using generated audit sidecar metadata\./i,
  );
});

test("completed loaded-scene inspection uses actual loaded mesh names and bounds", () => {
  const merged = mergeAuditContractWithLoadedInspection({
    auditContract: createTestBodyGeometryContract({
      mode: "body-cutout-qa",
      source: {
        type: "approved-svg",
        hash: "sha256:source",
      },
      glb: {
        path: "/api/admin/models/generated/example.glb",
        hash: "sha256:glb",
        sourceHash: "sha256:source",
        freshRelativeToSource: true,
      },
      meshes: {
        names: ["body_mesh"],
        bodyMeshNames: ["body_mesh"],
      },
      dimensionsMm: {
        bodyBounds: { width: 102.98, height: 245.8, depth: 102.98 },
        bodyBoundsUnits: "mm",
        expectedBodyWidthMm: 102.98,
        expectedBodyHeightMm: 245.8,
      },
      validation: {
        status: "pass",
        errors: [],
        warnings: [],
      },
    }),
    loadedInspectionContract: createTestBodyGeometryContract({
      mode: "body-cutout-qa",
      source: {
        type: "approved-svg",
        hash: "sha256:source",
      },
      glb: {
        path: "/api/admin/models/generated/example.glb",
        hash: "sha256:glb",
        sourceHash: "sha256:source",
        freshRelativeToSource: true,
      },
      meshes: {
        names: ["body_mesh"],
        bodyMeshNames: ["body_mesh"],
        visibleMeshNames: ["body_mesh"],
        materialNames: ["powder-coat"],
      },
      dimensionsMm: {
        bodyBounds: { width: 102.98, height: 245.8, depth: 102.98 },
        bodyBoundsUnits: "mm",
        expectedBodyWidthMm: 102.98,
        expectedBodyHeightMm: 245.8,
      },
    }),
    currentMode: "body-cutout-qa",
    currentSourceHash: "sha256:source",
    loadedGlbHash: "sha256:glb",
    runtimeInspection: {
      status: "complete",
      glbUrl: "/api/admin/models/generated/example.glb",
      inspectedAt: "2026-04-20T15:00:00.000Z",
    },
  });

  assert.equal(merged.runtimeInspection?.status, "complete");
  assert.equal(merged.runtimeInspection?.loadedMeshNamesSource, "runtime-inspection");
  assert.equal(merged.runtimeInspection?.bodyBoundsSource, "runtime-inspection");
  assert.deepEqual(merged.meshes.names, ["body_mesh"]);
  assert.deepEqual(merged.dimensionsMm.bodyBounds, {
    width: 102.98,
    height: 245.8,
    depth: 102.98,
  });
  assert.equal(merged.validation.status, "pass");
});

test("mergeAuditContractWithLoadedInspection preserves audit svgQuality metadata when runtime inspection is otherwise clean", () => {
  const merged = mergeAuditContractWithLoadedInspection({
    auditContract: createTestBodyGeometryContract({
      mode: "body-cutout-qa",
      source: {
        type: "approved-svg",
        hash: "sha256:source",
      },
      glb: {
        path: "/api/admin/models/generated/example.glb",
        hash: "sha256:glb",
        sourceHash: "sha256:source",
        freshRelativeToSource: true,
      },
      meshes: {
        names: ["body_mesh"],
        bodyMeshNames: ["body_mesh"],
      },
      dimensionsMm: {
        bodyBounds: { width: 102.98, height: 245.8, depth: 102.98 },
        bodyBoundsUnits: "mm",
        expectedBodyWidthMm: 102.98,
        expectedBodyHeightMm: 245.8,
      },
      validation: {
        status: "pass",
        errors: [],
        warnings: [],
      },
      svgQuality: {
        status: "pass",
        contourSource: "direct-contour",
        boundsUnits: "mm",
        pointCount: 88,
        segmentCount: 88,
        closed: true,
        closeable: false,
        duplicatePointCount: 0,
        nearDuplicatePointCount: 0,
        tinySegmentCount: 0,
        suspiciousSpikeCount: 0,
        suspiciousJumpCount: 0,
        expectedBridgeSegmentCount: 2,
        warnings: [],
        errors: [],
      },
    }),
    loadedInspectionContract: createTestBodyGeometryContract({
      mode: "body-cutout-qa",
      source: {
        type: "approved-svg",
        hash: "sha256:source",
      },
      glb: {
        path: "/api/admin/models/generated/example.glb",
        hash: "sha256:glb",
        sourceHash: "sha256:source",
        freshRelativeToSource: true,
      },
      meshes: {
        names: ["body_mesh"],
        bodyMeshNames: ["body_mesh"],
      },
      dimensionsMm: {
        bodyBounds: { width: 102.98, height: 245.8, depth: 102.98 },
        bodyBoundsUnits: "mm",
        expectedBodyWidthMm: 102.98,
        expectedBodyHeightMm: 245.8,
      },
    }),
    currentMode: "body-cutout-qa",
    currentSourceHash: "sha256:source",
    loadedGlbHash: "sha256:glb",
    runtimeInspection: {
      status: "complete",
      glbUrl: "/api/admin/models/generated/example.glb",
      inspectedAt: "2026-04-20T15:00:00.000Z",
    },
  });

  assert.equal(merged.svgQuality?.status, "pass");
  assert.equal(merged.svgQuality?.suspiciousJumpCount, 0);
  assert.equal(merged.svgQuality?.expectedBridgeSegmentCount, 2);
});

test("completed loaded-scene inspection with an empty mesh list overrides audit provisional truth and fails BODY CUTOUT QA", () => {
  const merged = mergeAuditContractWithLoadedInspection({
    auditContract: createTestBodyGeometryContract({
      mode: "body-cutout-qa",
      source: {
        type: "approved-svg",
        hash: "sha256:source",
      },
      glb: {
        path: "/api/admin/models/generated/example.glb",
        hash: "sha256:glb",
        sourceHash: "sha256:source",
        freshRelativeToSource: true,
      },
      meshes: {
        names: ["body_mesh"],
        bodyMeshNames: ["body_mesh"],
      },
      dimensionsMm: {
        bodyBounds: { width: 102.98, height: 245.8, depth: 102.98 },
        bodyBoundsUnits: "mm",
        expectedBodyWidthMm: 102.98,
        expectedBodyHeightMm: 245.8,
      },
      validation: {
        status: "pass",
        errors: [],
        warnings: [],
      },
    }),
    loadedInspectionContract: createTestBodyGeometryContract({
      mode: "body-cutout-qa",
      source: {
        type: "approved-svg",
        hash: "sha256:source",
      },
      glb: {
        path: "/api/admin/models/generated/example.glb",
        hash: "sha256:glb",
        sourceHash: "sha256:source",
        freshRelativeToSource: true,
      },
      meshes: {
        names: [],
        bodyMeshNames: [],
      },
      dimensionsMm: {
        expectedBodyWidthMm: 102.98,
        expectedBodyHeightMm: 245.8,
      },
    }),
    currentMode: "body-cutout-qa",
    currentSourceHash: "sha256:source",
    loadedGlbHash: "sha256:glb",
    runtimeInspection: {
      status: "complete",
      glbUrl: "/api/admin/models/generated/example.glb",
      inspectedAt: "2026-04-20T15:00:00.000Z",
    },
  });

  assert.equal(merged.runtimeInspection?.status, "complete");
  assert.deepEqual(merged.meshes.names, []);
  assert.deepEqual(merged.meshes.bodyMeshNames, []);
  assert.equal(merged.dimensionsMm.bodyBounds, undefined);
  assert.equal(merged.validation.status, "fail");
  assert.match(merged.validation.warnings.join(" "), /Audit mesh list differs from loaded GLB mesh list\./i);
});

test("loaded inspection unions additional accessory and fallback names into the merged contract", () => {
  const merged = mergeAuditContractWithLoadedInspection({
    auditContract: createTestBodyGeometryContract({
      mode: "hybrid-preview",
      source: {
        type: "approved-svg",
        hash: "sha256:source",
      },
      glb: {
        hash: "sha256:glb",
        sourceHash: "sha256:source",
        freshRelativeToSource: true,
      },
      meshes: {
        names: ["body_mesh", "lid_mesh"],
        bodyMeshNames: ["body_mesh"],
        accessoryMeshNames: ["lid_mesh"],
        fallbackMeshNames: [],
        fallbackDetected: false,
      },
    }),
    loadedInspectionContract: createTestBodyGeometryContract({
      mode: "hybrid-preview",
      source: {
        type: "approved-svg",
        hash: "sha256:source",
      },
      glb: {
        path: "/api/admin/models/generated/example.glb",
        hash: "sha256:glb",
        sourceHash: "sha256:source",
        freshRelativeToSource: true,
      },
      meshes: {
        names: ["body_mesh", "lid_mesh", "silver_ring_mesh", "debug_placeholder_mesh"],
        bodyMeshNames: ["body_mesh"],
        accessoryMeshNames: ["lid_mesh", "silver_ring_mesh"],
        fallbackMeshNames: ["debug_placeholder_mesh"],
        fallbackDetected: true,
      },
      dimensionsMm: {
        bodyBounds: { width: 88.98, height: 225, depth: 88.98 },
        bodyBoundsUnits: "mm",
      },
    }),
    currentMode: "hybrid-preview",
    currentSourceHash: "sha256:source",
    loadedGlbHash: "sha256:glb",
  });

  assert.deepEqual(merged.meshes.accessoryMeshNames, ["lid_mesh", "silver_ring_mesh"]);
  assert.deepEqual(merged.meshes.fallbackMeshNames, ["debug_placeholder_mesh"]);
  assert.match(
    merged.validation.warnings.join(" "),
    /Loaded GLB inspection found accessory meshes not present in audit metadata: silver_ring_mesh/i,
  );
  assert.match(
    merged.validation.warnings.join(" "),
    /Loaded GLB inspection found fallback meshes not present in audit metadata: debug_placeholder_mesh/i,
  );
});

test("audit mesh-list mismatch adds a validation warning", () => {
  const merged = mergeAuditContractWithLoadedInspection({
    auditContract: createTestBodyGeometryContract({
      mode: "hybrid-preview",
      meshes: {
        names: ["body_mesh", "lid_mesh"],
        bodyMeshNames: ["body_mesh"],
        accessoryMeshNames: ["lid_mesh"],
      },
    }),
    loadedInspectionContract: createTestBodyGeometryContract({
      mode: "hybrid-preview",
      meshes: {
        names: ["body_mesh", "lid_mesh", "silver_ring_mesh"],
        bodyMeshNames: ["body_mesh"],
        accessoryMeshNames: ["lid_mesh", "silver_ring_mesh"],
      },
    }),
    currentMode: "hybrid-preview",
  });

  assert.match(
    merged.validation.warnings.join(" "),
    /Audit mesh list differs from loaded GLB mesh list\./i,
  );
});

test("BODY CUTOUT QA merge fails when the audit marks fallback geometry as present", () => {
  const merged = mergeAuditContractWithLoadedInspection({
    auditContract: createTestBodyGeometryContract({
      mode: "body-cutout-qa",
      source: {
        type: "approved-svg",
        hash: "sha256:source",
      },
      glb: {
        hash: "sha256:glb",
        sourceHash: "sha256:source",
        freshRelativeToSource: true,
      },
      meshes: {
        names: ["body_mesh", "lid_mesh"],
        bodyMeshNames: ["body_mesh"],
        accessoryMeshNames: ["lid_mesh"],
        fallbackMeshNames: ["lid_mesh"],
        fallbackDetected: true,
      },
      validation: {
        status: "pass",
        errors: [],
        warnings: [],
      },
    }),
    loadedInspectionContract: createTestBodyGeometryContract({
      mode: "body-cutout-qa",
      source: {
        type: "approved-svg",
        hash: "sha256:source",
      },
      glb: {
        path: "/api/admin/models/generated/example.glb",
        hash: "sha256:glb",
        sourceHash: "sha256:source",
        freshRelativeToSource: true,
      },
      meshes: {
        names: ["body_mesh", "lid_mesh"],
        bodyMeshNames: ["body_mesh"],
        accessoryMeshNames: ["lid_mesh"],
        fallbackMeshNames: [],
        fallbackDetected: false,
      },
      dimensionsMm: {
        bodyBounds: { width: 88.98, height: 225, depth: 88.98 },
        bodyBoundsUnits: "mm",
        expectedBodyWidthMm: 88.98,
        expectedBodyHeightMm: 225,
      },
    }),
    currentMode: "body-cutout-qa",
    currentSourceHash: "sha256:source",
    loadedGlbHash: "sha256:glb",
  });

  assert.equal(merged.validation.status, "fail");
  assert.match(merged.validation.errors.join(" "), /Fallback geometry detected in body-only QA mode/i);
});

test("hybrid-preview merged contracts can preserve fallback truth without being labeled valid for BODY CUTOUT QA", () => {
  const merged = mergeAuditContractWithLoadedInspection({
    auditContract: createTestBodyGeometryContract({
      mode: "hybrid-preview",
      source: {
        type: "approved-svg",
        hash: "sha256:source",
      },
      glb: {
        hash: "sha256:glb",
        sourceHash: "sha256:source",
        freshRelativeToSource: true,
      },
      meshes: {
        names: ["body_mesh", "lid_mesh"],
        bodyMeshNames: ["body_mesh"],
        accessoryMeshNames: ["lid_mesh"],
        fallbackMeshNames: ["lid_mesh"],
        fallbackDetected: true,
      },
      validation: {
        status: "pass",
        errors: [],
        warnings: [],
      },
    }),
    loadedInspectionContract: createTestBodyGeometryContract({
      mode: "hybrid-preview",
      source: {
        type: "approved-svg",
        hash: "sha256:source",
      },
      glb: {
        path: "/api/admin/models/generated/example.glb",
        hash: "sha256:glb",
        sourceHash: "sha256:source",
        freshRelativeToSource: true,
      },
      meshes: {
        names: ["body_mesh", "lid_mesh"],
        bodyMeshNames: ["body_mesh"],
        accessoryMeshNames: ["lid_mesh"],
      },
      dimensionsMm: {
        bodyBounds: { width: 88.98, height: 225, depth: 88.98 },
        bodyBoundsUnits: "mm",
        expectedBodyWidthMm: 88.98,
        expectedBodyHeightMm: 225,
      },
    }),
    currentMode: "hybrid-preview",
    currentSourceHash: "sha256:source",
    loadedGlbHash: "sha256:glb",
  });
  const badge = buildBodyGeometryStatusBadgeState({
    mode: "hybrid-preview",
    contract: merged,
  });

  assert.notEqual(merged.validation.status, "fail");
  assert.equal(merged.meshes.fallbackDetected, true);
  assert.equal(badge.title, "HYBRID PREVIEW");
  assert.equal(badge.qaLabel, "Not valid for body contour QA");
  assert.equal(badge.validForBodyQa, false);
});

test("isBodyOnlyMode only treats BODY CUTOUT QA as the strict body-only render mode", () => {
  assert.equal(isBodyOnlyMode("body-cutout-qa"), true);
  assert.equal(isBodyOnlyMode("hybrid-preview"), false);
  assert.equal(isBodyOnlyMode("full-model"), false);
  assert.equal(isBodyOnlyMode("wrap-export"), false);
  assert.equal(isBodyOnlyMode("unknown"), false);
});

test("resolveGlbFreshRelativeToSource compares current source and GLB lineage hashes when both exist", () => {
  assert.equal(
    resolveGlbFreshRelativeToSource({
      currentSourceHash: "sha256:source-a",
      glbSourceHash: "sha256:source-a",
    }),
    true,
  );
  assert.equal(
    resolveGlbFreshRelativeToSource({
      currentSourceHash: "sha256:source-a",
      glbSourceHash: "sha256:source-b",
    }),
    false,
  );
  assert.equal(
    resolveGlbFreshRelativeToSource({
      currentSourceHash: "sha256:source-a",
      glbSourceHash: undefined,
    }),
    undefined,
  );
});

test("resolveLoadedGlbFreshRelativeToSource only falls back to seeded freshness when current source lineage is unavailable", () => {
  assert.equal(
    resolveLoadedGlbFreshRelativeToSource({
      currentSourceHash: "sha256:current",
      glbSourceHash: undefined,
      seededFreshRelativeToSource: true,
    }),
    undefined,
  );
  assert.equal(
    resolveLoadedGlbFreshRelativeToSource({
      currentSourceHash: undefined,
      glbSourceHash: undefined,
      seededFreshRelativeToSource: true,
    }),
    true,
  );
  assert.equal(
    resolveLoadedGlbFreshRelativeToSource({
      currentSourceHash: undefined,
      glbSourceHash: "sha256:source-a",
      seededFreshRelativeToSource: false,
    }),
    false,
  );
});

test("mergeAuditContractWithLoadedInspection marks reviewed GLBs stale when the accepted source hash changes after regeneration is required", () => {
  const merged = mergeAuditContractWithLoadedInspection({
    auditContract: createTestBodyGeometryContract({
      mode: "body-cutout-qa",
      source: {
        type: "approved-svg",
        hash: "sha256:source-before",
      },
      glb: {
        path: "/api/admin/models/generated/example.glb",
        hash: "sha256:glb-before",
        sourceHash: "sha256:source-before",
        freshRelativeToSource: true,
      },
      meshes: {
        names: ["body_mesh"],
        bodyMeshNames: ["body_mesh"],
      },
      dimensionsMm: {
        bodyBounds: { width: 86.4, height: 157.18, depth: 86.4 },
        bodyBoundsUnits: "mm",
        expectedBodyWidthMm: 86.4,
        expectedBodyHeightMm: 157.18,
      },
      validation: {
        status: "pass",
        errors: [],
        warnings: [],
      },
    }),
    loadedInspectionContract: createTestBodyGeometryContract({
      mode: "body-cutout-qa",
      source: {
        type: "approved-svg",
        hash: "sha256:source-after",
      },
      glb: {
        path: "/api/admin/models/generated/example.glb",
        hash: "sha256:glb-before",
        sourceHash: "sha256:source-before",
        freshRelativeToSource: true,
      },
      meshes: {
        names: ["body_mesh"],
        bodyMeshNames: ["body_mesh"],
      },
      dimensionsMm: {
        expectedBodyWidthMm: 86.4,
        expectedBodyHeightMm: 157.22,
      },
    }),
    currentMode: "body-cutout-qa",
    currentSourceHash: "sha256:source-after",
    loadedGlbHash: "sha256:glb-before",
    runtimeInspection: {
      status: "pending",
      glbUrl: "/api/admin/models/generated/example.glb",
    },
  });

  assert.equal(merged.source.hash, "sha256:source-after");
  assert.equal(merged.glb.sourceHash, "sha256:source-before");
  assert.equal(merged.glb.freshRelativeToSource, false);
  assert.equal(merged.validation.status, "fail");
  assert.match(merged.validation.errors.join(" "), /stale relative to the current source contour/i);
});

test("contracts with only a valid body mesh and matching dimensions pass cleanly", () => {
  const contract = updateContractValidation({
    ...createEmptyBodyGeometryContract(),
    mode: "body-cutout-qa",
    source: {
      type: "approved-svg",
      hash: "json:source",
      detectedBodyOnly: true,
    },
    glb: {
      path: "/api/admin/models/generated/body-only.glb",
      hash: "json:glb",
      freshRelativeToSource: true,
    },
    meshes: {
      names: ["body_mesh"],
      bodyMeshNames: [],
      accessoryMeshNames: [],
      fallbackMeshNames: [],
      fallbackDetected: false,
      unexpectedMeshes: [],
    },
    dimensionsMm: {
      bodyBounds: {
        width: 88.98,
        height: 225,
        depth: 88.98,
      },
      bodyBoundsUnits: "mm",
      expectedBodyWidthMm: 88.98,
      expectedBodyHeightMm: 225,
      wrapDiameterMm: 86.36,
      wrapWidthMm: 271.31,
      frontVisibleWidthMm: 88.98,
    },
    validation: {
      status: "unknown",
      errors: [],
      warnings: [],
    },
  });

  assert.equal(contract.validation.status, "pass");
  assert.equal(isContractPassing(contract), true);
});

test("BODY CUTOUT QA validation ignores reference-only appearance layers attached out of band", () => {
  const contractWithAppearance = {
    ...createEmptyBodyGeometryContract(),
    mode: "body-cutout-qa",
    source: {
      type: "approved-svg" as const,
      hash: "json:source",
      detectedBodyOnly: true,
    },
    glb: {
      path: "/api/admin/models/generated/body-only.glb",
      hash: "json:glb",
      sourceHash: "json:source",
      freshRelativeToSource: true,
    },
    meshes: {
      names: ["body_mesh"],
      bodyMeshNames: [],
      accessoryMeshNames: [],
      fallbackMeshNames: [],
      fallbackDetected: false,
      unexpectedMeshes: [],
    },
    dimensionsMm: {
      bodyBounds: {
        width: 88.98,
        height: 225,
        depth: 88.98,
      },
      bodyBoundsUnits: "mm" as const,
      expectedBodyWidthMm: 88.98,
      expectedBodyHeightMm: 225,
      wrapDiameterMm: 86.36,
      wrapWidthMm: 271.31,
      frontVisibleWidthMm: 88.98,
    },
    validation: {
      status: "unknown" as const,
      errors: [],
      warnings: [],
    },
    appearanceReferenceLayers: [
      createFinishBandReference({
        id: "top-band",
        kind: "top-finish-band",
        yMm: 0,
        heightMm: 10,
      }),
    ],
  } as BodyGeometryContract & {
    appearanceReferenceLayers: ReturnType<typeof createFinishBandReference>[];
  };

  const contract = updateContractValidation(contractWithAppearance);

  assert.equal(contract.validation.status, "pass");
  assert.equal(isContractPassing(contract), true);
});

test("BODY CUTOUT QA validation ignores preview-only engraving overlay metadata attached out of band", () => {
  const mapping = {
    mode: "cylindrical-v1" as const,
    wrapDiameterMm: 86.36,
    wrapWidthMm: 271.31,
    printableTopMm: 15.54,
    printableBottomMm: 157.17,
    printableHeightMm: 141.63,
    expectedBodyWidthMm: 86.42,
    expectedBodyHeightMm: 141.63,
    bodyBounds: {
      width: 86.42,
      height: 141.63,
      depth: 86.42,
    },
    scaleSource: "mesh-bounds",
    sourceHash: "json:source",
    glbSourceHash: "json:source",
  };
  const overlayPreview = buildEngravingOverlayPreviewState({
    placements: [{
      id: "art-1",
      assetId: "asset-1",
      name: "Preview artwork",
      xMm: 22.5,
      yMm: 18.25,
      widthMm: 42,
      heightMm: 38.5,
      rotationDeg: 15,
      visible: true,
      mappingSignature: buildLaserBedSurfaceMappingSignature(mapping),
      assetSnapshot: {
        svgText: "<svg viewBox=\"0 0 100 100\"><rect width=\"100\" height=\"100\" fill=\"#000\"/></svg>",
        sourceSvgText: "<svg viewBox=\"0 0 100 100\"><rect width=\"100\" height=\"100\" fill=\"#000\"/></svg>",
        documentBounds: { x: 0, y: 0, width: 100, height: 100 },
        artworkBounds: { x: 0, y: 0, width: 100, height: 100 },
      },
    }],
    mapping,
    savedSignature: buildLaserBedSurfaceMappingSignature(mapping),
    previewMode: "wrap-export",
  });
  const contractWithOverlay = {
    ...createEmptyBodyGeometryContract(),
    mode: "body-cutout-qa",
    source: {
      type: "approved-svg" as const,
      hash: "json:source",
      detectedBodyOnly: true,
    },
    glb: {
      path: "/api/admin/models/generated/body-only.glb",
      hash: "json:glb",
      sourceHash: "json:source",
      freshRelativeToSource: true,
    },
    meshes: {
      names: ["body_mesh"],
      bodyMeshNames: [],
      accessoryMeshNames: [],
      fallbackMeshNames: [],
      fallbackDetected: false,
      unexpectedMeshes: [],
    },
    dimensionsMm: {
      bodyBounds: {
        width: 86.42,
        height: 141.63,
        depth: 86.42,
      },
      bodyBoundsUnits: "mm" as const,
      expectedBodyWidthMm: 86.42,
      expectedBodyHeightMm: 141.63,
      wrapDiameterMm: 86.36,
      wrapWidthMm: 271.31,
      frontVisibleWidthMm: 86.42,
    },
    validation: {
      status: "unknown" as const,
      errors: [],
      warnings: [],
    },
    engravingOverlayPreview: overlayPreview,
  } as BodyGeometryContract & {
    engravingOverlayPreview: ReturnType<typeof buildEngravingOverlayPreviewState>;
  };

  const contract = updateContractValidation(contractWithOverlay);

  assert.equal(contract.validation.status, "pass");
  assert.equal(isContractPassing(contract), true);
});

test("BODY CUTOUT QA validation ignores BODY REFERENCE v2 semantic draft metadata attached out of band", () => {
  const contractWithBodyReferenceV2 = {
    ...createEmptyBodyGeometryContract(),
    mode: "body-cutout-qa",
    source: {
      type: "approved-svg" as const,
      hash: "json:source",
      detectedBodyOnly: true,
    },
    glb: {
      path: "/api/admin/models/generated/body-only.glb",
      hash: "json:glb",
      sourceHash: "json:source",
      freshRelativeToSource: true,
    },
    meshes: {
      names: ["body_mesh"],
      bodyMeshNames: [],
      accessoryMeshNames: [],
      fallbackMeshNames: [],
      fallbackDetected: false,
      unexpectedMeshes: [],
    },
    dimensionsMm: {
      bodyBounds: {
        width: 86.42,
        height: 141.63,
        depth: 86.42,
      },
      bodyBoundsUnits: "mm" as const,
      expectedBodyWidthMm: 86.42,
      expectedBodyHeightMm: 141.63,
      wrapDiameterMm: 86.36,
      wrapWidthMm: 271.31,
      frontVisibleWidthMm: 86.42,
    },
    validation: {
      status: "unknown" as const,
      errors: [],
      warnings: [],
    },
    bodyReferenceV2Draft: {
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
            { xPx: 80, yPx: 20 },
            { xPx: 75, yPx: 120 },
            { xPx: 82, yPx: 205 },
          ],
        }),
        createBodyReferenceV2Layer({
          id: "handle",
          kind: "handle-reference",
          points: [
            { xPx: 120, yPx: 50 },
            { xPx: 138, yPx: 50 },
            { xPx: 138, yPx: 150 },
            { xPx: 120, yPx: 150 },
          ],
        }),
      ],
      blockedRegions: [],
      scaleCalibration: {
        scaleSource: "lookup-diameter" as const,
        lookupDiameterMm: 86.36,
        resolvedDiameterMm: 86.36,
        wrapDiameterMm: 86.36,
        wrapWidthMm: 271.31,
      },
    },
  } as BodyGeometryContract & {
    bodyReferenceV2Draft: {
      sourceImageUrl: string;
      centerline: ReturnType<typeof createCenterlineAxis>;
      layers: ReturnType<typeof createBodyReferenceV2Layer>[];
      blockedRegions: [];
      scaleCalibration: {
        scaleSource: "lookup-diameter";
        lookupDiameterMm: number;
        resolvedDiameterMm: number;
        wrapDiameterMm: number;
        wrapWidthMm: number;
      };
    };
  };

  const contract = updateContractValidation(contractWithBodyReferenceV2);

  assert.equal(contract.validation.status, "pass");
  assert.equal(isContractPassing(contract), true);
});

test("BODY CUTOUT QA validation ignores BODY REFERENCE v2 scale and mirror preview metadata attached out of band", () => {
  const scaleMirrorPreview = buildMirroredBodyPreview({
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
          { xPx: 80, yPx: 20 },
          { xPx: 76, yPx: 120 },
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
    ],
    blockedRegions: [],
    scaleCalibration: {
      scaleSource: "lookup-diameter",
      lookupDiameterMm: 86.36,
      resolvedDiameterMm: 86.36,
      wrapDiameterMm: 86.36,
      wrapWidthMm: 271.31,
    },
  });
  const contractWithScaleMirrorPreview = {
    ...createEmptyBodyGeometryContract(),
    mode: "body-cutout-qa",
    source: {
      type: "approved-svg" as const,
      hash: "json:source",
      detectedBodyOnly: true,
    },
    glb: {
      path: "/api/admin/models/generated/body-only.glb",
      hash: "json:glb",
      sourceHash: "json:source",
      freshRelativeToSource: true,
    },
    meshes: {
      names: ["body_mesh"],
      bodyMeshNames: [],
      accessoryMeshNames: [],
      fallbackMeshNames: [],
      fallbackDetected: false,
      unexpectedMeshes: [],
    },
    dimensionsMm: {
      bodyBounds: {
        width: 86.42,
        height: 141.63,
        depth: 86.42,
      },
      bodyBoundsUnits: "mm" as const,
      expectedBodyWidthMm: 86.42,
      expectedBodyHeightMm: 141.63,
      wrapDiameterMm: 86.36,
      wrapWidthMm: 271.31,
      frontVisibleWidthMm: 86.42,
    },
    validation: {
      status: "unknown" as const,
      errors: [],
      warnings: [],
    },
    bodyReferenceV2ScaleMirrorPreview: scaleMirrorPreview,
  } as BodyGeometryContract & {
    bodyReferenceV2ScaleMirrorPreview: ReturnType<typeof buildMirroredBodyPreview>;
  };

  const contract = updateContractValidation(contractWithScaleMirrorPreview);

  assert.equal(contract.validation.status, "pass");
  assert.equal(isContractPassing(contract), true);
});
