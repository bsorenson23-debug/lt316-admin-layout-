import type {
  CanonicalBodyProfile,
  CanonicalDimensionCalibration,
  EditableBodyOutline,
  ReferencePaths,
} from "../types/productTemplate.ts";
import { fingerprintJson } from "./templatePipelineDiagnostics.ts";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? round2(value) : null;
}

function normalizePoint(point: { x: number; y: number }) {
  return {
    x: round2(point.x),
    y: round2(point.y),
  };
}

function normalizeOutline(outline: EditableBodyOutline | null | undefined) {
  if (!outline) return null;
  return {
    closed: outline.closed,
    version: outline.version ?? 1,
    points: outline.points.map((point) => ({
      x: round2(point.x),
      y: round2(point.y),
      role: point.role ?? null,
      pointType: point.pointType ?? null,
      inHandle: point.inHandle ? normalizePoint(point.inHandle) : null,
      outHandle: point.outHandle ? normalizePoint(point.outHandle) : null,
    })),
    directContour: outline.directContour?.map(normalizePoint) ?? null,
    sourceContourMode: outline.sourceContourMode ?? null,
  };
}

function normalizeBodyProfile(profile: CanonicalBodyProfile) {
  return {
    symmetrySource: profile.symmetrySource,
    mirroredFromSymmetrySource: profile.mirroredFromSymmetrySource,
    mirroredRightFromLeft: profile.mirroredRightFromLeft ?? false,
    axis: {
      xTop: round2(profile.axis.xTop),
      yTop: round2(profile.axis.yTop),
      xBottom: round2(profile.axis.xBottom),
      yBottom: round2(profile.axis.yBottom),
    },
    samples: profile.samples.map((sample) => ({
      sNorm: round2(sample.sNorm),
      yMm: round2(sample.yMm),
      yPx: round2(sample.yPx),
      xLeft: round2(sample.xLeft),
      radiusPx: round2(sample.radiusPx),
      radiusMm: round2(sample.radiusMm),
    })),
    svgPath: profile.svgPath,
  };
}

function normalizeDimensionCalibration(calibration: CanonicalDimensionCalibration) {
  return {
    units: calibration.units,
    totalHeightMm: round2(calibration.totalHeightMm),
    bodyHeightMm: round2(calibration.bodyHeightMm),
    lidBodyLineMm: round2(calibration.lidBodyLineMm),
    bodyBottomMm: round2(calibration.bodyBottomMm),
    wrapDiameterMm: round2(calibration.wrapDiameterMm),
    baseDiameterMm: round2(calibration.baseDiameterMm),
    wrapWidthMm: round2(calibration.wrapWidthMm),
    frontVisibleWidthMm: round2(calibration.frontVisibleWidthMm),
    frontAxisPx: {
      xTop: round2(calibration.frontAxisPx.xTop),
      yTop: round2(calibration.frontAxisPx.yTop),
      xBottom: round2(calibration.frontAxisPx.xBottom),
      yBottom: round2(calibration.frontAxisPx.yBottom),
    },
    photoToFrontTransform: {
      type: calibration.photoToFrontTransform.type,
      matrix: calibration.photoToFrontTransform.matrix.map(round2),
    },
    svgFrontViewBoxMm: {
      x: round2(calibration.svgFrontViewBoxMm.x),
      y: round2(calibration.svgFrontViewBoxMm.y),
      width: round2(calibration.svgFrontViewBoxMm.width),
      height: round2(calibration.svgFrontViewBoxMm.height),
    },
    wrapMappingMm: {
      frontMeridianMm: round2(calibration.wrapMappingMm.frontMeridianMm),
      backMeridianMm: round2(calibration.wrapMappingMm.backMeridianMm),
      leftQuarterMm: round2(calibration.wrapMappingMm.leftQuarterMm),
      rightQuarterMm: round2(calibration.wrapMappingMm.rightQuarterMm),
      handleMeridianMm: finiteOrNull(calibration.wrapMappingMm.handleMeridianMm),
      handleKeepOutArcDeg: finiteOrNull(calibration.wrapMappingMm.handleKeepOutArcDeg),
      handleKeepOutWidthMm: finiteOrNull(calibration.wrapMappingMm.handleKeepOutWidthMm),
      handleKeepOutStartMm: finiteOrNull(calibration.wrapMappingMm.handleKeepOutStartMm),
      handleKeepOutEndMm: finiteOrNull(calibration.wrapMappingMm.handleKeepOutEndMm),
    },
    axialSurfaceBands: calibration.axialSurfaceBands ?? null,
    printableSurfaceContract: calibration.printableSurfaceContract ?? null,
    glbScale: {
      unitsPerMm: round2(calibration.glbScale.unitsPerMm),
    },
  };
}

