export interface AlphaSilhouetteAnalysis {
  hasUsefulAlpha: boolean;
  tightThreshold: number;
  translucentPixelRatio: number;
}

export function percentileUint8(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const clampedFraction = Math.min(1, Math.max(0, fraction));
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round((sorted.length - 1) * clampedFraction)),
  );
  return sorted[index] ?? 0;
}

export function analyzeAlphaSilhouette(
  alphaValues: readonly number[],
  totalPixels: number,
): AlphaSilhouetteAnalysis {
  let translucentPixels = 0;
  for (const alpha of alphaValues) {
    if (alpha < 245) {
      translucentPixels += 1;
    }
  }

  const safeTotalPixels = Math.max(1, totalPixels);
  const hasUsefulAlpha = translucentPixels > (safeTotalPixels * 0.01);

  return {
    hasUsefulAlpha,
    tightThreshold: hasUsefulAlpha
      ? Math.min(232, Math.max(96, percentileUint8(alphaValues, 0.34)))
      : 0,
    translucentPixelRatio: translucentPixels / safeTotalPixels,
  };
}
