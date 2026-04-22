export type ProductAppearanceLayerKind =
  | "top-finish-band"
  | "bottom-finish-band"
  | "front-brand-logo"
  | "back-brand-logo"
  | "handle-reference"
  | "lid-reference"
  | "blocked-region";

export type AppearanceReferenceVisibility =
  | "visible"
  | "hidden"
  | "debug-only";

export type AppearanceMaterialToken =
  | "silver-finish"
  | "factory-logo"
  | "reference-outline"
  | "keep-out"
  | "unknown";

export interface ProductAppearanceReferenceLayerBase {
  id: string;
  kind: ProductAppearanceLayerKind;
  label: string;
  referenceOnly: true;
  includedInBodyCutoutQa: false;
  visibility: AppearanceReferenceVisibility;
  materialToken: AppearanceMaterialToken;
  source: "operator" | "auto-detect" | "lookup" | "unknown";
  confidence?: number;
}

export interface FinishBandReference extends ProductAppearanceReferenceLayerBase {
  kind: "top-finish-band" | "bottom-finish-band";
  yMm?: number;
  heightMm?: number;
  bodyRelative?: "top" | "bottom";
}

export interface BrandLogoReference extends ProductAppearanceReferenceLayerBase {
  kind: "front-brand-logo" | "back-brand-logo";
  centerXMm?: number;
  centerYMm?: number;
  widthMm?: number;
  heightMm?: number;
  angleDeg?: number;
}

export interface GenericAppearanceReferenceLayer extends ProductAppearanceReferenceLayerBase {
  kind: "handle-reference" | "lid-reference" | "blocked-region";
}

export type ProductAppearanceReferenceLayer =
  | FinishBandReference
  | BrandLogoReference
  | GenericAppearanceReferenceLayer;

export interface AppearanceReferenceLayerValidation {
  status: "pass" | "warn";
  warnings: string[];
  bodyCutoutQaSafe: boolean;
}

export interface ProductAppearanceReferenceSummary {
  totalLayers: number;
  visibleLayerCount: number;
  topFinishBandPresent: boolean;
  bottomFinishBandPresent: boolean;
  frontLogoReferencePresent: boolean;
  backLogoReferencePresent: boolean;
  frontCenterAngleDeg?: number;
  backLogoAngleDeg?: number;
  warnings: string[];
  bodyCutoutQaSafe: boolean;
}

interface FinishBandReferenceArgs {
  id: string;
  kind: FinishBandReference["kind"];
  label?: string;
  visibility?: AppearanceReferenceVisibility;
  materialToken?: AppearanceMaterialToken;
  source?: ProductAppearanceReferenceLayerBase["source"];
  confidence?: number;
  yMm?: number;
  heightMm?: number;
  bodyRelative?: FinishBandReference["bodyRelative"];
}

