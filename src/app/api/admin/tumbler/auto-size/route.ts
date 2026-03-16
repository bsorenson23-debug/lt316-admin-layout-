import { NextRequest, NextResponse } from "next/server";
import { runTumblerAutoSize } from "@/server/tumbler/runTumblerAutoSize";

export const runtime = "nodejs";

const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const image = formData.get("image");

    if (!(image instanceof File)) {
      return NextResponse.json(
        { error: "Expected a single image file in field 'image'." },
        { status: 400 }
      );
    }

    if (!image.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Uploaded file must be an image." },
        { status: 400 }
      );
    }

    if (image.size <= 0 || image.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Image must be between 1 byte and 8 MB." },
        { status: 400 }
      );
    }

    const result = await runTumblerAutoSize({
      fileName: image.name,
      mimeType: image.type,
      byteLength: image.size,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to auto-detect tumbler size.",
      },
      { status: 500 }
    );
  }
}
