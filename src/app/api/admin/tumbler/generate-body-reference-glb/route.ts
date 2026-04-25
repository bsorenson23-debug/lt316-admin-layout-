import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateBodyReferenceGlb } from "@/server/tumbler/generateTumblerModel";

export const runtime = "nodejs";

const finiteNumber = z.number().finite();
const nullableFiniteNumber = finiteNumber.nullable().optional();
const editableBodyOutlineContourPointSchema = z.object({
  x: finiteNumber,
  y: finiteNumber,
});
const editableBodyOutlinePointSchema = z.object({
  id: z.string(),
  x: finiteNumber,
  y: finiteNumber,
  pointType: z.enum(["corner", "smooth"]),
  role: z.enum(["topOuter", "body", "shoulder", "upperTaper", "lowerTaper", "bevel", "base", "custom"]),
  inHandle: z.object({ x: finiteNumber, y: finiteNumber }).nullable().optional(),
  outHandle: z.object({ x: finiteNumber, y: finiteNumber }).nullable().optional(),
});
const editableBodyOutlineSchema = z.object({
  closed: z.boolean(),
  version: z.literal(1),
  points: z.array(editableBodyOutlinePointSchema),
  directContour: z.array(editableBodyOutlineContourPointSchema).optional(),
  sourceContour: z.array(editableBodyOutlineContourPointSchema).optional(),
}).passthrough();

const canonicalBodyProfileSchema = z.object({
  symmetrySource: z.enum(["left", "right"]),
  mirroredFromSymmetrySource: z.boolean(),
  axis: z.object({
    xTop: finiteNumber,
    yTop: finiteNumber,
    xBottom: finiteNumber,
    yBottom: finiteNumber,
  }),
  samples: z.array(z.object({
    sNorm: finiteNumber,
    yMm: finiteNumber,
    yPx: finiteNumber,
    xLeft: finiteNumber,
    radiusPx: finiteNumber,
    radiusMm: finiteNumber,
  })).min(2),
  svgPath: z.string(),
});

const canonicalDimensionCalibrationSchema = z.object({
  units: z.literal("mm"),
  totalHeightMm: finiteNumber,
  bodyHeightMm: finiteNumber,
  lidBodyLineMm: finiteNumber,
  bodyBottomMm: finiteNumber,
  wrapDiameterMm: finiteNumber,
  baseDiameterMm: finiteNumber,
  wrapWidthMm: finiteNumber,
  frontVisibleWidthMm: finiteNumber,
  frontAxisPx: z.object({
    xTop: finiteNumber,
    yTop: finiteNumber,
    xBottom: finiteNumber,
    yBottom: finiteNumber,
  }),
  photoToFrontTransform: z.object({
    type: z.enum(["affine", "similarity"]),
    matrix: z.array(finiteNumber),
  }),
  svgFrontViewBoxMm: z.object({
    x: finiteNumber,
    y: finiteNumber,
    width: finiteNumber,
    height: finiteNumber,
  }),
  wrapMappingMm: z.object({
    frontMeridianMm: finiteNumber,
    backMeridianMm: finiteNumber,
    leftQuarterMm: finiteNumber,
    rightQuarterMm: finiteNumber,
    handleMeridianMm: nullableFiniteNumber,
    handleKeepOutArcDeg: nullableFiniteNumber,
    handleKeepOutWidthMm: nullableFiniteNumber,
    handleKeepOutStartMm: nullableFiniteNumber,
    handleKeepOutEndMm: nullableFiniteNumber,
  }),
  glbScale: z.object({
    unitsPerMm: finiteNumber,
  }),
}).passthrough();

const bodyReferenceV2PointSchema = z.object({
  xPx: finiteNumber,
  yPx: finiteNumber,
});

