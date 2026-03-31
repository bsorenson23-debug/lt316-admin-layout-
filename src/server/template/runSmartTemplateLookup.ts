import {
  findTumblerProfileIdForBrandModel,
  getProfileHandleArcDeg,
  getTumblerProfileById,
} from "@/data/tumblerProfiles";
import { inferFlatFamilyKey } from "@/lib/flatItemFamily";
import { lookupFlatItem } from "@/server/flatbed/lookupFlatItem";
import { runFlatBedAutoDetect } from "@/server/flatbed/runFlatBedAutoDetect";
import { lookupTumblerItem } from "@/server/tumbler/lookupTumblerItem";
import { runTumblerAutoSize } from "@/server/tumbler/runTumblerAutoSize";
import type { FlatBedAutoDetectResponse } from "@/server/flatbed/runFlatBedAutoDetect";
import type {
  SmartTemplateLookupCategory,
  SmartTemplateLookupPrompt,
  SmartTemplateLookupResponse,
} from "@/types/smartTemplateLookup";
import type { ProductTemplate } from "@/types/productTemplate";
import type { TumblerAutoSizeResponse } from "@/types/tumblerAutoSize";

export interface RunSmartTemplateLookupInput {
  lookupInput?: string;
  imageBytes?: Uint8Array;
  mimeType?: string;
  fileName?: string;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function isLikelyUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9.\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function productTypeFromText(value: string): Exclude<ProductTemplate["productType"], "flat"> | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (/\bmug\b|\bcoffee cup\b|\bcup\b/.test(normalized)) return "mug";
  if (/\bbottle\b|\bflask\b|\bcanteen\b|\bwater bottle\b/.test(normalized)) return "bottle";
  if (
    /\btumbler\b|\brambler\b|\bquencher\b|\biceflow\b|\btravel cup\b|\bskinny\b/.test(normalized)
  ) {
    return "tumbler";
  }
  return null;
}

function inferDrinkwareSubtype(args: {
  lookupInput?: string;
  tumblerLookupTitle?: string | null;
  tumblerLookupModel?: string | null;
  flatLabel?: string | null;
  imageLabel?: string | null;
}): Exclude<ProductTemplate["productType"], "flat"> {
  const joined = [
    args.lookupInput,
    args.tumblerLookupTitle,
    args.tumblerLookupModel,
    args.flatLabel,
    args.imageLabel,
  ]
    .filter(Boolean)
    .join(" ");

  return productTypeFromText(joined) ?? "tumbler";
}

function inferTumblerFinish(value: string): { materialSlug: string; materialLabel: string; laserType: ProductTemplate["laserType"] | null } | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (/\bpowder\b|\bpowder coat\b|\bpowder-coated\b/.test(normalized)) {
    return { materialSlug: "powder-coat", materialLabel: "Powder Coat", laserType: "co2" };
  }
  if (/\braw stainless\b|\bstainless\b|\buncoated\b|\bsteel\b/.test(normalized)) {
    return { materialSlug: "stainless-steel", materialLabel: "Stainless Steel", laserType: "fiber" };
  }
  if (/\banodized\b/.test(normalized)) {
    return { materialSlug: "anodized-aluminum", materialLabel: "Anodized Aluminum", laserType: "fiber" };
  }
  if (/\bpainted\b|\bpaint coat\b/.test(normalized)) {
    return { materialSlug: "painted-metal", materialLabel: "Painted Metal", laserType: "co2" };
  }
  if (/\bmatte\b/.test(normalized)) {
    return { materialSlug: "painted-metal", materialLabel: "Matte Finish Metal", laserType: "co2" };
  }
  return null;
}

