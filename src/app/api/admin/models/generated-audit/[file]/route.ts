import { NextRequest, NextResponse } from "next/server";
import {
  readGeneratedModelAudit,
  statGeneratedModelAudit,
} from "@/server/models/generatedModelStorage";
import { sanitizeGeneratedModelFileName } from "@/lib/generatedModelUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveFileName(context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  return sanitizeGeneratedModelFileName(decodeURIComponent(file));
}

async function buildHeaders(fileName: string) {
  const fileStat = await statGeneratedModelAudit(fileName);
  return {
    "content-type": "application/json; charset=utf-8",
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
    return NextResponse.json({ error: "Invalid generated model audit path" }, { status: 400 });
  }

  try {
    return new NextResponse(null, {
      status: 200,
      headers: await buildHeaders(fileName),
    });
  } catch {
    return NextResponse.json({ error: "Generated model audit not found" }, { status: 404 });
  }
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ file: string }> },
) {
  const fileName = await resolveFileName(context);
  if (!fileName) {
    return NextResponse.json({ error: "Invalid generated model audit path" }, { status: 400 });
  }

  try {
    const [headers, body] = await Promise.all([
      buildHeaders(fileName),
      readGeneratedModelAudit(fileName),
    ]);
    return new NextResponse(body, { status: 200, headers });
  } catch {
    return NextResponse.json({ error: "Generated model audit not found" }, { status: 404 });
  }
}
