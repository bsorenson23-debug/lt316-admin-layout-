import type { FlatItemLookupResponse } from "./flatItemLookup";
import type { ProductTemplate } from "./productTemplate";
import type { TumblerItemLookupResponse } from "./tumblerItemLookup";

export type SmartTemplateLookupSourceType = "image" | "url" | "text" | "mixed";

export type SmartTemplateLookupCategory = ProductTemplate["productType"] | "unknown";

export type SmartTemplateLookupPrompt =
  | "confirm-category"
  | "confirm-dimensions"
  | "choose-laser-type"
  | "choose-material-profile"
  | "choose-rotary-preset"
  | "choose-model"
  | "map-tumbler";

export interface SmartTemplateLookupDimensionsDraft {
  diameterMm?: number | null;
  printHeightMm?: number | null;
  templateWidthMm?: number | null;
  flatThicknessMm?: number | null;
  flatFamilyKey?: string | null;
  handleArcDeg?: number | null;
  taperCorrection?: ProductTemplate["dimensions"]["taperCorrection"] | null;
  overallHeightMm?: number | null;
  topMarginMm?: number | null;
  bottomMarginMm?: number | null;
}

export interface SmartTemplateLookupDraft {
  name?: string | null;
  brand?: string | null;
  capacity?: string | null;
  laserType?: ProductTemplate["laserType"] | null;
  productType?: ProductTemplate["productType"] | null;
  materialSlug?: string | null;
  materialLabel?: string | null;
  productPhotoUrl?: string | null;
  productPhotoLabel?: string | null;
  backPhotoUrl?: string | null;
  backPhotoLabel?: string | null;
  glbPath?: string | null;
  dimensions?: SmartTemplateLookupDimensionsDraft;
}

export interface SmartTemplateLookupResponse {
  sourceType: SmartTemplateLookupSourceType;
  category: SmartTemplateLookupCategory;
  confidence: number;
  reviewRequired: boolean;
  matchedProfileId: string | null;
  matchedFlatItemId: string | null;
  categoryReason: string;
  templateDraft: SmartTemplateLookupDraft;
  nextPrompts: SmartTemplateLookupPrompt[];
  warnings: string[];
  notes: string[];
  flatLookupResult?: FlatItemLookupResponse | null;
  tumblerLookupResult?: TumblerItemLookupResponse | null;
}
