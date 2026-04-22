import type {
  DimensionAuthority,
  TumblerItemLookupDimensions,
} from "@/types/tumblerItemLookup";

export interface ProductDimensionAuthorityOptions {
  requireScaleDiameter?: boolean;
  requireExactVariantMatch?: boolean;
  manualOverrideDiameterMm?: number | null;
}

export interface ProductDimensionAuthoritySummary {
  status: "pass" | "warn" | "fail" | "unknown";
  readyForLookupScale: boolean;
  dimensionAuthority: DimensionAuthority;
  scaleDiameterMm?: number;
  bodyDiameterMm?: number;
  wrapDiameterMm?: number;
  wrapWidthMm?: number;
  fullProductHeightMm?: number;
  bodyHeightMm?: number;
  selectedVariantId?: string;
  selectedVariantLabel?: string;
  selectedSizeOz?: number;
  selectedColorOrFinish?: string;
  dimensionSourceUrl?: string;
  dimensionSourceText?: string;
  confidence?: number;
  variantStatus: "exact" | "generic" | "ambiguous" | "mismatch" | "unknown";
  heightIgnoredForScale: boolean;
  warnings: string[];
  errors: string[];
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isFinitePositive(value: number | null | undefined): value is number {
  return isFiniteNumber(value) && value > 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeMessages(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function computeWrapWidthFromDiameterValue(diameterMm: number | null | undefined): number | undefined {
  if (!isFinitePositive(diameterMm)) {
    return undefined;
  }
  return round2(Math.PI * diameterMm);
}

export function computeWrapWidthFromDiameterMm(
  diameterMm: number | null | undefined,
): number | undefined {
  return computeWrapWidthFromDiameterValue(diameterMm);
}

export function summarizeProductDimensionAuthority(
  dimensions: TumblerItemLookupDimensions | null | undefined,
  options: ProductDimensionAuthorityOptions = {},
): ProductDimensionAuthoritySummary {
  const normalized = dimensions ?? null;
  const warnings: string[] = [];
  const errors: string[] = [];

  const selectedSizeOz = isFinitePositive(normalized?.selectedSizeOz)
    ? normalized?.selectedSizeOz
    : undefined;
  const titleSizeOz = isFinitePositive(normalized?.titleSizeOz)
    ? normalized?.titleSizeOz
    : undefined;
  const dimensionSourceSizeOz = isFinitePositive(normalized?.dimensionSourceSizeOz)
    ? normalized?.dimensionSourceSizeOz
    : undefined;
  const availableSizeOz = [...new Set((normalized?.availableSizeOz ?? []).filter(isFinitePositive))].sort((left, right) => left - right);
  const availableVariantLabels = normalizeMessages(normalized?.availableVariantLabels ?? []);
  const hasMultipleSizeOptions = availableSizeOz.length > 1;
  const hasMultipleVariantLabels = availableVariantLabels.length > 1;
  const hasMultipleVariants = hasMultipleSizeOptions || hasMultipleVariantLabels;

  const manualOverrideDiameterMm = isFinitePositive(options.manualOverrideDiameterMm)
    ? round2(options.manualOverrideDiameterMm)
    : undefined;
  if (!normalized && !manualOverrideDiameterMm) {
    return {
      status: "unknown",
      readyForLookupScale: false,
      dimensionAuthority: "unknown",
      variantStatus: "unknown",
      heightIgnoredForScale: false,
      warnings: [],
      errors: [],
    };
  }
  const diameterMm = isFinitePositive(normalized?.diameterMm)
    ? round2(normalized?.diameterMm)
    : isFinitePositive(normalized?.outsideDiameterMm)
      ? round2(normalized?.outsideDiameterMm)
      : undefined;
  const bodyDiameterMm = isFinitePositive(normalized?.bodyDiameterMm)
    ? round2(normalized?.bodyDiameterMm)
    : undefined;
  const wrapDiameterMm = isFinitePositive(normalized?.wrapDiameterMm)
    ? round2(normalized?.wrapDiameterMm)
    : diameterMm;
  const bodyHeightMm = isFinitePositive(normalized?.bodyHeightMm)
    ? round2(normalized?.bodyHeightMm)
    : isFinitePositive(normalized?.usableHeightMm)
      ? round2(normalized?.usableHeightMm)
      : undefined;
  const fullProductHeightMm = isFinitePositive(normalized?.fullProductHeightMm)
    ? round2(normalized?.fullProductHeightMm)
    : isFinitePositive(normalized?.overallHeightMm)
      ? round2(normalized?.overallHeightMm)
      : undefined;

  let dimensionAuthority: DimensionAuthority = normalized?.dimensionAuthority ?? "unknown";
  let scaleDiameterMm: number | undefined;

  if (manualOverrideDiameterMm) {
    dimensionAuthority = "manual-override";
    scaleDiameterMm = manualOverrideDiameterMm;
  } else if (dimensionAuthority === "body-diameter-primary" && bodyDiameterMm) {
    scaleDiameterMm = bodyDiameterMm;
  } else if (dimensionAuthority === "wrap-diameter-primary" && wrapDiameterMm) {
    scaleDiameterMm = wrapDiameterMm;
  } else if (diameterMm) {
    scaleDiameterMm = diameterMm;
    if (dimensionAuthority === "unknown") {
      dimensionAuthority = "diameter-primary";
    }
  } else if (bodyDiameterMm) {
    dimensionAuthority = "body-diameter-primary";
    scaleDiameterMm = bodyDiameterMm;
  } else if (wrapDiameterMm) {
    dimensionAuthority = "wrap-diameter-primary";
    scaleDiameterMm = wrapDiameterMm;
  }

  const wrapWidthMm = computeWrapWidthFromDiameterValue(scaleDiameterMm ?? wrapDiameterMm);
  const requireExactVariantMatch = options.requireExactVariantMatch ?? true;
  const requireScaleDiameter = options.requireScaleDiameter ?? false;

  let variantStatus: ProductDimensionAuthoritySummary["variantStatus"] = "unknown";
  if (hasMultipleVariants && !selectedSizeOz && !(normalized?.selectedVariantId || normalized?.selectedVariantLabel)) {
    variantStatus = "ambiguous";
    const message =
      "Lookup dimensions are ambiguous because the product page exposes multiple size or variant options and no exact selection was captured.";
    if (requireExactVariantMatch) {
      errors.push(message);
    } else {
      warnings.push(message);
    }
  } else if (selectedSizeOz && dimensionSourceSizeOz && selectedSizeOz !== dimensionSourceSizeOz) {
    variantStatus = "mismatch";
    errors.push(
      `Lookup dimensions appear to belong to ${dimensionSourceSizeOz} oz, not the selected ${selectedSizeOz} oz variant.`,
    );
  } else if (titleSizeOz && dimensionSourceSizeOz && titleSizeOz !== dimensionSourceSizeOz) {
    variantStatus = "mismatch";
    errors.push(
      `Lookup dimensions appear to belong to ${dimensionSourceSizeOz} oz while the resolved title indicates ${titleSizeOz} oz.`,
    );
  } else if (selectedSizeOz && dimensionSourceSizeOz && selectedSizeOz === dimensionSourceSizeOz) {
    variantStatus = "exact";
  } else if (selectedSizeOz && hasMultipleVariants) {
    variantStatus = "generic";
    warnings.push(
      `Lookup dimensions were taken from generic page content for the selected ${selectedSizeOz} oz variant. Variant-specific confirmation is still recommended.`,
    );
  } else if (!hasMultipleVariants && scaleDiameterMm) {
    variantStatus = "generic";
  }

  if (!scaleDiameterMm) {
    const message = "Lookup diameter authority is missing a usable diameter for body-reference scale.";
    if (requireScaleDiameter) {
      errors.push(message);
    } else {
      warnings.push(message);
    }
  }

  if (
    dimensionAuthority === "unknown" &&
    !manualOverrideDiameterMm &&
    !scaleDiameterMm
  ) {
    warnings.push("Lookup dimension authority is unknown.");
  }

  if (
    fullProductHeightMm &&
    bodyHeightMm &&
    fullProductHeightMm < bodyHeightMm
  ) {
    warnings.push(
      "Lookup full product height is smaller than the parsed body height. Height will be treated as context only until the variant is verified.",
    );
  }

  const heightIgnoredForScale = Boolean(fullProductHeightMm);
  if (heightIgnoredForScale) {
    warnings.push("Full product height is stored for context and ignored for lookup-based body contour scale.");
  }

  if (hasMultipleSizeOptions && selectedSizeOz && !availableSizeOz.includes(selectedSizeOz)) {
    warnings.push(
      `Selected ${selectedSizeOz} oz variant is not present in the parsed page size options (${availableSizeOz.join(", ")} oz).`,
    );
  }

  if (!normalized?.dimensionSourceUrl && normalized?.productUrl) {
    warnings.push("Lookup dimensions do not record the exact source block URL.");
  }

  const normalizedWarnings = normalizeMessages(warnings);
  const normalizedErrors = normalizeMessages(errors);
  const status: ProductDimensionAuthoritySummary["status"] =
    normalizedErrors.length > 0
      ? "fail"
      : !normalized
        ? "unknown"
        : normalizedWarnings.length > 0
          ? "warn"
          : "pass";

  return {
    status,
    readyForLookupScale:
      normalizedErrors.length === 0 &&
      isFinitePositive(scaleDiameterMm) &&
      variantStatus !== "ambiguous" &&
      variantStatus !== "mismatch",
    dimensionAuthority,
    scaleDiameterMm,
    bodyDiameterMm,
    wrapDiameterMm: scaleDiameterMm ?? wrapDiameterMm,
    wrapWidthMm,
    fullProductHeightMm,
    bodyHeightMm,
    selectedVariantId: normalized?.selectedVariantId ?? undefined,
    selectedVariantLabel: normalized?.selectedVariantLabel ?? undefined,
    selectedSizeOz,
    selectedColorOrFinish: normalized?.selectedColorOrFinish ?? undefined,
    dimensionSourceUrl: normalized?.dimensionSourceUrl ?? undefined,
    dimensionSourceText: normalized?.dimensionSourceText ?? undefined,
    confidence: isFiniteNumber(normalized?.confidence) ? normalized?.confidence ?? undefined : undefined,
    variantStatus,
    heightIgnoredForScale,
    warnings: normalizedWarnings,
    errors: normalizedErrors,
  };
}
