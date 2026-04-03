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

export async function generateTextReplacement(): Promise<TextReplacementResult> {
  throw new Error(
    "Text replacement is referenced by this branch, but services/asset-pipeline/src/lib/textReplace.ts has not been implemented yet.",
  );
}
