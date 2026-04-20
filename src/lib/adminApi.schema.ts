import { z } from "zod";
import type { FlatItemLookupResponse } from "@/types/flatItemLookup";
import type { BodyGeometryContract } from "@/lib/bodyGeometryContract";
import type { LogoPlacementAssistResponse, TraceSettingsAssistResponse } from "@/types/imageAssist";
import type { TumblerAutoSizeResponse } from "@/types/tumblerAutoSize";
import type { TumblerItemLookupResponse } from "@/types/tumblerItemLookup";

const finiteNumber = z.number().finite();
const nullableFiniteNumber = finiteNumber.nullable();

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

const sourceLinkSchema = z.object({
  title: z.string(),
  url: z.string(),
  kind: z.enum(["internal", "official", "retailer", "general"]),
}).passthrough();

const bodyGeometryContractSchema = z.object({
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
    bodyBounds: z.object({
      width: finiteNumber,
      height: finiteNumber,
      depth: finiteNumber,
    }).optional(),
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
    bodyBounds: z.object({
      width: finiteNumber,
      height: finiteNumber,
      depth: finiteNumber,
    }).optional(),
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

export const tumblerAutoSizeResponseSchema = z.object({
  analysis: z.object({
    productType: z.enum(["tumbler", "insulated tumbler"]),
    brand: z.string().nullable(),
    model: z.string().nullable(),
    capacityOz: nullableFiniteNumber,
    hasHandle: z.boolean().nullable(),
    shapeType: z.enum(["straight", "tapered", "unknown"]),
    confidence: finiteNumber,
    searchQuery: z.string(),
    notes: z.array(z.string()),
  }).passthrough(),
  suggestion: z.object({
    productType: z.enum(["tumbler", "insulated tumbler"]),
    brand: z.string().nullable(),
    model: z.string().nullable(),
    capacityOz: nullableFiniteNumber,
    hasHandle: z.boolean().nullable(),
    shapeType: z.enum(["straight", "tapered", "unknown"]),
    overallHeightMm: nullableFiniteNumber,
    outsideDiameterMm: nullableFiniteNumber,
    topDiameterMm: nullableFiniteNumber,
    bottomDiameterMm: nullableFiniteNumber,
    usableHeightMm: nullableFiniteNumber,
    confidence: finiteNumber,
    sources: z.array(sourceLinkSchema),
    notes: z.array(z.string()),
  }).passthrough(),
  calculation: z.object({
    shapeType: z.enum(["straight", "tapered", "unknown"]),
    templateWidthMm: finiteNumber,
    templateHeightMm: finiteNumber,
    diameterUsedMm: finiteNumber,
    averageDiameterMm: nullableFiniteNumber,
  }).passthrough(),
  confidenceLevel: z.enum(["low", "medium", "high"]),
}).passthrough();

export const flatItemLookupResponseSchema = z.object({
  lookupInput: z.string(),
  resolvedUrl: z.string().nullable(),
  title: z.string().nullable(),
  brand: z.string().nullable(),
  label: z.string(),
  matchedItemId: z.string().nullable(),
  familyKey: z.string(),
  category: z.string(),
  widthMm: finiteNumber,
  heightMm: finiteNumber,
  thicknessMm: finiteNumber,
  material: z.string(),
  materialLabel: z.string(),
  imageUrl: z.string().nullable(),
  imageUrls: z.array(z.string()),
  glbPath: z.string(),
  modelStrategy: z.enum(["page-model", "image-trace", "family-generated"]),
  modelSourceUrl: z.string().nullable(),
  requiresReview: z.boolean(),
  isProxy: z.boolean(),
  traceScore: nullableFiniteNumber,
  traceDebug: z.unknown().nullable(),
  confidence: finiteNumber,
  mode: z.enum(["catalog-match", "family-fallback", "metadata-fallback", "safe-fallback"]),
  notes: z.array(z.string()),
  sources: z.array(sourceLinkSchema),
}).passthrough();

export const tumblerItemLookupResponseSchema = z.object({
  lookupInput: z.string(),
  resolvedUrl: z.string().nullable(),
  title: z.string().nullable(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  capacityOz: nullableFiniteNumber,
  matchedProfileId: z.string().nullable(),
  glbPath: z.string(),
  modelStatus: z.enum(["verified-product-model", "generated-reviewed-model", "placeholder-model", "missing-model"]).optional(),
  modelSourceLabel: z.string().nullable().optional(),
  imageUrl: z.string().nullable(),
  backImageUrl: z.string().optional(),
  imageUrls: z.array(z.string()),
  productReferenceSet: z.unknown().nullable().optional(),
  bodyColorHex: z.string().nullable().optional(),
  rimColorHex: z.string().nullable().optional(),
  fitDebug: z.unknown().nullable().optional(),
  dimensions: z.object({
    overallHeightMm: nullableFiniteNumber,
    outsideDiameterMm: nullableFiniteNumber,
    topDiameterMm: nullableFiniteNumber,
    bottomDiameterMm: nullableFiniteNumber,
    usableHeightMm: nullableFiniteNumber,
    handleSpanMm: nullableFiniteNumber.optional(),
  }).passthrough(),
  mode: z.enum(["matched-profile", "parsed-page", "safe-fallback"]),
  notes: z.array(z.string()),
  sources: z.array(sourceLinkSchema),
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
  bodyGeometrySource: z.string().nullable().optional(),
  lidGeometrySource: z.string().nullable().optional(),
  ringGeometrySource: z.string().nullable().optional(),
  meshNames: z.array(z.string()).optional(),
  fallbackMeshNames: z.array(z.string()).optional(),
  bodyMeshBounds: z.object({
    minMm: z.object({
      x: finiteNumber,
      y: finiteNumber,
      z: finiteNumber,
    }),
    maxMm: z.object({
      x: finiteNumber,
      y: finiteNumber,
      z: finiteNumber,
    }),
    sizeMm: z.object({
      x: finiteNumber,
      y: finiteNumber,
      z: finiteNumber,
    }),
  }).nullable().optional(),
  visualLikeness: z.object({
    status: z.enum(["pass", "review", "fail"]),
    score: finiteNumber,
    authority: z.literal("body-reference-visual-qa"),
    issues: z.array(z.string()),
    recommendations: z.array(z.string()),
    metrics: z.record(z.string(), z.unknown()),
  }).passthrough().optional(),
  silhouetteAudit: z.object({
    authority: z.literal("body-cutout-qa-silhouette"),
    scaleContract: z.literal("canonical sample radiusMm"),
    pass: z.boolean(),
    toleranceMm: finiteNumber,
    maxDeviationMm: finiteNumber,
    meanDeviationMm: finiteNumber,
    approvedWidthMm: finiteNumber,
    meshWidthMm: finiteNumber,
    widthDeviationMm: finiteNumber,
    approvedHeightMm: finiteNumber,
    meshHeightMm: finiteNumber,
    heightDeviationMm: finiteNumber,
    wrapDiameterMm: finiteNumber,
    frontVisibleWidthMm: finiteNumber,
    approvedContourCount: z.number().int().nonnegative(),
    meshRowCount: z.number().int().nonnegative(),
    sampleCount: z.number().int().nonnegative(),
    rows: z.array(z.object({
      yOverallMm: finiteNumber,
      approvedRadiusMm: finiteNumber,
      meshRadiusMm: finiteNumber,
      deviationMm: finiteNumber,
    })),
    artifactPaths: z.object({
      jsonPath: z.string().nullable(),
      svgPath: z.string().nullable(),
    }).nullable(),
  }).optional(),
  bodyGeometryContract: bodyGeometryContractSchema.optional(),
}).passthrough();

export const logoPlacementAssistResponseSchema = z.object({
  detected: z.boolean(),
  logoBox: z.object({
    x: finiteNumber,
    y: finiteNumber,
    w: finiteNumber,
    h: finiteNumber,
  }).nullable(),
  viewClass: z.string(),
  confidence: finiteNumber,
  rationale: z.string(),
}).passthrough();

export const traceSettingsAssistResponseSchema = z.object({
  traceMode: z.string(),
  traceRecipe: z.unknown(),
  backgroundStrategy: z.string(),
  preserveText: z.boolean(),
  thresholdMode: z.enum(["auto", "manual"]),
  threshold: finiteNumber,
  invert: z.boolean(),
  turdSize: finiteNumber,
  alphaMax: finiteNumber,
  optTolerance: finiteNumber,
  posterizeSteps: finiteNumber,
  confidence: finiteNumber,
  rationale: z.string(),
}).passthrough();

export const lightburnPreprocessResponseSchema = z.object({
  usedInkscape: z.boolean().optional(),
  items: z.array(z.object({
    id: z.string(),
    svgText: z.string(),
    message: z.string().nullable().optional(),
  }).passthrough()).optional(),
}).passthrough();

export const lightburnSaveExportResponseSchema = z.object({
  saved: z.boolean().optional(),
  path: z.string().optional(),
  error: z.string().optional(),
}).passthrough();

export function parseTumblerAutoSizeResponse(value: unknown): TumblerAutoSizeResponse | null {
  const parsed = tumblerAutoSizeResponseSchema.safeParse(value);
  return parsed.success ? parsed.data as TumblerAutoSizeResponse : null;
}

export function parseFlatItemLookupResponse(value: unknown): FlatItemLookupResponse | null {
  const parsed = flatItemLookupResponseSchema.safeParse(value);
  return parsed.success ? parsed.data as FlatItemLookupResponse : null;
}

export function parseTumblerItemLookupResponse(value: unknown): TumblerItemLookupResponse | null {
  const parsed = tumblerItemLookupResponseSchema.safeParse(value);
  return parsed.success ? parsed.data as TumblerItemLookupResponse : null;
}

export function parseBodyReferenceGlbResponse(
  value: unknown,
): {
  glbPath: string;
  auditJsonPath?: string | null;
  modelStatus?: "generated-reviewed-model";
  renderMode?: "body-cutout-qa" | "hybrid-preview" | null;
  generatedSourceSignature?: string | null;
  modelSourceLabel?: string | null;
  bodyColorHex?: string | null;
  rimColorHex?: string | null;
  bodyGeometrySource?: string | null;
  lidGeometrySource?: string | null;
  ringGeometrySource?: string | null;
  meshNames?: string[];
  fallbackMeshNames?: string[];
  bodyMeshBounds?: {
    minMm: { x: number; y: number; z: number };
    maxMm: { x: number; y: number; z: number };
    sizeMm: { x: number; y: number; z: number };
  } | null;
  silhouetteAudit?: {
    authority: "body-cutout-qa-silhouette";
    scaleContract: "canonical sample radiusMm";
    pass: boolean;
    toleranceMm: number;
    maxDeviationMm: number;
    meanDeviationMm: number;
    approvedWidthMm: number;
    meshWidthMm: number;
    widthDeviationMm: number;
    approvedHeightMm: number;
    meshHeightMm: number;
    heightDeviationMm: number;
    wrapDiameterMm: number;
    frontVisibleWidthMm: number;
    approvedContourCount: number;
    meshRowCount: number;
    sampleCount: number;
    rows: Array<{
      yOverallMm: number;
      approvedRadiusMm: number;
      meshRadiusMm: number;
      deviationMm: number;
    }>;
    artifactPaths: {
      jsonPath: string | null;
      svgPath: string | null;
    } | null;
  };
  bodyGeometryContract?: BodyGeometryContract;
} | null {
  const parsed = bodyReferenceGlbResponseSchema.safeParse(value);
  return parsed.success
    ? parsed.data as {
        glbPath: string;
        auditJsonPath?: string | null;
        modelStatus?: "generated-reviewed-model";
        renderMode?: "body-cutout-qa" | "hybrid-preview" | null;
        generatedSourceSignature?: string | null;
        modelSourceLabel?: string | null;
        bodyColorHex?: string | null;
        rimColorHex?: string | null;
        bodyGeometrySource?: string | null;
        lidGeometrySource?: string | null;
        ringGeometrySource?: string | null;
        meshNames?: string[];
        fallbackMeshNames?: string[];
        bodyMeshBounds?: {
          minMm: { x: number; y: number; z: number };
          maxMm: { x: number; y: number; z: number };
          sizeMm: { x: number; y: number; z: number };
        } | null;
        silhouetteAudit?: {
          authority: "body-cutout-qa-silhouette";
          scaleContract: "canonical sample radiusMm";
          pass: boolean;
          toleranceMm: number;
          maxDeviationMm: number;
          meanDeviationMm: number;
          approvedWidthMm: number;
          meshWidthMm: number;
          widthDeviationMm: number;
          approvedHeightMm: number;
          meshHeightMm: number;
          heightDeviationMm: number;
          wrapDiameterMm: number;
          frontVisibleWidthMm: number;
          approvedContourCount: number;
          meshRowCount: number;
          sampleCount: number;
          rows: Array<{
            yOverallMm: number;
            approvedRadiusMm: number;
            meshRadiusMm: number;
            deviationMm: number;
          }>;
          artifactPaths: {
            jsonPath: string | null;
            svgPath: string | null;
          } | null;
        };
        bodyGeometryContract?: BodyGeometryContract;
      }
    : null;
}

export function parseBodyGeometryAuditArtifact(value: unknown): {
  contractVersion: string;
  generatedAt?: string;
  mode: string;
  source: {
    type: "approved-svg" | "uploaded-svg" | "generated" | "fallback" | "unknown";
    filename?: string;
    hash?: string;
    widthPx?: number;
    heightPx?: number;
    viewBox?: string;
    detectedBodyOnly?: boolean;
  };
  glb: {
    path?: string;
    name?: string;
    hash?: string;
    sourceHash?: string;
    generatedAt?: string;
    freshRelativeToSource?: boolean;
  };
  meshes: {
    names: string[];
    bodyMeshNames: string[];
    accessoryMeshNames: string[];
    fallbackMeshNames: string[];
    fallbackDetected: boolean;
    unexpectedMeshes: string[];
  };
  dimensionsMm: {
    bodyBounds?: {
      width: number;
      height: number;
      depth: number;
    };
    bodyBoundsUnits?: "mm" | "scene-units";
    wrapDiameterMm?: number;
    wrapWidthMm?: number;
    frontVisibleWidthMm?: number;
    expectedBodyWidthMm?: number;
    expectedBodyHeightMm?: number;
    printableTopMm?: number;
    printableBottomMm?: number;
    scaleSource?: "svg-viewbox" | "physical-wrap" | "mesh-bounds" | "unknown";
  };
  validation: {
    status: "pass" | "warn" | "fail" | "unknown";
    errors: string[];
    warnings: string[];
  };
  svgQuality?: {
    status: "pass" | "warn" | "fail";
    contourSource: "direct-contour" | "source-contour" | "profile-points" | "path-svg" | "unavailable";
    boundsUnits: "mm" | "source-px" | "unknown";
    pointCount: number;
    segmentCount: number;
    closed: boolean;
    closeable: boolean;
    bounds?: {
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
      width: number;
      height: number;
    };
    viewBox?: string;
    sourceHash?: string;
    duplicatePointCount: number;
    nearDuplicatePointCount: number;
    tinySegmentCount: number;
    suspiciousSpikeCount: number;
    suspiciousJumpCount: number;
    expectedBridgeSegmentCount: number;
    aspectRatio?: number;
    warnings: string[];
    errors: string[];
  };
} | null {
  const parsed = bodyGeometryAuditArtifactSchema.safeParse(value);
  return parsed.success
    ? parsed.data as {
        contractVersion: string;
        generatedAt?: string;
        mode: string;
        source: {
          type: "approved-svg" | "uploaded-svg" | "generated" | "fallback" | "unknown";
          filename?: string;
          hash?: string;
          widthPx?: number;
          heightPx?: number;
          viewBox?: string;
          detectedBodyOnly?: boolean;
        };
        glb: {
          path?: string;
          name?: string;
          hash?: string;
          sourceHash?: string;
          generatedAt?: string;
          freshRelativeToSource?: boolean;
        };
        meshes: {
          names: string[];
          bodyMeshNames: string[];
          accessoryMeshNames: string[];
          fallbackMeshNames: string[];
          fallbackDetected: boolean;
          unexpectedMeshes: string[];
        };
        dimensionsMm: {
          bodyBounds?: {
            width: number;
            height: number;
            depth: number;
          };
          bodyBoundsUnits?: "mm" | "scene-units";
          wrapDiameterMm?: number;
          wrapWidthMm?: number;
          frontVisibleWidthMm?: number;
          expectedBodyWidthMm?: number;
          expectedBodyHeightMm?: number;
          printableTopMm?: number;
          printableBottomMm?: number;
          scaleSource?: "svg-viewbox" | "physical-wrap" | "mesh-bounds" | "unknown";
        };
        validation: {
          status: "pass" | "warn" | "fail" | "unknown";
          errors: string[];
          warnings: string[];
        };
        svgQuality?: {
          status: "pass" | "warn" | "fail";
          contourSource: "direct-contour" | "source-contour" | "profile-points" | "path-svg" | "unavailable";
          boundsUnits: "mm" | "source-px" | "unknown";
          pointCount: number;
          segmentCount: number;
          closed: boolean;
          closeable: boolean;
          bounds?: {
            minX: number;
            minY: number;
            maxX: number;
            maxY: number;
            width: number;
            height: number;
          };
          viewBox?: string;
          sourceHash?: string;
          duplicatePointCount: number;
          nearDuplicatePointCount: number;
          tinySegmentCount: number;
          suspiciousSpikeCount: number;
          suspiciousJumpCount: number;
          expectedBridgeSegmentCount: number;
          aspectRatio?: number;
          warnings: string[];
          errors: string[];
        };
      }
    : null;
}

export function parseLogoPlacementAssistResponse(value: unknown): LogoPlacementAssistResponse | null {
  const parsed = logoPlacementAssistResponseSchema.safeParse(value);
  return parsed.success ? parsed.data as LogoPlacementAssistResponse : null;
}

export function parseTraceSettingsAssistResponse(value: unknown): TraceSettingsAssistResponse | null {
  const parsed = traceSettingsAssistResponseSchema.safeParse(value);
  return parsed.success ? parsed.data as TraceSettingsAssistResponse : null;
}
