import type { ProductTemplate } from "../types/productTemplate.ts";
import type {
  TumblerDimensionSourceKind,
  TumblerItemLookupMode,
  TumblerProfileAuthority,
  TumblerSourceModelAvailability,
} from "../types/tumblerItemLookup.ts";

export interface ProfileAuthorityBadgeInput {
  mode?: TumblerItemLookupMode | null;
  profileAuthority?: TumblerProfileAuthority | null;
  dimensionSourceKind?: TumblerDimensionSourceKind | null;
  matchedProfileId?: string | null;
  sourceModelAvailability?: TumblerSourceModelAvailability | null;
  hasAcceptedBodyReference?: boolean;
  hasSourceModel?: boolean;
}

export interface ProfileAuthorityBadgeSummary {
  authority: TumblerProfileAuthority;
  label: string;
  dimensionSourceLabel: string;
  sourceModelAvailability: TumblerSourceModelAvailability;
  sourceModelAvailabilityLabel: string;
  requiresBodyReferenceReview: boolean;
}

export function getProfileAuthorityLabel(authority: TumblerProfileAuthority | null | undefined): string {
  switch (authority) {
    case "exact-internal-profile":
      return "Exact profile";
    case "official-dimensions-over-profile":
      return "Official dimensions";
    case "inferred-profile":
      return "Inferred profile";
    case "lookup-dimensions-only":
      return "Lookup dimensions";
    case "needs-body-reference":
      return "Needs BODY REFERENCE";
    case "unknown":
    default:
      return "Unknown profile";
  }
}

export function getDimensionSourceLabel(source: TumblerDimensionSourceKind | null | undefined): string {
  switch (source) {
    case "internal-profile":
      return "profile";
    case "official-page":
      return "official page";
    case "parsed-page":
      return "lookup parsed";
    case "operator-body-reference":
      return "operator/body reference";
    case "safe-fallback":
    default:
      return "fallback";
  }
}

export function getSourceModelAvailabilityLabel(
  availability: TumblerSourceModelAvailability | null | undefined,
): string {
  switch (availability) {
    case "verified-source-model":
      return "Source model available";
    case "generated-source-model":
      return "Generated source model";
    case "missing-source-model":
    default:
      return "Source model unavailable";
  }
}

function inferSourceModelAvailability(args: {
  sourceModelAvailability?: TumblerSourceModelAvailability | null;
  hasSourceModel?: boolean;
}): TumblerSourceModelAvailability {
  if (args.sourceModelAvailability) return args.sourceModelAvailability;
  return args.hasSourceModel ? "verified-source-model" : "missing-source-model";
}

export function summarizeProfileAuthorityBadge(
  args: ProfileAuthorityBadgeInput,
): ProfileAuthorityBadgeSummary {
  const sourceModelAvailability = inferSourceModelAvailability(args);
  let authority = args.profileAuthority ?? null;

  if (!authority) {
    if (args.mode === "matched-profile" && args.matchedProfileId) {
      authority = sourceModelAvailability === "missing-source-model"
        ? "needs-body-reference"
        : "exact-internal-profile";
    } else if (args.mode === "parsed-page") {
      authority = "lookup-dimensions-only";
    } else {
      authority = "unknown";
    }
  }

  const requiresBodyReferenceReview =
    !args.hasAcceptedBodyReference &&
    (
      authority === "official-dimensions-over-profile" ||
      authority === "inferred-profile" ||
      authority === "lookup-dimensions-only" ||
      authority === "needs-body-reference" ||
      authority === "unknown"
    );

  return {
    authority,
    label: getProfileAuthorityLabel(authority),
    dimensionSourceLabel: getDimensionSourceLabel(args.dimensionSourceKind),
    sourceModelAvailability,
    sourceModelAvailabilityLabel: getSourceModelAvailabilityLabel(sourceModelAvailability),
    requiresBodyReferenceReview,
  };
}

export function normalizeProductTemplateProfileAuthority(
  template: ProductTemplate,
): ProductTemplate {
  const sourceModelPath = template.sourceModelPath?.trim() || template.glbPath?.trim() || "";
  const sourceModelAvailability = template.sourceModelAvailability ?? (
    sourceModelPath ? "verified-source-model" : "missing-source-model"
  );
  const profileAuthority = template.profileAuthority ?? (
    template.matchedProfileId
      ? sourceModelAvailability === "missing-source-model"
        ? "needs-body-reference"
        : "exact-internal-profile"
      : template.lookupDimensions?.dimensionAuthority && template.lookupDimensions.dimensionAuthority !== "unknown"
        ? "lookup-dimensions-only"
        : "unknown"
  );

  return {
    ...template,
    profileAuthority,
    sourceModelAvailability,
    profileConfidence:
      typeof template.profileConfidence === "number"
        ? template.profileConfidence
        : template.lookupDimensions?.confidence ?? undefined,
    lookupSelectedSizeOz:
      typeof template.lookupSelectedSizeOz === "number"
        ? template.lookupSelectedSizeOz
        : template.lookupDimensions?.selectedSizeOz ?? undefined,
    lookupSelectedColorOrFinish:
      template.lookupSelectedColorOrFinish ?? template.lookupDimensions?.selectedColorOrFinish ?? undefined,
    lookupVariantLabel:
      template.lookupVariantLabel ?? template.lookupDimensions?.selectedVariantLabel ?? undefined,
  };
}
