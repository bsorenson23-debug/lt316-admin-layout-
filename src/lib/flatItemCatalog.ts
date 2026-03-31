import { FLAT_BED_ITEMS, type FlatBedItem } from "@/data/flatBedItems";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export type FlatCatalogMatchMode =
  | "catalog-match"
  | "family-fallback"
  | "metadata-fallback"
  | "safe-fallback";

export type FlatCatalogMatch = {
  item: FlatBedItem;
  familyKey: string;
  confidence: number;
  mode: FlatCatalogMatchMode;
};

export function normalizeLookupText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9.\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractLookupText(input: string): string {
  const trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    return decodeURIComponent(url.pathname)
      .split("/")
      .filter(Boolean)
      .at(-1)
      ?.replace(/\.[a-z0-9]+$/i, "")
      ?.replace(/[-_]+/g, " ")
      ?.trim() || trimmed;
  } catch {
    return trimmed;
  }
}

export function tokenizeLookupText(value: string): string[] {
  return normalizeLookupText(value)
    .split(" ")
    .filter((token) => token.length >= 2);
}

const FLAT_LOOKUP_STOPWORDS = new Set([
  "com",
  "www",
  "http",
  "https",
  "item",
  "items",
  "product",
  "products",
  "warehouse",
  "shop",
  "store",
  "sale",
  "buy",
  "pack",
  "black",
  "fde",
  "odg",
  "gen",
  "m2",
  "moe",
  "round",
]);

const FLAT_LOOKUP_ALIASES: Record<string, string[]> = {
  "ss-plate-10in": ["plate", "dish", "dinner plate", "steel plate"],
  "ss-tray-12x8": ["tray", "serving tray", "steel tray"],
  "cutting-board-bamboo-12x8": ["cutting board", "board", "bamboo board", "charcuterie board"],
  "wood-charcuterie-14x10": ["charcuterie board", "serving board", "wood board"],
  "slate-coaster-4in": ["coaster", "round coaster", "slate coaster"],
  "slate-coaster-4in-square": ["square coaster", "slate square coaster"],
  "ceramic-tile-4x4": ["tile", "ceramic tile", "4x4 tile"],
  "dog-tag-ss": ["dog tag", "military tag", "tag"],
  "anodized-keychain": ["keychain", "key tag", "tag blank"],
  "business-card-aluminum": ["business card", "metal card", "wallet insert"],
  "business-card-ss": ["stainless business card", "metal business card", "wallet insert"],
  "phone-case-flat": ["phone case", "case", "iphone case", "galaxy case"],
  "ss-card-wallet": ["wallet insert", "metal wallet card", "card wallet"],
};

const FLAT_LOOKUP_FALLBACKS: Array<FlatBedItem & { lookupAliases: string[]; familyKey: string }> = [
  {
    id: "fallback-polymer-rifle-magazine",
    label: "Polymer Rifle Magazine",
    category: "other",
    widthMm: 66,
    heightMm: 178,
    thicknessMm: 28,
    material: "plastic-abs",
    materialLabel: "Plastic - ABS",
    productHint: "magazine",
    notes: "Heuristic flat-item lookup. Verify physical dimensions before saving.",
    lookupAliases: ["pmag", "magpul", "magazine", "rifle magazine", "ar15 magazine", "stanag", "223", "556"],
    familyKey: "magazine",
  },
  {
    id: "fallback-pistol-magazine",
    label: "Pistol Magazine",
    category: "other",
    widthMm: 38,
    heightMm: 130,
    thicknessMm: 20,
    material: "plastic-abs",
    materialLabel: "Plastic - ABS",
    productHint: "magazine",
    notes: "Heuristic flat-item lookup. Verify physical dimensions before saving.",
    lookupAliases: ["pistol magazine", "glock magazine", "handgun mag", "9mm magazine", "magazine"],
    familyKey: "magazine",
  },
  {
    id: "fallback-knife-handle",
    label: "Knife Handle / Blade Blank",
    category: "other",
    widthMm: 32,
    heightMm: 118,
    thicknessMm: 6,
    material: "stainless-steel",
    materialLabel: "Stainless Steel",
    productHint: "knife",
    notes: "Heuristic flat-item lookup. Verify physical dimensions before saving.",
    lookupAliases: ["knife", "blade", "pocket knife", "folder", "edc knife"],
    familyKey: "knife-blank",
  },
];

function buildFlatLookupHaystack(item: FlatBedItem): string {
  const aliases = FLAT_LOOKUP_ALIASES[item.id] ?? [];
  return normalizeLookupText(
    `${item.label} ${item.materialLabel} ${item.material} ${item.category} ${item.productHint ?? ""} ${item.id} ${aliases.join(" ")}`,
  );
}

function scoreFlatLookupTokens(tokens: string[], haystack: string): number {
  if (tokens.length === 0) return 0;

  let score = 0;
  let weightedCount = 0;
  for (const token of tokens) {
    if (FLAT_LOOKUP_STOPWORDS.has(token)) continue;
    weightedCount += 1;
    if (!haystack.includes(token)) continue;
    score += token.length >= 4 ? 1.4 : 0.7;
  }

  return weightedCount > 0 ? score / weightedCount : 0;
}

