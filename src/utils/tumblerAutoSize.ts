import { normalizeBedConfig } from "../types/admin.ts";
import type { BedConfig } from "../types/admin.ts";
import {
  findTumblerProfileIdForBrandModel,
  getTumblerProfileById,
} from "../data/tumblerProfiles.ts";
import type {
  TumblerConfidenceLevel,
  TumblerImageAnalysisResult,
  TumblerShapeType,
  TumblerSpecCandidate,
  TumblerSpecDraft,
  TumblerSpecSuggestion,
  TumblerTemplateCalculation,
} from "../types/tumblerAutoSize.ts";

const PACKAGING_PATTERN =
  /packag(e|ing)|shipping|carton|box\s+dimensions|product\s+dimensions\s+\(package\)/i;

const SOURCE_PRIORITY: Record<TumblerSpecCandidate["kind"], number> = {
  internal: 4,
  official: 3,
  retailer: 2,
  general: 1,
};

type DimensionField =
  | "overallHeight"
  | "outsideDiameter"
  | "topDiameter"
  | "bottomDiameter"
  | "usableHeight";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isFinitePositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function toMm(value: number, unit: string): number {
  const normalized = unit.toLowerCase();
  if (normalized === "cm") return value * 10;
  if (
    normalized === "in" ||
    normalized === "inch" ||
    normalized === "inches" ||
    normalized === "\""
  ) {
    return inchesToMm(value);
  }
  if (normalized === "ft" || normalized === "foot" || normalized === "feet") {
    return inchesToMm(value * 12);
  }
  return value;
}

function getFieldRange(field: DimensionField): { min: number; max: number } {
  if (field === "overallHeight") return { min: 70, max: 350 };
  if (field === "usableHeight") return { min: 50, max: 320 };
  return { min: 45, max: 160 };
}

function isValidDimensionForField(field: DimensionField, value: number): boolean {
  const range = getFieldRange(field);
  return value >= range.min && value <= range.max;
}

function readLabeledLengthMm(
  snippet: string | undefined,
  field: DimensionField
): number | null {
  if (!snippet) return null;

  const labels: Record<DimensionField, string[]> = {
    overallHeight: ["overall\\s*height", "(?:product\\s*)?height", "height"],
    outsideDiameter: [
      "outside\\s*diameter",
      "outer\\s*diameter",
      "diameter",
      "width",
    ],
    topDiameter: ["top\\s*diameter", "rim\\s*diameter", "mouth\\s*diameter"],
    bottomDiameter: ["bottom\\s*diameter", "base\\s*diameter"],
    usableHeight: [
      "usable\\s*height",
      "print(?:able)?\\s*height",
      "print\\s*area\\s*height",
    ],
  };

  const unitPattern = "(mm|cm|in(?:ches)?|inch|\"|ft|feet|foot)";
  const numberPattern = "([0-9]+(?:\\.[0-9]+)?)";
  for (const label of labels[field]) {
    const regex = new RegExp(
      `${label}[^0-9]{0,14}${numberPattern}\\s*${unitPattern}`,
      "i"
    );
    const match = snippet.match(regex);
    if (!match) continue;
    const value = Number(match[1]);
    if (!Number.isFinite(value)) continue;
    return toMm(value, match[2]);
  }
  return null;
}

function uniqueSources(candidates: TumblerSpecCandidate[]): TumblerSpecSuggestion["sources"] {
  const seen = new Set<string>();
  const result: TumblerSpecSuggestion["sources"] = [];
  for (const candidate of candidates) {
    if (!candidate.url || seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    result.push({
      title: candidate.title,
      url: candidate.url,
      kind: candidate.kind,
    });
    if (result.length >= 5) break;
  }
  return result;
}

function normalizeResolvedText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(unknown|n\/a|none|generic)$/i.test(trimmed)) return "unknown";
  return trimmed;
}

function pickText(
  analysis: TumblerImageAnalysisResult,
  candidates: TumblerSpecCandidate[],
  field: "brand" | "model"
): string | null {
  const resolvedFromBrandGate = normalizeResolvedText(
    field === "brand"
      ? analysis.brandResolution?.brand
      : analysis.brandResolution?.model
  );
  if (resolvedFromBrandGate) return resolvedFromBrandGate;

  const fromAnalysis = normalizeResolvedText(analysis[field]);
  if (fromAnalysis) return fromAnalysis;

  for (const candidate of candidates) {
    const value = normalizeResolvedText(candidate[field] ?? null);
    if (value) return value;
  }
  return "unknown";
}

