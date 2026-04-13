import { z } from "zod";
import type { FlatItemLookupResponse } from "@/types/flatItemLookup";
import type { LogoPlacementAssistResponse, TraceSettingsAssistResponse } from "@/types/imageAssist";
import type { TumblerAutoSizeResponse } from "@/types/tumblerAutoSize";
import type { TumblerItemLookupResponse } from "@/types/tumblerItemLookup";

const finiteNumber = z.number().finite();
const nullableFiniteNumber = finiteNumber.nullable();

const sourceLinkSchema = z.object({
  title: z.string(),
  url: z.string(),
  kind: z.enum(["internal", "official", "retailer", "general"]),
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
  modelStatus: z.enum(["verified-product-model", "placeholder-model", "missing-model"]).optional(),
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

export function parseLogoPlacementAssistResponse(value: unknown): LogoPlacementAssistResponse | null {
  const parsed = logoPlacementAssistResponseSchema.safeParse(value);
  return parsed.success ? parsed.data as LogoPlacementAssistResponse : null;
}

export function parseTraceSettingsAssistResponse(value: unknown): TraceSettingsAssistResponse | null {
  const parsed = traceSettingsAssistResponseSchema.safeParse(value);
  return parsed.success ? parsed.data as TraceSettingsAssistResponse : null;
}
