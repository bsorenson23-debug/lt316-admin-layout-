import { NextRequest, NextResponse } from "next/server";
import { deleteSvgLibraryEntry, updateSvgLibraryEntry } from "@/server/svgLibrary/storage";

export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const deleted = await deleteSvgLibraryEntry(id);
    if (!deleted) {
      return NextResponse.json({ error: "SVG not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[svg-library:delete]", error);
    return NextResponse.json({ error: "Failed to delete SVG" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = (await req.json()) as { name?: string; svgText?: string };
    if (body.name == null && body.svgText == null) {
      return NextResponse.json({ error: "No update payload provided" }, { status: 400 });
    }
    const entry = await updateSvgLibraryEntry(id, body);
    if (!entry) {
      return NextResponse.json({ error: "SVG not found" }, { status: 404 });
    }
    return NextResponse.json({ entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update SVG";
    console.error("[svg-library:update]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
