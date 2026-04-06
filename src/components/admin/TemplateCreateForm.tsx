"use client";

import React from "react";
import dynamic from "next/dynamic";
import {
  type CanonicalBodyProfile,
  type CanonicalDimensionCalibration,
  type CanonicalHandleProfile,
  type EditableBodyOutline,
  type ManufacturerLogoStamp,
  type ProductReferenceSet,
  type ReferenceLayerState,
  type ReferencePaths,
  getTemplateBaseDiameterMm,
  getTemplateBodyDiameterMm,
  getTemplateTopOuterDiameterMm,
  type ProductTemplate,
  type TumblerMapping,
} from "@/types/productTemplate";
import type { AutoDetectResult } from "@/lib/autoDetect";
import type { FlatItemLookupResponse } from "@/types/flatItemLookup";
import type { TumblerFinish } from "@/types/materials";
import type { RasterVectorizeResponse } from "@/types/rasterVectorize";
import type { SmartTemplateLookupResponse } from "@/types/smartTemplateLookup";
import type { TumblerItemLookupResponse } from "@/types/tumblerItemLookup";
import type { CatalogBatchImportSummary } from "@/lib/catalogBatchImport";
import { detectTumblerFromImage } from "@/lib/autoDetect";
import { lookupFlatItem as lookupFlatItemRequest } from "@/lib/flatItemLookup";
import { lookupTumblerItem } from "@/lib/tumblerItemLookup";
import { importCatalogTemplates } from "@/lib/catalogBatchImport";
import { FLAT_BED_ITEMS, type FlatBedItem } from "@/data/flatBedItems";
import { KNOWN_MATERIAL_PROFILES } from "@/data/materialProfiles";
import { getMaterialProfileById } from "@/data/materialProfiles";
import { saveTemplate, updateTemplate } from "@/lib/templateStorage";
import { generateThumbnail } from "@/lib/generateThumbnail";
import {
  extractManufacturerLogoStamp,
  MANUFACTURER_LOGO_STAMP_ALGO_VERSION,
} from "@/lib/manufacturerLogoStamp";
import { resolveTumblerMaterialSetup } from "@/lib/tumblerMaterialInference";
import { findTumblerProfileIdForBrandModel, getTumblerProfileById, getProfileHandleArcDeg } from "@/data/tumblerProfiles";
import { getDefaultLaserSettings } from "@/lib/scopedDefaults";
import { deriveEngravableZoneFromFitDebug, getEngravableDimensions } from "@/lib/engravableDimensions";
import {
  buildPrintableSurfaceResolution,
  getPrintableSurfaceLocalBounds,
  getPrintableSurfaceResolutionFromDimensions,
  type PrintableSurfaceDetection,
} from "@/lib/printableSurface";
import {
  cloneReferenceLayerState,
  createEditableBodyOutline,
  createDefaultReferenceLayerState,
  createEditableBodyOutlineFromSeedSvgText,
  createReferencePaths,
  deriveDimensionsFromEditableBodyOutline,
} from "@/lib/editableBodyOutline";
import { extractCanonicalHandleProfileFromCutout } from "@/lib/canonicalHandleProfile";
import {
  buildCanonicalBodyProfile,
  buildCanonicalDimensionCalibration,
  resolveCanonicalHandleRenderMode,
  summarizeCanonicalHandleDebug,
  summarizeCanonicalOrientationQA,
  summarizeCanonicalSilhouetteMismatch,
} from "@/lib/canonicalDimensionCalibration";
import { inferFlatFamilyKey } from "@/lib/flatItemFamily";
import { FileDropZone } from "./shared/FileDropZone";
import { TumblerMappingWizard } from "./TumblerMappingWizard";
import { EngravableZoneEditor } from "./EngravableZoneEditor";
import { TumblerLookupDebugPanel } from "./TumblerLookupDebugPanel";
import { FlatItemLookupDebugPanel } from "./FlatItemLookupDebugPanel";
import { SmartTemplateLookupPanel } from "./SmartTemplateLookupPanel";
import type { FlatPreviewDimensions, ModelViewerProps, TumblerDimensions } from "./ModelViewer";
import styles from "./TemplateCreateForm.module.css";

const ModelViewer = dynamic<ModelViewerProps>(
  () => import("./ModelViewer"),
  { ssr: false },
);

interface Props {
  onSave: (template: ProductTemplate) => void;
  onCancel: () => void;
  editingTemplate?: ProductTemplate;
  showActions?: boolean;
}

export interface TemplateCreateFormHandle {
  save: () => void;
}

type PreviewModelMode = "alignment-model" | "full-model" | "source-traced";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function wrapTheta(theta: number): number {
  const twoPi = Math.PI * 2;
  let normalized = theta % twoPi;
  if (normalized > Math.PI) normalized -= twoPi;
  if (normalized < -Math.PI) normalized += twoPi;
  return normalized;
}

function resolveDefaultPreviewModelMode(args: {
  productType: ProductTemplate["productType"] | "" | null;
  hasAlignmentPreviewModel: boolean;
  hasFullPreviewModel: boolean;
  hasSourcePreviewModel: boolean;
}): PreviewModelMode {
  if (args.productType === "flat") {
    return "source-traced";
  }
  if (args.hasAlignmentPreviewModel) {
    return "alignment-model";
  }
  if (args.hasFullPreviewModel) {
    return "full-model";
  }
  if (args.hasSourcePreviewModel) {
    return "source-traced";
  }
  return "source-traced";
}

function resolveBodyReferenceDiameterMm(args: {
  outsideDiameterMm?: number | null;
  topDiameterMm?: number | null;
  bottomDiameterMm?: number | null;
  fallbackOutsideDiameterMm?: number | null;
}): number | null {
  const outside = typeof args.outsideDiameterMm === "number" && Number.isFinite(args.outsideDiameterMm)
    ? args.outsideDiameterMm
    : null;
  const top = typeof args.topDiameterMm === "number" && Number.isFinite(args.topDiameterMm)
    ? args.topDiameterMm
    : null;
  const bottom = typeof args.bottomDiameterMm === "number" && Number.isFinite(args.bottomDiameterMm)
    ? args.bottomDiameterMm
    : null;
  const fallbackOutside = typeof args.fallbackOutsideDiameterMm === "number" && Number.isFinite(args.fallbackOutsideDiameterMm)
    ? args.fallbackOutsideDiameterMm
    : null;

  const topBottomDelta = top != null && bottom != null
    ? Math.abs(top - bottom)
    : null;
  const taperedAverage = top != null && bottom != null
    ? (top + bottom) / 2
    : null;
  const looksLikeSyntheticAverage = (
    outside != null &&
    taperedAverage != null &&
    topBottomDelta != null &&
    topBottomDelta > 3 &&
    Math.abs(outside - taperedAverage) < 0.75
  );

  if (fallbackOutside != null && (outside == null || looksLikeSyntheticAverage)) {
    return round2(fallbackOutside);
  }
  if (outside != null) {
    return round2(outside);
  }
  if (top != null && bottom != null && Math.abs(top - bottom) > 3) {
    return round2(top);
  }
  if (top != null && bottom != null && Math.abs(top - bottom) <= 3) {
    return round2((top + bottom) / 2);
  }
  if (top != null && bottom == null) {
    return round2(top);
  }
  if (bottom != null && top == null) {
    return round2(bottom);
  }
  return null;
}

function lineIntervalFromLpi(lpi: number): number {
  return lpi > 0 ? round2(25.4 / lpi) : 0.06;
}

function resolveReferencePaths(dimensions?: ProductTemplate["dimensions"]): ReferencePaths {
  return createReferencePaths({
    bodyOutline: dimensions?.referencePaths?.bodyOutline ?? dimensions?.bodyOutlineProfile ?? null,
    lidProfile: dimensions?.referencePaths?.lidProfile ?? null,
    silverProfile: dimensions?.referencePaths?.silverProfile ?? null,
  });
}

function resolveReferenceLayerState(dimensions?: ProductTemplate["dimensions"]): ReferenceLayerState {
  return cloneReferenceLayerState(dimensions?.referenceLayerState ?? createDefaultReferenceLayerState());
}

/** Convert an image file to a data URL (max 480px on longest side for face photos) */
function fileToFacePhotoDataUrl(file: File, maxSize = 480): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(maxSize / img.naturalWidth, maxSize / img.naturalHeight, 1);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(img.src); resolve(""); return; }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(img.src); resolve(""); };
    img.src = URL.createObjectURL(file);
  });
}

/** Flip an image data URL horizontally (mirror) for back-side overlay */
function flipImageHorizontal(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(""); return; }
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => resolve("");
    img.src = dataUrl;
  });
}

async function fetchImageUrlAsDataUrl(url: string): Promise<string> {
  const response = await fetch("/api/admin/flatbed/fetch-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const payload = await response.json().catch(() => null) as { dataUrl?: string } | null;
  if (!response.ok || !payload?.dataUrl) {
    throw new Error(`Could not fetch lookup image: ${url}`);
  }
  return payload.dataUrl;
}

async function dataUrlToFile(dataUrl: string, fileName: string): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const type = blob.type || "image/png";
  return new File([blob], fileName, { type });
}

async function removeBackgroundForOutlineSeed(sourceDataUrl: string, fileName: string): Promise<string> {
  const sourceFile = await dataUrlToFile(sourceDataUrl, fileName);
  const formData = new FormData();
  formData.set("image", sourceFile);

  try {
    const response = await fetch("/api/admin/image/remove-bg", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json().catch(() => null) as { dataUrl?: string; error?: string } | null;
    if (response.ok && payload?.dataUrl) {
      return payload.dataUrl;
    }
  } catch {
    // Fall through to the local client-side background-removal fallback.
  }

  const blob = await (await fetch(sourceDataUrl)).blob();
  const { removeBackground } = await import("@imgly/background-removal");
  const cleanBlob = await removeBackground(blob, { model: "isnet_quint8", proxyToWorker: false });
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const nextUrl = typeof reader.result === "string" ? reader.result : "";
      if (nextUrl) {
        resolve(nextUrl);
        return;
      }
      reject(new Error("Background removal did not return a usable image."));
    };
    reader.onerror = () => reject(new Error("Background removal output could not be read."));
    reader.readAsDataURL(cleanBlob);
  });
}

async function vectorizeOutlineSeedSvg(sourceDataUrl: string, fileName: string): Promise<string> {
  const sourceFile = await dataUrlToFile(sourceDataUrl, fileName);
  const formData = new FormData();
  formData.set("image", sourceFile);
  formData.set("mode", "trace");
  formData.set("thresholdMode", "auto");
  formData.set("invert", "true");
  formData.set("normalizeLevels", "true");
  formData.set("trimWhitespace", "true");
  formData.set("preserveText", "false");
  formData.set("recipe", "badge");
  formData.set("backgroundStrategy", "cutout");
  formData.set("preferLocal", "true");

  const response = await fetch("/api/admin/image/vectorize", {
    method: "POST",
    body: formData,
  });
  const payload = await response.json().catch(() => null) as RasterVectorizeResponse | { error?: string } | null;
  if (!response.ok || !payload || !("svg" in payload) || typeof payload.svg !== "string" || payload.svg.length === 0) {
    throw new Error(
      (payload && "error" in payload && typeof payload.error === "string")
        ? payload.error
        : "PNG cutout vectorization failed.",
    );
  }
  return payload.svg;
}


/** Map AI product type string to our ProductTemplate product types */
function mapProductType(aiType: string): "tumbler" | "mug" | "bottle" | "flat" {
  const lower = aiType.toLowerCase();
  if (lower.includes("mug")) return "mug";
  if (lower.includes("bottle") || lower.includes("water")) return "bottle";
  if (lower.includes("flat") || lower.includes("sheet") || lower.includes("plate")) return "flat";
  return "tumbler";
}

function getLookupModeLabel(mode: TumblerItemLookupResponse["mode"]): string {
  switch (mode) {
    case "matched-profile":
      return "Matched profile";
    case "parsed-page":
      return "Page dimensions";
    case "safe-fallback":
      return "Safe fallback";
    default:
      return "Lookup";
  }
}

function getLookupSourceLabel(result: TumblerItemLookupResponse): string | null {
  const sourceUrl = result.resolvedUrl ?? result.sources[0]?.url ?? null;
  if (!sourceUrl) return null;
  try {
    const host = new URL(sourceUrl).hostname.replace(/^www\./i, "");
    const [label] = host.split(".");
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : null;
  } catch {
    return null;
  }
}

function getLookupPhotoLabel(result: TumblerItemLookupResponse): string {
  const source = getLookupSourceLabel(result);
  return source ? `${source} product photo` : "Lookup product photo";
}

function formatLookupMeasurement(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? `${round2(value)} mm`
    : null;
}

function normalizeLookupText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9.\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLookupText(input: string): string {
  const trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    return decodeURIComponent(url.pathname)
      .split("/")
      .filter(Boolean)
      .at(-1)
      ?.replace(/\.[a-z0-9]+$/i, "")
      ?.replace(/[-_]+/g, " ")
      ?.trim() || trimmed;
  } catch {
    return trimmed;
  }
}

function tokenizeLookupText(value: string): string[] {
  return normalizeLookupText(value)
    .split(" ")
    .filter((token) => token.length >= 2);
}

const FLAT_LOOKUP_STOPWORDS = new Set([
  "com",
  "www",
  "http",
  "https",
  "item",
  "items",
  "product",
  "products",
  "warehouse",
  "shop",
  "store",
  "sale",
  "buy",
  "pack",
  "black",
  "fde",
  "odg",
  "gen",
  "m2",
  "moe",
  "round",
]);

const FLAT_LOOKUP_ALIASES: Record<string, string[]> = {
  "ss-plate-10in": ["plate", "dish", "dinner plate", "steel plate"],
  "ss-tray-12x8": ["tray", "serving tray", "steel tray"],
  "cutting-board-bamboo-12x8": ["cutting board", "board", "bamboo board", "charcuterie board"],
  "wood-charcuterie-14x10": ["charcuterie board", "serving board", "wood board"],
  "slate-coaster-4in": ["coaster", "round coaster", "slate coaster"],
  "slate-coaster-4in-square": ["square coaster", "slate square coaster"],
  "ceramic-tile-4x4": ["tile", "ceramic tile", "4x4 tile"],
  "dog-tag-ss": ["dog tag", "military tag", "tag"],
  "anodized-keychain": ["keychain", "key tag", "tag blank"],
  "business-card-aluminum": ["business card", "metal card", "wallet insert"],
  "business-card-ss": ["stainless business card", "metal business card", "wallet insert"],
  "phone-case-flat": ["phone case", "case", "iphone case", "galaxy case"],
  "ss-card-wallet": ["wallet insert", "metal wallet card", "card wallet"],
};

const FLAT_LOOKUP_FALLBACKS: Array<FlatBedItem & { lookupAliases: string[] }> = [
  {
    id: "fallback-polymer-rifle-magazine",
    label: "Polymer Rifle Magazine",
    category: "other",
    widthMm: 66,
    heightMm: 178,
    thicknessMm: 28,
    material: "plastic-abs",
    materialLabel: "Plastic - ABS",
    productHint: "magazine",
    notes: "Heuristic flat-item lookup. Verify physical dimensions before saving.",
    lookupAliases: ["pmag", "magpul", "magazine", "rifle magazine", "ar15 magazine", "stanag", "223", "556"],
  },
  {
    id: "fallback-pistol-magazine",
    label: "Pistol Magazine",
    category: "other",
    widthMm: 38,
    heightMm: 130,
    thicknessMm: 20,
    material: "plastic-abs",
    materialLabel: "Plastic - ABS",
    productHint: "magazine",
    notes: "Heuristic flat-item lookup. Verify physical dimensions before saving.",
    lookupAliases: ["pistol magazine", "glock magazine", "handgun mag", "9mm magazine", "magazine"],
  },
  {
    id: "fallback-knife-handle",
    label: "Knife Handle / Blade Blank",
    category: "other",
    widthMm: 32,
    heightMm: 118,
    thicknessMm: 6,
    material: "stainless-steel",
    materialLabel: "Stainless Steel",
    productHint: "knife",
    notes: "Heuristic flat-item lookup. Verify physical dimensions before saving.",
    lookupAliases: ["knife", "blade", "pocket knife", "folder", "edc knife"],
  },
];

function buildFlatLookupHaystack(item: FlatBedItem): string {
  const aliases = FLAT_LOOKUP_ALIASES[item.id] ?? [];
  return normalizeLookupText(
    `${item.label} ${item.materialLabel} ${item.material} ${item.category} ${item.productHint ?? ""} ${item.id} ${aliases.join(" ")}`,
  );
}

function scoreFlatLookupTokens(tokens: string[], haystack: string): number {
  if (tokens.length === 0) return 0;

  let score = 0;
  for (const token of tokens) {
    if (FLAT_LOOKUP_STOPWORDS.has(token)) continue;
    if (!haystack.includes(token)) continue;
    score += token.length >= 4 ? 1.4 : 0.7;
  }

  return score / Math.max(1, tokens.filter((token) => !FLAT_LOOKUP_STOPWORDS.has(token)).length);
}

function findFlatItemLookupMatch(input: string): FlatBedItem | null {
  const lookupTokens = tokenizeLookupText(extractLookupText(input));
  if (lookupTokens.length === 0) return null;

  let bestMatch: FlatBedItem | null = null;
  let bestScore = 0;

  for (const item of FLAT_BED_ITEMS) {
    const haystack = buildFlatLookupHaystack(item);
    const score = scoreFlatLookupTokens(lookupTokens, haystack);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = item;
    }
  }

  if (bestScore >= 0.72) return bestMatch;

  let bestFallback: FlatBedItem | null = null;
  let bestFallbackScore = 0;
  for (const fallback of FLAT_LOOKUP_FALLBACKS) {
    const haystack = normalizeLookupText(
      `${fallback.label} ${fallback.materialLabel} ${fallback.material} ${fallback.category} ${fallback.productHint ?? ""} ${fallback.lookupAliases.join(" ")}`,
    );
    const score = scoreFlatLookupTokens(lookupTokens, haystack);
    if (score > bestFallbackScore) {
      bestFallbackScore = score;
      bestFallback = fallback;
    }
  }

  return bestFallbackScore >= 0.6 ? bestFallback : null;
}

function inferLookupProductType(
  lookupText: string,
  result: TumblerItemLookupResponse,
): "tumbler" | "mug" | "bottle" | "flat" {
  const lower = lookupText.toLowerCase();
  if (/\bmug\b/.test(lower)) return "mug";
  if (/\bbottle\b|\bflask\b|\bcanteen\b/.test(lower)) return "bottle";
  if (
    result.matchedProfileId ||
    result.dimensions.outsideDiameterMm ||
    result.dimensions.topDiameterMm ||
    result.dimensions.bottomDiameterMm ||
    /\btumbler\b|\bquencher\b|\brambler\b|\biceflow\b|\btravel cup\b/.test(lower)
  ) {
    return "tumbler";
  }
  return "flat";
}

function getFlatModelStrategyLabel(strategy: FlatItemLookupResponse["modelStrategy"]): string {
  switch (strategy) {
    case "page-model":
      return "Source model";
    case "image-trace":
      return "Traced silhouette";
    case "family-generated":
    default:
      return "Proxy family shape";
  }
}

function getFlatLookupModeLabel(mode: FlatItemLookupResponse["mode"]): string {
  switch (mode) {
    case "catalog-match":
      return "Catalog match";
    case "family-fallback":
      return "Family fallback";
    case "metadata-fallback":
      return "Metadata match";
    case "safe-fallback":
    default:
      return "Safe fallback";
  }
}

function formatFlatTraceQuality(score: number | null | undefined): string | null {
  if (typeof score !== "number" || !Number.isFinite(score) || score <= 0) return null;
  const normalized = Math.max(0, Math.min(100, Math.round((score / 1.4) * 100)));
  return `${normalized}% trace quality`;
}

function getFlatLookupNotice(result: FlatItemLookupResponse): string | null {
  if (result.isProxy) {
    return "Proxy family shape only. Use it for rough preview and dimensions, then replace it with a real source model or a cleaner product photo before production.";
  }
  if (result.modelStrategy === "image-trace") {
    const quality = formatFlatTraceQuality(result.traceScore);
    return quality
      ? `Traced from a pulled product image. Review the outline before treating this model as final (${quality}).`
      : "Traced from a pulled product image. Review the outline before treating this model as final.";
  }
  return null;
}

function getFlatGlbStatusLabel(result: FlatItemLookupResponse | null): string | null {
  if (!result) return null;
  if (result.isProxy) return "Proxy model";
  if (result.requiresReview) return "Review model";
  return null;
}

function getDrinkwareGlbStatusLabel(
  status: ProductTemplate["glbStatus"] | null | undefined,
): string | null {
  switch (status) {
    case "verified-product-model":
      return "Verified product model";
    case "placeholder-model":
      return "Placeholder model";
    case "missing-model":
      return "Missing model";
    default:
      return null;
  }
}

function getPreviewModelModeLabel(args: {
  productType: ProductTemplate["productType"] | "" | null;
  mode: PreviewModelMode;
  glbStatus?: ProductTemplate["glbStatus"] | null;
}): string {
  if (args.productType === "flat") {
    return "SOURCE MODEL";
  }
  if (args.mode === "alignment-model") {
    return "ALIGNMENT MODEL · DEFAULT";
  }
  if (args.mode === "full-model") {
    return "FULL MODEL · VISUAL";
  }
  if (args.glbStatus === "placeholder-model") {
    return "PLACEHOLDER MODEL · COMPARE";
  }
  return "SOURCE MODEL · COMPARE";
}

function inferDrinkwareGlbStatus(args: {
  productType: ProductTemplate["productType"] | "" | null;
  glbPath: string;
  lookupResult: TumblerItemLookupResponse | null;
  editingTemplate?: ProductTemplate;
}): {
  status: ProductTemplate["glbStatus"];
  sourceLabel: string | null;
} | null {
  if (!args.productType || args.productType === "flat") return null;
  const trimmedPath = args.glbPath.trim();
  if (!trimmedPath) {
    return {
      status: "missing-model",
      sourceLabel: "No product model is attached yet.",
    };
  }

  if (args.lookupResult?.glbPath?.trim() === trimmedPath) {
    return {
      status: args.lookupResult.modelStatus ?? "verified-product-model",
      sourceLabel: args.lookupResult.modelSourceLabel ?? null,
    };
  }

  if (args.editingTemplate?.glbPath?.trim() === trimmedPath) {
    return {
      status: args.editingTemplate.glbStatus ?? "verified-product-model",
      sourceLabel: args.editingTemplate.glbSourceLabel ?? null,
    };
  }

  if (/\/models\/templates\/40oz-yeti\.glb$/i.test(trimmedPath)) {
    return {
      status: "placeholder-model",
      sourceLabel: "Generic 40oz tumbler placeholder",
    };
  }

  return {
    status: trimmedPath.startsWith("/models/generated/")
      ? "verified-product-model"
      : "verified-product-model",
    sourceLabel: trimmedPath.startsWith("/models/generated/")
      ? "Generated product-specific model"
      : "Resolved model file",
  };
}

function inferTemplateMaterial(
  editingTemplate: ProductTemplate | undefined,
  flatLookupMatch: FlatBedItem | null,
  flatLookupResult: FlatItemLookupResponse | null,
  resolvedMaterialSlug: string,
  resolvedMaterialLabel: string,
  materialProfileId: string,
): Pick<ProductTemplate, "materialSlug" | "materialLabel"> {
  if (flatLookupMatch) {
    return {
      materialSlug: flatLookupMatch.material,
      materialLabel: flatLookupMatch.materialLabel,
    };
  }

  if (flatLookupResult?.material) {
    return {
      materialSlug: flatLookupResult.material,
      materialLabel: flatLookupResult.materialLabel,
    };
  }

  if (resolvedMaterialSlug || resolvedMaterialLabel) {
    return {
      materialSlug: resolvedMaterialSlug || editingTemplate?.materialSlug,
      materialLabel: resolvedMaterialLabel || editingTemplate?.materialLabel,
    };
  }

  const materialProfile = getMaterialProfileById(materialProfileId);
  if (materialProfile) {
    switch (materialProfile.finishType) {
      case "powder-coat":
        return { materialSlug: "powder-coat", materialLabel: "Powder Coat" };
      case "raw-stainless":
        return { materialSlug: "stainless-steel", materialLabel: "Stainless Steel" };
      case "painted":
        return { materialSlug: "painted-metal", materialLabel: "Painted Metal" };
      case "anodized":
        return { materialSlug: "anodized-aluminum", materialLabel: "Anodized Aluminum" };
      case "chrome-plated":
        return { materialSlug: "painted-metal", materialLabel: "Chrome-Plated Metal" };
      case "matte-finish":
        return { materialSlug: "painted-metal", materialLabel: "Matte Finish Metal" };
      default:
        break;
    }
  }

  return {
    materialSlug: editingTemplate?.materialSlug,
    materialLabel: editingTemplate?.materialLabel,
  };
}

