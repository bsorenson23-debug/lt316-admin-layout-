import { getTumblerWrapLayout } from "@/utils/tumblerWrapLayout";

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

export function generateOverlayCanvas(opts: OverlayOpts): HTMLCanvasElement | null {
  const {
    bedPxW,
    bedPxH,
    pxPerMm,
    overallHeightMm,
    topMarginMm,
    bottomMarginMm,
    diameterMm,
    frontImg,
    backImg,
    twoSided,
  } = opts;

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
  const layout = getTumblerWrapLayout(opts.handleArcDeg);
  const frontCenterPx = bedPxW * layout.frontCenterRatio;
  const backCenterPx = layout.backCenterRatio == null ? null : bedPxW * layout.backCenterRatio;
  const handleCenterPx = layout.handleCenterRatio == null ? null : bedPxW * layout.handleCenterRatio;

  if (!twoSided) {
    const ar = frontImg.naturalWidth / frontImg.naturalHeight;
    const drawH = overallPxH;
    const drawW = drawH * ar;
    const drawX = frontCenterPx - drawW / 2;
    ctx.drawImage(frontImg, drawX, 0, drawW, drawH);
  } else {
    drawFacePhoto(ctx, frontImg, frontCenterPx, faceWidthPx, overallPxH);

    if (backCenterPx != null) {
      ctx.save();
      ctx.globalAlpha = 0.7;
      if (backImg) {
        drawFacePhoto(ctx, backImg, backCenterPx, faceWidthPx, overallPxH);
      } else {
        drawFacePhotoMirrored(ctx, frontImg, backCenterPx, faceWidthPx, overallPxH);
      }
      ctx.restore();
    }

    if (handleCenterPx != null) {
      ctx.strokeStyle = "rgba(255, 150, 50, 0.3)";
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(handleCenterPx, 0);
      ctx.lineTo(handleCenterPx, overallPxH);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(40, 120, 200, 0.45)";
    ctx.fillText("FRONT ▶", frontCenterPx, 14);
    if (backCenterPx != null) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.fillText("◀ BACK", backCenterPx, 14);
    }
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
