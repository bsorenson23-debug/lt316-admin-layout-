import type { NextRequest } from "next/server";
import { runSmartTemplateLookup } from "../../../../../server/template/runSmartTemplateLookup.ts";

export const runtime = "nodejs";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, init);
}

function parsePositiveNumber(rawValue: string | null): number | null {
  if (rawValue == null) {
    return null;
  }
  const parsed = Number.parseFloat(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function formString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, { status: 400 });
  }

  const imageField = formData.get("image");
  if (!imageField) {
    return jsonResponse({ error: "No image provided" }, { status: 400 });
  }

  if (!(imageField instanceof File)) {
    return jsonResponse({ error: "Invalid image file" }, { status: 400 });
  }

  if (!imageField.type.startsWith("image/")) {
    return jsonResponse({ error: "Invalid image file" }, { status: 400 });
  }

  const profileDiameterMm = parsePositiveNumber(formString(formData, "profileDiameterMm"));
  if (profileDiameterMm == null) {
    return jsonResponse({ error: "Invalid profileDiameterMm" }, { status: 400 });
  }

  try {
    const imageBytes = new Uint8Array(await imageField.arrayBuffer());
    const result = await runSmartTemplateLookup({
      lookupInput: formString(formData, "lookupInput") ?? undefined,
      imageBytes,
      mimeType: imageField.type || "application/octet-stream",
      fileName: imageField.name || "upload",
      profileDiameterMm,
    });

    return jsonResponse(result, { status: 200 });
  } catch {
    return jsonResponse({ error: "Smart template lookup failed" }, { status: 500 });
  }
}
