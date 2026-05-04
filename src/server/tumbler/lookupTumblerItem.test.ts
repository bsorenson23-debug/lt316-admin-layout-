import assert from "node:assert/strict";
import test from "node:test";

import { computeWrapWidthFromDiameterMm } from "../../lib/productDimensionAuthority.ts";
import {
  extractOpenGraphProductMetadata,
  extractPageBodyText,
  lookupTumblerItem,
  parseDuetDimensionsMm,
  parseOpenAiDimensionExtraction,
  TumblerLookupManualEntryError,
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

function installFetchResponder(
  responder: (url: string) => Response | Promise<Response>,
): void {
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    return responder(url);
  };
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("Open Graph metadata extraction resolves product title and image", () => {
  const metadata = extractOpenGraphProductMetadata(`
    <html>
      <head>
        <meta property="og:title" content="Acme Trail Tumbler 18oz Navy" />
        <meta property="og:image" content="/cdn/acme-trail-tumbler.png" />
      </head>
      <body><h1>ignored</h1></body>
    </html>
  `, "https://example.com/products/trail");

  assert.deepEqual(metadata, {
    title: "Acme Trail Tumbler 18oz Navy",
    imageUrl: "https://example.com/cdn/acme-trail-tumbler.png",
  });
});

test("page body text extraction removes scripts and markup", () => {
  const text = extractPageBodyText(`
    <html>
      <body>
        <script>window.__DATA__ = "do not include";</script>
        <style>.x { display: none; }</style>
        <h1>Acme Trail Tumbler</h1>
        <p>Capacity 18oz with stainless body.</p>
      </body>
    </html>
  `);

  assert.equal(text.includes("do not include"), false);
  assert.equal(text.includes("Acme Trail Tumbler"), true);
  assert.equal(text.includes("Capacity 18oz"), true);
});

test("OpenAI dimension parser accepts strict JSON and rejects non-mm dimensions", () => {
  const parsed = parseOpenAiDimensionExtraction(JSON.stringify({
    diameterMm: 88.9,
    heightMm: 203.2,
    capacityOz: 18,
    confidence: 0.91,
    notes: ["converted from manufacturer inches"],
  }));

  assert.deepEqual(parsed, {
    diameterMm: 88.9,
    heightMm: 203.2,
    capacityOz: 18,
    confidence: 0.91,
    notes: ["converted from manufacturer inches"],
    rawJson: "{\"diameterMm\":88.9,\"heightMm\":203.2,\"capacityOz\":18,\"confidence\":0.91,\"notes\":[\"converted from manufacturer inches\"]}",
  });
  assert.equal(parseOpenAiDimensionExtraction("{\"diameterMm\":3.5,\"heightMm\":8,\"capacityOz\":18}"), null);
  assert.equal(parseOpenAiDimensionExtraction("not json"), null);
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

test("known RTIC URL with missing Open Graph metadata resolves before manual fallback", async () => {
  let extractorCalled = false;
  installFetchMock({
    [RTIC_URL]: `
      <html>
        <head>
          <title>RTIC Essential Tumbler 20oz Navy</title>
        </head>
        <body>
          <h1>RTIC Essential Tumbler</h1>
          <p>Size: 20oz</p>
          <p>Color: Navy</p>
          <img src="${PRODUCT_IMAGE_URL}" alt="RTIC 20oz Tumbler Navy" />
        </body>
      </html>
    `,
  });

  const result = await lookupTumblerItem({
    lookupInput: RTIC_URL,
    dimensionExtractor: async () => {
      extractorCalled = true;
      return {
        diameterMm: 91,
        heightMm: 199,
        capacityOz: 20,
        confidence: 0.88,
      };
    },
  });

  assert.equal(extractorCalled, false);
  assert.equal(result.mode, "matched-profile");
  assert.equal(result.brand, "RTIC");
  assert.equal(result.capacityOz, 20);
  assert.equal(result.matchedProfileId, "rtic-20");
  assert.equal(result.profileAuthority, "exact-internal-profile");
  assert.notEqual(result.profileAuthority, "dynamic-llm-extracted");
  assert.equal(result.dimensions.dimensionSourceKind, "internal-profile");
  assert.equal(result.dimensions.outsideDiameterMm, 93);
  assert.equal(result.dimensions.overallHeightMm, 190);
  assert.equal(result.dimensions.wrapWidthMm, 292.17);
});

test("official dimensions that differ from an internal profile override with a warning", async () => {
  const rticMismatchUrl = "https://rticoutdoors.com/Tumblers?size=20oz&color=Black";
  installFetchMock({
    [rticMismatchUrl]: `
      <html>
        <head>
          <title>RTIC Essential Tumbler 20oz Black</title>
          <meta property="og:title" content="RTIC Essential Tumbler 20oz Black" />
          <meta property="og:image" content="${PRODUCT_IMAGE_URL}" />
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

test("LLM dimensions create a dynamic parsed-page response without a known profile", async () => {
  const dynamicUrl = "https://example.com/products/orbit-travel-cup?size=18oz&color=Graphite";
  const dynamicImageUrl = "https://example.com/images/orbit-travel-cup.png";
  installFetchMock({
    [dynamicUrl]: `
      <html>
        <head>
          <meta property="og:title" content="Acme Orbit Travel Cup 18oz Graphite" />
          <meta property="og:image" content="${dynamicImageUrl}" />
        </head>
        <body>
          <h1>Acme Orbit Travel Cup</h1>
          <p>Made for commute cup holders. Capacity 18oz.</p>
          <p>Physical dimensions are listed in a product table image.</p>
        </body>
      </html>
    `,
  });

  const result = await lookupTumblerItem({
    lookupInput: dynamicUrl,
    dimensionExtractor: async (input) => {
      assert.equal(input.title, "Acme Orbit Travel Cup 18oz Graphite");
      assert.equal(input.pageText.includes("Capacity 18oz"), true);
      return {
        diameterMm: 88.9,
        heightMm: 203.2,
        capacityOz: 18,
        confidence: 0.91,
        notes: ["manufacturer copy was converted to millimeters"],
      };
    },
  });

  assert.equal(result.mode, "parsed-page");
  assert.equal(result.matchedProfileId, null);
  assert.equal(result.profileAuthority, "dynamic-llm-extracted");
  assert.equal(result.requiresBodyReferenceReview, true);
  assert.equal(result.title, "Acme Orbit Travel Cup 18oz Graphite");
  assert.equal(result.capacityOz, 18);
  assert.equal(result.imageUrl, dynamicImageUrl);
  assert.equal(result.glbPath, "");
  assert.equal(result.sourceModelAvailability, "missing-source-model");
  assert.equal(result.dimensions.dimensionSourceKind, "llm-page");
  assert.equal(result.dimensions.diameterMm, 88.9);
  assert.equal(result.dimensions.overallHeightMm, 203.2);
  assert.equal(result.dimensions.wrapWidthMm, computeWrapWidthFromDiameterMm(88.9));
  assert.equal(result.notes.some((note) => note.includes("OpenAI extracted product dimensions")), true);
  assert.equal(result.notes.some((note) => note.includes("no exact internal tumbler profile matched")), true);
});

test("known profile URL lookups do not call LLM extraction", async () => {
  const dynamicRticUrl = "https://example.com/products/rtic-compatible?size=20oz&color=Navy";
  const dynamicImageUrl = PRODUCT_IMAGE_URL;
  let extractorCalled = false;
  installFetchMock({
    [dynamicRticUrl]: `
      <html>
        <head>
          <meta property="og:title" content="RTIC Essential Tumbler 20oz Navy" />
          <meta property="og:image" content="${dynamicImageUrl}" />
        </head>
        <body>
          <h1>RTIC Essential Tumbler</h1>
          <p>Capacity 20oz. The product table is rendered client-side.</p>
        </body>
      </html>
    `,
  });

  const result = await lookupTumblerItem({
    lookupInput: dynamicRticUrl,
    dimensionExtractor: async () => {
      extractorCalled = true;
      return {
        diameterMm: 91,
        heightMm: 199,
        capacityOz: 20,
        confidence: 0.88,
        notes: ["dynamic dimensions should not run"],
      };
    },
  });

  assert.equal(extractorCalled, false);
  assert.equal(result.mode, "matched-profile");
  assert.equal(result.matchedProfileId, "rtic-20");
  assert.equal(result.profileAuthority, "exact-internal-profile");
  assert.equal(result.profileAuthorityLabel, "Exact profile");
  assert.equal(result.dimensions.dimensionSourceKind, "internal-profile");
  assert.equal(result.dimensions.outsideDiameterMm, 93);
  assert.equal(result.dimensions.overallHeightMm, 190);
  assert.equal(result.capacityOz, 20);
});

test("Stanley and YETI deterministic URL lookups do not call LLM extraction", async () => {
  const stanleyUrl = "https://www.stanley1913.com/products/quencher-h2-0-flowstate-tumbler-40-oz";
  const yetiUrl = "https://www.yeti.com/drinkware/tumblers/rambler-40oz.html";
  let extractorCallCount = 0;
  installFetchMock({
    [stanleyUrl]: `
      <html>
        <head><title>Stanley Quencher H2.0 FlowState 40 oz tumbler</title></head>
        <body><h1>Stanley Quencher H2.0 FlowState 40 oz</h1></body>
      </html>
    `,
    [yetiUrl]: `
      <html>
        <head><title>YETI Rambler 40 oz tumbler</title></head>
        <body><h1>YETI Rambler 40 oz tumbler</h1></body>
      </html>
    `,
  });

  const extractor = async () => {
    extractorCallCount += 1;
    return {
      diameterMm: 91,
      heightMm: 199,
      capacityOz: 40,
      confidence: 0.88,
    };
  };

  const stanley = await lookupTumblerItem({
    lookupInput: stanleyUrl,
    dimensionExtractor: extractor,
  });
  const yeti = await lookupTumblerItem({
    lookupInput: yetiUrl,
    dimensionExtractor: extractor,
  });

  assert.equal(extractorCallCount, 0);
  assert.equal(stanley.mode, "matched-profile");
  assert.equal(stanley.matchedProfileId, "stanley-quencher-40");
  assert.notEqual(stanley.profileAuthority, "dynamic-llm-extracted");
  assert.equal(yeti.mode, "matched-profile");
  assert.equal(yeti.matchedProfileId, "yeti-rambler-40");
  assert.notEqual(yeti.profileAuthority, "dynamic-llm-extracted");
});

test("known official URL still matches profile when fetch is blocked with 403", async () => {
  installFetchResponder(() => new Response("forbidden", { status: 403 }));

  const result = await lookupTumblerItem({
    lookupInput: RTIC_URL,
    dimensionExtractor: async () => {
      throw new Error("dimension extractor should not run for blocked URL fallback");
    },
  });

  assert.equal(result.mode, "matched-profile");
  assert.equal(result.matchedProfileId, "rtic-20");
  assert.equal(result.resolvedUrl, null);
  assert.equal(result.sources.length, 0);
  assert.equal(result.notes.some((note) => note.includes("Lookup fetch blocked")), true);
});

test("known official URL still matches profile when fetch is rate-limited with 429", async () => {
  installFetchResponder(() => new Response("rate limited", { status: 429 }));

  const result = await lookupTumblerItem({
    lookupInput: RTIC_URL,
    dimensionExtractor: async () => {
      throw new Error("dimension extractor should not run for blocked URL fallback");
    },
  });

  assert.equal(result.mode, "matched-profile");
  assert.equal(result.matchedProfileId, "rtic-20");
  assert.equal(result.resolvedUrl, null);
  assert.equal(result.sources.length, 0);
  assert.equal(result.notes.some((note) => note.includes("Lookup fetch blocked")), true);
});

test("known official URL still matches profile when fetch returns 404", async () => {
  installFetchResponder(() => new Response("not found", { status: 404 }));

  const result = await lookupTumblerItem({
    lookupInput: RTIC_URL,
    dimensionExtractor: async () => {
      throw new Error("dimension extractor should not run for blocked URL fallback");
    },
  });

  assert.equal(result.mode, "matched-profile");
  assert.equal(result.matchedProfileId, "rtic-20");
  assert.equal(result.resolvedUrl, null);
  assert.equal(result.sources.length, 0);
  assert.equal(result.notes.some((note) => note.includes("Lookup fetch blocked")), true);
});

test("unknown URL with blocked fetch remains non-authoritative safe fallback", async () => {
  const unknownUrl = "https://example.com/products/unknown-blocked-tumbler";
  installFetchResponder(() => new Response("not found", { status: 404 }));

  const result = await lookupTumblerItem({ lookupInput: unknownUrl });

  assert.equal(result.mode, "safe-fallback");
  assert.equal(result.profileAuthority, "unknown");
  assert.equal(result.matchedProfileId, null);
  assert.equal(result.resolvedUrl, null);
  assert.equal(result.sources.length, 0);
  assert.equal(result.notes.some((note) => note.includes("Lookup fetch blocked")), true);
});

test("unknown URL with missing Open Graph metadata returns a manual-entry lookup error after fallbacks fail", async () => {
  const noOgUrl = "https://example.com/products/no-og-cup";
  let extractorCalled = false;
  installFetchMock({
    [noOgUrl]: "<html><head><title>No OG Cup</title></head><body>20oz cup</body></html>",
  });

  await assert.rejects(
    () => lookupTumblerItem({
      lookupInput: noOgUrl,
      dimensionExtractor: async () => {
        extractorCalled = true;
        return null;
      },
    }),
    (error) => (
      error instanceof TumblerLookupManualEntryError &&
      error.message.includes("Could not extract usable tumbler dimensions")
    ),
  );
  assert.equal(extractorCalled, true);
});

test("LLM extraction failure for unknown URL returns a manual-entry lookup error", async () => {
  const ambiguousUrl = "https://example.com/products/ambiguous-cup";
  installFetchMock({
    [ambiguousUrl]: `
      <html>
        <head>
          <meta property="og:title" content="Acme Ambiguous Cup" />
          <meta property="og:image" content="https://example.com/images/ambiguous-cup.png" />
        </head>
        <body><p>Great drinkware with no physical specs.</p></body>
      </html>
    `,
  });

  await assert.rejects(
    () => lookupTumblerItem({
      lookupInput: ambiguousUrl,
      dimensionExtractor: async () => null,
    }),
    (error) => (
      error instanceof TumblerLookupManualEntryError &&
      error.message.includes("Could not extract usable tumbler dimensions")
    ),
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
