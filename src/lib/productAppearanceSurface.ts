import type { PrintableSurfaceContract } from "../types/printableSurface.ts";
import type {
  EngravableGuideSource,
  EngravableZoneGuideAuthority,
} from "./engravableGuideAuthority.ts";
import {
  createBrandLogoReference,
  createFinishBandReference,
  type BrandLogoReference,
  type FinishBandReference,
  type ProductAppearanceReferenceLayer,
} from "./productAppearanceReferenceLayers.ts";

export type ProductAppearanceCoordinateSpace = "full-product-mm";

export type ProductAppearanceSurfaceAuthoritySource =
  | "manual-override"
  | "silver-band"
  | "printable-surface-contract"
  | "accepted-body-reference"
  | "fallback-body-frame"
  | "unknown";

export type ProductAppearanceBottomSafeInsetSource =
  | "lookup-profile"
  | "body-reference-profile"
  | "rounded-base-fallback"
  | "manual-override"
  | "none";

export interface ProductEngravableSurfaceBand {
  coordinateSpace: ProductAppearanceCoordinateSpace;
  printableTopMm: number;
  printableBottomMm: number;
  printableHeightMm: number;
  topGuideSource: EngravableGuideSource;
  bottomGuideSource: EngravableGuideSource;
  authoritySource: ProductAppearanceSurfaceAuthoritySource;
  bottomSafeInsetMm?: number;
  bottomSafeInsetSource?: ProductAppearanceBottomSafeInsetSource;
  bottomGuideAdjustedForLowerBowl?: boolean;
  bodyReferenceSourceHash?: string;
}

export interface ProductAppearanceManufacturerLogoInput {
  label?: string | null;
  source: ProductAppearanceReferenceLayer["source"];
  confidence?: number | null;
  centerXMm?: number | null;
  centerYMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  angleDeg?: number | null;
}

export interface ProductAppearanceSurfaceAuthority {
  coordinateSpace: ProductAppearanceCoordinateSpace;
  engravableSurface: ProductEngravableSurfaceBand;
  printableSurfaceContract: PrintableSurfaceContract;
  appearanceReferenceLayers: ProductAppearanceReferenceLayer[];
  silverBandLayer: FinishBandReference | null;
  manufacturerLogoLayer: BrandLogoReference | null;
  bodyColorHex?: string;
  rimColorHex?: string;
  warnings: string[];
}

