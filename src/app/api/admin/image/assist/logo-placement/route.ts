import sharp from "sharp";
import { NextRequest, NextResponse } from "next/server";
import {
  detectLogoPlacementWithOpenAi,
  isOpenAiImageAssistConfigured,
} from "@/server/openai/imageAssist";

export const runtime = "nodejs";
export const maxDuration = 60;

const OPENAI_COOLDOWN_MS = 5 * 60 * 1000;
let logoAssistCooldownUntil = 0;

function buildFallbackLogoPlacementResponse(reason?: string) {
  return NextResponse.json({
    detected: false,
    logoBox: null,
    normalizedLogoBox: null,
    viewClass: "unknown",
    confidence: 0,
    rationale: reason?.trim()
      ? `Image assist unavailable. ${reason.trim()}`
      : "Image assist unavailable for this file type or model response.",
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
  const brandHint = formData.get("brandHint");
  if (!(imageFile instanceof File)) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }

  const imageBytes = Buffer.from(await imageFile.arrayBuffer());
  const metadata = await sharp(imageBytes).metadata().catch(() => null);
  if (!metadata?.width || !metadata.height) {
    return NextResponse.json({ error: "Could not read image size" }, { status: 400 });
  }

  if (!isOpenAiImageAssistConfigured()) {
    return buildFallbackLogoPlacementResponse("OPENAI_API_KEY not configured.");
  }

  if (logoAssistCooldownUntil > Date.now()) {
    return buildFallbackLogoPlacementResponse(
      "OpenAI logo placement temporarily skipped after a recent quota/billing failure.",
    );
  }

  try {
    const result = await detectLogoPlacementWithOpenAi({
      imageBytes,
      mimeType: imageFile.type || "image/png",
      brandHint: typeof brandHint === "string" ? brandHint : null,
    });

    if (!result) {
      return NextResponse.json({
        detected: false,
        logoBox: null,
        viewClass: "unknown",
        confidence: 0,
        rationale: "Image assist unavailable for this file type or model response.",
      });
    }

    const normalizedBox = result.logoBox;
    const pixelBox = normalizedBox
      ? {
          x: Math.max(0, Math.round(normalizedBox.x * metadata.width)),
          y: Math.max(0, Math.round(normalizedBox.y * metadata.height)),
          w: Math.max(1, Math.round(normalizedBox.w * metadata.width)),
          h: Math.max(1, Math.round(normalizedBox.h * metadata.height)),
        }
      : null;

    return NextResponse.json({
      ...result,
      logoBox: pixelBox,
      normalizedLogoBox: normalizedBox,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Logo detection failed";
    if (isProviderQuotaFailure(message)) {
      logoAssistCooldownUntil = Date.now() + OPENAI_COOLDOWN_MS;
    }
    return buildFallbackLogoPlacementResponse(message);
  }
}
