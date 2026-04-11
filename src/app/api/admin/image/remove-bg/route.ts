/**
 * POST /api/admin/image/remove-bg
 *
 * Removes the background from a product photo using BiRefNet on Replicate.
 * Much higher quality than the client-side @imgly/background-removal,
 * especially for stainless steel, glass, and complex product edges.
 *
 * Body: FormData { image: File }
 * Returns: { dataUrl: string, model: string }
 */

import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";

export const runtime = "nodejs";
export const maxDuration = 60;

// Convert a Replicate output (URL, ReadableStream, or FileOutput) → data URL
async function replicateOutputToDataUrl(output: unknown, mimeType = "image/png"): Promise<string> {
  // Replicate v1 SDK: output can be a string URL
  if (typeof output === "string") {
    const res = await fetch(output);
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${mimeType};base64,${buf.toString("base64")}`;
  }

  // Replicate v1 SDK: FileOutput object with url() method
  if (output && typeof output === "object" && "url" in output && typeof (output as { url: () => string }).url === "function") {
    const url = (output as { url: () => string }).url();
    const res = await fetch(url);
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${mimeType};base64,${buf.toString("base64")}`;
  }

  // Array output (some models return array)
  if (Array.isArray(output) && output.length > 0) {
    return replicateOutputToDataUrl(output[0], mimeType);
  }

  // ReadableStream
  if (output instanceof ReadableStream) {
    const reader = output.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const buf = Buffer.concat(chunks);
    return `data:${mimeType};base64,${buf.toString("base64")}`;
  }

  throw new Error("Unexpected Replicate output format");
}

function fileToDataUrl(file: File): Promise<string> {
  return file.arrayBuffer().then((buffer) => {
    const mimeType = file.type || "image/jpeg";
    return `data:${mimeType};base64,${Buffer.from(buffer).toString("base64")}`;
  });
}

export async function POST(req: NextRequest) {
  const token = process.env.REPLICATE_API_TOKEN;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const imageFile = formData.get("image") as File | null;
  if (!imageFile) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }

  // Size limit: 10 MB
  if (imageFile.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Image too large (max 10 MB)" }, { status: 413 });
  }

  if (!token || token === "your_replicate_token_here") {
    return NextResponse.json({
      dataUrl: await fileToDataUrl(imageFile),
      bgRemoved: false,
      method: "original",
      model: "Original image (Replicate unavailable)",
      warning: "REPLICATE_API_TOKEN not configured; returning original image.",
    });
  }

  // Convert to base64 data URL for Replicate
  const dataUrl = await fileToDataUrl(imageFile);

  try {
    const replicate = new Replicate({ auth: token });

    // BiRefNet — state-of-the-art background removal (~$0.0014/run)
    // Fallback: 851-labs/background-remover (~$0.00056/run) if BiRefNet unavailable
    let output: unknown;
    try {
      output = await replicate.run(
        "ZhengPeng7/BiRefNet" as `${string}/${string}`,
        { input: { image: dataUrl } }
      );
    } catch {
      // Fallback to a known stable model
      output = await replicate.run(
        "851-labs/background-remover" as `${string}/${string}`,
        { input: { image: dataUrl } }
      );
    }

    const resultDataUrl = await replicateOutputToDataUrl(output);

    return NextResponse.json({
      dataUrl: resultDataUrl,
      bgRemoved: true,
      method: "replicate",
      model: "BiRefNet (Replicate)",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Replicate call failed";
    console.error("[remove-bg] error:", msg);
    return NextResponse.json({
      dataUrl,
      bgRemoved: false,
      method: "original",
      model: "Original image (Replicate failed)",
      warning: msg,
    });
  }
}
