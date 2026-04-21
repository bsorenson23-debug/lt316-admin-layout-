import { z } from "zod";
import type { ProductTemplate, ProductTemplateStore } from "@/types/productTemplate";

const finiteNumber = z.number().finite();
const optionalFiniteNumber = finiteNumber.optional();
const nullableOptionalFiniteNumber = finiteNumber.nullable().optional();

const printableSurfaceContractSchema = z.object({
  printableTopMm: finiteNumber,
  printableBottomMm: finiteNumber,
  printableHeightMm: finiteNumber,
  axialExclusions: z.array(z.object({
    kind: z.string(),
    startMm: finiteNumber,
    endMm: finiteNumber,
  }).passthrough()).optional(),
  circumferentialExclusions: z.array(z.object({
    kind: z.string(),
    startMm: finiteNumber,
    endMm: finiteNumber,
    wraps: z.boolean().optional(),
  }).passthrough()).optional(),
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
  }).passthrough()),
  svgPath: z.string(),
}).passthrough();

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
  wrapMappingMm: z.record(z.string(), finiteNumber.optional()),
  printableSurfaceContract: printableSurfaceContractSchema.optional(),
  glbScale: z.object({
    unitsPerMm: finiteNumber,
  }),
}).passthrough();

const productTemplateDimensionsSchema = z.object({
  diameterMm: finiteNumber,
  printHeightMm: finiteNumber,
  templateWidthMm: finiteNumber,
  handleArcDeg: finiteNumber,
  taperCorrection: z.enum(["none", "top-narrow", "bottom-narrow"]),
  bodyDiameterMm: optionalFiniteNumber,
  topOuterDiameterMm: optionalFiniteNumber,
  baseDiameterMm: optionalFiniteNumber,
  mouthInnerDiameterMm: optionalFiniteNumber,
  flatThicknessMm: optionalFiniteNumber,
  flatFamilyKey: z.string().optional(),
  overallHeightMm: optionalFiniteNumber,
  bodyTopFromOverallMm: optionalFiniteNumber,
  bodyBottomFromOverallMm: optionalFiniteNumber,
  lidSeamFromOverallMm: optionalFiniteNumber,
  silverBandBottomFromOverallMm: optionalFiniteNumber,
  handleTopFromOverallMm: optionalFiniteNumber,
  handleBottomFromOverallMm: optionalFiniteNumber,
  topMarginMm: optionalFiniteNumber,
  bottomMarginMm: optionalFiniteNumber,
  bodyHeightMm: optionalFiniteNumber,
  printableTopOverrideMm: optionalFiniteNumber,
  printableBottomOverrideMm: optionalFiniteNumber,
  canonicalBodyProfile: canonicalBodyProfileSchema.optional(),
  canonicalDimensionCalibration: canonicalDimensionCalibrationSchema.optional(),
  printableSurfaceContract: printableSurfaceContractSchema.optional(),
  canonicalHandleProfile: z.unknown().optional(),
  bodyReferenceQA: z.unknown().optional(),
  bodyReferenceWarnings: z.array(z.string()).optional(),
  bodyReferenceContractVersion: z.number().int().optional(),
  axialSurfaceBands: z.unknown().optional(),
  bodyOutlineProfile: z.unknown().optional(),
  referencePaths: z.unknown().optional(),
  referenceLayerState: z.unknown().optional(),
  bodyColorHex: z.string().optional(),
  lidColorHex: z.string().optional(),
  rimColorHex: z.string().optional(),
  advancedGeometryOverridesUnlocked: z.boolean().optional(),
  referencePhotoScalePct: optionalFiniteNumber,
  referencePhotoWidthScalePct: optionalFiniteNumber,
  referencePhotoHeightScalePct: optionalFiniteNumber,
  referencePhotoLockAspect: z.boolean().optional(),
  referencePhotoOffsetXPct: optionalFiniteNumber,
  referencePhotoOffsetYPct: optionalFiniteNumber,
  referencePhotoAnchorY: z.enum(["center", "bottom"]).optional(),
  referencePhotoCenterMode: z.enum(["body", "photo"]).optional(),
}).passthrough();

const productTemplateLaserSettingsSchema = z.object({
  power: finiteNumber,
  speed: finiteNumber,
  frequency: finiteNumber,
  lineInterval: finiteNumber,
  materialProfileId: z.string(),
  rotaryPresetId: z.string(),
}).passthrough();

export const productTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  brand: z.string(),
  capacity: z.string(),
  laserType: z.enum(["fiber", "co2", "diode"]).optional(),
  productType: z.enum(["tumbler", "mug", "bottle", "flat"]),
  materialSlug: z.string().optional(),
  materialLabel: z.string().optional(),
  thumbnailDataUrl: z.string(),
  productPhotoFullUrl: z.string().optional(),
  glbPath: z.string(),
  glbStatus: z.enum(["verified-product-model", "generated-reviewed-model", "placeholder-model", "missing-model"]).optional(),
  glbSourceLabel: z.string().optional(),
  dimensions: productTemplateDimensionsSchema,
  laserSettings: productTemplateLaserSettingsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  builtIn: z.boolean(),
  tumblerMapping: z.object({
    frontFaceRotation: finiteNumber,
    handleCenterAngle: finiteNumber,
    handleArcDeg: finiteNumber,
    isMapped: z.boolean(),
    printableTopY: optionalFiniteNumber,
    printableBottomY: optionalFiniteNumber,
    calibrationOffsetX: optionalFiniteNumber,
    calibrationOffsetY: optionalFiniteNumber,
    calibrationRotation: optionalFiniteNumber,
  }).passthrough().optional(),
  frontPhotoDataUrl: z.string().optional(),
  backPhotoDataUrl: z.string().optional(),
  bodyReferenceViewSide: z.enum(["front", "back"]).optional(),
  bodyReferenceSourceTrust: z.enum([
    "trusted-front",
    "advisory-angled",
    "manual-front-unclassified",
    "fit-debug-fallback",
  ]).optional(),
  bodyReferenceOutlineSeedMode: z.enum([
    "fresh-image-trace",
    "saved-outline",
    "fit-debug-fallback",
  ]).optional(),
  bodyReferenceSourceOrigin: z.enum(["manual", "lookup", "fit-debug", "saved-outline", "unknown"]).optional(),
  bodyReferenceSourceViewClass: z.string().optional(),
  manufacturerLogoStamp: z.unknown().optional(),
  availableColors: z.array(z.unknown()).optional(),
  appearance: z.unknown().optional(),
  productReferenceSet: z.unknown().optional(),
  pipelineProvenance: z.unknown().optional(),
}).passthrough();

export const productTemplateStoreSchema = z.object({
  templates: z.array(productTemplateSchema),
  lastUpdated: z.string().catch(""),
  deletedBuiltInIds: z.array(z.string()).optional().default([]),
}).passthrough();

export function parseProductTemplate(value: unknown): ProductTemplate | null {
  const parsed = productTemplateSchema.safeParse(value);
  return parsed.success ? parsed.data as ProductTemplate : null;
}

export function parseProductTemplateArray(value: unknown): ProductTemplate[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => parseProductTemplate(entry))
    .filter((entry): entry is ProductTemplate => entry != null);
}

export function parseProductTemplateStore(value: unknown): ProductTemplateStore | null {
  const parsed = productTemplateStoreSchema.safeParse(value);
  return parsed.success ? {
    templates: parsed.data.templates as ProductTemplate[],
    lastUpdated: parsed.data.lastUpdated,
    deletedBuiltInIds: parsed.data.deletedBuiltInIds,
  } : null;
}
