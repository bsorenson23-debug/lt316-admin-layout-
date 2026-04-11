import { NextRequest, NextResponse } from "next/server";
import {
  cleanupImageForTracingWithOpenAi,
  isOpenAiImageCleanupConfigured,
} from "@/server/openai/imageCleanup";

export const runtime = "nodejs";
export const maxDuration = 60;

const OPENAI_COOLDOWN_MS = 5 * 60 * 1000;
let cleanupCooldownUntil = 0;

function fileToDataUrl(file: File): Promise<string> {
  return file.arrayBuffer().then((buffer) => {
    const mimeType = file.type || "image/jpeg";
    return `data:${mimeType};base64,${Buffer.from(buffer).toString("base64")}`;
  });
}

async function buildFallbackCleanupResponse(file: File, reason?: string) {
  return NextResponse.json({
    dataUrl: await fileToDataUrl(file),
    cleaned: false,
    method: "original",
    model: "Original image (OpenAI cleanup unavailable)",
    warning: reason,
  });
}

function isProviderQuotaFailure(message: string): boolean {
  return /(quota|billing hard limit|billing details|rate limit|insufficient)/i.test(message);
}

export async function POST(req: NextRequest) {
  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const imageFile = formData.get("image");
  if (!(imageFile instanceof File)) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }

  if (imageFile.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "Image too large (max 20 MB)" }, { status: 413 });
  }

  if (!isOpenAiImageCleanupConfigured()) {
    return buildFallbackCleanupResponse(
      imageFile,
      "OPENAI_API_KEY not configured. Using original image.",
    );
  }

  if (cleanupCooldownUntil > Date.now()) {
    return buildFallbackCleanupResponse(
      imageFile,
      "OpenAI cleanup temporarily skipped after a recent quota/billing failure.",
    );
  }

  try {
    const result = await cleanupImageForTracingWithOpenAi({
      imageBytes: Buffer.from(await imageFile.arrayBuffer()),
      mimeType: imageFile.type || "image/png",
      fileName: imageFile.name || "trace-cleanup-input.png",
    });

    if (!result) {
      return NextResponse.json({
        dataUrl: await fileToDataUrl(imageFile),
        cleaned: false,
        method: "original",
        model: "Original image (OpenAI cleanup unavailable)",
      });
    }

    return NextResponse.json({
      dataUrl: result.dataUrl,
      cleaned: true,
      method: "openai",
      model: result.model,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "OpenAI cleanup failed";
    if (isProviderQuotaFailure(message)) {
      cleanupCooldownUntil = Date.now() + OPENAI_COOLDOWN_MS;
    }
    return buildFallbackCleanupResponse(imageFile, message);
  }
}
