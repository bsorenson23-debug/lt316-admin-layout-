import {
  buildBodyReferenceGlbSourcePayload,
  type BodyReferenceGlbRenderMode,
} from "./bodyReferenceGlbSource.ts";
import type { PreviewModelMode } from "./tumblerPreviewModelState.ts";
import type {
  CanonicalBodyProfile,
  CanonicalDimensionCalibration,
  EditableBodyOutline,
} from "../types/productTemplate.ts";
import type { BodyReferenceSvgQualityReport } from "./bodyReferenceSvgQuality.ts";
import { resolveEditableBodyOutlineDirectContour } from "./editableBodyOutline.ts";

export const BODY_GEOMETRY_CONTRACT_VERSION = "2026-04-20-v1";

export type BodyGeometryContractMode =
  | PreviewModelMode
  | BodyReferenceGlbRenderMode
  | "unknown";

export type BodyGeometrySourceType =
  | "approved-svg"
  | "uploaded-svg"
  | "generated"
  | "fallback"
  | "unknown";

export type BodyGeometryValidationStatus = "pass" | "warn" | "fail" | "unknown";
export type BodyGeometryScaleSource =
  | "svg-viewbox"
  | "physical-wrap"
  | "mesh-bounds"
  | "unknown";
export type BodyGeometryRuntimeInspectionStatus = "idle" | "pending" | "complete" | "failed";
export type BodyGeometryRuntimeInspectionValueSource =
  | "runtime-inspection"
  | "audit-provisional"
  | "unavailable";

export interface BodyGeometryBoundsMm {
  width: number;
  height: number;
  depth: number;
}

export interface BodyGeometryRuntimeInspection {
  status: BodyGeometryRuntimeInspectionStatus;
  source: "three-loaded-scene";
  glbUrl?: string;
  inspectedAt?: string;
  error?: string;
  auditArtifactPresent?: boolean;
  auditArtifactOptionalMissing?: boolean;
  auditArtifactRequiredMissing?: boolean;
  auditArtifactUsedAsProvisionalTruth?: boolean;
  loadedMeshNamesSource?: BodyGeometryRuntimeInspectionValueSource;
  bodyBoundsSource?: BodyGeometryRuntimeInspectionValueSource;
}

export interface BodyGeometryContract {
  contractVersion: string;
  mode: BodyGeometryContractMode;
  source: {
    type: BodyGeometrySourceType;
    filename?: string;
    hash?: string;
    widthPx?: number;
    heightPx?: number;
    viewBox?: string;
    detectedBodyOnly?: boolean;
  };
  glb: {
    path?: string;
    hash?: string;
    sourceHash?: string;
    generatedAt?: string;
    freshRelativeToSource?: boolean;
  };
  meshes: {
    names: string[];
    visibleMeshNames?: string[];
    materialNames?: string[];
    bodyMeshNames: string[];
    accessoryMeshNames: string[];
    fallbackMeshNames: string[];
    fallbackDetected: boolean;
    unexpectedMeshes: string[];
    totalVertexCount?: number;
    totalTriangleCount?: number;
  };
  dimensionsMm: {
    bodyBounds?: BodyGeometryBoundsMm;
    bodyBoundsUnits?: "mm" | "scene-units";
    wrapDiameterMm?: number;
    wrapWidthMm?: number;
    frontVisibleWidthMm?: number;
    expectedBodyWidthMm?: number;
    expectedBodyHeightMm?: number;
    printableTopMm?: number;
    printableBottomMm?: number;
    scaleSource?: BodyGeometryScaleSource;
  };
  validation: {
    status: BodyGeometryValidationStatus;
    errors: string[];
    warnings: string[];
  };
  svgQuality?: BodyReferenceSvgQualityReport;
  runtimeInspection?: BodyGeometryRuntimeInspection;
}

export interface BodyGeometryContractSeed {
  mode?: BodyGeometryContractMode;
  source?: Partial<BodyGeometryContract["source"]>;
  glb?: Partial<BodyGeometryContract["glb"]>;
  meshes?: Partial<BodyGeometryContract["meshes"]>;
  dimensionsMm?: Partial<BodyGeometryContract["dimensionsMm"]>;
  validation?: Partial<BodyGeometryContract["validation"]>;
  svgQuality?: BodyReferenceSvgQualityReport;
}

export interface BodyGeometryLoadedInspectionMergeState {
  status: BodyGeometryRuntimeInspectionStatus;
  glbUrl?: string | null;
  inspectedAt?: string;
  error?: string | null;
  auditArtifactPresent?: boolean;
  auditArtifactOptionalMissing?: boolean;
  auditArtifactRequiredMissing?: boolean;
}

export interface BodyGeometrySourceHashAuthority {
  outline?: EditableBodyOutline | null;
  canonicalBodyProfile?: CanonicalBodyProfile | null;
  canonicalDimensionCalibration?: CanonicalDimensionCalibration | null;
}

