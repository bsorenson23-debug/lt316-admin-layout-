import {
  findTumblerProfileIdForBrandModel,
  getProfileHandleArcDeg,
  getTumblerProfileById,
  KNOWN_TUMBLER_PROFILES,
  type TumblerProfile,
} from "../../data/tumblerProfiles.ts";
import type { TumblerSourceLink } from "../../types/tumblerAutoSize.ts";
import type {
  DimensionAuthority,
  TumblerDimensionSourceKind,
  TumblerItemLookupFitDebug,
  TumblerItemLookupDimensions,
  TumblerItemLookupResponse,
  TumblerProfileAuthority,
  TumblerSourceModelAvailability,
} from "../../types/tumblerItemLookup.ts";
import { access } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import * as cheerio from "cheerio";
import { computeWrapWidthFromDiameterMm } from "../../lib/productDimensionAuthority.ts";
import { generatedModelExists } from "../models/generatedModelStorage.ts";
import { ensureGeneratedTumblerGlb } from "./generateTumblerModel.ts";
import { extractShopifySelectedVariant } from "./shopifyProductVariant.ts";

const LLM_PAGE_TEXT_LIMIT = 18_000;

export class TumblerLookupManualEntryError extends Error {
  readonly manualEntryRequired = true;

  constructor(message: string) {
    super(message);
    this.name = "TumblerLookupManualEntryError";
  }
}

export interface OpenGraphProductMetadata {
  title: string | null;
  imageUrl: string | null;
}

export interface OpenAiTumblerDimensionExtraction {
  diameterMm: number;
  heightMm: number;
  capacityOz: number | null;
  confidence?: number | null;
  notes?: string[];
  rawJson?: string;
}

export interface PageDimensionExtractionInput {
  lookupInput: string;
  resolvedUrl: string;
  title: string | null;
  pageText: string;
  selectedSizeOz: number | null;
  selectedColorOrFinish: string | null;
}

export type PageDimensionExtractor = (
  input: PageDimensionExtractionInput,
) => Promise<OpenAiTumblerDimensionExtraction | null>;

const IMAGE_META_NAMES = [
  "og:image",
  "og:image:url",
  "twitter:image",
  "twitter:image:src",
];

const PRODUCT_IMAGE_BAD_TOKENS = [
  "logo",
  "banner",
  "icon",
  "sprite",
  "favicon",
  "avatar",
  "badge",
  "app install",
  "app store",
  "google play",
  "apple store",
  "social",
  "facebook",
  "instagram",
  "youtube",
  "pinterest",
  "twitter",
  "tracking",
  "placeholder",
  "pixel",
];

