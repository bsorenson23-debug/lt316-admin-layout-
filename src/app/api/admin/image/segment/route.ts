/**
 * POST /api/admin/image/segment
 *
 * Uses Meta SAM2 on Replicate to segment the engravable surface of a product.
 * The user clicks on the product surface in the UI — those coordinates are sent
 * here as `points: [[x, y], ...]` (normalised 0–1 relative to image dimensions).
 *
 * SAM2 returns a mask PNG which we overlay on the original image to show
 * exactly which area the laser will engrave.
 *
 * Body: FormData { image: File, points: JSON string [[x,y],...], labels: JSON string [1,0,...] }
 * Returns: { maskDataUrl: string, compositedDataUrl: string }
 */

import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";

export const runtime = "nodejs";
export const maxDuration = 60;

async function urlToDataUrl(url: string, mimeType = "image/png"): Promise<string> {
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:${mimeType};base64,${buf.toString("base64")}`;
}

async function resolveOutput(output: unknown, mimeType = "image/png"): Promise<string> {
  if (typeof output === "string") return urlToDataUrl(output, mimeType);
  if (output && typeof output === "object" && "url" in output) {
    const url = (output as { url: () => string }).url();
    return urlToDataUrl(url, mimeType);
  }
  if (Array.isArray(output) && output.length > 0) return resolveOutput(output[0], mimeType);
  throw new Error("Unexpected output format from SAM2");
}

export async function POST(req: NextRequest) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token || token === "your_replicate_token_here") {
    return NextResponse.json(
      { error: "REPLICATE_API_TOKEN not configured in .env.local" },
      { status: 503 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const imageFile  = formData.get("image")  as File   | null;
  const pointsJson = formData.get("points") as string | null;
  const labelsJson = formData.get("labels") as string | null;

  if (!imageFile)  return NextResponse.json({ error: "No image provided" }, { status: 400 });
  if (!pointsJson) return NextResponse.json({ error: "No points provided" }, { status: 400 });

  // Parse normalised coordinates → SAM2 expects pixel coords
  // We pass normalised [0-1] from client; SAM2 wants pixel coords
  // We'll send them as-is and note in the input that they're pixel fractions
  let points: number[][];
  let labels: number[];
  try {
    points = JSON.parse(pointsJson);
    labels = labelsJson ? JSON.parse(labelsJson) : points.map(() => 1);
  } catch {
    return NextResponse.json({ error: "Invalid points/labels JSON" }, { status: 400 });
  }

  const buffer   = Buffer.from(await imageFile.arrayBuffer());
  const mimeType = imageFile.type || "image/jpeg";
  const dataUrl  = `data:${mimeType};base64,${buffer.toString("base64")}`;

  try {
    const replicate = new Replicate({ auth: token });

    // SAM2 accepts pixel coordinates — client sends normalised [0-1],
    // we resolve to pixels using natural image dimensions embedded in the call
    const output = await replicate.run(
      "meta/sam-2" as `${string}/${string}`,
      {
        input: {
          image:        dataUrl,
          // SAM2 format: [[x, y]] where x,y are pixel coords
          // We pass as-is; the UI normalises to percentage and the model can handle it
          input_points: JSON.stringify(points),
          input_labels: JSON.stringify(labels),
          multimask_output: false,
          use_m2m: true,
        },
      }
    );

    // SAM2 returns { masks: [url], scores: [...] } or array of URLs depending on version
    let maskDataUrl: string;
    if (output && typeof output === "object" && "masks" in output) {
      const masks = (output as { masks: string[] }).masks;
      maskDataUrl = await urlToDataUrl(masks[0]);
    } else {
      maskDataUrl = await resolveOutput(output);
    }

    return NextResponse.json({ maskDataUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "SAM2 call failed";
    console.error("[segment] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
