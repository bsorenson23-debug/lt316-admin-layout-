import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const { url } = (await request.json()) as { url?: string };

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing url field." }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return NextResponse.json({ error: "Only http/https URLs are supported." }, { status: 400 });
    }

    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; lt316-admin/1.0)" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Fetch failed: ${response.status} ${response.statusText}` },
        { status: 502 }
      );
    }

    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    const mimeType = ALLOWED_TYPES.has(contentType) ? contentType : "image/jpeg";

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "Image exceeds 8 MB limit." }, { status: 413 });
    }

    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64}`;

    return NextResponse.json({ dataUrl, mimeType, byteLength: arrayBuffer.byteLength });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch image." },
      { status: 500 }
    );
  }
}
