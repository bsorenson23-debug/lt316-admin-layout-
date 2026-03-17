import type {
  CandidateScore,
  TumblerBrandCandidate,
  TumblerBrandResolution,
  TumblerImageAnalysisResult,
  TumblerImageFeatures,
  TumblerLidStyle,
  TumblerLogoDetectionResult,
  TumblerShapeType,
  TumblerSpecCandidate,
} from "../../types/tumblerAutoSize.ts";
import { lookupInternalTumblerProfileSpecs } from "./internalProfileSpecs.ts";
import { searchTumblerSpecs } from "./searchTumblerSpecs.ts";

interface AnalyzeInput {
  fileName: string;
  mimeType: string;
  byteLength: number;
}

interface BrandProfile {
  brand: string;
  model: string | null;
  aliases: string[];
  expectedShape: TumblerShapeType;
  expectedHandle: boolean | null;
  expectedLid: TumblerLidStyle;
  defaultCapacityOz: number | null;
  grooveSignature: "strong" | "light" | "none";
}

const BRAND_PROFILES: BrandProfile[] = [
  {
    brand: "YETI",
    model: "Rambler",
    aliases: ["yeti", "rambler", "magslider"],
    expectedShape: "tapered",
    expectedHandle: false,
    expectedLid: "slider",
    defaultCapacityOz: 30,
    grooveSignature: "light",
  },
  {
    brand: "Stanley",
    model: "Quencher H2.0",
    aliases: ["stanley", "quencher", "flowstate", "h2.0"],
    expectedShape: "tapered",
    expectedHandle: true,
    expectedLid: "straw",
    defaultCapacityOz: 40,
    grooveSignature: "light",
  },
  {
    brand: "RTIC",
    model: "Road Trip Tumbler",
    aliases: ["rtic", "roadtrip", "road", "trip"],
    expectedShape: "straight",
    expectedHandle: false,
    expectedLid: "slider",
    defaultCapacityOz: 30,
    grooveSignature: "none",
  },
  {
    brand: "Ozark Trail",
    model: "Tumbler",
    aliases: ["ozark", "trail"],
    expectedShape: "straight",
    expectedHandle: false,
    expectedLid: "slider",
    defaultCapacityOz: 30,
    grooveSignature: "none",
  },
];

const SOURCE_SCORE: Record<TumblerSpecCandidate["kind"], number> = {
  internal: 1.0,
  official: 0.88,
  retailer: 0.64,
  general: 0.34,
};

const BRAND_SCORE_THRESHOLD = 0.64;
const BRAND_SCORE_MARGIN = 0.12;
const VISUAL_SCORE_THRESHOLD = 0.56;
const VISUAL_SCORE_MARGIN = 0.1;
const STRONG_LOGO_THRESHOLD = 0.88;

function isDevEnvironment(): boolean {
  return process.env.NODE_ENV !== "production";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/[^a-z0-9.\s]+/g, " ")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(input: string): string[] {
  const normalized = normalizeText(input);
  if (!normalized) return [];
  return normalized.split(" ").filter(Boolean);
}