export type BodyReferenceGlbSourceSignatureInput = {
  renderMode?: BodyReferenceGlbRenderMode | null;
  matchedProfileId?: string | null;
  canonicalBodyProfile: CanonicalBodyProfile;
  canonicalDimensionCalibration: CanonicalDimensionCalibration;
  referencePaths?: ReferencePaths | null;
  bodyOutline?: EditableBodyOutline | null;
  lidProfile?: EditableBodyOutline | null;
  silverProfile?: EditableBodyOutline | null;
  bodyColorHex?: string | null;
  lidColorHex?: string | null;
  rimColorHex?: string | null;
  lidSeamFromOverallMm?: number | null;
  silverBandBottomFromOverallMm?: number | null;
  topOuterDiameterMm?: number | null;
};

export type BodyReferenceGlbRenderMode = "body-cutout-qa" | "hybrid-preview";

export type ReviewedBodyReferenceGlbInput = BodyReferenceGlbSourceSignatureInput & {
  renderMode?: BodyReferenceGlbRenderMode | null;
  bodyOutlineSourceMode?: EditableBodyOutline["sourceContourMode"] | null;
};

function applyBodyOutlineSourceMode(
  outline: EditableBodyOutline | null | undefined,
  sourceMode: EditableBodyOutline["sourceContourMode"] | null | undefined,
): EditableBodyOutline | null {
  if (!outline) return null;
  if (!sourceMode || outline.sourceContourMode === sourceMode) {
    return outline;
  }
  return {
    ...outline,
    sourceContourMode: sourceMode,
  };
}

export function resolveReviewedBodyReferenceGlbInput(args: {
  renderMode?: BodyReferenceGlbRenderMode | null;
  matchedProfileId?: string | null;
  bodyOutline?: EditableBodyOutline | null;
  bodyOutlineSourceMode?: EditableBodyOutline["sourceContourMode"] | null;
  canonicalBodyProfile?: CanonicalBodyProfile | null;
  canonicalDimensionCalibration?: CanonicalDimensionCalibration | null;
  lidProfile?: EditableBodyOutline | null;
  silverProfile?: EditableBodyOutline | null;
  bodyColorHex?: string | null;
  lidColorHex?: string | null;
  rimColorHex?: string | null;
  lidSeamFromOverallMm?: number | null;
  silverBandBottomFromOverallMm?: number | null;
  topOuterDiameterMm?: number | null;
}): ReviewedBodyReferenceGlbInput | null {
  if (!args.bodyOutline || !args.canonicalBodyProfile || !args.canonicalDimensionCalibration) {
    return null;
  }

  const bodyOutline = applyBodyOutlineSourceMode(
    args.bodyOutline,
    args.bodyOutlineSourceMode ?? args.bodyOutline.sourceContourMode ?? null,
  );
  if (!bodyOutline) {
    return null;
  }
  const renderMode =
    args.renderMode
    ?? (bodyOutline.sourceContourMode === "body-only" ? "body-cutout-qa" : "hybrid-preview");

  return {
    renderMode,
    matchedProfileId: args.matchedProfileId ?? null,
    bodyOutlineSourceMode: bodyOutline.sourceContourMode ?? null,
    bodyOutline,
    canonicalBodyProfile: args.canonicalBodyProfile,
    canonicalDimensionCalibration: args.canonicalDimensionCalibration,
    lidProfile: args.lidProfile ?? null,
    silverProfile: args.silverProfile ?? null,
    bodyColorHex: args.bodyColorHex ?? null,
    lidColorHex: args.lidColorHex ?? null,
    rimColorHex: args.rimColorHex ?? null,
    lidSeamFromOverallMm: args.lidSeamFromOverallMm ?? null,
    silverBandBottomFromOverallMm: args.silverBandBottomFromOverallMm ?? null,
    topOuterDiameterMm: args.topOuterDiameterMm ?? null,
  };
}

