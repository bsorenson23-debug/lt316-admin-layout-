import { NextRequest, NextResponse } from "next/server";
import { convertVectorBufferToSvg } from "@/server/vectorImport/importVectorFile";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const converted = await convertVectorBufferToSvg({
      fileName: file.name,
      mimeType: file.type,
      buffer,
    });

    return NextResponse.json(converted);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vector import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