function inferFlatLaserType(args: {
  materialSlug?: string | null;
  materialLabel?: string | null;
  label?: string | null;
}): ProductTemplate["laserType"] | null {
  const normalized = normalizeText(
    `${args.materialSlug ?? ""} ${args.materialLabel ?? ""} ${args.label ?? ""}`,
  );
  if (!normalized) return null;
  if (
    /\bstainless\b|\bsteel\b|\bbrass\b|\banodized\b|\baluminum\b|\baluminium\b|\bmetal\b/.test(normalized)
  ) {
    return "fiber";
  }
  if (
    /\bwood\b|\bbamboo\b|\bslate\b|\bceramic\b|\bacrylic\b|\bleather\b|\bmdf\b|\bglass\b|\brubber\b|\bpaper\b|\bfabric\b/.test(normalized)
  ) {
    return "co2";
  }
  if (/\bplastic\b|\babs\b|\bpolymer\b/.test(normalized)) {
    return "co2";
  }
  return null;
}

function averageDiameterMm(topDiameterMm: number | null | undefined, bottomDiameterMm: number | null | undefined): number | null {
  if (typeof topDiameterMm === "number" && Number.isFinite(topDiameterMm) && typeof bottomDiameterMm === "number" && Number.isFinite(bottomDiameterMm)) {
    return round2((topDiameterMm + bottomDiameterMm) / 2);
  }
  return null;
}

function calculateTemplateWidthMm(diameterMm: number | null | undefined): number | null {
  return typeof diameterMm === "number" && Number.isFinite(diameterMm) && diameterMm > 0
    ? round2(Math.PI * diameterMm)
    : null;
}

function buildDrinkwareName(args: {
  brand?: string | null;
  model?: string | null;
  capacityOz?: number | null;
  fallbackTitle?: string | null;
}): string | null {
  const pieces = [
    args.brand,
    args.model,
    typeof args.capacityOz === "number" && Number.isFinite(args.capacityOz) ? `${args.capacityOz}oz` : null,
  ].filter(Boolean);
  if (pieces.length > 0) return pieces.join(" ");
  return args.fallbackTitle ?? null;
}

function confidenceFromFlatVision(result: FlatBedAutoDetectResponse | null): number {
  if (!result) return 0;
  let score = result.confidence === "high" ? 0.82 : result.confidence === "medium" ? 0.58 : 0.32;
  if (result.matchedItemId) score += 0.08;
  if (typeof result.vision.widthMm === "number" && typeof result.vision.heightMm === "number") score += 0.04;
  if (result.vision.category === "drinkware") score -= 0.1;
  return clamp(score, 0, 0.94);
}

function confidenceFromTumblerAuto(result: TumblerAutoSizeResponse | null): number {
  if (!result) return 0;
  let score = clamp(result.suggestion.confidence, 0, 1);
  if (result.confidenceLevel === "high") score += 0.1;
  if (result.confidenceLevel === "medium") score += 0.04;
  if (result.suggestion.brand && result.suggestion.brand !== "unknown") score += 0.04;
  if (result.suggestion.model && result.suggestion.model !== "unknown") score += 0.04;
  return clamp(score, 0, 0.95);
}

function confidenceFromTumblerLookup(
  input: string,
  result: Awaited<ReturnType<typeof lookupTumblerItem>> | null,
): number {
  if (!result) return 0;
  let score = 0.34;
  if (result.matchedProfileId) score = 0.92;
  else if (result.mode === "parsed-page") score = 0.68;
  else if (result.mode === "safe-fallback") score = 0.44;

  if (
    result.dimensions.outsideDiameterMm ||
    result.dimensions.topDiameterMm ||
    result.dimensions.bottomDiameterMm
  ) {
    score += 0.08;
  }

  if (result.glbPath) score += 0.04;
  if (productTypeFromText(input)) score += 0.05;
  return clamp(score, 0, 0.98);
}

function confidenceFromFlatLookup(
  input: string,
  result: Awaited<ReturnType<typeof lookupFlatItem>> | null,
): number {
  if (!result) return 0;
  let score = clamp(result.confidence, 0, 1);
  if (result.matchedItemId) score += 0.08;
  if (result.mode === "catalog-match") score += 0.08;
  if (result.mode === "family-fallback") score -= 0.04;
  if (result.mode === "safe-fallback") score -= 0.12;

  const inputProductType = productTypeFromText(input);
  if (result.category === "drinkware" && inputProductType) {
    score = Math.min(score, 0.58);
  }

  return clamp(score, 0, 0.96);
}

