import { getTumblerWrapLayout } from "@/utils/tumblerWrapLayout";

export interface SchematicConfig {
  wrapWidthMm: number;
  printHeightMm: number;
  overallHeightMm?: number;
  topMarginMm?: number;
  bottomMarginMm?: number;
  diameterMm: number;
  handleArcDeg: number;
  lidHeightMm?: number;
  taperStartMm?: number;
  taperEndDiameterMm?: number;
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
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, w, h);

  const faceWidthPx = diameterMm * pxPerMm;
  const fontScale = pxPerMm / 4;
  const layout = getTumblerWrapLayout(handleArcDeg);
  const handleCenterX = layout.handleCenterRatio == null ? null : w * layout.handleCenterRatio;
  const frontCenterX = w * layout.frontCenterRatio;
  const backCenterX = layout.backCenterRatio == null ? null : w * layout.backCenterRatio;

  if (printTopPx > 0) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.035)";
    ctx.fillRect(0, 0, w, printTopPx);
  }
  if (printBottomMm > 0) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.035)";
    ctx.fillRect(0, printBottomPx, w, Math.max(0, h - printBottomPx));
  }

  ctx.strokeStyle = "rgba(74, 222, 128, 0.24)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 5]);
  ctx.strokeRect(0.75, printTopPx + 0.75, Math.max(0, w - 1.5), Math.max(0, printHeightPx - 1.5));
  ctx.setLineDash([]);

  if (handleCenterX != null) {
    ctx.strokeStyle = "rgba(255, 150, 50, 0.4)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(handleCenterX, 0);
    ctx.lineTo(handleCenterX, h);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(255, 150, 50, 0.5)";
    ctx.font = `${Math.round(9 * fontScale)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("handle center", handleCenterX, Math.round(14 * fontScale));
  }

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

  ctx.strokeStyle = "rgba(40, 120, 200, 0.25)";
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(frontCenterX, 0);
  ctx.lineTo(frontCenterX, h);
  ctx.stroke();
  ctx.setLineDash([]);

  if (twoSided && backCenterX != null) {
    const backLeft = backCenterX - faceWidthPx / 2;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(backLeft, 0, faceWidthPx, h);
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
    ctx.font = `${Math.round(10 * fontScale)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("BACK FACE", backCenterX, Math.round(20 * fontScale));

    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(backCenterX, 0);
    ctx.lineTo(backCenterX, h);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, h);
  ctx.stroke();
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
