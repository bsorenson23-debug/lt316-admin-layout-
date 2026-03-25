import {
  findTumblerProfileIdForBrandModel,
  getProfileHandleArcDeg,
  getTumblerProfileById,
  KNOWN_TUMBLER_PROFILES,
} from "@/data/tumblerProfiles";
import type { TumblerSourceLink } from "@/types/tumblerAutoSize";
import type {
  TumblerItemLookupDimensions,
  TumblerItemLookupResponse,
} from "@/types/tumblerItemLookup";

const IMAGE_META_NAMES = [
  "og:image",
  "og:image:url",
  "twitter:image",
  "twitter:image:src",
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
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
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

  for (const metaName of IMAGE_META_NAMES) {
    const value = extractMetaContent(html, metaName);
    const resolved = resolveUrl(baseUrl, value);
    if (resolved) urls.add(resolved);
  }

  const ldImagePattern = /"image"\s*:\s*(?:"([^"]+)"|\[\s*"([^"]+)")/gi;
  for (const match of html.matchAll(ldImagePattern)) {
    const resolved = resolveUrl(baseUrl, decodeHtml(match[1] ?? match[2] ?? ""));
    if (resolved) urls.add(resolved);
    if (urls.size >= 6) break;
  }

  return [...urls];
}

function parseTripletDimensionsMm(text: string): TumblerItemLookupDimensions | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:in|")/i);
  if (!match) return null;

  const valuesIn = [Number(match[1]), Number(match[2]), Number(match[3])].filter(Number.isFinite);
  if (valuesIn.length !== 3) return null;

  const valuesMm = valuesIn.map((value) => value * 25.4).sort((a, b) => a - b);
  const horizontalA = valuesMm[0];
  const horizontalB = valuesMm[1];
  const overallHeightMm = valuesMm[2];
  const horizontalDelta = Math.abs(horizontalA - horizontalB);
  const isStraight = horizontalDelta <= 3;

  return {
    overallHeightMm: round2(overallHeightMm),
    outsideDiameterMm: isStraight ? round2((horizontalA + horizontalB) / 2) : null,
    topDiameterMm: isStraight ? null : round2(horizontalB),
    bottomDiameterMm: isStraight ? null : round2(horizontalA),
    usableHeightMm: round2(overallHeightMm * 0.78),
  };
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

function pickFallbackGlbPath(args: {
  matchedProfileId: string | null;
  capacityOz: number | null;
  brand: string | null;
  model: string | null;
  hasHandle: boolean | null;
}): string {
  if (args.matchedProfileId === "yeti-rambler-40") {
    return "/models/templates/yeti-40oz-body.glb";
  }
  if (
    args.brand === "Stanley" &&
    /iceflow/i.test(args.model ?? "") &&
    args.capacityOz === 30
  ) {
    return "/models/templates/tumbler-30oz.glb";
  }
  if (args.capacityOz != null && args.capacityOz <= 20) {
    return "/models/templates/tumbler-20oz-skinny.glb";
  }
  return "/models/templates/tumbler-30oz.glb";
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

  let lookupText = lookupInput;

  if (isLikelyUrl(lookupInput)) {
    const { html, finalUrl } = await fetchPage(lookupInput);
    resolvedUrl = finalUrl;
    title = extractTitle(html);
    imageUrls = extractImageUrls(html, finalUrl);
    lookupText = [lookupInput, title, html.slice(0, 12_000)].filter(Boolean).join(" ");

    if (/stanley1913\.com/i.test(finalUrl)) sourceKind = "official";
    else if (/academy\.com/i.test(finalUrl)) sourceKind = "retailer";
    else if (/amazon\.com|walmart\.com|dickssportinggoods\.com/i.test(finalUrl)) sourceKind = "retailer";

    sources = buildSources(finalUrl, sourceKind, title);
    scrapedDims = parseTripletDimensionsMm(lookupText);
    if (scrapedDims?.overallHeightMm) {
      notes.push("Parsed page dimensions from the product page text.");
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

    return {
      lookupInput,
      resolvedUrl,
      title,
      brand: matchedProfile.brand,
      model: matchedProfile.model,
      capacityOz: matchedProfile.capacityOz,
      matchedProfileId: matchedProfile.id,
      glbPath: pickFallbackGlbPath({
        matchedProfileId: matchedProfile.id,
        capacityOz: matchedProfile.capacityOz,
        brand: matchedProfile.brand,
        model: matchedProfile.model,
        hasHandle: matchedProfile.hasHandle,
      }),
      imageUrl: imageUrls[0] ?? null,
      imageUrls,
      dimensions: {
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
      ],
      sources,
    };
  }

  const safeDims = scrapedDims ?? {
    overallHeightMm: null,
    outsideDiameterMm: null,
    topDiameterMm: null,
    bottomDiameterMm: null,
    usableHeightMm: null,
  };

  if (!scrapedDims) {
    notes.push("No exact profile match or parseable product dimensions found. Using safe tumbler fallback values.");
  }

  return {
    lookupInput,
    resolvedUrl,
    title,
    brand,
    model,
    capacityOz,
    matchedProfileId: null,
    glbPath: pickFallbackGlbPath({
      matchedProfileId: null,
      capacityOz,
      brand,
      model,
      hasHandle: brand === "Stanley" ? true : null,
    }),
    imageUrl: imageUrls[0] ?? null,
    imageUrls,
    dimensions: {
      overallHeightMm: safeDims.overallHeightMm,
      outsideDiameterMm: safeDims.outsideDiameterMm,
      topDiameterMm: safeDims.topDiameterMm,
      bottomDiameterMm: safeDims.bottomDiameterMm,
      usableHeightMm: safeDims.usableHeightMm,
    },
    mode: scrapedDims ? "parsed-page" : "safe-fallback",
    notes,
    sources,
  };
}
