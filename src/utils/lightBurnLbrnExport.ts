/**
 * Generates a LightBurn .lbrn2 project file from a LightBurnExportPayload.
 *
 * The file pre-configures:
 *   - RotarySetup: ObjectDiam, Mode (chuck/roller), Active state, Circumference
 *   - A bounding rectangle on a zero-power layer showing the exact template area
 *   - A T0 tool layer with key setup values as text notes
 *
 * Workflow:
 *   1. Open this .lbrn2 in LightBurn  → rotary is pre-configured
 *   2. File → Import the matching .svg → artwork lands at absolute coordinates
 *   3. Frame to verify, then burn
 *
 * LightBurn .lbrn2 format notes:
 *   - Units: mm, Y increasing downward, top-left origin
 *   - XForm: "a b c d tx ty" (matrix) — translation is center of shape
 *   - RotarySetup Mode: 0 = roller, 1 = chuck
 *   - Tool layers (T0–T9) use CutSetting index 30–39
 */

import type { LightBurnExportPayload } from "@/types/export";
import { extractLbrnShapesFromItem } from "./svgToLbrnShapes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mm(n: number, dp = 4): string {
  return n.toFixed(dp);
}

function xmlAttr(name: string, value: string | number): string {
  return ` ${name}="${String(value)}"`;
}

// ---------------------------------------------------------------------------
// RotarySetup block
// ---------------------------------------------------------------------------

function buildRotarySetup(payload: LightBurnExportPayload): string {
  const cylinder = payload.cylinder;
  if (!cylinder?.objectDiameterMm) {
    // No cylinder data — include a disabled rotary block as placeholder
    return `  <RotarySetup ChuckMode="0" RollerDiam="60" ObjectDiam="0" RollerSpacing="180" AxisYmm="0" Circum="0" StepLen="0.05" OnlyY="0" Active="0" Mode="0" />`;
  }

  const diam = cylinder.objectDiameterMm;
  const circum = Math.PI * diam;
  const isChuck = payload.rotary.chuckOrRoller === "chuck";
  const mode = isChuck ? 1 : 0;

  return [
    `  <RotarySetup`,
    xmlAttr("ChuckMode", mode),
    xmlAttr("RollerDiam", "60"),
    xmlAttr("ObjectDiam", mm(diam, 2)),
    xmlAttr("RollerSpacing", "180"),
    xmlAttr("AxisYmm", "0"),
    xmlAttr("Circum", mm(circum, 2)),
    xmlAttr("StepLen", "0.05"),
    xmlAttr("OnlyY", "0"),
    xmlAttr("Active", "1"),
    xmlAttr("Mode", mode),
    `  />`,
  ].join("");
}

// ---------------------------------------------------------------------------
// Cut settings
// ---------------------------------------------------------------------------

const ARTWORK_CUT_INDEX = 0; // C00 — artwork layer (user sets power in LightBurn)
const BOUNDS_CUT_INDEX = 1;  // C01 — zero power bounding box, visual only
const NOTES_CUT_INDEX = 30;  // T0  — tool layer, does not output