function uniqueList(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function chooseCategory(args: {
  lookupInput: string;
  tumblerLookup: Awaited<ReturnType<typeof lookupTumblerItem>> | null;
  flatLookup: Awaited<ReturnType<typeof lookupFlatItem>> | null;
  tumblerAuto: TumblerAutoSizeResponse | null;
  flatAuto: FlatBedAutoDetectResponse | null;
}): {
  category: SmartTemplateLookupCategory;
  confidence: number;
  reason: string;
  drinkwareSubtype: Exclude<ProductTemplate["productType"], "flat">;
  flatConfidence: number;
  drinkwareConfidence: number;
} {
  const drinkwareSubtype = inferDrinkwareSubtype({
    lookupInput: args.lookupInput,
    tumblerLookupTitle: args.tumblerLookup?.title,
    tumblerLookupModel: args.tumblerLookup?.model,
    flatLabel: args.flatLookup?.label,
    imageLabel: args.flatAuto?.vision.label,
  });

  const drinkwareConfidence = Math.max(
    confidenceFromTumblerLookup(args.lookupInput, args.tumblerLookup),
    confidenceFromTumblerAuto(args.tumblerAuto),
  );
  const flatConfidence = Math.max(
    confidenceFromFlatLookup(args.lookupInput, args.flatLookup),
    confidenceFromFlatVision(args.flatAuto),
  );

  if (drinkwareConfidence < 0.42 && flatConfidence < 0.42) {
    return {
      category: "unknown",
      confidence: round2(Math.max(drinkwareConfidence, flatConfidence)),
      reason: "Signals were too weak to confidently classify the product.",
      drinkwareSubtype,
      flatConfidence,
      drinkwareConfidence,
    };
  }

  if (drinkwareConfidence >= flatConfidence + 0.06) {
    return {
      category: drinkwareSubtype,
      confidence: round2(drinkwareConfidence),
      reason: "Drinkware-specific lookup signals were stronger than flat-item matches.",
      drinkwareSubtype,
      flatConfidence,
      drinkwareConfidence,
    };
  }

  if (flatConfidence >= drinkwareConfidence + 0.06) {
    return {
      category: "flat",
      confidence: round2(flatConfidence),
      reason: "Flat-item matches and dimensions were stronger than drinkware signals.",
      drinkwareSubtype,
      flatConfidence,
      drinkwareConfidence,
    };
  }

  if (productTypeFromText(args.lookupInput)) {
    const inferred = productTypeFromText(args.lookupInput);
    return {
      category: inferred ?? "unknown",
      confidence: round2(Math.max(drinkwareConfidence, flatConfidence)),
      reason: "Lookup confidence was close, so the category was biased by the product text.",
      drinkwareSubtype,
      flatConfidence,
      drinkwareConfidence,
    };
  }

  return {
    category: drinkwareConfidence >= flatConfidence ? drinkwareSubtype : "flat",
    confidence: round2(Math.max(drinkwareConfidence, flatConfidence)),
    reason: "Lookup confidence was close, so the best overall match was selected.",
    drinkwareSubtype,
    flatConfidence,
    drinkwareConfidence,
  };
}

function inferTumblerPhotoLabel(result: Awaited<ReturnType<typeof lookupTumblerItem>> | null): string | null {
  if (!result?.imageUrl) return null;
  if (result.resolvedUrl) {
    try {
      const hostname = new URL(result.resolvedUrl).hostname.replace(/^www\./i, "");
      const [base] = hostname.split(".");
      if (base) return `${base.charAt(0).toUpperCase()}${base.slice(1)} product photo`;
    } catch {
      return "Lookup product photo";
    }
  }
  return "Lookup product photo";
}

function inferTumblerBackPhotoLabel(result: Awaited<ReturnType<typeof lookupTumblerItem>> | null): string | null {
  if (!result?.backImageUrl) return null;
  const source = inferTumblerPhotoLabel(result);
  if (!source) return "Lookup opposite-side photo";
  return source.replace("product photo", "opposite-side photo");
}

function inferMaterialLabelFromSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const labels: Record<string, string> = {
    "powder-coat": "Powder Coat",
    "stainless-steel": "Stainless Steel",
    "anodized-aluminum": "Anodized Aluminum",
    "painted-metal": "Painted Metal",
    ceramic: "Ceramic",
    slate: "Slate",
    "wood-hard": "Wood - Hard",
    "acrylic-cast": "Acrylic - Cast",
    "plastic-abs": "Plastic - ABS",
    brass: "Brass",
    glass: "Glass",
    "leather-natural": "Leather - Natural",
    "leather-synthetic": "Leather - Synthetic",
    rubber: "Rubber",
    paper: "Paper",
    fabric: "Fabric",
  };
  return labels[slug] ?? slug;
}

