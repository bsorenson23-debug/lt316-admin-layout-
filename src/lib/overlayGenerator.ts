/**
 * overlayGenerator.ts — Generate physically-accurate tumbler overlay canvases.
 *
 * The overlay canvas matches the EXACT grid dimensions (bedPxW × bedPxH).
 * Product photos are placed at their correct physical positions:
 *   - One face ≈ diameter wide (not circumference)
 *   - Front face centered at bedWidth/2
 *   - Back face centered at 0 (seam edge)
 *
 * No runtime scaling needed — the canvas IS the grid.
 */

export interface OverlayOpts {
  bedPxW: number;
  bedPxH: number;
  pxPerMm: number;
  diameterMm: number;
  frontImg: HTMLImageElement | null;
  backImg: HTMLImageElement | null;
  handleArcDeg: number;
  twoSided: boolean;
}

/**
 * Generate an overlay canvas at exact grid dimensions.
 *
 * In single mode: front photo centered on the front line.
 * In 2-sided mode: front on right, back on left (or mirrored front),
 * with zone divider, labels, and optional handle zone indicator.
 */
export function generateOverlayCanvas(opts: OverlayOpts): HTMLCanvasElement | null {
  const { bedPxW, bedPxH, pxPerMm, diameterMm, frontImg, backImg, handleArcDeg, twoSided } = opts;
  if (!frontImg || bedPxW <= 0 || bedPxH <= 0) return null;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bedPxW);
  canvas.height = Math.round(bedPxH);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Face width in pixels — one face of the tumbler ≈ diameter
  const faceWidthPx = diameterMm * pxPerMm;
  const frontCenterPx = bedPxW / 2;

  if (!twoSided) {
    // ── Single mode: front photo centered on front line ──
    drawFacePhoto(ctx, frontImg, frontCenterPx, faceWidthPx, bedPxH);
  } else {
    // ── 2-sided mode ──

    // FRONT face — right side, centered on front line
    drawFacePhoto(ctx, frontImg, frontCenterPx, faceWidthPx, bedPxH);

    // BACK face — left side, centered at x=0 (seam)
    ctx.save();
    ctx.globalAlpha = 0.7; // slightly more transparent for back
    if (backImg) {
      drawFacePhoto(ctx, backImg, 0, faceWidthPx, bedPxH);
    } else {
      // Mirror front photo at x=0
      drawFacePhotoMirrored(ctx, frontImg, 0, faceWidthPx, bedPxH);
    }
    ctx.restore();

    // Zone divider
    ctx.strokeStyle = "rgba(40, 120, 200, 0.5)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.moveTo(frontCenterPx, 0);
    ctx.lineTo(frontCenterPx, bedPxH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Zone labels
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(40, 120, 200, 0.45)";
    ctx.fillText("FRONT \u25B6", frontCenterPx + faceWidthPx / 2, 14);
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.fillText("\u25C0 BACK", faceWidthPx / 2, 14);
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
  // Clip to face region
  ctx.beginPath();
  ctx.rect(centerPx - faceWidthPx / 2, 0, faceWidthPx, canvasH);
  ctx.clip();
  // Draw photo centered horizontally within the clip
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
  // Clip to face region
  ctx.beginPath();
  ctx.rect(centerPx - faceWidthPx / 2, 0, faceWidthPx, canvasH);
  ctx.clip();
  // Mirror around centerPx
  ctx.translate(centerPx, 0);
  ctx.scale(-1, 1);
  ctx.translate(-centerPx, 0);
  ctx.drawImage(img, centerPx - drawW / 2, 0, drawW, drawH);
  ctx.restore();
}

