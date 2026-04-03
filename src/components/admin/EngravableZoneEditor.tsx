"use client";

import React, { useRef, useEffect, useState } from "react";
import { deriveEngravableZoneFromFitDebug } from "@/lib/engravableDimensions";
import {
  buildContourSvgPath,
  buildDirectContourSvgPath,
  buildMirroredOutlineSvgPath,
  cloneReferenceLayerState,
  cloneEditableBodyOutline,
  convertEditableOutlinePointType,
  createDefaultReferenceLayerState,
  createEditableBodyOutline,
  createEditableBodyOutlineFromImportedSvg,
  createEditableBodyOutlineFromSeedSvgText,
  createReferencePaths,
  deriveDimensionsFromEditableBodyOutline,
  insertEditableOutlinePoint,
  removeEditableOutlinePoint,
  sortEditableOutlinePoints,
} from "@/lib/editableBodyOutline";
import type {
  EditableBodyOutline,
  EditableBodyOutlinePoint,
  ReferenceLayerKey,
  ReferenceLayerState,
  ReferencePaths,
} from "@/types/productTemplate";
import type { ImportedEditableBodyOutlineSource } from "@/lib/editableBodyOutline";
import type { TumblerItemLookupFitDebug } from "@/types/tumblerItemLookup";
import styles from "./EngravableZoneEditor.module.css";

interface Props {
  /** BG-removed product photo data URL */
  photoDataUrl: string;
  /** Total product height in mm */
  overallHeightMm: number;
  /** Physical tumbler body top offset from the overall top (mm), excluding lid/straw. */
  bodyTopFromOverallMm: number;
  /** Physical tumbler body bottom from the overall top (mm). */
  bodyBottomFromOverallMm: number;
  /** Lid seam / rotary-grab reference from the overall top (mm). */
  lidSeamFromOverallMm?: number;
  /** Bottom edge of the non-powder-coated silver band from the overall top (mm). */
  silverBandBottomFromOverallMm?: number;
  /** Top edge of the handle silhouette from the overall top (mm). */
  handleTopFromOverallMm?: number;
  /** Bottom edge of the handle silhouette from the overall top (mm). */
  handleBottomFromOverallMm?: number;
  /** Reach of the handle silhouette from the body edge to the outer edge (mm). */
  handleReachMm?: number;
  /** Width at the shoulder break where the straight wall transitions into taper (mm). */
  shoulderDiameterMm?: number;
  taperUpperDiameterMm?: number;
  taperLowerDiameterMm?: number;
  bevelDiameterMm?: number;
  /** Outside diameter in mm (shown in readout) */
  diameterMm: number;
  /** Body / wrap diameter in mm when different from the visible outer diameter */
  bodyWrapDiameterMm?: number;
  /** Outer lid/rim diameter in mm, when known */
  topOuterDiameterMm?: number;
  /** Lower foot diameter in mm, when known */
  baseDiameterMm?: number;
  /** Saved editor width scale for the reference photo (percent, relative to the auto-sized baseline) */
  photoWidthScalePct: number;
  /** Saved editor height scale for the reference photo (percent, relative to the auto-sized baseline) */
  photoHeightScalePct: number;
  /** Whether photo width and height should stay locked together */
  photoLockAspect: boolean;
  /** Saved editor vertical nudge for the reference photo (percent of editor height) */
  photoOffsetYPct: number;
  /** Saved editor horizontal nudge for the reference photo (percent of editor width) */
  photoOffsetXPct: number;
  /** Saved editor vertical anchor for the reference photo */
  photoAnchorY: "center" | "bottom";
  /** Saved editor horizontal centering mode for the reference photo */
  photoCenterMode: "body" | "photo";
  /** Current sampled / saved body color */
  bodyColorHex: string;
  /** Current sampled / saved rim / engrave color */
  rimColorHex: string;
  /** Traced profile details from the lookup image, when available */
  fitDebug?: TumblerItemLookupFitDebug | null;
  outlineProfile?: EditableBodyOutline;
  referencePaths?: ReferencePaths;
  referenceLayerState?: ReferenceLayerState;
  onChange: (bodyTopFromOverallMm: number, bodyBottomFromOverallMm: number) => void;
  onLidSeamChange?: (fromOverallMm: number | undefined) => void;
  onSilverBandBottomChange?: (fromOverallMm: number | undefined) => void;
  onHandleTopChange?: (fromOverallMm: number | undefined) => void;
  onHandleBottomChange?: (fromOverallMm: number | undefined) => void;
  onHandleReachChange?: (reachMm: number | undefined) => void;
  onShoulderDiameterChange?: (diameterMm: number | undefined) => void;
  onTaperUpperDiameterChange?: (diameterMm: number | undefined) => void;
  onTaperLowerDiameterChange?: (diameterMm: number | undefined) => void;
  onBevelDiameterChange?: (diameterMm: number | undefined) => void;
  onPhotoWidthScaleChange: (scalePct: number) => void;
  onPhotoHeightScaleChange: (scalePct: number) => void;
  onPhotoLockAspectChange: (locked: boolean) => void;
  onPhotoOffsetYChange: (offsetPct: number) => void;
  onPhotoOffsetXChange: (offsetPct: number) => void;
  onPhotoAnchorYChange: (anchor: "center" | "bottom") => void;
  onPhotoCenterModeChange: (mode: "body" | "photo") => void;
  onColorsChange: (bodyColorHex: string, rimColorHex: string) => void;
  onBaseDiameterDerived?: (diameterMm: number) => void;
  onDiameterChange?: (diameterMm: number) => void;
  onTopOuterDiameterChange?: (diameterMm: number) => void;
  onBaseDiameterChange?: (diameterMm: number) => void;
  onOutlineProfileChange?: (outline: EditableBodyOutline | undefined) => void;
  onReferencePathsChange?: (paths: ReferencePaths) => void;
  onReferenceLayerStateChange?: (state: ReferenceLayerState) => void;
}

/** Display height for the editor canvas in px */
const DEFAULT_CANVAS_HEIGHT = 320;
/** Minimum margin in mm */
const MIN_MARGIN_MM = 0;
/** How much of the editor height the visible tumbler should occupy */
const VISIBLE_TUMBLER_HEIGHT_PCT = 0.98;
/** Display-only zoom-out so the full body-reference photo fits comfortably in the panel. */
const BODY_REFERENCE_DISPLAY_FIT_PCT = 0.92;
const MIN_PHOTO_SCALE_PCT = 60;
const MAX_PHOTO_SCALE_PCT = 180;
const MAX_PHOTO_OFFSET_Y_PCT = 25;
const MAX_PHOTO_OFFSET_X_PCT = 25;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (value: number) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function sampleRegionColor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  mode: "average" | "bright" = "average",
): string | null {
  const sx = Math.max(0, Math.floor(x));
  const sy = Math.max(0, Math.floor(y));
  const sw = Math.max(1, Math.floor(width));
  const sh = Math.max(1, Math.floor(height));
  const imageData = ctx.getImageData(sx, sy, sw, sh).data;
  const samples: Array<{ r: number; g: number; b: number; l: number }> = [];

  for (let i = 0; i < imageData.length; i += 4) {
    const alpha = imageData[i + 3];
    if (alpha <= 20) continue;
    const r = imageData[i];
    const g = imageData[i + 1];
    const b = imageData[i + 2];
    const l = r * 0.2126 + g * 0.7152 + b * 0.0722;
    samples.push({ r, g, b, l });
  }

  if (samples.length === 0) return null;

  const activeSamples =
    mode === "bright"
      ? [...samples]
          .sort((a, b) => b.l - a.l)
          .slice(0, Math.max(8, Math.ceil(samples.length * 0.35)))
      : samples;

  const total = activeSamples.reduce(
    (acc, sample) => {
      acc.r += sample.r;
      acc.g += sample.g;
      acc.b += sample.b;
      return acc;
    },
    { r: 0, g: 0, b: 0 },
  );

  return rgbToHex(total.r / activeSamples.length, total.g / activeSamples.length, total.b / activeSamples.length);
}

type AlphaSegment = {
  left: number;
  right: number;
  width: number;
};

function medianNumber(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function percentileNumber(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = clamp(Math.round((sorted.length - 1) * percentile), 0, sorted.length - 1);
  return sorted[index] ?? 0;
}

function estimateBackgroundColor(data: Uint8ClampedArray, width: number, height: number): { r: number; g: number; b: number } {
  const patchW = Math.max(6, Math.round(width * 0.06));
  const patchH = Math.max(6, Math.round(height * 0.06));
  const samples: Array<{ r: number; g: number; b: number }> = [];
  const corners = [
    { startX: 0, startY: 0 },
    { startX: Math.max(0, width - patchW), startY: 0 },
    { startX: 0, startY: Math.max(0, height - patchH) },
    { startX: Math.max(0, width - patchW), startY: Math.max(0, height - patchH) },
  ];

  for (const corner of corners) {
    for (let y = corner.startY; y < Math.min(height, corner.startY + patchH); y += 1) {
      for (let x = corner.startX; x < Math.min(width, corner.startX + patchW); x += 1) {
        const index = (y * width + x) * 4;
        samples.push({
          r: data[index] ?? 0,
          g: data[index + 1] ?? 0,
          b: data[index + 2] ?? 0,
        });
      }
    }
  }

  if (samples.length === 0) {
    return { r: 255, g: 255, b: 255 };
  }

  return {
    r: medianNumber(samples.map((sample) => sample.r)),
    g: medianNumber(samples.map((sample) => sample.g)),
    b: medianNumber(samples.map((sample) => sample.b)),
  };
}

function colorDistance(r: number, g: number, b: number, background: { r: number; g: number; b: number }): number {
  const dr = r - background.r;
  const dg = g - background.g;
  const db = b - background.b;
  return Math.sqrt((dr * dr) + (dg * dg) + (db * db));
}

function rgbToSaturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max <= 0) return 0;
  return (max - min) / max;
}

function findAlphaSegments(alphaData: Uint8ClampedArray, width: number, y: number): AlphaSegment[] {
  const segments: AlphaSegment[] = [];
  let start = -1;
  for (let x = 0; x < width; x += 1) {
    const alpha = alphaData[(y * width + x) * 4 + 3];
    if (alpha > 8) {
      if (start === -1) start = x;
      continue;
    }
    if (start !== -1) {
      segments.push({ left: start, right: x - 1, width: x - start });
      start = -1;
    }
  }
  if (start !== -1) {
    segments.push({ left: start, right: width - 1, width: width - start });
  }
  return segments;
}

function measureCoreWidthBand(args: {
  alphaData: Uint8ClampedArray;
  width: number;
  height: number;
  centerX: number;
  startY: number;
  endY: number;
}): number | null {
  const { alphaData, width, height, centerX, startY, endY } = args;
  const widths: number[] = [];

  for (let y = Math.max(0, startY); y <= Math.min(height - 1, endY); y += 1) {
    const segments = findAlphaSegments(alphaData, width, y);
    const bodySegment = segments.find((segment) => centerX >= segment.left && centerX <= segment.right);
    if (!bodySegment) continue;
    const leftHalf = centerX - bodySegment.left;
    const rightHalf = bodySegment.right - centerX;
    const coreHalfWidth = Math.max(1, Math.min(leftHalf, rightHalf));
    widths.push(coreHalfWidth * 2);
  }

  if (widths.length === 0) return null;
  return Math.max(8, medianNumber(widths));
}

function measureDominantSegmentWidthBand(args: {
  alphaData: Uint8ClampedArray;
  width: number;
  height: number;
  centerX: number;
  startY: number;
  endY: number;
  minWidthPx?: number;
}): number | null {
  const { alphaData, width, height, centerX, startY, endY, minWidthPx = 24 } = args;
  const widths: number[] = [];

  for (let y = Math.max(0, startY); y <= Math.min(height - 1, endY); y += 1) {
    const segments = findAlphaSegments(alphaData, width, y)
      .filter((segment) => segment.width >= minWidthPx);
    if (segments.length === 0) continue;

    const dominantSegment = [...segments].sort((a, b) => {
      const aCenter = (a.left + a.right) / 2;
      const bCenter = (b.left + b.right) / 2;
      const centerDelta = Math.abs(aCenter - centerX) - Math.abs(bCenter - centerX);
      if (Math.abs(centerDelta) > 6) return centerDelta;
      return b.width - a.width;
    })[0];

    if (!dominantSegment) continue;
    widths.push(dominantSegment.width);
  }

  if (widths.length === 0) return null;
  return Math.max(minWidthPx, percentileNumber(widths, 0.75));
}

function findLongestYSegment(rows: number[]): { start: number; end: number } | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => a - b);
  let best = { start: sorted[0] ?? 0, end: sorted[0] ?? 0 };
  let current = { start: sorted[0] ?? 0, end: sorted[0] ?? 0 };
  for (let index = 1; index < sorted.length; index += 1) {
    const y = sorted[index] ?? 0;
    if (y - current.end <= 2) {
      current.end = y;
      continue;
    }
    if ((current.end - current.start) > (best.end - best.start)) {
      best = { ...current };
    }
    current = { start: y, end: y };
  }
  if ((current.end - current.start) > (best.end - best.start)) {
    best = current;
  }
  return best;
}

function buildClosedPath(points: Array<{ x: number; y: number }>): string | null {
  if (points.length < 4) return null;
  return `M ${points
    .map((point, index) => `${index === 0 ? "" : "L "}${round1(point.x)} ${round1(point.y)}`)
    .join(" ")} Z`;
}

type LowerBodyRow = {
  y: number;
  bodyLeft: number;
  bodyRight: number;
  coreWidth: number;
  segmentLeft?: number;
  segmentRight?: number;
};

function buildHandleTraceFromRows(args: {
  rows: LowerBodyRow[];
  handleSide: "left" | "right" | null | undefined;
  handleStartY: number;
  handleEndY: number;
}): {
  outerPath: string | null;
  innerPath: string | null;
  outerRect: { x: number; y: number; width: number; height: number } | null;
  innerRect: { x: number; y: number; width: number; height: number } | null;
} {
  const { rows, handleSide, handleStartY, handleEndY } = args;
  if (!handleSide) {
    return {
      outerPath: null,
      innerPath: null,
      outerRect: null,
      innerRect: null,
    };
  }

  const outlineRows: Array<{ y: number; leftX: number; rightX: number }> = [];
  const holeRows: Array<{ y: number; leftX: number; rightX: number }> = [];

  for (const row of rows) {
    if (row.y < handleStartY || row.y > handleEndY) continue;
    if (row.segmentLeft == null || row.segmentRight == null) continue;

    if (handleSide === "right") {
      if (row.segmentRight <= row.bodyRight + 2) continue;
      const hasHole = row.segmentLeft > row.bodyRight + 1;
      const outerLeft = hasHole ? row.segmentLeft : row.bodyRight;
      outlineRows.push({ y: row.y, leftX: outerLeft, rightX: row.segmentRight });
      if (hasHole && row.segmentLeft - row.bodyRight >= 4) {
        holeRows.push({ y: row.y, leftX: row.bodyRight, rightX: row.segmentLeft });
      }
      continue;
    }

    if (row.segmentLeft >= row.bodyLeft - 2) continue;
    const hasHole = row.segmentRight < row.bodyLeft - 1;
    const outerRight = hasHole ? row.segmentRight : row.bodyLeft;
    outlineRows.push({ y: row.y, leftX: row.segmentLeft, rightX: outerRight });
    if (hasHole && row.bodyLeft - row.segmentRight >= 4) {
      holeRows.push({ y: row.y, leftX: row.segmentRight, rightX: row.bodyLeft });
    }
  }

  const outerPath = buildClosedPath([
    ...outlineRows.map((row) => ({ x: row.leftX, y: row.y })),
    ...[...outlineRows].reverse().map((row) => ({ x: row.rightX, y: row.y })),
  ]);
  const innerPath = buildClosedPath([
    ...holeRows.map((row) => ({ x: row.leftX, y: row.y })),
    ...[...holeRows].reverse().map((row) => ({ x: row.rightX, y: row.y })),
  ]);

  const outerRect = outlineRows.length > 0
    ? {
        x: Math.min(...outlineRows.map((row) => row.leftX)),
        y: Math.min(...outlineRows.map((row) => row.y)),
        width: Math.max(...outlineRows.map((row) => row.rightX)) - Math.min(...outlineRows.map((row) => row.leftX)),
        height: Math.max(...outlineRows.map((row) => row.y)) - Math.min(...outlineRows.map((row) => row.y)) + 1,
      }
    : null;
  const innerRect = holeRows.length > 0
    ? {
        x: Math.min(...holeRows.map((row) => row.leftX)),
        y: Math.min(...holeRows.map((row) => row.y)),
        width: Math.max(...holeRows.map((row) => row.rightX)) - Math.min(...holeRows.map((row) => row.leftX)),
        height: Math.max(...holeRows.map((row) => row.y)) - Math.min(...holeRows.map((row) => row.y)) + 1,
      }
    : null;

  return {
    outerPath,
    innerPath,
    outerRect,
    innerRect,
  };
}

