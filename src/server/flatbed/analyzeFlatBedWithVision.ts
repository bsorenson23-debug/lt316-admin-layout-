/**
 * Claude Vision-based flat bed item image analysis.
 *
 * Sends the actual photo to Claude's vision API and extracts structured
 * category / item / dimension data from the visual content. Falls back
 * gracefully when ANTHROPIC_API_KEY is not configured.
 */

import Anthropic from "@anthropic-ai/sdk";

export interface FlatBedVisionInput {
  imageBytes: Uint8Array;
  mimeType: string;
  fileName: string;
}

export interface FlatBedVisionResult {
  category: string | null;      // "drinkware"|"plate-board"|"coaster-tile"|"sign-plaque"|"patch-tag"|"tech"|"other"|null
  itemId: string | null;        // best matching id from FLAT_BED_ITEMS if identifiable
  label: string | null;         // human readable product name
  material: string | null;      // material slug e.g. "powder-coat", "slate", "stainless-steel"
  widthMm: number | null;
  heightMm: number | null;
  thicknessMm: number | null;
  confidence: number;           // 0.0–1.0
  notes: string[];
}

const VISION_SYSTEM_PROMPT = `You are an expert in laser engraving flat bed items.
You analyze product photos and return structured JSON identifying the item category, closest matching product, material, and physical dimensions.

Available categories:
- "drinkware"    — tumblers, mugs, bottles laid flat
- "plate-board"  — plates, trays, cutting boards, platters
- "coaster-tile" — coasters, tiles (small flat squares/rounds)
- "sign-plaque"  — signs, plaques, nameplates
- "patch-tag"    — leather patches, dog tags, keychains, business cards
- "tech"         — phone cases, laptop stickers, card wallets
- "other"        — glass ornaments, rubber stamps, paper, fabric

Known item IDs and labels (pick the closest match or null):
- tumbler-20oz-flat     → "20oz Tumbler — Powder Coat"
- tumbler-30oz-flat     → "30oz Tumbler — Powder Coat"
- tumbler-40oz-flat     → "40oz Tumbler — Powder Coat"
- mug-11oz-ceramic      → "11oz Ceramic Mug — Lay Flat"
- water-bottle-ss       → "Stainless Water Bottle — Flat"
- ss-plate-10in         → "Stainless Plate 10\""
- ss-tray-12x8          → "Stainless Serving Tray 12×8\""
- cutting-board-bamboo-12x8 → "Bamboo Cutting Board 12×8\""
- wood-charcuterie-14x10    → "Wood Charcuterie Board 14×10\""
- acrylic-platter-12x8  → "Acrylic Serving Platter 12×8\""
- slate-coaster-4in     → "Slate Coaster 4\" Round"
- slate-coaster-4in-square  → "Slate Coaster 4\" Square"
- ceramic-tile-4x4      → "Ceramic Tile 4×4\""
- ceramic-tile-6x6      → "Ceramic Tile 6×6\""
- hardwood-coaster-4in  → "Hardwood Coaster 4\" Round"
- acrylic-coaster-4in   → "Acrylic Coaster 4\" Round"
- acrylic-sign-3x8      → "Acrylic Sign 3×8\""
- acrylic-sign-4x6      → "Acrylic Sign 4×6\""
- wood-plaque-4x6       → "Wood Plaque 4×6\""
- wood-plaque-5x7       → "Wood Plaque 5×7\""
- mdf-sign-12x6         → "MDF Sign 12×6\""
- brass-nameplate-3x1   → "Brass Nameplate 3×1\""
- aluminum-sign-8x3     → "Anodized Aluminum Sign 8×3\""
- ss-sign-8x3           → "Stainless Steel Sign 8×3\""
- leather-patch-3x2     → "Leather Patch 3×2\""
- pu-leather-patch-3x2  → "PU Leather Patch 3×2\""
- dog-tag-ss            → "Stainless Dog Tag"
- anodized-keychain     → "Anodized Aluminum Keychain"
- business-card-aluminum → "Metal Business Card (Anodized)"
- business-card-ss      → "Metal Business Card (Stainless)"
- phone-case-flat       → "Phone Case (Flat, ABS)"
- laptop-sticker-blank  → "Laptop Sticker Blank (Acrylic)"
- ss-card-wallet        → "Stainless Card / Wallet Insert"
- glass-ornament-3in    → "Glass Ornament 3\" Round"
- rubber-stamp-blank    → "Rubber Stamp Blank"
- paper-card-a2         → "Paper Card / A2 Envelope"
- fabric-patch-4x4      → "Fabric Patch 4×4\""

Known material slugs (use one of these or null):
powder-coat, stainless-steel, ceramic, slate, wood-hard, acrylic-cast, mdf, brass,
anodized-aluminum, leather-natural, leather-synthetic, plastic-abs, glass, rubber, paper, fabric

Always return valid JSON matching this schema exactly:
{
  "category": string | null,
  "itemId": string | null,
  "label": string | null,
  "material": string | null,
  "widthMm": number | null,
  "heightMm": number | null,
  "thicknessMm": number | null,
  "confidence": number,
  "notes": string[]
}

Use your knowledge of common product sizes. Estimate physical dimensions in millimeters.
If you cannot determine a value, use null. Do not include any text outside the JSON object.`;

