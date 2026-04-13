import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  resolveLidSampleWindow,
  resolvePreferredFrontAppearanceReference,
  sampleDrinkwareAppearanceColors,
  sampleLidColorHex,
} from "./tumblerAppearanceSampling.ts";
import type { TumblerItemLookupFitDebug, TumblerItemLookupResponse } from "@/types/tumblerItemLookup";

function makeFitDebug(overrides: Partial<TumblerItemLookupFitDebug> = {}): TumblerItemLookupFitDebug {
  return {
    kind: "lathe-body-fit",
    sourceImageUrl: "https://example.com/front.png",
    imageWidthPx: 160,
    imageHeightPx: 260,
    silhouetteBoundsPx: { minX: 38, minY: 10, maxX: 122, maxY: 248 },
    centerXPx: 80,
    fullTopPx: 10,
    fullBottomPx: 248,
    bodyTopPx: 50,
    bodyBottomPx: 248,
    rimTopPx: 40,
    rimBottomPx: 49,
    referenceBandTopPx: 82,
    referenceBandBottomPx: 110,
    referenceBandCenterYPx: 96,
    referenceBandWidthPx: 80,
    maxCenterWidthPx: 82,
    referenceHalfWidthPx: 41,
    fitScore: 0.9,
    profilePoints: [],
    ...overrides,
  };
}

async function buildSyntheticFrontImage(): Promise<Uint8Array> {
  const width = 160;
  const height = 260;
  const pixels = new Uint8Array(width * height * 4);
  const background = [8, 10, 16, 255];
  const lid = [176, 178, 186, 255];
  const ring = [220, 222, 226, 255];
  const body = [150, 118, 166, 255];
  const straw = [245, 245, 245, 255];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      pixels.set(background, idx);

      const insideBody = x >= 40 && x <= 120 && y >= 10 && y <= 248;
      if (!insideBody) continue;

      let fill = body;
      if (y >= 10 && y <= 39) fill = lid;
      if (y >= 40 && y <= 49) fill = ring;
      if (x >= 75 && x <= 85 && y >= 0 && y <= 45) fill = straw;
      pixels.set(fill, idx);
    }
  }

  const buffer = await sharp(pixels, {
    raw: { width, height, channels: 4 },
  }).png().toBuffer();

  return new Uint8Array(buffer);
}

test("resolvePreferredFrontAppearanceReference prefers a strict front image over a canonical front-3q", () => {
  const result = {
    lookupInput: "stanley",
    resolvedUrl: "https://example.com/item",
    title: "Stanley Quencher",
    brand: "Stanley",
    model: "Quencher",
    capacityOz: 40,
    matchedProfileId: "stanley-quencher-40",
    glbPath: "/models/generated/example.glb",
    imageUrl: "https://example.com/fallback-front.png",
    imageUrls: [],
    productReferenceSet: {
      productKey: "stanley-quencher-40",
      images: [
        {
          id: "front-3q",
          url: "https://example.com/front-3q.png",
          source: "official",
          hash: "front-3q",
          width: 160,
          height: 260,
          viewClass: "front-3q",
          handleVisible: true,
          handleSide: "right",
          logoDetected: true,
          confidence: 0.94,
        },
        {
          id: "front",
          url: "https://example.com/front.png",
          source: "official",
          hash: "front",
          width: 160,
          height: 260,
          viewClass: "front",
          handleVisible: true,
          handleSide: "right",
          logoDetected: true,
          confidence: 0.87,
        },
      ],
      canonicalFrontImageId: "front-3q",
      orientationConfidence: 0.91,
    },
    bodyColorHex: "#9676a6",
    rimColorHex: "#dcdfe2",
    fitDebug: null,
    dimensions: {
      overallHeightMm: 273.8,
      outsideDiameterMm: 101,
      topDiameterMm: 101,
      bottomDiameterMm: 79,
      usableHeightMm: 216,
    },
    mode: "matched-profile",
    notes: [],
    sources: [],
  } satisfies TumblerItemLookupResponse;

  const resolved = resolvePreferredFrontAppearanceReference(result);
  assert.deepEqual(resolved, {
    url: "https://example.com/front.png",
    viewClass: "front",
  });
});

test("resolveLidSampleWindow returns null for a shallow lid band", () => {
  const window = resolveLidSampleWindow({
    fitDebug: makeFitDebug({ rimTopPx: 14 }),
    width: 160,
    height: 260,
  });
  assert.equal(window, null);
});

test("sampleLidColorHex samples the lid sides and ignores the center straw gap", async () => {
  const lidColorHex = await sampleLidColorHex({
    imageBytes: await buildSyntheticFrontImage(),
    fitDebug: makeFitDebug(),
    sourceViewClass: "front",
  });

  assert.equal(lidColorHex, "#b0b2ba");
});

test("sampleDrinkwareAppearanceColors resolves body, lid, and rim colors from a front image", async () => {
  const sampled = await sampleDrinkwareAppearanceColors({
    imageBytes: await buildSyntheticFrontImage(),
    sourceViewClass: "front",
  });

  assert.equal(sampled?.bodyColorHex, "#9676a6");
  assert.equal(sampled?.lidColorHex, "#b0b2ba");
  assert.equal(sampled?.rimColorHex, "#dcdee2");
});
