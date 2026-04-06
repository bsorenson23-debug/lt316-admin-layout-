function isLikelyUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

const STANLEY_CANONICAL_PRODUCT_SLUGS: Record<string, string> = {
  "the-quencher-h2-0-flowstate-tumbler-40-oz": "adventure-quencher-travel-tumbler-40-oz",
  "quencher-h2-0-flowstate-tumbler-40-oz": "adventure-quencher-travel-tumbler-40-oz",
};

export function normalizeProductLookupUrl(input: string): {
  value: string;
  note: string | null;
} {
  const trimmed = input.trim();
  if (!trimmed || !isLikelyUrl(trimmed)) {
    return { value: trimmed, note: null };
  }

  try {
    const parsed = new URL(trimmed);
    if (!/(\.|^)stanley1913\.com$/i.test(parsed.hostname)) {
      return { value: trimmed, note: null };
    }

    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length < 2 || segments[0]?.toLowerCase() !== "products") {
      return { value: trimmed, note: null };
    }

    const rawSlug = segments.at(-1)?.toLowerCase() ?? "";
    const canonicalSlug = STANLEY_CANONICAL_PRODUCT_SLUGS[rawSlug];
    if (!canonicalSlug || canonicalSlug === rawSlug) {
      return { value: trimmed, note: null };
    }

    parsed.pathname = `/products/${canonicalSlug}`;
    return {
      value: parsed.toString(),
      note: `Normalized Stanley legacy product URL to ${canonicalSlug}.`,
    };
  } catch {
    return { value: trimmed, note: null };
  }
}
