import { writeFile, mkdir } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file" }, { status: 400 });
    }

    // Validate file type
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["glb", "gltf"].includes(ext)) {
      return NextResponse.json(
        { error: "Only GLB and GLTF files allowed" },
        { status: 400 },
      );
    }

    // Sanitize filename — keep only safe chars
    const safeName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .toLowerCase();

    const dir = path.join(process.cwd(), "public", "models", "templates");
    await mkdir(dir, { recursive: true });

    const filePath = path.join(dir, safeName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    const publicPath = `/models/templates/${safeName}`;
    return NextResponse.json({ path: publicPath });
  } catch (err) {
    console.error("[model upload]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
