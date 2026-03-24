/**
 * removeBlackBg.ts — Fast threshold-based background removal for product photos
 * with solid dark backgrounds. Works instantly (no WASM/AI).
 *
 * Samples corner pixels to detect dark backgrounds, then sets near-black
 * pixels transparent. For complex backgrounds, use @imgly/background-removal.
 */

/** Check whether an image has a predominantly dark background by sampling corners. */
export function hasDarkBackground(img: HTMLImageElement, threshold = 40): boolean {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0);

  const w = canvas.width;
  const h = canvas.height;
  // Sample 5px inset from each corner + mid-edges (8 points)
  const samplePoints = [
    [5, 5], [w - 5, 5],                     // top-left, top-right
    [5, h - 5], [w - 5, h - 5],             // bottom-left, bottom-right
    [w / 2, 5], [w / 2, h - 5],             // mid-top, mid-bottom
    [5, h / 2], [w - 5, h / 2],             // mid-left, mid-right
  ];

  let darkCount = 0;
  for (const [x, y] of samplePoints) {
    const px = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
    if (px[0] < threshold && px[1] < threshold && px[2] < threshold) {
      darkCount++;
    }
  }

  // At least 6 of 8 sample points must be dark
  return darkCount >= 6;
}

/**
 * Remove near-black pixels from an image by setting their alpha to 0.
 * Returns a PNG data URL with transparency.
 */
export function removeBlackBackground(
  img: HTMLImageElement,
  threshold = 35,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    if (r < threshold && g < threshold && b < threshold) {
      data[i + 3] = 0; // transparent
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}