const PRODUCT_IMAGE_GOOD_TOKENS = [
  "product",
  "products",
  "gallery",
  "hero",
  "main",
  "primary",
  "default",
  "zoom",
  "pdp",
  "item",
  "front",
  "detail",
];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/[^a-z0-9.\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function safeDecodeUri(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isLikelyUrl(input: string): boolean {
  return /^https?:\/\//i.test(input.trim());
}

function parseCapacityOz(text: string): number | null {
  const explicit = text.match(/([0-9]{2})\s*(?:oz|ounce)/i);
  if (explicit) {
    const parsed = Number(explicit[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractAllCapacitiesOz(text: string): number[] {
  const values = new Set<number>();
  for (const match of text.matchAll(/([0-9]{2,3})\s*(?:oz|ounce|ounces)\b/gi)) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) {
      values.add(parsed);
    }
  }
  return [...values].sort((left, right) => left - right);
}

function inferColorOrFinish(text: string): string | null {
  const normalized = normalizeText(text);
  const candidates = [
    "stainless",
    "black",
    "white",
    "charcoal",
    "ash",
    "rose quartz",
    "navy",
    "cream",
    "fog",
    "matte",
  ];
  return candidates.find((candidate) => normalized.includes(candidate)) ?? null;
}

function normalizeVariantId(value: string | null | undefined): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  return normalized.replace(/\s+/g, "-");
}

function buildVariantLabel(args: {
  selectedSizeOz?: number | null;
  selectedColorOrFinish?: string | null;
  fallbackLabel?: string | null;
}): string | null {
  const parts = [
    args.selectedSizeOz ? `${args.selectedSizeOz} oz` : null,
    args.selectedColorOrFinish ?? null,
  ].filter((value): value is string => Boolean(value));
  if (parts.length > 0) {
    return parts.join(" / ");
  }
  return args.fallbackLabel?.trim() || null;
}

function titleCaseWords(value: string): string {
  return value
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b[a-z]/g, (match) => match.toUpperCase());
}

function extractUrlVariantParams(url: string | null): {
  selectedSizeOz: number | null;
  selectedColorOrFinish: string | null;
  selectedVariantLabel: string | null;
} {
  if (!url) {
    return {
      selectedSizeOz: null,
      selectedColorOrFinish: null,
      selectedVariantLabel: null,
    };
  }

  try {
    const parsed = new URL(url);
    const sizeValue = parsed.searchParams.get("size");
    const colorValue =
      parsed.searchParams.get("color") ??
      parsed.searchParams.get("colour") ??
      parsed.searchParams.get("finish");
    const selectedSizeOz = sizeValue ? parseCapacityOz(sizeValue) : null;
    const selectedColorOrFinish = colorValue ? titleCaseWords(safeDecodeUri(colorValue)) : null;
    return {
      selectedSizeOz,
      selectedColorOrFinish,
      selectedVariantLabel: buildVariantLabel({
        selectedSizeOz,
        selectedColorOrFinish,
      }),
    };
  } catch {
    return {
      selectedSizeOz: null,
      selectedColorOrFinish: null,
      selectedVariantLabel: null,
    };
  }
}

function buildUrlLookupText(url: string): string {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const searchValues = [...parsed.searchParams.entries()]
      .flatMap(([key, value]) => [key, safeDecodeUri(value)])
      .join(" ");
    const selectedSizeOz = parseCapacityOz(searchValues);
    const matchingOfficialProfiles = KNOWN_TUMBLER_PROFILES.filter((profile) =>
      (profile.officialDomains ?? []).some((domain) => {
        const normalizedDomain = domain.toLowerCase().replace(/^www\./, "");
        return hostname === normalizedDomain || hostname.endsWith(`.${normalizedDomain}`);
      }),
    );
    const officialBrandHints = [...new Set(
      matchingOfficialProfiles.map((profile) => profile.brand),
    )];
    const officialProfileHints = selectedSizeOz
      ? matchingOfficialProfiles
          .filter((profile) => profile.capacityOz === selectedSizeOz)
          .flatMap((profile) => [
            profile.label,
            profile.model,
            ...(profile.lookupAliases ?? []),
          ])
      : [];

    return [
      url,
      hostname,
      parsed.pathname.replace(/[\/\-_.]+/g, " "),
      searchValues,
      ...officialBrandHints,
      ...officialProfileHints,
    ].filter(Boolean).join(" ");
  } catch {
    return url;
  }
}

function getProfileAuthorityLabel(authority: TumblerProfileAuthority): string {
  switch (authority) {
    case "exact-internal-profile":
      return "Exact profile";
    case "official-dimensions-over-profile":
      return "Official dimensions";
    case "dynamic-llm-extracted":
      return "Dynamic LLM dimensions";
    case "inferred-profile":
      return "Inferred profile";
    case "lookup-dimensions-only":
      return "Lookup dimensions";
    case "needs-body-reference":
      return "Needs BODY REFERENCE";
    case "unknown":
    default:
      return "Unknown profile";
  }
}

function getSourceModelAvailabilityLabel(availability: TumblerSourceModelAvailability): string {
  switch (availability) {
    case "verified-source-model":
      return "Source model available";
    case "generated-source-model":
      return "Generated source model";
    case "missing-source-model":
    default:
      return "Source model unavailable";
  }
}

function manualEntryError(message: string): TumblerLookupManualEntryError {
  return new TumblerLookupManualEntryError(`${message} Enter the tumbler dimensions manually.`);
}

function isUsableLookupDimensions(dimensions: TumblerItemLookupDimensions | null | undefined): boolean {
  return Boolean(
    dimensions &&
    Number.isFinite(dimensions.diameterMm ?? dimensions.outsideDiameterMm ?? dimensions.wrapDiameterMm) &&
    Number.isFinite(dimensions.overallHeightMm ?? dimensions.fullProductHeightMm),
  );
}

function hasOfficialOverride(profile: TumblerProfile, dimensions: TumblerItemLookupDimensions | null): boolean {
  if (!dimensions || dimensions.dimensionSourceKind !== "official-page") return false;
  const profileDiameter =
    profile.outsideDiameterMm ??
    profile.topDiameterMm ??
    profile.bottomDiameterMm ??
    null;
  const parsedDiameter =
    dimensions.outsideDiameterMm ??
    dimensions.diameterMm ??
    dimensions.wrapDiameterMm ??
    null;
  const parsedHeight =
    dimensions.overallHeightMm ??
    dimensions.fullProductHeightMm ??
    null;
  return (
    (profileDiameter !== null && parsedDiameter !== null && Math.abs(profileDiameter - parsedDiameter) > 1) ||
    (parsedHeight !== null && Math.abs(profile.overallHeightMm - parsedHeight) > 1)
  );
}

function classifyProfileAuthority(args: {
  matchedProfile: TumblerProfile | null;
  sourceKind: TumblerSourceLink["kind"];
  dimensions: TumblerItemLookupDimensions | null;
  sourceModelAvailability: TumblerSourceModelAvailability;
  officialOverride: boolean;
}): {
  authority: TumblerProfileAuthority;
  reason: string;
  requiresBodyReferenceReview: boolean;
} {
  if (args.matchedProfile) {
    if (args.officialOverride) {
      return {
        authority: "official-dimensions-over-profile",
        reason: "Official page dimensions override internal profile dimensions.",
        requiresBodyReferenceReview: true,
      };
    }
    if (args.sourceModelAvailability !== "missing-source-model") {
      return {
        authority: "exact-internal-profile",
        reason: "Matched a trusted internal profile with a source model lane.",
        requiresBodyReferenceReview: false,
      };
    }
    return {
      authority: "needs-body-reference",
      reason: "Matched profile metadata, but no source/full model is available.",
      requiresBodyReferenceReview: true,
    };
  }

  if (isUsableLookupDimensions(args.dimensions)) {
    const sourceKind = args.dimensions?.dimensionSourceKind;
    if (sourceKind === "llm-page") {
      return {
        authority: "dynamic-llm-extracted",
        reason: "OpenAI extracted usable dimensions directly from the product page without relying on an internal profile.",
        requiresBodyReferenceReview: true,
      };
    }
    const isTrustedLookupDimensionSource =
      args.sourceKind === "official";
    return {
      authority: isTrustedLookupDimensionSource ? "lookup-dimensions-only" : "needs-body-reference",
      reason: args.sourceKind === "official"
          ? "Parsed usable dimensions from an official page without an exact internal profile."
          : "Parsed dimensions without enough profile authority for source model trust.",
      requiresBodyReferenceReview: true,
    };
  }

  return {
    authority: "unknown",
    reason: "No exact profile or usable lookup dimensions were found.",
    requiresBodyReferenceReview: true,
  };
}

interface ParsedDimensionCandidate {
  dimensions: TumblerItemLookupDimensions;
  score: number;
}

function parseHtml(html: string): cheerio.CheerioAPI {
  return cheerio.load(html);
}

function extractMetaContent(html: string, metaName: string): string | null {
  const $ = parseHtml(html);
  const value =
    $(`meta[property="${metaName}"]`).first().attr("content") ??
    $(`meta[name="${metaName}"]`).first().attr("content") ??
    null;
  return value ? decodeHtml(value).trim() : null;
}

function extractTitle(html: string): string | null {
  const title = extractMetaContent(html, "og:title");
  if (title) return title;
  const $ = parseHtml(html);
  const fallbackTitle = $("title").first().text().trim();
  return fallbackTitle ? decodeHtml(fallbackTitle) : null;
}

function resolveUrl(baseUrl: string, maybeUrl: string | null): string | null {
  if (!maybeUrl) return null;
  try {
    return new URL(maybeUrl, baseUrl).toString();
  } catch {
    return null;
  }
}

export function extractOpenGraphProductMetadata(html: string, baseUrl: string): OpenGraphProductMetadata {
  return {
    title: extractMetaContent(html, "og:title"),
    imageUrl: resolveUrl(baseUrl, extractMetaContent(html, "og:image")),
  };
}

export function extractPageBodyText(html: string): string {
  const $ = parseHtml(html);
  $("script, style, noscript, svg").remove();
  const bodyText = $("body").text() || $.root().text();
  return decodeHtml(bodyText)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LLM_PAGE_TEXT_LIMIT);
}