function deriveStagedBaseGeometry(args: {
  rows: LowerBodyRow[];
  centerX: number;
  bodyTopY: number;
  bodyBottomY: number;
  bodyHeightPx: number;
  fallbackBaseWidthPx?: number | null;
}): {
  flatBottomY: number;
  bevelStartY: number;
  flatBottomLeftX: number;
  flatBottomRightX: number;
  bevelLeftX: number;
  bevelRightX: number;
  baseWidthPx: number;
} {
  const { rows, centerX, bodyTopY, bodyBottomY, bodyHeightPx, fallbackBaseWidthPx } = args;
  const lowerRows = rows
    .filter((row) => row.y >= Math.max(bodyTopY, bodyBottomY - Math.round(bodyHeightPx * 0.28)))
    .sort((a, b) => a.y - b.y);

  const referenceBaseWidthPx = Math.max(
    12,
    fallbackBaseWidthPx ?? percentileNumber(lowerRows.map((row) => row.coreWidth), 0.72) ?? 12,
  );
  const stableRows = lowerRows
    .filter((row) => row.coreWidth >= referenceBaseWidthPx * 0.97)
    .map((row) => row.y);
  const stableBand = findLongestYSegment(stableRows);
  const flatBottomY = clamp(
    stableBand?.end ?? (bodyBottomY - Math.max(2, Math.round(bodyHeightPx * 0.018))),
    bodyTopY + Math.max(24, Math.round(bodyHeightPx * 0.45)),
    bodyBottomY,
  );
  const bevelHeightPx = clamp(Math.round(bodyHeightPx * 0.028), 3, 10);
  const bevelStartY = clamp(flatBottomY - bevelHeightPx, bodyTopY + Math.max(16, Math.round(bodyHeightPx * 0.35)), flatBottomY);
  const bevelInsetPx = clamp(Math.round(referenceBaseWidthPx * 0.035), 2, 8);
  const flatBottomWidthPx = Math.max(12, referenceBaseWidthPx - bevelInsetPx * 2);
  const flatBottomLeftX = round1(centerX - (flatBottomWidthPx / 2));
  const flatBottomRightX = round1(centerX + (flatBottomWidthPx / 2));
  const bevelLeftX = round1(centerX - (referenceBaseWidthPx / 2));
  const bevelRightX = round1(centerX + (referenceBaseWidthPx / 2));

  return {
    flatBottomY: round1(flatBottomY),
    bevelStartY: round1(bevelStartY),
    flatBottomLeftX,
    flatBottomRightX,
    bevelLeftX,
    bevelRightX,
    baseWidthPx: round1(referenceBaseWidthPx),
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + ((b - a) * t);
}

function buildMeasuredBodyOverlay(args: {
  centerX: number;
  bodyTopY: number;
  bodyBottomY: number;
  straightWallBottomY?: number | null;
  bodyWidthPx: number;
  shoulderWidthPx?: number | null;
  taperUpperWidthPx?: number | null;
  taperLowerWidthPx?: number | null;
  bevelWidthPx?: number | null;
  baseWidthPx: number;
  viewWidth: number;
  viewHeight: number;
}): {
  outlinePath: string | null;
  bottomMaskPath: string | null;
  leftBevelMaskPath: string | null;
  rightBevelMaskPath: string | null;
  controlPoints: {
    shoulderY: number;
    taperUpperY: number;
    taperLowerY: number;
    bevelY: number;
    shoulderHalfWidth: number;
    taperUpperHalfWidth: number;
    taperLowerHalfWidth: number;
    bevelHalfWidth: number;
  };
} {
  const {
    centerX,
    bodyTopY,
    bodyBottomY,
    straightWallBottomY,
    bodyWidthPx,
    shoulderWidthPx,
    taperUpperWidthPx,
    taperLowerWidthPx,
    bevelWidthPx,
    baseWidthPx,
    viewWidth,
    viewHeight,
  } = args;
  const bodyHeightPx = Math.max(12, bodyBottomY - bodyTopY);
  const halfBodyWidth = Math.max(6, bodyWidthPx / 2);
  const halfBaseWidth = Math.max(4, Math.min(baseWidthPx / 2, halfBodyWidth * 0.94));
  const halfShoulderWidth = Math.max(
    halfBaseWidth,
    Math.min(
      halfBodyWidth,
      (shoulderWidthPx != null ? shoulderWidthPx / 2 : halfBodyWidth),
    ),
  );
  const flatBottomY = round1(clamp(bodyBottomY, bodyTopY + 12, viewHeight - 1));
  const bevelHeightPx = clamp(Math.round(bodyHeightPx * 0.032), 4, 10);
  const bevelStartY = round1(clamp(flatBottomY - bevelHeightPx, bodyTopY + 18, flatBottomY - 1));
  const flatInsetPx = clamp(Math.round(baseWidthPx * 0.028), 1, 4);
  const flatBottomHalfWidth = Math.max(4, halfBaseWidth - flatInsetPx);
  const taperStartY = round1(clamp(
    straightWallBottomY ?? lerp(bodyTopY, bevelStartY, 0.5),
    bodyTopY + 12,
    bevelStartY - 10,
  ));
  const taperHeightPx = Math.max(10, bevelStartY - taperStartY);
  const taperMidY1 = round1(taperStartY + (taperHeightPx * 0.22));
  const taperMidY2 = round1(taperStartY + (taperHeightPx * 0.68));
  const taperHalfWidth1 = round1(clamp(
    (taperUpperWidthPx != null ? taperUpperWidthPx / 2 : lerp(halfShoulderWidth, halfBaseWidth, 0.28)),
    halfBaseWidth,
    halfShoulderWidth,
  ));
  const taperHalfWidth2 = round1(clamp(
    (taperLowerWidthPx != null ? taperLowerWidthPx / 2 : lerp(halfShoulderWidth, halfBaseWidth, 0.82)),
    halfBaseWidth,
    taperHalfWidth1,
  ));
  const bodyLeftX = round1(centerX - halfBodyWidth);
  const bodyRightX = round1(centerX + halfBodyWidth);
  const shoulderLeftX = round1(centerX - halfShoulderWidth);
  const shoulderRightX = round1(centerX + halfShoulderWidth);
  const taperLeftX1 = round1(centerX - taperHalfWidth1);
  const taperRightX1 = round1(centerX + taperHalfWidth1);
  const taperLeftX2 = round1(centerX - taperHalfWidth2);
  const taperRightX2 = round1(centerX + taperHalfWidth2);
  const bevelHalfWidth = round1(clamp(
    (bevelWidthPx != null ? bevelWidthPx / 2 : halfBaseWidth),
    halfBaseWidth,
    taperHalfWidth2,
  ));
  const bevelLeftX = round1(centerX - bevelHalfWidth);
  const bevelRightX = round1(centerX + bevelHalfWidth);
  const flatBottomLeftX = round1(centerX - flatBottomHalfWidth);
  const flatBottomRightX = round1(centerX + flatBottomHalfWidth);
  const outlinePath = buildClosedPath([
    { x: bodyLeftX, y: bodyTopY },
    { x: shoulderLeftX, y: taperStartY },
    { x: taperLeftX1, y: taperMidY1 },
    { x: taperLeftX2, y: taperMidY2 },
    { x: bevelLeftX, y: bevelStartY },
    { x: flatBottomLeftX, y: flatBottomY },
    { x: flatBottomRightX, y: flatBottomY },
    { x: bevelRightX, y: bevelStartY },
    { x: taperRightX2, y: taperMidY2 },
    { x: taperRightX1, y: taperMidY1 },
    { x: shoulderRightX, y: taperStartY },
    { x: bodyRightX, y: bodyTopY },
  ]);

  const bottomMaskPath = buildClosedPath([
    { x: 0, y: flatBottomY },
    { x: viewWidth, y: flatBottomY },
    { x: viewWidth, y: viewHeight },
    { x: 0, y: viewHeight },
  ]);
  const leftBevelMaskPath = buildClosedPath([
    { x: 0, y: bevelStartY },
    { x: bevelLeftX, y: bevelStartY },
    { x: flatBottomLeftX, y: flatBottomY },
    { x: 0, y: flatBottomY },
  ]);
  const rightBevelMaskPath = buildClosedPath([
    { x: bevelRightX, y: bevelStartY },
    { x: viewWidth, y: bevelStartY },
    { x: viewWidth, y: flatBottomY },
    { x: flatBottomRightX, y: flatBottomY },
  ]);

  return {
    outlinePath,
    bottomMaskPath,
    leftBevelMaskPath,
    rightBevelMaskPath,
    controlPoints: {
      shoulderY: taperStartY,
      taperUpperY: taperMidY1,
      taperLowerY: taperMidY2,
      bevelY: bevelStartY,
      shoulderHalfWidth: halfShoulderWidth,
      taperUpperHalfWidth: taperHalfWidth1,
      taperLowerHalfWidth: taperHalfWidth2,
      bevelHalfWidth,
    },
  };
}

function getBoundsFromPoints(points: Array<{ x: number; y: number }>): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } | null {
  if (points.length === 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function cropVisibleBounds(
  img: HTMLImageElement,
  fitDebug?: TumblerItemLookupFitDebug | null,
): {
  dataUrl: string;
  width: number;
  height: number;
  bodyCenterX: number;
  referenceBodyWidthPx: number;
  referenceBandCenterY: number;
  bodyTopY: number;
  bodyBottomY: number;
  rimTopY: number | null;
  rimBottomY: number | null;
  bodyOutlinePath: string | null;
  bodyOutlineBounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } | null;
  tracedBodyOutlinePath: string | null;
  handleOuterPath: string | null;
  handleInnerPath: string | null;
  handleSide: "left" | "right" | null;
  handleOuterRect: { x: number; y: number; width: number; height: number } | null;
  handleInnerRect: { x: number; y: number; width: number; height: number } | null;
  topOuterWidthPx: number | null;
  baseWidthPx: number | null;
} {
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = img.naturalWidth;
  srcCanvas.height = img.naturalHeight;
  const srcCtx = srcCanvas.getContext("2d");
  if (!srcCtx) {
    return {
      dataUrl: img.src,
      width: img.naturalWidth,
      height: img.naturalHeight,
      bodyCenterX: img.naturalWidth / 2,
      referenceBodyWidthPx: Math.max(40, img.naturalWidth * 0.28),
      referenceBandCenterY: img.naturalHeight * 0.24,
      bodyTopY: img.naturalHeight * 0.08,
      bodyBottomY: img.naturalHeight * 0.92,
      rimTopY: null,
      rimBottomY: null,
      bodyOutlinePath: null,
      bodyOutlineBounds: null,
      tracedBodyOutlinePath: null,
      handleOuterPath: null,
      handleInnerPath: null,
      handleSide: null,
      handleOuterRect: null,
      handleInnerRect: null,
      topOuterWidthPx: null,
      baseWidthPx: null,
    };
  }

  srcCtx.drawImage(img, 0, 0);
  const { data, width, height } = srcCtx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);
  const hasTransparency = (() => {
    const totalPixels = width * height;
    let transparentPixels = 0;
    for (let index = 3; index < data.length; index += 4) {
      if ((data[index] ?? 255) < 245) {
        transparentPixels += 1;
      }
    }
    return transparentPixels > totalPixels * 0.01;
  })();
  const background = hasTransparency ? null : estimateBackgroundColor(data, width, height);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3] ?? 255;
      const r = data[index] ?? 0;
      const g = data[index + 1] ?? 0;
      const b = data[index + 2] ?? 0;
      const foreground = hasTransparency
        ? alpha > 8
        : alpha > 8 && background != null && colorDistance(r, g, b, background) > 22;
      if (foreground) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return {
      dataUrl: img.src,
      width: img.naturalWidth,
      height: img.naturalHeight,
      bodyCenterX: img.naturalWidth / 2,
      referenceBodyWidthPx: Math.max(40, img.naturalWidth * 0.28),
      referenceBandCenterY: img.naturalHeight * 0.24,
      bodyTopY: img.naturalHeight * 0.08,
      bodyBottomY: img.naturalHeight * 0.92,
      rimTopY: null,
      rimBottomY: null,
      bodyOutlinePath: null,
      bodyOutlineBounds: null,
      tracedBodyOutlinePath: null,
      handleOuterPath: null,
      handleInnerPath: null,
      handleSide: null,
      handleOuterRect: null,
      handleInnerRect: null,
      topOuterWidthPx: null,
      baseWidthPx: null,
    };
  }

  const cropX = Math.max(0, minX - 2);
  const cropY = Math.max(0, minY - 2);
  const cropW = Math.min(width - cropX, maxX - minX + 5);
  const cropH = Math.min(height - cropY, maxY - minY + 5);

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = cropW;
  cropCanvas.height = cropH;
  const cropCtx = cropCanvas.getContext("2d");
  if (!cropCtx) {
    return {
      dataUrl: img.src,
      width: img.naturalWidth,
      height: img.naturalHeight,
      bodyCenterX: img.naturalWidth / 2,
      referenceBodyWidthPx: Math.max(40, img.naturalWidth * 0.28),
      referenceBandCenterY: img.naturalHeight * 0.24,
      bodyTopY: img.naturalHeight * 0.08,
      bodyBottomY: img.naturalHeight * 0.92,
      rimTopY: null,
      rimBottomY: null,
      bodyOutlinePath: null,
      bodyOutlineBounds: null,
      tracedBodyOutlinePath: null,
      handleOuterPath: null,
      handleInnerPath: null,
      handleSide: null,
      handleOuterRect: null,
      handleInnerRect: null,
      topOuterWidthPx: null,
      baseWidthPx: null,
    };
  }

  cropCtx.drawImage(srcCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  const croppedImage = cropCtx.getImageData(0, 0, cropW, cropH);
  if (!hasTransparency && background != null) {
    for (let y = 0; y < cropH; y += 1) {
      for (let x = 0; x < cropW; x += 1) {
        const index = (y * cropW + x) * 4;
        const r = croppedImage.data[index] ?? 0;
        const g = croppedImage.data[index + 1] ?? 0;
        const b = croppedImage.data[index + 2] ?? 0;
        const isForeground = colorDistance(r, g, b, background) > 22;
        croppedImage.data[index + 3] = isForeground ? 255 : 0;
      }
    }
  }
  const dominantRows: Array<{ y: number; left: number; right: number; width: number; center: number }> = [];
  for (let y = 0; y < cropH; y += 1) {
    const segments = findAlphaSegments(croppedImage.data, cropW, y)
      .filter((segment) => segment.width >= Math.max(10, cropW * 0.08));
    if (segments.length === 0) continue;
    const dominantSegment = [...segments].sort((a, b) => b.width - a.width)[0];
    if (!dominantSegment) continue;
    dominantRows.push({
      y,
      left: dominantSegment.left,
      right: dominantSegment.right,
      width: dominantSegment.width,
      center: (dominantSegment.left + dominantSegment.right) / 2,
    });
  }
  const fitSilhouetteWidthPx = fitDebug
    ? Math.max(1, fitDebug.silhouetteBoundsPx.maxX - fitDebug.silhouetteBoundsPx.minX + 1)
    : null;
  const fitSilhouetteHeightPx = fitDebug
    ? Math.max(1, fitDebug.silhouetteBoundsPx.maxY - fitDebug.silhouetteBoundsPx.minY + 1)
    : null;
  const seededBodyCenterX = fitDebug && fitSilhouetteWidthPx
    ? clamp(
        (
          ((fitDebug.centerXPx - fitDebug.silhouetteBoundsPx.minX) / fitSilhouetteWidthPx) * cropW
        ),
        cropW * 0.15,
        cropW * 0.85,
      )
    : null;
  const upperDominantRows = dominantRows.filter((row) => row.y >= Math.floor(cropH * 0.06) && row.y <= Math.ceil(cropH * 0.68));
  const provisionalReferenceWidthPx = upperDominantRows.length > 0
    ? Math.max(24, percentileNumber(upperDominantRows.map((row) => row.width), 0.28))
    : Math.max(24, cropW * 0.28);
  const stableUpperRows = upperDominantRows.filter((row) =>
    row.width >= provisionalReferenceWidthPx * 0.82 && row.width <= provisionalReferenceWidthPx * 1.08
  );
  const sortedBodyCenters = [...stableUpperRows.map((row) => row.center)].sort((a, b) => a - b);
  const bodyCenterX = seededBodyCenterX ?? (
    sortedBodyCenters.length > 0
    ? sortedBodyCenters[Math.floor(sortedBodyCenters.length / 2)]
    : cropW / 2
  );
  const alphaRows: Array<{
    y: number;
    coreWidth: number;
    extensionLeft: number;
    extensionRight: number;
    bodyLeft: number;
    bodyRight: number;
    segmentLeft: number;
    segmentRight: number;
  }> = [];
  for (let y = 0; y < cropH; y += 1) {
    const segments = findAlphaSegments(croppedImage.data, cropW, y);
    const bodySegment = segments.find((segment) => bodyCenterX >= segment.left && bodyCenterX <= segment.right);
    if (!bodySegment) continue;
    const leftHalf = bodyCenterX - bodySegment.left;
    const rightHalf = bodySegment.right - bodyCenterX;
    const coreHalfWidth = Math.max(1, Math.min(leftHalf, rightHalf));
    const bodyLeft = bodyCenterX - coreHalfWidth;
    const bodyRight = bodyCenterX + coreHalfWidth;
    alphaRows.push({
      y,
      coreWidth: coreHalfWidth * 2,
      extensionLeft: Math.max(0, leftHalf - coreHalfWidth),
      extensionRight: Math.max(0, rightHalf - coreHalfWidth),
      bodyLeft,
      bodyRight,
      segmentLeft: bodySegment.left,
      segmentRight: bodySegment.right,
    });
  }
  const leftPeak = percentileNumber(alphaRows.map((row) => row.extensionLeft), 0.95);
  const rightPeak = percentileNumber(alphaRows.map((row) => row.extensionRight), 0.95);
  const handleSide = rightPeak >= leftPeak ? "right" : "left";
  const peakExtension = handleSide === "right" ? rightPeak : leftPeak;
  const handleRows = alphaRows
    .filter((row) => (handleSide === "right" ? row.extensionRight : row.extensionLeft) >= Math.max(6, peakExtension * 0.32))
    .map((row) => row.y);
  const handleSegment = findLongestYSegment(handleRows);
  const bandHeight = Math.max(8, Math.min(18, Math.round(cropH * 0.025)));
  const fallbackBandCenterY = clamp(Math.round(cropH * 0.24), Math.ceil(bandHeight / 2), cropH - Math.ceil(bandHeight / 2));
  const stableUpperBand = findLongestYSegment(stableUpperRows.map((row) => row.y));
  const seededReferenceBandCenterY = fitDebug && fitSilhouetteHeightPx
    ? clamp(
        (
          (((fitDebug.measurementBandCenterYPx ?? fitDebug.referenceBandCenterYPx) - fitDebug.silhouetteBoundsPx.minY) / fitSilhouetteHeightPx)
          * cropH
        ),
        Math.ceil(bandHeight / 2),
        cropH - Math.ceil(bandHeight / 2),
      )
    : null;
  const referenceBandCenterY = seededReferenceBandCenterY ?? (
    stableUpperBand
      ? clamp(
          Math.round((stableUpperBand.start + stableUpperBand.end) / 2),
          Math.ceil(bandHeight / 2),
          cropH - Math.ceil(bandHeight / 2),
        )
      : (handleSegment
        ? clamp(
            Math.round(handleSegment.start - Math.max(8, Math.min(18, (handleSegment.end - handleSegment.start + 1) * 0.12))),
            Math.ceil(bandHeight / 2),
            cropH - Math.ceil(bandHeight / 2),
          )
        : fallbackBandCenterY)
  );
  const referenceBandTop = Math.max(0, referenceBandCenterY - Math.floor(bandHeight / 2));
  const referenceBandBottom = Math.min(cropH - 1, referenceBandTop + bandHeight - 1);
  const referenceBodyWidthPx = Math.max(
    40,
    medianNumber(
      alphaRows
        .filter((row) => row.y >= referenceBandTop && row.y <= referenceBandBottom)
        .map((row) => row.coreWidth),
    ) ||
      medianNumber(stableUpperRows.map((row) => row.width)) ||
      medianNumber(alphaRows.map((row) => row.coreWidth)) ||
      Math.max(40, cropW * 0.28),
  );
  const bodyTopY = Math.max(0, referenceBandTop - Math.round(cropH * 0.08));
  const bodyBottomY = cropH - 1;
  const bodyHeightPx = Math.max(1, bodyBottomY - bodyTopY);
  const topOuterWidthPx = measureDominantSegmentWidthBand({
    alphaData: croppedImage.data,
    width: cropW,
    height: cropH,
    centerX: bodyCenterX,
    startY: Math.max(0, bodyTopY - Math.round(bodyHeightPx * 0.035)),
    endY: Math.min(cropH - 1, bodyTopY + Math.round(bodyHeightPx * 0.045)),
  });
  const measuredBaseWidthPx = measureCoreWidthBand({
    alphaData: croppedImage.data,
    width: cropW,
    height: cropH,
    centerX: bodyCenterX,
    startY: Math.max(0, bodyBottomY - Math.round(bodyHeightPx * 0.12)),
    endY: Math.min(cropH - 1, bodyBottomY - Math.round(bodyHeightPx * 0.035)),
  });
  const outlineRows = alphaRows
    .filter((row) => row.y >= Math.floor(bodyTopY) && row.y <= Math.ceil(bodyBottomY))
    .filter((_, index) => index % Math.max(1, Math.floor(alphaRows.length / 80)) === 0);
  const stagedBase = deriveStagedBaseGeometry({
    rows: alphaRows.map((row) => ({
      y: row.y,
      bodyLeft: row.bodyLeft,
      bodyRight: row.bodyRight,
      coreWidth: row.coreWidth,
    })),
    centerX: bodyCenterX,
    bodyTopY,
    bodyBottomY,
    bodyHeightPx,
    fallbackBaseWidthPx: measuredBaseWidthPx,
  });
  const effectiveBodyBottomY = stagedBase.flatBottomY;
  const trimmedOutlineRows = outlineRows.filter((row) => row.y <= stagedBase.bevelStartY);
  const leftOutlinePoints = [
    ...trimmedOutlineRows.map((row) => ({
      x: row.bodyLeft,
      y: row.y,
    })),
    { x: stagedBase.bevelLeftX, y: stagedBase.bevelStartY },
    { x: stagedBase.flatBottomLeftX, y: stagedBase.flatBottomY },
  ];
  const rightOutlinePoints = [
    { x: stagedBase.flatBottomRightX, y: stagedBase.flatBottomY },
    { x: stagedBase.bevelRightX, y: stagedBase.bevelStartY },
    ...[...trimmedOutlineRows]
      .reverse()
      .map((row) => ({
        x: row.bodyRight,
        y: row.y,
      })),
  ];
  const bodyOutlinePath = buildClosedPath([...leftOutlinePoints, ...rightOutlinePoints]);
  const bodyOutlineBounds = getBoundsFromPoints([...leftOutlinePoints, ...rightOutlinePoints]);
  const handleRowsDetailed = alphaRows.filter((row) => {
    if (!handleSegment) return false;
    if (row.y < handleSegment.start || row.y > handleSegment.end) return false;
    return (handleSide === "right" ? row.extensionRight : row.extensionLeft) >= Math.max(6, peakExtension * 0.32);
  });
  const attachEdges = handleRowsDetailed.map((row) => handleSide === "right" ? row.bodyRight : row.bodyLeft);
  const outerEdges = handleRowsDetailed.map((row) => handleSide === "right" ? row.segmentRight : row.segmentLeft);
  const handleAttachEdge = attachEdges.length > 0 ? medianNumber(attachEdges) : null;
  const handleOuterEdge = outerEdges.length > 0
    ? (handleSide === "right" ? percentileNumber(outerEdges, 0.92) : percentileNumber(outerEdges, 0.08))
    : null;
  const fitDebugHandleOuterRect =
    fitDebug &&
    fitSilhouetteWidthPx &&
    fitSilhouetteHeightPx &&
    fitDebug.handleAttachEdgePx != null &&
    fitDebug.handleOuterEdgePx != null &&
    fitDebug.handleCenterYPx != null &&
    fitDebug.handleOuterHeightPx != null
      ? {
          x: Math.min(
            (((fitDebug.handleAttachEdgePx - fitDebug.silhouetteBoundsPx.minX) / fitSilhouetteWidthPx) * cropW),
            (((fitDebug.handleOuterEdgePx - fitDebug.silhouetteBoundsPx.minX) / fitSilhouetteWidthPx) * cropW),
          ),
          y: ((((fitDebug.handleCenterYPx - (fitDebug.handleOuterHeightPx / 2)) - fitDebug.silhouetteBoundsPx.minY) / fitSilhouetteHeightPx) * cropH),
          width: Math.abs(((fitDebug.handleOuterEdgePx - fitDebug.handleAttachEdgePx) / fitSilhouetteWidthPx) * cropW),
          height: Math.max(1, ((fitDebug.handleOuterHeightPx / fitSilhouetteHeightPx) * cropH)),
        }
      : null;
  const handleOuterRect =
    handleSegment &&
    handleAttachEdge != null &&
    handleOuterEdge != null &&
    Math.abs(handleOuterEdge - handleAttachEdge) >= 8
      ? {
          x: Math.min(handleAttachEdge, handleOuterEdge),
          y: handleSegment.start,
          width: Math.abs(handleOuterEdge - handleAttachEdge),
          height: Math.max(1, handleSegment.end - handleSegment.start + 1),
        }
      : fitDebugHandleOuterRect;
  const handleInnerRect = handleOuterRect
    ? (() => {
        const barThickness = clamp(
          Math.round(Math.min(handleOuterRect.width * 0.32, handleOuterRect.height * 0.14)),
          4,
          Math.max(4, Math.round(handleOuterRect.width * 0.46)),
        );
        const innerWidth = Math.max(4, handleOuterRect.width - (barThickness * 2));
        const innerHeight = Math.max(10, handleOuterRect.height - (barThickness * 2));
        return {
          x: handleOuterRect.x + barThickness,
          y: handleOuterRect.y + barThickness,
          width: innerWidth,
          height: innerHeight,
        };
      })()
    : null;
  const handleTrace = handleSegment
    ? buildHandleTraceFromRows({
        rows: alphaRows,
        handleSide,
        handleStartY: handleSegment.start,
        handleEndY: handleSegment.end,
      })
    : {
        outerPath: null,
        innerPath: null,
        outerRect: handleOuterRect,
        innerRect: handleInnerRect,
      };
  const handleThresholdPx = Math.max(6, peakExtension * 0.32);
  const tracedOutlineRows = outlineRows.map((row) => {
    const hasHandleExtension = handleSegment != null &&
      row.y >= handleSegment.start &&
      row.y <= handleSegment.end &&
      (handleSide === "right" ? row.extensionRight : row.extensionLeft) >= handleThresholdPx;
    const tracedLeftX = hasHandleExtension && handleSide === "left" && handleAttachEdge != null
      ? handleAttachEdge
      : row.segmentLeft;
    const tracedRightX = hasHandleExtension && handleSide === "right" && handleAttachEdge != null
      ? handleAttachEdge
      : row.segmentRight;
    return {
      leftX: tracedLeftX,
      rightX: tracedRightX,
      y: row.y,
    };
  });
  const tracedBodyOutlinePath = buildClosedPath([
    ...tracedOutlineRows.map((row) => ({
      x: row.leftX,
      y: row.y,
    })),
    ...[...tracedOutlineRows].reverse().map((row) => ({
      x: row.rightX,
      y: row.y,
    })),
  ]);
  const rimRatios = fitDebug && fitDebug.bodyBottomPx > fitDebug.bodyTopPx
    ? {
        top: (fitDebug.rimTopPx - fitDebug.bodyTopPx) / Math.max(1, fitDebug.bodyBottomPx - fitDebug.bodyTopPx),
        bottom: (fitDebug.rimBottomPx - fitDebug.bodyTopPx) / Math.max(1, fitDebug.bodyBottomPx - fitDebug.bodyTopPx),
      }
    : null;
  const centralBodyLeft = clamp(Math.round(bodyCenterX - (referenceBodyWidthPx * 0.24)), 0, cropW - 1);
  const centralBodyRight = clamp(Math.round(bodyCenterX + (referenceBodyWidthPx * 0.24)), centralBodyLeft + 1, cropW - 1);
  const sampleRowStats = (y: number): { luminance: number; saturation: number; coverage: number } | null => {
    let luminanceTotal = 0;
    let saturationTotal = 0;
    let samples = 0;
    for (let x = centralBodyLeft; x <= centralBodyRight; x += 1) {
      const index = (Math.round(y) * cropW + x) * 4;
      const alpha = croppedImage.data[index + 3] ?? 0;
      if (alpha < 10) continue;
      const r = croppedImage.data[index] ?? 0;
      const g = croppedImage.data[index + 1] ?? 0;
      const b = croppedImage.data[index + 2] ?? 0;
      luminanceTotal += r * 0.2126 + g * 0.7152 + b * 0.0722;
      saturationTotal += rgbToSaturation(r, g, b);
      samples += 1;
    }
    if (samples < Math.max(6, (centralBodyRight - centralBodyLeft) * 0.4)) return null;
    return {
      luminance: luminanceTotal / samples,
      saturation: saturationTotal / samples,
      coverage: samples / Math.max(1, centralBodyRight - centralBodyLeft + 1),
    };
  };
  const bodyBaselineStats = [];
  for (
    let y = Math.round(bodyTopY + (bodyHeightPx * 0.14));
    y <= Math.round(bodyTopY + (bodyHeightPx * 0.3));
    y += 1
  ) {
    const stats = sampleRowStats(y);
    if (stats) bodyBaselineStats.push(stats);
  }
  const baselineLuminance = bodyBaselineStats.length > 0
    ? medianNumber(bodyBaselineStats.map((stats) => stats.luminance))
    : 0;
  const baselineSaturation = bodyBaselineStats.length > 0
    ? medianNumber(bodyBaselineStats.map((stats) => stats.saturation))
    : 0;
  const metallicRows: number[] = [];
  for (
    let y = Math.max(0, Math.round(bodyTopY - (bodyHeightPx * 0.05)));
    y <= Math.min(cropH - 1, Math.round(bodyTopY + (bodyHeightPx * 0.16)));
    y += 1
  ) {
    const stats = sampleRowStats(y);
    if (!stats) continue;
    const looksMetallic =
      stats.coverage >= 0.55 &&
      stats.saturation <= Math.max(0.18, baselineSaturation * 0.58) &&
      stats.luminance >= Math.max(110, baselineLuminance * 0.9);
    if (looksMetallic) metallicRows.push(y);
  }
  const metallicBand = findLongestYSegment(metallicRows);
  const detectedRimTopY = metallicBand ? metallicBand.start : null;
  const detectedRimBottomY = metallicBand ? metallicBand.end : null;
  const rimTopY = rimRatios
    ? clamp(bodyTopY + (rimRatios.top * bodyHeightPx), 0, cropH - 1)
    : detectedRimTopY;
  const rimBottomY = rimRatios
    ? clamp(bodyTopY + (rimRatios.bottom * bodyHeightPx), 0, cropH - 1)
    : detectedRimBottomY;

  return {
    dataUrl: cropCanvas.toDataURL("image/png"),
    width: cropW,
    height: cropH,
    bodyCenterX,
    referenceBodyWidthPx,
    referenceBandCenterY,
    bodyTopY,
    bodyBottomY: effectiveBodyBottomY,
    rimTopY,
    rimBottomY,
    bodyOutlinePath,
    bodyOutlineBounds,
    tracedBodyOutlinePath,
    handleOuterPath: handleTrace.outerPath,
    handleInnerPath: handleTrace.innerPath,
    handleSide,
    handleOuterRect: handleTrace.outerRect,
    handleInnerRect: handleTrace.innerRect,
    topOuterWidthPx,
    baseWidthPx: stagedBase.baseWidthPx,
  };
}

function estimateContourWidth(points: Array<{ x: number; y: number }>, targetY: number): number | null {
  if (points.length < 2) return null;
  let band = 2;
  while (band <= 24) {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let matches = 0;
    for (const point of points) {
      if (Math.abs(point.y - targetY) <= band) {
        if (point.x < minX) minX = point.x;
        if (point.x > maxX) maxX = point.x;
        matches += 1;
      }
    }
    if (matches >= 2 && Number.isFinite(minX) && Number.isFinite(maxX) && maxX > minX) {
      return maxX - minX;
    }
    band += 2;
  }
  return null;
}