function pickCapacity(
  analysis: TumblerImageAnalysisResult,
  candidates: TumblerSpecCandidate[]
): number | null {
  for (const candidate of candidates) {
    if (isFinitePositive(candidate.capacityOz ?? null)) return candidate.capacityOz ?? null;
  }
  return analysis.capacityOz;
}

function pickBoolean(
  analysis: TumblerImageAnalysisResult,
  candidates: TumblerSpecCandidate[],
  field: "hasHandle"
): boolean | null {
  for (const candidate of candidates) {
    const value = candidate[field];
    if (typeof value === "boolean") return value;
  }
  return analysis[field];
}

function readCandidateDimension(
  candidate: TumblerSpecCandidate,
  field: DimensionField
): number | null {
  const directMap: Record<DimensionField, TumblerSpecCandidate[keyof TumblerSpecCandidate]> = {
    overallHeight: candidate.overallHeight,
    outsideDiameter: candidate.outsideDiameter,
    topDiameter: candidate.topDiameter,
    bottomDiameter: candidate.bottomDiameter,
    usableHeight: candidate.usableHeight,
  };

  const direct = parseLengthToMm(directMap[field] as string | number | null | undefined);
  if (isFinitePositive(direct) && isValidDimensionForField(field, direct)) {
    return direct;
  }

  const fromSnippet = readLabeledLengthMm(candidate.snippet, field);
  if (isFinitePositive(fromSnippet) && isValidDimensionForField(field, fromSnippet)) {
    return fromSnippet;
  }
  return null;
}

function getFilteredCandidates(candidates: TumblerSpecCandidate[]): TumblerSpecCandidate[] {
  return candidates.filter((candidate) => {
    if (candidate.isPackaging) return false;
    if (candidate.snippet && PACKAGING_PATTERN.test(candidate.snippet)) return false;
    return true;
  });
}

function sortCandidates(candidates: TumblerSpecCandidate[]): TumblerSpecCandidate[] {
  return [...candidates].sort((a, b) => {
    const rankDiff = SOURCE_PRIORITY[b.kind] - SOURCE_PRIORITY[a.kind];
    if (rankDiff !== 0) return rankDiff;
    const confidenceDiff = (b.confidence ?? 0.5) - (a.confidence ?? 0.5);
    if (confidenceDiff !== 0) return confidenceDiff;
    return a.title.localeCompare(b.title);
  });
}

function pickDimension(
  candidates: TumblerSpecCandidate[],
  field: DimensionField
): number | null {
  for (const candidate of candidates) {
    const value = readCandidateDimension(candidate, field);
    if (isFinitePositive(value)) return value;
  }
  return null;
}

function inferShapeType(
  analysisShape: TumblerShapeType,
  topDiameterMm: number | null,
  bottomDiameterMm: number | null,
  outsideDiameterMm: number | null
): TumblerShapeType {
  if (analysisShape !== "unknown") return analysisShape;
  if (isFinitePositive(topDiameterMm) && isFinitePositive(bottomDiameterMm)) {
    if (Math.abs(topDiameterMm - bottomDiameterMm) >= 2.5) return "tapered";
    return "straight";
  }
  if (isFinitePositive(outsideDiameterMm)) return "straight";
  return "unknown";
}

function calculateNormalizedConfidence(args: {
  analysisConfidence: number;
  brandConfidence: number;
  unresolvedBrand: boolean;
  candidates: TumblerSpecCandidate[];
  overallHeightMm: number | null;
  outsideDiameterMm: number | null;
  topDiameterMm: number | null;
  bottomDiameterMm: number | null;
  usableHeightMm: number | null;
}): number {
  const sourceScore =
    args.candidates.length > 0 ? SOURCE_PRIORITY[args.candidates[0].kind] / 4 : 0.35;
  const dimensionCount = [
    args.overallHeightMm,
    args.outsideDiameterMm,
    args.topDiameterMm,
    args.bottomDiameterMm,
    args.usableHeightMm,
  ].filter((value) => isFinitePositive(value)).length;
  const completeness = dimensionCount / 5;

  const confidence =
    clamp(args.analysisConfidence, 0, 1) * 0.35 +
    clamp(args.brandConfidence, 0, 1) * 0.3 +
    sourceScore * 0.2 +
    completeness * 0.15 -
    (args.unresolvedBrand ? 0.08 : 0);
  return clamp(confidence, 0.2, 0.97);
}