function extractImageUrls(html: string, baseUrl: string): string[] {
  const $ = parseHtml(html);
  const urls = new Set<string>();
  const addUrl = (value: string | null | undefined) => {
    const resolved = resolveUrl(baseUrl, decodeHtml(value ?? ""));
    if (!resolved) return;
    if (!/\.(?:png|jpe?g|webp|avif)(?:[?#].*)?$/i.test(resolved)) return;
    urls.add(resolved);
  };

  for (const metaName of IMAGE_META_NAMES) {
    addUrl(extractMetaContent(html, metaName));
  }

  $("img, source").each((_, element) => {
    const candidate =
      $(element).attr("src") ??
      $(element).attr("data-src") ??
      $(element).attr("data-image") ??
      $(element).attr("data-zoom-image") ??
      null;
    addUrl(candidate);
    return urls.size < 16;
  });

  const ldImagePattern = /"image"\s*:\s*(?:"([^"]+)"|\[([\s\S]*?)\])/gi;
  for (const match of html.matchAll(ldImagePattern)) {
    if (match[1]) {
      addUrl(match[1]);
      continue;
    }
    const arrayBody = match[2] ?? "";
    for (const item of arrayBody.matchAll(/"([^"]+\.(?:png|jpe?g|webp|avif)(?:\?[^"]*)?)"/gi)) {
      addUrl(item[1]);
      if (urls.size >= 12) break;
    }
    if (urls.size >= 12) break;
  }

  for (const match of html.matchAll(/<(?:img|source)[^>]+(?:src|data-src|data-image|data-zoom-image)=["']([^"']+)["']/gi)) {
    addUrl(match[1]);
    if (urls.size >= 16) break;
  }

  for (const match of html.matchAll(/\b(?:https?:)?\\?\/\\?\/[^"'\\\s>]+?\.(?:png|jpe?g|webp|avif)(?:\?[^"'\\\s>]*)?/gi)) {
    addUrl(match[0].replace(/^\/\//, "https://"));
    if (urls.size >= 18) break;
  }

  return [...urls];
}

function normalizePositiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.]+/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function normalizeCapacityOz(value: unknown): number | null {
  const parsed = normalizePositiveNumber(value);
  if (parsed === null) return null;
  if (parsed < 1 || parsed > 160) return null;
  return Math.round(parsed);
}

function normalizeConfidence(value: unknown): number | null {
  const parsed = normalizePositiveNumber(value);
  if (parsed === null) return null;
  return Math.max(0, Math.min(1, round2(parsed)));
}

export function parseOpenAiDimensionExtraction(raw: string): OpenAiTumblerDimensionExtraction | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const jsonText = trimmed.match(/\{[\s\S]*\}/)?.[0] ?? trimmed;
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const diameterMm = normalizePositiveNumber(parsed.diameterMm);
    const heightMm = normalizePositiveNumber(parsed.heightMm);
    const capacityOz = normalizeCapacityOz(parsed.capacityOz);

    if (diameterMm === null || heightMm === null) return null;
    if (diameterMm < 35 || diameterMm > 180) return null;
    if (heightMm < 70 || heightMm > 420) return null;

    const notes = Array.isArray(parsed.notes)
      ? parsed.notes.filter((note): note is string => typeof note === "string")
      : [];

    return {
      diameterMm: round2(diameterMm),
      heightMm: round2(heightMm),
      capacityOz,
      confidence: normalizeConfidence(parsed.confidence),
      notes,
      rawJson: jsonText,
    };
  } catch {
    return null;
  }
}

async function extractDimensionsWithOpenAi(
  input: PageDimensionExtractionInput,
): Promise<OpenAiTumblerDimensionExtraction | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "You extract physical dimensions for laser engraving tumbler setup.",
          "Return only a strict JSON object with keys diameterMm, heightMm, and capacityOz.",
          "diameterMm is the outside body/cylinder diameter in millimeters.",
          "heightMm is the full physical product height in millimeters.",
          "capacityOz is fluid capacity in ounces.",
          "Convert inches to millimeters before returning values.",
          "Use null for unknown fields. Do not include markdown or extra keys.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          url: input.resolvedUrl,
          title: input.title,
          selectedSizeOz: input.selectedSizeOz,
          selectedColorOrFinish: input.selectedColorOrFinish,
          pageText: input.pageText,
        }),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  return parseOpenAiDimensionExtraction(raw);
}

function buildLlmExtractedDimensions(args: {
  extraction: OpenAiTumblerDimensionExtraction;
  resolvedUrl: string;
  lookupInput: string;
  title: string | null;
  selectedSizeOz: number | null;
  selectedColorOrFinish: string | null;
  availableSizeOz: number[];
  pageText: string;
}): TumblerItemLookupDimensions {
  const capacityOz = args.selectedSizeOz ?? args.extraction.capacityOz;
  const availableSizeOz = [...new Set([
    ...args.availableSizeOz,
    ...(capacityOz ? [capacityOz] : []),
  ])].sort((left, right) => left - right);
  const diameterMm = args.extraction.diameterMm;
  const overallHeightMm = args.extraction.heightMm;
  const usableHeightMm = round2(overallHeightMm * 0.78);
  const variantLabel = buildVariantLabel({
    selectedSizeOz: capacityOz,
    selectedColorOrFinish: args.selectedColorOrFinish,
    fallbackLabel: args.title,
  });

  return {
    lookupProductId: args.resolvedUrl,
    productUrl: args.resolvedUrl,
    selectedVariantId: normalizeVariantId(variantLabel),
    selectedVariantLabel: variantLabel,
    selectedSizeOz: capacityOz,
    selectedColorOrFinish: args.selectedColorOrFinish,
    availableVariantLabels: availableSizeOz.map((value) => `${value} oz`),
    availableSizeOz,
    dimensionSourceUrl: args.resolvedUrl,
    dimensionSourceText: args.pageText.slice(0, 600),
    dimensionSourceSizeOz: args.extraction.capacityOz,
    dimensionSourceKind: "llm-page",
    titleSizeOz: parseCapacityOz(args.title ?? args.lookupInput),
    confidence: args.extraction.confidence ?? 0.72,
    dimensionAuthority: "diameter-primary",
    diameterMm,
    bodyDiameterMm: diameterMm,
    wrapDiameterMm: diameterMm,
    wrapWidthMm: computeWrapWidthFromDiameterMm(diameterMm) ?? null,
    fullProductHeightMm: overallHeightMm,
    bodyHeightMm: usableHeightMm,
    heightIncludesLidOrStraw: overallHeightMm > usableHeightMm,
    overallHeightMm,
    outsideDiameterMm: diameterMm,
    topDiameterMm: null,
    bottomDiameterMm: null,
    usableHeightMm,
  };
}

function tokenizeLookupText(text: string): string[] {
  return [...new Set(
    normalizeText(text)
      .split(" ")
      .filter((token) => token.length >= 3)
  )];
}

function scoreImageCandidateUrl(url: string, lookupText: string): number {
  const normalizedUrl = normalizeText(safeDecodeUri(url));
  const lookupTokens = tokenizeLookupText(lookupText);
  let score = 0;

  for (const token of PRODUCT_IMAGE_BAD_TOKENS) {
    if (normalizedUrl.includes(token)) score -= 6;
  }

  for (const token of PRODUCT_IMAGE_GOOD_TOKENS) {
    if (normalizedUrl.includes(token)) score += 2.5;
  }

  for (const token of lookupTokens) {
    if (normalizedUrl.includes(token)) score += 1.25;
  }

  if (/\.(?:jpe?g|png|webp|avif)(?:[?#].*)?$/i.test(url)) score += 0.5;
  if (/cdn|images|image|media/i.test(url)) score += 0.75;

  return score;
}

async function probeImageCandidate(url: string): Promise<{ width: number; height: number } | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; lt316-admin/1.0)" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;

    const sharp = (await import("sharp")).default;
    const buffer = Buffer.from(await response.arrayBuffer());
    const meta = await sharp(buffer, { failOn: "none", limitInputPixels: false }).metadata();
    if (!meta.width || !meta.height) return null;

    return { width: meta.width, height: meta.height };
  } catch {
    return null;
  }
}

function scoreImageMetadata(meta: { width: number; height: number } | null): number {
  if (!meta) return 0;

  const aspect = meta.height / Math.max(1, meta.width);
  let score = 0;

  if (meta.width < 180 || meta.height < 220) score -= 8;
  if (meta.width >= 450) score += 1.5;
  if (meta.height >= 700) score += 2.5;

  if (aspect < 1) score -= 10;
  else if (aspect >= 1.2 && aspect < 1.8) score += 2;
  else if (aspect >= 1.8 && aspect <= 4.6) score += 6;
  else if (aspect > 4.6) score -= 2;

  return score;
}

async function selectBestProductImage(args: {
  imageUrls: string[];
  lookupText: string;
}): Promise<string | null> {
  if (args.imageUrls.length === 0) return null;
  if (args.imageUrls.length === 1) return args.imageUrls[0];

  const lexicalRanked = args.imageUrls
    .map((url) => ({
      url,
      lexicalScore: scoreImageCandidateUrl(url, args.lookupText),
    }))
    .sort((a, b) => b.lexicalScore - a.lexicalScore);

  const probeCandidates = lexicalRanked.slice(0, 6);
  let bestUrl = lexicalRanked[0]?.url ?? null;
  let bestScore = lexicalRanked[0]?.lexicalScore ?? Number.NEGATIVE_INFINITY;

  for (const candidate of probeCandidates) {
    const meta = await probeImageCandidate(candidate.url);
    const totalScore = candidate.lexicalScore + scoreImageMetadata(meta);
    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestUrl = candidate.url;
    }
  }

  return bestUrl;
}

