import type { FlatItemLookupResponse } from "@/types/flatItemLookup";
import type { TumblerSourceLink } from "@/types/tumblerAutoSize";
import {
  buildMetadataFallbackItem,
  extractLookupText,
  findFlatItemLookupMatch,
  inferMaterialFromText,
  normalizeLookupText,
} from "@/lib/flatItemCatalog";
import {
  ensureDownloadedFlatItemModel,
  ensureGeneratedFlatItemGlb,
  ensureTracedFlatItemGlb,
} from "./generateFlatItemModel";

const IMAGE_META_NAMES = [
  "og:image",
  "og:image:url",
  "twitter:image",
  "twitter:image:src",
];

const MODEL_META_NAMES = [
  "og:model",
  "twitter:model",
];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
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
    urls.add(resolved);
  };

  for (const metaName of IMAGE_META_NAMES) {
    addUrl(extractMetaContent(html, metaName));
  }

  for (const match of html.matchAll(/<(?:img|source)[^>]+(?:src|data-src|data-image|data-zoom-image)=["']([^"']+)["']/gi)) {
    addUrl(match[1]);
    if (urls.size >= 12) break;
  }

  return [...urls];
}

function extractModelUrls(html: string, baseUrl: string): string[] {
  const urls = new Set<string>();
  const addUrl = (value: string | null | undefined) => {
    const decoded = decodeHtml(value ?? "");
    if (!/\.(glb|gltf|stl|obj)(?:[?#]|$)/i.test(decoded)) return;
    const resolved = resolveUrl(baseUrl, decoded);
    if (!resolved) return;
    urls.add(resolved);
  };

  for (const metaName of MODEL_META_NAMES) {
    addUrl(extractMetaContent(html, metaName));
  }

  for (const match of html.matchAll(/<(?:model-viewer|a|link|script|source)[^>]+(?:src|href|data-model|data-src)=["']([^"']+\.(?:glb|gltf|stl|obj)(?:\?[^"']*)?)["']/gi)) {
    addUrl(match[1]);
  }

  for (const match of html.matchAll(/https?:\/\/[^"' )]+?\.(?:glb|gltf|stl|obj)(?:\?[^"' )]*)?/gi)) {
    addUrl(match[0]);
  }

  return [...urls];
}

function jsonLdBlocks(html: string): string[] {
  return [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter(Boolean);
}

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value.trim());
  } catch {
    return null;
  }
}

function flattenJsonLd(node: unknown): Record<string, unknown>[] {
  if (!node) return [];
  if (Array.isArray(node)) {
    return node.flatMap((entry) => flattenJsonLd(entry));
  }
  if (typeof node !== "object") return [];
  const record = node as Record<string, unknown>;
  const graph = record["@graph"];
  return [record, ...flattenJsonLd(graph)];
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getBrand(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object") {
    const brandName = getString((value as Record<string, unknown>).name);
    return brandName;
  }
  return null;
}

function getImageCandidates(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((entry) => getImageCandidates(entry));
  if (value && typeof value === "object") {
    const url = getString((value as Record<string, unknown>).url) ?? getString((value as Record<string, unknown>).contentUrl);
    return url ? [url] : [];
  }
  return [];
}

function getModelCandidates(value: unknown): string[] {
  if (typeof value === "string") return /\.(glb|gltf|stl|obj)(?:[?#]|$)/i.test(value) ? [value] : [];
  if (Array.isArray(value)) return value.flatMap((entry) => getModelCandidates(entry));
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const urls = [
      getString(record.url),
      getString(record.contentUrl),
      getString(record.embedUrl),
    ].filter(Boolean) as string[];
    return urls.filter((url) => /\.(glb|gltf|stl|obj)(?:[?#]|$)/i.test(url));
  }
  return [];
}

function parseQuantitativeMm(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return round2(value);
  if (typeof value === "string") {
    const mm = parseDimensionText(value);
    return mm?.[0] ?? null;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const numeric = Number(record.value);
    const unit = getString(record.unitCode) ?? getString(record.unitText) ?? "mm";
    if (!Number.isFinite(numeric)) return null;
    if (/^(mm|millimet)/i.test(unit)) return round2(numeric);
    if (/^(cm|centimet)/i.test(unit)) return round2(numeric * 10);
    if (/^(in|inch|inches)/i.test(unit)) return round2(numeric * 25.4);
    return round2(numeric);
  }
  return null;
}

function parseDimensionText(text: string): number[] | null {
  const triplet = text.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm|in|inch|inches|")/i);
  if (triplet) {
    const values = [Number(triplet[1]), Number(triplet[2]), Number(triplet[3])];
    const factor = /^cm$/i.test(triplet[4]) ? 10 : /^(in|inch|inches|")$/i.test(triplet[4]) ? 25.4 : 1;
    return values.map((value) => round2(value * factor));
  }

  const pair = text.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm|in|inch|inches|")/i);
  if (pair) {
    const values = [Number(pair[1]), Number(pair[2])];
    const factor = /^cm$/i.test(pair[3]) ? 10 : /^(in|inch|inches|")$/i.test(pair[3]) ? 25.4 : 1;
    return values.map((value) => round2(value * factor));
  }

  return null;
}

function extractProductMetadata(html: string, baseUrl: string) {
  let title = extractTitle(html);
  let brand: string | null = null;
  let material: string | null = null;
  let materialLabel: string | null = null;
  let widthMm: number | null = null;
  let heightMm: number | null = null;
  let thicknessMm: number | null = null;
  const imageUrls = new Set<string>(extractImageUrls(html, baseUrl));
  const modelUrls = new Set<string>(extractModelUrls(html, baseUrl));

  for (const block of jsonLdBlocks(html)) {
    const parsed = tryParseJson(block);
    for (const record of flattenJsonLd(parsed)) {
      const type = `${record["@type"] ?? ""}`.toLowerCase();
      if (!type.includes("product")) continue;

      title = getString(record.name) ?? title;
      brand = getBrand(record.brand) ?? brand;
      material = getString(record.material) ?? material;
      if (material && !materialLabel) {
        const inferred = inferMaterialFromText(material);
        materialLabel = inferred.materialLabel;
      }

      for (const image of getImageCandidates(record.image)) {
        const resolved = resolveUrl(baseUrl, image);
        if (resolved) imageUrls.add(resolved);
      }

      for (const model of [
        ...getModelCandidates(record.subjectOf),
        ...getModelCandidates(record.associatedMedia),
        ...getModelCandidates(record.hasPart),
        ...getModelCandidates(record.isRelatedTo),
      ]) {
        const resolved = resolveUrl(baseUrl, model);
        if (resolved) modelUrls.add(resolved);
      }

      widthMm = parseQuantitativeMm(record.width) ?? widthMm;
      heightMm = parseQuantitativeMm(record.height) ?? heightMm;
      thicknessMm = parseQuantitativeMm(record.depth) ?? parseQuantitativeMm(record.thickness) ?? thicknessMm;

      const description = getString(record.description);
      if (description) {
        const parsedDims = parseDimensionText(description);
        if (parsedDims?.length === 3) {
          widthMm = widthMm ?? parsedDims[0];
          heightMm = heightMm ?? parsedDims[1];
          thicknessMm = thicknessMm ?? parsedDims[2];
        } else if (parsedDims?.length === 2) {
          widthMm = widthMm ?? parsedDims[0];
          heightMm = heightMm ?? parsedDims[1];
        }
      }
    }
  }

  const freeformDims = parseDimensionText(html.slice(0, 18000));
  if (freeformDims?.length === 3) {
    widthMm = widthMm ?? freeformDims[0];
    heightMm = heightMm ?? freeformDims[1];
    thicknessMm = thicknessMm ?? freeformDims[2];
  } else if (freeformDims?.length === 2) {
    widthMm = widthMm ?? freeformDims[0];
    heightMm = heightMm ?? freeformDims[1];
  }

  return {
    title,
    brand,
    material,
    materialLabel,
    widthMm,
    heightMm,
    thicknessMm,
    imageUrls: [...imageUrls],
    modelUrls: [...modelUrls],
  };
}

function sourceKindForUrl(url: string): TumblerSourceLink["kind"] {
  if (/amazon\.com|walmart\.com|dickssportinggoods\.com|academy\.com|gunmagwarehouse\.com/i.test(url)) {
    return "retailer";
  }
  return "general";
}

async function fetchPage(url: string): Promise<{ html: string; finalUrl: string }> {
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; lt316-admin/1.0)" },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(`Lookup fetch failed (${response.status})`);
  }

  const html = await response.text();
  return { html, finalUrl: response.url || url };
}

export async function lookupFlatItem(args: {
  lookupInput: string;
}): Promise<FlatItemLookupResponse> {
  const lookupInput = args.lookupInput.trim();
  let resolvedUrl: string | null = null;
  let title: string | null = null;
  let brand: string | null = null;
  let imageUrls: string[] = [];
  let imageUrl: string | null = null;
  let modelUrls: string[] = [];
  let widthMm: number | null = null;
  let heightMm: number | null = null;
  let thicknessMm: number | null = null;
  let material: string | null = null;
  let materialLabel: string | null = null;
  let sources: TumblerSourceLink[] = [];
  const notes: string[] = [];

  const fallbackText = extractLookupText(lookupInput);
  let lookupText = fallbackText;

  if (isLikelyUrl(lookupInput)) {
    try {
      const { html, finalUrl } = await fetchPage(lookupInput);
      resolvedUrl = finalUrl;
      const metadata = extractProductMetadata(html, finalUrl);
      title = metadata.title;
      brand = metadata.brand;
      imageUrls = metadata.imageUrls;
      imageUrl = metadata.imageUrls[0] ?? null;
      modelUrls = metadata.modelUrls;
      widthMm = metadata.widthMm;
      heightMm = metadata.heightMm;
      thicknessMm = metadata.thicknessMm;
      material = metadata.material;
      materialLabel = metadata.materialLabel;
      lookupText = [fallbackText, metadata.title, metadata.brand, metadata.material].filter(Boolean).join(" ");
      sources = [{ title: metadata.title ?? finalUrl, url: finalUrl, kind: sourceKindForUrl(finalUrl) }];
      if (widthMm && heightMm) {
        notes.push("Parsed structured or page dimensions from the product page.");
      }
    } catch (error) {
      resolvedUrl = lookupInput;
      title = fallbackText;
      lookupText = fallbackText;
      sources = [{ title: fallbackText, url: lookupInput, kind: "general" }];
      notes.push(
        error instanceof Error
          ? `${error.message}. Falling back to text-only matching.`
          : "Lookup fetch failed. Falling back to text-only matching.",
      );
    }
  }

  let match = findFlatItemLookupMatch(`${lookupText} ${material ?? ""}`);
  if (!match && (widthMm || heightMm)) {
    match = buildMetadataFallbackItem({
      label: (title ?? fallbackText) || "Resolved flat item",
      inputText: lookupText,
      widthMm,
      heightMm,
      thicknessMm,
      material,
      materialLabel,
    });
  }
  if (!match) {
    match = buildMetadataFallbackItem({
      label: (title ?? fallbackText) || "Flat item",
      inputText: lookupText,
      widthMm: null,
      heightMm: null,
      thicknessMm: null,
      material,
      materialLabel,
    });
  }

  let glbPath = "";
  let modelStrategy: FlatItemLookupResponse["modelStrategy"] = "family-generated";
  let modelSourceUrl: string | null = null;
  let requiresReview = false;
  let isProxy = false;
  let traceScore: number | null = null;
  let traceDebug: FlatItemLookupResponse["traceDebug"] = null;

  const downloadedModel = modelUrls.length > 0
    ? await ensureDownloadedFlatItemModel({
        modelUrls,
        label: match.item.label,
      })
    : null;

  if (downloadedModel) {
    glbPath = downloadedModel.path;
    modelStrategy = "page-model";
    modelSourceUrl = downloadedModel.sourceUrl;
    notes.push("Downloaded a source 3D asset exposed by the product page.");
  } else {
    const tracedModel = imageUrls.length > 0
      ? await ensureTracedFlatItemGlb({
          imageUrls,
          widthMm: match.item.widthMm,
          heightMm: match.item.heightMm,
          thicknessMm: match.item.thicknessMm,
          material: match.item.material,
          label: match.item.label,
        })
      : null;

    traceDebug = tracedModel?.traceDebug ?? null;

    if (tracedModel?.path) {
      glbPath = tracedModel.path;
      modelStrategy = "image-trace";
      modelSourceUrl = tracedModel.sourceUrl;
      requiresReview = true;
      traceScore = tracedModel.traceScore;
      notes.push(`Traced the product silhouette from a pulled product image (quality ${round2(tracedModel.traceScore ?? 0)}).`);
    } else {
      glbPath = await ensureGeneratedFlatItemGlb({
        familyKey: match.familyKey,
        widthMm: match.item.widthMm,
        heightMm: match.item.heightMm,
        thicknessMm: match.item.thicknessMm,
        material: match.item.material,
        label: match.item.label,
      });
      requiresReview = true;
      isProxy = true;
      notes.push(
        imageUrls.length > 0
          ? "No pulled product image cleared the trace quality threshold, so the app fell back to the family shape generator."
          : "No source model or usable product image was available, so the app fell back to the family shape generator.",
      );
    }
  }

  return {
    lookupInput,
    resolvedUrl,
    title,
    brand,
    label: match.item.label,
    matchedItemId: match.mode === "catalog-match" ? match.item.id : null,
    familyKey: match.familyKey,
    category: match.item.category,
    widthMm: match.item.widthMm,
    heightMm: match.item.heightMm,
    thicknessMm: match.item.thicknessMm,
    material: match.item.material,
    materialLabel: match.item.materialLabel,
    imageUrl,
    imageUrls,
    glbPath,
    modelStrategy,
    modelSourceUrl,
    requiresReview,
    isProxy,
    traceScore,
    traceDebug,
    confidence: match.confidence,
    mode: match.mode,
    notes: [
      ...notes,
      `Resolved 3D model: ${glbPath}.`,
      match.item.notes ?? "",
    ].filter(Boolean),
    sources,
  };
}
