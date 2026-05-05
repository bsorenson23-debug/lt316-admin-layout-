export type SmartTemplateLookupSourceType = "image" | "mixed";

export type SmartTemplateLookupCategory = "unknown";

export type SmartTemplateLookupPrompt =
  | "confirm-category"
  | "confirm-dimensions";

export interface SmartTemplateLookupTemplateDraft {
  productType: "tumbler";
  dimensions: {
    diameterMm: number;
    printableHeightMm: number;
  };
}

export interface SmartTemplateLookupResponse {
  sourceType: SmartTemplateLookupSourceType;
  category: SmartTemplateLookupCategory;
  confidence: number;
  reviewRequired: boolean;
  matchedProfileId: string | null;
  categoryReason: string;
  templateDraft: SmartTemplateLookupTemplateDraft;
  nextPrompts: SmartTemplateLookupPrompt[];
  warnings: string[];
  notes: string[];
}
