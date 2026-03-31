import {
  findTumblerProfileIdForBrandModel,
  getProfileHandleArcDeg,
  getTumblerProfileById,
  KNOWN_TUMBLER_PROFILES,
} from "@/data/tumblerProfiles";
import type { TumblerSourceLink } from "@/types/tumblerAutoSize";
import type {
  TumblerItemLookupFitDebug,
  TumblerItemLookupDimensions,
  TumblerItemLookupResponse,
} from "@/types/tumblerItemLookup";
import { access } from "node:fs/promises";
import path from "node:path";
import { ensureGeneratedTumblerGlb } from "@/server/tumbler/generateTumblerModel";

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

const PRODUCT_IMAGE_BACK_TOKENS = [
  "back",
  "rear",
  "reverse",
  "opposite",
  "alt",
  "alternate",
  "secondary",
  "other-side",
  "backside",
];

type HandleOrientation = "left" | "right" | "none" | "unknown";

interface ProductImageCandidateAnalysis {
  url: string;
  lexicalScore: number;
  metadataScore: number;
  totalScore: number;
  width: number;
  height: number;
  orientation: HandleOrientation;
  orientationStrength: number;
  bodyMarkScore: number;
}

interface ProductImagePairSelection {
  primaryImageUrl: string | null;
  backImageUrl: string | null;
}

interface ForegroundGeometry {
  rowBounds: Array<{ left: number; right: number } | null>;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  bboxWidth: number;
  bboxHeight: number;
  isForeground: (x: number, y: number) => boolean;
}

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

