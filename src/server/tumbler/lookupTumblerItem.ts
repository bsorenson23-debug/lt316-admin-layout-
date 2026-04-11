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
import type {
  ProductReferenceImage,
  ProductReferenceImageSource,
  ProductReferenceLogoBox,
  ProductReferenceSet,
  ProductReferenceViewClass,
} from "@/types/productTemplate";
import { access, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { ensureGeneratedTumblerGlb } from "@/server/tumbler/generateTumblerModel";
import type { TumblerModelStatus } from "@/types/tumblerItemLookup";
import { normalizeProductLookupUrl } from "@/lib/normalizeProductLookupUrl";

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

const STANLEY_FETCH_HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
} as const;

const GENERIC_FETCH_HEADERS = {
  "user-agent": "Mozilla/5.0 (compatible; lt316-admin/1.0)",
} as const;

const LOOKUP_FETCH_RETRY_LIMIT = 4;

type HandleOrientation = "left" | "right" | "none" | "unknown";

interface ProductImageCandidateAnalysis {
  id: string;
  url: string;
  source: ProductReferenceImageSource;
  hash: string;
  perceptualHash: string;
  lexicalScore: number;
  metadataScore: number;
  totalScore: number;
  width: number;
  height: number;
  orientation: HandleOrientation;
  orientationStrength: number;
  bodyMarkScore: number;
  logoDetected: boolean;
  logoBox?: ProductReferenceLogoBox;
  bodyCoverage: number;
  viewClass: ProductReferenceViewClass;
  approxAzimuthDeg?: 0 | 45 | 90 | 135 | 180;
  handleVisible: boolean;
  handleSide: ProductReferenceImage["handleSide"];
  confidence: number;
  detailScore: number;
  lifestyleScore: number;
}

interface ProductImagePairSelection {
  primaryImageUrl: string | null;
  backImageUrl: string | null;
  analyses: ProductImageCandidateAnalysis[];
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
    if (
      normalized.includes("quencher") ||
      normalized.includes("flowstate") ||
      normalized.includes("h2 0") ||
      normalized.includes("h2o") ||
      normalized.includes("h2.0")
    ) {
      return capacityOz ? `Quencher H2.0 ${capacityOz}oz` : "Quencher H2.0";
    }
    if (
      normalized.includes("protour") ||
      normalized.includes("pro tour") ||
      (
        normalized.includes("travel tumbler") &&
        normalized.includes("flip straw")
      )
    ) {
      return capacityOz ? `ProTour Travel Tumbler ${capacityOz}oz` : "ProTour Travel Tumbler";
    }
    if (normalized.includes("iceflow")) {
      return capacityOz ? `IceFlow Flip Straw ${capacityOz}oz` : "IceFlow Flip Straw";
    }
  }
  if (brand === "YETI" && normalized.includes("rambler")) {
    return capacityOz ? `Rambler ${capacityOz}oz` : "Rambler";
  }
  return null;
}

function inferStanleyFamilySignal(args: {
  lookupText: string;
  analyses: ProductImageCandidateAnalysis[];
}): "quencher" | "protour" | "iceflow" | null {
  const normalized = normalizeText(
    [args.lookupText, ...args.analyses.map((analysis) => analysis.url)].join(" ")
  );
  if (/(quencher|flowstate|h2 0|h2o|h2\.0)/.test(normalized)) return "quencher";
  if (/(protour|pro tour)/.test(normalized)) return "protour";
  if (/iceflow/.test(normalized)) return "iceflow";
  return null;
}

function resolveStanleyProfileFromSignal(args: {
  family: "quencher" | "protour" | "iceflow";
  capacityOz: number | null;
}) {
  if (args.family === "protour") {
    return getTumblerProfileById("stanley-protour-40");
  }

  if (args.family === "iceflow") {
    return null;
  }

  if (args.capacityOz === 20) return getTumblerProfileById("stanley-quencher-20");
  if (args.capacityOz === 30) return getTumblerProfileById("stanley-quencher-30");
  if (args.capacityOz === 64) return getTumblerProfileById("stanley-quencher-64");
  return getTumblerProfileById("stanley-quencher-40");
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

function getImageUrlDedupKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.searchParams.delete("width");
    parsed.searchParams.delete("height");
    parsed.searchParams.delete("crop");
    parsed.searchParams.delete("amp;width");
    parsed.searchParams.delete("amp;height");
    return parsed.toString();
  } catch {
    return url;
  }
}

function getImageUrlRequestedWidth(url: string): number {
  try {
    const parsed = new URL(url);
    const width = Number.parseInt(
      parsed.searchParams.get("width") ??
      parsed.searchParams.get("amp;width") ??
      "",
      10,
    );
    return Number.isFinite(width) ? width : 0;
  } catch {
    return 0;
  }
}

interface ImageUrlCandidateHints {
  stem: string;
  hasFront: boolean;
  hasBack: boolean;
  hasDetail: boolean;
  hasHero: boolean;
  hasSide: boolean;
  hasHandle: boolean;
}

function describeImageCandidateUrl(url: string): ImageUrlCandidateHints {
  let basename = safeDecodeUri(url);
  try {
    const parsed = new URL(url);
    basename = safeDecodeUri(parsed.pathname.split("/").filter(Boolean).at(-1) ?? url);
  } catch {
    basename = safeDecodeUri(
      url
        .split("?")[0]
        .split("/")
        .filter(Boolean)
        .at(-1) ?? url,
    );
  }
  basename = basename.replace(/\.[a-z0-9]+$/i, "");
  const normalizedBasename = normalizeText(basename);
  const tokens = normalizedBasename.split(" ").filter(Boolean);
  const tokenSet = new Set(tokens);

  const hasFront = tokenSet.has("front");
  const hasBack = tokenSet.has("back") || tokenSet.has("rear") || tokenSet.has("reverse") || tokenSet.has("backside");
  const hasDetail = tokenSet.has("detail") || tokenSet.has("lid") || tokenSet.has("closeup") || tokenSet.has("close");
  const hasHero = tokenSet.has("hero") || tokenSet.has("main") || tokenSet.has("primary");
  const hasSide = tokenSet.has("side") || tokenSet.has("profile");
  const hasHandle = tokenSet.has("handle");

  const stem = tokens
    .filter((token) => ![
      "web", "png", "jpg", "jpeg", "webp", "avif", "square", "hero", "front", "back",
      "rear", "reverse", "detail", "lid", "side", "profile", "main", "primary",
      "secondary", "gallery", "image", "images", "zoom", "grande", "large", "small",
    ].includes(token))
    .join(" ")
    .trim();

  return {
    stem,
    hasFront,
    hasBack,
    hasDetail,
    hasHero,
    hasSide,
    hasHandle,
  };
}