function buildParsedDimensions(args: {
  values: number[];
  unit: string;
  context: string;
  resolvedUrl: string | null;
  lookupInput: string;
  title: string | null;
  selectedSizeOz: number | null;
  selectedColorOrFinish: string | null;
  availableSizeOz: number[];
  lookupProductId: string | null;
  dimensionSourceKind: TumblerDimensionSourceKind;
  score: number;
}): ParsedDimensionCandidate | null {
  const values = args.values.filter(Number.isFinite);
  if (values.length !== 3) return null;

  const isMillimeters = /^mm$/i.test(args.unit);
  const valuesMm = values
    .map((value) => (isMillimeters ? value : value * 25.4))
    .sort((left, right) => left - right);
  const horizontalA = valuesMm[0];
  const horizontalB = valuesMm[1];
  const overallHeightMm = valuesMm[2];
  const horizontalDelta = Math.abs(horizontalA - horizontalB);
  const isStraight = horizontalDelta <= 3;
  const diameterMm = isStraight ? round2((horizontalA + horizontalB) / 2) : round2(horizontalB);
  const usableHeightMm = round2(overallHeightMm * 0.78);
  const variantLabel = buildVariantLabel({
    selectedSizeOz: args.selectedSizeOz,
    selectedColorOrFinish: args.selectedColorOrFinish,
    fallbackLabel: args.title,
  });
  const dimensionSourceSizeOz = parseCapacityOz(args.context);
  const titleSizeOz = parseCapacityOz(args.title ?? args.lookupInput);
  const dimensionAuthority: DimensionAuthority = Number.isFinite(diameterMm)
    ? "diameter-primary"
    : "unknown";

  return {
    score: args.score,
    dimensions: {
      lookupProductId: args.lookupProductId,
      productUrl: args.resolvedUrl,
      selectedVariantId: normalizeVariantId(variantLabel),
      selectedVariantLabel: variantLabel,
      selectedSizeOz: args.selectedSizeOz,
      selectedColorOrFinish: args.selectedColorOrFinish,
      availableVariantLabels: args.availableSizeOz.map((value) => `${value} oz`),
      availableSizeOz: args.availableSizeOz,
      dimensionSourceUrl: args.resolvedUrl,
      dimensionSourceText: args.context,
      dimensionSourceSizeOz,
      dimensionSourceKind: args.dimensionSourceKind,
      titleSizeOz,
      confidence: round2(args.score),
      dimensionAuthority,
      diameterMm,
      bodyDiameterMm: diameterMm,
      wrapDiameterMm: diameterMm,
      wrapWidthMm: computeWrapWidthFromDiameterMm(diameterMm) ?? null,
      fullProductHeightMm: round2(overallHeightMm),
      bodyHeightMm: usableHeightMm,
      heightIncludesLidOrStraw: round2(overallHeightMm) > usableHeightMm,
      overallHeightMm: round2(overallHeightMm),
      outsideDiameterMm: isStraight ? diameterMm : null,
      topDiameterMm: isStraight ? null : round2(horizontalB),
      bottomDiameterMm: isStraight ? null : round2(horizontalA),
      usableHeightMm,
    },
  };
}

