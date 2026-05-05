import type { NextRequest } from "next/server";
import sharp from "sharp";
import { posterize, trace } from "potrace";
import type { RasterTraceMode, RasterVectorizeResponse } from "@/types/rasterVectorize";

export const runtime = "nodejs";
export const maxDuration = 60;

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, init);
}

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function clampFloat(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseFloat(value ?? "");
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseBoolean(value: string | null, fallback = false): boolean {
  if (value == null) return fallback;
  return value === "true" || value === "1" || value === "yes";
}

function sanitizeHexColor(value: string | null, fallback = "#000000"): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : fallback;
}

function formString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}

function parseViewBox(svg: string): { width: number; height: number } | null {
  const match = svg.match(/viewBox=["']\s*([\d.+-]+)[\s,]+([\d.+-]+)[\s,]+([\d.+-]+)[\s,]+([\d.+-]+)\s*["']/i);
  if (!match) return null;
  const width = Number.parseFloat(match[3]);
  const height = Number.parseFloat(match[4]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

function countPaths(svg: string): number {
  return (svg.match(/<path\b/gi) ?? []).length;
}

function traceBuffer(buffer: Buffer, options: Parameters<typeof trace>[1]): Promise<string> {
  return new Promise((resolve, reject) => {
    trace(buffer, options, (err, svg) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(svg);
    });
  });
}

function posterizeBuffer(buffer: Buffer, options: Parameters<typeof posterize>[1]): Promise<string> {
  return new Promise((resolve, reject) => {
    posterize(buffer, options, (err, svg) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(svg);
    });
  });
}

async function buildTraceInput(
  sourceBuffer: Buffer,
  options: { trimWhitespace: boolean; normalizeLevels: boolean; maxDimension: number },
): Promise<{ buffer: Buffer; width: number; height: number }> {
  let pipeline = sharp(sourceBuffer, { failOn: "none", limitInputPixels: false }).rotate();

  pipeline = pipeline.resize({
    width: options.maxDimension,
    height: options.maxDimension,
    fit: "inside",
    withoutEnlargement: true,
  });

  if (options.trimWhitespace) {
    pipeline = pipeline.trim();
  }

  if (options.normalizeLevels) {
    pipeline = pipeline.normalize();
  }

  const processed = await pipeline
    .grayscale()
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: processed.data,
    width: processed.info.width,
    height: processed.info.height,
  };
}

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, { status: 400 });
  }

  const imageField = formData.get("image");
  if (!imageField) {
    return jsonResponse({ error: "No image provided" }, { status: 400 });
  }

  if (!(imageField instanceof File)) {
    return jsonResponse({ error: "Invalid image file" }, { status: 400 });
  }

  const imageFile = imageField;

  if (!imageFile.type || !imageFile.type.startsWith("image/")) {
    return jsonResponse({ error: "Invalid image file" }, { status: 400 });
  }

  if (imageFile.size > 15 * 1024 * 1024) {
    return jsonResponse({ error: "Image too large (max 15 MB)" }, { status: 413 });
  }

  const mode = (formString(formData, "mode") === "posterize" ? "posterize" : "trace") as RasterTraceMode;
  const thresholdMode = formString(formData, "thresholdMode") === "manual" ? "manual" : "auto";
  const invert = parseBoolean(formString(formData, "invert"), false);
  const trimWhitespace = parseBoolean(formString(formData, "trimWhitespace"), true);
  const normalizeLevels = parseBoolean(formString(formData, "normalizeLevels"), true);
  const turdSize = clampInt(formString(formData, "turdSize"), 2, 0, 50);
  const threshold = clampInt(formString(formData, "threshold"), 160, 0, 255);
  const posterizeSteps = clampInt(formString(formData, "posterizeSteps"), 4, 2, 8);
  const alphaMax = clampFloat(formString(formData, "alphaMax"), 1, 0, 2);
  const optTolerance = clampFloat(formString(formData, "optTolerance"), 0.2, 0, 1);
  const maxDimension = clampInt(formString(formData, "maxDimension"), 2200, 256, 4096);
  const outputColor = sanitizeHexColor(formString(formData, "outputColor"), "#000000");

  try {
    const inputBuffer = Buffer.from(await imageFile.arrayBuffer());
    try {
      // Validate decodability before tracing so invalid uploads return a stable 400 contract.
      await sharp(inputBuffer, { failOn: "none", limitInputPixels: false }).metadata();
    } catch {
      return jsonResponse({ error: "Invalid image file" }, { status: 400 });
    }

    const tracedInput = await buildTraceInput(inputBuffer, {
      trimWhitespace,
      normalizeLevels,
      maxDimension,
    });

    const sharedOptions = {
      turdSize,
      alphaMax,
      optCurve: true,
      optTolerance,
      blackOnWhite: !invert,
      background: "transparent",
      ...(thresholdMode === "manual" ? { threshold } : {}),
    };

    const svg = mode === "posterize"
      ? await posterizeBuffer(tracedInput.buffer, {
          ...sharedOptions,
          steps: posterizeSteps,
        })
      : await traceBuffer(tracedInput.buffer, {
          ...sharedOptions,
          color: outputColor,
        });

    const viewBox = parseViewBox(svg);
    const response: RasterVectorizeResponse = {
      svg,
      mode,
      pathCount: countPaths(svg),
      width: viewBox?.width ?? tracedInput.width,
      height: viewBox?.height ?? tracedInput.height,
    };

    return jsonResponse(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vectorization failed";
    console.error("[vectorize] error:", message);
    return jsonResponse({ error: message }, { status: 500 });
  }
}
