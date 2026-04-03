import type {
  SvgLibraryArtworkType,
  SvgLibraryClassification,
  SvgLibraryItemType,
  SvgLibraryReviewState,
  SvgLibrarySide,
  SvgLibrarySmartNaming,
  SvgLibrarySource,
  SvgLibraryWorkflowStatus,
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

const GENERIC_PROJECT_NAMES = new Set([
  ...GENERIC_FOLDER_NAMES,
  "front",
  "back",
  "wrap",
  "left",
  "right",
  "final",
  "export",
  "exports",
  "proof",
  "proofs",
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

const SIDE_RULES: PatternRule<SvgLibrarySide>[] = [
  {
    value: "front",
    patterns: [/\bfront\b/i, /\bprimary\b/i],
    reason: "Matched front-side keywords",
  },
  {
    value: "back",
    patterns: [/\bback\b/i, /\breverse\b/i, /\bopposite\b/i],
    reason: "Matched back-side keywords",
  },
  {
    value: "wrap",
    patterns: [/\bwrap\b/i, /\bfull[\s_-]*wrap\b/i, /\baround\b/i],
    reason: "Matched wrap keywords",
  },
  {
    value: "left",
    patterns: [/\bleft\b/i],
    reason: "Matched left-side keywords",
  },
  {
    value: "right",
    patterns: [/\bright\b/i],
    reason: "Matched right-side keywords",
  },
];

function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeWords(value: string) {
  return normalizeWhitespace(
    value
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[_]+/g, " ")
      .replace(/-/g, " "),
  );
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

function stripExtension(value: string) {
  return value.replace(/\.[^.]+$/i, "");
}

function slugifySegment(value: string | null | undefined, fallback: string) {
  const normalized = normalizeWords(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function formatFolderLabel(value: string | null | undefined, fallback: string) {
  const normalized = normalizeWords(value ?? "");
  return normalized || fallback;
}

function formatItemTypeLabel(value: SvgLibraryItemType) {
  if (value === "unknown") return "Unknown Item";
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatSideLabel(side: SvgLibrarySide) {
  if (side === "unknown") return "Unsorted";
  return side.charAt(0).toUpperCase() + side.slice(1);
}

function normalizeFolderPath(value: string | null | undefined) {
  if (!value) return null;
  return value
    .split(/[\\/]+|\s\/\s/g)
    .map((segment) => normalizeWords(segment))
    .filter(Boolean)
    .join(" / ");
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

export function countDrawableElements(svgText: string): number {
  return [...svgText.matchAll(/<(path|rect|circle|ellipse|line|polyline|polygon|image|use|text|tspan)\b/gi)].length;
}

export function analyzeSvgMarkup(svgText: string): {
  laserReady: boolean;
  laserWarnings: string[];
} {
  const shapeCount = countDrawableElements(svgText);
  const hasText = /<(text|tspan)\b/i.test(svgText);
  const hasStroke = /\bstroke\s*=\s*["'](?!none\b)[^"']+["']/i.test(svgText) || /\bstroke\s*:\s*(?!none\b)[^;]+/i.test(svgText);
  const hasFill = /\bfill\s*=\s*["'](?!none\b|transparent\b)[^"']+["']/i.test(svgText) || /\bfill\s*:\s*(?!none\b|transparent\b)[^;]+/i.test(svgText);

  const laserWarnings: string[] = [];
  if (hasText) {
    laserWarnings.push("Contains text elements - convert text to paths before final export.");
  }
  if (!hasStroke && !hasFill && shapeCount > 0) {
    laserWarnings.push("No visible fill or stroke detected.");
  }
  if (shapeCount === 0) {
    laserWarnings.push("No vector shape elements found.");
  }

  return {
    laserReady: !hasText && (hasStroke || hasFill) && shapeCount > 0,
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

function inferSide(args: {
  name: string;
  relativePath?: string | null;
  svgText: string;
}): { side: SvgLibrarySide; reason: string | null } {
  const match = findFirstRuleMatch(
    [args.name, args.relativePath ?? "", ...extractSvgText(args.svgText)]
      .filter(Boolean)
      .join(" "),
    SIDE_RULES,
  );

  return {
    side: match?.value ?? "unknown",
    reason: match?.reason ?? null,
  };
}

function inferProjectName(args: {
  name: string;
  relativePath?: string | null;
  businessName: string | null;
}): string | null {
  const relativeSegments = (args.relativePath ?? "")
    .split(/[\\/]+/)
    .map((segment) => normalizeWords(segment))
    .filter(Boolean);

  const folderCandidates = relativeSegments.slice(0, -1).reverse();
  const baseName = normalizeWords(stripExtension(args.name));
  const candidates = [...folderCandidates, baseName];

  for (const candidate of candidates) {
    const normalized = candidate.toLowerCase();
    if (!candidate) continue;
    if (normalized === normalizeWords(args.businessName ?? "").toLowerCase()) continue;
    if (GENERIC_PROJECT_NAMES.has(normalized)) continue;
    return candidate;
  }

  return baseName || null;
}

function inferVersionLabel(name: string) {
  const baseName = stripExtension(name);
  const explicitMatch = baseName.match(/\b(?:v|ver|version)[\s_-]*(\d+)\b/i);
  if (explicitMatch) {
    return `v${explicitMatch[1]}`;
  }

  const revisionMatch = baseName.match(/\brev[\s_-]*([a-z0-9]+)\b/i);
  if (revisionMatch) {
    return `rev-${revisionMatch[1].toLowerCase()}`;
  }

  const numericTailMatch = baseName.match(/(?:^|[\s_-])(\d{1,2})$/);
  if (numericTailMatch) {
    return `v${numericTailMatch[1]}`;
  }

  return "v1";
}

export function buildSmartNamingPlan(args: {
  name: string;
  relativePath?: string | null;
  svgText: string;
  classification: SvgLibraryClassification;
}): SvgLibrarySmartNaming {
  const businessName = args.classification.businessName ?? inferBusinessName(args.relativePath);
  const projectName = inferProjectName({
    name: args.name,
    relativePath: args.relativePath,
    businessName,
  });
  const sideMatch = inferSide(args);
  const versionLabel = inferVersionLabel(args.name);
  const itemSlug = args.classification.itemType === "unknown"
    ? "unknown-item"
    : slugifySegment(args.classification.itemType, "unknown-item");
  const artworkSlug = args.classification.artworkType === "unknown"
    ? "artwork"
    : slugifySegment(args.classification.artworkType, "artwork");
  const sideSlug = sideMatch.side === "unknown" ? "unknown-side" : sideMatch.side;
  const suggestedName = [
    slugifySegment(businessName, "general"),
    slugifySegment(projectName ?? stripExtension(args.name), "artwork"),
    itemSlug,
    sideSlug,
    artworkSlug,
    versionLabel,
  ].join("__") + ".svg";

  const suggestedFolderPath = normalizeFolderPath([
    formatFolderLabel(businessName, "Unassigned"),
    formatItemTypeLabel(args.classification.itemType),
    formatFolderLabel(projectName ?? stripExtension(args.name), "Untitled"),
    formatSideLabel(sideMatch.side),
  ].join(" / "));

  const reasons: string[] = [];
  if (businessName) {
    reasons.push(`Business folder suggests "${businessName}"`);
  }
  if (projectName) {
    reasons.push(`Project label derived from "${projectName}"`);
  }
  if (sideMatch.reason) {
    reasons.push(sideMatch.reason);
  }
  if (args.classification.itemType !== "unknown") {
    reasons.push(`Item type suggests "${formatItemTypeLabel(args.classification.itemType)}"`);
  }
  if (args.classification.artworkType !== "unknown") {
    reasons.push(`Artwork classified as "${args.classification.artworkType}"`);
  }
  if (reasons.length === 0) {
    reasons.push("Generated from the imported filename and folder structure");
  }

  let confidence = 0.16;
  if (businessName) confidence += 0.24;
  if (projectName) confidence += 0.14;
  if (sideMatch.side !== "unknown") confidence += 0.12;
  if (args.classification.itemType !== "unknown") confidence += 0.14;
  if (args.classification.artworkType !== "unknown") confidence += 0.08;

  return {
    businessName,
    projectName,
    side: sideMatch.side,
    versionLabel,
    suggestedName,
    suggestedFolderPath,
    confidence: clampConfidence(confidence),
    reasons,
  };
}

export function resolveWorkflowStatus(args: {
  laserReady: boolean;
  currentName: string;
  libraryFolderPath?: string | null;
  smartNaming: SvgLibrarySmartNaming;
  classification: SvgLibraryClassification;
  forcedStatus?: SvgLibraryWorkflowStatus | null;
}): SvgLibraryWorkflowStatus {
  if (!args.laserReady) {
    return "needs-repair";
  }

  if (args.forcedStatus === "archived") {
    return "archived";
  }

  const normalizedCurrentName = args.currentName.trim().toLowerCase();
  const nameApproved = normalizedCurrentName === args.smartNaming.suggestedName.toLowerCase();
  const currentFolderPath = normalizeFolderPath(args.libraryFolderPath);
  const suggestedFolderPath = normalizeFolderPath(args.smartNaming.suggestedFolderPath);
  const folderApproved = currentFolderPath === suggestedFolderPath;

  if (args.forcedStatus === "approved" && nameApproved && folderApproved) {
    return "approved";
  }
  if (args.forcedStatus === "inbox") {
    return "inbox";
  }
  if (args.forcedStatus === "needs-review") {
    return "needs-review";
  }

  const hasSmartSignals =
    args.classification.reviewState !== "pending-analysis"
    || args.smartNaming.confidence >= 0.28
    || args.smartNaming.reasons.length > 0;

  if (nameApproved && folderApproved && args.classification.reviewState === "approved") {
    return "approved";
  }

  if (hasSmartSignals) {
    return "needs-review";
  }

  return "inbox";
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
