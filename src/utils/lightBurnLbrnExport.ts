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
import { extractLbrnLocalShapesFromItem } from "./svgToLbrnShapes.ts";

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

function buildGalvoRotaryConfig(payload: LightBurnExportPayload): string | null {
  const diameterMm = payload.cylinder?.objectDiameterMm;
  if (
    payload.workspaceMode !== "tumbler-wrap" ||
    !diameterMm ||
    !Number.isFinite(diameterMm)
  ) {
    return null;
  }
  const stepsPerRotation =
    payload.rotary.stepsPerRotation && Number.isFinite(payload.rotary.stepsPerRotation)
      ? Math.round(payload.rotary.stepsPerRotation)
      : 25600;
  const isChuck = payload.rotary.chuckOrRoller === "roller" ? 0 : 1;

  // These are the native LightBurn galvo fields we have validated so far:
  // - diameter/object diameter comes from the tumbler profile
  // - chuck/roller comes from the selected LT316 preset
  // - stepsPerUnit comes from calibrated preset SPR when available
  // The remaining motor/axis fields stay fixed to the known-good machine
  // envelope until machine-profile axis/motor state is threaded into export.
  return [
    `  <GalvoRotaryConfig>`,
    `    <Enabled Value="1"/>`,
    `    <diameter Value="${Math.round(diameterMm)}"/>`,
    `    <objDiameter Value="50"/>`,
    `    <isChuck Value="${isChuck}"/>`,
    `    <splitByShape Value="0"/>`,
    `    <runWholeSlice Value="0"/>`,
    `    <splitSize Value="0.1"/>`,
    `    <splitOverlap Value="0.1"/>`,
    `    <maxShapeSize Value="20"/>`,
    `    <outputCenter Value="100"/>`,
    `    <axis Value="1"/>`,
    `    <stepsPerUnit Value="${stepsPerRotation}"/>`,
    `    <minSpeed Value="1"/>`,
    `    <maxSpeed Value="5000"/>`,
    `    <accelTimeMs Value="5000"/>`,
    `    <returnSpeed Value="1000"/>`,
    `    <homeSpeed Value="500"/>`,
    `    <homeTimeout Value="10"/>`,
    `    <isRotary Value="1"/>`,
    `    <reverseDirection Value="0"/>`,
    `    <doReturn Value="1"/>`,
    `    <doHome Value="0"/>`,
    `  </GalvoRotaryConfig>`,
  ].join("\n");
}

function buildVariableText(): string {
  return [
    `  <VariableText>`,
    `    <Start Value="0"/>`,
    `    <End Value="999"/>`,
    `    <Current Value="0"/>`,
    `    <Increment Value="1"/>`,
    `    <AutoAdvance Value="0"/>`,
    `  </VariableText>`,
  ].join("\n");
}

function buildUiPrefs(): string {
  return [
    `  <UIPrefs>`,
    `    <Optimize_ByLayer Value="0"/>`,
    `    <Optimize_ByGroup Value="-1"/>`,
    `    <Optimize_ByPriority Value="1"/>`,
    `    <Optimize_WhichDirection Value="0"/>`,
    `    <Optimize_InnerToOuter Value="1"/>`,
    `    <Optimize_ByDirection Value="0"/>`,
    `    <Optimize_ReduceTravel Value="1"/>`,
    `    <Optimize_HideBacklash Value="0"/>`,
    `    <Optimize_ReduceDirChanges Value="0"/>`,
    `    <Optimize_ChooseCorners Value="0"/>`,
    `    <Optimize_AllowReverse Value="1"/>`,
    `    <Optimize_RemoveOverlaps Value="0"/>`,
    `    <Optimize_OptimalEntryPoint Value="0"/>`,
    `    <Optimize_OverlapDist Value="0.025"/>`,
    `  </UIPrefs>`,
  ].join("\n");
}

function buildCylinderCorrection(payload: LightBurnExportPayload): string {
  const diameterMm =
    payload.workspaceMode === "tumbler-wrap" &&
    payload.cylinder?.objectDiameterMm &&
    Number.isFinite(payload.cylinder.objectDiameterMm)
      ? Math.round(payload.cylinder.objectDiameterMm)
      : 87;

  return [
    `  <CylinderCorrection>`,
    `    <Enabled Value="0"/>`,
    `    <Axis Value="0"/>`,
    `    <Diameter Value="${diameterMm}"/>`,
    `    <Focus Value="470"/>`,
    `    <Convex Value="1"/>`,
    `  </CylinderCorrection>`,
  ].join("\n");
}

function buildThumbnail(): string {
  // A tiny valid PNG is enough to match LightBurn's native project envelope.
  return `  <Thumbnail Source="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5j0AAAAASUVORK5CYII="/>`;
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
  const power = material ? material.powerPct : 20;
  const maxPower = material ? material.maxPowerPct : 22;
  const speed = material ? material.speedMmS : 350;
  const passes = material ? material.passes : 1;
  const interval = material ? +(25.4 / material.lpi).toFixed(4) : 0.0941;
  const layerName =
    mode === "minimal"
      ? "Artwork"
      : material ? `Artwork - ${material.label}` : "Artwork";

  const artworkSetting = [
    `  <CutSetting type="Scan">`,
    `    <index Value="${ARTWORK_CUT_INDEX}" />`,
    `    <name Value="${layerName}" />`,
    `    <maxPower Value="${maxPower}" />`,
    `    <maxPower2 Value="${power}" />`,
    `    <speed Value="${speed}" />`,
    `    <PPI Value="500" />`,
    `    <runBlower Value="0" />`,
    `    <interval Value="${interval}" />`,
    `    <priority Value="0" />`,
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

function buildArtworkGroup(payload: LightBurnExportPayload): string {
  const groupX = payload.rotary.exportOriginXmm ?? 0;
  const groupY = (payload.rotary.exportOriginYmm ?? 0) + payload.templateHeightMm;
  const pathIds = { nextVertId: 0, nextPrimId: 0 };
  const artworkShapes = payload.items.flatMap((item) =>
    extractLbrnLocalShapesFromItem(item, ARTWORK_CUT_INDEX, pathIds),
  );

  if (artworkShapes.length === 0) {
    return `  <!-- No artwork shapes extracted - check that items contain SVG path data -->`;
  }

  return [
    `  <!-- Artwork (${artworkShapes.length} shape(s)) - set power on C00 before running -->`,
    `  <Shape Type="Group" CutIndex="${ARTWORK_CUT_INDEX}">`,
    `    <XForm>1 0 0 1 ${mm(groupX)} ${mm(groupY)}</XForm>`,
    `    <Children>`,
    ...artworkShapes.map((shape) => `      ${shape}`),
    `    </Children>`,
    `  </Shape>`,
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
  const galvoRotaryConfig = buildGalvoRotaryConfig(payload);
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

    return buildArtworkGroup(payload);
  })();

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- LT316 LightBurn Project generated ${generatedAt} -->`,
    `<LightBurnProject AppVersion="2.1.00" DeviceName="C02 GALVO 300MM f-473" FormatVersion="1" MaterialHeight="0" MirrorX="False" MirrorY="False" AskForSendName="True">`,
    ``,
    buildThumbnail(),
    ``,
    buildVariableText(),
    ``,
    buildUiPrefs(),
    ``,
    buildCylinderCorrection(payload),
    ``,
    ...(rotarySetup ? [rotarySetup, ``] : []),
    ...(galvoRotaryConfig ? [galvoRotaryConfig, ``] : []),
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
