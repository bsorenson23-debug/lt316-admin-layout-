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
  maxCenterWidthPx: number;
  referenceHalfWidthPx: number;
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
  fitDebug?: TumblerItemLookupFitDebug | null;
  dimensions: TumblerItemLookupDimensions;
  mode: TumblerItemLookupMode;
  notes: string[];
  sources: TumblerSourceLink[];
}