function isBodyGeometrySourceHashAuthority(
  value: EditableBodyOutline | BodyGeometrySourceHashAuthority | null | undefined,
): value is BodyGeometrySourceHashAuthority {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (
      "outline" in value ||
      "canonicalBodyProfile" in value ||
      "canonicalDimensionCalibration" in value
    ),
  );
}

export const BODY_MESH_NAME_MARKERS = [
  "body_mesh",
  "body",
  "cup_body",
  "tumbler_body",
  "cutout",
  "shell",
] as const;
export const ACCESSORY_MESH_NAME_MARKERS = [
  "lid",
  "rim",
  "ring",
  "silver_ring",
  "handle",
  "straw",
  "grommet",
  "flip",
  "tab",
  "cap",
  "logo_marker",
  "accessory",
] as const;
export const FALLBACK_MESH_NAME_MARKERS = [
  "fallback",
  "proxy",
  "placeholder",
  "generated-placeholder",
  "default",
  "debug",
  "preview",
] as const;
const KNOWN_FALLBACK_MESHES = new Set([
  "iceflow_fallback_visual_assembly",
  "iceflow_handle_top_bar_mesh",
  "iceflow_handle_left_post_mesh",
  "iceflow_handle_right_post_mesh",
  "iceflow_flip_tab_mesh",
  "iceflow_front_logo_marker_mesh",
]);
const DIMENSION_TOLERANCE_MM = 0.5;
const SOURCE_WRAP_TOLERANCE_MM = 0.5;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeStringArray(values: readonly string[] | null | undefined): string[] {
  return [...new Set(
    (values ?? [])
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value)),
  )];
}

