export type TumblerShapeType = "straight" | "tapered" | "unknown";
export type TumblerProductType = "tumbler" | "insulated tumbler";
export type TumblerLidStyle = "straw" | "slider" | "open" | "unknown";

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

export interface TumblerImageFeatures {
  rawText: string;
  tokens: string[];
  visibleLogoText: string[];
  hasHandle: boolean | null;
  hasStraw: boolean | null;
  lidStyle: TumblerLidStyle;
  shapeType: TumblerShapeType;
  hasGrooveBands: boolean | null;
  silhouetteRatio: number | null;
  baseTopDiameterRatio: number | null;
}

export interface TumblerLogoDetectionResult {
  matchedBrand: string | null;
  detectedText: string[];
  confidence: number;
  method: "filename-hint" | "ocr" | "unknown";
}

export interface TumblerBrandCandidate {
  id: string;
  brand: string;
  model: string | null;
  familyHint?: string | null;
  searchQuery: string;
  preliminaryScore: number;
  reasons: string[];
}

export interface CandidateScore {
  brand: string;
  visionScore: number;
  ocrScore: number;
  shapeScore: number;
  logoTextScore: number;
  silhouetteScore: number;
  handleScore: number;
  lidScore: number;
  grooveScore: number;
  searchConsistencyScore: number;
  sourceScore: number;
  conflictPenalty: number;
  totalScore: number;
}

export interface TumblerBrandResolution {
  brand: string;
  model: string;
  familyHint: string | null;
  confidence: number;
  threshold: number;
  margin: number;
  leadOverSecond: number;
  isUnknown: boolean;
  notes: string[];
  topCandidates: TumblerBrandCandidate[];
  candidateScores: CandidateScore[];
}

export interface TumblerIdentificationResult {
  productType: TumblerProductType;
  brand: string;
  model: string;
  familyHint: string | null;
  confidence: number;
  searchQuery: string;
  topCandidates: TumblerBrandCandidate[];
  notes: string[];
}

export interface TumblerImageAnalysisResult {
  productType: TumblerProductType;
  brand: string | null;
  model: string | null;
  capacityOz: number | null;
  hasHandle: boolean | null;
  shapeType: TumblerShapeType;
  confidence: number;
  searchQuery: string;
  notes: string[];
  imageFeatures?: TumblerImageFeatures;
  logoDetection?: TumblerLogoDetectionResult;
  brandResolution?: TumblerBrandResolution;
  identification?: TumblerIdentificationResult;
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
  productType: TumblerProductType;
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
  brandConfidence?: number;
  familyHint?: string | null;
  alternateCandidates?: TumblerBrandCandidate[];
  manualBrandOverride?: boolean;
  manualProfileOverrideId?: string | null;
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
  | "unknown"
  | "low-confidence"
  | "error";

export interface TumblerAutoSizeState {
  status: TumblerAutoSizeStatus;
  fileName: string | null;
  result: TumblerAutoSizeResponse | null;
  draft: TumblerSpecDraft | null;
  error: string | null;
}
