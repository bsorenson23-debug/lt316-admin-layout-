import { NextRequest, NextResponse } from "next/server";
import { runFlatBedAutoDetect } from "@/server/flatbed/runFlatBedAutoDetect";

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

    const arrayBuffer = await image.arrayBuffer();
    const imageBytes = new Uint8Array(arrayBuffer);

    const result = await runFlatBedAutoDetect({
      fileName: image.name,
      mimeType: image.type,
      imageBytes,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to auto-detect flat bed item.",
      },
      { status: 500 }
    );
  }
}