export interface ResolveProductAppearanceSurfaceAuthorityArgs {
  overallHeightMm: number;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  engravableGuideAuthority?: EngravableZoneGuideAuthority | null;
  printableSurfaceContract?: PrintableSurfaceContract | null;
  existingAppearanceReferenceLayers?: readonly ProductAppearanceReferenceLayer[] | null;
  lidSeamFromOverallMm?: number | null;
  silverBandBottomFromOverallMm?: number | null;
  bodyColorHex?: string | null;
  rimColorHex?: string | null;
  bodyReferenceSourceHash?: string | null;
  manufacturerLogo?: ProductAppearanceManufacturerLogoInput | null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeLogoLabel(value: string | null | undefined): string | undefined {
  const label = normalizeString(value);
  if (!label) return undefined;
  const normalized = label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (
    normalized === "" ||
    normalized === "unknown" ||
    normalized === "unknown unknown" ||
    normalized === "unknown brand" ||
    normalized === "unavailable" ||
    normalized === "none" ||
    normalized === "n a" ||
    normalized === "generic" ||
    normalized === "generic tumbler" ||
    normalized === "generic bottle"
  ) {
    return undefined;
  }
  return label;
}

function resolveSurfaceAuthoritySource(
  topGuideSource: EngravableGuideSource,
  bottomGuideSource: EngravableGuideSource,
): ProductAppearanceSurfaceAuthoritySource {
  if (topGuideSource === "manual-override" || bottomGuideSource === "manual-override") {
    return "manual-override";
  }
  if (
    topGuideSource === "detected-lower-silver-seam" ||
    topGuideSource === "detected-silver-band-bottom"
  ) {
    return "silver-band";
  }
  if (
    topGuideSource === "saved-printable-surface-contract" ||
    bottomGuideSource === "saved-printable-surface-contract"
  ) {
    return "printable-surface-contract";
  }
  if (topGuideSource === "accepted-body-reference" || bottomGuideSource === "accepted-body-reference") {
    return "accepted-body-reference";
  }
  if (topGuideSource === "fallback-body-frame" || bottomGuideSource === "fallback-body-frame") {
    return "fallback-body-frame";
  }
  return "unknown";
}

function resolveLayerSourceFromGuideSource(
  guideSource: EngravableGuideSource | null | undefined,
): ProductAppearanceReferenceLayer["source"] {
  switch (guideSource) {
    case "detected-lower-silver-seam":
      return "auto-detect";
    case "detected-silver-band-bottom":
    case "saved-printable-surface-contract":
    case "manual-override":
      return "operator";
    case "accepted-body-reference":
    case "fallback-body-frame":
    case "unknown":
    default:
      return "unknown";
  }
}

function resolveRoundedBaseSafeInsetMm(args: {
  bodyTopMm: number;
  bodyBottomMm: number;
}): number {
  const bodyHeightMm = Math.max(0, args.bodyBottomMm - args.bodyTopMm);
  return round2(clamp(bodyHeightMm * 0.05, 6, 14));
}

function shouldApplyLowerBowlFallback(bottomGuideSource: EngravableGuideSource): boolean {
  return bottomGuideSource === "accepted-body-reference" || bottomGuideSource === "fallback-body-frame";
}

function resolveEngravableSurface(args: ResolveProductAppearanceSurfaceAuthorityArgs): ProductEngravableSurfaceBand {
  const overallHeightMm = Math.max(0, args.overallHeightMm);
  const bodyTopMm = round2(clamp(args.bodyTopFromOverallMm, 0, overallHeightMm));
  const bodyBottomMm = round2(clamp(args.bodyBottomFromOverallMm, bodyTopMm, overallHeightMm));
  const contractTopMm = args.printableSurfaceContract?.printableTopMm;
  const contractBottomMm = args.printableSurfaceContract?.printableBottomMm;
  const topGuideSource = args.engravableGuideAuthority?.topGuideSource ?? (
    isFiniteNumber(contractTopMm) ? "saved-printable-surface-contract" : "accepted-body-reference"
  );
  const bottomGuideSource = args.engravableGuideAuthority?.bottomGuideSource ?? (
    isFiniteNumber(contractBottomMm) ? "saved-printable-surface-contract" : "accepted-body-reference"
  );

  let topMm = args.engravableGuideAuthority?.topGuideMm;
  if (!isFiniteNumber(topMm)) {
    topMm = isFiniteNumber(contractTopMm) ? contractTopMm : bodyTopMm;
  }

  let bottomMm = args.engravableGuideAuthority?.bottomGuideMm;
  if (!isFiniteNumber(bottomMm)) {
    bottomMm = isFiniteNumber(contractBottomMm) ? contractBottomMm : bodyBottomMm;
  }

  const printableTopMm = round2(clamp(topMm, bodyTopMm, bodyBottomMm));
  const rawPrintableBottomMm = round2(clamp(bottomMm, printableTopMm, bodyBottomMm));
  let printableBottomMm = rawPrintableBottomMm;
  let bottomSafeInsetMm: number | undefined;
  let bottomSafeInsetSource: ProductAppearanceBottomSafeInsetSource = "none";
  let bottomGuideAdjustedForLowerBowl = false;

  if (shouldApplyLowerBowlFallback(bottomGuideSource)) {
    const lowerBowlSafeInsetMm = resolveRoundedBaseSafeInsetMm({ bodyTopMm, bodyBottomMm });
    const safeBottomMm = round2(clamp(bodyBottomMm - lowerBowlSafeInsetMm, printableTopMm, bodyBottomMm));
    const usefulHeightMm = Math.min(20, Math.max(0, bodyBottomMm - printableTopMm));
    const minUsefulBottomMm = round2(printableTopMm + usefulHeightMm);
    const adjustedBottomMm = bodyBottomMm - printableTopMm > usefulHeightMm
      ? round2(clamp(safeBottomMm, minUsefulBottomMm, bodyBottomMm))
      : safeBottomMm;

    if (adjustedBottomMm < rawPrintableBottomMm) {
      printableBottomMm = adjustedBottomMm;
      bottomGuideAdjustedForLowerBowl = true;
    }

    bottomSafeInsetMm = round2(Math.max(0, bodyBottomMm - printableBottomMm));
    bottomSafeInsetSource = bottomGuideAdjustedForLowerBowl ? "rounded-base-fallback" : "none";
  } else if (bottomGuideSource === "manual-override") {
    bottomSafeInsetSource = "manual-override";
  }

  return {
    coordinateSpace: "full-product-mm",
    printableTopMm,
    printableBottomMm,
    printableHeightMm: round2(Math.max(0, printableBottomMm - printableTopMm)),
    topGuideSource,
    bottomGuideSource,
    authoritySource: resolveSurfaceAuthoritySource(topGuideSource, bottomGuideSource),
    ...(bottomSafeInsetMm != null ? { bottomSafeInsetMm } : {}),
    bottomSafeInsetSource,
    bottomGuideAdjustedForLowerBowl,
    ...(normalizeString(args.bodyReferenceSourceHash)
      ? { bodyReferenceSourceHash: normalizeString(args.bodyReferenceSourceHash) }
      : {}),
  };
}

function buildPrintableSurfaceContract(
  surface: ProductEngravableSurfaceBand,
  existingContract: PrintableSurfaceContract | null | undefined,
): PrintableSurfaceContract {
  return {
    printableTopMm: surface.printableTopMm,
    printableBottomMm: surface.printableBottomMm,
    printableHeightMm: surface.printableHeightMm,
    axialExclusions: existingContract?.axialExclusions
      ? existingContract.axialExclusions.map((band) => ({ ...band }))
      : [],
    circumferentialExclusions: existingContract?.circumferentialExclusions
      ? existingContract.circumferentialExclusions.map((band) => ({ ...band }))
      : [],
  };
}

function buildSilverBandLayer(args: {
  overallHeightMm: number;
  lidSeamFromOverallMm?: number | null;
  silverBandBottomFromOverallMm?: number | null;
  topGuideSource?: EngravableGuideSource | null;
}): FinishBandReference | null {
  if (!isFiniteNumber(args.silverBandBottomFromOverallMm) || args.overallHeightMm <= 0) {
    return null;
  }

  const bottomMm = round2(clamp(args.silverBandBottomFromOverallMm, 0, args.overallHeightMm));
  const fallbackHeightMm = Math.min(4, Math.max(1.2, args.overallHeightMm * 0.012));
  const topMm = round2(clamp(
    isFiniteNumber(args.lidSeamFromOverallMm)
      ? args.lidSeamFromOverallMm
      : bottomMm - fallbackHeightMm,
    0,
    Math.max(0, bottomMm - 0.1),
  ));
  const heightMm = round2(Math.max(0.1, bottomMm - topMm));

  return createFinishBandReference({
    id: "upstream-silver-ring",
    kind: "top-finish-band",
    label: "Silver ring / lower band edge",
    yMm: topMm,
    heightMm,
    bodyRelative: "top",
    source: resolveLayerSourceFromGuideSource(args.topGuideSource),
    materialToken: "silver-finish",
    confidence:
      args.topGuideSource === "detected-lower-silver-seam" ||
      args.topGuideSource === "detected-silver-band-bottom"
        ? 0.92
        : 0.72,
  });
}

function buildManufacturerLogoLayer(
  args: ProductAppearanceManufacturerLogoInput | null | undefined,
  surface: ProductEngravableSurfaceBand,
): BrandLogoReference | null {
  const label = normalizeLogoLabel(args?.label);
  if (!args || !label) return null;

  const surfaceCenterY = surface.printableTopMm + surface.printableHeightMm * 0.28;
  return createBrandLogoReference({
    id: "upstream-front-brand-logo",
    kind: "front-brand-logo",
    label,
    source: args.source,
    confidence: isFiniteNumber(args.confidence) ? clamp(args.confidence, 0, 1) : undefined,
    centerXMm: isFiniteNumber(args.centerXMm) ? round2(args.centerXMm) : 0,
    centerYMm: isFiniteNumber(args.centerYMm) ? round2(args.centerYMm) : round2(surfaceCenterY),
    widthMm: isFiniteNumber(args.widthMm) ? round2(args.widthMm) : 32,
    heightMm: isFiniteNumber(args.heightMm) ? round2(args.heightMm) : 12,
    angleDeg: isFiniteNumber(args.angleDeg) ? round2(args.angleDeg) : 0,
  });
}

function mergeAppearanceLayers(args: {
  existingLayers: readonly ProductAppearanceReferenceLayer[];
  silverBandLayer: FinishBandReference | null;
  manufacturerLogoLayer: BrandLogoReference | null;
}): ProductAppearanceReferenceLayer[] {
  const result: ProductAppearanceReferenceLayer[] = [];
  const existingFrontLogo = args.existingLayers.find((layer) => layer.kind === "front-brand-logo");

  for (const layer of args.existingLayers) {
    if (args.silverBandLayer && layer.kind === "top-finish-band") continue;
    if (args.manufacturerLogoLayer && layer.kind === "front-brand-logo") continue;
    result.push({ ...layer });
  }

  if (args.silverBandLayer) {
    result.push(args.silverBandLayer);
  }

  if (existingFrontLogo) {
    result.push({ ...existingFrontLogo });
  } else if (args.manufacturerLogoLayer) {
    result.push(args.manufacturerLogoLayer);
  }

  return result;
}

export function resolveProductAppearanceSurfaceAuthority(
  args: ResolveProductAppearanceSurfaceAuthorityArgs,
): ProductAppearanceSurfaceAuthority {
  const engravableSurface = resolveEngravableSurface(args);
  const printableSurfaceContract = buildPrintableSurfaceContract(
    engravableSurface,
    args.printableSurfaceContract,
  );
  const silverBandBottomMm =
    isFiniteNumber(args.silverBandBottomFromOverallMm)
      ? args.silverBandBottomFromOverallMm
      : (
          engravableSurface.authoritySource === "silver-band"
            ? engravableSurface.printableTopMm
            : null
        );
  const silverBandLayer = buildSilverBandLayer({
    overallHeightMm: args.overallHeightMm,
    lidSeamFromOverallMm: args.lidSeamFromOverallMm,
    silverBandBottomFromOverallMm: silverBandBottomMm,
    topGuideSource: engravableSurface.topGuideSource,
  });
  const manufacturerLogoLayer = buildManufacturerLogoLayer(
    args.manufacturerLogo,
    engravableSurface,
  );
  const appearanceReferenceLayers = mergeAppearanceLayers({
    existingLayers: args.existingAppearanceReferenceLayers ?? [],
    silverBandLayer,
    manufacturerLogoLayer,
  });

  return {
    coordinateSpace: "full-product-mm",
    engravableSurface,
    printableSurfaceContract,
    appearanceReferenceLayers,
    silverBandLayer,
    manufacturerLogoLayer:
      appearanceReferenceLayers.find((layer): layer is BrandLogoReference => layer.kind === "front-brand-logo")
      ?? null,
    ...(normalizeString(args.bodyColorHex) ? { bodyColorHex: normalizeString(args.bodyColorHex) } : {}),
    ...(normalizeString(args.rimColorHex) ? { rimColorHex: normalizeString(args.rimColorHex) } : {}),
    warnings: args.engravableGuideAuthority?.warnings ?? [],
  };
}
