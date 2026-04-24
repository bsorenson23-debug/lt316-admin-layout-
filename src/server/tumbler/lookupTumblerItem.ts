import {
  findTumblerProfileIdForBrandModel,
  getProfileHandleArcDeg,
  getTumblerProfileById,
  KNOWN_TUMBLER_PROFILES,
} from "@/data/tumblerProfiles";
import type { TumblerSourceLink } from "@/types/tumblerAutoSize";
import type {
  DimensionAuthority,
  TumblerItemLookupFitDebug,
  TumblerItemLookupDimensions,
  TumblerItemLookupResponse,
} from "@/types/tumblerItemLookup";
import { access } from "node:fs/promises";
import path from "node:path";
import { computeWrapWidthFromDiameterMm } from "@/lib/productDimensionAuthority";
import { ensureGeneratedTumblerGlb } from "@/server/tumbler/generateTumblerModel";
import { extractShopifySelectedVariant } from "@/server/tumbler/shopifyProductVariant";

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

interface ParsedDimensionCandidate {
  dimensions: TumblerItemLookupDimensions;
  score: number;
}

function inferBrand(text: string): string | null {
  if (/stanley/i.test(text)) return "Stanley";
  if (/yeti/i.test(text)) return "YETI";
  if (/rtic/i.test(text)) return "RTIC";
  if (/ozark/i.test(text)) return "Ozark Trail";
  return null;
}

function inferModel(text: string, brand: string | null, capacityOz: number | null): string | null {
  const normalized = normalizeText(text);
  if (brand === "Stanley") {
    if (normalized.includes("iceflow")) {
      return capacityOz ? `IceFlow Flip Straw ${capacityOz}oz` : "IceFlow Flip Straw";
    }
    if (normalized.includes("quencher")) {
      return capacityOz ? `Quencher H2.0 ${capacityOz}oz` : "Quencher H2.0";
    }
  }
  if (brand === "YETI" && normalized.includes("rambler")) {
    return capacityOz ? `Rambler ${capacityOz}oz` : "Rambler";
  }
  return null;
}

function extractMetaContent(html: string, metaName: string): string | null {
  const escaped = metaName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return null;
}

function extractTitle(html: string): string | null {
  const title = extractMetaContent(html, "og:title");
  if (title) return title;
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? decodeHtml(match[1].trim()) : null;
}

