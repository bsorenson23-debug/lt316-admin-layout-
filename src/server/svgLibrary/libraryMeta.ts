import type {
  SvgLibraryArtworkType,
  SvgLibraryClassification,
  SvgLibraryItemType,
  SvgLibraryReviewState,
  SvgLibrarySource,
} from "../../types/svgLibrary.ts";

const GENERIC_FOLDER_NAMES = new Set([
  "svg",
  "svgs",
  "artwork",
  "artworks",
  "logos",
  "logo",
  "library",
  "uploads",
  "upload",
  "designs",
  "design",
  "misc",
  "other",
  "unknown",
  "new",
  "incoming",
]);

interface PatternRule<T> {
  value: T;
  patterns: RegExp[];
  reason: string;
}

const ITEM_TYPE_RULES: PatternRule<SvgLibraryItemType>[] = [
  {
    value: "business-card",
    patterns: [/\bbusiness[\s_-]*card\b/i, /\bmetal[\s_-]*card\b/i],
    reason: "Matched business-card keywords",
  },
  {
    value: "patch-tag",
    patterns: [/\bdog[\s_-]*tag\b/i, /\bkey[\s_-]*chain\b/i, /\bkeychain\b/i, /\bpatch\b/i, /\btag\b/i],
    reason: "Matched patch/tag keywords",
  },
  {
    value: "coaster-tile",
    patterns: [/\bcoaster\b/i, /\btile\b/i, /\bslate\b/i],
    reason: "Matched coaster/tile keywords",
  },
  {
    value: "plate-board",
    patterns: [/\bcutting[\s_-]*board\b/i, /\bcharcuterie\b/i, /\bboard\b/i, /\btray\b/i, /\bplate\b/i, /\bplatter\b/i],
    reason: "Matched plate/board keywords",
  },
  {
    value: "sign-plaque",
    patterns: [/\bsign\b/i, /\bplaque\b/i, /\bnameplate\b/i],
    reason: "Matched sign/plaque keywords",
  },
  {
    value: "tech",
    patterns: [/\bphone[\s_-]*case\b/i, /\blaptop\b/i, /\bwallet\b/i, /\btech\b/i],
    reason: "Matched tech keywords",
  },
  {
    value: "tumbler",
    patterns: [/\btumbler\b/i, /\bquencher\b/i],
    reason: "Matched tumbler keywords",
  },
  {
    value: "mug",
    patterns: [/\bmug\b/i],
    reason: "Matched mug keywords",
  },
  {
    value: "bottle",
    patterns: [/\bbottle\b/i],
    reason: "Matched bottle keywords",
  },
  {
    value: "drinkware-flat",
    patterns: [/\bdrinkware\b/i, /\bcup\b/i],
    reason: "Matched generic drinkware keywords",
  },
];

const ARTWORK_TYPE_RULES: PatternRule<SvgLibraryArtworkType>[] = [
  {
    value: "monogram",
    patterns: [/\bmonogram\b/i, /\binitials?\b/i],
    reason: "Matched monogram keywords",
  },
  {
    value: "text-lockup",
    patterns: [/\bwordmark\b/i, /\btext\b/i, /\bname\b/i],
    reason: "Matched text-lockup keywords",
  },
  {
    value: "badge",
    patterns: [/\bbadge\b/i, /\bseal\b/i, /\bcrest\b/i],
    reason: "Matched badge keywords",
  },
  {
    value: "pattern",
    patterns: [/\bpattern\b/i, /\brepeat\b/i],
    reason: "Matched pattern keywords",
  },
  {
    value: "line-art",
    patterns: [/\bline[\s_-]*art\b/i, /\boutline\b/i],
    reason: "Matched line-art keywords",
  },
  {
    value: "logo",
    patterns: [/\blogo\b/i, /\bbrand\b/i],
    reason: "Matched logo keywords",
  },
];

function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'");
}

function findFirstRuleMatch<T>(
  text: string,
  rules: PatternRule<T>[],
): { value: T; reason: string } | null {
  for (const rule of rules) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return { value: rule.value, reason: rule.reason };
    }
  }
  return null;
}

export function sanitizeSvgForLibrary(svgText: string): string {
  return svgText
    .replace(/^\uFEFF/, "")
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son[a-zA-Z:-]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/g, "")
    .replace(/\s(?:href|xlink:href)\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, "")
    .trim();
}

export function extractSvgText(svgText: string): string[] {
  const seen = new Set<string>();
  const matches = svgText.matchAll(/<(?:text|tspan)\b[^>]*>([\s\S]*?)<\/(?:text|tspan)>/gi);

  for (const match of matches) {
    const value = normalizeWhitespace(
      decodeXmlEntities(match[1].replace(/<[^>]+>/g, " ")),
    );
    if (value) {
      seen.add(value);
    }
  }

  return [...seen].slice(0, 12);
}