interface BrandLogoReferenceArgs {
  id: string;
  kind: BrandLogoReference["kind"];
  label?: string;
  visibility?: AppearanceReferenceVisibility;
  materialToken?: AppearanceMaterialToken;
  source?: ProductAppearanceReferenceLayerBase["source"];
  confidence?: number;
  centerXMm?: number;
  centerYMm?: number;
  widthMm?: number;
  heightMm?: number;
  angleDeg?: number;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeAngleDeg(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function dedupeWarnings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function createFinishBandReference(
  args: FinishBandReferenceArgs,
): FinishBandReference {
  return {
    id: args.id,
    kind: args.kind,
    label:
      args.label ??
      (args.kind === "top-finish-band" ? "Top finish band" : "Bottom finish band"),
    referenceOnly: true,
    includedInBodyCutoutQa: false,
    visibility: args.visibility ?? "visible",
    materialToken: args.materialToken ?? "silver-finish",
    source: args.source ?? "unknown",
    ...(args.confidence != null ? { confidence: args.confidence } : {}),
    ...(args.yMm != null ? { yMm: args.yMm } : {}),
    ...(args.heightMm != null ? { heightMm: args.heightMm } : {}),
    bodyRelative: args.bodyRelative ?? (args.kind === "top-finish-band" ? "top" : "bottom"),
  };
}

export function createBrandLogoReference(
  args: BrandLogoReferenceArgs,
): BrandLogoReference {
  return {
    id: args.id,
    kind: args.kind,
    label:
      args.label ??
      (args.kind === "front-brand-logo" ? "Front factory logo" : "Back factory logo"),
    referenceOnly: true,
    includedInBodyCutoutQa: false,
    visibility: args.visibility ?? "visible",
    materialToken: args.materialToken ?? "factory-logo",
    source: args.source ?? "unknown",
    ...(args.confidence != null ? { confidence: args.confidence } : {}),
    ...(args.centerXMm != null ? { centerXMm: args.centerXMm } : {}),
    ...(args.centerYMm != null ? { centerYMm: args.centerYMm } : {}),
    ...(args.widthMm != null ? { widthMm: args.widthMm } : {}),
    ...(args.heightMm != null ? { heightMm: args.heightMm } : {}),
    ...(args.angleDeg != null
      ? {
          angleDeg: isFiniteNumber(args.angleDeg)
            ? normalizeAngleDeg(args.angleDeg)
            : args.angleDeg,
        }
      : {}),
  };
}

export function isAppearanceLayerBodyCutoutQaSafe(
  layer: ProductAppearanceReferenceLayer | null | undefined,
): boolean {
  return Boolean(
    layer &&
    layer.referenceOnly === true &&
    layer.includedInBodyCutoutQa === false,
  );
}

export function deriveFrontCenterAngleFromLogo(
  layer: ProductAppearanceReferenceLayer | null | undefined,
): number | undefined {
  if (!layer || layer.kind !== "front-brand-logo") return undefined;
  return isFiniteNumber(layer.angleDeg) ? normalizeAngleDeg(layer.angleDeg) : undefined;
}

export function deriveBackLogoAngle(
  frontCenterAngleDeg: number | null | undefined,
): number | undefined {
  return isFiniteNumber(frontCenterAngleDeg)
    ? normalizeAngleDeg(frontCenterAngleDeg + 180)
    : undefined;
}

export function validateAppearanceReferenceLayer(
  layer: ProductAppearanceReferenceLayer,
): AppearanceReferenceLayerValidation {
  const warnings: string[] = [];

  if (!isAppearanceLayerBodyCutoutQaSafe(layer)) {
    warnings.push(`${layer.label} must stay reference-only and excluded from BODY CUTOUT QA.`);
  }

  if (layer.confidence != null && (!isFiniteNumber(layer.confidence) || layer.confidence < 0 || layer.confidence > 1)) {
    warnings.push(`${layer.label} confidence should be between 0 and 1.`);
  }

  if (layer.kind === "top-finish-band" || layer.kind === "bottom-finish-band") {
    if (layer.yMm != null && (!isFiniteNumber(layer.yMm) || layer.yMm < 0)) {
      warnings.push(`${layer.label} yMm must be a finite non-negative millimeter value.`);
    }
    if (layer.heightMm != null && (!isFiniteNumber(layer.heightMm) || layer.heightMm <= 0)) {
      warnings.push(`${layer.label} heightMm must be a finite positive millimeter value.`);
    }
  }

  if (layer.kind === "front-brand-logo" || layer.kind === "back-brand-logo") {
    if (layer.centerXMm != null && !isFiniteNumber(layer.centerXMm)) {
      warnings.push(`${layer.label} centerXMm must be finite when provided.`);
    }
    if (layer.centerYMm != null && !isFiniteNumber(layer.centerYMm)) {
      warnings.push(`${layer.label} centerYMm must be finite when provided.`);
    }
    if (layer.widthMm != null && (!isFiniteNumber(layer.widthMm) || layer.widthMm <= 0)) {
      warnings.push(`${layer.label} widthMm must be a finite positive millimeter value.`);
    }
    if (layer.heightMm != null && (!isFiniteNumber(layer.heightMm) || layer.heightMm <= 0)) {
      warnings.push(`${layer.label} heightMm must be a finite positive millimeter value.`);
    }
    if (layer.angleDeg != null && !isFiniteNumber(layer.angleDeg)) {
      warnings.push(`${layer.label} angleDeg must be finite when provided.`);
    }
  }

  return {
    status: warnings.length > 0 ? "warn" : "pass",
    warnings: dedupeWarnings(warnings),
    bodyCutoutQaSafe: isAppearanceLayerBodyCutoutQaSafe(layer),
  };
}

export function summarizeAppearanceReferenceLayers(
  layers: readonly ProductAppearanceReferenceLayer[] | null | undefined,
): ProductAppearanceReferenceSummary {
  const safeLayers = layers ? [...layers] : [];
  const warnings = safeLayers.flatMap((layer) => validateAppearanceReferenceLayer(layer).warnings);
  const frontLogo = safeLayers.find((layer): layer is BrandLogoReference => layer.kind === "front-brand-logo");
  const frontCenterAngleDeg = deriveFrontCenterAngleFromLogo(frontLogo);

  return {
    totalLayers: safeLayers.length,
    visibleLayerCount: safeLayers.filter((layer) => layer.visibility === "visible").length,
    topFinishBandPresent: safeLayers.some((layer) => layer.kind === "top-finish-band"),
    bottomFinishBandPresent: safeLayers.some((layer) => layer.kind === "bottom-finish-band"),
    frontLogoReferencePresent: Boolean(frontLogo),
    backLogoReferencePresent: safeLayers.some((layer) => layer.kind === "back-brand-logo"),
    frontCenterAngleDeg: isFiniteNumber(frontCenterAngleDeg) ? round2(frontCenterAngleDeg) : undefined,
    backLogoAngleDeg: isFiniteNumber(frontCenterAngleDeg)
      ? round2(deriveBackLogoAngle(frontCenterAngleDeg) ?? 0)
      : undefined,
    warnings: dedupeWarnings(warnings),
    bodyCutoutQaSafe: safeLayers.every((layer) => isAppearanceLayerBodyCutoutQaSafe(layer)),
  };
}
