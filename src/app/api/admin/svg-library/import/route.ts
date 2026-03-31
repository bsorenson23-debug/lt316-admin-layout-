import { NextRequest, NextResponse } from "next/server";
import { importSvgLibraryEntries } from "@/server/svgLibrary/storage";
import type { SvgLibraryEntryImportInput } from "@/types/svgLibrary";

export const runtime = "nodejs";

async function parseJsonPayload(req: NextRequest): Promise<SvgLibraryEntryImportInput[]> {
  const body = (await req.json()) as { entries?: SvgLibraryEntryImportInput[] };
  if (!Array.isArray(body.entries)) {
    throw new Error("Missing entries array");
  }
  return body.entries;
}

async function parseFormDataPayload(req: NextRequest): Promise<SvgLibraryEntryImportInput[]> {
  const formData = await req.formData();
  const allFiles = [
    ...formData.getAll("files"),
    ...formData.getAll("file"),
  ].filter((value): value is File => value instanceof File);

  if (allFiles.length === 0) {
    throw new Error("No files provided");
  }

  const relativePathsRaw = formData.get("relativePaths");
  let relativePaths: Array<string | null> = [];
  if (typeof relativePathsRaw === "string" && relativePathsRaw.trim()) {
    const parsed = JSON.parse(relativePathsRaw) as unknown;
    if (Array.isArray(parsed)) {
      relativePaths = parsed.map((value) => (typeof value === "string" && value.trim() ? value : null));
    }
  }

  return Promise.all(
    allFiles.map(async (file, index) => ({
      name: file.name,
      originalFileName: file.name,
      relativePath:
        relativePaths[index]
        ?? ("webkitRelativePath" in file && typeof file.webkitRelativePath === "string" && file.webkitRelativePath.trim()
          ? file.webkitRelativePath
          : null),
      svgText: await file.text(),
    })),
  );
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    const entries = contentType.includes("multipart/form-data")
      ? await parseFormDataPayload(req)
      : await parseJsonPayload(req);

    if (entries.length === 0) {
      return NextResponse.json({ error: "No SVG entries provided" }, { status: 400 });
    }

    const result = await importSvgLibraryEntries(entries);
    return NextResponse.json(result, { status: result.entries.length > 0 ? 201 : 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import SVG library entries";
    console.error("[svg-library:import]", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