function resolveUrl(baseUrl: string, maybeUrl: string | null): string | null {
  if (!maybeUrl) return null;
  try {
    return new URL(maybeUrl, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractImageUrls(html: string, baseUrl: string): string[] {
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
      score,
    });
    if (candidate) {
      candidates.push(candidate);
    }
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

function matchProfileFromText(lookupText: string) {
  const brand = inferBrand(lookupText);
  const capacityOz = parseCapacityOz(lookupText);
  const model = inferModel(lookupText, brand, capacityOz);

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
    const profileText = `${profile.brand} ${profile.model} ${profile.capacityOz}oz ${profile.label}`;
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
  capacityOz: number | null;
  brand: string | null;
  model: string | null;
  hasHandle: boolean | null;
  imageUrl?: string | null;
  imageUrls?: string[];
}): Promise<{ glbPath: string; fitDebug: TumblerItemLookupFitDebug | null }> {
  if (args.matchedProfileId === "stanley-iceflow-30") {
    try {
      const generated = await ensureGeneratedTumblerGlb(args.matchedProfileId, {
        imageUrl: args.imageUrl,
        imageUrls: args.imageUrls,
      });
      if (generated.glbPath && await glbAssetExists(generated.glbPath)) {
        return generated;
      }
    } catch (error) {
      console.warn("[lookupTumblerItem] generated Stanley model failed:", error);
    }
  }

  const candidates = [
    args.matchedProfileId === "yeti-rambler-40"
      ? "/models/templates/yeti-40oz-body.glb"
      : null,
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (await glbAssetExists(candidate)) {
      return { glbPath: candidate, fitDebug: null };
    }
  }

  return { glbPath: "", fitDebug: null };
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
  let selectedVariantImageUrl: string | null = null;

  if (isLikelyUrl(lookupInput)) {
    const { html, finalUrl } = await fetchPage(lookupInput);
    resolvedUrl = finalUrl;
    title = extractTitle(html);
    imageUrls = extractImageUrls(html, finalUrl);
    const selectedVariant = extractShopifySelectedVariant(html, finalUrl);
    selectedVariantId = selectedVariant?.id ?? null;
    selectedVariantImageUrl = selectedVariant?.imageUrl ?? null;
    if (selectedVariantImageUrl && !imageUrls.includes(selectedVariantImageUrl)) {
      imageUrls = [selectedVariantImageUrl, ...imageUrls];
    }
    lookupText = [lookupInput, title, html.slice(0, 12_000)].filter(Boolean).join(" ");

    if (/stanley1913\.com/i.test(finalUrl)) sourceKind = "official";
    else if (/academy\.com/i.test(finalUrl)) sourceKind = "retailer";
    else if (/amazon\.com|walmart\.com|dickssportinggoods\.com/i.test(finalUrl)) sourceKind = "retailer";

    sources = buildSources(finalUrl, sourceKind, title);
    titleSizeOz = parseCapacityOz(title ?? lookupInput);
    selectedColorOrFinish =
      selectedVariant?.selectedColorOrFinish ??
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
  const capacityOz = parseCapacityOz(lookupText) ?? matchedProfile?.capacityOz ?? null;
  const brand = inferBrand(lookupText) ?? matchedProfile?.brand ?? null;
  const model = inferModel(lookupText, brand, capacityOz) ?? matchedProfile?.model ?? title;

  if (matchedProfile) {
    const topMarginMm = matchedProfile.guideBand?.upperGrooveYmm ?? round2((matchedProfile.overallHeightMm - matchedProfile.usableHeightMm) / 2);
    const bottomMarginMm = round2(
      Math.max(0, matchedProfile.overallHeightMm - matchedProfile.usableHeightMm - topMarginMm)
    );
    notes.push(
      `Applied internal ${matchedProfile.label} profile for geometry and printable-height fallback.`
    );
    if (scrapedDims?.overallHeightMm) {
      notes.push(
        `Official or retailer page dimensions were found, but the internal profile remains the geometry source until a dedicated GLB generator is added.`
      );
    }

    const fallbackAsset = await pickFallbackGlbPath({
      matchedProfileId: matchedProfile.id,
      capacityOz: matchedProfile.capacityOz,
      brand: matchedProfile.brand,
      model: matchedProfile.model,
      hasHandle: matchedProfile.hasHandle,
      imageUrl: selectedImageUrl,
      imageUrls,
    });

    const matchedProfileDiameterMm = matchedProfile.outsideDiameterMm
      ?? matchedProfile.topDiameterMm
      ?? matchedProfile.bottomDiameterMm
      ?? null;
    const variantLabel = buildVariantLabel({
      selectedSizeOz: matchedProfile.capacityOz,
      selectedColorOrFinish,
      fallbackLabel: matchedProfile.label,
    });
    return {
      lookupInput,
      resolvedUrl,
      title,
      brand: matchedProfile.brand,
      model: matchedProfile.model,
      capacityOz: matchedProfile.capacityOz,
      matchedProfileId: matchedProfile.id,
      glbPath: fallbackAsset.glbPath,
      imageUrl: selectedImageUrl,
      imageUrls,
      fitDebug: fallbackAsset.fitDebug,
      dimensions: {
        lookupProductId: matchedProfile.id,
        productUrl: resolvedUrl,
        selectedVariantId: selectedVariantId ?? normalizeVariantId(variantLabel),
        selectedVariantLabel: variantLabel,
        selectedSizeOz: matchedProfile.capacityOz,
        selectedColorOrFinish,
        availableVariantLabels: variantLabel ? [variantLabel] : [`${matchedProfile.capacityOz} oz`],
        availableSizeOz: [matchedProfile.capacityOz],
        dimensionSourceUrl: resolvedUrl,
        dimensionSourceText: `Matched internal profile ${matchedProfile.label}`,
        dimensionSourceSizeOz: matchedProfile.capacityOz,
        titleSizeOz,
        confidence: 1,
        dimensionAuthority: matchedProfileDiameterMm ? "diameter-primary" : "unknown",
        diameterMm: matchedProfileDiameterMm,
        bodyDiameterMm: matchedProfileDiameterMm,
        wrapDiameterMm: matchedProfileDiameterMm,
        wrapWidthMm: computeWrapWidthFromDiameterMm(matchedProfileDiameterMm) ?? null,
        fullProductHeightMm: matchedProfile.overallHeightMm,
        bodyHeightMm: matchedProfile.usableHeightMm,
        heightIncludesLidOrStraw: matchedProfile.overallHeightMm > matchedProfile.usableHeightMm,
        overallHeightMm: matchedProfile.overallHeightMm,
        outsideDiameterMm: matchedProfile.outsideDiameterMm ?? null,
        topDiameterMm: matchedProfile.topDiameterMm ?? null,
        bottomDiameterMm: matchedProfile.bottomDiameterMm ?? null,
        usableHeightMm: matchedProfile.usableHeightMm,
      },
      mode: "matched-profile",
      notes: [
        ...notes,
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
    capacityOz,
    brand,
    model,
    hasHandle: brand === "Stanley" ? true : null,
    imageUrl: selectedImageUrl,
    imageUrls,
  });

  return {
    lookupInput,
    resolvedUrl,
    title,
    brand,
    model,
    capacityOz,
    matchedProfileId: null,
    glbPath: fallbackAsset.glbPath,
    imageUrl: selectedImageUrl,
    imageUrls,
    fitDebug: fallbackAsset.fitDebug,
    dimensions: safeDims,
    mode: scrapedDims ? "parsed-page" : "safe-fallback",
    notes: [
      ...notes,
      `GLB fallback: ${fallbackAsset.glbPath || "none available locally"}.`,
    ],
    sources,
  };
}