function buildLookupTextFromUrl(input: string): string {
  try {
    const url = new URL(input);
    const slug = safeDecodeUri(url.pathname)
      .split("/")
      .filter(Boolean)
      .at(-1)
      ?.replace(/\.[a-z0-9]+$/i, "")
      ?.replace(/[-_]+/g, " ")
      ?.replace(/\s+/g, " ")
      ?.trim();
    return slug || url.hostname.replace(/^www\./i, "");
  } catch {
    return input;
  }
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

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
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

function scoreBackImageCandidateUrl(url: string): number {
  const normalizedUrl = normalizeText(safeDecodeUri(url));
  let score = 0;

  for (const token of PRODUCT_IMAGE_BACK_TOKENS) {
    if (normalizedUrl.includes(token)) score += 2.5;
  }

  if (/\bside\b/.test(normalizedUrl)) score += 1.25;
  return score;
}

function sampleRgba(data: Buffer, width: number, x: number, y: number) {
  const index = (y * width + x) * 4;
  return {
    r: data[index] ?? 0,
    g: data[index + 1] ?? 0,
    b: data[index + 2] ?? 0,
    a: data[index + 3] ?? 0,
  };
}

function rgbaDistance(
  left: { r: number; g: number; b: number; a: number },
  right: { r: number; g: number; b: number; a: number },
): number {
  return Math.hypot(
    left.r - right.r,
    left.g - right.g,
    left.b - right.b,
    (left.a - right.a) * 0.75,
  );
}

function buildBackgroundSamples(data: Buffer, width: number, height: number) {
  const points = [
    [0, 0],
    [Math.max(0, width - 1), 0],
    [0, Math.max(0, height - 1)],
    [Math.max(0, width - 1), Math.max(0, height - 1)],
    [Math.floor(width / 2), 0],
    [Math.floor(width / 2), Math.max(0, height - 1)],
    [0, Math.floor(height / 2)],
    [Math.max(0, width - 1), Math.floor(height / 2)],
  ];

  return points.map(([x, y]) => sampleRgba(data, width, x, y));
}

function buildForegroundDetector(data: Buffer, width: number, height: number) {
  const backgroundSamples = buildBackgroundSamples(data, width, height);
  const hasTransparentBackground = backgroundSamples.some((sample) => sample.a <= 20);

  return (x: number, y: number) => {
    const pixel = sampleRgba(data, width, x, y);
    if (pixel.a <= 20) return false;
    if (hasTransparentBackground && pixel.a >= 140) return true;

    let minDistance = Number.POSITIVE_INFINITY;
    for (const background of backgroundSamples) {
      minDistance = Math.min(minDistance, rgbaDistance(pixel, background));
    }

    return minDistance >= 24;
  };
}

function measureForegroundGeometry(
  data: Buffer,
  width: number,
  height: number,
): ForegroundGeometry | null {
  if (width < 24 || height < 48) {
    return null;
  }

  const isForeground = buildForegroundDetector(data, width, height);
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;

  const rowBounds: Array<{ left: number; right: number } | null> = Array.from({ length: height }, () => null);

  for (let y = 0; y < height; y += 1) {
    let left = -1;
    let right = -1;
    for (let x = 0; x < width; x += 1) {
      if (!isForeground(x, y)) continue;
      if (left === -1) left = x;
      right = x;
    }
    if (left === -1 || right === -1) continue;

    rowBounds[y] = { left, right };
    minX = Math.min(minX, left);
    maxX = Math.max(maxX, right);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  if (maxX <= minX || maxY <= minY) {
    return null;
  }

  return {
    rowBounds,
    minX,
    maxX,
    minY,
    maxY,
    bboxWidth: maxX - minX + 1,
    bboxHeight: maxY - minY + 1,
    isForeground,
  };
}

function averageEdgesForGeometry(
  geometry: ForegroundGeometry,
  startPct: number,
  endPct: number,
) {
  const minRowWidth = Math.max(6, geometry.bboxWidth * 0.22);
  const start = geometry.minY + Math.floor(geometry.bboxHeight * startPct);
  const end = geometry.minY + Math.floor(geometry.bboxHeight * endPct);
  let leftSum = 0;
  let rightSum = 0;
  let count = 0;

  for (let y = start; y <= end && y < geometry.rowBounds.length; y += 1) {
    const bounds = geometry.rowBounds[y];
    if (!bounds) continue;
    if ((bounds.right - bounds.left + 1) < minRowWidth) continue;
    leftSum += bounds.left;
    rightSum += bounds.right;
    count += 1;
  }

  if (count === 0) return null;
  return {
    left: leftSum / count,
    right: rightSum / count,
    count,
  };
}

function detectHandleOrientationFromGeometry(
  geometry: ForegroundGeometry,
): { orientation: HandleOrientation; strength: number } {
  const handleEdges = averageEdgesForGeometry(geometry, 0.18, 0.58);
  const bodyEdges = averageEdgesForGeometry(geometry, 0.62, 0.92);
  if (!handleEdges || !bodyEdges) {
    return { orientation: "unknown", strength: 0 };
  }

  const leftProtrusion = bodyEdges.left - handleEdges.left;
  const rightProtrusion = handleEdges.right - bodyEdges.right;
  const threshold = Math.max(5, geometry.bboxWidth * 0.045);
  const delta = Math.abs(leftProtrusion - rightProtrusion);
  const maxProtrusion = Math.max(leftProtrusion, rightProtrusion);

  if (maxProtrusion < threshold) {
    return { orientation: "none", strength: clamp(maxProtrusion / Math.max(1, geometry.bboxWidth * 0.12)) };
  }

  if (delta < threshold * 0.45) {
    return { orientation: "unknown", strength: clamp(delta / Math.max(1, geometry.bboxWidth * 0.12)) };
  }

  return {
    orientation: rightProtrusion > leftProtrusion ? "right" : "left",
    strength: clamp(delta / Math.max(1, geometry.bboxWidth * 0.18)),
  };
}

function scoreBodyMarkPresence(
  data: Buffer,
  width: number,
  geometry: ForegroundGeometry,
): number {
  const upperBodyEdges = averageEdgesForGeometry(geometry, 0.12, 0.46);
  if (!upperBodyEdges) return 0;

  const bodyWidth = upperBodyEdges.right - upperBodyEdges.left + 1;
  const centerX = (upperBodyEdges.left + upperBodyEdges.right) / 2;
  const sampleHalfWidth = Math.max(10, bodyWidth * 0.2);
  const sampleLeft = Math.max(0, Math.floor(centerX - sampleHalfWidth));
  const sampleRight = Math.min(width - 2, Math.ceil(centerX + sampleHalfWidth));
  const sampleTop = Math.max(0, Math.floor(geometry.minY + geometry.bboxHeight * 0.12));
  const sampleBottom = Math.min(
    geometry.rowBounds.length - 2,
    Math.ceil(geometry.minY + geometry.bboxHeight * 0.4),
  );

  let comparisons = 0;
  let edgeHits = 0;
  let luminanceSum = 0;
  let luminanceSqSum = 0;
  let sampleCount = 0;

  for (let y = sampleTop; y <= sampleBottom; y += 1) {
    for (let x = sampleLeft; x <= sampleRight; x += 1) {
      if (!geometry.isForeground(x, y)) continue;

      const pixel = sampleRgba(data, width, x, y);
      const luminance = pixel.r * 0.2126 + pixel.g * 0.7152 + pixel.b * 0.0722;
      luminanceSum += luminance;
      luminanceSqSum += luminance * luminance;
      sampleCount += 1;

      if (x + 1 <= sampleRight && geometry.isForeground(x + 1, y)) {
        const neighbor = sampleRgba(data, width, x + 1, y);
        const diff = Math.abs(luminance - (neighbor.r * 0.2126 + neighbor.g * 0.7152 + neighbor.b * 0.0722));
        comparisons += 1;
        if (diff >= 18) edgeHits += 1;
      }
      if (y + 1 <= sampleBottom && geometry.isForeground(x, y + 1)) {
        const neighbor = sampleRgba(data, width, x, y + 1);
        const diff = Math.abs(luminance - (neighbor.r * 0.2126 + neighbor.g * 0.7152 + neighbor.b * 0.0722));
        comparisons += 1;
        if (diff >= 18) edgeHits += 1;
      }
    }
  }

  if (sampleCount < 40 || comparisons === 0) return 0;

  const mean = luminanceSum / sampleCount;
  const variance = Math.max(0, luminanceSqSum / sampleCount - mean * mean);
  const stddev = Math.sqrt(variance);
  const edgeDensity = edgeHits / comparisons;

  return clamp(edgeDensity * 14 + stddev / 34, 0, 1.2);
}

async function analyzeProductImageCandidate(
  url: string,
  lookupText: string,
): Promise<ProductImageCandidateAnalysis | null> {
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
    const image = sharp(buffer, { failOn: "none", limitInputPixels: false }).rotate().ensureAlpha();
    const meta = await image.metadata();
    if (!meta.width || !meta.height) return null;

    const rendered = await image
      .clone()
      .resize({ width: 320, height: 480, fit: "inside", withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const geometry = measureForegroundGeometry(
      rendered.data,
      rendered.info.width,
      rendered.info.height,
    );
    const orientation = geometry
      ? detectHandleOrientationFromGeometry(geometry)
      : { orientation: "unknown" as HandleOrientation, strength: 0 };
    const bodyMarkScore = geometry
      ? scoreBodyMarkPresence(rendered.data, rendered.info.width, geometry)
      : 0;
    const lexicalScore = scoreImageCandidateUrl(url, lookupText);
    const metadataScore = scoreImageMetadata({ width: meta.width, height: meta.height });

    return {
      url,
      lexicalScore,
      metadataScore,
      totalScore: lexicalScore + metadataScore + (orientation.strength * 1.35) + (bodyMarkScore * 0.75),
      width: meta.width,
      height: meta.height,
      orientation: orientation.orientation,
      orientationStrength: orientation.strength,
      bodyMarkScore,
    };
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

function getOppositeOrientation(orientation: HandleOrientation): HandleOrientation {
  if (orientation === "left") return "right";
  if (orientation === "right") return "left";
  return "unknown";
}

function chooseBackImageCandidate(
  primary: ProductImageCandidateAnalysis,
  candidates: ProductImageCandidateAnalysis[],
): string | null {
  const oppositeOrientation = getOppositeOrientation(primary.orientation);

  const ranked = candidates
    .filter((candidate) => candidate.url !== primary.url)
    .map((candidate) => {
      const score = candidate.totalScore;
      const backTokenScore = scoreBackImageCandidateUrl(candidate.url);
      let evidenceScore = backTokenScore;
      const logoDrop = primary.bodyMarkScore - candidate.bodyMarkScore;

      if (
        (oppositeOrientation === "left" || oppositeOrientation === "right") &&
        candidate.orientation === oppositeOrientation
      ) {
        evidenceScore += 5 + candidate.orientationStrength * 4;
      } else if (
        (primary.orientation === "left" || primary.orientation === "right") &&
        candidate.orientation === primary.orientation
      ) {
        evidenceScore -= 2.5;
      } else if (candidate.orientation === "left" || candidate.orientation === "right") {
        evidenceScore += 1 + candidate.orientationStrength * 2;
      }

      if (Math.abs(candidate.width - primary.width) <= primary.width * 0.45) {
        evidenceScore += 0.6;
      }

      if (logoDrop >= 0.08) {
        evidenceScore += 2 + logoDrop * 6;
      } else if (logoDrop <= -0.06) {
        evidenceScore -= 2 + Math.abs(logoDrop) * 4;
      }

      return {
        url: candidate.url,
        score: score + evidenceScore,
        backTokenScore,
        evidenceScore,
        logoDrop,
        hasOppositeOrientation:
          (oppositeOrientation === "left" || oppositeOrientation === "right") &&
          candidate.orientation === oppositeOrientation,
      };
    })
    .sort((left, right) => right.score - left.score);

  const best = ranked[0];
  if (!best) return null;

  const hasStrongEvidence =
    best.hasOppositeOrientation ||
    best.backTokenScore >= 2.5 ||
    best.evidenceScore >= 3.4 ||
    best.logoDrop >= 0.12;

  return hasStrongEvidence ? best.url : null;
}

async function selectProductImagePair(args: {
  imageUrls: string[];
  lookupText: string;
}): Promise<ProductImagePairSelection> {
  if (args.imageUrls.length === 0) {
    return { primaryImageUrl: null, backImageUrl: null };
  }

  const lexicalRanked = args.imageUrls
    .map((url) => ({
      url,
      lexicalScore: scoreImageCandidateUrl(url, args.lookupText),
    }))
    .sort((left, right) => right.lexicalScore - left.lexicalScore);

  const probeCandidates = lexicalRanked.slice(0, 6);
  const analyses = (
    await Promise.all(
      probeCandidates.map((candidate) => analyzeProductImageCandidate(candidate.url, args.lookupText)),
    )
  ).filter((candidate): candidate is ProductImageCandidateAnalysis => Boolean(candidate))
    .sort((left, right) => right.totalScore - left.totalScore);

  if (analyses.length === 0) {
    return {
      primaryImageUrl: lexicalRanked[0]?.url ?? null,
      backImageUrl: null,
    };
  }

  const primary = analyses[0];
  return {
    primaryImageUrl: primary.url,
    backImageUrl: chooseBackImageCandidate(primary, analyses),
  };
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
  let selectedBackImageUrl: string | null = null;

  let lookupText = lookupInput;

  if (isLikelyUrl(lookupInput)) {
    try {
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
      const selectedImages = await selectProductImagePair({
        imageUrls,
        lookupText,
      });
      selectedImageUrl = selectedImages.primaryImageUrl;
      selectedBackImageUrl = selectedImages.backImageUrl;
      if (scrapedDims?.overallHeightMm) {
        notes.push("Parsed page dimensions from the product page text.");
      }
      if (selectedImageUrl && selectedImageUrl !== imageUrls[0]) {
        notes.push("Selected the strongest product photo from the scraped page images.");
      }
      if (selectedBackImageUrl) {
        notes.push("Detected an opposite-side product photo from the scraped gallery.");
      }
    } catch (error) {
      resolvedUrl = lookupInput;
      title = buildLookupTextFromUrl(lookupInput);
      lookupText = [lookupInput, title].filter(Boolean).join(" ");
      sources = buildSources(lookupInput, "general", title);
      notes.push(
        error instanceof Error
          ? `${error.message}. Falling back to URL text only.`
          : "Lookup fetch failed. Falling back to URL text only.",
      );
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
      backImageUrl: selectedBackImageUrl,
      imageUrls,
      fitDebug: fallbackAsset.fitDebug,
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
        `GLB fallback: ${fallbackAsset.glbPath || "none available locally"}.`,
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
    backImageUrl: selectedBackImageUrl,
    imageUrls,
    fitDebug: fallbackAsset.fitDebug,
    dimensions: {
      overallHeightMm: safeDims.overallHeightMm,
      outsideDiameterMm: safeDims.outsideDiameterMm,
      topDiameterMm: safeDims.topDiameterMm,
      bottomDiameterMm: safeDims.bottomDiameterMm,
      usableHeightMm: safeDims.usableHeightMm,
    },
    mode: scrapedDims ? "parsed-page" : "safe-fallback",
    notes: [
      ...notes,
      `GLB fallback: ${fallbackAsset.glbPath || "none available locally"}.`,
    ],
    sources,
  };
}
