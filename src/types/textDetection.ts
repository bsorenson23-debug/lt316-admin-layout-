export interface DetectedSvgTextNode {
  index: number;
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  fontStyle: string;
  fill: string;
  letterSpacing: number;
  angleDeg: number;
  x: number;
  y: number;
  textAnchor: "start" | "middle" | "end";
}

export interface TextStylePreset {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  fontStyle: string;
  fill: string;
  letterSpacing: number;
  angleDeg: number;
  textAnchor: "start" | "middle" | "end";
}

export interface ImageTextDetectionResult {
  text: string | null;
  fontFamily: string | null;
  fontCandidates: string[];
  fontCategory: string | null;
  fontWeight: string | null;
  fontStyle: string | null;
  estimatedFontSizePx: number | null;
  angleDeg: number | null;
  fill: string | null;
  letterSpacing: number | null;
  confidence: number;
  notes: string[];
}
