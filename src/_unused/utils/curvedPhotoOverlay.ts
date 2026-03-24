/**
 * curvedPhotoOverlay.ts
 *
 * Renders a product photo with simulated cylindrical perspective by
 * slicing it into vertical strips and applying cos-based compression,
 * slight vertical stretch, and brightness falloff at the edges.
 *
 * Used purely for the 2D grid overlay — does NOT affect artwork
 * coordinates or LightBurn export output.
 */

const DEFAULT_SLICES = 30;

/**
 * Draw a single photo with cylindrical curvature simulation.
 *
 * @param ctx        - destination canvas 2D context
 * @param img        - source photo (HTMLImageElement or HTMLCanvasElement)
 * @param x          - left edge of the destination zone (px)
 * @param y          - top edge of the destination zone (px)
 * @param width      - total width of the destination zone (px)
 * @param height     - total height of the destination zone (px)
 * @param curveAmount - 0 = flat, 1 = full cylinder wrap look (typical: 0.3)
 * @param slices     - number of vertical strips (more = smoother, default 30)
 */
export function drawCurvedPhoto(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
  curveAmount: number,
  slices = DEFAULT_SLICES,
): void {
  if (width <= 0 || height <= 0) return;
  const imgW = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
  const imgH = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
  if (imgW <= 0 || imgH <= 0) return;

  const sliceWidth = width / slices;
  const srcSliceW = imgW / slices;

  for (let i = 0; i < slices; i++) {
    // t ranges from -0.5 (left edge) to +0.5 (right edge)
    const t = (i + 0.5) / slices - 0.5;

    // Cylindrical projection: edges compress, center stays
    const angle = t * Math.PI * curveAmount;
    const cosAngle = Math.cos(angle);

    // Horizontal compression at edges
    const scaleX = cosAngle;
    // Slight vertical stretch at edges (subtle)
    const scaleY = 1 + (1 - cosAngle) * 0.05;

    // Brightness falloff: edges get darker (facing away from viewer)
    const brightness = 0.5 + 0.5 * cosAngle;

    const srcX = i * srcSliceW;
    const destX = x + i * sliceWidth + (sliceWidth * (1 - scaleX)) / 2;
    const destW = sliceWidth * scaleX;
    const destH = height * scaleY;
    const destY = y + (height - destH) / 2;

    ctx.save();
    ctx.globalAlpha = brightness;
    ctx.drawImage(
      img,
      srcX, 0, srcSliceW, imgH,  // source slice
      destX, destY, destW, destH, // destination slice
    );
    ctx.restore();
  }
}

/**
 * Draw edge-shading gradients to simulate the cylinder curving away.
 * Applies dark fades at the outer edges and at the center seam.
 *
 * @param ctx    - destination canvas 2D context
 * @param bedW   - total bed width in px
 * @param bedH   - total bed height in px
 * @param fadeW  - width of each fade zone in px (default: bedW * 0.04)
 */
export function drawEdgeShading(
  ctx: CanvasRenderingContext2D,
  bedW: number,
  bedH: number,
  fadeW?: number,
): void {
  const fw = fadeW ?? Math.max(8, bedW * 0.04);
  const halfW = bedW / 2;

  // Left outer edge (back photo left = wrapping away)
  const leftGrad = ctx.createLinearGradient(0, 0, fw, 0);
  leftGrad.addColorStop(0, "rgba(0,0,0,0.35)");
  leftGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = leftGrad;
  ctx.fillRect(0, 0, fw, bedH);

  // Right outer edge (front photo right = wrapping away)
  const rightGrad = ctx.createLinearGradient(bedW - fw, 0, bedW, 0);
  rightGrad.addColorStop(0, "rgba(0,0,0,0)");
  rightGrad.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = rightGrad;
  ctx.fillRect(bedW - fw, 0, fw, bedH);

  // Center seam — back photo right edge fade
  const seamLeft = ctx.createLinearGradient(halfW - fw, 0, halfW, 0);
  seamLeft.addColorStop(0, "rgba(0,0,0,0)");
  seamLeft.addColorStop(1, "rgba(0,0,0,0.25)");
  ctx.fillStyle = seamLeft;
  ctx.fillRect(halfW - fw, 0, fw, bedH);

  // Center seam — front photo left edge fade
  const seamRight = ctx.createLinearGradient(halfW, 0, halfW + fw, 0);
  seamRight.addColorStop(0, "rgba(0,0,0,0.25)");
  seamRight.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = seamRight;
  ctx.fillRect(halfW, 0, fw, bedH);
}

/**
 * Render a complete dual-panel curved overlay canvas.
 *
 * Returns an HTMLCanvasElement with both front and back photos
 * drawn with cylindrical perspective + edge shading. Use this
 * as the `image` prop for a Konva Image element.
 *
 * @param frontImg   - front face photo (or null)
 * @param backImg    - back face photo (or null)
 * @param bedW       - bed width in px
 * @param bedH       - bed height in px
 * @param curveAmount - 0–1, typically 0.3
 * @param showFront  - whether to draw front photo
 * @param showBack   - whether to draw back photo
 */
export function renderCurvedOverlayCanvas(
  frontImg: HTMLImageElement | null,
  backImg: HTMLImageElement | null,
  bedW: number,
  bedH: number,
  curveAmount: number,
  showFront: boolean,
  showBack: boolean,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(bedW);
  canvas.height = Math.ceil(bedH);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const halfW = bedW / 2;

  // Draw back photo on left half
  if (showBack && backImg) {
    drawCurvedPhoto(ctx, backImg, 0, 0, halfW, bedH, curveAmount);
  }

  // Draw front photo on right half
  if (showFront && frontImg) {
    drawCurvedPhoto(ctx, frontImg, halfW, 0, halfW, bedH, curveAmount);
  }

  // Edge shading for depth
  if (showFront || showBack) {
    drawEdgeShading(ctx, bedW, bedH);
  }

  return canvas;
}
