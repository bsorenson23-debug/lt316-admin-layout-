import { NextRequest, NextResponse } from "next/server";
import { preprocessSvgForLightBurn } from "@/server/lightburn/preprocessSvgForLightBurn";

export const runtime = "nodejs";

interface PreprocessSvgRequestBody {
  items?: Array<{
    id?: string;
    svgText?: string;
  }>;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PreprocessSvgRequestBody | null;
    const rawItems = Array.isArray(body?.items) ? body.items : [];

    const items = await Promise.all(
      rawItems.map(async (item, index) => {
        const svgText = typeof item?.svgText === "string" ? item.svgText : "";
        const result = await preprocessSvgForLightBurn(svgText);
        return {
          id: typeof item?.id === "string" ? item.id : `item-${index}`,
          svgText: result.svgText,
          engine: result.engine,
          executablePath: result.executablePath ?? null,
          message: result.message ?? null,
        };
      }),
    );

    return NextResponse.json({
      items,
      usedInkscape: items.some((item) => item.engine === "inkscape"),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to preprocess SVG for LightBurn.",
      },
      { status: 500 },
    );
  }
}
