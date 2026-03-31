import { NextRequest, NextResponse } from "next/server";
import { clearSvgLibrary, createSvgLibraryEntry, listSvgLibraryEntries } from "@/server/svgLibrary/storage";

export const runtime = "nodejs";

export async function GET() {
  try {
    const entries = await listSvgLibraryEntries();
    return NextResponse.json({ entries });
  } catch (error) {
    console.error("[svg-library:list]", error);
    return NextResponse.json({ error: "Failed to load SVG library" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { name?: string; svgText?: string; relativePath?: string | null };
    const name = body.name?.trim() ?? "";
    const svgText = body.svgText ?? "";

    if (!name || !svgText) {
      return NextResponse.json({ error: "Missing name or SVG content" }, { status: 400 });
    }

    const entry = await createSvgLibraryEntry({
      name,
      svgText,
      relativePath: body.relativePath ?? null,
    });
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save SVG";
    console.error("[svg-library:create]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await clearSvgLibrary();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[svg-library:clear]", error);
    return NextResponse.json({ error: "Failed to clear SVG library" }, { status: 500 });
  }
}