function buildPrompts(args: {
  category: SmartTemplateLookupCategory;
  laserType: ProductTemplate["laserType"] | null;
  glbPath: string | null;
  matchedProfileId: string | null;
  matchedFlatItemId: string | null;
  dimensionsResolved: boolean;
  requiresReview: boolean;
  flatLookup: Awaited<ReturnType<typeof lookupFlatItem>> | null;
}): SmartTemplateLookupPrompt[] {
  const prompts: SmartTemplateLookupPrompt[] = [];

  if (args.category === "unknown") {
    prompts.push("confirm-category");
  }
  if (!args.dimensionsResolved || args.requiresReview) {
    prompts.push("confirm-dimensions");
  }
  if (!args.laserType) {
    prompts.push("choose-laser-type");
  }
  prompts.push("choose-material-profile");

  if (args.category === "flat") {
    if (!args.glbPath || args.flatLookup?.requiresReview) {
      prompts.push("choose-model");
    }
  } else if (args.category !== "unknown") {
    prompts.push("choose-rotary-preset");
    if (!args.glbPath) {
      prompts.push("choose-model");
    }
    if (!args.matchedProfileId || args.glbPath) {
      prompts.push("map-tumbler");
    }
  }

  return [...new Set(prompts)];
}

function hasResolvedDrinkwareDimensions(args: {
  diameterMm: number | null;
  printHeightMm: number | null;
}): boolean {
  return typeof args.diameterMm === "number" && args.diameterMm > 0 &&
    typeof args.printHeightMm === "number" && args.printHeightMm > 0;
}

