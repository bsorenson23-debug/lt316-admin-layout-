import { NextRequest, NextResponse } from "next/server";
import {
  getGeneratedModelContentType,
  readGeneratedModel,
  statGeneratedModel,
} from "@/server/models/generatedModelStorage";
import { sanitizeGeneratedModelFileName } from "@/lib/generatedModelUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveFileName(context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  return sanitizeGeneratedModelFileName(decodeURIComponent(file));
}

async function buildHeaders(fileName: string) {
  const fileStat = await statGeneratedModel(fileName);
  return {
    "content-type": getGeneratedModelContentType(fileName),
    "content-length": String(fileStat.size),
    "cache-control": "no-store",
    etag: `"${fileStat.size}-${fileStat.mtimeMs}"`,
    "last-modified": fileStat.mtime.toUTCString(),
  };
}

export async function HEAD(
  _req: NextRequest,
  context: { params: Promise<{ file: string }> },
) {
  const fileName = await resolveFileName(context);
  if (!fileName) {
    return NextResponse.json({ error: "Invalid generated model path" }, { status: 400 });
  }

  try {
    return new NextResponse(null, {
      status: 200,
      headers: await buildHeaders(fileName),
    });
  } catch {
    return NextResponse.json({ error: "Generated model not found" }, { status: 404 });
  }
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ file: string }> },
) {
  const fileName = await resolveFileName(context);
  if (!fileName) {
    return NextResponse.json({ error: "Invalid generated model path" }, { status: 400 });
  }

  try {
    const [headers, body] = await Promise.all([
      buildHeaders(fileName),
      readGeneratedModel(fileName),
    ]);
    return new NextResponse(new Uint8Array(body), { status: 200, headers });
  } catch {
    return NextResponse.json({ error: "Generated model not found" }, { status: 404 });
  }
}
