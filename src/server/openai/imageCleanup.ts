import OpenAI, { toFile } from "openai";

export interface OpenAiCleanupResult {
  dataUrl: string;
  model: string;
}

function buildClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return new OpenAI({ apiKey, maxRetries: 1, timeout: 60_000 });
}

function normalizeMimeType(mimeType: string): "image/png" | "image/jpeg" | "image/webp" {
  if (mimeType === "image/png" || mimeType === "image/webp") return mimeType;
  return "image/jpeg";
}

export function isOpenAiImageCleanupConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export async function cleanupImageForTracingWithOpenAi(args: {
  imageBytes: Uint8Array;
  mimeType: string;
  fileName: string;
}): Promise<OpenAiCleanupResult | null> {
  const client = buildClient();
  if (!client) return null;

  const prompt = [
    "Clean this raster image for vector tracing in a laser engraving workflow.",
    "Preserve the original subject, lettering, logo proportions, and key edge shapes.",
    "Remove photographic background clutter, glare, shadows, table texture, and noisy reflections when possible.",
    "Do not invent new artwork, do not restyle the logo, and do not add decorative elements.",
    "Prefer a plain transparent background and crisp subject edges suitable for later monochrome tracing.",
    "Keep the visible logo or printed art centered exactly where it appears on the source object.",
  ].join(" ");

  const file = await toFile(
    Buffer.from(args.imageBytes),
    args.fileName || "trace-cleanup-input.png",
    { type: normalizeMimeType(args.mimeType) },
  );

  const response = await client.images.edit({
    model: "gpt-image-1",
    image: file,
    prompt,
    background: "transparent",
    input_fidelity: "high",
    output_format: "png",
    quality: "medium",
    size: "auto",
  });

  const first = response.data?.[0];
  if (!first?.b64_json) {
    return null;
  }

  return {
    dataUrl: `data:image/png;base64,${first.b64_json}`,
    model: "gpt-image-1",
  };
}
