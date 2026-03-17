import { NextRequest, NextResponse } from "next/server";
import type { LightBurnPathSettings } from "@/types/export";
import { validateLightBurnPathSettings } from "@/server/lightburn/validateLightBurnPaths";

export const runtime = "nodejs";

function normalizeSettings(value: unknown): LightBurnPathSettings {
  if (!value || typeof value !== "object") return {};
  const parsed = value as Partial<LightBurnPathSettings>;
  return {
    templateProjectPath:
      typeof parsed.templateProjectPath === "string"
        ? parsed.templateProjectPath
        : undefined,
    outputFolderPath:
      typeof parsed.outputFolderPath === "string" ? parsed.outputFolderPath : undefined,
    deviceBundlePath:
      typeof parsed.deviceBundlePath === "string" ? parsed.deviceBundlePath : undefined,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { settings?: unknown } | null;
    const settings = normalizeSettings(body?.settings);
    const validation = await validateLightBurnPathSettings(settings);
    return NextResponse.json(validation);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to validate LightBurn paths.",
      },
      { status: 500 }
    );
  }
}

