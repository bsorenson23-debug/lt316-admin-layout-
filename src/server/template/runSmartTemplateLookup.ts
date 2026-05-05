import type { SmartTemplateLookupResponse } from "../../types/smartTemplateLookup.ts";

const DEFAULT_PRINTABLE_HEIGHT_TO_DIAMETER_RATIO = 1.8;

export interface RunSmartTemplateLookupInput {
  lookupInput?: string;
  imageBytes: Uint8Array;
  mimeType: string;
  fileName: string;
  profileDiameterMm: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function runSmartTemplateLookup(
  input: RunSmartTemplateLookupInput,
): Promise<SmartTemplateLookupResponse> {
  const sourceType = input.lookupInput && input.lookupInput.trim().length > 0
    ? "mixed"
    : "image";

  const printableHeightMm = round2(
    input.profileDiameterMm * DEFAULT_PRINTABLE_HEIGHT_TO_DIAMETER_RATIO,
  );

  return {
    sourceType,
    category: "unknown",
    confidence: 0,
    reviewRequired: true,
    matchedProfileId: null,
    categoryReason: "Smart-template lookup foundation placeholder result.",
    templateDraft: {
      productType: "tumbler",
      dimensions: {
        diameterMm: input.profileDiameterMm,
        printableHeightMm,
      },
    },
    nextPrompts: ["confirm-category", "confirm-dimensions"],
    warnings: ["Foundation-only smart-template lookup result. Manual review required."],
    notes: [
      `Processed ${input.fileName || "uploaded image"} (${input.mimeType}).`,
      sourceType === "mixed"
        ? "Lookup text was provided and retained for manual review."
        : "No lookup text provided; image-only fallback used.",
    ],
  };
}
