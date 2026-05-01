import assert from "node:assert/strict";
import test from "node:test";

import { computeWrapWidthFromDiameterMm } from "../../lib/productDimensionAuthority.ts";
import {
  lookupTumblerItem,
  parseDuetDimensionsMm,
} from "./lookupTumblerItem.ts";
import { ensureGeneratedTumblerGlb } from "./generateTumblerModel.ts";

const RTIC_URL = "https://rticoutdoors.com/Tumblers?size=20oz&color=Navy";
const PRODUCT_IMAGE_URL = "https://rticoutdoors.com/cdn/shop/files/rtic-essential-tumbler-20oz-navy.png";
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

const originalFetch = globalThis.fetch;

function installFetchMock(htmlByUrl: Record<string, string>): void {
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    const normalizedUrl = url.replace(/&amp;/g, "&");
    const html = htmlByUrl[normalizedUrl] ?? htmlByUrl[url];

    if (html) {
      return new Response(html, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      });
    }

    if (normalizedUrl === PRODUCT_IMAGE_URL) {
      return new Response(TINY_PNG, {
        status: 200,
        headers: {
          "content-type": "image/png",
        },
      });
    }

    return new Response("not found", { status: 404 });
  };
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("duet parser accepts straight tumbler diameter x height specs", () => {
  const parsed = parseDuetDimensionsMm({
    text: "Dimensions: 3.66\" x 7.48\" for the 20oz tumbler.",
    resolvedUrl: RTIC_URL,
    lookupInput: RTIC_URL,
    title: "RTIC Essential Tumbler 20oz Navy",
    selectedSizeOz: 20,
    selectedColorOrFinish: "Navy",
    availableSizeOz: [20],
    lookupProductId: RTIC_URL,
    sourceKind: "official",
    shapeType: "straight",
  });

  assert.ok(parsed);
  assert.equal(parsed.dimensionSourceKind, "official-page");
  assert.equal(parsed.outsideDiameterMm, 92.96);
  assert.equal(parsed.overallHeightMm, 189.99);
  assert.equal(parsed.wrapWidthMm, computeWrapWidthFromDiameterMm(92.96));
});

test("duet parser accepts millimeter diameter x height specs", () => {
  const parsed = parseDuetDimensionsMm({
    text: "Specs 92mm x 190mm",
    resolvedUrl: RTIC_URL,
    lookupInput: RTIC_URL,
    title: "RTIC Essential Tumbler 20oz Navy",
    selectedSizeOz: 20,
    selectedColorOrFinish: "Navy",
    availableSizeOz: [20],
    lookupProductId: RTIC_URL,
    sourceKind: "official",
    shapeType: "straight",
  });

  assert.ok(parsed);
  assert.equal(parsed.outsideDiameterMm, 92);
  assert.equal(parsed.overallHeightMm, 190);
});

test("duet parser skips tapered triplet-shaped specs", () => {
  const parsed = parseDuetDimensionsMm({
    text: "Dimensions: 3.5 x 4.0 x 8.0 in",
    resolvedUrl: RTIC_URL,
    lookupInput: RTIC_URL,
    title: "Tapered tumbler",
    selectedSizeOz: 20,
    selectedColorOrFinish: null,
    availableSizeOz: [20],
    lookupProductId: RTIC_URL,
    sourceKind: "official",
    shapeType: "straight",
  });

  assert.equal(parsed, null);
});

test("RTIC 20oz Navy URL resolves to official matched profile with generated source model seed", async () => {
  installFetchMock({
    [RTIC_URL]: `
      <html>
        <head>
          <title>RTIC Essential Tumbler 20oz Navy</title>
          <meta property="og:title" content="RTIC Essential Tumbler 20oz Navy" />
          <meta property="og:image" content="${PRODUCT_IMAGE_URL}" />
        </head>
        <body>
          <h1>RTIC Essential Tumbler</h1>
          <p>Size: 20oz</p>
          <p>Color: Navy</p>
          <p>Dimensions: 3.66" x 7.48"</p>
        </body>
      </html>
    `,
  });

  const result = await lookupTumblerItem({ lookupInput: RTIC_URL });

  assert.equal(result.brand, "RTIC");
  assert.equal(result.model, "20oz Tumbler");
  assert.equal(result.capacityOz, 20);
  assert.equal(result.matchedProfileId, "rtic-20");
  assert.equal(result.sources[0]?.kind, "official");
  assert.equal(result.profileAuthority, "exact-internal-profile");
  assert.equal(result.sourceModelAvailability, "generated-source-model");
  assert.equal(result.modelStatus, "verified-product-model");
  assert.notEqual(result.glbPath, "");
  assert.equal(result.dimensions.selectedColorOrFinish, "Navy");
  assert.equal(result.dimensions.dimensionSourceKind, "internal-profile");
  assert.equal(result.dimensions.outsideDiameterMm, 93);
  assert.equal(result.dimensions.overallHeightMm, 190);
  assert.equal(Math.round((result.dimensions.wrapWidthMm ?? 0) * 10) / 10, 292.2);
});

test("official dimensions that differ from an internal profile override with a warning", async () => {
  const rticMismatchUrl = "https://rticoutdoors.com/Tumblers?size=20oz&color=Black";
  installFetchMock({
    [rticMismatchUrl]: `
      <html>
        <head>
          <title>RTIC Essential Tumbler 20oz Black</title>
          <meta property="og:title" content="RTIC Essential Tumbler 20oz Black" />
        </head>
        <body>
          <h1>RTIC Essential Tumbler 20oz</h1>
          <p>Dimensions: 120 mm x 220 mm</p>
        </body>
      </html>
    `,
  });

  const result = await lookupTumblerItem({ lookupInput: rticMismatchUrl });

  assert.equal(result.matchedProfileId, "rtic-20");
  assert.equal(result.profileAuthority, "official-dimensions-over-profile");
  assert.equal(result.dimensions.dimensionSourceKind, "official-page");
  assert.equal(result.dimensions.outsideDiameterMm, 120);
  assert.equal(result.dimensions.overallHeightMm, 220);
  assert.equal(
    result.notes.some((note) => note.includes("Official page dimensions override")),
    true,
  );
});

test("straight profiles without explicit generation policy can generate but tapered profiles remain gated", async () => {
  installFetchMock({});

  const straight = await ensureGeneratedTumblerGlb("rtic-20", {
    imageUrl: PRODUCT_IMAGE_URL,
  });
  assert.notEqual(straight.glbPath, "");

  const tapered = await ensureGeneratedTumblerGlb("stanley-quencher-40", {
    imageUrl: PRODUCT_IMAGE_URL,
  });
  assert.equal(tapered.glbPath, "");
});

test("unknown generic lookup remains unknown and needs review", async () => {
  const result = await lookupTumblerItem({
    lookupInput: "mystery drinkware no exact brand",
  });

  assert.equal(result.mode, "safe-fallback");
  assert.equal(result.profileAuthority, "unknown");
  assert.equal(result.requiresBodyReferenceReview, true);
  assert.equal(result.sourceModelAvailability, "missing-source-model");
  assert.equal(result.glbPath, "");
});
