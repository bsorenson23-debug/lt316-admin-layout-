export interface ShopifySelectedVariant {
  id: string;
  title: string | null;
  selectedColorOrFinish: string | null;
  imageUrl: string | null;
}

function decodeHtml(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function getProductVariantId(productUrl: string | null | undefined): string | null {
  if (!productUrl) return null;
  try {
    const variant = new URL(productUrl).searchParams.get("variant");
    return variant && /^\d+$/.test(variant) ? variant : null;
  } catch {
    return null;
  }
}

function firstMatch(block: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = block.match(pattern);
    if (match?.[1]) return decodeHtml(match[1].trim());
  }
  return null;
}

function extractVariantBlock(html: string, variantId: string): string | null {
  const idPattern = new RegExp(`\\bid\\s*:\\s*["']${variantId}["']|\\b"id"\\s*:\\s*["']?${variantId}["']?`, "i");
  const idMatch = html.match(idPattern);
  if (!idMatch || idMatch.index == null) return null;

  const start = idMatch.index;
  const remaining = html.slice(start);
  const nextVariantMatch = remaining.slice(idMatch[0].length).match(/\{\s*(?:id|"id")\s*:/i);
  const end = nextVariantMatch?.index != null
    ? start + idMatch[0].length + nextVariantMatch.index
    : Math.min(html.length, start + 2600);

  return html.slice(start, end);
}

export function extractShopifySelectedVariant(
  html: string,
  productUrl: string | null | undefined,
): ShopifySelectedVariant | null {
  const variantId = getProductVariantId(productUrl);
  if (!variantId) return null;

  const block = extractVariantBlock(html, variantId);
  if (!block) return null;

  const selectedColorOrFinish = firstMatch(block, [
    /name\s*:\s*["']Color["'][\s\S]{0,360}?value\s*:\s*["']([^"']+)["']/i,
    /"name"\s*:\s*"Color"[\s\S]{0,360}?"value"\s*:\s*"([^"]+)"/i,
  ]);
  const title = firstMatch(block, [
    /title\s*:\s*["']([^"']+)["']/i,
    /"title"\s*:\s*"([^"]+)"/i,
  ]);
  const imageUrl = firstMatch(block, [
    /imageUrl\s*:\s*["']([^"']+)["']/i,
    /"imageUrl"\s*:\s*"([^"]+)"/i,
    /"featured_image"\s*:\s*"([^"]+)"/i,
  ]);

  return {
    id: variantId,
    title,
    selectedColorOrFinish: selectedColorOrFinish ?? title,
    imageUrl,
  };
}
