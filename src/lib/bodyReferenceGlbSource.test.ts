import assert from "node:assert/strict";
import test from "node:test";

import type {
  CanonicalBodyProfile,
  CanonicalDimensionCalibration,
  EditableBodyOutline,
} from "../types/productTemplate.ts";
import {
  buildBodyReferenceGlbSourceSignature,
  resolveBodyReferenceGlbReviewState,
  resolveReviewedBodyReferenceGlbInput,
  shouldRequestReviewedBodyReferenceGlb,
} from "./bodyReferenceGlbSource.ts";

const baseOutline: EditableBodyOutline = {
  closed: true,
  version: 1,
  points: [
    { id: "top", x: 43.18, y: 31.09, role: "topOuter", pointType: "corner", inHandle: null, outHandle: null },
    { id: "mid", x: 43.18, y: 100, role: "body", pointType: "smooth", inHandle: null, outHandle: null },
    { id: "bottom", x: 38.1, y: 172.72, role: "base", pointType: "corner", inHandle: null, outHandle: null },
  ],
  directContour: [
    { x: 43.18, y: 31.09 },
    { x: 43.18, y: 100 },
    { x: 38.1, y: 172.72 },
  ],
  sourceContour: [
    { x: 120, y: 210 },
    { x: 122, y: 400 },
    { x: 150, y: 820 },
  ],
  sourceContourBounds: {
    minX: 120,
    minY: 210,
    maxX: 150,
    maxY: 820,
    width: 30,
    height: 610,
  },
  sourceContourMode: "body-only",
  sourceContourViewport: {
    minX: 0,
    minY: 0,
    width: 500,
    height: 900,
  },
};

const baseProfile: CanonicalBodyProfile = {
  symmetrySource: "left",
  mirroredFromSymmetrySource: false,
  axis: {
    xTop: 87,
    yTop: 95.4,
    xBottom: 87,
    yBottom: 462.2,
  },
  samples: [
    { sNorm: 0, yMm: 31.09, yPx: 95.4, xLeft: 14.5, radiusPx: 72.5, radiusMm: 43.18 },
    { sNorm: 0.5, yMm: 101.9, yPx: 278.8, xLeft: 21, radiusPx: 66, radiusMm: 43.18 },
    { sNorm: 1, yMm: 172.72, yPx: 462.2, xLeft: 43.1, radiusPx: 43.9, radiusMm: 38.1 },
  ],
  svgPath: "M 43.18 31.09 L 43.18 101.9 L 38.1 172.72 Z",
};

const baseCalibration: CanonicalDimensionCalibration = {
  units: "mm",
  totalHeightMm: 172.72,
  bodyHeightMm: 141.63,
  lidBodyLineMm: 31.09,
  bodyBottomMm: 172.72,
  wrapDiameterMm: 86.36,
  baseDiameterMm: 75,
  wrapWidthMm: 271.31,
  frontVisibleWidthMm: 88,
  frontAxisPx: {
    xTop: 87,
    yTop: 95.4,
    xBottom: 87,
    yBottom: 462.2,
  },
  photoToFrontTransform: {
    type: "affine",
    matrix: [0.669, 0, -58.19, 0, 0.386, -5.74],
  },
  svgFrontViewBoxMm: {
    x: -44,
    y: 0,
    width: 88,
    height: 172.72,
  },
  wrapMappingMm: {
    frontMeridianMm: 135.66,
    backMeridianMm: 0,
    leftQuarterMm: 67.83,
    rightQuarterMm: 203.49,
  },
  glbScale: {
    unitsPerMm: 1,
  },
};

function signature(overrides: Partial<Parameters<typeof buildBodyReferenceGlbSourceSignature>[0]> = {}) {
  return buildBodyReferenceGlbSourceSignature({
    renderMode: "body-cutout-qa",
    matchedProfileId: null,
    canonicalBodyProfile: baseProfile,
    canonicalDimensionCalibration: baseCalibration,
    referencePaths: {
      bodyOutline: baseOutline,
      lidProfile: null,
      silverProfile: null,
    },
    bodyColorHex: "#184f90",
    lidColorHex: "#d8ef80",
    rimColorHex: "#679ef3",
    lidSeamFromOverallMm: 43.5,
    silverBandBottomFromOverallMm: 50.7,
    topOuterDiameterMm: 88,
    ...overrides,
  });
}

