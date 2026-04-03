import type { TumblerSourceLink } from "./tumblerAutoSize";

export type TumblerItemLookupMode =
  | "matched-profile"
  | "parsed-page"
  | "safe-fallback";

export interface TumblerItemLookupDimensions {
  overallHeightMm: number | null;
  outsideDiameterMm: number | null;
  topDiameterMm: number | null;
  bottomDiameterMm: number | null;
  usableHeightMm: number | null;
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
  glbPath: string;
  imageUrl: string | null;
  backImageUrl?: string | null;
  imageUrls: string[];
  bodyColorHex?: string | null;
  rimColorHex?: string | null;
  fitDebug?: TumblerItemLookupFitDebug | null;
  dimensions: TumblerItemLookupDimensions;
  mode: TumblerItemLookupMode;
  notes: string[];
  sources: TumblerSourceLink[];
}
