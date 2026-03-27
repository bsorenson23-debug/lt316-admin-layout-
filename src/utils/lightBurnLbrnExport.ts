/**
 * Generates a LightBurn project file (.lbrn2 XML) from a LightBurnExportPayload.
 *
 * The file pre-configures:
 * - RotarySetup: object diameter, mode, active state, circumference
 * - A bounding rectangle on a zero-power layer showing the exact template area
 * - A T0 tool layer with key setup values as text notes
 *
 * Workflow:
 * 1. Open this .lbrn2 file in LightBurn so rotary is pre-configured
 * 2. Verify Start From -> Absolute Coords
 * 3. Frame to verify, then burn
 *
 * LightBurn project format notes:
 * - Units: mm, Y increasing downward, top-left origin
 * - XForm: "a b c d tx ty" matrix, translation is center of shape
 * - RotarySetup Mode: 0 = roller, 1 = chuck
 * - Tool layers (T0-T9) use CutSetting index 30-39
 */

import type { LightBurnExportPayload } from "@/types/export";
import { extractLbrnShapesFromItem } from "./svgToLbrnShapes.ts";

function mm(n: number, dp = 4): string {
  return n.toFixed(dp);
}

function xmlAttr(name: string, value: string | number): string {
  return ` ${name}="${String(value)}"`;
}

function buildRotarySetup(payload: LightBurnExportPayload): string {
  const cylinder = payload.cylinder;
  if (!cylinder?.objectDiameterMm) {
    return `  <RotarySetup Enable="0" ChuckMode="0" RollerDiam="60" ObjectDiam="0" RollerSpacing="180" AxisYmm="0" Circum="0" SplitObjWidth="0" StepLen="0.05" OnlyY="0" Active="0" Mode="0" MirrorAxis="0" />`;
  }

  const diam = cylinder.objectDiameterMm;
  const circum = Math.PI * diam;
  const splitWidth = cylinder.splitWidthMm > 0 ? cylinder.splitWidthMm : circum;
  const isChuck = payload.rotary.chuckOrRoller === "chuck";
  const mode = isChuck ? 1 : 0;

  return [
    `  <RotarySetup`,
    xmlAttr("Enable", "1"),
    xmlAttr("ChuckMode", mode),
    xmlAttr("RollerDiam", "60"),
    xmlAttr("ObjectDiam", mm(diam, 2)),
    xmlAttr("RollerSpacing", "180"),
    xmlAttr("AxisYmm", "0"),
    xmlAttr("Circum", mm(circum, 2)),
    xmlAttr("SplitObjWidth", mm(splitWidth, 2)),
    xmlAttr("StepLen", "0.05"),
    xmlAttr("OnlyY", "0"),
    xmlAttr("Active", "1"),
    xmlAttr("Mode", mode),
    xmlAttr("MirrorAxis", "0"),
    `  />`,
  ].join("");
}

const ARTWORK_CUT_INDEX = 0;
const BOUNDS_CUT_INDEX = 1;
const NOTES_CUT_INDEX = 30;
const LIGHTBURN_LAYER_MODE_LINE = 0;
const LIGHTBURN_LAYER_MODE_FILL = 1;

export interface LbrnMaterialSettings {
  label: string;
  powerPct: number;
  maxPowerPct: number;
  speedMmS: number;
  lpi: number;
  passes: number;
}

