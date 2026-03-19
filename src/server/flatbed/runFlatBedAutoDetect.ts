/**
 * Orchestrates flat bed item auto-detection.
 *
 * Calls analyzeFlatBedWithVision, then matches the result against
 * the known FLAT_BED_ITEMS catalog and returns a structured response.
 */

import {
  analyzeFlatBedWithVision,
  type FlatBedVisionInput,
  type FlatBedVisionResult,
} from "./analyzeFlatBedWithVision";
import { FLAT_BED_ITEMS, type FlatBedItem } from "@/data/flatBedItems";

export type FlatBedConfidenceLevel = "high" | "medium" | "low";

export interface FlatBedAutoDetectInput {
  fileName: string;
  mimeType: string;
  imageBytes: Uint8Array;
}

export interface FlatBedAutoDetectResponse {
  matchedItemId: string | null;
  matchedItem: FlatBedItem | null;
  vision: FlatBedVisionResult;
  confidence: FlatBedConfidenceLevel;
}

function resolveConfidenceLevel(
  vision: FlatBedVisionResult,
  matchedItem: FlatBedItem | null
): FlatBedConfidenceLevel {
  const score = vision.confidence;
  const hasMatch = matchedItem !== null;

  if (score >= 0.75 && hasMatch) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

export async function runFlatBedAutoDetect(
  input: FlatBedAutoDetectInput
): Promise<FlatBedAutoDetectResponse> {
  const visionInput: FlatBedVisionInput = {
    imageBytes: input.imageBytes,
    mimeType: input.mimeType,
    fileName: input.fileName,
  };

  const vision = await analyzeFlatBedWithVision(visionInput);

  // Match against catalog — prefer vision-provided itemId, fall back to null
  const matchedItem = vision.itemId
    ? (FLAT_BED_ITEMS.find((item) => item.id === vision.itemId) ?? null)
    : null;

  const matchedItemId = matchedItem?.id ?? null;
  const confidence = resolveConfidenceLevel(vision, matchedItem);

  return {
    matchedItemId,
    matchedItem,
    vision,
    confidence,
  };
}