export function inchesToMm(inches: number): number {
  return inches * 25.4;
}

export function parseLengthToMm(
  input: string | number | null | undefined
): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    // Heuristic: raw numeric values <= 20 are likely inches in tumbler specs.
    return input <= 20 ? inchesToMm(input) : input;
  }

  const raw = input.trim().toLowerCase();
  if (!raw) return null;

  const matched = raw.match(/(-?[0-9]+(?:\.[0-9]+)?)/);
  if (!matched) return null;

  const value = Number(matched[1]);
  if (!Number.isFinite(value)) return null;

  if (raw.includes("cm")) return value * 10;
  if (
    raw.includes("inches") ||
    raw.includes("inch") ||
    /(^|\s)in(\s|$)/.test(raw) ||
    raw.includes("\"")
  ) {
    return inchesToMm(value);
  }
  if (raw.includes("feet") || raw.includes("foot") || /(^|\s)ft(\s|$)/.test(raw)) {
    return inchesToMm(value * 12);
  }
  return value;
}

export function normalizeTumblerSpecs(
  analysis: TumblerImageAnalysisResult,
  candidates: TumblerSpecCandidate[]
): TumblerSpecSuggestion {
  const notes: string[] = [];
  const filtered = sortCandidates(getFilteredCandidates(candidates));

  if (filtered.length === 0) {
    notes.push("No high-trust spec pages matched. Using best-effort image guess.");
  }

  const overallHeightMm = pickDimension(filtered, "overallHeight");
  let outsideDiameterMm = pickDimension(filtered, "outsideDiameter");
  let topDiameterMm = pickDimension(filtered, "topDiameter");
  let bottomDiameterMm = pickDimension(filtered, "bottomDiameter");
  let usableHeightMm = pickDimension(filtered, "usableHeight");

  let shapeType = inferShapeType(
    analysis.shapeType,
    topDiameterMm,
    bottomDiameterMm,
    outsideDiameterMm
  );

  if (!isFinitePositive(outsideDiameterMm)) {
    if (shapeType === "tapered" && isFinitePositive(topDiameterMm) && isFinitePositive(bottomDiameterMm)) {
      outsideDiameterMm = (topDiameterMm + bottomDiameterMm) / 2;
    } else {
      outsideDiameterMm = topDiameterMm ?? bottomDiameterMm ?? null;
    }
  }

  if (shapeType === "straight" && isFinitePositive(outsideDiameterMm)) {
    topDiameterMm = topDiameterMm ?? outsideDiameterMm;
    bottomDiameterMm = bottomDiameterMm ?? outsideDiameterMm;
  }

  if (!isFinitePositive(usableHeightMm) && isFinitePositive(overallHeightMm)) {
    usableHeightMm = overallHeightMm * 0.82;
    notes.push("Usable height estimated conservatively from overall height.");
  }

  if (isFinitePositive(usableHeightMm) && isFinitePositive(overallHeightMm) && usableHeightMm > overallHeightMm) {
    usableHeightMm = overallHeightMm;
    notes.push("Usable height clamped to overall product height.");
  }

  if (shapeType === "unknown") {
    if (isFinitePositive(topDiameterMm) && isFinitePositive(bottomDiameterMm)) {
      shapeType = Math.abs(topDiameterMm - bottomDiameterMm) >= 2.5 ? "tapered" : "straight";
    } else if (isFinitePositive(outsideDiameterMm)) {
      shapeType = "straight";
    }
  }

  const confidence = calculateNormalizedConfidence({
    analysisConfidence: analysis.confidence,
    brandConfidence: analysis.brandResolution?.confidence ?? analysis.confidence,
    unresolvedBrand: analysis.brandResolution?.isUnknown ?? false,
    candidates: filtered,
    overallHeightMm,
    outsideDiameterMm,
    topDiameterMm,
    bottomDiameterMm,
    usableHeightMm,
  });

  const brand = pickText(analysis, filtered, "brand");
  const model = pickText(analysis, filtered, "model");
  const unresolvedBrand = brand === "unknown" || model === "unknown";
  if (unresolvedBrand) {
    notes.push("Brand not confidently confirmed; dimensions may be based on best match.");
  }

  return {
    productType: analysis.productType,
    brand,
    model,
    capacityOz: pickCapacity(analysis, filtered),
    hasHandle: pickBoolean(analysis, filtered, "hasHandle"),
    shapeType,
    overallHeightMm,
    outsideDiameterMm,
    topDiameterMm,
    bottomDiameterMm,
    usableHeightMm,
    confidence,
    brandConfidence: analysis.brandResolution?.confidence ?? confidence,
    familyHint: analysis.brandResolution?.familyHint ?? null,
    alternateCandidates: analysis.brandResolution?.topCandidates ?? [],
    manualBrandOverride: false,
    manualProfileOverrideId: undefined,
    sources: uniqueSources(filtered),
    notes: [...analysis.notes, ...notes],
  };
}

