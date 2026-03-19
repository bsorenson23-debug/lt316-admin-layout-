import { TumblerAutoSizeResponse } from "@/types/tumblerAutoSize";
import {
  calculateTumblerTemplate,
  getTumblerConfidenceLevel,
  normalizeTumblerSpecs,
} from "@/utils/tumblerAutoSize";
import { identifyTumblerBrand } from "./identifyTumblerBrand";
import { analyzeTumblerWithVision } from "./claudeVisionAnalysis";

interface RunInput {
  fileName: string;
  mimeType: string;
  byteLength: number;
  /** Raw image bytes — when present, enables Claude vision analysis */
  imageBytes?: Uint8Array;
}

export async function runTumblerAutoSize(
  input: RunInput
): Promise<TumblerAutoSizeResponse> {
  // Run heuristic identification and optional vision analysis in parallel
  const [identified, visionResult] = await Promise.all([
    identifyTumblerBrand(input),
    input.imageBytes
      ? analyzeTumblerWithVision({
          imageBytes: input.imageBytes,
          mimeType: input.mimeType,
          fileName: input.fileName,
        })
      : Promise.resolve(null),
  ]);

  // Merge vision results on top of heuristic analysis when available
  const mergedAnalysis =
    visionResult && visionResult.vision.confidence > identified.analysis.confidence
      ? {
          ...identified.analysis,
          ...visionResult.analysis,
          // Carry forward heuristic fields not covered by vision
          imageFeatures: identified.analysis.imageFeatures,
          logoDetection: identified.analysis.logoDetection,
          brandResolution: identified.analysis.brandResolution,
          identification: identified.analysis.identification,
          notes: [
            ...(visionResult.analysis.notes ?? []),
            ...identified.analysis.notes.filter(
              (n) => !n.startsWith("AI vision")
            ),
          ],
        }
      : identified.analysis;

  const suggestion = normalizeTumblerSpecs(mergedAnalysis, identified.selectedSpecs);

  // Supplement suggestion with vision dimension data when heuristics had no values
  if (visionResult) {
    const v = visionResult.vision;
    if (v.topDiameterMm     && !suggestion.topDiameterMm)     suggestion.topDiameterMm     = v.topDiameterMm;
    if (v.bottomDiameterMm  && !suggestion.bottomDiameterMm)  suggestion.bottomDiameterMm  = v.bottomDiameterMm;
    if (v.outsideDiameterMm && !suggestion.outsideDiameterMm) suggestion.outsideDiameterMm = v.outsideDiameterMm;
    if (v.overallHeightMm   && !suggestion.overallHeightMm)   suggestion.overallHeightMm   = v.overallHeightMm;
    if (v.usableHeightMm    && !suggestion.usableHeightMm)    suggestion.usableHeightMm    = v.usableHeightMm;
    if (v.capacityOz        && !suggestion.capacityOz)        suggestion.capacityOz        = v.capacityOz;
  }

  const calculation = calculateTumblerTemplate(suggestion);
  const confidenceLevel = getTumblerConfidenceLevel(suggestion.confidence);

  return {
    analysis: mergedAnalysis,
    suggestion,
    calculation,
    confidenceLevel,
  };
}