function parseCapacityOzValue(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/([0-9]+(?:\.[0-9]+)?)\s*oz/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

const LOCKED_WRAP_DIAMETER_TOLERANCE_MM = 0.5;

export const TemplateCreateForm = React.forwardRef<TemplateCreateFormHandle, Props>(function TemplateCreateForm(
  { onSave, onCancel, editingTemplate, showActions = true }: Props,
  ref,
) {
  type TemplateLaserType = ProductTemplate["laserType"] | "";
  type TemplateProductType = ProductTemplate["productType"] | "";
  const isEdit = Boolean(editingTemplate);
  const derivedEditingDims = React.useMemo(
    () => (editingTemplate ? getEngravableDimensions(editingTemplate) : null),
    [editingTemplate],
  );
  const editingMatchedProfile = React.useMemo(() => {
    if (!editingTemplate || editingTemplate.productType === "flat") return null;
    const profileId = findTumblerProfileIdForBrandModel({
      brand: editingTemplate.brand,
      model: editingTemplate.name,
      capacityOz: parseCapacityOzValue(editingTemplate.capacity),
    });
    return profileId ? getTumblerProfileById(profileId) : null;
  }, [editingTemplate]);
  const editingHasExplicitMargins =
    editingTemplate?.dimensions.topMarginMm != null ||
    editingTemplate?.dimensions.bottomMarginMm != null;
  const editingBodyDiameterMm =
    editingTemplate?.productType === "flat"
      ? 0
      : (editingTemplate ? getTemplateBodyDiameterMm(editingTemplate) : 0);
  const editingTopOuterDiameterMm =
    editingTemplate?.productType === "flat"
      ? 0
      : (
          editingTemplate
            ? (getTemplateTopOuterDiameterMm(editingTemplate) ??
              editingMatchedProfile?.topDiameterMm ??
              getTemplateBodyDiameterMm(editingTemplate))
            : 0
        );
  const editingBaseDiameterMm =
    editingTemplate?.productType === "flat"
      ? 0
      : (
          editingTemplate
            ? (getTemplateBaseDiameterMm(editingTemplate) ??
              editingMatchedProfile?.bottomDiameterMm ??
              getTemplateBodyDiameterMm(editingTemplate))
            : 0
        );

  // ── Product identity ─────────────────────────────────────────────
  const [name, setName] = React.useState(editingTemplate?.name ?? "");
  const [brand, setBrand] = React.useState(editingTemplate?.brand ?? "");
  const [capacity, setCapacity] = React.useState(editingTemplate?.capacity ?? "");
  const [laserType, setLaserType] = React.useState<TemplateLaserType>(
    editingTemplate?.laserType ?? ""
  );
  const [productType, setProductType] = React.useState<TemplateProductType>(
    editingTemplate?.productType ?? ""
  );
  const [resolvedMaterialSlug, setResolvedMaterialSlug] = React.useState(editingTemplate?.materialSlug ?? "");
  const [resolvedMaterialLabel, setResolvedMaterialLabel] = React.useState(editingTemplate?.materialLabel ?? "");

  // ── Files ────────────────────────────────────────────────────────
  const [thumbDataUrl, setThumbDataUrl] = React.useState(editingTemplate?.thumbnailDataUrl ?? "");
  const [glbPath, setGlbPath] = React.useState(editingTemplate?.glbPath ?? "");
  const [glbFileName, setGlbFileName] = React.useState<string | null>(null);
  const [glbUploading, setGlbUploading] = React.useState(false);
  const [glbUploadError, setGlbUploadError] = React.useState<string | null>(null);
  const [checkingGlbPath, setCheckingGlbPath] = React.useState(false);
  const [previewModelFile, setPreviewModelFile] = React.useState<File | null>(null);
  const [previewLoadError, setPreviewLoadError] = React.useState<string | null>(null);
  const [productImageFile, setProductImageFile] = React.useState<File | null>(null);
  const [productImageLabel, setProductImageLabel] = React.useState<string | null>(
    editingTemplate?.productPhotoFullUrl ? "Saved product photo" : null,
  );
  const [productPhotoFullUrl, setProductPhotoFullUrl] = React.useState(editingTemplate?.productPhotoFullUrl ?? "");
  const [manufacturerLogoStamp, setManufacturerLogoStamp] = React.useState(
    editingTemplate?.manufacturerLogoStamp,
  );
  const [detectedManufacturerLogoStamp, setDetectedManufacturerLogoStamp] = React.useState(
    editingTemplate?.manufacturerLogoStamp,
  );

  // ── Auto-detect ──────────────────────────────────────────────────
  const [detecting, setDetecting] = React.useState(false);
  const [detectResult, setDetectResult] = React.useState<AutoDetectResult | null>(null);
  const [detectError, setDetectError] = React.useState<string | null>(null);
  const [lookupInput, setLookupInput] = React.useState("");
  const [lookingUpItem, setLookingUpItem] = React.useState(false);
  const [lookupResult, setLookupResult] = React.useState<TumblerItemLookupResponse | null>(null);
  const [flatLookupResult, setFlatLookupResult] = React.useState<FlatItemLookupResponse | null>(null);
  const [flatLookupMatch, setFlatLookupMatch] = React.useState<FlatBedItem | null>(null);
  const [lookupError, setLookupError] = React.useState<string | null>(null);
  const [lookupDebugImageUrl, setLookupDebugImageUrl] = React.useState("");
  const [batchImportUrl, setBatchImportUrl] = React.useState("");
  const [isBatchImporting, setIsBatchImporting] = React.useState(false);
  const [batchImportStatus, setBatchImportStatus] = React.useState<string | null>(null);
  const [batchImportError, setBatchImportError] = React.useState<string | null>(null);
  const [batchImportSummary, setBatchImportSummary] = React.useState<CatalogBatchImportSummary | null>(null);
  const [smartLookupApplied, setSmartLookupApplied] = React.useState(false);
  const clearLookupState = React.useCallback((options?: { keepInput?: boolean; clearFamilyKey?: boolean }) => {
    autoZoneSignatureRef.current = "";
    bodyOutlineSeedSignatureRef.current = "";
    setLookupResult(null);
    setFlatLookupResult(null);
    setFlatLookupMatch(null);
    setLookupError(null);
    setLookupDebugImageUrl("");
    if (options?.clearFamilyKey) {
      setFlatFamilyKey("");
    }
    if (!options?.keepInput) {
      setLookupInput("");
    }
  }, []);

  // ── Dimensions ───────────────────────────────────────────────────
  const [diameterMm, setDiameterMm] = React.useState(editingBodyDiameterMm);
  const [wrapWidthInputMm, setWrapWidthInputMm] = React.useState(
    editingTemplate?.productType === "flat"
      ? 0
      : round2(
          editingTemplate?.dimensions.templateWidthMm && editingTemplate.dimensions.templateWidthMm > 0
            ? editingTemplate.dimensions.templateWidthMm
            : Math.PI * editingBodyDiameterMm,
        ),
  );
  const [advancedGeometryOverridesUnlocked, setAdvancedGeometryOverridesUnlocked] = React.useState(
    editingTemplate?.dimensions.advancedGeometryOverridesUnlocked ?? false,
  );
  const [topOuterDiameterMm, setTopOuterDiameterMm] = React.useState(editingTopOuterDiameterMm);
  const [baseDiameterMm, setBaseDiameterMm] = React.useState(editingBaseDiameterMm);
  const [flatWidthMm, setFlatWidthMm] = React.useState(
    editingTemplate?.productType === "flat" ? editingTemplate.dimensions.templateWidthMm : 0,
  );
  const [flatThicknessMm, setFlatThicknessMm] = React.useState(
    editingTemplate?.productType === "flat" ? (editingTemplate.dimensions.flatThicknessMm ?? 0) : 0,
  );
  const [flatFamilyKey, setFlatFamilyKey] = React.useState(
    editingTemplate?.productType === "flat"
      ? inferFlatFamilyKey({
          familyKey: editingTemplate.dimensions.flatFamilyKey,
          glbPath: editingTemplate.glbPath,
          label: editingTemplate.name,
        })
      : "",
  );
  const [printHeightMm, setPrintHeightMm] = React.useState(
    editingTemplate
      ? (!editingHasExplicitMargins && derivedEditingDims
          ? derivedEditingDims.engravableHeightMm
          : editingTemplate.dimensions.printHeightMm)
      : 0,
  );
  const [handleArcDeg, setHandleArcDeg] = React.useState(() => {
    const saved = editingTemplate?.dimensions.handleArcDeg;
    if (saved != null) return saved;
    return 0;
  });
  const [taperCorrection, setTaperCorrection] = React.useState<"none" | "top-narrow" | "bottom-narrow">(
    editingTemplate?.dimensions.taperCorrection ?? "none"
  );
  const [overallHeightMm, setOverallHeightMm] = React.useState(
    editingTemplate?.dimensions.overallHeightMm ?? derivedEditingDims?.totalHeightMm ?? 0,
  );
  const [bodyTopFromOverallMm, setBodyTopFromOverallMm] = React.useState(
    editingTemplate?.dimensions.bodyTopFromOverallMm ?? derivedEditingDims?.bodyTopOffsetMm ?? 0,
  );
  const [bodyBottomFromOverallMm, setBodyBottomFromOverallMm] = React.useState(
    editingTemplate?.dimensions.bodyBottomFromOverallMm ??
      (
        derivedEditingDims?.bodyBottomOffsetMm ??
        (editingTemplate?.dimensions.overallHeightMm != null && editingTemplate?.dimensions.bottomMarginMm != null
          ? editingTemplate.dimensions.overallHeightMm - editingTemplate.dimensions.bottomMarginMm
          : 0)
      ),
  );
  const [lidSeamFromOverallMm, setLidSeamFromOverallMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.lidSeamFromOverallMm,
  );
  const [silverBandBottomFromOverallMm, setSilverBandBottomFromOverallMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.silverBandBottomFromOverallMm,
  );
  const [printableSurfaceDetection, setPrintableSurfaceDetection] = React.useState<PrintableSurfaceDetection | null>(null);
  const [printableTopOverrideMm, setPrintableTopOverrideMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.printableTopOverrideMm,
  );
  const [printableBottomOverrideMm, setPrintableBottomOverrideMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.printableBottomOverrideMm,
  );
  const [handleTopFromOverallMm, setHandleTopFromOverallMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.handleTopFromOverallMm,
  );
  const [handleBottomFromOverallMm, setHandleBottomFromOverallMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.handleBottomFromOverallMm,
  );
  const [handleReachMm, setHandleReachMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.handleReachMm,
  );
  const [canonicalHandleProfile, setCanonicalHandleProfile] = React.useState<CanonicalHandleProfile | undefined>(
    editingTemplate?.dimensions.canonicalHandleProfile,
  );
  const [shoulderDiameterMm, setShoulderDiameterMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.shoulderDiameterMm,
  );
  const [taperUpperDiameterMm, setTaperUpperDiameterMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.taperUpperDiameterMm,
  );
  const [taperLowerDiameterMm, setTaperLowerDiameterMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.taperLowerDiameterMm,
  );
  const [bevelDiameterMm, setBevelDiameterMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.bevelDiameterMm,
  );
  const [bodyOutlineProfile, setBodyOutlineProfile] = React.useState<EditableBodyOutline | undefined>(
    resolveReferencePaths(editingTemplate?.dimensions).bodyOutline ?? undefined,
  );
  const [referencePaths, setReferencePaths] = React.useState<ReferencePaths>(
    resolveReferencePaths(editingTemplate?.dimensions),
  );
  const [referenceLayerState, setReferenceLayerState] = React.useState<ReferenceLayerState>(
    resolveReferenceLayerState(editingTemplate?.dimensions),
  );
  const [topMarginMm, setTopMarginMm] = React.useState(
    editingTemplate?.dimensions.topMarginMm ?? derivedEditingDims?.topMarginMm ?? 0,
  );
  const [bottomMarginMm, setBottomMarginMm] = React.useState(
    editingTemplate?.dimensions.bottomMarginMm ?? derivedEditingDims?.bottomMarginMm ?? 0,
  );
  const activeFlatLookupModel = React.useMemo(() => {
    if (productType !== "flat" || !flatLookupResult) return null;
    const trimmedLookupPath = flatLookupResult.glbPath.trim();
    const trimmedActivePath = glbPath.trim();
    if (!trimmedLookupPath || trimmedLookupPath !== trimmedActivePath) return null;
    return flatLookupResult;
  }, [flatLookupResult, glbPath, productType]);
  const activeDrinkwareGlbStatus = React.useMemo(() => inferDrinkwareGlbStatus({
    productType,
    glbPath,
    lookupResult,
    editingTemplate,
  }), [editingTemplate, glbPath, lookupResult, productType]);
  const [previewModelMode, setPreviewModelMode] = React.useState<PreviewModelMode>(
    productType !== "flat" ? "alignment-model" : "source-traced",
  );
  const previewModeUserSelectedRef = React.useRef(false);
  const handlePreviewModelModeChange = React.useCallback((nextMode: PreviewModelMode) => {
    previewModeUserSelectedRef.current = true;
    setPreviewModelMode(nextMode);
  }, []);
  const legacyReferencePhotoScalePct = editingTemplate?.dimensions.referencePhotoScalePct ?? 100;
  const [referencePhotoWidthScalePct, setReferencePhotoWidthScalePct] = React.useState(
    editingTemplate?.dimensions.referencePhotoWidthScalePct ?? legacyReferencePhotoScalePct,
  );
  const [referencePhotoHeightScalePct, setReferencePhotoHeightScalePct] = React.useState(
    editingTemplate?.dimensions.referencePhotoHeightScalePct ?? legacyReferencePhotoScalePct,
  );
  const [referencePhotoLockAspect, setReferencePhotoLockAspect] = React.useState(
    editingTemplate?.dimensions.referencePhotoLockAspect ?? true,
  );
  const [referencePhotoOffsetXPct, setReferencePhotoOffsetXPct] = React.useState(
    editingTemplate?.dimensions.referencePhotoOffsetXPct ?? 0,
  );
  const [referencePhotoOffsetYPct, setReferencePhotoOffsetYPct] = React.useState(
    editingTemplate?.dimensions.referencePhotoOffsetYPct ?? 0,
  );
  const [referencePhotoAnchorY, setReferencePhotoAnchorY] = React.useState<"center" | "bottom">(
    editingTemplate?.dimensions.referencePhotoAnchorY ?? "center",
  );
  const [referencePhotoCenterMode, setReferencePhotoCenterMode] = React.useState<"body" | "photo">(
    editingTemplate?.dimensions.referencePhotoCenterMode ?? "body",
  );
  const [bodyColorHex, setBodyColorHex] = React.useState(
    editingTemplate?.dimensions.bodyColorHex ?? "#b0b8c4",
  );
  const [rimColorHex, setRimColorHex] = React.useState(
    editingTemplate?.dimensions.rimColorHex ?? "#d0d0d0",
  );

  const lockedProductionGeometry = productType !== "flat" && !advancedGeometryOverridesUnlocked;
  const derivedCylinderDiameterMm = productType === "flat"
    ? 0
    : (wrapWidthInputMm > 0 ? round2(wrapWidthInputMm / Math.PI) : 0);
  const effectiveCylinderDiameterMm = productType === "flat"
    ? 0
    : (lockedProductionGeometry ? derivedCylinderDiameterMm : round2(diameterMm));
  const templateWidthMm = productType === "flat"
    ? round2(flatWidthMm)
    : round2(
        lockedProductionGeometry
          ? wrapWidthInputMm
          : (diameterMm > 0 ? Math.PI * diameterMm : wrapWidthInputMm),
      );
  const liveFlatPreview = React.useMemo<FlatPreviewDimensions | null>(() => {
    if (productType !== "flat" || flatWidthMm <= 0 || printHeightMm <= 0) return null;
    return {
      widthMm: round2(flatWidthMm),
      heightMm: round2(printHeightMm),
      thicknessMm: round2(flatThicknessMm > 0 ? flatThicknessMm : 4),
      familyKey: inferFlatFamilyKey({
        familyKey: flatFamilyKey,
        glbPath,
        label: name.trim(),
      }),
      label: name.trim() || "Flat item",
      material: flatLookupResult?.material ?? flatLookupMatch?.material ?? "",
    };
  }, [productType, flatWidthMm, printHeightMm, flatThicknessMm, flatFamilyKey, glbPath, name, flatLookupResult?.material, flatLookupMatch?.material]);
  React.useEffect(() => {
    if (productType === "flat" || !lockedProductionGeometry) return;
    if (wrapWidthInputMm <= 0 && diameterMm > 0) {
      setWrapWidthInputMm(round2(Math.PI * diameterMm));
      return;
    }
    if (derivedCylinderDiameterMm > 0 && Math.abs(diameterMm - derivedCylinderDiameterMm) > 0.01) {
      setDiameterMm(derivedCylinderDiameterMm);
    }
  }, [derivedCylinderDiameterMm, diameterMm, lockedProductionGeometry, productType, wrapWidthInputMm]);
  React.useEffect(() => {
    setReferencePaths((current) => createReferencePaths({
      bodyOutline: bodyOutlineProfile ?? current.bodyOutline,
      lidProfile: current.lidProfile,
      silverProfile: current.silverProfile,
    }));
  }, [bodyOutlineProfile]);
  const preferGeneratedFlatPreview =
    productType === "flat" &&
    Boolean(glbPath.trim()) &&
    glbPath.startsWith("/models/generated/");

  // ── Laser settings (scoped defaults based on product/laser type) ──
  const scopedDefaults = React.useMemo(
    () => (
      productType && laserType
        ? getDefaultLaserSettings(productType, laserType)
        : { power: 50, speed: 300, frequency: 30, lineInterval: 0.06 }
    ),
    [productType, laserType],
  );
  const [power, setPower] = React.useState(editingTemplate?.laserSettings.power ?? scopedDefaults.power);
  const [speed, setSpeed] = React.useState(editingTemplate?.laserSettings.speed ?? scopedDefaults.speed);
  const [frequency, setFrequency] = React.useState(editingTemplate?.laserSettings.frequency ?? scopedDefaults.frequency);
  const [lineInterval, setLineInterval] = React.useState(editingTemplate?.laserSettings.lineInterval ?? scopedDefaults.lineInterval);
  const [materialProfileId, setMaterialProfileId] = React.useState(editingTemplate?.laserSettings.materialProfileId ?? "");
  const materialProfileTouchedRef = React.useRef(Boolean(editingTemplate?.laserSettings.materialProfileId));

  const applyMaterialProfileSettings = React.useCallback((
    nextMaterialProfileId: string,
    nextLaserType?: TemplateLaserType | null,
    nextProductType?: TemplateProductType | null,
  ) => {
    setMaterialProfileId(nextMaterialProfileId);
    if (!nextMaterialProfileId) return;

    const materialProfile = getMaterialProfileById(nextMaterialProfileId);
    if (!materialProfile) return;

    const resolvedProductType = (nextProductType || productType || "tumbler") as ProductTemplate["productType"];
    const resolvedLaserType = (nextLaserType || materialProfile.laserType) as ProductTemplate["laserType"];
    if (!nextLaserType) {
      setLaserType(materialProfile.laserType);
    }
    const scoped = resolvedLaserType
      ? getDefaultLaserSettings(resolvedProductType, resolvedLaserType)
      : null;

    setPower(materialProfile.powerPct);
    setSpeed(materialProfile.speedMmS);
    setLineInterval(lineIntervalFromLpi(materialProfile.lpi));
    if (scoped) {
      setFrequency(scoped.frequency);
    }
  }, [productType]);

  const applyResolvedDrinkwareMaterial = React.useCallback((args: {
    laserType?: TemplateLaserType | null;
    productType?: TemplateProductType | null;
    explicitFinishType?: TumblerFinish | null;
    materialSlug?: string | null;
    materialLabel?: string | null;
    bodyColorHex?: string | null;
    rimColorHex?: string | null;
    textHints?: Array<string | null | undefined>;
  }) => {
    const materialSetup = resolveTumblerMaterialSetup({
      laserType: (args.laserType || null) as ProductTemplate["laserType"] | null,
      explicitFinishType: args.explicitFinishType ?? null,
      materialSlug: args.materialSlug ?? null,
      materialLabel: args.materialLabel ?? null,
      bodyColorHex: args.bodyColorHex ?? null,
      rimColorHex: args.rimColorHex ?? null,
      textHints: args.textHints,
    });

    if (materialSetup.laserType) {
      setLaserType(materialSetup.laserType);
    }
    setResolvedMaterialSlug(materialSetup.materialSlug ?? "");
    setResolvedMaterialLabel(materialSetup.materialLabel ?? "");
    applyMaterialProfileSettings(
      materialSetup.materialProfileId ?? "",
      materialSetup.laserType,
      args.productType ?? productType,
    );
  }, [applyMaterialProfileSettings, productType]);

  // When product type or laser type changes, update laser settings to new scoped defaults
  // (only for new templates — edits keep their values)
  React.useEffect(() => {
    if (isEdit || !productType || !laserType || materialProfileId) return;
    const defaults = getDefaultLaserSettings(productType, laserType);
    setPower(defaults.power);
    setSpeed(defaults.speed);
    setFrequency(defaults.frequency);
    setLineInterval(defaults.lineInterval);
  }, [productType, laserType, isEdit, materialProfileId]);

  // ── Tumbler mapping ─────────────────────────────────────────────
  const [tumblerMapping, setTumblerMapping] = React.useState<TumblerMapping | undefined>(
    editingTemplate?.tumblerMapping,
  );
  const [showMappingWizard, setShowMappingWizard] = React.useState(false);
  const handleAutoSampleColors = React.useCallback((nextBody: string, nextRim: string) => {
    setBodyColorHex((prev) => (prev === nextBody ? prev : nextBody));
    setRimColorHex((prev) => (prev === nextRim ? prev : nextRim));
    if (!materialProfileTouchedRef.current && productType && productType !== "flat") {
      applyResolvedDrinkwareMaterial({
        laserType,
        productType,
        materialSlug: resolvedMaterialSlug || null,
        materialLabel: resolvedMaterialLabel || null,
        bodyColorHex: nextBody,
        rimColorHex: nextRim,
        textHints: [name, brand, capacity],
      });
    }
  }, [
    applyResolvedDrinkwareMaterial,
    brand,
    capacity,
    laserType,
    name,
    productType,
    resolvedMaterialLabel,
    resolvedMaterialSlug,
  ]);

  const validateGlbPath = React.useCallback(async (candidate: string) => {
    const trimmed = candidate.trim();
    if (!trimmed) return false;
    try {
      const res = await fetch(trimmed, { method: "HEAD" });
      return res.ok || res.status === 405;
    } catch {
      return false;
    }
  }, []);

  const clearMissingGlbPath = React.useCallback((candidate: string) => {
    setGlbFileName(null);
    setGlbPath("");
    setShowMappingWizard(false);
    setGlbUploadError(`Model file not found: ${candidate}`);
  }, []);

  const verifyCurrentGlbPath = React.useCallback(async (options?: { clearOnMissing?: boolean }) => {
    const trimmed = glbPath.trim();
    if (!trimmed) return false;

    setCheckingGlbPath(true);
    const ok = await validateGlbPath(trimmed);
    setCheckingGlbPath(false);

    if (ok) {
      setGlbUploadError((prev) => (
        prev && prev.startsWith("Model file not found:") ? null : prev
      ));
      return true;
    }

    if (options?.clearOnMissing !== false) {
      clearMissingGlbPath(trimmed);
    } else {
      setGlbUploadError(`Model file not found: ${trimmed}`);
    }
    return false;
  }, [clearMissingGlbPath, glbPath, validateGlbPath]);

  React.useEffect(() => {
    if (!editingTemplate?.glbPath) return;
    let cancelled = false;
    setCheckingGlbPath(true);
    validateGlbPath(editingTemplate.glbPath)
      .then((ok) => {
        if (cancelled) return;
        if (!ok && glbPath.trim() === editingTemplate.glbPath.trim()) {
          clearMissingGlbPath(editingTemplate.glbPath);
        }
      })
      .finally(() => {
        if (!cancelled) setCheckingGlbPath(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clearMissingGlbPath, editingTemplate?.glbPath, glbPath, validateGlbPath]);

  React.useEffect(() => {
    const trimmed = glbPath.trim();
    if (!trimmed || !/\.(glb|gltf)$/i.test(trimmed)) {
      setPreviewModelFile(null);
      setPreviewLoadError(null);
      return;
    }
    setPreviewModelFile(null);
    setPreviewLoadError(null);
  }, [glbPath]);

  // ── Front / Back face photos ──────────────────────────────────
  const [frontPhotoDataUrl, setFrontPhotoDataUrl] = React.useState(editingTemplate?.frontPhotoDataUrl ?? "");
  const [backPhotoDataUrl, setBackPhotoDataUrl] = React.useState(editingTemplate?.backPhotoDataUrl ?? "");
  const [frontOriginalUrl, setFrontOriginalUrl] = React.useState("");
  const [backOriginalUrl, setBackOriginalUrl] = React.useState("");
  const [frontCleanUrl, setFrontCleanUrl] = React.useState("");
  const [backCleanUrl, setBackCleanUrl] = React.useState("");
  const [bodyReferencePhotoDataUrl, setBodyReferencePhotoDataUrl] = React.useState("");
  const [productReferenceSet, setProductReferenceSet] = React.useState<ProductReferenceSet | undefined>(
    editingTemplate?.productReferenceSet,
  );
  const [frontBgStatus, setFrontBgStatus] = React.useState<"idle" | "processing" | "done" | "failed">("idle");
  const [backBgStatus, setBackBgStatus] = React.useState<"idle" | "processing" | "done" | "failed">("idle");
  const [frontUseOriginal, setFrontUseOriginal] = React.useState(false);
  const [backUseOriginal, setBackUseOriginal] = React.useState(false);
  const [mirrorForBack, setMirrorForBack] = React.useState(false);
  const autoZoneSignatureRef = React.useRef<string>("");
  const bodyOutlineSeedSignatureRef = React.useRef<string>("");
  const manufacturerLogoSignatureRef = React.useRef<string>("");
  const activeReferencePhotoDataUrl = React.useMemo(
    () => bodyReferencePhotoDataUrl || frontCleanUrl || frontPhotoDataUrl || productPhotoFullUrl || "",
    [bodyReferencePhotoDataUrl, frontCleanUrl, frontPhotoDataUrl, productPhotoFullUrl],
  );
  React.useEffect(() => {
    if (productType === "flat" || !activeReferencePhotoDataUrl) {
      setPrintableSurfaceDetection(null);
    }
  }, [activeReferencePhotoDataUrl, productType]);
  const activeBodyReferenceOutline = referencePaths.bodyOutline ?? bodyOutlineProfile ?? null;
  const calibrationBodyOutline = React.useMemo<EditableBodyOutline | null>(() => {
    if (productType === "flat" || overallHeightMm <= 0 || effectiveCylinderDiameterMm <= 0) {
      return null;
    }
    return activeBodyReferenceOutline ?? createEditableBodyOutline({
      overallHeightMm,
      bodyTopFromOverallMm,
      bodyBottomFromOverallMm,
      diameterMm: effectiveCylinderDiameterMm,
      topOuterDiameterMm: topOuterDiameterMm > 0 ? topOuterDiameterMm : undefined,
      baseDiameterMm: baseDiameterMm > 0 ? baseDiameterMm : undefined,
      shoulderDiameterMm,
      taperUpperDiameterMm,
      taperLowerDiameterMm,
      bevelDiameterMm,
      fitDebug: lookupResult?.fitDebug ?? null,
    });
  }, [
    activeBodyReferenceOutline,
    baseDiameterMm,
    bevelDiameterMm,
    bodyBottomFromOverallMm,
    bodyTopFromOverallMm,
    effectiveCylinderDiameterMm,
    lookupResult?.fitDebug,
    overallHeightMm,
    productType,
    shoulderDiameterMm,
    taperLowerDiameterMm,
    taperUpperDiameterMm,
    topOuterDiameterMm,
  ]);
  const persistedCanonicalBodyProfile = editingTemplate?.dimensions.canonicalBodyProfile ?? null;
  const persistedCanonicalDimensionCalibration = editingTemplate?.dimensions.canonicalDimensionCalibration ?? null;
  const persistedPrintableSurfaceResolution = React.useMemo(
    () => (editingTemplate
      ? getPrintableSurfaceResolutionFromDimensions(
          editingTemplate.dimensions,
          editingTemplate.dimensions.canonicalDimensionCalibration,
        )
      : null),
    [editingTemplate],
  );
  const activeCanonicalBodyProfile = React.useMemo<CanonicalBodyProfile | null>(() => {
    if (productType === "flat" || !overallHeightMm || !calibrationBodyOutline) return persistedCanonicalBodyProfile;
    return buildCanonicalBodyProfile({
      outline: calibrationBodyOutline,
      overallHeightMm,
      bodyTopFromOverallMm,
      bodyBottomFromOverallMm,
      bodyDiameterMm: effectiveCylinderDiameterMm,
      fitDebug: lookupResult?.fitDebug ?? null,
    }) ?? persistedCanonicalBodyProfile;
  }, [
    bodyBottomFromOverallMm,
    bodyTopFromOverallMm,
    calibrationBodyOutline,
    effectiveCylinderDiameterMm,
    persistedCanonicalBodyProfile,
    lookupResult?.fitDebug,
    overallHeightMm,
    productType,
  ]);
  const provisionalCanonicalDimensionCalibration = React.useMemo<CanonicalDimensionCalibration | null>(() => {
    if (productType === "flat" || !overallHeightMm || effectiveCylinderDiameterMm <= 0 || !calibrationBodyOutline) {
      return persistedCanonicalDimensionCalibration;
    }
    return buildCanonicalDimensionCalibration({
      outline: calibrationBodyOutline,
      overallHeightMm,
      bodyTopFromOverallMm,
      bodyBottomFromOverallMm,
      wrapDiameterMm: effectiveCylinderDiameterMm,
      baseDiameterMm,
      handleArcDeg,
      fitDebug: lookupResult?.fitDebug ?? null,
    }) ?? persistedCanonicalDimensionCalibration;
  }, [
    baseDiameterMm,
    bodyBottomFromOverallMm,
    bodyTopFromOverallMm,
    calibrationBodyOutline,
    effectiveCylinderDiameterMm,
    handleArcDeg,
    lookupResult?.fitDebug,
    overallHeightMm,
    persistedCanonicalDimensionCalibration,
    productType,
  ]);
  const usePersistedPrintableSurfaceFallback =
    productType !== "flat" &&
    !printableSurfaceDetection &&
    !Number.isFinite(silverBandBottomFromOverallMm) &&
    !Number.isFinite(printableTopOverrideMm) &&
    !Number.isFinite(printableBottomOverrideMm) &&
    Boolean(persistedPrintableSurfaceResolution);
  const persistedLidBoundaryMm = persistedPrintableSurfaceResolution?.printableSurfaceContract.axialExclusions.find((band) => band.kind === "lid")?.endMm;
  const persistedBaseBandStartMm = persistedPrintableSurfaceResolution?.printableSurfaceContract.axialExclusions.find((band) => band.kind === "base")?.startMm;
  const activePrintableSurfaceResolution = React.useMemo(() => {
    if (
      productType === "flat" ||
      overallHeightMm <= 0 ||
      !Number.isFinite(bodyTopFromOverallMm) ||
      !Number.isFinite(bodyBottomFromOverallMm) ||
      bodyBottomFromOverallMm <= bodyTopFromOverallMm
    ) {
      return persistedPrintableSurfaceResolution;
    }

    return buildPrintableSurfaceResolution({
      overallHeightMm,
      bodyTopFromOverallMm,
      bodyBottomFromOverallMm,
      lidSeamFromOverallMm:
        lidSeamFromOverallMm ??
        (usePersistedPrintableSurfaceFallback ? persistedLidBoundaryMm : undefined),
      silverBandBottomFromOverallMm,
      printableTopOverrideMm:
        printableTopOverrideMm ??
        (usePersistedPrintableSurfaceFallback
          ? persistedPrintableSurfaceResolution?.printableSurfaceContract.printableTopMm
          : undefined),
      printableBottomOverrideMm:
        printableBottomOverrideMm ??
        (usePersistedPrintableSurfaceFallback
          ? persistedPrintableSurfaceResolution?.printableSurfaceContract.printableBottomMm
          : undefined),
      baseBandStartMm: usePersistedPrintableSurfaceFallback ? persistedBaseBandStartMm : undefined,
      handleKeepOutStartMm:
        provisionalCanonicalDimensionCalibration?.wrapMappingMm.handleKeepOutStartMm ??
        persistedCanonicalDimensionCalibration?.wrapMappingMm.handleKeepOutStartMm,
      handleKeepOutEndMm:
        provisionalCanonicalDimensionCalibration?.wrapMappingMm.handleKeepOutEndMm ??
        persistedCanonicalDimensionCalibration?.wrapMappingMm.handleKeepOutEndMm,
      detection: printableSurfaceDetection,
    });
  }, [
    bodyBottomFromOverallMm,
    bodyTopFromOverallMm,
    lidSeamFromOverallMm,
    overallHeightMm,
    persistedBaseBandStartMm,
    persistedCanonicalDimensionCalibration?.wrapMappingMm.handleKeepOutEndMm,
    persistedCanonicalDimensionCalibration?.wrapMappingMm.handleKeepOutStartMm,
    persistedLidBoundaryMm,
    persistedPrintableSurfaceResolution,
    printableBottomOverrideMm,
    printableSurfaceDetection,
    printableTopOverrideMm,
    productType,
    provisionalCanonicalDimensionCalibration?.wrapMappingMm.handleKeepOutEndMm,
    provisionalCanonicalDimensionCalibration?.wrapMappingMm.handleKeepOutStartMm,
    silverBandBottomFromOverallMm,
    usePersistedPrintableSurfaceFallback,
  ]);
  const activeCanonicalDimensionCalibration = React.useMemo<CanonicalDimensionCalibration | null>(() => {
    if (productType === "flat" || !overallHeightMm || effectiveCylinderDiameterMm <= 0 || !calibrationBodyOutline) {
      return persistedCanonicalDimensionCalibration;
    }
    return buildCanonicalDimensionCalibration({
      outline: calibrationBodyOutline,
      overallHeightMm,
      bodyTopFromOverallMm,
      bodyBottomFromOverallMm,
      wrapDiameterMm: effectiveCylinderDiameterMm,
      baseDiameterMm,
      handleArcDeg,
      axialSurfaceBands: activePrintableSurfaceResolution?.axialSurfaceBands ?? null,
      printableSurfaceContract: activePrintableSurfaceResolution?.printableSurfaceContract ?? null,
      fitDebug: lookupResult?.fitDebug ?? null,
    }) ?? provisionalCanonicalDimensionCalibration ?? persistedCanonicalDimensionCalibration;
  }, [
    activePrintableSurfaceResolution?.axialSurfaceBands,
    activePrintableSurfaceResolution?.printableSurfaceContract,
    baseDiameterMm,
    bodyBottomFromOverallMm,
    bodyTopFromOverallMm,
    calibrationBodyOutline,
    effectiveCylinderDiameterMm,
    handleArcDeg,
    lookupResult?.fitDebug,
    overallHeightMm,
    persistedCanonicalDimensionCalibration,
    productType,
    provisionalCanonicalDimensionCalibration,
  ]);
  const previewPrintableSurfaceContract = React.useMemo(() => {
    if (productType === "flat" || overallHeightMm <= 0) {
      return activePrintableSurfaceResolution?.printableSurfaceContract ?? null;
    }
    if (activePrintableSurfaceResolution?.printableSurfaceContract) {
      return activePrintableSurfaceResolution.printableSurfaceContract;
    }

    const fallbackBodyTopMm = Number.isFinite(bodyTopFromOverallMm)
      ? Math.max(0, bodyTopFromOverallMm)
      : (Number.isFinite(topMarginMm) ? Math.max(0, topMarginMm) : null);
    const fallbackBodyBottomMm = Number.isFinite(bodyBottomFromOverallMm)
      ? bodyBottomFromOverallMm
      : (
          Number.isFinite(bottomMarginMm)
            ? Math.max((fallbackBodyTopMm ?? 0) + 1, overallHeightMm - bottomMarginMm)
            : null
        );
    if (
      fallbackBodyTopMm == null ||
      fallbackBodyBottomMm == null ||
      !Number.isFinite(fallbackBodyTopMm) ||
      !Number.isFinite(fallbackBodyBottomMm) ||
      fallbackBodyBottomMm <= fallbackBodyTopMm
    ) {
      return null;
    }

    return buildPrintableSurfaceResolution({
      overallHeightMm,
      bodyTopFromOverallMm: fallbackBodyTopMm,
      bodyBottomFromOverallMm: fallbackBodyBottomMm,
      lidSeamFromOverallMm,
      silverBandBottomFromOverallMm,
      printableTopOverrideMm,
      printableBottomOverrideMm,
      handleKeepOutStartMm:
        activeCanonicalDimensionCalibration?.wrapMappingMm.handleKeepOutStartMm ??
        provisionalCanonicalDimensionCalibration?.wrapMappingMm.handleKeepOutStartMm ??
        persistedCanonicalDimensionCalibration?.wrapMappingMm.handleKeepOutStartMm,
      handleKeepOutEndMm:
        activeCanonicalDimensionCalibration?.wrapMappingMm.handleKeepOutEndMm ??
        provisionalCanonicalDimensionCalibration?.wrapMappingMm.handleKeepOutEndMm ??
        persistedCanonicalDimensionCalibration?.wrapMappingMm.handleKeepOutEndMm,
      detection: printableSurfaceDetection,
    }).printableSurfaceContract;
  }, [
    activeCanonicalDimensionCalibration?.wrapMappingMm.handleKeepOutEndMm,
    activeCanonicalDimensionCalibration?.wrapMappingMm.handleKeepOutStartMm,
    activePrintableSurfaceResolution?.printableSurfaceContract,
    bodyBottomFromOverallMm,
    bodyTopFromOverallMm,
    bottomMarginMm,
    lidSeamFromOverallMm,
    overallHeightMm,
    persistedCanonicalDimensionCalibration?.wrapMappingMm.handleKeepOutEndMm,
    persistedCanonicalDimensionCalibration?.wrapMappingMm.handleKeepOutStartMm,
    printableBottomOverrideMm,
    printableSurfaceDetection,
    printableTopOverrideMm,
    productType,
    provisionalCanonicalDimensionCalibration?.wrapMappingMm.handleKeepOutEndMm,
    provisionalCanonicalDimensionCalibration?.wrapMappingMm.handleKeepOutStartMm,
    silverBandBottomFromOverallMm,
    topMarginMm,
  ]);
  const liveTumblerDims = React.useMemo<TumblerDimensions | null>(() => {
    if (!productType || productType === "flat" || effectiveCylinderDiameterMm <= 0 || printHeightMm <= 0) return null;
    const printableSurfaceContract = previewPrintableSurfaceContract;
    const resolvedPrintableHeightMm =
      printableSurfaceContract?.printableHeightMm && printableSurfaceContract.printableHeightMm > 0
        ? printableSurfaceContract.printableHeightMm
        : printHeightMm;
    const resolvedPrintableTopOffsetMm =
      overallHeightMm > 0 && Number.isFinite(printableSurfaceContract?.printableTopMm)
        ? round2(Math.max(0, printableSurfaceContract?.printableTopMm ?? 0))
        : topMarginMm > 0
          ? round2(topMarginMm)
          : undefined;

    return {
      overallHeightMm: overallHeightMm > 0 ? round2(overallHeightMm) : round2(printHeightMm),
      diameterMm: round2(effectiveCylinderDiameterMm),
      topDiameterMm: topOuterDiameterMm > 0 ? round2(topOuterDiameterMm) : undefined,
      bottomDiameterMm: baseDiameterMm > 0 ? round2(baseDiameterMm) : undefined,
      bodyTopOffsetMm: overallHeightMm > 0 ? round2(Math.max(0, bodyTopFromOverallMm)) : undefined,
      bodyHeightMm:
        overallHeightMm > 0
          ? round2(Math.max(0, bodyBottomFromOverallMm - bodyTopFromOverallMm))
          : undefined,
      printableHeightMm: round2(resolvedPrintableHeightMm),
      printableTopOffsetMm: resolvedPrintableTopOffsetMm,
      lidSeamFromOverallMm:
        overallHeightMm > 0 && Number.isFinite(lidSeamFromOverallMm)
          ? round2(Math.max(0, lidSeamFromOverallMm ?? 0))
          : undefined,
      silverBandBottomFromOverallMm:
        overallHeightMm > 0 && Number.isFinite(silverBandBottomFromOverallMm)
          ? round2(Math.max(0, silverBandBottomFromOverallMm ?? 0))
          : undefined,
    };
  }, [
    previewPrintableSurfaceContract,
    productType,
    effectiveCylinderDiameterMm,
    topOuterDiameterMm,
    baseDiameterMm,
    bodyBottomFromOverallMm,
    bodyTopFromOverallMm,
    printHeightMm,
    overallHeightMm,
    topMarginMm,
    lidSeamFromOverallMm,
    silverBandBottomFromOverallMm,
  ]);
  const referenceSelection = productReferenceSet?.canonicalViewSelection;
  const referenceImagesById = React.useMemo(() => {
    const nextMap = new Map<string, ProductReferenceSet["images"][number]>();
    for (const image of productReferenceSet?.images ?? []) {
      nextMap.set(image.id, image);
    }
    return nextMap;
  }, [productReferenceSet]);
  const canUseCanonicalPreviewModel = productType !== "flat" &&
    Boolean(activeCanonicalBodyProfile && activeCanonicalDimensionCalibration);
  const hasAlignmentPreviewModel = canUseCanonicalPreviewModel;
  const hasFullPreviewModel = canUseCanonicalPreviewModel;
  const hasSourcePreviewModel = React.useMemo(
    () => Boolean(glbPath.trim() || previewModelFile || (productType === "flat" && liveFlatPreview)),
    [glbPath, liveFlatPreview, previewModelFile, productType],
  );
  const previewModeContextKey = React.useMemo(
    () => `${editingTemplate?.id ?? "draft"}:${productType ?? "unknown"}`,
    [editingTemplate?.id, productType],
  );
  const previewModeLastContextRef = React.useRef<string | null>(null);
  const defaultPreviewModelMode = React.useMemo(
    () => resolveDefaultPreviewModelMode({
      productType,
      hasAlignmentPreviewModel,
      hasFullPreviewModel,
      hasSourcePreviewModel,
    }),
    [hasAlignmentPreviewModel, hasFullPreviewModel, hasSourcePreviewModel, productType],
  );
  React.useEffect(() => {
    const contextChanged = previewModeLastContextRef.current !== previewModeContextKey;
    if (contextChanged) {
      previewModeLastContextRef.current = previewModeContextKey;
      previewModeUserSelectedRef.current = false;
    }
    const modeRequiresCanonical = previewModelMode === "alignment-model" || previewModelMode === "full-model";
    const currentModeUnavailable = modeRequiresCanonical
      ? !canUseCanonicalPreviewModel
      : !hasSourcePreviewModel;
    if ((contextChanged || !previewModeUserSelectedRef.current || currentModeUnavailable) && previewModelMode !== defaultPreviewModelMode) {
      setPreviewModelMode(defaultPreviewModelMode);
    }
  }, [
    canUseCanonicalPreviewModel,
    defaultPreviewModelMode,
    hasSourcePreviewModel,
    previewModelMode,
    previewModeContextKey,
  ]);
  const silhouetteMismatchSummary = React.useMemo(
    () => summarizeCanonicalSilhouetteMismatch({
      outline: calibrationBodyOutline,
      bodyProfile: activeCanonicalBodyProfile,
      calibration: activeCanonicalDimensionCalibration,
    }),
    [activeCanonicalBodyProfile, activeCanonicalDimensionCalibration, calibrationBodyOutline],
  );
  const alignmentShellMismatchSummary = React.useMemo(
    () => (
      previewModelMode === "alignment-model" && activeCanonicalBodyProfile?.svgPath && activeCanonicalDimensionCalibration
        ? {
            averageErrorMm: 0,
            maxErrorMm: 0,
            rowCount: Math.max(activeCanonicalBodyProfile.samples.length, 1),
          }
        : silhouetteMismatchSummary
    ),
    [activeCanonicalBodyProfile, activeCanonicalDimensionCalibration, previewModelMode, silhouetteMismatchSummary],
  );
  const silhouetteLockPass = alignmentShellMismatchSummary
    ? alignmentShellMismatchSummary.averageErrorMm <= 0.5 && alignmentShellMismatchSummary.maxErrorMm <= 2.0
    : null;
  const alignmentOrientationQASummary = React.useMemo(
    () => summarizeCanonicalOrientationQA({
      bodyProfile: activeCanonicalBodyProfile,
      calibration: activeCanonicalDimensionCalibration,
    }),
    [activeCanonicalBodyProfile, activeCanonicalDimensionCalibration],
  );
  const orientationLockPass = alignmentOrientationQASummary?.pass ?? null;
  const derivedFrontVisibleWidthMm = productType === "flat"
    ? 0
    : round2(activeCanonicalDimensionCalibration?.frontVisibleWidthMm ?? 0);
  const frontVisibleWidthReady = derivedFrontVisibleWidthMm > 0;
  const derivedDiameterMismatchMm = productType === "flat" || templateWidthMm <= 0 || diameterMm <= 0
    ? 0
    : Math.abs(round2(templateWidthMm / Math.PI) - round2(diameterMm));
  const hasBlockingGeometryMismatch =
    productType !== "flat" &&
    advancedGeometryOverridesUnlocked &&
    derivedDiameterMismatchMm > LOCKED_WRAP_DIAMETER_TOLERANCE_MM;
  const canonicalHandleDebugSummary = React.useMemo(
    () => summarizeCanonicalHandleDebug({
      handleProfile: canonicalHandleProfile,
      calibration: activeCanonicalDimensionCalibration,
    }),
    [activeCanonicalDimensionCalibration, canonicalHandleProfile],
  );
  const canonicalHandleRenderMode = React.useMemo(
    () => resolveCanonicalHandleRenderMode({
      handleProfile: canonicalHandleProfile,
      previewMode: previewModelMode === "source-traced" ? "full-model" : previewModelMode,
    }),
    [canonicalHandleProfile, previewModelMode],
  );
  const canonicalFrontReferenceImage = referenceSelection?.canonicalFrontImageId
    ? (referenceImagesById.get(referenceSelection.canonicalFrontImageId) ?? null)
    : null;
  const canonicalBackReferenceImage = referenceSelection?.canonicalBackImageId
    ? (referenceImagesById.get(referenceSelection.canonicalBackImageId) ?? null)
    : null;
  const auxiliaryBackReferenceImage = referenceSelection?.bestAuxBack3qImageId
    ? (referenceImagesById.get(referenceSelection.bestAuxBack3qImageId) ?? null)
    : null;
  const hasStrictCanonicalBack = referenceSelection?.canonicalBackStatus === "true-back" && Boolean(canonicalBackReferenceImage);
  const hasAuxiliaryBack3q = referenceSelection?.canonicalBackStatus === "only-back-3q-found" && Boolean(auxiliaryBackReferenceImage);

  React.useEffect(() => {
    if (frontCleanUrl) {
      setBodyReferencePhotoDataUrl(frontCleanUrl);
      return;
    }
    if (frontPhotoDataUrl) {
      setBodyReferencePhotoDataUrl(frontPhotoDataUrl);
      return;
    }
    if (productPhotoFullUrl) return;
    setBodyReferencePhotoDataUrl("");
  }, [frontCleanUrl, frontPhotoDataUrl, productPhotoFullUrl]);

  React.useEffect(() => {
    let cancelled = false;

    const syncCanonicalHandleProfile = async () => {
      if (productType === "flat") {
        setCanonicalHandleProfile(undefined);
        return;
      }
      if (
        !bodyReferencePhotoDataUrl ||
        !activeBodyReferenceOutline?.sourceContour ||
        activeBodyReferenceOutline.sourceContour.length < 3
      ) {
        return;
      }

      try {
        const nextProfile = await extractCanonicalHandleProfileFromCutout({
          imageDataUrl: bodyReferencePhotoDataUrl,
          outline: activeBodyReferenceOutline,
        });
        if (cancelled) return;
        setCanonicalHandleProfile(nextProfile ?? undefined);
      } catch {
        if (cancelled) return;
      }
    };

    void syncCanonicalHandleProfile();
    return () => {
      cancelled = true;
    };
  }, [activeBodyReferenceOutline, bodyReferencePhotoDataUrl, productType]);

  // Auto-mirror front photo as back when mirrorForBack is enabled
  React.useEffect(() => {
    if (!mirrorForBack || !frontPhotoDataUrl) {
      if (mirrorForBack) setBackPhotoDataUrl("");
      return;
    }
    let cancelled = false;
    flipImageHorizontal(frontPhotoDataUrl).then((flipped) => {
      if (!cancelled && flipped) setBackPhotoDataUrl(flipped);
    });
    return () => { cancelled = true; };
  }, [mirrorForBack, frontPhotoDataUrl]);

  React.useEffect(() => {
    if (productType === "flat" || overallHeightMm <= 0 || effectiveCylinderDiameterMm <= 0) {
      bodyOutlineSeedSignatureRef.current = "";
      return;
    }

    const fitDebug = lookupResult?.fitDebug ?? null;
    const canSeedFromFitDebug = Boolean(fitDebug && fitDebug.profilePoints.length > 1);
    const seedPhotoDataUrl = frontCleanUrl || frontPhotoDataUrl || productPhotoFullUrl || "";
    const canSeedFromPhotoVector = Boolean(seedPhotoDataUrl);
    if (!canSeedFromPhotoVector && !canSeedFromFitDebug) return;

    const signature = JSON.stringify({
      seedMode: canSeedFromPhotoVector ? "photo-vector" : "fit-debug",
      fitDebugSource: fitDebug
        ? `${fitDebug.sourceImageUrl}:${fitDebug.imageWidthPx}x${fitDebug.imageHeightPx}:${fitDebug.fullTopPx}:${fitDebug.fullBottomPx}:${fitDebug.bodyTopPx}:${fitDebug.bodyBottomPx}`
        : "",
      seedPhotoDataUrl: canSeedFromPhotoVector ? seedPhotoDataUrl : "",
      overallHeightMm: round2(overallHeightMm),
      bodyTopFromOverallMm: round2(bodyTopFromOverallMm),
      bodyBottomFromOverallMm: round2(bodyBottomFromOverallMm),
      diameterMm: round2(effectiveCylinderDiameterMm),
      topOuterDiameterMm: round2(topOuterDiameterMm),
      baseDiameterMm: round2(baseDiameterMm),
      shoulderDiameterMm: round2(shoulderDiameterMm ?? 0),
      taperUpperDiameterMm: round2(taperUpperDiameterMm ?? 0),
      taperLowerDiameterMm: round2(taperLowerDiameterMm ?? 0),
      bevelDiameterMm: round2(bevelDiameterMm ?? 0),
    });

    const hasSeededContour = (bodyOutlineProfile?.directContour?.length ?? 0) > 20;
    if (editingTemplate && hasSeededContour) return;
    if (bodyOutlineSeedSignatureRef.current === signature && hasSeededContour) return;
    bodyOutlineSeedSignatureRef.current = signature;

    let cancelled = false;
    const applyFallbackOutline = () => {
      if (cancelled) return false;
      const outline = createEditableBodyOutline({
        overallHeightMm,
        bodyTopFromOverallMm,
        bodyBottomFromOverallMm,
        diameterMm: effectiveCylinderDiameterMm,
        topOuterDiameterMm: topOuterDiameterMm > 0 ? topOuterDiameterMm : undefined,
        baseDiameterMm: baseDiameterMm > 0 ? baseDiameterMm : undefined,
        shoulderDiameterMm,
        taperUpperDiameterMm,
        taperLowerDiameterMm,
        bevelDiameterMm,
        fitDebug,
      });
      setBodyOutlineProfile(outline);
      setReferencePaths((current) => createReferencePaths({
        bodyOutline: outline,
        lidProfile: current.lidProfile,
        silverProfile: current.silverProfile,
      }));
      return true;
    };
    const seedBodyOutlineFromSvgCutout = async () => {
      try {
        if (canSeedFromPhotoVector && seedPhotoDataUrl) {
          const cleanDataUrl = frontCleanUrl || await removeBackgroundForOutlineSeed(seedPhotoDataUrl, "body-outline-seed.png");
          if (!cancelled) {
            setBodyReferencePhotoDataUrl(cleanDataUrl);
          }
          const svgText = await vectorizeOutlineSeedSvg(cleanDataUrl, "body-outline-seed.png");
          const { outline } = createEditableBodyOutlineFromSeedSvgText({
            svgText,
            overallHeightMm,
            bodyTopFromOverallMm,
            bodyBottomFromOverallMm,
            diameterMm: effectiveCylinderDiameterMm,
            topOuterDiameterMm: topOuterDiameterMm > 0 ? topOuterDiameterMm : undefined,
            side: "right",
          });
          if (cancelled) return;
          setBodyOutlineProfile(outline);
          setReferencePaths((current) => createReferencePaths({
            bodyOutline: outline,
            lidProfile: current.lidProfile,
            silverProfile: current.silverProfile,
          }));
          return;
        }

        applyFallbackOutline();
      } catch {
        if (!cancelled && !applyFallbackOutline()) {
          bodyOutlineSeedSignatureRef.current = "";
        }
      }
    };

    void seedBodyOutlineFromSvgCutout();
    return () => {
      cancelled = true;
    };
  }, [
    activeReferencePhotoDataUrl,
    bodyBottomFromOverallMm,
    bodyOutlineProfile,
    bodyTopFromOverallMm,
    bevelDiameterMm,
    baseDiameterMm,
    effectiveCylinderDiameterMm,
    frontPhotoDataUrl,
    frontCleanUrl,
    lookupResult?.fitDebug,
    overallHeightMm,
    productPhotoFullUrl,
    productType,
    shoulderDiameterMm,
    taperLowerDiameterMm,
    taperUpperDiameterMm,
    topOuterDiameterMm,
  ]);

  const resolveManufacturerLogoStamp = React.useCallback(async () => {
    if (productType === "flat") {
      return undefined;
    }
    const primaryPhotoUrl = bodyReferencePhotoDataUrl || frontCleanUrl || frontPhotoDataUrl || productPhotoFullUrl;
    const rawPhotoUrl = frontCleanUrl || frontPhotoDataUrl || productPhotoFullUrl;
    if (!primaryPhotoUrl || overallHeightMm <= 0) {
      return undefined;
    }

    const stampSource = lookupResult?.imageUrl || productPhotoFullUrl ? "lookup-photo" : "front-photo";
    const attemptExtraction = async (
      photoDataUrl: string,
      options?: {
        sourceImageId?: string;
        preferredLogoBox?: ProductReferenceSet["images"][number]["logoBox"] | null;
      },
    ) => extractManufacturerLogoStamp({
      photoDataUrl,
      overallHeightMm,
      brand: brand.trim() || lookupResult?.brand || undefined,
      topMarginMm,
      bottomMarginMm,
      fitDebug: lookupResult?.fitDebug ?? null,
      outline: activeBodyReferenceOutline,
      productReferenceSet: productReferenceSet ?? null,
      sourceImageId: options?.sourceImageId,
      preferredLogoBox: options?.preferredLogoBox ?? null,
      source: options?.sourceImageId ? "lookup-photo" : stampSource,
    });

    const directStamp = await attemptExtraction(primaryPhotoUrl);
    if (directStamp) return directStamp;

    if (!bodyReferencePhotoDataUrl && rawPhotoUrl) {
      try {
        const cleanDataUrl = await removeBackgroundForOutlineSeed(rawPhotoUrl, "manufacturer-logo-stamp.png");
        setBodyReferencePhotoDataUrl(cleanDataUrl);
        const cutoutStamp = await attemptExtraction(cleanDataUrl);
        if (cutoutStamp) return cutoutStamp;
      } catch {
        // Fall through to the canonical front reference image fallback.
      }
    }

    const fallbackImageUrl = canonicalFrontReferenceImage?.url ||
      lookupResult?.fitDebug?.sourceImageUrl ||
      lookupResult?.imageUrl;
    if (!fallbackImageUrl) return undefined;

    try {
      const fallbackDataUrl = await fetchImageUrlAsDataUrl(fallbackImageUrl);
      return await extractManufacturerLogoStamp({
        photoDataUrl: fallbackDataUrl,
        overallHeightMm,
        brand: brand.trim() || lookupResult?.brand || undefined,
        topMarginMm,
        bottomMarginMm,
        fitDebug: null,
        outline: null,
        productReferenceSet: productReferenceSet ?? null,
        sourceImageId: canonicalFrontReferenceImage?.id,
        preferredLogoBox: canonicalFrontReferenceImage?.logoBox ?? null,
        source: "lookup-photo",
      }) ?? undefined;
    } catch {
      return undefined;
    }
  }, [
    activeBodyReferenceOutline,
    bodyReferencePhotoDataUrl,
    brand,
    bottomMarginMm,
    canonicalFrontReferenceImage,
    frontCleanUrl,
    frontPhotoDataUrl,
    lookupResult?.brand,
    lookupResult?.fitDebug,
    lookupResult?.imageUrl,
    overallHeightMm,
    productReferenceSet,
    productPhotoFullUrl,
    productType,
    topMarginMm,
  ]);

  React.useEffect(() => {
    if (productType === "flat") {
      autoZoneSignatureRef.current = "";
      manufacturerLogoSignatureRef.current = "";
      setManufacturerLogoStamp(undefined);
      setDetectedManufacturerLogoStamp(undefined);
      return;
    }

    const sourcePhotoUrl = bodyReferencePhotoDataUrl || frontCleanUrl || frontPhotoDataUrl || productPhotoFullUrl;
    if (!sourcePhotoUrl || overallHeightMm <= 0) {
      manufacturerLogoSignatureRef.current = "";
      setManufacturerLogoStamp(undefined);
      setDetectedManufacturerLogoStamp(undefined);
      return;
    }

    const signature = JSON.stringify({
      version: MANUFACTURER_LOGO_STAMP_ALGO_VERSION,
      sourcePhotoUrl,
      overallHeightMm: round2(overallHeightMm),
      topMarginMm: round2(topMarginMm),
      bottomMarginMm: round2(bottomMarginMm),
      brand: brand.trim().toLowerCase(),
      outlineHash: activeBodyReferenceOutline?.sourceContourBounds
        ? `${round2(activeBodyReferenceOutline.sourceContourBounds.minX)}:${round2(activeBodyReferenceOutline.sourceContourBounds.minY)}:${round2(activeBodyReferenceOutline.sourceContourBounds.width)}:${round2(activeBodyReferenceOutline.sourceContourBounds.height)}`
        : "",
      canonicalFrontReferenceImageId: canonicalFrontReferenceImage?.id ?? "",
      lookupImageUrl: lookupResult?.imageUrl ?? "",
      fitDebugSource: lookupResult?.fitDebug?.sourceImageUrl ?? "",
      fitDebugSize: lookupResult?.fitDebug
        ? `${lookupResult.fitDebug.imageWidthPx}x${lookupResult.fitDebug.imageHeightPx}:${lookupResult.fitDebug.fullTopPx}:${lookupResult.fitDebug.fullBottomPx}`
        : "",
    });

    if (manufacturerLogoSignatureRef.current === signature) {
      return;
    }
    manufacturerLogoSignatureRef.current = signature;

    let cancelled = false;
    resolveManufacturerLogoStamp()
      .then((stamp) => {
        if (cancelled) return;
        setManufacturerLogoStamp(stamp ?? undefined);
        setDetectedManufacturerLogoStamp(stamp ?? undefined);
      })
      .catch(() => {
        if (cancelled) return;
        setManufacturerLogoStamp(undefined);
        setDetectedManufacturerLogoStamp(undefined);
      });

    return () => {
      cancelled = true;
    };
  }, [
    brand,
    bottomMarginMm,
    canonicalFrontReferenceImage,
    activeBodyReferenceOutline,
    frontCleanUrl,
    frontPhotoDataUrl,
    bodyReferencePhotoDataUrl,
    lookupResult?.brand,
    lookupResult?.fitDebug,
    lookupResult?.imageUrl,
    overallHeightMm,
    productReferenceSet,
    productPhotoFullUrl,
    productType,
    resolveManufacturerLogoStamp,
    topMarginMm,
  ]);

  const applyLogoPlacementAdjustment = React.useCallback((mutate: (placement: NonNullable<ManufacturerLogoStamp["logoPlacement"]>) => NonNullable<ManufacturerLogoStamp["logoPlacement"]>) => {
    setManufacturerLogoStamp((current) => {
      if (!current?.logoPlacement) return current;
      return {
        ...current,
        logoPlacement: {
          ...mutate(current.logoPlacement),
          source: "manual",
        },
      };
    });
  }, []);

  const resetManufacturerLogoStampPlacement = React.useCallback(() => {
    setManufacturerLogoStamp(detectedManufacturerLogoStamp ?? undefined);
  }, [detectedManufacturerLogoStamp]);

  const logoPlacementSurfaceStatus = React.useMemo(() => {
    if (
      productType === "flat" ||
      !manufacturerLogoStamp?.logoPlacement ||
      !activeCanonicalDimensionCalibration ||
      !previewPrintableSurfaceContract
    ) {
      return null;
    }

    const localSurface = getPrintableSurfaceLocalBounds({
      contract: previewPrintableSurfaceContract,
      bodyTopFromOverallMm: activeCanonicalDimensionCalibration.lidBodyLineMm,
      bodyBottomFromOverallMm: activeCanonicalDimensionCalibration.bodyBottomMm,
    });
    if (!localSurface) {
      return null;
    }

    const placement = manufacturerLogoStamp.logoPlacement;
    const centerYFromBodyTopMm = Math.max(
      0,
      Math.min(
        activeCanonicalDimensionCalibration.bodyHeightMm,
        placement.sCenter * activeCanonicalDimensionCalibration.bodyHeightMm,
      ),
    );
    const heightMm = Math.max(0.5, placement.sSpan * activeCanonicalDimensionCalibration.bodyHeightMm);
    const logoTopMm = round2(centerYFromBodyTopMm - heightMm / 2);
    const logoBottomMm = round2(centerYFromBodyTopMm + heightMm / 2);
    const overlapsTop = logoTopMm < localSurface.topMm;
    const overlapsBottom = logoBottomMm > localSurface.bottomMm;

    return {
      logoTopMm,
      logoBottomMm,
      printableTopMm: localSurface.topMm,
      printableBottomMm: localSurface.bottomMm,
      overlapsTop,
      overlapsBottom,
      overlapsPrintableSurface: overlapsTop || overlapsBottom,
    };
  }, [
    activeCanonicalDimensionCalibration,
    manufacturerLogoStamp,
    previewPrintableSurfaceContract,
    productType,
  ]);

  const alignmentLogoOverlay = React.useMemo(() => {
    if (
      productType === "flat" ||
      !manufacturerLogoStamp?.logoPlacement ||
      !activeCanonicalDimensionCalibration
    ) {
      return null;
    }

    const placement = manufacturerLogoStamp.logoPlacement;
    const bodyTopMm = activeCanonicalDimensionCalibration.bodyBottomMm - activeCanonicalDimensionCalibration.bodyHeightMm;
    const centerYMm = bodyTopMm + (placement.sCenter * activeCanonicalDimensionCalibration.bodyHeightMm);
    const heightMm = Math.max(0.5, placement.sSpan * activeCanonicalDimensionCalibration.bodyHeightMm);
    const halfFrontWidthMm = activeCanonicalDimensionCalibration.frontVisibleWidthMm / 2;
    const centerXMm = Math.sin(placement.thetaCenter) * halfFrontWidthMm;
    const widthMm = Math.max(0.5, activeCanonicalDimensionCalibration.frontVisibleWidthMm * Math.sin(Math.max(0.001, placement.thetaSpan) / 2));
    const overlapsLockedPrintableSurface = Boolean(
      lockedProductionGeometry && logoPlacementSurfaceStatus?.overlapsPrintableSurface,
    );

    return {
      centerXMm,
      centerYMm,
      widthMm,
      heightMm,
      confidence: placement.confidence,
      strokeColor: overlapsLockedPrintableSurface ? "#f59e0b" : "#34c759",
    };
  }, [
    activeCanonicalDimensionCalibration,
    lockedProductionGeometry,
    logoPlacementSurfaceStatus?.overlapsPrintableSurface,
    manufacturerLogoStamp,
    productType,
  ]);

  React.useEffect(() => {
    if (productType === "flat") {
      autoZoneSignatureRef.current = "";
      return;
    }

    const autoZone = deriveEngravableZoneFromFitDebug({
      overallHeightMm,
      fitDebug: lookupResult?.fitDebug ?? null,
    });
    if (!autoZone || overallHeightMm <= 0) {
      autoZoneSignatureRef.current = "";
      return;
    }

    const signature = JSON.stringify({
      overallHeightMm: round2(overallHeightMm),
      sourceImageUrl: lookupResult?.fitDebug?.sourceImageUrl ?? "",
      imageSize: lookupResult?.fitDebug
        ? `${lookupResult.fitDebug.imageWidthPx}x${lookupResult.fitDebug.imageHeightPx}`
        : "",
      bounds: lookupResult?.fitDebug
        ? `${lookupResult.fitDebug.fullTopPx}:${lookupResult.fitDebug.fullBottomPx}:${lookupResult.fitDebug.rimBottomPx}:${lookupResult.fitDebug.bodyBottomPx}`
        : "",
      bodyTopFromOverallMm: autoZone.bodyTopFromOverallMm,
      bodyBottomFromOverallMm: autoZone.bodyBottomFromOverallMm,
      bodyHeightMm: autoZone.bodyHeightMm,
      topMarginMm: autoZone.topMarginMm,
      bottomMarginMm: autoZone.bottomMarginMm,
      printHeightMm: autoZone.printHeightMm,
    });

    if (autoZoneSignatureRef.current === signature) return;
    autoZoneSignatureRef.current = signature;

    setBodyTopFromOverallMm(autoZone.bodyTopFromOverallMm);
    setBodyBottomFromOverallMm(autoZone.bodyBottomFromOverallMm);
    setLidSeamFromOverallMm(undefined);
    setSilverBandBottomFromOverallMm(undefined);
    setPrintableTopOverrideMm(undefined);
    setPrintableBottomOverrideMm(undefined);
    setTopMarginMm(autoZone.topMarginMm);
    setBottomMarginMm(autoZone.bottomMarginMm);
    setPrintHeightMm(autoZone.printHeightMm);
  }, [lookupResult?.fitDebug, overallHeightMm, productType]);

  // ── Validation ───────────────────────────────────────────────────
  const [errors, setErrors] = React.useState<string[]>([]);
  const errorSummaryRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (errors.length === 0) return;
    errorSummaryRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [errors]);

  /** Handle product image selection — store file for auto-detect, generate thumbnail + full-res */
  const handleProductImage = React.useCallback(async (file: File) => {
    setProductImageFile(file);
    setProductImageLabel(file.name);
    setDetectResult(null);
    setDetectError(null);
    // Thumbnail: 120x120 cropped (for gallery cards)
    const thumb = await generateThumbnail(file);
    setThumbDataUrl(thumb);
    // Full-res: max 1024px (for grid overlay)
    const full = await fileToFacePhotoDataUrl(file, 1024);
    if (full) setProductPhotoFullUrl(full);
  }, []);

  const clearProductImage = React.useCallback(() => {
    setProductImageFile(null);
    setProductImageLabel(null);
    setThumbDataUrl("");
    setProductPhotoFullUrl("");
    autoZoneSignatureRef.current = "";
    bodyOutlineSeedSignatureRef.current = "";
    manufacturerLogoSignatureRef.current = "";
    setPrintableSurfaceDetection(null);
    setPrintableTopOverrideMm(undefined);
    setPrintableBottomOverrideMm(undefined);
    setManufacturerLogoStamp(undefined);
    setDetectedManufacturerLogoStamp(undefined);
    setDetectResult(null);
    setDetectError(null);
  }, []);

  const applyFacePhotoFile = React.useCallback(async (
    file: File,
    side: "front" | "back",
  ) => {
    const original = await fileToFacePhotoDataUrl(file);
    if (!original) return;

    if (side === "front") {
      setFrontOriginalUrl(original);
      setFrontCleanUrl("");
      setFrontPhotoDataUrl(original);
      setFrontUseOriginal(false);
      setFrontBgStatus("idle");
      return;
    }

    setBackOriginalUrl(original);
    setBackCleanUrl("");
    setBackPhotoDataUrl(original);
    setBackUseOriginal(false);
    setBackBgStatus("idle");
  }, []);

  const resolveLookupPhotoUrl = React.useCallback(async (
    photoUrl: string,
  ): Promise<{ file: File; dataUrl: string }> => {
    const imageRes = await fetch("/api/admin/flatbed/fetch-url", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ url: photoUrl }),
    });
    const imagePayload = await imageRes.json();
    if (!imageRes.ok || !imagePayload.dataUrl) {
      throw new Error(
        typeof imagePayload?.error === "string"
          ? imagePayload.error
          : "Product photo could not be pulled from the lookup result.",
      );
    }

    const dataUrl = imagePayload.dataUrl as string;
    const imgFetch = await fetch(dataUrl);
    const blob = await imgFetch.blob();
    const mimeType = imagePayload.mimeType ?? blob.type ?? "image/jpeg";
    const fileName = photoUrl.split("/").pop() ?? "lookup-product-image.jpg";
    const file = new File([blob], fileName, { type: mimeType });

    return { file, dataUrl };
  }, []);

  const applyResolvedProductPhotoUrl = React.useCallback(async (
    photoUrl: string,
    label: string | null,
  ): Promise<{ file: File; dataUrl: string }> => {
    const { file, dataUrl } = await resolveLookupPhotoUrl(photoUrl);
    await handleProductImage(file);
    setProductImageLabel(label ?? "Lookup product photo");
    setLookupDebugImageUrl(dataUrl);
    return { file, dataUrl };
  }, [handleProductImage, resolveLookupPhotoUrl]);

  const applyProfileOrDimensions = React.useCallback((args: {
    brand: string | null | undefined;
    model: string | null | undefined;
    capacityOz?: number | null;
    outsideDiameterMm?: number | null;
    topDiameterMm?: number | null;
    bottomDiameterMm?: number | null;
    overallHeightMm?: number | null;
    usableHeightMm?: number | null;
  }) => {
    const profileId = findTumblerProfileIdForBrandModel({
      brand: args.brand,
      model: args.model,
      capacityOz: args.capacityOz,
    });
    const matchedProfile = profileId ? getTumblerProfileById(profileId) : null;
    const resolvedBodyDiameterMm = resolveBodyReferenceDiameterMm({
      outsideDiameterMm: args.outsideDiameterMm,
      topDiameterMm: args.topDiameterMm,
      bottomDiameterMm: args.bottomDiameterMm,
      fallbackOutsideDiameterMm: matchedProfile?.outsideDiameterMm ?? null,
    });
    const resolvedTopOuterDiameterMm =
      args.topDiameterMm ??
      matchedProfile?.topDiameterMm ??
      resolvedBodyDiameterMm;
    const resolvedBaseDiameterMm =
      args.bottomDiameterMm ??
      matchedProfile?.bottomDiameterMm ??
      resolvedBodyDiameterMm;

    if (resolvedBodyDiameterMm) {
      setDiameterMm(round2(resolvedBodyDiameterMm));
      setWrapWidthInputMm(round2(Math.PI * resolvedBodyDiameterMm));
    }
    if (resolvedTopOuterDiameterMm) {
      setTopOuterDiameterMm(round2(resolvedTopOuterDiameterMm));
    }
    if (resolvedBaseDiameterMm) {
      setBaseDiameterMm(round2(resolvedBaseDiameterMm));
    }

    if (args.usableHeightMm) {
      setPrintHeightMm(round2(args.usableHeightMm));
    } else if (matchedProfile?.usableHeightMm) {
      setPrintHeightMm(round2(matchedProfile.usableHeightMm));
    }

    const profileArc = getProfileHandleArcDeg(matchedProfile);
    setHandleArcDeg(profileArc);
    if (matchedProfile) {
      const oh = matchedProfile.overallHeightMm;
      setOverallHeightMm(round2(oh));
      const usable = matchedProfile.usableHeightMm;
      const topM = matchedProfile.guideBand?.upperGrooveYmm ?? round2((oh - usable) / 2);
      const bottomM = round2(Math.max(0, oh - usable - topM));
      setBodyTopFromOverallMm(topM);
      setBodyBottomFromOverallMm(round2(oh - bottomM));
      setTopMarginMm(topM);
      setBottomMarginMm(bottomM);
      if (matchedProfile.shapeType === "tapered") {
        const top = matchedProfile.topDiameterMm ?? null;
        const bottom = matchedProfile.bottomDiameterMm ?? null;
        if (top && bottom) {
          setTaperCorrection(top < bottom ? "top-narrow" : "bottom-narrow");
        }
      } else {
        setTaperCorrection("none");
      }
      return;
    }

    if (args.overallHeightMm) {
      setOverallHeightMm(round2(args.overallHeightMm));
    }
    if (args.overallHeightMm && args.usableHeightMm) {
      const topM = round2((args.overallHeightMm - args.usableHeightMm) / 2);
      const bottomM = round2(Math.max(0, args.overallHeightMm - args.usableHeightMm - topM));
      setBodyTopFromOverallMm(topM);
      setBodyBottomFromOverallMm(round2(args.overallHeightMm - bottomM));
      setTopMarginMm(topM);
      setBottomMarginMm(bottomM);
    }
    if (
      resolvedTopOuterDiameterMm &&
      resolvedBaseDiameterMm &&
      resolvedTopOuterDiameterMm !== resolvedBaseDiameterMm
    ) {
      setTaperCorrection(resolvedTopOuterDiameterMm < resolvedBaseDiameterMm ? "top-narrow" : "bottom-narrow");
    } else {
      setTaperCorrection("none");
    }
  }, []);

  const applySmartLookupResult = React.useCallback(async (
    result: SmartTemplateLookupResponse,
    files: {
      analysisImageFile: File | null;
      frontPhotoFile: File | null;
      backPhotoFile: File | null;
    },
  ) => {
    const draft = result.templateDraft;
    const draftDims = draft.dimensions;
    const matchedFlatItem = result.matchedFlatItemId
      ? (FLAT_BED_ITEMS.find((item) => item.id === result.matchedFlatItemId) ?? null)
      : null;
    const primaryProductImageFile = files.frontPhotoFile ?? files.analysisImageFile;

    setErrors([]);
    setDetectError(null);
    setDetectResult(null);
    setLookupError(null);
    setSmartLookupApplied(true);
    setLookupResult(result.tumblerLookupResult ?? null);
    setFlatLookupResult(result.flatLookupResult ?? null);
    setProductReferenceSet(
      draft.productReferenceSet ??
      result.tumblerLookupResult?.productReferenceSet ??
      undefined,
    );
    setFlatLookupMatch(
      result.flatLookupResult?.matchedItemId
        ? (FLAT_BED_ITEMS.find((item) => item.id === result.flatLookupResult!.matchedItemId) ?? null)
        : matchedFlatItem,
    );

    let resolvedLookupPhotoFile: File | null = null;
    let resolvedLookupBackPhotoFile: File | null = null;
    if (primaryProductImageFile) {
      await handleProductImage(primaryProductImageFile);
      setLookupDebugImageUrl("");
    } else if (draft.productPhotoUrl) {
      try {
        const resolved = await applyResolvedProductPhotoUrl(draft.productPhotoUrl, draft.productPhotoLabel ?? null);
        resolvedLookupPhotoFile = resolved.file;
      } catch {
        // Non-fatal: dimensions and categorization should still be applied.
      }
    }
    if (!files.backPhotoFile && draft.backPhotoUrl && draft.productType && draft.productType !== "flat") {
      try {
        const resolvedBack = await resolveLookupPhotoUrl(draft.backPhotoUrl);
        resolvedLookupBackPhotoFile = resolvedBack.file;
      } catch {
        // Non-fatal: keep the mirrored fallback when the opposite-side photo cannot be pulled.
      }
    }

    if (files.frontPhotoFile) {
      await applyFacePhotoFile(files.frontPhotoFile, "front");
    } else if (resolvedLookupPhotoFile && draft.productType && draft.productType !== "flat") {
      await applyFacePhotoFile(resolvedLookupPhotoFile, "front");
    }
    if (files.backPhotoFile) {
      setMirrorForBack(false);
      await applyFacePhotoFile(files.backPhotoFile, "back");
    } else if (resolvedLookupBackPhotoFile && draft.productType && draft.productType !== "flat") {
      setMirrorForBack(false);
      await applyFacePhotoFile(resolvedLookupBackPhotoFile, "back");
    } else if ((files.frontPhotoFile || resolvedLookupPhotoFile) && draft.productType && draft.productType !== "flat") {
      setMirrorForBack(false);
      setBackPhotoDataUrl("");
      setBackOriginalUrl("");
      setBackCleanUrl("");
      setBackUseOriginal(false);
      setBackBgStatus("idle");
    }

    if (draft.name) setName(draft.name);
    if (draft.brand !== undefined && draft.brand !== null) setBrand(draft.brand);
    if (draft.capacity !== undefined && draft.capacity !== null) setCapacity(draft.capacity);
    if (draft.laserType) setLaserType(draft.laserType);
    if (draft.productType) setProductType(draft.productType);
    if (draft.materialSlug !== undefined) {
      setResolvedMaterialSlug(draft.materialSlug ?? "");
    }
    if (draft.materialLabel !== undefined) {
      setResolvedMaterialLabel(draft.materialLabel ?? "");
    }
    materialProfileTouchedRef.current = false;
    applyMaterialProfileSettings(
      draft.materialProfileId ?? "",
      draft.laserType,
      draft.productType,
    );

    if (draft.glbPath !== undefined) {
      const nextGlbPath = draft.glbPath ?? "";
      setGlbPath(nextGlbPath);
      setGlbFileName(nextGlbPath ? (nextGlbPath.split("/").pop() ?? null) : null);
      setGlbUploadError(null);
    }

    if (draft.productType === "flat") {
      setDiameterMm(0);
      setWrapWidthInputMm(0);
      setTopOuterDiameterMm(0);
      setBaseDiameterMm(0);
      setAdvancedGeometryOverridesUnlocked(false);
      setTumblerMapping(undefined);
      setHandleArcDeg(0);
      setTaperCorrection("none");
      setOverallHeightMm(draftDims?.overallHeightMm ?? 0);
      setBodyTopFromOverallMm(draftDims?.bodyTopFromOverallMm ?? 0);
      setBodyBottomFromOverallMm(
        draftDims?.bodyBottomFromOverallMm ??
          (
            draftDims?.overallHeightMm != null && draftDims?.bottomMarginMm != null
              ? round2(draftDims.overallHeightMm - draftDims.bottomMarginMm)
              : 0
          ),
      );
      setLidSeamFromOverallMm(draftDims?.lidSeamFromOverallMm ?? undefined);
      setSilverBandBottomFromOverallMm(draftDims?.silverBandBottomFromOverallMm ?? undefined);
      setPrintableSurfaceDetection(null);
      setPrintableTopOverrideMm(undefined);
      setPrintableBottomOverrideMm(undefined);
      setHandleTopFromOverallMm(draftDims?.handleTopFromOverallMm ?? undefined);
      setHandleBottomFromOverallMm(draftDims?.handleBottomFromOverallMm ?? undefined);
      setHandleReachMm(draftDims?.handleReachMm ?? undefined);
      setCanonicalHandleProfile(draftDims?.canonicalHandleProfile ?? undefined);
      setShoulderDiameterMm(draftDims?.shoulderDiameterMm ?? undefined);
      setTaperUpperDiameterMm(draftDims?.taperUpperDiameterMm ?? undefined);
      setTaperLowerDiameterMm(draftDims?.taperLowerDiameterMm ?? undefined);
      setBevelDiameterMm(draftDims?.bevelDiameterMm ?? undefined);
      setBodyOutlineProfile(draftDims?.referencePaths?.bodyOutline ?? draftDims?.bodyOutlineProfile ?? undefined);
      setReferencePaths(createReferencePaths({
        bodyOutline: draftDims?.referencePaths?.bodyOutline ?? draftDims?.bodyOutlineProfile ?? null,
        lidProfile: draftDims?.referencePaths?.lidProfile ?? null,
        silverProfile: draftDims?.referencePaths?.silverProfile ?? null,
      }));
      setReferenceLayerState(cloneReferenceLayerState(draftDims?.referenceLayerState ?? null));
      setTopMarginMm(draftDims?.topMarginMm ?? 0);
      setBottomMarginMm(draftDims?.bottomMarginMm ?? 0);

      if (typeof draftDims?.templateWidthMm === "number") {
        setFlatWidthMm(round2(draftDims.templateWidthMm));
      }
      if (typeof draftDims?.printHeightMm === "number") {
        setPrintHeightMm(round2(draftDims.printHeightMm));
      }
      if (typeof draftDims?.flatThicknessMm === "number") {
        setFlatThicknessMm(round2(draftDims.flatThicknessMm));
      }
      if (draftDims?.flatFamilyKey) {
        setFlatFamilyKey(draftDims.flatFamilyKey);
      }
      return;
    }

    if (draft.productType) {
      setFlatFamilyKey("");
      applyProfileOrDimensions({
        brand: draft.brand ?? result.tumblerLookupResult?.brand,
        model: result.tumblerLookupResult?.model,
        capacityOz: result.tumblerLookupResult?.capacityOz ?? parseCapacityOzValue(draft.capacity),
        outsideDiameterMm:
          draftDims?.bodyDiameterMm ??
          draftDims?.diameterMm ??
          result.tumblerLookupResult?.dimensions.outsideDiameterMm,
        topDiameterMm:
          draftDims?.topOuterDiameterMm ??
          result.tumblerLookupResult?.dimensions.topDiameterMm,
        bottomDiameterMm:
          draftDims?.baseDiameterMm ??
          result.tumblerLookupResult?.dimensions.bottomDiameterMm,
        overallHeightMm: draftDims?.overallHeightMm ?? result.tumblerLookupResult?.dimensions.overallHeightMm,
        usableHeightMm: draftDims?.printHeightMm ?? result.tumblerLookupResult?.dimensions.usableHeightMm,
      });

      if (typeof draftDims?.handleArcDeg === "number") {
        setHandleArcDeg(draftDims.handleArcDeg);
      }
      if (typeof draftDims?.templateWidthMm === "number" && draftDims.templateWidthMm > 0) {
        setWrapWidthInputMm(round2(draftDims.templateWidthMm));
      }
      setAdvancedGeometryOverridesUnlocked(draftDims?.advancedGeometryOverridesUnlocked ?? false);
      if (draftDims?.taperCorrection) {
        setTaperCorrection(draftDims.taperCorrection);
      }
      if (typeof draftDims?.overallHeightMm === "number") {
        setOverallHeightMm(round2(draftDims.overallHeightMm));
      }
      if (typeof draftDims?.bodyTopFromOverallMm === "number") {
        setBodyTopFromOverallMm(round2(draftDims.bodyTopFromOverallMm));
      } else if (typeof draftDims?.topMarginMm === "number") {
        setBodyTopFromOverallMm(round2(draftDims.topMarginMm));
      }
      if (typeof draftDims?.bodyBottomFromOverallMm === "number") {
        setBodyBottomFromOverallMm(round2(draftDims.bodyBottomFromOverallMm));
      } else if (typeof draftDims?.overallHeightMm === "number" && typeof draftDims?.bottomMarginMm === "number") {
        setBodyBottomFromOverallMm(round2(draftDims.overallHeightMm - draftDims.bottomMarginMm));
      }
      if (typeof draftDims?.lidSeamFromOverallMm === "number") {
        setLidSeamFromOverallMm(round2(draftDims.lidSeamFromOverallMm));
      } else {
        setLidSeamFromOverallMm(undefined);
      }
      if (typeof draftDims?.silverBandBottomFromOverallMm === "number") {
        setSilverBandBottomFromOverallMm(round2(draftDims.silverBandBottomFromOverallMm));
      } else {
        setSilverBandBottomFromOverallMm(undefined);
      }
      setPrintableSurfaceDetection(null);
      if (typeof draftDims?.printableTopOverrideMm === "number") {
        setPrintableTopOverrideMm(round2(draftDims.printableTopOverrideMm));
      } else {
        setPrintableTopOverrideMm(undefined);
      }
      if (typeof draftDims?.printableBottomOverrideMm === "number") {
        setPrintableBottomOverrideMm(round2(draftDims.printableBottomOverrideMm));
      } else {
        setPrintableBottomOverrideMm(undefined);
      }
      if (typeof draftDims?.handleTopFromOverallMm === "number") {
        setHandleTopFromOverallMm(round2(draftDims.handleTopFromOverallMm));
      } else {
        setHandleTopFromOverallMm(undefined);
      }
      if (typeof draftDims?.handleBottomFromOverallMm === "number") {
        setHandleBottomFromOverallMm(round2(draftDims.handleBottomFromOverallMm));
      } else {
        setHandleBottomFromOverallMm(undefined);
      }
      if (typeof draftDims?.handleReachMm === "number") {
        setHandleReachMm(round2(draftDims.handleReachMm));
      } else {
        setHandleReachMm(undefined);
      }
      setCanonicalHandleProfile(draftDims?.canonicalHandleProfile ?? undefined);
      if (typeof draftDims?.shoulderDiameterMm === "number") {
        setShoulderDiameterMm(round2(draftDims.shoulderDiameterMm));
      } else {
        setShoulderDiameterMm(undefined);
      }
      if (typeof draftDims?.taperUpperDiameterMm === "number") {
        setTaperUpperDiameterMm(round2(draftDims.taperUpperDiameterMm));
      } else {
        setTaperUpperDiameterMm(undefined);
      }
      if (typeof draftDims?.taperLowerDiameterMm === "number") {
        setTaperLowerDiameterMm(round2(draftDims.taperLowerDiameterMm));
      } else {
        setTaperLowerDiameterMm(undefined);
      }
      if (typeof draftDims?.bevelDiameterMm === "number") {
        setBevelDiameterMm(round2(draftDims.bevelDiameterMm));
      } else {
        setBevelDiameterMm(undefined);
      }
      setBodyOutlineProfile(draftDims?.referencePaths?.bodyOutline ?? draftDims?.bodyOutlineProfile ?? undefined);
      setReferencePaths(createReferencePaths({
        bodyOutline: draftDims?.referencePaths?.bodyOutline ?? draftDims?.bodyOutlineProfile ?? null,
        lidProfile: draftDims?.referencePaths?.lidProfile ?? null,
        silverProfile: draftDims?.referencePaths?.silverProfile ?? null,
      }));
      setReferenceLayerState(cloneReferenceLayerState(draftDims?.referenceLayerState ?? null));
      if (typeof draftDims?.topMarginMm === "number") {
        setTopMarginMm(round2(draftDims.topMarginMm));
      }
      if (typeof draftDims?.bottomMarginMm === "number") {
        setBottomMarginMm(round2(draftDims.bottomMarginMm));
      }
      if (typeof draftDims?.printHeightMm === "number") {
        setPrintHeightMm(round2(draftDims.printHeightMm));
      }
      if (draftDims?.bodyColorHex) {
        setBodyColorHex(draftDims.bodyColorHex);
      }
      if (draftDims?.rimColorHex) {
        setRimColorHex(draftDims.rimColorHex);
      }
    }
  }, [applyFacePhotoFile, applyMaterialProfileSettings, applyProfileOrDimensions, applyResolvedProductPhotoUrl, handleProductImage, resolveLookupPhotoUrl]);

  const handleItemLookup = async () => {
    const raw = lookupInput.trim();
    if (!raw) return;

    setLookingUpItem(true);
    clearLookupState({ keepInput: true });
    setDetectError(null);

    try {
      if (productType === "flat") {
        try {
          const result = await lookupFlatItemRequest(raw);
          setFlatLookupResult(result);
          setFlatLookupMatch(
            result.matchedItemId
              ? (FLAT_BED_ITEMS.find((item) => item.id === result.matchedItemId) ?? null)
              : null,
          );
          setName(result.label);
          setBrand(result.brand ?? "");
          setCapacity("");
          setDiameterMm(0);
          setWrapWidthInputMm(0);
          setTopOuterDiameterMm(0);
          setBaseDiameterMm(0);
          setFlatWidthMm(round2(result.widthMm));
          setFlatThicknessMm(round2(result.thicknessMm));
          setFlatFamilyKey(result.familyKey);
          setPrintHeightMm(round2(result.heightMm));
          setGlbPath(result.glbPath || "");
          setGlbFileName(result.glbPath ? (result.glbPath.split("/").pop() ?? null) : null);
          setTumblerMapping(undefined);
          setHandleArcDeg(0);
          setTaperCorrection("none");

          if (result.imageUrl) {
            try {
              const imageRes = await fetch("/api/admin/flatbed/fetch-url", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ url: result.imageUrl }),
              });
              const imagePayload = await imageRes.json();
              if (imageRes.ok && imagePayload.dataUrl) {
                const dataUrl = imagePayload.dataUrl as string;
                setLookupDebugImageUrl(dataUrl);
                setProductPhotoFullUrl(dataUrl);
                setProductImageLabel("Lookup product photo");
              }
            } catch {
              // Non-fatal: the lookup should still apply dimensions and model generation.
            }
          }
          return;
        } catch {
          const matchedItem = findFlatItemLookupMatch(raw);
          if (!matchedItem) {
            throw new Error("No flat-item catalog match found. Try a simpler product name or fill in the dimensions manually.");
          }

          setFlatLookupMatch(matchedItem);
          setName(matchedItem.label);
          setBrand("");
          setCapacity("");
          setDiameterMm(0);
          setWrapWidthInputMm(0);
          setTopOuterDiameterMm(0);
          setBaseDiameterMm(0);
          setFlatWidthMm(round2(matchedItem.widthMm));
          setFlatThicknessMm(round2(matchedItem.thicknessMm));
          setFlatFamilyKey(inferFlatFamilyKey({ label: matchedItem.label }));
          setPrintHeightMm(round2(matchedItem.heightMm));
          setGlbPath("");
          setGlbFileName(null);
          setTumblerMapping(undefined);
          setHandleArcDeg(0);
          setTaperCorrection("none");
          return;
        }
      }

      const result = await lookupTumblerItem(raw);
      setLookupResult(result);

      const parts: string[] = [];
      if (result.brand) parts.push(result.brand);
      if (result.model) parts.push(result.model);
      if (result.capacityOz) parts.push(`${result.capacityOz}oz`);
      setName(parts.length > 0 ? parts.join(" ") : result.title ?? raw);
      if (result.brand) setBrand(result.brand);
      if (result.capacityOz) setCapacity(`${result.capacityOz}oz`);
      setFlatFamilyKey("");
      const inferredProductType = inferLookupProductType(
        [raw, result.title, result.model, result.brand].filter(Boolean).join(" "),
        result,
      );
      setProductType(inferredProductType);
      const nextLookupGlbPath =
        inferredProductType === "flat"
          ? (result.glbPath || "")
          : result.modelStatus === "verified-product-model"
            ? (result.glbPath || "")
            : "";
      setGlbPath(nextLookupGlbPath);
      setGlbFileName(nextLookupGlbPath ? (nextLookupGlbPath.split("/").pop() ?? null) : null);
      if (result.bodyColorHex) setBodyColorHex(result.bodyColorHex);
      if (result.rimColorHex) setRimColorHex(result.rimColorHex);
      if (inferredProductType !== "flat" && !materialProfileTouchedRef.current) {
        applyResolvedDrinkwareMaterial({
          laserType,
          productType: inferredProductType,
          bodyColorHex: result.bodyColorHex ?? bodyColorHex,
          rimColorHex: result.rimColorHex ?? rimColorHex,
          textHints: [raw, result.title, result.brand, result.model],
        });
      }

      if (inferredProductType !== "flat") {
        const matchedProfile = result.matchedProfileId ? getTumblerProfileById(result.matchedProfileId) : null;
        const resolvedOverallHeightMm =
          result.dimensions.overallHeightMm ??
          matchedProfile?.overallHeightMm ??
          null;
        applyProfileOrDimensions({
          brand: result.brand,
          model: result.model,
          capacityOz: result.capacityOz,
          outsideDiameterMm: result.dimensions.outsideDiameterMm,
          topDiameterMm: result.dimensions.topDiameterMm,
          bottomDiameterMm: result.dimensions.bottomDiameterMm,
          overallHeightMm: resolvedOverallHeightMm,
          usableHeightMm: result.dimensions.usableHeightMm,
        });
        const autoZone = deriveEngravableZoneFromFitDebug({
          overallHeightMm: resolvedOverallHeightMm,
          fitDebug: result.fitDebug ?? null,
        });
        if (autoZone) {
          setBodyTopFromOverallMm(autoZone.bodyTopFromOverallMm);
          setBodyBottomFromOverallMm(autoZone.bodyBottomFromOverallMm);
          setTopMarginMm(autoZone.topMarginMm);
          setBottomMarginMm(autoZone.bottomMarginMm);
          setPrintHeightMm(autoZone.printHeightMm);
        }
      }

      if (result.imageUrl) {
        try {
          const imageRes = await fetch("/api/admin/flatbed/fetch-url", {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({ url: result.imageUrl }),
          });
          const imagePayload = await imageRes.json();
          if (imageRes.ok && imagePayload.dataUrl) {
            const dataUrl = imagePayload.dataUrl as string;
            const imgFetch = await fetch(dataUrl);
            const blob = await imgFetch.blob();
            const mimeType = imagePayload.mimeType ?? blob.type ?? "image/jpeg";
            const fileName = result.imageUrl.split("/").pop() ?? "lookup-image.jpg";
            const file = new File([blob], fileName, { type: mimeType });
            setProductImageFile(file);
            setProductImageLabel(getLookupPhotoLabel(result));
            const thumb = await generateThumbnail(file);
            setThumbDataUrl(thumb);
            const full = await fileToFacePhotoDataUrl(file, 1024);
            if (full) {
              setLookupDebugImageUrl(full);
              setProductPhotoFullUrl(full);
              setFrontOriginalUrl(full);
              setFrontPhotoDataUrl((prev) => prev || full);
            }
          }
        } catch {
          // Keep the resolved lookup details even if proxying the product image fails.
        }
      }
    } catch (e) {
      setLookupError(
        e instanceof Error ? e.message : "Item lookup failed. Fill in manually.",
      );
    } finally {
      setLookingUpItem(false);
    }
  };

  const handleCatalogBatchImport = async () => {
    const trimmedUrl = batchImportUrl.trim();
    if (!trimmedUrl) {
      setBatchImportError("Paste an official collection or category URL first.");
      return;
    }

    setBatchImportError(null);
    setBatchImportSummary(null);
    setBatchImportStatus("Discovering product styles...");
    setIsBatchImporting(true);

    try {
      const summary = await importCatalogTemplates({
        sourceUrl: trimmedUrl,
        onProgress: (message) => setBatchImportStatus(message),
      });
      setBatchImportSummary(summary);
      setBatchImportStatus(
        [
          `Imported ${summary.createdCount + summary.updatedCount} ${summary.providerLabel} styles from ${summary.styleCount} discovered.`,
          summary.createdCount > 0 ? `${summary.createdCount} new` : null,
          summary.updatedCount > 0 ? `${summary.updatedCount} updated` : null,
          summary.failedCount > 0 ? `${summary.failedCount} failed` : null,
        ].filter(Boolean).join(" | "),
      );
    } catch (error) {
      setBatchImportError(
        error instanceof Error ? error.message : "Batch import failed.",
      );
      setBatchImportStatus(null);
    } finally {
      setIsBatchImporting(false);
    }
  };

  /** Run auto-detect on the uploaded product image */
  const handleAutoDetect = async () => {
    if (!productImageFile) return;
    setDetecting(true);
    setDetectError(null);
    setDetectResult(null);
    try {
      const result = await detectTumblerFromImage(productImageFile);
      setDetectResult(result);
      // Auto-fill form fields from detection
      const { draft, response } = result;
      const sug = response.suggestion;
      // Build a display name from brand + model + capacity
      const parts: string[] = [];
      if (sug.brand) parts.push(sug.brand);
      if (sug.model) parts.push(sug.model);
      if (sug.capacityOz) parts.push(`${sug.capacityOz}oz`);
      if (parts.length > 0) setName(parts.join(" "));
      if (sug.brand) setBrand(sug.brand);
      if (sug.capacityOz) setCapacity(`${sug.capacityOz}oz`);
      // Handle arc: prefer profile-specific value, fall back to 90 if hasHandle
      const profileId = findTumblerProfileIdForBrandModel({
        brand: sug.brand,
        model: sug.model,
        capacityOz: sug.capacityOz,
      });
      const matchedProfile = profileId ? getTumblerProfileById(profileId) : null;
      const resolvedBodyDiameterMm = resolveBodyReferenceDiameterMm({
        outsideDiameterMm: draft.outsideDiameterMm,
        topDiameterMm: draft.topDiameterMm,
        bottomDiameterMm: draft.bottomDiameterMm,
        fallbackOutsideDiameterMm: matchedProfile?.outsideDiameterMm ?? null,
      });
      if (resolvedBodyDiameterMm) {
        setDiameterMm(resolvedBodyDiameterMm);
        setWrapWidthInputMm(round2(Math.PI * resolvedBodyDiameterMm));
      }
      const resolvedTopOuterDiameterMm = matchedProfile?.topDiameterMm ?? draft.topDiameterMm ?? resolvedBodyDiameterMm ?? 0;
      if (resolvedTopOuterDiameterMm > 0) {
        setTopOuterDiameterMm(round2(resolvedTopOuterDiameterMm));
      }
      const resolvedBaseDiameterMm = matchedProfile?.bottomDiameterMm ?? draft.bottomDiameterMm ?? resolvedBodyDiameterMm ?? 0;
      if (resolvedBaseDiameterMm > 0) {
        setBaseDiameterMm(round2(resolvedBaseDiameterMm));
      }
      if (draft.usableHeightMm) setPrintHeightMm(round2(draft.usableHeightMm));
      else if (draft.templateHeightMm) setPrintHeightMm(round2(draft.templateHeightMm));
      const profileArc = getProfileHandleArcDeg(matchedProfile);
      if (matchedProfile) {
        setHandleArcDeg(profileArc);
      } else if (sug.hasHandle) {
        setHandleArcDeg(90);
      } else {
        setHandleArcDeg(0);
      }
      // Product type
      const detectedProductType = mapProductType(sug.productType);
      setProductType(detectedProductType);
      if (detectedProductType !== "flat") {
        setFlatFamilyKey("");
      }
      if (detectedProductType !== "flat" && !materialProfileTouchedRef.current) {
        applyResolvedDrinkwareMaterial({
          laserType,
          productType: detectedProductType,
          explicitFinishType: null,
          bodyColorHex,
          rimColorHex,
          textHints: [
            productImageFile.name,
            sug.brand,
            sug.model,
            ...(response.analysis.notes ?? []),
          ],
        });
      }
      // Taper
      if (sug.topDiameterMm && sug.bottomDiameterMm && sug.topDiameterMm !== sug.bottomDiameterMm) {
        setTaperCorrection(sug.topDiameterMm < sug.bottomDiameterMm ? "top-narrow" : "bottom-narrow");
      }

      // Overall height + margins from profile
      if (matchedProfile) {
        const oh = matchedProfile.overallHeightMm;
        setOverallHeightMm(round2(oh));
        const usable = matchedProfile.usableHeightMm;
        const topM = matchedProfile.guideBand?.upperGrooveYmm ?? round2((oh - usable) / 2);
        const bottomM = round2(Math.max(0, oh - usable - topM));
        setBodyTopFromOverallMm(topM);
        setBodyBottomFromOverallMm(round2(oh - bottomM));
        setTopMarginMm(topM);
        setBottomMarginMm(bottomM);
      } else if (sug.overallHeightMm && sug.usableHeightMm) {
        const oh = sug.overallHeightMm;
        setOverallHeightMm(round2(oh));
        const topM = round2((oh - sug.usableHeightMm) / 2);
        const bottomM = round2(Math.max(0, oh - sug.usableHeightMm - topM));
        setBodyTopFromOverallMm(topM);
        setBodyBottomFromOverallMm(round2(oh - bottomM));
        setTopMarginMm(topM);
        setBottomMarginMm(bottomM);
      }

      // Auto-assign product photo as front face + auto BG removal
      if (productImageFile && !frontPhotoDataUrl) {
        const original = await fileToFacePhotoDataUrl(productImageFile);
        if (original) {
          setFrontOriginalUrl(original);
          setFrontPhotoDataUrl(original);
          // Auto-trigger background removal
          setFrontBgStatus("processing");
          try {
            const imgRes = await fetch(original);
            const blob = await imgRes.blob();
            const { removeBackground } = await import("@imgly/background-removal");
            const clean = await removeBackground(blob, { model: "isnet_quint8", proxyToWorker: false });
            const reader = new FileReader();
            reader.onloadend = () => {
              const url = reader.result as string;
              if (url) {
                setFrontCleanUrl(url);
                setFrontPhotoDataUrl(url);
                setFrontBgStatus("done");
              } else {
                setFrontBgStatus("failed");
              }
            };
            reader.onerror = () => setFrontBgStatus("failed");
            reader.readAsDataURL(clean);
          } catch {
            setFrontBgStatus("failed");
          }
        }
      }
    } catch (e) {
      setDetectError(e instanceof Error ? e.message : "Auto-detect failed. Fill in manually.");
    } finally {
      setDetecting(false);
    }
  };

  const handleGlbFile = async (file: File) => {
    setGlbFileName(file.name);
    setGlbUploading(true);
    setGlbUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/models/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.path) {
        setGlbPath(data.path);
      } else {
        setGlbUploadError(data.error ?? "Upload failed");
      }
    } catch {
      setGlbUploadError("Upload failed — check server logs");
    } finally {
      setGlbUploading(false);
    }
  };

  const handleSave = React.useCallback(async () => {
    const errs: string[] = [];
    if (!name.trim()) errs.push("Product name is required.");
    if (!productType) errs.push("Product type is required.");
    if (productType === "flat" && flatWidthMm <= 0) errs.push("Template width must be > 0 for flat products.");
    if (productType && productType !== "flat" && templateWidthMm <= 0) errs.push("Wrap width / circumference must be > 0 for non-flat products.");
    if (productType && productType !== "flat" && effectiveCylinderDiameterMm <= 0) errs.push("Cylinder diameter could not be derived from wrap width.");
    if (hasBlockingGeometryMismatch) {
      errs.push(`Cylinder diameter override is inconsistent with wrap width by ${derivedDiameterMismatchMm.toFixed(2)} mm. Recompute derived fields from wrap width or relock production geometry.`);
    }
    if (printHeightMm <= 0) errs.push("Print height must be > 0.");
    if (
      productType &&
      productType !== "flat" &&
      overallHeightMm > 0 &&
      (bodyBottomFromOverallMm <= bodyTopFromOverallMm || bodyBottomFromOverallMm > overallHeightMm)
    ) {
      errs.push("Body top/bottom reference is invalid. Re-run lookup or adjust the body bounds.");
    }
    if (glbPath.trim()) {
      const glbOk = await verifyCurrentGlbPath({ clearOnMissing: false });
      if (!glbOk) errs.push("3D model path is missing or invalid.");
    }
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }
    setErrors([]);

    const resolvedManufacturerLogoStamp = productType === "flat"
      ? undefined
      : (manufacturerLogoStamp ?? await resolveManufacturerLogoStamp());
    if (productType !== "flat") {
      setManufacturerLogoStamp(resolvedManufacturerLogoStamp);
      setDetectedManufacturerLogoStamp(resolvedManufacturerLogoStamp);
    }

    const now = new Date().toISOString();
    const templateMaterial = inferTemplateMaterial(
      editingTemplate,
      flatLookupMatch,
      flatLookupResult,
      resolvedMaterialSlug,
      resolvedMaterialLabel,
      materialProfileId,
    );
    const template: ProductTemplate = {
      id: editingTemplate?.id ?? crypto.randomUUID(),
      name: name.trim(),
      brand: brand.trim(),
      capacity: capacity.trim(),
      laserType: laserType || undefined,
      productType: productType as ProductTemplate["productType"],
      materialSlug: templateMaterial.materialSlug,
      materialLabel: templateMaterial.materialLabel,
      thumbnailDataUrl: thumbDataUrl,
      productPhotoFullUrl: productPhotoFullUrl || undefined,
      glbPath,
      glbStatus: activeDrinkwareGlbStatus?.status,
      glbSourceLabel: activeDrinkwareGlbStatus?.sourceLabel ?? undefined,
      dimensions: {
        diameterMm: effectiveCylinderDiameterMm,
        bodyDiameterMm: productType === "flat" || effectiveCylinderDiameterMm <= 0 ? undefined : effectiveCylinderDiameterMm,
        advancedGeometryOverridesUnlocked: productType === "flat" ? undefined : advancedGeometryOverridesUnlocked,
        topOuterDiameterMm: productType === "flat" || topOuterDiameterMm <= 0 ? undefined : topOuterDiameterMm,
        baseDiameterMm: productType === "flat" || baseDiameterMm <= 0 ? undefined : baseDiameterMm,
        printHeightMm,
        templateWidthMm,
        flatThicknessMm: productType === "flat" && flatThicknessMm > 0 ? flatThicknessMm : undefined,
        flatFamilyKey: productType === "flat"
          ? inferFlatFamilyKey({
              familyKey: flatFamilyKey,
              glbPath,
              label: name.trim(),
            })
          : undefined,
        handleArcDeg,
        taperCorrection,
        overallHeightMm: overallHeightMm > 0 ? overallHeightMm : undefined,
        bodyTopFromOverallMm:
          productType === "flat" || !Number.isFinite(bodyTopFromOverallMm)
            ? undefined
            : round2(Math.max(0, bodyTopFromOverallMm)),
        bodyBottomFromOverallMm:
          productType === "flat" || !Number.isFinite(bodyBottomFromOverallMm)
            ? undefined
            : round2(Math.max(bodyTopFromOverallMm, bodyBottomFromOverallMm)),
        lidSeamFromOverallMm:
          productType === "flat" || !Number.isFinite(lidSeamFromOverallMm)
            ? undefined
            : round2(Math.max(0, lidSeamFromOverallMm ?? 0)),
        silverBandBottomFromOverallMm:
          productType === "flat" || !Number.isFinite(silverBandBottomFromOverallMm)
            ? undefined
            : round2(Math.max(0, silverBandBottomFromOverallMm ?? 0)),
        printableTopOverrideMm:
          productType === "flat" || !Number.isFinite(printableTopOverrideMm)
            ? undefined
            : round2(Math.min(bodyBottomFromOverallMm, Math.max(bodyTopFromOverallMm, printableTopOverrideMm ?? 0))),
        printableBottomOverrideMm:
          productType === "flat" || !Number.isFinite(printableBottomOverrideMm)
            ? undefined
            : round2(Math.min(bodyBottomFromOverallMm, Math.max(bodyTopFromOverallMm, printableBottomOverrideMm ?? 0))),
        handleTopFromOverallMm:
          productType === "flat" || !Number.isFinite(handleTopFromOverallMm)
            ? undefined
            : round2(Math.max(0, handleTopFromOverallMm ?? 0)),
        handleBottomFromOverallMm:
          productType === "flat" || !Number.isFinite(handleBottomFromOverallMm)
            ? undefined
            : round2(Math.max(0, handleBottomFromOverallMm ?? 0)),
        handleReachMm:
          productType === "flat" || !Number.isFinite(handleReachMm)
            ? undefined
            : round2(Math.max(0, handleReachMm ?? 0)),
        canonicalHandleProfile: productType === "flat" ? undefined : canonicalHandleProfile,
        canonicalBodyProfile: productType === "flat" ? undefined : (activeCanonicalBodyProfile ?? undefined),
        canonicalDimensionCalibration: productType === "flat" ? undefined : (activeCanonicalDimensionCalibration ?? undefined),
        axialSurfaceBands: productType === "flat" ? undefined : (activePrintableSurfaceResolution?.axialSurfaceBands ?? undefined),
        printableSurfaceContract:
          productType === "flat"
            ? undefined
            : (activePrintableSurfaceResolution?.printableSurfaceContract ?? undefined),
        shoulderDiameterMm:
          productType === "flat" || !Number.isFinite(shoulderDiameterMm)
            ? undefined
            : round2(Math.max(0, shoulderDiameterMm ?? 0)),
        taperUpperDiameterMm:
          productType === "flat" || !Number.isFinite(taperUpperDiameterMm)
            ? undefined
            : round2(Math.max(0, taperUpperDiameterMm ?? 0)),
        taperLowerDiameterMm:
          productType === "flat" || !Number.isFinite(taperLowerDiameterMm)
            ? undefined
            : round2(Math.max(0, taperLowerDiameterMm ?? 0)),
        bevelDiameterMm:
          productType === "flat" || !Number.isFinite(bevelDiameterMm)
            ? undefined
            : round2(Math.max(0, bevelDiameterMm ?? 0)),
        bodyOutlineProfile: productType === "flat" ? undefined : (referencePaths.bodyOutline ?? bodyOutlineProfile),
        referencePaths: productType === "flat"
          ? undefined
          : createReferencePaths({
              bodyOutline: referencePaths.bodyOutline ?? bodyOutlineProfile ?? null,
              lidProfile: referencePaths.lidProfile,
              silverProfile: referencePaths.silverProfile,
            }),
        referenceLayerState: productType === "flat" ? undefined : cloneReferenceLayerState(referenceLayerState),
        bodyHeightMm:
          productType === "flat" || !Number.isFinite(bodyBottomFromOverallMm - bodyTopFromOverallMm)
            ? undefined
            : round2(Math.max(0, bodyBottomFromOverallMm - bodyTopFromOverallMm)),
        topMarginMm: Number.isFinite(topMarginMm) ? topMarginMm : undefined,
        bottomMarginMm: Number.isFinite(bottomMarginMm) ? bottomMarginMm : undefined,
        referencePhotoScalePct:
          Number.isFinite(referencePhotoWidthScalePct) &&
          Number.isFinite(referencePhotoHeightScalePct) &&
          Math.abs(referencePhotoWidthScalePct - referencePhotoHeightScalePct) < 0.1
            ? referencePhotoWidthScalePct
            : undefined,
        referencePhotoWidthScalePct: Number.isFinite(referencePhotoWidthScalePct) ? referencePhotoWidthScalePct : undefined,
        referencePhotoHeightScalePct: Number.isFinite(referencePhotoHeightScalePct) ? referencePhotoHeightScalePct : undefined,
        referencePhotoLockAspect,
        referencePhotoOffsetXPct: Number.isFinite(referencePhotoOffsetXPct) ? referencePhotoOffsetXPct : undefined,
        referencePhotoOffsetYPct: Number.isFinite(referencePhotoOffsetYPct) ? referencePhotoOffsetYPct : undefined,
        referencePhotoAnchorY,
        referencePhotoCenterMode,
        bodyColorHex: bodyColorHex || undefined,
        rimColorHex: rimColorHex || undefined,
      },
      laserSettings: {
        power,
        speed,
        frequency,
        lineInterval,
        materialProfileId,
        rotaryPresetId: "",
      },
      createdAt: editingTemplate?.createdAt ?? now,
      updatedAt: now,
      builtIn: editingTemplate?.builtIn ?? false,
      tumblerMapping: productType === "flat" ? undefined : tumblerMapping,
      frontPhotoDataUrl: frontPhotoDataUrl || undefined,
      backPhotoDataUrl: backPhotoDataUrl || undefined,
      manufacturerLogoStamp: productType === "flat" ? undefined : resolvedManufacturerLogoStamp,
      productReferenceSet: productType === "flat" ? undefined : productReferenceSet,
    };

    if (isEdit) {
      updateTemplate(template.id, template);
    } else {
      saveTemplate(template);
    }
    onSave(template);
  }, [
    backPhotoDataUrl,
    bodyColorHex,
    bodyBottomFromOverallMm,
    bodyOutlineProfile,
    bodyTopFromOverallMm,
    bottomMarginMm,
    brand,
    capacity,
    activeCanonicalBodyProfile,
    activeCanonicalDimensionCalibration,
    canonicalHandleProfile,
    advancedGeometryOverridesUnlocked,
    derivedDiameterMismatchMm,
    editingTemplate,
    effectiveCylinderDiameterMm,
    hasBlockingGeometryMismatch,
    activeDrinkwareGlbStatus,
    activePrintableSurfaceResolution?.axialSurfaceBands,
    activePrintableSurfaceResolution?.printableSurfaceContract,
    flatFamilyKey,
    flatLookupMatch,
    flatLookupResult,
    flatThicknessMm,
    flatWidthMm,
    frontPhotoDataUrl,
    frequency,
    glbPath,
    handleArcDeg,
    isEdit,
    laserType,
    lineInterval,
    manufacturerLogoStamp,
    materialProfileId,
    name,
    onSave,
    overallHeightMm,
    power,
    printHeightMm,
    printableBottomOverrideMm,
    printableTopOverrideMm,
    productReferenceSet,
    productPhotoFullUrl,
    productType,
    referenceLayerState,
    referencePaths,
    referencePhotoAnchorY,
    referencePhotoCenterMode,
    referencePhotoHeightScalePct,
    referencePhotoLockAspect,
    referencePhotoOffsetXPct,
    referencePhotoOffsetYPct,
    referencePhotoWidthScalePct,
    resolvedMaterialLabel,
    resolvedMaterialSlug,
    resolveManufacturerLogoStamp,
    rimColorHex,
    handleBottomFromOverallMm,
    handleReachMm,
    shoulderDiameterMm,
    taperUpperDiameterMm,
    taperLowerDiameterMm,
    bevelDiameterMm,
    handleTopFromOverallMm,
    lidSeamFromOverallMm,
    silverBandBottomFromOverallMm,
    speed,
    taperCorrection,
    templateWidthMm,
    thumbDataUrl,
    topOuterDiameterMm,
    baseDiameterMm,
    topMarginMm,
    tumblerMapping,
    verifyCurrentGlbPath,
  ]);

  React.useImperativeHandle(ref, () => ({
    save: () => {
      void handleSave();
    },
  }), [handleSave]);

  return (
    <div className={styles.form}>
      {errors.length > 0 && (
        <div ref={errorSummaryRef} className={styles.errorSummary} role="alert" aria-live="assertive">
          <div className={styles.errorSummaryTitle}>Can&apos;t save template yet</div>
          <div className={styles.errorSummaryList}>
            {errors.map((err) => (
              <div key={err} className={styles.errorSummaryItem}>{err}</div>
            ))}
          </div>
        </div>
      )}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Smart lookup</div>
        <SmartTemplateLookupPanel
          onResolved={applySmartLookupResult}
          onOpenMapping={() => setShowMappingWizard(true)}
          canOpenMapping={Boolean(glbPath.trim()) && Boolean(productType) && productType !== "flat"}
          onClearResult={() => setSmartLookupApplied(false)}
        />
      </div>
      {/* ── Product identity ──────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Product identity</div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Product name *</label>
          <input
            className={styles.textInput}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Brand</label>
          <input
            className={styles.textInput}
            type="text"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Capacity</label>
          <input
            className={styles.textInput}
            type="text"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Laser type</label>
          <select
            className={styles.selectInput}
            value={laserType}
            onChange={(e) => setLaserType(e.target.value as TemplateLaserType)}
          >
            <option value="">Optional</option>
            <option value="fiber">Fiber</option>
            <option value="co2">CO₂</option>
            <option value="diode">Diode</option>
          </select>
          <span className={styles.fieldHint}>Optional. Leave blank if the template should not preselect a laser source.</span>
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Product type</label>
          <select
            className={styles.selectInput}
            value={productType}
            onChange={(e) => {
              setProductType(e.target.value as TemplateProductType);
              setSmartLookupApplied(false);
              clearLookupState({ clearFamilyKey: true });
            }}
          >
            <option value="">Select product type</option>
            <option value="tumbler">Tumbler</option>
            <option value="mug">Mug</option>
            <option value="bottle">Bottle</option>
            <option value="flat">Flat</option>
          </select>
        </div>
      </div>

      {/* ── Product image + auto-detect ──────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Product image</div>

        {productType && !smartLookupApplied && (
          <div className={styles.lookupBlock}>
            <div className={styles.lookupHeader}>
              <div>
                <div className={styles.lookupTitle}>Item lookup</div>
                <div className={styles.lookupHint}>
                  {productType === "flat"
                    ? "Paste a product name or URL slug. Lookup will try to match a flat-bed catalog item and fill its dimensions."
                    : "Paste a product URL or product name. Lookup will try to resolve the item, reuse a known tumbler profile when possible, and pull a usable product photo."}
                </div>
              </div>
              {(lookupResult || flatLookupMatch || flatLookupResult) && (
                <button
                  type="button"
                  className={styles.lookupResetBtn}
                  onClick={() => clearLookupState({ clearFamilyKey: true })}
                >
                  Clear lookup
                </button>
              )}
            </div>
            <form
              className={styles.lookupRow}
              onSubmit={(event) => {
                event.preventDefault();
                if (!lookingUpItem && lookupInput.trim()) {
                  void handleItemLookup();
                }
              }}
            >
              <input
                className={styles.textInput}
                type="text"
                value={lookupInput}
                onChange={(e) => setLookupInput(e.target.value)}
                placeholder={productType === "flat"
                  ? "Acacia cutting board, stainless dog tag, slate coaster..."
                  : "https://example.com/product or Stanley IceFlow 30 oz"}
              />
              <button
                type="button"
                className={styles.detectBtn}
                onClick={() => void handleItemLookup()}
                disabled={lookingUpItem || !lookupInput.trim()}
              >
                {lookingUpItem ? "Looking up..." : "Run lookup"}
              </button>
            </form>
            <div className={styles.lookupAssistText} role="status" aria-live="polite">
              {lookingUpItem
                ? "Checking the product and filling the best available dimensions."
                : "Press Enter or click Run lookup, then review the result before saving."}
            </div>

            {lookupResult && (
              <div className={styles.lookupSummary}>
                <div className={styles.lookupSummaryHeader}>
                  <div className={styles.lookupSummaryTitle}>
                    {lookupResult.title || name || "Resolved item"}
                  </div>
                  <div className={styles.lookupBadgeRow}>
                    <span className={styles.lookupBadgePrimary}>
                      {getLookupModeLabel(lookupResult.mode)}
                    </span>
                    {getLookupSourceLabel(lookupResult) && (
                      <span className={styles.lookupBadgeMuted}>
                        {getLookupSourceLabel(lookupResult)}
                      </span>
                    )}
                    {lookupResult.imageUrl && productImageLabel && thumbDataUrl && (
                      <span className={styles.lookupBadgeMuted}>Photo applied</span>
                    )}
                  </div>
                </div>
                <div className={styles.lookupSummaryLine}>
                  {[lookupResult.brand, lookupResult.capacityOz ? `${lookupResult.capacityOz}oz` : null]
                    .filter(Boolean)
                    .join(" / ")}
                </div>
                <div className={styles.lookupMetrics}>
                  {formatLookupMeasurement(lookupResult.dimensions.outsideDiameterMm) && (
                    <span>Dia {formatLookupMeasurement(lookupResult.dimensions.outsideDiameterMm)}</span>
                  )}
                  {formatLookupMeasurement(lookupResult.dimensions.usableHeightMm) && (
                    <span>Print {formatLookupMeasurement(lookupResult.dimensions.usableHeightMm)}</span>
                  )}
                  {lookupResult.glbPath && (
                    <span>{getDrinkwareGlbStatusLabel(lookupResult.modelStatus ?? "verified-product-model")}</span>
                  )}
                </div>
                {lookupResult.modelSourceLabel && (
                  <div className={styles.lookupNotice}>{lookupResult.modelSourceLabel}</div>
                )}
              </div>
            )}

            {flatLookupResult && (
              <div
                className={[
                  styles.lookupSummary,
                  flatLookupResult.isProxy ? styles.lookupSummaryWarning : "",
                  flatLookupResult.requiresReview && !flatLookupResult.isProxy ? styles.lookupSummaryReview : "",
                ].filter(Boolean).join(" ")}
              >
                <div className={styles.lookupSummaryHeader}>
                  <div className={styles.lookupSummaryTitle}>{flatLookupResult.label}</div>
                  <div className={styles.lookupBadgeRow}>
                    <span className={styles.lookupBadgePrimary}>
                      {getFlatLookupModeLabel(flatLookupResult.mode)}
                    </span>
                    <span className={styles.lookupBadgeMuted}>{flatLookupResult.materialLabel}</span>
                    {flatLookupResult.glbPath && (
                      <span
                        className={[
                          flatLookupResult.isProxy ? styles.lookupBadgeWarning : styles.lookupBadgeMuted,
                          flatLookupResult.requiresReview && !flatLookupResult.isProxy ? styles.lookupBadgeReview : "",
                        ].filter(Boolean).join(" ")}
                      >
                        {getFlatModelStrategyLabel(flatLookupResult.modelStrategy)}
                      </span>
                    )}
                    {flatLookupResult.requiresReview && (
                      <span className={styles.lookupBadgeReview}>Review before save</span>
                    )}
                  </div>
                </div>
                <div className={styles.lookupSummaryLine}>
                  {[flatLookupResult.brand, flatLookupResult.category, `${Math.round(flatLookupResult.confidence * 100)}% confidence`]
                    .filter(Boolean)
                    .join(" / ")}
                </div>
                <div className={styles.lookupMetrics}>
                  <span>Width {round2(flatLookupResult.widthMm)} mm</span>
                  <span>Height {round2(flatLookupResult.heightMm)} mm</span>
                  <span>Thickness {round2(flatLookupResult.thicknessMm)} mm</span>
                  {formatFlatTraceQuality(flatLookupResult.traceScore) && (
                    <span>{formatFlatTraceQuality(flatLookupResult.traceScore)}</span>
                  )}
                </div>
                {!flatLookupResult.glbPath && getFlatLookupNotice(flatLookupResult) && (
                  <div className={styles.lookupNotice}>{getFlatLookupNotice(flatLookupResult)}</div>
                )}
              </div>
            )}

            {!flatLookupResult && flatLookupMatch && (
              <div className={styles.lookupSummary}>
                <div className={styles.lookupSummaryHeader}>
                  <div className={styles.lookupSummaryTitle}>{flatLookupMatch.label}</div>
                  <div className={styles.lookupBadgeRow}>
                    <span className={styles.lookupBadgePrimary}>Catalog match</span>
                    <span className={styles.lookupBadgeMuted}>{flatLookupMatch.materialLabel}</span>
                  </div>
                </div>
                <div className={styles.lookupSummaryLine}>{flatLookupMatch.category}</div>
                <div className={styles.lookupMetrics}>
                  <span>Width {round2(flatLookupMatch.widthMm)} mm</span>
                  <span>Height {round2(flatLookupMatch.heightMm)} mm</span>
                  <span>Thickness {round2(flatLookupMatch.thicknessMm)} mm</span>
                </div>
              </div>
            )}

            {lookupError && <div className={styles.detectErrorBanner}>{lookupError}</div>}

            {lookupResult?.fitDebug && lookupDebugImageUrl && (
              <TumblerLookupDebugPanel
                debug={lookupResult.fitDebug}
                imageUrl={bodyReferencePhotoDataUrl || lookupDebugImageUrl}
                handleProfile={canonicalHandleProfile}
              />
            )}

            {flatLookupResult?.traceDebug && lookupDebugImageUrl && (
              <FlatItemLookupDebugPanel
                debug={flatLookupResult.traceDebug}
                imageUrl={lookupDebugImageUrl}
              />
            )}
          </div>
        )}

        {productType && productType !== "flat" && (
          <div className={styles.lookupBlock}>
            <div className={styles.lookupHeader}>
              <div>
                <div className={styles.lookupTitle}>Catalog batch upload</div>
                <div className={styles.lookupHint}>
                  Paste an official collection or category URL to create one template per product style, not one per color.
                </div>
              </div>
            </div>
            <form
              className={styles.lookupRow}
              onSubmit={(event) => {
                event.preventDefault();
                if (!isBatchImporting && batchImportUrl.trim()) {
                  void handleCatalogBatchImport();
                }
              }}
            >
              <input
                className={styles.textInput}
                type="url"
                value={batchImportUrl}
                onChange={(e) => setBatchImportUrl(e.target.value)}
                placeholder="https://www.stanley1913.com/collections/adventure-quencher-travel-tumblers"
              />
              <button
                type="button"
                className={styles.detectBtn}
                onClick={() => void handleCatalogBatchImport()}
                disabled={isBatchImporting || !batchImportUrl.trim()}
              >
                {isBatchImporting ? "Importing..." : "Batch upload"}
              </button>
            </form>
            <div className={styles.lookupAssistText} role="status" aria-live="polite">
              {isBatchImporting
                ? batchImportStatus ?? "Importing catalog styles into templates."
                : "Current live provider support is Stanley 1913 official catalog URLs. The workflow is provider-based so more catalogs can use this same screen later."}
            </div>

            {batchImportStatus && !isBatchImporting && (
              <div className={styles.batchImportStatus}>{batchImportStatus}</div>
            )}

            {batchImportError && (
              <div className={styles.detectErrorBanner}>{batchImportError}</div>
            )}

            {batchImportSummary && (
              <div className={styles.lookupSummary}>
                <div className={styles.lookupSummaryHeader}>
                  <div className={styles.lookupSummaryTitle}>
                    Imported {batchImportSummary.createdCount + batchImportSummary.updatedCount} {batchImportSummary.providerLabel} styles
                  </div>
                  <div className={styles.lookupBadgeRow}>
                    <span className={styles.lookupBadgePrimary}>Style-level import</span>
                    <span className={styles.lookupBadgeMuted}>{batchImportSummary.providerLabel}</span>
                  </div>
                </div>
                <div className={styles.lookupSummaryLine}>
                  {batchImportSummary.styleCount} discovered from the source catalog. Colors stay attached to each style card as swatches.
                </div>
                <div className={styles.lookupMetrics}>
                  <span>{batchImportSummary.createdCount} new</span>
                  <span>{batchImportSummary.updatedCount} updated</span>
                  {batchImportSummary.failedCount > 0 && (
                    <span>{batchImportSummary.failedCount} failed</span>
                  )}
                </div>
                {batchImportSummary.failedNames.length > 0 && (
                  <div className={styles.lookupNotice}>
                    Failed: {batchImportSummary.failedNames.slice(0, 5).join(", ")}
                    {batchImportSummary.failedNames.length > 5 ? "..." : ""}
                  </div>
                )}
                <div className={styles.lookupRow}>
                  <button
                    type="button"
                    className={styles.lookupResetBtn}
                    onClick={onCancel}
                  >
                    View imported templates
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Product photo</label>
          <div className={styles.thumbRow}>
            <div className={styles.thumbDropZone}>
              <FileDropZone
                accept="image/*"
                fileName={productImageLabel}
                onFileSelected={(f) => void handleProductImage(f)}
                onClear={clearProductImage}
              />
            </div>
            {thumbDataUrl && (
              <div className={styles.productPhotoPreview}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbDataUrl}
                  alt="Thumbnail preview"
                  className={styles.thumbPreview}
                />
                {lookupResult?.imageUrl && productImageLabel && (
                  <span className={styles.productPhotoMeta}>{productImageLabel}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {productImageFile && productType && productType !== "flat" && !detectResult && !lookupResult && !smartLookupApplied && (
          <button
            type="button"
            className={styles.detectBtn}
            onClick={() => void handleAutoDetect()}
            disabled={detecting}
          >
            {detecting ? "Detecting\u2026" : "Auto-detect product specs"}
          </button>
        )}

        {detectResult && !lookupResult && !smartLookupApplied && (
          <div className={styles.detectBanner}>
            <span className={styles.detectBannerText}>
              Detected: <strong>{name || "Unknown product"}</strong> — review and confirm
            </span>
            <button
              type="button"
              className={styles.detectRerunBtn}
              onClick={() => void handleAutoDetect()}
              disabled={detecting}
            >
              {detecting ? "Re-detecting\u2026" : "Re-detect"}
            </button>
          </div>
        )}

        {detectError && !lookupResult && !smartLookupApplied && (
          <div className={styles.detectErrorBanner}>
            {detectError} — fill in manually below.
          </div>
        )}
      </div>

      {/* ── Front / Back face photos ─────────────────────────────── */}
      {productType && productType !== "flat" && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Face photos (grid overlay)</div>

          {/* ── FRONT ── */}
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Front face</label>
            <div className={styles.thumbRow}>
              <div className={styles.thumbDropZone}>
                <FileDropZone
                  accept="image/*"
                  fileName={frontPhotoDataUrl ? "front-photo" : null}
                  label="Drop front photo"
                  hint="Auto background removal"
                  onFileSelected={async (f) => {
                    const original = await fileToFacePhotoDataUrl(f);
                    if (!original) return;
                    setFrontOriginalUrl(original);
                    setFrontCleanUrl("");
                    setFrontPhotoDataUrl(original);
                    setFrontUseOriginal(false);
                    setFrontBgStatus("idle");
                  }}
                  onClear={() => { setFrontPhotoDataUrl(""); setFrontOriginalUrl(""); setFrontCleanUrl(""); setFrontBgStatus("idle"); }}
                />
              </div>
              {frontPhotoDataUrl && (
                <div className={styles.bgPreviewGroup}>
                  <div className={styles.bgPreviewItem}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={frontPhotoDataUrl} alt="Front" className={styles.thumbPreview} />
                    {frontBgStatus === "done" && <span className={styles.bgPreviewLabelDone}>BG removed</span>}
                  </div>
                  {frontBgStatus === "idle" && (
                    <button
                      type="button"
                      className={styles.bgRemoveBtn}
                      onClick={async () => {
                        setFrontBgStatus("processing");
                        try {
                          const res = await fetch(frontPhotoDataUrl);
                          const blob = await res.blob();
                          const { removeBackground } = await import("@imgly/background-removal");
                          const clean = await removeBackground(blob, { model: "isnet_quint8", proxyToWorker: false });
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            const url = reader.result as string;
                            if (url) {
                              setFrontCleanUrl(url);
                              setFrontPhotoDataUrl(url);
                              setFrontBgStatus("done");
                            } else {
                              setFrontBgStatus("failed");
                            }
                          };
                          reader.onerror = () => setFrontBgStatus("failed");
                          reader.readAsDataURL(clean);
                        } catch {
                          setFrontBgStatus("failed");
                        }
                      }}
                    >
                      Remove background
                    </button>
                  )}
                  {frontBgStatus === "processing" && (
                    <span className={styles.bgProcessing}>Removing background…</span>
                  )}
                  {frontBgStatus === "done" && frontCleanUrl && (
                    <label className={styles.bgToggle}>
                      <input type="checkbox" checked={frontUseOriginal}
                        onChange={(e) => {
                          setFrontUseOriginal(e.target.checked);
                          setFrontPhotoDataUrl(e.target.checked ? frontOriginalUrl : frontCleanUrl);
                        }}
                      /> Use original
                    </label>
                  )}
                  {frontBgStatus === "failed" && (
                    <span className={styles.bgFailed}>BG removal failed — using original</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Front captured prompt ── */}
          {frontPhotoDataUrl && !backPhotoDataUrl && !mirrorForBack && (
            <div className={styles.frontCapturedBanner}>
              <div className={styles.frontCapturedTitle}>Front photo captured</div>
              <div className={styles.frontCapturedHint}>
                For two-sided placement, add a back photo or enable mirror below.
              </div>
            </div>
          )}

          {/* ── Mirror for back toggle ── */}
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel} />
            <label className={styles.mirrorToggle}>
              <input
                type="checkbox"
                checked={mirrorForBack}
                onChange={(e) => {
                  setMirrorForBack(e.target.checked);
                  if (e.target.checked) {
                    // Clear manual back photo state when switching to mirror
                    setBackOriginalUrl("");
                    setBackCleanUrl("");
                    setBackBgStatus("idle");
                    setBackUseOriginal(false);
                  }
                }}
              />
              <span>Use mirrored front photo for back side</span>
            </label>
          </div>

          {/* ── BACK — manual upload (hidden when mirroring) ── */}
          {referenceSelection && (
            <div className={styles.frontCapturedBanner}>
              <div className={styles.frontCapturedTitle}>Reference classification</div>
              <div className={styles.frontCapturedHint}>
                {canonicalFrontReferenceImage
                  ? `Front: ${canonicalFrontReferenceImage.viewClass} (${Math.round((referenceSelection.frontConfidence ?? 0) * 100)}%). `
                  : "Front: unknown. "}
                {referenceSelection.canonicalBackStatus === "true-back" && canonicalBackReferenceImage
                  ? `Back: true back (${Math.round((referenceSelection.backConfidence ?? 0) * 100)}%).`
                  : referenceSelection.canonicalBackStatus === "only-back-3q-found" && auxiliaryBackReferenceImage
                    ? `Back: unavailable. Best auxiliary reference is back-3q (${Math.round((referenceSelection.backConfidence ?? 0) * 100)}%). Enable mirror only if you want to reuse the front photo.`
                    : "Back: unknown. Add a real back photo or enable mirror manually."}
              </div>
            </div>
          )}

          {!mirrorForBack && (
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>Back face</label>
              <div className={styles.thumbRow}>
                <div className={`${styles.thumbDropZone} ${frontPhotoDataUrl && !backPhotoDataUrl ? styles.backDropHighlight : ""}`}>
                  <FileDropZone
                    accept="image/*"
                    fileName={backPhotoDataUrl ? "back-photo" : null}
                    label="Drop back photo"
                    hint={frontPhotoDataUrl ? "Rotate tumbler 180° and photograph" : "Auto background removal"}
                    onFileSelected={async (f) => {
                      const original = await fileToFacePhotoDataUrl(f);
                      if (!original) return;
                      setBackOriginalUrl(original);
                      setBackCleanUrl("");
                      setBackPhotoDataUrl(original);
                      setBackUseOriginal(false);
                      setBackBgStatus("idle");
                    }}
                    onClear={() => { setBackPhotoDataUrl(""); setBackOriginalUrl(""); setBackCleanUrl(""); setBackBgStatus("idle"); }}
                  />
                </div>
                {backPhotoDataUrl && (
                  <div className={styles.bgPreviewGroup}>
                    <div className={styles.bgPreviewItem}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={backPhotoDataUrl} alt="Back" className={styles.thumbPreview} />
                      {backBgStatus === "done" && <span className={styles.bgPreviewLabelDone}>BG removed</span>}
                    </div>
                    {backBgStatus === "idle" && (
                      <button
                        type="button"
                        className={styles.bgRemoveBtn}
                        onClick={async () => {
                          setBackBgStatus("processing");
                          try {
                            const res = await fetch(backPhotoDataUrl);
                            const blob = await res.blob();
                            const { removeBackground } = await import("@imgly/background-removal");
                            const clean = await removeBackground(blob, { model: "isnet_quint8", proxyToWorker: false });
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              const url = reader.result as string;
                              if (url) {
                                setBackCleanUrl(url);
                                setBackPhotoDataUrl(url);
                                setBackBgStatus("done");
                              } else {
                                setBackBgStatus("failed");
                              }
                            };
                            reader.onerror = () => setBackBgStatus("failed");
                            reader.readAsDataURL(clean);
                          } catch {
                            setBackBgStatus("failed");
                          }
                        }}
                      >
                        Remove background
                      </button>
                    )}
                    {backBgStatus === "processing" && (
                      <span className={styles.bgProcessing}>Removing background…</span>
                    )}
                    {backBgStatus === "done" && backCleanUrl && (
                      <label className={styles.bgToggle}>
                        <input type="checkbox" checked={backUseOriginal}
                          onChange={(e) => {
                            setBackUseOriginal(e.target.checked);
                            setBackPhotoDataUrl(e.target.checked ? backOriginalUrl : backCleanUrl);
                          }}
                        /> Use original
                      </label>
                    )}
                    {backBgStatus === "failed" && (
                      <span className={styles.bgFailed}>BG removal failed — using original</span>
                    )}
                  </div>
                )}
              </div>
              {hasStrictCanonicalBack && (
                <span className={styles.fieldHint}>
                  Canonical back is a strict true-back reference ({Math.round((referenceSelection?.backConfidence ?? 0) * 100)}% confidence).
                </span>
              )}
              {!backPhotoDataUrl && hasAuxiliaryBack3q && (
                <span className={styles.fieldHint}>
                  No strict true back was assigned. Best retained auxiliary reference is labeled back-3q ({Math.round((referenceSelection?.backConfidence ?? 0) * 100)}% confidence) and is not used for the Back face slot.
                </span>
              )}
            </div>
          )}

          {/* ── Mirror preview (when mirroring is on) ── */}
          {mirrorForBack && backPhotoDataUrl && (
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>Back (mirrored)</label>
              <div className={styles.bgPreviewGroup}>
                <div className={styles.bgPreviewItem}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={backPhotoDataUrl} alt="Mirrored back" className={styles.thumbPreview} />
                  <span className={styles.bgPreviewLabel}>Auto-mirrored</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 3D Model file ──────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>3D Model</div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>GLB / GLTF file</label>
          <div className={styles.glbRow}>
            <FileDropZone
              accept=".glb,.gltf"
              fileName={glbUploading ? "Uploading\u2026" : glbFileName}
              label="Drop GLB or GLTF file here"
              hint="3D model file for preview"
              onFileSelected={(f) => void handleGlbFile(f)}
              onClear={() => {
                setGlbFileName(null);
                setGlbPath("");
                setGlbUploadError(null);
              }}
            />
            {(glbPath || (productType && productType !== "flat")) && !glbUploading && (
              productType !== "flat" && activeDrinkwareGlbStatus?.status ? (
                <div
                  className={[
                    styles.glbPathStatusBlock,
                    activeDrinkwareGlbStatus.status === "placeholder-model" || activeDrinkwareGlbStatus.status === "missing-model"
                      ? styles.glbPathWarning
                      : "",
                  ].filter(Boolean).join(" ")}
                >
                  <span className={styles.glbPathStatusLabel}>{getDrinkwareGlbStatusLabel(activeDrinkwareGlbStatus.status)}</span>
                  <span className={styles.glbPathValue}>{glbPath || "No GLB assigned"}</span>
                  {activeDrinkwareGlbStatus.sourceLabel && (
                    <div className={styles.glbPathNote}>{activeDrinkwareGlbStatus.sourceLabel}</div>
                  )}
                </div>
              ) : getFlatGlbStatusLabel(activeFlatLookupModel) ? (
                <div
                  className={[
                    styles.glbPathStatusBlock,
                    activeFlatLookupModel?.isProxy ? styles.glbPathWarning : "",
                    activeFlatLookupModel?.requiresReview && !activeFlatLookupModel?.isProxy ? styles.glbPathReview : "",
                  ].filter(Boolean).join(" ")}
                >
                  <span className={styles.glbPathStatusLabel}>{getFlatGlbStatusLabel(activeFlatLookupModel)}</span>
                  <span className={styles.glbPathValue}>{glbPath}</span>
                </div>
              ) : (
                <span className={styles.glbPathConfirm}>
                  {glbPath} ✓
                </span>
              )
            )}
            {glbUploadError && (
              <span className={styles.error}>{glbUploadError}</span>
            )}
            <input
              className={styles.textInput}
              type="text"
              value={glbPath}
              onChange={(e) => {
                setGlbPath(e.target.value);
                setGlbUploadError(null);
              }}
              onBlur={() => {
                if (glbPath.trim()) void verifyCurrentGlbPath();
              }}
              placeholder="/models/templates/my-model.glb"
            />
            {activeFlatLookupModel && getFlatLookupNotice(activeFlatLookupModel) && (
              <div className={styles.glbPathNote}>{getFlatLookupNotice(activeFlatLookupModel)}</div>
            )}
          </div>
        </div>

        {glbPath && productType && productType !== "flat" && (
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Orientation</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                type="button"
                className={styles.detectBtn}
                disabled={checkingGlbPath}
                onClick={() => {
                  void (async () => {
                    const ok = await verifyCurrentGlbPath();
                    if (ok) setShowMappingWizard(true);
                  })();
                }}
              >
                {checkingGlbPath
                  ? "Checking model\u2026"
                  : tumblerMapping?.isMapped
                    ? "Re-map orientation"
                    : "Map tumbler orientation"}
              </button>
              {tumblerMapping?.isMapped && (
                <span className={styles.glbPathConfirm}>
                  Mapped ({((tumblerMapping.frontFaceRotation * 180) / Math.PI).toFixed(0)}&deg;) &#x2713;
                </span>
              )}
            </div>
          </div>
        )}

        {(glbPath.trim() || previewModelFile || liveFlatPreview || previewLoadError || canUseCanonicalPreviewModel) && (
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Preview</label>
            <div className={styles.modelPreviewBlock}>
              <div className={styles.modelPreviewMeta}>
                <span className={styles.modelPreviewMode}>
                  {getPreviewModelModeLabel({
                    productType,
                    mode: previewModelMode,
                    glbStatus: activeDrinkwareGlbStatus?.status,
                  })}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {productType !== "flat" && (
                    <>
                      <button
                        type="button"
                        className={`${styles.detectBtn} ${previewModelMode === "alignment-model" ? styles.detectBtnActive : ""}`}
                        disabled={!canUseCanonicalPreviewModel}
                        aria-pressed={previewModelMode === "alignment-model"}
                        onClick={() => handlePreviewModelModeChange("alignment-model")}
                      >
                        Alignment (Default)
                      </button>
                      <button
                        type="button"
                        className={`${styles.detectBtn} ${previewModelMode === "full-model" ? styles.detectBtnActive : ""}`}
                        disabled={!canUseCanonicalPreviewModel}
                        aria-pressed={previewModelMode === "full-model"}
                        onClick={() => handlePreviewModelModeChange("full-model")}
                      >
                        Full
                      </button>
                      <button
                        type="button"
                        className={`${styles.detectBtn} ${previewModelMode === "source-traced" ? styles.detectBtnActive : ""}`}
                        aria-pressed={previewModelMode === "source-traced"}
                        onClick={() => handlePreviewModelModeChange("source-traced")}
                      >
                        Source (Compare)
                      </button>
                    </>
                  )}
                  {!glbPath.trim() && !previewModelFile && liveFlatPreview && (
                    <span className={styles.modelPreviewDims}>
                      {liveFlatPreview.widthMm} x {liveFlatPreview.heightMm} x {liveFlatPreview.thicknessMm} mm
                    </span>
                  )}
                  {productType !== "flat" && activeDrinkwareGlbStatus && previewModelMode === "source-traced" && (
                    <span className={styles.modelPreviewDims}>
                      {getDrinkwareGlbStatusLabel(activeDrinkwareGlbStatus.status) ?? "Source model"}
                    </span>
                  )}
                </div>
              </div>
              <div className={styles.modelPreviewViewport}>
                {glbPath.trim() || previewModelFile || liveFlatPreview || canUseCanonicalPreviewModel ? (
                  <>
                    <ModelViewer
                      file={previewModelFile}
                      modelUrl={glbPath.trim() || undefined}
                      flatPreview={
                        preferGeneratedFlatPreview
                          ? liveFlatPreview
                          : (previewModelFile ? null : liveFlatPreview)
                      }
                      bedWidthMm={liveFlatPreview?.widthMm}
                      bedHeightMm={liveFlatPreview?.heightMm}
                      tumblerDims={liveTumblerDims}
                      handleArcDeg={handleArcDeg}
                      glbPath={glbPath || null}
                      tumblerMapping={tumblerMapping}
                      bodyTintColor={productType === "flat" ? undefined : bodyColorHex}
                      rimTintColor={productType === "flat" ? undefined : rimColorHex}
                      manufacturerLogoStamp={productType === "flat" ? undefined : manufacturerLogoStamp}
                      showTemplateSurfaceZones={true}
                      dimensionCalibration={productType === "flat" ? undefined : activeCanonicalDimensionCalibration}
                      canonicalBodyProfile={productType === "flat" ? undefined : activeCanonicalBodyProfile}
                      canonicalHandleProfile={productType === "flat" ? undefined : canonicalHandleProfile}
                      previewModelMode={previewModelMode}
                    />
                    {productType !== "flat" && previewModelMode === "alignment-model" && activeCanonicalBodyProfile && activeCanonicalDimensionCalibration && (
                      <svg
                        className={styles.modelPreviewOverlay}
                        viewBox={`${activeCanonicalDimensionCalibration.svgFrontViewBoxMm.x} ${activeCanonicalDimensionCalibration.svgFrontViewBoxMm.y} ${activeCanonicalDimensionCalibration.svgFrontViewBoxMm.width} ${activeCanonicalDimensionCalibration.svgFrontViewBoxMm.height}`}
                        preserveAspectRatio="xMidYMid meet"
                        aria-hidden="true"
                      >
                        <path
                          d={activeCanonicalBodyProfile.svgPath}
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth={0.8}
                          vectorEffect="non-scaling-stroke"
                          opacity={0.92}
                        />
                        {alignmentLogoOverlay && (
                          <>
                            <rect
                              x={alignmentLogoOverlay.centerXMm - alignmentLogoOverlay.widthMm / 2}
                              y={alignmentLogoOverlay.centerYMm - alignmentLogoOverlay.heightMm / 2}
                              width={alignmentLogoOverlay.widthMm}
                              height={alignmentLogoOverlay.heightMm}
                              fill="none"
                              stroke={alignmentLogoOverlay.strokeColor}
                              strokeWidth={0.8}
                              strokeDasharray="2 1.5"
                              vectorEffect="non-scaling-stroke"
                              opacity={0.95}
                            />
                            <line
                              x1={alignmentLogoOverlay.centerXMm}
                              y1={alignmentLogoOverlay.centerYMm - alignmentLogoOverlay.heightMm / 2}
                              x2={alignmentLogoOverlay.centerXMm}
                              y2={alignmentLogoOverlay.centerYMm + alignmentLogoOverlay.heightMm / 2}
                              stroke={alignmentLogoOverlay.strokeColor}
                              strokeWidth={0.8}
                              strokeDasharray="2 1.5"
                              vectorEffect="non-scaling-stroke"
                              opacity={0.92}
                            />
                            <line
                              x1={alignmentLogoOverlay.centerXMm - alignmentLogoOverlay.widthMm / 2}
                              y1={alignmentLogoOverlay.centerYMm}
                              x2={alignmentLogoOverlay.centerXMm + alignmentLogoOverlay.widthMm / 2}
                              y2={alignmentLogoOverlay.centerYMm}
                              stroke={alignmentLogoOverlay.strokeColor}
                              strokeWidth={0.8}
                              strokeDasharray="2 1.5"
                              vectorEffect="non-scaling-stroke"
                              opacity={0.92}
                            />
                          </>
                        )}
                      </svg>
                    )}
                  </>
                ) : (
                  <div className={styles.modelPreviewEmpty}>Preview unavailable</div>
                )}
              </div>
              {productType !== "flat" && previewModelMode === "alignment-model" && alignmentShellMismatchSummary && (
                <div className={styles.modelPreviewDims}>
                  Canonical silhouette QA: avg {alignmentShellMismatchSummary.averageErrorMm.toFixed(2)} mm / max {alignmentShellMismatchSummary.maxErrorMm.toFixed(2)} mm across {alignmentShellMismatchSummary.rowCount} rows
                  {" "}
                  {silhouetteLockPass ? "PASS" : "MISMATCH WARNING"}
                </div>
              )}
              {productType !== "flat" && previewModelMode === "alignment-model" && alignmentOrientationQASummary && (
                <div className={styles.modelPreviewDims}>
                  Canonical orientation QA: body top {alignmentOrientationQASummary.bodyTopWorldY.toFixed(1)} &gt; body bottom {alignmentOrientationQASummary.bodyBottomWorldY.toFixed(1)}
                  {" / "}
                  printable {alignmentOrientationQASummary.printableTopWorldY != null && alignmentOrientationQASummary.printableBottomWorldY != null
                    ? `${alignmentOrientationQASummary.printableTopWorldY.toFixed(1)} > ${alignmentOrientationQASummary.printableBottomWorldY.toFixed(1)}`
                    : "pending"}
                  {" / "}
                  sample order {alignmentOrientationQASummary.topSampleWorldY.toFixed(1)} &gt; {alignmentOrientationQASummary.bottomSampleWorldY.toFixed(1)}
                  {" "}
                  {orientationLockPass ? "PASS" : "ORIENTATION WARNING"}
                </div>
              )}
              {productType !== "flat" && canUseCanonicalPreviewModel && previewModelMode === "alignment-model" && (
                <div className={styles.modelPreviewHint}>
                  Alignment is the production-default view. Placement, wrap mapping, centerline, and snap stay pinned to canonical alignment data.
                </div>
              )}
              {productType !== "flat" && canUseCanonicalPreviewModel && previewModelMode === "source-traced" && (
                <div className={styles.modelPreviewCompareNote}>
                  Source is compare/debug only. Placement, wrap mapping, centerline, and snap still use canonical alignment data.
                </div>
              )}
              {previewLoadError && (
                <div className={styles.modelPreviewNote}>{previewLoadError}</div>
              )}
            </div>
          </div>
        )}

{productType !== "flat" && activeCanonicalDimensionCalibration && activeCanonicalBodyProfile && (
          <>
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>Calibration</label>
              <div className={styles.readOnly}>
                {activeCanonicalDimensionCalibration.frontVisibleWidthMm} mm front width / {activeCanonicalDimensionCalibration.wrapWidthMm} mm wrap width
              </div>
              <span className={styles.fieldHint}>Front projection and wrap circumference stay distinct but share one mm calibration.</span>
            </div>
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>Photo â†’ front</label>
              <div className={styles.readOnly}>
                {activeCanonicalDimensionCalibration.photoToFrontTransform.matrix.map((value) => value.toFixed(4)).join(", ")}
              </div>
            </div>
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>Front axis (px)</label>
              <div className={styles.readOnly}>
                {activeCanonicalDimensionCalibration.frontAxisPx.xTop.toFixed(1)}, {activeCanonicalDimensionCalibration.frontAxisPx.yTop.toFixed(1)}
                {" â†’ "}
                {activeCanonicalDimensionCalibration.frontAxisPx.xBottom.toFixed(1)}, {activeCanonicalDimensionCalibration.frontAxisPx.yBottom.toFixed(1)}
              </div>
            </div>
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>SVG front box</label>
              <div className={styles.readOnly}>
                {activeCanonicalDimensionCalibration.svgFrontViewBoxMm.x.toFixed(1)},
                {" "}
                {activeCanonicalDimensionCalibration.svgFrontViewBoxMm.y.toFixed(1)},
                {" "}
                {activeCanonicalDimensionCalibration.svgFrontViewBoxMm.width.toFixed(1)} Ã— {activeCanonicalDimensionCalibration.svgFrontViewBoxMm.height.toFixed(1)} mm
              </div>
            </div>
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>Wrap mapping</label>
              <div className={styles.readOnly}>
                front {activeCanonicalDimensionCalibration.wrapMappingMm.frontMeridianMm.toFixed(1)} / back {activeCanonicalDimensionCalibration.wrapMappingMm.backMeridianMm.toFixed(1)} / GLB {activeCanonicalDimensionCalibration.glbScale.unitsPerMm.toFixed(2)} units/mm / camera body-only
              </div>
            </div>
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>Handle mesh</label>
              <div className={styles.readOnly}>
                {canonicalHandleDebugSummary
                  ? `${canonicalHandleDebugSummary.side} / ${canonicalHandleDebugSummary.extrusionDepthMm.toFixed(2)} mm depth / ${Math.round(canonicalHandleDebugSummary.confidence * 100)}% confidence / ${canonicalHandleRenderMode}`
                  : "Unavailable"}
              </div>
              <span className={styles.fieldHint}>
                {canonicalHandleDebugSummary?.derivedFromCanonicalProfile
                  ? canonicalHandleRenderMode === "simplified"
                    ? "Simplified handle mesh derived from canonical anchors/opening because traced confidence is mid-range."
                    : canonicalHandleRenderMode === "hidden"
                      ? "Handle stays out of alignment rendering; keep-out data remains active."
                      : "Separate symmetric extrusion from canonical handle outer/inner contours."
                  : "No canonical handle profile available for extrusion."}
              </span>
            </div>
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>Handle keep-out</label>
              <div className={styles.readOnly}>
                {activeCanonicalDimensionCalibration.wrapMappingMm.handleKeepOutArcDeg && activeCanonicalDimensionCalibration.wrapMappingMm.handleMeridianMm != null
                  ? `center ${activeCanonicalDimensionCalibration.wrapMappingMm.handleMeridianMm.toFixed(1)} mm / arc ${activeCanonicalDimensionCalibration.wrapMappingMm.handleKeepOutArcDeg.toFixed(1)}° / sector ${activeCanonicalDimensionCalibration.wrapMappingMm.handleKeepOutStartMm?.toFixed(1)} → ${activeCanonicalDimensionCalibration.wrapMappingMm.handleKeepOutEndMm?.toFixed(1)} mm`
                  : "None"}
              </div>
              <span className={styles.fieldHint}>Wrap math stays body-only; the handle reserves an exclusion sector instead of receiving wrap artwork.</span>
            </div>
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>Front logo</label>
              <div className={styles.readOnly}>
                {manufacturerLogoStamp?.logoPlacement
                  ? `${manufacturerLogoStamp.logoPlacement.source} / θ ${((manufacturerLogoStamp.logoPlacement.thetaCenter * 180) / Math.PI).toFixed(1)}° / span ${((manufacturerLogoStamp.logoPlacement.thetaSpan * 180) / Math.PI).toFixed(1)}° / s ${manufacturerLogoStamp.logoPlacement.sCenter.toFixed(3)} / ${Math.round(manufacturerLogoStamp.logoPlacement.confidence * 100)}%`
                  : "Not detected"}
              </div>
              <span className={styles.fieldHint}>Stored in canonical body-local coordinates and reused by preview, wrap preview, and guide export.</span>
            </div>
            {logoPlacementSurfaceStatus && (
              <div className={styles.fieldRow}>
                <label className={styles.fieldLabel}>Logo boundary</label>
                <div className={styles.readOnly}>
                  {logoPlacementSurfaceStatus.logoTopMm.toFixed(1)}–{logoPlacementSurfaceStatus.logoBottomMm.toFixed(1)} mm
                </div>
                <span
                  className={`${styles.fieldHint} ${
                    lockedProductionGeometry && logoPlacementSurfaceStatus.overlapsPrintableSurface
                      ? styles.surfaceContractSummaryWarning
                      : ""
                  }`}
                >
                  {lockedProductionGeometry
                    ? logoPlacementSurfaceStatus.overlapsPrintableSurface
                      ? `Locked production warning: logo region crosses the printable ${
                          logoPlacementSurfaceStatus.overlapsTop && logoPlacementSurfaceStatus.overlapsBottom
                            ? "top and bottom boundaries"
                            : logoPlacementSurfaceStatus.overlapsTop
                              ? "top boundary"
                              : "bottom boundary"
                        } (${logoPlacementSurfaceStatus.printableTopMm.toFixed(1)}–${logoPlacementSurfaceStatus.printableBottomMm.toFixed(1)} mm from body top).`
                      : `Locked production check: logo region stays inside the printable ${logoPlacementSurfaceStatus.printableTopMm.toFixed(1)}–${logoPlacementSurfaceStatus.printableBottomMm.toFixed(1)} mm band.`
                    : `Manual geometry overrides are enabled. Printable-boundary checks remain advisory for the ${logoPlacementSurfaceStatus.printableTopMm.toFixed(1)}–${logoPlacementSurfaceStatus.printableBottomMm.toFixed(1)} mm band.`}
                </span>
              </div>
            )}
            {manufacturerLogoStamp?.logoPlacement && (
              <div className={styles.fieldRow}>
                <label className={styles.fieldLabel}>Logo adjust</label>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className={styles.detectBtn}
                    onClick={() => applyLogoPlacementAdjustment((placement) => ({
                      ...placement,
                      thetaCenter: Math.max(-Math.PI, placement.thetaCenter - (Math.PI / 90)),
                    }))}
                  >
                    θ -
                  </button>
                  <button
                    type="button"
                    className={styles.detectBtn}
                    onClick={() => applyLogoPlacementAdjustment((placement) => ({
                      ...placement,
                      thetaCenter: Math.min(Math.PI, placement.thetaCenter + (Math.PI / 90)),
                    }))}
                  >
                    θ +
                  </button>
                  <button
                    type="button"
                    className={styles.detectBtn}
                    onClick={() => applyLogoPlacementAdjustment((placement) => ({
                      ...placement,
                      sCenter: Math.max(0, placement.sCenter - 0.01),
                    }))}
                  >
                    s -
                  </button>
                  <button
                    type="button"
                    className={styles.detectBtn}
                    onClick={() => applyLogoPlacementAdjustment((placement) => ({
                      ...placement,
                      sCenter: Math.min(1, placement.sCenter + 0.01),
                    }))}
                  >
                    s +
                  </button>
                  <button
                    type="button"
                    className={styles.detectBtn}
                    onClick={() => applyLogoPlacementAdjustment((placement) => ({
                      ...placement,
                      thetaSpan: Math.max(0.08, placement.thetaSpan - (Math.PI / 120)),
                      sSpan: Math.max(0.02, placement.sSpan - 0.01),
                    }))}
                  >
                    span -
                  </button>
                  <button
                    type="button"
                    className={styles.detectBtn}
                    onClick={() => applyLogoPlacementAdjustment((placement) => ({
                      ...placement,
                      thetaSpan: Math.min(Math.PI, placement.thetaSpan + (Math.PI / 120)),
                      sSpan: Math.min(0.8, placement.sSpan + 0.01),
                    }))}
                  >
                    span +
                  </button>
                  <button
                    type="button"
                    className={styles.lookupResetBtn}
                    onClick={resetManufacturerLogoStampPlacement}
                    disabled={!detectedManufacturerLogoStamp?.logoPlacement}
                  >
                    Reset to detected
                  </button>
                  <button
                    type="button"
                    className={styles.lookupResetBtn}
                    onClick={() => applyLogoPlacementAdjustment((placement) => ({
                      ...placement,
                      thetaCenter: wrapTheta(placement.thetaCenter + Math.PI),
                    }))}
                  >
                    Duplicate to back
                  </button>
                </div>
                <span className={styles.fieldHint}>Manual nudges change the stored body-local logo region only. Reset restores the last detected placement.</span>
              </div>
            )}
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>Locked production geometry</label>
              <div className={styles.readOnly}>
                wrap width authoritative: {lockedProductionGeometry ? "yes" : "no"} / derived diameter {effectiveCylinderDiameterMm.toFixed(2)} mm / derived front width {frontVisibleWidthReady ? `${derivedFrontVisibleWidthMm.toFixed(2)} mm` : "pending body calibration"} / handle excluded from alignment: yes / silhouette QA: {silhouetteLockPass ? "PASS" : "MISMATCH"} / orientation QA: {alignmentOrientationQASummary ? (orientationLockPass ? "PASS" : "WARNING") : "pending"}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Physical dimensions ───────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Physical dimensions</div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>
            {productType === "flat" ? "Template width (mm) *" : "Front visible width (derived)"}
          </label>
          {productType === "flat" ? (
            <input
              className={styles.numInput}
              type="number"
              value={flatWidthMm || ""}
              step={0.1}
              onChange={(e) => {
                setFlatWidthMm(Number(e.target.value) || 0);
              }}
            />
          ) : (
            <>
              <span className={styles.readOnly}>
                {frontVisibleWidthReady ? `${derivedFrontVisibleWidthMm} mm` : "\u2014"}
              </span>
              <span className={styles.fieldHint}>
                {frontVisibleWidthReady
                  ? "Derived from the canonical body profile and used for body-only front alignment."
                  : "Available after BODY REFERENCE calibration builds the canonical body profile."}
              </span>
            </>
          )}
        </div>

        {productType && productType !== "flat" && (
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Wrap width / circumference (mm) *</label>
            <input
              className={styles.numInput}
              type="number"
              value={wrapWidthInputMm || ""}
              step={0.1}
              min={0}
              onChange={(e) => {
                setWrapWidthInputMm(Number(e.target.value) || 0);
              }}
            />
            <span className={styles.fieldHint}>Production-authoritative width. Cylinder diameter is derived from this value using diameter = wrap width / π.</span>
          </div>
        )}

        {productType && productType !== "flat" && (
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Cylinder diameter (derived)</label>
            <span className={styles.readOnly}>
              {effectiveCylinderDiameterMm > 0 ? `${effectiveCylinderDiameterMm} mm` : "\u2014"}
            </span>
            <span className={styles.fieldHint}>Read-only in locked production mode. Formula: diameter = wrap width / π.</span>
          </div>
        )}

        {productType && productType !== "flat" && (
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Locked production geometry</label>
            <label className={styles.fieldHint}>
              <input
                type="checkbox"
                checked={advancedGeometryOverridesUnlocked}
                onChange={(e) => setAdvancedGeometryOverridesUnlocked(e.target.checked)}
              />
              {" "}Unlock advanced geometry overrides
            </label>
            <span className={styles.fieldHint}>
              {advancedGeometryOverridesUnlocked
                ? "Manual overrides are enabled. The template is no longer in locked production mode."
                : "Wrap width is authoritative. Diameter and front alignment width are derived automatically."}
            </span>
          </div>
        )}

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Print height (mm) *</label>
          <input
            className={styles.numInput}
            type="number"
            value={printHeightMm || ""}
            step={0.1}
            onChange={(e) => setPrintHeightMm(Number(e.target.value) || 0)}
          />
        </div>

        {productType === "flat" && (
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Thickness (mm)</label>
            <input
              className={styles.numInput}
              type="number"
              value={flatThicknessMm || ""}
              step={0.1}
              min={0}
              onChange={(e) => setFlatThicknessMm(Number(e.target.value) || 0)}
            />
            <span className={styles.fieldHint}>Used for generated 3D preview</span>
          </div>
        )}

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>
            {productType === "flat" ? "Template width" : "Wrap width / circumference"}
          </label>
          <span className={styles.readOnly}>
            {templateWidthMm > 0 ? `${templateWidthMm} mm` : "\u2014"}{" "}
            <span className={styles.fieldHint}>
              {productType === "flat" ? "(from flat width)" : lockedProductionGeometry ? "(authoritative)" : "(derived from override diameter)"}
            </span>
          </span>
        </div>

        {productType && productType !== "flat" && (
          <>
            {advancedGeometryOverridesUnlocked && (
              <>
                <div className={styles.fieldRow}>
                  <label className={styles.fieldLabel}>Top outer diameter override (mm)</label>
                  <input
                    className={styles.numInput}
                    type="number"
                    value={topOuterDiameterMm || ""}
                    step={0.1}
                    min={0}
                    onChange={(e) => setTopOuterDiameterMm(Number(e.target.value) || 0)}
                  />
                  <span className={styles.fieldHint}>Optional lid/rim outer-size override for preview and reference fitting.</span>
                </div>

                <div className={styles.fieldRow}>
                  <label className={styles.fieldLabel}>Cylinder diameter override (mm)</label>
                  <input
                    className={styles.numInput}
                    type="number"
                    value={diameterMm || ""}
                    step={0.1}
                    min={0}
                    onChange={(e) => {
                      const next = Number(e.target.value) || 0;
                      const shouldSyncBase = baseDiameterMm <= 0 || Math.abs(baseDiameterMm - diameterMm) < 0.01;
                      setDiameterMm(next);
                      if (shouldSyncBase) setBaseDiameterMm(next);
                    }}
                  />
                  <span className={styles.fieldHint}>Manual override only. Locked-production consumers still derive from wrap width when overrides are disabled.</span>
                </div>

                <div className={styles.fieldRow}>
                  <label className={styles.fieldLabel}>Base diameter (mm)</label>
                  <input
                    className={styles.numInput}
                    type="number"
                    value={baseDiameterMm || ""}
                    step={0.1}
                    min={0}
                    onChange={(e) => setBaseDiameterMm(Number(e.target.value) || 0)}
                  />
                  <span className={styles.fieldHint}>Used for the lower foot / taper width.</span>
                </div>
              </>
            )}

            {hasBlockingGeometryMismatch && (
              <div className={styles.error}>
                Cylinder diameter override differs from wrap width by {derivedDiameterMismatchMm.toFixed(2)} mm.
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setDiameterMm(round2(templateWidthMm / Math.PI))}
                >
                  Recompute derived fields from wrap width
                </button>
              </div>
            )}

            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>Handle arc (&deg;)</label>
              <input
                className={styles.numInput}
                type="number"
                value={handleArcDeg}
                step={1}
                min={0}
                max={360}
                onChange={(e) => setHandleArcDeg(Number(e.target.value) || 0)}
              />
              <span className={styles.fieldHint}>0 = no handle, 90 = YETI Rambler style</span>
            </div>

            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>Taper correction</label>
              <select
                className={styles.selectInput}
                value={taperCorrection}
                onChange={(e) => setTaperCorrection(e.target.value as "none" | "top-narrow" | "bottom-narrow")}
              >
                <option value="none">None</option>
                <option value="top-narrow">Top narrow</option>
                <option value="bottom-narrow">Bottom narrow</option>
              </select>
            </div>
          </>
        )}
      </div>

      {/* ── Engravable zone editor ──────────────────────────────── */}
      {productType && productType !== "flat" && activeReferencePhotoDataUrl && (overallHeightMm <= 0 || effectiveCylinderDiameterMm <= 0) && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Body reference</div>
          <div className={styles.bodyReferenceLockedNotice}>
            Body reference stays hidden until the required dimensions are filled.
            {overallHeightMm <= 0 && " Add overall height."}
            {effectiveCylinderDiameterMm <= 0 && " Add wrap width / circumference."}
          </div>
        </div>
      )}
      {productType && productType !== "flat" && activeReferencePhotoDataUrl && overallHeightMm > 0 && effectiveCylinderDiameterMm > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Body reference</div>
          {activePrintableSurfaceResolution && (
            <div className={styles.surfaceContractSummary}>
              <div className={styles.surfaceContractSummaryGrid}>
                <div>
                  <div className={styles.surfaceContractMetricLabel}>Printable top</div>
                  <div className={styles.surfaceContractMetricValue}>
                    {round2(activePrintableSurfaceResolution.printableSurfaceContract.printableTopMm)} mm
                  </div>
                </div>
                <div>
                  <div className={styles.surfaceContractMetricLabel}>Printable bottom</div>
                  <div className={styles.surfaceContractMetricValue}>
                    {round2(activePrintableSurfaceResolution.printableSurfaceContract.printableBottomMm)} mm
                  </div>
                </div>
                <div>
                  <div className={styles.surfaceContractMetricLabel}>Printable height</div>
                  <div className={styles.surfaceContractMetricValue}>
                    {round2(activePrintableSurfaceResolution.printableSurfaceContract.printableHeightMm)} mm
                  </div>
                </div>
                <div>
                  <div className={styles.surfaceContractMetricLabel}>Top exclusions</div>
                  <div className={styles.surfaceContractMetricValue}>
                    {activePrintableSurfaceResolution.printableSurfaceContract.axialExclusions
                      .filter((band) => band.kind !== "base")
                      .map((band) => (band.kind === "rim-ring" ? "ring" : band.kind))
                      .join(" / ") || "none"}
                  </div>
                </div>
                <div>
                  <div className={styles.surfaceContractMetricLabel}>Handle keep-out</div>
                  <div className={styles.surfaceContractMetricValue}>
                    {activePrintableSurfaceResolution.printableSurfaceContract.circumferentialExclusions.length ? "yes" : "no"}
                  </div>
                </div>
                <div>
                  <div className={styles.surfaceContractMetricLabel}>Boundary source</div>
                  <div className={styles.surfaceContractMetricValue}>
                    {activePrintableSurfaceResolution.topBoundarySource}
                  </div>
                </div>
              </div>
              <div className={`${styles.surfaceContractSummaryNote} ${activePrintableSurfaceResolution.automaticDetectionWeak ? styles.surfaceContractSummaryWarning : ""}`}>
                {activePrintableSurfaceResolution.automaticDetectionWeak
                  ? "Auto top-band detection is weak. Set printable top / bottom explicitly before saving production geometry."
                  : "Axial bands only affect printable height. Wrap width and centerline stay unchanged."}
              </div>
            </div>
          )}
          <EngravableZoneEditor
            photoDataUrl={activeReferencePhotoDataUrl}
            overallHeightMm={overallHeightMm}
            bodyTopFromOverallMm={bodyTopFromOverallMm}
            bodyBottomFromOverallMm={bodyBottomFromOverallMm}
            lidSeamFromOverallMm={lidSeamFromOverallMm}
            silverBandBottomFromOverallMm={silverBandBottomFromOverallMm}
            diameterMm={effectiveCylinderDiameterMm}
            bodyWrapDiameterMm={effectiveCylinderDiameterMm}
            topOuterDiameterMm={topOuterDiameterMm}
            baseDiameterMm={baseDiameterMm}
            photoWidthScalePct={referencePhotoWidthScalePct}
            photoHeightScalePct={referencePhotoHeightScalePct}
            photoLockAspect={referencePhotoLockAspect}
            photoOffsetXPct={referencePhotoOffsetXPct}
            photoOffsetYPct={referencePhotoOffsetYPct}
            photoAnchorY={referencePhotoAnchorY}
            photoCenterMode={referencePhotoCenterMode}
            bodyColorHex={bodyColorHex}
            rimColorHex={rimColorHex}
            fitDebug={lookupResult?.fitDebug ?? null}
            outlineProfile={bodyOutlineProfile}
            referencePaths={referencePaths}
            referenceLayerState={referenceLayerState}
            dimensionCalibration={activeCanonicalDimensionCalibration ?? undefined}
            printableSurfaceContract={activePrintableSurfaceResolution?.printableSurfaceContract ?? null}
            printableTopOverrideMm={printableTopOverrideMm}
            printableBottomOverrideMm={printableBottomOverrideMm}
            onChange={(bodyTop, bodyBottom) => {
              setBodyTopFromOverallMm(bodyTop);
              setBodyBottomFromOverallMm(bodyBottom);
            }}
            onLidSeamChange={setLidSeamFromOverallMm}
            onSilverBandBottomChange={setSilverBandBottomFromOverallMm}
            onPrintableTopOverrideChange={setPrintableTopOverrideMm}
            onPrintableBottomOverrideChange={setPrintableBottomOverrideMm}
            onPrintableSurfaceDetectionChange={setPrintableSurfaceDetection}
            handleTopFromOverallMm={handleTopFromOverallMm}
            handleBottomFromOverallMm={handleBottomFromOverallMm}
            handleReachMm={handleReachMm}
            shoulderDiameterMm={shoulderDiameterMm}
            taperUpperDiameterMm={taperUpperDiameterMm}
            taperLowerDiameterMm={taperLowerDiameterMm}
            bevelDiameterMm={bevelDiameterMm}
            onHandleTopChange={setHandleTopFromOverallMm}
            onHandleBottomChange={setHandleBottomFromOverallMm}
            onHandleReachChange={setHandleReachMm}
            onShoulderDiameterChange={setShoulderDiameterMm}
            onTaperUpperDiameterChange={setTaperUpperDiameterMm}
            onTaperLowerDiameterChange={setTaperLowerDiameterMm}
            onBevelDiameterChange={setBevelDiameterMm}
            onPhotoWidthScaleChange={setReferencePhotoWidthScalePct}
            onPhotoHeightScaleChange={setReferencePhotoHeightScalePct}
            onPhotoLockAspectChange={setReferencePhotoLockAspect}
            onPhotoOffsetXChange={setReferencePhotoOffsetXPct}
            onPhotoOffsetYChange={setReferencePhotoOffsetYPct}
            onPhotoAnchorYChange={setReferencePhotoAnchorY}
            onPhotoCenterModeChange={setReferencePhotoCenterMode}
            onColorsChange={handleAutoSampleColors}
            onDiameterChange={(nextDiameter) => {
              if (advancedGeometryOverridesUnlocked) {
                setDiameterMm(round2(nextDiameter));
                return;
              }
              setWrapWidthInputMm(round2(Math.PI * nextDiameter));
            }}
            onTopOuterDiameterChange={(nextDiameter) => {
              setTopOuterDiameterMm(round2(nextDiameter));
            }}
            onBaseDiameterChange={(nextDiameter) => {
              setBaseDiameterMm(round2(nextDiameter));
            }}
            onBaseDiameterDerived={(nextDiameter) => {
              setBaseDiameterMm(round2(nextDiameter));
            }}
            onOutlineProfileChange={(nextProfile) => {
              setBodyOutlineProfile(nextProfile);
              const derived = deriveDimensionsFromEditableBodyOutline(nextProfile);
              if (typeof derived.bodyTopFromOverallMm === "number") {
                setBodyTopFromOverallMm(round2(derived.bodyTopFromOverallMm));
              }
              if (typeof derived.bodyBottomFromOverallMm === "number") {
                setBodyBottomFromOverallMm(round2(derived.bodyBottomFromOverallMm));
              }
              if (typeof derived.diameterMm === "number") {
                if (advancedGeometryOverridesUnlocked) {
                  setDiameterMm(round2(derived.diameterMm));
                }
              }
              if (typeof derived.topOuterDiameterMm === "number") {
                setTopOuterDiameterMm(round2(derived.topOuterDiameterMm));
              }
              if (typeof derived.baseDiameterMm === "number") {
                setBaseDiameterMm(round2(derived.baseDiameterMm));
              }
              if (typeof derived.shoulderDiameterMm === "number") {
                setShoulderDiameterMm(round2(derived.shoulderDiameterMm));
              }
              if (typeof derived.taperUpperDiameterMm === "number") {
                setTaperUpperDiameterMm(round2(derived.taperUpperDiameterMm));
              }
              if (typeof derived.taperLowerDiameterMm === "number") {
                setTaperLowerDiameterMm(round2(derived.taperLowerDiameterMm));
              }
              if (typeof derived.bevelDiameterMm === "number") {
                setBevelDiameterMm(round2(derived.bevelDiameterMm));
              }
            }}
            onReferencePathsChange={(nextPaths) => {
              setReferencePaths(nextPaths);
              setBodyOutlineProfile(nextPaths.bodyOutline ?? undefined);
            }}
            onReferenceLayerStateChange={setReferenceLayerState}
          />
        </div>
      )}

      {/* ── Default laser settings ────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Default laser settings</div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Power (%)</label>
          <input
            className={styles.numInput}
            type="number"
            value={power}
            step={1}
            min={0}
            max={100}
            onChange={(e) => setPower(Number(e.target.value) || 0)}
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Speed (mm/s)</label>
          <input
            className={styles.numInput}
            type="number"
            value={speed}
            step={10}
            min={0}
            onChange={(e) => setSpeed(Number(e.target.value) || 0)}
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Frequency (kHz)</label>
          <input
            className={styles.numInput}
            type="number"
            value={frequency}
            step={1}
            min={0}
            onChange={(e) => setFrequency(Number(e.target.value) || 0)}
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Line interval (mm)</label>
          <input
            className={styles.numInput}
            type="number"
            value={lineInterval}
            step={0.01}
            min={0}
            onChange={(e) => setLineInterval(Number(e.target.value) || 0)}
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Material profile</label>
          <select
            className={styles.selectInput}
            value={materialProfileId}
            onChange={(e) => {
              materialProfileTouchedRef.current = e.target.value.trim().length > 0;
              applyMaterialProfileSettings(e.target.value, laserType, productType);
            }}
          >
            <option value="">None</option>
            {KNOWN_MATERIAL_PROFILES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

      </div>

      {/* ── Errors ────────────────────────────────────────────────── */}
      {errors.length > 0 && (
        <div>
          {errors.map((err) => (
            <div key={err} className={styles.error}>{err}</div>
          ))}
        </div>
      )}

      {/* ── Buttons ───────────────────────────────────────────────── */}
      {showActions ? (
        <div className={styles.btnRow}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={styles.saveBtn} onClick={() => void handleSave()}>
            {isEdit ? "Save changes" : "Save template"}
          </button>
        </div>
      ) : null}

      {/* ── Tumbler mapping wizard modal ── */}
      {showMappingWizard && glbPath && productType && productType !== "flat" && (
        <TumblerMappingWizard
          glbPath={glbPath}
          diameterMm={effectiveCylinderDiameterMm}
          printHeightMm={printHeightMm}
          productType={productType}
          existingMapping={tumblerMapping}
          handleArcDeg={handleArcDeg}
          onSave={(mapping) => {
            setTumblerMapping(mapping);
            setHandleArcDeg(mapping.handleArcDeg);
            setShowMappingWizard(false);
          }}
          onCancel={() => setShowMappingWizard(false)}
        />
      )}
    </div>
  );
});
