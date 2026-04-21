import { z } from "zod";

import type { BodyGeometryContract } from "./bodyGeometryContract.ts";

const finiteNumber = z.number().finite();

const bodyReferenceSvgQualityReportSchema = z.object({
  status: z.enum(["pass", "warn", "fail"]),
  contourSource: z.enum(["direct-contour", "source-contour", "profile-points", "path-svg", "unavailable"]),
  boundsUnits: z.enum(["mm", "source-px", "unknown"]),
  pointCount: z.number().int().nonnegative(),
  segmentCount: z.number().int().nonnegative(),
  closed: z.boolean(),
  closeable: z.boolean(),
  bounds: z.object({
    minX: finiteNumber,
    minY: finiteNumber,
    maxX: finiteNumber,
    maxY: finiteNumber,
    width: finiteNumber,
    height: finiteNumber,
  }).optional(),
  viewBox: z.string().optional(),
  sourceHash: z.string().optional(),
  duplicatePointCount: z.number().int().nonnegative(),
  nearDuplicatePointCount: z.number().int().nonnegative(),
  tinySegmentCount: z.number().int().nonnegative(),
  suspiciousSpikeCount: z.number().int().nonnegative(),
  suspiciousJumpCount: z.number().int().nonnegative(),
  expectedBridgeSegmentCount: z.number().int().nonnegative(),
  aspectRatio: finiteNumber.optional(),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
});

const bodyGeometryBoundsSchema = z.object({
  width: finiteNumber,
  height: finiteNumber,
  depth: finiteNumber,
});

const bodyGeometryRuntimeInspectionSchema = z.object({
  status: z.enum(["idle", "pending", "complete", "failed"]),
  source: z.literal("three-loaded-scene"),
  glbUrl: z.string().optional(),
  inspectedAt: z.string().optional(),
  error: z.string().optional(),
  auditArtifactPresent: z.boolean().optional(),
  auditArtifactOptionalMissing: z.boolean().optional(),
  auditArtifactRequiredMissing: z.boolean().optional(),
  auditArtifactUsedAsProvisionalTruth: z.boolean().optional(),
  loadedMeshNamesSource: z.enum(["runtime-inspection", "audit-provisional", "unavailable"]).optional(),
  bodyBoundsSource: z.enum(["runtime-inspection", "audit-provisional", "unavailable"]).optional(),
});

export const bodyGeometryContractSchema = z.object({
  contractVersion: z.string(),
  mode: z.string(),
  source: z.object({
    type: z.enum(["approved-svg", "uploaded-svg", "generated", "fallback", "unknown"]),
    filename: z.string().optional(),
    hash: z.string().optional(),
    widthPx: finiteNumber.optional(),
    heightPx: finiteNumber.optional(),
    viewBox: z.string().optional(),
    detectedBodyOnly: z.boolean().optional(),
  }),
  glb: z.object({
    path: z.string().optional(),
    hash: z.string().optional(),
    sourceHash: z.string().optional(),
    generatedAt: z.string().optional(),
    freshRelativeToSource: z.boolean().optional(),
  }),
  meshes: z.object({
    names: z.array(z.string()),
    visibleMeshNames: z.array(z.string()).optional(),
    materialNames: z.array(z.string()).optional(),
    bodyMeshNames: z.array(z.string()),
    accessoryMeshNames: z.array(z.string()),
    fallbackMeshNames: z.array(z.string()),
    fallbackDetected: z.boolean(),
    unexpectedMeshes: z.array(z.string()),
    totalVertexCount: finiteNumber.optional(),
    totalTriangleCount: finiteNumber.optional(),
  }),
  dimensionsMm: z.object({
    bodyBounds: bodyGeometryBoundsSchema.optional(),
    bodyBoundsUnits: z.enum(["mm", "scene-units"]).optional(),
    wrapDiameterMm: finiteNumber.optional(),
    wrapWidthMm: finiteNumber.optional(),
    frontVisibleWidthMm: finiteNumber.optional(),
    expectedBodyWidthMm: finiteNumber.optional(),
    expectedBodyHeightMm: finiteNumber.optional(),
    printableTopMm: finiteNumber.optional(),
    printableBottomMm: finiteNumber.optional(),
    scaleSource: z.enum(["svg-viewbox", "physical-wrap", "mesh-bounds", "unknown"]).optional(),
  }),
  validation: z.object({
    status: z.enum(["pass", "warn", "fail", "unknown"]),
    errors: z.array(z.string()),
    warnings: z.array(z.string()),
  }),
  svgQuality: bodyReferenceSvgQualityReportSchema.optional(),
  runtimeInspection: bodyGeometryRuntimeInspectionSchema.optional(),
}).passthrough();