export function calculateTumblerTemplate(
  spec: Pick<
    TumblerSpecSuggestion,
    | "shapeType"
    | "outsideDiameterMm"
    | "topDiameterMm"
    | "bottomDiameterMm"
    | "overallHeightMm"
    | "usableHeightMm"
  >
): TumblerTemplateCalculation {
  const top = spec.topDiameterMm;
  const bottom = spec.bottomDiameterMm;
  const outside = spec.outsideDiameterMm;

  let shapeType = spec.shapeType;
  if (shapeType === "unknown") {
    if (isFinitePositive(top) && isFinitePositive(bottom)) {
      shapeType = Math.abs(top - bottom) >= 2.5 ? "tapered" : "straight";
    } else if (isFinitePositive(outside)) {
      shapeType = "straight";
    }
  }

  let averageDiameterMm: number | null = null;
  let diameterUsedMm = outside ?? top ?? bottom ?? 80;

  if (shapeType === "tapered") {
    const topValue = top ?? outside ?? 80;
    const bottomValue = bottom ?? outside ?? topValue;
    averageDiameterMm = (topValue + bottomValue) / 2;
    diameterUsedMm = averageDiameterMm;
  }

  if (!isFinitePositive(diameterUsedMm)) {
    diameterUsedMm = 80;
  }

  let templateHeightMm = spec.usableHeightMm ?? spec.overallHeightMm ?? 120;
  if (!isFinitePositive(templateHeightMm)) {
    templateHeightMm = 120;
  }

  return {
    shapeType,
    templateWidthMm: Math.PI * diameterUsedMm,
    templateHeightMm,
    diameterUsedMm,
    averageDiameterMm,
  };
}

export function getTumblerConfidenceLevel(confidence: number): TumblerConfidenceLevel {
  if (confidence < 0.55) return "low";
  if (confidence < 0.78) return "medium";
  return "high";
}

export function toTumblerSpecDraft(
  suggestion: TumblerSpecSuggestion,
  calculation?: TumblerTemplateCalculation
): TumblerSpecDraft {
  const computed = calculation ?? calculateTumblerTemplate(suggestion);
  return {
    ...suggestion,
    templateWidthMm: computed.templateWidthMm,
    templateHeightMm: computed.templateHeightMm,
  };
}

function toNormalizedMm(value: number | null | undefined): number | null {
  const normalized = value ?? null;
  if (!isFinitePositive(normalized)) return null;
  return normalized;
}

function normalizePossiblyInchesToMm(
  value: number | null | undefined,
  field: "diameter" | "height"
): number | null {
  const normalized = toNormalizedMm(value);
  if (!isFinitePositive(normalized)) return null;
  // Guardrail for raw numeric inch values coming from external providers.
  if (field === "diameter" && normalized <= 12) {
    return inchesToMm(normalized);
  }
  if (field === "height" && normalized <= 20) {
    return inchesToMm(normalized);
  }
  return normalized;
}

function normalizeDraftForApply(draft: TumblerSpecDraft): TumblerSpecDraft {
  return {
    ...draft,
    overallHeightMm: normalizePossiblyInchesToMm(draft.overallHeightMm, "height"),
    outsideDiameterMm: normalizePossiblyInchesToMm(draft.outsideDiameterMm, "diameter"),
    topDiameterMm: normalizePossiblyInchesToMm(draft.topDiameterMm, "diameter"),
    bottomDiameterMm: normalizePossiblyInchesToMm(draft.bottomDiameterMm, "diameter"),
    usableHeightMm: normalizePossiblyInchesToMm(draft.usableHeightMm, "height"),
  };
}