export function inferMaterialFromText(text: string): Pick<FlatBedItem, "material" | "materialLabel"> {
  const normalized = normalizeLookupText(text);
  if (/stainless|ss\b|steel/.test(normalized)) return { material: "stainless-steel", materialLabel: "Stainless Steel" };
  if (/anodized|aluminum|aluminium/.test(normalized)) return { material: "anodized-aluminum", materialLabel: "Anodized Aluminum" };
  if (/brass/.test(normalized)) return { material: "brass", materialLabel: "Brass" };
  if (/slate/.test(normalized)) return { material: "slate", materialLabel: "Slate" };
  if (/bamboo|wood|walnut|oak|acacia|charcuterie|cutting board/.test(normalized)) return { material: "wood-hard", materialLabel: "Wood - Hard" };
  if (/ceramic|tile/.test(normalized)) return { material: "ceramic", materialLabel: "Ceramic" };
  if (/glass/.test(normalized)) return { material: "glass", materialLabel: "Glass" };
  if (/leather/.test(normalized)) return { material: "leather-natural", materialLabel: "Leather - Natural" };
  if (/plastic|polymer|abs|pmag|magazine|phone case/.test(normalized)) return { material: "plastic-abs", materialLabel: "Plastic - ABS" };
  if (/acrylic/.test(normalized)) return { material: "acrylic-cast", materialLabel: "Acrylic - Cast" };
  return { material: "plastic-abs", materialLabel: "Plastic - ABS" };
}

export function inferFlatFamilyKey(text: string, item?: FlatBedItem | null): string {
  const normalized = normalizeLookupText(`${text} ${item?.label ?? ""} ${item?.id ?? ""}`);
  if (/magazine|pmag|stanag|glock/.test(normalized)) return "magazine";
  if (/knife|blade|folder|edc/.test(normalized)) return "knife-blank";
  if (/dog tag/.test(normalized)) return "dog-tag";
  if (/keychain|key tag/.test(normalized)) return "keychain";
  if (/phone case|iphone|galaxy case/.test(normalized)) return "phone-case";
  if (/wallet|business card|card/.test(normalized)) return "card";
  if (/coaster|ornament|round/.test(normalized)) return "round-plate";
  if (/plate|tray|platter|board|tile|sign|plaque/.test(normalized)) return "rect-plate";
  return "rect-plate";
}

export function findFlatItemLookupMatch(input: string): FlatCatalogMatch | null {
  const lookupTokens = tokenizeLookupText(extractLookupText(input));
  if (lookupTokens.length === 0) return null;

  let bestMatch: FlatBedItem | null = null;
  let bestScore = 0;

  for (const item of FLAT_BED_ITEMS) {
    const haystack = buildFlatLookupHaystack(item);
    const score = scoreFlatLookupTokens(lookupTokens, haystack);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = item;
    }
  }

  if (bestMatch && bestScore >= 0.72) {
    return {
      item: bestMatch,
      familyKey: inferFlatFamilyKey(input, bestMatch),
      confidence: round2(Math.min(0.98, 0.55 + bestScore * 0.4)),
      mode: "catalog-match",
    };
  }

  let bestFallback: (FlatBedItem & { familyKey: string }) | null = null;
  let bestFallbackScore = 0;
  for (const fallback of FLAT_LOOKUP_FALLBACKS) {
    const haystack = normalizeLookupText(
      `${fallback.label} ${fallback.materialLabel} ${fallback.material} ${fallback.category} ${fallback.productHint ?? ""} ${fallback.lookupAliases.join(" ")}`,
    );
    const score = scoreFlatLookupTokens(lookupTokens, haystack);
    if (score > bestFallbackScore) {
      bestFallbackScore = score;
      bestFallback = fallback;
    }
  }

  if (bestFallback && bestFallbackScore >= 0.6) {
    return {
      item: bestFallback,
      familyKey: bestFallback.familyKey,
      confidence: round2(Math.min(0.9, 0.45 + bestFallbackScore * 0.45)),
      mode: "family-fallback",
    };
  }

  return null;
}

export function buildMetadataFallbackItem(args: {
  label: string;
  inputText: string;
  widthMm: number | null;
  heightMm: number | null;
  thicknessMm: number | null;
  material?: string | null;
  materialLabel?: string | null;
}): FlatCatalogMatch {
  const material = args.material && args.materialLabel
    ? { material: args.material, materialLabel: args.materialLabel }
    : inferMaterialFromText(args.inputText);

  const widthMm = round2(Math.max(20, args.widthMm ?? 80));
  const heightMm = round2(Math.max(20, args.heightMm ?? 120));
  const thicknessMm = round2(Math.max(0.8, args.thicknessMm ?? 4));
  const familyKey = inferFlatFamilyKey(args.inputText);

  return {
    item: {
      id: `generated-${familyKey}`,
      label: args.label,
      category: "other",
      widthMm,
      heightMm,
      thicknessMm,
      material: material.material,
      materialLabel: material.materialLabel,
      productHint: familyKey,
      notes: "Generated from product metadata. Verify before saving.",
    },
    familyKey,
    confidence: args.widthMm && args.heightMm ? 0.72 : 0.4,
    mode: args.widthMm && args.heightMm ? "metadata-fallback" : "safe-fallback",
  };
}