export interface LbrnArtworkBitmap {
  base64Data: string;
  pixelWidth: number;
  pixelHeight: number;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

export interface BuildLightBurnLbrnOptions {
  mode?: "full" | "minimal";
}

function buildCutSettings(material: LbrnMaterialSettings | undefined, mode: "full" | "minimal"): string {
  const power = material ? material.powerPct : 100;
  const maxPower = material ? material.maxPowerPct : 100;
  const speed = material ? material.speedMmS : 100;
  const passes = material ? material.passes : 1;
  const interval = material ? +(25.4 / material.lpi).toFixed(4) : 0.0941;
  const layerName =
    mode === "minimal"
      ? "Artwork"
      : material ? `Artwork - ${material.label}` : "Artwork";

  const artworkSetting = [
    `  <CutSetting type="Cut">`,
    `    <index Value="${ARTWORK_CUT_INDEX}" />`,
    `    <name Value="${layerName}" />`,
    `    <priority Value="0" />`,
    `    <hide Value="0" />`,
    `    <power Value="${power}" />`,
    `    <maxPower Value="${maxPower}" />`,
    `    <speed Value="${speed}" />`,
    `    <layerMode Value="${LIGHTBURN_LAYER_MODE_FILL}" />`,
    `    <PPI Value="500" />`,
    `    <interval Value="${interval}" />`,
    `    <passCnt Value="${passes}" />`,
    `    <zOffset Value="0" />`,
    `    <tabCnt Value="0" />`,
    `    <color RGBA="0xff000000" />`,
    `    <runBlower Value="0" />`,
    `    <pauseOnLayer Value="0" />`,
    `    <penIndex Value="-1" />`,
    `  </CutSetting>`,
  ];

  if (mode === "minimal") {
    return artworkSetting.join("\n");
  }

  return [
    ...artworkSetting,
    `  <CutSetting type="Cut">`,
    `    <index Value="${BOUNDS_CUT_INDEX}" />`,
    `    <name Value="Template Bounds" />`,
    `    <priority Value="1" />`,
    `    <hide Value="0" />`,
    `    <power Value="0" />`,
    `    <maxPower Value="0" />`,
    `    <speed Value="100" />`,
    `    <layerMode Value="${LIGHTBURN_LAYER_MODE_LINE}" />`,
    `    <PPI Value="500" />`,
    `    <passCnt Value="1" />`,
    `    <zOffset Value="0" />`,
    `    <tabCnt Value="0" />`,
    `    <color RGBA="0xff0000ff" />`,
    `    <runBlower Value="0" />`,
    `    <pauseOnLayer Value="0" />`,
    `    <penIndex Value="-1" />`,
    `  </CutSetting>`,

    `  <CutSetting type="Tool">`,
    `    <index Value="${NOTES_CUT_INDEX}" />`,
    `    <name Value="T0" />`,
    `    <priority Value="0" />`,
    `    <hide Value="0" />`,
    `    <color RGBA="0xffff00ff" />`,
    `  </CutSetting>`,
  ].join("\n");
}

function buildBoundsRect(payload: LightBurnExportPayload): string {
  const widthMm = payload.templateWidthMm;
  const heightMm = payload.templateHeightMm;
  const originXmm = payload.rotary.exportOriginXmm ?? 0;
  const originYmm = payload.rotary.exportOriginYmm ?? 0;

  const centerX = originXmm + widthMm / 2;
  const centerY = originYmm + heightMm / 2;

  return [
    `  <!-- Template area bounding box: 0 percent power, visual only -->`,
    `  <Shape Type="Rect">`,
    `    <XForm>1 0 0 1 ${mm(centerX)} ${mm(centerY)}</XForm>`,
    `    <CutIndex Value="${BOUNDS_CUT_INDEX}" />`,
    `    <W Value="${mm(widthMm)}" />`,
    `    <H Value="${mm(heightMm)}" />`,
    `    <Cr Value="0" />`,
    `  </Shape>`,
  ].join("\n");
}

function buildNotesText(payload: LightBurnExportPayload, material?: LbrnMaterialSettings): string {
  const cylinder = payload.cylinder;
  const diam = cylinder?.objectDiameterMm;
  const circum = diam != null ? Math.PI * diam : null;
  const originXmm = payload.rotary.exportOriginXmm ?? 0;
  const originYmm = payload.rotary.exportOriginYmm ?? 0;

  const parts: string[] = [
    `LT316 Export`,
    diam != null ? `Object Diameter: ${diam.toFixed(2)} mm` : null,
    circum != null ? `Circumference: ${circum.toFixed(2)} mm` : null,
    `Template: ${payload.templateWidthMm.toFixed(2)} x ${payload.templateHeightMm.toFixed(2)} mm`,
    `Export Origin: X ${originXmm.toFixed(2)} mm  Y ${originYmm.toFixed(2)} mm`,
    payload.rotary.presetName ? `Preset: ${payload.rotary.presetName}` : null,
    material
      ? `Material: ${material.label} | ${material.powerPct}% pwr | ${material.speedMmS}mm/s | ${material.lpi}LPI | ${material.passes}p`
      : null,
    `Start From: Absolute Coords`,
  ].filter((value): value is string => value !== null);

  const notesStr = parts.join("&#10;");
  const textX = mm(originXmm + payload.templateWidthMm + 4);
  const textY = mm(originYmm + 6);

  return [
    `  <!-- Setup notes: T0 tool layer, does not output -->`,
    `  <Shape Type="Text" Font="Arial" H="4" Bold="0" Italic="0"${xmlAttr("Str", notesStr)}>`,
    `    <XForm>1 0 0 1 ${textX} ${textY}</XForm>`,
    `    <CutIndex Value="${NOTES_CUT_INDEX}" />`,
    `  </Shape>`,
  ].join("\n");
}

function buildBitmapShape(bitmap: LbrnArtworkBitmap, cutIndex: number): string {
  const scaleX = bitmap.widthMm / bitmap.pixelWidth;
  const scaleY = bitmap.heightMm / bitmap.pixelHeight;
  const centerX = bitmap.xMm + bitmap.widthMm / 2;
  const centerY = bitmap.yMm + bitmap.heightMm / 2;
  const byteLen = Math.ceil((bitmap.base64Data.length * 3) / 4);

  return [
    `<Shape Type="Bitmap" CutIndex="${cutIndex}" W="${bitmap.pixelWidth}" H="${bitmap.pixelHeight}">`,
    `  <XForm>${scaleX.toFixed(6)} 0 0 ${scaleY.toFixed(6)} ${mm(centerX)} ${mm(centerY)}</XForm>`,
    `  <Data Length="${byteLen}">${bitmap.base64Data}</Data>`,
    `</Shape>`,
  ].join("\n");
}

export function buildLightBurnLbrn(
  payload: LightBurnExportPayload,
  material?: LbrnMaterialSettings,
  artworkBitmap?: LbrnArtworkBitmap,
  options?: BuildLightBurnLbrnOptions,
): string {
  const mode = options?.mode ?? "full";
  const generatedAt = new Date().toISOString();
  const rotarySetup = mode === "full" ? buildRotarySetup(payload) : null;
  const cutSettings = buildCutSettings(material, mode);
  const boundsRect = mode === "full" ? buildBoundsRect(payload) : null;
  const notesText = mode === "full" ? buildNotesText(payload, material) : null;

  const artworkBlock = (() => {
    if (artworkBitmap) {
      return [
        `  <!-- Artwork embedded as a flattened bitmap to preserve exact SVG appearance -->`,
        `  ${buildBitmapShape(artworkBitmap, ARTWORK_CUT_INDEX)}`,
      ].join("\n");
    }

    const artworkShapes = payload.items.flatMap((item) =>
      extractLbrnShapesFromItem(item, ARTWORK_CUT_INDEX),
    );

    return artworkShapes.length > 0
      ? `  <!-- Artwork (${artworkShapes.length} shape(s)) - set power on C00 before running -->\n${artworkShapes.map((shape) => `  ${shape}`).join("\n")}`
      : `  <!-- No artwork shapes extracted - check that items contain SVG path data -->`;
  })();

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- LT316 LightBurn Project generated ${generatedAt} -->`,
    mode === "minimal"
      ? `<!-- Minimal artwork-only export: geometry debugging mode -->`
      : `<!-- Artwork on C00 | Template bounds on C01 (0 percent power) | Rotary pre-configured -->`,
    `<!-- Verify Start From -> Absolute Coords, Frame, then run -->`,
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
    ...(rotarySetup ? [rotarySetup, ``] : []),
    cutSettings,
    ``,
    artworkBlock,
    ``,
    ...(boundsRect ? [boundsRect, ``] : []),
    ...(notesText ? [notesText, ``] : []),
    `</LightBurnProject>`,
  ].join("\n");
}

export function downloadLbrnFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
