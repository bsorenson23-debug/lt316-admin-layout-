import { NextRequest, NextResponse } from "next/server";
import { runSmartTemplateLookup } from "@/server/template/runSmartTemplateLookup";
import type { TumblerFinish } from "@/types/materials";
import type { ProductTemplate } from "@/types/productTemplate";
import type { SmartTemplateLookupResult } from "@/types/smartTemplateLookup";

export const runtime = "nodejs";

const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;

function jsonResult(payload: SmartTemplateLookupResult, status = 200) {
  return NextResponse.json<SmartTemplateLookupResult>(payload, { status });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const lookupInputValue = formData.get("lookupInput");
    const imageValue = formData.get("image");
    const laserTypeOverrideValue = formData.get("laserTypeOverride");
    const finishTypeOverrideValue = formData.get("finishTypeOverride");

    const lookupInput = typeof lookupInputValue === "string" ? lookupInputValue.trim() : "";
    const image = imageValue instanceof File ? imageValue : null;
    const laserTypeOverride =
      laserTypeOverrideValue === "co2" ||
      laserTypeOverrideValue === "fiber" ||
      laserTypeOverrideValue === "diode"
        ? laserTypeOverrideValue
        : null;
    const finishTypeOverride = (
      finishTypeOverrideValue === "powder-coat" ||
      finishTypeOverrideValue === "raw-stainless" ||
      finishTypeOverrideValue === "painted" ||
      finishTypeOverrideValue === "anodized" ||
      finishTypeOverrideValue === "chrome-plated" ||
      finishTypeOverrideValue === "matte-finish"
    )
      ? finishTypeOverrideValue
      : null;

    if (!lookupInput && !image) {
      return jsonResult(
        {
          ok: false,
          error: {
            code: "MISSING_INPUT",
            message: "Provide a product URL, search text, or an image.",
          },
        },
        400,
      );
    }

    if (image) {
      if (!image.type.startsWith("image/")) {
        return jsonResult(
          {
            ok: false,
            error: {
              code: "INVALID_IMAGE_TYPE",
              message: "Uploaded file must be an image.",
            },
          },
          400,
        );
      }

      if (image.size <= 0 || image.size > MAX_IMAGE_SIZE_BYTES) {
        return jsonResult(
          {
            ok: false,
            error: {
              code: "INVALID_IMAGE_SIZE",
              message: "Image must be between 1 byte and 8 MB.",
            },
          },
          400,
        );
      }
    }

    const imageBytes = image ? new Uint8Array(await image.arrayBuffer()) : undefined;
    const result = await runSmartTemplateLookup({
      lookupInput,
      imageBytes,
      mimeType: image?.type,
      fileName: image?.name,
      laserTypeOverride: laserTypeOverride as ProductTemplate["laserType"] | null,
      finishTypeOverride: finishTypeOverride as TumblerFinish | null,
    });

    return jsonResult({
      ok: true,
      data: result,
      warnings: result.warnings,
    });
  } catch (error) {
    return jsonResult(
      {
        ok: false,
        error: {
          code: "LOOKUP_FAILED",
          message: "Smart product lookup failed.",
          detail: error instanceof Error ? error.message : "Unknown lookup failure",
        },
      },
      500,
    );
  }
}
