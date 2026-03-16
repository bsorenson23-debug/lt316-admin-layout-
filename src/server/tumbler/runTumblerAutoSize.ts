import { TumblerAutoSizeResponse } from "@/types/tumblerAutoSize";
import {
  calculateTumblerTemplate,
  getTumblerConfidenceLevel,
  normalizeTumblerSpecs,
} from "@/utils/tumblerAutoSize";
import { analyzeTumblerImage } from "./analyzeTumblerImage";
import { searchTumblerSpecs } from "./searchTumblerSpecs";

interface RunInput {
  fileName: string;
  mimeType: string;
  byteLength: number;
}

export async function runTumblerAutoSize(
  input: RunInput
): Promise<TumblerAutoSizeResponse> {
  const analysis = await analyzeTumblerImage(input);
  const candidates = await searchTumblerSpecs({
    searchQuery: analysis.searchQuery,
    analysis,
  });
  const suggestion = normalizeTumblerSpecs(analysis, candidates);
  const calculation = calculateTumblerTemplate(suggestion);
  const confidenceLevel = getTumblerConfidenceLevel(suggestion.confidence);

  return {
    analysis,
    suggestion,
    calculation,
    confidenceLevel,
  };
}