function parseTripletDimensionsMm(args: {
  text: string;
  resolvedUrl: string | null;
  lookupInput: string;
  title: string | null;
  selectedSizeOz: number | null;
  selectedColorOrFinish: string | null;
  availableSizeOz: number[];
  lookupProductId: string | null;
  sourceKind: TumblerSourceLink["kind"];
}): TumblerItemLookupDimensions | null {
  const candidates: ParsedDimensionCandidate[] = [];
  const pattern = /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|in(?:ches)?|")/gi;

  for (const match of args.text.matchAll(pattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const context = decodeHtml(args.text.slice(Math.max(0, start - 160), Math.min(args.text.length, end + 160)))
      .replace(/\s+/g, " ")
      .trim();
    const contextSizeOz = parseCapacityOz(context);
    let score = 0.55;

    if (/dimension|dimensions|size|spec/i.test(context)) score += 0.12;
    if (/package|shipping|box|carton/i.test(context)) score -= 0.22;
    if (args.selectedSizeOz && contextSizeOz === args.selectedSizeOz) score += 0.2;
    if (args.selectedSizeOz && contextSizeOz && contextSizeOz !== args.selectedSizeOz) score -= 0.35;
    if (!args.selectedSizeOz && contextSizeOz) score += 0.04;
    if (args.availableSizeOz.length > 1 && !contextSizeOz) score -= 0.12;

    const candidate = buildParsedDimensions({
      values: [Number(match[1]), Number(match[2]), Number(match[3])],
      unit: match[4] ?? "in",
      context,
      resolvedUrl: args.resolvedUrl,
      lookupInput: args.lookupInput,
      title: args.title,
      selectedSizeOz: args.selectedSizeOz,
      selectedColorOrFinish: args.selectedColorOrFinish,
      availableSizeOz: args.availableSizeOz,
      lookupProductId: args.lookupProductId,
      dimensionSourceKind: args.sourceKind === "official" ? "official-page" : "parsed-page",
      score,
    });
    if (candidate) {
      candidates.push(candidate);
    }
  }

  candidates.sort((left, right) => right.score - left.score);
  return candidates[0]?.dimensions ?? null;
}

function toMm(value: number, unit: string | null | undefined): number {
  return /^mm$/i.test(unit ?? "") ? value : value * 25.4;
}

export function parseDuetDimensionsMm(args: {
  text: string;
  resolvedUrl: string | null;
  lookupInput: string;
  title: string | null;
  selectedSizeOz: number | null;
  selectedColorOrFinish: string | null;
  availableSizeOz: number[];
  lookupProductId: string | null;
  sourceKind: TumblerSourceLink["kind"];
  shapeType?: TumblerProfile["shapeType"] | null;
}): TumblerItemLookupDimensions | null {
  if (args.shapeType === "tapered") return null;

  const candidates: ParsedDimensionCandidate[] = [];
  const pattern = /(\d+(?:\.\d+)?)\s*(mm|in(?:ches)?|")?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|in(?:ches)?|")/gi;

  for (const match of args.text.matchAll(pattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const before = args.text.slice(Math.max(0, start - 12), start);
    const after = args.text.slice(end, Math.min(args.text.length, end + 12));
    if (/[x×]\s*$/i.test(before) || /^\s*[x×]/i.test(after)) {
      continue;
    }

    const context = decodeHtml(args.text.slice(Math.max(0, start - 160), Math.min(args.text.length, end + 160)))
      .replace(/\s+/g, " ")
      .trim();
    const contextSizeOz = parseCapacityOz(context);
    let score = 0.5;

    if (/dimension|dimensions|size|spec/i.test(context)) score += 0.12;
    if (/diameter|height/i.test(context)) score += 0.08;
    if (/package|shipping|box|carton/i.test(context)) score -= 0.22;
    if (args.selectedSizeOz && contextSizeOz === args.selectedSizeOz) score += 0.2;
    if (args.selectedSizeOz && contextSizeOz && contextSizeOz !== args.selectedSizeOz) score -= 0.35;
    if (!args.selectedSizeOz && contextSizeOz) score += 0.04;
    if (args.availableSizeOz.length > 1 && !contextSizeOz) score -= 0.12;

    const leftMm = toMm(Number(match[1]), match[2] ?? match[4]);
    const rightMm = toMm(Number(match[3]), match[4] ?? match[2]);
    if (!Number.isFinite(leftMm) || !Number.isFinite(rightMm)) continue;
    const diameterMm = round2(Math.min(leftMm, rightMm));
    const overallHeightMm = round2(Math.max(leftMm, rightMm));
    if (overallHeightMm <= diameterMm) continue;

    const usableHeightMm = round2(overallHeightMm * 0.78);
    const variantLabel = buildVariantLabel({
      selectedSizeOz: args.selectedSizeOz,
      selectedColorOrFinish: args.selectedColorOrFinish,
      fallbackLabel: args.title,
    });
    const dimensionSourceSizeOz = parseCapacityOz(context);
    const titleSizeOz = parseCapacityOz(args.title ?? args.lookupInput);

    candidates.push({
      score,
      dimensions: {
        lookupProductId: args.lookupProductId,
        productUrl: args.resolvedUrl,
        selectedVariantId: normalizeVariantId(variantLabel),
        selectedVariantLabel: variantLabel,
        selectedSizeOz: args.selectedSizeOz,
        selectedColorOrFinish: args.selectedColorOrFinish,
        availableVariantLabels: args.availableSizeOz.map((value) => `${value} oz`),
        availableSizeOz: args.availableSizeOz,
        dimensionSourceUrl: args.resolvedUrl,
        dimensionSourceText: context,
        dimensionSourceSizeOz,
        dimensionSourceKind: args.sourceKind === "official" ? "official-page" : "parsed-page",
        titleSizeOz,
        confidence: round2(score),
        dimensionAuthority: "diameter-primary",
        diameterMm,
        bodyDiameterMm: diameterMm,
        wrapDiameterMm: diameterMm,
        wrapWidthMm: computeWrapWidthFromDiameterMm(diameterMm) ?? null,
        fullProductHeightMm: overallHeightMm,
        bodyHeightMm: usableHeightMm,
        heightIncludesLidOrStraw: overallHeightMm > usableHeightMm,
        overallHeightMm,
        outsideDiameterMm: diameterMm,
        topDiameterMm: null,
        bottomDiameterMm: null,
        usableHeightMm,
      },
    });
  }

  candidates.sort((left, right) => right.score - left.score);
  return candidates[0]?.dimensions ?? null;
}

function scoreProfileMatch(profileText: string, lookupText: string): number {
  const profileTokens = new Set(normalizeText(profileText).split(" ").filter(Boolean));
  const lookupTokens = new Set(normalizeText(lookupText).split(" ").filter(Boolean));
  if (profileTokens.size === 0 || lookupTokens.size === 0) return 0;

  let hits = 0;
  for (const token of profileTokens) {
    if (lookupTokens.has(token)) hits += 1;
  }
  return hits / profileTokens.size;
}

function buildProfileLookupText(profile: (typeof KNOWN_TUMBLER_PROFILES)[number]): string {
  return [
    profile.brand,
    profile.model,
    profile.label,
    `${profile.capacityOz}oz`,
    `${profile.capacityOz} oz`,
    ...(profile.lookupAliases ?? []),
  ].join(" ");
}

function uniqueCatalogBrands(): string[] {
  return [...new Set(
    KNOWN_TUMBLER_PROFILES
      .map((profile) => profile.brand.trim())
      .filter(Boolean),
  )];
}

function inferBrandFromCatalogText(lookupText: string): string | null {
  const normalizedLookup = ` ${normalizeText(lookupText)} `;
  const matches = uniqueCatalogBrands()
    .map((brand) => {
      const normalizedBrand = normalizeText(brand);
      if (!normalizedBrand) return null;
      const brandTokens = normalizedBrand.split(" ").filter(Boolean);
      const score = brandTokens.filter((token) => normalizedLookup.includes(` ${token} `)).length / brandTokens.length;
      return score > 0 ? { brand, score } : null;
    })
    .filter((value): value is { brand: string; score: number } => Boolean(value))
    .sort((left, right) => right.score - left.score);

  return matches[0]?.score === 1 ? matches[0].brand : null;
}

function inferModelFromCatalogText(lookupText: string, brand: string | null, capacityOz: number | null): string | null {
  const candidates = KNOWN_TUMBLER_PROFILES
    .filter((profile) => !brand || normalizeText(profile.brand) === normalizeText(brand))
    .map((profile) => ({
      profile,
      score: scoreProfileMatch(buildProfileLookupText(profile), lookupText) +
        (capacityOz && profile.capacityOz === capacityOz ? 0.2 : 0),
    }))
    .sort((left, right) => right.score - left.score);

  const best = candidates[0];
  return best && best.score >= 0.42 ? best.profile.model : null;
}

function matchProfileFromText(lookupText: string) {
  const brand = inferBrandFromCatalogText(lookupText);
  const capacityOz = parseCapacityOz(lookupText);
  const model = inferModelFromCatalogText(lookupText, brand, capacityOz);

  const directProfileId = findTumblerProfileIdForBrandModel({
    brand,
    model,
    capacityOz,
  });
  if (directProfileId) {
    return getTumblerProfileById(directProfileId);
  }

  let bestProfile = null as ReturnType<typeof getTumblerProfileById>;
  let bestScore = 0;
  for (const profile of KNOWN_TUMBLER_PROFILES) {
    const profileText = buildProfileLookupText(profile);
    const score = scoreProfileMatch(profileText, lookupText);
    if (score > bestScore) {
      bestScore = score;
      bestProfile = profile;
    }
  }

  return bestScore >= 0.42 ? bestProfile : null;
}

async function glbAssetExists(glbPath: string): Promise<boolean> {
  if (!glbPath) return false;
  if (glbPath.startsWith("/api/admin/models/generated/")) {
    const fileName = glbPath.split("/").pop();
    return fileName ? generatedModelExists(decodeURIComponent(fileName)) : false;
  }

  const normalized = glbPath.replace(/^\/+/, "").replace(/\//g, path.sep);
  const absolute = path.join(process.cwd(), "public", normalized);
  try {
    await access(absolute);
    return true;
  } catch {
    return false;
  }
}

async function pickFallbackGlbPath(args: {
  matchedProfileId: string | null;
  imageUrl?: string | null;
  imageUrls?: string[];
}): Promise<{
  glbPath: string;
  fitDebug: TumblerItemLookupFitDebug | null;
  sourceModelAvailability: TumblerSourceModelAvailability;
  generated: boolean;
  warnings: string[];
}> {
  const matchedProfile = args.matchedProfileId ? getTumblerProfileById(args.matchedProfileId) : null;
  const hasCandidateImage = Boolean(
    args.imageUrl ||
    (args.imageUrls ?? []).some((value) => Boolean(value)),
  );
  const shouldGenerateFirst = matchedProfile?.generatedModelPolicy?.strategy === "body-band-lathe";
  const canGenerateStraightSeed = Boolean(
    matchedProfile &&
    matchedProfile.shapeType === "straight" &&
    hasCandidateImage,
  );

  if (matchedProfile && shouldGenerateFirst) {
    try {
      const generated = await ensureGeneratedTumblerGlb(matchedProfile.id, {
        imageUrl: args.imageUrl,
        imageUrls: args.imageUrls,
      });
      if (generated.glbPath && await glbAssetExists(generated.glbPath)) {
        return {
          ...generated,
          sourceModelAvailability: "generated-source-model",
          generated: true,
          warnings: generated.warnings ?? [],
        };
      }
    } catch (error) {
      console.warn("[lookupTumblerItem] generated profile model failed:", error);
    }
  }

  const candidates = [
    matchedProfile?.templateGlbPath ?? null,
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (await glbAssetExists(candidate)) {
      return {
        glbPath: candidate,
        fitDebug: null,
        sourceModelAvailability: "verified-source-model",
        generated: false,
        warnings: [],
      };
    }
  }

  if (matchedProfile && canGenerateStraightSeed) {
    try {
      const generated = await ensureGeneratedTumblerGlb(matchedProfile.id, {
        imageUrl: args.imageUrl,
        imageUrls: args.imageUrls,
      });
      if (generated.glbPath && await glbAssetExists(generated.glbPath)) {
        return {
          ...generated,
          sourceModelAvailability: "generated-source-model",
          generated: true,
          warnings: generated.warnings ?? [],
        };
      }
    } catch (error) {
      console.warn("[lookupTumblerItem] generated straight profile model failed:", error);
    }
  }

  return {
    glbPath: "",
    fitDebug: null,
    sourceModelAvailability: "missing-source-model",
    generated: false,
    warnings: [],
  };
}

function buildSources(url: string | null, kind: TumblerSourceLink["kind"], title: string | null): TumblerSourceLink[] {
  if (!url) return [];
  return [
    {
      title: title ?? url,
      url,
      kind,
    },
  ];
}

function sourceUrlMatchesOfficialCatalogDomain(url: string): boolean {
  let hostname = "";
  try {
    hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }

  return KNOWN_TUMBLER_PROFILES.some((profile) =>
    (profile.officialDomains ?? []).some((domain) => {
      const normalizedDomain = domain.toLowerCase().replace(/^www\./, "");
      return hostname === normalizedDomain || hostname.endsWith(`.${normalizedDomain}`);
    }),
  );
}

async function fetchPage(url: string): Promise<{ html: string; finalUrl: string }> {
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; lt316-admin/1.0)" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Lookup fetch failed (${response.status})`);
  }

  const html = await response.text();
  return { html, finalUrl: response.url || url };
}

export async function lookupTumblerItem(args: {
  lookupInput: string;
  dimensionExtractor?: PageDimensionExtractor;
}): Promise<TumblerItemLookupResponse> {
  const lookupInput = args.lookupInput.trim();
  let resolvedUrl: string | null = null;
  let title: string | null = null;
  let imageUrls: string[] = [];
  let sources: TumblerSourceLink[] = [];
  let scrapedDims: TumblerItemLookupDimensions | null = null;
  const notes: string[] = [];
  let sourceKind: TumblerSourceLink["kind"] = "general";
  let selectedImageUrl: string | null = null;

  let lookupText = lookupInput;
  let titleSizeOz = parseCapacityOz(lookupInput);
  let selectedColorOrFinish = inferColorOrFinish(lookupInput);
  let selectedVariantId: string | null = null;
  let selectedVariantLabel: string | null = null;
  let selectedVariantImageUrl: string | null = null;
  let pageText = "";

  if (isLikelyUrl(lookupInput)) {
    let html: string;
    let finalUrl: string;
    try {
      const fetchedPage = await fetchPage(lookupInput);
      html = fetchedPage.html;
      finalUrl = fetchedPage.finalUrl;
    } catch (error) {
      throw manualEntryError(
        error instanceof Error
          ? `Could not fetch the product page: ${error.message}.`
          : "Could not fetch the product page.",
      );
    }

    resolvedUrl = finalUrl;
    const openGraph = extractOpenGraphProductMetadata(html, finalUrl);
    title = openGraph.title ?? extractTitle(html);
    imageUrls = extractImageUrls(html, finalUrl);
    if (openGraph.imageUrl && !imageUrls.includes(openGraph.imageUrl)) {
      imageUrls = [openGraph.imageUrl, ...imageUrls];
    }
    pageText = extractPageBodyText(html);
    const selectedVariant = extractShopifySelectedVariant(html, finalUrl);
    const urlVariant = extractUrlVariantParams(finalUrl);
    selectedVariantLabel = selectedVariant?.title ?? urlVariant.selectedVariantLabel;
    selectedVariantId = selectedVariant?.id ?? normalizeVariantId(selectedVariantLabel);
    selectedVariantImageUrl = selectedVariant?.imageUrl ?? null;
    if (selectedVariantImageUrl && !imageUrls.includes(selectedVariantImageUrl)) {
      imageUrls = [selectedVariantImageUrl, ...imageUrls];
    }
    lookupText = [lookupInput, buildUrlLookupText(finalUrl), title, pageText].filter(Boolean).join(" ");

    if (sourceUrlMatchesOfficialCatalogDomain(finalUrl)) sourceKind = "official";
    else if (/academy\.com/i.test(finalUrl)) sourceKind = "retailer";
    else if (/amazon\.com|walmart\.com|dickssportinggoods\.com/i.test(finalUrl)) sourceKind = "retailer";

    sources = buildSources(finalUrl, sourceKind, title);
    titleSizeOz =
      parseCapacityOz(selectedVariant?.title ?? "") ??
      urlVariant.selectedSizeOz ??
      parseCapacityOz(title ?? lookupInput);
    selectedColorOrFinish =
      selectedVariant?.selectedColorOrFinish ??
      urlVariant.selectedColorOrFinish ??
      inferColorOrFinish([title, lookupInput].filter(Boolean).join(" "));
    const availableSizeOz = extractAllCapacitiesOz(lookupText);
    scrapedDims = parseTripletDimensionsMm({
      text: lookupText,
      resolvedUrl: finalUrl,
      lookupInput,
      title,
      selectedSizeOz: titleSizeOz,
      selectedColorOrFinish,
      availableSizeOz,
      lookupProductId: finalUrl,
      sourceKind,
    });
    selectedImageUrl = selectedVariantImageUrl ?? await selectBestProductImage({
      imageUrls,
      lookupText,
    });
    if (scrapedDims?.overallHeightMm) {
      notes.push("Parsed page dimensions from the product page text.");
    }
    if (selectedImageUrl && selectedImageUrl !== imageUrls[0]) {
      notes.push("Selected the strongest product photo from the scraped page images.");
    }
  }

  const matchedProfile = matchProfileFromText(lookupText);
  if (isLikelyUrl(lookupInput) && resolvedUrl && !scrapedDims) {
    scrapedDims = parseDuetDimensionsMm({
      text: lookupText,
      resolvedUrl,
      lookupInput,
      title,
      selectedSizeOz: titleSizeOz,
      selectedColorOrFinish,
      availableSizeOz: extractAllCapacitiesOz(lookupText),
      lookupProductId: resolvedUrl,
      sourceKind,
      shapeType: "straight",
    });
    if (scrapedDims?.overallHeightMm) {
      notes.push("Parsed diameter x height dimensions from the product page text.");
    }
  }

  if (isLikelyUrl(lookupInput) && resolvedUrl && !matchedProfile && !scrapedDims) {
    const dimensionExtractor = args.dimensionExtractor ?? extractDimensionsWithOpenAi;
    try {
      const llmDimensions = await dimensionExtractor({
        lookupInput,
        resolvedUrl,
        title,
        pageText,
        selectedSizeOz: titleSizeOz,
        selectedColorOrFinish,
      });
      if (llmDimensions) {
        scrapedDims = buildLlmExtractedDimensions({
          extraction: llmDimensions,
          resolvedUrl,
          lookupInput,
          title,
          selectedSizeOz: titleSizeOz,
          selectedColorOrFinish,
          availableSizeOz: extractAllCapacitiesOz(lookupText),
          pageText,
        });
        notes.push("OpenAI extracted product dimensions from the page text.");
        for (const note of llmDimensions.notes ?? []) {
          notes.push(`OpenAI note: ${note}`);
        }
      }
    } catch (error) {
      notes.push(
        `OpenAI dimension extraction failed: ${error instanceof Error ? error.message : "unknown error"}.`,
      );
    }
  }

  if (isLikelyUrl(lookupInput) && resolvedUrl && !matchedProfile && scrapedDims?.dimensionSourceKind === "llm-page") {
    const capacityOz =
      titleSizeOz ??
      scrapedDims.selectedSizeOz ??
      scrapedDims.dimensionSourceSizeOz ??
      parseCapacityOz(lookupText) ??
      null;
    const fallbackAsset = await pickFallbackGlbPath({
      matchedProfileId: null,
      imageUrl: selectedImageUrl,
      imageUrls,
    });

    return {
      lookupInput,
      resolvedUrl,
      title,
      brand: null,
      model: title,
      capacityOz,
      matchedProfileId: null,
      profileAuthority: "dynamic-llm-extracted",
      profileAuthorityLabel: getProfileAuthorityLabel("dynamic-llm-extracted"),
      profileAuthorityReason:
        "OpenAI extracted usable product dimensions directly from page text after deterministic lookup found no exact internal profile.",
      profileConfidence: scrapedDims.confidence ?? null,
      sourceModelAvailability: fallbackAsset.sourceModelAvailability,
      sourceModelAvailabilityLabel: getSourceModelAvailabilityLabel(fallbackAsset.sourceModelAvailability),
      requiresBodyReferenceReview: true,
      glbPath: fallbackAsset.glbPath,
      modelStatus: fallbackAsset.glbPath ? "verified-product-model" : "missing-model",
      modelSourceLabel: fallbackAsset.glbPath ? "Generated straight tumbler source model" : "Source model unavailable",
      imageUrl: selectedImageUrl,
      imageUrls,
      fitDebug: fallbackAsset.fitDebug,
      dimensions: scrapedDims,
      mode: "parsed-page",
      notes: [
        ...notes,
        "OpenAI dynamic geometry was used because no exact internal tumbler profile matched.",
        `GLB fallback: ${fallbackAsset.glbPath || "none available locally"}.`,
      ],
      sources,
    };
  }

  if (isLikelyUrl(lookupInput) && resolvedUrl && !matchedProfile && !scrapedDims) {
    throw manualEntryError("Could not extract usable tumbler dimensions from the product page.");
  }

  const extractedCapacityOz =
    scrapedDims?.selectedSizeOz ??
    scrapedDims?.dimensionSourceSizeOz ??
    null;
  const capacityOz = titleSizeOz ?? extractedCapacityOz ?? parseCapacityOz(lookupText) ?? matchedProfile?.capacityOz ?? null;
  const brand = matchedProfile?.brand ?? inferBrandFromCatalogText(lookupText);
  const model = matchedProfile?.model ?? inferModelFromCatalogText(lookupText, brand, capacityOz) ?? title;

  if (matchedProfile) {
    const topMarginMm = matchedProfile.guideBand?.upperGrooveYmm ?? round2((matchedProfile.overallHeightMm - matchedProfile.usableHeightMm) / 2);
    const bottomMarginMm = round2(
      Math.max(0, matchedProfile.overallHeightMm - matchedProfile.usableHeightMm - topMarginMm)
    );
    const officialOverride = hasOfficialOverride(matchedProfile, scrapedDims);
    notes.push(
      `Applied internal ${matchedProfile.label} profile for geometry and printable-height fallback.`
    );
    if (scrapedDims?.overallHeightMm) {
      notes.push(officialOverride
        ? "Official page dimensions override internal profile dimensions."
        : "Official or retailer page dimensions agree with the internal profile within 1 mm."
      );
    }

    const fallbackAsset = await pickFallbackGlbPath({
      matchedProfileId: matchedProfile.id,
      imageUrl: selectedImageUrl,
      imageUrls,
    });

    const matchedProfileDiameterMm = matchedProfile.outsideDiameterMm
      ?? matchedProfile.topDiameterMm
      ?? matchedProfile.bottomDiameterMm
      ?? null;
    const geometryDiameterMm = officialOverride
      ? scrapedDims?.outsideDiameterMm
        ?? scrapedDims?.diameterMm
        ?? scrapedDims?.wrapDiameterMm
        ?? matchedProfileDiameterMm
      : matchedProfileDiameterMm;
    const geometryOverallHeightMm = officialOverride
      ? scrapedDims?.overallHeightMm ?? scrapedDims?.fullProductHeightMm ?? matchedProfile.overallHeightMm
      : matchedProfile.overallHeightMm;
    const geometryUsableHeightMm = officialOverride
      ? scrapedDims?.usableHeightMm ?? scrapedDims?.bodyHeightMm ?? round2((geometryOverallHeightMm ?? matchedProfile.overallHeightMm) * 0.78)
      : matchedProfile.usableHeightMm;
    const dimensionSourceKind: TumblerDimensionSourceKind = officialOverride
      ? "official-page"
      : "internal-profile";
    const variantLabel = buildVariantLabel({
      selectedSizeOz: titleSizeOz ?? matchedProfile.capacityOz,
      selectedColorOrFinish,
      fallbackLabel: selectedVariantLabel ?? matchedProfile.label,
    });
    const authority = classifyProfileAuthority({
      matchedProfile,
      sourceKind,
      dimensions: officialOverride ? scrapedDims : null,
      sourceModelAvailability: fallbackAsset.sourceModelAvailability,
      officialOverride,
    });
    return {
      lookupInput,
      resolvedUrl,
      title,
      brand: matchedProfile.brand,
      model: matchedProfile.model,
      capacityOz: matchedProfile.capacityOz,
      matchedProfileId: matchedProfile.id,
      profileAuthority: authority.authority,
      profileAuthorityLabel: getProfileAuthorityLabel(authority.authority),
      profileAuthorityReason: authority.reason,
      profileConfidence: 1,
      sourceModelAvailability: fallbackAsset.sourceModelAvailability,
      sourceModelAvailabilityLabel: getSourceModelAvailabilityLabel(fallbackAsset.sourceModelAvailability),
      requiresBodyReferenceReview: authority.requiresBodyReferenceReview,
      glbPath: fallbackAsset.glbPath,
      modelStatus: fallbackAsset.glbPath ? "verified-product-model" : "missing-model",
      modelSourceLabel: fallbackAsset.glbPath
        ? fallbackAsset.generated
          ? "Generated straight tumbler source model"
          : "Original full product model"
        : "Source model unavailable",
      imageUrl: selectedImageUrl,
      imageUrls,
      fitDebug: fallbackAsset.fitDebug,
      dimensions: {
        lookupProductId: matchedProfile.id,
        productUrl: resolvedUrl,
        selectedVariantId: selectedVariantId ?? normalizeVariantId(variantLabel),
        selectedVariantLabel: variantLabel,
        selectedSizeOz: titleSizeOz ?? matchedProfile.capacityOz,
        selectedColorOrFinish,
        availableVariantLabels: variantLabel ? [variantLabel] : [`${matchedProfile.capacityOz} oz`],
        availableSizeOz: [matchedProfile.capacityOz],
        dimensionSourceUrl: resolvedUrl,
        dimensionSourceText: officialOverride
          ? scrapedDims?.dimensionSourceText ?? `Official dimensions for ${matchedProfile.label}`
          : `Matched internal profile ${matchedProfile.label}`,
        dimensionSourceSizeOz: matchedProfile.capacityOz,
        dimensionSourceKind,
        titleSizeOz,
        confidence: 1,
        dimensionAuthority: geometryDiameterMm ? "diameter-primary" : "unknown",
        diameterMm: geometryDiameterMm ?? null,
        bodyDiameterMm: geometryDiameterMm ?? null,
        wrapDiameterMm: geometryDiameterMm ?? null,
        wrapWidthMm: computeWrapWidthFromDiameterMm(geometryDiameterMm ?? null) ?? null,
        fullProductHeightMm: geometryOverallHeightMm ?? null,
        bodyHeightMm: geometryUsableHeightMm ?? null,
        heightIncludesLidOrStraw:
          geometryOverallHeightMm !== null &&
          geometryUsableHeightMm !== null
            ? geometryOverallHeightMm > geometryUsableHeightMm
            : null,
        overallHeightMm: geometryOverallHeightMm ?? null,
        outsideDiameterMm: matchedProfile.shapeType === "straight" ? geometryDiameterMm ?? null : null,
        topDiameterMm: matchedProfile.shapeType === "straight" ? null : matchedProfile.topDiameterMm ?? null,
        bottomDiameterMm: matchedProfile.shapeType === "straight" ? null : matchedProfile.bottomDiameterMm ?? null,
        usableHeightMm: geometryUsableHeightMm ?? null,
      },
      mode: "matched-profile",
      notes: [
        ...notes,
        ...fallbackAsset.warnings,
        `Top margin fallback: ${round2(topMarginMm)} mm. Bottom margin fallback: ${round2(bottomMarginMm)} mm.`,
        `Handle arc fallback: ${getProfileHandleArcDeg(matchedProfile)}°.`,
        `GLB fallback: ${fallbackAsset.glbPath || "none available locally"}.`,
      ],
      sources,
    };
  }

  const safeDims = scrapedDims ?? {
    lookupProductId: resolvedUrl ?? lookupInput,
    productUrl: resolvedUrl,
    selectedVariantId: selectedVariantId ?? normalizeVariantId(buildVariantLabel({
      selectedSizeOz: titleSizeOz,
      selectedColorOrFinish,
      fallbackLabel: title,
    })),
    selectedVariantLabel: buildVariantLabel({
      selectedSizeOz: titleSizeOz,
      selectedColorOrFinish,
      fallbackLabel: title,
    }),
    selectedSizeOz: titleSizeOz,
    selectedColorOrFinish,
    availableVariantLabels: extractAllCapacitiesOz(lookupText).map((value) => `${value} oz`),
    availableSizeOz: extractAllCapacitiesOz(lookupText),
    dimensionSourceUrl: resolvedUrl,
    dimensionSourceText: null,
    dimensionSourceSizeOz: null,
    dimensionSourceKind: "safe-fallback" as const,
    titleSizeOz,
    confidence: null,
    dimensionAuthority: "unknown" as const,
    diameterMm: null,
    bodyDiameterMm: null,
    wrapDiameterMm: null,
    wrapWidthMm: null,
    fullProductHeightMm: null,
    bodyHeightMm: null,
    heightIncludesLidOrStraw: null,
    overallHeightMm: null,
    outsideDiameterMm: null,
    topDiameterMm: null,
    bottomDiameterMm: null,
    usableHeightMm: null,
  };

  if (!scrapedDims) {
    notes.push("No exact profile match or parseable product dimensions found. Using safe tumbler fallback values.");
  } else if (
    scrapedDims.selectedSizeOz &&
    scrapedDims.dimensionSourceSizeOz &&
    scrapedDims.selectedSizeOz !== scrapedDims.dimensionSourceSizeOz
  ) {
    notes.push(
      `Parsed page dimensions appear to belong to ${scrapedDims.dimensionSourceSizeOz} oz instead of the selected ${scrapedDims.selectedSizeOz} oz variant.`,
    );
  } else if (
    (scrapedDims.availableSizeOz?.length ?? 0) > 1 &&
    !scrapedDims.selectedSizeOz
  ) {
    notes.push("Product page exposes multiple size variants. Dimensions remain ambiguous until a specific variant is selected.");
  }

  const fallbackAsset = await pickFallbackGlbPath({
    matchedProfileId: null,
    imageUrl: selectedImageUrl,
    imageUrls,
  });
  const authority = classifyProfileAuthority({
    matchedProfile: null,
    sourceKind,
    dimensions: safeDims,
    sourceModelAvailability: fallbackAsset.sourceModelAvailability,
    officialOverride: false,
  });

  return {
    lookupInput,
    resolvedUrl,
    title,
    brand,
    model,
    capacityOz,
    matchedProfileId: null,
    profileAuthority: authority.authority,
    profileAuthorityLabel: getProfileAuthorityLabel(authority.authority),
    profileAuthorityReason: authority.reason,
    profileConfidence: safeDims.confidence ?? null,
    sourceModelAvailability: fallbackAsset.sourceModelAvailability,
    sourceModelAvailabilityLabel: getSourceModelAvailabilityLabel(fallbackAsset.sourceModelAvailability),
    requiresBodyReferenceReview: authority.requiresBodyReferenceReview,
    glbPath: fallbackAsset.glbPath,
    modelStatus: fallbackAsset.glbPath ? "verified-product-model" : "missing-model",
    modelSourceLabel: fallbackAsset.glbPath ? "Generated straight tumbler source model" : "Source model unavailable",
    imageUrl: selectedImageUrl,
    imageUrls,
    fitDebug: fallbackAsset.fitDebug,
    dimensions: safeDims,
    mode: scrapedDims ? "parsed-page" : "safe-fallback",
    notes: [
      ...notes,
      ...fallbackAsset.warnings,
      `GLB fallback: ${fallbackAsset.glbPath || "none available locally"}.`,
    ],
    sources,
  };
}
