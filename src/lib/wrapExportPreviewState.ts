import type {
  BodyGeometryBoundsMm,
  BodyGeometryContract,
  BodyGeometryScaleSource,
} from "./bodyGeometryContract.ts";
import { inferGeneratedModelStatusFromSource } from "./generatedModelUrl.ts";

export type WrapExportPreviewStatus = "pass" | "warn" | "fail" | "unknown";
export type WrapExportMappingStatus =
  | "ready"
  | "missing-dimensions"
  | "stale-geometry"
  | "no-reviewed-glb"
  | "unknown";

export interface WrapExportPreviewState {
  status: WrapExportPreviewStatus;
  mappingStatus: WrapExportMappingStatus;
  readyForPreview: boolean;
  readyForExactPlacement: boolean;
  isBodyCutoutQaProof: false;
  wrapDiameterMm?: number;
  wrapWidthMm?: number;
  printableTopMm?: number;
  printableBottomMm?: number;
  printableHeightMm?: number;
  expectedBodyWidthMm?: number;
  expectedBodyHeightMm?: number;
  bodyBounds?: BodyGeometryBoundsMm;
  scaleSource?: BodyGeometryScaleSource;
  freshness: "fresh" | "stale" | "unknown";
  warnings: string[];
  errors: string[];
}

function isFinitePositive(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeMessages(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function resolveFreshness(
  value: boolean | undefined,
): WrapExportPreviewState["freshness"] {
  if (value === true) return "fresh";
  if (value === false) return "stale";
  return "unknown";
}

function resolveReviewedGeneratedGlb(contract: BodyGeometryContract): boolean {
  return inferGeneratedModelStatusFromSource({
    modelUrl: contract.glb.path,
  }) === "generated-reviewed-model";
}

export function getWrapExportPreviewStatusLabel(
  status: WrapExportPreviewStatus,
): string {
  switch (status) {
    case "pass":
      return "PASS";
    case "warn":
      return "WARN";
    case "fail":
      return "FAIL";
    default:
      return "UNKNOWN";
  }
}

export function getWrapExportMappingStatusLabel(
  status: WrapExportMappingStatus,
): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "missing-dimensions":
      return "Missing dimensions";
    case "stale-geometry":
      return "Stale reviewed geometry";
    case "no-reviewed-glb":
      return "Preview only - no reviewed GLB";
    default:
      return "Unknown";
  }
}

export function buildWrapExportPreviewState(
  contract: BodyGeometryContract | null | undefined,
): WrapExportPreviewState {
  if (!contract) {
    return {
      status: "unknown",
      mappingStatus: "unknown",
      readyForPreview: false,
      readyForExactPlacement: false,
      isBodyCutoutQaProof: false,
      freshness: "unknown",
      warnings: [],
      errors: [],
    };
  }

  const wrapDiameterMm = isFinitePositive(contract.dimensionsMm.wrapDiameterMm)
    ? contract.dimensionsMm.wrapDiameterMm
    : undefined;
  const wrapWidthMm = isFinitePositive(contract.dimensionsMm.wrapWidthMm)
    ? contract.dimensionsMm.wrapWidthMm
    : undefined;
  const printableTopMm = isFiniteNumber(contract.dimensionsMm.printableTopMm)
    ? contract.dimensionsMm.printableTopMm
    : undefined;
  const printableBottomMm = isFiniteNumber(contract.dimensionsMm.printableBottomMm)
    ? contract.dimensionsMm.printableBottomMm
    : undefined;
  const printableHeightMm =
    typeof printableTopMm === "number" &&
    typeof printableBottomMm === "number" &&
    printableBottomMm > printableTopMm
      ? round2(printableBottomMm - printableTopMm)
      : undefined;
  const expectedBodyWidthMm = isFinitePositive(contract.dimensionsMm.expectedBodyWidthMm)
    ? contract.dimensionsMm.expectedBodyWidthMm
    : undefined;
  const expectedBodyHeightMm = isFinitePositive(contract.dimensionsMm.expectedBodyHeightMm)
    ? contract.dimensionsMm.expectedBodyHeightMm
    : undefined;
  const bodyBounds = contract.dimensionsMm.bodyBounds;
  const hasBodyBounds = Boolean(
    bodyBounds &&
    isFinitePositive(bodyBounds.width) &&
    isFinitePositive(bodyBounds.height) &&
    isFinitePositive(bodyBounds.depth),
  );
  const freshness = resolveFreshness(contract.glb.freshRelativeToSource);
  const reviewedGeneratedGlb = resolveReviewedGeneratedGlb(contract);
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!wrapDiameterMm || !wrapWidthMm) {
    errors.push("WRAP / EXPORT is blocked until wrap diameter and wrap width are available.");
  }

  if (!hasBodyBounds) {
    warnings.push("WRAP / EXPORT can preview saved artwork, but exact viewer agreement is waiting on body bounds.");
  }

  if (freshness === "unknown") {
    warnings.push("WRAP / EXPORT preview is available, but saved placement freshness cannot be confirmed against the current reviewed geometry yet.");
  } else if (freshness === "stale") {
    warnings.push("Saved laser-bed millimeter placement stays authoritative, but exact viewer agreement is stale. Regenerate the reviewed BODY CUTOUT QA GLB after body-geometry changes.");
  }

  if (!reviewedGeneratedGlb) {
    warnings.push("WRAP / EXPORT can still preview saved artwork, but exact placement waits for a reviewed BODY CUTOUT QA GLB.");
  }

  if (
    typeof printableTopMm !== "number" ||
    typeof printableBottomMm !== "number" ||
    typeof printableHeightMm !== "number"
  ) {
    warnings.push("Printable top/bottom bounds are unavailable, so WRAP / EXPORT is using the current body span only.");
  }

  const readyForPreview = errors.length === 0;
  const readyForExactPlacement = Boolean(
    readyForPreview &&
    hasBodyBounds &&
    freshness === "fresh" &&
    reviewedGeneratedGlb,
  );
  const mappingStatus: WrapExportMappingStatus = errors.length > 0
    ? "missing-dimensions"
    : !reviewedGeneratedGlb
      ? "no-reviewed-glb"
      : freshness === "stale"
        ? "stale-geometry"
        : readyForExactPlacement
          ? "ready"
          : "unknown";
  const normalizedErrors = normalizeMessages(errors);
  const normalizedWarnings = normalizeMessages(warnings);
  const status: WrapExportPreviewStatus = normalizedErrors.length > 0
    ? "fail"
    : readyForExactPlacement
      ? "pass"
      : normalizedWarnings.length > 0
        ? "warn"
        : readyForPreview
          ? "pass"
          : "unknown";

  return {
    status,
    mappingStatus,
    readyForPreview,
    readyForExactPlacement,
    isBodyCutoutQaProof: false,
    wrapDiameterMm,
    wrapWidthMm,
    printableTopMm,
    printableBottomMm,
    printableHeightMm,
    expectedBodyWidthMm,
    expectedBodyHeightMm,
    bodyBounds: hasBodyBounds ? bodyBounds : undefined,
    scaleSource: contract.dimensionsMm.scaleSource,
    freshness,
    warnings: normalizedWarnings,
    errors: normalizedErrors,
  };
}
