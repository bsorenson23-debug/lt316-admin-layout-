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

const requestSchema = z.object({
  renderMode: z.enum(["body-cutout-qa", "hybrid-preview"]).optional().nullable(),
  templateName: z.string().trim().min(1).optional().nullable(),
  matchedProfileId: z.string().trim().min(1).optional().nullable(),
  bodyOutlineSourceMode: z.enum(["full-image", "body-only"]).optional().nullable(),
  bodyOutline: editableBodyOutlineSchema.optional().nullable(),
  canonicalBodyProfile: canonicalBodyProfileSchema,
  canonicalDimensionCalibration: canonicalDimensionCalibrationSchema,
  bodyColorHex: z.string().optional().nullable(),
  rimColorHex: z.string().optional().nullable(),
});

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

    const result = await generateBodyReferenceGlb({
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
    });
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
