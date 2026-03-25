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
  imageUrls: string[];
  dimensions: TumblerItemLookupDimensions;
  mode: TumblerItemLookupMode;
  notes: string[];
  sources: TumblerSourceLink[];
}