const bodyReferenceV2LayerSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "centerline",
    "body-left",
    "body-right-mirrored",
    "lid-reference",
    "handle-reference",
    "blocked-region",
  ]),
  points: z.array(bodyReferenceV2PointSchema),
  closed: z.boolean(),
  editable: z.boolean(),
  visible: z.boolean(),
  referenceOnly: z.boolean(),
  includedInBodyCutoutQa: z.boolean(),
});

const centerlineAxisSchema = z.object({
  id: z.string(),
  xPx: finiteNumber,
  topYPx: finiteNumber,
  bottomYPx: finiteNumber,
  confidence: finiteNumber.optional(),
  source: z.enum(["operator", "auto-detect", "unknown"]),
});

const blockedBodyRegionSchema = z.object({
  id: z.string(),
  reason: z.enum(["handle-overlap", "lid-overlap", "manual-mask", "unknown"]),
  points: z.array(bodyReferenceV2PointSchema),
});

const bodyReferenceV2ScaleCalibrationSchema = z.object({
  scaleSource: z.enum(["lookup-diameter", "manual-diameter", "svg-viewbox", "unknown"]),
  lookupDiameterMm: nullableFiniteNumber,
  resolvedDiameterMm: nullableFiniteNumber,
  mmPerPx: nullableFiniteNumber,
  wrapDiameterMm: nullableFiniteNumber,
  wrapWidthMm: nullableFiniteNumber,
  expectedBodyHeightMm: nullableFiniteNumber,
  expectedBodyWidthMm: nullableFiniteNumber,
}).passthrough();

const bodyHeightAuthorityInputSchema = z.object({
  manualBodyHeightMm: nullableFiniteNumber,
  diameterAuthorityKind: z.string().optional().nullable(),
  diameterAuthorityValueMm: nullableFiniteNumber,
  diameterAuthoritySourceField: z.string().optional().nullable(),
  sourceDiameterUnits: nullableFiniteNumber,
  sourceContourHeightUnits: nullableFiniteNumber,
  mmPerSourceUnit: nullableFiniteNumber,
  uniformScaleApplied: z.boolean().optional().nullable(),
  derivedBodyHeightMm: nullableFiniteNumber,
  svgPhysicalMmTrusted: z.boolean().optional().nullable(),
  svgToPhotoTransformPresent: z.boolean().optional().nullable(),
  rejectedHeightSources: z.array(z.string()).optional().nullable(),
  lookupBodyHeightMm: nullableFiniteNumber,
  lookupBodyHeightSource: z.enum(["physical-body-height", "usable-height", "printable-height", "unknown"]).optional().nullable(),
  lookupFullProductHeightMm: nullableFiniteNumber,
  templateDimensionsHeightMm: nullableFiniteNumber,
  templateDimensionsPrintHeightMm: nullableFiniteNumber,
  printableHeightMm: nullableFiniteNumber,
  engravableHeightMm: nullableFiniteNumber,
  approvedSvgBoundsHeightMm: nullableFiniteNumber,
  approvedSvgMarkedPhysicalMm: z.boolean().optional().nullable(),
  v2ExpectedBodyHeightMm: nullableFiniteNumber,
  v2ProfileBoundsHeightMm: nullableFiniteNumber,
  referenceBandHeightPx: nullableFiniteNumber,
  generatedBodyBoundsHeightMm: nullableFiniteNumber,
  canonicalBodyHeightMm: nullableFiniteNumber,
  bodyTopFromOverallMm: nullableFiniteNumber,
  bodyBottomFromOverallMm: nullableFiniteNumber,
  diameterAuthority: z.string().optional().nullable(),
  yScaleSource: z.string().optional().nullable(),
  radialScaleSource: z.string().optional().nullable(),
  sourceFunction: z.string().optional().nullable(),
}).passthrough();

const bodyReferenceV2DraftSchema = z.object({
  sourceImageUrl: z.string().optional(),
  centerline: centerlineAxisSchema.nullable(),
  layers: z.array(bodyReferenceV2LayerSchema),
  blockedRegions: z.array(blockedBodyRegionSchema),
  scaleCalibration: bodyReferenceV2ScaleCalibrationSchema,
});

