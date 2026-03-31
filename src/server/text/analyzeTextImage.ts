import Anthropic from "@anthropic-ai/sdk";
import type { ImageTextDetectionResult } from "@/types/textDetection";

export interface TextImageAnalysisInput {
  imageBytes: Uint8Array;
  mimeType: string;
  fileName: string;
}

const TEXT_DETECTION_SYSTEM_PROMPT = `You analyze artwork and logo images for text replacement workflows.
Return only valid JSON matching this schema exactly:
{
  "text": string | null,
  "fontFamily": string | null,
  "fontCandidates": string[],
  "fontCategory": string | null,
  "fontWeight": string | null,
  "fontStyle": string | null,
  "estimatedFontSizePx": number | null,
  "angleDeg": number | null,
  "fill": string | null,
  "letterSpacing": number | null,
  "confidence": number,
  "notes": string[]
}

Rules:
- "text" is the most important visible line or word to replace.
- Exact font identification is approximate. If unsure, set "fontFamily" to null and provide 2-5 guesses in "fontCandidates".
- "fontCategory" should be one of: script, serif, sans-serif, display, monospace, hand-lettered, unknown.
- "fontWeight" should be one of: light, regular, medium, semibold, bold, black, or null.
- "fontStyle" should be "italic", "normal", or null.
- "estimatedFontSizePx" is the approximate rendered text height in image pixels.
- "angleDeg" is clockwise rotation relative to horizontal. Use 0 when visually horizontal.
- "fill" should be a hex color like "#000000" when visible, otherwise null.
- "letterSpacing" should be a numeric estimate in px only when obvious, otherwise 0.
- "confidence" must be between 0 and 1.
- "notes" should mention uncertainty, font-match caveats, and whether the size/angle were estimated visually.
Do not include any text outside the JSON object.`;

const TEXT_DETECTION_USER_PROMPT =
  "Identify the primary text in this image and estimate its font style, size, angle, and likely matching fonts for replacement.";

function normalizeMediaType(
  mimeType: string,
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
  return "image/png";
}

function isValidMimeType(mimeType: string): boolean {
  return (
    mimeType === "image/jpeg" ||
    mimeType === "image/jpg" ||
    mimeType === "image/png" ||
    mimeType === "image/gif" ||
    mimeType === "image/webp"
  );
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseVisionResponse(raw: string): ImageTextDetectionResult {
  const fallback: ImageTextDetectionResult = {
    text: null,
    fontFamily: null,
    fontCandidates: [],
    fontCategory: null,
    fontWeight: null,
    fontStyle: null,
    estimatedFontSizePx: null,
    angleDeg: null,
    fill: null,
    letterSpacing: null,
    confidence: 0.15,
    notes: ["Vision response could not be parsed."],
  };

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallback;

    const parsed = JSON.parse(jsonMatch[0]) as Partial<ImageTextDetectionResult>;
    const fontCandidates = Array.isArray(parsed.fontCandidates)
      ? parsed.fontCandidates.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];

    return {
      text: normalizeString(parsed.text),
      fontFamily: normalizeString(parsed.fontFamily),
      fontCandidates,
      fontCategory: normalizeString(parsed.fontCategory),
      fontWeight: normalizeString(parsed.fontWeight),
      fontStyle: normalizeString(parsed.fontStyle),
      estimatedFontSizePx: normalizeNumber(parsed.estimatedFontSizePx),
      angleDeg: normalizeNumber(parsed.angleDeg),
      fill: normalizeString(parsed.fill),
      letterSpacing: normalizeNumber(parsed.letterSpacing) ?? 0,
      confidence:
        typeof parsed.confidence === "number"
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0.35,
      notes: Array.isArray(parsed.notes)
        ? parsed.notes.filter((note): note is string => typeof note === "string" && note.trim().length > 0)
        : [],
    };
  } catch {
    return fallback;
  }
}

export async function analyzeTextImage(
  input: TextImageAnalysisInput,
): Promise<ImageTextDetectionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  if (!isValidMimeType(input.mimeType)) {
    throw new Error("Unsupported image type for text detection.");
  }

  const client = new Anthropic({ apiKey });
  const base64 = Buffer.from(input.imageBytes).toString("base64");
  const mediaType = normalizeMediaType(input.mimeType);

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 700,
    system: TEXT_DETECTION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: base64,
            },
          },
          {
            type: "text",
            text: `${TEXT_DETECTION_USER_PROMPT}\nFile name: ${input.fileName}`,
          },
        ],
      },
    ],
  });

  const rawText = message.content
    .filter((block) => block.type === "text")
    .map((block) => ("text" in block ? block.text : ""))
    .join("");

  return parseVisionResponse(rawText);
}