export function buildBodyReferenceGlbSourcePayload(input: BodyReferenceGlbSourceSignatureInput) {
  const bodyOutline = input.bodyOutline ?? input.referencePaths?.bodyOutline ?? null;
  const lidProfile = input.lidProfile ?? null;
  const silverProfile = input.silverProfile ?? null;

  return {
    version: 4,
    renderMode: input.renderMode ?? "hybrid-preview",
    matchedProfileId: input.matchedProfileId ?? null,
    bodyOutline: normalizeOutline(bodyOutline),
    lidProfile: normalizeOutline(lidProfile),
    silverProfile: normalizeOutline(silverProfile),
    canonicalBodyProfile: normalizeBodyProfile(input.canonicalBodyProfile),
    canonicalDimensionCalibration: normalizeDimensionCalibration(input.canonicalDimensionCalibration),
    bodyColorHex: input.bodyColorHex ?? null,
    lidColorHex: input.lidColorHex ?? null,
    rimColorHex: input.rimColorHex ?? null,
    lidSeamFromOverallMm: finiteOrNull(input.lidSeamFromOverallMm),
    silverBandBottomFromOverallMm: finiteOrNull(input.silverBandBottomFromOverallMm),
    topOuterDiameterMm: finiteOrNull(input.topOuterDiameterMm),
  };
}

export function buildBodyReferenceGlbSourceSignature(
  input: BodyReferenceGlbSourceSignatureInput,
): string {
  return fingerprintJson(buildBodyReferenceGlbSourcePayload(input));
}

export type BodyReferenceGlbReviewState = {
  status: "unavailable" | "draft-pending" | "current" | "stale";
  alreadyGenerated: boolean;
  canRequestGeneration: boolean;
  hasGeneratedArtifact: boolean;
};

export function resolveBodyReferenceGlbReviewState(args: {
  canGenerate: boolean;
  glbPath?: string | null;
  hasGeneratedArtifact?: boolean;
  currentSourceSignature?: string | null;
  generatedSourceSignature?: string | null;
  hasPendingSourceDraft?: boolean;
}): BodyReferenceGlbReviewState {
  const hasGeneratedArtifact =
    typeof args.hasGeneratedArtifact === "boolean"
      ? args.hasGeneratedArtifact
      : Boolean(args.glbPath?.trim());
  if (!args.canGenerate) {
    return {
      status: "unavailable",
      alreadyGenerated: false,
      canRequestGeneration: false,
      hasGeneratedArtifact,
    };
  }
  if (args.hasPendingSourceDraft) {
    return {
      status: "draft-pending",
      alreadyGenerated: false,
      canRequestGeneration: false,
      hasGeneratedArtifact,
    };
  }
  const hasCurrentGeometry =
    Boolean(args.currentSourceSignature) &&
    args.currentSourceSignature === args.generatedSourceSignature;

  return {
    status: hasCurrentGeometry ? "current" : "stale",
    alreadyGenerated: hasCurrentGeometry,
    canRequestGeneration: true,
    hasGeneratedArtifact,
  };
}

export function shouldRequestReviewedBodyReferenceGlb(args: {
  canGenerate: boolean;
  isCurrent: boolean;
  hasGeneratedArtifact?: boolean;
  force?: boolean;
  hasPendingSourceDraft?: boolean;
}): boolean {
  if (!args.canGenerate || args.hasPendingSourceDraft) return false;
  const artifactMissing = args.hasGeneratedArtifact === false;
  return Boolean(args.force) || !args.isCurrent || artifactMissing;
}
