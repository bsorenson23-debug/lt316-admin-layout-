/**
 * generateTumblerSchematic.ts — Draw a clean geometric overlay from known
 * tumbler dimensions.  No photos, no edge detection — just precise reference
 * lines showing front/back face boxes, handle center, lid zone, and taper.
 *
 * LAYOUT (handle-centered):
 *   ┌──────────────┬──────────────┐
 *   │  BACK FACE   │  FRONT FACE  │
 *   │   (left)     │   (right)    │
 *   └──────────────┴──────────────┘
 *               handle center
 *
 * Handle center line is at x = w/2 (grid center).
 * Front face is centered in the right half (x = w * 3/4).
 * Back face is centered in the left half (x = w * 1/4).
 * Seam lines are at both edges (x = 0 and x = w).
 *
 * The returned canvas is at exact grid resolution (wrapWidthMm × printHeightMm
 * scaled by pxPerMm) so it renders 1:1 on the Konva bed with no resizing.
 */

export interface SchematicConfig {
  wrapWidthMm: number;            // π × diameter (full unwrap)
  printHeightMm: number;
  overallHeightMm?: number;
  topMarginMm?: number;
  bottomMarginMm?: number;
  diameterMm: number;
  handleArcDeg: number;           // 0 = no handle
  lidHeightMm?: number;           // height of lid area
  taperStartMm?: number;          // mm from bottom where taper begins
  taperEndDiameterMm?: number;    // diameter at the narrow end
  twoSided: boolean;
}

export function generateTumblerSchematic(
  config: SchematicConfig,
  pxPerMm: number,
): HTMLCanvasElement | null {
  const {
    wrapWidthMm,
    printHeightMm,
    overallHeightMm,
    topMarginMm,
    bottomMarginMm,
    diameterMm,
    handleArcDeg,
    lidHeightMm,
    taperStartMm,
    twoSided,
  } = config;

  if (typeof document === "undefined") return null;

  const w = Math.round(wrapWidthMm * pxPerMm);
  const overallH = Math.max(printHeightMm, overallHeightMm ?? printHeightMm);
  const printTopMm = Math.max(0, topMarginMm ?? Math.max(0, (overallH - printHeightMm) / 2));
  const printBottomMm = Math.max(0, bottomMarginMm ?? Math.max(0, overallH - printHeightMm - printTopMm));
  const h = Math.round(overallH * pxPerMm);
  const printTopPx = Math.round(printTopMm * pxPerMm);
  const printHeightPx = Math.round(printHeightMm * pxPerMm);
  const printBottomPx = printTopPx + printHeightPx;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);

  const faceWidthPx = diameterMm * pxPerMm;

  // Adaptive font scale — keep labels readable at any pxPerMm
  const fontScale = pxPerMm / 4;

  // ── Layout: handle center at grid center ────────────────────────────────
  const handleCenterX = w / 2;
  const frontCenterX = w * 3 / 4;   // right half center
  const backCenterX = w / 4;         // left half center

  // Non-printable areas above/below the active bed.
  if (printTopPx > 0) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.035)";
    ctx.fillRect(0, 0, w, printTopPx);
  }
  if (printBottomMm > 0) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.035)";
    ctx.fillRect(0, printBottomPx, w, Math.max(0, h - printBottomPx));
  }

  // Physical printable band on the tumbler body.
  ctx.strokeStyle = "rgba(74, 222, 128, 0.24)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 5]);
  ctx.strokeRect(0.75, printTopPx + 0.75, Math.max(0, w - 1.5), Math.max(0, printHeightPx - 1.5));
  ctx.setLineDash([]);

  // ── HANDLE CENTER LINE — orange dashed at grid center ──────────────────
  if (handleArcDeg > 0) {
    ctx.strokeStyle = "rgba(255, 150, 50, 0.4)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(handleCenterX, 0);
    ctx.lineTo(handleCenterX, h);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label
    ctx.fillStyle = "rgba(255, 150, 50, 0.5)";
    ctx.font = `${Math.round(9 * fontScale)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("handle center", handleCenterX, Math.round(14 * fontScale));
  }

  // ── FRONT FACE guide — right side ──────────────────────────────────────
  const frontLeft = frontCenterX - faceWidthPx / 2;
  ctx.strokeStyle = "rgba(40, 120, 200, 0.15)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(frontLeft, 0, faceWidthPx, h);
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(40, 120, 200, 0.2)";
  ctx.font = `${Math.round(10 * fontScale)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("FRONT FACE", frontCenterX, Math.round(20 * fontScale));

  // ── FRONT center line — blue dashed vertical ───────────────────────────
  ctx.strokeStyle = "rgba(40, 120, 200, 0.25)";
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(frontCenterX, 0);
  ctx.lineTo(frontCenterX, h);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── BACK FACE guide — left side (2-sided mode) ─────────────────────────
  if (twoSided) {
    const backLeft = backCenterX - faceWidthPx / 2;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(backLeft, 0, faceWidthPx, h);
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
    ctx.font = `${Math.round(10 * fontScale)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("BACK FACE", backCenterX, Math.round(20 * fontScale));

    // Back center line
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(backCenterX, 0);
    ctx.lineTo(backCenterX, h);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── SEAM lines — both edges (where the wrap starts/ends) ───────────────
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 5]);
  // Left edge
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, h);
  ctx.stroke();
  // Right edge
  ctx.beginPath();
  ctx.moveTo(w, 0);
  ctx.lineTo(w, h);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
  ctx.font = `${Math.round(8 * fontScale)}px system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText("seam", 4, h - 4);
  ctx.textAlign = "right";
  ctx.fillText("seam", w - 4, h - 4);

  // ── LID ZONE ───────────────────────────────────────────────────────────
  if (lidHeightMm && lidHeightMm > 0) {
    const lidH = lidHeightMm * pxPerMm;

    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(0, lidH);
    ctx.lineTo(w, lidH);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    ctx.font = `${Math.round(8 * fontScale)}px system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText("lid zone", 4, lidH - 4);
  }

  // ── TAPER LINE ─────────────────────────────────────────────────────────
  if (taperStartMm && taperStartMm > 0) {
    const taperY = (printHeightMm - taperStartMm) * pxPerMm;

    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(0, taperY);
    ctx.lineTo(w, taperY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    ctx.font = `${Math.round(8 * fontScale)}px system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText("taper begins", 4, taperY - 4);
  }

  return canvas;
}
