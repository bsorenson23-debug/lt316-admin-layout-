export type TextDetectSource = "preview" | "subject-clean" | "subject-transparent" | "raw";

export interface TextDetectionResult {
  text: string | null;
  fontCandidates: string[];
  estimatedFontSizePx: number | null;
  angleDeg: number | null;
  fillColor: string | null;
  notes: string[];
}

export async function analyzeTextImage(): Promise<TextDetectionResult> {
  throw new Error(
    "Text detection is referenced by this branch, but services/asset-pipeline/src/lib/textDetect.ts has not been implemented yet.",
  );
}