export const bodyGeometryAuditArtifactSchema = z.object({
  contractVersion: z.string(),
  generatedAt: z.string().optional(),
  mode: z.string(),
  source: z.object({
    type: z.enum(["approved-svg", "uploaded-svg", "generated", "fallback", "unknown"]),
    filename: z.string().optional(),
    hash: z.string().optional(),
    widthPx: finiteNumber.optional(),
    heightPx: finiteNumber.optional(),
    viewBox: z.string().optional(),
    detectedBodyOnly: z.boolean().optional(),
  }),
  glb: z.object({
    path: z.string().optional(),
    name: z.string().optional(),
    hash: z.string().optional(),
    sourceHash: z.string().optional(),
    generatedAt: z.string().optional(),
    freshRelativeToSource: z.boolean().optional(),
  }),
  meshes: z.object({
    names: z.array(z.string()),
    bodyMeshNames: z.array(z.string()),
    accessoryMeshNames: z.array(z.string()),
    fallbackMeshNames: z.array(z.string()),
    fallbackDetected: z.boolean(),
    unexpectedMeshes: z.array(z.string()),
  }),
  dimensionsMm: z.object({
    bodyBounds: bodyGeometryBoundsSchema.optional(),
    bodyBoundsUnits: z.enum(["mm", "scene-units"]).optional(),
    wrapDiameterMm: finiteNumber.optional(),
    wrapWidthMm: finiteNumber.optional(),
    frontVisibleWidthMm: finiteNumber.optional(),
    expectedBodyWidthMm: finiteNumber.optional(),
    expectedBodyHeightMm: finiteNumber.optional(),
    printableTopMm: finiteNumber.optional(),
    printableBottomMm: finiteNumber.optional(),
    scaleSource: z.enum(["svg-viewbox", "physical-wrap", "mesh-bounds", "unknown"]).optional(),
  }),
  validation: z.object({
    status: z.enum(["pass", "warn", "fail", "unknown"]),
    errors: z.array(z.string()),
    warnings: z.array(z.string()),
  }),
  svgQuality: bodyReferenceSvgQualityReportSchema.optional(),
}).passthrough();

export const bodyReferenceGlbResponseSchema = z.object({
  glbPath: z.string(),
  auditJsonPath: z.string().nullable().optional(),
  modelStatus: z.enum(["generated-reviewed-model"]).optional(),
  renderMode: z.enum(["body-cutout-qa", "hybrid-preview"]).nullable().optional(),
  generatedSourceSignature: z.string().nullable().optional(),
  modelSourceLabel: z.string().nullable().optional(),
  bodyColorHex: z.string().nullable().optional(),
  rimColorHex: z.string().nullable().optional(),
  bodyGeometryContract: bodyGeometryContractSchema.optional(),
}).passthrough();

export type ParsedBodyReferenceGlbResponse = {
  glbPath: string;
  auditJsonPath?: string | null;
  modelStatus?: "generated-reviewed-model";
  renderMode?: "body-cutout-qa" | "hybrid-preview" | null;
  generatedSourceSignature?: string | null;
  modelSourceLabel?: string | null;
  bodyColorHex?: string | null;
  rimColorHex?: string | null;
  bodyGeometryContract?: BodyGeometryContract;
};

export type ParsedBodyGeometryAuditArtifact = z.infer<typeof bodyGeometryAuditArtifactSchema>;

export function parseBodyReferenceGlbResponse(
  value: unknown,
): ParsedBodyReferenceGlbResponse | null {
  const parsed = bodyReferenceGlbResponseSchema.safeParse(value);
  return parsed.success ? parsed.data as ParsedBodyReferenceGlbResponse : null;
}

export function parseBodyGeometryAuditArtifact(
  value: unknown,
): ParsedBodyGeometryAuditArtifact | null {
  const parsed = bodyGeometryAuditArtifactSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
