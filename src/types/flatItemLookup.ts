import type { TumblerSourceLink } from "./tumblerAutoSize";

export type FlatItemLookupMode =
  | "catalog-match"
  | "family-fallback"
  | "metadata-fallback"
  | "safe-fallback";

export type FlatItemModelStrategy =
  | "page-model"
  | "image-trace"
  | "family-generated";

export interface FlatItemLookupTraceBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface FlatItemLookupTracePoint {
  xPx: number;
  yPx: number;
}

export interface FlatItemLookupTraceDebug {
  kind: "silhouette-trace";
  sourceImageUrl: string;
  imageWidthPx: number;
  imageHeightPx: number;
  silhouetteBoundsPx: FlatItemLookupTraceBounds;
  coverage: number;
  traceScore: number;
  accepted: boolean;
  rejectionReason: string | null;
  targetWidthMm: number;
  targetHeightMm: number;
  outlinePointsPx: FlatItemLookupTracePoint[];
}

export interface FlatItemLookupResponse {
  lookupInput: string;
  resolvedUrl: string | null;
  title: string | null;
  brand: string | null;
  label: string;
  matchedItemId: string | null;
  familyKey: string;
  category: string;
  widthMm: number;
  heightMm: number;
  thicknessMm: number;
  material: string;
  materialLabel: string;
  imageUrl: string | null;
  imageUrls: string[];
  glbPath: string;
  modelStrategy: FlatItemModelStrategy;
  modelSourceUrl: string | null;
  requiresReview: boolean;
  isProxy: boolean;
  traceScore: number | null;
  traceDebug: FlatItemLookupTraceDebug | null;
  confidence: number;
  mode: FlatItemLookupMode;
  notes: string[];
  sources: TumblerSourceLink[];
}
