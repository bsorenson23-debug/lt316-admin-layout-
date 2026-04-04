import Anthropic from "@anthropic-ai/sdk";

export type TextDetectSource = "preview" | "subject-clean" | "subject-transparent" | "raw";

export interface TextDetectionBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TextDetectionLine {
  text: string;
  box: TextDetectionBox | null;
}

export interface TextDetectionResult {
  text: string | null;
  textLines: TextDetectionLine[];
  region: TextDetectionBox | null;
  fontFamily: string | null;
  fontCandidates: string[];
  fontCategory: string | null;
  fontWeight: string | null;
  fontStyle: string | null;
  estimatedFontSizePx: number | null;
  angleDeg: number | null;
  fill: string | null;
  letterSpacing: number | null;
  confidence: number;
  fontMatchConfidence: number;
  looksHandLettered: boolean;
  recommendedMode: "font-match" | "trace";
  notes: string[];
}

const TEXT_DETECTION_SYSTEM_PROMPT = `You analyze image-doctor outputs to identify editable text for later replacement.
Return only valid JSON matching this schema exactly:
{
  "text": string | null,
  "textLines": [
    {
      "text": string,
      "box": {
        "left": number,
        "top": number,
        "width": number,
        "height": number
      } | null
    }
  ],
  "region": {
    "left": number,
    "top": number,
    "width": number,
    "height": number
  } | null,
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
  "fontMatchConfidence": number,
  "looksHandLettered": boolean,
  "recommendedMode": "font-match" | "trace",
  "notes": string[]
}

Rules:
- Focus on the most important visible text that an operator would likely want to replace.
- "textLines" should preserve the visible line layout in reading order.
- All box coordinates are normalized 0.0 to 1.0 relative to the full image.
- The line boxes and region must cover only the text, not surrounding artwork.
- Exact font identification is approximate. If uncertain, set "fontFamily" to null and provide 2 to 5 best guesses in "fontCandidates".
- "fontCategory" should be one of: script, serif, sans-serif, display, monospace, hand-lettered, unknown.
- "fontWeight" should be one of: light, regular, medium, semibold, bold, black, or null.
- "fontStyle" should be "italic", "normal", or null.
- "estimatedFontSizePx" is the approximate text height in source-image pixels.
- "angleDeg" is clockwise rotation from horizontal. Use 0 when horizontal.
- "fill" should be a hex color if visible, otherwise null.
- "letterSpacing" should be a numeric estimate in px when visible, otherwise 0.
- "looksHandLettered" should be true when the lettering appears custom, brushed, traced, or not like a standard installed font.
- "fontMatchConfidence" should estimate whether the style is likely reproducible with an installed font, independent of OCR readability.
- Set "recommendedMode" to "trace" when the lettering appears hand-drawn, custom, or low-confidence for font recreation.
- "confidence" and "fontMatchConfidence" must be between 0 and 1.
- "notes" should mention uncertainty, whether the style match is approximate, and why trace mode is preferred when applicable.
Do not include any text outside the JSON object.`;

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

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampUnit(value: number | null): number | null {
  if (value == null) return null;
  return Math.max(0, Math.min(1, value));
}

function normalizeBox(value: unknown): TextDetectionBox | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const box = value as Partial<TextDetectionBox>;
  const left = clampUnit(normalizeNumber(box.left));
  const top = clampUnit(normalizeNumber(box.top));
  const width = clampUnit(normalizeNumber(box.width));
  const height = clampUnit(normalizeNumber(box.height));
  if (left == null || top == null || width == null || height == null || width <= 0 || height <= 0) {
    return null;
  }

  return { left, top, width, height };
}

function normalizeTextLines(value: unknown): TextDetectionLine[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const line = entry as { text?: unknown; box?: unknown };
      const text = normalizeString(line.text);
      if (!text) return null;
      return {
        text,
        box: normalizeBox(line.box),
      };
    })
    .filter((entry): entry is TextDetectionLine => entry !== null);
}

function parseVisionResponse(raw: string): TextDetectionResult {
  const fallback: TextDetectionResult = {
    text: null,
    textLines: [],
    region: null,
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
    fontMatchConfidence: 0.15,
    looksHandLettered: true,
    recommendedMode: "trace",
    notes: ["Vision response could not be parsed."],
  };

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallback;

    const parsed = JSON.parse(jsonMatch[0]) as Partial<TextDetectionResult> & {
      textLines?: unknown;
      region?: unknown;
    };
    const fontCandidates = Array.isArray(parsed.fontCandidates)
      ? parsed.fontCandidates.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
    const textLines = normalizeTextLines(parsed.textLines);
    const text = normalizeString(parsed.text) ?? (textLines.length > 0 ? textLines.map((line) => line.text).join("\n") : null);
    const recommendedMode = parsed.recommendedMode === "font-match" ? "font-match" : "trace";
    const looksHandLettered = typeof parsed.looksHandLettered === "boolean"
      ? parsed.looksHandLettered
      : recommendedMode === "trace";

    return {
      text,
      textLines,
      region: normalizeBox(parsed.region),
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
      fontMatchConfidence:
        typeof parsed.fontMatchConfidence === "number"
          ? Math.max(0, Math.min(1, parsed.fontMatchConfidence))
          : recommendedMode === "font-match"
            ? 0.6
            : 0.2,
      looksHandLettered,
      recommendedMode,
      notes: Array.isArray(parsed.notes)
        ? parsed.notes.filter((note): note is string => typeof note === "string" && note.trim().length > 0)
        : [],
    };
  } catch {
    return fallback;
  }
}

export async function analyzeTextImage(
  imageBytes: Uint8Array,
  mimeType: string,
  fileName: string,
): Promise<TextDetectionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured for text detection.");
  }

  if (!isValidMimeType(mimeType)) {
    throw new Error("Unsupported image type for text detection.");
  }

  const client = new Anthropic({ apiKey });
  const base64 = Buffer.from(imageBytes).toString("base64");
  const mediaType = normalizeMediaType(mimeType);
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 950,
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
            text: `Identify the primary editable text in this image, estimate how replaceable it is with a standard font, and return text-only line boxes for matching or tracing. File name: ${fileName}`,
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