export function analyzeSvgMarkup(svgText: string): {
  laserReady: boolean;
  laserWarnings: string[];
} {
  const shapeCount = [...svgText.matchAll(/<(path|rect|circle|ellipse|line|polyline|polygon)\b/gi)].length;
  const hasText = /<(text|tspan)\b/i.test(svgText);
  const hasStroke = /\bstroke\s*=\s*["'](?!none\b)[^"']+["']/i.test(svgText) || /\bstroke\s*:\s*(?!none\b)[^;]+/i.test(svgText);
  const hasFill = /\bfill\s*=\s*["'](?!none\b|transparent\b)[^"']+["']/i.test(svgText) || /\bfill\s*:\s*(?!none\b|transparent\b)[^;]+/i.test(svgText);

  const laserWarnings: string[] = [];
  if (hasFill) {
    laserWarnings.push("Has filled shapes - review stroke-only output before cutting.");
  }
  if (hasText) {
    laserWarnings.push("Contains text elements - convert text to paths before final export.");
  }
  if (!hasStroke && shapeCount > 0) {
    laserWarnings.push("No visible strokes detected.");
  }
  if (shapeCount === 0) {
    laserWarnings.push("No vector shape elements found.");
  }

  return {
    laserReady: !hasFill && !hasText && hasStroke && shapeCount > 0,
    laserWarnings,
  };
}

export function inferSourceFolderLabel(relativePath?: string | null): string | null {
  if (!relativePath) return null;
  const segments = relativePath
    .split(/[\\/]+/)
    .map((segment) => normalizeWhitespace(segment))
    .filter(Boolean);
  if (segments.length <= 1) return null;
  return segments.slice(0, -1).join(" / ");
}

function inferBusinessName(relativePath?: string | null): string | null {
  if (!relativePath) return null;
  const [topLevelFolder] = relativePath
    .split(/[\\/]+/)
    .map((segment) => normalizeWhitespace(segment))
    .filter(Boolean);

  if (!topLevelFolder) return null;

  const normalized = topLevelFolder.toLowerCase();
  if (GENERIC_FOLDER_NAMES.has(normalized)) return null;
  if (!/[a-z]/i.test(topLevelFolder)) return null;

  return topLevelFolder;
}

function toReviewState(hasSignals: boolean): SvgLibraryReviewState {
  return hasSignals ? "pending-review" : "pending-analysis";
}

export function buildInitialClassification(args: {
  name: string;
  relativePath?: string | null;
  svgText: string;
}): SvgLibraryClassification {
  const detectedText = extractSvgText(args.svgText);
  const combinedText = [
    args.name,
    args.relativePath ?? "",
    ...detectedText,
  ]
    .filter(Boolean)
    .join(" ");

  const itemMatch = findFirstRuleMatch(combinedText, ITEM_TYPE_RULES);
  const artworkMatch = findFirstRuleMatch(combinedText, ARTWORK_TYPE_RULES);
  const businessName = inferBusinessName(args.relativePath);

  const sources = new Set<SvgLibrarySource>();
  const reasons: string[] = [];

  if (args.name.trim()) {
    sources.add("filename");
  }
  if (args.relativePath?.trim()) {
    sources.add("folder-path");
  }
  if (detectedText.length > 0) {
    sources.add("svg-text");
    reasons.push(`Extracted ${detectedText.length} text node${detectedText.length === 1 ? "" : "s"} from SVG markup`);
  }
  if (itemMatch) {
    reasons.push(itemMatch.reason);
  }
  if (artworkMatch) {
    reasons.push(artworkMatch.reason);
  }
  if (businessName) {
    reasons.push(`Top-level folder suggests business account "${businessName}"`);
  }

  let confidence = 0.1;
  if (businessName) confidence += 0.2;
  if (detectedText.length > 0) confidence += 0.1;
  if (itemMatch) confidence += 0.32;
  if (artworkMatch) confidence += 0.14;

  const hasSignals = Boolean(businessName || detectedText.length > 0 || itemMatch || artworkMatch);

  return {
    businessAccountId: null,
    businessName,
    itemType: itemMatch?.value ?? "unknown",
    artworkType: artworkMatch?.value ?? "unknown",
    confidence: clampConfidence(confidence),
    reviewState: toReviewState(hasSignals),
    sources: [...sources],
    reasons,
    detectedText,
    matchedOrderIds: [],
  };
}
