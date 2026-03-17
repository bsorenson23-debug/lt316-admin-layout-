import { TumblerAutoSizeResponse } from "@/types/tumblerAutoSize";
import {
  calculateTumblerTemplate,
  getTumblerConfidenceLevel,
  normalizeTumblerSpecs,
} from "@/utils/tumblerAutoSize";
import { identifyTumblerBrand } from "./identifyTumblerBrand";

interface RunInput {
  fileName: string;
  mimeType: string;
  byteLength: number;
}

export async function runTumblerAutoSize(
  input: RunInput
): Promise<TumblerAutoSizeResponse> {
  const identified = await identifyTumblerBrand(input);
  const suggestion = normalizeTumblerSpecs(
    identified.analysis,
    identified.selectedSpecs
  );
  const calculation = calculateTumblerTemplate(suggestion);
  const confidenceLevel = getTumblerConfidenceLevel(suggestion.confidence);

  return {
    analysis: identified.analysis,
    suggestion,
    calculation,
    confidenceLevel,
  };
}