function extractImageUrls(html: string, baseUrl: string): string[] {
  const urls = new Map<string, { url: string; priority: number; order: number; requestedWidth: number }>();
  let order = 0;
  const addUrl = (value: string | null | undefined, priority: number) => {
    const resolved = resolveUrl(baseUrl, decodeHtml(value ?? ""));
    if (!resolved) return;
    if (!/\.(?:png|jpe?g|webp|avif)(?:[?#].*)?$/i.test(resolved)) return;
    const dedupKey = getImageUrlDedupKey(resolved);
    const requestedWidth = getImageUrlRequestedWidth(resolved);
    const existing = urls.get(dedupKey);
    if (!existing) {
      urls.set(dedupKey, { url: resolved, priority, order: order++, requestedWidth });
      return;
    }
    if (
      priority < existing.priority ||
      (priority === existing.priority && requestedWidth > existing.requestedWidth)
    ) {
      urls.set(dedupKey, { url: resolved, priority, order: existing.order, requestedWidth });
    }
  };

  for (const match of html.matchAll(/\b(?:data-zoom-src|data-zoom-image|data-image)=["']([^"']+)["']/gi)) {
    addUrl(match[1], 0);
  }

  for (const metaName of IMAGE_META_NAMES) {
    addUrl(extractMetaContent(html, metaName), 2);
  }

  const ldImagePattern = /"image"\s*:\s*(?:"([^"]+)"|\[([\s\S]*?)\])/gi;
  for (const match of html.matchAll(ldImagePattern)) {
    if (match[1]) {
      addUrl(match[1], 1);
      continue;
    }
    const arrayBody = match[2] ?? "";
    for (const item of arrayBody.matchAll(/"([^"]+\.(?:png|jpe?g|webp|avif)(?:\?[^"]*)?)"/gi)) {
      addUrl(item[1], 1);
    }
  }

  for (const match of html.matchAll(/\b(?:srcset|data-srcset)=["']([^"']+)["']/gi)) {
    const candidates = match[1]
      .split(",")
      .map((entry) => entry.trim().split(/\s+/)[0])
      .filter(Boolean);
    for (const candidate of candidates) {
      addUrl(candidate, 3);
    }
  }

  for (const match of html.matchAll(/<(?:img|source)[^>]+(?:src|data-src|data-image|data-zoom-image|data-zoom-src)=["']([^"']+)["']/gi)) {
    addUrl(match[1], 4);
  }

  for (const match of html.matchAll(/\b(?:https?:)?\\?\/\\?\/[^"'\\\s>]+?\.(?:png|jpe?g|webp|avif)(?:\?[^"'\\\s>]*)?/gi)) {
    addUrl(match[0].replace(/^\/\//, "https://"), 5);
  }

  return [...urls.values()]
    .sort((left, right) => left.priority - right.priority || left.order - right.order || right.requestedWidth - left.requestedWidth)
    .map((entry) => entry.url)
    .slice(0, 48);
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

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function slugify(value: string | null | undefined): string {
  const normalized = normalizeText(value);
  return normalized ? normalized.replace(/\s+/g, "-") : "";
}

function sourceFromKind(kind: TumblerSourceLink["kind"]): ProductReferenceImageSource {
  if (kind === "official") return "official";
  if (kind === "retailer") return "retailer";
  return "other";
}

function hammingDistance(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let distance = Math.abs(left.length - right.length);
  for (let index = 0; index < limit; index += 1) {
    if (left[index] !== right[index]) distance += 1;
  }
  return distance;
}

function scoreImageCandidateUrl(url: string, lookupText: string): number {
  const normalizedUrl = normalizeText(safeDecodeUri(url));
  const lookupTokens = tokenizeLookupText(lookupText);
  const hints = describeImageCandidateUrl(url);
  let score = 0;

  for (const token of PRODUCT_IMAGE_BAD_TOKENS) {
    if (normalizedUrl.includes(token)) score -= 6;
  }

  for (const token of PRODUCT_IMAGE_GOOD_TOKENS) {
    if (normalizedUrl.includes(token)) score += 2.5;
  }

  if (hints.hasFront) score += 2.25;
  if (hints.hasBack) score += 2.75;
  if (hints.hasDetail) score += 1.25;
  if (hints.hasHero) score += 0.8;

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

function detectBodyMark(
  data: Buffer,
  width: number,
  geometry: ForegroundGeometry,
): { score: number; box?: ProductReferenceLogoBox } {
  const upperBodyEdges = averageEdgesForGeometry(geometry, 0.12, 0.46);
  if (!upperBodyEdges) return { score: 0 };

  const bodyWidth = upperBodyEdges.right - upperBodyEdges.left + 1;
  const centerX = (upperBodyEdges.left + upperBodyEdges.right) / 2;
  const sampleHalfWidth = Math.max(10, bodyWidth * 0.24);
  const sampleLeft = Math.max(0, Math.floor(centerX - sampleHalfWidth));
  const sampleRight = Math.min(width - 2, Math.ceil(centerX + sampleHalfWidth));
  const sampleTop = Math.max(0, Math.floor(geometry.minY + geometry.bboxHeight * 0.18));
  const sampleBottom = Math.min(
    geometry.rowBounds.length - 2,
    Math.ceil(geometry.minY + geometry.bboxHeight * 0.5),
  );

  let comparisons = 0;
  let edgeHits = 0;
  let luminanceSum = 0;
  let luminanceSqSum = 0;
  let sampleCount = 0;
  let strongMinX = Number.POSITIVE_INFINITY;
  let strongMinY = Number.POSITIVE_INFINITY;
  let strongMaxX = Number.NEGATIVE_INFINITY;
  let strongMaxY = Number.NEGATIVE_INFINITY;

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
        if (diff >= 18) {
          edgeHits += 1;
          strongMinX = Math.min(strongMinX, x);
          strongMaxX = Math.max(strongMaxX, x + 1);
          strongMinY = Math.min(strongMinY, y);
          strongMaxY = Math.max(strongMaxY, y);
        }
      }
      if (y + 1 <= sampleBottom && geometry.isForeground(x, y + 1)) {
        const neighbor = sampleRgba(data, width, x, y + 1);
        const diff = Math.abs(luminance - (neighbor.r * 0.2126 + neighbor.g * 0.7152 + neighbor.b * 0.0722));
        comparisons += 1;
        if (diff >= 18) {
          edgeHits += 1;
          strongMinX = Math.min(strongMinX, x);
          strongMaxX = Math.max(strongMaxX, x);
          strongMinY = Math.min(strongMinY, y);
          strongMaxY = Math.max(strongMaxY, y + 1);
        }
      }
    }
  }

  if (sampleCount < 40 || comparisons === 0) return { score: 0 };

  const mean = luminanceSum / sampleCount;
  const variance = Math.max(0, luminanceSqSum / sampleCount - mean * mean);
  const stddev = Math.sqrt(variance);
  const edgeDensity = edgeHits / comparisons;
  const score = clamp(edgeDensity * 14 + stddev / 34, 0, 1.2);

  if (
    !Number.isFinite(strongMinX) ||
    !Number.isFinite(strongMinY) ||
    strongMaxX - strongMinX < 6 ||
    strongMaxY - strongMinY < 6 ||
    score < 0.24
  ) {
    return { score };
  }

  return {
    score,
    box: {
      x: round2(strongMinX),
      y: round2(strongMinY),
      w: round2(strongMaxX - strongMinX),
      h: round2(strongMaxY - strongMinY),
    },
  };
}

async function computePerceptualHash(buffer: Buffer): Promise<string> {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(buffer, { failOn: "none", limitInputPixels: false })
    .resize(9, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bits: string[] = [];
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width - 1; x += 1) {
      const left = data[y * info.width + x] ?? 0;
      const right = data[y * info.width + x + 1] ?? 0;
      bits.push(left > right ? "1" : "0");
    }
  }

  let output = "";
  for (let index = 0; index < bits.length; index += 4) {
    output += Number.parseInt(bits.slice(index, index + 4).join(""), 2).toString(16);
  }
  return output;
}

function estimateBodyCoverage(geometry: ForegroundGeometry, width: number, height: number): number {
  return clamp((geometry.bboxWidth * geometry.bboxHeight) / Math.max(1, width * height), 0, 1.6);
}

function classifyProductReferenceImage(args: {
  bodyCoverage: number;
  geometry: ForegroundGeometry | null;
  orientation: HandleOrientation;
  orientationStrength: number;
  bodyMarkScore: number;
  logoDetected: boolean;
  urlHints?: ImageUrlCandidateHints;
}): {
  viewClass: ProductReferenceViewClass;
  approxAzimuthDeg?: 0 | 45 | 90 | 135 | 180;
  handleVisible: boolean;
  handleSide: ProductReferenceImage["handleSide"];
  confidence: number;
  detailScore: number;
  lifestyleScore: number;
} {
  const handleVisible = (args.orientation === "left" || args.orientation === "right") && args.orientationStrength >= 0.16;
  const handleSide: ProductReferenceImage["handleSide"] = handleVisible
    ? (args.orientation === "left" || args.orientation === "right" ? args.orientation : "unknown")
    : args.orientation === "none"
      ? "hidden"
      : "unknown";
  const bboxHeightRatio = args.geometry ? args.geometry.bboxHeight / Math.max(1, args.geometry.rowBounds.length) : 0;
  const detailScore = clamp(
    (bboxHeightRatio < 0.62 ? 0.6 : 0) +
    (args.bodyCoverage < 0.16 ? 0.4 : 0) +
    (handleVisible ? 0.12 : 0) +
    (args.urlHints?.hasDetail ? 0.28 : 0),
    0,
    1,
  );
  const lifestyleScore = clamp(
    (args.bodyCoverage < 0.1 ? 0.7 : 0) +
    (!args.geometry ? 0.3 : 0) +
    (bboxHeightRatio < 0.48 ? 0.25 : 0),
    0,
    1,
  );

  if (lifestyleScore >= 0.82) {
    return {
      viewClass: "lifestyle",
      handleVisible,
      handleSide,
      confidence: round3(lifestyleScore),
      detailScore,
      lifestyleScore,
    };
  }

  if (args.urlHints?.hasDetail || detailScore >= 0.9) {
    return {
      viewClass: "detail",
      handleVisible,
      handleSide,
      confidence: round3(Math.max(detailScore, 0.86)),
      detailScore,
      lifestyleScore,
    };
  }

  let viewClass: ProductReferenceViewClass = "unknown";
  let approxAzimuthDeg: 0 | 45 | 90 | 135 | 180 | undefined;
  let confidence = 0.34;

  if (args.urlHints?.hasBack) {
    viewClass = handleVisible ? "back-3q" : "back";
    approxAzimuthDeg = handleVisible ? 135 : 180;
    confidence = 0.72 + args.orientationStrength * 0.12;
  } else if (args.urlHints?.hasFront && args.logoDetected) {
    viewClass = handleVisible ? "front-3q" : "front";
    approxAzimuthDeg = handleVisible ? 45 : 0;
    confidence = 0.76 + args.orientationStrength * 0.1;
  } else if (handleVisible) {
    if (args.logoDetected && args.bodyMarkScore >= 0.32) {
      viewClass = "front-3q";
      approxAzimuthDeg = 45;
      confidence = 0.72 + args.orientationStrength * 0.14;
    } else if (args.bodyMarkScore <= 0.16) {
      viewClass = args.orientationStrength >= 0.48 ? "handle-side" : "back-3q";
      approxAzimuthDeg = args.orientationStrength >= 0.48 ? 90 : 135;
      confidence = 0.58 + args.orientationStrength * 0.16;
    } else {
      viewClass = "handle-side";
      approxAzimuthDeg = 90;
      confidence = 0.5 + args.orientationStrength * 0.18;
    }
  } else if (args.logoDetected && args.bodyMarkScore >= 0.34) {
    viewClass = "front";
    approxAzimuthDeg = 0;
    confidence = 0.72 + Math.min(0.18, args.bodyMarkScore * 0.18);
  } else if (args.bodyMarkScore <= 0.12) {
    viewClass = "back";
    approxAzimuthDeg = 180;
    confidence = 0.54;
  } else {
    viewClass = "unknown";
    confidence = 0.34 + Math.min(0.12, args.bodyMarkScore * 0.1);
  }

  return {
    viewClass,
    approxAzimuthDeg,
    handleVisible,
    handleSide,
    confidence: round3(clamp(confidence, 0, 0.99)),
    detailScore,
    lifestyleScore,
  };
}

async function analyzeProductImageCandidate(
  url: string,
  lookupText: string,
  source: ProductReferenceImageSource,
): Promise<ProductImageCandidateAnalysis | null> {
  try {
    const urlHints = describeImageCandidateUrl(url);
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
    const bodyMark = geometry
      ? detectBodyMark(rendered.data, rendered.info.width, geometry)
      : { score: 0 };
    const bodyCoverage = geometry
      ? estimateBodyCoverage(geometry, rendered.info.width, rendered.info.height)
      : 0;
    const classified = classifyProductReferenceImage({
      bodyCoverage,
      geometry,
      orientation: orientation.orientation,
      orientationStrength: orientation.strength,
      bodyMarkScore: bodyMark.score,
      logoDetected: bodyMark.score >= 0.28,
      urlHints,
    });
    const lexicalScore = scoreImageCandidateUrl(url, lookupText);
    const metadataScore = scoreImageMetadata({ width: meta.width, height: meta.height });
    const hash = createHash("sha1").update(buffer).digest("hex");
    const perceptualHash = await computePerceptualHash(buffer);
    const id = `ref-${hash.slice(0, 12)}`;

    return {
      id,
      url,
      source,
      hash,
      perceptualHash,
      lexicalScore,
      metadataScore,
      totalScore:
        lexicalScore +
        metadataScore +
        (orientation.strength * 1.35) +
        (bodyMark.score * 0.75) +
        (urlHints.hasBack ? 1.1 : 0) +
        (urlHints.hasFront ? 0.9 : 0) +
        (urlHints.hasDetail ? 0.4 : 0),
      width: meta.width,
      height: meta.height,
      orientation: orientation.orientation,
      orientationStrength: orientation.strength,
      bodyMarkScore: bodyMark.score,
      logoDetected: bodyMark.score >= 0.28,
      logoBox: bodyMark.box,
      bodyCoverage,
      viewClass: classified.viewClass,
      approxAzimuthDeg: classified.approxAzimuthDeg,
      handleVisible: classified.handleVisible,
      handleSide: classified.handleSide,
      confidence: classified.confidence,
      detailScore: classified.detailScore,
      lifestyleScore: classified.lifestyleScore,
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

function dedupeProductReferenceAnalyses(
  analyses: ProductImageCandidateAnalysis[],
): ProductImageCandidateAnalysis[] {
  const sorted = [...analyses].sort((left, right) => right.totalScore - left.totalScore);
  const deduped: ProductImageCandidateAnalysis[] = [];

  for (const candidate of sorted) {
    if (candidate.width < 180 || candidate.height < 220) continue;
    const nearDuplicate = deduped.some((existing) => (
      existing.hash === candidate.hash ||
      (
        hammingDistance(existing.perceptualHash, candidate.perceptualHash) <= 3 &&
        Math.abs(existing.width - candidate.width) <= Math.max(20, existing.width * 0.16) &&
        Math.abs(existing.height - candidate.height) <= Math.max(20, existing.height * 0.16)
      )
    ));
    if (!nearDuplicate) {
      deduped.push(candidate);
    }
  }

  return deduped.slice(0, 8);
}

function toProductReferenceImage(candidate: ProductImageCandidateAnalysis): ProductReferenceImage {
  return {
    id: candidate.id,
    url: candidate.url,
    source: candidate.source,
    hash: candidate.hash,
    width: candidate.width,
    height: candidate.height,
    viewClass: candidate.viewClass,
    approxAzimuthDeg: candidate.approxAzimuthDeg,
    handleVisible: candidate.handleVisible,
    handleSide: candidate.handleSide,
    logoDetected: candidate.logoDetected,
    logoBox: candidate.logoBox,
    confidence: round3(candidate.confidence),
  };
}

function scoreBackCandidate(candidate: ProductImageCandidateAnalysis): number {
  const backClassWeight =
    candidate.viewClass === "back"
      ? 1.6
      : candidate.viewClass === "back-3q"
        ? 1.2
        : candidate.viewClass === "handle-side"
          ? 0.4
          : 0;
  const azimuthWeight =
    candidate.approxAzimuthDeg === 180
      ? 0.35
      : candidate.approxAzimuthDeg === 135
        ? 0.22
        : 0;
  return backClassWeight + azimuthWeight + candidate.confidence;
}

function isStrictTrueBackCandidate(candidate: ProductImageCandidateAnalysis): boolean {
  return (
    candidate.viewClass === "back" &&
    candidate.approxAzimuthDeg === 180 &&
    !candidate.handleVisible &&
    candidate.confidence >= 0.8 &&
    candidate.detailScore < 0.84 &&
    candidate.lifestyleScore < 0.84
  );
}

function buildProductReferenceSet(args: {
  lookupText: string;
  matchedProfileId: string | null;
  brand: string | null;
  model: string | null;
  capacityOz: number | null;
  analyses: ProductImageCandidateAnalysis[];
}): ProductReferenceSet | null {
  if (args.analyses.length === 0) return null;

  const images = args.analyses.map(toProductReferenceImage);
  const scoreFrontReferenceCandidate = (candidate: ProductImageCandidateAnalysis): number => {
    let score = candidate.confidence;
    if (candidate.logoDetected) score += 1.8;
    if (candidate.viewClass === "front-3q") score += 2.4;
    else if (candidate.viewClass === "front") score += 1.6;
    else if (candidate.viewClass === "handle-side") score += 0.4;

    if (candidate.handleVisible && candidate.handleSide === "right") score += 2.2;
    else if (candidate.handleVisible && candidate.handleSide === "left") score -= 0.8;

    if (candidate.approxAzimuthDeg === 45) score += 0.5;
    else if (candidate.approxAzimuthDeg === 0) score += 0.2;

    return score;
  };
  const canonicalFront = [...args.analyses]
    .filter((candidate) => candidate.viewClass !== "detail" && candidate.viewClass !== "lifestyle")
    .sort((left, right) => scoreFrontReferenceCandidate(right) - scoreFrontReferenceCandidate(left))
    .find((candidate) => (
      (candidate.handleVisible && candidate.handleSide === "right") ||
      candidate.viewClass === "front" ||
      candidate.viewClass === "front-3q" ||
      candidate.logoDetected
    )) ?? args.analyses[0];

  const rankedBackCandidates = [...args.analyses]
    .filter((candidate) => candidate.id !== canonicalFront.id)
    .sort((left, right) => scoreBackCandidate(right) - scoreBackCandidate(left));

  const canonicalBack = rankedBackCandidates.find(isStrictTrueBackCandidate) ?? null;
  const bestAuxBack3q = canonicalBack
    ? null
    : rankedBackCandidates.find((candidate) => (
      (candidate.viewClass === "back" || candidate.viewClass === "back-3q") &&
      candidate.confidence >= 0.52
    )) ?? null;

  const canonicalHandleSide = [...args.analyses]
    .sort((left, right) => (
      ((right.handleVisible ? 1.2 : 0) + (right.viewClass === "handle-side" ? 1.2 : right.viewClass.endsWith("3q") ? 0.6 : 0) + right.confidence)
      -
      ((left.handleVisible ? 1.2 : 0) + (left.viewClass === "handle-side" ? 1.2 : left.viewClass.endsWith("3q") ? 0.6 : 0) + left.confidence)
    ))
    .find((candidate) => candidate.handleVisible && candidate.confidence >= 0.48) ?? null;

  const orientationSeeds = [
    canonicalFront?.confidence ?? 0,
    canonicalBack?.confidence ?? bestAuxBack3q?.confidence ?? 0,
    canonicalHandleSide?.confidence ?? 0,
  ].filter((value) => value > 0);
  const orientationConfidence = orientationSeeds.length > 0
    ? round3(orientationSeeds.reduce((sum, value) => sum + value, 0) / orientationSeeds.length)
    : 0;

  const canonicalBackStatus =
    canonicalBack
      ? "true-back"
      : bestAuxBack3q
        ? "only-back-3q-found"
        : "unknown";

  return {
    productKey:
      (
        args.matchedProfileId ??
        [args.brand, args.model, typeof args.capacityOz === "number" ? `${args.capacityOz}oz` : null]
          .filter(Boolean)
          .map((value) => slugify(value))
          .filter(Boolean)
          .join("-")
      ) ||
      slugify(args.lookupText) ||
      "lookup-product",
    images,
    canonicalFrontImageId: canonicalFront?.id,
    canonicalBackImageId: canonicalBack?.id ?? undefined,
    canonicalHandleSideImageId: canonicalHandleSide?.id ?? undefined,
    orientationConfidence,
    canonicalViewSelection: {
      canonicalFrontImageId: canonicalFront?.id,
      canonicalBackImageId: canonicalBack?.id ?? undefined,
      canonicalBackStatus,
      frontConfidence: round3(canonicalFront?.confidence ?? 0),
      backConfidence: round3(canonicalBack?.confidence ?? bestAuxBack3q?.confidence ?? 0),
      bestAuxBack3qImageId: bestAuxBack3q?.id ?? undefined,
    },
  };
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
  source: ProductReferenceImageSource;
}): Promise<ProductImagePairSelection> {
  if (args.imageUrls.length === 0) {
    return { primaryImageUrl: null, backImageUrl: null, analyses: [] };
  }

  const lexicalRanked = args.imageUrls
    .map((url) => ({
      url,
      lexicalScore: scoreImageCandidateUrl(url, args.lookupText),
      hints: describeImageCandidateUrl(url),
    }))
    .sort((left, right) => right.lexicalScore - left.lexicalScore);

  const stemStats = new Map<string, { count: number; frontLike: number; backLike: number; detailLike: number; maxLexical: number }>();
  for (const candidate of lexicalRanked.slice(0, 24)) {
    const stem = candidate.hints.stem;
    if (!stem) continue;
    const existing = stemStats.get(stem) ?? { count: 0, frontLike: 0, backLike: 0, detailLike: 0, maxLexical: Number.NEGATIVE_INFINITY };
    existing.count += 1;
    if (candidate.hints.hasFront) existing.frontLike += 1;
    if (candidate.hints.hasBack) existing.backLike += 1;
    if (candidate.hints.hasDetail) existing.detailLike += 1;
    existing.maxLexical = Math.max(existing.maxLexical, candidate.lexicalScore);
    stemStats.set(stem, existing);
  }

  const preferredStem = [...stemStats.entries()]
    .sort((left, right) => (
      (right[1].maxLexical + right[1].frontLike * 2.2 + right[1].backLike * 2.8 + right[1].detailLike * 1.4 + right[1].count * 0.35)
      -
      (left[1].maxLexical + left[1].frontLike * 2.2 + left[1].backLike * 2.8 + left[1].detailLike * 1.4 + left[1].count * 0.35)
    ))
    .at(0)?.[0] ?? "";

  const prioritizedSameStem = lexicalRanked
    .filter((candidate) => preferredStem && candidate.hints.stem === preferredStem)
    .sort((left, right) => (
      (right.lexicalScore + (right.hints.hasBack ? 3.5 : 0) + (right.hints.hasFront ? 2.5 : 0) + (right.hints.hasDetail ? 1.5 : 0))
      -
      (left.lexicalScore + (left.hints.hasBack ? 3.5 : 0) + (left.hints.hasFront ? 2.5 : 0) + (left.hints.hasDetail ? 1.5 : 0))
    ));

  const usePreferredStem = Boolean(preferredStem && prioritizedSameStem.length >= 2);
  const probeCandidates = [...new Map(
    [
      ...prioritizedSameStem.slice(0, 8),
      ...(usePreferredStem
        ? lexicalRanked.filter((candidate) => candidate.hints.stem !== preferredStem).slice(0, 2)
        : lexicalRanked),
    ].map((candidate) => [candidate.url, candidate] as const),
  ).values()].slice(0, usePreferredStem ? 10 : 12);
  const analyses = (
    await Promise.all(
      probeCandidates.map((candidate) => analyzeProductImageCandidate(candidate.url, args.lookupText, args.source)),
    )
  ).filter((candidate): candidate is ProductImageCandidateAnalysis => Boolean(candidate));

  const dedupedAnalyses = dedupeProductReferenceAnalyses(
    usePreferredStem
      ? analyses.filter((candidate) => describeImageCandidateUrl(candidate.url).stem === preferredStem)
      : analyses,
  )
    .sort((left, right) => right.totalScore - left.totalScore);

  if (dedupedAnalyses.length === 0) {
    return {
      primaryImageUrl: lexicalRanked[0]?.url ?? null,
      backImageUrl: null,
      analyses: [],
    };
  }

  const primary = dedupedAnalyses[0];
  return {
    primaryImageUrl: primary.url,
    backImageUrl: chooseBackImageCandidate(primary, dedupedAnalyses),
    analyses: dedupedAnalyses,
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
  const normalized = normalizeText(text);
  const looksHandleDriven =
    (/\bhandle\b|\btravel tumbler\b|\bprotour\b|\bpro tour\b|\bquencher\b/.test(normalized)) &&
    horizontalB / Math.max(horizontalA, 1) >= 1.2;

  return {
    overallHeightMm: round2(overallHeightMm),
    outsideDiameterMm: looksHandleDriven
      ? round2(horizontalA)
      : isStraight
        ? round2((horizontalA + horizontalB) / 2)
        : null,
    topDiameterMm: looksHandleDriven ? null : isStraight ? null : round2(horizontalB),
    bottomDiameterMm: looksHandleDriven ? null : isStraight ? null : round2(horizontalA),
    usableHeightMm: round2(overallHeightMm * 0.78),
    handleSpanMm: looksHandleDriven ? round2(horizontalB) : null,
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

async function isUsableTumblerGlb(glbPath: string): Promise<boolean> {
  if (!await glbAssetExists(glbPath)) {
    return false;
  }

  if (/rect-plate-proxy/i.test(glbPath)) {
    return false;
  }

  // Older generated tumbler traces can still carry flat-item node names.
  // Prefer the model path intent for drinkware-family generated assets.
  if (/models\/generated\/.*(?:tumbler|quencher|iceflow|protour)/i.test(glbPath)) {
    return true;
  }

  const normalized = glbPath.replace(/^\/+/, "").replace(/\//g, path.sep);
  const absolute = path.join(process.cwd(), "public", normalized);

  try {
    const buffer = await readFile(absolute);
    const magic = buffer.toString("utf8", 0, 4);
    if (magic !== "glTF") {
      return true;
    }

    let offset = 12;
    while (offset + 8 <= buffer.length) {
      const chunkLength = buffer.readUInt32LE(offset);
      offset += 4;
      const chunkType = buffer.toString("utf8", offset, offset + 4);
      offset += 4;
      const chunk = buffer.subarray(offset, offset + chunkLength);
      offset += chunkLength;

      if (chunkType !== "JSON") continue;

      const document = JSON.parse(chunk.toString("utf8")) as { nodes?: Array<{ name?: string }> };
      const nodeNames = (document.nodes ?? [])
        .map((node) => node.name?.trim().toLowerCase())
        .filter((value): value is string => Boolean(value));

      if (nodeNames.some((name) => name === "flat_item_body" || /rect|plate|flat_item/.test(name))) {
        return false;
      }

      return true;
    }
  } catch {
    return true;
  }

  return true;
}

async function pickFallbackGlbPath(args: {
  matchedProfileId: string | null;
  capacityOz: number | null;
  brand: string | null;
  model: string | null;
  hasHandle: boolean | null;
  dimensions: TumblerItemLookupDimensions | null;
  imageUrl?: string | null;
  imageUrls?: string[];
}): Promise<{
  glbPath: string;
  modelStatus: TumblerModelStatus;
  modelSourceLabel: string | null;
  fitDebug: TumblerItemLookupFitDebug | null;
  bodyColorHex: string | null;
  rimColorHex: string | null;
}> {
  const canGenerate =
    Boolean(args.matchedProfileId) ||
    Boolean(
      args.dimensions &&
      typeof args.dimensions.overallHeightMm === "number" &&
      Number.isFinite(args.dimensions.overallHeightMm) &&
      args.dimensions.overallHeightMm > 0 &&
      (
        (typeof args.dimensions.outsideDiameterMm === "number" &&
          Number.isFinite(args.dimensions.outsideDiameterMm) &&
          args.dimensions.outsideDiameterMm > 0) ||
        (typeof args.dimensions.topDiameterMm === "number" &&
          Number.isFinite(args.dimensions.topDiameterMm) &&
          args.dimensions.topDiameterMm > 0) ||
        (typeof args.dimensions.bottomDiameterMm === "number" &&
          Number.isFinite(args.dimensions.bottomDiameterMm) &&
          args.dimensions.bottomDiameterMm > 0)
      )
    );

  if (canGenerate) {
    try {
      const generated = await ensureGeneratedTumblerGlb({
        profileId: args.matchedProfileId,
        brand: args.brand,
        model: args.model,
        capacityOz: args.capacityOz,
        hasHandle: args.hasHandle,
        dimensions: args.dimensions ?? undefined,
        imageUrl: args.imageUrl,
        imageUrls: args.imageUrls,
      });
      if (generated.glbPath && await glbAssetExists(generated.glbPath)) {
        return {
          ...generated,
          modelStatus: "verified-product-model",
          modelSourceLabel: "Generated product-specific model",
        };
      }
    } catch (error) {
      console.warn("[lookupTumblerItem] generated tumbler model failed:", error);
    }
  }

  const candidates: Array<{
    glbPath: string;
    modelStatus: TumblerModelStatus;
    modelSourceLabel: string | null;
  }> = [
    args.matchedProfileId === "stanley-quencher-40"
      ? {
          glbPath: "/models/generated/the-quencher-h2-0-flowstate-tumbler-trace-c84baea8c2.glb",
          modelStatus: "verified-product-model" as const,
          modelSourceLabel: "Generated Stanley Quencher product model",
        }
      : null,
    args.matchedProfileId === "stanley-quencher-40"
      ? {
          glbPath: "/models/templates/40oz-yeti.glb",
          modelStatus: "placeholder-model" as const,
          modelSourceLabel: "Generic 40oz tumbler placeholder",
        }
      : null,
    args.matchedProfileId === "yeti-rambler-40"
      ? {
          glbPath: "/models/templates/yeti-40oz-body.glb",
          modelStatus: "verified-product-model" as const,
          modelSourceLabel: "Matched YETI Rambler template model",
        }
      : null,
  ].filter((value): value is NonNullable<typeof value> => Boolean(value));

  for (const candidate of candidates) {
    if (await isUsableTumblerGlb(candidate.glbPath)) {
      return {
        glbPath: candidate.glbPath,
        modelStatus: candidate.modelStatus,
        modelSourceLabel: candidate.modelSourceLabel,
        fitDebug: null,
        bodyColorHex: null,
        rimColorHex: null,
      };
    }
  }

  return {
    glbPath: "",
    modelStatus: "missing-model",
    modelSourceLabel: null,
    fitDebug: null,
    bodyColorHex: null,
    rimColorHex: null,
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

async function fetchPage(url: string): Promise<{ html: string; finalUrl: string }> {
  const headers = /stanley1913\.com/i.test(url) ? STANLEY_FETCH_HEADERS : GENERIC_FETCH_HEADERS;
  let lastStatus = 0;

  for (let attempt = 0; attempt < LOOKUP_FETCH_RETRY_LIMIT; attempt += 1) {
    const response = await fetch(url, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });

    if (response.ok) {
      const html = await response.text();
      return { html, finalUrl: response.url || url };
    }

    lastStatus = response.status;
    const shouldRetry = response.status === 429 || response.status >= 500;
    if (!shouldRetry || attempt === LOOKUP_FETCH_RETRY_LIMIT - 1) {
      throw new Error(`Lookup fetch failed (${response.status})`);
    }

    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfterSeconds = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : NaN;
    const delayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
      ? retryAfterSeconds * 1000
      : (attempt + 1) * 1500;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(`Lookup fetch failed (${lastStatus || "unknown"})`);
}

export async function lookupTumblerItem(args: {
  lookupInput: string;
}): Promise<TumblerItemLookupResponse> {
  const rawLookupInput = args.lookupInput.trim();
  const normalizedLookup = normalizeProductLookupUrl(rawLookupInput);
  const lookupInput = normalizedLookup.value;
  let resolvedUrl: string | null = null;
  let title: string | null = null;
  let imageUrls: string[] = [];
  let sources: TumblerSourceLink[] = [];
  let scrapedDims: TumblerItemLookupDimensions | null = null;
  const notes: string[] = normalizedLookup.note ? [normalizedLookup.note] : [];
  let sourceKind: TumblerSourceLink["kind"] = "general";
  let selectedImageUrl: string | null = null;
  let selectedBackImageUrl: string | null = null;
  let selectedImageAnalyses: ProductImageCandidateAnalysis[] = [];

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
        source: sourceFromKind(sourceKind),
      });
      selectedImageUrl = selectedImages.primaryImageUrl;
      selectedBackImageUrl = selectedImages.backImageUrl;
      selectedImageAnalyses = selectedImages.analyses;
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

  let matchedProfile = matchProfileFromText(lookupText);
  const capacityOz = parseCapacityOz(lookupText) ?? matchedProfile?.capacityOz ?? null;
  const brand = inferBrand(lookupText) ?? matchedProfile?.brand ?? null;
  if (brand === "Stanley") {
    const stanleyFamilySignal = inferStanleyFamilySignal({
      lookupText,
      analyses: selectedImageAnalyses,
    });
    if (stanleyFamilySignal) {
      const familyProfile = resolveStanleyProfileFromSignal({
        family: stanleyFamilySignal,
        capacityOz,
      });
      if (familyProfile && familyProfile.id !== matchedProfile?.id) {
        matchedProfile = familyProfile;
        notes.push(`Adjusted Stanley family match to ${familyProfile.label} from product-page signals.`);
      }
    }
  }
  const model = inferModel(lookupText, brand, capacityOz) ?? matchedProfile?.model ?? title;
  const productReferenceSet = buildProductReferenceSet({
    lookupText,
    matchedProfileId: matchedProfile?.id ?? null,
    brand,
    model,
    capacityOz,
    analyses: selectedImageAnalyses,
  });
  if (productReferenceSet && productReferenceSet.images.length > 1) {
    notes.push(`Retained ${productReferenceSet.images.length} reference images for orientation analysis.`);
  }
  if (productReferenceSet?.canonicalFrontImageId) {
    const canonicalFront = productReferenceSet.images.find((image) => image.id === productReferenceSet.canonicalFrontImageId) ?? null;
    if (canonicalFront && canonicalFront.url !== selectedImageUrl) {
      selectedImageUrl = canonicalFront.url;
      notes.push("Selected the canonical front view from the retained reference gallery.");
    }
  }
  if (productReferenceSet?.canonicalBackImageId) {
    const canonicalBack = productReferenceSet.images.find((image) => image.id === productReferenceSet.canonicalBackImageId) ?? null;
    if (canonicalBack && canonicalBack.url !== selectedBackImageUrl) {
      selectedBackImageUrl = canonicalBack.url;
      notes.push("Selected the canonical back view from the retained reference gallery.");
    }
  } else {
    selectedBackImageUrl = null;
    const backSelection = productReferenceSet?.canonicalViewSelection;
    if (backSelection?.canonicalBackStatus === "only-back-3q-found" && backSelection.bestAuxBack3qImageId) {
      const bestAuxBack = productReferenceSet?.images.find((image) => image.id === backSelection.bestAuxBack3qImageId) ?? null;
      if (bestAuxBack) {
          notes.push(
            `No strict true back face was assigned. The best opposite-side reference remains auxiliary only (treated as back-3q for UI, ${Math.round(bestAuxBack.confidence * 100)}% confidence).`,
          );
      }
    } else if (productReferenceSet) {
      notes.push("No strict true back face was identified from the retained reference gallery.");
    }
  }

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
        `Official or retailer page dimensions were found and will be used to refine the generated tumbler model when possible.`
      );
    }

    const fallbackAsset = await pickFallbackGlbPath({
      matchedProfileId: matchedProfile.id,
      capacityOz: matchedProfile.capacityOz,
      brand: matchedProfile.brand,
      model: matchedProfile.model,
      hasHandle: matchedProfile.hasHandle,
      dimensions: {
        overallHeightMm: scrapedDims?.overallHeightMm ?? matchedProfile.overallHeightMm,
        outsideDiameterMm: scrapedDims?.outsideDiameterMm ?? matchedProfile.outsideDiameterMm ?? null,
        topDiameterMm: scrapedDims?.topDiameterMm ?? matchedProfile.topDiameterMm ?? null,
        bottomDiameterMm: scrapedDims?.bottomDiameterMm ?? matchedProfile.bottomDiameterMm ?? null,
        usableHeightMm: scrapedDims?.usableHeightMm ?? matchedProfile.usableHeightMm,
      },
      imageUrl: selectedImageUrl,
      imageUrls,
    });

    return {
      lookupInput: rawLookupInput,
      resolvedUrl,
      title,
      brand: matchedProfile.brand,
      model: matchedProfile.model,
      capacityOz: matchedProfile.capacityOz,
      matchedProfileId: matchedProfile.id,
      glbPath: fallbackAsset.glbPath,
      modelStatus: fallbackAsset.modelStatus,
      modelSourceLabel: fallbackAsset.modelSourceLabel,
      imageUrl: selectedImageUrl,
      backImageUrl: selectedBackImageUrl,
      imageUrls,
      productReferenceSet,
      bodyColorHex: fallbackAsset.bodyColorHex,
      rimColorHex: fallbackAsset.rimColorHex,
      fitDebug: fallbackAsset.fitDebug,
      dimensions: {
        overallHeightMm: scrapedDims?.overallHeightMm ?? matchedProfile.overallHeightMm,
        outsideDiameterMm: scrapedDims?.outsideDiameterMm ?? matchedProfile.outsideDiameterMm ?? null,
        topDiameterMm: scrapedDims?.topDiameterMm ?? matchedProfile.topDiameterMm ?? null,
        bottomDiameterMm: scrapedDims?.bottomDiameterMm ?? matchedProfile.bottomDiameterMm ?? null,
        usableHeightMm: scrapedDims?.usableHeightMm ?? matchedProfile.usableHeightMm,
        handleSpanMm: scrapedDims?.handleSpanMm ?? matchedProfile.handleSpanMm ?? null,
      },
      mode: "matched-profile",
      notes: [
        ...notes,
        `Top margin fallback: ${round2(topMarginMm)} mm. Bottom margin fallback: ${round2(bottomMarginMm)} mm.`,
        `Handle arc fallback: ${getProfileHandleArcDeg(matchedProfile)}°.`,
        `GLB fallback: ${fallbackAsset.glbPath || "none available locally"}.`,
        ...(fallbackAsset.modelStatus === "placeholder-model"
          ? ["The resolved GLB is a placeholder model and should not be treated as verified product geometry."]
          : []),
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
    handleSpanMm: null,
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
    dimensions: safeDims,
    imageUrl: selectedImageUrl,
    imageUrls,
  });

  return {
    lookupInput: rawLookupInput,
    resolvedUrl,
    title,
    brand,
    model,
    capacityOz,
    matchedProfileId: null,
    glbPath: fallbackAsset.glbPath,
    modelStatus: fallbackAsset.modelStatus,
    modelSourceLabel: fallbackAsset.modelSourceLabel,
    imageUrl: selectedImageUrl,
    backImageUrl: selectedBackImageUrl,
    imageUrls,
    productReferenceSet,
    bodyColorHex: fallbackAsset.bodyColorHex,
    rimColorHex: fallbackAsset.rimColorHex,
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
      ...(fallbackAsset.modelStatus === "placeholder-model"
        ? ["The resolved GLB is a placeholder model and should not be treated as verified product geometry."]
        : []),
    ],
    sources,
  };
}