function cropBoundsFromFitDebug(
  img: HTMLImageElement,
  fitDebug: TumblerItemLookupFitDebug | null | undefined,
): {
  dataUrl: string;
  width: number;
  height: number;
  bodyCenterX: number;
  referenceBodyWidthPx: number;
  referenceBandCenterY: number;
  bodyTopY: number;
  bodyBottomY: number;
  rimTopY: number | null;
  rimBottomY: number | null;
  bodyOutlinePath: string | null;
  bodyOutlineBounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } | null;
  tracedBodyOutlinePath: string | null;
  handleOuterPath: string | null;
  handleInnerPath: string | null;
  handleSide: "left" | "right" | null;
  handleOuterRect: { x: number; y: number; width: number; height: number } | null;
  handleInnerRect: { x: number; y: number; width: number; height: number } | null;
  topOuterWidthPx: number | null;
  baseWidthPx: number | null;
} | null {
  if (!fitDebug) return null;
  if (fitDebug.imageWidthPx <= 0 || fitDebug.imageHeightPx <= 0) return null;

  const imageAspect = img.naturalWidth / Math.max(1, img.naturalHeight);
  const fitAspect = fitDebug.imageWidthPx / Math.max(1, fitDebug.imageHeightPx);
  if (!Number.isFinite(imageAspect) || !Number.isFinite(fitAspect) || Math.abs(imageAspect - fitAspect) > 0.03) {
    return null;
  }

  const scaleX = img.naturalWidth / fitDebug.imageWidthPx;
  const scaleY = img.naturalHeight / fitDebug.imageHeightPx;
  const paddedMinX = Math.max(0, Math.floor((fitDebug.silhouetteBoundsPx.minX - 4) * scaleX));
  const paddedMaxX = Math.min(img.naturalWidth - 1, Math.ceil((fitDebug.silhouetteBoundsPx.maxX + 4) * scaleX));
  const paddedMinY = Math.max(0, Math.floor((fitDebug.silhouetteBoundsPx.minY - 4) * scaleY));
  const paddedMaxY = Math.min(img.naturalHeight - 1, Math.ceil((fitDebug.silhouetteBoundsPx.maxY + 4) * scaleY));
  const cropW = Math.max(1, paddedMaxX - paddedMinX + 1);
  const cropH = Math.max(1, paddedMaxY - paddedMinY + 1);

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = cropW;
  cropCanvas.height = cropH;
  const cropCtx = cropCanvas.getContext("2d");
  if (!cropCtx) return null;

  cropCtx.drawImage(img, paddedMinX, paddedMinY, cropW, cropH, 0, 0, cropW, cropH);
  const croppedImage = cropCtx.getImageData(0, 0, cropW, cropH);
  const measurementCenterXPx = fitDebug.measurementBandCenterXPx ?? fitDebug.centerXPx;
  const measurementBandWidthPx = fitDebug.measurementBandWidthPx ?? fitDebug.referenceBandWidthPx;
  const measurementBandCenterYPx = fitDebug.measurementBandCenterYPx ?? fitDebug.referenceBandCenterYPx;
  const bodyTopY = Math.max(0, (fitDebug.bodyTopPx * scaleY) - paddedMinY);
  const bodyBottomY = Math.min(cropH - 1, (fitDebug.bodyBottomPx * scaleY) - paddedMinY);
  const rimTopY = Math.max(0, (fitDebug.rimTopPx * scaleY) - paddedMinY);
  const rimBottomY = Math.min(cropH - 1, (fitDebug.rimBottomPx * scaleY) - paddedMinY);
  const bodyHeightPx = Math.max(1, bodyBottomY - bodyTopY);
  const centerX = (measurementCenterXPx * scaleX) - paddedMinX;
  const topOuterWidthPx = measureDominantSegmentWidthBand({
    alphaData: croppedImage.data,
    width: cropW,
    height: cropH,
    centerX,
    startY: Math.max(0, bodyTopY - Math.round(bodyHeightPx * 0.035)),
    endY: Math.min(cropH - 1, bodyTopY + Math.round(bodyHeightPx * 0.045)),
    minWidthPx: Math.max(20, measurementBandWidthPx * scaleX * 0.72),
  });
  const measuredBaseWidthPx = measureCoreWidthBand({
    alphaData: croppedImage.data,
    width: cropW,
    height: cropH,
    centerX,
    startY: Math.max(0, bodyBottomY - Math.round(bodyHeightPx * 0.12)),
    endY: Math.min(cropH - 1, bodyBottomY - Math.round(bodyHeightPx * 0.035)),
  });
  const lowerRows: LowerBodyRow[] = [];
  for (let y = Math.max(0, Math.floor(bodyTopY)); y <= Math.min(cropH - 1, Math.ceil(bodyBottomY)); y += 1) {
    const segments = findAlphaSegments(croppedImage.data, cropW, y);
    const bodySegment = segments.find((segment) => centerX >= segment.left && centerX <= segment.right);
    if (!bodySegment) continue;
    const leftHalf = centerX - bodySegment.left;
    const rightHalf = bodySegment.right - centerX;
    lowerRows.push({
      y,
      bodyLeft: bodySegment.left,
      bodyRight: bodySegment.right,
      coreWidth: Math.max(2, Math.min(leftHalf, rightHalf) * 2),
      segmentLeft: bodySegment.left,
      segmentRight: bodySegment.right,
    });
  }
  const stagedBase = deriveStagedBaseGeometry({
    rows: lowerRows,
    centerX,
    bodyTopY,
    bodyBottomY,
    bodyHeightPx,
    fallbackBaseWidthPx: measuredBaseWidthPx,
  });
  const effectiveBodyBottomY = stagedBase.flatBottomY;

  const sortedProfilePoints = [...fitDebug.profilePoints].sort((a, b) => a.yPx - b.yPx);
  const tracedProfilePoints = sortedProfilePoints
    .map((point) => ({
      leftX: ((fitDebug.centerXPx - point.radiusPx) * scaleX) - paddedMinX,
      rightX: ((fitDebug.centerXPx + point.radiusPx) * scaleX) - paddedMinX,
      y: (point.yPx * scaleY) - paddedMinY,
    }));
  const trimmedProfilePoints = sortedProfilePoints
    .map((point) => ({
      leftX: ((fitDebug.centerXPx - point.radiusPx) * scaleX) - paddedMinX,
      rightX: ((fitDebug.centerXPx + point.radiusPx) * scaleX) - paddedMinX,
      y: (point.yPx * scaleY) - paddedMinY,
    }))
    .filter((point) => point.y <= stagedBase.bevelStartY);
  const tracedBodyOutlinePath = buildClosedPath([
    ...tracedProfilePoints.map((point) => ({
      x: point.leftX,
      y: point.y,
    })),
    ...[...tracedProfilePoints].reverse().map((point) => ({
      x: point.rightX,
      y: point.y,
    })),
  ]);
  const leftPoints = [
    ...trimmedProfilePoints.map((point) => ({
      x: point.leftX,
      y: point.y,
    })),
    { x: stagedBase.bevelLeftX, y: stagedBase.bevelStartY },
    { x: stagedBase.flatBottomLeftX, y: stagedBase.flatBottomY },
  ];
  const rightPoints = [
    { x: stagedBase.flatBottomRightX, y: stagedBase.flatBottomY },
    { x: stagedBase.bevelRightX, y: stagedBase.bevelStartY },
    ...[...trimmedProfilePoints]
      .reverse()
      .map((point) => ({
        x: point.rightX,
        y: point.y,
      })),
  ];
  const outlinePoints = [...leftPoints, ...rightPoints];
  const bodyOutlinePath = outlinePoints.length >= 4
    ? `M ${outlinePoints.map((point, index) => `${index === 0 ? "" : "L "}${round1(point.x)} ${round1(point.y)}`).join(" ")} Z`
    : null;
  const bodyOutlineBounds = getBoundsFromPoints(outlinePoints);

  const handleOuterRect =
    fitDebug.handleAttachEdgePx != null &&
    fitDebug.handleOuterEdgePx != null &&
    fitDebug.handleCenterYPx != null &&
    fitDebug.handleOuterWidthPx != null &&
    fitDebug.handleOuterHeightPx != null
      ? {
          x: Math.min(
            ((fitDebug.handleAttachEdgePx ?? 0) * scaleX) - paddedMinX,
            ((fitDebug.handleOuterEdgePx ?? 0) * scaleX) - paddedMinX,
          ),
          y: (((fitDebug.handleCenterYPx ?? 0) - (fitDebug.handleOuterHeightPx ?? 0) / 2) * scaleY) - paddedMinY,
          width: Math.abs(((fitDebug.handleOuterEdgePx ?? 0) - (fitDebug.handleAttachEdgePx ?? 0)) * scaleX),
          height: Math.max(1, (fitDebug.handleOuterHeightPx ?? 0) * scaleY),
        }
      : null;
  const handleInnerRect =
    fitDebug.handleAttachEdgePx != null &&
    fitDebug.handleOuterEdgePx != null &&
    fitDebug.handleHoleTopPx != null &&
    fitDebug.handleHoleBottomPx != null &&
    fitDebug.handleBarWidthPx != null
      ? {
          x: Math.min(
            ((fitDebug.handleAttachEdgePx ?? 0) * scaleX) - paddedMinX,
            ((fitDebug.handleOuterEdgePx ?? 0) * scaleX) - paddedMinX,
          ) + Math.max(1, (fitDebug.handleBarWidthPx ?? 0) * scaleX),
          y: ((fitDebug.handleHoleTopPx ?? 0) * scaleY) - paddedMinY,
          width: Math.max(
            1,
            Math.abs(((fitDebug.handleOuterEdgePx ?? 0) - (fitDebug.handleAttachEdgePx ?? 0)) * scaleX)
              - Math.max(2, (fitDebug.handleBarWidthPx ?? 0) * scaleX * 2),
          ),
          height: Math.max(1, ((fitDebug.handleHoleBottomPx ?? 0) - (fitDebug.handleHoleTopPx ?? 0)) * scaleY),
        }
      : null;
  const fitDebugHandleSide = fitDebug.handleSide ?? (
    handleOuterRect
      ? (handleOuterRect.x >= centerX ? "right" : "left")
      : null
  );
  const handleTrace = fitDebugHandleSide
    ? buildHandleTraceFromRows({
        rows: lowerRows,
        handleSide: fitDebugHandleSide,
        handleStartY: Math.max(bodyTopY, handleOuterRect?.y ?? bodyTopY),
        handleEndY: Math.min(bodyBottomY, handleOuterRect != null ? handleOuterRect.y + handleOuterRect.height : bodyBottomY),
      })
    : {
        outerPath: null,
        innerPath: null,
        outerRect: handleOuterRect,
        innerRect: handleInnerRect,
      };

  return {
    dataUrl: cropCanvas.toDataURL("image/png"),
    width: cropW,
    height: cropH,
    bodyCenterX: centerX,
    referenceBodyWidthPx: Math.max(8, measurementBandWidthPx * scaleX),
    referenceBandCenterY: (measurementBandCenterYPx * scaleY) - paddedMinY,
    bodyTopY,
    bodyBottomY: effectiveBodyBottomY,
    rimTopY,
    rimBottomY,
    bodyOutlinePath,
    bodyOutlineBounds,
    tracedBodyOutlinePath,
    handleOuterPath: handleTrace.outerPath,
    handleInnerPath: handleTrace.innerPath,
    handleSide: fitDebugHandleSide,
    handleOuterRect: handleTrace.outerRect,
    handleInnerRect: handleTrace.innerRect,
    topOuterWidthPx,
    baseWidthPx: stagedBase.baseWidthPx,
  };
}