function inferCapacityOz(rawText: string): number | null {
  const explicit = rawText.match(/([0-9]{2})\s*(?:oz|ounce)/i);
  if (explicit) {
    const parsed = Number(explicit[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  for (const token of tokenize(rawText)) {
    const parsed = Number(token);
    if (Number.isFinite(parsed) && parsed >= 12 && parsed <= 64) {
      return parsed;
    }
  }
  return null;
}

function inferHandle(rawText: string): boolean | null {
  if (/(no[\s\-]?handle|without[\s\-]?handle)/i.test(rawText)) return false;
  if (/(handle|mug|quencher)/i.test(rawText)) return true;
  return null;
}

function inferStraw(rawText: string): boolean | null {
  if (/(no[\s\-]?straw|without[\s\-]?straw)/i.test(rawText)) return false;
  if (/(straw|flowstate)/i.test(rawText)) return true;
  return null;
}

function inferLidStyle(rawText: string, hasStraw: boolean | null): TumblerLidStyle {
  if (hasStraw) return "straw";
  if (/(slider|magslider|slide)/i.test(rawText)) return "slider";
  if (/(open|rim)/i.test(rawText)) return "open";
  return "unknown";
}

function inferShape(rawText: string, hasHandle: boolean | null): TumblerShapeType {
  if (/(taper|cup\s*holder|narrow\s*base|conic)/i.test(rawText)) return "tapered";
  if (/(straight|cylindrical|cylinder)/i.test(rawText)) return "straight";
  if (hasHandle) return "tapered";
  return "unknown";
}

function inferGrooveBands(rawText: string): boolean | null {
  if (/(no[\s\-]?groove|smooth)/i.test(rawText)) return false;
  if (/(groove|joggle|ridge|band)/i.test(rawText)) return true;
  return null;
}

function buildSearchQuery(
  brand: string,
  model: string | null,
  capacityOz: number | null
): string {
  const parts = [brand, model, capacityOz ? `${capacityOz} oz` : null, "tumbler dimensions"];
  const query = parts.filter(Boolean).join(" ").trim();
  return query || "insulated tumbler dimensions";
}

function getBrandProfile(brand: string): BrandProfile | null {
  return (
    BRAND_PROFILES.find(
      (profile) => profile.brand.toLowerCase() === brand.toLowerCase()
    ) ?? null
  );
}

function makeFamilyHint(features: TumblerImageFeatures): string | null {
  const shape = features.shapeType === "unknown" ? "insulated tumbler" : `${features.shapeType} tumbler`;
  if (features.hasHandle === true) return `handled ${shape}`;
  if (features.hasHandle === false) return `handle-free ${shape}`;
  return shape;
}

function detectLidFromText(input: string): TumblerLidStyle {
  const text = normalizeText(input);
  if (!text) return "unknown";
  if (/(straw|flowstate)/.test(text)) return "straw";
  if (/(slider|magslider|slide)/.test(text)) return "slider";
  if (/(open|rim)/.test(text)) return "open";
  return "unknown";
}

function candidateMatchesBrand(candidate: TumblerSpecCandidate, brand: string): boolean {
  const normalizedBrand = normalizeText(brand);
  if (normalizedBrand === "unknown") return true;
  const candidateBrand = normalizeText(candidate.brand ?? "");
  if (candidateBrand && candidateBrand.includes(normalizedBrand)) return true;
  const title = normalizeText(candidate.title);
  const url = normalizeText(candidate.url);
  return title.includes(normalizedBrand) || url.includes(normalizedBrand.replace(/\s+/g, ""));
}

function sortSpecCandidates(candidates: TumblerSpecCandidate[]): TumblerSpecCandidate[] {
  return [...candidates].sort((a, b) => {
    const sourceDiff = SOURCE_SCORE[b.kind] - SOURCE_SCORE[a.kind];
    if (sourceDiff !== 0) return sourceDiff;
    return (b.confidence ?? 0.5) - (a.confidence ?? 0.5);
  });
}

function scoreSourceQuality(specs: TumblerSpecCandidate[]): number {
  if (specs.length === 0) return 0.22;
  const lead = specs[0];
  let score = SOURCE_SCORE[lead.kind];
  if (specs.some((spec) => spec.kind === "official")) score += 0.06;
  if (specs.some((spec) => spec.kind === "internal")) score += 0.08;
  return clamp(score, 0, 1);
}

function scoreSearchConsistency(args: {
  candidate: TumblerBrandCandidate;
  features: TumblerImageFeatures;
  specs: TumblerSpecCandidate[];
}): number {
  if (args.specs.length === 0) return 0.45;

  const topSpecs = args.specs.slice(0, 3);
  let score = 0.45;

  for (const spec of topSpecs) {
    if (candidateMatchesBrand(spec, args.candidate.brand)) score += 0.08;
    else if (args.candidate.brand !== "unknown") score -= 0.15;

    if (args.features.hasHandle !== null && typeof spec.hasHandle === "boolean") {
      score += args.features.hasHandle === spec.hasHandle ? 0.06 : -0.08;
    }

    if (
      args.features.shapeType !== "unknown" &&
      spec.shapeType &&
      spec.shapeType !== "unknown"
    ) {
      score += args.features.shapeType === spec.shapeType ? 0.06 : -0.08;
    }

    if (args.features.lidStyle !== "unknown") {
      const fromSpecText = detectLidFromText(`${spec.title} ${spec.snippet ?? ""}`);
      if (fromSpecText !== "unknown") {
        score += fromSpecText === args.features.lidStyle ? 0.04 : -0.06;
      }
    }
  }

  return clamp(score, 0, 1);
}

function scoreGrooveCompatibility(args: {
  candidateBrand: string;
  hasGrooveBands: boolean | null;
}): number {
  if (args.hasGrooveBands === null) return 0.5;
  const profile = getBrandProfile(args.candidateBrand);
  if (!profile) return 0.45;

  if (profile.grooveSignature === "strong") return args.hasGrooveBands ? 0.9 : 0.35;
  if (profile.grooveSignature === "light") return args.hasGrooveBands ? 0.7 : 0.55;
  return args.hasGrooveBands ? 0.42 : 0.72;
}

function scoreConflictPenalty(args: {
  candidate: TumblerBrandCandidate;
  features: TumblerImageFeatures;
  logoDetection: TumblerLogoDetectionResult;
  specs: TumblerSpecCandidate[];
}): number {
  let penalty = 0;
  const leadSpec = args.specs[0];

  const strongLogo =
    args.logoDetection.matchedBrand && args.logoDetection.confidence >= STRONG_LOGO_THRESHOLD;
  if (
    strongLogo &&
    args.logoDetection.matchedBrand &&
    normalizeText(args.logoDetection.matchedBrand) !== normalizeText(args.candidate.brand) &&
    args.candidate.brand !== "unknown"
  ) {
    penalty += 0.58;
  }

  if (args.features.hasHandle !== null && leadSpec && typeof leadSpec.hasHandle === "boolean") {
    if (args.features.hasHandle !== leadSpec.hasHandle) penalty += 0.14;
  }

  if (
    args.features.shapeType !== "unknown" &&
    leadSpec &&
    leadSpec.shapeType &&
    leadSpec.shapeType !== "unknown" &&
    args.features.shapeType !== leadSpec.shapeType
  ) {
    penalty += 0.14;
  }

  if (leadSpec && !candidateMatchesBrand(leadSpec, args.candidate.brand) && args.candidate.brand !== "unknown") {
    penalty += 0.2;
  }

  if (args.specs.length > 0 && args.specs.every((spec) => spec.kind === "general")) {
    penalty += 0.08;
  }

  if (args.candidate.brand === "unknown") {
    penalty = Math.max(0, penalty - 0.2);
  }

  return clamp(penalty, 0, 1);
}

function ensureUnknownCandidate(
  ranked: TumblerBrandCandidate[]
): TumblerBrandCandidate[] {
  const unknownCandidate = ranked.find((candidate) => candidate.brand === "unknown");
  const top = ranked.slice(0, 3);
  if (!unknownCandidate) return top;
  if (top.some((candidate) => candidate.brand === "unknown")) return top;
  return [...top.slice(0, 2), unknownCandidate];
}

export function extractTumblerImageFeatures(input: AnalyzeInput): TumblerImageFeatures {
  const rawText = normalizeText(input.fileName);
  const tokens = tokenize(rawText);
  const hasHandle = inferHandle(rawText);
  const hasStraw = inferStraw(rawText);
  const lidStyle = inferLidStyle(rawText, hasStraw);
  const shapeType = inferShape(rawText, hasHandle);
  const hasGrooveBands = inferGrooveBands(rawText);
  const capacityOz = inferCapacityOz(rawText);

  const silhouetteRatio =
    typeof capacityOz === "number"
      ? clamp(1.6 + (capacityOz - 20) * 0.022, 1.35, 2.7)
      : null;
  const baseTopDiameterRatio =
    shapeType === "tapered" ? 0.78 : shapeType === "straight" ? 0.98 : null;

  const visibleLogoText: string[] = [];
  for (const profile of BRAND_PROFILES) {
    if (profile.aliases.some((alias) => tokens.includes(normalizeText(alias)))) {
      visibleLogoText.push(profile.brand);
    }
  }

  return {
    rawText,
    tokens,
    visibleLogoText: Array.from(new Set(visibleLogoText)),
    hasHandle,
    hasStraw,
    lidStyle,
    shapeType,
    hasGrooveBands,
    silhouetteRatio,
    baseTopDiameterRatio,
  };
}

export function detectVisibleBrandText(
  features: TumblerImageFeatures
): TumblerLogoDetectionResult {
  const matched = BRAND_PROFILES.filter((profile) =>
    profile.aliases.some((alias) => features.tokens.includes(normalizeText(alias)))
  ).map((profile) => profile.brand);
  const unique = Array.from(new Set(matched));

  if (unique.length === 1) {
    return {
      matchedBrand: unique[0],
      detectedText: [unique[0]],
      confidence: 0.93,
      method: "filename-hint",
    };
  }

  if (unique.length > 1) {
    return {
      matchedBrand: null,
      detectedText: unique,
      confidence: 0.48,
      method: "filename-hint",
    };
  }

  return {
    matchedBrand: null,
    detectedText: [],
    confidence: 0.18,
    method: "unknown",
  };
}

export function buildTumblerCandidates(args: {
  features: TumblerImageFeatures;
  visibleBrandText: TumblerLogoDetectionResult;
  capacityOz: number | null;
}): TumblerBrandCandidate[] {
  const candidates: TumblerBrandCandidate[] = BRAND_PROFILES.map((profile) => {
    let visualScore = 0.08;
    const reasons: string[] = [];

    const aliasHits = profile.aliases.filter((alias) =>
      args.features.tokens.includes(normalizeText(alias))
    ).length;
    if (aliasHits > 0) {
      visualScore += clamp(aliasHits * 0.16, 0, 0.35);
      reasons.push(`alias:${aliasHits}`);
    }

    if (
      args.visibleBrandText.matchedBrand &&
      normalizeText(args.visibleBrandText.matchedBrand) === normalizeText(profile.brand)
    ) {
      visualScore += 0.48;
      reasons.push("logo-match");
    }

    if (args.features.shapeType !== "unknown") {
      if (args.features.shapeType === profile.expectedShape) {
        visualScore += 0.1;
        reasons.push("shape-match");
      } else {
        visualScore -= 0.08;
        reasons.push("shape-conflict");
      }
    }

    if (args.features.hasHandle !== null && profile.expectedHandle !== null) {
      if (args.features.hasHandle === profile.expectedHandle) {
        visualScore += 0.14;
        reasons.push("handle-match");
      } else {
        visualScore -= 0.12;
        reasons.push("handle-conflict");
      }
    }

    if (args.features.lidStyle !== "unknown" && profile.expectedLid !== "unknown") {
      if (args.features.lidStyle === profile.expectedLid) {
        visualScore += 0.08;
        reasons.push("lid-match");
      } else {
        visualScore -= 0.06;
        reasons.push("lid-conflict");
      }
    }

    if (
      args.capacityOz &&
      profile.defaultCapacityOz &&
      Math.abs(args.capacityOz - profile.defaultCapacityOz) <= 10
    ) {
      visualScore += 0.06;
      reasons.push("capacity-near");
    }

    return {
      id: profile.brand.toLowerCase().replace(/\s+/g, "-"),
      brand: profile.brand,
      model: profile.model,
      familyHint: null,
      searchQuery: buildSearchQuery(profile.brand, profile.model, args.capacityOz),
      preliminaryScore: clamp(visualScore, 0, 1),
      reasons,
    } satisfies TumblerBrandCandidate;
  });

  const unknownScore =
    0.28 +
    (args.visibleBrandText.matchedBrand ? 0 : 0.22) +
    (args.features.shapeType === "unknown" ? 0.06 : 0) +
    (args.features.hasHandle === null ? 0.08 : 0);

  candidates.push({
    id: "unknown",
    brand: "unknown",
    model: "unknown",
    familyHint: makeFamilyHint(args.features),
    searchQuery: "insulated tumbler dimensions",
    preliminaryScore: clamp(unknownScore, 0, 1),
    reasons: ["safe-fallback"],
  } satisfies TumblerBrandCandidate);

  const ranked = [...candidates].sort((a, b) => b.preliminaryScore - a.preliminaryScore);
  return ensureUnknownCandidate(ranked);
}

export async function searchSpecsForCandidate(args: {
  candidate: TumblerBrandCandidate;
  analysis: Pick<
    TumblerImageAnalysisResult,
    | "productType"
    | "brand"
    | "model"
    | "capacityOz"
    | "hasHandle"
    | "shapeType"
    | "confidence"
    | "searchQuery"
    | "notes"
  >;
}): Promise<TumblerSpecCandidate[]> {
  const internal =
    args.candidate.brand !== "unknown"
      ? lookupInternalTumblerProfileSpecs({
          brand: args.candidate.brand,
          model: args.candidate.model,
          capacityOz: args.analysis.capacityOz,
        })
      : [];

  const fetched = await searchTumblerSpecs({
    searchQuery: args.candidate.searchQuery,
    analysis: {
      ...args.analysis,
      brand: args.candidate.brand === "unknown" ? null : args.candidate.brand,
      model: args.candidate.model === "unknown" ? null : args.candidate.model,
      searchQuery: args.candidate.searchQuery,
    },
  });

  const filtered =
    args.candidate.brand === "unknown"
      ? fetched
      : fetched.filter((entry) => candidateMatchesBrand(entry, args.candidate.brand));

  return sortSpecCandidates([...internal, ...filtered]).slice(0, 8);
}

export function scoreTumblerCandidates(args: {
  features: TumblerImageFeatures;
  visibleBrandText: TumblerLogoDetectionResult;
  candidates: TumblerBrandCandidate[];
  candidateSpecMap: Record<string, TumblerSpecCandidate[]>;
}): CandidateScore[] {
  return args.candidates.map((candidate) => {
    const profile = getBrandProfile(candidate.brand);
    const specs = args.candidateSpecMap[candidate.id] ?? [];

    const logoTextScore =
      args.visibleBrandText.matchedBrand &&
      normalizeText(args.visibleBrandText.matchedBrand) === normalizeText(candidate.brand)
        ? clamp(args.visibleBrandText.confidence, 0, 1)
        : args.visibleBrandText.matchedBrand
          ? 0
          : candidate.preliminaryScore * 0.45;

    const silhouetteScore =
      args.features.shapeType === "unknown" || !profile
        ? 0.55
        : args.features.shapeType === profile.expectedShape
          ? 0.84
          : 0.24;

    const handleScore =
      args.features.hasHandle === null || !profile || profile.expectedHandle === null
        ? 0.55
        : args.features.hasHandle === profile.expectedHandle
          ? 0.84
          : 0.18;

    const lidScore =
      args.features.lidStyle === "unknown" || !profile || profile.expectedLid === "unknown"
        ? 0.55
        : args.features.lidStyle === profile.expectedLid
          ? 0.82
          : 0.2;

    const grooveScore = scoreGrooveCompatibility({
      candidateBrand: candidate.brand,
      hasGrooveBands: args.features.hasGrooveBands,
    });

    const visionScore = clamp(
      logoTextScore * 0.45 +
        silhouetteScore * 0.2 +
        handleScore * 0.15 +
        lidScore * 0.1 +
        grooveScore * 0.1,
      0,
      1
    );

    const searchConsistencyScore = scoreSearchConsistency({
      candidate,
      features: args.features,
      specs,
    });
    const sourceScore = scoreSourceQuality(specs);
    const conflictPenalty = scoreConflictPenalty({
      candidate,
      features: args.features,
      logoDetection: args.visibleBrandText,
      specs,
    });

    const totalScore = clamp(
      visionScore * 0.7 +
        searchConsistencyScore * 0.2 +
        sourceScore * 0.1 -
        conflictPenalty,
      0,
      1
    );

    return {
      brand: candidate.brand,
      visionScore,
      ocrScore: logoTextScore,
      shapeScore: silhouetteScore,
      logoTextScore,
      silhouetteScore,
      handleScore,
      lidScore,
      grooveScore,
      searchConsistencyScore,
      sourceScore,
      conflictPenalty,
      totalScore,
    };
  });
}

export function resolveTumblerMatch(args: {
  candidates: TumblerBrandCandidate[];
  scores: CandidateScore[];
  features: TumblerImageFeatures;
  visibleBrandText?: TumblerLogoDetectionResult;
  logoDetection?: TumblerLogoDetectionResult;
  threshold?: number;
  margin?: number;
}): TumblerBrandResolution {
  const threshold = args.threshold ?? BRAND_SCORE_THRESHOLD;
  const margin = args.margin ?? BRAND_SCORE_MARGIN;
  const visibleBrandText =
    args.visibleBrandText ??
    args.logoDetection ?? {
      matchedBrand: null,
      detectedText: [],
      confidence: 0,
      method: "unknown",
    };

  const candidateByBrand = new Map(
    args.candidates.map((candidate) => [normalizeText(candidate.brand), candidate])
  );
  const scoreByBrand = new Map(
    args.scores.map((score) => [normalizeText(score.brand), score])
  );

  const rankedVisual = [...args.scores].sort((a, b) => b.visionScore - a.visionScore);
  const rankedTotal = [...args.scores].sort((a, b) => b.totalScore - a.totalScore);

  const strongLogoBrand =
    visibleBrandText.matchedBrand &&
    visibleBrandText.confidence >= STRONG_LOGO_THRESHOLD
      ? normalizeText(visibleBrandText.matchedBrand)
      : null;

  const chosenScore = strongLogoBrand
    ? scoreByBrand.get(strongLogoBrand) ?? rankedVisual[0]
    : rankedVisual[0];
  const chosenCandidate = chosenScore
    ? candidateByBrand.get(normalizeText(chosenScore.brand))
    : null;

  const secondVisual = rankedVisual.find(
    (score) => normalizeText(score.brand) !== normalizeText(chosenScore?.brand ?? "")
  );
  const visualLead =
    chosenScore && secondVisual
      ? chosenScore.visionScore - secondVisual.visionScore
      : chosenScore?.visionScore ?? 0;

  const secondTotal = rankedTotal.find(
    (score) => normalizeText(score.brand) !== normalizeText(chosenScore?.brand ?? "")
  );
  const leadOverSecond =
    chosenScore && secondTotal
      ? chosenScore.totalScore - secondTotal.totalScore
      : chosenScore?.totalScore ?? 0;

  const topCandidates = rankedTotal
    .map((score) => candidateByBrand.get(normalizeText(score.brand)))
    .filter((candidate): candidate is TumblerBrandCandidate => Boolean(candidate))
    .slice(0, 3);
  const topScores = rankedTotal.slice(0, 3);

  if (!chosenCandidate || !chosenScore) {
    return {
      brand: "unknown",
      model: "unknown",
      familyHint: makeFamilyHint(args.features),
      confidence: 0.2,
      threshold,
      margin,
      leadOverSecond: 0,
      isUnknown: true,
      notes: ["No viable tumbler identity candidates were detected."],
      topCandidates,
      candidateScores: topScores,
    };
  }

  const lowVisual = chosenScore.visionScore < VISUAL_SCORE_THRESHOLD;
  const weakVisualLead = visualLead < VISUAL_SCORE_MARGIN && !strongLogoBrand;
  const lowTotal = chosenScore.totalScore < threshold && !strongLogoBrand;
  const weakTotalLead = leadOverSecond < margin && !strongLogoBrand;
  const highConflict = chosenScore.conflictPenalty > (strongLogoBrand ? 0.46 : 0.36);
  const unknownByChoice = normalizeText(chosenCandidate.brand) === "unknown";

  if (lowVisual || weakVisualLead || lowTotal || weakTotalLead || highConflict || unknownByChoice) {
    const reasons: string[] = [];
    if (unknownByChoice) reasons.push("Identity remained in unknown fallback candidate.");
    if (lowVisual) {
      reasons.push(
        `Visual score ${chosenScore.visionScore.toFixed(2)} below ${VISUAL_SCORE_THRESHOLD.toFixed(2)}.`
      );
    }
    if (weakVisualLead) {
      reasons.push(
        `Visual lead ${visualLead.toFixed(2)} below ${VISUAL_SCORE_MARGIN.toFixed(2)}.`
      );
    }
    if (lowTotal) {
      reasons.push(
        `Final score ${chosenScore.totalScore.toFixed(2)} below ${threshold.toFixed(2)}.`
      );
    }
    if (weakTotalLead) {
      reasons.push(
        `Final lead ${leadOverSecond.toFixed(2)} below ${margin.toFixed(2)}.`
      );
    }
    if (highConflict) {
      reasons.push(
        `Conflict penalty ${chosenScore.conflictPenalty.toFixed(2)} indicates evidence mismatch.`
      );
    }

    return {
      brand: "unknown",
      model: "unknown",
      familyHint: makeFamilyHint(args.features),
      confidence: clamp(chosenScore.totalScore, 0, 1),
      threshold,
      margin,
      leadOverSecond: clamp(leadOverSecond, 0, 1),
      isUnknown: true,
      notes: [
        ...reasons,
        "Brand not confidently confirmed; dimensions may be based on best match.",
      ],
      topCandidates,
      candidateScores: topScores,
    };
  }

  return {
    brand: chosenCandidate.brand,
    model: chosenCandidate.model ?? "unknown",
    familyHint: chosenCandidate.familyHint ?? null,
    confidence: clamp(chosenScore.totalScore, 0, 1),
    threshold,
    margin,
    leadOverSecond: clamp(leadOverSecond, 0, 1),
    isUnknown: false,
    notes: strongLogoBrand
      ? ["Final identity locked by strong visible brand text, validated by consistency checks."]
      : ["Final identity selected from visual ranking with consistency validation."],
    topCandidates,
    candidateScores: topScores,
  };
}

// Backward-compatible aliases while moving to explicit staged helper names.
export const detectTumblerLogoText = detectVisibleBrandText;
export const generateBrandCandidates = buildTumblerCandidates;
export const searchCandidateSpecs = searchSpecsForCandidate;
export const scoreBrandCandidates = scoreTumblerCandidates;
export const resolveBestBrandCandidate = resolveTumblerMatch;

export async function identifyTumblerBrand(input: AnalyzeInput): Promise<{
  analysis: TumblerImageAnalysisResult;
  selectedSpecs: TumblerSpecCandidate[];
  topCandidateSpecs: Record<string, TumblerSpecCandidate[]>;
}> {
  const features = extractTumblerImageFeatures(input);
  const visibleBrandText = detectVisibleBrandText(features);
  const capacityOz = inferCapacityOz(features.rawText);
  const candidates = buildTumblerCandidates({
    features,
    visibleBrandText,
    capacityOz,
  });

  const baseAnalysis: TumblerImageAnalysisResult = {
    productType: "tumbler",
    brand: null,
    model: null,
    capacityOz,
    hasHandle: features.hasHandle,
    shapeType: features.shapeType,
    confidence: clamp(input.mimeType.startsWith("image/") ? 0.4 : 0.28, 0, 1),
    searchQuery: "insulated tumbler dimensions",
    notes: [],
    imageFeatures: features,
    logoDetection: visibleBrandText,
  };

  const topCandidateSpecs: Record<string, TumblerSpecCandidate[]> = {};
  for (const candidate of candidates) {
    topCandidateSpecs[candidate.id] = await searchSpecsForCandidate({
      candidate,
      analysis: baseAnalysis,
    });
  }

  const scores = scoreTumblerCandidates({
    features,
    visibleBrandText,
    candidates,
    candidateSpecMap: topCandidateSpecs,
  });
  const resolution = resolveTumblerMatch({
    candidates,
    scores,
    features,
    visibleBrandText,
  });

  const selectedCandidate =
    candidates.find(
      (candidate) => normalizeText(candidate.brand) === normalizeText(resolution.brand)
    ) ??
    candidates.find((candidate) => candidate.brand === "unknown") ??
    candidates[0];
  const selectedSpecs = selectedCandidate
    ? topCandidateSpecs[selectedCandidate.id] ?? []
    : [];

  const notes: string[] = [...resolution.notes];
  if (input.byteLength <= 0) {
    notes.push("Image payload appears empty; falling back to metadata-only detection.");
  }
  if (!visibleBrandText.matchedBrand) {
    notes.push("No explicit logo text detected; using conservative visual ranking.");
  }

  if (isDevEnvironment()) {
    console.info("[tumbler-identify] features", {
      fileName: input.fileName,
      logo: visibleBrandText,
      hasHandle: features.hasHandle,
      lidStyle: features.lidStyle,
      shapeType: features.shapeType,
      grooveBands: features.hasGrooveBands,
      tokens: features.tokens.slice(0, 12),
    });
    console.info("[tumbler-identify] candidates", candidates.map((candidate) => ({
      brand: candidate.brand,
      model: candidate.model,
      preliminaryScore: Number(candidate.preliminaryScore.toFixed(3)),
      reasons: candidate.reasons,
    })));
    console.info("[tumbler-identify] scores", scores.map((score) => ({
      brand: score.brand,
      visionScore: Number(score.visionScore.toFixed(3)),
      logoTextScore: Number(score.logoTextScore.toFixed(3)),
      searchConsistencyScore: Number(score.searchConsistencyScore.toFixed(3)),
      conflictPenalty: Number(score.conflictPenalty.toFixed(3)),
      totalScore: Number(score.totalScore.toFixed(3)),
    })));
    console.info("[tumbler-identify] resolution", {
      brand: resolution.brand,
      model: resolution.model,
      confidence: Number(resolution.confidence.toFixed(3)),
      isUnknown: resolution.isUnknown,
      leadOverSecond: Number(resolution.leadOverSecond.toFixed(3)),
      notes: resolution.notes,
    });
  }

  const productType = "tumbler" as const;
  const searchQuery = selectedCandidate?.searchQuery ?? "insulated tumbler dimensions";

  return {
    analysis: {
      ...baseAnalysis,
      productType,
      brand: resolution.brand,
      model: resolution.model,
      confidence: resolution.confidence,
      searchQuery,
      notes,
      brandResolution: resolution,
      identification: {
        productType,
        brand: resolution.brand,
        model: resolution.model,
        familyHint: resolution.familyHint,
        confidence: resolution.confidence,
        searchQuery,
        topCandidates: resolution.topCandidates,
        notes,
      },
    },
    selectedSpecs,
    topCandidateSpecs,
  };
}