test("BODY REFERENCE GLB source signature changes when approved contour geometry changes", () => {
  const changedOutline: EditableBodyOutline = {
    ...baseOutline,
    directContour: [
      ...(baseOutline.directContour ?? []),
      { x: 36.5, y: 172.72 },
    ],
  };

  assert.notEqual(
    signature(),
    signature({
      referencePaths: {
        bodyOutline: changedOutline,
        lidProfile: null,
        silverProfile: null,
      },
    }),
  );
});

test("BODY REFERENCE GLB source signature resolves stale cached manual contours from points", () => {
  const manualOutlineWithStaleContour: EditableBodyOutline = {
    closed: true,
    version: 1,
    sourceContourMode: "body-only",
    points: [
      { id: "top", x: 54, y: 31.09, role: "topOuter", pointType: "corner", inHandle: null, outHandle: null },
      { id: "mid", x: 54, y: 100, role: "body", pointType: "smooth", inHandle: null, outHandle: null },
      { id: "bottom", x: 38.1, y: 172.72, role: "base", pointType: "corner", inHandle: null, outHandle: null },
    ],
    directContour: [
      { x: 43.18, y: 31.09 },
      { x: 43.18, y: 100 },
      { x: 38.1, y: 172.72 },
      { x: -38.1, y: 172.72 },
      { x: -43.18, y: 100 },
      { x: -43.18, y: 31.09 },
    ],
  };
  const rebuiltManualOutline: EditableBodyOutline = {
    ...manualOutlineWithStaleContour,
    directContour: [
      { x: 54, y: 31.09 },
      { x: 54, y: 100 },
      { x: 38.1, y: 172.72 },
      { x: -38.1, y: 172.72 },
      { x: -54, y: 100 },
      { x: -54, y: 31.09 },
    ],
  };

  assert.equal(
    signature({
      referencePaths: {
        bodyOutline: manualOutlineWithStaleContour,
        lidProfile: null,
        silverProfile: null,
      },
    }),
    signature({
      referencePaths: {
        bodyOutline: rebuiltManualOutline,
        lidProfile: null,
        silverProfile: null,
      },
    }),
  );
});

test("BODY REFERENCE GLB source signature changes when render mode changes", () => {
  assert.notEqual(
    signature(),
    signature({
      renderMode: "hybrid-preview",
    }),
  );
});

test("BODY REFERENCE GLB source signature ignores source image and view bookkeeping", () => {
  assert.equal(
    signature(),
    signature({
      sourceImage: "data:image/png;base64,source-b",
      sourceViewSide: "back",
    } as Partial<Parameters<typeof buildBodyReferenceGlbSourceSignature>[0]>),
  );
});

test("BODY REFERENCE GLB source signature ignores source contour metadata when approved geometry is unchanged", () => {
  const changedOutline: EditableBodyOutline = {
    ...baseOutline,
    sourceContour: [
      ...(baseOutline.sourceContour ?? []),
      { x: 160, y: 840 },
    ],
    sourceContourBounds: {
      minX: 110,
      minY: 205,
      maxX: 160,
      maxY: 840,
      width: 50,
      height: 635,
    },
    sourceContourViewport: {
      minX: -10,
      minY: 0,
      width: 540,
      height: 910,
    },
  };

  assert.equal(
    signature(),
    signature({
      referencePaths: {
        bodyOutline: changedOutline,
        lidProfile: null,
        silverProfile: null,
      },
    }),
  );
});

test("BODY REFERENCE GLB source signature ignores fallback lid and silver outlines unless explicitly provided", () => {
  const fallbackLidProfile: EditableBodyOutline = {
    ...baseOutline,
    points: baseOutline.points.map((point, index) => ({
      ...point,
      id: `lid-${index}`,
      x: point.x - 2,
      y: point.y - 12,
    })),
  };

  assert.equal(
    signature({
      referencePaths: {
        bodyOutline: baseOutline,
        lidProfile: null,
        silverProfile: null,
      },
    }),
    signature({
      referencePaths: {
        bodyOutline: baseOutline,
        lidProfile: fallbackLidProfile,
        silverProfile: fallbackLidProfile,
      },
    }),
  );

  assert.notEqual(
    signature(),
    signature({
      lidProfile: fallbackLidProfile,
    }),
  );
});

