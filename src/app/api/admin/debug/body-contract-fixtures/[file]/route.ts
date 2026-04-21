import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

const FIXTURE_DIR = path.join(process.cwd(), "public", "models", "test-fixtures");

export const dynamic = "force-dynamic";

function isValidFixtureName(value: string): boolean {
  return /^[a-z0-9-]+\.glb$/i.test(value);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ file: string }> },
) {
  const params = await context.params;
  const fileName = params.file;

  if (!isValidFixtureName(fileName)) {
    return NextResponse.json({ error: "Invalid fixture name." }, { status: 400 });
  }

  const absolutePath = path.join(FIXTURE_DIR, fileName);

  try {
    const buffer = await readFile(absolutePath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "content-type": "model/gltf-binary",
        "cache-control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Fixture not found." }, { status: 404 });
  }
}
