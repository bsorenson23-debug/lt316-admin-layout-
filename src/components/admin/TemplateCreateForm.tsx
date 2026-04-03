"use client";

import React from "react";
import dynamic from "next/dynamic";
import {
  type EditableBodyOutline,
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
  cloneReferenceLayerState,
  createEditableBodyOutline,
  createDefaultReferenceLayerState,
  createEditableBodyOutlineFromSeedSvgText,
  createReferencePaths,
  deriveDimensionsFromEditableBodyOutline,
} from "@/lib/editableBodyOutline";
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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
  formData.set("invert", "false");
  formData.set("normalizeLevels", "true");
  formData.set("trimWhitespace", "true");
  formData.set("preserveText", "false");
  formData.set("recipe", "badge");
  formData.set("backgroundStrategy", "cutout");

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
  const [handleTopFromOverallMm, setHandleTopFromOverallMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.handleTopFromOverallMm,
  );
  const [handleBottomFromOverallMm, setHandleBottomFromOverallMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.handleBottomFromOverallMm,
  );
  const [handleReachMm, setHandleReachMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.handleReachMm,
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

  const templateWidthMm = productType === "flat"
    ? round2(flatWidthMm)
    : diameterMm > 0
      ? round2(Math.PI * diameterMm)
      : 0;
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
  const liveTumblerDims = React.useMemo<TumblerDimensions | null>(() => {
    if (!productType || productType === "flat" || diameterMm <= 0 || printHeightMm <= 0) return null;
    return {
      overallHeightMm: overallHeightMm > 0 ? round2(overallHeightMm) : round2(printHeightMm),
      diameterMm: round2(diameterMm),
      topDiameterMm: topOuterDiameterMm > 0 ? round2(topOuterDiameterMm) : undefined,
      bottomDiameterMm: baseDiameterMm > 0 ? round2(baseDiameterMm) : undefined,
      bodyTopOffsetMm: overallHeightMm > 0 ? round2(Math.max(0, bodyTopFromOverallMm)) : undefined,
      bodyHeightMm:
        overallHeightMm > 0
          ? round2(Math.max(0, bodyBottomFromOverallMm - bodyTopFromOverallMm))
          : undefined,
      printableHeightMm: round2(printHeightMm),
      printableTopOffsetMm: topMarginMm > 0 ? round2(topMarginMm) : undefined,
    };
  }, [
    productType,
    diameterMm,
    topOuterDiameterMm,
    baseDiameterMm,
    bodyBottomFromOverallMm,
    bodyTopFromOverallMm,
    printHeightMm,
    overallHeightMm,
    topMarginMm,
  ]);

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
    const scoped = getDefaultLaserSettings(resolvedProductType, resolvedLaserType);

    setPower(materialProfile.powerPct);
    setSpeed(materialProfile.speedMmS);
    setLineInterval(lineIntervalFromLpi(materialProfile.lpi));
    setFrequency(scoped.frequency);
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
  const [frontBgStatus, setFrontBgStatus] = React.useState<"idle" | "processing" | "done" | "failed">("idle");
  const [backBgStatus, setBackBgStatus] = React.useState<"idle" | "processing" | "done" | "failed">("idle");
  const [frontUseOriginal, setFrontUseOriginal] = React.useState(false);
  const [backUseOriginal, setBackUseOriginal] = React.useState(false);
  const [mirrorForBack, setMirrorForBack] = React.useState(true);
  const autoZoneSignatureRef = React.useRef<string>("");
  const bodyOutlineSeedSignatureRef = React.useRef<string>("");
  const manufacturerLogoSignatureRef = React.useRef<string>("");
  const activeReferencePhotoDataUrl = React.useMemo(
    () => bodyReferencePhotoDataUrl || frontCleanUrl || frontPhotoDataUrl || productPhotoFullUrl || "",
    [bodyReferencePhotoDataUrl, frontCleanUrl, frontPhotoDataUrl, productPhotoFullUrl],
  );

  React.useEffect(() => {
    if (frontCleanUrl) {
      setBodyReferencePhotoDataUrl(frontCleanUrl);
      return;
    }
    if (frontPhotoDataUrl || productPhotoFullUrl) return;
    setBodyReferencePhotoDataUrl("");
  }, [frontCleanUrl, frontPhotoDataUrl, productPhotoFullUrl]);

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
    if (productType === "flat" || overallHeightMm <= 0 || diameterMm <= 0) {
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
      diameterMm: round2(diameterMm),
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
            diameterMm,
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

        if (!fitDebug) return;
        const outline = createEditableBodyOutline({
          overallHeightMm,
          bodyTopFromOverallMm,
          bodyBottomFromOverallMm,
          diameterMm,
          topOuterDiameterMm: topOuterDiameterMm > 0 ? topOuterDiameterMm : undefined,
          baseDiameterMm: baseDiameterMm > 0 ? baseDiameterMm : undefined,
          shoulderDiameterMm,
          taperUpperDiameterMm,
          taperLowerDiameterMm,
          bevelDiameterMm,
          fitDebug,
        });
        if (cancelled) return;
        setBodyOutlineProfile(outline);
        setReferencePaths((current) => createReferencePaths({
          bodyOutline: outline,
          lidProfile: current.lidProfile,
          silverProfile: current.silverProfile,
        }));
      } catch {
        if (!cancelled) {
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
    diameterMm,
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

  React.useEffect(() => {
    if (productType === "flat") {
      autoZoneSignatureRef.current = "";
      manufacturerLogoSignatureRef.current = "";
      setManufacturerLogoStamp(undefined);
      return;
    }

    const sourcePhotoUrl = frontPhotoDataUrl || productPhotoFullUrl;
    if (!sourcePhotoUrl || overallHeightMm <= 0) {
      manufacturerLogoSignatureRef.current = "";
      setManufacturerLogoStamp(undefined);
      return;
    }

    const signature = JSON.stringify({
      version: MANUFACTURER_LOGO_STAMP_ALGO_VERSION,
      sourcePhotoUrl,
      overallHeightMm: round2(overallHeightMm),
      topMarginMm: round2(topMarginMm),
      bottomMarginMm: round2(bottomMarginMm),
      brand: brand.trim().toLowerCase(),
      lookupImageUrl: lookupResult?.imageUrl ?? "",
      fitDebugSource: lookupResult?.fitDebug?.sourceImageUrl ?? "",
      fitDebugSize: lookupResult?.fitDebug
        ? `${lookupResult.fitDebug.imageWidthPx}x${lookupResult.fitDebug.imageHeightPx}:${lookupResult.fitDebug.fullTopPx}:${lookupResult.fitDebug.fullBottomPx}`
        : "",
    });

    if (manufacturerLogoSignatureRef.current === signature) return;
    manufacturerLogoSignatureRef.current = signature;

    let cancelled = false;
    const stampSource = lookupResult?.imageUrl || productPhotoFullUrl ? "lookup-photo" : "front-photo";
    const extractStamp = async () => {
      const directStamp = await extractManufacturerLogoStamp({
        photoDataUrl: sourcePhotoUrl,
        overallHeightMm,
        brand: brand.trim() || lookupResult?.brand || undefined,
        topMarginMm,
        bottomMarginMm,
        fitDebug: lookupResult?.fitDebug ?? null,
        source: stampSource,
      });
      if (directStamp) return directStamp;

      const fallbackImageUrl = lookupResult?.fitDebug?.sourceImageUrl || lookupResult?.imageUrl;
      if (!fallbackImageUrl) return null;

      try {
        const fallbackDataUrl = await fetchImageUrlAsDataUrl(fallbackImageUrl);
        return await extractManufacturerLogoStamp({
          photoDataUrl: fallbackDataUrl,
          overallHeightMm,
          brand: brand.trim() || lookupResult?.brand || undefined,
          topMarginMm,
          bottomMarginMm,
          fitDebug: lookupResult?.fitDebug ?? null,
          source: "lookup-photo",
        });
      } catch {
        return null;
      }
    };

    extractStamp()
      .then((stamp) => {
        if (cancelled) return;
        setManufacturerLogoStamp(stamp ?? undefined);
      })
      .catch(() => {
        if (cancelled) return;
        setManufacturerLogoStamp(undefined);
      });

    return () => {
      cancelled = true;
    };
  }, [
    brand,
    bottomMarginMm,
    frontPhotoDataUrl,
    lookupResult?.brand,
    lookupResult?.fitDebug,
    lookupResult?.imageUrl,
    overallHeightMm,
    productPhotoFullUrl,
    productType,
    topMarginMm,
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
    setManufacturerLogoStamp(undefined);
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
      setMirrorForBack(true);
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
      setTopOuterDiameterMm(0);
      setBaseDiameterMm(0);
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
      setHandleTopFromOverallMm(draftDims?.handleTopFromOverallMm ?? undefined);
      setHandleBottomFromOverallMm(draftDims?.handleBottomFromOverallMm ?? undefined);
      setHandleReachMm(draftDims?.handleReachMm ?? undefined);
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
      setGlbPath(result.glbPath || "");
      setGlbFileName(result.glbPath ? (result.glbPath.split("/").pop() ?? null) : null);
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
          explicitFinishType: response.analysis.finishType ?? null,
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
    if (!laserType) errs.push("Laser type is required.");
    if (!productType) errs.push("Product type is required.");
    if (productType === "flat" && flatWidthMm <= 0) errs.push("Template width must be > 0 for flat products.");
    if (productType && productType !== "flat" && diameterMm <= 0) errs.push("Body / wrap diameter must be > 0 for non-flat products.");
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
      laserType: laserType as ProductTemplate["laserType"],
      productType: productType as ProductTemplate["productType"],
      materialSlug: templateMaterial.materialSlug,
      materialLabel: templateMaterial.materialLabel,
      thumbnailDataUrl: thumbDataUrl,
      productPhotoFullUrl: productPhotoFullUrl || undefined,
      glbPath,
      dimensions: {
        diameterMm,
        bodyDiameterMm: productType === "flat" || diameterMm <= 0 ? undefined : diameterMm,
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
      manufacturerLogoStamp: productType === "flat" ? undefined : manufacturerLogoStamp,
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
    diameterMm,
    editingTemplate,
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
            <option value="">Select laser type</option>
            <option value="fiber">Fiber</option>
            <option value="co2">CO₂</option>
            <option value="diode">Diode</option>
          </select>
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
                  {lookupResult.glbPath && <span>3D ready</span>}
                </div>
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
                imageUrl={lookupDebugImageUrl}
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
                    setMirrorForBack(true);
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
            {glbPath && !glbUploading && (
              getFlatGlbStatusLabel(activeFlatLookupModel) ? (
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

        {(glbPath.trim() || previewModelFile || liveFlatPreview || previewLoadError) && (
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Preview</label>
            <div className={styles.modelPreviewBlock}>
              <div className={styles.modelPreviewMeta}>
                <span className={styles.modelPreviewMode}>
                  {(glbPath.trim() || previewModelFile) ? "GLB preview" : "Generated flat preview"}
                </span>
                {!glbPath.trim() && !previewModelFile && liveFlatPreview && (
                  <span className={styles.modelPreviewDims}>
                    {liveFlatPreview.widthMm} × {liveFlatPreview.heightMm} × {liveFlatPreview.thicknessMm} mm
                  </span>
                )}
              </div>
              <div className={styles.modelPreviewViewport}>
                {glbPath.trim() || previewModelFile || liveFlatPreview ? (
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
                  />
                ) : (
                  <div className={styles.modelPreviewEmpty}>Preview unavailable</div>
                )}
              </div>
              {previewLoadError && (
                <div className={styles.modelPreviewNote}>{previewLoadError}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Physical dimensions ───────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Physical dimensions</div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>
            {productType === "flat" ? "Template width (mm) *" : "Visible / outer diameter (mm) *"}
          </label>
          <input
            className={styles.numInput}
            type="number"
            value={productType === "flat" ? (flatWidthMm || "") : ((topOuterDiameterMm || diameterMm) || "")}
            step={0.1}
            onChange={(e) => {
              const next = Number(e.target.value) || 0;
              if (productType === "flat") {
                setFlatWidthMm(next);
                return;
              }
              setTopOuterDiameterMm(next);
              if (diameterMm <= 0) {
                setDiameterMm(next);
              }
            }}
          />
        </div>

        {productType && productType !== "flat" && (
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Body / wrap diameter (mm) *</label>
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
            <span className={styles.fieldHint}>Used for wrap-width math and body-span fitting</span>
          </div>
        )}

        {productType && productType !== "flat" && (
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Top outer diameter (mm)</label>
            <input
              className={styles.numInput}
              type="number"
              value={topOuterDiameterMm || ""}
              step={0.1}
              min={0}
              onChange={(e) => setTopOuterDiameterMm(Number(e.target.value) || 0)}
            />
            <span className={styles.fieldHint}>Used for the lid/rim outer size and visible preview fit</span>
          </div>
        )}

        {productType && productType !== "flat" && (
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
            <span className={styles.fieldHint}>Used for the lower foot / taper width</span>
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
          <label className={styles.fieldLabel}>Template width</label>
          <span className={styles.readOnly}>
            {templateWidthMm > 0 ? `${templateWidthMm} mm` : "\u2014"}{" "}
            <span className={styles.fieldHint}>
              {productType === "flat" ? "(from flat width)" : "(auto-calculated)"}
            </span>
          </span>
        </div>

        {productType && productType !== "flat" && (
          <>
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
      {productType && productType !== "flat" && activeReferencePhotoDataUrl && overallHeightMm > 0 && diameterMm > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Body reference</div>
          <EngravableZoneEditor
            photoDataUrl={activeReferencePhotoDataUrl}
            overallHeightMm={overallHeightMm}
            bodyTopFromOverallMm={bodyTopFromOverallMm}
            bodyBottomFromOverallMm={bodyBottomFromOverallMm}
            lidSeamFromOverallMm={lidSeamFromOverallMm}
            silverBandBottomFromOverallMm={silverBandBottomFromOverallMm}
            diameterMm={diameterMm}
            bodyWrapDiameterMm={diameterMm}
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
            onChange={(bodyTop, bodyBottom) => {
              setBodyTopFromOverallMm(bodyTop);
              setBodyBottomFromOverallMm(bodyBottom);
            }}
            onLidSeamChange={setLidSeamFromOverallMm}
            onSilverBandBottomChange={setSilverBandBottomFromOverallMm}
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
              setDiameterMm(round2(nextDiameter));
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
                setDiameterMm(round2(derived.diameterMm));
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
          diameterMm={diameterMm}
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