function buildCutSettings(): string {
  return [
    // C00 — artwork layer
    `  <CutSetting type="Cut">`,
    `    <index Value="${ARTWORK_CUT_INDEX}" />`,
    `    <name Value="Artwork" />`,
    `    <priority Value="0" />`,
    `    <hide Value="0" />`,
    `    <power Value="100" />`,
    `    <maxPower Value="100" />`,
    `    <speed Value="100" />`,
    `    <layerMode Value="0" />`,
    `    <PPI Value="500" />`,
    `    <passCnt Value="1" />`,
    `    <zOffset Value="0" />`,
    `    <tabCnt Value="0" />`,
    `    <color RGBA="0xff000000" />`,
    `    <runBlower Value="0" />`,
    `    <pauseOnLayer Value="0" />`,
    `    <penIndex Value="-1" />`,
    `  </CutSetting>`,

    // C01 — bounds rectangle (0% power, won't fire)
    `  <CutSetting type="Cut">`,
    `    <index Value="${BOUNDS_CUT_INDEX}" />`,
    `    <name Value="Template Bounds" />`,
    `    <priority Value="1" />`,
    `    <hide Value="0" />`,
    `    <power Value="0" />`,
    `    <maxPower Value="0" />`,
    `    <speed Value="100" />`,
    `    <layerMode Value="0" />`,
    `    <PPI Value="500" />`,
    `    <passCnt Value="1" />`,
    `    <zOffset Value="0" />`,
    `    <tabCnt Value="0" />`,
    `    <color RGBA="0xff0000ff" />`,
    `    <runBlower Value="0" />`,
    `    <pauseOnLayer Value="0" />`,
    `    <penIndex Value="-1" />`,
    `  </CutSetting>`,

    // T0 — tool layer for notes
    `  <CutSetting type="Tool">`,
    `    <index Value="${NOTES_CUT_INDEX}" />`,
    `    <name Value="T0" />`,
    `    <priority Value="0" />`,
    `    <hide Value="0" />`,
    `    <color RGBA="0xffff00ff" />`,
    `  </CutSetting>`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Template bounding rectangle
// ---------------------------------------------------------------------------

function buildBoundsRect(payload: LightBurnExportPayload): string {
  const W = payload.templateWidthMm;
  const H = payload.templateHeightMm;
  const ox = payload.rotary.exportOriginXmm ?? 0;
  const oy = payload.rotary.exportOriginYmm ?? 0;

  // LightBurn Rect XForm translation is the center of the shape
  const cx = ox + W / 2;
  const cy = oy + H / 2;

  return [
    `  <!-- Template area bounding box — 0% power, visual only -->`,
    `  <Shape Type="Rect"${xmlAttr("W", mm(W))}${xmlAttr("H", mm(H))} Cr="0">`,
    `    <XForm>1 0 0 1 ${mm(cx)} ${mm(cy)}</XForm>`,
    `    <CutIndex Value="${BOUNDS_CUT_INDEX}" />`,  // C01
    `  </Shape>`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Notes text (T0 layer)
// ---------------------------------------------------------------------------

function buildNotesText(payload: LightBurnExportPayload): string {
  const cylinder = payload.cylinder;
  const diam = cylinder?.objectDiameterMm;
  const circum = diam != null ? Math.PI * diam : null;
  const ox = payload.rotary.exportOriginXmm ?? 0;
  const oy = payload.rotary.exportOriginYmm ?? 0;

  const parts: string[] = [
    `LT316 Export`,
    diam != null ? `Object Diameter: ${diam.toFixed(2)} mm` : null,
    circum != null ? `Circumference: ${circum.toFixed(2)} mm` : null,
    `Template: ${payload.templateWidthMm.toFixed(2)} x ${payload.templateHeightMm.toFixed(2)} mm`,
    `Export Origin: X ${ox.toFixed(2)} mm  Y ${oy.toFixed(2)} mm`,
    payload.rotary.presetName ? `Preset: ${payload.rotary.presetName}` : null,
    `Start From: Absolute Coords`,
  ].filter((s): s is string => s !== null);

  const notesStr = parts.join("&#10;");

  const textX = mm((payload.rotary.exportOriginXmm ?? 0) + payload.templateWidthMm + 4);
  const textY = mm((payload.rotary.exportOriginYmm ?? 0) + 6);

  return [
    `  <!-- Setup notes — T0 tool layer, does not output -->`,
    `  <Shape Type="Text"${xmlAttr("CutIndex", NOTES_CUT_INDEX)} Font="Arial" H="4" Bold="0" Italic="0"${xmlAttr("Str", notesStr)}>`,
    `    <XForm>1 0 0 1 ${textX} ${textY}</XForm>`,
    `  </Shape>`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Build a LightBurn .lbrn2 project XML string from a LightBurnExportPayload.
 *
 * Embeds artwork as vector shapes (paths, circles, rects) on C00,
 * the rotary settings on RotarySetup, a bounding box on C01,
 * and setup notes on T0.  Open directly in LightBurn — no separate SVG import needed.
 */
export function buildLightBurnLbrn(payload: LightBurnExportPayload): string {
  const generatedAt = new Date().toISOString();
  const rotarySetup = buildRotarySetup(payload);
  const cutSettings = buildCutSettings();
  const boundsRect = buildBoundsRect(payload);
  const notesText = buildNotesText(payload);

  // Extract artwork shapes from each placed item's SVG content
  const artworkShapes = payload.items.flatMap((item) =>
    extractLbrnShapesFromItem(item, ARTWORK_CUT_INDEX)
  );

  const artworkBlock =
    artworkShapes.length > 0
      ? `  <!-- Artwork (${artworkShapes.length} shape(s)) — set power on C00 before running -->\n` +
        artworkShapes.map((s) => `  ${s}`).join("\n")
      : `  <!-- No artwork shapes extracted — check that items contain SVG path data -->`;

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- LT316 LightBurn Project — generated ${generatedAt} -->`,
    `<!-- Artwork on C00 · Template bounds on C01 (0% power) · Rotary pre-configured -->`,
    `<!-- Set power on C00, verify Start From → Absolute Coords, Frame, then run     -->`,
    `<LightBurnProject AppVersion="1.7.00" FormatVersion="1" MaterialHeight="0" MirrorX="False" MirrorY="False">`,
    ``,
    `  <VariableText>`,
    ...Array.from({ length: 12 }, () => `    <Var Val="0" />`),
    ...Array.from({ length: 5 }, () => `    <Var Val="" />`),
    `    <Var Val="0" /><Var Val="0" />`,
    `  </VariableText>`,
    ``,
    `  <UIPrefs Optimize="1" OpType="0" OpOrder="0" OpCloseOpt="1" OpInnerOuter="1" OpCrossOpt="0" OpByLayer="1" Reverse="0" />`,
    ``,
    rotarySetup,
    ``,
    cutSettings,
    ``,
    artworkBlock,
    ``,
    boundsRect,
    ``,
    notesText,
    ``,
    `</LightBurnProject>`,
  ].join("\n");
}

/**
 * Trigger a browser download for the .lbrn2 file.
 */
export function downloadLbrnFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