function isFinitePositive(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function parseViewBoxWidth(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map((part) => Number(part));
  if (parts.length < 4) return undefined;
  const width = parts[2];
  return Number.isFinite(width) ? width : undefined;
}

function normalizeMeshName(name: string): string {
  return name.trim().toLowerCase();
}

function includesAnyMarker(name: string, markers: readonly string[]): boolean {
  const normalizedName = normalizeMeshName(name);
  return markers.some((marker) => normalizedName.includes(marker));
}

function isBodyMeshName(name: string): boolean {
  return (
    !KNOWN_FALLBACK_MESHES.has(normalizeMeshName(name)) &&
    !includesAnyMarker(name, FALLBACK_MESH_NAME_MARKERS) &&
    includesAnyMarker(name, BODY_MESH_NAME_MARKERS)
  );
}

function mergeNames(...sets: Array<readonly string[] | null | undefined>): string[] {
  return normalizeStringArray(sets.flatMap((set) => set ?? []));
}

function sameNormalizedNameSet(
  left: readonly string[] | null | undefined,
  right: readonly string[] | null | undefined,
): boolean {
  const normalizedLeft = normalizeStringArray(left).sort((a, b) => a.localeCompare(b));
  const normalizedRight = normalizeStringArray(right).sort((a, b) => a.localeCompare(b));
  if (normalizedLeft.length !== normalizedRight.length) return false;
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function resolveMergedContractMode(args: {
  currentMode?: BodyGeometryContractMode | null;
  auditMode?: BodyGeometryContractMode | null;
  seededMode?: BodyGeometryContractMode | null;
}): BodyGeometryContractMode {
  const currentMode = args.currentMode ?? null;
  const auditMode = args.auditMode ?? null;
  const seededMode = args.seededMode ?? null;
  if (auditMode && (currentMode == null || currentMode === "unknown" || currentMode === auditMode)) {
    return auditMode;
  }
  if (currentMode && currentMode !== "unknown") {
    return currentMode;
  }
  if (auditMode) {
    return auditMode;
  }
  return seededMode ?? "unknown";
}

function hasMeaningfulContractData(contract: BodyGeometryContract): boolean {
  return (
    contract.meshes.names.length > 0 ||
    contract.meshes.bodyMeshNames.length > 0 ||
    typeof contract.source.hash === "string" ||
    typeof contract.glb.path === "string" ||
    typeof contract.glb.hash === "string" ||
    contract.dimensionsMm.bodyBounds != null
  );
}

export function buildBodyGeometrySourceHashPayload(
  input: EditableBodyOutline | BodyGeometrySourceHashAuthority | null | undefined,
): Record<string, unknown> | null {
  const outline: EditableBodyOutline | null = isBodyGeometrySourceHashAuthority(input)
    ? (input.outline ?? null)
    : (input ?? null);
  if (!outline) return null;
  const directContour = resolveEditableBodyOutlineDirectContour(outline);
  const outlinePayload = {
    closed: outline.closed,
    version: outline.version ?? 1,
    sourceContourMode: outline.sourceContourMode ?? null,
    points: outline.points.map((point) => ({
      x: round2(point.x),
      y: round2(point.y),
      role: point.role ?? null,
      pointType: point.pointType ?? null,
      inHandle: point.inHandle
        ? { x: round2(point.inHandle.x), y: round2(point.inHandle.y) }
        : null,
      outHandle: point.outHandle
        ? { x: round2(point.outHandle.x), y: round2(point.outHandle.y) }
        : null,
    })),
    directContour: directContour?.map((point) => ({
      x: round2(point.x),
      y: round2(point.y),
    })) ?? null,
    sourceContour: outline.sourceContour?.map((point) => ({
      x: round2(point.x),
      y: round2(point.y),
    })) ?? null,
    sourceContourBounds: outline.sourceContourBounds
      ? {
          minX: round2(outline.sourceContourBounds.minX),
          minY: round2(outline.sourceContourBounds.minY),
          maxX: round2(outline.sourceContourBounds.maxX),
          maxY: round2(outline.sourceContourBounds.maxY),
          width: round2(outline.sourceContourBounds.width),
          height: round2(outline.sourceContourBounds.height),
        }
      : null,
    sourceContourViewport: outline.sourceContourViewport
      ? {
          minX: round2(outline.sourceContourViewport.minX),
          minY: round2(outline.sourceContourViewport.minY),
          width: round2(outline.sourceContourViewport.width),
          height: round2(outline.sourceContourViewport.height),
        }
      : null,
  };
  const authorityInput = isBodyGeometrySourceHashAuthority(input) ? input : null;
  if (!authorityInput?.canonicalBodyProfile || !authorityInput.canonicalDimensionCalibration) {
    return outlinePayload;
  }
  const normalizedAuthorityPayload = buildBodyReferenceGlbSourcePayload({
    bodyOutline: outline,
    canonicalBodyProfile: authorityInput.canonicalBodyProfile,
    canonicalDimensionCalibration: authorityInput.canonicalDimensionCalibration,
  });
  return {
    version: 2,
    outline: outlinePayload,
    canonicalBodyProfile: normalizedAuthorityPayload.canonicalBodyProfile,
    canonicalDimensionCalibration: normalizedAuthorityPayload.canonicalDimensionCalibration,
  };
}

export function createEmptyBodyGeometryContract(): BodyGeometryContract {
  return {
    contractVersion: BODY_GEOMETRY_CONTRACT_VERSION,
    mode: "unknown",
    source: {
      type: "unknown",
    },
    glb: {},
    meshes: {
      names: [],
      visibleMeshNames: [],
      materialNames: [],
      bodyMeshNames: [],
      accessoryMeshNames: [],
      fallbackMeshNames: [],
      fallbackDetected: false,
      unexpectedMeshes: [],
      totalVertexCount: 0,
      totalTriangleCount: 0,
    },
    dimensionsMm: {
      scaleSource: "unknown",
    },
    validation: {
      status: "unknown",
      errors: [],
      warnings: [],
    },
    runtimeInspection: {
      status: "idle",
      source: "three-loaded-scene",
      auditArtifactPresent: false,
      auditArtifactOptionalMissing: false,
      auditArtifactRequiredMissing: false,
      auditArtifactUsedAsProvisionalTruth: false,
      loadedMeshNamesSource: "unavailable",
      bodyBoundsSource: "unavailable",
    },
  };
}

export function detectBodyMeshes(meshNames: readonly string[]): string[] {
  return normalizeStringArray(meshNames).filter((name) => isBodyMeshName(name));
}

export function detectAccessoryMeshes(meshNames: readonly string[]): string[] {
  return normalizeStringArray(meshNames).filter((name) => (
    !KNOWN_FALLBACK_MESHES.has(normalizeMeshName(name)) &&
    !includesAnyMarker(name, FALLBACK_MESH_NAME_MARKERS) &&
    !isBodyMeshName(name) &&
    includesAnyMarker(name, ACCESSORY_MESH_NAME_MARKERS)
  ));
}

export function detectFallbackMeshes(meshNames: readonly string[]): string[] {
  return normalizeStringArray(meshNames).filter((name) => (
    KNOWN_FALLBACK_MESHES.has(normalizeMeshName(name)) ||
    includesAnyMarker(name, FALLBACK_MESH_NAME_MARKERS)
  ));
}

export function isBodyOnlyMode(mode: BodyGeometryContractMode | null | undefined): boolean {
  return mode === "body-cutout-qa";
}

export function resolveGlbFreshRelativeToSource(args: {
  currentSourceHash?: string | null;
  glbSourceHash?: string | null;
}): boolean | undefined {
  const currentSourceHash = args.currentSourceHash?.trim();
  const glbSourceHash = args.glbSourceHash?.trim();
  if (!currentSourceHash || !glbSourceHash) {
    return undefined;
  }
  return currentSourceHash === glbSourceHash;
}

export function resolveLoadedGlbFreshRelativeToSource(args: {
  currentSourceHash?: string | null;
  glbSourceHash?: string | null;
  seededFreshRelativeToSource?: boolean | null;
}): boolean | undefined {
  const comparedFreshness = resolveGlbFreshRelativeToSource(args);
  if (args.currentSourceHash?.trim()) {
    return comparedFreshness;
  }
  if (typeof comparedFreshness === "boolean") {
    return comparedFreshness;
  }
  return typeof args.seededFreshRelativeToSource === "boolean"
    ? args.seededFreshRelativeToSource
    : undefined;
}

export function updateContractValidation(contract: BodyGeometryContract): BodyGeometryContract {
  const meshNames = normalizeStringArray(contract.meshes.names);
  const visibleMeshNames = normalizeStringArray(contract.meshes.visibleMeshNames);
  const materialNames = normalizeStringArray(contract.meshes.materialNames);
  const bodyMeshNames = mergeNames(
    contract.meshes.bodyMeshNames,
    detectBodyMeshes(meshNames),
  );
  const accessoryMeshNames = mergeNames(
    contract.meshes.accessoryMeshNames,
    detectAccessoryMeshes(meshNames),
  );
  const fallbackMeshNames = mergeNames(
    contract.meshes.fallbackMeshNames,
    detectFallbackMeshes(meshNames),
  );
  const unexpectedMeshes = mergeNames(
    contract.meshes.unexpectedMeshes,
    meshNames.filter((name) => (
      !bodyMeshNames.includes(name) &&
      !accessoryMeshNames.includes(name) &&
      !fallbackMeshNames.includes(name)
    )),
  );
  const errors = normalizeStringArray(contract.validation.errors);
  const warnings = normalizeStringArray(contract.validation.warnings);
  const strictBodyOnlyMode = isBodyOnlyMode(contract.mode);
  const hasGlbArtifact = Boolean(contract.glb.path || contract.glb.hash || meshNames.length > 0);
  const runtimeInspectionComplete = contract.runtimeInspection?.status === "complete";

  if (
    bodyMeshNames.length === 0 &&
    (
      meshNames.length > 0 ||
      (strictBodyOnlyMode && runtimeInspectionComplete && hasGlbArtifact)
    )
  ) {
    errors.push(
      strictBodyOnlyMode
        ? "BODY CUTOUT QA expected at least one body mesh, but none were found."
        : "No body mesh detected in the current mesh list.",
    );
  }

  if (strictBodyOnlyMode && accessoryMeshNames.length > 0) {
    errors.push(
      `BODY CUTOUT QA expected exactly body geometry, but accessory meshes were found: ${accessoryMeshNames.join(", ")}.`,
    );
  }

  if (strictBodyOnlyMode && (contract.meshes.fallbackDetected || fallbackMeshNames.length > 0)) {
    errors.push(
      fallbackMeshNames.length > 0
        ? `Fallback geometry detected in body-only QA mode: ${fallbackMeshNames.join(", ")}.`
        : "Fallback geometry detected in body-only QA mode.",
    );
  }

  if (contract.source.type !== "unknown" && !contract.source.hash) {
    warnings.push("Exact source SHA-256 hash is not available for the current body geometry contract.");
  }

  if (hasGlbArtifact && !contract.glb.hash) {
    warnings.push("Generated GLB SHA-256 hash is not available for the current body geometry contract.");
  }

  if (unexpectedMeshes.length > 0) {
    warnings.push(`Unexpected mesh names detected: ${unexpectedMeshes.join(", ")}.`);
  }

  if (
    contract.source.hash &&
    contract.glb.sourceHash &&
    contract.source.hash !== contract.glb.sourceHash
  ) {
    errors.push("Source SVG hash does not match GLB source hash.");
  }

  if (contract.glb.freshRelativeToSource === false) {
    if (strictBodyOnlyMode) {
      errors.push("GLB is stale relative to the current source contour.");
    } else {
      warnings.push("Generated GLB is not fresh relative to the current source contour.");
    }
  }

  if (
    contract.source.hash &&
    hasGlbArtifact &&
    !contract.glb.sourceHash &&
    typeof contract.glb.freshRelativeToSource !== "boolean" &&
    (
      strictBodyOnlyMode ||
      contract.runtimeInspection?.auditArtifactRequiredMissing
    )
  ) {
    warnings.push("GLB freshness could not be verified because source lineage metadata is missing.");
  }

  if (contract.runtimeInspection?.auditArtifactRequiredMissing) {
    warnings.push("Expected generated audit sidecar is missing for this reviewed GLB.");
  }

  const bodyBounds = contract.dimensionsMm.bodyBounds;
  const bodyBoundsUnits = contract.dimensionsMm.bodyBoundsUnits ?? (bodyBounds ? "mm" : undefined);
  const scaleSource = contract.dimensionsMm.scaleSource
    ?? (
      bodyBounds && bodyBoundsUnits === "mm"
        ? "mesh-bounds"
        : (
            isFinitePositive(contract.dimensionsMm.wrapDiameterMm) ||
            isFinitePositive(contract.dimensionsMm.wrapWidthMm) ||
            isFinitePositive(contract.dimensionsMm.expectedBodyWidthMm) ||
            isFinitePositive(contract.dimensionsMm.expectedBodyHeightMm)
          )
          ? "physical-wrap"
          : (
              isFinitePositive(contract.source.widthPx) ||
              isFinitePositive(contract.source.heightPx) ||
              typeof parseViewBoxWidth(contract.source.viewBox) === "number"
            )
            ? "svg-viewbox"
            : "unknown"
    );
  const sourceComparableWidth =
    contract.source.widthPx ??
    parseViewBoxWidth(contract.source.viewBox);
  if (bodyBoundsUnits === "scene-units") {
    warnings.push("Body mesh bounds are reported in scene units; cannot verify scale in mm.");
  }
  if (bodyBounds) {
    if (!isFinitePositive(bodyBounds.width) || !isFinitePositive(bodyBounds.height) || !isFinitePositive(bodyBounds.depth)) {
      errors.push("Body mesh bounds must contain positive finite width, height, and depth values.");
    }
  }

  if (
    strictBodyOnlyMode &&
    !bodyBounds &&
    (isFinitePositive(contract.dimensionsMm.expectedBodyWidthMm) || isFinitePositive(contract.dimensionsMm.expectedBodyHeightMm))
  ) {
    warnings.push("Body mesh bounds are unavailable; cannot verify scale.");
  }

  if (bodyBounds && bodyBoundsUnits !== "scene-units" && isFinitePositive(contract.dimensionsMm.expectedBodyWidthMm)) {
    if (Math.abs(bodyBounds.width - contract.dimensionsMm.expectedBodyWidthMm) > DIMENSION_TOLERANCE_MM) {
      const widthMessage = `Body mesh width ${bodyBounds.width}mm differs from expected body width ${contract.dimensionsMm.expectedBodyWidthMm}mm.`;
      if (strictBodyOnlyMode) {
        errors.push(widthMessage);
      } else {
        warnings.push(widthMessage);
      }
    }
  }

  if (bodyBounds && bodyBoundsUnits !== "scene-units" && isFinitePositive(contract.dimensionsMm.expectedBodyHeightMm)) {
    if (Math.abs(bodyBounds.height - contract.dimensionsMm.expectedBodyHeightMm) > DIMENSION_TOLERANCE_MM) {
      const heightMessage = `Body mesh height ${bodyBounds.height}mm differs from expected body height ${contract.dimensionsMm.expectedBodyHeightMm}mm.`;
      if (strictBodyOnlyMode) {
        errors.push(heightMessage);
      } else {
        warnings.push(heightMessage);
      }
    }
  }

  if (
    scaleSource === "svg-viewbox" &&
    isFinitePositive(sourceComparableWidth) &&
    isFinitePositive(contract.dimensionsMm.wrapWidthMm)
  ) {
    const widthDelta = Math.abs(sourceComparableWidth - contract.dimensionsMm.wrapWidthMm);
    if (widthDelta > SOURCE_WRAP_TOLERANCE_MM) {
      warnings.push(
        `Source SVG width ${round2(sourceComparableWidth)} differs from physical wrap width ${round2(contract.dimensionsMm.wrapWidthMm)} based on svg-viewbox scale source.`,
      );
    }
  }

  const normalizedErrors = normalizeStringArray(errors);
  const normalizedWarnings = normalizeStringArray(warnings);
  const validationStatus: BodyGeometryValidationStatus =
    normalizedErrors.length > 0
      ? "fail"
      : normalizedWarnings.length > 0
        ? "warn"
        : hasMeaningfulContractData(contract)
          ? "pass"
          : "unknown";

  return {
    ...contract,
    glb: {
      ...contract.glb,
    },
    meshes: {
      names: meshNames,
      visibleMeshNames,
      materialNames,
      bodyMeshNames,
      accessoryMeshNames,
      fallbackMeshNames,
      fallbackDetected: contract.meshes.fallbackDetected || fallbackMeshNames.length > 0,
      unexpectedMeshes,
      totalVertexCount: typeof contract.meshes.totalVertexCount === "number"
        ? contract.meshes.totalVertexCount
        : undefined,
      totalTriangleCount: typeof contract.meshes.totalTriangleCount === "number"
        ? contract.meshes.totalTriangleCount
        : undefined,
    },
    dimensionsMm: {
      ...contract.dimensionsMm,
      bodyBoundsUnits,
      scaleSource,
    },
    validation: {
      status: validationStatus,
      errors: normalizedErrors,
      warnings: normalizedWarnings,
    },
  };
}

export function mergeBodyGeometryContractSeed(
  contract: BodyGeometryContract,
  seed: BodyGeometryContractSeed | null | undefined,
): BodyGeometryContract {
  if (!seed) return contract;

  return {
    ...contract,
    mode: seed.mode ?? contract.mode,
    source: {
      ...contract.source,
      ...seed.source,
    },
    glb: {
      ...contract.glb,
      ...seed.glb,
    },
    meshes: {
      ...contract.meshes,
      ...seed.meshes,
      names: seed.meshes?.names ?? contract.meshes.names,
      visibleMeshNames: seed.meshes?.visibleMeshNames ?? contract.meshes.visibleMeshNames,
      materialNames: seed.meshes?.materialNames ?? contract.meshes.materialNames,
      bodyMeshNames: seed.meshes?.bodyMeshNames ?? contract.meshes.bodyMeshNames,
      accessoryMeshNames: seed.meshes?.accessoryMeshNames ?? contract.meshes.accessoryMeshNames,
      fallbackMeshNames: seed.meshes?.fallbackMeshNames ?? contract.meshes.fallbackMeshNames,
      unexpectedMeshes: seed.meshes?.unexpectedMeshes ?? contract.meshes.unexpectedMeshes,
      totalVertexCount: seed.meshes?.totalVertexCount ?? contract.meshes.totalVertexCount,
      totalTriangleCount: seed.meshes?.totalTriangleCount ?? contract.meshes.totalTriangleCount,
      fallbackDetected: seed.meshes?.fallbackDetected ?? contract.meshes.fallbackDetected,
    },
    dimensionsMm: {
      ...contract.dimensionsMm,
      ...seed.dimensionsMm,
    },
    validation: {
      ...contract.validation,
      ...seed.validation,
      errors: mergeNames(contract.validation.errors, seed.validation?.errors),
      warnings: mergeNames(contract.validation.warnings, seed.validation?.warnings),
    },
    svgQuality: seed.svgQuality ?? contract.svgQuality,
  };
}

export function mergeAuditContractWithLoadedInspection(args: {
  auditContract?: BodyGeometryContract | null;
  loadedInspectionContract?: BodyGeometryContract | null;
  metadataSeed?: BodyGeometryContractSeed | null;
  currentMode?: BodyGeometryContractMode | null;
  currentSourceHash?: string | null;
  loadedGlbHash?: string | null;
  runtimeInspection?: BodyGeometryLoadedInspectionMergeState | null;
}): BodyGeometryContract {
  const auditContract = args.auditContract ?? null;
  const loadedInspectionContract = args.loadedInspectionContract ?? createEmptyBodyGeometryContract();
  const seededContract = mergeBodyGeometryContractSeed(
    loadedInspectionContract,
    args.metadataSeed,
  );
  const runtimeInspectionStatus = args.runtimeInspection?.status ?? (
    args.loadedInspectionContract ? "complete" : "idle"
  );
  const runtimeInspectionComplete = runtimeInspectionStatus === "complete";
  const resolvedMode = resolveMergedContractMode({
    currentMode: args.currentMode,
    auditMode: auditContract?.mode,
    seededMode: seededContract.mode,
  });
  const loadedMeshNames = runtimeInspectionComplete
    ? normalizeStringArray(loadedInspectionContract.meshes.names)
    : [];
  const loadedAccessoryMeshNames = runtimeInspectionComplete
    ? mergeNames(
        loadedInspectionContract.meshes.accessoryMeshNames,
        detectAccessoryMeshes(loadedMeshNames),
      )
    : [];
  const loadedFallbackMeshNames = runtimeInspectionComplete
    ? mergeNames(
        loadedInspectionContract.meshes.fallbackMeshNames,
        detectFallbackMeshes(loadedMeshNames),
      )
    : [];
  const auditAccessoryMeshNames = normalizeStringArray(auditContract?.meshes.accessoryMeshNames);
  const auditFallbackMeshNames = normalizeStringArray(auditContract?.meshes.fallbackMeshNames);
  const auditMeshNames = normalizeStringArray(auditContract?.meshes.names);
  const useAuditProvisionalTruth = !runtimeInspectionComplete && Boolean(auditContract);
  const runtimeInspectionStatusForReport =
    runtimeInspectionStatus === "pending" && useAuditProvisionalTruth && isBodyOnlyMode(resolvedMode)
      ? "complete"
      : runtimeInspectionStatus;
  const mergedMeshNames = runtimeInspectionComplete
    ? loadedMeshNames
    : (
        useAuditProvisionalTruth
          ? auditMeshNames
          : normalizeStringArray(seededContract.meshes.names)
      );
  const mergedBodyMeshNames = runtimeInspectionComplete
    ? mergeNames(
        loadedInspectionContract.meshes.bodyMeshNames,
        detectBodyMeshes(loadedMeshNames),
      )
    : (
        useAuditProvisionalTruth
          ? mergeNames(
              auditContract?.meshes.bodyMeshNames,
              detectBodyMeshes(mergedMeshNames),
            )
          : mergeNames(
              seededContract.meshes.bodyMeshNames,
              detectBodyMeshes(mergedMeshNames),
            )
      );
  const mergedAccessoryMeshNames = runtimeInspectionComplete
    ? mergeNames(auditAccessoryMeshNames, loadedAccessoryMeshNames)
    : (
        useAuditProvisionalTruth
          ? mergeNames(
              auditAccessoryMeshNames,
              detectAccessoryMeshes(mergedMeshNames),
            )
          : mergeNames(
              seededContract.meshes.accessoryMeshNames,
              detectAccessoryMeshes(mergedMeshNames),
            )
      );
  const mergedFallbackMeshNames = runtimeInspectionComplete
    ? mergeNames(auditFallbackMeshNames, loadedFallbackMeshNames)
    : (
        useAuditProvisionalTruth
          ? mergeNames(
              auditFallbackMeshNames,
              detectFallbackMeshes(mergedMeshNames),
            )
          : mergeNames(
              seededContract.meshes.fallbackMeshNames,
              detectFallbackMeshes(mergedMeshNames),
            )
      );
  const additionalLoadedAccessoryMeshNames = loadedAccessoryMeshNames.filter(
    (name) => !auditAccessoryMeshNames.includes(name),
  );
  const additionalLoadedFallbackMeshNames = loadedFallbackMeshNames.filter(
    (name) => !auditFallbackMeshNames.includes(name),
  );
  const glbSourceHash =
    auditContract?.glb.sourceHash ??
    auditContract?.source.hash ??
    seededContract.glb.sourceHash;
  const freshRelativeToSource = resolveLoadedGlbFreshRelativeToSource({
    currentSourceHash: args.currentSourceHash ?? seededContract.source.hash,
    glbSourceHash,
    seededFreshRelativeToSource:
      auditContract?.glb.freshRelativeToSource ??
      seededContract.glb.freshRelativeToSource,
  });
  const errors = mergeNames(
    loadedInspectionContract.validation.errors,
    seededContract.validation.errors,
    auditContract?.validation.errors,
  );
  const warnings = mergeNames(
    loadedInspectionContract.validation.warnings,
    seededContract.validation.warnings,
    auditContract?.validation.warnings,
  );

  if (runtimeInspectionStatus === "failed") {
    if (auditContract) {
      warnings.push("Loaded-scene inspection failed; using generated audit sidecar metadata.");
    } else {
      warnings.push("Loaded-scene inspection failed.");
    }
  }

  if (
    runtimeInspectionComplete &&
    auditContract &&
    !sameNormalizedNameSet(auditContract.meshes.names, loadedMeshNames)
  ) {
    warnings.push("Audit mesh list differs from loaded GLB mesh list.");
  }

  if (runtimeInspectionComplete && additionalLoadedAccessoryMeshNames.length > 0) {
    warnings.push(
      `Loaded GLB inspection found accessory meshes not present in audit metadata: ${additionalLoadedAccessoryMeshNames.join(", ")}.`,
    );
  }

  if (runtimeInspectionComplete && additionalLoadedFallbackMeshNames.length > 0) {
    warnings.push(
      `Loaded GLB inspection found fallback meshes not present in audit metadata: ${additionalLoadedFallbackMeshNames.join(", ")}.`,
    );
  }

  const auditGlbHash = auditContract?.glb.hash?.trim();
  const loadedGlbHash = args.loadedGlbHash?.trim();
  if (auditGlbHash && loadedGlbHash && auditGlbHash !== loadedGlbHash) {
    if (isBodyOnlyMode(resolvedMode)) {
      errors.push("Loaded GLB hash does not match audit GLB hash.");
    } else {
      warnings.push("Loaded GLB hash does not match audit GLB hash.");
    }
  }

  const mergedBodyBounds = runtimeInspectionComplete
    ? loadedInspectionContract.dimensionsMm.bodyBounds
    : (
        useAuditProvisionalTruth
          ? auditContract?.dimensionsMm.bodyBounds
          : seededContract.dimensionsMm.bodyBounds
      );
  const mergedBodyBoundsUnits = runtimeInspectionComplete
    ? loadedInspectionContract.dimensionsMm.bodyBoundsUnits
    : (
        useAuditProvisionalTruth
          ? auditContract?.dimensionsMm.bodyBoundsUnits
          : seededContract.dimensionsMm.bodyBoundsUnits
      );
  const mergedVisibleMeshNames = runtimeInspectionComplete
    ? normalizeStringArray(loadedInspectionContract.meshes.visibleMeshNames)
    : (
        useAuditProvisionalTruth
          ? normalizeStringArray(auditContract?.meshes.visibleMeshNames)
          : normalizeStringArray(seededContract.meshes.visibleMeshNames)
      );
  const mergedMaterialNames = runtimeInspectionComplete
    ? normalizeStringArray(loadedInspectionContract.meshes.materialNames)
    : (
        useAuditProvisionalTruth
          ? normalizeStringArray(auditContract?.meshes.materialNames)
          : normalizeStringArray(seededContract.meshes.materialNames)
      );
  const mergedSvgQuality = seededContract.svgQuality
    ? {
        ...(auditContract?.svgQuality ?? {}),
        ...seededContract.svgQuality,
        bounds: seededContract.svgQuality.bounds ?? auditContract?.svgQuality?.bounds,
        viewBox: seededContract.svgQuality.viewBox ?? auditContract?.svgQuality?.viewBox,
        sourceHash: seededContract.svgQuality.sourceHash ?? auditContract?.svgQuality?.sourceHash,
        warnings: mergeNames(auditContract?.svgQuality?.warnings, seededContract.svgQuality.warnings),
        errors: mergeNames(auditContract?.svgQuality?.errors, seededContract.svgQuality.errors),
      }
    : auditContract?.svgQuality;

  return updateContractValidation({
    ...seededContract,
    mode: resolvedMode,
    source: {
      ...seededContract.source,
      type:
        seededContract.source.type !== "unknown"
          ? seededContract.source.type
          : (auditContract?.source.type ?? seededContract.source.type),
      filename: seededContract.source.filename ?? auditContract?.source.filename,
      hash: args.currentSourceHash ?? seededContract.source.hash ?? auditContract?.source.hash,
      widthPx: seededContract.source.widthPx ?? auditContract?.source.widthPx,
      heightPx: seededContract.source.heightPx ?? auditContract?.source.heightPx,
      viewBox: seededContract.source.viewBox ?? auditContract?.source.viewBox,
      detectedBodyOnly:
        seededContract.source.detectedBodyOnly ?? auditContract?.source.detectedBodyOnly,
    },
    glb: {
      ...seededContract.glb,
      hash: loadedGlbHash ?? seededContract.glb.hash ?? auditContract?.glb.hash,
      sourceHash: glbSourceHash,
      generatedAt:
        auditContract?.glb.generatedAt ??
        seededContract.glb.generatedAt,
      freshRelativeToSource,
    },
    meshes: {
      ...seededContract.meshes,
      names: mergedMeshNames,
      visibleMeshNames: mergedVisibleMeshNames,
      materialNames: mergedMaterialNames,
      bodyMeshNames: mergedBodyMeshNames,
      accessoryMeshNames: mergedAccessoryMeshNames,
      fallbackMeshNames: mergedFallbackMeshNames,
      fallbackDetected:
        Boolean(auditContract?.meshes.fallbackDetected) ||
        seededContract.meshes.fallbackDetected ||
        (runtimeInspectionComplete && loadedInspectionContract.meshes.fallbackDetected) ||
        mergedFallbackMeshNames.length > 0,
      unexpectedMeshes: mergeNames(
        runtimeInspectionComplete ? loadedInspectionContract.meshes.unexpectedMeshes : [],
        useAuditProvisionalTruth ? auditContract?.meshes.unexpectedMeshes : seededContract.meshes.unexpectedMeshes,
      ),
      totalVertexCount: runtimeInspectionComplete
        ? loadedInspectionContract.meshes.totalVertexCount
        : seededContract.meshes.totalVertexCount,
      totalTriangleCount: runtimeInspectionComplete
        ? loadedInspectionContract.meshes.totalTriangleCount
        : seededContract.meshes.totalTriangleCount,
    },
    dimensionsMm: {
      ...seededContract.dimensionsMm,
      bodyBounds: mergedBodyBounds,
      bodyBoundsUnits: mergedBodyBoundsUnits,
      wrapDiameterMm:
        auditContract?.dimensionsMm.wrapDiameterMm ?? seededContract.dimensionsMm.wrapDiameterMm,
      wrapWidthMm:
        auditContract?.dimensionsMm.wrapWidthMm ?? seededContract.dimensionsMm.wrapWidthMm,
      frontVisibleWidthMm:
        auditContract?.dimensionsMm.frontVisibleWidthMm ?? seededContract.dimensionsMm.frontVisibleWidthMm,
      expectedBodyWidthMm:
        auditContract?.dimensionsMm.expectedBodyWidthMm ?? seededContract.dimensionsMm.expectedBodyWidthMm,
      expectedBodyHeightMm:
        auditContract?.dimensionsMm.expectedBodyHeightMm ?? seededContract.dimensionsMm.expectedBodyHeightMm,
      printableTopMm:
        auditContract?.dimensionsMm.printableTopMm ?? seededContract.dimensionsMm.printableTopMm,
      printableBottomMm:
        auditContract?.dimensionsMm.printableBottomMm ?? seededContract.dimensionsMm.printableBottomMm,
      scaleSource:
        auditContract?.dimensionsMm.scaleSource ??
        seededContract.dimensionsMm.scaleSource ??
        loadedInspectionContract.dimensionsMm.scaleSource,
    },
    validation: {
      status:
        auditContract?.validation.status ??
        seededContract.validation.status ??
        loadedInspectionContract.validation.status,
      errors,
      warnings,
    },
    svgQuality: mergedSvgQuality,
    runtimeInspection: {
      status: runtimeInspectionStatusForReport,
      source: "three-loaded-scene",
      glbUrl:
        args.runtimeInspection?.glbUrl?.trim()
        || seededContract.glb.path
        || auditContract?.glb.path,
      inspectedAt: args.runtimeInspection?.inspectedAt,
      error: args.runtimeInspection?.error?.trim() || undefined,
      auditArtifactPresent: Boolean(
        args.runtimeInspection?.auditArtifactPresent ?? auditContract,
      ),
      auditArtifactOptionalMissing: Boolean(args.runtimeInspection?.auditArtifactOptionalMissing),
      auditArtifactRequiredMissing: Boolean(args.runtimeInspection?.auditArtifactRequiredMissing),
      auditArtifactUsedAsProvisionalTruth: useAuditProvisionalTruth,
      loadedMeshNamesSource: runtimeInspectionComplete
        ? "runtime-inspection"
        : (useAuditProvisionalTruth ? "audit-provisional" : "unavailable"),
      bodyBoundsSource: runtimeInspectionComplete
        ? "runtime-inspection"
        : (useAuditProvisionalTruth && mergedBodyBounds ? "audit-provisional" : "unavailable"),
    },
  });
}

export function isContractPassing(contract: BodyGeometryContract): boolean {
  return contract.validation.status === "pass";
}
