"use client";

import React, { useRef, useEffect, useState } from "react";
import { deriveEngravableZoneFromFitDebug } from "@/lib/engravableDimensions";
import { extractCanonicalHandleProfileFromCutout } from "@/lib/canonicalHandleProfile";
import {
  solveEditableHandleGuideGeometry,
  solveEditableHandlePreviewGeometry,
  type EditableHandlePreview,
} from "@/lib/editableHandleGeometry";
import type { PrintableSurfaceBoundarySource, PrintableSurfaceDetection } from "@/lib/printableSurface";
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
  normalizeMeasurementContour,
  removeEditableOutlinePoint,
  sortEditableOutlinePoints,
} from "@/lib/editableBodyOutline";
import type {
  CanonicalHandleProfile,
  CanonicalDimensionCalibration,
  EditableBodyOutline,
  EditableBodyOutlinePoint,
  ReferenceLayerKey,
  ReferenceLayerState,
  ReferencePaths,
} from "@/types/productTemplate";
import type { PrintableSurfaceContract } from "@/types/printableSurface";
import type { TemplatePipelineStageRecord } from "@/types/templatePipelineDiagnostics";
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
  /** Top edge of the silver ring / lid seam from the overall top (mm). */
  lidSeamFromOverallMm?: number;
  /** Bottom edge of the non-powder-coated silver band from the overall top (mm). */
  silverBandBottomFromOverallMm?: number;
  /** Top edge of the handle silhouette from the overall top (mm). */
  handleTopFromOverallMm?: number;
  /** Bottom edge of the handle silhouette from the overall top (mm). */
  handleBottomFromOverallMm?: number;
  /** Reach of the handle silhouette from the body edge to the outer edge (mm). */
  handleReachMm?: number;
  /** Y position of the visible upper outer handle corner measured from the overall top (mm). */
  handleUpperCornerFromOverallMm?: number;
  /** Y position of the visible lower outer handle corner measured from the overall top (mm). */
  handleLowerCornerFromOverallMm?: number;
  /** Reach of the visible upper outer handle corner from the body edge (mm). */
  handleUpperCornerReachMm?: number;
  /** Reach of the visible lower outer handle corner from the body edge (mm). */
  handleLowerCornerReachMm?: number;
  /** Reach of the upper horizontal transition into the handle outer side from the body edge (mm). */
  handleUpperTransitionReachMm?: number;
  /** Reach of the lower horizontal transition into the handle outer side from the body edge (mm). */
  handleLowerTransitionReachMm?: number;
  /** Y position of the upper horizontal transition into the handle outer side from the overall top (mm). */
  handleUpperTransitionFromOverallMm?: number;
  /** Y position of the lower horizontal transition into the handle outer side from the overall top (mm). */
  handleLowerTransitionFromOverallMm?: number;
  /** Body-edge anchor for the outer handle reference line measured from the overall top (mm). */
  handleOuterTopFromOverallMm?: number;
  /** Body-edge anchor for the outer handle reference line measured from the overall top (mm). */
  handleOuterBottomFromOverallMm?: number;
  /** Thickness / wall offset used to derive the outer handle contour from the inner handle line (mm). */
  handleTubeDiameterMm?: number;
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
  /** Current sampled / saved lid color */
  lidColorHex: string;
  /** Current sampled / saved rim / engrave color */
  rimColorHex: string;
  /** Traced profile details from the lookup image, when available */
  fitDebug?: TumblerItemLookupFitDebug | null;
  /** Whether lookup fitDebug crop math is valid for the currently displayed photo */
  allowFitDebugPhotoCrop?: boolean;
  canonicalHandleProfile?: CanonicalHandleProfile | null;
  canonicalBodySvgPath?: string | null;
  editableHandlePreview?: EditableHandlePreview | null;
  outlineProfile?: EditableBodyOutline;
  referencePaths?: ReferencePaths;
  referenceLayerState?: ReferenceLayerState;
  dimensionCalibration?: CanonicalDimensionCalibration;
  printableSurfaceContract?: PrintableSurfaceContract | null;
  printableTopBoundarySource?: PrintableSurfaceBoundarySource | null;
  printableTopBoundaryConfidence?: number | null;
  printableTopBoundaryWeak?: boolean;
  printableTopOverrideMm?: number;
  printableBottomOverrideMm?: number;
  onChange: (bodyTopFromOverallMm: number, bodyBottomFromOverallMm: number) => void;
  onLidSeamChange?: (fromOverallMm: number | undefined) => void;
  onSilverBandBottomChange?: (fromOverallMm: number | undefined) => void;
  onPrintableTopOverrideChange?: (fromOverallMm: number | undefined) => void;
  onPrintableBottomOverrideChange?: (fromOverallMm: number | undefined) => void;
  onPrintableSurfaceDetectionChange?: (detection: PrintableSurfaceDetection | null) => void;
  onHandleTopChange?: (fromOverallMm: number | undefined) => void;
  onHandleBottomChange?: (fromOverallMm: number | undefined) => void;
  onHandleReachChange?: (reachMm: number | undefined) => void;
  onHandleUpperCornerChange?: (fromOverallMm: number | undefined) => void;
  onHandleLowerCornerChange?: (fromOverallMm: number | undefined) => void;
  onHandleUpperCornerReachChange?: (reachMm: number | undefined) => void;
  onHandleLowerCornerReachChange?: (reachMm: number | undefined) => void;
  onHandleUpperTransitionReachChange?: (reachMm: number | undefined) => void;
  onHandleLowerTransitionReachChange?: (reachMm: number | undefined) => void;
  onHandleUpperTransitionChange?: (fromOverallMm: number | undefined) => void;
  onHandleLowerTransitionChange?: (fromOverallMm: number | undefined) => void;
  onHandleOuterTopChange?: (fromOverallMm: number | undefined) => void;
  onHandleOuterBottomChange?: (fromOverallMm: number | undefined) => void;
  onHandleTubeDiameterChange?: (diameterMm: number | undefined) => void;
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
  colorResampleRequestKey?: number;
  onColorsChange: (sample: {
    bodyColorHex?: string | null;
    lidColorHex?: string | null;
    rimColorHex?: string | null;
  }) => void;
  onBaseDiameterDerived?: (diameterMm: number) => void;
  onDiameterChange?: (diameterMm: number) => void;
  onTopOuterDiameterChange?: (diameterMm: number) => void;
  onBaseDiameterChange?: (diameterMm: number) => void;
  onOutlineProfileChange?: (outline: EditableBodyOutline | undefined) => void;
  onReferencePathsChange?: (paths: ReferencePaths) => void;
  onOutlineSeedModeChange?: (mode: "fresh-image-trace" | "saved-outline" | "fit-debug-fallback") => void;
  onReferenceLayerStateChange?: (state: ReferenceLayerState) => void;
  onPipelineStage?: (stage: TemplatePipelineStageRecord) => void;
}

type DisplayPhotoRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DisplayPhotoBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

type DisplayPhotoState = {
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
  rimDetectionSource: PrintableSurfaceDetection["source"];
  rimDetectionConfidence: number;
  bodyOutlinePath: string | null;
  bodyOutlineBounds: DisplayPhotoBounds | null;
  tracedBodyOutlinePath: string | null;
  handleOuterPath: string | null;
  handleInnerPath: string | null;
  handleSide: "left" | "right" | null;
  handleOuterRect: DisplayPhotoRect | null;
  handleInnerRect: DisplayPhotoRect | null;
  topOuterWidthPx: number | null;
  baseWidthPx: number | null;
};

/** Display height for the editor canvas in px */
const DEFAULT_CANVAS_HEIGHT = 320;
/** Minimum margin in mm */
const MIN_MARGIN_MM = 0;
/** How much of the editor height the visible tumbler should occupy */
const VISIBLE_TUMBLER_HEIGHT_PCT = 0.98;
/** Display-only zoom-out so the full body-reference photo fits comfortably in the panel. */
const BODY_REFERENCE_DISPLAY_FIT_PCT = 0.92;
const BODY_REFERENCE_MAX_VISIBLE_HEIGHT_PCT = 0.98;
const MIN_PHOTO_SCALE_PCT = 60;
const MAX_PHOTO_SCALE_PCT = 180;
const MAX_PHOTO_OFFSET_Y_PCT = 25;
const MAX_PHOTO_OFFSET_X_PCT = 25;
const MIN_AUTO_RIM_DETECTION_CONFIDENCE = 0.45;
const HANDLE_GUIDE_REACH_FACTOR = 0.78;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function approximatelyEqual(a: number | null | undefined, b: number | null | undefined, epsilon = 0.01): boolean {
  if (a == null || b == null) return a == null && b == null;
  return Math.abs(a - b) <= epsilon;
}

function displayPhotoRectEquals(a: DisplayPhotoRect | null, b: DisplayPhotoRect | null, epsilon = 0.01): boolean {
  if (!a || !b) return a === b;
  return (
    approximatelyEqual(a.x, b.x, epsilon) &&
    approximatelyEqual(a.y, b.y, epsilon) &&
    approximatelyEqual(a.width, b.width, epsilon) &&
    approximatelyEqual(a.height, b.height, epsilon)
  );
}

function displayPhotoBoundsEquals(a: DisplayPhotoBounds | null, b: DisplayPhotoBounds | null, epsilon = 0.01): boolean {
  if (!a || !b) return a === b;
  return (
    approximatelyEqual(a.minX, b.minX, epsilon) &&
    approximatelyEqual(a.minY, b.minY, epsilon) &&
    approximatelyEqual(a.maxX, b.maxX, epsilon) &&
    approximatelyEqual(a.maxY, b.maxY, epsilon) &&
    approximatelyEqual(a.width, b.width, epsilon) &&
    approximatelyEqual(a.height, b.height, epsilon)
  );
}

function displayPhotoEquals(a: DisplayPhotoState | null, b: DisplayPhotoState | null, epsilon = 0.01): boolean {
  if (!a || !b) return a === b;
  return (
    a.src === b.src &&
    approximatelyEqual(a.w, b.w, epsilon) &&
    approximatelyEqual(a.h, b.h, epsilon) &&
    approximatelyEqual(a.bodyCenterX, b.bodyCenterX, epsilon) &&
    approximatelyEqual(a.referenceBodyWidthPx, b.referenceBodyWidthPx, epsilon) &&
    approximatelyEqual(a.referenceBandCenterY, b.referenceBandCenterY, epsilon) &&
    approximatelyEqual(a.bodyTopY, b.bodyTopY, epsilon) &&
    approximatelyEqual(a.bodyBottomY, b.bodyBottomY, epsilon) &&
    approximatelyEqual(a.rimTopY, b.rimTopY, epsilon) &&
    approximatelyEqual(a.rimBottomY, b.rimBottomY, epsilon) &&
    a.rimDetectionSource === b.rimDetectionSource &&
    approximatelyEqual(a.rimDetectionConfidence, b.rimDetectionConfidence, epsilon) &&
    a.bodyOutlinePath === b.bodyOutlinePath &&
    displayPhotoBoundsEquals(a.bodyOutlineBounds, b.bodyOutlineBounds, epsilon) &&
    a.tracedBodyOutlinePath === b.tracedBodyOutlinePath &&
    a.handleOuterPath === b.handleOuterPath &&
    a.handleInnerPath === b.handleInnerPath &&
    a.handleSide === b.handleSide &&
    displayPhotoRectEquals(a.handleOuterRect, b.handleOuterRect, epsilon) &&
    displayPhotoRectEquals(a.handleInnerRect, b.handleInnerRect, epsilon) &&
    approximatelyEqual(a.topOuterWidthPx, b.topOuterWidthPx, epsilon) &&
    approximatelyEqual(a.baseWidthPx, b.baseWidthPx, epsilon)
  );
}

function stableSerialize(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "null";
  } catch {
    return "__unserializable__";
  }
}

function editableOutlineSignature(outline: EditableBodyOutline | null | undefined): string {
  if (!outline) return "__none__";
  return stableSerialize({
    closed: outline.closed,
    version: outline.version ?? 1,
    points: outline.points.map((point) => ({
      x: round1(point.x),
      y: round1(point.y),
      role: point.role ?? null,
      pointType: point.pointType ?? null,
      inHandle: point.inHandle
        ? { x: round1(point.inHandle.x), y: round1(point.inHandle.y) }
        : null,
      outHandle: point.outHandle
        ? { x: round1(point.outHandle.x), y: round1(point.outHandle.y) }
        : null,
    })),
    directContour: outline.directContour?.map((point) => ({
      x: round1(point.x),
      y: round1(point.y),
    })) ?? null,
    sourceContour: outline.sourceContour?.map((point) => ({
      x: round1(point.x),
      y: round1(point.y),
    })) ?? null,
    sourceContourViewport: outline.sourceContourViewport
      ? {
          minX: round1(outline.sourceContourViewport.minX),
          minY: round1(outline.sourceContourViewport.minY),
          width: round1(outline.sourceContourViewport.width),
          height: round1(outline.sourceContourViewport.height),
        }
      : null,
    sourceContourBounds: outline.sourceContourBounds
      ? {
          minX: round1(outline.sourceContourBounds.minX),
          minY: round1(outline.sourceContourBounds.minY),
          maxX: round1(outline.sourceContourBounds.maxX),
          maxY: round1(outline.sourceContourBounds.maxY),
          width: round1(outline.sourceContourBounds.width),
          height: round1(outline.sourceContourBounds.height),
        }
      : null,
    sourceContourMode: outline.sourceContourMode ?? null,
  });
}

function referencePathsSignature(paths: ReferencePaths): string {
  return stableSerialize({
    bodyOutline: editableOutlineSignature(paths.bodyOutline),
    lidProfile: editableOutlineSignature(paths.lidProfile),
    silverProfile: editableOutlineSignature(paths.silverProfile),
  });
}

function referenceLayerStateSignature(state: ReferenceLayerState): string {
  return stableSerialize(state);
}

