import type { TextDetectionResult } from "./textDetect";

export interface TextReplacementRequest {
  requestedMode: "auto" | "font-match" | "trace";
  replacementText: string | null;
  preferredFontFamily: string | null;
  preferredFill: string | null;
  preferredWeight: string | null;
  preferredStyle: string | null;
  preferredLetterSpacing: number | null;
  preferredAngleDeg: number | null;
  preferredFontSizePx: number | null;
  preferredTextAnchor: "start" | "middle" | "end" | null;
}

export interface TextReplacementResult {
  svg: string;
  debug: Record<string, unknown>;
}

export async function generateTextReplacement(
  imageBytes: Uint8Array,
  detection: TextDetectionResult,
  request: TextReplacementRequest,
): Promise<TextReplacementResult> {
  void imageBytes;
  void detection;
  void request;
  throw new Error(
    "Text replacement is referenced by this branch, but services/asset-pipeline/src/lib/textReplace.ts has not been implemented yet.",
  );
}