function isDevEnvironment(): boolean {
  return process.env.NODE_ENV !== "production";
}

function normalizeBrandFieldForStorage(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^(unknown|n\/a|none|generic)$/i.test(trimmed)) return undefined;
  return trimmed;
}

export function applyTumblerSuggestion(
  config: BedConfig,
  draft: TumblerSpecDraft
): BedConfig {
  const normalizedDraft = normalizeDraftForApply(draft);
  const calculation = calculateTumblerTemplate(normalizedDraft);

  const diameterForSettings =
    normalizedDraft.outsideDiameterMm ?? calculation.diameterUsedMm;

  const storedBrand = normalizeBrandFieldForStorage(normalizedDraft.brand);
  const storedModel = normalizeBrandFieldForStorage(normalizedDraft.model);
  const brandConfidence =
    normalizedDraft.brandConfidence ?? normalizedDraft.confidence;
  const isBrandValidated = Boolean(storedBrand) && brandConfidence >= 0.72;
  const manualBrandOverride = normalizedDraft.manualBrandOverride === true;

  const profileOverrideId = normalizedDraft.manualProfileOverrideId;
  const hasProfileOverride =
    typeof profileOverrideId === "string" && profileOverrideId.trim().length > 0;
  const overriddenProfile =
    hasProfileOverride ? getTumblerProfileById(profileOverrideId) : null;

  const autoProfileId =
    !hasProfileOverride && (manualBrandOverride || isBrandValidated)
      ? findTumblerProfileIdForBrandModel({
          brand: storedBrand,
          model: storedModel ?? null,
        })
      : null;
  const autoProfile = autoProfileId ? getTumblerProfileById(autoProfileId) : null;

  const nextProfileId = hasProfileOverride
    ? overriddenProfile?.id
    : autoProfile?.id;
  const nextGuideBand = hasProfileOverride
    ? overriddenProfile?.guideBand
    : autoProfile?.guideBand;

  const nextConfig = normalizeBedConfig({
    ...config,
    workspaceMode: "tumbler-wrap",
    tumblerDiameterMm: diameterForSettings,
    tumblerPrintableHeightMm: calculation.templateHeightMm,
    tumblerShapeType: calculation.shapeType,
    tumblerOutsideDiameterMm: normalizedDraft.outsideDiameterMm ?? undefined,
    tumblerTopDiameterMm: normalizedDraft.topDiameterMm ?? undefined,
    tumblerBottomDiameterMm: normalizedDraft.bottomDiameterMm ?? undefined,
    tumblerOverallHeightMm: normalizedDraft.overallHeightMm ?? undefined,
    tumblerUsableHeightMm: normalizedDraft.usableHeightMm ?? undefined,
    tumblerTemplateWidthMm: calculation.templateWidthMm,
    tumblerTemplateHeightMm: calculation.templateHeightMm,
    tumblerCapacityOz: normalizedDraft.capacityOz ?? undefined,
    tumblerHasHandle: normalizedDraft.hasHandle ?? undefined,
    tumblerBrand: storedBrand,
    tumblerModel: storedModel,
    tumblerProfileId: nextProfileId,
    tumblerGuideBand: nextGuideBand,
  });

  if (isDevEnvironment()) {
    console.info("[tumbler-auto-size] apply suggestion", {
      outsideDiameterMm: normalizedDraft.outsideDiameterMm,
      topDiameterMm: normalizedDraft.topDiameterMm,
      bottomDiameterMm: normalizedDraft.bottomDiameterMm,
      computedTemplateWidthMm: Number(calculation.templateWidthMm.toFixed(4)),
      computedTemplateHeightMm: Number(calculation.templateHeightMm.toFixed(4)),
      appliedWidthMm: Number(nextConfig.width.toFixed(4)),
      appliedHeightMm: Number(nextConfig.height.toFixed(4)),
      appliedDiameterMm: Number(nextConfig.tumblerDiameterMm.toFixed(4)),
    });
  }

  return nextConfig;
}

export function applyTumblerDraftToBedConfig(
  config: BedConfig,
  draft: TumblerSpecDraft
): BedConfig {
  return applyTumblerSuggestion(config, draft);
}

export function roundDisplayMm(value: number | null | undefined): string {
  if (!isFinitePositive(value ?? null)) return "--";
  return (value ?? 0).toFixed(2);
}

