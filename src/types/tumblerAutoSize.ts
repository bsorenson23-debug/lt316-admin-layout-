export type TumblerShapeType = "straight" | "tapered" | "unknown";

export type TumblerSourceKind =
  | "internal"
  | "official"
  | "retailer"
  | "general";

export type TumblerConfidenceLevel = "low" | "medium" | "high";

export interface TumblerSourceLink {
  title: string;
  url: string;
  kind: TumblerSourceKind;
}

export interface TumblerImageAnalysisResult {
  productType: "tumbler";
  brand: string | null;
  model: string | null;
  capacityOz: number | null;
  hasHandle: boolean | null;
  shapeType: TumblerShapeType;
  confidence: number;
  searchQuery: string;
  notes: string[];
}

export interface TumblerSpecCandidate {
  title: string;
  url: string;
  kind: TumblerSourceKind;
  brand?: string | null;
  model?: string | null;
  capacityOz?: number | null;
  hasHandle?: boolean | null;
  shapeType?: TumblerShapeType;
  overallHeight?: string | number | null;
  outsideDiameter?: string | number | null;
  topDiameter?: string | number | null;
  bottomDiameter?: string | number | null;
  usableHeight?: string | number | null;
  snippet?: string;
  confidence?: number;
  isPackaging?: boolean;
}

export interface TumblerSpecSuggestion {
  productType: "tumbler";
  brand: string | null;
  model: string | null;
  capacityOz: number | null;
  hasHandle: boolean | null;
  shapeType: TumblerShapeType;
  overallHeightMm: number | null;
  outsideDiameterMm: number | null;
  topDiameterMm: number | null;
  bottomDiameterMm: number | null;
  usableHeightMm: number | null;
  confidence: number;
  sources: TumblerSourceLink[];
  notes: string[];
}

export interface TumblerTemplateCalculation {
  shapeType: TumblerShapeType;
  templateWidthMm: number;
  templateHeightMm: number;
  diameterUsedMm: number;
  averageDiameterMm: number | null;
}

export interface TumblerAutoSizeResponse {
  analysis: TumblerImageAnalysisResult;
  suggestion: TumblerSpecSuggestion;
  calculation: TumblerTemplateCalculation;
  confidenceLevel: TumblerConfidenceLevel;
}

export interface TumblerSpecDraft extends TumblerSpecSuggestion {
  templateWidthMm: number;
  templateHeightMm: number;
}

export type TumblerAutoSizeStatus =
  | "idle"
  | "loading"
  | "success"
  | "low-confidence"
  | "error";

export interface TumblerAutoSizeState {
  status: TumblerAutoSizeStatus;
  fileName: string | null;
  result: TumblerAutoSizeResponse | null;
  draft: TumblerSpecDraft | null;
  error: string | null;
}
