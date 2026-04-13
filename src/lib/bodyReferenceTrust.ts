import type {
  BodyReferenceOutlineSeedMode,
  BodyReferenceSourceOrigin,
  BodyReferenceSourceTrust,
  ProductReferenceViewClass,
} from "../types/productTemplate";

export interface ResolveBodyReferenceTrustArgs {
  outlineSeedMode: BodyReferenceOutlineSeedMode | null;
  frontPhotoOrigin: "manual" | "lookup" | null;
  frontPhotoDataUrl: string;
  manualFrontConfirmed: boolean;
  preferredFrontReferenceViewClass?: ProductReferenceViewClass | null;
  persistedTrust?: BodyReferenceSourceTrust | null;
  persistedOutlineSeedMode?: BodyReferenceOutlineSeedMode | null;
  persistedSourceOrigin?: BodyReferenceSourceOrigin | null;
  persistedSourceViewClass?: ProductReferenceViewClass | null;
}

export interface ResolvedBodyReferenceTrust {
  trust: BodyReferenceSourceTrust;
  sourceOrigin: BodyReferenceSourceOrigin;
  sourceViewClass: ProductReferenceViewClass | null;
  outlineSeedMode: BodyReferenceOutlineSeedMode | null;
}

function normalizeNonEmptyString(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function resolveBodyReferenceTrust(
  args: ResolveBodyReferenceTrustArgs,
): ResolvedBodyReferenceTrust {
  const outlineSeedMode = args.outlineSeedMode ?? args.persistedOutlineSeedMode ?? null;
  const sourceViewClass = args.preferredFrontReferenceViewClass ?? args.persistedSourceViewClass ?? null;
  const persistedSourceOrigin = args.persistedSourceOrigin ?? "unknown";
  const hasManualFrontPhoto = normalizeNonEmptyString(args.frontPhotoDataUrl).length > 0;

  if (outlineSeedMode === "fit-debug-fallback") {
    return {
      trust: "fit-debug-fallback",
      sourceOrigin: "fit-debug",
      sourceViewClass,
      outlineSeedMode,
    };
  }

  if (hasManualFrontPhoto && args.manualFrontConfirmed) {
    return {
      trust: "trusted-front",
      sourceOrigin: "manual",
      sourceViewClass: "front",
      outlineSeedMode,
    };
  }

  if (hasManualFrontPhoto && args.frontPhotoOrigin === "manual") {
    return {
      trust: "manual-front-unclassified",
      sourceOrigin: "manual",
      sourceViewClass: "front",
      outlineSeedMode,
    };
  }

  if (sourceViewClass === "front-3q") {
    return {
      trust: "advisory-angled",
      sourceOrigin: args.frontPhotoOrigin === "lookup" ? "lookup" : persistedSourceOrigin,
      sourceViewClass,
      outlineSeedMode,
    };
  }

  if (sourceViewClass === "front") {
    return {
      trust: "manual-front-unclassified",
      sourceOrigin: args.frontPhotoOrigin === "lookup" ? "lookup" : persistedSourceOrigin,
      sourceViewClass,
      outlineSeedMode,
    };
  }

  if (args.persistedTrust) {
    return {
      trust: args.persistedTrust,
      sourceOrigin: persistedSourceOrigin,
      sourceViewClass,
      outlineSeedMode,
    };
  }

  return {
    trust: "manual-front-unclassified",
    sourceOrigin: persistedSourceOrigin,
    sourceViewClass,
    outlineSeedMode,
  };
}

export function isTrustedBodyReferenceSourceTrust(
  trust: BodyReferenceSourceTrust | null | undefined,
): boolean {
  return trust === "trusted-front";
}

export function getBodyReferenceTrustMessage(
  resolvedTrust: Pick<ResolvedBodyReferenceTrust, "trust" | "sourceOrigin" | "sourceViewClass">,
): string {
  switch (resolvedTrust.trust) {
    case "trusted-front":
      return "BODY REFERENCE is using a straight-on front source and is trusted for calibration.";
    case "advisory-angled":
      return "BODY REFERENCE is using an angled source for preview/trace seeding only; production readiness requires a straight-on front photo.";
    case "fit-debug-fallback":
      return "BODY REFERENCE is using fallback geometry and is not trace-authoritative.";
    case "manual-front-unclassified":
    default:
      if (resolvedTrust.sourceOrigin === "lookup" && resolvedTrust.sourceViewClass === "front") {
        return "BODY REFERENCE is using a straight-on lookup source for preview/trace seeding only; production readiness still requires an uploaded straight-on front photo.";
      }
      if (resolvedTrust.sourceOrigin === "manual") {
        return "BODY REFERENCE has a manual front photo but no saved trust provenance yet; review it and save the template again to mark the source as trusted.";
      }
      return "BODY REFERENCE is using an unclassified front source for preview/trace seeding only; production readiness requires a confirmed straight-on front photo.";
  }
}
