import assert from "node:assert/strict";
import test from "node:test";

import { extractShopifySelectedVariant } from "./shopifyProductVariant.ts";

const stanleyVariantHtml = `
  variants: [
    {
      id: "53974073049448",
      selectedOptions: [{ name: "Color", value: "Sea Glass Aura" }],
      imageUrl: "https://www.stanley1913.com/cdn/shop/files/sea-glass.png?v=1",
      title: "Sea Glass Aura",
    },
    {
      id: "53973995716968",
      selectedOptions: [
        { name: "Color", value: "Daffodil" }
      ],
      imageUrl: "https://www.stanley1913.com/cdn/shop/files/Web_PNG_Square-The_IceFlow_Flip_Straw_2.0_Tumbler_30OZ_-_Daffodil_-_Front_grande.png?v=1772239809",
      price: "4000",
      currency: "USD",
      availableForSale: true,
      title: "Daffodil",
    },
    {
      id: "53973995749736",
      selectedOptions: [{ name: "Color", value: "Spring Green" }],
      imageUrl: "https://www.stanley1913.com/cdn/shop/files/spring-green.png?v=1",
      title: "Spring Green",
    },
  ]
`;

test("extractShopifySelectedVariant resolves the exact URL variant color and image", () => {
  const variant = extractShopifySelectedVariant(
    stanleyVariantHtml,
    "https://www.stanley1913.com/products/the-iceflow-flip-straw-tumbler-30-oz?variant=53973995716968",
  );

  assert.equal(variant?.id, "53973995716968");
  assert.equal(variant?.title, "Daffodil");
  assert.equal(variant?.selectedColorOrFinish, "Daffodil");
  assert.match(variant?.imageUrl ?? "", /Daffodil_-_Front_grande\.png/);
});

test("extractShopifySelectedVariant returns null when URL has no exact variant id", () => {
  assert.equal(
    extractShopifySelectedVariant(stanleyVariantHtml, "https://www.stanley1913.com/products/the-iceflow-flip-straw-tumbler-30-oz"),
    null,
  );
});
