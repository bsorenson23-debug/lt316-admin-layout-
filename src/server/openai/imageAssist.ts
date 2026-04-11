import OpenAI from "openai";
import type {
  LogoPlacementAssistResponse,
  TraceSettingsAssistResponse,
} from "@/types/imageAssist";

interface ImageAssistInput {
  imageBytes: Uint8Array;
  mimeType: string;
  brandHint?: string | null;
}

const LOGO_DETECT_MODEL = "gpt-4.1-mini";
const TRACE_RECOMMEND_MODEL = "gpt-4.1-mini";

function isValidMimeType(mimeType: string): boolean {
  return (
    mimeType === "image/jpeg" ||
    mimeType === "image/jpg" ||
    mimeType === "image/png" ||
    mimeType === "image/webp"
  );
}

function normalizeMediaType(mimeType: string): "image/jpeg" | "image/png" | "image/webp" {
  if (mimeType === "image/jpg") return "image/jpeg";
  if (mimeType === "image/png" || mimeType === "image/webp") return mimeType;
  return "image/jpeg";
}

function buildClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return new OpenAI({ apiKey, maxRetries: 1, timeout: 20_000 });
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toImageDataUrl(input: ImageAssistInput): string {
  const mediaType = normalizeMediaType(input.mimeType);
  return `data:${mediaType};base64,${Buffer.from(input.imageBytes).toString("base64")}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeLogoAssistResponse(payload: Record<string, unknown>): LogoPlacementAssistResponse {
  const box = payload.logoBox;
  const rawBox = box && typeof box === "object" ? box as Record<string, unknown> : null;
  const confidence = typeof payload.confidence === "number" ? clamp(payload.confidence, 0, 1) : 0.25;
  const rationale =
    typeof payload.rationale === "string" && payload.rationale.trim()
      ? payload.rationale.trim()
      : "Logo detection completed without a detailed rationale.";

  const logoBox = rawBox
    ? {
        x: typeof rawBox.x === "number" ? Math.max(0, rawBox.x) : 0,
        y: typeof rawBox.y === "number" ? Math.max(0, rawBox.y) : 0,
        w: typeof rawBox.w === "number" ? Math.max(0, rawBox.w) : 0,
        h: typeof rawBox.h === "number" ? Math.max(0, rawBox.h) : 0,
      }
    : null;

  const viewClassValue = typeof payload.viewClass === "string" ? payload.viewClass : "unknown";
  const viewClass = (
    [
      "front",
      "back",
      "left-side",
      "right-side",
      "front-3q",
      "back-3q",
      "handle-side",
      "detail",
      "lifestyle",
      "unknown",
    ] as const
  ).includes(viewClassValue as never)
    ? viewClassValue as LogoPlacementAssistResponse["viewClass"]
    : "unknown";

  return {
    detected: Boolean(
      payload.detected &&
      logoBox &&
      logoBox.w > 0 &&
      logoBox.h > 0,
    ),
    logoBox: logoBox && logoBox.w > 0 && logoBox.h > 0 ? logoBox : null,
    viewClass,
    confidence,
    rationale,
  };
}

function normalizeTraceAssistResponse(payload: Record<string, unknown>): TraceSettingsAssistResponse {
  const traceMode = payload.traceMode === "posterize" ? "posterize" : "trace";
  const traceRecipe = (
    payload.traceRecipe === "line-art" ||
    payload.traceRecipe === "script-logo" ||
    payload.traceRecipe === "stamp"
  )
    ? payload.traceRecipe
    : "badge";
  const backgroundStrategy = (
    payload.backgroundStrategy === "cutout" ||
    payload.backgroundStrategy === "hybrid"
  )
    ? payload.backgroundStrategy
    : "original";

  return {
    traceMode,
    traceRecipe,
    backgroundStrategy,
    preserveText: typeof payload.preserveText === "boolean" ? payload.preserveText : traceRecipe === "script-logo",
    thresholdMode: payload.thresholdMode === "manual" ? "manual" : "auto",
    threshold: typeof payload.threshold === "number" ? clamp(Math.round(payload.threshold), 0, 255) : 160,
    invert: Boolean(payload.invert),
    turdSize: typeof payload.turdSize === "number" ? clamp(Math.round(payload.turdSize), 0, 25) : 0,
    alphaMax: typeof payload.alphaMax === "number" ? clamp(payload.alphaMax, 0, 2) : 0.35,
    optTolerance: typeof payload.optTolerance === "number" ? clamp(payload.optTolerance, 0.05, 1) : 0.05,
    posterizeSteps: typeof payload.posterizeSteps === "number" ? clamp(Math.round(payload.posterizeSteps), 2, 8) : 4,
    confidence: typeof payload.confidence === "number" ? clamp(payload.confidence, 0, 1) : 0.3,
    rationale:
      typeof payload.rationale === "string" && payload.rationale.trim()
        ? payload.rationale.trim()
        : "Trace guidance generated.",
  };
}

export function isOpenAiImageAssistConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export async function detectLogoPlacementWithOpenAi(
  input: ImageAssistInput,
): Promise<LogoPlacementAssistResponse | null> {
  const client = buildClient();
  if (!client || !isValidMimeType(input.mimeType)) return null;

  const brandHint = input.brandHint?.trim();
  const imageUrl = toImageDataUrl(input);
  const prompt = [
    "Inspect this product photo and locate the primary manufacturer logo printed, embossed, or engraved on the vessel body.",
    "Prefer a front-facing logo on the drinkware body itself, not packaging, lids, stickers, props, or reflections.",
    "If no credible logo is visible, set detected=false and logoBox=null.",
    brandHint ? `Brand hint: ${brandHint}. Use it only if the visible mark supports it.` : "Brand hint: none.",
    "Return only valid JSON with this schema:",
    '{"detected":boolean,"logoBox":{"x":number,"y":number,"w":number,"h":number}|null,"viewClass":"front"|"back"|"left-side"|"right-side"|"front-3q"|"back-3q"|"handle-side"|"detail"|"lifestyle"|"unknown","confidence":number,"rationale":string}',
    "Coordinates must be normalized from 0 to 1 relative to the full image.",
  ].join("\n");

  const response = await client.responses.create({
    model: LOGO_DETECT_MODEL,
    max_output_tokens: 250,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: imageUrl, detail: "high" },
        ],
      },
    ],
  });

  const parsed = extractJsonObject(response.output_text);
  if (!parsed) return null;
  return normalizeLogoAssistResponse(parsed);
}

export async function recommendTraceSettingsWithOpenAi(
  input: ImageAssistInput,
): Promise<TraceSettingsAssistResponse | null> {
  const client = buildClient();
  if (!client || !isValidMimeType(input.mimeType)) return null;

  const imageUrl = toImageDataUrl(input);
  const prompt = [
    "Inspect this raster image for vector tracing in a laser-engraving workflow.",
    "Recommend cleanup and tracing settings that best preserve useful marks while avoiding noisy background detail.",
    "Use cutout or hybrid only when separating the subject from background would materially improve the trace.",
    "Prefer script-logo when lettering needs preservation, line-art for graphic strokes, stamp for bold monochrome marks, and badge for mixed logos.",
    "Return only valid JSON with this schema:",
    '{"traceMode":"trace"|"posterize","traceRecipe":"badge"|"line-art"|"script-logo"|"stamp","backgroundStrategy":"original"|"cutout"|"hybrid","preserveText":boolean,"thresholdMode":"auto"|"manual","threshold":number,"invert":boolean,"turdSize":number,"alphaMax":number,"optTolerance":number,"posterizeSteps":number,"confidence":number,"rationale":string}',
  ].join("\n");

  const response = await client.responses.create({
    model: TRACE_RECOMMEND_MODEL,
    max_output_tokens: 300,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: imageUrl, detail: "high" },
        ],
      },
    ],
  });

  const parsed = extractJsonObject(response.output_text);
  if (!parsed) return null;
  return normalizeTraceAssistResponse(parsed);
}
