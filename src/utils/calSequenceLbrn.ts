/**
 * Generates a LightBurn .lbrn2 project file for the lens calibration hole sequence.
 *
 * The file visits each calibration hole in order using LightBurn's "dot" layer
 * mode — the laser head pauses at each position and fires a brief pulse, creating
 * a visible red mark (or pointer position) that the user records on video.
 *
 * Coordinate system: mm, top-left origin, Y increasing downward — matches the
 * LightBurn default absolute coordinate frame so values can be used as-is.
 *
 * Usage:
 *   const xml = buildCalSequenceLbrn(sequenceHoles, { dwellMs: 400 });
 *   downloadTextFile(xml, "calibration-sequence.lbrn2");
 */

import type { CalibrationHole } from "./lensCalibration";

export interface CalSequenceLbrnOptions {
  /**
   * How long the laser pauses at each hole, in milliseconds (default 400).
   * Long enough to be clearly visible on video without burning the bed surface.
   * For CO₂ machines set power very low (3–5%). Diode machines can use 0%.
   */
  dwellMs?: number;
  /**
   * Layer power percentage 0–100 (default 5).
   * Keep low — this is for pointer visibility, not engraving.
   */
  powerPct?: number;
  /**
   * Travel speed between holes, mm/s (default 80).
   */
  travelSpeedMmS?: number;
  /**
   * Radius of the dot marker placed at each hole center, mm (default 1.5).
   * Used as the Rx/Ry of a tiny ellipse in the LightBurn file.
   */
  markerRadiusMm?: number;
}

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function attr(name: string, value: string | number): string {
  return ` ${name}="${esc(String(value))}"`;
}

// ---------------------------------------------------------------------------
// LightBurn cut-setting block
// ---------------------------------------------------------------------------

function buildCutSetting(opts: Required<CalSequenceLbrnOptions>): string {
  const dwellMs = Math.max(50, Math.round(opts.dwellMs));
  const power = Math.max(0, Math.min(100, opts.powerPct));
  const speed = Math.max(1, opts.travelSpeedMmS);

  return [
    `  <CutSetting type="Cut">`,
    `    <index Value="0" />`,
    `    <name Value="Cal Sequence" />`,
    `    <priority Value="0" />`,
    `    <kerf Value="0" />`,
    `    <hide Value="0" />`,
    `    <power Value="${power}" />`,
    `    <maxPower Value="${power}" />`,
    `    <speed Value="${speed}" />`,
    `    <layerMode Value="0" />`,
    `    <PPI Value="500" />`,
    `    <perfEnabled Value="0" />`,
    `    <leadEnabled Value="0" />`,
    `    <overcutEnabled Value="0" />`,
    `    <bidir Value="0" />`,
    `    <dot Value="1" />`,
    `    <dotLen Value="${dwellMs}" />`,
    `    <dotSpace Value="0" />`,
    `    <passCnt Value="1" />`,
    `    <zOffset Value="0" />`,
    `    <tabCnt Value="0" />`,
    `    <color RGBA="0xff0000ff" />`,
    `    <runBlower Value="0" />`,
    `    <pauseOnLayer Value="0" />`,
    `    <penIndex Value="-1" />`,
    `  </CutSetting>`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Shape blocks — one ellipse per hole
// ---------------------------------------------------------------------------

function buildEllipseShape(
  hole: CalibrationHole,
  radiusMm: number
): string {
  const r = radiusMm.toFixed(4);
  // LightBurn XForm: "a b c d tx ty" — identity + translation
  const tx = hole.xMm.toFixed(4);
  const ty = hole.yMm.toFixed(4);

  return [
    `  <!-- Hole ${hole.seqIndex + 1} @ (${hole.xMm.toFixed(2)}, ${hole.yMm.toFixed(2)}) mm -->`,
    `  <Shape Type="Ellipse"${attr("Cx", 0)}${attr("Cy", 0)}${attr("Rx", r)}${attr("Ry", r)} StartAngle="0" EndAngle="6.28318548">`,
    `    <XForm>1 0 0 1 ${tx} ${ty}</XForm>`,
    `    <CutIndex Value="0" />`,
    `  </Shape>`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function buildCalSequenceLbrn(
  sequenceHoles: CalibrationHole[],
  options: CalSequenceLbrnOptions = {}
): string {
  const opts: Required<CalSequenceLbrnOptions> = {
    dwellMs: options.dwellMs ?? 400,
    powerPct: options.powerPct ?? 5,
    travelSpeedMmS: options.travelSpeedMmS ?? 80,
    markerRadiusMm: options.markerRadiusMm ?? 1.5,
  };

  const generatedAt = new Date().toISOString();
  const holeCount = sequenceHoles.length;

  const header = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- LT316 Lens Calibration Sequence — ${holeCount} holes — generated ${generatedAt} -->`,
    `<!-- Run at LOW POWER (${opts.powerPct}%). Laser will pause ${opts.dwellMs} ms at each hole. -->`,
    `<!-- Record the full sequence on video then upload to LT316 admin for analysis. -->`,
    `<LightBurnProject AppVersion="1.7.00" FormatVersion="1" MaterialHeight="0" MirrorX="False" MirrorY="False">`,
  ].join("\n");

  const variableText = [
    `  <VariableText>`,
    ...Array.from({ length: 12 }, () => `    <Var Val="0" />`),
    ...Array.from({ length: 5 }, () => `    <Var Val="" />`),
    `    <Var Val="0" /><Var Val="0" />`,
    `  </VariableText>`,
  ].join("\n");

  const uiPrefs = `  <UIPrefs Optimize="1" OpType="0" OpOrder="0" OpCloseOpt="1" OpInnerOuter="1" OpCrossOpt="0" OpByLayer="1" Reverse="0" />`;

  const cutSetting = buildCutSetting(opts);

  const shapes = sequenceHoles
    .map((hole) => buildEllipseShape(hole, opts.markerRadiusMm))
    .join("\n");

  const footer = `</LightBurnProject>`;

  return [header, variableText, uiPrefs, cutSetting, shapes, footer].join("\n\n");
}

/**
 * Trigger a browser file download for the given text content.
 */
export function downloadTextFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