test("BODY REFERENCE GLB source signature ignores unrelated caller state", () => {
  assert.equal(
    signature(),
    signature({ unrelatedUiState: "do-not-hash" } as Partial<Parameters<typeof buildBodyReferenceGlbSourceSignature>[0]>),
  );
});

test("reviewed BODY REFERENCE GLB input requires approved outline and canonical calibration", () => {
  assert.equal(
    resolveReviewedBodyReferenceGlbInput({
      matchedProfileId: "stanley-iceflow-20oz",
      bodyOutline: null,
      canonicalBodyProfile: baseProfile,
      canonicalDimensionCalibration: baseCalibration,
    }),
    null,
  );

  assert.equal(
    resolveReviewedBodyReferenceGlbInput({
      matchedProfileId: "stanley-iceflow-20oz",
      bodyOutline: baseOutline,
      canonicalBodyProfile: null,
      canonicalDimensionCalibration: baseCalibration,
    }),
    null,
  );
});

test("reviewed BODY REFERENCE GLB input preserves committed outline authority and source mode", () => {
  const resolved = resolveReviewedBodyReferenceGlbInput({
    matchedProfileId: "stanley-iceflow-20oz",
    bodyOutline: {
      ...baseOutline,
      sourceContourMode: undefined,
    },
    bodyOutlineSourceMode: "body-only",
    canonicalBodyProfile: baseProfile,
    canonicalDimensionCalibration: baseCalibration,
    bodyColorHex: "#184f90",
  });

  assert.ok(resolved);
  assert.notEqual(resolved?.bodyOutline, null);
  assert.equal(resolved?.bodyOutlineSourceMode, "body-only");
  assert.equal(resolved?.bodyOutline?.sourceContourMode, "body-only");
  assert.equal(resolved?.canonicalDimensionCalibration.wrapDiameterMm, baseCalibration.wrapDiameterMm);
});

test("BODY REFERENCE GLB review state treats stale and pending drafts as not generated", () => {
  const current = signature();

  assert.deepEqual(
    resolveBodyReferenceGlbReviewState({
      canGenerate: true,
      glbPath: "/api/admin/models/generated/example.glb",
      currentSourceSignature: current,
      generatedSourceSignature: current,
    }),
    {
      status: "current",
      alreadyGenerated: true,
      canRequestGeneration: true,
      hasGeneratedArtifact: true,
    },
  );

  assert.equal(
    resolveBodyReferenceGlbReviewState({
      canGenerate: true,
      glbPath: "/api/admin/models/generated/example.glb",
      currentSourceSignature: current,
      generatedSourceSignature: "json:old",
    }).status,
    "stale",
  );

  assert.equal(
    resolveBodyReferenceGlbReviewState({
      canGenerate: true,
      glbPath: "/api/admin/models/generated/example.glb",
      currentSourceSignature: current,
      generatedSourceSignature: current,
      hasPendingSourceDraft: true,
    }).status,
    "draft-pending",
  );
});

test("BODY REFERENCE GLB review state keeps current geometry current when the GLB file is missing", () => {
  const current = signature();

  assert.deepEqual(
    resolveBodyReferenceGlbReviewState({
      canGenerate: true,
      glbPath: "",
      hasGeneratedArtifact: false,
      currentSourceSignature: current,
      generatedSourceSignature: current,
    }),
    {
      status: "current",
      alreadyGenerated: true,
      canRequestGeneration: true,
      hasGeneratedArtifact: false,
    },
  );
});

test("forced BODY REFERENCE GLB generation bypasses the current-model early return", () => {
  assert.equal(
    shouldRequestReviewedBodyReferenceGlb({
      canGenerate: true,
      isCurrent: true,
    }),
    false,
  );
  assert.equal(
    shouldRequestReviewedBodyReferenceGlb({
      canGenerate: true,
      isCurrent: true,
      hasGeneratedArtifact: false,
    }),
    true,
  );
  assert.equal(
    shouldRequestReviewedBodyReferenceGlb({
      canGenerate: true,
      isCurrent: true,
      force: true,
    }),
    true,
  );
  assert.equal(
    shouldRequestReviewedBodyReferenceGlb({
      canGenerate: true,
      isCurrent: false,
      hasPendingSourceDraft: true,
      force: true,
    }),
    false,
  );
});