export function EngravableZoneEditor({
  photoDataUrl,
  overallHeightMm,
  bodyTopFromOverallMm,
  bodyBottomFromOverallMm,
  lidSeamFromOverallMm,
  silverBandBottomFromOverallMm,
  handleTopFromOverallMm,
  handleBottomFromOverallMm,
  handleReachMm,
  shoulderDiameterMm,
  taperUpperDiameterMm,
  taperLowerDiameterMm,
  bevelDiameterMm,
  diameterMm,
  bodyWrapDiameterMm,
  topOuterDiameterMm,
  baseDiameterMm,
  photoWidthScalePct,
  photoHeightScalePct,
  photoLockAspect,
  photoOffsetYPct,
  photoOffsetXPct,
  photoAnchorY,
  photoCenterMode,
  bodyColorHex,
  rimColorHex,
  fitDebug,
  outlineProfile,
  referencePaths,
  referenceLayerState,
  onChange,
  onLidSeamChange,
  onSilverBandBottomChange,
  onHandleTopChange,
  onHandleBottomChange,
  onHandleReachChange,
  onShoulderDiameterChange,
  onTaperUpperDiameterChange,
  onTaperLowerDiameterChange,
  onBevelDiameterChange,
  onPhotoWidthScaleChange,
  onPhotoHeightScaleChange,
  onPhotoLockAspectChange,
  onPhotoOffsetYChange,
  onPhotoOffsetXChange,
  onPhotoAnchorYChange,
  onPhotoCenterModeChange,
  onColorsChange,
  onBaseDiameterDerived,
  onDiameterChange,
  onTopOuterDiameterChange,
  onBaseDiameterChange,
  onOutlineProfileChange,
  onReferencePathsChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgOutlineInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState<
    | "top"
    | "bottom"
    | "lid-seam"
    | "silver-band"
    | "handle-top"
    | "handle-bottom"
    | "handle-reach"
    | "top-outer-width"
    | "body-width"
    | "base-width"
    | "shoulder-width"
    | "taper-upper-width"
    | "taper-lower-width"
    | "bevel-width"
    | null
  >(null);
  const [shapeWorkflowMode, setShapeWorkflowMode] = useState<"fit" | "refine">("fit");
  const [nodeEditMode, setNodeEditMode] = useState<"edit" | "add">("edit");
  const [showAdvancedHandles, setShowAdvancedHandles] = useState(false);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [selectedHandleType, setSelectedHandleType] = useState<"in" | "out" | null>(null);
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<number | null>(null);
  const [outlineHistory, setOutlineHistory] = useState<EditableBodyOutline[]>([]);
  const [outlineFuture, setOutlineFuture] = useState<EditableBodyOutline[]>([]);
  const [outlineDraft, setOutlineDraft] = useState<EditableBodyOutline | undefined>(
    outlineProfile ? cloneEditableBodyOutline(outlineProfile) : undefined,
  );
  const [importedOutlineSource, setImportedOutlineSource] = useState<ImportedEditableBodyOutlineSource | null>(null);
  const [outlineImportSide, setOutlineImportSide] = useState<"left" | "right">("right");
  const [outlineImportScalePct, setOutlineImportScalePct] = useState(100);
  const [outlineImportWidthPct, setOutlineImportWidthPct] = useState(100);
  const [outlineImportHeightPct, setOutlineImportHeightPct] = useState(100);
  const [outlineImportOffsetYMm, setOutlineImportOffsetYMm] = useState(0);
  const [outlineImportError, setOutlineImportError] = useState<string | null>(null);
  const [localReferencePaths, setLocalReferencePaths] = useState<ReferencePaths>(
    createReferencePaths({
      bodyOutline: referencePaths?.bodyOutline ?? outlineProfile ?? null,
      lidProfile: referencePaths?.lidProfile ?? null,
      silverProfile: referencePaths?.silverProfile ?? null,
    }),
  );
  const [localReferenceLayerState, setLocalReferenceLayerState] = useState<ReferenceLayerState>(
    cloneReferenceLayerState(referenceLayerState ?? createDefaultReferenceLayerState()),
  );
  const [outlineDragState, setOutlineDragState] = useState<{
    kind: "point" | "handle" | "segment";
    pointId?: string;
    handleType?: "in" | "out";
    segmentIndex?: number;
    startClientX: number;
    startClientY: number;
    startOutline: EditableBodyOutline;
    shiftKey: boolean;
  } | null>(null);
  const [displayPhoto, setDisplayPhoto] = useState<{
    src: string;
    w: number;
    h: number;
    bodyCenterX: number;
    referenceBodyWidthPx: number;
    referenceBandCenterY: number;
    bodyTopY: number;
    bodyBottomY: number;
    rimTopY: number | null;
    rimBottomY: number | null;
    bodyOutlinePath: string | null;
    bodyOutlineBounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } | null;
    tracedBodyOutlinePath: string | null;
    handleOuterPath: string | null;
    handleInnerPath: string | null;
    handleSide: "left" | "right" | null;
    handleOuterRect: { x: number; y: number; width: number; height: number } | null;
    handleInnerRect: { x: number; y: number; width: number; height: number } | null;
    topOuterWidthPx: number | null;
    baseWidthPx: number | null;
  } | null>(null);
  const activeDisplayPhoto = photoDataUrl ? displayPhoto : null;
  const canvasHeightPx = DEFAULT_CANVAS_HEIGHT;
  const profileEditMode = false;
  const outlineTransformMode = false;
  const showBlueprintOverlay = false;
  const showGuideLabels = false;
  const showHandleTrace = true;
  const showReadOnlyGuides = false;

  useEffect(() => {
    if (!photoDataUrl) return;

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      const sourceContour = outlineProfile?.sourceContour;
      const sourceBounds = outlineProfile?.sourceContourBounds;
      if (
        sourceContour &&
        sourceContour.length >= 3 &&
        sourceBounds &&
        sourceBounds.width > 0 &&
        sourceBounds.height > 0
      ) {
        const sourceBodyOutlinePath = buildContourSvgPath(sourceContour);
        const sourceTopWidthPx = estimateContourWidth(sourceContour, sourceBounds.minY + 4) ?? sourceBounds.width;
        const sourceBaseWidthPx = estimateContourWidth(sourceContour, sourceBounds.maxY - 4) ?? sourceBounds.width;
        if (!cancelled) {
          setDisplayPhoto({
            src: photoDataUrl,
            w: img.naturalWidth || img.width,
            h: img.naturalHeight || img.height,
            bodyCenterX: (sourceBounds.minX + sourceBounds.maxX) / 2,
            referenceBodyWidthPx: sourceBounds.width,
            referenceBandCenterY: sourceBounds.minY + (sourceBounds.height * 0.18),
            bodyTopY: sourceBounds.minY,
            bodyBottomY: sourceBounds.maxY,
            rimTopY: null,
            rimBottomY: null,
            bodyOutlinePath: sourceBodyOutlinePath,
            bodyOutlineBounds: sourceBounds,
            tracedBodyOutlinePath: sourceBodyOutlinePath,
            handleOuterPath: null,
            handleInnerPath: null,
            handleSide: null,
            handleOuterRect: null,
            handleInnerRect: null,
            topOuterWidthPx: sourceTopWidthPx,
            baseWidthPx: sourceBaseWidthPx,
          });
        }
        return;
      }

      const cropped = cropBoundsFromFitDebug(img, fitDebug) ?? cropVisibleBounds(img, fitDebug);
      if (!cancelled) {
        setDisplayPhoto({
          src: cropped.dataUrl,
          w: cropped.width,
          h: cropped.height,
          bodyCenterX: cropped.bodyCenterX,
          referenceBodyWidthPx: cropped.referenceBodyWidthPx,
          referenceBandCenterY: cropped.referenceBandCenterY,
          bodyTopY: cropped.bodyTopY,
          bodyBottomY: cropped.bodyBottomY,
          rimTopY: cropped.rimTopY,
          rimBottomY: cropped.rimBottomY,
          bodyOutlinePath: cropped.bodyOutlinePath,
          bodyOutlineBounds: cropped.bodyOutlineBounds,
          tracedBodyOutlinePath: cropped.tracedBodyOutlinePath,
          handleOuterPath: cropped.handleOuterPath,
          handleInnerPath: cropped.handleInnerPath,
          handleSide: cropped.handleSide,
          handleOuterRect: cropped.handleOuterRect,
          handleInnerRect: cropped.handleInnerRect,
          topOuterWidthPx: cropped.topOuterWidthPx,
          baseWidthPx: cropped.baseWidthPx,
        });
      }
    };
    img.onerror = () => {
      if (!cancelled) {
        setDisplayPhoto(null);
      }
    };
    img.src = photoDataUrl;

    return () => {
      cancelled = true;
    };
  }, [fitDebug, outlineProfile, photoDataUrl]);

  useEffect(() => {
    setLocalReferencePaths(createReferencePaths({
      bodyOutline: referencePaths?.bodyOutline ?? outlineProfile ?? null,
      lidProfile: referencePaths?.lidProfile ?? null,
      silverProfile: referencePaths?.silverProfile ?? null,
    }));
  }, [outlineProfile, referencePaths]);

  useEffect(() => {
    setLocalReferenceLayerState(cloneReferenceLayerState(referenceLayerState ?? createDefaultReferenceLayerState()));
  }, [referenceLayerState]);

  const activeLayer: ReferenceLayerKey = "bodyOutline";
  const activeLayerPath = localReferencePaths.bodyOutline;
  const activeLayerLocked = localReferenceLayerState.locked.bodyOutline;
  const activeLayerVisible = localReferenceLayerState.visibility.bodyOutline;

  const setReferencePathsDraft = React.useCallback((nextPaths: ReferencePaths) => {
    setLocalReferencePaths(nextPaths);
  }, []);

  const updateReferencePaths = React.useCallback((nextPaths: ReferencePaths) => {
    setLocalReferencePaths(nextPaths);
    onReferencePathsChange?.(nextPaths);
    const bodyOutline = nextPaths.bodyOutline ?? undefined;
    onOutlineProfileChange?.(bodyOutline);
  }, [onOutlineProfileChange, onReferencePathsChange]);

  const applySeedOutlineToActiveLayer = React.useCallback((args: {
    outline: EditableBodyOutline;
    source?: ImportedEditableBodyOutlineSource | null;
    enterFitMode?: boolean;
  }) => {
    setImportedOutlineSource(args.source ?? null);
    setOutlineImportScalePct(100);
    setOutlineImportWidthPct(100);
    setOutlineImportHeightPct(100);
    setOutlineImportOffsetYMm(0);
    setOutlineImportSide("right");
    setOutlineImportError(null);
    setOutlineDraft(cloneEditableBodyOutline(args.outline));
    setOutlineHistory([]);
    setOutlineFuture([]);
    setSelectedPointId(null);
    setSelectedHandleType(null);
    setSelectedSegmentIndex(null);
    setReferencePathsDraft(createReferencePaths({
      bodyOutline: args.outline,
      lidProfile: localReferencePaths.lidProfile,
      silverProfile: localReferencePaths.silverProfile,
    }));
    setShapeWorkflowMode(args.enterFitMode ?? true ? "fit" : "refine");
  }, [
    localReferencePaths.lidProfile,
    localReferencePaths.silverProfile,
    setReferencePathsDraft,
  ]);

  useEffect(() => {
    let cancelled = false;
    if (activeLayerPath) {
      queueMicrotask(() => {
        if (cancelled) return;
        setOutlineDraft(cloneEditableBodyOutline(activeLayerPath));
        setOutlineHistory([]);
        setOutlineFuture([]);
      });
      return;
    }
    if (activeLayer !== "bodyOutline") {
      queueMicrotask(() => {
        if (cancelled) return;
        setOutlineDraft(undefined);
        setOutlineHistory([]);
        setOutlineFuture([]);
      });
      return;
    }
    queueMicrotask(() => {
      if (cancelled) return;
      setOutlineDraft(undefined);
      setOutlineHistory([]);
      setOutlineFuture([]);
    });
    return () => {
      cancelled = true;
    };
  }, [
    activeLayer,
    activeLayerPath,
  ]);

  const derivedZoneGuides = React.useMemo(
    () => deriveEngravableZoneFromFitDebug({ overallHeightMm, fitDebug }),
    [fitDebug, overallHeightMm],
  );

  // Pixels per mm for this display
  const pxPerMm = canvasHeightPx / overallHeightMm;
  const clampedBodyTopFromOverallMm = clamp(bodyTopFromOverallMm, 0, Math.max(0, overallHeightMm - 10));
  const clampedBodyBottomFromOverallMm = clamp(
    bodyBottomFromOverallMm,
    clampedBodyTopFromOverallMm + 10,
    overallHeightMm,
  );
  const bodyTopPx = clampedBodyTopFromOverallMm * pxPerMm;
  const bodyBottomPx = clampedBodyBottomFromOverallMm * pxPerMm;
  const bodyBottomDeadZonePx = Math.max(0, canvasHeightPx - bodyBottomPx);
  const bodyHeightMm = round1(clampedBodyBottomFromOverallMm - clampedBodyTopFromOverallMm);
  const importedOutlinePreview = React.useMemo(
    () => (importedOutlineSource
      ? createEditableBodyOutlineFromImportedSvg({
          source: importedOutlineSource,
          overallHeightMm,
          bodyTopFromOverallMm: clampedBodyTopFromOverallMm,
          bodyBottomFromOverallMm: clampedBodyBottomFromOverallMm,
          diameterMm: topOuterDiameterMm && topOuterDiameterMm > 0 ? topOuterDiameterMm : diameterMm,
          topOuterDiameterMm: topOuterDiameterMm && topOuterDiameterMm > 0 ? topOuterDiameterMm : undefined,
          scalePct: outlineImportScalePct,
          widthScalePct: outlineImportWidthPct,
          heightScalePct: outlineImportHeightPct,
          offsetYMm: outlineImportOffsetYMm,
          side: outlineImportSide,
        })
      : undefined),
    [
      clampedBodyBottomFromOverallMm,
      clampedBodyTopFromOverallMm,
      diameterMm,
      importedOutlineSource,
      overallHeightMm,
      outlineImportHeightPct,
      outlineImportOffsetYMm,
      outlineImportScalePct,
      outlineImportSide,
      topOuterDiameterMm,
      outlineImportWidthPct,
    ],
  );
  const editableContourBoundsMm = React.useMemo(() => {
    const contour = outlineDraft?.directContour;
    if (!contour || contour.length < 3) return null;
    return getBoundsFromPoints(contour.map((point) => ({ x: point.x, y: point.y })));
  }, [outlineDraft]);
  const bodyZoneTopPx = bodyTopPx;
  const bodyZoneBottomPx = bodyBottomPx;
  const bodyZoneHeightPx = bodyZoneBottomPx - bodyZoneTopPx;
  const effectiveBodyWrapDiameterMm = bodyWrapDiameterMm && bodyWrapDiameterMm > 0
    ? bodyWrapDiameterMm
    : diameterMm;
  const derivedTopOuterDiameterMm = activeDisplayPhoto
    ? round1((
        (activeDisplayPhoto.topOuterWidthPx ?? activeDisplayPhoto.referenceBodyWidthPx)
        / Math.max(1, activeDisplayPhoto.referenceBodyWidthPx)
      ) * effectiveBodyWrapDiameterMm)
    : null;
  const derivedBaseDiameterMm = activeDisplayPhoto?.baseWidthPx
    ? round1((activeDisplayPhoto.baseWidthPx / Math.max(1, activeDisplayPhoto.referenceBodyWidthPx)) * effectiveBodyWrapDiameterMm)
    : null;
  const plausibleDerivedTopOuterDiameterMm = derivedTopOuterDiameterMm != null &&
    derivedTopOuterDiameterMm >= effectiveBodyWrapDiameterMm * 0.96 &&
    derivedTopOuterDiameterMm <= effectiveBodyWrapDiameterMm * 1.35
    ? derivedTopOuterDiameterMm
    : null;
  const plausibleDerivedBaseDiameterMm = derivedBaseDiameterMm != null &&
    derivedBaseDiameterMm >= effectiveBodyWrapDiameterMm * 0.55 &&
    derivedBaseDiameterMm <= effectiveBodyWrapDiameterMm * 0.96
    ? derivedBaseDiameterMm
    : null;
  const effectiveTopOuterDiameterMm = topOuterDiameterMm && topOuterDiameterMm > 0
    ? topOuterDiameterMm
    : (plausibleDerivedTopOuterDiameterMm && plausibleDerivedTopOuterDiameterMm > 0
      ? plausibleDerivedTopOuterDiameterMm
      : null);
  const effectiveBaseDiameterMm = baseDiameterMm && baseDiameterMm > 0
    ? baseDiameterMm
    : (plausibleDerivedBaseDiameterMm && plausibleDerivedBaseDiameterMm > 0
      ? plausibleDerivedBaseDiameterMm
      : null);
  const visualReferenceDiameterMm = effectiveTopOuterDiameterMm && effectiveTopOuterDiameterMm > 0
    ? effectiveTopOuterDiameterMm
    : diameterMm;
  const bodyWidthPx = Math.max(40, round1(visualReferenceDiameterMm * pxPerMm));
  const visualReferencePhotoWidthPx = effectiveTopOuterDiameterMm && effectiveTopOuterDiameterMm > 0
    ? (activeDisplayPhoto?.topOuterWidthPx ?? activeDisplayPhoto?.referenceBodyWidthPx ?? null)
    : (activeDisplayPhoto?.referenceBodyWidthPx ?? null);
  const topOuterWidthPx = effectiveTopOuterDiameterMm
    ? Math.max(bodyWidthPx, round1((effectiveTopOuterDiameterMm / Math.max(0.1, visualReferenceDiameterMm)) * bodyWidthPx))
    : null;
  const baseWidthPx = effectiveBaseDiameterMm
    ? Math.max(20, round1((effectiveBaseDiameterMm / Math.max(0.1, visualReferenceDiameterMm)) * bodyWidthPx))
    : null;

  useEffect(() => {
    if (!onBaseDiameterDerived || plausibleDerivedBaseDiameterMm == null) return;
    if ((baseDiameterMm ?? 0) > 0) return;
    if (Math.abs((baseDiameterMm || 0) - plausibleDerivedBaseDiameterMm) < 0.5) return;
    onBaseDiameterDerived(plausibleDerivedBaseDiameterMm);
  }, [baseDiameterMm, onBaseDiameterDerived, plausibleDerivedBaseDiameterMm]);
  const clampedPhotoWidthScalePct = Math.max(MIN_PHOTO_SCALE_PCT, Math.min(photoWidthScalePct || 100, MAX_PHOTO_SCALE_PCT));
  const clampedPhotoHeightScalePct = Math.max(MIN_PHOTO_SCALE_PCT, Math.min(photoHeightScalePct || 100, MAX_PHOTO_SCALE_PCT));
  const clampedPhotoOffsetYPct = Math.max(-MAX_PHOTO_OFFSET_Y_PCT, Math.min(photoOffsetYPct || 0, MAX_PHOTO_OFFSET_Y_PCT));
  const clampedPhotoOffsetXPct = Math.max(-MAX_PHOTO_OFFSET_X_PCT, Math.min(photoOffsetXPct || 0, MAX_PHOTO_OFFSET_X_PCT));
  const useContourAlignedPhotoFit = Boolean(
    activeDisplayPhoto?.bodyOutlineBounds &&
    editableContourBoundsMm &&
    editableContourBoundsMm.width > 0 &&
    editableContourBoundsMm.height > 0,
  );
  const contourWidthPx = editableContourBoundsMm ? editableContourBoundsMm.width * pxPerMm : null;
  const contourHeightPx = editableContourBoundsMm ? editableContourBoundsMm.height * pxPerMm : null;
  const autoWidthFitPhotoHeightPx = useContourAlignedPhotoFit && contourHeightPx != null && activeDisplayPhoto?.bodyOutlineBounds
    ? (activeDisplayPhoto.h * contourHeightPx) / Math.max(1, activeDisplayPhoto.bodyOutlineBounds.height)
    : (visualReferencePhotoWidthPx
      ? (activeDisplayPhoto!.h * bodyWidthPx) / Math.max(1, visualReferencePhotoWidthPx)
      : canvasHeightPx * VISIBLE_TUMBLER_HEIGHT_PCT);
  const tracedBodyHeightPx = activeDisplayPhoto
    ? Math.max(1, activeDisplayPhoto.bodyBottomY - activeDisplayPhoto.bodyTopY)
    : Math.max(1, canvasHeightPx * 0.84);
  const autoHeightFitPhotoHeightPx = useContourAlignedPhotoFit && contourHeightPx != null && activeDisplayPhoto?.bodyOutlineBounds
    ? (activeDisplayPhoto.h * contourHeightPx) / Math.max(1, activeDisplayPhoto.bodyOutlineBounds.height)
    : (activeDisplayPhoto
      ? (activeDisplayPhoto.h * bodyZoneHeightPx) / tracedBodyHeightPx
      : autoWidthFitPhotoHeightPx);
  const basePhotoHeightPx = Math.max(80, autoHeightFitPhotoHeightPx * BODY_REFERENCE_DISPLAY_FIT_PCT);
  const basePhotoWidthPx = useContourAlignedPhotoFit && contourWidthPx != null && activeDisplayPhoto?.bodyOutlineBounds
    ? Math.max(40, ((activeDisplayPhoto.w * contourWidthPx) / Math.max(1, activeDisplayPhoto.bodyOutlineBounds.width)) * BODY_REFERENCE_DISPLAY_FIT_PCT)
    : (activeDisplayPhoto
      ? (activeDisplayPhoto.w / activeDisplayPhoto.h) * basePhotoHeightPx
      : canvasHeightPx * 0.52);
  const maxPhotoWidthPx = basePhotoWidthPx * (MAX_PHOTO_SCALE_PCT / 100);
  const targetPhotoHeightPx = basePhotoHeightPx * (clampedPhotoHeightScalePct / 100);
  const photoWidthPx = basePhotoWidthPx * (clampedPhotoWidthScalePct / 100);
  const photoScaleXPx = activeDisplayPhoto ? photoWidthPx / Math.max(1, activeDisplayPhoto.w) : 1;
  const photoScaleYPx = activeDisplayPhoto ? targetPhotoHeightPx / Math.max(1, activeDisplayPhoto.h) : 1;
  const scaledBodyCenterX = activeDisplayPhoto
    ? (activeDisplayPhoto.bodyCenterX / activeDisplayPhoto.w) * photoWidthPx
    : photoWidthPx / 2;
  const scaledPhotoCenterX = photoWidthPx / 2;
  const scaledReferenceBandY = activeDisplayPhoto
    ? (activeDisplayPhoto.referenceBandCenterY / activeDisplayPhoto.h) * targetPhotoHeightPx
    : targetPhotoHeightPx * 0.24;
  const scaledBodyTopInPhotoPx = activeDisplayPhoto
    ? (activeDisplayPhoto.bodyTopY / activeDisplayPhoto.h) * targetPhotoHeightPx
    : targetPhotoHeightPx * 0.08;
  const scaledBodyBottomInPhotoPx = activeDisplayPhoto
    ? (activeDisplayPhoto.bodyBottomY / activeDisplayPhoto.h) * targetPhotoHeightPx
    : targetPhotoHeightPx * 0.92;
  const scaledRimTopInPhotoPx = activeDisplayPhoto?.rimTopY != null
    ? (activeDisplayPhoto.rimTopY / activeDisplayPhoto.h) * targetPhotoHeightPx
    : null;
  const scaledRimBottomInPhotoPx = activeDisplayPhoto?.rimBottomY != null
    ? (activeDisplayPhoto.rimBottomY / activeDisplayPhoto.h) * targetPhotoHeightPx
    : null;
  const contourMinXRelPx = editableContourBoundsMm ? editableContourBoundsMm.minX * pxPerMm : null;
  const contourMaxXRelPx = editableContourBoundsMm ? editableContourBoundsMm.maxX * pxPerMm : null;
  const contourMinYPx = editableContourBoundsMm ? editableContourBoundsMm.minY * pxPerMm : null;
  const contourMaxYPx = editableContourBoundsMm ? editableContourBoundsMm.maxY * pxPerMm : null;
  const contourAlignedPhotoLeftRelPx = useContourAlignedPhotoFit && activeDisplayPhoto?.bodyOutlineBounds && contourMinXRelPx != null
    ? contourMinXRelPx - (activeDisplayPhoto.bodyOutlineBounds.minX * photoScaleXPx)
    : null;
  const contourAlignedPhotoRightRelPx = useContourAlignedPhotoFit && activeDisplayPhoto?.bodyOutlineBounds && contourMaxXRelPx != null
    ? contourMaxXRelPx + ((activeDisplayPhoto.w - activeDisplayPhoto.bodyOutlineBounds.maxX) * photoScaleXPx)
    : null;
  const sideSpanPx = useContourAlignedPhotoFit && contourAlignedPhotoLeftRelPx != null && contourAlignedPhotoRightRelPx != null
    ? Math.max(
      Math.abs(contourAlignedPhotoLeftRelPx),
      Math.abs(contourAlignedPhotoRightRelPx),
      (bodyWidthPx / 2) + 16,
    )
    : Math.max(
      activeDisplayPhoto
        ? (activeDisplayPhoto.bodyCenterX / activeDisplayPhoto.w) * maxPhotoWidthPx
        : maxPhotoWidthPx / 2,
      activeDisplayPhoto
        ? maxPhotoWidthPx - ((activeDisplayPhoto.bodyCenterX / activeDisplayPhoto.w) * maxPhotoWidthPx)
        : maxPhotoWidthPx / 2,
    );
  const containerWidthPx = Math.max(Math.ceil(sideSpanPx * 2 + 32), bodyWidthPx + 96);
  const bodyCenterLinePx = Math.round(containerWidthPx / 2);
  const bodyLeftPx = Math.round(bodyCenterLinePx - bodyWidthPx / 2);
  const centeringAnchorX = photoCenterMode === "photo" ? scaledPhotoCenterX : scaledBodyCenterX;
  const photoLeftPx = useContourAlignedPhotoFit && contourAlignedPhotoLeftRelPx != null
    ? Math.round(
      bodyCenterLinePx
      + contourAlignedPhotoLeftRelPx
      + (clampedPhotoOffsetXPct / 100) * containerWidthPx,
    )
    : Math.round(
      bodyCenterLinePx
      - centeringAnchorX
      + (clampedPhotoOffsetXPct / 100) * containerWidthPx,
    );
  const bodyCenterInPhotoPx = (scaledBodyTopInPhotoPx + scaledBodyBottomInPhotoPx) / 2;
  const targetBodyCenterPx = (bodyZoneTopPx + bodyZoneBottomPx) / 2;
  const basePhotoTopPx = useContourAlignedPhotoFit && activeDisplayPhoto?.bodyOutlineBounds && contourMinYPx != null && contourMaxYPx != null
    ? (
      photoAnchorY === "bottom"
        ? contourMaxYPx - (activeDisplayPhoto.bodyOutlineBounds.maxY * photoScaleYPx)
        : contourMinYPx - (activeDisplayPhoto.bodyOutlineBounds.minY * photoScaleYPx)
    )
    : (
      photoAnchorY === "bottom"
        ? bodyZoneBottomPx - scaledBodyBottomInPhotoPx
        : targetBodyCenterPx - bodyCenterInPhotoPx
    );
  const photoTopPx = Math.round(basePhotoTopPx + (clampedPhotoOffsetYPct / 100) * canvasHeightPx);
  const referenceBandGuideTopPx = Math.round(photoTopPx + scaledReferenceBandY);
  const derivedLidSeamGuidePx = scaledRimTopInPhotoPx != null ? Math.round(photoTopPx + scaledRimTopInPhotoPx) : null;
  const derivedSilverBandGuidePx = scaledRimBottomInPhotoPx != null ? Math.round(photoTopPx + scaledRimBottomInPhotoPx) : null;
  const effectiveLidSeamGuideMm = typeof lidSeamFromOverallMm === "number" && Number.isFinite(lidSeamFromOverallMm)
    ? clamp(lidSeamFromOverallMm, 0, overallHeightMm)
    : (derivedLidSeamGuidePx != null ? round1(derivedLidSeamGuidePx / pxPerMm) : null);
  const minimumSilverBandBottomMm = Math.max(
    clampedBodyTopFromOverallMm + 2,
    effectiveLidSeamGuideMm != null ? effectiveLidSeamGuideMm + 1 : clampedBodyTopFromOverallMm + 2,
  );
  const effectiveSilverBandGuideMm = typeof silverBandBottomFromOverallMm === "number" && Number.isFinite(silverBandBottomFromOverallMm)
    ? clamp(silverBandBottomFromOverallMm, minimumSilverBandBottomMm, clampedBodyBottomFromOverallMm)
    : (derivedSilverBandGuidePx != null ? round1(clamp(derivedSilverBandGuidePx / pxPerMm, minimumSilverBandBottomMm, clampedBodyBottomFromOverallMm)) : null);
  const scaledHandleOuterRect = activeDisplayPhoto?.handleOuterRect
    ? {
        x: photoLeftPx + ((activeDisplayPhoto.handleOuterRect.x / activeDisplayPhoto.w) * photoWidthPx),
        y: photoTopPx + ((activeDisplayPhoto.handleOuterRect.y / activeDisplayPhoto.h) * targetPhotoHeightPx),
        width: (activeDisplayPhoto.handleOuterRect.width / activeDisplayPhoto.w) * photoWidthPx,
        height: (activeDisplayPhoto.handleOuterRect.height / activeDisplayPhoto.h) * targetPhotoHeightPx,
      }
    : null;
  const defaultHandleTopMm = scaledHandleOuterRect ? round1(scaledHandleOuterRect.y / pxPerMm) : null;
  const defaultHandleBottomMm = scaledHandleOuterRect
    ? round1((scaledHandleOuterRect.y + scaledHandleOuterRect.height) / pxPerMm)
    : null;
  const defaultHandleReachMm = scaledHandleOuterRect && activeDisplayPhoto?.handleSide
    ? round1(
        Math.max(
          0,
          activeDisplayPhoto.handleSide === "right"
            ? ((scaledHandleOuterRect.x + scaledHandleOuterRect.width) - (bodyLeftPx + bodyWidthPx)) / pxPerMm
            : (bodyLeftPx - scaledHandleOuterRect.x) / pxPerMm,
        ),
      )
    : null;
  const effectiveHandleTopMm = typeof handleTopFromOverallMm === "number" && Number.isFinite(handleTopFromOverallMm)
    ? clamp(handleTopFromOverallMm, 0, overallHeightMm)
    : defaultHandleTopMm;
  const effectiveHandleBottomMm = typeof handleBottomFromOverallMm === "number" && Number.isFinite(handleBottomFromOverallMm)
    ? clamp(handleBottomFromOverallMm, effectiveHandleTopMm ?? 0, overallHeightMm)
    : defaultHandleBottomMm;
  const effectiveHandleReachMm = typeof handleReachMm === "number" && Number.isFinite(handleReachMm)
    ? Math.max(0, handleReachMm)
    : defaultHandleReachMm;
  const handleTopGuidePx = effectiveHandleTopMm != null ? effectiveHandleTopMm * pxPerMm : null;
  const handleBottomGuidePx = effectiveHandleBottomMm != null ? effectiveHandleBottomMm * pxPerMm : null;
  const handleReachPx = effectiveHandleReachMm != null ? effectiveHandleReachMm * pxPerMm : null;
  const transformedHandleOuterRect = scaledHandleOuterRect && activeDisplayPhoto?.handleSide && handleTopGuidePx != null && handleBottomGuidePx != null && handleReachPx != null
    ? (() => {
        const attachX = activeDisplayPhoto.handleSide === "right"
          ? bodyLeftPx + bodyWidthPx
          : bodyLeftPx;
        const outerX = activeDisplayPhoto.handleSide === "right"
          ? attachX + handleReachPx
          : attachX - handleReachPx;
        return {
          x: Math.min(attachX, outerX),
          y: handleTopGuidePx,
          width: Math.abs(outerX - attachX),
          height: Math.max(8, handleBottomGuidePx - handleTopGuidePx),
        };
      })()
    : scaledHandleOuterRect;
  const handlePathTransform = activeDisplayPhoto?.handleOuterRect && transformedHandleOuterRect
    ? (() => {
        const sx = transformedHandleOuterRect.width / Math.max(1, activeDisplayPhoto.handleOuterRect.width);
        const sy = transformedHandleOuterRect.height / Math.max(1, activeDisplayPhoto.handleOuterRect.height);
        const tx = transformedHandleOuterRect.x - (activeDisplayPhoto.handleOuterRect.x * sx);
        const ty = transformedHandleOuterRect.y - (activeDisplayPhoto.handleOuterRect.y * sy);
        return `matrix(${round1(sx)} 0 0 ${round1(sy)} ${round1(tx)} ${round1(ty)})`;
      })()
    : undefined;
  const straightWallBottomPx = derivedZoneGuides?.straightWallBottomYFromTopMm != null
    ? derivedZoneGuides.straightWallBottomYFromTopMm * pxPerMm
    : null;
  const rimTopGuidePx = effectiveLidSeamGuideMm != null
    ? Math.round(effectiveLidSeamGuideMm * pxPerMm)
    : null;
  const rimBottomGuidePx = effectiveSilverBandGuideMm != null
    ? Math.round(effectiveSilverBandGuideMm * pxPerMm)
    : null;
  const overlayRimTopY = activeDisplayPhoto && rimTopGuidePx != null
    ? clamp(((rimTopGuidePx - photoTopPx) / Math.max(1, targetPhotoHeightPx)) * activeDisplayPhoto.h, 0, activeDisplayPhoto.h)
    : null;
  const overlayRimBottomY = activeDisplayPhoto && rimBottomGuidePx != null
    ? clamp(((rimBottomGuidePx - photoTopPx) / Math.max(1, targetPhotoHeightPx)) * activeDisplayPhoto.h, 0, activeDisplayPhoto.h)
    : null;
  const overlayBodyTopY = activeDisplayPhoto
    ? clamp(((bodyZoneTopPx - photoTopPx) / Math.max(1, targetPhotoHeightPx)) * activeDisplayPhoto.h, 0, activeDisplayPhoto.h)
    : null;
  const overlayBodyBottomY = activeDisplayPhoto
    ? clamp(((bodyZoneBottomPx - photoTopPx) / Math.max(1, targetPhotoHeightPx)) * activeDisplayPhoto.h, 0, activeDisplayPhoto.h)
    : null;
  const overlayStraightWallBottomY = activeDisplayPhoto && straightWallBottomPx != null
    ? clamp(((straightWallBottomPx - photoTopPx) / Math.max(1, targetPhotoHeightPx)) * activeDisplayPhoto.h, 0, activeDisplayPhoto.h)
    : null;
  const overlayBaseWidthPx = activeDisplayPhoto
    ? Math.max(
        8,
        effectiveBaseDiameterMm
          ? (effectiveBaseDiameterMm / Math.max(0.1, visualReferenceDiameterMm)) * activeDisplayPhoto.referenceBodyWidthPx
          : (activeDisplayPhoto.baseWidthPx ?? activeDisplayPhoto.referenceBodyWidthPx * 0.84),
      )
    : null;
  const effectiveShoulderDiameterMm = typeof shoulderDiameterMm === "number" && Number.isFinite(shoulderDiameterMm)
    ? clamp(
        shoulderDiameterMm,
        Math.max(effectiveBaseDiameterMm ?? 20, 20),
        Math.max(effectiveBodyWrapDiameterMm, effectiveTopOuterDiameterMm ?? effectiveBodyWrapDiameterMm),
      )
    : effectiveBodyWrapDiameterMm;
  const overlayShoulderWidthPx = activeDisplayPhoto
    ? Math.max(
        8,
        (effectiveShoulderDiameterMm / Math.max(0.1, visualReferenceDiameterMm)) * activeDisplayPhoto.referenceBodyWidthPx,
      )
    : null;
  const effectiveTaperUpperDiameterMm = typeof taperUpperDiameterMm === "number" && Number.isFinite(taperUpperDiameterMm)
    ? clamp(taperUpperDiameterMm, Math.max(effectiveBaseDiameterMm ?? 20, 20), effectiveShoulderDiameterMm)
    : round1(lerp(effectiveShoulderDiameterMm, effectiveBaseDiameterMm ?? effectiveShoulderDiameterMm, 0.28));
  const effectiveTaperLowerDiameterMm = typeof taperLowerDiameterMm === "number" && Number.isFinite(taperLowerDiameterMm)
    ? clamp(taperLowerDiameterMm, Math.max(effectiveBaseDiameterMm ?? 20, 20), effectiveTaperUpperDiameterMm)
    : round1(lerp(effectiveShoulderDiameterMm, effectiveBaseDiameterMm ?? effectiveShoulderDiameterMm, 0.82));
  const effectiveBevelDiameterMm = typeof bevelDiameterMm === "number" && Number.isFinite(bevelDiameterMm)
    ? clamp(bevelDiameterMm, Math.max(effectiveBaseDiameterMm ?? 20, 20), effectiveTaperLowerDiameterMm)
    : round1(effectiveBaseDiameterMm ?? effectiveTaperLowerDiameterMm);
  const overlayTaperUpperWidthPx = activeDisplayPhoto
    ? Math.max(8, (effectiveTaperUpperDiameterMm / Math.max(0.1, visualReferenceDiameterMm)) * activeDisplayPhoto.referenceBodyWidthPx)
    : null;
  const overlayTaperLowerWidthPx = activeDisplayPhoto
    ? Math.max(8, (effectiveTaperLowerDiameterMm / Math.max(0.1, visualReferenceDiameterMm)) * activeDisplayPhoto.referenceBodyWidthPx)
    : null;
  const overlayBevelWidthPx = activeDisplayPhoto
    ? Math.max(8, (effectiveBevelDiameterMm / Math.max(0.1, visualReferenceDiameterMm)) * activeDisplayPhoto.referenceBodyWidthPx)
    : null;
  const correctedBodyOverlay = activeDisplayPhoto &&
    overlayBodyTopY != null &&
    overlayBodyBottomY != null &&
    overlayBaseWidthPx != null
      ? buildMeasuredBodyOverlay({
          centerX: activeDisplayPhoto.bodyCenterX,
          bodyTopY: overlayBodyTopY,
          bodyBottomY: overlayBodyBottomY,
          straightWallBottomY: overlayStraightWallBottomY,
          bodyWidthPx: activeDisplayPhoto.referenceBodyWidthPx,
          shoulderWidthPx: overlayShoulderWidthPx,
          taperUpperWidthPx: overlayTaperUpperWidthPx,
          taperLowerWidthPx: overlayTaperLowerWidthPx,
          bevelWidthPx: overlayBevelWidthPx,
          baseWidthPx: overlayBaseWidthPx,
          viewWidth: activeDisplayPhoto.w,
          viewHeight: activeDisplayPhoto.h,
        })
      : null;

  const editableOutline = outlineDraft;
  const sortedEditablePoints = React.useMemo(
    () => (editableOutline ? sortEditableOutlinePoints(editableOutline.points) : []),
    [editableOutline],
  );
  const editableOutlinePath = React.useMemo(
    () => {
      if (!editableOutline) return null;
      return buildDirectContourSvgPath({
        outline: editableOutline,
        centerXPx: bodyCenterLinePx,
        pxPerMm,
      }) || buildMirroredOutlineSvgPath({
        outline: editableOutline,
        centerXPx: bodyCenterLinePx,
        pxPerMm,
      });
    },
    [bodyCenterLinePx, editableOutline, pxPerMm],
  );
  const hasSourceContourPreview = Boolean(
    activeDisplayPhoto?.bodyOutlinePath &&
    editableOutline?.sourceContour &&
    editableOutline.sourceContour.length >= 3,
  );
  const readOnlyPreviewOutlinePath = hasSourceContourPreview
    ? (activeDisplayPhoto?.bodyOutlinePath ?? null)
    : (correctedBodyOverlay?.outlinePath ?? activeDisplayPhoto?.bodyOutlinePath ?? null);
  const showLegacyMeasuredFallback = false;
  const useEditableOutlinePreview = !profileEditMode && !hasSourceContourPreview && (Boolean(editableOutlinePath) || !showLegacyMeasuredFallback);
  const showFallbackEditableOutlinePreview = !profileEditMode
    && !activeDisplayPhoto?.bodyOutlinePath
    && Boolean(editableOutlinePath);
  const selectedPoint = React.useMemo(
    () => sortedEditablePoints.find((point) => point.id === selectedPointId) ?? null,
    [selectedPointId, sortedEditablePoints],
  );

  useEffect(() => {
    if (!outlineTransformMode || !importedOutlinePreview) return;
    setOutlineDraft(cloneEditableBodyOutline(importedOutlinePreview));
  }, [importedOutlinePreview, outlineTransformMode]);

  const commitOutlineChange = React.useCallback((nextOutline: EditableBodyOutline) => {
    if (!editableOutline) {
      setOutlineDraft(nextOutline);
      return;
    }
    setOutlineHistory((current) => [...current, cloneEditableBodyOutline(editableOutline)!].slice(-40));
    setOutlineFuture([]);
    setOutlineDraft(nextOutline);
    setReferencePathsDraft(createReferencePaths({
      bodyOutline: nextOutline,
      lidProfile: localReferencePaths.lidProfile,
      silverProfile: localReferencePaths.silverProfile,
    }));
  }, [editableOutline, localReferencePaths.lidProfile, localReferencePaths.silverProfile, setReferencePathsDraft]);

  const applyOutlineDraft = React.useCallback(() => {
    if (!editableOutline) return;
    if (activeLayer === "bodyOutline") {
      const derived = deriveDimensionsFromEditableBodyOutline(editableOutline);
      if (typeof derived.bodyTopFromOverallMm === "number" && typeof derived.bodyBottomFromOverallMm === "number") {
        onChange(derived.bodyTopFromOverallMm, derived.bodyBottomFromOverallMm);
      }
      if (typeof derived.diameterMm === "number") {
        onDiameterChange?.(derived.diameterMm);
      }
      if (typeof derived.topOuterDiameterMm === "number") {
        onTopOuterDiameterChange?.(derived.topOuterDiameterMm);
      }
      if (typeof derived.baseDiameterMm === "number") {
        onBaseDiameterChange?.(derived.baseDiameterMm);
      }
      if (typeof derived.shoulderDiameterMm === "number") {
        onShoulderDiameterChange?.(derived.shoulderDiameterMm);
      }
      if (typeof derived.taperUpperDiameterMm === "number") {
        onTaperUpperDiameterChange?.(derived.taperUpperDiameterMm);
      }
      if (typeof derived.taperLowerDiameterMm === "number") {
        onTaperLowerDiameterChange?.(derived.taperLowerDiameterMm);
      }
      if (typeof derived.bevelDiameterMm === "number") {
        onBevelDiameterChange?.(derived.bevelDiameterMm);
      }
    }
    updateReferencePaths(createReferencePaths({
      bodyOutline: editableOutline,
      lidProfile: localReferencePaths.lidProfile,
      silverProfile: localReferencePaths.silverProfile,
    }));
    setShapeWorkflowMode("refine");
  }, [
    editableOutline,
    localReferencePaths.lidProfile,
    localReferencePaths.silverProfile,
    onBaseDiameterChange,
    onBevelDiameterChange,
    onChange,
    onDiameterChange,
    onShoulderDiameterChange,
    onTaperLowerDiameterChange,
    onTaperUpperDiameterChange,
    onTopOuterDiameterChange,
    updateReferencePaths,
  ]);
  const topOuterLeftPx = topOuterWidthPx != null
    ? Math.round(bodyCenterLinePx - topOuterWidthPx / 2)
    : bodyLeftPx;
  const topOuterRightPx = topOuterWidthPx != null
    ? Math.round(bodyCenterLinePx + topOuterWidthPx / 2)
    : Math.round(bodyLeftPx + bodyWidthPx);
  const baseLeftPx = baseWidthPx != null
    ? Math.round(bodyCenterLinePx - baseWidthPx / 2)
    : bodyLeftPx;
  const baseRightPx = baseWidthPx != null
    ? Math.round(bodyCenterLinePx + baseWidthPx / 2)
    : Math.round(bodyLeftPx + bodyWidthPx);
  const photoWidthMm = round1(photoWidthPx / pxPerMm);
  const photoHeightMm = round1(targetPhotoHeightPx / pxPerMm);
  const basePhotoWidthMm = Math.max(0.1, round1(basePhotoWidthPx / pxPerMm));
  const basePhotoHeightMm = Math.max(0.1, round1(basePhotoHeightPx / pxPerMm));
  const verticalDimensionLeftX = Math.max(12, bodyLeftPx - 20);
  const verticalDimensionRightX = Math.min(containerWidthPx - 12, Math.round(bodyLeftPx + bodyWidthPx + 20));
  const topDiameterLineY = Math.max(12, Math.round(bodyTopPx - 20));
  const bodyDiameterLineY = clamp(Math.round(referenceBandGuideTopPx + 16), 22, canvasHeightPx - 24);
  const effectiveShoulderWidthPx = Math.max(
    baseWidthPx ?? bodyWidthPx,
    Math.min(bodyWidthPx, round1((effectiveShoulderDiameterMm / Math.max(0.1, visualReferenceDiameterMm)) * bodyWidthPx)),
  );
  const shoulderLeftPx = Math.round(bodyCenterLinePx - effectiveShoulderWidthPx / 2);
  const shoulderRightPx = Math.round(bodyCenterLinePx + effectiveShoulderWidthPx / 2);
  const taperUpperWidthPx = Math.max(
    baseWidthPx ?? bodyWidthPx,
    Math.min(effectiveShoulderWidthPx, round1((effectiveTaperUpperDiameterMm / Math.max(0.1, visualReferenceDiameterMm)) * bodyWidthPx)),
  );
  const taperUpperLeftPx = Math.round(bodyCenterLinePx - taperUpperWidthPx / 2);
  const taperUpperRightPx = Math.round(bodyCenterLinePx + taperUpperWidthPx / 2);
  const taperLowerWidthPx = Math.max(
    baseWidthPx ?? bodyWidthPx,
    Math.min(taperUpperWidthPx, round1((effectiveTaperLowerDiameterMm / Math.max(0.1, visualReferenceDiameterMm)) * bodyWidthPx)),
  );
  const taperLowerLeftPx = Math.round(bodyCenterLinePx - taperLowerWidthPx / 2);
  const taperLowerRightPx = Math.round(bodyCenterLinePx + taperLowerWidthPx / 2);
  const bevelWidthPxEffective = Math.max(
    baseWidthPx ?? bodyWidthPx,
    Math.min(taperLowerWidthPx, round1((effectiveBevelDiameterMm / Math.max(0.1, visualReferenceDiameterMm)) * bodyWidthPx)),
  );
  const bevelLeftPx = Math.round(bodyCenterLinePx - bevelWidthPxEffective / 2);
  const bevelRightPx = Math.round(bodyCenterLinePx + bevelWidthPxEffective / 2);

  const applyDragAtClientPoint = (clientX: number, clientY: number) => {
    if (!dragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const yInContainer = clientY - rect.top;
    const mm = yInContainer / pxPerMm;

    if (dragging === "top") {
      const clamped = clamp(mm, MIN_MARGIN_MM, clampedBodyBottomFromOverallMm - 10);
      onChange(round1(clamped), clampedBodyBottomFromOverallMm);
      return;
    }
    if (dragging === "bottom") {
      const clamped = clamp(mm, clampedBodyTopFromOverallMm + 10, overallHeightMm);
      onChange(clampedBodyTopFromOverallMm, round1(clamped));
      return;
    }
    if (dragging === "lid-seam" && onLidSeamChange) {
      const maxMm = Math.min(
        clampedBodyTopFromOverallMm + 28,
        (effectiveSilverBandGuideMm ?? clampedBodyBottomFromOverallMm) - 1,
      );
      const clamped = clamp(mm, 0, Math.max(0, maxMm));
      onLidSeamChange(round1(clamped));
      return;
    }
    if (dragging === "silver-band" && onSilverBandBottomChange) {
      const minMm = Math.max(
        clampedBodyTopFromOverallMm + 2,
        (effectiveLidSeamGuideMm ?? clampedBodyTopFromOverallMm) + 1,
      );
      const clamped = clamp(mm, minMm, clampedBodyBottomFromOverallMm);
      onSilverBandBottomChange(round1(clamped));
      return;
    }
    if (dragging === "handle-top" && onHandleTopChange) {
      const maxMm = Math.max(0, (effectiveHandleBottomMm ?? clampedBodyBottomFromOverallMm) - 8);
      onHandleTopChange(round1(clamp(mm, 0, maxMm)));
      return;
    }
    if (dragging === "handle-bottom" && onHandleBottomChange) {
      const minMm = Math.max(0, (effectiveHandleTopMm ?? 0) + 8);
      onHandleBottomChange(round1(clamp(mm, minMm, overallHeightMm)));
      return;
    }
    if (dragging === "handle-reach" && onHandleReachChange && containerRef.current) {
      const xInContainer = clientX - rect.left;
      const side = activeDisplayPhoto?.handleSide ?? "right";
      const nextReachPx = side === "right"
        ? xInContainer - (bodyLeftPx + bodyWidthPx)
        : bodyLeftPx - xInContainer;
      onHandleReachChange(round1(Math.max(0, nextReachPx / pxPerMm)));
      return;
    }
    if (dragging === "body-width" && onDiameterChange) {
      const xInContainer = clientX - rect.left;
      const halfWidthPx = Math.max(8, Math.abs(xInContainer - bodyCenterLinePx));
      onDiameterChange(Math.max(20, round1((halfWidthPx * 2) / pxPerMm)));
      return;
    }
    if (dragging === "top-outer-width" && onTopOuterDiameterChange) {
      const xInContainer = clientX - rect.left;
      const halfWidthPx = Math.max(bodyWidthPx / 2, Math.abs(xInContainer - bodyCenterLinePx));
      onTopOuterDiameterChange(Math.max(effectiveBodyWrapDiameterMm, round1((halfWidthPx * 2) / pxPerMm)));
      return;
    }
    if (dragging === "base-width" && onBaseDiameterChange) {
      const xInContainer = clientX - rect.left;
      const halfWidthPx = Math.max(6, Math.abs(xInContainer - bodyCenterLinePx));
      onBaseDiameterChange(clamp(round1((halfWidthPx * 2) / pxPerMm), 20, Math.max(20, diameterMm)));
      return;
    }
    if (dragging === "shoulder-width" && onShoulderDiameterChange) {
      const xInContainer = clientX - rect.left;
      const halfWidthPx = Math.max(6, Math.abs(xInContainer - bodyCenterLinePx));
      onShoulderDiameterChange(clamp(
        round1((halfWidthPx * 2) / pxPerMm),
        Math.max(effectiveBaseDiameterMm ?? 20, 20),
        Math.max(effectiveBodyWrapDiameterMm, effectiveTopOuterDiameterMm ?? effectiveBodyWrapDiameterMm),
      ));
      return;
    }
    if (dragging === "taper-upper-width" && onTaperUpperDiameterChange) {
      const xInContainer = clientX - rect.left;
      const halfWidthPx = Math.max(6, Math.abs(xInContainer - bodyCenterLinePx));
      onTaperUpperDiameterChange(clamp(
        round1((halfWidthPx * 2) / pxPerMm),
        Math.max(effectiveBaseDiameterMm ?? 20, 20),
        effectiveShoulderDiameterMm,
      ));
      return;
    }
    if (dragging === "taper-lower-width" && onTaperLowerDiameterChange) {
      const xInContainer = clientX - rect.left;
      const halfWidthPx = Math.max(6, Math.abs(xInContainer - bodyCenterLinePx));
      onTaperLowerDiameterChange(clamp(
        round1((halfWidthPx * 2) / pxPerMm),
        Math.max(effectiveBaseDiameterMm ?? 20, 20),
        effectiveTaperUpperDiameterMm,
      ));
      return;
    }
    if (dragging === "bevel-width" && onBevelDiameterChange) {
      const xInContainer = clientX - rect.left;
      const halfWidthPx = Math.max(6, Math.abs(xInContainer - bodyCenterLinePx));
      onBevelDiameterChange(clamp(
        round1((halfWidthPx * 2) / pxPerMm),
        Math.max(effectiveBaseDiameterMm ?? 20, 20),
        effectiveTaperLowerDiameterMm,
      ));
    }
  };

  const handlePointerDown = (
    line:
      | "top"
      | "bottom"
      | "lid-seam"
      | "silver-band"
      | "handle-top"
      | "handle-bottom"
      | "handle-reach"
      | "top-outer-width"
      | "body-width"
      | "base-width"
      | "shoulder-width"
      | "taper-upper-width"
      | "taper-lower-width"
      | "bevel-width"
  ) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(line);
    applyDragAtClientPoint(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    applyDragAtClientPoint(e.clientX, e.clientY);
  };

  const handlePointerUp = () => {
    setDragging(null);
  };

  const getOutlinePointClientPosition = React.useCallback((point: EditableBodyOutlinePoint) => ({
    x: bodyCenterLinePx + (point.x * pxPerMm),
    y: point.y * pxPerMm,
  }), [bodyCenterLinePx, pxPerMm]);

  const startOutlinePointDrag = (pointId: string) => (event: React.PointerEvent) => {
    if (!editableOutline || activeLayerLocked || !activeLayerVisible) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedPointId(pointId);
    setSelectedHandleType(null);
    setSelectedSegmentIndex(null);
    setOutlineDragState({
      kind: "point",
      pointId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOutline: cloneEditableBodyOutline(editableOutline)!,
      shiftKey: event.shiftKey,
    });
  };

  const startOutlineHandleDrag = (pointId: string, handleType: "in" | "out") => (event: React.PointerEvent) => {
    if (!editableOutline || activeLayerLocked || !activeLayerVisible) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedPointId(pointId);
    setSelectedHandleType(handleType);
    setSelectedSegmentIndex(null);
    setOutlineDragState({
      kind: "handle",
      pointId,
      handleType,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOutline: cloneEditableBodyOutline(editableOutline)!,
      shiftKey: event.shiftKey,
    });
  };

  const startOutlineSegmentDrag = (segmentIndex: number) => (event: React.PointerEvent) => {
    if (!editableOutline || nodeEditMode !== "edit" || activeLayerLocked || !activeLayerVisible) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedSegmentIndex(segmentIndex);
    setSelectedPointId(null);
    setSelectedHandleType(null);
    setOutlineDragState({
      kind: "segment",
      segmentIndex,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOutline: cloneEditableBodyOutline(editableOutline)!,
      shiftKey: event.shiftKey,
    });
  };

  const handleSegmentClick = (segmentIndex: number) => (event: React.MouseEvent) => {
    if (!editableOutline || activeLayerLocked || !activeLayerVisible) return;
    event.preventDefault();
    event.stopPropagation();
    if (nodeEditMode !== "add") {
      setSelectedSegmentIndex(segmentIndex);
      return;
    }
    const nextOutline = insertEditableOutlinePoint(editableOutline, segmentIndex);
    commitOutlineChange(nextOutline);
    const nextPoint = sortEditableOutlinePoints(nextOutline.points)[segmentIndex + 1];
    setSelectedPointId(nextPoint?.id ?? null);
    setNodeEditMode("edit");
  };

  const handleDeleteSelectedPoint = React.useCallback(() => {
    if (!editableOutline || !selectedPointId) return;
    const nextOutline = removeEditableOutlinePoint(editableOutline, selectedPointId);
    if (nextOutline === editableOutline) return;
    commitOutlineChange(nextOutline);
    setSelectedPointId(null);
    setSelectedHandleType(null);
  }, [commitOutlineChange, editableOutline, selectedPointId]);

  const handleConvertSelectedPoint = React.useCallback((pointType: "corner" | "smooth") => {
    if (!editableOutline || !selectedPointId) return;
    const nextOutline = convertEditableOutlinePointType(editableOutline, selectedPointId, pointType);
    commitOutlineChange(nextOutline);
  }, [commitOutlineChange, editableOutline, selectedPointId]);

  const handleConvertPoint = React.useCallback((pointId: string, pointType: "corner" | "smooth") => {
    if (!editableOutline) return;
    const nextOutline = convertEditableOutlinePointType(editableOutline, pointId, pointType);
    commitOutlineChange(nextOutline);
    setSelectedPointId(pointId);
  }, [commitOutlineChange, editableOutline]);

  const handleResetOutline = () => {
    if (importedOutlineSource) {
      setOutlineImportScalePct(100);
      setOutlineImportWidthPct(100);
      setOutlineImportHeightPct(100);
      setOutlineImportOffsetYMm(0);
      setOutlineImportSide("right");
      const seeded = createEditableBodyOutlineFromImportedSvg({
        source: importedOutlineSource,
        overallHeightMm,
        bodyTopFromOverallMm: clampedBodyTopFromOverallMm,
        bodyBottomFromOverallMm: clampedBodyBottomFromOverallMm,
        diameterMm: effectiveTopOuterDiameterMm && effectiveTopOuterDiameterMm > 0 ? effectiveTopOuterDiameterMm : diameterMm,
        topOuterDiameterMm: effectiveTopOuterDiameterMm,
        side: "right",
      });
      commitOutlineChange(seeded);
      setSelectedPointId(null);
      setSelectedHandleType(null);
      setSelectedSegmentIndex(null);
      return;
    }
    const seeded = createEditableBodyOutline({
      overallHeightMm,
      bodyTopFromOverallMm: clampedBodyTopFromOverallMm,
      bodyBottomFromOverallMm: clampedBodyBottomFromOverallMm,
      diameterMm,
      topOuterDiameterMm: effectiveTopOuterDiameterMm,
      baseDiameterMm: effectiveBaseDiameterMm,
      shoulderDiameterMm: effectiveShoulderDiameterMm,
      taperUpperDiameterMm: effectiveTaperUpperDiameterMm,
      taperLowerDiameterMm: effectiveTaperLowerDiameterMm,
      bevelDiameterMm: effectiveBevelDiameterMm,
      fitDebug,
    });
    commitOutlineChange(seeded);
    setSelectedPointId(null);
    setSelectedHandleType(null);
    setSelectedSegmentIndex(null);
  };

  const handleUndoOutline = React.useCallback(() => {
    if (outlineHistory.length === 0 || !editableOutline) return;
    const previous = outlineHistory[outlineHistory.length - 1]!;
    setOutlineFuture((current) => [cloneEditableBodyOutline(editableOutline)!, ...current].slice(0, 40));
    setOutlineHistory((current) => current.slice(0, -1));
    setOutlineDraft(cloneEditableBodyOutline(previous));
    setReferencePathsDraft(createReferencePaths({
      bodyOutline: previous,
      lidProfile: localReferencePaths.lidProfile,
      silverProfile: localReferencePaths.silverProfile,
    }));
  }, [editableOutline, localReferencePaths.lidProfile, localReferencePaths.silverProfile, outlineHistory, setReferencePathsDraft]);

  const handleRedoOutline = React.useCallback(() => {
    if (outlineFuture.length === 0 || !editableOutline) return;
    const [next, ...rest] = outlineFuture;
    if (!next) return;
    setOutlineHistory((current) => [...current, cloneEditableBodyOutline(editableOutline)!].slice(-40));
    setOutlineFuture(rest);
    setOutlineDraft(cloneEditableBodyOutline(next));
    setReferencePathsDraft(createReferencePaths({
      bodyOutline: next,
      lidProfile: localReferencePaths.lidProfile,
      silverProfile: localReferencePaths.silverProfile,
    }));
  }, [editableOutline, localReferencePaths.lidProfile, localReferencePaths.silverProfile, outlineFuture, setReferencePathsDraft]);

  const handleSvgOutlineFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const svgText = await file.text();
      const { source, outline } = createEditableBodyOutlineFromSeedSvgText({
        svgText,
        overallHeightMm,
        bodyTopFromOverallMm: clampedBodyTopFromOverallMm,
        bodyBottomFromOverallMm: clampedBodyBottomFromOverallMm,
        diameterMm: effectiveTopOuterDiameterMm && effectiveTopOuterDiameterMm > 0 ? effectiveTopOuterDiameterMm : diameterMm,
        topOuterDiameterMm: effectiveTopOuterDiameterMm,
        side: "right",
      });
      applySeedOutlineToActiveLayer({
        outline,
        source,
        enterFitMode: true,
      });
    } catch (error) {
      setOutlineImportError(error instanceof Error ? error.message : "Unable to load SVG outline");
    } finally {
      if (svgOutlineInputRef.current) {
        svgOutlineInputRef.current.value = "";
      }
    }
  };

  const handleUseCurrentOutlineSeed = React.useCallback(() => {
    const currentOutline = activeLayerPath ?? editableOutline;
    if (!currentOutline) {
      setOutlineImportError("No current outline is available for this layer");
      return;
    }
    applySeedOutlineToActiveLayer({
      outline: cloneEditableBodyOutline(currentOutline)!,
      source: null,
      enterFitMode: false,
    });
  }, [activeLayerPath, applySeedOutlineToActiveLayer, editableOutline]);

  // Release drag on escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDragging(null);
        setOutlineDragState(null);
        setSelectedPointId(null);
        setSelectedHandleType(null);
        setSelectedSegmentIndex(null);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedPointId) {
        e.preventDefault();
        handleDeleteSelectedPoint();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleDeleteSelectedPoint, selectedPointId]);

  useEffect(() => {
    if (!outlineDragState) return;
    const handleMove = (event: PointerEvent) => {
      const dxMmRaw = (event.clientX - outlineDragState.startClientX) / pxPerMm;
      const dyMmRaw = (event.clientY - outlineDragState.startClientY) / pxPerMm;
      const constrainHorizontal = event.shiftKey ? Math.abs(dxMmRaw) >= Math.abs(dyMmRaw) : false;
      const constrainVertical = event.shiftKey ? Math.abs(dyMmRaw) > Math.abs(dxMmRaw) : false;
      const dxMm = constrainVertical ? 0 : dxMmRaw;
      const dyMm = constrainHorizontal ? 0 : dyMmRaw;
      const nextOutline = cloneEditableBodyOutline(outlineDragState.startOutline);
      if (!nextOutline) return;

      if (outlineDragState.kind === "point" && outlineDragState.pointId) {
        nextOutline.points = nextOutline.points.map((point) => {
          if (point.id !== outlineDragState.pointId) return point;
          const nextX = Math.max(1, round1(point.x + dxMm));
          const nextY = round1(clamp(point.y + dyMm, 0, overallHeightMm));
          const handleDx = nextX - point.x;
          const handleDy = nextY - point.y;
          return {
            ...point,
            x: nextX,
            y: nextY,
            inHandle: point.inHandle ? { x: round1(point.inHandle.x + handleDx), y: round1(point.inHandle.y + handleDy) } : null,
            outHandle: point.outHandle ? { x: round1(point.outHandle.x + handleDx), y: round1(point.outHandle.y + handleDy) } : null,
          };
        });
      }

      if (outlineDragState.kind === "handle" && outlineDragState.pointId && outlineDragState.handleType) {
        nextOutline.points = nextOutline.points.map((point) => {
          if (point.id !== outlineDragState.pointId) return point;
          const handleKey = outlineDragState.handleType === "in" ? "inHandle" : "outHandle";
          const baseHandle = point[handleKey] ?? { x: point.x, y: point.y + (outlineDragState.handleType === "in" ? -8 : 8) };
          const nextHandle = {
            x: round1(Math.max(0, baseHandle.x + dxMm)),
            y: round1(clamp(baseHandle.y + dyMm, 0, overallHeightMm)),
          };
          return {
            ...point,
            [handleKey]: nextHandle,
          };
        });
      }

      if (outlineDragState.kind === "segment" && typeof outlineDragState.segmentIndex === "number") {
        const points = sortEditableOutlinePoints(nextOutline.points);
        const current = points[outlineDragState.segmentIndex];
        const next = points[outlineDragState.segmentIndex + 1];
        if (current && next) {
          const targetIds = new Set([current.id, next.id]);
          nextOutline.points = nextOutline.points.map((point) => targetIds.has(point.id)
            ? {
                ...point,
                x: round1(Math.max(1, point.x + dxMm)),
                y: round1(clamp(point.y + dyMm, 0, overallHeightMm)),
                inHandle: point.inHandle ? { x: round1(point.inHandle.x + dxMm), y: round1(clamp(point.inHandle.y + dyMm, 0, overallHeightMm)) } : null,
                outHandle: point.outHandle ? { x: round1(point.outHandle.x + dxMm), y: round1(clamp(point.outHandle.y + dyMm, 0, overallHeightMm)) } : null,
              }
            : point);
        }
      }

      setOutlineDraft({
        closed: true,
        version: 1,
        points: sortEditableOutlinePoints(nextOutline.points),
      });
    };
    const handleUp = () => {
      if (outlineDraft) {
        commitOutlineChange(outlineDraft);
      }
      setOutlineDragState(null);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [commitOutlineChange, outlineDraft, outlineDragState, overallHeightMm, pxPerMm]);

  useEffect(() => {
    if (!dragging) return;
    const applyWindowDragAtClientPoint = (clientX: number, clientY: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const yInContainer = clientY - rect.top;
      const mm = yInContainer / pxPerMm;

      if (dragging === "top") {
        const clamped = clamp(mm, MIN_MARGIN_MM, clampedBodyBottomFromOverallMm - 10);
        onChange(round1(clamped), clampedBodyBottomFromOverallMm);
        return;
      }
      if (dragging === "bottom") {
        const clamped = clamp(mm, clampedBodyTopFromOverallMm + 10, overallHeightMm);
        onChange(clampedBodyTopFromOverallMm, round1(clamped));
        return;
      }
      if (dragging === "lid-seam" && onLidSeamChange) {
        const maxMm = Math.min(
          clampedBodyTopFromOverallMm + 28,
          (effectiveSilverBandGuideMm ?? clampedBodyBottomFromOverallMm) - 1,
        );
        onLidSeamChange(round1(clamp(mm, 0, Math.max(0, maxMm))));
        return;
      }
      if (dragging === "silver-band" && onSilverBandBottomChange) {
        const minMm = Math.max(
          clampedBodyTopFromOverallMm + 2,
          (effectiveLidSeamGuideMm ?? clampedBodyTopFromOverallMm) + 1,
        );
        onSilverBandBottomChange(round1(clamp(mm, minMm, clampedBodyBottomFromOverallMm)));
        return;
      }
      if (dragging === "handle-top" && onHandleTopChange) {
        const maxMm = Math.max(0, (effectiveHandleBottomMm ?? clampedBodyBottomFromOverallMm) - 8);
        onHandleTopChange(round1(clamp(mm, 0, maxMm)));
        return;
      }
      if (dragging === "handle-bottom" && onHandleBottomChange) {
        const minMm = Math.max(0, (effectiveHandleTopMm ?? 0) + 8);
        onHandleBottomChange(round1(clamp(mm, minMm, overallHeightMm)));
        return;
      }
      if (dragging === "handle-reach" && onHandleReachChange) {
        const xInContainer = clientX - rect.left;
        const side = activeDisplayPhoto?.handleSide ?? "right";
        const nextReachPx = side === "right"
          ? xInContainer - (bodyLeftPx + bodyWidthPx)
          : bodyLeftPx - xInContainer;
        onHandleReachChange(round1(Math.max(0, nextReachPx / pxPerMm)));
        return;
      }
      if (dragging === "body-width" && onDiameterChange) {
        const xInContainer = clientX - rect.left;
        const halfWidthPx = Math.max(8, Math.abs(xInContainer - bodyCenterLinePx));
        onDiameterChange(Math.max(20, round1((halfWidthPx * 2) / pxPerMm)));
        return;
      }
      if (dragging === "top-outer-width" && onTopOuterDiameterChange) {
        const xInContainer = clientX - rect.left;
        const halfWidthPx = Math.max(bodyWidthPx / 2, Math.abs(xInContainer - bodyCenterLinePx));
        onTopOuterDiameterChange(Math.max(effectiveBodyWrapDiameterMm, round1((halfWidthPx * 2) / pxPerMm)));
        return;
      }
      if (dragging === "base-width" && onBaseDiameterChange) {
        const xInContainer = clientX - rect.left;
        const halfWidthPx = Math.max(6, Math.abs(xInContainer - bodyCenterLinePx));
        onBaseDiameterChange(clamp(round1((halfWidthPx * 2) / pxPerMm), 20, Math.max(20, diameterMm)));
        return;
      }
      if (dragging === "shoulder-width" && onShoulderDiameterChange) {
        const xInContainer = clientX - rect.left;
        const halfWidthPx = Math.max(6, Math.abs(xInContainer - bodyCenterLinePx));
        onShoulderDiameterChange(clamp(
          round1((halfWidthPx * 2) / pxPerMm),
          Math.max(effectiveBaseDiameterMm ?? 20, 20),
          Math.max(effectiveBodyWrapDiameterMm, effectiveTopOuterDiameterMm ?? effectiveBodyWrapDiameterMm),
        ));
        return;
      }
      if (dragging === "taper-upper-width" && onTaperUpperDiameterChange) {
        const xInContainer = clientX - rect.left;
        const halfWidthPx = Math.max(6, Math.abs(xInContainer - bodyCenterLinePx));
        onTaperUpperDiameterChange(clamp(
          round1((halfWidthPx * 2) / pxPerMm),
          Math.max(effectiveBaseDiameterMm ?? 20, 20),
          effectiveShoulderDiameterMm,
        ));
        return;
      }
      if (dragging === "taper-lower-width" && onTaperLowerDiameterChange) {
        const xInContainer = clientX - rect.left;
        const halfWidthPx = Math.max(6, Math.abs(xInContainer - bodyCenterLinePx));
        onTaperLowerDiameterChange(clamp(
          round1((halfWidthPx * 2) / pxPerMm),
          Math.max(effectiveBaseDiameterMm ?? 20, 20),
          effectiveTaperUpperDiameterMm,
        ));
        return;
      }
      if (dragging === "bevel-width" && onBevelDiameterChange) {
        const xInContainer = clientX - rect.left;
        const halfWidthPx = Math.max(6, Math.abs(xInContainer - bodyCenterLinePx));
        onBevelDiameterChange(clamp(
          round1((halfWidthPx * 2) / pxPerMm),
          Math.max(effectiveBaseDiameterMm ?? 20, 20),
          effectiveTaperLowerDiameterMm,
        ));
      }
    };
    const handleWindowPointerMove = (event: PointerEvent) => {
      applyWindowDragAtClientPoint(event.clientX, event.clientY);
    };
    const handleWindowPointerUp = () => {
      setDragging(null);
    };
    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerUp);
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerUp);
    };
  }, [
    activeDisplayPhoto?.handleSide,
    bodyCenterLinePx,
    bodyLeftPx,
    bodyWidthPx,
    clampedBodyBottomFromOverallMm,
    clampedBodyTopFromOverallMm,
    diameterMm,
    dragging,
    effectiveHandleBottomMm,
    effectiveHandleTopMm,
    effectiveBaseDiameterMm,
    effectiveLidSeamGuideMm,
    effectiveShoulderDiameterMm,
    effectiveSilverBandGuideMm,
    effectiveTaperLowerDiameterMm,
    effectiveTaperUpperDiameterMm,
    effectiveTopOuterDiameterMm,
    onBaseDiameterChange,
    onBevelDiameterChange,
    onChange,
    onDiameterChange,
    onHandleBottomChange,
    onHandleReachChange,
    onHandleTopChange,
    onLidSeamChange,
    onShoulderDiameterChange,
    onSilverBandBottomChange,
    onTaperLowerDiameterChange,
    onTaperUpperDiameterChange,
    onTopOuterDiameterChange,
    overallHeightMm,
    pxPerMm,
  ]);

  const baseWidthTopY = Math.round(bodyBottomPx - Math.max(18, Math.min(40, bodyZoneHeightPx * 0.08)));
  const baseDiameterLineY = clamp(Math.round(baseWidthTopY + 18), 22, canvasHeightPx - 14);
  const hasLidGuide =
    rimTopGuidePx != null &&
    rimTopGuidePx >= 0 &&
    rimTopGuidePx <= canvasHeightPx;
  const hasSilverGuide =
    rimBottomGuidePx != null &&
    rimBottomGuidePx >= 0 &&
    rimBottomGuidePx <= canvasHeightPx;
  const hasStraightWallGuide =
    straightWallBottomPx != null &&
    straightWallBottomPx > bodyZoneTopPx + 10 &&
    straightWallBottomPx < bodyZoneBottomPx - 8;
  const straightWallHeightPx = hasStraightWallGuide ? straightWallBottomPx - bodyZoneTopPx : 0;
  const taperPreviewHeightPx = hasStraightWallGuide ? bodyZoneBottomPx - straightWallBottomPx : 0;
  const snappedBodyBottomFromOverallMm = derivedZoneGuides?.straightWallBottomYFromTopMm != null
    ? round1(clamp(derivedZoneGuides.straightWallBottomYFromTopMm, clampedBodyTopFromOverallMm + 10, overallHeightMm))
    : null;

  const handleSnapBottomToStraightWall = () => {
    if (snappedBodyBottomFromOverallMm == null) return;
    onChange(clampedBodyTopFromOverallMm, snappedBodyBottomFromOverallMm);
  };

  const handleSnapPhotoToCenter = () => {
    onPhotoAnchorYChange("center");
    onPhotoOffsetXChange(0);
    onPhotoOffsetYChange(0);
  };

  const handlePhotoWidthMmChange = (nextWidthMm: number) => {
    if (!Number.isFinite(nextWidthMm) || nextWidthMm <= 0) return;
    const nextScalePct = clamp((nextWidthMm / Math.max(0.1, basePhotoWidthMm)) * 100, MIN_PHOTO_SCALE_PCT, MAX_PHOTO_SCALE_PCT);
    onPhotoWidthScaleChange(round1(nextScalePct));
    if (photoLockAspect) {
      onPhotoHeightScaleChange(round1(nextScalePct));
    }
  };

  const handlePhotoHeightMmChange = (nextHeightMm: number) => {
    if (!Number.isFinite(nextHeightMm) || nextHeightMm <= 0) return;
    const nextScalePct = clamp((nextHeightMm / Math.max(0.1, basePhotoHeightMm)) * 100, MIN_PHOTO_SCALE_PCT, MAX_PHOTO_SCALE_PCT);
    onPhotoHeightScaleChange(round1(nextScalePct));
    if (photoLockAspect) {
      onPhotoWidthScaleChange(round1(nextScalePct));
    }
  };

  const handleResetPhotoDimensions = () => {
    onPhotoWidthScaleChange(100);
    onPhotoHeightScaleChange(100);
  };

  const handleBodyTopInputChange = (nextValue: number) => {
    if (!Number.isFinite(nextValue)) return;
    onChange(round1(clamp(nextValue, MIN_MARGIN_MM, clampedBodyBottomFromOverallMm - 10)), clampedBodyBottomFromOverallMm);
  };

  const handleBodyBottomInputChange = (nextValue: number) => {
    if (!Number.isFinite(nextValue)) return;
    onChange(clampedBodyTopFromOverallMm, round1(clamp(nextValue, clampedBodyTopFromOverallMm + 10, overallHeightMm)));
  };

  const handleBodyDiameterInputChange = (nextValue: number) => {
    if (!onDiameterChange || !Number.isFinite(nextValue) || nextValue <= 0) return;
    onDiameterChange(round1(nextValue));
  };

  const handleVisibleDiameterInputChange = (nextValue: number) => {
    if (!Number.isFinite(nextValue) || nextValue <= 0) return;
    if (effectiveTopOuterDiameterMm != null && onTopOuterDiameterChange) {
      onTopOuterDiameterChange(round1(nextValue));
      return;
    }
    onDiameterChange?.(round1(nextValue));
  };

  const handleTopOuterInputChange = (nextValue: number) => {
    if (!onTopOuterDiameterChange || !Number.isFinite(nextValue) || nextValue <= 0) return;
    onTopOuterDiameterChange(round1(nextValue));
  };

  const handleBaseDiameterInputChange = (nextValue: number) => {
    if (!onBaseDiameterChange || !Number.isFinite(nextValue) || nextValue <= 0) return;
    onBaseDiameterChange(round1(nextValue));
  };

  const handleLidSeamInputChange = (nextValue: number) => {
    if (!onLidSeamChange || !Number.isFinite(nextValue)) return;
    const maxMm = Math.min(
      clampedBodyTopFromOverallMm + 28,
      (effectiveSilverBandGuideMm ?? clampedBodyBottomFromOverallMm) - 1,
    );
    onLidSeamChange(round1(clamp(nextValue, 0, Math.max(0, maxMm))));
  };

  const handleSilverBandInputChange = (nextValue: number) => {
    if (!onSilverBandBottomChange || !Number.isFinite(nextValue)) return;
    const minMm = Math.max(
      clampedBodyTopFromOverallMm + 2,
      (effectiveLidSeamGuideMm ?? clampedBodyTopFromOverallMm) + 1,
    );
    onSilverBandBottomChange(round1(clamp(nextValue, minMm, clampedBodyBottomFromOverallMm)));
  };

  useEffect(() => {
    if (!activeDisplayPhoto) return;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(containerWidthPx));
    canvas.height = canvasHeightPx;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, photoLeftPx, photoTopPx, photoWidthPx, targetPhotoHeightPx);

      const bodySampleX = bodyLeftPx + bodyWidthPx * 0.28;
      const bodySampleW = bodyWidthPx * 0.34;
      const bodySampleY = bodyZoneTopPx + bodyZoneHeightPx * 0.2;
      const bodySampleH = Math.max(10, bodyZoneHeightPx * 0.35);

      const rimSampleH = Math.max(6, Math.min(Math.max(bodyTopPx, 10), canvasHeightPx * 0.08));
      const rimSampleY = Math.max(0, bodyZoneTopPx - rimSampleH);
      const rimSampleX = bodyLeftPx + bodyWidthPx * 0.24;
      const rimSampleW = bodyWidthPx * 0.4;

      const sampledBody = sampleRegionColor(ctx, bodySampleX, bodySampleY, bodySampleW, bodySampleH, "average");
      const sampledRim = sampleRegionColor(ctx, rimSampleX, rimSampleY, rimSampleW, rimSampleH, "bright");

      if (!sampledBody && !sampledRim) return;

      const nextBody = sampledBody ?? bodyColorHex;
      const nextRim = sampledRim ?? rimColorHex;

      if (nextBody !== bodyColorHex || nextRim !== rimColorHex) {
        onColorsChange(nextBody, nextRim);
      }
    };
    img.src = activeDisplayPhoto.src;
  }, [
    activeDisplayPhoto,
    bodyColorHex,
    rimColorHex,
    onColorsChange,
    containerWidthPx,
    photoLeftPx,
    photoTopPx,
    photoWidthPx,
    targetPhotoHeightPx,
    canvasHeightPx,
    bodyLeftPx,
    bodyWidthPx,
    bodyTopPx,
    bodyZoneHeightPx,
    bodyZoneTopPx,
  ]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.editorRow}>
        {/* Product photo + overlay */}
        <div
          ref={containerRef}
          className={styles.photoContainer}
          style={{ height: canvasHeightPx, width: containerWidthPx }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {showBlueprintOverlay && (
            <svg
              className={styles.dimensionOverlay}
              viewBox={`0 0 ${containerWidthPx} ${canvasHeightPx}`}
              width={containerWidthPx}
              height={canvasHeightPx}
              aria-hidden="true"
            >
            <defs>
              <marker
                id="blueprintArrow"
                markerWidth="6"
                markerHeight="6"
                refX="3"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L6,3 L0,6 Z" className={styles.dimensionMarker} />
              </marker>
            </defs>

            <line
              className={styles.dimensionLine}
              x1={verticalDimensionLeftX}
              y1={0}
              x2={verticalDimensionLeftX}
              y2={canvasHeightPx}
              markerStart="url(#blueprintArrow)"
              markerEnd="url(#blueprintArrow)"
            />
            <line className={styles.dimensionExtension} x1={verticalDimensionLeftX} y1={0} x2={bodyLeftPx - 2} y2={0} />
            <line className={styles.dimensionExtension} x1={verticalDimensionLeftX} y1={canvasHeightPx} x2={bodyLeftPx - 2} y2={canvasHeightPx} />
            <text
              className={styles.dimensionText}
              x={verticalDimensionLeftX - 8}
              y={canvasHeightPx / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(-90 ${verticalDimensionLeftX - 8} ${canvasHeightPx / 2})`}
            >
              {round1(overallHeightMm)} mm overall
            </text>

            <line
              className={styles.dimensionLine}
              x1={verticalDimensionRightX}
              y1={bodyTopPx}
              x2={verticalDimensionRightX}
              y2={bodyBottomPx}
              markerStart="url(#blueprintArrow)"
              markerEnd="url(#blueprintArrow)"
            />
            <line className={styles.dimensionExtension} x1={Math.round(bodyLeftPx + bodyWidthPx + 2)} y1={bodyTopPx} x2={verticalDimensionRightX} y2={bodyTopPx} />
            <line className={styles.dimensionExtension} x1={Math.round(bodyLeftPx + bodyWidthPx + 2)} y1={bodyBottomPx} x2={verticalDimensionRightX} y2={bodyBottomPx} />
            <text
              className={styles.dimensionText}
              x={verticalDimensionRightX + 8}
              y={(bodyTopPx + bodyBottomPx) / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(-90 ${verticalDimensionRightX + 8} ${(bodyTopPx + bodyBottomPx) / 2})`}
            >
              {bodyHeightMm} mm body
            </text>

            {topOuterWidthPx != null && (
              <>
                <line className={styles.dimensionExtension} x1={topOuterLeftPx} y1={topDiameterLineY + 1} x2={topOuterLeftPx} y2={bodyTopPx - 2} />
                <line className={styles.dimensionExtension} x1={topOuterRightPx} y1={topDiameterLineY + 1} x2={topOuterRightPx} y2={bodyTopPx - 2} />
                <line
                  className={styles.dimensionLine}
                  x1={topOuterLeftPx}
                  y1={topDiameterLineY}
                  x2={topOuterRightPx}
                  y2={topDiameterLineY}
                  markerStart="url(#blueprintArrow)"
                  markerEnd="url(#blueprintArrow)"
                />
                <text
                  className={styles.dimensionText}
                  x={(topOuterLeftPx + topOuterRightPx) / 2}
                  y={topDiameterLineY - 8}
                  textAnchor="middle"
                  >
                   {round1(effectiveTopOuterDiameterMm ?? 0)} mm top
                  </text>
                </>
              )}

            <line className={styles.dimensionExtension} x1={bodyLeftPx} y1={bodyDiameterLineY - 1} x2={bodyLeftPx} y2={referenceBandGuideTopPx + 2} />
            <line className={styles.dimensionExtension} x1={Math.round(bodyLeftPx + bodyWidthPx)} y1={bodyDiameterLineY - 1} x2={Math.round(bodyLeftPx + bodyWidthPx)} y2={referenceBandGuideTopPx + 2} />
            <line
              className={styles.dimensionLine}
              x1={bodyLeftPx}
              y1={bodyDiameterLineY}
              x2={Math.round(bodyLeftPx + bodyWidthPx)}
              y2={bodyDiameterLineY}
              markerStart="url(#blueprintArrow)"
              markerEnd="url(#blueprintArrow)"
            />
            <text
              className={styles.dimensionText}
              x={bodyCenterLinePx}
              y={bodyDiameterLineY - 8}
              textAnchor="middle"
            >
              {round1(effectiveBodyWrapDiameterMm)} mm body
            </text>

            {baseWidthPx != null && (
              <>
                <line className={styles.dimensionExtension} x1={baseLeftPx} y1={baseWidthTopY} x2={baseLeftPx} y2={baseDiameterLineY - 1} />
                <line className={styles.dimensionExtension} x1={baseRightPx} y1={baseWidthTopY} x2={baseRightPx} y2={baseDiameterLineY - 1} />
                <line
                  className={styles.dimensionLine}
                  x1={baseLeftPx}
                  y1={baseDiameterLineY}
                  x2={baseRightPx}
                  y2={baseDiameterLineY}
                  markerStart="url(#blueprintArrow)"
                  markerEnd="url(#blueprintArrow)"
                />
                <text
                  className={styles.dimensionText}
                  x={(baseLeftPx + baseRightPx) / 2}
                  y={baseDiameterLineY - 8}
                  textAnchor="middle"
                  >
                   {round1(effectiveBaseDiameterMm ?? 0)} mm base
                  </text>
                </>
              )}
            </svg>
          )}
          {!profileEditMode && !useEditableOutlinePreview && (
            <>
              <div
                className={styles.bodyFrame}
                style={{ left: bodyLeftPx, width: bodyWidthPx, height: canvasHeightPx }}
              />
              <div
                className={styles.bodyCenterLine}
                style={{ left: bodyCenterLinePx, height: canvasHeightPx }}
              />
            </>
          )}

          {/* Product photo */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activeDisplayPhoto?.src ?? photoDataUrl}
            alt="Product"
            className={styles.productPhoto}
            style={{ width: photoWidthPx, height: targetPhotoHeightPx, left: photoLeftPx, top: photoTopPx }}
          />
          {showFallbackEditableOutlinePreview && editableOutlinePath && (
            <svg
              className={styles.pathEditorOverlay}
              viewBox={`0 0 ${containerWidthPx} ${canvasHeightPx}`}
              width={containerWidthPx}
              height={canvasHeightPx}
              aria-hidden="true"
            >
              <path
                d={editableOutlinePath}
                className={`${styles.traceBodyOutlineMeasured} ${styles.referenceLayerPathActive}`}
              />
            </svg>
          )}
          {activeDisplayPhoto && !profileEditMode && !useEditableOutlinePreview && readOnlyPreviewOutlinePath && (
            <svg
              className={styles.traceOverlay}
              viewBox={`0 0 ${activeDisplayPhoto.w} ${activeDisplayPhoto.h}`}
              style={{ width: photoWidthPx, height: targetPhotoHeightPx, left: photoLeftPx, top: photoTopPx }}
              aria-hidden="true"
            >
              {showReadOnlyGuides && correctedBodyOverlay?.leftBevelMaskPath && (
                <path d={correctedBodyOverlay.leftBevelMaskPath} className={styles.traceBaseMask} />
              )}
              {showReadOnlyGuides && correctedBodyOverlay?.rightBevelMaskPath && (
                <path d={correctedBodyOverlay.rightBevelMaskPath} className={styles.traceBaseMask} />
              )}
              {showReadOnlyGuides && correctedBodyOverlay?.bottomMaskPath && (
                <path d={correctedBodyOverlay.bottomMaskPath} className={styles.traceBaseMask} />
              )}
              {!profileEditMode && !useEditableOutlinePreview && readOnlyPreviewOutlinePath && (
                <path
                  d={readOnlyPreviewOutlinePath ?? undefined}
                  className={styles.traceBodyOutline}
                />
              )}
              {showReadOnlyGuides && !profileEditMode && !useEditableOutlinePreview && showHandleTrace && activeDisplayPhoto.handleOuterPath && (
                <path
                  d={activeDisplayPhoto.handleOuterPath}
                  transform={handlePathTransform}
                  className={styles.traceHandleOutline}
                />
              )}
              {showReadOnlyGuides && !profileEditMode && !useEditableOutlinePreview && showHandleTrace && !activeDisplayPhoto.handleOuterPath && activeDisplayPhoto.handleOuterRect && (
                <rect
                  x={activeDisplayPhoto.handleOuterRect.x}
                  y={activeDisplayPhoto.handleOuterRect.y}
                  width={activeDisplayPhoto.handleOuterRect.width}
                  height={activeDisplayPhoto.handleOuterRect.height}
                  rx={Math.max(2, activeDisplayPhoto.handleOuterRect.width * 0.08)}
                  ry={Math.max(2, activeDisplayPhoto.handleOuterRect.width * 0.08)}
                  className={styles.traceHandleOutline}
                />
              )}
              {showReadOnlyGuides && !profileEditMode && !useEditableOutlinePreview && showHandleTrace && activeDisplayPhoto.handleInnerPath && (
                <path
                  d={activeDisplayPhoto.handleInnerPath}
                  transform={handlePathTransform}
                  className={styles.traceHandleHole}
                />
              )}
              {showReadOnlyGuides && !profileEditMode && !useEditableOutlinePreview && showHandleTrace && !activeDisplayPhoto.handleInnerPath && activeDisplayPhoto.handleInnerRect && (
                <rect
                  x={activeDisplayPhoto.handleInnerRect.x}
                  y={activeDisplayPhoto.handleInnerRect.y}
                  width={activeDisplayPhoto.handleInnerRect.width}
                  height={activeDisplayPhoto.handleInnerRect.height}
                  rx={Math.max(2, activeDisplayPhoto.handleInnerRect.width * 0.08)}
                  ry={Math.max(2, activeDisplayPhoto.handleInnerRect.width * 0.08)}
                  className={styles.traceHandleHole}
                />
              )}
              {showReadOnlyGuides && !profileEditMode && !useEditableOutlinePreview && overlayRimTopY != null && (
                <>
                  <line
                    x1={0}
                    y1={overlayRimTopY}
                    x2={activeDisplayPhoto.w}
                    y2={overlayRimTopY}
                    className={styles.traceLidSeam}
                  />
                  <circle
                    cx={Math.max(4, activeDisplayPhoto.bodyCenterX - (activeDisplayPhoto.referenceBodyWidthPx / 2))}
                    cy={overlayRimTopY}
                    r={2.5}
                    className={`${styles.traceNode} ${styles.traceNodeLid}`}
                  />
                  <circle
                    cx={Math.min(activeDisplayPhoto.w - 4, activeDisplayPhoto.bodyCenterX + (activeDisplayPhoto.referenceBodyWidthPx / 2))}
                    cy={overlayRimTopY}
                    r={2.5}
                    className={`${styles.traceNode} ${styles.traceNodeLid}`}
                  />
                </>
              )}
              {showReadOnlyGuides && !profileEditMode && !useEditableOutlinePreview && overlayRimTopY != null && overlayRimBottomY != null && overlayRimBottomY > overlayRimTopY && (
                <>
                  <rect
                    x={0}
                    y={overlayRimTopY}
                    width={activeDisplayPhoto.w}
                    height={Math.max(1, overlayRimBottomY - overlayRimTopY)}
                    className={styles.traceSilverBand}
                  />
                  <circle
                    cx={Math.max(4, activeDisplayPhoto.bodyCenterX - (activeDisplayPhoto.referenceBodyWidthPx / 2))}
                    cy={overlayRimBottomY}
                    r={2.5}
                    className={`${styles.traceNode} ${styles.traceNodeSilver}`}
                  />
                  <circle
                    cx={Math.min(activeDisplayPhoto.w - 4, activeDisplayPhoto.bodyCenterX + (activeDisplayPhoto.referenceBodyWidthPx / 2))}
                    cy={overlayRimBottomY}
                    r={2.5}
                    className={`${styles.traceNode} ${styles.traceNodeSilver}`}
                  />
                </>
              )}
              {showReadOnlyGuides && !profileEditMode && !useEditableOutlinePreview && showHandleTrace && activeDisplayPhoto.handleOuterRect && (
                <>
                  <circle
                    cx={activeDisplayPhoto.handleOuterRect.x}
                    cy={activeDisplayPhoto.handleOuterRect.y}
                    r={2.4}
                    className={`${styles.traceNode} ${styles.traceNodeHandle}`}
                  />
                  <circle
                    cx={activeDisplayPhoto.handleOuterRect.x + activeDisplayPhoto.handleOuterRect.width}
                    cy={activeDisplayPhoto.handleOuterRect.y + activeDisplayPhoto.handleOuterRect.height}
                    r={2.4}
                    className={`${styles.traceNode} ${styles.traceNodeHandle}`}
                  />
                </>
              )}
            </svg>
          )}
          {profileEditMode && (
            <>
              <div className={styles.pathEditorToolbar}>
                <input
                  ref={svgOutlineInputRef}
                  type="file"
                  accept=".svg,image/svg+xml"
                  className={styles.hiddenFileInput}
                  onChange={handleSvgOutlineFileChange}
                />
                <button
                  type="button"
                  className={`${styles.editorToolBtn} ${styles.editorToolBtnPrimary}`}
                  onClick={() => svgOutlineInputRef.current?.click()}
                >
                  Load SVG Outline
                </button>
                <button
                  type="button"
                  className={styles.editorToolBtn}
                  onClick={handleUseCurrentOutlineSeed}
                  disabled={!activeLayerPath && !editableOutline}
                >
                  Use Current Outline
                </button>
                <div className={styles.pathEditorHint}>
                  Use a verified SVG or the current saved outline as the shape source. Preview match is the acceptance gate.
                </div>
                <button
                  type="button"
                  className={`${styles.editorToolBtn} ${shapeWorkflowMode === "fit" ? styles.editorToolBtnActive : ""}`}
                  onClick={() => setShapeWorkflowMode("fit")}
                >
                  Fit Shape
                </button>
                <button
                  type="button"
                  className={`${styles.editorToolBtn} ${shapeWorkflowMode === "refine" ? styles.editorToolBtnActive : ""}`}
                  onClick={() => {
                    setShapeWorkflowMode("refine");
                    setNodeEditMode("edit");
                  }}
                  disabled={!editableOutline}
                >
                  Refine Shape
                </button>
                <button
                  type="button"
                  className={`${styles.editorToolBtn} ${nodeEditMode === "add" ? styles.editorToolBtnActive : ""}`}
                  onClick={() => {
                    setShapeWorkflowMode("refine");
                    setNodeEditMode("add");
                  }}
                  disabled={!editableOutline || activeLayerLocked || shapeWorkflowMode !== "refine"}
                >
                  Add point
                </button>
                <button type="button" className={styles.editorToolBtn} onClick={handleDeleteSelectedPoint} disabled={!selectedPointId || activeLayerLocked || shapeWorkflowMode !== "refine"}>
                  Delete point
                </button>
                <button type="button" className={styles.editorToolBtn} onClick={() => handleConvertSelectedPoint("corner")} disabled={!selectedPointId || activeLayerLocked || shapeWorkflowMode !== "refine"}>
                  Convert to corner
                </button>
                <button type="button" className={styles.editorToolBtn} onClick={() => handleConvertSelectedPoint("smooth")} disabled={!selectedPointId || activeLayerLocked || shapeWorkflowMode !== "refine"}>
                  Convert to smooth
                </button>
                <button type="button" className={styles.editorToolBtn} onClick={handleUndoOutline} disabled={outlineHistory.length === 0 || !editableOutline}>
                  Undo
                </button>
                <button type="button" className={styles.editorToolBtn} onClick={handleRedoOutline} disabled={outlineFuture.length === 0 || !editableOutline}>
                  Redo
                </button>
                <button type="button" className={styles.editorToolBtn} onClick={handleResetOutline}>
                  {importedOutlineSource ? "Reset to Imported SVG" : "Reset outline"}
                </button>
                <button type="button" className={styles.editorToolBtn} onClick={() => setShowAdvancedHandles((current) => !current)}>
                  {showAdvancedHandles ? "Hide handles" : "Advanced edit"}
                </button>
                <button type="button" className={`${styles.editorToolBtn} ${styles.editorToolBtnPrimary}`} onClick={applyOutlineDraft} disabled={!editableOutline}>
                  Apply / Save outline
                </button>
              </div>
              {shapeWorkflowMode === "fit" && (
                <div className={styles.outlineTransformBar}>
                  <label className={styles.transformField}>
                    <span>Y</span>
                    <input
                      type="number"
                      value={outlineImportOffsetYMm}
                      onChange={(event) => setOutlineImportOffsetYMm(Number(event.target.value) || 0)}
                    />
                  </label>
                  <label className={styles.transformField}>
                    <span>Scale</span>
                    <input
                      type="number"
                      min={40}
                      max={180}
                      value={outlineImportScalePct}
                      onChange={(event) => setOutlineImportScalePct(clamp(Number(event.target.value) || 100, 40, 180))}
                    />
                  </label>
                  <label className={styles.transformField}>
                    <span>W</span>
                    <input
                      type="number"
                      min={40}
                      max={180}
                      value={outlineImportWidthPct}
                      onChange={(event) => setOutlineImportWidthPct(clamp(Number(event.target.value) || 100, 40, 180))}
                    />
                  </label>
                  <label className={styles.transformField}>
                    <span>H</span>
                    <input
                      type="number"
                      min={40}
                      max={180}
                      value={outlineImportHeightPct}
                      onChange={(event) => setOutlineImportHeightPct(clamp(Number(event.target.value) || 100, 40, 180))}
                    />
                  </label>
                  <div className={styles.segmentedControl}>
                    <button
                      type="button"
                      className={`${styles.editorToolBtn} ${outlineImportSide === "right" ? styles.editorToolBtnActive : ""}`}
                      onClick={() => setOutlineImportSide("right")}
                    >
                      Right
                    </button>
                    <button
                      type="button"
                      className={`${styles.editorToolBtn} ${outlineImportSide === "left" ? styles.editorToolBtnActive : ""}`}
                      onClick={() => setOutlineImportSide("left")}
                    >
                      Mirror
                    </button>
                  </div>
                </div>
              )}
              {outlineImportError && <div className={styles.outlineImportError}>{outlineImportError}</div>}
              <svg
                className={styles.pathEditorOverlay}
                viewBox={`0 0 ${containerWidthPx} ${canvasHeightPx}`}
                width={containerWidthPx}
                height={canvasHeightPx}
                aria-label="Editable body outline"
              >
                {!outlineTransformMode && editableOutlinePath && sortedEditablePoints.slice(0, -1).map((point, index) => {
                  const next = sortedEditablePoints[index + 1];
                  if (!next) return null;
                  const start = getOutlinePointClientPosition(point);
                  const end = getOutlinePointClientPosition(next);
                  const c1 = point.outHandle
                    ? { x: bodyCenterLinePx + (point.outHandle.x * pxPerMm), y: point.outHandle.y * pxPerMm }
                    : start;
                  const c2 = next.inHandle
                    ? { x: bodyCenterLinePx + (next.inHandle.x * pxPerMm), y: next.inHandle.y * pxPerMm }
                    : end;
                  return (
                    <path
                      key={`${point.id}-${next.id}`}
                      d={`M ${round1(start.x)} ${round1(start.y)} C ${round1(c1.x)} ${round1(c1.y)} ${round1(c2.x)} ${round1(c2.y)} ${round1(end.x)} ${round1(end.y)}`}
                      className={`${styles.pathEditorSegmentHit} ${selectedSegmentIndex === index ? styles.pathEditorSegmentHitActive : ""}`}
                      onPointerDown={startOutlineSegmentDrag(index)}
                      onClick={handleSegmentClick(index)}
                    />
                  );
                })}
                {editableOutlinePath && (
                  <path
                    d={editableOutlinePath}
                    className={`${styles.traceBodyOutlineMeasured} ${styles.referenceLayerPathActive}`}
                  />
                )}
                {!outlineTransformMode && editableOutlinePath && selectedPoint && (showAdvancedHandles || selectedPoint.pointType === "smooth") && (
                  <>
                    {selectedPoint.inHandle && (
                      <>
                        <line
                          x1={round1(getOutlinePointClientPosition(selectedPoint).x)}
                          y1={round1(getOutlinePointClientPosition(selectedPoint).y)}
                          x2={round1(bodyCenterLinePx + (selectedPoint.inHandle.x * pxPerMm))}
                          y2={round1(selectedPoint.inHandle.y * pxPerMm)}
                          className={styles.pathEditorHandleLine}
                        />
                        <circle
                          cx={round1(bodyCenterLinePx + (selectedPoint.inHandle.x * pxPerMm))}
                          cy={round1(selectedPoint.inHandle.y * pxPerMm)}
                          r={5}
                          className={`${styles.pathEditorHandleNode} ${selectedHandleType === "in" ? styles.pathEditorHandleNodeActive : ""}`}
                          onPointerDown={startOutlineHandleDrag(selectedPoint.id, "in")}
                        />
                      </>
                    )}
                    {selectedPoint.outHandle && (
                      <>
                        <line
                          x1={round1(getOutlinePointClientPosition(selectedPoint).x)}
                          y1={round1(getOutlinePointClientPosition(selectedPoint).y)}
                          x2={round1(bodyCenterLinePx + (selectedPoint.outHandle.x * pxPerMm))}
                          y2={round1(selectedPoint.outHandle.y * pxPerMm)}
                          className={styles.pathEditorHandleLine}
                        />
                        <circle
                          cx={round1(bodyCenterLinePx + (selectedPoint.outHandle.x * pxPerMm))}
                          cy={round1(selectedPoint.outHandle.y * pxPerMm)}
                          r={5}
                          className={`${styles.pathEditorHandleNode} ${selectedHandleType === "out" ? styles.pathEditorHandleNodeActive : ""}`}
                          onPointerDown={startOutlineHandleDrag(selectedPoint.id, "out")}
                        />
                      </>
                    )}
                  </>
                )}
                {!outlineTransformMode && editableOutlinePath && sortedEditablePoints.map((point) => {
                  const coords = getOutlinePointClientPosition(point);
                  return (
                    <circle
                      key={point.id}
                      cx={round1(coords.x)}
                      cy={round1(coords.y)}
                      r={selectedPointId === point.id ? 7 : 5}
                      className={`${styles.pathEditorPoint} ${selectedPointId === point.id ? styles.pathEditorPointSelected : ""} ${point.role === "custom" ? styles.pathEditorPointCustom : ""}`}
                      onPointerDown={startOutlinePointDrag(point.id)}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedPointId(point.id);
                        setSelectedHandleType(null);
                      }}
                      onDoubleClick={() => handleConvertPoint(point.id, point.pointType === "smooth" ? "corner" : "smooth")}
                    />
                  );
                })}
              </svg>
            </>
          )}
          {showReadOnlyGuides && activeDisplayPhoto && !profileEditMode && !useEditableOutlinePreview && (
            <div
              className={styles.guideLine}
              style={{ top: referenceBandGuideTopPx, left: photoLeftPx, width: photoWidthPx }}
            >
              {showGuideLabels && <span className={styles.guideLineLabel}>Scale anchor</span>}
            </div>
          )}
          {showReadOnlyGuides && hasLidGuide && rimTopGuidePx != null && !profileEditMode && !useEditableOutlinePreview && (
            <div
              className={`${styles.placementGuide} ${styles.lidPlacementGuide}`}
              style={{ top: rimTopGuidePx, left: bodyLeftPx, width: bodyWidthPx }}
            >
              {showGuideLabels && <span className={styles.placementGuideLabel}>Lid top</span>}
            </div>
          )}
          {showReadOnlyGuides && hasLidGuide && rimTopGuidePx != null && !profileEditMode && !useEditableOutlinePreview && (
            <>
              <button
                type="button"
                aria-label="Adjust lid top"
                className={`${styles.guideNode} ${styles.guideNodeLid} ${dragging === "lid-seam" ? styles.guideNodeActive : ""}`}
                style={{ left: bodyLeftPx, top: rimTopGuidePx }}
                onPointerDown={handlePointerDown("lid-seam")}
              />
              <button
                type="button"
                aria-label="Adjust lid top"
                className={`${styles.guideNode} ${styles.guideNodeLid} ${dragging === "lid-seam" ? styles.guideNodeActive : ""}`}
                style={{ left: bodyLeftPx + bodyWidthPx, top: rimTopGuidePx }}
                onPointerDown={handlePointerDown("lid-seam")}
              />
            </>
          )}
          {showReadOnlyGuides && hasSilverGuide && rimBottomGuidePx != null && !profileEditMode && !useEditableOutlinePreview && (
            <div
              className={`${styles.placementGuide} ${styles.coatingPlacementGuide}`}
              style={{ top: rimBottomGuidePx, left: bodyLeftPx, width: bodyWidthPx }}
            >
              {showGuideLabels && <span className={styles.placementGuideLabel}>Powder coat begins</span>}
            </div>
          )}
          {showReadOnlyGuides && hasSilverGuide && rimBottomGuidePx != null && !profileEditMode && !useEditableOutlinePreview && (
            <>
              <button
                type="button"
                aria-label="Adjust silver band"
                className={`${styles.guideNode} ${styles.guideNodeSilver} ${dragging === "silver-band" ? styles.guideNodeActive : ""}`}
                style={{ left: bodyLeftPx, top: rimBottomGuidePx }}
                onPointerDown={handlePointerDown("silver-band")}
              />
              <button
                type="button"
                aria-label="Adjust silver band"
                className={`${styles.guideNode} ${styles.guideNodeSilver} ${dragging === "silver-band" ? styles.guideNodeActive : ""}`}
                style={{ left: bodyLeftPx + bodyWidthPx, top: rimBottomGuidePx }}
                onPointerDown={handlePointerDown("silver-band")}
              />
            </>
          )}

          {/* Dead zones (non-engravable) */}
          {showReadOnlyGuides && !profileEditMode && !useEditableOutlinePreview && (
            <>
              <div
                className={styles.deadZone}
                style={{ top: 0, height: bodyTopPx, left: bodyLeftPx, width: bodyWidthPx }}
              />
              <div
                className={styles.deadZone}
                style={{ bottom: 0, height: bodyBottomDeadZonePx, left: bodyLeftPx, width: bodyWidthPx }}
              />
            </>
          )}

          {/* Physical tumbler body highlight */}
          {showReadOnlyGuides && !profileEditMode && !useEditableOutlinePreview && (
            <>
              <div
                className={styles.engravableZone}
                style={{ top: bodyZoneTopPx, height: bodyZoneHeightPx, left: bodyLeftPx, width: bodyWidthPx }}
              />
              {hasStraightWallGuide && (
                <div
                  className={styles.straightWallZone}
                  style={{ top: bodyZoneTopPx, height: straightWallHeightPx, left: bodyLeftPx, width: bodyWidthPx }}
                />
              )}
              {hasStraightWallGuide && taperPreviewHeightPx > 8 && (
                <div
                  className={styles.transitionZone}
                  style={{ top: straightWallBottomPx, height: taperPreviewHeightPx, left: bodyLeftPx, width: bodyWidthPx }}
                />
              )}
              {hasStraightWallGuide && (
                <div
                  className={styles.guideLine}
                  style={{ top: straightWallBottomPx, left: bodyLeftPx, width: bodyWidthPx }}
                >
                  {showGuideLabels && <span className={styles.guideLineLabel}>Straight wall ends</span>}
                </div>
              )}
            </>
          )}
          {showReadOnlyGuides && !profileEditMode && !useEditableOutlinePreview && showHandleTrace && transformedHandleOuterRect && (
            <>
              <div
                className={`${styles.placementGuide} ${styles.handlePlacementGuide}`}
                style={{ top: transformedHandleOuterRect.y, left: transformedHandleOuterRect.x, width: transformedHandleOuterRect.width }}
              >
                {showGuideLabels && <span className={styles.placementGuideLabel}>Handle top</span>}
              </div>
              <div
                className={`${styles.placementGuide} ${styles.handlePlacementGuide}`}
                style={{ top: transformedHandleOuterRect.y + transformedHandleOuterRect.height, left: transformedHandleOuterRect.x, width: transformedHandleOuterRect.width }}
              />
              <button
                type="button"
                aria-label="Adjust handle top"
                className={`${styles.guideNode} ${styles.guideNodeHandleOutline} ${dragging === "handle-top" ? styles.guideNodeActive : ""}`}
                style={{ left: transformedHandleOuterRect.x, top: transformedHandleOuterRect.y }}
                title="Adjust handle top"
                onPointerDown={handlePointerDown("handle-top")}
              />
              <button
                type="button"
                aria-label="Adjust handle top"
                className={`${styles.guideNode} ${styles.guideNodeHandleOutline} ${dragging === "handle-top" ? styles.guideNodeActive : ""}`}
                style={{ left: transformedHandleOuterRect.x + transformedHandleOuterRect.width, top: transformedHandleOuterRect.y }}
                title="Adjust handle top"
                onPointerDown={handlePointerDown("handle-top")}
              />
              <button
                type="button"
                aria-label="Adjust handle bottom"
                className={`${styles.guideNode} ${styles.guideNodeHandleOutline} ${dragging === "handle-bottom" ? styles.guideNodeActive : ""}`}
                style={{ left: transformedHandleOuterRect.x, top: transformedHandleOuterRect.y + transformedHandleOuterRect.height }}
                title="Adjust handle bottom"
                onPointerDown={handlePointerDown("handle-bottom")}
              />
              <button
                type="button"
                aria-label="Adjust handle bottom"
                className={`${styles.guideNode} ${styles.guideNodeHandleOutline} ${dragging === "handle-bottom" ? styles.guideNodeActive : ""}`}
                style={{ left: transformedHandleOuterRect.x + transformedHandleOuterRect.width, top: transformedHandleOuterRect.y + transformedHandleOuterRect.height }}
                title="Adjust handle bottom"
                onPointerDown={handlePointerDown("handle-bottom")}
              />
              <button
                type="button"
                aria-label="Adjust handle reach"
                className={`${styles.guideNode} ${styles.guideNodeHandleOutline} ${styles.guideNodeHandleReach} ${dragging === "handle-reach" ? styles.guideNodeActive : ""}`}
                style={{
                  left: activeDisplayPhoto?.handleSide === "left" ? transformedHandleOuterRect.x : transformedHandleOuterRect.x + transformedHandleOuterRect.width,
                  top: transformedHandleOuterRect.y + transformedHandleOuterRect.height / 2,
                }}
                title="Adjust handle reach"
                onPointerDown={handlePointerDown("handle-reach")}
              />
            </>
          )}
          {showReadOnlyGuides && !profileEditMode && !useEditableOutlinePreview && topOuterLeftPx != null && topOuterRightPx != null && (
            <>
              <button
                type="button"
                aria-label="Adjust top outer diameter"
                className={`${styles.guideNode} ${styles.guideNodeLid} ${styles.guideNodeOutlineWidth} ${dragging === "top-outer-width" ? styles.guideNodeActive : ""}`}
                style={{ left: topOuterLeftPx, top: topDiameterLineY }}
                title="Adjust top outer diameter"
                onPointerDown={handlePointerDown("top-outer-width")}
              />
              <button
                type="button"
                aria-label="Adjust top outer diameter"
                className={`${styles.guideNode} ${styles.guideNodeLid} ${styles.guideNodeOutlineWidth} ${dragging === "top-outer-width" ? styles.guideNodeActive : ""}`}
                style={{ left: topOuterRightPx, top: topDiameterLineY }}
                title="Adjust top outer diameter"
                onPointerDown={handlePointerDown("top-outer-width")}
              />
            </>
          )}
          {showReadOnlyGuides && !profileEditMode && !useEditableOutlinePreview && (
            <>
              <button
                type="button"
                aria-label="Adjust body diameter"
                className={`${styles.guideNode} ${styles.guideNodeBody} ${styles.guideNodeOutlineWidth} ${dragging === "body-width" ? styles.guideNodeActive : ""}`}
                style={{ left: bodyLeftPx, top: bodyDiameterLineY }}
                title="Adjust body diameter"
                onPointerDown={handlePointerDown("body-width")}
              />
              <button
                type="button"
                aria-label="Adjust body diameter"
                className={`${styles.guideNode} ${styles.guideNodeBody} ${styles.guideNodeOutlineWidth} ${dragging === "body-width" ? styles.guideNodeActive : ""}`}
                style={{ left: bodyLeftPx + bodyWidthPx, top: bodyDiameterLineY }}
                title="Adjust body diameter"
                onPointerDown={handlePointerDown("body-width")}
              />
              {hasStraightWallGuide && (
                <>
                  <button
                    type="button"
                    aria-label="Adjust shoulder width"
                    className={`${styles.guideNode} ${styles.guideNodeProfile} ${styles.guideNodeOutlineWidth} ${dragging === "shoulder-width" ? styles.guideNodeActive : ""}`}
                    style={{ left: shoulderLeftPx, top: straightWallBottomPx }}
                    title="Adjust shoulder width"
                    onPointerDown={handlePointerDown("shoulder-width")}
                  />
                  <button
                    type="button"
                    aria-label="Adjust shoulder width"
                    className={`${styles.guideNode} ${styles.guideNodeProfile} ${styles.guideNodeOutlineWidth} ${dragging === "shoulder-width" ? styles.guideNodeActive : ""}`}
                    style={{ left: shoulderRightPx, top: straightWallBottomPx }}
                    title="Adjust shoulder width"
                    onPointerDown={handlePointerDown("shoulder-width")}
                  />
                  <button
                    type="button"
                    aria-label="Adjust upper taper width"
                    className={`${styles.guideNode} ${styles.guideNodeProfile} ${styles.guideNodeOutlineWidth} ${dragging === "taper-upper-width" ? styles.guideNodeActive : ""}`}
                    style={{ left: taperUpperLeftPx, top: correctedBodyOverlay?.controlPoints.taperUpperY != null ? (photoTopPx + ((correctedBodyOverlay.controlPoints.taperUpperY / activeDisplayPhoto!.h) * targetPhotoHeightPx)) : straightWallBottomPx + 20 }}
                    title="Adjust upper taper width"
                    onPointerDown={handlePointerDown("taper-upper-width")}
                  />
                  <button
                    type="button"
                    aria-label="Adjust upper taper width"
                    className={`${styles.guideNode} ${styles.guideNodeProfile} ${styles.guideNodeOutlineWidth} ${dragging === "taper-upper-width" ? styles.guideNodeActive : ""}`}
                    style={{ left: taperUpperRightPx, top: correctedBodyOverlay?.controlPoints.taperUpperY != null ? (photoTopPx + ((correctedBodyOverlay.controlPoints.taperUpperY / activeDisplayPhoto!.h) * targetPhotoHeightPx)) : straightWallBottomPx + 20 }}
                    title="Adjust upper taper width"
                    onPointerDown={handlePointerDown("taper-upper-width")}
                  />
                  <button
                    type="button"
                    aria-label="Adjust lower taper width"
                    className={`${styles.guideNode} ${styles.guideNodeProfile} ${styles.guideNodeOutlineWidth} ${dragging === "taper-lower-width" ? styles.guideNodeActive : ""}`}
                    style={{ left: taperLowerLeftPx, top: correctedBodyOverlay?.controlPoints.taperLowerY != null ? (photoTopPx + ((correctedBodyOverlay.controlPoints.taperLowerY / activeDisplayPhoto!.h) * targetPhotoHeightPx)) : straightWallBottomPx + 48 }}
                    title="Adjust lower taper width"
                    onPointerDown={handlePointerDown("taper-lower-width")}
                  />
                  <button
                    type="button"
                    aria-label="Adjust lower taper width"
                    className={`${styles.guideNode} ${styles.guideNodeProfile} ${styles.guideNodeOutlineWidth} ${dragging === "taper-lower-width" ? styles.guideNodeActive : ""}`}
                    style={{ left: taperLowerRightPx, top: correctedBodyOverlay?.controlPoints.taperLowerY != null ? (photoTopPx + ((correctedBodyOverlay.controlPoints.taperLowerY / activeDisplayPhoto!.h) * targetPhotoHeightPx)) : straightWallBottomPx + 48 }}
                    title="Adjust lower taper width"
                    onPointerDown={handlePointerDown("taper-lower-width")}
                  />
                  <button
                    type="button"
                    aria-label="Adjust bevel width"
                    className={`${styles.guideNode} ${styles.guideNodeProfile} ${styles.guideNodeOutlineWidth} ${dragging === "bevel-width" ? styles.guideNodeActive : ""}`}
                    style={{ left: bevelLeftPx, top: correctedBodyOverlay?.controlPoints.bevelY != null ? (photoTopPx + ((correctedBodyOverlay.controlPoints.bevelY / activeDisplayPhoto!.h) * targetPhotoHeightPx)) : bodyBottomPx - 10 }}
                    title="Adjust bevel width"
                    onPointerDown={handlePointerDown("bevel-width")}
                  />
                  <button
                    type="button"
                    aria-label="Adjust bevel width"
                    className={`${styles.guideNode} ${styles.guideNodeProfile} ${styles.guideNodeOutlineWidth} ${dragging === "bevel-width" ? styles.guideNodeActive : ""}`}
                    style={{ left: bevelRightPx, top: correctedBodyOverlay?.controlPoints.bevelY != null ? (photoTopPx + ((correctedBodyOverlay.controlPoints.bevelY / activeDisplayPhoto!.h) * targetPhotoHeightPx)) : bodyBottomPx - 10 }}
                    title="Adjust bevel width"
                    onPointerDown={handlePointerDown("bevel-width")}
                  />
                </>
              )}
              {baseLeftPx != null && baseRightPx != null && (
                <>
                  <button
                    type="button"
                    aria-label="Adjust base diameter"
                    className={`${styles.guideNode} ${styles.guideNodeBody} ${styles.guideNodeOutlineWidth} ${dragging === "base-width" ? styles.guideNodeActive : ""}`}
                    style={{ left: baseLeftPx, top: baseDiameterLineY }}
                    title="Adjust base diameter"
                    onPointerDown={handlePointerDown("base-width")}
                  />
                  <button
                    type="button"
                    aria-label="Adjust base diameter"
                    className={`${styles.guideNode} ${styles.guideNodeBody} ${styles.guideNodeOutlineWidth} ${dragging === "base-width" ? styles.guideNodeActive : ""}`}
                    style={{ left: baseRightPx, top: baseDiameterLineY }}
                    title="Adjust base diameter"
                    onPointerDown={handlePointerDown("base-width")}
                  />
                </>
              )}

              <div
                className={`${styles.dragLine} ${dragging === "top" ? styles.dragLineActive : ""}`}
                style={{ top: bodyTopPx, left: bodyLeftPx, width: bodyWidthPx }}
                onPointerDown={handlePointerDown("top")}
              >
                <span className={styles.dragLineLabel}>
                  Lid / body: {round1(clampedBodyTopFromOverallMm)} mm
                </span>
              </div>
              <button
                type="button"
                aria-label="Adjust lid to body line"
                className={`${styles.guideNode} ${styles.guideNodeBody} ${dragging === "top" ? styles.guideNodeActive : ""}`}
                style={{ left: bodyLeftPx, top: bodyTopPx }}
                onPointerDown={handlePointerDown("top")}
              />
              <button
                type="button"
                aria-label="Adjust lid to body line"
                className={`${styles.guideNode} ${styles.guideNodeBody} ${dragging === "top" ? styles.guideNodeActive : ""}`}
                style={{ left: bodyLeftPx + bodyWidthPx, top: bodyTopPx }}
                onPointerDown={handlePointerDown("top")}
              />

              <div
                className={`${styles.dragLine} ${styles.dragLineBottom} ${dragging === "bottom" ? styles.dragLineActive : ""}`}
                style={{ top: bodyBottomPx, left: bodyLeftPx, width: bodyWidthPx }}
                onPointerDown={handlePointerDown("bottom")}
              >
                <span className={styles.dragLineLabel}>
                  Bottom: {round1(clampedBodyBottomFromOverallMm)} mm
                </span>
              </div>
              <button
                type="button"
                aria-label="Adjust body bottom"
                className={`${styles.guideNode} ${styles.guideNodeBody} ${dragging === "bottom" ? styles.guideNodeActive : ""}`}
                style={{ left: bodyLeftPx, top: bodyBottomPx }}
                onPointerDown={handlePointerDown("bottom")}
              />
              <button
                type="button"
                aria-label="Adjust body bottom"
                className={`${styles.guideNode} ${styles.guideNodeBody} ${dragging === "bottom" ? styles.guideNodeActive : ""}`}
                style={{ left: bodyLeftPx + bodyWidthPx, top: bodyBottomPx }}
                onPointerDown={handlePointerDown("bottom")}
              />
            </>
          )}
        </div>

        {/* Readout panel */}
        <div className={styles.readout}>
          <div className={styles.readoutTitle}>Body reference</div>
          <div className={styles.readoutRow}>
            <span className={styles.readoutLabel}>Total height</span>
            <span className={styles.readoutValue}>{round1(overallHeightMm)} mm</span>
          </div>
          <div className={styles.readoutRow}>
            <span className={styles.readoutLabel}>Lid / body line</span>
            <span className={styles.readoutInputWrap}>
              <input
                className={styles.readoutInput}
                type="number"
                min={MIN_MARGIN_MM}
                max={round1(clampedBodyBottomFromOverallMm - 10)}
                step={0.1}
                value={round1(clampedBodyTopFromOverallMm)}
                onChange={(e) => handleBodyTopInputChange(Number(e.target.value))}
              />
              <span className={styles.dimensionUnit}>mm</span>
            </span>
          </div>
          <div className={styles.readoutRow}>
            <span className={styles.readoutLabel}>Body bottom</span>
            <span className={styles.readoutInputWrap}>
              <input
                className={styles.readoutInput}
                type="number"
                min={round1(clampedBodyTopFromOverallMm + 10)}
                max={round1(overallHeightMm)}
                step={0.1}
                value={round1(clampedBodyBottomFromOverallMm)}
                onChange={(e) => handleBodyBottomInputChange(Number(e.target.value))}
              />
              <span className={styles.dimensionUnit}>mm</span>
            </span>
          </div>
          <div className={`${styles.readoutRow} ${styles.readoutHighlight}`}>
            <span className={styles.readoutLabel}>Body height</span>
            <span className={styles.readoutValue}>{bodyHeightMm} mm</span>
          </div>
          <div className={styles.readoutRow}>
            <span className={styles.readoutLabel}>Diameter</span>
            <span className={styles.readoutInputWrap}>
              <input
                className={styles.readoutInput}
                type="number"
                min={0.1}
                step={0.1}
                value={round1(visualReferenceDiameterMm)}
                onChange={(e) => handleVisibleDiameterInputChange(Number(e.target.value))}
              />
              <span className={styles.dimensionUnit}>mm</span>
            </span>
          </div>
          {effectiveTopOuterDiameterMm != null && (
            <div className={styles.readoutRow}>
              <span className={styles.readoutLabel}>Body / wrap</span>
              <span className={styles.readoutInputWrap}>
                <input
                  className={styles.readoutInput}
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={round1(effectiveBodyWrapDiameterMm)}
                  onChange={(e) => handleBodyDiameterInputChange(Number(e.target.value))}
                />
                <span className={styles.dimensionUnit}>mm</span>
              </span>
            </div>
          )}
          {effectiveBaseDiameterMm != null && (
            <div className={styles.readoutRow}>
              <span className={styles.readoutLabel}>Base</span>
              <span className={styles.readoutInputWrap}>
                <input
                  className={styles.readoutInput}
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={round1(effectiveBaseDiameterMm)}
                  onChange={(e) => handleBaseDiameterInputChange(Number(e.target.value))}
                />
                <span className={styles.dimensionUnit}>mm</span>
              </span>
            </div>
          )}
          <div className={styles.readoutRow}>
            <span className={styles.readoutLabel}>Wrap width</span>
            <span className={styles.readoutValue}>{round1(Math.PI * effectiveBodyWrapDiameterMm)} mm</span>
          </div>
          <div className={styles.readoutRow}>
            <span className={styles.readoutLabel}>Center line anchor</span>
            <span className={styles.readoutValue}>
              {effectiveTopOuterDiameterMm != null ? "visible outer diameter" : "body / wrap diameter"}
            </span>
          </div>
          {derivedZoneGuides?.straightWallHeightMm != null && derivedZoneGuides.straightWallHeightMm > 0 && (
            <div className={styles.readoutRow}>
              <span className={styles.readoutLabel}>Straight wall</span>
              <span className={styles.readoutValue}>{round1(derivedZoneGuides.straightWallHeightMm)} mm</span>
            </div>
          )}
          {effectiveLidSeamGuideMm != null && (
            <div className={styles.readoutRow}>
            <span className={styles.readoutLabel}>Lid top</span>
              <span className={styles.readoutInputWrap}>
                <input
                  className={styles.readoutInput}
                  type="number"
                  min={0}
                  max={round1(Math.max(0, Math.min(
                    clampedBodyTopFromOverallMm + 28,
                    (effectiveSilverBandGuideMm ?? clampedBodyBottomFromOverallMm) - 1,
                  )))}
                  step={0.1}
                  value={round1(effectiveLidSeamGuideMm)}
                  onChange={(e) => handleLidSeamInputChange(Number(e.target.value))}
                />
                <span className={styles.dimensionUnit}>mm</span>
              </span>
            </div>
          )}
          {effectiveSilverBandGuideMm != null && (
            <div className={styles.readoutRow}>
              <span className={styles.readoutLabel}>Silver / powder line</span>
              <span className={styles.readoutInputWrap}>
                <input
                  className={styles.readoutInput}
                  type="number"
                  min={round1(Math.max(
                    clampedBodyTopFromOverallMm + 2,
                    (effectiveLidSeamGuideMm ?? clampedBodyTopFromOverallMm) + 1,
                  ))}
                  max={round1(clampedBodyBottomFromOverallMm)}
                  step={0.1}
                  value={round1(effectiveSilverBandGuideMm)}
                  onChange={(e) => handleSilverBandInputChange(Number(e.target.value))}
                />
                <span className={styles.dimensionUnit}>mm</span>
              </span>
            </div>
          )}
          {transformedHandleOuterRect && (
            <>
              <div className={styles.readoutRow}>
                <span className={styles.readoutLabel}>Handle top</span>
                <span className={styles.readoutInputWrap}>
                  <input
                    className={styles.readoutInput}
                    type="number"
                    min={0}
                    max={round1((effectiveHandleBottomMm ?? overallHeightMm) - 8)}
                    step={0.1}
                    value={round1(effectiveHandleTopMm ?? 0)}
                    onChange={(e) => onHandleTopChange?.(round1(Number(e.target.value)))}
                  />
                  <span className={styles.dimensionUnit}>mm</span>
                </span>
              </div>
              <div className={styles.readoutRow}>
                <span className={styles.readoutLabel}>Handle bottom</span>
                <span className={styles.readoutInputWrap}>
                  <input
                    className={styles.readoutInput}
                    type="number"
                    min={round1((effectiveHandleTopMm ?? 0) + 8)}
                    max={round1(overallHeightMm)}
                    step={0.1}
                    value={round1(effectiveHandleBottomMm ?? 0)}
                    onChange={(e) => onHandleBottomChange?.(round1(Number(e.target.value)))}
                  />
                  <span className={styles.dimensionUnit}>mm</span>
                </span>
              </div>
              <div className={styles.readoutRow}>
                <span className={styles.readoutLabel}>Handle reach</span>
                <span className={styles.readoutInputWrap}>
                  <input
                    className={styles.readoutInput}
                    type="number"
                    min={0}
                    max={300}
                    step={0.1}
                    value={round1(effectiveHandleReachMm ?? 0)}
                    onChange={(e) => onHandleReachChange?.(round1(Number(e.target.value)))}
                  />
                  <span className={styles.dimensionUnit}>mm</span>
                </span>
              </div>
            </>
          )}
          <div className={styles.readoutHint}>
            The dashed frame is anchored to the visible outer diameter when known. Body / wrap diameter stays separate for wrap-width math.
          </div>
          {hasStraightWallGuide && (
            <div className={styles.guideHint}>
              The darker green band marks the traced straight-wall section before the lower taper begins.
            </div>
          )}
          <div className={styles.colorSwatchGroup}>
            <div className={styles.colorSwatchRow}>
              <span className={styles.readoutLabel}>Body color</span>
              <span className={styles.colorSwatchValue}>
                <span className={styles.colorSwatchChip} style={{ backgroundColor: bodyColorHex }} />
                <span className={styles.readoutValue}>{bodyColorHex}</span>
              </span>
            </div>
            <div className={styles.colorSwatchRow}>
              <span className={styles.readoutLabel}>Rim / engrave</span>
              <span className={styles.colorSwatchValue}>
                <span className={styles.colorSwatchChip} style={{ backgroundColor: rimColorHex }} />
                <span className={styles.readoutValue}>{rimColorHex}</span>
              </span>
            </div>
          </div>
          <div className={styles.sliderGroup}>
            <div className={styles.sliderHeader}>
              <span className={styles.readoutLabel}>Photo centering</span>
              <span className={styles.readoutValue}>{photoCenterMode === "body" ? "ignore handle" : "full photo"}</span>
            </div>
            <div className={styles.anchorButtonRow}>
              <button
                type="button"
                className={`${styles.anchorButton} ${photoCenterMode === "body" ? styles.anchorButtonActive : ""}`}
                onClick={() => onPhotoCenterModeChange("body")}
              >
                Center body
              </button>
              <button
                type="button"
                className={`${styles.anchorButton} ${photoCenterMode === "photo" ? styles.anchorButtonActive : ""}`}
                onClick={() => onPhotoCenterModeChange("photo")}
              >
                Center full photo
              </button>
            </div>
            <button
              type="button"
              className={styles.sliderReset}
              onClick={handleSnapPhotoToCenter}
              disabled={
                Math.round(clampedPhotoOffsetXPct) === 0
                && Math.round(clampedPhotoOffsetYPct) === 0
                && photoAnchorY === "center"
              }
            >
              Snap to center
            </button>
          </div>
          {hasStraightWallGuide && snappedBodyBottomFromOverallMm != null && (
            <div className={styles.sliderGroup}>
              <div className={styles.sliderHeader}>
                <span className={styles.readoutLabel}>Straight wall guide</span>
                <span className={styles.readoutValue}>bottom {snappedBodyBottomFromOverallMm} mm</span>
              </div>
              <button
                type="button"
                className={styles.sliderReset}
                onClick={handleSnapBottomToStraightWall}
                disabled={
                  snappedBodyBottomFromOverallMm == null ||
                  Math.abs(clampedBodyBottomFromOverallMm - snappedBodyBottomFromOverallMm) < 0.2
                }
              >
                Snap bottom to straight wall
              </button>
            </div>
          )}
          <div className={styles.sliderGroup}>
            <div className={styles.sliderHeader}>
              <span className={styles.readoutLabel}>Photo anchor</span>
              <span className={styles.readoutValue}>{photoAnchorY}</span>
            </div>
            <div className={styles.anchorButtonRow}>
              <button
                type="button"
                className={`${styles.anchorButton} ${photoAnchorY === "center" ? styles.anchorButtonActive : ""}`}
                onClick={() => onPhotoAnchorYChange("center")}
              >
                Center
              </button>
              <button
                type="button"
                className={`${styles.anchorButton} ${photoAnchorY === "bottom" ? styles.anchorButtonActive : ""}`}
                onClick={() => onPhotoAnchorYChange("bottom")}
              >
                Anchor Bottom
              </button>
            </div>
          </div>
          <div className={styles.sliderGroup}>
            <div className={styles.sliderHeader}>
              <span className={styles.readoutLabel}>Photo dimensions</span>
              <span className={styles.readoutValue}>{photoLockAspect ? "locked" : "independent"}</span>
            </div>
            <div className={styles.readoutHint}>
              The photo stays anchored to the visible outer-diameter frame. Body / wrap diameter remains separate for template-width math.
            </div>
            <label className={styles.lockToggle}>
              <input
                type="checkbox"
                checked={photoLockAspect}
                onChange={(e) => {
                  const locked = e.target.checked;
                  onPhotoLockAspectChange(locked);
                  if (locked) {
                    onPhotoHeightScaleChange(clampedPhotoWidthScalePct);
                  }
                }}
              />
              <span>Lock width and height</span>
            </label>
            <div className={styles.dimensionGrid}>
              <label className={styles.dimensionField}>
                <span className={styles.readoutLabel}>Photo width</span>
                <span className={styles.dimensionInputRow}>
                  <input
                    className={styles.dimensionInput}
                    type="number"
                    min={round1(basePhotoWidthMm * (MIN_PHOTO_SCALE_PCT / 100))}
                    max={round1(basePhotoWidthMm * (MAX_PHOTO_SCALE_PCT / 100))}
                    step={0.1}
                    value={photoWidthMm}
                    onChange={(e) => handlePhotoWidthMmChange(Number(e.target.value))}
                  />
                  <span className={styles.dimensionUnit}>mm</span>
                </span>
              </label>
              <label className={styles.dimensionField}>
                <span className={styles.readoutLabel}>Photo height</span>
                <span className={styles.dimensionInputRow}>
                  <input
                    className={styles.dimensionInput}
                    type="number"
                    min={round1(basePhotoHeightMm * (MIN_PHOTO_SCALE_PCT / 100))}
                    max={round1(basePhotoHeightMm * (MAX_PHOTO_SCALE_PCT / 100))}
                    step={0.1}
                    value={photoHeightMm}
                    onChange={(e) => handlePhotoHeightMmChange(Number(e.target.value))}
                  />
                  <span className={styles.dimensionUnit}>mm</span>
                </span>
              </label>
            </div>
            <div className={styles.readoutRow}>
              <span className={styles.readoutLabel}>Width scale</span>
              <span className={styles.readoutValue}>{Math.round(clampedPhotoWidthScalePct)}%</span>
            </div>
            <div className={styles.readoutRow}>
              <span className={styles.readoutLabel}>Height scale</span>
              <span className={styles.readoutValue}>{Math.round(clampedPhotoHeightScalePct)}%</span>
            </div>
            <button
              type="button"
              className={styles.sliderReset}
              onClick={handleResetPhotoDimensions}
              disabled={Math.round(clampedPhotoWidthScalePct) === 100 && Math.round(clampedPhotoHeightScalePct) === 100}
            >
              Reset dimensions
            </button>
          </div>
          <div className={styles.sliderGroup}>
            <div className={styles.sliderHeader}>
              <span className={styles.readoutLabel}>Photo X offset</span>
              <span className={styles.readoutValue}>
                {clampedPhotoOffsetXPct > 0 ? "+" : ""}
                {Math.round(clampedPhotoOffsetXPct)}%
              </span>
            </div>
            <input
              className={styles.sliderInput}
              type="range"
              min={-MAX_PHOTO_OFFSET_X_PCT}
              max={MAX_PHOTO_OFFSET_X_PCT}
              step={1}
              value={clampedPhotoOffsetXPct}
              onChange={(e) => onPhotoOffsetXChange(Number(e.target.value) || 0)}
            />
            <button
              type="button"
              className={styles.sliderReset}
              onClick={() => onPhotoOffsetXChange(0)}
              disabled={Math.round(clampedPhotoOffsetXPct) === 0}
            >
              Reset X
            </button>
          </div>
          <div className={styles.sliderGroup}>
            <div className={styles.sliderHeader}>
              <span className={styles.readoutLabel}>Photo Y offset</span>
              <span className={styles.readoutValue}>
                {clampedPhotoOffsetYPct > 0 ? "+" : ""}
                {Math.round(clampedPhotoOffsetYPct)}%
              </span>
            </div>
            <input
              className={styles.sliderInput}
              type="range"
              min={-MAX_PHOTO_OFFSET_Y_PCT}
              max={MAX_PHOTO_OFFSET_Y_PCT}
              step={1}
              value={clampedPhotoOffsetYPct}
              onChange={(e) => onPhotoOffsetYChange(Number(e.target.value) || 0)}
            />
            <button
              type="button"
              className={styles.sliderReset}
              onClick={() => onPhotoOffsetYChange(0)}
              disabled={Math.round(clampedPhotoOffsetYPct) === 0}
            >
              Reset position
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