const baseRequestSchema = z.object({
  renderMode: z.enum(["body-cutout-qa", "hybrid-preview"]).optional().nullable(),
  templateName: z.string().trim().min(1).optional().nullable(),
  matchedProfileId: z.string().trim().min(1).optional().nullable(),
  generationSourceMode: z.enum(["v1-approved-contour", "v2-mirrored-profile"]).optional().nullable(),
  bodyColorHex: z.string().optional().nullable(),
  rimColorHex: z.string().optional().nullable(),
  bodyHeightAuthorityInput: bodyHeightAuthorityInputSchema.optional().nullable(),
});

const v1RequestSchema = baseRequestSchema.extend({
  bodyOutlineSourceMode: z.enum(["full-image", "body-only"]).optional().nullable(),
  bodyOutline: editableBodyOutlineSchema.optional().nullable(),
  canonicalBodyProfile: canonicalBodyProfileSchema,
  canonicalDimensionCalibration: canonicalDimensionCalibrationSchema,
});

const v2RequestSchema = baseRequestSchema.extend({
  generationSourceMode: z.literal("v2-mirrored-profile"),
  bodyReferenceV2Draft: bodyReferenceV2DraftSchema,
});

const requestSchema = z.union([v1RequestSchema, v2RequestSchema]);

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid BODY REFERENCE GLB generation payload." },
        { status: 400 },
      );
    }

    const result = await generateBodyReferenceGlb(
      "bodyReferenceV2Draft" in parsed.data
        ? {
            ...parsed.data,
            bodyReferenceV2Draft: {
              ...parsed.data.bodyReferenceV2Draft,
              scaleCalibration: {
                ...parsed.data.bodyReferenceV2Draft.scaleCalibration,
                lookupDiameterMm: parsed.data.bodyReferenceV2Draft.scaleCalibration.lookupDiameterMm ?? undefined,
                resolvedDiameterMm: parsed.data.bodyReferenceV2Draft.scaleCalibration.resolvedDiameterMm ?? undefined,
                mmPerPx: parsed.data.bodyReferenceV2Draft.scaleCalibration.mmPerPx ?? undefined,
                wrapDiameterMm: parsed.data.bodyReferenceV2Draft.scaleCalibration.wrapDiameterMm ?? undefined,
                wrapWidthMm: parsed.data.bodyReferenceV2Draft.scaleCalibration.wrapWidthMm ?? undefined,
                expectedBodyHeightMm: parsed.data.bodyReferenceV2Draft.scaleCalibration.expectedBodyHeightMm ?? undefined,
                expectedBodyWidthMm: parsed.data.bodyReferenceV2Draft.scaleCalibration.expectedBodyWidthMm ?? undefined,
              },
            },
          }
        : {
            ...parsed.data,
            bodyOutline: parsed.data.bodyOutline ?? null,
            canonicalDimensionCalibration: {
              ...parsed.data.canonicalDimensionCalibration,
              wrapMappingMm: {
                ...parsed.data.canonicalDimensionCalibration.wrapMappingMm,
                handleMeridianMm: parsed.data.canonicalDimensionCalibration.wrapMappingMm.handleMeridianMm ?? undefined,
                handleKeepOutArcDeg: parsed.data.canonicalDimensionCalibration.wrapMappingMm.handleKeepOutArcDeg ?? undefined,
                handleKeepOutWidthMm: parsed.data.canonicalDimensionCalibration.wrapMappingMm.handleKeepOutWidthMm ?? undefined,
                handleKeepOutStartMm: parsed.data.canonicalDimensionCalibration.wrapMappingMm.handleKeepOutStartMm ?? undefined,
                handleKeepOutEndMm: parsed.data.canonicalDimensionCalibration.wrapMappingMm.handleKeepOutEndMm ?? undefined,
              },
            },
          },
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error
          ? error.message
          : "Failed to generate cutout-driven GLB.",
      },
      { status: 500 },
    );
  }
}
