/**
 * Claude Vision-based tumbler image analysis.
 *
 * Sends the actual photo to Claude's vision API and extracts structured
 * brand / model / dimension data from the visual content.  Falls back
 * gracefully when ANTHROPIC_API_KEY is not configured.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { TumblerImageAnalysisResult, TumblerShapeType } from "@/types/tumblerAutoSize";

export interface VisionAnalysisInput {
  imageBytes: Uint8Array;
  mimeType: string;
  fileName: string;
}

export interface VisionAnalysisResult {
  brand: string | null;
  model: string | null;
  capacityOz: number | null;
  shapeType: TumblerShapeType;
  hasHandle: boolean | null;
  topDiameterMm: number | null;
  bottomDiameterMm: number | null;
  outsideDiameterMm: number | null;
  overallHeightMm: number | null;
  usableHeightMm: number | null;
  confidence: number;
  notes: string[];
}

const VISION_SYSTEM_PROMPT = `You are an expert in laser engraving tumblers and insulated drinkware.
You analyze product photos and return structured JSON with the tumbler's brand, model, and dimensions.

Always return valid JSON matching this schema exactly:
{
  "brand": string | null,           // e.g. "YETI", "Stanley", "RTIC", "Ozark Trail", "Hydro Flask", or null
  "model": string | null,           // e.g. "Rambler", "Quencher H2.0", "Road Trip Tumbler", or null
  "capacityOz": number | null,      // capacity in fluid ounces, e.g. 20, 30, 40
  "shapeType": "straight" | "tapered" | "unknown",
  "hasHandle": boolean | null,
  "topDiameterMm": number | null,   // outer diameter at the top (drinking end), in millimeters
  "bottomDiameterMm": number | null,// outer diameter at the base, in millimeters
  "outsideDiameterMm": number | null,// for straight cylinders, the single outside diameter
  "overallHeightMm": number | null, // total height including lid, in mm
  "usableHeightMm": number | null,  // engraveable/printable height (between groove bands if visible), in mm
  "confidence": number,             // 0.0–1.0, your confidence in the identification
  "notes": string[]                 // any caveats, e.g. ["Dimensions estimated from visual proportions"]
}

Use your knowledge of common tumbler specifications. If visible, read the brand logo or label text.
For tapered tumblers (Stanley Quencher, most modern tumblers), topDiameterMm > bottomDiameterMm.
If you cannot determine a value, use null. Do not include any text outside the JSON object.`;

const VISION_USER_PROMPT =
  "Identify this tumbler and return its brand, model, capacity, shape, and dimensions as JSON.";

function isValidMimeType(mimeType: string): boolean {
  return (
    mimeType === "image/jpeg" ||
    mimeType === "image/jpg" ||
    mimeType === "image/png" ||
    mimeType === "image/gif" ||
    mimeType === "image/webp"
  );
}

function normalizeMediaType(
  mimeType: string
): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  if (mimeType === "image/jpg") return "image/jpeg";
  if (
    mimeType === "image/jpeg" ||
    mimeType === "image/png" ||
    mimeType === "image/gif" ||
    mimeType === "image/webp"
  ) {
    return mimeType;
  }
  return "image/jpeg";
}

function parseVisionResponse(raw: string): VisionAnalysisResult {
  const fallback: VisionAnalysisResult = {
    brand: null,
    model: null,
    capacityOz: null,
    shapeType: "unknown",
    hasHandle: null,
    topDiameterMm: null,
    bottomDiameterMm: null,
    outsideDiameterMm: null,
    overallHeightMm: null,
    usableHeightMm: null,
    confidence: 0.3,
    notes: ["Vision response could not be parsed."],
  };

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallback;
    const parsed = JSON.parse(jsonMatch[0]) as Partial<VisionAnalysisResult>;

    const shapeType: TumblerShapeType =
      parsed.shapeType === "straight" || parsed.shapeType === "tapered"
        ? parsed.shapeType
        : "unknown";

    return {
      brand:             typeof parsed.brand      === "string" ? parsed.brand : null,
      model:             typeof parsed.model      === "string" ? parsed.model : null,
      capacityOz:        typeof parsed.capacityOz === "number" && parsed.capacityOz > 0 ? parsed.capacityOz : null,
      shapeType,
      hasHandle:         typeof parsed.hasHandle  === "boolean" ? parsed.hasHandle : null,
      topDiameterMm:     typeof parsed.topDiameterMm     === "number" && parsed.topDiameterMm > 0 ? parsed.topDiameterMm : null,
      bottomDiameterMm:  typeof parsed.bottomDiameterMm  === "number" && parsed.bottomDiameterMm > 0 ? parsed.bottomDiameterMm : null,
      outsideDiameterMm: typeof parsed.outsideDiameterMm === "number" && parsed.outsideDiameterMm > 0 ? parsed.outsideDiameterMm : null,
      overallHeightMm:   typeof parsed.overallHeightMm   === "number" && parsed.overallHeightMm > 0 ? parsed.overallHeightMm : null,
      usableHeightMm:    typeof parsed.usableHeightMm    === "number" && parsed.usableHeightMm > 0 ? parsed.usableHeightMm : null,
      confidence:        typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5,
      notes:             Array.isArray(parsed.notes) ? parsed.notes.filter((n): n is string => typeof n === "string") : [],
    };
  } catch {
    return fallback;
  }
}

function visionResultToAnalysis(vision: VisionAnalysisResult): Partial<TumblerImageAnalysisResult> {
  return {
    brand:      vision.brand,
    model:      vision.model,
    capacityOz: vision.capacityOz,
    hasHandle:  vision.hasHandle,
    shapeType:  vision.shapeType,
    confidence: vision.confidence,
    notes:      ["AI vision analysis", ...vision.notes],
  };
}

/**
 * Analyzes a tumbler image using Claude's vision API.
 *
 * Returns null when ANTHROPIC_API_KEY is not configured, allowing
 * the caller to fall back to filename-heuristic detection.
 */
export async function analyzeTumblerWithVision(
  input: VisionAnalysisInput
): Promise<{ analysis: Partial<TumblerImageAnalysisResult>; vision: VisionAnalysisResult } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !isValidMimeType(input.mimeType)) return null;

  try {
    const client = new Anthropic({ apiKey });
    const base64 = Buffer.from(input.imageBytes).toString("base64");
    const mediaType = normalizeMediaType(input.mimeType);

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: VISION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            { type: "text", text: VISION_USER_PROMPT },
          ],
        },
      ],
    });

    const rawText = message.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("");

    const vision = parseVisionResponse(rawText);
    return { analysis: visionResultToAnalysis(vision), vision };
  } catch (err) {
    // Log but don't crash — fall back to heuristic
    if (process.env.NODE_ENV !== "production") {
      console.warn("[claude-vision] analysis failed, falling back to heuristics:", err);
    }
    return null;
  }
}
