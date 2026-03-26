import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { validateLightBurnOutputFolderPath } from "@/server/lightburn/validateLightBurnPaths";

export const runtime = "nodejs";

interface SaveExportBody {
  outputFolderPath?: string;
  filename?: string;
  content?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SaveExportBody | null;

    const folderPath = body?.outputFolderPath?.trim();
    if (!folderPath) {
      return NextResponse.json(
        { error: "outputFolderPath is required" },
        { status: 400 },
      );
    }

    const content = body?.content;
    if (!content) {
      return NextResponse.json(
        { error: "content is required" },
        { status: 400 },
      );
    }

    // Sanitize filename — strip directory traversal, default to timestamp
    const rawFilename = body?.filename?.trim() || `lt316-${Date.now()}.lbrn2`;
    const safeName = basename(rawFilename);
    if (!safeName || safeName.startsWith(".")) {
      return NextResponse.json(
        { error: "Invalid filename" },
        { status: 400 },
      );
    }

    // Validate the output folder is writable
    const folderValidation = await validateLightBurnOutputFolderPath(folderPath);
    if (folderValidation.status !== "valid") {
      return NextResponse.json(
        { error: `Output folder: ${folderValidation.message}` },
        { status: 400 },
      );
    }

    const fullPath = join(folderPath, safeName);
    await writeFile(fullPath, content, "utf-8");

    return NextResponse.json({ saved: true, path: fullPath });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save export file.",
      },
      { status: 500 },
    );
  }
}