export async function runSmartTemplateLookup(
  input: RunSmartTemplateLookupInput,
): Promise<SmartTemplateLookupResponse> {
  const trimmedLookupInput = input.lookupInput?.trim() ?? "";
  const hasLookupInput = trimmedLookupInput.length > 0;
  const hasImage = Boolean(input.imageBytes && input.mimeType && input.fileName);

  if (!hasLookupInput && !hasImage) {
    throw new Error("Provide a product URL, search text, or an image.");
  }

  let tumblerLookup = hasLookupInput ? await lookupTumblerItem({ lookupInput: trimmedLookupInput }) : null;
  let flatLookup = hasLookupInput ? await lookupFlatItem({ lookupInput: trimmedLookupInput }) : null;

  const [tumblerAuto, flatAuto] = hasImage
    ? await Promise.all([
        runTumblerAutoSize({
          fileName: input.fileName!,
          mimeType: input.mimeType!,
          byteLength: input.imageBytes!.byteLength,
          imageBytes: input.imageBytes!,
        }),
        runFlatBedAutoDetect({
          fileName: input.fileName!,
          mimeType: input.mimeType!,
          imageBytes: input.imageBytes!,
        }),
      ])
    : [null, null];

  if (!tumblerLookup && tumblerAuto?.suggestion.confidence && tumblerAuto.suggestion.confidence >= 0.38) {
    const seed = buildDrinkwareName({
      brand: tumblerAuto.suggestion.brand,
      model: tumblerAuto.suggestion.model,
      capacityOz: tumblerAuto.suggestion.capacityOz,
      fallbackTitle: input.fileName ?? null,
    });
    if (seed) {
      try {
        tumblerLookup = await lookupTumblerItem({ lookupInput: seed });
      } catch {
        // Keep the vision-only result when text lookup fails.
      }
    }
  }

  if (!flatLookup) {
    const seed = flatAuto?.matchedItem?.label ?? flatAuto?.vision.label ?? null;
    if (seed) {
      try {
        flatLookup = await lookupFlatItem({ lookupInput: seed });
      } catch {
        // Keep the vision-only result when text lookup fails.
      }
    }
  }

  const categoryChoice = chooseCategory({
    lookupInput: trimmedLookupInput,
    tumblerLookup,
    flatLookup,
    tumblerAuto,
    flatAuto,
  });

  const sourceType = hasLookupInput && hasImage
    ? "mixed"
    : hasImage
      ? "image"
      : isLikelyUrl(trimmedLookupInput)
        ? "url"
        : "text";

  const warnings: string[] = [];
  const notes = uniqueList([
    ...(tumblerLookup?.notes ?? []),
    ...(flatLookup?.notes ?? []),
    ...(tumblerAuto?.suggestion.notes ?? []),
    ...(flatAuto?.vision.notes ?? []),
  ]);

  if (Math.abs(categoryChoice.drinkwareConfidence - categoryChoice.flatConfidence) <= 0.1) {
    warnings.push("Category confidence was close. Review the product type before saving.");
  }

  if (categoryChoice.category === "flat") {
    const matchedItem = flatAuto?.matchedItem ?? null;
    const materialSlug = flatLookup?.material ?? matchedItem?.material ?? flatAuto?.vision.material ?? null;
    const materialLabel =
      flatLookup?.materialLabel ??
      matchedItem?.materialLabel ??
      inferMaterialLabelFromSlug(flatAuto?.vision.material ?? null);
    const laserType = inferFlatLaserType({
      materialSlug,
      materialLabel,
      label: flatLookup?.label ?? matchedItem?.label ?? flatAuto?.vision.label ?? trimmedLookupInput,
    });

    const widthMm = flatLookup?.widthMm ?? matchedItem?.widthMm ?? flatAuto?.vision.widthMm ?? null;
    const heightMm = flatLookup?.heightMm ?? matchedItem?.heightMm ?? flatAuto?.vision.heightMm ?? null;
    const thicknessMm = flatLookup?.thicknessMm ?? matchedItem?.thicknessMm ?? flatAuto?.vision.thicknessMm ?? null;
    const glbPath = flatLookup?.glbPath ?? null;
    const familyKey = inferFlatFamilyKey({
      familyKey: flatLookup?.familyKey ?? null,
      glbPath,
      label: flatLookup?.label ?? matchedItem?.label ?? flatAuto?.vision.label ?? trimmedLookupInput,
    });
    const dimensionsResolved =
      typeof widthMm === "number" && widthMm > 0 &&
      typeof heightMm === "number" && heightMm > 0;
    const requiresReview =
      categoryChoice.confidence < 0.72 ||
      !dimensionsResolved ||
      Boolean(flatLookup?.requiresReview);

    if (!glbPath) warnings.push("No 3D model was resolved. Choose or upload a model before production use.");
    if (flatLookup?.isProxy) warnings.push("The current 3D model is a proxy family shape. Replace it before final production.");

    return {
      sourceType,
      category: "flat",
      confidence: categoryChoice.confidence,
      reviewRequired: requiresReview,
      matchedProfileId: null,
      matchedFlatItemId: flatLookup?.matchedItemId ?? matchedItem?.id ?? null,
      categoryReason: categoryChoice.reason,
      templateDraft: {
        name: (flatLookup?.label ?? matchedItem?.label ?? flatAuto?.vision.label ?? trimmedLookupInput) || null,
        brand: flatLookup?.brand ?? null,
        capacity: null,
        laserType,
        productType: "flat",
        materialSlug,
        materialLabel,
        productPhotoUrl: flatLookup?.imageUrl ?? null,
        productPhotoLabel: flatLookup?.imageUrl ? "Lookup product photo" : null,
        glbPath,
        dimensions: {
          templateWidthMm: typeof widthMm === "number" ? round2(widthMm) : null,
          printHeightMm: typeof heightMm === "number" ? round2(heightMm) : null,
          flatThicknessMm: typeof thicknessMm === "number" ? round2(thicknessMm) : null,
          flatFamilyKey: familyKey,
        },
      },
      nextPrompts: buildPrompts({
        category: "flat",
        laserType,
        glbPath,
        matchedProfileId: null,
        matchedFlatItemId: flatLookup?.matchedItemId ?? matchedItem?.id ?? null,
        dimensionsResolved,
        requiresReview,
        flatLookup,
      }),
      warnings: uniqueList([
        ...warnings,
        flatLookup?.requiresReview ? "The resolved flat item still needs review before saving." : null,
      ]),
      notes,
      flatLookupResult: flatLookup,
      tumblerLookupResult: tumblerLookup,
    };
  }

  const matchedProfileId =
    tumblerLookup?.matchedProfileId ??
    findTumblerProfileIdForBrandModel({
      brand: tumblerLookup?.brand ?? tumblerAuto?.suggestion.brand ?? null,
      model: tumblerLookup?.model ?? tumblerAuto?.suggestion.model ?? null,
      capacityOz: tumblerLookup?.capacityOz ?? tumblerAuto?.suggestion.capacityOz ?? null,
    });
  const matchedProfile = matchedProfileId ? getTumblerProfileById(matchedProfileId) : null;
  const finishInference = inferTumblerFinish([
    trimmedLookupInput,
    tumblerLookup?.title,
    tumblerLookup?.model,
    tumblerAuto?.suggestion.notes.join(" "),
  ].filter(Boolean).join(" "));

  const diameterMm =
    tumblerLookup?.dimensions.outsideDiameterMm ??
    matchedProfile?.outsideDiameterMm ??
    tumblerAuto?.suggestion.outsideDiameterMm ??
    averageDiameterMm(
      tumblerLookup?.dimensions.topDiameterMm ?? tumblerAuto?.suggestion.topDiameterMm ?? matchedProfile?.topDiameterMm ?? null,
      tumblerLookup?.dimensions.bottomDiameterMm ?? tumblerAuto?.suggestion.bottomDiameterMm ?? matchedProfile?.bottomDiameterMm ?? null,
    );
  const printHeightMm =
    tumblerLookup?.dimensions.usableHeightMm ??
    matchedProfile?.usableHeightMm ??
    tumblerAuto?.suggestion.usableHeightMm ??
    tumblerAuto?.calculation.templateHeightMm ??
    null;
  const overallHeightMm =
    tumblerLookup?.dimensions.overallHeightMm ??
    matchedProfile?.overallHeightMm ??
    tumblerAuto?.suggestion.overallHeightMm ??
    null;
  const topDiameterMm =
    tumblerLookup?.dimensions.topDiameterMm ??
    tumblerAuto?.suggestion.topDiameterMm ??
    matchedProfile?.topDiameterMm ??
    null;
  const bottomDiameterMm =
    tumblerLookup?.dimensions.bottomDiameterMm ??
    tumblerAuto?.suggestion.bottomDiameterMm ??
    matchedProfile?.bottomDiameterMm ??
    null;

  let topMarginMm: number | null = null;
  let bottomMarginMm: number | null = null;
  if (matchedProfile) {
    topMarginMm = matchedProfile.guideBand?.upperGrooveYmm ?? round2((matchedProfile.overallHeightMm - matchedProfile.usableHeightMm) / 2);
    bottomMarginMm = round2(Math.max(0, matchedProfile.overallHeightMm - matchedProfile.usableHeightMm - topMarginMm));
  } else if (
    typeof overallHeightMm === "number" &&
    Number.isFinite(overallHeightMm) &&
    typeof printHeightMm === "number" &&
    Number.isFinite(printHeightMm)
  ) {
    topMarginMm = round2((overallHeightMm - printHeightMm) / 2);
    bottomMarginMm = round2(Math.max(0, overallHeightMm - printHeightMm - topMarginMm));
  }

  const drinkwareCategory = categoryChoice.category === "unknown"
    ? categoryChoice.drinkwareSubtype
    : categoryChoice.category;
  const laserType = finishInference?.laserType ?? null;
  const dimensionsResolved = hasResolvedDrinkwareDimensions({ diameterMm, printHeightMm });
  const requiresReview =
    categoryChoice.confidence < 0.76 ||
    !dimensionsResolved ||
    !matchedProfileId;

  if (!matchedProfileId) {
    warnings.push("No internal tumbler profile matched exactly. Confirm the dimensions before saving.");
  }
  if (!tumblerLookup?.glbPath) {
    warnings.push("No tumbler model was resolved. Choose or upload a GLB before mapping orientation.");
  }

  const templateName = buildDrinkwareName({
    brand: tumblerLookup?.brand ?? tumblerAuto?.suggestion.brand ?? matchedProfile?.brand ?? null,
    model: tumblerLookup?.model ?? tumblerAuto?.suggestion.model ?? matchedProfile?.model ?? null,
    capacityOz: tumblerLookup?.capacityOz ?? tumblerAuto?.suggestion.capacityOz ?? matchedProfile?.capacityOz ?? null,
    fallbackTitle: tumblerLookup?.title ?? input.fileName ?? null,
  });

  const templateWidthMm =
    calculateTemplateWidthMm(diameterMm) ??
    tumblerAuto?.calculation.templateWidthMm ??
    null;
  const handleArcDeg =
    matchedProfile ? getProfileHandleArcDeg(matchedProfile) : tumblerAuto?.suggestion.hasHandle ? 90 : 0;
  const taperCorrection =
    typeof topDiameterMm === "number" && typeof bottomDiameterMm === "number" && topDiameterMm !== bottomDiameterMm
      ? topDiameterMm < bottomDiameterMm ? "top-narrow" : "bottom-narrow"
      : "none";

  return {
    sourceType,
    category: categoryChoice.category === "unknown" ? drinkwareCategory : categoryChoice.category,
    confidence: categoryChoice.confidence,
    reviewRequired: requiresReview,
    matchedProfileId: matchedProfileId ?? null,
    matchedFlatItemId: flatLookup?.matchedItemId ?? null,
    categoryReason: categoryChoice.reason,
    templateDraft: {
      name: templateName,
      brand: tumblerLookup?.brand ?? tumblerAuto?.suggestion.brand ?? matchedProfile?.brand ?? null,
      capacity:
        typeof (tumblerLookup?.capacityOz ?? tumblerAuto?.suggestion.capacityOz ?? matchedProfile?.capacityOz ?? null) === "number"
          ? `${tumblerLookup?.capacityOz ?? tumblerAuto?.suggestion.capacityOz ?? matchedProfile?.capacityOz}oz`
          : null,
      laserType,
      productType: categoryChoice.category === "unknown" ? drinkwareCategory : categoryChoice.category,
      materialSlug: finishInference?.materialSlug ?? null,
      materialLabel: finishInference?.materialLabel ?? null,
      productPhotoUrl: tumblerLookup?.imageUrl ?? null,
      productPhotoLabel: inferTumblerPhotoLabel(tumblerLookup),
      backPhotoUrl: tumblerLookup?.backImageUrl ?? null,
      backPhotoLabel: inferTumblerBackPhotoLabel(tumblerLookup),
      glbPath: tumblerLookup?.glbPath ?? null,
      dimensions: {
        diameterMm: typeof diameterMm === "number" ? round2(diameterMm) : null,
        printHeightMm: typeof printHeightMm === "number" ? round2(printHeightMm) : null,
        templateWidthMm: typeof templateWidthMm === "number" ? round2(templateWidthMm) : null,
        handleArcDeg,
        taperCorrection,
        overallHeightMm: typeof overallHeightMm === "number" ? round2(overallHeightMm) : null,
        topMarginMm,
        bottomMarginMm,
      },
    },
    nextPrompts: buildPrompts({
      category: categoryChoice.category === "unknown" ? drinkwareCategory : categoryChoice.category,
      laserType,
      glbPath: tumblerLookup?.glbPath ?? null,
      matchedProfileId: matchedProfileId ?? null,
      matchedFlatItemId: flatLookup?.matchedItemId ?? null,
      dimensionsResolved,
      requiresReview,
      flatLookup,
    }),
    warnings: uniqueList(warnings),
    notes,
    flatLookupResult: flatLookup,
    tumblerLookupResult: tumblerLookup,
  };
}