const VISION_USER_PROMPT =
  "Identify this flat bed laser engraving item and return its category, closest matching product ID, material, and physical dimensions as JSON.";

function isValidMimeType(mimeType: string): boolean {
  return (
    mimeType === "image/jpeg" ||
    mimeType === "image/jpg" ||
    mimeType === "image/png" ||
    mimeType === "image/gif" ||
    mimeType === "image/webp"
  );
}

function normalizeMediaType(
  mimeType: string
): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  if (mimeType === "image/jpg") return "image/jpeg";
  if (
    mimeType === "image/jpeg" ||
    mimeType === "image/png" ||
    mimeType === "image/gif" ||
    mimeType === "image/webp"
  ) {
    return mimeType;
  }
  return "image/jpeg";
}

function parseFlatBedVisionResponse(raw: string): FlatBedVisionResult {
  const fallback: FlatBedVisionResult = {
    category: null,
    itemId: null,
    label: null,
    material: null,
    widthMm: null,
    heightMm: null,
    thicknessMm: null,
    confidence: 0.3,
    notes: ["Vision response could not be parsed."],
  };

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallback;
    const parsed = JSON.parse(jsonMatch[0]) as Partial<FlatBedVisionResult>;

    return {
      category:    typeof parsed.category  === "string" ? parsed.category  : null,
      itemId:      typeof parsed.itemId    === "string" ? parsed.itemId    : null,
      label:       typeof parsed.label     === "string" ? parsed.label     : null,
      material:    typeof parsed.material  === "string" ? parsed.material  : null,
      widthMm:     typeof parsed.widthMm    === "number" && parsed.widthMm    > 0 ? parsed.widthMm    : null,
      heightMm:    typeof parsed.heightMm   === "number" && parsed.heightMm   > 0 ? parsed.heightMm   : null,
      thicknessMm: typeof parsed.thicknessMm === "number" && parsed.thicknessMm > 0 ? parsed.thicknessMm : null,
      confidence:  typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5,
      notes:       Array.isArray(parsed.notes) ? parsed.notes.filter((n): n is string => typeof n === "string") : [],
    };
  } catch {
    return fallback;
  }
}

/**
 * Low-confidence null result returned when the API key is not configured
 * or when the image mime type is not supported.
 */
function noApiKeyResult(): FlatBedVisionResult {
  return {
    category: null,
    itemId: null,
    label: null,
    material: null,
    widthMm: null,
    heightMm: null,
    thicknessMm: null,
    confidence: 0.1,
    notes: ["ANTHROPIC_API_KEY not configured — vision analysis skipped."],
  };
}

/**
 * Analyzes a flat bed item image using Claude's vision API.
 *
 * Returns a low-confidence null result when ANTHROPIC_API_KEY is not
 * configured, allowing the caller to handle gracefully.
 */
export async function analyzeFlatBedWithVision(
  input: FlatBedVisionInput
): Promise<FlatBedVisionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !isValidMimeType(input.mimeType)) {
    return noApiKeyResult();
  }

  try {
    const client = new Anthropic({ apiKey });
    const base64 = Buffer.from(input.imageBytes).toString("base64");
    const mediaType = normalizeMediaType(input.mimeType);

    const message = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 512,
      system: VISION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            { type: "text", text: VISION_USER_PROMPT },
          ],
        },
      ],
    });

    const rawText = message.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("");

    return parseFlatBedVisionResponse(rawText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[flatbed-vision] analysis failed:", err);
    return {
      category: null,
      itemId: null,
      label: null,
      material: null,
      widthMm: null,
      heightMm: null,
      thicknessMm: null,
      confidence: 0.1,
      notes: [`Vision analysis failed — ${msg}`],
    };
  }
}
