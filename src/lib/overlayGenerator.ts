/**
 * overlayGenerator.ts — Generate physically-accurate tumbler overlay canvases.
 *
 * The overlay canvas matches the EXACT grid dimensions (bedPxW × bedPxH).
 * Product photos use handle-centered layout:
 *   - Handle center at bedPxW / 2 (grid center)
 *   - Front face centered at bedPxW * 3/4 (right half)
 *   - Back face centered at bedPxW / 4 (left half)
 *   - Seam lines at both edges (x=0 and x=bedPxW)
 *
 * Photos always render FLAT — cylindrical distortion for SVG artwork
 * is handled separately by curvedItemsRenderer.ts.
 *
 * No runtime scaling needed — the canvas IS the grid.
 */

export interface OverlayOpts {
  bedPxW: number;
  bedPxH: number;
  pxPerMm: number;
  overallHeightMm?: number;
  topMarginMm?: number;
  bottomMarginMm?: number;
  diameterMm: number;
  frontImg: HTMLImageElement | null;
  backImg: HTMLImageElement | null;
  handleArcDeg: number;
  twoSided: boolean;
}

/**
 * Generate an overlay canvas at exact grid dimensions.
 *
 * Handle-centered layout:
 *   - Single mode: front photo centered at bedPxW * 3/4
 *   - 2-sided mode: front at 3/4, back at 1/4 (or mirrored front)
 */
export function generateOverlayCanvas(opts: OverlayOpts): HTMLCanvasElement | null {
  const { bedPxW, bedPxH, pxPerMm, overallHeightMm, topMarginMm, bottomMarginMm, diameterMm, frontImg, backImg, twoSided } = opts;
  if (!frontImg || bedPxW <= 0 || bedPxH <= 0) return null;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bedPxW);
  const overallPxH = Math.round(Math.max(bedPxH, (overallHeightMm ?? (bedPxH / pxPerMm)) * pxPerMm));
  canvas.height = overallPxH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const faceWidthPx = diameterMm * pxPerMm;
  const topMarginPx = Math.max(0, Math.round((topMarginMm ?? 0) * pxPerMm));
  const bottomMarginPx = Math.max(0, Math.round((bottomMarginMm ?? 0) * pxPerMm));
  // Handle-centered layout: front at 3/4, back at 1/4
  const frontCenterPx = bedPxW * 3 / 4;
  const backCenterPx = bedPxW / 4;

  if (!twoSided) {
    // ── Single mode: full photo centered on front face position ──
    const ar = frontImg.naturalWidth / frontImg.naturalHeight;
    const drawH = overallPxH;
    const drawW = drawH * ar;
    const drawX = frontCenterPx - drawW / 2;
    ctx.drawImage(frontImg, drawX, 0, drawW, drawH);
  } else {
    // ── 2-sided mode ──

    // FRONT face — right half, centered at 3/4
    drawFacePhoto(ctx, frontImg, frontCenterPx, faceWidthPx, overallPxH);

    // BACK face — left half, centered at 1/4
    ctx.save();
    ctx.globalAlpha = 0.7;
    if (backImg) {
      drawFacePhoto(ctx, backImg, backCenterPx, faceWidthPx, overallPxH);
    } else {
      drawFacePhotoMirrored(ctx, frontImg, backCenterPx, faceWidthPx, overallPxH);
    }
    ctx.restore();

    // Handle center divider (at grid center)
    const handleCenterPx = bedPxW / 2;
    ctx.strokeStyle = "rgba(255, 150, 50, 0.3)";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(handleCenterPx, 0);
    ctx.lineTo(handleCenterPx, overallPxH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Zone labels
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(40, 120, 200, 0.45)";
    ctx.fillText("FRONT \u25B6", frontCenterPx, 14);
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.fillText("\u25C0 BACK", backCenterPx, 14);
  }

  if (topMarginPx > 0) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
    ctx.fillRect(0, 0, bedPxW, topMarginPx);
  }
  if (bottomMarginPx > 0) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
    ctx.fillRect(0, Math.max(0, overallPxH - bottomMarginPx), bedPxW, bottomMarginPx);
  }
  if (topMarginPx > 0 || bottomMarginPx > 0) {
    ctx.strokeStyle = "rgba(74, 222, 128, 0.22)";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(0.5, topMarginPx + 0.5, Math.max(0, bedPxW - 1), Math.max(0, bedPxH - 1));
    ctx.setLineDash([]);
  }

  return canvas;
}

/** Draw a product photo centered at `centerPx`, clipped to `faceWidthPx`. */
function drawFacePhoto(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  centerPx: number,
  faceWidthPx: number,
  canvasH: number,
): void {
  const ar = img.naturalWidth / img.naturalHeight;
  const drawH = canvasH;
  const drawW = drawH * ar;

  ctx.save();
  ctx.beginPath();
  ctx.rect(centerPx - faceWidthPx / 2, 0, faceWidthPx, canvasH);
  ctx.clip();
  ctx.drawImage(img, centerPx - drawW / 2, 0, drawW, drawH);
  ctx.restore();
}

/** Draw a horizontally-mirrored product photo centered at `centerPx`. */
function drawFacePhotoMirrored(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  centerPx: number,
  faceWidthPx: number,
  canvasH: number,
): void {
  const ar = img.naturalWidth / img.naturalHeight;
  const drawH = canvasH;
  const drawW = drawH * ar;

  ctx.save();
  ctx.beginPath();
  ctx.rect(centerPx - faceWidthPx / 2, 0, faceWidthPx, canvasH);
  ctx.clip();
  ctx.translate(centerPx, 0);
  ctx.scale(-1, 1);
  ctx.translate(-centerPx, 0);
  ctx.drawImage(img, centerPx - drawW / 2, 0, drawW, drawH);
  ctx.restore();
}
