/**
 * generateTumblerSchematic.ts — Draw a clean geometric overlay from known
 * tumbler dimensions.  No photos, no edge detection — just precise reference
 * lines showing front/back face boxes, handle center, lid zone, and taper.
 *
 * The returned canvas is at exact grid resolution (wrapWidthMm × printHeightMm
 * scaled by pxPerMm) so it renders 1:1 on the Konva bed with no resizing.
 */

export interface SchematicConfig {
  wrapWidthMm: number;            // π × diameter (full unwrap)
  printHeightMm: number;
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
    diameterMm,
    handleArcDeg,
    lidHeightMm,
    taperStartMm,
    twoSided,
  } = config;

  if (typeof document === "undefined") return null;

  const w = Math.round(wrapWidthMm * pxPerMm);
  const h = Math.round(printHeightMm * pxPerMm);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);

  const frontCenterX = w / 2;
  const faceWidthPx = diameterMm * pxPerMm;

  // Adaptive font scale — keep labels readable at any pxPerMm
  const fontScale = pxPerMm / 4;

  // ── FRONT FACE guide ─────────────────────────────────────────────────────
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

  // ── BACK FACE guide (2-sided mode) ───────────────────────────────────────
  if (twoSided) {
    const backCenterX = faceWidthPx / 2;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(0, 0, faceWidthPx, h);
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
    ctx.font = `${Math.round(10 * fontScale)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("BACK FACE", backCenterX, Math.round(20 * fontScale));
  }

  // ── HANDLE CENTER LINE — orange dashed at wrap edges ─────────────────────
  if (handleArcDeg > 0) {
    ctx.strokeStyle = "rgba(255, 150, 50, 0.4)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);

    // Right edge = handle center (directly opposite front face)
    ctx.beginPath();
    ctx.moveTo(w, 0);
    ctx.lineTo(w, h);
    ctx.stroke();

    // Left edge also = handle center (grid wraps)
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, h);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label at top-right
    ctx.fillStyle = "rgba(255, 150, 50, 0.5)";
    ctx.font = `${Math.round(9 * fontScale)}px system-ui, sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText("handle center \u2193", w - 4, Math.round(14 * fontScale));
  }

  // ── SEAM label ───────────────────────────────────────────────────────────
  ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
  ctx.font = `${Math.round(8 * fontScale)}px system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText("seam", 4, h - 4);

  // ── LID ZONE ─────────────────────────────────────────────────────────────
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

  // ── TAPER LINE ───────────────────────────────────────────────────────────
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
