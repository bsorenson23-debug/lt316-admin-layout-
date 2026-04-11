import { NextRequest, NextResponse } from "next/server";
import {
  isOpenAiImageAssistConfigured,
  recommendTraceSettingsWithOpenAi,
} from "@/server/openai/imageAssist";

export const runtime = "nodejs";
export const maxDuration = 60;

const OPENAI_COOLDOWN_MS = 5 * 60 * 1000;
let traceAssistCooldownUntil = 0;

function buildFallbackTraceSettingsResponse(reason?: string) {
  return NextResponse.json({
    traceMode: "trace",
    traceRecipe: "badge",
    backgroundStrategy: "original",
    preserveText: false,
    thresholdMode: "auto",
    threshold: 160,
    invert: false,
    turdSize: 0,
    alphaMax: 0.35,
    optTolerance: 0.05,
    posterizeSteps: 4,
    confidence: 0.1,
    rationale: reason?.trim()
      ? `Using safe tracing defaults. ${reason.trim()}`
      : "Using safe tracing defaults because image assist is unavailable.",
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

  if (!isOpenAiImageAssistConfigured()) {
    return buildFallbackTraceSettingsResponse("OPENAI_API_KEY not configured.");
  }

  if (traceAssistCooldownUntil > Date.now()) {
    return buildFallbackTraceSettingsResponse(
      "OpenAI trace recommendation temporarily skipped after a recent quota/billing failure.",
    );
  }

  try {
    const result = await recommendTraceSettingsWithOpenAi({
      imageBytes: Buffer.from(await imageFile.arrayBuffer()),
      mimeType: imageFile.type || "image/png",
    });

    if (!result) {
      return buildFallbackTraceSettingsResponse(
        "Image assist unavailable for this file type or model response.",
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Trace recommendation failed";
    if (isProviderQuotaFailure(message)) {
      traceAssistCooldownUntil = Date.now() + OPENAI_COOLDOWN_MS;
    }
    return buildFallbackTraceSettingsResponse(message);
  }
}