function parseOptionalMmInput(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? round1(parsed) : undefined;
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (value: number) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function sampleRegionColor(
  imageData: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  x: number,
  y: number,
  width: number,
  height: number,
  mode: "average" | "bright" = "average",
): string | null {
  const sx = Math.max(0, Math.floor(x));
  const sy = Math.max(0, Math.floor(y));
  const sw = Math.max(1, Math.min(Math.floor(width), Math.max(1, canvasWidth - sx)));
  const sh = Math.max(1, Math.min(Math.floor(height), Math.max(1, canvasHeight - sy)));
  const samples: Array<{ r: number; g: number; b: number; l: number }> = [];

  for (let row = 0; row < sh; row += 1) {
    const rowOffset = ((sy + row) * canvasWidth + sx) * 4;
    for (let col = 0; col < sw; col += 1) {
      const index = rowOffset + (col * 4);
      const alpha = imageData[index + 3];
      if (alpha <= 20) continue;
      const r = imageData[index];
      const g = imageData[index + 1];
      const b = imageData[index + 2];
      const l = r * 0.2126 + g * 0.7152 + b * 0.0722;
      samples.push({ r, g, b, l });
    }
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

function findYSegments(rows: number[]): Array<{ start: number; end: number }> {
  if (rows.length === 0) return [];
  const sorted = [...rows].sort((a, b) => a - b);
  const segments: Array<{ start: number; end: number }> = [];
  let current = { start: sorted[0] ?? 0, end: sorted[0] ?? 0 };
  for (let index = 1; index < sorted.length; index += 1) {
    const y = sorted[index] ?? 0;
    if (y - current.end <= 2) {
      current.end = y;
      continue;
    }
    segments.push(current);
    current = { start: y, end: y };
  }
  segments.push(current);
  return segments;
}

function detectRimBandRows(args: {
  imageData: Uint8ClampedArray;
  width: number;
  height: number;
  bodyCenterX: number;
  referenceBodyWidthPx: number;
  referenceBandCenterY?: number | null;
  bodyTopY: number;
  bodyBottomY: number;
  fitDebugRatios?: { top: number; bottom: number } | null;
}): {
  rimTopY: number | null;
  rimBottomY: number | null;
  rimDetectionSource: PrintableSurfaceDetection["source"];
  rimDetectionConfidence: number;
} {
  const {
    imageData,
    width,
    height,
    bodyCenterX,
    referenceBodyWidthPx,
    referenceBandCenterY,
    bodyTopY,
    bodyBottomY,
    fitDebugRatios,
  } = args;

  const bodyHeightPx = Math.max(1, bodyBottomY - bodyTopY);
  const fitDebugBand = fitDebugRatios
    ? {
        rimTopY: clamp(bodyTopY + (fitDebugRatios.top * bodyHeightPx), 0, height - 1),
        rimBottomY: clamp(bodyTopY + (fitDebugRatios.bottom * bodyHeightPx), 0, height - 1),
        rimDetectionSource: "fit-debug" as PrintableSurfaceDetection["source"],
        rimDetectionConfidence: 0.92,
      }
    : null;

  const centralBodyLeft = clamp(Math.round(bodyCenterX - (referenceBodyWidthPx * 0.24)), 0, width - 1);
  const centralBodyRight = clamp(Math.round(bodyCenterX + (referenceBodyWidthPx * 0.24)), centralBodyLeft + 1, width - 1);
  const rowStats = new Map<number, { luminance: number; saturation: number; coverage: number; luminanceStdDev: number }>();
  const sampleRowStats = (y: number): { luminance: number; saturation: number; coverage: number; luminanceStdDev: number } | null => {
    const cached = rowStats.get(y);
    if (cached) return cached;
    let luminanceTotal = 0;
    let saturationTotal = 0;
    let luminanceSqTotal = 0;
    let samples = 0;
    for (let x = centralBodyLeft; x <= centralBodyRight; x += 1) {
      const index = (Math.round(y) * width + x) * 4;
      const alpha = imageData[index + 3] ?? 0;
      if (alpha < 10) continue;
      const r = imageData[index] ?? 0;
      const g = imageData[index + 1] ?? 0;
      const b = imageData[index + 2] ?? 0;
      const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
      luminanceTotal += luminance;
      luminanceSqTotal += luminance * luminance;
      saturationTotal += rgbToSaturation(r, g, b);
      samples += 1;
    }
    if (samples < Math.max(6, (centralBodyRight - centralBodyLeft) * 0.4)) return null;
    const stats = {
      luminance: luminanceTotal / samples,
      saturation: saturationTotal / samples,
      coverage: samples / Math.max(1, centralBodyRight - centralBodyLeft + 1),
      luminanceStdDev: Math.sqrt(
        Math.max(
          0,
          (luminanceSqTotal / samples) - Math.pow(luminanceTotal / samples, 2),
        ),
      ),
    };
    rowStats.set(y, stats);
    return stats;
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
  const baselineLuminanceStdDev = bodyBaselineStats.length > 0
    ? medianNumber(bodyBaselineStats.map((stats) => stats.luminanceStdDev))
    : 0;

  const reflectiveMetallicRows: number[] = [];
  const metallicRows: number[] = [];
  const brightMetallicRows: number[] = [];
  for (
    let y = Math.max(0, Math.round(bodyTopY - (bodyHeightPx * 0.05)));
    y <= Math.min(height - 1, Math.round(bodyTopY + (bodyHeightPx * 0.16)));
    y += 1
  ) {
    const stats = sampleRowStats(y);
    if (!stats) continue;
    const looksMetallic =
      stats.coverage >= 0.55 &&
      stats.saturation <= Math.max(0.18, baselineSaturation * 0.58) &&
      stats.luminance >= Math.max(102, baselineLuminance * 0.74);
    if (looksMetallic) metallicRows.push(y);

    const looksReflectiveMetallic =
      looksMetallic &&
      stats.luminanceStdDev >= Math.max(18, baselineLuminanceStdDev * 1.7);
    if (looksReflectiveMetallic) reflectiveMetallicRows.push(y);

    const looksBrightMetallic =
      looksMetallic &&
      stats.luminance >= Math.max(150, baselineLuminance * 0.96) &&
      stats.luminanceStdDev >= Math.max(12, baselineLuminanceStdDev * 1.15);
    if (looksBrightMetallic) brightMetallicRows.push(y);
  }

  const bandTargetY = referenceBandCenterY
    ?? (fitDebugBand ? (fitDebugBand.rimTopY + fitDebugBand.rimBottomY) / 2 : bodyTopY + (bodyHeightPx * 0.14));
  const pickSeedBand = (segments: Array<{ start: number; end: number }>) => {
    if (segments.length === 0) return null;
    return [...segments].sort((a, b) => {
      const aCenter = (a.start + a.end) / 2;
      const bCenter = (b.start + b.end) / 2;
      const aDistance = Math.abs(aCenter - bandTargetY);
      const bDistance = Math.abs(bCenter - bandTargetY);
      if (Math.abs(aDistance - bDistance) > 1) return aDistance - bDistance;
      return (b.end - b.start) - (a.end - a.start);
    })[0] ?? null;
  };
  const reflectiveSegments = findYSegments(reflectiveMetallicRows);
  const brightSegments = findYSegments(brightMetallicRows);
  const metallicSegments = findYSegments(metallicRows);
  const seedBand =
    pickSeedBand(reflectiveSegments)
    ?? pickSeedBand(brightSegments)
    ?? pickSeedBand(metallicSegments);
  const qualifiesAsRimEdge = (y: number) => {
    const stats = sampleRowStats(y);
    if (!stats) return false;
    return (
      stats.coverage >= 0.55 &&
      stats.saturation <= Math.max(0.14, baselineSaturation * 0.95) &&
      stats.luminance >= Math.max(96, baselineLuminance * 0.7) &&
      stats.luminanceStdDev >= Math.max(13, baselineLuminanceStdDev * 1.0)
    );
  };
  const metallicBand = seedBand
    ? (() => {
        let start = seedBand.start;
        let end = seedBand.end;
        while (start - 1 >= Math.max(0, Math.round(bodyTopY - (bodyHeightPx * 0.05))) && qualifiesAsRimEdge(start - 1)) {
          start -= 1;
        }
        while (end + 1 <= Math.min(height - 1, Math.round(bodyTopY + (bodyHeightPx * 0.18))) && qualifiesAsRimEdge(end + 1)) {
          end += 1;
        }
        return { start, end };
      })()
    : null;
  if (metallicBand) {
    const photoConfidence = clamp(
      (metallicBand.end - metallicBand.start + 1) / Math.max(6, bodyHeightPx * 0.08),
      0.45,
      0.82,
    );
    const fitAgreement = fitDebugBand
      ? 1 - clamp(
        (
          Math.abs(fitDebugBand.rimTopY - metallicBand.start)
          + Math.abs(fitDebugBand.rimBottomY - metallicBand.end)
        ) / Math.max(10, bodyHeightPx * 0.08),
        0,
        1,
      )
      : null;
    const preferFitDebugBand = fitDebugBand != null && (
      photoConfidence <= 0.58 ||
      (fitAgreement != null && fitAgreement >= 0.35)
    );
    if (preferFitDebugBand) {
      const useBlendedBand = fitAgreement != null && fitAgreement >= 0.55 && photoConfidence >= 0.6;
      return {
        rimTopY: useBlendedBand
          ? clamp(
            Math.round((fitDebugBand.rimTopY * 0.72) + (metallicBand.start * 0.28)),
            0,
            height - 1,
          )
          : fitDebugBand.rimTopY,
        rimBottomY: useBlendedBand
          ? clamp(
            Math.round((fitDebugBand.rimBottomY * 0.72) + (metallicBand.end * 0.28)),
            0,
            height - 1,
          )
          : fitDebugBand.rimBottomY,
        rimDetectionSource: "fit-debug",
        rimDetectionConfidence: clamp(
          fitAgreement != null
            ? Math.max(0.78, (fitAgreement * 0.72) + (photoConfidence * 0.28))
            : 0.82,
          0.78,
          0.94,
        ),
      };
    }
    return {
      rimTopY: metallicBand.start,
      rimBottomY: metallicBand.end,
      rimDetectionSource: "photo-row-scan",
      rimDetectionConfidence: fitAgreement != null
        ? clamp((photoConfidence * 0.88) + (fitAgreement * 0.12), 0.45, 0.88)
        : photoConfidence,
    };
  }

  if (fitDebugBand) {
    return fitDebugBand;
  }

  return {
    rimTopY: null,
    rimBottomY: null,
    rimDetectionSource: "none",
    rimDetectionConfidence: 0,
  };
}

function buildClosedPath(points: Array<{ x: number; y: number }>): string | null {
  if (points.length < 4) return null;
  return `M ${points
    .map((point, index) => `${index === 0 ? "" : "L "}${round1(point.x)} ${round1(point.y)}`)
    .join(" ")} Z`;
}

function buildOpenPath(points: Array<{ x: number; y: number }>): string | null {
  if (points.length < 2) return null;
  return `M ${points
    .map((point, index) => `${index === 0 ? "" : "L "}${round1(point.x)} ${round1(point.y)}`)
    .join(" ")}`;
}

function parseLinearPathPoints(path: string | null): {
  points: Array<{ x: number; y: number }>;
  closed: boolean;
} | null {
  if (!path) return null;
  const tokens = path.trim().split(/\s+/);
  const points: Array<{ x: number; y: number }> = [];
  let closed = false;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    if (token === "M" || token === "L") {
      const x = Number(tokens[index + 1]);
      const y = Number(tokens[index + 2]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      points.push({ x, y });
      index += 2;
      continue;
    }
    if (token === "Z") {
      closed = true;
      continue;
    }
    const x = Number(token);
    const y = Number(tokens[index + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    points.push({ x, y });
    index += 1;
  }
  return points.length >= 2 ? { points, closed } : null;
}

function smoothDisplayOutlinePath(path: string | null): string | null {
  const parsed = parseLinearPathPoints(path);
  if (!parsed || !parsed.closed || parsed.points.length < 12) return path;

  const { points } = parsed;
  const minY = points.reduce((min, point) => Math.min(min, point.y), Number.POSITIVE_INFINITY);
  const maxY = points.reduce((max, point) => Math.max(max, point.y), Number.NEGATIVE_INFINITY);
  const preserveBandPx = clamp((maxY - minY) * 0.025, 3, 10);
  const preserved = points.map((point) => (
    Math.abs(point.y - minY) <= preserveBandPx ||
    Math.abs(point.y - maxY) <= preserveBandPx
  ));
  let smoothed = points.map((point) => ({ x: point.x, y: point.y }));

  for (let pass = 0; pass < 2; pass += 1) {
    smoothed = smoothed.map((point, index) => {
      if (preserved[index]) {
        return { x: round1(points[index].x), y: round1(points[index].y) };
      }

      let weightedX = 0;
      let totalWeight = 0;
      for (let offset = -3; offset <= 3; offset += 1) {
        const sampleIndex = (index + offset + smoothed.length) % smoothed.length;
        const sample = smoothed[sampleIndex];
        const weight = 4 - Math.abs(offset);
        weightedX += sample.x * weight;
        totalWeight += weight;
      }

      return {
        x: round1(weightedX / Math.max(1, totalWeight)),
        y: round1(points[index].y),
      };
    });
  }

  return buildClosedPath(smoothed);
}

function translateLinearPath(path: string | null, dx: number, dy: number): string | null {
  if (!path) return null;
  const tokens = path.trim().split(/\s+/);
  const translated: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    if (token === "M" || token === "L" || token === "Z") {
      translated.push(token);
      continue;
    }
    const x = Number(token);
    const y = Number(tokens[index + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      translated.push(token);
      continue;
    }
    translated.push(`${round1(x + dx)}`, `${round1(y + dy)}`);
    index += 1;
  }
  return translated.join(" ");
}

function invertAffineLinearPath(path: string | null, matrix: readonly number[] | null | undefined): string | null {
  if (!path || !matrix || matrix.length < 6) return null;
  const [a = 1, b = 0, tx = 0, c = 0, d = 1, ty = 0] = matrix;
  const determinant = (a * d) - (b * c);
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-6) return null;

  const tokens = path.trim().split(/\s+/);
  const transformed: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    if (token === "M" || token === "L" || token === "Z") {
      transformed.push(token);
      continue;
    }
    const x = Number(token);
    const y = Number(tokens[index + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      transformed.push(token);
      continue;
    }
    const translatedX = x - tx;
    const translatedY = y - ty;
    const sourceX = ((d * translatedX) - (b * translatedY)) / determinant;
    const sourceY = ((a * translatedY) - (c * translatedX)) / determinant;
    transformed.push(`${round1(sourceX)}`, `${round1(sourceY)}`);
    index += 1;
  }
  return transformed.join(" ");
}

function translateDisplayPhotoBounds(
  bounds: DisplayPhotoBounds | null | undefined,
  dx: number,
  dy: number,
): DisplayPhotoBounds | null {
  if (!bounds) return null;
  return {
    minX: round1(bounds.minX + dx),
    minY: round1(bounds.minY + dy),
    maxX: round1(bounds.maxX + dx),
    maxY: round1(bounds.maxY + dy),
    width: round1(bounds.width),
    height: round1(bounds.height),
  };
}

function translateDisplayPhotoRect(
  rect: DisplayPhotoRect | null | undefined,
  dx: number,
  dy: number,
): DisplayPhotoRect | null {
  if (!rect) return null;
  return {
    x: round1(rect.x + dx),
    y: round1(rect.y + dy),
    width: round1(rect.width),
    height: round1(rect.height),
  };
}

function buildAnchoredHandleGuidePath(args: {
  attachX: number;
  topY: number;
  bottomY: number;
  upperEntryX: number;
  upperEntryY: number;
  lowerExitX: number;
  lowerExitY: number;
  upperCornerX: number;
  upperCornerY: number;
  lowerCornerX: number;
  lowerCornerY: number;
}): string {
  const {
    attachX,
    topY,
    bottomY,
    upperEntryX,
    upperEntryY,
    lowerExitX,
    lowerExitY,
    upperCornerX,
    upperCornerY,
    lowerCornerX,
    lowerCornerY,
  } = args;
  const resolvedAttachX = round1(attachX);
  const resolvedTopY = round1(topY);
  const resolvedBottomY = round1(bottomY);
  const resolvedUpperEntryX = round1(upperEntryX);
  const resolvedUpperEntryY = round1(upperEntryY);
  const resolvedLowerExitX = round1(lowerExitX);
  const resolvedLowerExitY = round1(lowerExitY);
  const resolvedUpperCornerX = round1(upperCornerX);
  const resolvedUpperCornerY = round1(upperCornerY);
  const resolvedLowerCornerX = round1(lowerCornerX);
  const resolvedLowerCornerY = round1(lowerCornerY);
  return [
    `M ${resolvedAttachX} ${resolvedTopY}`,
    `L ${resolvedUpperEntryX} ${resolvedUpperEntryY}`,
    `Q ${resolvedUpperCornerX} ${resolvedUpperEntryY} ${resolvedUpperCornerX} ${resolvedUpperCornerY}`,
    `L ${resolvedLowerCornerX} ${resolvedLowerCornerY}`,
    `Q ${resolvedLowerCornerX} ${resolvedLowerExitY} ${resolvedLowerExitX} ${resolvedLowerExitY}`,
    `L ${resolvedAttachX} ${resolvedBottomY}`,
  ].join(" ");
}

type HandleGuidePoint = {
  x: number;
  y: number;
};

function offsetHandleGuidePoint(args: {
  point: HandleGuidePoint;
  from: HandleGuidePoint;
  to: HandleGuidePoint;
  side: "left" | "right";
  offsetPx: number;
}): HandleGuidePoint {
  const {
    point,
    from,
    to,
    side,
    offsetPx,
  } = args;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const normalX = side === "right" ? (dy / length) : (-dy / length);
  const normalY = side === "right" ? (-dx / length) : (dx / length);
  return {
    x: round1(point.x + (normalX * offsetPx)),
    y: round1(point.y + (normalY * offsetPx)),
  };
}

function buildOffsetHandleGuideGeometry(args: {
  side: "left" | "right";
  offsetPx: number;
  attachX: number;
  topY: number;
  bottomY: number;
  upperEntryX: number;
  upperEntryY: number;
  lowerExitX: number;
  lowerExitY: number;
  upperCornerX: number;
  upperCornerY: number;
  lowerCornerX: number;
  lowerCornerY: number;
}) {
  const solved = solveEditableHandleGuideGeometry({
    side: args.side,
    outerOffset: args.offsetPx,
    inner: {
      attachTop: { x: args.attachX, y: args.topY },
      upperTransition: { x: args.upperEntryX, y: args.upperEntryY },
      upperCorner: { x: args.upperCornerX, y: args.upperCornerY },
      lowerCorner: { x: args.lowerCornerX, y: args.lowerCornerY },
      lowerTransition: { x: args.lowerExitX, y: args.lowerExitY },
      attachBottom: { x: args.attachX, y: args.bottomY },
    },
  });

  return {
    path: solved.outerPath,
    attachPoints: {
      top: {
        x: solved.outerPoints.attachTop.x,
        y: solved.outerPoints.attachTop.y,
      },
      bottom: {
        x: solved.outerPoints.attachBottom.x,
        y: solved.outerPoints.attachBottom.y,
      },
    },
  };
}

function buildAnchoredHandleGuideFromRect(args: {
  side: "left" | "right";
  attachX: number;
  topY: number;
  bottomY: number;
  farX: number;
}) {
  const { side, attachX, topY, bottomY, farX } = args;
  const width = Math.max(6, Math.abs(farX - attachX));
  const height = Math.max(10, bottomY - topY);
  const radius = clamp(
    Math.min(width * 0.42, height * 0.22),
    3,
    Math.max(3, Math.min(width * 0.48, height * 0.28)),
  );
  const sideSign = side === "right" ? 1 : -1;
  const upperTransition = {
    x: round1(farX - (sideSign * radius)),
    y: round1(topY),
  };
  const lowerTransition = {
    x: round1(farX - (sideSign * radius)),
    y: round1(bottomY),
  };
  const upperCorner = {
    x: round1(farX),
    y: round1(topY + radius),
  };
  const lowerCorner = {
    x: round1(farX),
    y: round1(bottomY - radius),
  };

  return {
    path: buildAnchoredHandleGuidePath({
      attachX,
      topY,
      bottomY,
      upperEntryX: upperTransition.x,
      upperEntryY: upperTransition.y,
      lowerExitX: lowerTransition.x,
      lowerExitY: lowerTransition.y,
      upperCornerX: upperCorner.x,
      upperCornerY: upperCorner.y,
      lowerCornerX: lowerCorner.x,
      lowerCornerY: lowerCorner.y,
    }),
    attachPoints: {
      x: round1(attachX),
      topY: round1(topY),
      bottomY: round1(bottomY),
    },
    transitionPoints: {
      upper: upperTransition,
      lower: lowerTransition,
    },
    cornerPoints: {
      upper: upperCorner,
      lower: lowerCorner,
    },
  };
}

function pickTallestRect<T extends { height: number }>(rects: Array<T | null | undefined>): T | null {
  const candidates = rects.filter((rect): rect is T => rect != null && Number.isFinite(rect.height) && rect.height > 0);
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => b.height - a.height)[0] ?? null;
}

function findMaskSegments(mask: Uint8Array, width: number, y: number): AlphaSegment[] {
  const segments: AlphaSegment[] = [];
  const rowOffset = y * width;
  let start = -1;
  for (let x = 0; x < width; x += 1) {
    if (mask[rowOffset + x] === 1) {
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

type LowerBodyRow = {
  y: number;
  bodyLeft: number;
  bodyRight: number;
  coreWidth: number;
  segmentLeft?: number;
  segmentRight?: number;
};

function createForegroundMask(imageData: ImageData): Uint8Array {
  const { data, width, height } = imageData;
  const totalPixels = Math.max(1, width * height);
  let transparentPixels = 0;
  for (let index = 3; index < data.length; index += 4) {
    if ((data[index] ?? 255) < 245) {
      transparentPixels += 1;
    }
  }
  const hasTransparency = transparentPixels > totalPixels * 0.01;
  const background = hasTransparency ? null : estimateBackgroundColor(data, width, height);
  const mask = new Uint8Array(width * height);
  for (let index = 0; index < width * height; index += 1) {
    const dataIndex = index * 4;
    const alpha = data[dataIndex + 3] ?? 255;
    const r = data[dataIndex] ?? 0;
    const g = data[dataIndex + 1] ?? 0;
    const b = data[dataIndex + 2] ?? 0;
    mask[index] = hasTransparency
      ? (alpha > 8 ? 1 : 0)
      : (alpha > 8 && background != null && colorDistance(r, g, b, background) > 22 ? 1 : 0);
  }
  return mask;
}

function createContourMask(
  width: number,
  height: number,
  contour: Array<{ x: number; y: number }>,
): Uint8Array {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const mask = new Uint8Array(width * height);
  if (!ctx || contour.length < 3) {
    return mask;
  }
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  contour.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.closePath();
  ctx.fill();
  const imageData = ctx.getImageData(0, 0, width, height).data;
  for (let index = 0; index < width * height; index += 1) {
    mask[index] = imageData[(index * 4) + 3] > 0 ? 1 : 0;
  }
  return mask;
}

function buildBodyRowsFromMask(mask: Uint8Array, width: number, height: number): LowerBodyRow[] {
  const rows: LowerBodyRow[] = [];
  for (let y = 0; y < height; y += 1) {
    const segments = findMaskSegments(mask, width, y);
    if (segments.length === 0) continue;
    const dominantSegment = [...segments].sort((a, b) => b.width - a.width)[0];
    if (!dominantSegment) continue;
    rows.push({
      y,
      bodyLeft: dominantSegment.left,
      bodyRight: dominantSegment.right,
      coreWidth: dominantSegment.width,
      segmentLeft: dominantSegment.left,
      segmentRight: dominantSegment.right,
    });
  }
  return rows;
}

function deriveHandleTraceFromImage(args: {
  imageData: ImageData;
  bodyContour: Array<{ x: number; y: number }>;
  handleSideHint?: "left" | "right" | null;
}): {
  outerPath: string | null;
  innerPath: string | null;
  outerRect: { x: number; y: number; width: number; height: number } | null;
  innerRect: { x: number; y: number; width: number; height: number } | null;
  handleSide: "left" | "right" | null;
} {
  const { imageData, bodyContour, handleSideHint } = args;
  if (bodyContour.length < 3) {
    return {
      outerPath: null,
      innerPath: null,
      outerRect: null,
      innerRect: null,
      handleSide: handleSideHint ?? null,
    };
  }

  const foregroundMask = createForegroundMask(imageData);
  const bodyMask = createContourMask(imageData.width, imageData.height, bodyContour);
  const bodyRows = buildBodyRowsFromMask(bodyMask, imageData.width, imageData.height);
  if (bodyRows.length < 8) {
    return {
      outerPath: null,
      innerPath: null,
      outerRect: null,
      innerRect: null,
      handleSide: handleSideHint ?? null,
    };
  }

  let leftMass = 0;
  let rightMass = 0;
  for (const row of bodyRows) {
    const rowOffset = row.y * imageData.width;
    for (let x = 0; x < row.bodyLeft; x += 1) {
      leftMass += foregroundMask[rowOffset + x] === 1 ? 1 : 0;
    }
    for (let x = row.bodyRight + 1; x < imageData.width; x += 1) {
      rightMass += foregroundMask[rowOffset + x] === 1 ? 1 : 0;
    }
  }

  const handleSide = handleSideHint ?? (rightMass >= leftMass ? "right" : "left");
  const handleRows: Array<LowerBodyRow & { extension: number }> = [];
  for (const row of bodyRows) {
    const segments = findMaskSegments(foregroundMask, imageData.width, row.y);
    const sideSegments = handleSide === "right"
      ? segments.filter((segment) => segment.left > row.bodyRight + 1)
      : segments.filter((segment) => segment.right < row.bodyLeft - 1);
    if (sideSegments.length === 0) continue;
    const chosen = [...sideSegments].sort((a, b) => {
      const distanceA = handleSide === "right" ? (a.left - row.bodyRight) : (row.bodyLeft - a.right);
      const distanceB = handleSide === "right" ? (b.left - row.bodyRight) : (row.bodyLeft - b.right);
      if (Math.abs(distanceA - distanceB) > 0.001) return distanceA - distanceB;
      return b.width - a.width;
    })[0];
    if (!chosen) continue;
    handleRows.push({
      ...row,
      segmentLeft: chosen.left,
      segmentRight: chosen.right,
      extension: handleSide === "right" ? chosen.right - row.bodyRight : row.bodyLeft - chosen.left,
    });
  }

  if (handleRows.length < 6) {
    return {
      outerPath: null,
      innerPath: null,
      outerRect: null,
      innerRect: null,
      handleSide,
    };
  }

  const peakExtension = percentileNumber(handleRows.map((row) => row.extension), 0.92);
  const threshold = Math.max(4, peakExtension * 0.14);
  const candidateSegment = findLongestYSegment(handleRows.map((row) => row.y));
  if (!candidateSegment) {
    return {
      outerPath: null,
      innerPath: null,
      outerRect: null,
      innerRect: null,
      handleSide,
    };
  }

  const tracedRows = handleRows
    .filter((row) => row.y >= candidateSegment.start && row.y <= candidateSegment.end)
    .filter((row) => row.extension >= threshold);
  const handleTrace = buildHandleTraceFromRows({
    rows: tracedRows,
    handleSide,
    handleStartY: candidateSegment.start,
    handleEndY: candidateSegment.end,
  });

  return {
    ...handleTrace,
    handleSide,
  };
}

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
  const innerGuidePoints = holeRows.length > 1
    ? (handleSide === "right"
      ? [
          { x: holeRows[0]!.leftX, y: holeRows[0]!.y },
          { x: holeRows[0]!.rightX, y: holeRows[0]!.y },
          ...holeRows.slice(1, -1).map((row) => ({ x: row.rightX, y: row.y })),
          { x: holeRows[holeRows.length - 1]!.rightX, y: holeRows[holeRows.length - 1]!.y },
          { x: holeRows[holeRows.length - 1]!.leftX, y: holeRows[holeRows.length - 1]!.y },
        ]
      : [
          { x: holeRows[0]!.rightX, y: holeRows[0]!.y },
          { x: holeRows[0]!.leftX, y: holeRows[0]!.y },
          ...holeRows.slice(1, -1).map((row) => ({ x: row.leftX, y: row.y })),
          { x: holeRows[holeRows.length - 1]!.leftX, y: holeRows[holeRows.length - 1]!.y },
          { x: holeRows[holeRows.length - 1]!.rightX, y: holeRows[holeRows.length - 1]!.y },
        ])
    : [];
  const innerPath = buildOpenPath(innerGuidePoints);

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
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  bodyCenterX: number;
  referenceBodyWidthPx: number;
  referenceBandCenterY: number;
  bodyTopY: number;
  bodyBottomY: number;
  rimTopY: number | null;
  rimBottomY: number | null;
  rimDetectionSource: PrintableSurfaceDetection["source"];
  rimDetectionConfidence: number;
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
  const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });
  if (!srcCtx) {
    return {
      dataUrl: img.src,
      offsetX: 0,
      offsetY: 0,
      width: img.naturalWidth,
      height: img.naturalHeight,
      bodyCenterX: img.naturalWidth / 2,
      referenceBodyWidthPx: Math.max(40, img.naturalWidth * 0.28),
      referenceBandCenterY: img.naturalHeight * 0.24,
      bodyTopY: img.naturalHeight * 0.08,
      bodyBottomY: img.naturalHeight * 0.92,
      rimTopY: null,
      rimBottomY: null,
      rimDetectionSource: "none",
      rimDetectionConfidence: 0,
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
      offsetX: 0,
      offsetY: 0,
      width: img.naturalWidth,
      height: img.naturalHeight,
      bodyCenterX: img.naturalWidth / 2,
      referenceBodyWidthPx: Math.max(40, img.naturalWidth * 0.28),
      referenceBandCenterY: img.naturalHeight * 0.24,
      bodyTopY: img.naturalHeight * 0.08,
      bodyBottomY: img.naturalHeight * 0.92,
      rimTopY: null,
      rimBottomY: null,
      rimDetectionSource: "none",
      rimDetectionConfidence: 0,
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
  const cropCtx = cropCanvas.getContext("2d", { willReadFrequently: true });
  if (!cropCtx) {
    return {
      dataUrl: img.src,
      offsetX: 0,
      offsetY: 0,
      width: img.naturalWidth,
      height: img.naturalHeight,
      bodyCenterX: img.naturalWidth / 2,
      referenceBodyWidthPx: Math.max(40, img.naturalWidth * 0.28),
      referenceBandCenterY: img.naturalHeight * 0.24,
      bodyTopY: img.naturalHeight * 0.08,
      bodyBottomY: img.naturalHeight * 0.92,
      rimTopY: null,
      rimBottomY: null,
      rimDetectionSource: "none",
      rimDetectionConfidence: 0,
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
  const {
    rimTopY,
    rimBottomY,
    rimDetectionSource,
    rimDetectionConfidence,
  } = detectRimBandRows({
    imageData: croppedImage.data,
    width: cropW,
    height: cropH,
    bodyCenterX,
    referenceBodyWidthPx,
    referenceBandCenterY,
    bodyTopY,
    bodyBottomY,
    fitDebugRatios: rimRatios,
  });

  return {
    dataUrl: cropCanvas.toDataURL("image/png"),
    offsetX: cropX,
    offsetY: cropY,
    width: cropW,
    height: cropH,
    bodyCenterX,
    referenceBodyWidthPx,
    referenceBandCenterY,
    bodyTopY,
    bodyBottomY: effectiveBodyBottomY,
    rimTopY,
    rimBottomY,
    rimDetectionSource,
    rimDetectionConfidence,
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
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  bodyCenterX: number;
  referenceBodyWidthPx: number;
  referenceBandCenterY: number;
  bodyTopY: number;
  bodyBottomY: number;
  rimTopY: number | null;
  rimBottomY: number | null;
  rimDetectionSource: PrintableSurfaceDetection["source"];
  rimDetectionConfidence: number;
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
  const cropCtx = cropCanvas.getContext("2d", { willReadFrequently: true });
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
    offsetX: paddedMinX,
    offsetY: paddedMinY,
    width: cropW,
    height: cropH,
    bodyCenterX: centerX,
    referenceBodyWidthPx: Math.max(8, measurementBandWidthPx * scaleX),
    referenceBandCenterY: (measurementBandCenterYPx * scaleY) - paddedMinY,
    bodyTopY,
    bodyBottomY: effectiveBodyBottomY,
    rimTopY,
    rimBottomY,
    rimDetectionSource: "fit-debug",
    rimDetectionConfidence: 0.94,
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
  handleUpperCornerFromOverallMm,
  handleLowerCornerFromOverallMm,
  handleUpperCornerReachMm,
  handleLowerCornerReachMm,
  handleUpperTransitionReachMm,
  handleLowerTransitionReachMm,
  handleUpperTransitionFromOverallMm,
  handleLowerTransitionFromOverallMm,
  handleOuterTopFromOverallMm,
  handleOuterBottomFromOverallMm,
  handleTubeDiameterMm,
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
  lidColorHex,
  rimColorHex,
  fitDebug,
  allowFitDebugPhotoCrop = false,
  canonicalHandleProfile,
  canonicalBodySvgPath,
  editableHandlePreview,
  outlineProfile,
  referencePaths,
  referenceLayerState,
  dimensionCalibration,
  printableSurfaceContract,
  printableTopBoundarySource,
  printableTopBoundaryConfidence,
  printableTopBoundaryWeak,
  printableTopOverrideMm,
  printableBottomOverrideMm,
  onChange,
  onLidSeamChange,
  onSilverBandBottomChange,
  onPrintableTopOverrideChange,
  onPrintableBottomOverrideChange,
  onPrintableSurfaceDetectionChange,
  onHandleTopChange,
  onHandleBottomChange,
  onHandleReachChange,
  onHandleUpperCornerChange,
  onHandleLowerCornerChange,
  onHandleUpperCornerReachChange,
  onHandleLowerCornerReachChange,
  onHandleUpperTransitionReachChange,
  onHandleLowerTransitionReachChange,
  onHandleUpperTransitionChange,
  onHandleLowerTransitionChange,
  onHandleOuterTopChange,
  onHandleOuterBottomChange,
  onHandleTubeDiameterChange,
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
  colorResampleRequestKey = 0,
  onColorsChange,
  onBaseDiameterDerived,
  onDiameterChange,
  onTopOuterDiameterChange,
  onBaseDiameterChange,
  onOutlineProfileChange,
  onReferencePathsChange,
  onOutlineSeedModeChange,
  onReferenceLayerStateChange,
  onPipelineStage,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgOutlineInputRef = useRef<HTMLInputElement>(null);
  const lastColorSampleSignatureRef = useRef<string>("");
  const printableBandClipId = React.useId().replace(/:/g, "-");
  const [dragging, setDragging] = useState<
    | "top"
    | "bottom"
    | "lid-seam"
    | "silver-band"
    | "printable-bottom"
    | "handle-top"
    | "handle-bottom"
    | "handle-reach"
    | "handle-thickness"
    | "handle-upper-corner"
    | "handle-lower-corner"
    | "handle-upper-transition"
    | "handle-lower-transition"
    | "top-outer-width"
    | "body-width"
    | "base-width"
    | "shoulder-width"
    | "taper-upper-width"
    | "taper-lower-width"
    | "bevel-width"
    | null
  >(null);
  const [manualGuideSelection, setManualGuideSelection] = useState({
    lid: false,
    silver: false,
    printableBottom: false,
  });
  const markGuideAsManual = React.useCallback((guide: "lid" | "silver" | "printableBottom") => {
    setManualGuideSelection((current) => (
      current[guide]
        ? current
        : { ...current, [guide]: true }
    ));
  }, []);
  const [manualHandleSelection, setManualHandleSelection] = useState({
    top: false,
    bottom: false,
    reach: false,
    upperCorner: false,
    lowerCorner: false,
    upperTransition: false,
    lowerTransition: false,
    tubeDiameter: false,
  });
  const markHandleAsManual = React.useCallback((handle: "top" | "bottom" | "reach" | "upperCorner" | "lowerCorner" | "upperTransition" | "lowerTransition" | "tubeDiameter") => {
    setManualHandleSelection((current) => (
      current[handle]
        ? current
        : { ...current, [handle]: true }
    ));
  }, []);
  const [shapeWorkflowMode, setShapeWorkflowMode] = useState<"fit" | "refine">("fit");
  const [nodeEditMode, setNodeEditMode] = useState<"edit" | "add">("edit");
  const [showAdvancedHandles, setShowAdvancedHandles] = useState(false);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [selectedHandleType, setSelectedHandleType] = useState<"in" | "out" | null>(null);
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<number | null>(null);
  const [outlineHistory, setOutlineHistory] = useState<EditableBodyOutline[]>([]);
  const [outlineFuture, setOutlineFuture] = useState<EditableBodyOutline[]>([]);
  const outlineSyncSignatureRef = useRef<string>("__init__");
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
  const [profileEditMode, setProfileEditMode] = useState(false);
  const [localReferencePaths, setLocalReferencePaths] = useState<ReferencePaths>(
    createReferencePaths({
      bodyOutline: referencePaths?.bodyOutline ?? outlineProfile ?? null,
      lidProfile: referencePaths?.lidProfile ?? null,
      silverProfile: referencePaths?.silverProfile ?? null,
    }),
  );
  const lastSyncedReferencePathsSignatureRef = React.useRef<string | null>(null);
  const lastReportedReferencePathsSyncStageRef = React.useRef<string | null>(null);
  const [localReferenceLayerState, setLocalReferenceLayerState] = useState<ReferenceLayerState>(
    cloneReferenceLayerState(referenceLayerState ?? createDefaultReferenceLayerState()),
  );
  const lastSyncedLayerStateSignatureRef = React.useRef<string | null>(null);
  const lastReportedLayerSyncStageRef = React.useRef<string | null>(null);
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
  const [displayPhoto, setDisplayPhoto] = useState<DisplayPhotoState | null>(null);
  const displayPhotoRef = useRef<DisplayPhotoState | null>(null);
  const activeDisplayPhoto = photoDataUrl ? displayPhoto : null;
  const canvasHeightPx = DEFAULT_CANVAS_HEIGHT;
  const outlineTransformMode = profileEditMode && shapeWorkflowMode === "fit";
  const showBlueprintOverlay = false;
  const showGuideLabels = false;
  const showHandleTrace = (canonicalHandleProfile?.confidence ?? 0) >= 0.6;
  const showReadOnlyGuides = false;
  const reportPipelineStage = React.useEffectEvent((stage: TemplatePipelineStageRecord) => {
    onPipelineStage?.(stage);
  });
  const commitDisplayPhoto = React.useCallback((next: DisplayPhotoState | null) => {
    if (displayPhotoEquals(displayPhotoRef.current, next)) return;
    displayPhotoRef.current = next;
    setDisplayPhoto((current) => (displayPhotoEquals(current, next) ? current : next));
  }, []);

  useEffect(() => {
    if (!photoDataUrl) return;

    let cancelled = false;
    const img = new Image();
    img.onload = async () => {
      const sourceOutline = localReferencePaths.bodyOutline ?? referencePaths?.bodyOutline ?? outlineProfile;
      const normalizedMeasurementContour = sourceOutline
        ? normalizeMeasurementContour({
            outline: sourceOutline,
            overallHeightMm,
            bodyTopFromOverallMm,
            bodyBottomFromOverallMm,
          })
        : null;
      const sourceContour = normalizedMeasurementContour?.contour
        ?? sourceOutline?.sourceContour
        ?? null;
      const sourceBounds = normalizedMeasurementContour?.bounds
        ?? sourceOutline?.sourceContourBounds
        ?? null;
      const sourceViewport = sourceOutline?.sourceContourViewport;
      if (
        sourceContour &&
        sourceContour.length >= 3 &&
        sourceBounds &&
        sourceViewport &&
        sourceViewport.width > 0 &&
        sourceViewport.height > 0 &&
        sourceBounds.width > 0 &&
        sourceBounds.height > 0
      ) {
        const scaleX = (img.naturalWidth || img.width) / Math.max(1, sourceViewport.width);
        const scaleY = (img.naturalHeight || img.height) / Math.max(1, sourceViewport.height);
        const scaledSourceContour = sourceContour.map((point) => ({
          x: round1((point.x - sourceViewport.minX) * scaleX),
          y: round1((point.y - sourceViewport.minY) * scaleY),
        }));
        const scaledBounds =
          getBoundsFromPoints(scaledSourceContour)
          ?? {
            minX: round1((sourceBounds.minX - sourceViewport.minX) * scaleX),
            minY: round1((sourceBounds.minY - sourceViewport.minY) * scaleY),
            maxX: round1((sourceBounds.maxX - sourceViewport.minX) * scaleX),
            maxY: round1((sourceBounds.maxY - sourceViewport.minY) * scaleY),
            width: round1(sourceBounds.width * scaleX),
            height: round1(sourceBounds.height * scaleY),
          };
        const preferSourceContourBodyFit = sourceOutline?.sourceContourMode === "body-only";
        const sourceBodyCenterX = (scaledBounds.minX + scaledBounds.maxX) / 2;
        const sourceBodyOutlinePath = buildContourSvgPath(scaledSourceContour);
        const sourceTopWidthPx = estimateContourWidth(scaledSourceContour, scaledBounds.minY + 4) ?? scaledBounds.width;
        const sourceBaseWidthPx = estimateContourWidth(scaledSourceContour, scaledBounds.maxY - 4) ?? scaledBounds.width;
        let sourceHandleProfile = canonicalHandleProfile ?? null;
        if (!sourceHandleProfile && sourceOutline) {
          try {
            sourceHandleProfile = await extractCanonicalHandleProfileFromCutout({
              imageDataUrl: photoDataUrl,
              outline: sourceOutline,
            });
          } catch {
            sourceHandleProfile = null;
          }
        }
        const fitDebugScaleX = fitDebug?.imageWidthPx
          ? (img.naturalWidth || img.width) / Math.max(1, fitDebug.imageWidthPx)
          : null;
        const fitDebugScaleY = fitDebug?.imageHeightPx
          ? (img.naturalHeight || img.height) / Math.max(1, fitDebug.imageHeightPx)
          : null;
        const fitHandleOuterRect = fitDebug && fitDebugScaleX != null && fitDebugScaleY != null &&
          fitDebug.handleAttachEdgePx != null &&
          fitDebug.handleOuterEdgePx != null &&
          fitDebug.handleCenterYPx != null &&
          fitDebug.handleOuterHeightPx != null
          ? {
              x: Math.min(
                fitDebug.handleAttachEdgePx * fitDebugScaleX,
                fitDebug.handleOuterEdgePx * fitDebugScaleX,
              ),
              y: (fitDebug.handleCenterYPx - (fitDebug.handleOuterHeightPx / 2)) * fitDebugScaleY,
              width: Math.abs((fitDebug.handleOuterEdgePx - fitDebug.handleAttachEdgePx) * fitDebugScaleX),
              height: Math.max(1, fitDebug.handleOuterHeightPx * fitDebugScaleY),
            }
          : null;
        const fitHandleInnerRect = fitDebug && fitDebugScaleX != null && fitDebugScaleY != null &&
          fitDebug.handleAttachEdgePx != null &&
          fitDebug.handleOuterEdgePx != null &&
          fitDebug.handleHoleTopPx != null &&
          fitDebug.handleHoleBottomPx != null &&
          fitDebug.handleBarWidthPx != null
          ? {
              x: Math.min(
                fitDebug.handleAttachEdgePx * fitDebugScaleX,
                fitDebug.handleOuterEdgePx * fitDebugScaleX,
              ) + Math.max(1, fitDebug.handleBarWidthPx * fitDebugScaleX),
              y: fitDebug.handleHoleTopPx * fitDebugScaleY,
              width: Math.max(
                1,
                Math.abs((fitDebug.handleOuterEdgePx - fitDebug.handleAttachEdgePx) * fitDebugScaleX)
                - Math.max(2, fitDebug.handleBarWidthPx * fitDebugScaleX * 2),
              ),
              height: Math.max(1, (fitDebug.handleHoleBottomPx - fitDebug.handleHoleTopPx) * fitDebugScaleY),
            }
          : null;
        const sourceHandleOuterBounds = sourceHandleProfile?.outerContour?.length
          ? getBoundsFromPoints(sourceHandleProfile.outerContour)
          : null;
        const sourceHandleInnerBounds = sourceHandleProfile?.openingBox
          ? {
              minX: sourceHandleProfile.openingBox.x,
              minY: sourceHandleProfile.openingBox.y,
              maxX: sourceHandleProfile.openingBox.x + sourceHandleProfile.openingBox.w,
              maxY: sourceHandleProfile.openingBox.y + sourceHandleProfile.openingBox.h,
              width: sourceHandleProfile.openingBox.w,
              height: sourceHandleProfile.openingBox.h,
            }
          : (sourceHandleProfile?.innerContour?.length
            ? getBoundsFromPoints(sourceHandleProfile.innerContour)
            : null);
        const sourceCanvas = document.createElement("canvas");
        sourceCanvas.width = img.naturalWidth || img.width;
        sourceCanvas.height = img.naturalHeight || img.height;
        const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
        const sourceImageData = (() => {
          if (!sourceCtx) return null;
          sourceCtx.drawImage(img, 0, 0);
          return sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
        })();
        const sourceHandleTrace = (() => {
          if (!sourceImageData) {
            return {
              outerPath: null,
              innerPath: null,
              outerRect: null,
              innerRect: null,
              handleSide: fitDebug?.handleSide ?? null,
            };
          }
          return deriveHandleTraceFromImage({
            imageData: sourceImageData,
            bodyContour: scaledSourceContour,
            handleSideHint: canonicalHandleProfile?.side ?? fitDebug?.handleSide ?? null,
          });
        })();
        const fitDebugRatios = fitDebug && fitDebug.bodyBottomPx > fitDebug.bodyTopPx
          ? {
              top: (fitDebug.rimTopPx - fitDebug.bodyTopPx) / Math.max(1, fitDebug.bodyBottomPx - fitDebug.bodyTopPx),
              bottom: (fitDebug.rimBottomPx - fitDebug.bodyTopPx) / Math.max(1, fitDebug.bodyBottomPx - fitDebug.bodyTopPx),
            }
          : null;
        const sourceRimDetection = (() => {
          if (!sourceImageData) {
            return {
              rimTopY: null,
              rimBottomY: null,
              rimDetectionSource: "none" as PrintableSurfaceDetection["source"],
              rimDetectionConfidence: 0,
            };
          }
          return detectRimBandRows({
            imageData: sourceImageData.data,
            width: sourceCanvas.width,
            height: sourceCanvas.height,
            bodyCenterX: (scaledBounds.minX + scaledBounds.maxX) / 2,
            referenceBodyWidthPx: scaledBounds.width,
            referenceBandCenterY: scaledBounds.minY + (scaledBounds.height * 0.18),
            bodyTopY: scaledBounds.minY,
            bodyBottomY: scaledBounds.maxY,
            fitDebugRatios,
          });
        })();
        const detectedReferenceBandCenterY =
          sourceRimDetection.rimTopY != null && sourceRimDetection.rimBottomY != null
            ? (sourceRimDetection.rimTopY + sourceRimDetection.rimBottomY) / 2
            : (scaledBounds.minY + (scaledBounds.height * 0.18));
        const sourceHandleOuterRectCandidate = sourceHandleOuterBounds
          ? {
              x: sourceHandleOuterBounds.minX,
              y: sourceHandleOuterBounds.minY,
              width: sourceHandleOuterBounds.width,
              height: sourceHandleOuterBounds.height,
            }
          : null;
        const sourceHandleInnerRectCandidate = sourceHandleInnerBounds
          ? {
              x: sourceHandleInnerBounds.minX,
              y: sourceHandleInnerBounds.minY,
              width: sourceHandleInnerBounds.width,
              height: sourceHandleInnerBounds.height,
            }
          : null;
        const preferredSourceHandleOuterRect = pickTallestRect([
          sourceHandleTrace.outerRect,
          fitHandleOuterRect,
          sourceHandleOuterRectCandidate,
        ]);
        const preferredSourceHandleInnerRect = pickTallestRect([
          sourceHandleTrace.innerRect,
          fitHandleInnerRect,
          sourceHandleInnerRectCandidate,
        ]);
        if (preferSourceContourBodyFit) {
          if (!cancelled) {
            commitDisplayPhoto({
              src: photoDataUrl,
              w: img.naturalWidth || img.width,
              h: img.naturalHeight || img.height,
              bodyCenterX: sourceBodyCenterX,
              referenceBodyWidthPx: scaledBounds.width,
              referenceBandCenterY: detectedReferenceBandCenterY,
              bodyTopY: scaledBounds.minY,
              bodyBottomY: scaledBounds.maxY,
              rimTopY: sourceRimDetection.rimTopY,
              rimBottomY: sourceRimDetection.rimBottomY,
              rimDetectionSource: sourceRimDetection.rimDetectionSource,
              rimDetectionConfidence: sourceRimDetection.rimDetectionConfidence,
              bodyOutlinePath: sourceBodyOutlinePath,
              bodyOutlineBounds: scaledBounds,
              tracedBodyOutlinePath: sourceBodyOutlinePath,
              handleOuterPath: sourceHandleProfile?.svgPathOuter ?? sourceHandleTrace.outerPath ?? null,
              handleInnerPath: sourceHandleProfile?.svgPathInner ?? sourceHandleTrace.innerPath ?? null,
              handleSide: sourceHandleTrace.handleSide ?? sourceHandleProfile?.side ?? fitDebug?.handleSide ?? null,
              handleOuterRect: preferredSourceHandleOuterRect,
              handleInnerRect: preferredSourceHandleInnerRect,
              topOuterWidthPx: sourceTopWidthPx,
              baseWidthPx: sourceBaseWidthPx,
            });
          }
          return;
        }
        const tracedDisplayPhoto =
          (allowFitDebugPhotoCrop ? cropBoundsFromFitDebug(img, fitDebug) : null)
          ?? cropVisibleBounds(img, fitDebug);
        const translatedMeasuredBodyOutlinePath = translateLinearPath(
          tracedDisplayPhoto.bodyOutlinePath,
          tracedDisplayPhoto.offsetX,
          tracedDisplayPhoto.offsetY,
        );
        const translatedTracedBodyOutlinePath = translateLinearPath(
          tracedDisplayPhoto.tracedBodyOutlinePath,
          tracedDisplayPhoto.offsetX,
          tracedDisplayPhoto.offsetY,
        );
        const translatedMeasuredBodyBounds = translateDisplayPhotoBounds(
          tracedDisplayPhoto.bodyOutlineBounds,
          tracedDisplayPhoto.offsetX,
          tracedDisplayPhoto.offsetY,
        );
        const measuredBodyCenterX = tracedDisplayPhoto.bodyCenterX + tracedDisplayPhoto.offsetX;
        const measuredBodyTopY = tracedDisplayPhoto.bodyTopY + tracedDisplayPhoto.offsetY;
        const measuredBodyBottomY = tracedDisplayPhoto.bodyBottomY + tracedDisplayPhoto.offsetY;
        const measuredReferenceBandCenterY = tracedDisplayPhoto.referenceBandCenterY + tracedDisplayPhoto.offsetY;
        const translatedMeasuredRimTopY = tracedDisplayPhoto.rimTopY != null
          ? tracedDisplayPhoto.rimTopY + tracedDisplayPhoto.offsetY
          : null;
        const translatedMeasuredRimBottomY = tracedDisplayPhoto.rimBottomY != null
          ? tracedDisplayPhoto.rimBottomY + tracedDisplayPhoto.offsetY
          : null;
        const displayOffsetX = preferSourceContourBodyFit ? tracedDisplayPhoto.offsetX : 0;
        const displayOffsetY = preferSourceContourBodyFit ? tracedDisplayPhoto.offsetY : 0;
        const displayPhotoSrc = preferSourceContourBodyFit ? tracedDisplayPhoto.dataUrl : photoDataUrl;
        const displayPhotoWidth = preferSourceContourBodyFit ? tracedDisplayPhoto.width : (img.naturalWidth || img.width);
        const displayPhotoHeight = preferSourceContourBodyFit ? tracedDisplayPhoto.height : (img.naturalHeight || img.height);
        const displaySourceBodyOutlinePath = preferSourceContourBodyFit
          ? translateLinearPath(sourceBodyOutlinePath, -displayOffsetX, -displayOffsetY)
          : sourceBodyOutlinePath;
        const displaySourceBodyOutlineBounds = preferSourceContourBodyFit
          ? translateDisplayPhotoBounds(scaledBounds, -displayOffsetX, -displayOffsetY)
          : scaledBounds;
        const displaySourceBodyCenterX = preferSourceContourBodyFit
          ? sourceBodyCenterX - displayOffsetX
          : sourceBodyCenterX;
        const displaySourceReferenceBandCenterY = preferSourceContourBodyFit
          ? detectedReferenceBandCenterY - displayOffsetY
          : detectedReferenceBandCenterY;
        const displaySourceRimTopY = sourceRimDetection.rimTopY != null
          ? sourceRimDetection.rimTopY - displayOffsetY
          : null;
        const displaySourceRimBottomY = sourceRimDetection.rimBottomY != null
          ? sourceRimDetection.rimBottomY - displayOffsetY
          : null;
        const displaySourceHandleOuterPath = preferSourceContourBodyFit
          ? (
            tracedDisplayPhoto.handleOuterPath ??
            translateLinearPath(sourceHandleProfile?.svgPathOuter ?? sourceHandleTrace.outerPath ?? null, -displayOffsetX, -displayOffsetY)
          )
          : (sourceHandleProfile?.svgPathOuter ?? sourceHandleTrace.outerPath ?? null);
        const displaySourceHandleInnerPath = preferSourceContourBodyFit
          ? (
            tracedDisplayPhoto.handleInnerPath ??
            translateLinearPath(sourceHandleProfile?.svgPathInner ?? sourceHandleTrace.innerPath ?? null, -displayOffsetX, -displayOffsetY)
          )
          : (sourceHandleProfile?.svgPathInner ?? sourceHandleTrace.innerPath ?? null);
        const displaySourceHandleOuterRect = preferSourceContourBodyFit
          ? (
            tracedDisplayPhoto.handleOuterRect ??
            pickTallestRect([
              translateDisplayPhotoRect(sourceHandleTrace.outerRect, -displayOffsetX, -displayOffsetY),
              translateDisplayPhotoRect(fitHandleOuterRect, -displayOffsetX, -displayOffsetY),
              translateDisplayPhotoRect(sourceHandleOuterRectCandidate, -displayOffsetX, -displayOffsetY),
            ])
          )
          : pickTallestRect([
            preferredSourceHandleOuterRect,
          ]);
        const displaySourceHandleInnerRect = preferSourceContourBodyFit
          ? (
            tracedDisplayPhoto.handleInnerRect ??
            pickTallestRect([
              translateDisplayPhotoRect(sourceHandleTrace.innerRect, -displayOffsetX, -displayOffsetY),
              translateDisplayPhotoRect(fitHandleInnerRect, -displayOffsetX, -displayOffsetY),
              translateDisplayPhotoRect(sourceHandleInnerRectCandidate, -displayOffsetX, -displayOffsetY),
            ])
          )
          : pickTallestRect([
            preferredSourceHandleInnerRect,
          ]);
        const effectiveBodyCenterX = preferSourceContourBodyFit
          ? displaySourceBodyCenterX
          : (
            translatedMeasuredBodyBounds
              ? measuredBodyCenterX
              : displaySourceBodyCenterX
          );
        const effectiveReferenceBodyWidthPx = preferSourceContourBodyFit
          ? (displaySourceBodyOutlineBounds?.width ?? scaledBounds.width)
          : (
            translatedMeasuredBodyBounds
              ? tracedDisplayPhoto.referenceBodyWidthPx
              : scaledBounds.width
          );
        const effectiveReferenceBandCenterY = preferSourceContourBodyFit
          ? displaySourceReferenceBandCenterY
          : (
            translatedMeasuredBodyBounds
              ? measuredReferenceBandCenterY
              : detectedReferenceBandCenterY
          );
        const effectiveBodyTopY = preferSourceContourBodyFit
          ? (displaySourceBodyOutlineBounds?.minY ?? scaledBounds.minY)
          : (
            translatedMeasuredBodyBounds
              ? measuredBodyTopY
              : scaledBounds.minY
          );
        const effectiveBodyBottomY = preferSourceContourBodyFit
          ? (displaySourceBodyOutlineBounds?.maxY ?? scaledBounds.maxY)
          : (
            translatedMeasuredBodyBounds
              ? measuredBodyBottomY
              : scaledBounds.maxY
          );
        const effectiveRimTopY = preferSourceContourBodyFit
          ? displaySourceRimTopY
          : (translatedMeasuredRimTopY ?? sourceRimDetection.rimTopY);
        const effectiveRimBottomY = preferSourceContourBodyFit
          ? displaySourceRimBottomY
          : (translatedMeasuredRimBottomY ?? sourceRimDetection.rimBottomY);
        const effectiveBodyOutlinePath = preferSourceContourBodyFit
          ? displaySourceBodyOutlinePath
          : (translatedMeasuredBodyOutlinePath ?? displaySourceBodyOutlinePath);
        const effectiveBodyOutlineBounds = preferSourceContourBodyFit
          ? (displaySourceBodyOutlineBounds ?? scaledBounds)
          : (translatedMeasuredBodyBounds ?? displaySourceBodyOutlineBounds ?? scaledBounds);
        const effectiveTracedBodyOutlinePath = preferSourceContourBodyFit
          ? displaySourceBodyOutlinePath
          : (translatedTracedBodyOutlinePath ?? displaySourceBodyOutlinePath);
        const effectiveTopOuterWidthPx = preferSourceContourBodyFit
          ? sourceTopWidthPx
          : (tracedDisplayPhoto.topOuterWidthPx ?? sourceTopWidthPx);
        const effectiveBaseWidthPx = preferSourceContourBodyFit
          ? sourceBaseWidthPx
          : (tracedDisplayPhoto.baseWidthPx ?? sourceBaseWidthPx);
        if (!cancelled) {
          commitDisplayPhoto({
            src: displayPhotoSrc,
            w: displayPhotoWidth,
            h: displayPhotoHeight,
            bodyCenterX: effectiveBodyCenterX,
            referenceBodyWidthPx: effectiveReferenceBodyWidthPx,
            referenceBandCenterY: effectiveReferenceBandCenterY,
            bodyTopY: effectiveBodyTopY,
            bodyBottomY: effectiveBodyBottomY,
            rimTopY: effectiveRimTopY,
            rimBottomY: effectiveRimBottomY,
            rimDetectionSource: sourceRimDetection.rimDetectionSource,
            rimDetectionConfidence: sourceRimDetection.rimDetectionConfidence,
            bodyOutlinePath: effectiveBodyOutlinePath,
            bodyOutlineBounds: effectiveBodyOutlineBounds,
            tracedBodyOutlinePath: effectiveTracedBodyOutlinePath,
            handleOuterPath: displaySourceHandleOuterPath,
            handleInnerPath: displaySourceHandleInnerPath,
            handleSide: sourceHandleTrace.handleSide ?? sourceHandleProfile?.side ?? fitDebug?.handleSide ?? null,
            handleOuterRect: displaySourceHandleOuterRect,
            handleInnerRect: displaySourceHandleInnerRect,
            topOuterWidthPx: effectiveTopOuterWidthPx,
            baseWidthPx: effectiveBaseWidthPx,
          });
        }
        return;
      }
      const cropped =
        (allowFitDebugPhotoCrop ? cropBoundsFromFitDebug(img, fitDebug) : null)
        ?? cropVisibleBounds(img, fitDebug);
      if (!cancelled) {
        commitDisplayPhoto({
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
          rimDetectionSource: cropped.rimDetectionSource,
          rimDetectionConfidence: cropped.rimDetectionConfidence,
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
        commitDisplayPhoto(null);
      }
    };
    img.src = photoDataUrl;

    return () => {
      cancelled = true;
    };
  }, [
    allowFitDebugPhotoCrop,
    bodyBottomFromOverallMm,
    bodyTopFromOverallMm,
    canonicalHandleProfile,
    commitDisplayPhoto,
    fitDebug,
    localReferencePaths.bodyOutline,
    outlineProfile,
    overallHeightMm,
    photoDataUrl,
    referencePaths?.bodyOutline,
  ]);

  const syncedReferencePaths = React.useMemo(() => createReferencePaths({
    bodyOutline: referencePaths?.bodyOutline ?? outlineProfile ?? null,
    lidProfile: referencePaths?.lidProfile ?? null,
    silverProfile: referencePaths?.silverProfile ?? null,
  }), [outlineProfile, referencePaths?.bodyOutline, referencePaths?.lidProfile, referencePaths?.silverProfile]);
  const syncedReferencePathsSignature = React.useMemo(
    () => referencePathsSignature(syncedReferencePaths),
    [syncedReferencePaths],
  );
  const syncedReferencePathsRef = React.useRef(syncedReferencePaths);

  useEffect(() => {
    syncedReferencePathsRef.current = syncedReferencePaths;
  }, [syncedReferencePaths]);

  useEffect(() => {
    const nextPaths = syncedReferencePathsRef.current;
    const skippedStageKey = `reference-paths-sync:skip:${syncedReferencePathsSignature}`;
    if (lastSyncedReferencePathsSignatureRef.current === syncedReferencePathsSignature) {
      if (lastReportedReferencePathsSyncStageRef.current !== skippedStageKey) {
        lastReportedReferencePathsSyncStageRef.current = skippedStageKey;
        reportPipelineStage({
          id: "viewer-sync",
          status: "skip",
          authority: "engravable-zone-editor",
          engine: "reference-paths-sync",
          warnings: [],
          errors: [],
          artifacts: {
            source: "reference-paths",
            action: "skipped-no-change",
            signature: syncedReferencePathsSignature,
          },
        });
      }
      return;
    }
    lastSyncedReferencePathsSignatureRef.current = syncedReferencePathsSignature;
    setLocalReferencePaths((current) => (
      referencePathsSignature(current) === syncedReferencePathsSignature ? current : nextPaths
    ));
    lastReportedReferencePathsSyncStageRef.current = `reference-paths-sync:ready:${syncedReferencePathsSignature}`;
    reportPipelineStage({
      id: "viewer-sync",
      status: "ready",
      authority: "engravable-zone-editor",
      engine: "reference-paths-sync",
      warnings: [],
      errors: [],
      artifacts: {
        source: "reference-paths",
        action: "applied",
        signature: syncedReferencePathsSignature,
      },
    });
  }, [syncedReferencePathsSignature]);

  const syncedLayerState = React.useMemo(
    () => cloneReferenceLayerState(referenceLayerState ?? createDefaultReferenceLayerState()),
    [referenceLayerState],
  );
  const syncedLayerStateSignature = React.useMemo(() => referenceLayerStateSignature(syncedLayerState), [syncedLayerState]);
  const syncedLayerStateRef = React.useRef(syncedLayerState);

  useEffect(() => {
    syncedLayerStateRef.current = syncedLayerState;
  }, [syncedLayerState]);

  useEffect(() => {
    const nextLayerState = syncedLayerStateRef.current;
    const skippedStageKey = `reference-layer-sync:skip:${syncedLayerStateSignature}`;
    if (lastSyncedLayerStateSignatureRef.current === syncedLayerStateSignature) {
      if (lastReportedLayerSyncStageRef.current !== skippedStageKey) {
        lastReportedLayerSyncStageRef.current = skippedStageKey;
        reportPipelineStage({
          id: "viewer-sync",
          status: "skip",
          authority: "engravable-zone-editor",
          engine: "reference-layer-sync",
          warnings: [],
          errors: [],
          artifacts: {
            source: "reference-layers",
            action: "skipped-no-change",
            signature: syncedLayerStateSignature,
          },
        });
      }
      return;
    }
    lastSyncedLayerStateSignatureRef.current = syncedLayerStateSignature;
    setLocalReferenceLayerState((current) => (
      referenceLayerStateSignature(current) === syncedLayerStateSignature ? current : nextLayerState
    ));
    lastReportedLayerSyncStageRef.current = `reference-layer-sync:ready:${syncedLayerStateSignature}`;
    reportPipelineStage({
      id: "viewer-sync",
      status: "ready",
      authority: "engravable-zone-editor",
      engine: "reference-layer-sync",
      warnings: [],
      errors: [],
      artifacts: {
        source: "reference-layers",
        action: "applied",
        signature: syncedLayerStateSignature,
      },
    });
  }, [syncedLayerStateSignature]);

  const generatedFallbackOutline = React.useMemo<EditableBodyOutline>(() => createEditableBodyOutline({
    overallHeightMm,
    bodyTopFromOverallMm,
    bodyBottomFromOverallMm,
    diameterMm,
    topOuterDiameterMm,
    baseDiameterMm,
    shoulderDiameterMm,
    taperUpperDiameterMm,
    taperLowerDiameterMm,
    bevelDiameterMm,
    fitDebug,
  }), [
    baseDiameterMm,
    bevelDiameterMm,
    bodyBottomFromOverallMm,
    bodyTopFromOverallMm,
    diameterMm,
    fitDebug,
    overallHeightMm,
    shoulderDiameterMm,
    taperLowerDiameterMm,
    taperUpperDiameterMm,
    topOuterDiameterMm,
  ]);
  const selectUsableOutline = React.useCallback((outline?: EditableBodyOutline | null) => (
    outline && Array.isArray(outline.points) && outline.points.length >= 2
      ? outline
      : null
  ), []);
  const activeLayer: ReferenceLayerKey = "bodyOutline";
  const activeLayerPath = React.useMemo(
    () => (
      selectUsableOutline(localReferencePaths.bodyOutline)
      ?? selectUsableOutline(outlineProfile)
      ?? generatedFallbackOutline
    ),
    [generatedFallbackOutline, localReferencePaths.bodyOutline, outlineProfile, selectUsableOutline],
  );
  const activeLayerPathSignature = React.useMemo(
    () => editableOutlineSignature(activeLayerPath),
    [activeLayerPath],
  );
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
    const nextSignature = activeLayer === "bodyOutline" ? activeLayerPathSignature : "__none__";
    if (outlineSyncSignatureRef.current === nextSignature) {
      return;
    }
    outlineSyncSignatureRef.current = nextSignature;

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
    activeLayerPathSignature,
  ]);

  const derivedZoneGuides = React.useMemo(
    () => allowFitDebugPhotoCrop
      ? deriveEngravableZoneFromFitDebug({ overallHeightMm, fitDebug })
      : null,
    [allowFitDebugPhotoCrop, fitDebug, overallHeightMm],
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
  const editableOutline = outlineDraft;
  const previewOutline = editableOutline ?? generatedFallbackOutline;
  const preferDirectContourPreview = Boolean(
    previewOutline?.sourceContourMode === "body-only" &&
    previewOutline.directContour &&
    previewOutline.directContour.length >= 3,
  );
  const editableContourBoundsMm = React.useMemo(() => {
    if (!previewOutline) return null;
    if (preferDirectContourPreview || outlineTransformMode) {
      const contour = previewOutline.directContour;
      if (contour && contour.length >= 3) {
        return getBoundsFromPoints(contour.map((point) => ({ x: point.x, y: point.y })));
      }
    }
    if (previewOutline.points.length === 0) return null;
    const maxHalfWidth = previewOutline.points.reduce((max, point) => Math.max(max, Math.abs(point.x)), 0);
    const minY = previewOutline.points.reduce((min, point) => Math.min(min, point.y), Number.POSITIVE_INFINITY);
    const maxY = previewOutline.points.reduce((max, point) => Math.max(max, point.y), Number.NEGATIVE_INFINITY);
    if (!Number.isFinite(maxHalfWidth) || !Number.isFinite(minY) || !Number.isFinite(maxY)) return null;
    return {
      minX: -maxHalfWidth,
      minY,
      maxX: maxHalfWidth,
      maxY,
      width: Math.max(1, maxHalfWidth * 2),
      height: Math.max(1, maxY - minY),
    };
  }, [outlineTransformMode, preferDirectContourPreview, previewOutline]);
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
  const effectivePhotoWidthScalePct = profileEditMode ? clampedPhotoWidthScalePct : 100;
  const effectivePhotoHeightScalePct = profileEditMode ? clampedPhotoHeightScalePct : 100;
  const effectivePhotoOffsetYPct = profileEditMode ? clampedPhotoOffsetYPct : 0;
  const effectivePhotoOffsetXPct = profileEditMode ? clampedPhotoOffsetXPct : 0;
  const effectivePhotoAnchorY = profileEditMode ? photoAnchorY : "center";
  const effectivePhotoCenterMode = profileEditMode ? photoCenterMode : "body";
  const preferBodyBottomPhotoAnchor = !profileEditMode && preferDirectContourPreview;
  const useContourAlignedPhotoFit = Boolean(
    activeDisplayPhoto?.bodyOutlineBounds &&
    editableContourBoundsMm &&
    editableContourBoundsMm.width > 0 &&
    editableContourBoundsMm.height > 0,
  );
  const contourWidthPx = editableContourBoundsMm ? editableContourBoundsMm.width * pxPerMm : null;
  const contourHeightPx = editableContourBoundsMm ? editableContourBoundsMm.height * pxPerMm : null;
  const contourAlignedUniformScale = useContourAlignedPhotoFit &&
    contourWidthPx != null &&
    contourHeightPx != null &&
    activeDisplayPhoto?.bodyOutlineBounds
      ? Math.min(
          contourWidthPx / Math.max(1, activeDisplayPhoto.bodyOutlineBounds.width),
          contourHeightPx / Math.max(1, activeDisplayPhoto.bodyOutlineBounds.height),
        )
      : null;
  const tracedBodyHeightPx = activeDisplayPhoto
    ? Math.max(1, activeDisplayPhoto.bodyBottomY - activeDisplayPhoto.bodyTopY)
    : Math.max(1, canvasHeightPx * 0.84);
  const calibrationScaleXToMm = dimensionCalibration?.photoToFrontTransform.matrix[0] ?? null;
  const calibrationScaleYToMm = dimensionCalibration?.photoToFrontTransform.matrix[4] ?? null;
  const calibrationPhotoHeightPx = activeDisplayPhoto && calibrationScaleYToMm != null
    ? activeDisplayPhoto.h * calibrationScaleYToMm * pxPerMm
    : null;
  const calibrationPhotoWidthPx = activeDisplayPhoto && calibrationScaleXToMm != null
    ? activeDisplayPhoto.w * Math.abs(calibrationScaleXToMm) * pxPerMm
    : null;
  const contourAlignedDisplayScale = contourAlignedUniformScale != null && activeDisplayPhoto
    ? Math.min(
        contourAlignedUniformScale * BODY_REFERENCE_DISPLAY_FIT_PCT,
        (canvasHeightPx * BODY_REFERENCE_MAX_VISIBLE_HEIGHT_PCT) / Math.max(1, activeDisplayPhoto.h),
      )
    : null;
  const autoHeightFitPhotoHeightPx = contourAlignedUniformScale != null && activeDisplayPhoto
    ? activeDisplayPhoto.h * contourAlignedUniformScale
    : calibrationPhotoHeightPx != null
      ? calibrationPhotoHeightPx
    : (activeDisplayPhoto
      ? (activeDisplayPhoto.h * bodyZoneHeightPx) / tracedBodyHeightPx
      : canvasHeightPx * VISIBLE_TUMBLER_HEIGHT_PCT);
  const basePhotoHeightPx = contourAlignedDisplayScale != null && activeDisplayPhoto
    ? Math.max(80, activeDisplayPhoto.h * contourAlignedDisplayScale)
    : Math.max(80, autoHeightFitPhotoHeightPx * BODY_REFERENCE_DISPLAY_FIT_PCT);
  const basePhotoWidthPx = contourAlignedDisplayScale != null && activeDisplayPhoto
    ? Math.max(40, activeDisplayPhoto.w * contourAlignedDisplayScale)
    : calibrationPhotoWidthPx != null
      ? Math.max(40, calibrationPhotoWidthPx * BODY_REFERENCE_DISPLAY_FIT_PCT)
    : (activeDisplayPhoto
      ? (activeDisplayPhoto.w / activeDisplayPhoto.h) * basePhotoHeightPx
      : canvasHeightPx * 0.52);
  const resolvedHandleSide = activeDisplayPhoto?.handleSide
    ?? (
      activeDisplayPhoto?.bodyOutlineBounds
        ? (
          (activeDisplayPhoto.w - activeDisplayPhoto.bodyOutlineBounds.maxX)
            >= activeDisplayPhoto.bodyOutlineBounds.minX
            ? "right"
            : "left"
        )
        : null
    );
  const maxPhotoWidthPx = basePhotoWidthPx * (MAX_PHOTO_SCALE_PCT / 100);
  const targetPhotoHeightPx = basePhotoHeightPx * (effectivePhotoHeightScalePct / 100);
  const photoWidthPx = basePhotoWidthPx * (effectivePhotoWidthScalePct / 100);
  const photoScaleXPx = activeDisplayPhoto ? photoWidthPx / Math.max(1, activeDisplayPhoto.w) : 1;
  const photoScaleYPx = activeDisplayPhoto ? targetPhotoHeightPx / Math.max(1, activeDisplayPhoto.h) : 1;
  const scaledBodyCenterX = activeDisplayPhoto
    ? (activeDisplayPhoto.bodyCenterX / activeDisplayPhoto.w) * photoWidthPx
    : photoWidthPx / 2;
  const scaledPhotoCenterX = photoWidthPx / 2;
  const scaledReferenceBandY = activeDisplayPhoto
    ? (activeDisplayPhoto.referenceBandCenterY / activeDisplayPhoto.h) * targetPhotoHeightPx
    : targetPhotoHeightPx * 0.24;
  const scaledReferenceBandHalfPx = activeDisplayPhoto
    ? Math.max(4, Math.min(10, targetPhotoHeightPx * 0.02))
    : null;
  const scaledBodyTopInPhotoPx = activeDisplayPhoto
    ? (activeDisplayPhoto.bodyTopY / activeDisplayPhoto.h) * targetPhotoHeightPx
    : targetPhotoHeightPx * 0.08;
  const scaledBodyBottomInPhotoPx = activeDisplayPhoto
    ? (activeDisplayPhoto.bodyBottomY / activeDisplayPhoto.h) * targetPhotoHeightPx
    : targetPhotoHeightPx * 0.92;
  const scaledDetectedRimTopInPhotoPx = activeDisplayPhoto?.rimTopY != null
    ? (activeDisplayPhoto.rimTopY / activeDisplayPhoto.h) * targetPhotoHeightPx
    : null;
  const scaledDetectedRimBottomInPhotoPx = activeDisplayPhoto?.rimBottomY != null
    ? (activeDisplayPhoto.rimBottomY / activeDisplayPhoto.h) * targetPhotoHeightPx
    : null;
  const scaledRimTopInPhotoPx = activeDisplayPhoto
    ? (() => {
        if (scaledDetectedRimTopInPhotoPx == null) return null;
        if (
          scaledDetectedRimBottomInPhotoPx != null &&
          scaledReferenceBandHalfPx != null &&
          (scaledDetectedRimBottomInPhotoPx - scaledDetectedRimTopInPhotoPx) < scaledReferenceBandHalfPx * 1.7
        ) {
          return Math.min(scaledDetectedRimTopInPhotoPx, scaledReferenceBandY - scaledReferenceBandHalfPx);
        }
        return scaledDetectedRimTopInPhotoPx;
      })()
    : null;
  const scaledRimBottomInPhotoPx = activeDisplayPhoto
    ? (() => {
        if (scaledDetectedRimBottomInPhotoPx == null) return null;
        if (
          scaledDetectedRimTopInPhotoPx != null &&
          scaledReferenceBandHalfPx != null &&
          (scaledDetectedRimBottomInPhotoPx - scaledDetectedRimTopInPhotoPx) < scaledReferenceBandHalfPx * 1.7
        ) {
          return Math.max(scaledDetectedRimBottomInPhotoPx, scaledReferenceBandY + scaledReferenceBandHalfPx);
        }
        return scaledDetectedRimBottomInPhotoPx;
      })()
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
  const contourAlignedBodyCenterTargetPx = useContourAlignedPhotoFit && contourMinYPx != null && contourMaxYPx != null
    ? (contourMinYPx + contourMaxYPx) / 2
    : null;
  const contourAlignedBodyCenterInPhotoPx = useContourAlignedPhotoFit && activeDisplayPhoto?.bodyOutlineBounds
    ? ((activeDisplayPhoto.bodyOutlineBounds.minY + activeDisplayPhoto.bodyOutlineBounds.maxY) / 2) * photoScaleYPx
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
  const containerCenterLinePx = Math.round(containerWidthPx / 2);
  const centeringAnchorX = effectivePhotoCenterMode === "photo" ? scaledPhotoCenterX : scaledBodyCenterX;
  const photoLeftPx = useContourAlignedPhotoFit && contourAlignedPhotoLeftRelPx != null
    ? Math.round(
      containerCenterLinePx
      + contourAlignedPhotoLeftRelPx
      + (effectivePhotoOffsetXPct / 100) * containerWidthPx,
    )
    : Math.round(
      containerCenterLinePx
      - centeringAnchorX
      + (effectivePhotoOffsetXPct / 100) * containerWidthPx,
    );
  const bodyCenterLinePx = activeDisplayPhoto
    ? Math.round(photoLeftPx + scaledBodyCenterX)
    : containerCenterLinePx;
  const bodyLeftPx = Math.round(bodyCenterLinePx - bodyWidthPx / 2);
  const bodyCenterInPhotoPx = (scaledBodyTopInPhotoPx + scaledBodyBottomInPhotoPx) / 2;
  const targetBodyCenterPx = (bodyZoneTopPx + bodyZoneBottomPx) / 2;
  const basePhotoTopPx = useContourAlignedPhotoFit && activeDisplayPhoto?.bodyOutlineBounds
    ? (
      effectivePhotoAnchorY === "bottom" || preferBodyBottomPhotoAnchor
        ? (
            contourMaxYPx != null
              ? contourMaxYPx - (activeDisplayPhoto.bodyOutlineBounds.maxY * photoScaleYPx)
              : bodyZoneBottomPx - scaledBodyBottomInPhotoPx
          )
        : (
            contourAlignedBodyCenterTargetPx != null && contourAlignedBodyCenterInPhotoPx != null
              ? contourAlignedBodyCenterTargetPx - contourAlignedBodyCenterInPhotoPx
              : targetBodyCenterPx - bodyCenterInPhotoPx
          )
    )
    : (
      effectivePhotoAnchorY === "bottom"
        ? bodyZoneBottomPx - scaledBodyBottomInPhotoPx
        : targetBodyCenterPx - bodyCenterInPhotoPx
    );
  const photoTopPx = Math.round(basePhotoTopPx + (effectivePhotoOffsetYPct / 100) * canvasHeightPx);
  const displayedBodyTopPx = activeDisplayPhoto
    ? Math.round(photoTopPx + scaledBodyTopInPhotoPx)
    : bodyTopPx;
  const displayedBodyBottomPx = activeDisplayPhoto
    ? Math.round(photoTopPx + scaledBodyBottomInPhotoPx)
    : bodyBottomPx;
  const displayedBodyHeightPx = Math.max(1, displayedBodyBottomPx - displayedBodyTopPx);
  const mapOverallMmToDisplayedPhotoPx = (overallMm: number) => {
    if (!activeDisplayPhoto || overallHeightMm <= 0) {
      return overallMm * pxPerMm;
    }
    const ratio = clamp(overallMm / Math.max(0.1, overallHeightMm), 0, 1);
    return photoTopPx + (ratio * targetPhotoHeightPx);
  };
  const mapDisplayedPhotoPxToOverallMm = (displayPx: number) => {
    if (!activeDisplayPhoto || targetPhotoHeightPx <= 0) {
      return displayPx / pxPerMm;
    }
    const ratio = (displayPx - photoTopPx) / Math.max(1, targetPhotoHeightPx);
    return clamp(ratio, 0, 1) * overallHeightMm;
  };
  const mapOverallMmToDisplayedBodyPx = (overallMm: number) => {
    if (!activeDisplayPhoto || clampedBodyBottomFromOverallMm <= clampedBodyTopFromOverallMm) {
      return overallMm * pxPerMm;
    }
    const ratio = (overallMm - clampedBodyTopFromOverallMm) / Math.max(0.1, clampedBodyBottomFromOverallMm - clampedBodyTopFromOverallMm);
    return displayedBodyTopPx + (clamp(ratio, 0, 1) * displayedBodyHeightPx);
  };
  const mapDisplayedBodyPxToOverallMm = (displayPx: number) => {
    if (!activeDisplayPhoto || displayedBodyBottomPx <= displayedBodyTopPx) {
      return displayPx / pxPerMm;
    }
    const ratio = (displayPx - displayedBodyTopPx) / Math.max(1, displayedBodyHeightPx);
    return clampedBodyTopFromOverallMm
      + (clamp(ratio, 0, 1) * Math.max(0.1, clampedBodyBottomFromOverallMm - clampedBodyTopFromOverallMm));
  };
  const referenceBandGuideTopPx = Math.round(photoTopPx + scaledReferenceBandY);
  const derivedLidSeamGuidePx = scaledRimTopInPhotoPx != null ? Math.round(photoTopPx + scaledRimTopInPhotoPx) : null;
  const derivedSilverBandGuidePx = scaledRimBottomInPhotoPx != null ? Math.round(photoTopPx + scaledRimBottomInPhotoPx) : null;
  const mapGuidePxToOverallMm = (guidePx: number) => round1(clamp(
    activeDisplayPhoto
      ? mapDisplayedPhotoPxToOverallMm(guidePx)
      : (guidePx / pxPerMm),
    0,
    overallHeightMm,
  ));
  const effectiveLidSeamGuideMm = typeof lidSeamFromOverallMm === "number" && Number.isFinite(lidSeamFromOverallMm)
    ? clamp(lidSeamFromOverallMm, 0, overallHeightMm)
    : (derivedLidSeamGuidePx != null ? mapGuidePxToOverallMm(derivedLidSeamGuidePx) : null);
  const minimumSilverBandBottomMm = Math.max(
    0.5,
    effectiveLidSeamGuideMm != null ? effectiveLidSeamGuideMm + 1 : 1,
  );
  const effectiveSilverBandGuideMm = typeof silverBandBottomFromOverallMm === "number" && Number.isFinite(silverBandBottomFromOverallMm)
    ? clamp(silverBandBottomFromOverallMm, minimumSilverBandBottomMm, clampedBodyBottomFromOverallMm)
    : (derivedSilverBandGuidePx != null ? round1(clamp(
      mapGuidePxToOverallMm(derivedSilverBandGuidePx),
      minimumSilverBandBottomMm,
      clampedBodyBottomFromOverallMm,
    )) : null);
  const resolvedPrintableTopMm = round1(clamp(
    printableSurfaceContract?.printableTopMm ??
      effectiveSilverBandGuideMm ??
      clampedBodyTopFromOverallMm,
    clampedBodyTopFromOverallMm,
    clampedBodyBottomFromOverallMm,
  ));
  const resolvedPrintableBottomMm = round1(clamp(
    printableSurfaceContract?.printableBottomMm ?? clampedBodyBottomFromOverallMm,
    resolvedPrintableTopMm,
    clampedBodyBottomFromOverallMm,
  ));
  const printableExclusionSummary = printableSurfaceContract?.axialExclusions
    ?.filter((band) => band.kind !== "base")
    .map((band) => (band.kind === "rim-ring" ? "ring" : band.kind))
    .join(" / ") || "none";
  const autoDetectedBandValues = React.useMemo(() => {
    if (!activeDisplayPhoto) return null;
    if (
      activeDisplayPhoto.rimBottomY == null ||
      activeDisplayPhoto.rimDetectionSource === "none" ||
      (
        activeDisplayPhoto.rimDetectionSource === "photo-row-scan" &&
        (activeDisplayPhoto.rimDetectionConfidence ?? 0) < MIN_AUTO_RIM_DETECTION_CONFIDENCE
      )
    ) {
      return null;
    }

    const detectedLidSeamFromOverallMm = derivedLidSeamGuidePx != null
      ? mapGuidePxToOverallMm(derivedLidSeamGuidePx)
      : null;
    const detectedSilverBandBottomFromOverallMm = derivedSilverBandGuidePx != null
      ? round1(clamp(
        mapGuidePxToOverallMm(derivedSilverBandGuidePx),
        Math.max(
          0.5,
          (detectedLidSeamFromOverallMm ?? 0) + 1,
        ),
        clampedBodyBottomFromOverallMm,
      ))
      : null;

    if (detectedSilverBandBottomFromOverallMm == null) {
      return null;
    }

    const seededRingBottomMm = Number.isFinite(silverBandBottomFromOverallMm)
      ? round1(clamp(
        silverBandBottomFromOverallMm ?? detectedSilverBandBottomFromOverallMm,
        clampedBodyTopFromOverallMm,
        clampedBodyBottomFromOverallMm,
      ))
      : null;
    const corroboratedBySeededRing =
      seededRingBottomMm != null &&
      Math.abs(detectedSilverBandBottomFromOverallMm - seededRingBottomMm) <= Math.max(
        1.5,
        (clampedBodyBottomFromOverallMm - clampedBodyTopFromOverallMm) * 0.015,
      );
    const corroboratedByBodyTop =
      Math.abs(detectedSilverBandBottomFromOverallMm - clampedBodyTopFromOverallMm) <= Math.max(
        1.5,
        (clampedBodyBottomFromOverallMm - clampedBodyTopFromOverallMm) * 0.015,
      );

    return {
      source: activeDisplayPhoto.rimDetectionSource,
      confidence: Math.round((
        (corroboratedBySeededRing || corroboratedByBodyTop)
          ? Math.max(0.72, activeDisplayPhoto.rimDetectionConfidence ?? 0)
          : (activeDisplayPhoto.rimDetectionConfidence ?? 0)
      ) * 100) / 100,
      lidSeamFromOverallMm: detectedLidSeamFromOverallMm,
      silverBandBottomFromOverallMm: detectedSilverBandBottomFromOverallMm,
    };
  }, [
    activeDisplayPhoto,
    clampedBodyBottomFromOverallMm,
    clampedBodyTopFromOverallMm,
    derivedLidSeamGuidePx,
    derivedSilverBandGuidePx,
    overallHeightMm,
    pxPerMm,
    silverBandBottomFromOverallMm,
  ]);
  const legacyPrintableDetectionWeak =
    printableTopOverrideMm == null &&
    silverBandBottomFromOverallMm == null &&
    (printableSurfaceContract == null || activeDisplayPhoto?.rimDetectionSource !== "fit-debug") &&
    resolvedPrintableTopMm > clampedBodyTopFromOverallMm + 0.1;
  const printableDetectionWeak =
    printableTopOverrideMm != null || printableBottomOverrideMm != null
      ? false
      : (printableTopBoundaryWeak ?? legacyPrintableDetectionWeak);
  const bandDetectDisplaySource =
    printableTopBoundarySource ??
    autoDetectedBandValues?.source ??
    activeDisplayPhoto?.rimDetectionSource ??
    "none";
  const bandDetectDisplayConfidence = Number.isFinite(printableTopBoundaryConfidence)
    ? printableTopBoundaryConfidence ?? null
    : ((autoDetectedBandValues?.confidence ?? activeDisplayPhoto?.rimDetectionConfidence) ?? null);
  const bandDetectDisplayValue =
    bandDetectDisplaySource === "none"
      ? "manual"
      : `${bandDetectDisplaySource} ${Math.round((bandDetectDisplayConfidence ?? 0) * 100)}%`;

  useEffect(() => {
    if (!onPrintableSurfaceDetectionChange) return;
    if (!autoDetectedBandValues) {
      onPrintableSurfaceDetectionChange(null);
      return;
    }

    onPrintableSurfaceDetectionChange({
      source: autoDetectedBandValues.source,
      lidSeamFromOverallMm: autoDetectedBandValues.lidSeamFromOverallMm,
      rimRingBottomFromOverallMm: autoDetectedBandValues.silverBandBottomFromOverallMm,
      confidence: autoDetectedBandValues.confidence,
    });
  }, [
    autoDetectedBandValues,
    onPrintableSurfaceDetectionChange,
  ]);
  useEffect(() => {
    setManualGuideSelection({
      lid: false,
      silver: false,
      printableBottom: false,
    });
  }, [
    activeDisplayPhoto?.src,
    autoDetectedBandValues?.source,
    autoDetectedBandValues?.lidSeamFromOverallMm,
    autoDetectedBandValues?.silverBandBottomFromOverallMm,
    clampedBodyBottomFromOverallMm,
    clampedBodyTopFromOverallMm,
    overallHeightMm,
  ]);
  useEffect(() => {
    setManualHandleSelection({
      top: false,
      bottom: false,
      reach: false,
      upperCorner: false,
      lowerCorner: false,
      upperTransition: false,
      lowerTransition: false,
      tubeDiameter: false,
    });
  }, [
    activeDisplayPhoto?.src,
    activeDisplayPhoto?.handleSide,
    activeDisplayPhoto?.handleOuterRect?.x,
    activeDisplayPhoto?.handleOuterRect?.y,
    activeDisplayPhoto?.handleOuterRect?.width,
    activeDisplayPhoto?.handleOuterRect?.height,
  ]);
  const scaledHandleOuterRect = activeDisplayPhoto?.handleOuterRect
    ? {
        x: photoLeftPx + ((activeDisplayPhoto.handleOuterRect.x / activeDisplayPhoto.w) * photoWidthPx),
        y: photoTopPx + ((activeDisplayPhoto.handleOuterRect.y / activeDisplayPhoto.h) * targetPhotoHeightPx),
        width: (activeDisplayPhoto.handleOuterRect.width / activeDisplayPhoto.w) * photoWidthPx,
        height: (activeDisplayPhoto.handleOuterRect.height / activeDisplayPhoto.h) * targetPhotoHeightPx,
      }
    : null;
  const defaultHandleTopMm = scaledHandleOuterRect
    ? round1(mapDisplayedBodyPxToOverallMm(scaledHandleOuterRect.y))
    : null;
  const defaultHandleBottomMm = scaledHandleOuterRect
    ? round1(mapDisplayedBodyPxToOverallMm(scaledHandleOuterRect.y + scaledHandleOuterRect.height))
    : null;
  const defaultHandleReachMm = scaledHandleOuterRect && resolvedHandleSide
    ? round1(
        Math.max(
          0,
          resolvedHandleSide === "right"
            ? ((scaledHandleOuterRect.x + scaledHandleOuterRect.width) - (bodyLeftPx + bodyWidthPx)) / pxPerMm
            : (bodyLeftPx - scaledHandleOuterRect.x) / pxPerMm,
        ),
      )
    : null;
  const defaultHandleSpanMm =
    defaultHandleTopMm != null && defaultHandleBottomMm != null
      ? Math.max(0, defaultHandleBottomMm - defaultHandleTopMm)
      : null;
  const visualHandleTopFallbackMm = round1(clamp(
    Math.max(
      (effectiveSilverBandGuideMm ?? clampedBodyTopFromOverallMm) + 8,
      clampedBodyTopFromOverallMm + (bodyHeightMm * 0.08),
    ),
    clampedBodyTopFromOverallMm,
    clampedBodyBottomFromOverallMm,
  ));
  const visualHandleBottomFallbackMm = round1(clamp(
    Math.max(
      visualHandleTopFallbackMm + Math.max(64, bodyHeightMm * 0.42),
      clampedBodyTopFromOverallMm + (bodyHeightMm * 0.56),
    ),
    visualHandleTopFallbackMm + 24,
    clampedBodyBottomFromOverallMm,
  ));
  const visualHandleReachFallbackMm = round1(Math.max(
    defaultHandleReachMm ?? 0,
    (bodyWidthPx / Math.max(1, pxPerMm)) * 0.34,
  ));
  const useVisualHandleFallback =
    !manualHandleSelection.top &&
    !manualHandleSelection.bottom &&
    !manualHandleSelection.reach &&
    !manualHandleSelection.upperCorner &&
    !manualHandleSelection.lowerCorner &&
    !manualHandleSelection.upperTransition &&
    !manualHandleSelection.lowerTransition &&
    resolvedHandleSide != null &&
    (
      handleTopFromOverallMm == null ||
      handleBottomFromOverallMm == null ||
      handleReachMm == null ||
      defaultHandleSpanMm == null ||
      defaultHandleSpanMm < Math.max(88, bodyHeightMm * 0.42) ||
      (typeof handleTopFromOverallMm === "number" && handleTopFromOverallMm < visualHandleTopFallbackMm - 4)
    );
  const effectiveHandleTopMm = typeof handleTopFromOverallMm === "number" && Number.isFinite(handleTopFromOverallMm)
    ? clamp(handleTopFromOverallMm, 0, overallHeightMm)
    : (useVisualHandleFallback ? visualHandleTopFallbackMm : defaultHandleTopMm);
  const effectiveHandleBottomMm = typeof handleBottomFromOverallMm === "number" && Number.isFinite(handleBottomFromOverallMm)
    ? clamp(handleBottomFromOverallMm, effectiveHandleTopMm ?? 0, overallHeightMm)
    : (useVisualHandleFallback ? visualHandleBottomFallbackMm : defaultHandleBottomMm);
  const effectiveHandleReachMm = typeof handleReachMm === "number" && Number.isFinite(handleReachMm)
    ? Math.max(0, handleReachMm)
    : (useVisualHandleFallback ? visualHandleReachFallbackMm : defaultHandleReachMm);
  const defaultHandleCornerInsetMm = effectiveHandleTopMm != null && effectiveHandleBottomMm != null
    ? round1(
      Math.max(
        4,
        Math.min(
          (Math.max(
            8,
            mapOverallMmToDisplayedBodyPx(effectiveHandleBottomMm) - mapOverallMmToDisplayedBodyPx(effectiveHandleTopMm),
          ) * 0.18) / Math.max(1, pxPerMm),
          18 / Math.max(1, pxPerMm),
        ),
      ),
    )
    : 10;
  const defaultHandleCornerReachMm = effectiveHandleReachMm != null
    ? round1(Math.max(6, effectiveHandleReachMm * HANDLE_GUIDE_REACH_FACTOR))
    : null;
  const effectiveHandleUpperCornerMm = typeof handleUpperCornerFromOverallMm === "number" && Number.isFinite(handleUpperCornerFromOverallMm)
    ? clamp(
      handleUpperCornerFromOverallMm,
      (effectiveHandleTopMm ?? clampedBodyTopFromOverallMm) + 4,
      (effectiveHandleBottomMm ?? clampedBodyBottomFromOverallMm) - 8,
    )
    : (effectiveHandleTopMm != null && effectiveHandleBottomMm != null
      ? round1(clamp(
        effectiveHandleTopMm + defaultHandleCornerInsetMm,
        effectiveHandleTopMm + 4,
        effectiveHandleBottomMm - 8,
      ))
      : null);
  const effectiveHandleLowerCornerMm = typeof handleLowerCornerFromOverallMm === "number" && Number.isFinite(handleLowerCornerFromOverallMm)
    ? clamp(
      handleLowerCornerFromOverallMm,
      (effectiveHandleUpperCornerMm ?? ((effectiveHandleTopMm ?? clampedBodyTopFromOverallMm) + 8)) + 4,
      (effectiveHandleBottomMm ?? clampedBodyBottomFromOverallMm) - 4,
    )
    : (effectiveHandleTopMm != null && effectiveHandleBottomMm != null
      ? round1(clamp(
        effectiveHandleBottomMm - defaultHandleCornerInsetMm,
        (effectiveHandleUpperCornerMm ?? (effectiveHandleTopMm + 8)) + 4,
        effectiveHandleBottomMm - 4,
      ))
      : null);
  const effectiveHandleUpperCornerReachMm = typeof handleUpperCornerReachMm === "number" && Number.isFinite(handleUpperCornerReachMm)
    ? Math.max(0, handleUpperCornerReachMm)
    : defaultHandleCornerReachMm;
  const effectiveHandleLowerCornerReachMm = typeof handleLowerCornerReachMm === "number" && Number.isFinite(handleLowerCornerReachMm)
    ? Math.max(0, handleLowerCornerReachMm)
    : defaultHandleCornerReachMm;
  const defaultHandleTransitionReachMm = effectiveHandleReachMm != null
    ? round1(Math.max(4, effectiveHandleReachMm * 0.58))
    : null;
  const effectiveHandleUpperTransitionReachMm = typeof handleUpperTransitionReachMm === "number" && Number.isFinite(handleUpperTransitionReachMm)
    ? Math.max(0, handleUpperTransitionReachMm)
    : defaultHandleTransitionReachMm;
  const effectiveHandleLowerTransitionReachMm = typeof handleLowerTransitionReachMm === "number" && Number.isFinite(handleLowerTransitionReachMm)
    ? Math.max(0, handleLowerTransitionReachMm)
    : defaultHandleTransitionReachMm;
  const effectiveHandleUpperTransitionMm = typeof handleUpperTransitionFromOverallMm === "number" && Number.isFinite(handleUpperTransitionFromOverallMm)
    ? clamp(
      handleUpperTransitionFromOverallMm,
      effectiveHandleTopMm ?? clampedBodyTopFromOverallMm,
      (effectiveHandleUpperCornerMm ?? (effectiveHandleTopMm ?? clampedBodyTopFromOverallMm)) - 2,
    )
    : (effectiveHandleTopMm != null && effectiveHandleUpperCornerMm != null
      ? round1(clamp(
        effectiveHandleTopMm,
        effectiveHandleTopMm,
        effectiveHandleUpperCornerMm - 2,
      ))
      : effectiveHandleTopMm);
  const effectiveHandleLowerTransitionMm = typeof handleLowerTransitionFromOverallMm === "number" && Number.isFinite(handleLowerTransitionFromOverallMm)
    ? clamp(
      handleLowerTransitionFromOverallMm,
      (effectiveHandleLowerCornerMm ?? (effectiveHandleBottomMm ?? clampedBodyBottomFromOverallMm)) + 2,
      effectiveHandleBottomMm ?? clampedBodyBottomFromOverallMm,
    )
    : (effectiveHandleBottomMm != null && effectiveHandleLowerCornerMm != null
      ? round1(clamp(
        effectiveHandleBottomMm,
        effectiveHandleLowerCornerMm + 2,
        effectiveHandleBottomMm,
      ))
      : effectiveHandleBottomMm);
  const effectiveHandleOuterTopMm = effectiveHandleTopMm;
  const effectiveHandleOuterBottomMm = effectiveHandleBottomMm;
  const handleTopGuidePx = effectiveHandleTopMm != null
    ? mapOverallMmToDisplayedBodyPx(effectiveHandleTopMm)
    : null;
  const handleBottomGuidePx = effectiveHandleBottomMm != null
    ? mapOverallMmToDisplayedBodyPx(effectiveHandleBottomMm)
    : null;
  const handleUpperCornerGuidePx = effectiveHandleUpperCornerMm != null
    ? mapOverallMmToDisplayedBodyPx(effectiveHandleUpperCornerMm)
    : null;
  const handleLowerCornerGuidePx = effectiveHandleLowerCornerMm != null
    ? mapOverallMmToDisplayedBodyPx(effectiveHandleLowerCornerMm)
    : null;
  const handleUpperTransitionGuidePx = effectiveHandleUpperTransitionMm != null
    ? mapOverallMmToDisplayedBodyPx(effectiveHandleUpperTransitionMm)
    : null;
  const handleLowerTransitionGuidePx = effectiveHandleLowerTransitionMm != null
    ? mapOverallMmToDisplayedBodyPx(effectiveHandleLowerTransitionMm)
    : null;
  const handleOuterTopGuidePx = effectiveHandleOuterTopMm != null
    ? mapOverallMmToDisplayedBodyPx(effectiveHandleOuterTopMm)
    : null;
  const handleOuterBottomGuidePx = effectiveHandleOuterBottomMm != null
    ? mapOverallMmToDisplayedBodyPx(effectiveHandleOuterBottomMm)
    : null;
  const handleReachPx = effectiveHandleReachMm != null ? effectiveHandleReachMm * pxPerMm : null;
  const previewHandleGuideRect = resolvedHandleSide
    ? (() => {
        if (handleTopGuidePx != null && handleBottomGuidePx != null && handleReachPx != null) {
          const attachX = resolvedHandleSide === "right"
            ? bodyLeftPx + bodyWidthPx
            : bodyLeftPx;
          const outerX = resolvedHandleSide === "right"
            ? attachX + handleReachPx
            : attachX - handleReachPx;
          return {
            x: Math.min(attachX, outerX),
            y: handleTopGuidePx,
            width: Math.max(8, Math.abs(outerX - attachX)),
            height: Math.max(8, handleBottomGuidePx - handleTopGuidePx),
          };
        }
        const guideTopPx = mapOverallMmToDisplayedBodyPx(visualHandleTopFallbackMm);
        const guideBottomPx = mapOverallMmToDisplayedBodyPx(visualHandleBottomFallbackMm);
        const attachX = resolvedHandleSide === "right"
          ? bodyLeftPx + bodyWidthPx
          : bodyLeftPx;
        const outerX = resolvedHandleSide === "right"
          ? attachX + (visualHandleReachFallbackMm * pxPerMm)
          : attachX - (visualHandleReachFallbackMm * pxPerMm);
        return {
          x: Math.min(attachX, outerX),
          y: guideTopPx,
          width: Math.max(8, Math.abs(outerX - attachX)),
          height: Math.max(8, guideBottomPx - guideTopPx),
        };
      })()
    : null;
  const overlayHandleTopY = activeDisplayPhoto && handleTopGuidePx != null
    ? clamp(((handleTopGuidePx - photoTopPx) / Math.max(1, targetPhotoHeightPx)) * activeDisplayPhoto.h, 0, activeDisplayPhoto.h)
    : null;
  const overlayHandleBottomY = activeDisplayPhoto && handleBottomGuidePx != null
    ? clamp(((handleBottomGuidePx - photoTopPx) / Math.max(1, targetPhotoHeightPx)) * activeDisplayPhoto.h, 0, activeDisplayPhoto.h)
    : null;
  const overlayHandleOuterTopY = activeDisplayPhoto && handleOuterTopGuidePx != null
    ? clamp(((handleOuterTopGuidePx - photoTopPx) / Math.max(1, targetPhotoHeightPx)) * activeDisplayPhoto.h, 0, activeDisplayPhoto.h)
    : null;
  const overlayHandleOuterBottomY = activeDisplayPhoto && handleOuterBottomGuidePx != null
    ? clamp(((handleOuterBottomGuidePx - photoTopPx) / Math.max(1, targetPhotoHeightPx)) * activeDisplayPhoto.h, 0, activeDisplayPhoto.h)
    : null;
  const overlayHandleUpperCornerY = activeDisplayPhoto && handleUpperCornerGuidePx != null
    ? clamp(((handleUpperCornerGuidePx - photoTopPx) / Math.max(1, targetPhotoHeightPx)) * activeDisplayPhoto.h, 0, activeDisplayPhoto.h)
    : null;
  const overlayHandleLowerCornerY = activeDisplayPhoto && handleLowerCornerGuidePx != null
    ? clamp(((handleLowerCornerGuidePx - photoTopPx) / Math.max(1, targetPhotoHeightPx)) * activeDisplayPhoto.h, 0, activeDisplayPhoto.h)
    : null;
  const overlayHandleUpperTransitionY = activeDisplayPhoto && handleUpperTransitionGuidePx != null
    ? clamp(((handleUpperTransitionGuidePx - photoTopPx) / Math.max(1, targetPhotoHeightPx)) * activeDisplayPhoto.h, 0, activeDisplayPhoto.h)
    : null;
  const overlayHandleLowerTransitionY = activeDisplayPhoto && handleLowerTransitionGuidePx != null
    ? clamp(((handleLowerTransitionGuidePx - photoTopPx) / Math.max(1, targetPhotoHeightPx)) * activeDisplayPhoto.h, 0, activeDisplayPhoto.h)
    : null;
  const overlayHandleAttachX = activeDisplayPhoto && resolvedHandleSide
    ? (
      resolvedHandleSide === "right"
        ? (activeDisplayPhoto.bodyOutlineBounds?.maxX ?? (activeDisplayPhoto.bodyCenterX + (activeDisplayPhoto.referenceBodyWidthPx / 2)))
        : (activeDisplayPhoto.bodyOutlineBounds?.minX ?? (activeDisplayPhoto.bodyCenterX - (activeDisplayPhoto.referenceBodyWidthPx / 2)))
    )
    : null;
  const overlayHandleReachMmToPx = React.useCallback((reachMm: number | null | undefined) => {
    if (!activeDisplayPhoto || reachMm == null || !Number.isFinite(reachMm)) return null;
    return Math.max(
      8,
      (reachMm / Math.max(0.1, visualReferenceDiameterMm))
      * Math.max(1, activeDisplayPhoto.bodyOutlineBounds?.width ?? activeDisplayPhoto.referenceBodyWidthPx),
    );
  }, [activeDisplayPhoto, visualReferenceDiameterMm]);
  const mapHandleOffsetPxToMm = React.useCallback((offsetPx: number | null | undefined) => {
    if (!activeDisplayPhoto || offsetPx == null || !Number.isFinite(offsetPx)) return null;
    return round1(Math.max(
      0,
      (offsetPx / Math.max(1, activeDisplayPhoto.bodyOutlineBounds?.width ?? activeDisplayPhoto.referenceBodyWidthPx))
      * Math.max(0.1, visualReferenceDiameterMm),
    ));
  }, [activeDisplayPhoto, visualReferenceDiameterMm]);
  const overlayHandleUpperCornerX = resolvedHandleSide && overlayHandleAttachX != null
    ? (() => {
      const reachPx = overlayHandleReachMmToPx(effectiveHandleUpperCornerReachMm);
      if (reachPx == null) return null;
      return resolvedHandleSide === "right"
        ? overlayHandleAttachX + reachPx
        : overlayHandleAttachX - reachPx;
    })()
    : null;
  const overlayHandleUpperTransitionX = resolvedHandleSide && overlayHandleAttachX != null
    ? (() => {
      const maxReachMm = Math.max(0, (effectiveHandleUpperCornerReachMm ?? 0) - 2);
      const transitionReachMm = clamp(
        effectiveHandleUpperTransitionReachMm ?? 0,
        2,
        Math.max(2, maxReachMm),
      );
      const reachPx = overlayHandleReachMmToPx(transitionReachMm);
      if (reachPx == null) return null;
      return resolvedHandleSide === "right"
        ? overlayHandleAttachX + reachPx
        : overlayHandleAttachX - reachPx;
    })()
    : null;
  const overlayHandleLowerCornerX = resolvedHandleSide && overlayHandleAttachX != null
    ? (() => {
      const reachPx = overlayHandleReachMmToPx(effectiveHandleLowerCornerReachMm);
      if (reachPx == null) return null;
      return resolvedHandleSide === "right"
        ? overlayHandleAttachX + reachPx
        : overlayHandleAttachX - reachPx;
    })()
    : null;
  const overlayHandleLowerTransitionX = resolvedHandleSide && overlayHandleAttachX != null
    ? (() => {
      const maxReachMm = Math.max(0, (effectiveHandleLowerCornerReachMm ?? 0) - 2);
      const transitionReachMm = clamp(
        effectiveHandleLowerTransitionReachMm ?? 0,
        2,
        Math.max(2, maxReachMm),
      );
      const reachPx = overlayHandleReachMmToPx(transitionReachMm);
      if (reachPx == null) return null;
      return resolvedHandleSide === "right"
        ? overlayHandleAttachX + reachPx
        : overlayHandleAttachX - reachPx;
    })()
    : null;
  const defaultHandleTubeDiameterMm = (() => {
    if (!activeDisplayPhoto?.handleOuterRect || !activeDisplayPhoto.handleInnerRect) {
      return round1(Math.max(4, (effectiveHandleReachMm ?? 0) * 0.18));
    }
    const measuredOffsetPx = resolvedHandleSide === "right"
      ? (activeDisplayPhoto.handleOuterRect.x + activeDisplayPhoto.handleOuterRect.width)
        - (activeDisplayPhoto.handleInnerRect.x + activeDisplayPhoto.handleInnerRect.width)
      : activeDisplayPhoto.handleInnerRect.x - activeDisplayPhoto.handleOuterRect.x;
    return mapHandleOffsetPxToMm(clamp(measuredOffsetPx, 4, 32)) ?? round1(Math.max(4, (effectiveHandleReachMm ?? 0) * 0.18));
  })();
  const effectiveHandleTubeDiameterMm = typeof handleTubeDiameterMm === "number" && Number.isFinite(handleTubeDiameterMm)
    ? round1(Math.max(2, handleTubeDiameterMm))
    : defaultHandleTubeDiameterMm;
  const overlayHandleSideOffsetPx = clamp(
    overlayHandleReachMmToPx(effectiveHandleTubeDiameterMm) ?? 6,
    4,
    32,
  );
  const transformedHandleOuterRect = scaledHandleOuterRect && resolvedHandleSide && handleOuterTopGuidePx != null && handleOuterBottomGuidePx != null && handleReachPx != null
    ? (() => {
        const attachX = resolvedHandleSide === "right"
          ? bodyLeftPx + bodyWidthPx
          : bodyLeftPx;
        const outerX = resolvedHandleSide === "right"
          ? attachX + handleReachPx + overlayHandleSideOffsetPx
          : attachX - handleReachPx - overlayHandleSideOffsetPx;
        return {
          x: Math.min(attachX, outerX),
          y: handleOuterTopGuidePx,
          width: Math.abs(outerX - attachX),
          height: Math.max(8, handleOuterBottomGuidePx - handleOuterTopGuidePx),
        };
      })()
    : scaledHandleOuterRect;
  const transformedHandleInnerRect = activeDisplayPhoto?.handleInnerRect && resolvedHandleSide && transformedHandleOuterRect
    ? (() => {
        const sourceInnerRect = activeDisplayPhoto.handleInnerRect;
        const sourceOuterRect = activeDisplayPhoto.handleOuterRect ?? sourceInnerRect;
        const sourceOuterHeight = Math.max(1, sourceOuterRect.height);
        const innerTopRatio = clamp((sourceInnerRect.y - sourceOuterRect.y) / sourceOuterHeight, 0, 1);
        const innerHeightRatio = clamp(sourceInnerRect.height / sourceOuterHeight, 0.08, 1);
        const targetHeight = Math.max(6, transformedHandleOuterRect.height * innerHeightRatio);
        const targetY = clamp(
          transformedHandleOuterRect.y + (transformedHandleOuterRect.height * innerTopRatio),
          transformedHandleOuterRect.y,
          transformedHandleOuterRect.y + transformedHandleOuterRect.height - targetHeight,
        );
        const sourceAttachX = resolvedHandleSide === "right"
          ? activeDisplayPhoto.bodyCenterX + (activeDisplayPhoto.referenceBodyWidthPx / 2)
          : activeDisplayPhoto.bodyCenterX - (activeDisplayPhoto.referenceBodyWidthPx / 2);
        const sourceOuterEdgeX = resolvedHandleSide === "right"
          ? sourceOuterRect.x + sourceOuterRect.width
          : sourceOuterRect.x;
        const sourceInnerFarX = resolvedHandleSide === "right"
          ? sourceInnerRect.x + sourceInnerRect.width
          : sourceInnerRect.x;
        const sourceTotalReachPx = Math.max(1, Math.abs(sourceOuterEdgeX - sourceAttachX));
        const sourceInnerReachPx = Math.max(4, Math.abs(sourceInnerFarX - sourceAttachX));
        const innerReachRatio = clamp(sourceInnerReachPx / sourceTotalReachPx, 0.08, 0.92);
        const targetInnerReachPx = Math.max(6, transformedHandleOuterRect.width * innerReachRatio);
        const targetAttachX = resolvedHandleSide === "right"
          ? bodyLeftPx + bodyWidthPx
          : bodyLeftPx;
        return resolvedHandleSide === "right"
          ? {
              x: targetAttachX,
              y: targetY,
              width: targetInnerReachPx,
              height: targetHeight,
            }
          : {
              x: targetAttachX - targetInnerReachPx,
              y: targetY,
              width: targetInnerReachPx,
              height: targetHeight,
            };
      })()
    : (activeDisplayPhoto?.handleInnerRect
      ? {
          x: photoLeftPx + ((activeDisplayPhoto.handleInnerRect.x / activeDisplayPhoto.w) * photoWidthPx),
          y: photoTopPx + ((activeDisplayPhoto.handleInnerRect.y / activeDisplayPhoto.h) * targetPhotoHeightPx),
          width: (activeDisplayPhoto.handleInnerRect.width / activeDisplayPhoto.w) * photoWidthPx,
          height: (activeDisplayPhoto.handleInnerRect.height / activeDisplayPhoto.h) * targetPhotoHeightPx,
        }
      : null);
  const handlePathTransform = activeDisplayPhoto?.handleOuterRect && transformedHandleOuterRect
    ? (() => {
        const sx = transformedHandleOuterRect.width / Math.max(1, activeDisplayPhoto.handleOuterRect.width);
        const sy = transformedHandleOuterRect.height / Math.max(1, activeDisplayPhoto.handleOuterRect.height);
        const tx = transformedHandleOuterRect.x - (activeDisplayPhoto.handleOuterRect.x * sx);
        const ty = transformedHandleOuterRect.y - (activeDisplayPhoto.handleOuterRect.y * sy);
        return `matrix(${round1(sx)} 0 0 ${round1(sy)} ${round1(tx)} ${round1(ty)})`;
      })()
    : undefined;
  const handleInnerPathTransform = activeDisplayPhoto?.handleInnerRect && transformedHandleInnerRect
    ? (() => {
        const sx = transformedHandleInnerRect.width / Math.max(1, activeDisplayPhoto.handleInnerRect.width);
        const sy = transformedHandleInnerRect.height / Math.max(1, activeDisplayPhoto.handleInnerRect.height);
        const tx = transformedHandleInnerRect.x - (activeDisplayPhoto.handleInnerRect.x * sx);
        const ty = transformedHandleInnerRect.y - (activeDisplayPhoto.handleInnerRect.y * sy);
        return `matrix(${round1(sx)} 0 0 ${round1(sy)} ${round1(tx)} ${round1(ty)})`;
      })()
    : undefined;
  const mapOverallMmToOverlayY = React.useCallback((value: number | null | undefined) => {
    if (!activeDisplayPhoto || value == null || !Number.isFinite(value)) return null;
    const displayedPx = mapOverallMmToDisplayedBodyPx(value);
    return clamp(
      ((displayedPx - photoTopPx) / Math.max(1, targetPhotoHeightPx)) * activeDisplayPhoto.h,
      0,
      activeDisplayPhoto.h,
    );
  }, [activeDisplayPhoto, mapOverallMmToDisplayedBodyPx, photoTopPx, targetPhotoHeightPx]);
  const canonicalHandleGuideGeometry = editableHandlePreview
    && resolvedHandleSide
    && overlayHandleAttachX != null
    && activeDisplayPhoto
    ? (() => {
        const reachToOverlayX = (reachMm: number | null | undefined) => {
          const reachPx = overlayHandleReachMmToPx(reachMm ?? 0);
          if (reachPx == null) return null;
          return resolvedHandleSide === "right"
            ? overlayHandleAttachX + reachPx
            : overlayHandleAttachX - reachPx;
        };
        const toPoint = (fromOverallMm: number, reachMm: number) => {
          const y = mapOverallMmToOverlayY(fromOverallMm);
          const x = reachMm <= 0 ? overlayHandleAttachX : reachToOverlayX(reachMm);
          if (x == null || y == null) return null;
          return { x, y };
        };
        const preview = editableHandlePreview;
        const attachTop = toPoint(preview.topFromOverallMm, 0);
        const attachBottom = toPoint(preview.bottomFromOverallMm, 0);
        const upperTransition = toPoint(preview.upperTransitionFromOverallMm, preview.upperTransitionReachMm);
        const upperCorner = toPoint(preview.upperCornerFromOverallMm, preview.upperCornerReachMm);
        const lowerCorner = toPoint(preview.lowerCornerFromOverallMm, preview.lowerCornerReachMm);
        const lowerTransition = toPoint(preview.lowerTransitionFromOverallMm, preview.lowerTransitionReachMm);
        if (!attachTop || !attachBottom || !upperTransition || !upperCorner || !lowerCorner || !lowerTransition) {
          return null;
        }
        return solveEditableHandlePreviewGeometry({
          handle: preview,
          toPoint: (fromOverallMm, reachMm) => {
            const point = toPoint(fromOverallMm, reachMm);
            if (!point) {
              return { x: overlayHandleAttachX, y: 0 };
            }
            return point;
          },
        });
      })()
    : null;
  const fallbackAnchoredHandleGuidePath = resolvedHandleSide
    && overlayHandleAttachX != null
    && overlayHandleTopY != null
    && overlayHandleBottomY != null
    && overlayHandleUpperTransitionX != null
    && overlayHandleUpperTransitionY != null
    && overlayHandleLowerTransitionX != null
    && overlayHandleLowerTransitionY != null
    && overlayHandleUpperCornerX != null
    && overlayHandleUpperCornerY != null
    && overlayHandleLowerCornerX != null
    && overlayHandleLowerCornerY != null
    ? buildAnchoredHandleGuidePath({
        attachX: overlayHandleAttachX,
        topY: overlayHandleTopY,
        bottomY: overlayHandleBottomY,
        upperEntryX: overlayHandleUpperTransitionX,
        upperEntryY: overlayHandleUpperTransitionY,
        lowerExitX: overlayHandleLowerTransitionX,
        lowerExitY: overlayHandleLowerTransitionY,
        upperCornerX: overlayHandleUpperCornerX,
        upperCornerY: overlayHandleUpperCornerY,
        lowerCornerX: overlayHandleLowerCornerX,
        lowerCornerY: overlayHandleLowerCornerY,
      })
    : null;
  const fallbackOuterHandleGuideGeometry = resolvedHandleSide
    && overlayHandleAttachX != null
    && overlayHandleTopY != null
    && overlayHandleBottomY != null
    && overlayHandleUpperTransitionX != null
    && overlayHandleUpperTransitionY != null
    && overlayHandleLowerTransitionX != null
    && overlayHandleLowerTransitionY != null
    && overlayHandleUpperCornerX != null
    && overlayHandleUpperCornerY != null
    && overlayHandleLowerCornerX != null
    && overlayHandleLowerCornerY != null
    ? buildOffsetHandleGuideGeometry({
        side: resolvedHandleSide,
        offsetPx: Math.max(4, overlayHandleSideOffsetPx),
        attachX: overlayHandleAttachX,
        topY: overlayHandleTopY,
        bottomY: overlayHandleBottomY,
        upperEntryX: overlayHandleUpperTransitionX,
        upperEntryY: overlayHandleUpperTransitionY,
        lowerExitX: overlayHandleLowerTransitionX,
        lowerExitY: overlayHandleLowerTransitionY,
        upperCornerX: overlayHandleUpperCornerX,
        upperCornerY: overlayHandleUpperCornerY,
        lowerCornerX: overlayHandleLowerCornerX,
        lowerCornerY: overlayHandleLowerCornerY,
      })
    : null;
  const anchoredHandleGuidePath = canonicalHandleGuideGeometry?.innerPath ?? fallbackAnchoredHandleGuidePath;
  const anchoredHandleGuideOuterPath = canonicalHandleGuideGeometry?.outerPath ?? fallbackOuterHandleGuideGeometry?.path ?? null;
  const hasPhotoBackedHandleGuidePath = Boolean(activeDisplayPhoto?.handleInnerPath || activeDisplayPhoto?.handleOuterPath);
  const usingAnchoredHandleGuidePath = !hasPhotoBackedHandleGuidePath && Boolean(anchoredHandleGuidePath);
  const visibleHandleGuideInnerPath = hasPhotoBackedHandleGuidePath
    ? (activeDisplayPhoto?.handleInnerPath ?? null)
    : (anchoredHandleGuidePath ?? null);
  const visibleHandleGuideInnerTransform = hasPhotoBackedHandleGuidePath
    ? undefined
    : (anchoredHandleGuidePath ? undefined : handleInnerPathTransform);
  const visibleHandleGuideOuterPath = hasPhotoBackedHandleGuidePath
    ? (activeDisplayPhoto?.handleOuterPath ?? null)
    : anchoredHandleGuideOuterPath;
  const anchoredHandleGuideAttachPoints = canonicalHandleGuideGeometry
    ? {
        top: canonicalHandleGuideGeometry.innerPoints.attachTop,
        bottom: canonicalHandleGuideGeometry.innerPoints.attachBottom,
      }
    : (
      resolvedHandleSide
        && overlayHandleAttachX != null
        && overlayHandleTopY != null
        && overlayHandleBottomY != null
        ? {
            top: { x: overlayHandleAttachX, y: overlayHandleTopY },
            bottom: { x: overlayHandleAttachX, y: overlayHandleBottomY },
          }
        : null
    );
  const anchoredHandleGuideOuterCornerPoints = canonicalHandleGuideGeometry
    ? {
        upper: canonicalHandleGuideGeometry.outerPoints.upperCorner,
        lower: canonicalHandleGuideGeometry.outerPoints.lowerCorner,
      }
    : null;
  const anchoredHandleGuideCornerPoints = canonicalHandleGuideGeometry
    ? {
        upper: canonicalHandleGuideGeometry.innerPoints.upperCorner,
        lower: canonicalHandleGuideGeometry.innerPoints.lowerCorner,
      }
    : (overlayHandleUpperCornerX != null
    && overlayHandleUpperCornerY != null
    && overlayHandleLowerCornerX != null
    && overlayHandleLowerCornerY != null
    ? {
        upper: { x: overlayHandleUpperCornerX, y: overlayHandleUpperCornerY },
        lower: { x: overlayHandleLowerCornerX, y: overlayHandleLowerCornerY },
      }
    : null);
  const anchoredHandleGuideTransitionPoints = canonicalHandleGuideGeometry
    ? {
        upper: canonicalHandleGuideGeometry.innerPoints.upperTransition,
        lower: canonicalHandleGuideGeometry.innerPoints.lowerTransition,
      }
    : (overlayHandleUpperTransitionX != null
    && overlayHandleUpperTransitionY != null
    && overlayHandleLowerTransitionX != null
    && overlayHandleLowerTransitionY != null
    ? {
        upper: { x: overlayHandleUpperTransitionX, y: overlayHandleUpperTransitionY },
        lower: { x: overlayHandleLowerTransitionX, y: overlayHandleLowerTransitionY },
      }
    : null);
  const mapOverlayPointToContainerPoint = React.useCallback((point: { x: number; y: number } | null) => {
    if (!activeDisplayPhoto || point == null) return null;
    return {
      x: photoLeftPx + ((point.x / Math.max(1, activeDisplayPhoto.w)) * photoWidthPx),
      y: photoTopPx + ((point.y / Math.max(1, activeDisplayPhoto.h)) * targetPhotoHeightPx),
    };
  }, [activeDisplayPhoto, photoLeftPx, photoTopPx, photoWidthPx, targetPhotoHeightPx]);
  const handleTopAttachButtonPoint = anchoredHandleGuideAttachPoints
    ? mapOverlayPointToContainerPoint(anchoredHandleGuideAttachPoints.top)
    : null;
  const handleBottomAttachButtonPoint = anchoredHandleGuideAttachPoints
    ? mapOverlayPointToContainerPoint(anchoredHandleGuideAttachPoints.bottom)
    : null;
  const handleUpperCornerButtonPoint = anchoredHandleGuideCornerPoints
    ? mapOverlayPointToContainerPoint(anchoredHandleGuideCornerPoints.upper)
    : null;
  const handleLowerCornerButtonPoint = anchoredHandleGuideCornerPoints
    ? mapOverlayPointToContainerPoint(anchoredHandleGuideCornerPoints.lower)
    : null;
  const handleUpperTransitionButtonPoint = anchoredHandleGuideTransitionPoints
    ? mapOverlayPointToContainerPoint(anchoredHandleGuideTransitionPoints.upper)
    : null;
  const handleLowerTransitionButtonPoint = anchoredHandleGuideTransitionPoints
    ? mapOverlayPointToContainerPoint(anchoredHandleGuideTransitionPoints.lower)
    : null;
  const handleOuterUpperCornerButtonPoint = anchoredHandleGuideOuterCornerPoints
    ? mapOverlayPointToContainerPoint(anchoredHandleGuideOuterCornerPoints.upper)
    : null;
  const handleOuterLowerCornerButtonPoint = anchoredHandleGuideOuterCornerPoints
    ? mapOverlayPointToContainerPoint(anchoredHandleGuideOuterCornerPoints.lower)
    : null;
  const handleThicknessButtonPoint =
    handleOuterUpperCornerButtonPoint && handleOuterLowerCornerButtonPoint
      ? {
          x: round1((handleOuterUpperCornerButtonPoint.x + handleOuterLowerCornerButtonPoint.x) / 2),
          y: round1((handleOuterUpperCornerButtonPoint.y + handleOuterLowerCornerButtonPoint.y) / 2),
        }
      : null;
  const handleThicknessBaselinePoint =
    handleUpperCornerButtonPoint && handleLowerCornerButtonPoint
      ? {
          x: round1((handleUpperCornerButtonPoint.x + handleLowerCornerButtonPoint.x) / 2),
          y: round1((handleUpperCornerButtonPoint.y + handleLowerCornerButtonPoint.y) / 2),
        }
      : null;
  const straightWallBottomPx = derivedZoneGuides?.straightWallBottomYFromTopMm != null
    ? derivedZoneGuides.straightWallBottomYFromTopMm * pxPerMm
    : null;
  const rimTopGuidePx = effectiveLidSeamGuideMm != null
    ? Math.round(mapOverallMmToDisplayedPhotoPx(effectiveLidSeamGuideMm))
    : null;
  const rimBottomGuidePx = effectiveSilverBandGuideMm != null
    ? Math.round(mapOverallMmToDisplayedPhotoPx(effectiveSilverBandGuideMm))
    : null;
  const fallbackVisualLidGuideMm = round1(clamp(
    Math.max(
      0,
      Math.min(
        clampedBodyBottomFromOverallMm - 2,
        clampedBodyTopFromOverallMm - Math.max(4, Math.min(14, bodyHeightMm * 0.05)),
      ),
    ),
    0,
    clampedBodyBottomFromOverallMm,
  ));
  const fallbackVisualSilverGuideMm = round1(clamp(
    fallbackVisualLidGuideMm + Math.max(6, Math.min(18, bodyHeightMm * 0.045)),
    fallbackVisualLidGuideMm + 1,
    clampedBodyBottomFromOverallMm,
  ));
  const fallbackReferenceBandHalfPhotoPx = activeDisplayPhoto
    ? Math.max(4, Math.min(9, Math.round(activeDisplayPhoto.h * 0.0125)))
    : null;
  const fallbackRimTopGuidePx = activeDisplayPhoto && fallbackReferenceBandHalfPhotoPx != null
    && Number.isFinite(activeDisplayPhoto.referenceBandCenterY)
    ? Math.round(
      photoTopPx
      + (((activeDisplayPhoto.referenceBandCenterY - fallbackReferenceBandHalfPhotoPx) / Math.max(1, activeDisplayPhoto.h)) * targetPhotoHeightPx),
    )
    : null;
  const fallbackRimBottomGuidePx = activeDisplayPhoto && fallbackReferenceBandHalfPhotoPx != null
    && Number.isFinite(activeDisplayPhoto.referenceBandCenterY)
    ? Math.round(
      photoTopPx
      + (((activeDisplayPhoto.referenceBandCenterY + fallbackReferenceBandHalfPhotoPx) / Math.max(1, activeDisplayPhoto.h)) * targetPhotoHeightPx),
    )
    : null;
  const autoVisualLidGuidePx = derivedLidSeamGuidePx ?? fallbackRimTopGuidePx;
  const autoVisualSilverGuidePx = derivedSilverBandGuidePx ?? fallbackRimBottomGuidePx;
  const visualLidGuidePx = activeDisplayPhoto && !manualGuideSelection.lid
    ? autoVisualLidGuidePx ?? rimTopGuidePx ?? Math.round(fallbackVisualLidGuideMm * pxPerMm)
    : rimTopGuidePx ?? autoVisualLidGuidePx ?? Math.round(fallbackVisualLidGuideMm * pxPerMm);
  const visualLidGuideMm = visualLidGuidePx != null
    ? mapGuidePxToOverallMm(visualLidGuidePx)
    : fallbackVisualLidGuideMm;
  const minimumVisualSilverGuideMm = Math.max(
    0.5,
    visualLidGuideMm + 1,
  );
  const visualSilverGuidePx = activeDisplayPhoto && !manualGuideSelection.silver
    ? autoVisualSilverGuidePx ?? rimBottomGuidePx ?? Math.round(fallbackVisualSilverGuideMm * pxPerMm)
    : rimBottomGuidePx ?? autoVisualSilverGuidePx ?? Math.round(fallbackVisualSilverGuideMm * pxPerMm);
  const visualSilverGuideMm = visualSilverGuidePx != null
    ? round1(clamp(
      mapGuidePxToOverallMm(visualSilverGuidePx),
      minimumVisualSilverGuideMm,
      clampedBodyBottomFromOverallMm,
    ))
    : fallbackVisualSilverGuideMm;
  const displayPrintableTopMm = visualSilverGuideMm ?? effectiveSilverBandGuideMm ?? resolvedPrintableTopMm;
  const resolvedPrintableCenterMm = round1((displayPrintableTopMm + resolvedPrintableBottomMm) / 2);
  const resolvedPrintableHeightMm = round1(Math.max(0, resolvedPrintableBottomMm - resolvedPrintableTopMm));
  const printableTopGuidePx = Math.round(mapOverallMmToDisplayedBodyPx(resolvedPrintableTopMm));
  const printableBottomGuidePx = Math.round(mapOverallMmToDisplayedBodyPx(resolvedPrintableBottomMm));
  const printableCenterGuidePx = visualSilverGuidePx != null
    ? Math.round((visualSilverGuidePx + printableBottomGuidePx) / 2)
    : Math.round(mapOverallMmToDisplayedBodyPx(resolvedPrintableCenterMm));
  const applyableBandValues = autoDetectedBandValues ?? (
    visualLidGuidePx != null && visualSilverGuidePx != null
      ? {
          source: "visual-estimate",
          confidence: null,
          lidSeamFromOverallMm: visualLidGuideMm,
          silverBandBottomFromOverallMm: visualSilverGuideMm,
        }
      : null
  );
  const autoDetectedBandsCommitted =
    applyableBandValues != null &&
    (applyableBandValues.lidSeamFromOverallMm == null || lidSeamFromOverallMm === applyableBandValues.lidSeamFromOverallMm) &&
    silverBandBottomFromOverallMm === applyableBandValues.silverBandBottomFromOverallMm;
  const overlayRimTopY = activeDisplayPhoto && visualLidGuidePx != null
    ? clamp(((visualLidGuidePx - photoTopPx) / Math.max(1, targetPhotoHeightPx)) * activeDisplayPhoto.h, 0, activeDisplayPhoto.h)
    : null;
  const overlayRimBottomY = activeDisplayPhoto && visualSilverGuidePx != null
    ? clamp(((visualSilverGuidePx - photoTopPx) / Math.max(1, targetPhotoHeightPx)) * activeDisplayPhoto.h, 0, activeDisplayPhoto.h)
    : null;
  const overlayPrintableTopY = activeDisplayPhoto
    ? clamp(((printableTopGuidePx - photoTopPx) / Math.max(1, targetPhotoHeightPx)) * activeDisplayPhoto.h, 0, activeDisplayPhoto.h)
    : null;
  const overlayPrintableBottomY = activeDisplayPhoto
    ? clamp(((printableBottomGuidePx - photoTopPx) / Math.max(1, targetPhotoHeightPx)) * activeDisplayPhoto.h, 0, activeDisplayPhoto.h)
    : null;
  const overlayPrintableCenterY = activeDisplayPhoto
    ? clamp(((printableCenterGuidePx - photoTopPx) / Math.max(1, targetPhotoHeightPx)) * activeDisplayPhoto.h, 0, activeDisplayPhoto.h)
    : null;
  const overlayBodyGuideLeftX = activeDisplayPhoto
    ? clamp(activeDisplayPhoto.bodyCenterX - (activeDisplayPhoto.referenceBodyWidthPx / 2), 0, activeDisplayPhoto.w)
    : null;
  const overlayBodyGuideRightX = activeDisplayPhoto
    ? clamp(activeDisplayPhoto.bodyCenterX + (activeDisplayPhoto.referenceBodyWidthPx / 2), 0, activeDisplayPhoto.w)
    : null;
  const overlayPrintableCenterHalfWidthPx = activeDisplayPhoto
    ? Math.max(12, Math.min(activeDisplayPhoto.referenceBodyWidthPx * 0.2, 34))
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
  const overlayPrintableBottomHalfWidthPx = activeDisplayPhoto
    ? Math.max(12, (overlayBaseWidthPx ?? activeDisplayPhoto.referenceBodyWidthPx * 0.84) / 2)
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

  const sortedEditablePoints = React.useMemo(
    () => (editableOutline ? sortEditableOutlinePoints(editableOutline.points) : []),
    [editableOutline],
  );
  const editableOutlinePath = React.useMemo(
    () => {
      if (!previewOutline) return null;
      if (outlineTransformMode) {
        return buildDirectContourSvgPath({
          outline: previewOutline,
          centerXPx: bodyCenterLinePx,
          pxPerMm,
        }) || buildMirroredOutlineSvgPath({
          outline: previewOutline,
          centerXPx: bodyCenterLinePx,
          pxPerMm,
        });
      }
      if (preferDirectContourPreview) {
        return buildDirectContourSvgPath({
          outline: previewOutline,
          centerXPx: bodyCenterLinePx,
          pxPerMm,
        }) || buildMirroredOutlineSvgPath({
          outline: previewOutline,
          centerXPx: bodyCenterLinePx,
          pxPerMm,
        });
      }
      return buildMirroredOutlineSvgPath({
        outline: previewOutline,
        centerXPx: bodyCenterLinePx,
        pxPerMm,
      }) || buildDirectContourSvgPath({
        outline: previewOutline,
        centerXPx: bodyCenterLinePx,
        pxPerMm,
      });
    },
    [bodyCenterLinePx, outlineTransformMode, preferDirectContourPreview, previewOutline, pxPerMm],
  );
  const mirroredPreviewOutlinePath = React.useMemo(
    () => {
      if (!previewOutline) return null;
      return buildMirroredOutlineSvgPath({
        outline: previewOutline,
        centerXPx: bodyCenterLinePx,
        pxPerMm,
      }) || buildDirectContourSvgPath({
        outline: previewOutline,
        centerXPx: bodyCenterLinePx,
        pxPerMm,
      });
    },
    [bodyCenterLinePx, previewOutline, pxPerMm],
  );
  const generatedFallbackOutlinePath = React.useMemo(
    () => buildMirroredOutlineSvgPath({
      outline: generatedFallbackOutline,
      centerXPx: bodyCenterLinePx,
      pxPerMm,
    }) || buildDirectContourSvgPath({
      outline: generatedFallbackOutline,
      centerXPx: bodyCenterLinePx,
      pxPerMm,
    }),
    [bodyCenterLinePx, generatedFallbackOutline, pxPerMm],
  );
  const derivedSourceContourPreviewPath = React.useMemo(() => {
    if (!activeDisplayPhoto || !editableOutline?.sourceContour || editableOutline.sourceContour.length < 3) {
      return null;
    }
    const viewport = editableOutline.sourceContourViewport;
    if (!viewport || viewport.width <= 0 || viewport.height <= 0) {
      return null;
    }
    const scaleX = activeDisplayPhoto.w / viewport.width;
    const scaleY = activeDisplayPhoto.h / viewport.height;
    return buildContourSvgPath(
      editableOutline.sourceContour.map((point) => ({
        x: round1((point.x - viewport.minX) * scaleX),
        y: round1((point.y - viewport.minY) * scaleY),
      })),
    );
  }, [
    activeDisplayPhoto,
    editableOutline?.sourceContour,
    editableOutline?.sourceContourViewport,
  ]);
  const calibratedCanonicalPhotoPath = React.useMemo(
    () => invertAffineLinearPath(
      canonicalBodySvgPath ?? null,
      dimensionCalibration?.photoToFrontTransform.matrix,
    ),
    [canonicalBodySvgPath, dimensionCalibration?.photoToFrontTransform.matrix],
  );
  const hasSourceContourPreview = Boolean(
    (activeDisplayPhoto?.tracedBodyOutlinePath || activeDisplayPhoto?.bodyOutlinePath || derivedSourceContourPreviewPath) &&
    editableOutline?.sourceContour &&
    editableOutline.sourceContour.length >= 3,
  );
  const sourceContourPreviewPath = hasSourceContourPreview
    ? (
      activeDisplayPhoto?.tracedBodyOutlinePath ??
      activeDisplayPhoto?.bodyOutlinePath ??
      derivedSourceContourPreviewPath ??
      null
    )
    : null;
  const rawPhotoTracePreviewPath = activeDisplayPhoto?.tracedBodyOutlinePath
    ?? derivedSourceContourPreviewPath
    ?? calibratedCanonicalPhotoPath
    ?? null;
  const preferredPhotoBackedOutlinePath = !profileEditMode
    ? (
      activeDisplayPhoto?.tracedBodyOutlinePath ??
      activeDisplayPhoto?.bodyOutlinePath ??
      calibratedCanonicalPhotoPath ??
      mirroredPreviewOutlinePath ??
      correctedBodyOverlay?.outlinePath ??
      null
    )
    : null;
  const readOnlyPreviewOutlinePath = !profileEditMode
    ? (
      sourceContourPreviewPath ??
      calibratedCanonicalPhotoPath ??
      preferredPhotoBackedOutlinePath ??
      correctedBodyOverlay?.outlinePath ??
      generatedFallbackOutlinePath ??
      null
    )
    : null;
  const smoothedReadOnlyPreviewOutlinePath = React.useMemo(
    () => smoothDisplayOutlinePath(readOnlyPreviewOutlinePath),
    [readOnlyPreviewOutlinePath],
  );
  const usingMeasuredReadOnlyOverlay = !profileEditMode
    && Boolean(
      readOnlyPreviewOutlinePath &&
      correctedBodyOverlay?.outlinePath &&
      readOnlyPreviewOutlinePath === correctedBodyOverlay.outlinePath,
    );
  const showMainEditableOutlinePreview = profileEditMode && Boolean(editableOutlinePath);
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

  const applyGuideDrag = React.useCallback((
    activeDrag: NonNullable<typeof dragging>,
    clientX: number,
    clientY: number,
  ) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const yInContainer = clientY - rect.top;
    const mm = yInContainer / pxPerMm;
    const mappedMm = mapDisplayedBodyPxToOverallMm(yInContainer);

    if (activeDrag === "top") {
      const clamped = clamp(mm, MIN_MARGIN_MM, clampedBodyBottomFromOverallMm - 10);
      onChange(round1(clamped), clampedBodyBottomFromOverallMm);
      return;
    }
    if (activeDrag === "bottom") {
      const clamped = clamp(mm, clampedBodyTopFromOverallMm + 10, overallHeightMm);
      onChange(clampedBodyTopFromOverallMm, round1(clamped));
      return;
    }
    if (activeDrag === "lid-seam" && onLidSeamChange) {
      markGuideAsManual("lid");
      const maxMm = Math.min(
        Math.max(0, clampedBodyBottomFromOverallMm - 2),
        (visualSilverGuideMm ?? clampedBodyBottomFromOverallMm) - 1,
      );
      const clamped = clamp(mappedMm, 0, Math.max(0, maxMm));
      onLidSeamChange(round1(clamped));
      return;
    }
    if (activeDrag === "silver-band" && onSilverBandBottomChange) {
      markGuideAsManual("silver");
      const minMm = Math.max(
        0.5,
        (visualLidGuideMm ?? 0) + 1,
      );
      const clamped = clamp(mappedMm, minMm, clampedBodyBottomFromOverallMm);
      onSilverBandBottomChange(round1(clamped));
      return;
    }
    if (activeDrag === "printable-bottom" && onPrintableBottomOverrideChange) {
      markGuideAsManual("printableBottom");
      const minMm = Math.max(displayPrintableTopMm + 1, clampedBodyTopFromOverallMm + 1);
      onPrintableBottomOverrideChange(round1(clamp(mappedMm, minMm, clampedBodyBottomFromOverallMm)));
      return;
    }
    if (activeDrag === "handle-top" && onHandleTopChange) {
      markHandleAsManual("top");
      const maxMm = Math.max(
        0,
        Math.min(
          (effectiveHandleBottomMm ?? clampedBodyBottomFromOverallMm) - 8,
          (effectiveHandleUpperCornerMm ?? clampedBodyBottomFromOverallMm) - 4,
        ),
      );
      onHandleTopChange(round1(clamp(mappedMm, 0, maxMm)));
      return;
    }
    if (activeDrag === "handle-bottom" && onHandleBottomChange) {
      markHandleAsManual("bottom");
      const minMm = Math.max(
        0,
        (effectiveHandleLowerCornerMm ?? (effectiveHandleTopMm ?? 0)) + 4,
      );
      onHandleBottomChange(round1(clamp(mappedMm, minMm, overallHeightMm)));
      return;
    }
    if (activeDrag === "handle-thickness") {
      if (onHandleTubeDiameterChange && handleThicknessBaselinePoint) {
        const xInContainer = clientX - rect.left;
        const nextOffsetPx = Math.max(
          0,
          resolvedHandleSide === "right"
            ? xInContainer - handleThicknessBaselinePoint.x
            : handleThicknessBaselinePoint.x - xInContainer,
        );
        const nextTubeDiameterMm = mapHandleOffsetPxToMm(nextOffsetPx);
        if (nextTubeDiameterMm != null) {
          markHandleAsManual("tubeDiameter");
          onHandleTubeDiameterChange(nextTubeDiameterMm);
        }
      }
      return;
    }
    if (activeDrag === "handle-reach" && onHandleReachChange) {
      markHandleAsManual("reach");
      const xInContainer = clientX - rect.left;
      const side = resolvedHandleSide ?? "right";
      const nextReachPx = side === "right"
        ? xInContainer - (bodyLeftPx + bodyWidthPx)
        : bodyLeftPx - xInContainer;
      onHandleReachChange(round1(Math.max(0, nextReachPx / pxPerMm)));
      return;
    }
    if (
      (
        activeDrag === "handle-upper-corner"
        || activeDrag === "handle-lower-corner"
        || activeDrag === "handle-upper-transition"
        || activeDrag === "handle-lower-transition"
      )
      && activeDisplayPhoto
      && resolvedHandleSide
      && overlayHandleAttachX != null
    ) {
      const xInContainer = clientX - rect.left;
      const overlayX = clamp(
        ((xInContainer - photoLeftPx) / Math.max(1, photoWidthPx)) * activeDisplayPhoto.w,
        0,
        activeDisplayPhoto.w,
      );
      const nextReachPx = resolvedHandleSide === "right"
        ? overlayX - overlayHandleAttachX
        : overlayHandleAttachX - overlayX;
      const nextReachMm = round1(Math.max(
        0,
        (Math.max(0, nextReachPx) / Math.max(1, activeDisplayPhoto.bodyOutlineBounds?.width ?? activeDisplayPhoto.referenceBodyWidthPx))
        * Math.max(0.1, visualReferenceDiameterMm),
      ));
      const nextSyncedReachMm = round1(
        Math.max(
          activeDrag === "handle-upper-corner" ? nextReachMm : (effectiveHandleUpperCornerReachMm ?? nextReachMm),
          activeDrag === "handle-lower-corner" ? nextReachMm : (effectiveHandleLowerCornerReachMm ?? nextReachMm),
        ) / HANDLE_GUIDE_REACH_FACTOR,
      );
      if (activeDrag === "handle-upper-corner") {
        markHandleAsManual("upperCorner");
        markHandleAsManual("reach");
        if ((handleTopFromOverallMm == null || !Number.isFinite(handleTopFromOverallMm)) && effectiveHandleTopMm != null) {
          onHandleTopChange?.(round1(effectiveHandleTopMm));
        }
        if ((handleBottomFromOverallMm == null || !Number.isFinite(handleBottomFromOverallMm)) && effectiveHandleBottomMm != null) {
          onHandleBottomChange?.(round1(effectiveHandleBottomMm));
        }
        const minMm = Math.max((effectiveHandleTopMm ?? 0) + 4, 0);
        const maxMm = Math.max(minMm, (effectiveHandleLowerCornerMm ?? (effectiveHandleBottomMm ?? overallHeightMm)) - 8);
        onHandleUpperCornerChange?.(round1(clamp(mappedMm, minMm, maxMm)));
        onHandleUpperCornerReachChange?.(nextReachMm);
        onHandleReachChange?.(nextSyncedReachMm);
        return;
      }
      if (activeDrag === "handle-upper-transition") {
        markHandleAsManual("upperTransition");
        if ((handleTopFromOverallMm == null || !Number.isFinite(handleTopFromOverallMm)) && effectiveHandleTopMm != null) {
          onHandleTopChange?.(round1(effectiveHandleTopMm));
        }
        if ((handleBottomFromOverallMm == null || !Number.isFinite(handleBottomFromOverallMm)) && effectiveHandleBottomMm != null) {
          onHandleBottomChange?.(round1(effectiveHandleBottomMm));
        }
        if ((handleUpperCornerFromOverallMm == null || !Number.isFinite(handleUpperCornerFromOverallMm)) && effectiveHandleUpperCornerMm != null) {
          onHandleUpperCornerChange?.(round1(effectiveHandleUpperCornerMm));
        }
        if ((handleLowerCornerFromOverallMm == null || !Number.isFinite(handleLowerCornerFromOverallMm)) && effectiveHandleLowerCornerMm != null) {
          onHandleLowerCornerChange?.(round1(effectiveHandleLowerCornerMm));
        }
        if ((handleUpperCornerReachMm == null || !Number.isFinite(handleUpperCornerReachMm)) && effectiveHandleUpperCornerReachMm != null) {
          onHandleUpperCornerReachChange?.(round1(effectiveHandleUpperCornerReachMm));
        }
        if ((handleLowerCornerReachMm == null || !Number.isFinite(handleLowerCornerReachMm)) && effectiveHandleLowerCornerReachMm != null) {
          onHandleLowerCornerReachChange?.(round1(effectiveHandleLowerCornerReachMm));
        }
        const minMm = effectiveHandleTopMm ?? 0;
        const maxY = Math.max(minMm, (effectiveHandleUpperCornerMm ?? minMm) - 2);
        onHandleUpperTransitionChange?.(round1(clamp(mappedMm, minMm, maxY)));
        const maxMm = Math.max(2, (effectiveHandleUpperCornerReachMm ?? nextReachMm) - 2);
        onHandleUpperTransitionReachChange?.(round1(clamp(nextReachMm, 2, maxMm)));
        return;
      }
      if (activeDrag === "handle-lower-transition") {
        markHandleAsManual("lowerTransition");
        if ((handleTopFromOverallMm == null || !Number.isFinite(handleTopFromOverallMm)) && effectiveHandleTopMm != null) {
          onHandleTopChange?.(round1(effectiveHandleTopMm));
        }
        if ((handleBottomFromOverallMm == null || !Number.isFinite(handleBottomFromOverallMm)) && effectiveHandleBottomMm != null) {
          onHandleBottomChange?.(round1(effectiveHandleBottomMm));
        }
        if ((handleUpperCornerFromOverallMm == null || !Number.isFinite(handleUpperCornerFromOverallMm)) && effectiveHandleUpperCornerMm != null) {
          onHandleUpperCornerChange?.(round1(effectiveHandleUpperCornerMm));
        }
        if ((handleLowerCornerFromOverallMm == null || !Number.isFinite(handleLowerCornerFromOverallMm)) && effectiveHandleLowerCornerMm != null) {
          onHandleLowerCornerChange?.(round1(effectiveHandleLowerCornerMm));
        }
        if ((handleUpperCornerReachMm == null || !Number.isFinite(handleUpperCornerReachMm)) && effectiveHandleUpperCornerReachMm != null) {
          onHandleUpperCornerReachChange?.(round1(effectiveHandleUpperCornerReachMm));
        }
        if ((handleLowerCornerReachMm == null || !Number.isFinite(handleLowerCornerReachMm)) && effectiveHandleLowerCornerReachMm != null) {
          onHandleLowerCornerReachChange?.(round1(effectiveHandleLowerCornerReachMm));
        }
        const minY = Math.max(0, (effectiveHandleLowerCornerMm ?? (effectiveHandleBottomMm ?? overallHeightMm)) + 2);
        const maxMmY = effectiveHandleBottomMm ?? overallHeightMm;
        onHandleLowerTransitionChange?.(round1(clamp(mappedMm, minY, maxMmY)));
        const maxMm = Math.max(2, (effectiveHandleLowerCornerReachMm ?? nextReachMm) - 2);
        onHandleLowerTransitionReachChange?.(round1(clamp(nextReachMm, 2, maxMm)));
        return;
      }
      markHandleAsManual("lowerCorner");
      markHandleAsManual("reach");
      if ((handleTopFromOverallMm == null || !Number.isFinite(handleTopFromOverallMm)) && effectiveHandleTopMm != null) {
        onHandleTopChange?.(round1(effectiveHandleTopMm));
      }
      if ((handleBottomFromOverallMm == null || !Number.isFinite(handleBottomFromOverallMm)) && effectiveHandleBottomMm != null) {
        onHandleBottomChange?.(round1(effectiveHandleBottomMm));
      }
      const minMm = Math.max((effectiveHandleUpperCornerMm ?? (effectiveHandleTopMm ?? 0)) + 8, 0);
      const maxMm = Math.max(minMm, (effectiveHandleBottomMm ?? overallHeightMm) - 4);
      onHandleLowerCornerChange?.(round1(clamp(mappedMm, minMm, maxMm)));
      onHandleLowerCornerReachChange?.(nextReachMm);
      onHandleReachChange?.(nextSyncedReachMm);
      return;
    }
    if (activeDrag === "body-width" && onDiameterChange) {
      const xInContainer = clientX - rect.left;
      const halfWidthPx = Math.max(8, Math.abs(xInContainer - bodyCenterLinePx));
      onDiameterChange(Math.max(20, round1((halfWidthPx * 2) / pxPerMm)));
      return;
    }
    if (activeDrag === "top-outer-width" && onTopOuterDiameterChange) {
      const xInContainer = clientX - rect.left;
      const halfWidthPx = Math.max(bodyWidthPx / 2, Math.abs(xInContainer - bodyCenterLinePx));
      onTopOuterDiameterChange(Math.max(effectiveBodyWrapDiameterMm, round1((halfWidthPx * 2) / pxPerMm)));
      return;
    }
    if (activeDrag === "base-width" && onBaseDiameterChange) {
      const xInContainer = clientX - rect.left;
      const halfWidthPx = Math.max(6, Math.abs(xInContainer - bodyCenterLinePx));
      onBaseDiameterChange(clamp(round1((halfWidthPx * 2) / pxPerMm), 20, Math.max(20, diameterMm)));
      return;
    }
    if (activeDrag === "shoulder-width" && onShoulderDiameterChange) {
      const xInContainer = clientX - rect.left;
      const halfWidthPx = Math.max(6, Math.abs(xInContainer - bodyCenterLinePx));
      onShoulderDiameterChange(clamp(
        round1((halfWidthPx * 2) / pxPerMm),
        Math.max(effectiveBaseDiameterMm ?? 20, 20),
        Math.max(effectiveBodyWrapDiameterMm, effectiveTopOuterDiameterMm ?? effectiveBodyWrapDiameterMm),
      ));
      return;
    }
    if (activeDrag === "taper-upper-width" && onTaperUpperDiameterChange) {
      const xInContainer = clientX - rect.left;
      const halfWidthPx = Math.max(6, Math.abs(xInContainer - bodyCenterLinePx));
      onTaperUpperDiameterChange(clamp(
        round1((halfWidthPx * 2) / pxPerMm),
        Math.max(effectiveBaseDiameterMm ?? 20, 20),
        effectiveShoulderDiameterMm,
      ));
      return;
    }
    if (activeDrag === "taper-lower-width" && onTaperLowerDiameterChange) {
      const xInContainer = clientX - rect.left;
      const halfWidthPx = Math.max(6, Math.abs(xInContainer - bodyCenterLinePx));
      onTaperLowerDiameterChange(clamp(
        round1((halfWidthPx * 2) / pxPerMm),
        Math.max(effectiveBaseDiameterMm ?? 20, 20),
        effectiveTaperUpperDiameterMm,
      ));
      return;
    }
    if (activeDrag === "bevel-width" && onBevelDiameterChange) {
      const xInContainer = clientX - rect.left;
      const halfWidthPx = Math.max(6, Math.abs(xInContainer - bodyCenterLinePx));
      onBevelDiameterChange(clamp(
        round1((halfWidthPx * 2) / pxPerMm),
        Math.max(effectiveBaseDiameterMm ?? 20, 20),
        effectiveTaperLowerDiameterMm,
      ));
    }
  }, [
    activeDisplayPhoto?.handleSide,
    bodyCenterLinePx,
    bodyLeftPx,
    bodyWidthPx,
    clampedBodyBottomFromOverallMm,
    clampedBodyTopFromOverallMm,
    diameterMm,
    displayPrintableTopMm,
    effectiveBaseDiameterMm,
    effectiveBodyWrapDiameterMm,
    effectiveHandleBottomMm,
    effectiveHandleLowerCornerMm,
    effectiveHandleLowerCornerReachMm,
    effectiveHandleOuterBottomMm,
    effectiveHandleOuterTopMm,
    effectiveHandleTopMm,
    effectiveHandleUpperCornerMm,
    effectiveHandleUpperCornerReachMm,
    handleLowerTransitionButtonPoint,
    handleThicknessBaselinePoint,
    handleUpperTransitionButtonPoint,
    effectiveShoulderDiameterMm,
    effectiveTaperLowerDiameterMm,
    effectiveTaperUpperDiameterMm,
    effectiveTopOuterDiameterMm,
    mapHandleOffsetPxToMm,
    mapDisplayedBodyPxToOverallMm,
    markHandleAsManual,
    markGuideAsManual,
    onBaseDiameterChange,
    onBevelDiameterChange,
    onChange,
    onDiameterChange,
    onHandleBottomChange,
    onHandleTubeDiameterChange,
    handleBottomFromOverallMm,
    onHandleLowerCornerChange,
    onHandleLowerCornerReachChange,
    onHandleReachChange,
    handleTopFromOverallMm,
    onHandleTopChange,
    onHandleUpperCornerChange,
    onHandleUpperCornerReachChange,
    onLidSeamChange,
    onPrintableBottomOverrideChange,
    onShoulderDiameterChange,
    onSilverBandBottomChange,
    onTaperLowerDiameterChange,
    onTaperUpperDiameterChange,
    onTopOuterDiameterChange,
    overallHeightMm,
    overlayHandleAttachX,
    photoLeftPx,
    photoWidthPx,
    pxPerMm,
    targetPhotoHeightPx,
    visualLidGuideMm,
    visualSilverGuideMm,
    visualReferenceDiameterMm,
  ]);

  const applyDragAtClientPoint = React.useCallback((clientX: number, clientY: number) => {
    if (!dragging) return;
    applyGuideDrag(dragging, clientX, clientY);
  }, [applyGuideDrag, dragging]);

  const startGuideDrag = React.useCallback((
    line:
      | "top"
      | "bottom"
      | "lid-seam"
      | "silver-band"
      | "printable-bottom"
      | "handle-top"
      | "handle-bottom"
      | "handle-reach"
      | "handle-thickness"
      | "handle-upper-corner"
      | "handle-lower-corner"
      | "handle-upper-transition"
      | "handle-lower-transition"
      | "top-outer-width"
      | "body-width"
      | "base-width"
      | "shoulder-width"
      | "taper-upper-width"
      | "taper-lower-width"
      | "bevel-width"
  , clientX: number, clientY: number) => {
    setDragging(line);
    applyGuideDrag(line, clientX, clientY);
  }, [applyGuideDrag]);

  const handlePointerDown = (
    line:
      | "top"
      | "bottom"
      | "lid-seam"
      | "silver-band"
      | "printable-bottom"
      | "handle-top"
      | "handle-bottom"
      | "handle-reach"
      | "handle-thickness"
      | "handle-upper-corner"
      | "handle-lower-corner"
      | "handle-upper-transition"
      | "handle-lower-transition"
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
    startGuideDrag(line, e.clientX, e.clientY);
  };

  const handleMouseDown = (
    line:
      | "top"
      | "bottom"
      | "lid-seam"
      | "silver-band"
      | "printable-bottom"
      | "handle-top"
      | "handle-bottom"
      | "handle-reach"
      | "handle-thickness"
      | "handle-upper-corner"
      | "handle-lower-corner"
      | "handle-upper-transition"
      | "handle-lower-transition"
      | "top-outer-width"
      | "body-width"
      | "base-width"
      | "shoulder-width"
      | "taper-upper-width"
      | "taper-lower-width"
      | "bevel-width"
  ) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startGuideDrag(line, e.clientX, e.clientY);
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
    if (activeDisplayPhoto?.tracedBodyOutlinePath) {
      try {
        const svgText = [
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round1(activeDisplayPhoto.w)} ${round1(activeDisplayPhoto.h)}" width="${round1(activeDisplayPhoto.w)}" height="${round1(activeDisplayPhoto.h)}">`,
          `<path d="${activeDisplayPhoto.tracedBodyOutlinePath}" fill="none" stroke="#000" stroke-width="1" />`,
          "</svg>",
        ].join("");
        const { outline } = createEditableBodyOutlineFromSeedSvgText({
          svgText,
          overallHeightMm,
          bodyTopFromOverallMm: clampedBodyTopFromOverallMm,
          bodyBottomFromOverallMm: clampedBodyBottomFromOverallMm,
          diameterMm: effectiveTopOuterDiameterMm && effectiveTopOuterDiameterMm > 0 ? effectiveTopOuterDiameterMm : diameterMm,
          topOuterDiameterMm: effectiveTopOuterDiameterMm,
          side: "right",
          sourceMode: "body-only",
        });
        commitOutlineChange(outline);
        onOutlineSeedModeChange?.("fresh-image-trace");
        setOutlineImportError(null);
        setSelectedPointId(null);
        setSelectedHandleType(null);
        setSelectedSegmentIndex(null);
        return;
      } catch (error) {
        setOutlineImportError(error instanceof Error ? error.message : "Unable to reset outline from the current photo trace.");
      }
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
    onOutlineSeedModeChange?.("fit-debug-fallback");
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

  const handleRebuildOutlineFromPhotoTrace = React.useCallback(() => {
    if (!activeDisplayPhoto) {
      setOutlineImportError("No reference photo is available to rebuild the outline.");
      return;
    }

    const pathData = activeDisplayPhoto.tracedBodyOutlinePath;
    if (!pathData) {
      setOutlineImportError("No traced body contour is available from the current photo.");
      return;
    }

    try {
      const svgText = [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round1(activeDisplayPhoto.w)} ${round1(activeDisplayPhoto.h)}" width="${round1(activeDisplayPhoto.w)}" height="${round1(activeDisplayPhoto.h)}">`,
        `<path d="${pathData}" fill="none" stroke="#000" stroke-width="1" />`,
        "</svg>",
      ].join("");
      const { source, outline } = createEditableBodyOutlineFromSeedSvgText({
        svgText,
        overallHeightMm,
        bodyTopFromOverallMm: clampedBodyTopFromOverallMm,
        bodyBottomFromOverallMm: clampedBodyBottomFromOverallMm,
        diameterMm: effectiveTopOuterDiameterMm && effectiveTopOuterDiameterMm > 0 ? effectiveTopOuterDiameterMm : diameterMm,
        topOuterDiameterMm: effectiveTopOuterDiameterMm,
        side: "right",
        sourceMode: "body-only",
      });
      applySeedOutlineToActiveLayer({
        outline,
        source,
        enterFitMode: true,
      });
      onOutlineSeedModeChange?.("fresh-image-trace");
      setOutlineImportError(null);
    } catch (error) {
      setOutlineImportError(error instanceof Error ? error.message : "Unable to rebuild outline from the current photo trace.");
    }
  }, [
    activeDisplayPhoto,
    applySeedOutlineToActiveLayer,
    clampedBodyBottomFromOverallMm,
    clampedBodyTopFromOverallMm,
    diameterMm,
    effectiveTopOuterDiameterMm,
    onOutlineSeedModeChange,
    overallHeightMm,
  ]);

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
    const handleWindowPointerMove = (event: PointerEvent) => {
      applyGuideDrag(dragging, event.clientX, event.clientY);
    };
    const handleWindowMouseMove = (event: MouseEvent) => {
      applyGuideDrag(dragging, event.clientX, event.clientY);
    };
    const handleWindowPointerUp = () => {
      setDragging(null);
    };
    const handleWindowMouseUp = () => {
      setDragging(null);
    };
    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerUp);
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerUp);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [
    dragging,
    applyGuideDrag,
  ]);

  const baseWidthTopY = Math.round(bodyBottomPx - Math.max(18, Math.min(40, bodyZoneHeightPx * 0.08)));
  const baseDiameterLineY = clamp(Math.round(baseWidthTopY + 18), 22, canvasHeightPx - 14);
  const hasLidGuide =
    visualLidGuidePx != null &&
    visualLidGuidePx >= 0 &&
    visualLidGuidePx <= canvasHeightPx;
  const hasSilverGuide =
    visualSilverGuidePx != null &&
    visualSilverGuidePx >= 0 &&
    visualSilverGuidePx <= canvasHeightPx;
  const hasPrintableBottomGuide =
    printableBottomGuidePx >= 0 &&
    printableBottomGuidePx <= canvasHeightPx;
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
    markGuideAsManual("lid");
    const maxMm = Math.min(
      Math.max(0, clampedBodyBottomFromOverallMm - 2),
      (visualSilverGuideMm ?? clampedBodyBottomFromOverallMm) - 1,
    );
    onLidSeamChange(round1(clamp(nextValue, 0, Math.max(0, maxMm))));
  };

  const handleSilverBandInputChange = (nextValue: number) => {
    if (!onSilverBandBottomChange || !Number.isFinite(nextValue)) return;
    markGuideAsManual("silver");
    const minMm = Math.max(
      0.5,
      (visualLidGuideMm ?? 0) + 1,
    );
    onSilverBandBottomChange(round1(clamp(nextValue, minMm, clampedBodyBottomFromOverallMm)));
  };
  const handleApplyAutoDetectedBands = () => {
    if (!applyableBandValues) return;
    setManualGuideSelection({
      lid: false,
      silver: false,
      printableBottom: false,
    });
    if (applyableBandValues.lidSeamFromOverallMm != null) {
      onLidSeamChange?.(applyableBandValues.lidSeamFromOverallMm);
    }
    onSilverBandBottomChange?.(applyableBandValues.silverBandBottomFromOverallMm);
  };

  const toggleProfileEditMode = () => {
    if (profileEditMode) {
      setSelectedPointId(null);
      setSelectedHandleType(null);
      setSelectedSegmentIndex(null);
      setOutlineDragState(null);
    } else {
      setShapeWorkflowMode("fit");
      setNodeEditMode("edit");
    }
    setProfileEditMode((current) => !current);
  };

  useEffect(() => {
    if (!activeDisplayPhoto) return;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(containerWidthPx));
    canvas.height = canvasHeightPx;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, photoLeftPx, photoTopPx, photoWidthPx, targetPhotoHeightPx);
      const sampledCanvasImageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

      const bodySampleX = bodyLeftPx + bodyWidthPx * 0.28;
      const bodySampleW = bodyWidthPx * 0.34;
      const bodySampleY = bodyZoneTopPx + bodyZoneHeightPx * 0.2;
      const bodySampleH = Math.max(10, bodyZoneHeightPx * 0.35);

      const rimSampleH = Math.max(6, Math.min(Math.max(bodyTopPx, 10), canvasHeightPx * 0.08));
      const rimSampleY = Math.max(0, bodyZoneTopPx - rimSampleH);
      const rimSampleX = bodyLeftPx + bodyWidthPx * 0.24;
      const rimSampleW = bodyWidthPx * 0.4;

      const lidSampleY = Math.max(0, bodyTopPx);
      const lidSampleH = Math.max(6, rimSampleY - lidSampleY);
      const lidSampleX = bodyLeftPx + bodyWidthPx * 0.22;
      const lidSampleW = bodyWidthPx * 0.42;

      const sampledBody = sampleRegionColor(sampledCanvasImageData, canvas.width, canvas.height, bodySampleX, bodySampleY, bodySampleW, bodySampleH, "average");
      const sampledLid = lidSampleH > 0
        ? sampleRegionColor(sampledCanvasImageData, canvas.width, canvas.height, lidSampleX, lidSampleY, lidSampleW, lidSampleH, "average")
        : null;
      const sampledRim = sampleRegionColor(sampledCanvasImageData, canvas.width, canvas.height, rimSampleX, rimSampleY, rimSampleW, rimSampleH, "bright");

      if (!sampledBody && !sampledLid && !sampledRim) return;

      const nextSample = {
        bodyColorHex: sampledBody ?? null,
        lidColorHex: sampledLid ?? null,
        rimColorHex: sampledRim ?? null,
      };
      const nextSampleSignature = JSON.stringify(nextSample);
      if (nextSampleSignature !== lastColorSampleSignatureRef.current) {
        lastColorSampleSignatureRef.current = nextSampleSignature;
        onColorsChange(nextSample);
      }
    };
    img.src = activeDisplayPhoto.src;
  }, [
    activeDisplayPhoto,
    colorResampleRequestKey,
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
      <div className={styles.editorToolbar}>
        <button
          type="button"
          className={`${styles.pillButton} ${profileEditMode ? styles.pillButtonActive : ""}`}
          onClick={toggleProfileEditMode}
        >
          {profileEditMode ? "Done outline" : "Edit outline"}
        </button>
      </div>
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
          {!profileEditMode && !showMainEditableOutlinePreview && (
            <>
              <div
                className={styles.bodyFrame}
                style={{ left: bodyLeftPx, width: bodyWidthPx, height: canvasHeightPx }}
              />
              {!activeDisplayPhoto && (
                <div
                  className={styles.bodyCenterLine}
                  style={{ left: bodyCenterLinePx, height: canvasHeightPx }}
                />
              )}
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
          {showMainEditableOutlinePreview && editableOutlinePath && (
            <svg
              className={styles.pathEditorOverlay}
              viewBox={`0 0 ${containerWidthPx} ${canvasHeightPx}`}
              width={containerWidthPx}
              height={canvasHeightPx}
              aria-hidden="true"
            >
              <path
                d={editableOutlinePath}
                className={styles.traceBodyOutline}
              />
            </svg>
          )}
          {activeDisplayPhoto && (profileEditMode || sourceContourPreviewPath || readOnlyPreviewOutlinePath) && (
            <svg
              className={styles.traceOverlay}
              viewBox={`0 0 ${activeDisplayPhoto.w} ${activeDisplayPhoto.h}`}
              style={{ width: photoWidthPx, height: targetPhotoHeightPx, left: photoLeftPx, top: photoTopPx }}
              aria-hidden="true"
            >
              {!profileEditMode && !showMainEditableOutlinePreview && readOnlyPreviewOutlinePath && (
                <defs>
                  <clipPath id={printableBandClipId}>
                    <path d={readOnlyPreviewOutlinePath} />
                  </clipPath>
                </defs>
              )}
              {showReadOnlyGuides && usingMeasuredReadOnlyOverlay && correctedBodyOverlay?.leftBevelMaskPath && (
                <path d={correctedBodyOverlay.leftBevelMaskPath} className={styles.traceBaseMask} />
              )}
              {showReadOnlyGuides && usingMeasuredReadOnlyOverlay && correctedBodyOverlay?.rightBevelMaskPath && (
                <path d={correctedBodyOverlay.rightBevelMaskPath} className={styles.traceBaseMask} />
              )}
              {showReadOnlyGuides && usingMeasuredReadOnlyOverlay && correctedBodyOverlay?.bottomMaskPath && (
                <path d={correctedBodyOverlay.bottomMaskPath} className={styles.traceBaseMask} />
              )}
              {(profileEditMode || showMainEditableOutlinePreview) && rawPhotoTracePreviewPath && (
                <path
                  d={rawPhotoTracePreviewPath}
                  className={styles.traceBodyOutlineRaw}
                />
              )}
              {!profileEditMode && !showMainEditableOutlinePreview && readOnlyPreviewOutlinePath && (
                <>
                  {overlayPrintableTopY != null && overlayPrintableBottomY != null && overlayPrintableBottomY > overlayPrintableTopY + 1 && (
                    <g clipPath={`url(#${printableBandClipId})`}>
                      <rect
                        x={0}
                        y={overlayPrintableTopY}
                        width={activeDisplayPhoto.w}
                        height={Math.max(1, overlayPrintableBottomY - overlayPrintableTopY)}
                        className={styles.tracePrintableBandFill}
                      />
                    </g>
                  )}
                  {overlayPrintableCenterY != null && overlayPrintableCenterHalfWidthPx != null && (
                    <>
                      <line
                        x1={activeDisplayPhoto.bodyCenterX - overlayPrintableCenterHalfWidthPx}
                        y1={overlayPrintableCenterY}
                        x2={activeDisplayPhoto.bodyCenterX + overlayPrintableCenterHalfWidthPx}
                        y2={overlayPrintableCenterY}
                        className={styles.traceGuideUnderlay}
                      />
                      <line
                        x1={activeDisplayPhoto.bodyCenterX - overlayPrintableCenterHalfWidthPx}
                        y1={overlayPrintableCenterY}
                        x2={activeDisplayPhoto.bodyCenterX + overlayPrintableCenterHalfWidthPx}
                        y2={overlayPrintableCenterY}
                        className={styles.tracePrintableCenterMark}
                      />
                    </>
                  )}
                </>
              )}
              {!profileEditMode && !showMainEditableOutlinePreview && readOnlyPreviewOutlinePath && (
                <path
                  d={smoothedReadOnlyPreviewOutlinePath ?? readOnlyPreviewOutlinePath ?? undefined}
                  className={styles.traceBodyOutline}
                />
              )}
              {!profileEditMode && !showMainEditableOutlinePreview && (
                <line
                  x1={activeDisplayPhoto.bodyCenterX}
                  y1={activeDisplayPhoto.bodyTopY}
                  x2={activeDisplayPhoto.bodyCenterX}
                  y2={activeDisplayPhoto.bodyBottomY}
                  className={styles.traceCenterLine}
                />
              )}
              {!profileEditMode && !showMainEditableOutlinePreview && showHandleTrace && visibleHandleGuideInnerPath && (
                <>
                  {visibleHandleGuideOuterPath ? (
                    <path
                      d={visibleHandleGuideOuterPath}
                      className={styles.traceHandleOuterReference}
                    />
                  ) : null}
                  <path
                    d={visibleHandleGuideInnerPath}
                    transform={visibleHandleGuideInnerTransform}
                    className={styles.traceHandleInnerReference}
                  />
                  {usingAnchoredHandleGuidePath && anchoredHandleGuideAttachPoints && (
                    <>
                      <circle
                        cx={anchoredHandleGuideAttachPoints.top.x}
                        cy={anchoredHandleGuideAttachPoints.top.y}
                        r={2.4}
                        className={`${styles.traceNode} ${styles.traceNodeHandle}`}
                      />
                      <circle
                        cx={anchoredHandleGuideAttachPoints.bottom.x}
                        cy={anchoredHandleGuideAttachPoints.bottom.y}
                        r={2.4}
                        className={`${styles.traceNode} ${styles.traceNodeHandle}`}
                      />
                    </>
                  )}
                  {usingAnchoredHandleGuidePath && anchoredHandleGuideCornerPoints && (
                    <>
                      <circle
                        cx={anchoredHandleGuideCornerPoints.upper.x}
                        cy={anchoredHandleGuideCornerPoints.upper.y}
                        r={2.4}
                        className={`${styles.traceNode} ${styles.traceNodeHandle}`}
                      />
                      <circle
                        cx={anchoredHandleGuideCornerPoints.lower.x}
                        cy={anchoredHandleGuideCornerPoints.lower.y}
                        r={2.4}
                        className={`${styles.traceNode} ${styles.traceNodeHandle}`}
                      />
                    </>
                  )}
                  {usingAnchoredHandleGuidePath && anchoredHandleGuideTransitionPoints && (
                    <>
                      <circle
                        cx={anchoredHandleGuideTransitionPoints.upper.x}
                        cy={anchoredHandleGuideTransitionPoints.upper.y}
                        r={2.1}
                        className={`${styles.traceNode} ${styles.traceNodeSilver}`}
                      />
                      <circle
                        cx={anchoredHandleGuideTransitionPoints.lower.x}
                        cy={anchoredHandleGuideTransitionPoints.lower.y}
                        r={2.1}
                        className={`${styles.traceNode} ${styles.traceNodeSilver}`}
                      />
                    </>
                  )}
                </>
              )}
              {!profileEditMode && !showMainEditableOutlinePreview && showHandleTrace && !anchoredHandleGuidePath && !activeDisplayPhoto.handleInnerPath && transformedHandleInnerRect && (
                <rect
                  x={transformedHandleInnerRect.x}
                  y={transformedHandleInnerRect.y}
                  width={transformedHandleInnerRect.width}
                  height={transformedHandleInnerRect.height}
                  rx={Math.max(2, transformedHandleInnerRect.width * 0.08)}
                  ry={Math.max(2, transformedHandleInnerRect.width * 0.08)}
                  className={styles.traceHandleInnerReference}
                />
              )}
              {!profileEditMode && !showMainEditableOutlinePreview && overlayRimTopY != null && overlayBodyGuideLeftX != null && overlayBodyGuideRightX != null && (
                <>
                  {overlayRimBottomY != null && overlayRimBottomY > overlayRimTopY + 1 && (
                    <rect
                      x={overlayBodyGuideLeftX}
                      y={overlayRimTopY}
                      width={Math.max(1, overlayBodyGuideRightX - overlayBodyGuideLeftX)}
                      height={Math.max(1, overlayRimBottomY - overlayRimTopY)}
                      className={styles.traceRingBandFill}
                    />
                  )}
                  <line
                    x1={overlayBodyGuideLeftX}
                    y1={overlayRimTopY}
                    x2={overlayBodyGuideRightX}
                    y2={overlayRimTopY}
                    className={styles.traceGuideUnderlay}
                  />
                  <line
                    x1={overlayBodyGuideLeftX}
                    y1={overlayRimTopY}
                    x2={overlayBodyGuideRightX}
                    y2={overlayRimTopY}
                    className={styles.traceLidGuide}
                  />
                  <circle
                    cx={overlayBodyGuideLeftX}
                    cy={overlayRimTopY}
                    r={2.1}
                    className={`${styles.traceNode} ${styles.traceNodeLidGuide}`}
                  />
                  <circle
                    cx={overlayBodyGuideRightX}
                    cy={overlayRimTopY}
                    r={2.1}
                    className={`${styles.traceNode} ${styles.traceNodeLidGuide}`}
                  />
                </>
              )}
              {!profileEditMode && !showMainEditableOutlinePreview && overlayRimBottomY != null && overlayBodyGuideLeftX != null && overlayBodyGuideRightX != null && (
                <>
                  <line
                    x1={overlayBodyGuideLeftX}
                    y1={overlayRimBottomY}
                    x2={overlayBodyGuideRightX}
                    y2={overlayRimBottomY}
                    className={styles.traceGuideUnderlay}
                  />
                  <line
                    x1={overlayBodyGuideLeftX}
                    y1={overlayRimBottomY}
                    x2={overlayBodyGuideRightX}
                    y2={overlayRimBottomY}
                    className={styles.tracePowderGuide}
                  />
                  <circle
                    cx={overlayBodyGuideLeftX}
                    cy={overlayRimBottomY}
                    r={2.1}
                    className={`${styles.traceNode} ${styles.traceNodePowderGuide}`}
                  />
                  <circle
                    cx={overlayBodyGuideRightX}
                    cy={overlayRimBottomY}
                    r={2.1}
                    className={`${styles.traceNode} ${styles.traceNodePowderGuide}`}
                  />
                </>
              )}
              {!profileEditMode && !showMainEditableOutlinePreview && overlayPrintableBottomY != null && overlayPrintableBottomHalfWidthPx != null && (
                <>
                  <line
                    x1={activeDisplayPhoto.bodyCenterX - overlayPrintableBottomHalfWidthPx}
                    y1={overlayPrintableBottomY}
                    x2={activeDisplayPhoto.bodyCenterX + overlayPrintableBottomHalfWidthPx}
                    y2={overlayPrintableBottomY}
                    className={styles.traceGuideUnderlay}
                  />
                  <line
                    x1={activeDisplayPhoto.bodyCenterX - overlayPrintableBottomHalfWidthPx}
                    y1={overlayPrintableBottomY}
                    x2={activeDisplayPhoto.bodyCenterX + overlayPrintableBottomHalfWidthPx}
                    y2={overlayPrintableBottomY}
                    className={styles.tracePowderGuide}
                  />
                </>
              )}
              {showReadOnlyGuides && !profileEditMode && !showMainEditableOutlinePreview && showHandleTrace && !anchoredHandleGuidePath && activeDisplayPhoto.handleOuterPath && (
                <path
                  d={activeDisplayPhoto.handleOuterPath}
                  className={styles.traceHandleOutline}
                />
              )}
              {showReadOnlyGuides && !profileEditMode && !showMainEditableOutlinePreview && showHandleTrace && !anchoredHandleGuidePath && !activeDisplayPhoto.handleOuterPath && activeDisplayPhoto.handleOuterRect && (
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
              {showReadOnlyGuides && !profileEditMode && !showMainEditableOutlinePreview && showHandleTrace && !anchoredHandleGuidePath && activeDisplayPhoto.handleInnerPath && (
                <path
                  d={activeDisplayPhoto.handleInnerPath}
                  className={styles.traceHandleHole}
                />
              )}
              {showReadOnlyGuides && !profileEditMode && !showMainEditableOutlinePreview && showHandleTrace && !anchoredHandleGuidePath && !activeDisplayPhoto.handleInnerPath && activeDisplayPhoto.handleInnerRect && (
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
              {showReadOnlyGuides && !profileEditMode && !showMainEditableOutlinePreview && overlayRimTopY != null && (
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
              {showReadOnlyGuides && !profileEditMode && !showMainEditableOutlinePreview && overlayRimTopY != null && overlayRimBottomY != null && overlayRimBottomY > overlayRimTopY && (
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
              {showReadOnlyGuides && !profileEditMode && !showMainEditableOutlinePreview && showHandleTrace && !anchoredHandleGuidePath && activeDisplayPhoto.handleOuterRect && (
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
                <button
                  type="button"
                  className={styles.editorToolBtn}
                  onClick={handleRebuildOutlineFromPhotoTrace}
                  disabled={!activeDisplayPhoto?.tracedBodyOutlinePath}
                >
                  Rebuild from Photo Trace
                </button>
                <div className={styles.pathEditorHint}>
                  Rebuild from Photo Trace replaces the BODY REFERENCE shell with a fresh trace-derived outline from the selected image. Reset outline only falls back to fit-debug when no trace is available.
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
          {showReadOnlyGuides && activeDisplayPhoto && !profileEditMode && !showMainEditableOutlinePreview && (
            <div
              className={styles.guideLine}
              style={{ top: referenceBandGuideTopPx, left: photoLeftPx, width: photoWidthPx }}
            >
              {showGuideLabels && <span className={styles.guideLineLabel}>Scale anchor</span>}
            </div>
          )}
          {!activeDisplayPhoto && hasLidGuide && visualLidGuidePx != null && !profileEditMode && !showMainEditableOutlinePreview && (
            <div
              className={`${styles.placementGuide} ${styles.lidPlacementGuide}`}
              style={{ top: visualLidGuidePx, left: bodyLeftPx, width: bodyWidthPx }}
            >
              {showGuideLabels && <span className={styles.placementGuideLabel}>Silver ring top</span>}
            </div>
          )}
          {hasLidGuide && visualLidGuidePx != null && !profileEditMode && !showMainEditableOutlinePreview && (
            <>
              <button
                type="button"
                aria-label="Adjust silver ring top"
                className={`${styles.guideNode} ${styles.guideNodeLid} ${dragging === "lid-seam" ? styles.guideNodeActive : ""}`}
                style={{ left: bodyLeftPx, top: visualLidGuidePx }}
                onPointerDown={handlePointerDown("lid-seam")}
                onMouseDown={handleMouseDown("lid-seam")}
              />
              <button
                type="button"
                aria-label="Adjust silver ring top"
                className={`${styles.guideNode} ${styles.guideNodeLid} ${dragging === "lid-seam" ? styles.guideNodeActive : ""}`}
                style={{ left: bodyLeftPx + bodyWidthPx, top: visualLidGuidePx }}
                onPointerDown={handlePointerDown("lid-seam")}
                onMouseDown={handleMouseDown("lid-seam")}
              />
            </>
          )}
          {!activeDisplayPhoto && hasSilverGuide && visualSilverGuidePx != null && !profileEditMode && !showMainEditableOutlinePreview && (
            <div
              className={`${styles.placementGuide} ${styles.coatingPlacementGuide}`}
              style={{ top: visualSilverGuidePx, left: bodyLeftPx, width: bodyWidthPx }}
            >
              {showGuideLabels && <span className={styles.placementGuideLabel}>Powder coat begins</span>}
            </div>
          )}
          {hasSilverGuide && visualSilverGuidePx != null && !profileEditMode && !showMainEditableOutlinePreview && (
            <>
              <button
                type="button"
                aria-label="Adjust silver band"
                className={`${styles.guideNode} ${styles.guideNodeSilver} ${dragging === "silver-band" ? styles.guideNodeActive : ""}`}
                style={{ left: bodyLeftPx, top: visualSilverGuidePx }}
                onPointerDown={handlePointerDown("silver-band")}
                onMouseDown={handleMouseDown("silver-band")}
              />
              <button
                type="button"
                aria-label="Adjust silver band"
                className={`${styles.guideNode} ${styles.guideNodeSilver} ${dragging === "silver-band" ? styles.guideNodeActive : ""}`}
                style={{ left: bodyLeftPx + bodyWidthPx, top: visualSilverGuidePx }}
                onPointerDown={handlePointerDown("silver-band")}
                onMouseDown={handleMouseDown("silver-band")}
              />
            </>
          )}

          {/* Dead zones (non-engravable) */}
          {showReadOnlyGuides && !profileEditMode && !showMainEditableOutlinePreview && (
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
          {showReadOnlyGuides && !profileEditMode && !showMainEditableOutlinePreview && (
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
          {!profileEditMode && !showMainEditableOutlinePreview && showHandleTrace && (
            <>
              {handleThicknessButtonPoint && (
                <button
                  type="button"
                  aria-label="Adjust handle thickness"
                  className={`${styles.guideNode} ${styles.guideNodeHandleOuterAnchor} ${styles.guideNodeHandleReach} ${dragging === "handle-thickness" ? styles.guideNodeActive : ""}`}
                  style={{ left: handleThicknessButtonPoint.x, top: handleThicknessButtonPoint.y }}
                  title="Adjust handle thickness"
                  onPointerDown={handlePointerDown("handle-thickness")}
                  onMouseDown={handleMouseDown("handle-thickness")}
                />
              )}
              {handleTopAttachButtonPoint && (
                <button
                  type="button"
                  aria-label="Adjust handle top"
                  className={`${styles.guideNode} ${styles.guideNodeHandleOutline} ${dragging === "handle-top" ? styles.guideNodeActive : ""}`}
                  style={{ left: handleTopAttachButtonPoint.x, top: handleTopAttachButtonPoint.y }}
                  title="Adjust handle top"
                  onPointerDown={handlePointerDown("handle-top")}
                  onMouseDown={handleMouseDown("handle-top")}
                />
              )}
              {handleBottomAttachButtonPoint && (
                <button
                  type="button"
                  aria-label="Adjust handle bottom"
                  className={`${styles.guideNode} ${styles.guideNodeHandleOutline} ${dragging === "handle-bottom" ? styles.guideNodeActive : ""}`}
                  style={{ left: handleBottomAttachButtonPoint.x, top: handleBottomAttachButtonPoint.y }}
                  title="Adjust handle bottom"
                  onPointerDown={handlePointerDown("handle-bottom")}
                  onMouseDown={handleMouseDown("handle-bottom")}
                />
              )}
              {handleUpperCornerButtonPoint && (
                <button
                  type="button"
                  aria-label="Adjust handle upper corner"
                  className={`${styles.guideNode} ${styles.guideNodeHandleOutline} ${styles.guideNodeHandleCorner} ${dragging === "handle-upper-corner" ? styles.guideNodeActive : ""}`}
                  style={{ left: handleUpperCornerButtonPoint.x, top: handleUpperCornerButtonPoint.y }}
                  title="Adjust handle upper corner"
                  onPointerDown={handlePointerDown("handle-upper-corner")}
                  onMouseDown={handleMouseDown("handle-upper-corner")}
                />
              )}
              {handleUpperTransitionButtonPoint && (
                <button
                  type="button"
                  aria-label="Adjust handle upper transition"
                  className={`${styles.guideNode} ${styles.guideNodeSilver} ${styles.guideNodeHandleTransition} ${dragging === "handle-upper-transition" ? styles.guideNodeActive : ""}`}
                  style={{ left: handleUpperTransitionButtonPoint.x, top: handleUpperTransitionButtonPoint.y }}
                  title="Adjust handle upper transition"
                  onPointerDown={handlePointerDown("handle-upper-transition")}
                  onMouseDown={handleMouseDown("handle-upper-transition")}
                />
              )}
              {handleLowerCornerButtonPoint && (
                <button
                  type="button"
                  aria-label="Adjust handle lower corner"
                  className={`${styles.guideNode} ${styles.guideNodeHandleOutline} ${styles.guideNodeHandleCorner} ${dragging === "handle-lower-corner" ? styles.guideNodeActive : ""}`}
                  style={{ left: handleLowerCornerButtonPoint.x, top: handleLowerCornerButtonPoint.y }}
                  title="Adjust handle lower corner"
                  onPointerDown={handlePointerDown("handle-lower-corner")}
                  onMouseDown={handleMouseDown("handle-lower-corner")}
                />
              )}
              {handleLowerTransitionButtonPoint && (
                <button
                  type="button"
                  aria-label="Adjust handle lower transition"
                  className={`${styles.guideNode} ${styles.guideNodeSilver} ${styles.guideNodeHandleTransition} ${dragging === "handle-lower-transition" ? styles.guideNodeActive : ""}`}
                  style={{ left: handleLowerTransitionButtonPoint.x, top: handleLowerTransitionButtonPoint.y }}
                  title="Adjust handle lower transition"
                  onPointerDown={handlePointerDown("handle-lower-transition")}
                  onMouseDown={handleMouseDown("handle-lower-transition")}
                />
              )}
            </>
          )}
          {!activeDisplayPhoto && hasPrintableBottomGuide && !profileEditMode && !showMainEditableOutlinePreview && (
            <div
              className={`${styles.placementGuide} ${styles.coatingPlacementGuide}`}
              style={{ top: printableBottomGuidePx, left: baseLeftPx, width: Math.max(0, baseRightPx - baseLeftPx) }}
            />
          )}
          {hasPrintableBottomGuide && !profileEditMode && !showMainEditableOutlinePreview && (
            <>
              <button
                type="button"
                aria-label="Adjust printable bottom"
                className={`${styles.guideNode} ${styles.guideNodeSilver} ${dragging === "printable-bottom" ? styles.guideNodeActive : ""}`}
                style={{ left: bodyLeftPx, top: printableBottomGuidePx }}
                onPointerDown={handlePointerDown("printable-bottom")}
                onMouseDown={handleMouseDown("printable-bottom")}
              />
              <button
                type="button"
                aria-label="Adjust printable bottom"
                className={`${styles.guideNode} ${styles.guideNodeSilver} ${dragging === "printable-bottom" ? styles.guideNodeActive : ""}`}
                style={{ left: bodyLeftPx + bodyWidthPx, top: printableBottomGuidePx }}
                onPointerDown={handlePointerDown("printable-bottom")}
                onMouseDown={handleMouseDown("printable-bottom")}
              />
            </>
          )}
          {showReadOnlyGuides && !profileEditMode && !showMainEditableOutlinePreview && topOuterLeftPx != null && topOuterRightPx != null && (
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
          {showReadOnlyGuides && !profileEditMode && !showMainEditableOutlinePreview && (
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
          {dimensionCalibration && (
            <div className={styles.readoutRow}>
              <span className={styles.readoutLabel}>Front transform</span>
              <span className={styles.readoutValue}>
                {dimensionCalibration.photoToFrontTransform.matrix.map((value) => value.toFixed(3)).join(", ")}
              </span>
            </div>
          )}
          {derivedZoneGuides?.straightWallHeightMm != null && derivedZoneGuides.straightWallHeightMm > 0 && (
            <div className={styles.readoutRow}>
              <span className={styles.readoutLabel}>Straight wall</span>
              <span className={styles.readoutValue}>{round1(derivedZoneGuides.straightWallHeightMm)} mm</span>
            </div>
          )}
          {visualLidGuideMm != null && (
            <div className={styles.readoutRow}>
            <span className={styles.readoutLabel}>Silver ring top</span>
              <span className={styles.readoutInputWrap}>
                <input
                  className={styles.readoutInput}
                  type="number"
                  min={0}
                  max={round1(Math.max(0, Math.min(
                    Math.max(0, clampedBodyBottomFromOverallMm - 2),
                    (visualSilverGuideMm ?? clampedBodyBottomFromOverallMm) - 1,
                  )))}
                  step={0.1}
                  value={round1(visualLidGuideMm)}
                  onChange={(e) => handleLidSeamInputChange(Number(e.target.value))}
                />
                <span className={styles.dimensionUnit}>mm</span>
              </span>
            </div>
          )}
          {visualSilverGuideMm != null && (
            <div className={styles.readoutRow}>
              <span className={styles.readoutLabel}>Silver ring bottom</span>
              <span className={styles.readoutInputWrap}>
                <input
                  className={styles.readoutInput}
                  type="number"
                  min={round1(Math.max(
                    0.5,
                    (visualLidGuideMm ?? 0) + 1,
                  ))}
                  max={round1(clampedBodyBottomFromOverallMm)}
                  step={0.1}
                  value={round1(visualSilverGuideMm)}
                  onChange={(e) => handleSilverBandInputChange(Number(e.target.value))}
                />
                <span className={styles.dimensionUnit}>mm</span>
              </span>
            </div>
          )}
          <div className={styles.readoutRow}>
            <span className={styles.readoutLabel}>Printable top</span>
            <span className={styles.readoutInputWrap}>
              <input
                className={styles.readoutInput}
                type="number"
                min={round1(clampedBodyTopFromOverallMm)}
                max={round1(Math.max(clampedBodyTopFromOverallMm, resolvedPrintableBottomMm - 1))}
                step={0.1}
                value={printableTopOverrideMm != null ? round1(printableTopOverrideMm) : ""}
                placeholder={String(round1(resolvedPrintableTopMm))}
                onChange={(e) => onPrintableTopOverrideChange?.(parseOptionalMmInput(e.target.value))}
              />
              <span className={styles.dimensionUnit}>mm</span>
            </span>
          </div>
          <div className={styles.readoutRow}>
            <span className={styles.readoutLabel}>Printable bottom</span>
            <span className={styles.readoutInputWrap}>
              <input
                className={styles.readoutInput}
                type="number"
                min={round1(resolvedPrintableTopMm + 1)}
                max={round1(clampedBodyBottomFromOverallMm)}
                step={0.1}
                value={printableBottomOverrideMm != null ? round1(printableBottomOverrideMm) : ""}
                placeholder={String(round1(resolvedPrintableBottomMm))}
                onChange={(e) => {
                  markGuideAsManual("printableBottom");
                  onPrintableBottomOverrideChange?.(parseOptionalMmInput(e.target.value));
                }}
              />
              <span className={styles.dimensionUnit}>mm</span>
            </span>
          </div>
          <div className={`${styles.readoutRow} ${styles.readoutHighlight}`}>
            <span className={styles.readoutLabel}>Printable height</span>
            <span className={styles.readoutValue}>{resolvedPrintableHeightMm} mm</span>
          </div>
          <div className={styles.readoutRow}>
            <span className={styles.readoutLabel}>Printable center</span>
            <span className={styles.readoutValue}>{resolvedPrintableCenterMm} mm</span>
          </div>
          <div className={styles.readoutRow}>
            <span className={styles.readoutLabel}>Top exclusions</span>
            <span className={styles.readoutValue}>{printableExclusionSummary}</span>
          </div>
          <div className={styles.readoutRow}>
            <span className={styles.readoutLabel}>Handle keep-out</span>
            <span className={styles.readoutValue}>
              {printableSurfaceContract?.circumferentialExclusions?.length ? "yes" : "no"}
            </span>
          </div>
          <div className={styles.readoutRow}>
            <span className={styles.readoutLabel}>Band detect</span>
            <span className={styles.readoutValue}>{bandDetectDisplayValue}</span>
          </div>
          <div className={styles.readoutRow}>
            <span className={styles.readoutLabel}>Band action</span>
            <span className={styles.readoutInputWrap}>
              <button
                type="button"
                className={`${styles.editorToolBtn} ${applyableBandValues ? styles.editorToolBtnPrimary : ""}`}
                disabled={!applyableBandValues}
                onClick={handleApplyAutoDetectedBands}
              >
                {autoDetectedBandValues
                  ? (autoDetectedBandsCommitted ? "Re-apply detected split" : "Apply detected split")
                  : applyableBandValues
                    ? "Apply visual estimate"
                    : "No auto-detect"}
              </button>
            </span>
          </div>
          {applyableBandValues && (
            <div className={styles.guideHint}>
              {autoDetectedBandValues
                ? "Apply the detected band split, then drag the edge dots or adjust the mm fields for manual refinement."
                : "Apply the visual estimate, then drag the edge dots or adjust the mm fields for manual refinement."}
            </div>
          )}
          <div className={printableDetectionWeak ? styles.readoutWarning : styles.readoutHint}>
            {printableDetectionWeak
              ? "Top band detection is weak. Set printable top / bottom manually instead of trusting the auto split."
              : "Printable overrides are optional. Leave them blank to use the detected boundary."}
          </div>
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
                    onChange={(e) => {
                      markHandleAsManual("top");
                      onHandleTopChange?.(round1(Number(e.target.value)));
                    }}
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
                    onChange={(e) => {
                      markHandleAsManual("bottom");
                      onHandleBottomChange?.(round1(Number(e.target.value)));
                    }}
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
                    onChange={(e) => {
                      markHandleAsManual("reach");
                      onHandleReachChange?.(round1(Number(e.target.value)));
                    }}
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
              <span className={styles.readoutLabel}>Lid color</span>
              <span className={styles.colorSwatchValue}>
                <span className={styles.colorSwatchChip} style={{ backgroundColor: lidColorHex }} />
                <span className={styles.readoutValue}>{lidColorHex}</span>
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
