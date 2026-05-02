import type { TumblerSourceLink } from "./tumblerAutoSize";

export type TumblerItemLookupMode =
  | "matched-profile"
  | "parsed-page"
  | "safe-fallback";

export type TumblerProfileAuthority =
  | "exact-internal-profile"
  | "official-dimensions-over-profile"
  | "dynamic-llm-extracted"
  | "inferred-profile"
  | "lookup-dimensions-only"
  | "needs-body-reference"
  | "unknown";

export type TumblerDimensionSourceKind =
  | "internal-profile"
  | "official-page"
  | "llm-page"
  | "parsed-page"
  | "operator-body-reference"
  | "safe-fallback";

export type TumblerSourceModelAvailability =
  | "verified-source-model"
  | "generated-source-model"
  | "missing-source-model";

export type DimensionAuthority =
  | "diameter-primary"
  | "body-diameter-primary"
  | "wrap-diameter-primary"
  | "manual-override"
  | "unknown";

export type TumblerModelStatus =
  | "verified-product-model"
  | "generated-reviewed-model"
  | "placeholder-model"
  | "missing-model";

export interface TumblerItemLookupDimensions {
  lookupProductId?: string | null;
  productUrl?: string | null;
  selectedVariantId?: string | null;
  selectedVariantLabel?: string | null;
  selectedSizeOz?: number | null;
  selectedColorOrFinish?: string | null;
  availableVariantLabels?: string[];
  availableSizeOz?: number[];
  dimensionSourceUrl?: string | null;
  dimensionSourceText?: string | null;
  dimensionSourceSizeOz?: number | null;
  dimensionSourceKind?: TumblerDimensionSourceKind | null;
  titleSizeOz?: number | null;
  confidence?: number | null;
  dimensionAuthority: DimensionAuthority;
  diameterMm?: number | null;
  bodyDiameterMm?: number | null;
  wrapDiameterMm?: number | null;
  wrapWidthMm?: number | null;
  fullProductHeightMm?: number | null;
  bodyHeightMm?: number | null;
  heightIncludesLidOrStraw?: boolean | null;
  overallHeightMm: number | null;
  outsideDiameterMm: number | null;
  topDiameterMm: number | null;
  bottomDiameterMm: number | null;
  usableHeightMm: number | null;
  handleSpanMm?: number | null;
}

export interface TumblerItemLookupFitBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface TumblerItemLookupFitProfilePoint {
  yPx: number;
  yMm: number;
  radiusPx: number;
  radiusMm: number;
}

export interface TumblerItemLookupFitDebug {
  kind: "lathe-body-fit";
  sourceImageUrl: string;
  imageWidthPx: number;
  imageHeightPx: number;
  silhouetteBoundsPx: TumblerItemLookupFitBounds;
  centerXPx: number;
  fullTopPx: number;
  fullBottomPx: number;
  bodyTopPx: number;
  bodyBottomPx: number;
  paintedBodyTopPx?: number;
  colorBodyBottomPx?: number;
  bodyTraceTopPx?: number;
  bodyTraceBottomPx?: number;
  engravingStartGuidePx?: number;
  seamSilverBottomPx?: number | null;
  rimTopPx: number;
  rimBottomPx: number;
  referenceBandTopPx: number;
  referenceBandBottomPx: number;
  referenceBandCenterYPx: number;
  referenceBandWidthPx: number;
  measurementBandTopPx?: number;
  measurementBandBottomPx?: number;
  measurementBandCenterYPx?: number;
  measurementBandCenterXPx?: number;
  measurementBandWidthPx?: number;
  measurementBandLeftPx?: number;
  measurementBandRightPx?: number;
  measurementBandRowCount?: number;
  measurementBandWidthStdDevPx?: number;
  baseBandTopPx?: number;
  baseBandBottomPx?: number;
  maxCenterWidthPx: number;
  referenceHalfWidthPx: number;
  handleSide?: "left" | "right" | null;
  handleCenterYPx?: number | null;
  handleOuterWidthPx?: number | null;
  handleOuterHeightPx?: number | null;
  handleAttachEdgePx?: number | null;
  handleOuterEdgePx?: number | null;
  handleHoleTopPx?: number | null;
  handleHoleBottomPx?: number | null;
  handleBarWidthPx?: number | null;
  fitScore: number;
  warnings?: string[];
  profilePoints: TumblerItemLookupFitProfilePoint[];
}

export interface TumblerItemLookupResponse {
  lookupInput: string;
  resolvedUrl: string | null;
  title: string | null;
  brand: string | null;
  model: string | null;
  capacityOz: number | null;
  matchedProfileId: string | null;
  profileAuthority?: TumblerProfileAuthority;
  profileAuthorityLabel?: string | null;
  profileAuthorityReason?: string | null;
  profileConfidence?: number | null;
  sourceModelAvailability?: TumblerSourceModelAvailability;
  sourceModelAvailabilityLabel?: string | null;
  requiresBodyReferenceReview?: boolean;
  glbPath: string;
  modelStatus?: TumblerModelStatus;
  modelSourceLabel?: string | null;
  imageUrl: string | null;
  backImageUrl?: string | null;
  imageUrls: string[];
  fitDebug?: TumblerItemLookupFitDebug | null;
  dimensions: TumblerItemLookupDimensions;
  mode: TumblerItemLookupMode;
  notes: string[];
  sources: TumblerSourceLink[];
}
