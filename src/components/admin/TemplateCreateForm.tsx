"use client";

import React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  type CanonicalBodyProfile,
  type CanonicalDimensionCalibration,
  type CanonicalHandleProfile,
  type EditableBodyOutline,
  type ManufacturerLogoStamp,
  type ProductReferenceSet,
  type ReferenceLayerState,
  type ReferencePaths,
  getTemplateBaseDiameterMm,
  getTemplateBodyDiameterMm,
  getTemplateTopOuterDiameterMm,
  type ProductTemplate,
  type TumblerMapping,
} from "@/types/productTemplate";
import type { AutoDetectResult } from "@/lib/autoDetect";
import type { FlatItemLookupResponse } from "@/types/flatItemLookup";
import type { TumblerFinish } from "@/types/materials";
import type { TraceSettingsAssistResponse } from "@/types/imageAssist";
import type { RasterVectorizeResponse } from "@/types/rasterVectorize";
import type { SmartTemplateLookupResponse } from "@/types/smartTemplateLookup";
import type { TumblerItemLookupFitDebug, TumblerItemLookupResponse } from "@/types/tumblerItemLookup";
import type { CatalogBatchImportSummary } from "@/lib/catalogBatchImport";
import { detectTumblerFromImage } from "@/lib/autoDetect";
import { lookupFlatItem as lookupFlatItemRequest } from "@/lib/flatItemLookup";
import { cleanupImageForTracing } from "@/lib/imageCleanupClient";
import { detectLogoPlacementAssist, recommendTraceSettingsAssist } from "@/lib/imageAssistClient";
import { removeBackgroundWithFallback } from "@/lib/removeBg";
import { lookupTumblerItem } from "@/lib/tumblerItemLookup";
import { importCatalogTemplates } from "@/lib/catalogBatchImport";
import { FLAT_BED_ITEMS, type FlatBedItem } from "@/data/flatBedItems";
import { KNOWN_MATERIAL_PROFILES } from "@/data/materialProfiles";
import { getMaterialProfileById } from "@/data/materialProfiles";
import { saveTemplate, updateTemplate } from "@/lib/templateStorage";
import { generateThumbnail } from "@/lib/generateThumbnail";
import {
  extractManufacturerLogoStamp,
  MANUFACTURER_LOGO_STAMP_ALGO_VERSION,
} from "@/lib/manufacturerLogoStamp";
import { resolveTumblerMaterialSetup } from "@/lib/tumblerMaterialInference";
import { findTumblerProfileIdForBrandModel, getTumblerProfileById, getProfileHandleArcDeg } from "@/data/tumblerProfiles";
import { getDefaultLaserSettings } from "@/lib/scopedDefaults";
import { deriveEngravableZoneFromFitDebug, getEngravableDimensions } from "@/lib/engravableDimensions";
import {
  getPrintableSurfaceLocalBounds,
  getPrintableSurfaceResolutionFromDimensions,
  type PrintableSurfaceDetection,
} from "@/lib/printableSurface";
import { buildTemplateHandlePreset } from "@/lib/handlePresets";
import { buildTemplateLidPreset, type LidAssemblyPreset } from "@/lib/lidPresets";
import {
  cloneReferenceLayerState,
  createEditableBodyOutline,
  createEditableBodyOutlineFromTraceDebug,
  createDefaultReferenceLayerState,
  createEditableBodyOutlineFromSeedSvgText,
  createReferencePaths,
  deriveDimensionsFromEditableBodyOutline,
} from "@/lib/editableBodyOutline";
import { extractCanonicalHandleProfileFromCutout } from "@/lib/canonicalHandleProfile";
import {
  resolveCanonicalHandleRenderMode,
  summarizeCanonicalHandleDebug,
  summarizeCanonicalOrientationQA,
  summarizeCanonicalSilhouetteMismatch,
} from "@/lib/canonicalDimensionCalibration";
import {
  BODY_REFERENCE_CONTRACT_VERSION,
  createPersistedBodyReferencePipeline,
  deriveBodyReferencePipeline,
  type BodyReferencePipelineResult,
} from "@/lib/bodyReferencePipeline";
import { inferFlatFamilyKey } from "@/lib/flatItemFamily";
import { FileDropZone } from "./shared/FileDropZone";
import { TumblerMappingWizard } from "./TumblerMappingWizard";
import { EngravableZoneEditor } from "./EngravableZoneEditor";
import { TumblerLookupDebugPanel } from "./TumblerLookupDebugPanel";
import { FlatItemLookupDebugPanel } from "./FlatItemLookupDebugPanel";
import {
  PipelineDebugDrawer,
  type PipelineDebugRawObject,
  type PipelineDebugSection,
} from "./PipelineDebugDrawer";
import { SmartTemplateLookupPanel } from "./SmartTemplateLookupPanel";
import type { FlatPreviewDimensions, ModelViewerProps, TumblerDimensions } from "./ModelViewer";
import type { EditableHandlePreview } from "@/lib/editableHandleGeometry";
import styles from "./TemplateCreateForm.module.css";

const ModelViewer = dynamic<ModelViewerProps>(
  () => import("./ModelViewer"),
  { ssr: false },
);

interface Props {
  onSave: (template: ProductTemplate) => void;
  onCancel: () => void;
  editingTemplate?: ProductTemplate;
  showActions?: boolean;
}

export interface TemplateCreateFormHandle {
  save: () => void;
}

type PreviewModelMode = "alignment-model" | "full-model" | "source-traced";
type TemplateReadinessStatus = "ready" | "review" | "action";

const CATALOG_BATCH_IMPORT_AVAILABLE = false;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function estimateEditableHandleWallThicknessMm(args: {
  handleProfile?: CanonicalHandleProfile | null;
  pxToMmScaleX?: number | null;
  pxToMmScaleY?: number | null;
  fallbackMm: number;
}): number {
  const { handleProfile, pxToMmScaleX, pxToMmScaleY, fallbackMm } = args;
  if (!handleProfile?.outerContour?.length || !handleProfile.innerContour?.length) {
    return round2(fallbackMm);
  }

  const scaleX = Math.abs(pxToMmScaleX ?? 0);
  const scaleY = Math.abs(pxToMmScaleY ?? scaleX);
  if (!(scaleX > 0) || !(scaleY > 0)) {
    return round2(fallbackMm);
  }

  const outerXs = handleProfile.outerContour.map((point) => point.x);
  const outerYs = handleProfile.outerContour.map((point) => point.y);
  const innerXs = handleProfile.innerContour.map((point) => point.x);
  const innerYs = handleProfile.innerContour.map((point) => point.y);

  const outerMinX = Math.min(...outerXs);
  const outerMaxX = Math.max(...outerXs);
  const outerMinY = Math.min(...outerYs);
  const outerMaxY = Math.max(...outerYs);
  const innerMinX = Math.min(...innerXs);
  const innerMaxX = Math.max(...innerXs);
  const innerMinY = Math.min(...innerYs);
  const innerMaxY = Math.max(...innerYs);

  const candidatesPx = [
    innerMinX - outerMinX,
    outerMaxX - innerMaxX,
    innerMinY - outerMinY,
    outerMaxY - innerMaxY,
  ].filter((value) => Number.isFinite(value) && value > 1);

  if (candidatesPx.length === 0) {
    return round2(fallbackMm);
  }

  const sorted = [...candidatesPx].sort((a, b) => a - b);
  const medianPx = sorted[Math.floor(sorted.length / 2)] ?? sorted[0] ?? 0;
  const mmCandidates = [
    medianPx * scaleX,
    medianPx * scaleY,
  ].filter((value) => Number.isFinite(value) && value > 0);
  if (mmCandidates.length === 0) {
    return round2(fallbackMm);
  }

  return round2(clampNumber(
    mmCandidates.reduce((sum, value) => sum + value, 0) / mmCandidates.length,
    4,
    Math.max(6, fallbackMm * 1.6),
  ));
}

function getHandleContourBounds(points: Array<{ x: number; y: number }> | undefined | null) {
  if (!points?.length) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function approximatelyEqual(a: number | undefined, b: number | undefined, epsilon = 0.01): boolean {
  if (a == null || b == null) return a == null && b == null;
  return Math.abs(a - b) <= epsilon;
}

function canonicalHandleContourPointsEqual(
  a: Array<{ x: number; y: number }> | undefined,
  b: Array<{ x: number; y: number }> | undefined,
  epsilon = 0.01,
): boolean {
  if (!a?.length || !b?.length) return (a?.length ?? 0) === (b?.length ?? 0);
  if (a.length !== b.length) return false;
  return a.every((point, index) =>
    approximatelyEqual(point.x, b[index]?.x, epsilon) &&
    approximatelyEqual(point.y, b[index]?.y, epsilon));
}

function canonicalHandleCenterlineEqual(
  a: CanonicalHandleProfile["centerline"] | undefined,
  b: CanonicalHandleProfile["centerline"] | undefined,
  epsilon = 0.01,
): boolean {
  if (!a?.length || !b?.length) return (a?.length ?? 0) === (b?.length ?? 0);
  if (a.length !== b.length) return false;
  return a.every((point, index) =>
    approximatelyEqual(point.t, b[index]?.t, epsilon) &&
    approximatelyEqual(point.x, b[index]?.x, epsilon) &&
    approximatelyEqual(point.y, b[index]?.y, epsilon));
}

function canonicalHandleWidthProfileEqual(
  a: CanonicalHandleProfile["widthProfile"] | undefined,
  b: CanonicalHandleProfile["widthProfile"] | undefined,
  epsilon = 0.01,
): boolean {
  if (!a?.length || !b?.length) return (a?.length ?? 0) === (b?.length ?? 0);
  if (a.length !== b.length) return false;
  return a.every((sample, index) =>
    approximatelyEqual(sample.t, b[index]?.t, epsilon) &&
    approximatelyEqual(sample.widthPx, b[index]?.widthPx, epsilon));
}

function canonicalHandleProfilesEqual(
  a: CanonicalHandleProfile | undefined,
  b: CanonicalHandleProfile | undefined,
  epsilon = 0.01,
): boolean {
  if (!a || !b) return !a && !b;
  return a.side === b.side &&
    approximatelyEqual(a.confidence, b.confidence, epsilon) &&
    approximatelyEqual(a.anchors.upper.sNorm, b.anchors.upper.sNorm, epsilon) &&
    approximatelyEqual(a.anchors.upper.xPx, b.anchors.upper.xPx, epsilon) &&
    approximatelyEqual(a.anchors.upper.yPx, b.anchors.upper.yPx, epsilon) &&
    approximatelyEqual(a.anchors.lower.sNorm, b.anchors.lower.sNorm, epsilon) &&
    approximatelyEqual(a.anchors.lower.xPx, b.anchors.lower.xPx, epsilon) &&
    approximatelyEqual(a.anchors.lower.yPx, b.anchors.lower.yPx, epsilon) &&
    canonicalHandleContourPointsEqual(a.outerContour, b.outerContour, epsilon) &&
    canonicalHandleContourPointsEqual(a.innerContour, b.innerContour, epsilon) &&
    canonicalHandleCenterlineEqual(a.centerline, b.centerline, epsilon) &&
    canonicalHandleWidthProfileEqual(a.widthProfile, b.widthProfile, epsilon) &&
    approximatelyEqual(a.upperAttachmentWidthPx, b.upperAttachmentWidthPx, epsilon) &&
    approximatelyEqual(a.lowerAttachmentWidthPx, b.lowerAttachmentWidthPx, epsilon) &&
    approximatelyEqual(a.upperOpeningGapPx, b.upperOpeningGapPx, epsilon) &&
    approximatelyEqual(a.lowerOpeningGapPx, b.lowerOpeningGapPx, epsilon) &&
    approximatelyEqual(a.symmetricExtrusionWidthPx, b.symmetricExtrusionWidthPx, epsilon) &&
    approximatelyEqual(a.openingBox?.x, b.openingBox?.x, epsilon) &&
    approximatelyEqual(a.openingBox?.y, b.openingBox?.y, epsilon) &&
    approximatelyEqual(a.openingBox?.w, b.openingBox?.w, epsilon) &&
    approximatelyEqual(a.openingBox?.h, b.openingBox?.h, epsilon) &&
    a.svgPathOuter === b.svgPathOuter &&
    a.svgPathInner === b.svgPathInner;
}

function buildSourceContourSignature(outline: EditableBodyOutline | null | undefined): string {
  const contour = outline?.sourceContour;
  if (!contour?.length) return "";
  return contour.map((point) => `${round2(point.x)}:${round2(point.y)}`).join("|");
}

function deriveMeasuredEditableHandlePreview(args: {
  fitDebug?: TumblerItemLookupFitDebug | null;
  handleProfile?: CanonicalHandleProfile | null;
  calibration?: CanonicalDimensionCalibration | null;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  fallbackTubeDiameterMm: number;
}): EditableHandlePreview | null {
  const {
    fitDebug,
    handleProfile,
    calibration,
    bodyTopFromOverallMm,
    bodyBottomFromOverallMm,
    fallbackTubeDiameterMm,
  } = args;
  if (!calibration) return null;
  const [sx = 1, , tx = 0, , sy = 1, ty = 0] = calibration.photoToFrontTransform.matrix;
  const pxToMmX = (value: number) => (value * sx) + tx;
  const pxToMmY = (value: number) => (value * sy) + ty;
  const clampY = (value: number, min: number, max: number) => round2(clampNumber(value, min, max));
  const finalizePreview = (seed: {
    side: "left" | "right";
    attachXpx: number;
    outerEdgeXpx: number;
    innerTopPx: number;
    innerBottomPx: number;
    outerTopPx: number;
    outerBottomPx: number;
    wallThicknessPx: number;
  }): EditableHandlePreview | null => {
    const topFromOverallMm = clampY(pxToMmY(seed.innerTopPx), bodyTopFromOverallMm, bodyBottomFromOverallMm - 24);
    const bottomFromOverallMm = clampY(pxToMmY(seed.innerBottomPx), topFromOverallMm + 24, bodyBottomFromOverallMm);
    const outerTopFromOverallMm = clampY(
      pxToMmY(seed.outerTopPx),
      bodyTopFromOverallMm,
      bottomFromOverallMm - 4,
    );
    const outerBottomFromOverallMm = clampY(
      pxToMmY(seed.outerBottomPx),
      outerTopFromOverallMm + 4,
      bodyBottomFromOverallMm,
    );
    const outerWidthMm = Math.abs(pxToMmX(seed.outerEdgeXpx) - pxToMmX(seed.attachXpx));
    if (!(outerWidthMm > 4)) return null;
    const measuredWallMm = Math.max(3, Math.abs(seed.wallThicknessPx * sx));
    const reachMm = round2(clampNumber(outerWidthMm - measuredWallMm, 8, Math.max(10, outerWidthMm - 1)));
    const tubeDiameterMm = round2(clampNumber(
      Math.max(fallbackTubeDiameterMm, measuredWallMm),
      4,
      Math.max(6, fallbackTubeDiameterMm * 1.6),
    ));
    const outerOffsetMm = round2(clampNumber(
      measuredWallMm,
      2,
      Math.max(4, outerWidthMm * 0.58),
    ));
    const innerHeightMm = Math.max(24, bottomFromOverallMm - topFromOverallMm);
    const cornerInsetMm = round2(clampNumber(
      Math.max(tubeDiameterMm * 0.95, innerHeightMm * 0.16),
      4,
      Math.max(6, (innerHeightMm / 2) - 2),
    ));
    const upperCornerFromOverallMm = round2(clampNumber(
      topFromOverallMm + cornerInsetMm,
      topFromOverallMm + 4,
      bottomFromOverallMm - 8,
    ));
    const lowerCornerFromOverallMm = round2(clampNumber(
      bottomFromOverallMm - cornerInsetMm,
      upperCornerFromOverallMm + 4,
      bottomFromOverallMm - 4,
    ));
    return {
      side: seed.side,
      topFromOverallMm,
      bottomFromOverallMm,
      outerTopFromOverallMm,
      outerBottomFromOverallMm,
      reachMm,
      outerOffsetMm,
      upperCornerFromOverallMm,
      lowerCornerFromOverallMm,
      upperCornerReachMm: reachMm,
      lowerCornerReachMm: reachMm,
      upperTransitionFromOverallMm: topFromOverallMm,
      lowerTransitionFromOverallMm: bottomFromOverallMm,
      upperTransitionReachMm: reachMm,
      lowerTransitionReachMm: reachMm,
      tubeDiameterMm,
    };
  };

  if (
    fitDebug?.handleSide &&
    fitDebug.handleAttachEdgePx != null &&
    fitDebug.handleOuterEdgePx != null &&
    fitDebug.handleHoleTopPx != null &&
    fitDebug.handleHoleBottomPx != null &&
    fitDebug.handleCenterYPx != null &&
    fitDebug.handleOuterHeightPx != null &&
    fitDebug.handleBarWidthPx != null
  ) {
    const outerHalfHeightPx = fitDebug.handleOuterHeightPx / 2;
    const outerTopFromBarPx = fitDebug.handleHoleTopPx - fitDebug.handleBarWidthPx;
    const outerBottomFromBarPx = fitDebug.handleHoleBottomPx + fitDebug.handleBarWidthPx;
    const fromFitDebug = finalizePreview({
      side: fitDebug.handleSide,
      attachXpx: fitDebug.handleAttachEdgePx,
      outerEdgeXpx: fitDebug.handleOuterEdgePx,
      innerTopPx: fitDebug.handleHoleTopPx,
      innerBottomPx: fitDebug.handleHoleBottomPx,
      outerTopPx: Math.max(fitDebug.handleCenterYPx - outerHalfHeightPx, outerTopFromBarPx),
      outerBottomPx: Math.min(fitDebug.handleCenterYPx + outerHalfHeightPx, outerBottomFromBarPx),
      wallThicknessPx: fitDebug.handleBarWidthPx,
    });
    if (fromFitDebug) {
      return fromFitDebug;
    }
  }

  const outerBounds = getHandleContourBounds(handleProfile?.outerContour);
  const innerBounds = handleProfile?.openingBox
    ? {
        minX: handleProfile.openingBox.x,
        maxX: handleProfile.openingBox.x + handleProfile.openingBox.w,
        minY: handleProfile.openingBox.y,
        maxY: handleProfile.openingBox.y + handleProfile.openingBox.h,
      }
    : getHandleContourBounds(handleProfile?.innerContour);
  const side = handleProfile?.side ?? null;
  if (!outerBounds || !innerBounds || !side) {
    return null;
  }

  const attachXpx = side === "right" ? outerBounds.minX : outerBounds.maxX;
  const outerEdgeXpx = side === "right" ? outerBounds.maxX : outerBounds.minX;
  const wallThicknessPx = Math.max(
    4,
    side === "right"
      ? Math.min(innerBounds.minX - outerBounds.minX, outerBounds.maxX - innerBounds.maxX)
      : Math.min(outerBounds.maxX - innerBounds.maxX, innerBounds.minX - outerBounds.minX),
  );
  return finalizePreview({
    side,
    attachXpx,
    outerEdgeXpx,
    innerTopPx: innerBounds.minY,
    innerBottomPx: innerBounds.maxY,
    outerTopPx: outerBounds.minY,
    outerBottomPx: outerBounds.maxY,
    wallThicknessPx,
  });
}

function wrapTheta(theta: number): number {
  const twoPi = Math.PI * 2;
  let normalized = theta % twoPi;
  if (normalized > Math.PI) normalized -= twoPi;
  if (normalized < -Math.PI) normalized += twoPi;
  return normalized;
}

function resolveDefaultPreviewModelMode(args: {
  productType: ProductTemplate["productType"] | "" | null;
  hasAlignmentPreviewModel: boolean;
  hasFullPreviewModel: boolean;
  hasSourcePreviewModel: boolean;
}): PreviewModelMode {
  if (args.productType === "flat") {
    return "source-traced";
  }
  if (args.hasAlignmentPreviewModel) {
    return "alignment-model";
  }
  if (args.hasFullPreviewModel) {
    return "full-model";
  }
  if (args.hasSourcePreviewModel) {
    return "source-traced";
  }
  return "source-traced";
}

function resolveBodyReferenceDiameterMm(args: {
  outsideDiameterMm?: number | null;
  topDiameterMm?: number | null;
  bottomDiameterMm?: number | null;
  fallbackOutsideDiameterMm?: number | null;
}): number | null {
  const outside = typeof args.outsideDiameterMm === "number" && Number.isFinite(args.outsideDiameterMm)
    ? args.outsideDiameterMm
    : null;
  const top = typeof args.topDiameterMm === "number" && Number.isFinite(args.topDiameterMm)
    ? args.topDiameterMm
    : null;
  const bottom = typeof args.bottomDiameterMm === "number" && Number.isFinite(args.bottomDiameterMm)
    ? args.bottomDiameterMm
    : null;
  const fallbackOutside = typeof args.fallbackOutsideDiameterMm === "number" && Number.isFinite(args.fallbackOutsideDiameterMm)
    ? args.fallbackOutsideDiameterMm
    : null;

  const topBottomDelta = top != null && bottom != null
    ? Math.abs(top - bottom)
    : null;
  const taperedAverage = top != null && bottom != null
    ? (top + bottom) / 2
    : null;
  const looksLikeSyntheticAverage = (
    outside != null &&
    taperedAverage != null &&
    topBottomDelta != null &&
    topBottomDelta > 3 &&
    Math.abs(outside - taperedAverage) < 0.75
  );

  if (fallbackOutside != null && (outside == null || looksLikeSyntheticAverage)) {
    return round2(fallbackOutside);
  }
  if (outside != null) {
    return round2(outside);
  }
  if (top != null && bottom != null && Math.abs(top - bottom) > 3) {
    return round2(top);
  }
  if (top != null && bottom != null && Math.abs(top - bottom) <= 3) {
    return round2((top + bottom) / 2);
  }
  if (top != null && bottom == null) {
    return round2(top);
  }
  if (bottom != null && top == null) {
    return round2(bottom);
  }
  return null;
}

function lineIntervalFromLpi(lpi: number): number {
  return lpi > 0 ? round2(25.4 / lpi) : 0.06;
}

function resolveReferencePaths(dimensions?: ProductTemplate["dimensions"]): ReferencePaths {
  return createReferencePaths({
    bodyOutline: dimensions?.referencePaths?.bodyOutline ?? dimensions?.bodyOutlineProfile ?? null,
    lidProfile: dimensions?.referencePaths?.lidProfile ?? null,
    silverProfile: dimensions?.referencePaths?.silverProfile ?? null,
  });
}

function resolveReferenceLayerState(dimensions?: ProductTemplate["dimensions"]): ReferenceLayerState {
  return cloneReferenceLayerState(dimensions?.referenceLayerState ?? createDefaultReferenceLayerState());
}

function normalizeTemplateNameToken(value: string | number | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function formatCapacityOzLabel(value: string | number | null | undefined): string {
  const raw = value != null ? String(value).trim() : "";
  if (!raw) return "";
  const normalizedValue = raw.replace(/\s*oz$/i, "").trim();
  return normalizedValue ? `${normalizedValue}oz` : "";
}

function buildTemplateDisplayName(args: {
  brand?: string | null;
  model?: string | null;
  capacityOz?: string | number | null;
  fallbackTitle?: string | null;
  fallbackRaw?: string | null;
}): string {
  const brand = args.brand?.trim() ?? "";
  const model = args.model?.trim() ?? "";
  const capacityToken = formatCapacityOzLabel(args.capacityOz);
  const tokens: string[] = [];
  if (brand) tokens.push(brand);
  if (model) tokens.push(model);

  if (capacityToken) {
    const existing = normalizeTemplateNameToken(`${brand} ${model}`);
    const normalizedCapacity = normalizeTemplateNameToken(capacityToken);
    if (!existing.includes(normalizedCapacity)) {
      tokens.push(capacityToken);
    }
  }

  return tokens.join(" ").trim() || args.fallbackTitle?.trim() || args.fallbackRaw?.trim() || "";
}

/** Convert an image file to a data URL (max 480px on longest side for face photos) */
function fileToFacePhotoDataUrl(file: File, maxSize = 480): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(maxSize / img.naturalWidth, maxSize / img.naturalHeight, 1);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(img.src); resolve(""); return; }
      ctx.drawImage(img, 0, 0, w, h);
      let hasTransparency = false;
      let minX = w;
      let minY = h;
      let maxX = -1;
      let maxY = -1;
      try {
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        for (let y = 0; y < h; y += 1) {
          for (let x = 0; x < w; x += 1) {
            const alpha = data[((y * w + x) * 4) + 3] ?? 0;
            if (alpha < 250) hasTransparency = true;
            if (alpha > 10) {
              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (x > maxX) maxX = x;
              if (y > maxY) maxY = y;
            }
          }
        }
      } catch {
        hasTransparency = false;
      }
      URL.revokeObjectURL(img.src);
      if (hasTransparency && maxX >= minX && maxY >= minY) {
        const pad = Math.max(4, Math.round(Math.max(w, h) * 0.02));
        const cropX = Math.max(0, minX - pad);
        const cropY = Math.max(0, minY - pad);
        const cropW = Math.max(1, Math.min(w - cropX, (maxX - minX + 1) + (pad * 2)));
        const cropH = Math.max(1, Math.min(h - cropY, (maxY - minY + 1) + (pad * 2)));
        const cropCanvas = document.createElement("canvas");
        cropCanvas.width = cropW;
        cropCanvas.height = cropH;
        const cropCtx = cropCanvas.getContext("2d");
        if (cropCtx) {
          cropCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
          resolve(cropCanvas.toDataURL("image/png"));
          return;
        }
      }
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(img.src); resolve(""); };
    img.src = URL.createObjectURL(file);
  });
}

/** Flip an image data URL horizontally (mirror) for back-side overlay */
function flipImageHorizontal(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(""); return; }
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => resolve("");
    img.src = dataUrl;
  });
}

async function fetchImageUrlAsDataUrl(url: string): Promise<string> {
  const response = await fetch("/api/admin/flatbed/fetch-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const payload = await response.json().catch(() => null) as { dataUrl?: string } | null;
  if (!response.ok || !payload?.dataUrl) {
    throw new Error(`Could not fetch lookup image: ${url}`);
  }
  return payload.dataUrl;
}

function normalizeImageIdentity(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`.toLowerCase();
  } catch {
    return url.split("?")[0]?.trim().toLowerCase() || null;
  }
}

async function dataUrlToFile(dataUrl: string, fileName: string): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const type = blob.type || "image/png";
  return new File([blob], fileName, { type });
}

async function removeBackgroundForOutlineSeed(sourceDataUrl: string, fileName: string): Promise<string> {
  const sourceFile = await dataUrlToFile(sourceDataUrl, fileName);
  const result = await removeBackgroundWithFallback({
    file: sourceFile,
    preferServer: true,
    localModel: "isnet_quint8",
  });
  return result.dataUrl;
}

interface OutlineSeedTracePreparation {
  sourceDataUrl: string;
  cleanedDataUrl: string;
  cleanupApplied: boolean;
  traceSettings: TraceSettingsAssistResponse | null;
  traceSourceDataUrl: string;
}

function resolveOutlineSeedTraceSource(args: {
  sourceDataUrl: string;
  cleanedDataUrl: string;
  cleanupApplied: boolean;
  traceSettings: TraceSettingsAssistResponse | null;
}): string {
  const { sourceDataUrl, cleanedDataUrl, cleanupApplied, traceSettings } = args;
  if (!cleanupApplied) return sourceDataUrl;
  if (!traceSettings) return cleanedDataUrl;
  return traceSettings.backgroundStrategy === "original"
    ? sourceDataUrl
    : cleanedDataUrl;
}

async function prepareOutlineSeedTrace(sourceDataUrl: string, fileName: string): Promise<OutlineSeedTracePreparation> {
  const sourceFile = await dataUrlToFile(sourceDataUrl, fileName);
  let cleanedDataUrl = sourceDataUrl;
  let cleanupApplied = false;

  try {
    const cleanupResult = await cleanupImageForTracing(sourceFile);
    cleanedDataUrl = cleanupResult.dataUrl || sourceDataUrl;
    cleanupApplied = Boolean(cleanupResult.cleaned && cleanupResult.dataUrl);
  } catch {
    cleanedDataUrl = await removeBackgroundForOutlineSeed(sourceDataUrl, fileName);
    cleanupApplied = cleanedDataUrl !== sourceDataUrl;
  }

  let traceSettings: TraceSettingsAssistResponse | null = null;
  try {
    const assistFile = await dataUrlToFile(
      cleanedDataUrl,
      `${fileName.replace(/\.[^.]+$/, "")}-assist.png`,
    );
    traceSettings = await recommendTraceSettingsAssist(assistFile);
  } catch {
    traceSettings = null;
  }

  return {
    sourceDataUrl,
    cleanedDataUrl,
    cleanupApplied,
    traceSettings,
    traceSourceDataUrl: resolveOutlineSeedTraceSource({
      sourceDataUrl,
      cleanedDataUrl,
      cleanupApplied,
      traceSettings,
    }),
  };
}

async function vectorizeOutlineSeedSvg(
  sourceDataUrl: string,
  fileName: string,
  traceSettings?: TraceSettingsAssistResponse | null,
): Promise<string> {
  const settings = traceSettings ?? null;
  const sourceFile = await dataUrlToFile(sourceDataUrl, fileName);
  const formData = new FormData();
  formData.set("image", sourceFile);
  formData.set("mode", "trace");
  formData.set("thresholdMode", settings?.thresholdMode ?? "auto");
  formData.set("threshold", String(settings?.threshold ?? 160));
  formData.set("invert", String(settings?.invert ?? true));
  formData.set("normalizeLevels", "true");
  formData.set("trimWhitespace", "true");
  formData.set("preserveText", "false");
  formData.set("recipe", settings?.traceRecipe ?? "badge");
  formData.set("backgroundStrategy", settings?.backgroundStrategy ?? "cutout");
  formData.set("turdSize", String(settings?.turdSize ?? 0));
  formData.set("alphaMax", String(settings?.alphaMax ?? 0.35));
  formData.set("optTolerance", String(settings?.optTolerance ?? 0.05));
  formData.set("posterizeSteps", String(settings?.posterizeSteps ?? 4));
  formData.set("preferLocal", "true");

  const response = await fetch("/api/admin/image/vectorize", {
    method: "POST",
    body: formData,
  });
  const payload = await response.json().catch(() => null) as RasterVectorizeResponse | { error?: string } | null;
  if (!response.ok || !payload || !("svg" in payload) || typeof payload.svg !== "string" || payload.svg.length === 0) {
    throw new Error(
      (payload && "error" in payload && typeof payload.error === "string")
        ? payload.error
        : "PNG cutout vectorization failed.",
    );
  }
  return payload.svg;
}


/** Map AI product type string to our ProductTemplate product types */
function mapProductType(aiType: string): "tumbler" | "mug" | "bottle" | "flat" {
  const lower = aiType.toLowerCase();
  if (lower.includes("mug")) return "mug";
  if (lower.includes("bottle") || lower.includes("water")) return "bottle";
  if (lower.includes("flat") || lower.includes("sheet") || lower.includes("plate")) return "flat";
  return "tumbler";
}

function getLookupModeLabel(mode: TumblerItemLookupResponse["mode"]): string {
  switch (mode) {
    case "matched-profile":
      return "Matched profile";
    case "parsed-page":
      return "Page dimensions";
    case "safe-fallback":
      return "Safe fallback";
    default:
      return "Lookup";
  }
}

function getLookupSourceLabel(result: TumblerItemLookupResponse): string | null {
  const sourceUrl = result.resolvedUrl ?? result.sources[0]?.url ?? null;
  if (!sourceUrl) return null;
  try {
    const host = new URL(sourceUrl).hostname.replace(/^www\./i, "");
    const [label] = host.split(".");
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : null;
  } catch {
    return null;
  }
}

function getLookupPhotoLabel(result: TumblerItemLookupResponse): string {
  const source = getLookupSourceLabel(result);
  return source ? `${source} product photo` : "Lookup product photo";
}

function formatLookupMeasurement(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? `${round2(value)} mm`
    : null;
}

function normalizeLookupText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9.\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLookupText(input: string): string {
  const trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    return decodeURIComponent(url.pathname)
      .split("/")
      .filter(Boolean)
      .at(-1)
      ?.replace(/\.[a-z0-9]+$/i, "")
      ?.replace(/[-_]+/g, " ")
      ?.trim() || trimmed;
  } catch {
    return trimmed;
  }
}

function tokenizeLookupText(value: string): string[] {
  return normalizeLookupText(value)
    .split(" ")
    .filter((token) => token.length >= 2);
}

const FLAT_LOOKUP_STOPWORDS = new Set([
  "com",
  "www",
  "http",
  "https",
  "item",
  "items",
  "product",
  "products",
  "warehouse",
  "shop",
  "store",
  "sale",
  "buy",
  "pack",
  "black",
  "fde",
  "odg",
  "gen",
  "m2",
  "moe",
  "round",
]);

const FLAT_LOOKUP_ALIASES: Record<string, string[]> = {
  "ss-plate-10in": ["plate", "dish", "dinner plate", "steel plate"],
  "ss-tray-12x8": ["tray", "serving tray", "steel tray"],
  "cutting-board-bamboo-12x8": ["cutting board", "board", "bamboo board", "charcuterie board"],
  "wood-charcuterie-14x10": ["charcuterie board", "serving board", "wood board"],
  "slate-coaster-4in": ["coaster", "round coaster", "slate coaster"],
  "slate-coaster-4in-square": ["square coaster", "slate square coaster"],
  "ceramic-tile-4x4": ["tile", "ceramic tile", "4x4 tile"],
  "dog-tag-ss": ["dog tag", "military tag", "tag"],
  "anodized-keychain": ["keychain", "key tag", "tag blank"],
  "business-card-aluminum": ["business card", "metal card", "wallet insert"],
  "business-card-ss": ["stainless business card", "metal business card", "wallet insert"],
  "phone-case-flat": ["phone case", "case", "iphone case", "galaxy case"],
  "ss-card-wallet": ["wallet insert", "metal wallet card", "card wallet"],
};

const FLAT_LOOKUP_FALLBACKS: Array<FlatBedItem & { lookupAliases: string[] }> = [
  {
    id: "fallback-polymer-rifle-magazine",
    label: "Polymer Rifle Magazine",
    category: "other",
    widthMm: 66,
    heightMm: 178,
    thicknessMm: 28,
    material: "plastic-abs",
    materialLabel: "Plastic - ABS",
    productHint: "magazine",
    notes: "Heuristic flat-item lookup. Verify physical dimensions before saving.",
    lookupAliases: ["pmag", "magpul", "magazine", "rifle magazine", "ar15 magazine", "stanag", "223", "556"],
  },
  {
    id: "fallback-pistol-magazine",
    label: "Pistol Magazine",
    category: "other",
    widthMm: 38,
    heightMm: 130,
    thicknessMm: 20,
    material: "plastic-abs",
    materialLabel: "Plastic - ABS",
    productHint: "magazine",
    notes: "Heuristic flat-item lookup. Verify physical dimensions before saving.",
    lookupAliases: ["pistol magazine", "glock magazine", "handgun mag", "9mm magazine", "magazine"],
  },
  {
    id: "fallback-knife-handle",
    label: "Knife Handle / Blade Blank",
    category: "other",
    widthMm: 32,
    heightMm: 118,
    thicknessMm: 6,
    material: "stainless-steel",
    materialLabel: "Stainless Steel",
    productHint: "knife",
    notes: "Heuristic flat-item lookup. Verify physical dimensions before saving.",
    lookupAliases: ["knife", "blade", "pocket knife", "folder", "edc knife"],
  },
];

function buildFlatLookupHaystack(item: FlatBedItem): string {
  const aliases = FLAT_LOOKUP_ALIASES[item.id] ?? [];
  return normalizeLookupText(
    `${item.label} ${item.materialLabel} ${item.material} ${item.category} ${item.productHint ?? ""} ${item.id} ${aliases.join(" ")}`,
  );
}

function scoreFlatLookupTokens(tokens: string[], haystack: string): number {
  if (tokens.length === 0) return 0;

  let score = 0;
  for (const token of tokens) {
    if (FLAT_LOOKUP_STOPWORDS.has(token)) continue;
    if (!haystack.includes(token)) continue;
    score += token.length >= 4 ? 1.4 : 0.7;
  }

  return score / Math.max(1, tokens.filter((token) => !FLAT_LOOKUP_STOPWORDS.has(token)).length);
}

function findFlatItemLookupMatch(input: string): FlatBedItem | null {
  const lookupTokens = tokenizeLookupText(extractLookupText(input));
  if (lookupTokens.length === 0) return null;

  let bestMatch: FlatBedItem | null = null;
  let bestScore = 0;

  for (const item of FLAT_BED_ITEMS) {
    const haystack = buildFlatLookupHaystack(item);
    const score = scoreFlatLookupTokens(lookupTokens, haystack);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = item;
    }
  }

  if (bestScore >= 0.72) return bestMatch;

  let bestFallback: FlatBedItem | null = null;
  let bestFallbackScore = 0;
  for (const fallback of FLAT_LOOKUP_FALLBACKS) {
    const haystack = normalizeLookupText(
      `${fallback.label} ${fallback.materialLabel} ${fallback.material} ${fallback.category} ${fallback.productHint ?? ""} ${fallback.lookupAliases.join(" ")}`,
    );
    const score = scoreFlatLookupTokens(lookupTokens, haystack);
    if (score > bestFallbackScore) {
      bestFallbackScore = score;
      bestFallback = fallback;
    }
  }

  return bestFallbackScore >= 0.6 ? bestFallback : null;
}

function inferLookupProductType(
  lookupText: string,
  result: TumblerItemLookupResponse,
): "tumbler" | "mug" | "bottle" | "flat" {
  const lower = lookupText.toLowerCase();
  if (/\bmug\b/.test(lower)) return "mug";
  if (/\bbottle\b|\bflask\b|\bcanteen\b/.test(lower)) return "bottle";
  if (
    result.matchedProfileId ||
    result.dimensions.outsideDiameterMm ||
    result.dimensions.topDiameterMm ||
    result.dimensions.bottomDiameterMm ||
    /\btumbler\b|\bquencher\b|\brambler\b|\biceflow\b|\btravel cup\b/.test(lower)
  ) {
    return "tumbler";
  }
  return "flat";
}

function getFlatModelStrategyLabel(strategy: FlatItemLookupResponse["modelStrategy"]): string {
  switch (strategy) {
    case "page-model":
      return "Source model";
    case "image-trace":
      return "Traced silhouette";
    case "family-generated":
    default:
      return "Proxy family shape";
  }
}

function getFlatLookupModeLabel(mode: FlatItemLookupResponse["mode"]): string {
  switch (mode) {
    case "catalog-match":
      return "Catalog match";
    case "family-fallback":
      return "Family fallback";
    case "metadata-fallback":
      return "Metadata match";
    case "safe-fallback":
    default:
      return "Safe fallback";
  }
}

function formatFlatTraceQuality(score: number | null | undefined): string | null {
  if (typeof score !== "number" || !Number.isFinite(score) || score <= 0) return null;
  const normalized = Math.max(0, Math.min(100, Math.round((score / 1.4) * 100)));
  return `${normalized}% trace quality`;
}

function getFlatLookupNotice(result: FlatItemLookupResponse): string | null {
  if (result.isProxy) {
    return "Proxy family shape only. Use it for rough preview and dimensions, then replace it with a real source model or a cleaner product photo before production.";
  }
  if (result.modelStrategy === "image-trace") {
    const quality = formatFlatTraceQuality(result.traceScore);
    return quality
      ? `Traced from a pulled product image. Review the outline before treating this model as final (${quality}).`
      : "Traced from a pulled product image. Review the outline before treating this model as final.";
  }
  return null;
}

function getFlatGlbStatusLabel(result: FlatItemLookupResponse | null): string | null {
  if (!result) return null;
  if (result.isProxy) return "Proxy model";
  if (result.requiresReview) return "Review model";
  return null;
}

function getDrinkwareGlbStatusLabel(
  status: ProductTemplate["glbStatus"] | null | undefined,
): string | null {
  switch (status) {
    case "verified-product-model":
      return "Verified product model";
    case "placeholder-model":
      return "Placeholder model";
    case "missing-model":
      return "Missing model";
    default:
      return null;
  }
}

function getPreviewModelModeLabel(args: {
  productType: ProductTemplate["productType"] | "" | null;
  mode: PreviewModelMode;
  glbStatus?: ProductTemplate["glbStatus"] | null;
}): string {
  if (args.productType === "flat") {
    return "SOURCE MODEL";
  }
  if (args.mode === "alignment-model") {
    return "ALIGNMENT MODEL · DEFAULT";
  }
  if (args.mode === "full-model") {
    return "FULL MODEL · VISUAL";
  }
  if (args.glbStatus === "placeholder-model") {
    return "PLACEHOLDER MODEL · COMPARE";
  }
  return "SOURCE MODEL · COMPARE";
}

function inferDrinkwareGlbStatus(args: {
  productType: ProductTemplate["productType"] | "" | null;
  glbPath: string;
  lookupResult: TumblerItemLookupResponse | null;
  editingTemplate?: ProductTemplate;
}): {
  status: ProductTemplate["glbStatus"];
  sourceLabel: string | null;
} | null {
  if (!args.productType || args.productType === "flat") return null;
  const trimmedPath = args.glbPath.trim();
  if (!trimmedPath) {
    if (args.lookupResult?.modelStatus === "placeholder-model") {
      return {
        status: "missing-model",
        sourceLabel: args.lookupResult.modelSourceLabel
          ? `${args.lookupResult.modelSourceLabel} is available as a fallback only and is not bound to this preview.`
          : "A placeholder model is available as a fallback only and is not bound to this preview.",
      };
    }
    if (args.editingTemplate?.glbStatus === "placeholder-model") {
      return {
        status: "missing-model",
        sourceLabel: args.editingTemplate.glbSourceLabel
          ? `${args.editingTemplate.glbSourceLabel} is saved as a fallback only and is not bound to this preview.`
          : "A placeholder model is saved as a fallback only and is not bound to this preview.",
      };
    }
    if (args.lookupResult?.modelStatus) {
      return {
        status: args.lookupResult.modelStatus,
        sourceLabel: args.lookupResult.modelSourceLabel ?? null,
      };
    }
    if (args.editingTemplate?.glbStatus) {
      return {
        status: args.editingTemplate.glbStatus,
        sourceLabel: args.editingTemplate.glbSourceLabel ?? null,
      };
    }
    return {
      status: "missing-model",
      sourceLabel: "No product model is attached yet.",
    };
  }

  if (args.lookupResult?.glbPath?.trim() === trimmedPath) {
    return {
      status: args.lookupResult.modelStatus ?? "verified-product-model",
      sourceLabel: args.lookupResult.modelSourceLabel ?? null,
    };
  }

  if (args.editingTemplate?.glbPath?.trim() === trimmedPath) {
    return {
      status: args.editingTemplate.glbStatus ?? "verified-product-model",
      sourceLabel: args.editingTemplate.glbSourceLabel ?? null,
    };
  }

  if (/\/models\/templates\/40oz-yeti\.glb$/i.test(trimmedPath)) {
    return {
      status: "placeholder-model",
      sourceLabel: "Generic 40oz tumbler placeholder",
    };
  }

  return {
    status: trimmedPath.startsWith("/models/generated/")
      ? "verified-product-model"
      : "verified-product-model",
    sourceLabel: trimmedPath.startsWith("/models/generated/")
      ? "Generated product-specific model"
      : "Resolved model file",
  };
}

function inferTemplateMaterial(
  editingTemplate: ProductTemplate | undefined,
  flatLookupMatch: FlatBedItem | null,
  flatLookupResult: FlatItemLookupResponse | null,
  resolvedMaterialSlug: string,
  resolvedMaterialLabel: string,
  materialProfileId: string,
): Pick<ProductTemplate, "materialSlug" | "materialLabel"> {
  if (flatLookupMatch) {
    return {
      materialSlug: flatLookupMatch.material,
      materialLabel: flatLookupMatch.materialLabel,
    };
  }

  if (flatLookupResult?.material) {
    return {
      materialSlug: flatLookupResult.material,
      materialLabel: flatLookupResult.materialLabel,
    };
  }

  if (resolvedMaterialSlug || resolvedMaterialLabel) {
    return {
      materialSlug: resolvedMaterialSlug || editingTemplate?.materialSlug,
      materialLabel: resolvedMaterialLabel || editingTemplate?.materialLabel,
    };
  }

  const materialProfile = getMaterialProfileById(materialProfileId);
  if (materialProfile) {
    switch (materialProfile.finishType) {
      case "powder-coat":
        return { materialSlug: "powder-coat", materialLabel: "Powder Coat" };
      case "raw-stainless":
        return { materialSlug: "stainless-steel", materialLabel: "Stainless Steel" };
      case "painted":
        return { materialSlug: "painted-metal", materialLabel: "Painted Metal" };
      case "anodized":
        return { materialSlug: "anodized-aluminum", materialLabel: "Anodized Aluminum" };
      case "chrome-plated":
        return { materialSlug: "painted-metal", materialLabel: "Chrome-Plated Metal" };
      case "matte-finish":
        return { materialSlug: "painted-metal", materialLabel: "Matte Finish Metal" };
      default:
        break;
    }
  }

  return {
    materialSlug: editingTemplate?.materialSlug,
    materialLabel: editingTemplate?.materialLabel,
  };
}

function parseCapacityOzValue(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/([0-9]+(?:\.[0-9]+)?)\s*oz/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

const LOCKED_WRAP_DIAMETER_TOLERANCE_MM = 0.5;

export const TemplateCreateForm = React.forwardRef<TemplateCreateFormHandle, Props>(function TemplateCreateForm(
  { onSave, onCancel, editingTemplate, showActions = true }: Props,
  ref,
) {
  type TemplateLaserType = ProductTemplate["laserType"] | "";
  type TemplateProductType = ProductTemplate["productType"] | "";
  const isEdit = Boolean(editingTemplate);
  const derivedEditingDims = React.useMemo(
    () => (editingTemplate ? getEngravableDimensions(editingTemplate) : null),
    [editingTemplate],
  );
  const editingMatchedProfile = React.useMemo(() => {
    if (!editingTemplate || editingTemplate.productType === "flat") return null;
    const profileId = findTumblerProfileIdForBrandModel({
      brand: editingTemplate.brand,
      model: editingTemplate.name,
      capacityOz: parseCapacityOzValue(editingTemplate.capacity),
    });
    return profileId ? getTumblerProfileById(profileId) : null;
  }, [editingTemplate]);
  const editingHasExplicitMargins =
    editingTemplate?.dimensions.topMarginMm != null ||
    editingTemplate?.dimensions.bottomMarginMm != null;
  const editingBodyDiameterMm =
    editingTemplate?.productType === "flat"
      ? 0
      : (editingTemplate ? getTemplateBodyDiameterMm(editingTemplate) : 0);
  const editingTopOuterDiameterMm =
    editingTemplate?.productType === "flat"
      ? 0
      : (
          editingTemplate
            ? (getTemplateTopOuterDiameterMm(editingTemplate) ??
              editingMatchedProfile?.topDiameterMm ??
              getTemplateBodyDiameterMm(editingTemplate))
            : 0
        );
  const editingBaseDiameterMm =
    editingTemplate?.productType === "flat"
      ? 0
      : (
          editingTemplate
            ? (getTemplateBaseDiameterMm(editingTemplate) ??
              editingMatchedProfile?.bottomDiameterMm ??
              getTemplateBodyDiameterMm(editingTemplate))
            : 0
        );

  // ── Product identity ─────────────────────────────────────────────
  const [name, setName] = React.useState(editingTemplate?.name ?? "");
  const [brand, setBrand] = React.useState(editingTemplate?.brand ?? "");
  const [capacity, setCapacity] = React.useState(editingTemplate?.capacity ?? "");
  const [laserType, setLaserType] = React.useState<TemplateLaserType>(
    editingTemplate?.laserType ?? ""
  );
  const [productType, setProductType] = React.useState<TemplateProductType>(
    editingTemplate?.productType ?? ""
  );
  const [resolvedMaterialSlug, setResolvedMaterialSlug] = React.useState(editingTemplate?.materialSlug ?? "");
  const [resolvedMaterialLabel, setResolvedMaterialLabel] = React.useState(editingTemplate?.materialLabel ?? "");

  // ── Files ────────────────────────────────────────────────────────
  const [thumbDataUrl, setThumbDataUrl] = React.useState(editingTemplate?.thumbnailDataUrl ?? "");
  const [glbPath, setGlbPath] = React.useState(editingTemplate?.glbPath ?? "");
  const [glbFileName, setGlbFileName] = React.useState<string | null>(null);
  const [glbUploading, setGlbUploading] = React.useState(false);
  const [glbUploadError, setGlbUploadError] = React.useState<string | null>(null);
  const [checkingGlbPath, setCheckingGlbPath] = React.useState(false);
  const [previewModelFile, setPreviewModelFile] = React.useState<File | null>(null);
  const [previewLoadError, setPreviewLoadError] = React.useState<string | null>(null);
  const [productImageFile, setProductImageFile] = React.useState<File | null>(null);
  const [productImageLabel, setProductImageLabel] = React.useState<string | null>(
    editingTemplate?.productPhotoFullUrl ? "Saved product photo" : null,
  );
  const [productPhotoFullUrl, setProductPhotoFullUrl] = React.useState(editingTemplate?.productPhotoFullUrl ?? "");
  const [manufacturerLogoStamp, setManufacturerLogoStamp] = React.useState(
    editingTemplate?.manufacturerLogoStamp,
  );
  const [detectedManufacturerLogoStamp, setDetectedManufacturerLogoStamp] = React.useState(
    editingTemplate?.manufacturerLogoStamp,
  );

  // ── Auto-detect ──────────────────────────────────────────────────
  const [detecting, setDetecting] = React.useState(false);
  const [detectResult, setDetectResult] = React.useState<AutoDetectResult | null>(null);
  const [detectError, setDetectError] = React.useState<string | null>(null);
  const [lookupInput, setLookupInput] = React.useState("");
  const [lookingUpItem, setLookingUpItem] = React.useState(false);
  const [lookupResult, setLookupResult] = React.useState<TumblerItemLookupResponse | null>(null);
  const [flatLookupResult, setFlatLookupResult] = React.useState<FlatItemLookupResponse | null>(null);
  const [flatLookupMatch, setFlatLookupMatch] = React.useState<FlatBedItem | null>(null);
  const [lookupError, setLookupError] = React.useState<string | null>(null);
  const [lookupDebugImageUrl, setLookupDebugImageUrl] = React.useState("");
  const [batchImportUrl, setBatchImportUrl] = React.useState("");
  const [isBatchImporting, setIsBatchImporting] = React.useState(false);
  const [batchImportStatus, setBatchImportStatus] = React.useState<string | null>(null);
  const [batchImportError, setBatchImportError] = React.useState<string | null>(null);
  const [batchImportSummary, setBatchImportSummary] = React.useState<CatalogBatchImportSummary | null>(null);
  const batchImportDisabledReason = React.useMemo(() => {
    if (!CATALOG_BATCH_IMPORT_AVAILABLE) {
      return "Catalog batch import is scaffolded but not available in this build yet.";
    }
    if (!batchImportUrl.trim()) {
      return "Paste an official catalog or collection URL first.";
    }
    return null;
  }, [batchImportUrl]);
  const [smartLookupApplied, setSmartLookupApplied] = React.useState(false);
  const clearLookupState = React.useCallback((options?: { keepInput?: boolean; clearFamilyKey?: boolean }) => {
    autoZoneSignatureRef.current = "";
    bodyOutlineSeedSignatureRef.current = "";
    setLookupResult(null);
    setFlatLookupResult(null);
    setFlatLookupMatch(null);
    setLookupError(null);
    setLookupDebugImageUrl("");
    if (options?.clearFamilyKey) {
      setFlatFamilyKey("");
    }
    if (!options?.keepInput) {
      setLookupInput("");
    }
  }, []);

  // ── Dimensions ───────────────────────────────────────────────────
  const [diameterMm, setDiameterMm] = React.useState(editingBodyDiameterMm);
  const [wrapWidthInputMm, setWrapWidthInputMm] = React.useState(
    editingTemplate?.productType === "flat"
      ? 0
      : round2(
          editingTemplate?.dimensions.templateWidthMm && editingTemplate.dimensions.templateWidthMm > 0
            ? editingTemplate.dimensions.templateWidthMm
            : Math.PI * editingBodyDiameterMm,
        ),
  );
  const [advancedGeometryOverridesUnlocked, setAdvancedGeometryOverridesUnlocked] = React.useState(
    editingTemplate?.dimensions.advancedGeometryOverridesUnlocked ?? false,
  );
  const [topOuterDiameterMm, setTopOuterDiameterMm] = React.useState(editingTopOuterDiameterMm);
  const [baseDiameterMm, setBaseDiameterMm] = React.useState(editingBaseDiameterMm);
  const [flatWidthMm, setFlatWidthMm] = React.useState(
    editingTemplate?.productType === "flat" ? editingTemplate.dimensions.templateWidthMm : 0,
  );
  const [flatThicknessMm, setFlatThicknessMm] = React.useState(
    editingTemplate?.productType === "flat" ? (editingTemplate.dimensions.flatThicknessMm ?? 0) : 0,
  );
  const [flatFamilyKey, setFlatFamilyKey] = React.useState(
    editingTemplate?.productType === "flat"
      ? inferFlatFamilyKey({
          familyKey: editingTemplate.dimensions.flatFamilyKey,
          glbPath: editingTemplate.glbPath,
          label: editingTemplate.name,
        })
      : "",
  );
  const [printHeightMm, setPrintHeightMm] = React.useState(
    editingTemplate
      ? (!editingHasExplicitMargins && derivedEditingDims
          ? derivedEditingDims.engravableHeightMm
          : editingTemplate.dimensions.printHeightMm)
      : 0,
  );
  const [handleArcDeg, setHandleArcDeg] = React.useState(() => {
    const saved = editingTemplate?.dimensions.handleArcDeg;
    if (saved != null) return saved;
    return 0;
  });
  const [taperCorrection, setTaperCorrection] = React.useState<"none" | "top-narrow" | "bottom-narrow">(
    editingTemplate?.dimensions.taperCorrection ?? "none"
  );
  const [overallHeightMm, setOverallHeightMm] = React.useState(
    editingTemplate?.dimensions.overallHeightMm ?? derivedEditingDims?.totalHeightMm ?? 0,
  );
  const [bodyTopFromOverallMm, setBodyTopFromOverallMm] = React.useState(
    editingTemplate?.dimensions.bodyTopFromOverallMm ?? derivedEditingDims?.bodyTopOffsetMm ?? 0,
  );
  const [bodyBottomFromOverallMm, setBodyBottomFromOverallMm] = React.useState(
    editingTemplate?.dimensions.bodyBottomFromOverallMm ??
      (
        derivedEditingDims?.bodyBottomOffsetMm ??
        (editingTemplate?.dimensions.overallHeightMm != null && editingTemplate?.dimensions.bottomMarginMm != null
          ? editingTemplate.dimensions.overallHeightMm - editingTemplate.dimensions.bottomMarginMm
          : 0)
      ),
  );
  const [lidSeamFromOverallMm, setLidSeamFromOverallMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.lidSeamFromOverallMm,
  );
  const [silverBandBottomFromOverallMm, setSilverBandBottomFromOverallMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.silverBandBottomFromOverallMm,
  );
  const [printableSurfaceDetection, setPrintableSurfaceDetection] = React.useState<PrintableSurfaceDetection | null>(null);
  const [printableTopOverrideMm, setPrintableTopOverrideMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.printableTopOverrideMm,
  );
  const [printableBottomOverrideMm, setPrintableBottomOverrideMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.printableBottomOverrideMm,
  );
  const autoSeededBandDetectionKeyRef = React.useRef<string | null>(null);
  const [handleTopFromOverallMm, setHandleTopFromOverallMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.handleTopFromOverallMm,
  );
  const [handleBottomFromOverallMm, setHandleBottomFromOverallMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.handleBottomFromOverallMm,
  );
  const [handleReachMm, setHandleReachMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.handleReachMm,
  );
  const [handleUpperCornerFromOverallMm, setHandleUpperCornerFromOverallMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.handleUpperCornerFromOverallMm,
  );
  const [handleLowerCornerFromOverallMm, setHandleLowerCornerFromOverallMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.handleLowerCornerFromOverallMm,
  );
  const [handleUpperCornerReachMm, setHandleUpperCornerReachMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.handleUpperCornerReachMm,
  );
  const [handleLowerCornerReachMm, setHandleLowerCornerReachMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.handleLowerCornerReachMm,
  );
  const [handleUpperTransitionReachMm, setHandleUpperTransitionReachMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.handleUpperTransitionReachMm,
  );
  const [handleLowerTransitionReachMm, setHandleLowerTransitionReachMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.handleLowerTransitionReachMm,
  );
  const [handleUpperTransitionFromOverallMm, setHandleUpperTransitionFromOverallMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.handleUpperTransitionFromOverallMm,
  );
  const [handleLowerTransitionFromOverallMm, setHandleLowerTransitionFromOverallMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.handleLowerTransitionFromOverallMm,
  );
  const [handleOuterTopFromOverallMm, setHandleOuterTopFromOverallMm] = React.useState<number | undefined>(
    undefined,
  );
  const [handleOuterBottomFromOverallMm, setHandleOuterBottomFromOverallMm] = React.useState<number | undefined>(
    undefined,
  );
  const [handleTubeDiameterMm, setHandleTubeDiameterMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.handleTubeDiameterMm,
  );
  const [handleSpanMm, setHandleSpanMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.handleSpanMm,
  );
  const [canonicalHandleProfile, setCanonicalHandleProfile] = React.useState<CanonicalHandleProfile | undefined>(
    editingTemplate?.dimensions.canonicalHandleProfile,
  );
  const canonicalHandleProfileRef = React.useRef<CanonicalHandleProfile | undefined>(
    editingTemplate?.dimensions.canonicalHandleProfile,
  );
  React.useEffect(() => {
    canonicalHandleProfileRef.current = canonicalHandleProfile;
  }, [canonicalHandleProfile]);
  const commitCanonicalHandleProfile = React.useCallback((next: CanonicalHandleProfile | undefined) => {
    if (canonicalHandleProfilesEqual(canonicalHandleProfileRef.current, next)) return;
    canonicalHandleProfileRef.current = next;
    setCanonicalHandleProfile((current) => (canonicalHandleProfilesEqual(current, next) ? current : next));
  }, []);
  const [shoulderDiameterMm, setShoulderDiameterMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.shoulderDiameterMm,
  );
  const [taperUpperDiameterMm, setTaperUpperDiameterMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.taperUpperDiameterMm,
  );
  const [taperLowerDiameterMm, setTaperLowerDiameterMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.taperLowerDiameterMm,
  );
  const [bevelDiameterMm, setBevelDiameterMm] = React.useState<number | undefined>(
    editingTemplate?.dimensions.bevelDiameterMm,
  );
  const [bodyOutlineProfile, setBodyOutlineProfile] = React.useState<EditableBodyOutline | undefined>(
    resolveReferencePaths(editingTemplate?.dimensions).bodyOutline ?? undefined,
  );
  const [referencePaths, setReferencePaths] = React.useState<ReferencePaths>(
    resolveReferencePaths(editingTemplate?.dimensions),
  );
  const [referenceLayerState, setReferenceLayerState] = React.useState<ReferenceLayerState>(
    resolveReferenceLayerState(editingTemplate?.dimensions),
  );
  const [topMarginMm, setTopMarginMm] = React.useState(
    editingTemplate?.dimensions.topMarginMm ?? derivedEditingDims?.topMarginMm ?? 0,
  );
  const [bottomMarginMm, setBottomMarginMm] = React.useState(
    editingTemplate?.dimensions.bottomMarginMm ?? derivedEditingDims?.bottomMarginMm ?? 0,
  );
  const activeFlatLookupModel = React.useMemo(() => {
    if (productType !== "flat" || !flatLookupResult) return null;
    const trimmedLookupPath = flatLookupResult.glbPath.trim();
    const trimmedActivePath = glbPath.trim();
    if (!trimmedLookupPath || trimmedLookupPath !== trimmedActivePath) return null;
    return flatLookupResult;
  }, [flatLookupResult, glbPath, productType]);
  const activeDrinkwareGlbStatus = React.useMemo(() => inferDrinkwareGlbStatus({
    productType,
    glbPath,
    lookupResult,
    editingTemplate,
  }), [editingTemplate, glbPath, lookupResult, productType]);
  const resolvedDrinkwarePreviewModelUrl = React.useMemo(() => {
    if (productType === "flat") {
      return glbPath.trim() || undefined;
    }
    if (activeDrinkwareGlbStatus?.status !== "verified-product-model") {
      return undefined;
    }
    return glbPath.trim() || undefined;
  }, [activeDrinkwareGlbStatus?.status, glbPath, productType]);
  const [previewModelMode, setPreviewModelMode] = React.useState<PreviewModelMode>(
    productType !== "flat" ? "alignment-model" : "source-traced",
  );
  const currentMatchedProfile = React.useMemo(() => {
    if (productType === "flat") return null;
    const profileId =
      lookupResult?.matchedProfileId ??
      findTumblerProfileIdForBrandModel({
        brand,
        model: name,
        capacityOz: parseCapacityOzValue(capacity),
      });
    return profileId ? getTumblerProfileById(profileId) : null;
  }, [brand, capacity, lookupResult?.matchedProfileId, name, productType]);
  const previewModeUserSelectedRef = React.useRef(false);
  const handlePreviewModelModeChange = React.useCallback((nextMode: PreviewModelMode) => {
    previewModeUserSelectedRef.current = true;
    setPreviewModelMode(nextMode);
  }, []);
  const legacyReferencePhotoScalePct = editingTemplate?.dimensions.referencePhotoScalePct ?? 100;
  const [referencePhotoWidthScalePct, setReferencePhotoWidthScalePct] = React.useState(
    editingTemplate?.dimensions.referencePhotoWidthScalePct ?? legacyReferencePhotoScalePct,
  );
  const [referencePhotoHeightScalePct, setReferencePhotoHeightScalePct] = React.useState(
    editingTemplate?.dimensions.referencePhotoHeightScalePct ?? legacyReferencePhotoScalePct,
  );
  const [referencePhotoLockAspect, setReferencePhotoLockAspect] = React.useState(
    editingTemplate?.dimensions.referencePhotoLockAspect ?? true,
  );
  const [referencePhotoOffsetXPct, setReferencePhotoOffsetXPct] = React.useState(
    editingTemplate?.dimensions.referencePhotoOffsetXPct ?? 0,
  );
  const [referencePhotoOffsetYPct, setReferencePhotoOffsetYPct] = React.useState(
    editingTemplate?.dimensions.referencePhotoOffsetYPct ?? 0,
  );
  const [referencePhotoAnchorY, setReferencePhotoAnchorY] = React.useState<"center" | "bottom">(
    editingTemplate?.dimensions.referencePhotoAnchorY ?? "center",
  );
  const [referencePhotoCenterMode, setReferencePhotoCenterMode] = React.useState<"body" | "photo">(
    editingTemplate?.dimensions.referencePhotoCenterMode ?? "body",
  );
  const [bodyColorHex, setBodyColorHex] = React.useState(
    editingTemplate?.dimensions.bodyColorHex ?? "#b0b8c4",
  );
  const [lidColorHex, setLidColorHex] = React.useState(
    editingTemplate?.dimensions.lidColorHex ?? editingTemplate?.dimensions.bodyColorHex ?? "#b0b8c4",
  );
  const [rimColorHex, setRimColorHex] = React.useState(
    editingTemplate?.dimensions.rimColorHex ?? "#d0d0d0",
  );

  const lockedProductionGeometry = productType !== "flat" && !advancedGeometryOverridesUnlocked;
  const derivedCylinderDiameterMm = productType === "flat"
    ? 0
    : (wrapWidthInputMm > 0 ? round2(wrapWidthInputMm / Math.PI) : 0);
  const effectiveCylinderDiameterMm = productType === "flat"
    ? 0
    : (lockedProductionGeometry ? derivedCylinderDiameterMm : round2(diameterMm));
  const templateWidthMm = productType === "flat"
    ? round2(flatWidthMm)
    : round2(
        lockedProductionGeometry
          ? wrapWidthInputMm
          : (diameterMm > 0 ? Math.PI * diameterMm : wrapWidthInputMm),
      );
  const liveFlatPreview = React.useMemo<FlatPreviewDimensions | null>(() => {
    if (productType !== "flat" || flatWidthMm <= 0 || printHeightMm <= 0) return null;
    return {
      widthMm: round2(flatWidthMm),
      heightMm: round2(printHeightMm),
      thicknessMm: round2(flatThicknessMm > 0 ? flatThicknessMm : 4),
      familyKey: inferFlatFamilyKey({
        familyKey: flatFamilyKey,
        glbPath,
        label: name.trim(),
      }),
      label: name.trim() || "Flat item",
      material: flatLookupResult?.material ?? flatLookupMatch?.material ?? "",
    };
  }, [productType, flatWidthMm, printHeightMm, flatThicknessMm, flatFamilyKey, glbPath, name, flatLookupResult?.material, flatLookupMatch?.material]);
  React.useEffect(() => {
    if (productType === "flat" || !lockedProductionGeometry) return;
    if (wrapWidthInputMm <= 0 && diameterMm > 0) {
      setWrapWidthInputMm(round2(Math.PI * diameterMm));
      return;
    }
    if (derivedCylinderDiameterMm > 0 && Math.abs(diameterMm - derivedCylinderDiameterMm) > 0.01) {
      setDiameterMm(derivedCylinderDiameterMm);
    }
  }, [derivedCylinderDiameterMm, diameterMm, lockedProductionGeometry, productType, wrapWidthInputMm]);
  React.useEffect(() => {
    setReferencePaths((current) => createReferencePaths({
      bodyOutline: bodyOutlineProfile ?? current.bodyOutline,
      lidProfile: current.lidProfile,
      silverProfile: current.silverProfile,
    }));
  }, [bodyOutlineProfile]);
  const preferGeneratedFlatPreview =
    productType === "flat" &&
    Boolean(glbPath.trim()) &&
    glbPath.startsWith("/models/generated/");

  // ── Laser settings (scoped defaults based on product/laser type) ──
  const scopedDefaults = React.useMemo(
    () => (
      productType && laserType
        ? getDefaultLaserSettings(productType, laserType)
        : { power: 50, speed: 300, frequency: 30, lineInterval: 0.06 }
    ),
    [productType, laserType],
  );
  const [power, setPower] = React.useState(editingTemplate?.laserSettings.power ?? scopedDefaults.power);
  const [speed, setSpeed] = React.useState(editingTemplate?.laserSettings.speed ?? scopedDefaults.speed);
  const [frequency, setFrequency] = React.useState(editingTemplate?.laserSettings.frequency ?? scopedDefaults.frequency);
  const [lineInterval, setLineInterval] = React.useState(editingTemplate?.laserSettings.lineInterval ?? scopedDefaults.lineInterval);
  const [materialProfileId, setMaterialProfileId] = React.useState(editingTemplate?.laserSettings.materialProfileId ?? "");
  const materialProfileTouchedRef = React.useRef(Boolean(editingTemplate?.laserSettings.materialProfileId));

  const applyMaterialProfileSettings = React.useCallback((
    nextMaterialProfileId: string,
    nextLaserType?: TemplateLaserType | null,
    nextProductType?: TemplateProductType | null,
  ) => {
    setMaterialProfileId(nextMaterialProfileId);
    if (!nextMaterialProfileId) return;

    const materialProfile = getMaterialProfileById(nextMaterialProfileId);
    if (!materialProfile) return;

    const resolvedProductType = (nextProductType || productType || "tumbler") as ProductTemplate["productType"];
    const resolvedLaserType = (nextLaserType || materialProfile.laserType) as ProductTemplate["laserType"];
    if (!nextLaserType) {
      setLaserType(materialProfile.laserType);
    }
    const scoped = resolvedLaserType
      ? getDefaultLaserSettings(resolvedProductType, resolvedLaserType)
      : null;

    setPower(materialProfile.powerPct);
    setSpeed(materialProfile.speedMmS);
    setLineInterval(lineIntervalFromLpi(materialProfile.lpi));
    if (scoped) {
      setFrequency(scoped.frequency);
    }
  }, [productType]);

  const applyResolvedDrinkwareMaterial = React.useCallback((args: {
    laserType?: TemplateLaserType | null;
    productType?: TemplateProductType | null;
    explicitFinishType?: TumblerFinish | null;
    materialSlug?: string | null;
    materialLabel?: string | null;
    bodyColorHex?: string | null;
    rimColorHex?: string | null;
    textHints?: Array<string | null | undefined>;
  }) => {
    const materialSetup = resolveTumblerMaterialSetup({
      laserType: (args.laserType || null) as ProductTemplate["laserType"] | null,
      explicitFinishType: args.explicitFinishType ?? null,
      materialSlug: args.materialSlug ?? null,
      materialLabel: args.materialLabel ?? null,
      bodyColorHex: args.bodyColorHex ?? null,
      rimColorHex: args.rimColorHex ?? null,
      textHints: args.textHints,
    });

    if (materialSetup.laserType) {
      setLaserType(materialSetup.laserType);
    }
    setResolvedMaterialSlug(materialSetup.materialSlug ?? "");
    setResolvedMaterialLabel(materialSetup.materialLabel ?? "");
    applyMaterialProfileSettings(
      materialSetup.materialProfileId ?? "",
      materialSetup.laserType,
      args.productType ?? productType,
    );
  }, [applyMaterialProfileSettings, productType]);

  // When product type or laser type changes, update laser settings to new scoped defaults
  // (only for new templates — edits keep their values)
  React.useEffect(() => {
    if (isEdit || !productType || !laserType || materialProfileId) return;
    const defaults = getDefaultLaserSettings(productType, laserType);
    setPower(defaults.power);
    setSpeed(defaults.speed);
    setFrequency(defaults.frequency);
    setLineInterval(defaults.lineInterval);
  }, [productType, laserType, isEdit, materialProfileId]);

  // ── Tumbler mapping ─────────────────────────────────────────────
  const [tumblerMapping, setTumblerMapping] = React.useState<TumblerMapping | undefined>(
    editingTemplate?.tumblerMapping,
  );
  const [showMappingWizard, setShowMappingWizard] = React.useState(false);
  const handleAutoSampleColors = React.useCallback((nextBody: string, nextLid: string, nextRim: string) => {
    setBodyColorHex((prev) => (prev === nextBody ? prev : nextBody));
    setLidColorHex((prev) => (prev === nextLid ? prev : nextLid));
    setRimColorHex((prev) => (prev === nextRim ? prev : nextRim));
    if (!materialProfileTouchedRef.current && productType && productType !== "flat") {
      applyResolvedDrinkwareMaterial({
        laserType,
        productType,
        materialSlug: resolvedMaterialSlug || null,
        materialLabel: resolvedMaterialLabel || null,
        bodyColorHex: nextBody,
        rimColorHex: nextRim,
        textHints: [name, brand, capacity],
      });
    }
  }, [
    applyResolvedDrinkwareMaterial,
    brand,
    capacity,
    lidColorHex,
    laserType,
    name,
    productType,
    resolvedMaterialLabel,
    resolvedMaterialSlug,
  ]);

  const validateGlbPath = React.useCallback(async (candidate: string) => {
    const trimmed = candidate.trim();
    if (!trimmed) return false;
    try {
      const res = await fetch(trimmed, { method: "HEAD" });
      return res.ok || res.status === 405;
    } catch {
      return false;
    }
  }, []);

  const clearMissingGlbPath = React.useCallback((candidate: string) => {
    setGlbFileName(null);
    setGlbPath("");
    setShowMappingWizard(false);
    setGlbUploadError(`Model file not found: ${candidate}`);
  }, []);

  const verifyCurrentGlbPath = React.useCallback(async (options?: { clearOnMissing?: boolean }) => {
    const trimmed = glbPath.trim();
    if (!trimmed) return false;

    setCheckingGlbPath(true);
    const ok = await validateGlbPath(trimmed);
    setCheckingGlbPath(false);

    if (ok) {
      setGlbUploadError((prev) => (
        prev && prev.startsWith("Model file not found:") ? null : prev
      ));
      return true;
    }

    if (options?.clearOnMissing !== false) {
      clearMissingGlbPath(trimmed);
    } else {
      setGlbUploadError(`Model file not found: ${trimmed}`);
    }
    return false;
  }, [clearMissingGlbPath, glbPath, validateGlbPath]);

  React.useEffect(() => {
    if (!editingTemplate?.glbPath) return;
    let cancelled = false;
    setCheckingGlbPath(true);
    validateGlbPath(editingTemplate.glbPath)
      .then((ok) => {
        if (cancelled) return;
        if (!ok && glbPath.trim() === editingTemplate.glbPath.trim()) {
          clearMissingGlbPath(editingTemplate.glbPath);
        }
      })
      .finally(() => {
        if (!cancelled) setCheckingGlbPath(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clearMissingGlbPath, editingTemplate?.glbPath, glbPath, validateGlbPath]);

  React.useEffect(() => {
    const trimmed = glbPath.trim();
    if (!trimmed || !/\.(glb|gltf)$/i.test(trimmed)) {
      setPreviewModelFile(null);
      setPreviewLoadError(null);
      return;
    }
    setPreviewModelFile(null);
    setPreviewLoadError(null);
  }, [glbPath]);

  // ── Front / Back face photos ──────────────────────────────────
  const [frontPhotoDataUrl, setFrontPhotoDataUrl] = React.useState(editingTemplate?.frontPhotoDataUrl ?? "");
  const [backPhotoDataUrl, setBackPhotoDataUrl] = React.useState(editingTemplate?.backPhotoDataUrl ?? "");
  const [frontOriginalUrl, setFrontOriginalUrl] = React.useState("");
  const [backOriginalUrl, setBackOriginalUrl] = React.useState("");
  const [frontCleanUrl, setFrontCleanUrl] = React.useState("");
  const [backCleanUrl, setBackCleanUrl] = React.useState("");
  const [bodyReferencePhotoDataUrl, setBodyReferencePhotoDataUrl] = React.useState("");
  const [productReferenceSet, setProductReferenceSet] = React.useState<ProductReferenceSet | undefined>(
    editingTemplate?.productReferenceSet,
  );
  const [frontBgStatus, setFrontBgStatus] = React.useState<"idle" | "processing" | "done" | "failed">("idle");
  const [backBgStatus, setBackBgStatus] = React.useState<"idle" | "processing" | "done" | "failed">("idle");
  const [outlineAssistStatus, setOutlineAssistStatus] = React.useState<"idle" | "processing" | "done" | "failed">("idle");
  const [outlineAssistNote, setOutlineAssistNote] = React.useState<string | null>(null);
  const [logoAssistStatus, setLogoAssistStatus] = React.useState<"idle" | "processing" | "done" | "failed">("idle");
  const [logoAssistNote, setLogoAssistNote] = React.useState<string | null>(null);
  const [frontUseOriginal, setFrontUseOriginal] = React.useState(false);
  const [backUseOriginal, setBackUseOriginal] = React.useState(false);
  const [mirrorForBack, setMirrorForBack] = React.useState(false);
  const autoZoneSignatureRef = React.useRef<string>("");
  const bodyOutlineSeedSignatureRef = React.useRef<string>("");
  const manufacturerLogoSignatureRef = React.useRef<string>("");
  const referenceSelection = productReferenceSet?.canonicalViewSelection;
  const referenceImagesById = React.useMemo(() => {
    const nextMap = new Map<string, ProductReferenceSet["images"][number]>();
    for (const image of productReferenceSet?.images ?? []) {
      nextMap.set(image.id, image);
    }
    return nextMap;
  }, [productReferenceSet]);
  const canonicalFrontReferenceImage = referenceSelection?.canonicalFrontImageId
    ? (referenceImagesById.get(referenceSelection.canonicalFrontImageId) ?? null)
    : null;
  const traceDebugReferenceImage = React.useMemo(() => {
    const identity = normalizeImageIdentity(flatLookupResult?.traceDebug?.sourceImageUrl);
    if (!identity) return null;
    for (const image of referenceImagesById.values()) {
      if (normalizeImageIdentity(image.url) === identity) {
        return image;
      }
    }
    return null;
  }, [flatLookupResult?.traceDebug?.sourceImageUrl, referenceImagesById]);
  const preferredBodyReferenceImage =
    !lookupResult?.fitDebug &&
    flatLookupResult?.traceDebug?.accepted &&
    traceDebugReferenceImage
      ? traceDebugReferenceImage
      : canonicalFrontReferenceImage;
  const resolvedCalibrationHandleSide = React.useMemo<"left" | "right" | null>(() => {
    const candidates = [
      lookupResult?.fitDebug?.handleSide,
      preferredBodyReferenceImage?.handleSide,
      canonicalFrontReferenceImage?.handleSide,
      canonicalHandleProfile?.side,
    ];
    for (const candidate of candidates) {
      if (candidate === "left" || candidate === "right") return candidate;
    }
    return null;
  }, [
    canonicalFrontReferenceImage?.handleSide,
    canonicalHandleProfile?.side,
    lookupResult?.fitDebug?.handleSide,
    preferredBodyReferenceImage?.handleSide,
  ]);
  const normalizedCanonicalHandleProfile = React.useMemo<CanonicalHandleProfile | undefined>(() => {
    if (!canonicalHandleProfile) return undefined;
    if (!resolvedCalibrationHandleSide || canonicalHandleProfile.side === resolvedCalibrationHandleSide) {
      return canonicalHandleProfile;
    }
    return {
      ...canonicalHandleProfile,
      side: resolvedCalibrationHandleSide,
    };
  }, [canonicalHandleProfile, resolvedCalibrationHandleSide]);
  const activeReferencePhotoDataUrl = React.useMemo(
    () => bodyReferencePhotoDataUrl || frontCleanUrl || frontPhotoDataUrl || productPhotoFullUrl || "",
    [bodyReferencePhotoDataUrl, frontCleanUrl, frontPhotoDataUrl, productPhotoFullUrl],
  );
  React.useEffect(() => {
    if (productType === "flat" || !activeReferencePhotoDataUrl) {
      setPrintableSurfaceDetection(null);
    }
  }, [activeReferencePhotoDataUrl, productType]);
  const activeBodyReferenceOutline = React.useMemo(
    () => referencePaths.bodyOutline ?? bodyOutlineProfile ?? null,
    [bodyOutlineProfile, referencePaths.bodyOutline],
  );
  const activeBodyReferenceOutlineSignature = React.useMemo(
    () => buildSourceContourSignature(activeBodyReferenceOutline),
    [activeBodyReferenceOutline],
  );
  const handleSyncBodyReferenceOutline = React.useMemo(
    () => activeBodyReferenceOutline,
    [activeBodyReferenceOutlineSignature],
  );
  const calibrationBodyOutline = React.useMemo<EditableBodyOutline | null>(() => {
    if (productType === "flat" || overallHeightMm <= 0 || effectiveCylinderDiameterMm <= 0) {
      return null;
    }
    return activeBodyReferenceOutline ?? createEditableBodyOutline({
      overallHeightMm,
      bodyTopFromOverallMm,
      bodyBottomFromOverallMm,
      diameterMm: effectiveCylinderDiameterMm,
      topOuterDiameterMm: topOuterDiameterMm > 0 ? topOuterDiameterMm : undefined,
      baseDiameterMm: baseDiameterMm > 0 ? baseDiameterMm : undefined,
      shoulderDiameterMm,
      taperUpperDiameterMm,
      taperLowerDiameterMm,
      bevelDiameterMm,
      fitDebug: lookupResult?.fitDebug ?? null,
    });
  }, [
    activeBodyReferenceOutline,
    baseDiameterMm,
    bevelDiameterMm,
    bodyBottomFromOverallMm,
    bodyTopFromOverallMm,
    effectiveCylinderDiameterMm,
    lookupResult?.fitDebug,
    overallHeightMm,
    productType,
    shoulderDiameterMm,
    taperLowerDiameterMm,
    taperUpperDiameterMm,
    topOuterDiameterMm,
  ]);
  const persistedCanonicalBodyProfile = editingTemplate?.dimensions.canonicalBodyProfile ?? null;
  const persistedCanonicalDimensionCalibration = editingTemplate?.dimensions.canonicalDimensionCalibration ?? null;
  const persistedBodyReferenceQa = editingTemplate?.dimensions.bodyReferenceQA ?? null;
  const persistedBodyReferenceWarnings = editingTemplate?.dimensions.bodyReferenceWarnings ?? null;
  const persistedBodyReferenceContractVersion = editingTemplate?.dimensions.bodyReferenceContractVersion ?? null;
  const persistedPrintableSurfaceResolution = React.useMemo(
    () => (editingTemplate
      ? getPrintableSurfaceResolutionFromDimensions(
          editingTemplate.dimensions,
          editingTemplate.dimensions.canonicalDimensionCalibration,
        )
      : null),
    [editingTemplate],
  );
  const persistedBodyReferencePipeline = React.useMemo<BodyReferencePipelineResult | null>(
    () => createPersistedBodyReferencePipeline({
      outline: editingTemplate?.dimensions.bodyOutlineProfile ?? null,
      canonicalBodyProfile: persistedCanonicalBodyProfile,
      canonicalDimensionCalibration: persistedCanonicalDimensionCalibration,
      printableSurfaceResolution: persistedPrintableSurfaceResolution,
      bodyReferenceQA: persistedBodyReferenceQa,
      bodyReferenceWarnings: persistedBodyReferenceWarnings,
      bodyReferenceContractVersion: persistedBodyReferenceContractVersion,
    }),
    [
      editingTemplate?.dimensions.bodyOutlineProfile,
      persistedCanonicalBodyProfile,
      persistedCanonicalDimensionCalibration,
      persistedBodyReferenceContractVersion,
      persistedBodyReferenceQa,
      persistedBodyReferenceWarnings,
      persistedPrintableSurfaceResolution,
    ],
  );
  const usePersistedPrintableSurfaceFallback =
    productType !== "flat" &&
    !printableSurfaceDetection &&
    !Number.isFinite(silverBandBottomFromOverallMm) &&
    !Number.isFinite(printableTopOverrideMm) &&
    !Number.isFinite(printableBottomOverrideMm) &&
    Boolean(persistedPrintableSurfaceResolution);
  const persistedLidBoundaryMm = persistedPrintableSurfaceResolution?.printableSurfaceContract.axialExclusions.find((band) => band.kind === "lid")?.endMm;
  const persistedRimBoundaryMm = persistedPrintableSurfaceResolution?.printableSurfaceContract.axialExclusions.find((band) => band.kind === "rim-ring")?.endMm;
  const persistedBaseBandStartMm = persistedPrintableSurfaceResolution?.printableSurfaceContract.axialExclusions.find((band) => band.kind === "base")?.startMm;
  const resolvedLidSeamForPersistence = React.useMemo(() => {
    if (Number.isFinite(lidSeamFromOverallMm)) {
      return round2(Math.max(0, lidSeamFromOverallMm ?? 0));
    }
    if (Number.isFinite(printableSurfaceDetection?.lidSeamFromOverallMm)) {
      return round2(Math.max(0, printableSurfaceDetection?.lidSeamFromOverallMm ?? 0));
    }
    if (Number.isFinite(persistedLidBoundaryMm)) {
      return round2(Math.max(0, persistedLidBoundaryMm ?? 0));
    }
    return undefined;
  }, [
    lidSeamFromOverallMm,
    persistedLidBoundaryMm,
    printableSurfaceDetection?.lidSeamFromOverallMm,
  ]);
  const resolvedSilverBandBottomForPersistence = React.useMemo(() => {
    if (Number.isFinite(silverBandBottomFromOverallMm)) {
      return round2(Math.max(0, silverBandBottomFromOverallMm ?? 0));
    }
    if (Number.isFinite(printableSurfaceDetection?.rimRingBottomFromOverallMm)) {
      return round2(Math.max(0, printableSurfaceDetection?.rimRingBottomFromOverallMm ?? 0));
    }
    if (Number.isFinite(persistedRimBoundaryMm)) {
      return round2(Math.max(0, persistedRimBoundaryMm ?? 0));
    }
    return undefined;
  }, [
    persistedRimBoundaryMm,
    printableSurfaceDetection?.rimRingBottomFromOverallMm,
    silverBandBottomFromOverallMm,
  ]);
  React.useEffect(() => {
    if (productType === "flat") return;
    if (Number.isFinite(printableTopOverrideMm) || Number.isFinite(printableBottomOverrideMm)) return;
    if (Number.isFinite(lidSeamFromOverallMm) || Number.isFinite(silverBandBottomFromOverallMm)) return;
    if (!Number.isFinite(printableSurfaceDetection?.rimRingBottomFromOverallMm)) return;

    const detectionKey = [
      printableSurfaceDetection?.source ?? "none",
      Number.isFinite(printableSurfaceDetection?.lidSeamFromOverallMm)
        ? round2(printableSurfaceDetection?.lidSeamFromOverallMm ?? 0)
        : "none",
      round2(printableSurfaceDetection?.rimRingBottomFromOverallMm ?? 0),
    ].join(":");

    if (autoSeededBandDetectionKeyRef.current === detectionKey) return;
    autoSeededBandDetectionKeyRef.current = detectionKey;

    if (Number.isFinite(printableSurfaceDetection?.lidSeamFromOverallMm)) {
      setLidSeamFromOverallMm(round2(Math.max(0, printableSurfaceDetection?.lidSeamFromOverallMm ?? 0)));
    }
    setSilverBandBottomFromOverallMm(round2(Math.max(0, printableSurfaceDetection?.rimRingBottomFromOverallMm ?? 0)));
  }, [
    lidSeamFromOverallMm,
    printableBottomOverrideMm,
    printableSurfaceDetection?.lidSeamFromOverallMm,
    printableSurfaceDetection?.rimRingBottomFromOverallMm,
    printableSurfaceDetection?.source,
    printableTopOverrideMm,
    productType,
    silverBandBottomFromOverallMm,
  ]);
  const hasSemanticTopBandData = React.useMemo(
    () => Number.isFinite(resolvedLidSeamForPersistence) || Number.isFinite(resolvedSilverBandBottomForPersistence),
    [resolvedLidSeamForPersistence, resolvedSilverBandBottomForPersistence],
  );
  const activeBodyReferencePipeline = React.useMemo<BodyReferencePipelineResult | null>(() => {
    if (
      productType === "flat" ||
      !overallHeightMm ||
      effectiveCylinderDiameterMm <= 0 ||
      !calibrationBodyOutline ||
      !Number.isFinite(bodyTopFromOverallMm) ||
      !Number.isFinite(bodyBottomFromOverallMm) ||
      bodyBottomFromOverallMm <= bodyTopFromOverallMm
    ) {
      return persistedBodyReferencePipeline;
    }
    return deriveBodyReferencePipeline({
      outline: calibrationBodyOutline,
      overallHeightMm,
      bodyTopFromOverallMm,
      bodyBottomFromOverallMm,
      wrapDiameterMm: effectiveCylinderDiameterMm,
      baseDiameterMm,
      handleArcDeg,
      handleSide: resolvedCalibrationHandleSide,
      lidSeamFromOverallMm:
        resolvedLidSeamForPersistence ??
        (usePersistedPrintableSurfaceFallback ? persistedLidBoundaryMm : undefined),
      silverBandBottomFromOverallMm:
        resolvedSilverBandBottomForPersistence ??
        (usePersistedPrintableSurfaceFallback ? persistedRimBoundaryMm : undefined),
      printableTopOverrideMm:
        printableTopOverrideMm ??
        (usePersistedPrintableSurfaceFallback
          ? persistedPrintableSurfaceResolution?.printableSurfaceContract.printableTopMm
          : undefined),
      printableBottomOverrideMm:
        printableBottomOverrideMm ??
        (usePersistedPrintableSurfaceFallback
          ? persistedPrintableSurfaceResolution?.printableSurfaceContract.printableBottomMm
          : undefined),
      baseBandStartMm: usePersistedPrintableSurfaceFallback ? persistedBaseBandStartMm : undefined,
      detection: printableSurfaceDetection,
      fitDebug: lookupResult?.fitDebug ?? null,
    }) ?? persistedBodyReferencePipeline;
  }, [
    baseDiameterMm,
    bodyBottomFromOverallMm,
    bodyTopFromOverallMm,
    calibrationBodyOutline,
    effectiveCylinderDiameterMm,
    handleArcDeg,
    lookupResult?.fitDebug,
    overallHeightMm,
    persistedBaseBandStartMm,
    persistedBodyReferencePipeline,
    persistedLidBoundaryMm,
    persistedPrintableSurfaceResolution,
    persistedRimBoundaryMm,
    printableBottomOverrideMm,
    printableSurfaceDetection,
    printableTopOverrideMm,
    productType,
    resolvedCalibrationHandleSide,
    resolvedLidSeamForPersistence,
    resolvedSilverBandBottomForPersistence,
    usePersistedPrintableSurfaceFallback,
  ]);
  const activeCanonicalBodyProfile =
    activeBodyReferencePipeline?.canonicalBodyProfile ?? null;
  const activeCanonicalDimensionCalibration =
    activeBodyReferencePipeline?.canonicalDimensionCalibration ?? null;
  const activePrintableSurfaceResolution =
    activeBodyReferencePipeline?.printableSurfaceResolution ?? null;
  const bodyReferenceWarnings = activeBodyReferencePipeline?.warnings ?? [];
  const bodyReferenceQa = activeBodyReferencePipeline?.qa ?? null;
  const bodyReferenceContractVersion =
    productType === "flat" ? null : BODY_REFERENCE_CONTRACT_VERSION;
  const fullPreviewBodyTopMm = React.useMemo(() => {
    const resolvedBodyTopMm =
      activeCanonicalDimensionCalibration?.lidBodyLineMm != null
        ? activeCanonicalDimensionCalibration.lidBodyLineMm
        : bodyTopFromOverallMm;
    return round2(Math.max(0, resolvedBodyTopMm));
  }, [
    activeCanonicalDimensionCalibration?.lidBodyLineMm,
    bodyTopFromOverallMm,
  ]);
  const fullPreviewCanonicalDimensionCalibration =
    activeCanonicalDimensionCalibration;
  const fullPreviewCanonicalBodyProfile =
    activeCanonicalBodyProfile;
  const previewPrintableSurfaceContract =
    activePrintableSurfaceResolution?.printableSurfaceContract ??
    activeCanonicalDimensionCalibration?.printableSurfaceContract ??
    null;
  const liveTumblerDims = React.useMemo<TumblerDimensions | null>(() => {
    if (!productType || productType === "flat" || effectiveCylinderDiameterMm <= 0 || printHeightMm <= 0) return null;
    const printableSurfaceContract = previewPrintableSurfaceContract;
    const resolvedOverallHeightMm =
      activeCanonicalDimensionCalibration?.totalHeightMm && activeCanonicalDimensionCalibration.totalHeightMm > 0
        ? activeCanonicalDimensionCalibration.totalHeightMm
        : overallHeightMm;
    const resolvedDiameterMm =
      activeCanonicalDimensionCalibration?.wrapDiameterMm && activeCanonicalDimensionCalibration.wrapDiameterMm > 0
        ? activeCanonicalDimensionCalibration.wrapDiameterMm
        : effectiveCylinderDiameterMm;
    const resolvedBodyTopMm =
      activeCanonicalDimensionCalibration?.lidBodyLineMm != null
        ? activeCanonicalDimensionCalibration.lidBodyLineMm
        : bodyTopFromOverallMm;
    const resolvedBodyBottomMm =
      activeCanonicalDimensionCalibration?.bodyBottomMm != null
        ? activeCanonicalDimensionCalibration.bodyBottomMm
        : bodyBottomFromOverallMm;
    const resolvedRenderBodyTopMm = Math.max(0, resolvedBodyTopMm);
    const resolvedPrintableContract =
      activeCanonicalDimensionCalibration?.printableSurfaceContract ?? printableSurfaceContract;
    const resolvedPrintableHeightMm =
      resolvedPrintableContract?.printableHeightMm && resolvedPrintableContract.printableHeightMm > 0
        ? resolvedPrintableContract.printableHeightMm
        : printHeightMm;
    const resolvedPrintableTopOffsetMm =
      resolvedOverallHeightMm > 0 && Number.isFinite(resolvedPrintableContract?.printableTopMm)
        ? round2(Math.max(0, resolvedPrintableContract?.printableTopMm ?? 0))
        : topMarginMm > 0
          ? round2(topMarginMm)
          : undefined;

    return {
      overallHeightMm: resolvedOverallHeightMm > 0 ? round2(resolvedOverallHeightMm) : round2(printHeightMm),
      diameterMm: round2(resolvedDiameterMm),
      topDiameterMm: topOuterDiameterMm > 0 ? round2(topOuterDiameterMm) : undefined,
      bottomDiameterMm: baseDiameterMm > 0 ? round2(baseDiameterMm) : undefined,
      bodyTopOffsetMm: resolvedOverallHeightMm > 0 ? round2(Math.max(0, resolvedRenderBodyTopMm)) : undefined,
      bodyHeightMm:
        resolvedOverallHeightMm > 0
          ? round2(Math.max(0, resolvedBodyBottomMm - resolvedRenderBodyTopMm))
          : undefined,
      printableHeightMm: round2(resolvedPrintableHeightMm),
      printableTopOffsetMm: resolvedPrintableTopOffsetMm,
      lidSeamFromOverallMm:
        resolvedOverallHeightMm > 0 && Number.isFinite(resolvedLidSeamForPersistence)
          ? round2(Math.max(0, resolvedLidSeamForPersistence ?? 0))
          : undefined,
      silverBandBottomFromOverallMm:
        resolvedOverallHeightMm > 0 && Number.isFinite(resolvedSilverBandBottomForPersistence)
          ? round2(Math.max(0, resolvedSilverBandBottomForPersistence ?? 0))
          : undefined,
    };
  }, [
    activeCanonicalDimensionCalibration?.bodyBottomMm,
    activeCanonicalDimensionCalibration?.lidBodyLineMm,
    activeCanonicalDimensionCalibration?.printableSurfaceContract,
    activeCanonicalDimensionCalibration?.totalHeightMm,
    activeCanonicalDimensionCalibration?.wrapDiameterMm,
    previewPrintableSurfaceContract,
    productType,
    effectiveCylinderDiameterMm,
    topOuterDiameterMm,
    baseDiameterMm,
    bodyBottomFromOverallMm,
    bodyTopFromOverallMm,
    printHeightMm,
    overallHeightMm,
    resolvedLidSeamForPersistence,
    resolvedSilverBandBottomForPersistence,
    topMarginMm,
  ]);
  const fullPreviewTumblerDims = React.useMemo<TumblerDimensions | null>(() => {
    if (!productType || productType === "flat" || effectiveCylinderDiameterMm <= 0 || printHeightMm <= 0) return null;
    const resolvedOverallHeightMm =
      fullPreviewCanonicalDimensionCalibration?.totalHeightMm && fullPreviewCanonicalDimensionCalibration.totalHeightMm > 0
        ? fullPreviewCanonicalDimensionCalibration.totalHeightMm
        : (
            activeCanonicalDimensionCalibration?.totalHeightMm && activeCanonicalDimensionCalibration.totalHeightMm > 0
              ? activeCanonicalDimensionCalibration.totalHeightMm
              : overallHeightMm
          );
    const resolvedDiameterMm =
      fullPreviewCanonicalDimensionCalibration?.wrapDiameterMm && fullPreviewCanonicalDimensionCalibration.wrapDiameterMm > 0
        ? fullPreviewCanonicalDimensionCalibration.wrapDiameterMm
        : (
            activeCanonicalDimensionCalibration?.wrapDiameterMm && activeCanonicalDimensionCalibration.wrapDiameterMm > 0
              ? activeCanonicalDimensionCalibration.wrapDiameterMm
              : effectiveCylinderDiameterMm
          );
    const resolvedBodyBottomMm =
      fullPreviewCanonicalDimensionCalibration?.bodyBottomMm != null
        ? fullPreviewCanonicalDimensionCalibration.bodyBottomMm
        : (
            activeCanonicalDimensionCalibration?.bodyBottomMm != null
              ? activeCanonicalDimensionCalibration.bodyBottomMm
              : bodyBottomFromOverallMm
          );
    const resolvedPrintableContract =
      fullPreviewCanonicalDimensionCalibration?.printableSurfaceContract ??
      activeCanonicalDimensionCalibration?.printableSurfaceContract ??
      previewPrintableSurfaceContract;
    const resolvedPrintableHeightMm =
      resolvedPrintableContract?.printableHeightMm && resolvedPrintableContract.printableHeightMm > 0
        ? resolvedPrintableContract.printableHeightMm
        : printHeightMm;
    const resolvedPrintableTopOffsetMm =
      resolvedOverallHeightMm > 0 && Number.isFinite(resolvedPrintableContract?.printableTopMm)
        ? round2(Math.max(0, resolvedPrintableContract?.printableTopMm ?? 0))
        : topMarginMm > 0
          ? round2(topMarginMm)
          : undefined;

    return {
      overallHeightMm: resolvedOverallHeightMm > 0 ? round2(resolvedOverallHeightMm) : round2(printHeightMm),
      diameterMm: round2(resolvedDiameterMm),
      topDiameterMm: topOuterDiameterMm > 0 ? round2(topOuterDiameterMm) : undefined,
      bottomDiameterMm: baseDiameterMm > 0 ? round2(baseDiameterMm) : undefined,
      bodyTopOffsetMm: round2(Math.max(0, fullPreviewBodyTopMm)),
      bodyHeightMm:
        resolvedOverallHeightMm > 0
          ? round2(Math.max(0, resolvedBodyBottomMm - fullPreviewBodyTopMm))
          : undefined,
      printableHeightMm: round2(resolvedPrintableHeightMm),
      printableTopOffsetMm: resolvedPrintableTopOffsetMm,
      lidSeamFromOverallMm:
        resolvedOverallHeightMm > 0 && Number.isFinite(resolvedLidSeamForPersistence)
          ? round2(Math.max(0, resolvedLidSeamForPersistence ?? 0))
          : undefined,
      silverBandBottomFromOverallMm:
        resolvedOverallHeightMm > 0 && Number.isFinite(resolvedSilverBandBottomForPersistence)
          ? round2(Math.max(0, resolvedSilverBandBottomForPersistence ?? 0))
          : undefined,
    };
  }, [
    activeCanonicalDimensionCalibration?.bodyBottomMm,
    activeCanonicalDimensionCalibration?.printableSurfaceContract,
    activeCanonicalDimensionCalibration?.totalHeightMm,
    activeCanonicalDimensionCalibration?.wrapDiameterMm,
    baseDiameterMm,
    bodyBottomFromOverallMm,
    effectiveCylinderDiameterMm,
    fullPreviewBodyTopMm,
    fullPreviewCanonicalDimensionCalibration?.bodyBottomMm,
    fullPreviewCanonicalDimensionCalibration?.printableSurfaceContract,
    fullPreviewCanonicalDimensionCalibration?.totalHeightMm,
    fullPreviewCanonicalDimensionCalibration?.wrapDiameterMm,
    overallHeightMm,
    previewPrintableSurfaceContract,
    printHeightMm,
    productType,
    resolvedLidSeamForPersistence,
    resolvedSilverBandBottomForPersistence,
    topMarginMm,
    topOuterDiameterMm,
  ]);
  const fullPreviewLidPreset = React.useMemo<LidAssemblyPreset | null>(() => {
    if (productType === "flat" || !currentMatchedProfile) return null;
    const topRadiusMm = Math.max(
      1,
      ((topOuterDiameterMm > 0 ? topOuterDiameterMm : effectiveCylinderDiameterMm) / 2),
    );
    return buildTemplateLidPreset({
      profile: currentMatchedProfile,
      topRadiusMm,
      ringTopMm: resolvedLidSeamForPersistence,
      ringBottomMm: resolvedSilverBandBottomForPersistence,
    });
  }, [
    currentMatchedProfile,
    effectiveCylinderDiameterMm,
    productType,
    resolvedLidSeamForPersistence,
    resolvedSilverBandBottomForPersistence,
    topOuterDiameterMm,
  ]);
  const defaultEditableHandlePreview = React.useMemo<EditableHandlePreview | null>(() => {
    if (
      productType === "flat" ||
      overallHeightMm <= 0 ||
      !Number.isFinite(bodyTopFromOverallMm) ||
      !Number.isFinite(bodyBottomFromOverallMm) ||
      bodyBottomFromOverallMm <= bodyTopFromOverallMm
    ) {
      return null;
    }

    const pxToMmScaleX = activeCanonicalDimensionCalibration?.photoToFrontTransform.matrix?.[0];
    const pxToMmScaleY = activeCanonicalDimensionCalibration?.photoToFrontTransform.matrix?.[4];
    const fallbackTubeDiameterMm = estimateEditableHandleWallThicknessMm({
      handleProfile: normalizedCanonicalHandleProfile,
      pxToMmScaleX,
      pxToMmScaleY,
      fallbackMm: Math.max(5, effectiveCylinderDiameterMm * 0.115),
    });
    const presetHandlePreview = buildTemplateHandlePreset({
      profile: currentMatchedProfile,
      bodyTopFromOverallMm,
      bodyBottomFromOverallMm,
      effectiveCylinderDiameterMm,
      ringBottomMm: resolvedSilverBandBottomForPersistence,
      fallbackTubeDiameterMm,
    });
    if (presetHandlePreview) {
      return presetHandlePreview;
    }

    const measuredHandlePreview = deriveMeasuredEditableHandlePreview({
      fitDebug: lookupResult?.fitDebug ?? null,
      handleProfile: normalizedCanonicalHandleProfile,
      calibration: activeCanonicalDimensionCalibration,
      bodyTopFromOverallMm,
      bodyBottomFromOverallMm,
      fallbackTubeDiameterMm,
    });
    if (measuredHandlePreview) {
      return measuredHandlePreview;
    }

    const side =
      resolvedCalibrationHandleSide ??
      normalizedCanonicalHandleProfile?.side ??
      lookupResult?.fitDebug?.handleSide ??
      ((handleArcDeg > 0 || (handleSpanMm ?? 0) > 0) ? "right" : null);
    if (!side) return null;
    const bodyHeight = Math.max(1, bodyBottomFromOverallMm - bodyTopFromOverallMm);
    const ringBottomMm = Number.isFinite(resolvedSilverBandBottomForPersistence)
      ? Math.max(bodyTopFromOverallMm, resolvedSilverBandBottomForPersistence ?? bodyTopFromOverallMm)
      : bodyTopFromOverallMm;
    const topFromOverallMm = round2(clampNumber(
      Math.max(ringBottomMm + 8, bodyTopFromOverallMm + (bodyHeight * 0.08)),
      bodyTopFromOverallMm,
      bodyBottomFromOverallMm - 24,
    ));
    const bottomFromOverallMm = round2(clampNumber(
      Math.max(
        topFromOverallMm + Math.max(64, bodyHeight * 0.42),
        bodyTopFromOverallMm + (bodyHeight * 0.56),
      ),
      topFromOverallMm + 24,
      bodyBottomFromOverallMm,
    ));
    const reachMm = round2(Math.max(12, effectiveCylinderDiameterMm * 0.34));
    const cornerInsetMm = round2(Math.max(4, Math.min((bottomFromOverallMm - topFromOverallMm) * 0.18, 18)));
    return {
      side,
      topFromOverallMm,
      bottomFromOverallMm,
      outerTopFromOverallMm: topFromOverallMm,
      outerBottomFromOverallMm: bottomFromOverallMm,
      reachMm,
      outerOffsetMm: fallbackTubeDiameterMm,
      upperCornerFromOverallMm: round2(clampNumber(
        topFromOverallMm + cornerInsetMm,
        topFromOverallMm + 4,
        bottomFromOverallMm - 8,
      )),
      lowerCornerFromOverallMm: round2(clampNumber(
        bottomFromOverallMm - cornerInsetMm,
        topFromOverallMm + 8,
        bottomFromOverallMm - 4,
      )),
      upperCornerReachMm: round2(Math.max(6, reachMm * 0.78)),
      lowerCornerReachMm: round2(Math.max(6, reachMm * 0.78)),
      upperTransitionFromOverallMm: topFromOverallMm,
      lowerTransitionFromOverallMm: bottomFromOverallMm,
      upperTransitionReachMm: round2(Math.max(4, reachMm * 0.58)),
      lowerTransitionReachMm: round2(Math.max(4, reachMm * 0.58)),
      tubeDiameterMm: fallbackTubeDiameterMm,
    };
  }, [
    activeCanonicalDimensionCalibration,
    bodyBottomFromOverallMm,
    bodyTopFromOverallMm,
    currentMatchedProfile,
    effectiveCylinderDiameterMm,
    handleArcDeg,
    handleSpanMm,
    lookupResult?.fitDebug,
    normalizedCanonicalHandleProfile,
    overallHeightMm,
    productType,
    resolvedCalibrationHandleSide,
    resolvedSilverBandBottomForPersistence,
  ]);
  const editableHandlePreview = React.useMemo<EditableHandlePreview | null>(() => {
    if (
      productType === "flat" ||
      overallHeightMm <= 0 ||
      !Number.isFinite(bodyTopFromOverallMm) ||
      !Number.isFinite(bodyBottomFromOverallMm) ||
      bodyBottomFromOverallMm <= bodyTopFromOverallMm
    ) {
      return null;
    }

    const side =
      defaultEditableHandlePreview?.side ??
      resolvedCalibrationHandleSide ??
      normalizedCanonicalHandleProfile?.side ??
      lookupResult?.fitDebug?.handleSide ??
      ((handleArcDeg > 0 || (handleSpanMm ?? 0) > 0) ? "right" : null);
    if (!side) return null;

    const defaultTopMm = defaultEditableHandlePreview?.topFromOverallMm ?? bodyTopFromOverallMm;
    const topFromOverallMm = Number.isFinite(handleTopFromOverallMm)
      ? round2(clampNumber(handleTopFromOverallMm ?? 0, bodyTopFromOverallMm, bodyBottomFromOverallMm - 24))
      : defaultTopMm;
    const defaultBottomMm = defaultEditableHandlePreview?.bottomFromOverallMm ?? round2(clampNumber(
      topFromOverallMm + 64,
      topFromOverallMm + 24,
      bodyBottomFromOverallMm,
    ));
    const bottomFromOverallMm = Number.isFinite(handleBottomFromOverallMm)
      ? round2(clampNumber(handleBottomFromOverallMm ?? 0, topFromOverallMm + 24, bodyBottomFromOverallMm))
      : defaultBottomMm;
    const reachMm = Number.isFinite(handleReachMm)
      ? round2(Math.max(0, handleReachMm ?? 0))
      : (defaultEditableHandlePreview?.reachMm ?? round2(Math.max(12, effectiveCylinderDiameterMm * 0.34)));
    const defaultCornerInsetMm = round2(
      defaultEditableHandlePreview?.upperCornerFromOverallMm != null
        ? Math.max(4, defaultEditableHandlePreview.upperCornerFromOverallMm - topFromOverallMm)
        : Math.max(4, Math.min((bottomFromOverallMm - topFromOverallMm) * 0.18, 18)),
    );
    const upperCornerFromOverallMm = Number.isFinite(handleUpperCornerFromOverallMm)
      ? round2(clampNumber(
          handleUpperCornerFromOverallMm ?? 0,
          topFromOverallMm + 4,
          bottomFromOverallMm - 8,
        ))
      : (defaultEditableHandlePreview?.upperCornerFromOverallMm ?? round2(clampNumber(
          topFromOverallMm + defaultCornerInsetMm,
          topFromOverallMm + 4,
          bottomFromOverallMm - 8,
        )));
    const lowerCornerFromOverallMm = Number.isFinite(handleLowerCornerFromOverallMm)
      ? round2(clampNumber(
          handleLowerCornerFromOverallMm ?? 0,
          upperCornerFromOverallMm + 4,
          bottomFromOverallMm - 4,
        ))
      : (defaultEditableHandlePreview?.lowerCornerFromOverallMm ?? round2(clampNumber(
          bottomFromOverallMm - defaultCornerInsetMm,
          upperCornerFromOverallMm + 4,
          bottomFromOverallMm - 4,
        )));
    const defaultCornerReachMm = defaultEditableHandlePreview?.upperCornerReachMm ?? round2(Math.max(6, reachMm * 0.78));
    const upperCornerReachMm = Number.isFinite(handleUpperCornerReachMm)
      ? round2(Math.max(0, handleUpperCornerReachMm ?? 0))
      : (defaultEditableHandlePreview?.upperCornerReachMm ?? defaultCornerReachMm);
    const lowerCornerReachMm = Number.isFinite(handleLowerCornerReachMm)
      ? round2(Math.max(0, handleLowerCornerReachMm ?? 0))
      : (defaultEditableHandlePreview?.lowerCornerReachMm ?? defaultCornerReachMm);
    const defaultTransitionReachMm = defaultEditableHandlePreview?.upperTransitionReachMm ?? round2(Math.max(4, reachMm * 0.58));
    const upperTransitionFromOverallMm = Number.isFinite(handleUpperTransitionFromOverallMm)
      ? round2(clampNumber(
          handleUpperTransitionFromOverallMm ?? 0,
          topFromOverallMm,
          upperCornerFromOverallMm - 2,
        ))
      : (defaultEditableHandlePreview?.upperTransitionFromOverallMm ?? topFromOverallMm);
    const lowerTransitionFromOverallMm = Number.isFinite(handleLowerTransitionFromOverallMm)
      ? round2(clampNumber(
          handleLowerTransitionFromOverallMm ?? 0,
          lowerCornerFromOverallMm + 2,
          bottomFromOverallMm,
        ))
      : (defaultEditableHandlePreview?.lowerTransitionFromOverallMm ?? bottomFromOverallMm);
    const upperTransitionReachMm = Number.isFinite(handleUpperTransitionReachMm)
      ? round2(Math.max(0, handleUpperTransitionReachMm ?? 0))
      : (defaultEditableHandlePreview?.upperTransitionReachMm ?? defaultTransitionReachMm);
    const lowerTransitionReachMm = Number.isFinite(handleLowerTransitionReachMm)
      ? round2(Math.max(0, handleLowerTransitionReachMm ?? 0))
      : (defaultEditableHandlePreview?.lowerTransitionReachMm ?? defaultTransitionReachMm);
    const pxToMmScaleX = activeCanonicalDimensionCalibration?.photoToFrontTransform.matrix?.[0];
    const pxToMmScaleY = activeCanonicalDimensionCalibration?.photoToFrontTransform.matrix?.[4];
    const fallbackWallMm = defaultEditableHandlePreview?.tubeDiameterMm ?? Math.max(5, reachMm * 0.18);
    const estimatedTubeDiameterMm = estimateEditableHandleWallThicknessMm({
      handleProfile: normalizedCanonicalHandleProfile,
      pxToMmScaleX,
      pxToMmScaleY,
      fallbackMm: fallbackWallMm,
    });
    const tubeDiameterMm = Number.isFinite(handleTubeDiameterMm)
      ? round2(Math.max(2, handleTubeDiameterMm ?? 0))
      : estimatedTubeDiameterMm;

    return {
      side,
      topFromOverallMm,
      bottomFromOverallMm,
      outerTopFromOverallMm: topFromOverallMm,
      outerBottomFromOverallMm: bottomFromOverallMm,
      reachMm,
      outerOffsetMm: tubeDiameterMm,
      upperCornerFromOverallMm,
      lowerCornerFromOverallMm,
      upperCornerReachMm,
      lowerCornerReachMm,
      upperTransitionFromOverallMm,
      lowerTransitionFromOverallMm,
      upperTransitionReachMm,
      lowerTransitionReachMm,
      tubeDiameterMm,
    };
  }, [
    activeCanonicalDimensionCalibration?.photoToFrontTransform.matrix,
    bodyBottomFromOverallMm,
    bodyTopFromOverallMm,
    effectiveCylinderDiameterMm,
    handleArcDeg,
    handleBottomFromOverallMm,
    handleLowerCornerFromOverallMm,
    handleLowerCornerReachMm,
    handleLowerTransitionFromOverallMm,
    handleLowerTransitionReachMm,
    handleTubeDiameterMm,
    handleReachMm,
    handleTopFromOverallMm,
    handleUpperCornerFromOverallMm,
    handleUpperCornerReachMm,
    handleUpperTransitionFromOverallMm,
    handleUpperTransitionReachMm,
    handleSpanMm,
    lookupResult?.fitDebug?.handleSide,
    normalizedCanonicalHandleProfile?.innerContour,
    normalizedCanonicalHandleProfile?.outerContour,
    normalizedCanonicalHandleProfile?.side,
    overallHeightMm,
    productType,
    resolvedCalibrationHandleSide,
    resolvedSilverBandBottomForPersistence,
    defaultEditableHandlePreview,
  ]);
  const canUseCanonicalPreviewModel = productType !== "flat" &&
    Boolean(activeCanonicalBodyProfile && activeCanonicalDimensionCalibration);
  const hasAlignmentPreviewModel = canUseCanonicalPreviewModel;
  const hasFullPreviewModel = canUseCanonicalPreviewModel;
  const hasSourcePreviewModel = React.useMemo(
    () => Boolean(
      previewModelFile ||
      (productType === "flat"
        ? (glbPath.trim() || liveFlatPreview)
        : resolvedDrinkwarePreviewModelUrl),
    ),
    [glbPath, liveFlatPreview, previewModelFile, productType, resolvedDrinkwarePreviewModelUrl],
  );
  const previewModeContextKey = React.useMemo(
    () => `${editingTemplate?.id ?? "draft"}:${productType ?? "unknown"}`,
    [editingTemplate?.id, productType],
  );
  const previewModeLastContextRef = React.useRef<string | null>(null);
  const defaultPreviewModelMode = React.useMemo(
    () => resolveDefaultPreviewModelMode({
      productType,
      hasAlignmentPreviewModel,
      hasFullPreviewModel,
      hasSourcePreviewModel,
    }),
    [hasAlignmentPreviewModel, hasFullPreviewModel, hasSourcePreviewModel, productType],
  );
  React.useEffect(() => {
    const contextChanged = previewModeLastContextRef.current !== previewModeContextKey;
    if (contextChanged) {
      previewModeLastContextRef.current = previewModeContextKey;
      previewModeUserSelectedRef.current = false;
    }
    const modeRequiresCanonical = previewModelMode === "alignment-model" || previewModelMode === "full-model";
    const currentModeUnavailable = modeRequiresCanonical
      ? !canUseCanonicalPreviewModel
      : !hasSourcePreviewModel;
    if ((contextChanged || !previewModeUserSelectedRef.current || currentModeUnavailable) && previewModelMode !== defaultPreviewModelMode) {
      setPreviewModelMode(defaultPreviewModelMode);
    }
  }, [
    canUseCanonicalPreviewModel,
    defaultPreviewModelMode,
    hasSourcePreviewModel,
    previewModelMode,
    previewModeContextKey,
  ]);
  const silhouetteMismatchSummary = React.useMemo(
    () => summarizeCanonicalSilhouetteMismatch({
      outline: calibrationBodyOutline,
      bodyProfile: activeCanonicalBodyProfile,
      calibration: activeCanonicalDimensionCalibration,
    }),
    [activeCanonicalBodyProfile, activeCanonicalDimensionCalibration, calibrationBodyOutline],
  );
  const alignmentShellMismatchSummary = React.useMemo(
    () => (
      previewModelMode === "alignment-model" && activeCanonicalBodyProfile?.svgPath && activeCanonicalDimensionCalibration
        ? {
            averageErrorMm: 0,
            maxErrorMm: 0,
            rowCount: Math.max(activeCanonicalBodyProfile.samples.length, 1),
          }
        : silhouetteMismatchSummary
    ),
    [activeCanonicalBodyProfile, activeCanonicalDimensionCalibration, previewModelMode, silhouetteMismatchSummary],
  );
  const silhouetteLockPass = alignmentShellMismatchSummary
    ? alignmentShellMismatchSummary.averageErrorMm <= 0.5 && alignmentShellMismatchSummary.maxErrorMm <= 2.0
    : null;
  const alignmentOrientationQASummary = React.useMemo(
    () => summarizeCanonicalOrientationQA({
      bodyProfile: activeCanonicalBodyProfile,
      calibration: activeCanonicalDimensionCalibration,
    }),
    [activeCanonicalBodyProfile, activeCanonicalDimensionCalibration],
  );
  const orientationLockPass = alignmentOrientationQASummary?.pass ?? null;
  const derivedFrontVisibleWidthMm = productType === "flat"
    ? 0
    : round2(activeCanonicalDimensionCalibration?.frontVisibleWidthMm ?? 0);
  const frontVisibleWidthReady = derivedFrontVisibleWidthMm > 0;
  const derivedDiameterMismatchMm = productType === "flat" || templateWidthMm <= 0 || diameterMm <= 0
    ? 0
    : Math.abs(round2(templateWidthMm / Math.PI) - round2(diameterMm));
  const hasBlockingGeometryMismatch =
    productType !== "flat" &&
    advancedGeometryOverridesUnlocked &&
    derivedDiameterMismatchMm > LOCKED_WRAP_DIAMETER_TOLERANCE_MM;
  const printableHeightLooksLikeOverallHeight =
    productType !== "flat" &&
    overallHeightMm > 0 &&
    printHeightMm > 0 &&
    Math.abs(printHeightMm - overallHeightMm) <= 0.5;
  const handleSpanContaminatesBodyWidth =
    productType !== "flat" &&
    Number.isFinite(handleSpanMm) &&
    (handleSpanMm ?? 0) > 0 &&
    effectiveCylinderDiameterMm > 0 &&
    Math.abs((handleSpanMm ?? 0) - effectiveCylinderDiameterMm) <= 1;
  const canonicalHandleDebugSummary = React.useMemo(
    () => summarizeCanonicalHandleDebug({
      handleProfile: normalizedCanonicalHandleProfile,
      calibration: activeCanonicalDimensionCalibration,
    }),
    [activeCanonicalDimensionCalibration, normalizedCanonicalHandleProfile],
  );
  const canonicalHandleRenderMode = React.useMemo(
    () => resolveCanonicalHandleRenderMode({
      handleProfile: normalizedCanonicalHandleProfile,
      previewMode: previewModelMode === "source-traced" ? "full-model" : previewModelMode,
    }),
    [normalizedCanonicalHandleProfile, previewModelMode],
  );
  const usingEditableHandlePreview = previewModelMode === "full-model" && Boolean(editableHandlePreview);
  const canonicalBackReferenceImage = referenceSelection?.canonicalBackImageId
    ? (referenceImagesById.get(referenceSelection.canonicalBackImageId) ?? null)
    : null;
  const auxiliaryBackReferenceImage = referenceSelection?.bestAuxBack3qImageId
    ? (referenceImagesById.get(referenceSelection.bestAuxBack3qImageId) ?? null)
    : null;
  const hasStrictCanonicalBack = referenceSelection?.canonicalBackStatus === "true-back" && Boolean(canonicalBackReferenceImage);
  const hasAuxiliaryBack3q = referenceSelection?.canonicalBackStatus === "only-back-3q-found" && Boolean(auxiliaryBackReferenceImage);

  React.useEffect(() => {
    if (frontPhotoDataUrl) {
      setBodyReferencePhotoDataUrl(frontPhotoDataUrl);
      return;
    }
    if (frontCleanUrl) {
      setBodyReferencePhotoDataUrl(frontCleanUrl);
      return;
    }
    if (productPhotoFullUrl) return;
    setBodyReferencePhotoDataUrl("");
  }, [frontCleanUrl, frontPhotoDataUrl, productPhotoFullUrl]);

  React.useEffect(() => {
    let cancelled = false;

    const syncCanonicalHandleProfile = async () => {
      if (productType === "flat") {
        commitCanonicalHandleProfile(undefined);
        return;
      }
      if (
        !bodyReferencePhotoDataUrl ||
        !handleSyncBodyReferenceOutline?.sourceContour ||
        handleSyncBodyReferenceOutline.sourceContour.length < 3
      ) {
        return;
      }

      try {
        const nextProfile = await extractCanonicalHandleProfileFromCutout({
          imageDataUrl: bodyReferencePhotoDataUrl,
          outline: handleSyncBodyReferenceOutline,
        });
        if (cancelled) return;
        commitCanonicalHandleProfile(
          nextProfile
            ? (
                resolvedCalibrationHandleSide && nextProfile.side !== resolvedCalibrationHandleSide
                  ? { ...nextProfile, side: resolvedCalibrationHandleSide }
                  : nextProfile
              )
            : undefined,
        );
      } catch {
        if (cancelled) return;
      }
    };

    void syncCanonicalHandleProfile();
    return () => {
      cancelled = true;
    };
  }, [
    activeBodyReferenceOutlineSignature,
    bodyReferencePhotoDataUrl,
    commitCanonicalHandleProfile,
    handleSyncBodyReferenceOutline,
    productType,
    resolvedCalibrationHandleSide,
  ]);

  // Auto-mirror front photo as back when mirrorForBack is enabled
  React.useEffect(() => {
    if (!mirrorForBack || !frontPhotoDataUrl) {
      if (mirrorForBack) setBackPhotoDataUrl("");
      return;
    }
    let cancelled = false;
    flipImageHorizontal(frontPhotoDataUrl).then((flipped) => {
      if (!cancelled && flipped) setBackPhotoDataUrl(flipped);
    });
    return () => { cancelled = true; };
  }, [mirrorForBack, frontPhotoDataUrl]);

  React.useEffect(() => {
    if (productType === "flat" || overallHeightMm <= 0 || effectiveCylinderDiameterMm <= 0) {
      bodyOutlineSeedSignatureRef.current = "";
      return;
    }

    const fitDebug = lookupResult?.fitDebug ?? null;
    const traceDebug = flatLookupResult?.traceDebug ?? null;
    const referenceImagesById = new Map(
      (productReferenceSet?.images ?? []).map((image) => [image.id, image] as const),
    );
    const canonicalFrontReferenceUrl =
      productReferenceSet?.canonicalViewSelection?.canonicalFrontImageId
        ? referenceImagesById.get(productReferenceSet.canonicalViewSelection.canonicalFrontImageId)?.url ?? null
        : productReferenceSet?.canonicalFrontImageId
          ? referenceImagesById.get(productReferenceSet.canonicalFrontImageId)?.url ?? null
          : null;
    // If the canonical hero asset has no fit-debug, use the accepted traced front
    // image as the BODY REFERENCE owner so the photo and shell share one source.
    const preferredBodyReferenceUrl =
      !fitDebug &&
      traceDebug?.accepted &&
      (traceDebug.outlinePointsPx.length ?? 0) > 20 &&
      traceDebug.sourceImageUrl
        ? traceDebug.sourceImageUrl
        : canonicalFrontReferenceUrl;
    const traceMatchesReferenceImage = (() => {
      const traceIdentity = normalizeImageIdentity(traceDebug?.sourceImageUrl);
      const referenceIdentity = normalizeImageIdentity(preferredBodyReferenceUrl);
      if (!traceIdentity) return false;
      if (!referenceIdentity) return true;
      return traceIdentity === referenceIdentity;
    })();
    const canSeedFromFitDebug = Boolean(fitDebug && fitDebug.profilePoints.length > 1);
    const canSeedFromTraceDebug = Boolean(
      traceDebug?.accepted &&
      (traceDebug.outlinePointsPx.length ?? 0) > 20 &&
      traceMatchesReferenceImage,
    );
    if (!canSeedFromFitDebug && !canSeedFromTraceDebug) return;

    const signature = JSON.stringify({
      seedMode: canSeedFromFitDebug ? "fit-debug" : "trace-debug",
      fitDebugSource: fitDebug
        ? `${fitDebug.sourceImageUrl}:${fitDebug.imageWidthPx}x${fitDebug.imageHeightPx}:${fitDebug.fullTopPx}:${fitDebug.fullBottomPx}:${fitDebug.bodyTopPx}:${fitDebug.bodyBottomPx}`
        : "",
      traceDebugSource: traceDebug
        ? `${traceDebug.sourceImageUrl}:${traceDebug.imageWidthPx}x${traceDebug.imageHeightPx}:${traceDebug.silhouetteBoundsPx.minY}:${traceDebug.silhouetteBoundsPx.maxY}:${traceDebug.outlinePointsPx.length}`
        : "",
      traceMatchesReferenceImage,
      canonicalFrontReferenceUrl: normalizeImageIdentity(preferredBodyReferenceUrl),
      overallHeightMm: round2(overallHeightMm),
      bodyTopFromOverallMm: round2(bodyTopFromOverallMm),
      bodyBottomFromOverallMm: round2(bodyBottomFromOverallMm),
      diameterMm: round2(effectiveCylinderDiameterMm),
      topOuterDiameterMm: round2(topOuterDiameterMm),
      baseDiameterMm: round2(baseDiameterMm),
      shoulderDiameterMm: round2(shoulderDiameterMm ?? 0),
      taperUpperDiameterMm: round2(taperUpperDiameterMm ?? 0),
      taperLowerDiameterMm: round2(taperLowerDiameterMm ?? 0),
      bevelDiameterMm: round2(bevelDiameterMm ?? 0),
    });

    const hasSeededContour = (bodyOutlineProfile?.directContour?.length ?? 0) > 20;
    if (editingTemplate && hasSeededContour) return;
    if (bodyOutlineSeedSignatureRef.current === signature && hasSeededContour) return;
    bodyOutlineSeedSignatureRef.current = signature;

    let cancelled = false;
    const applyFallbackOutline = () => {
      if (cancelled) return false;
      const outline = canSeedFromFitDebug
        ? createEditableBodyOutline({
            overallHeightMm,
            bodyTopFromOverallMm,
            bodyBottomFromOverallMm,
            diameterMm: effectiveCylinderDiameterMm,
            topOuterDiameterMm: topOuterDiameterMm > 0 ? topOuterDiameterMm : undefined,
            baseDiameterMm: baseDiameterMm > 0 ? baseDiameterMm : undefined,
            shoulderDiameterMm,
            taperUpperDiameterMm,
            taperLowerDiameterMm,
            bevelDiameterMm,
            fitDebug,
          })
        : createEditableBodyOutlineFromTraceDebug({
            traceDebug: traceDebug!,
            overallHeightMm,
            bodyTopFromOverallMm,
            bodyBottomFromOverallMm,
            diameterMm: effectiveCylinderDiameterMm,
            topOuterDiameterMm: topOuterDiameterMm > 0 ? topOuterDiameterMm : undefined,
          });
      setBodyOutlineProfile(outline);
      setReferencePaths((current) => createReferencePaths({
        bodyOutline: outline,
        lidProfile: current.lidProfile,
        silverProfile: current.silverProfile,
      }));
      return true;
    };
    const seedBodyOutlineFromProfile = async () => {
      try {
        applyFallbackOutline();
      } catch {
        if (!cancelled && !applyFallbackOutline()) {
          bodyOutlineSeedSignatureRef.current = "";
        }
      }
    };

    void seedBodyOutlineFromProfile();
    return () => {
      cancelled = true;
    };
  }, [
    activeReferencePhotoDataUrl,
    bodyBottomFromOverallMm,
    bodyOutlineProfile,
    bodyTopFromOverallMm,
    bevelDiameterMm,
    baseDiameterMm,
    editingTemplate,
    effectiveCylinderDiameterMm,
    lookupResult?.fitDebug,
    flatLookupResult?.traceDebug,
    normalizedCanonicalHandleProfile?.side,
    overallHeightMm,
    productReferenceSet,
    productType,
    shoulderDiameterMm,
    taperLowerDiameterMm,
    taperUpperDiameterMm,
    topOuterDiameterMm,
  ]);

  const resolveManufacturerLogoStamp = React.useCallback(async (options?: { useOpenAiAssist?: boolean }) => {
    if (productType === "flat") {
      return undefined;
    }
    const primaryPhotoUrl = bodyReferencePhotoDataUrl || frontCleanUrl || frontPhotoDataUrl || productPhotoFullUrl;
    const rawPhotoUrl = frontCleanUrl || frontPhotoDataUrl || productPhotoFullUrl;
    if (!primaryPhotoUrl || overallHeightMm <= 0) {
      return undefined;
    }

    const stampSource = lookupResult?.imageUrl || productPhotoFullUrl ? "lookup-photo" : "front-photo";
    const attemptExtraction = async (
      photoDataUrl: string,
      options?: {
        sourceImageId?: string;
        preferredLogoBox?: ProductReferenceSet["images"][number]["logoBox"] | null;
        useOpenAiAssist?: boolean;
      },
    ) => {
      let assistedLogoBox = options?.preferredLogoBox ?? null;

      if (options?.useOpenAiAssist) {
        try {
          const assistedDetection = await detectLogoPlacementAssist({
            photoDataUrl,
            fileName: options?.sourceImageId
              ? `${options.sourceImageId}-logo-assist.png`
              : "template-logo-assist.png",
            brandHint: brand.trim() || lookupResult?.brand || undefined,
          });
          if (assistedDetection.detected && assistedDetection.logoBox) {
            assistedLogoBox = assistedDetection.logoBox;
          }
        } catch {
          // Keep the local extraction path usable when the assist model
          // declines to return a usable box or the provider is unavailable.
        }
      }

      return extractManufacturerLogoStamp({
        photoDataUrl,
        overallHeightMm,
        brand: brand.trim() || lookupResult?.brand || undefined,
        topMarginMm,
        bottomMarginMm,
        fitDebug: lookupResult?.fitDebug ?? null,
        outline: activeBodyReferenceOutline,
        productReferenceSet: productReferenceSet ?? null,
        sourceImageId: options?.sourceImageId,
        preferredLogoBox: assistedLogoBox,
        source: options?.sourceImageId ? "lookup-photo" : stampSource,
      });
    };

    const directStamp = await attemptExtraction(primaryPhotoUrl);
    if (directStamp) return directStamp;

    if (!bodyReferencePhotoDataUrl && rawPhotoUrl) {
      try {
        const cleanDataUrl = await removeBackgroundForOutlineSeed(rawPhotoUrl, "manufacturer-logo-stamp.png");
        setBodyReferencePhotoDataUrl(cleanDataUrl);
        const cutoutStamp = await attemptExtraction(cleanDataUrl);
        if (cutoutStamp) return cutoutStamp;
      } catch {
        // Fall through to the canonical front reference image fallback.
      }
    }

    const fallbackImageUrl = canonicalFrontReferenceImage?.url ||
      lookupResult?.fitDebug?.sourceImageUrl ||
      lookupResult?.imageUrl;
    if (!fallbackImageUrl) return undefined;

    try {
      const fallbackDataUrl = await fetchImageUrlAsDataUrl(fallbackImageUrl);
      return await extractManufacturerLogoStamp({
        photoDataUrl: fallbackDataUrl,
        overallHeightMm,
        brand: brand.trim() || lookupResult?.brand || undefined,
        topMarginMm,
        bottomMarginMm,
        fitDebug: null,
        outline: null,
        productReferenceSet: productReferenceSet ?? null,
        sourceImageId: canonicalFrontReferenceImage?.id,
        preferredLogoBox: canonicalFrontReferenceImage?.logoBox ?? null,
        source: "lookup-photo",
      }) ?? undefined;
    } catch {
      return undefined;
    }
  }, [
    activeBodyReferenceOutline,
    bodyReferencePhotoDataUrl,
    brand,
    bottomMarginMm,
    canonicalFrontReferenceImage,
    frontCleanUrl,
    frontPhotoDataUrl,
    lookupResult?.brand,
    lookupResult?.fitDebug,
    lookupResult?.imageUrl,
    overallHeightMm,
    productReferenceSet,
    productPhotoFullUrl,
    productType,
    topMarginMm,
  ]);

  React.useEffect(() => {
    if (productType === "flat") {
      autoZoneSignatureRef.current = "";
      manufacturerLogoSignatureRef.current = "";
      setManufacturerLogoStamp(undefined);
      setDetectedManufacturerLogoStamp(undefined);
      setLogoAssistStatus("idle");
      setLogoAssistNote(null);
    }
  }, [productType]);

  const runAiOutlineAssist = React.useCallback(async () => {
    if (productType === "flat") return;

    const seedPhotoDataUrl = frontPhotoDataUrl || productPhotoFullUrl || "";
    if (!seedPhotoDataUrl || overallHeightMm <= 0 || effectiveCylinderDiameterMm <= 0) {
      setOutlineAssistStatus("failed");
      setOutlineAssistNote("A front/reference photo and valid body dimensions are required before running AI outline prep.");
      return;
    }

    setOutlineAssistStatus("processing");
    setOutlineAssistNote("Running AI cleanup and trace recommendation for BODY REFERENCE...");

    try {
      const preparedSeed = await prepareOutlineSeedTrace(seedPhotoDataUrl, "body-outline-seed.png");
      const svgText = await vectorizeOutlineSeedSvg(
        preparedSeed.traceSourceDataUrl,
        "body-outline-seed.png",
        preparedSeed.traceSettings,
      );
      const { outline } = createEditableBodyOutlineFromSeedSvgText({
        svgText,
        overallHeightMm,
        bodyTopFromOverallMm,
        bodyBottomFromOverallMm,
        diameterMm: effectiveCylinderDiameterMm,
        topOuterDiameterMm: topOuterDiameterMm > 0 ? topOuterDiameterMm : undefined,
        side: resolvedCalibrationHandleSide === "left" ? "right" : "left",
      });

      setBodyReferencePhotoDataUrl(preparedSeed.cleanedDataUrl);
      setBodyOutlineProfile(outline);
      setReferencePaths((current) => createReferencePaths({
        bodyOutline: outline,
        lidProfile: current.lidProfile,
        silverProfile: current.silverProfile,
      }));
      setOutlineAssistStatus("done");
      setOutlineAssistNote(
        preparedSeed.cleanupApplied
          ? "AI outline prep applied. BODY REFERENCE is now using the prepared outline seed."
          : "AI trace guidance applied. BODY REFERENCE kept the original image where possible.",
      );
    } catch (error) {
      setOutlineAssistStatus("failed");
      setOutlineAssistNote(error instanceof Error ? error.message : "AI outline prep failed.");
    }
  }, [
    bodyBottomFromOverallMm,
    bodyTopFromOverallMm,
    effectiveCylinderDiameterMm,
    frontPhotoDataUrl,
    overallHeightMm,
    productPhotoFullUrl,
    productType,
    resolvedCalibrationHandleSide,
    topOuterDiameterMm,
  ]);

  const runLogoPlacementAssist = React.useCallback(async () => {
    if (productType === "flat") return;

    setLogoAssistStatus("processing");
    setLogoAssistNote("Detecting manufacturer logo placement...");

    try {
      const stamp = await resolveManufacturerLogoStamp({ useOpenAiAssist: true });
      if (stamp) {
        setManufacturerLogoStamp(stamp);
        setDetectedManufacturerLogoStamp(stamp);
        setLogoAssistStatus("done");
        setLogoAssistNote("Logo placement detected and applied.");
      } else {
        setLogoAssistStatus("failed");
        setLogoAssistNote("No manufacturer logo could be detected from the current reference photo.");
      }
    } catch (error) {
      setLogoAssistStatus("failed");
      setLogoAssistNote(error instanceof Error ? error.message : "Logo placement assist failed.");
    }
  }, [productType, resolveManufacturerLogoStamp]);

  const applyLogoPlacementAdjustment = React.useCallback((mutate: (placement: NonNullable<ManufacturerLogoStamp["logoPlacement"]>) => NonNullable<ManufacturerLogoStamp["logoPlacement"]>) => {
    setManufacturerLogoStamp((current) => {
      if (!current?.logoPlacement) return current;
      return {
        ...current,
        logoPlacement: {
          ...mutate(current.logoPlacement),
          source: "manual",
        },
      };
    });
  }, []);

  const resetManufacturerLogoStampPlacement = React.useCallback(() => {
    setManufacturerLogoStamp(detectedManufacturerLogoStamp ?? undefined);
  }, [detectedManufacturerLogoStamp]);

  const logoPlacementSurfaceStatus = React.useMemo(() => {
    if (
      productType === "flat" ||
      !manufacturerLogoStamp?.logoPlacement ||
      !activeCanonicalDimensionCalibration ||
      !previewPrintableSurfaceContract
    ) {
      return null;
    }

    const localSurface = getPrintableSurfaceLocalBounds({
      contract: previewPrintableSurfaceContract,
      bodyTopFromOverallMm: activeCanonicalDimensionCalibration.lidBodyLineMm,
      bodyBottomFromOverallMm: activeCanonicalDimensionCalibration.bodyBottomMm,
    });
    if (!localSurface) {
      return null;
    }

    const placement = manufacturerLogoStamp.logoPlacement;
    const centerYFromBodyTopMm = Math.max(
      0,
      Math.min(
        activeCanonicalDimensionCalibration.bodyHeightMm,
        placement.sCenter * activeCanonicalDimensionCalibration.bodyHeightMm,
      ),
    );
    const heightMm = Math.max(0.5, placement.sSpan * activeCanonicalDimensionCalibration.bodyHeightMm);
    const logoTopMm = round2(centerYFromBodyTopMm - heightMm / 2);
    const logoBottomMm = round2(centerYFromBodyTopMm + heightMm / 2);
    const overlapsTop = logoTopMm < localSurface.topMm;
    const overlapsBottom = logoBottomMm > localSurface.bottomMm;

    return {
      logoTopMm,
      logoBottomMm,
      printableTopMm: localSurface.topMm,
      printableBottomMm: localSurface.bottomMm,
      overlapsTop,
      overlapsBottom,
      overlapsPrintableSurface: overlapsTop || overlapsBottom,
    };
  }, [
    activeCanonicalDimensionCalibration,
    manufacturerLogoStamp,
    previewPrintableSurfaceContract,
    productType,
  ]);

  const alignmentLogoOverlay = React.useMemo(() => {
    if (
      productType === "flat" ||
      !manufacturerLogoStamp?.logoPlacement ||
      !activeCanonicalDimensionCalibration
    ) {
      return null;
    }

    const placement = manufacturerLogoStamp.logoPlacement;
    const bodyTopMm = activeCanonicalDimensionCalibration.bodyBottomMm - activeCanonicalDimensionCalibration.bodyHeightMm;
    const centerYMm = bodyTopMm + (placement.sCenter * activeCanonicalDimensionCalibration.bodyHeightMm);
    const heightMm = Math.max(0.5, placement.sSpan * activeCanonicalDimensionCalibration.bodyHeightMm);
    const halfFrontWidthMm = activeCanonicalDimensionCalibration.frontVisibleWidthMm / 2;
    const centerXMm = Math.sin(placement.thetaCenter) * halfFrontWidthMm;
    const widthMm = Math.max(0.5, activeCanonicalDimensionCalibration.frontVisibleWidthMm * Math.sin(Math.max(0.001, placement.thetaSpan) / 2));
    const overlapsLockedPrintableSurface = Boolean(
      lockedProductionGeometry && logoPlacementSurfaceStatus?.overlapsPrintableSurface,
    );

    return {
      centerXMm,
      centerYMm,
      widthMm,
      heightMm,
      confidence: placement.confidence,
      strokeColor: overlapsLockedPrintableSurface ? "#f59e0b" : "#34c759",
    };
  }, [
    activeCanonicalDimensionCalibration,
    lockedProductionGeometry,
    logoPlacementSurfaceStatus?.overlapsPrintableSurface,
    manufacturerLogoStamp,
    productType,
  ]);

  const pipelineDebugSections = React.useMemo<PipelineDebugSection[]>(() => {
    if (productType === "flat") {
      return [];
    }

    const fmtMm = (value: number | null | undefined) =>
      typeof value === "number" && Number.isFinite(value) ? `${round2(value)} mm` : "n/a";
    const fmtPct = (value: number | null | undefined) =>
      typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 100)}%` : "n/a";
    const fmtTheta = (value: number | null | undefined) =>
      typeof value === "number" && Number.isFinite(value) ? `${round2((value * 180) / Math.PI)}°` : "n/a";

    const wrapMapping = activeCanonicalDimensionCalibration?.wrapMappingMm;
    const printableContract = activePrintableSurfaceResolution?.printableSurfaceContract ?? activeCanonicalDimensionCalibration?.printableSurfaceContract ?? null;
    const handleWidthSamples = normalizedCanonicalHandleProfile?.widthProfile ?? [];
    const handleWidthSummary = handleWidthSamples.length
      ? `${handleWidthSamples.length} samples / median ${round2(handleWidthSamples[Math.floor(handleWidthSamples.length / 2)]?.widthPx ?? 0)} px`
      : "None";
    const productReferenceSelection = productReferenceSet?.canonicalViewSelection;
    const logoWrapCenterMm =
      wrapMapping && manufacturerLogoStamp?.logoPlacement
        ? round2(
            wrapMapping.frontMeridianMm +
              ((manufacturerLogoStamp.logoPlacement.thetaCenter / (Math.PI * 2)) * activeCanonicalDimensionCalibration!.wrapWidthMm),
          )
        : null;
    const logoWrapSpanMm =
      activeCanonicalDimensionCalibration && manufacturerLogoStamp?.logoPlacement
        ? round2((manufacturerLogoStamp.logoPlacement.thetaSpan / (Math.PI * 2)) * activeCanonicalDimensionCalibration.wrapWidthMm)
        : null;
    const logoTopMm = logoPlacementSurfaceStatus?.logoTopMm ?? null;
    const logoBottomMm = logoPlacementSurfaceStatus?.logoBottomMm ?? null;
    const printableHeightMatchesOverall =
      printableContract &&
      overallHeightMm > 0 &&
      Math.abs(printableContract.printableHeightMm - overallHeightMm) <= 0.5;
    const handleSpanValue = handleSpanMm ?? 0;
    const diameterMismatchMm =
      templateWidthMm > 0 && effectiveCylinderDiameterMm > 0
        ? Math.abs((templateWidthMm / Math.PI) - effectiveCylinderDiameterMm)
        : 0;
    const handleSpanContaminatesBody =
      handleSpanValue > 0 && effectiveCylinderDiameterMm > 0 && handleSpanValue <= effectiveCylinderDiameterMm + 2;

    return [
      {
        id: "lookup-seed",
        title: "Lookup / seed",
        defaultOpen: true,
        fields: [
          {
            label: "Detected profile",
            value: lookupResult?.matchedProfileId ?? "n/a",
            source: "smart lookup / product profile match",
          },
          {
            label: "Seed source",
            value: lookupResult?.mode ?? "manual/edit",
            source: "lookup response mode",
          },
          { label: "Overall height", value: fmtMm(overallHeightMm), source: "SKU seed / stored dimensions" },
          { label: "Body diameter", value: fmtMm(effectiveCylinderDiameterMm), source: lockedProductionGeometry ? "wrapWidthMm / π" : "manual override / stored dimensions", formula: lockedProductionGeometry ? "wrapDiameterMm = wrapWidthMm / π" : undefined, override: lockedProductionGeometry ? "no" : "yes" },
          { label: "Base diameter", value: fmtMm(baseDiameterMm), source: "SKU seed / stored dimensions" },
          { label: "Wrap width", value: fmtMm(templateWidthMm), source: "locked production authoritative width", override: lockedProductionGeometry ? "no" : "yes" },
          { label: "Handle span metadata", value: fmtMm(handleSpanMm), source: "catalog metadata only", warning: handleSpanContaminatesBody ? "Handle span is too close to body diameter; verify it is not being used as body width." : undefined },
          { label: "GLB path", value: glbPath || "n/a", source: activeDrinkwareGlbStatus?.sourceLabel ?? "template draft" },
          { label: "GLB status", value: activeDrinkwareGlbStatus?.status ?? "n/a", source: "template preview binding", warning: activeDrinkwareGlbStatus?.status === "placeholder-model" ? "Placeholder model still bound." : undefined },
        ],
        note: productReferenceSelection?.canonicalBackStatus === "only-back-3q-found"
          ? "Strict back-face selection is active: only a back-3q auxiliary reference was found, so canonical back remains empty."
          : undefined,
      },
      {
        id: "image-prep",
        title: "Image prep",
        fields: [
          {
            label: "Source image",
            value: lookupResult?.fitDebug ? `${lookupResult.fitDebug.imageWidthPx} × ${lookupResult.fitDebug.imageHeightPx} px` : "n/a",
            source: "front/body reference photo",
          },
          {
            label: "Background removed",
            value: frontBgStatus === "done" || Boolean(frontCleanUrl || bodyReferencePhotoDataUrl) ? "yes" : "no",
            source: "front photo background-removal state",
          },
          {
            label: "Alpha mask present",
            value: frontBgStatus === "done" || Boolean(frontCleanUrl || bodyReferencePhotoDataUrl) ? "yes" : "no",
            source: "transparent cutout availability",
          },
          {
            label: "Clean side chosen",
            value: activeCanonicalBodyProfile?.symmetrySource ?? "n/a",
            source: "canonical body profile",
            confidence: lookupResult?.fitDebug?.fitScore != null ? fmtPct(lookupResult.fitDebug.fitScore) : undefined,
          },
        ],
      },
      {
        id: "canonical-body",
        title: "Canonical body profile",
        fields: [
          { label: "Symmetry source", value: activeCanonicalBodyProfile?.symmetrySource ?? "n/a", source: "canonicalBodyProfile" },
          { label: "Mirrored from clean side", value: activeCanonicalBodyProfile ? (activeCanonicalBodyProfile.mirroredFromSymmetrySource ? "yes" : "no") : "n/a", source: "canonicalBodyProfile" },
          { label: "Sample count", value: activeCanonicalBodyProfile ? String(activeCanonicalBodyProfile.samples.length) : "n/a", source: "canonicalBodyProfile" },
          {
            label: "Body axis",
            value: activeCanonicalBodyProfile
              ? `${round2(activeCanonicalBodyProfile.axis.xTop)}, ${round2(activeCanonicalBodyProfile.axis.yTop)} → ${round2(activeCanonicalBodyProfile.axis.xBottom)}, ${round2(activeCanonicalBodyProfile.axis.yBottom)}`
              : "n/a",
            source: "canonicalBodyProfile.axis",
          },
          {
            label: "Front SVG box",
            value: activeCanonicalDimensionCalibration
              ? `${round2(activeCanonicalDimensionCalibration.svgFrontViewBoxMm.width)} × ${round2(activeCanonicalDimensionCalibration.svgFrontViewBoxMm.height)} mm`
              : "n/a",
            source: "canonicalDimensionCalibration.svgFrontViewBoxMm",
          },
          { label: "Front visible width", value: fmtMm(activeCanonicalDimensionCalibration?.frontVisibleWidthMm), source: "canonical body shell", formula: "body-profile-derived front projection" },
          { label: "Wrap width", value: fmtMm(activeCanonicalDimensionCalibration?.wrapWidthMm ?? templateWidthMm), source: "authoritative wrap width", formula: "wrapWidthMm = π × wrapDiameterMm" },
          { label: "Total height", value: fmtMm(activeCanonicalDimensionCalibration?.totalHeightMm ?? overallHeightMm), source: "SKU seed / canonical calibration" },
          { label: "Body height", value: fmtMm(activeCanonicalDimensionCalibration?.bodyHeightMm), source: "canonical body calibration" },
          { label: "Lid/body line", value: fmtMm(activeCanonicalDimensionCalibration?.lidBodyLineMm), source: "canonical body calibration" },
          { label: "Body bottom", value: fmtMm(activeCanonicalDimensionCalibration?.bodyBottomMm), source: "canonical body calibration" },
        ],
      },
      {
        id: "printable-surface",
        title: "Printable surface contract",
        fields: [
          { label: "Printable top", value: fmtMm(printableContract?.printableTopMm), source: "printableSurfaceContract" },
          { label: "Printable bottom", value: fmtMm(printableContract?.printableBottomMm), source: "printableSurfaceContract" },
          { label: "Printable height", value: fmtMm(printableContract?.printableHeightMm), source: "printableBottomMm - printableTopMm", formula: "printableHeightMm = printableBottomMm - printableTopMm", warning: printableHeightMatchesOverall ? "Printable height is effectively equal to overall height; verify lid/ring exclusion." : undefined },
          {
            label: "Printable top source",
            value: activePrintableSurfaceResolution?.topBoundarySource ?? "n/a",
            source: "printable surface resolution",
            confidence: activePrintableSurfaceResolution ? fmtPct(activePrintableSurfaceResolution.topConfidence) : undefined,
            warning:
              activePrintableSurfaceResolution?.topBoundarySource === "body-top-fallback"
                ? "Top boundary is still using a fallback instead of semantic lid/ring detection."
                : undefined,
          },
          {
            label: "Lid band",
            value:
              printableContract?.axialExclusions.find((band) => band.kind === "lid")
                ? `${fmtMm(printableContract.axialExclusions.find((band) => band.kind === "lid")?.startMm)} → ${fmtMm(printableContract.axialExclusions.find((band) => band.kind === "lid")?.endMm)}`
                : "None",
            source: "printableSurfaceContract.axialExclusions",
          },
          {
            label: "Rim-ring band",
            value:
              printableContract?.axialExclusions.find((band) => band.kind === "rim-ring")
                ? `${fmtMm(printableContract.axialExclusions.find((band) => band.kind === "rim-ring")?.startMm)} → ${fmtMm(printableContract.axialExclusions.find((band) => band.kind === "rim-ring")?.endMm)}`
                : "None",
            source: "printableSurfaceContract.axialExclusions",
          },
          {
            label: "Axial exclusions",
            value: printableContract?.axialExclusions?.map((band) => `${band.kind} ${round2(band.startMm)}→${round2(band.endMm)} mm`).join(" / ") || "None",
            source: "printableSurfaceContract.axialExclusions",
          },
        ],
      },
      {
        id: "handle-artifact",
        title: "Handle artifact",
        fields: [
          { label: "Canonical handle profile", value: normalizedCanonicalHandleProfile ? "yes" : "no", source: "canonicalHandleProfile" },
          { label: "Handle side", value: normalizedCanonicalHandleProfile?.side ?? "n/a", source: "canonicalHandleProfile.side" },
          { label: "Handle confidence", value: fmtPct(normalizedCanonicalHandleProfile?.confidence), source: "canonicalHandleProfile.confidence", warning: normalizedCanonicalHandleProfile && normalizedCanonicalHandleProfile.confidence < 0.8 ? "Low-confidence handle extraction." : undefined },
          {
            label: "Anchors",
            value: normalizedCanonicalHandleProfile
              ? `upper ${round2(normalizedCanonicalHandleProfile.anchors.upper.sNorm)} @ ${round2(normalizedCanonicalHandleProfile.anchors.upper.xPx)}, ${round2(normalizedCanonicalHandleProfile.anchors.upper.yPx)} / lower ${round2(normalizedCanonicalHandleProfile.anchors.lower.sNorm)} @ ${round2(normalizedCanonicalHandleProfile.anchors.lower.xPx)}, ${round2(normalizedCanonicalHandleProfile.anchors.lower.yPx)}`
              : "n/a",
            source: "canonicalHandleProfile.anchors",
          },
          {
            label: "Opening box",
            value: canonicalHandleProfile?.openingBox
              ? `${round2(canonicalHandleProfile.openingBox.x)}, ${round2(canonicalHandleProfile.openingBox.y)}, ${round2(canonicalHandleProfile.openingBox.w)} × ${round2(canonicalHandleProfile.openingBox.h)} px`
              : "n/a",
            source: "canonicalHandleProfile.openingBox",
          },
          {
            label: "Attachment widths",
            value: canonicalHandleProfile
              ? `upper ${round2(canonicalHandleProfile.upperAttachmentWidthPx ?? 0)} px / lower ${round2(canonicalHandleProfile.lowerAttachmentWidthPx ?? 0)} px`
              : "n/a",
            source: "canonicalHandleProfile.upperAttachmentWidthPx/lowerAttachmentWidthPx",
          },
          {
            label: "Opening gaps",
            value: canonicalHandleProfile
              ? `upper ${round2(canonicalHandleProfile.upperOpeningGapPx ?? 0)} px / lower ${round2(canonicalHandleProfile.lowerOpeningGapPx ?? 0)} px`
              : "n/a",
            source: "canonicalHandleProfile.upperOpeningGapPx/lowerOpeningGapPx",
          },
          {
            label: "Symmetric extrusion width",
            value: canonicalHandleProfile?.symmetricExtrusionWidthPx != null
              ? `${round2(canonicalHandleProfile.symmetricExtrusionWidthPx)} px`
              : "n/a",
            source: "canonicalHandleProfile.symmetricExtrusionWidthPx",
          },
          { label: "Width profile", value: handleWidthSummary, source: "canonicalHandleProfile.widthProfile" },
          { label: "Handle render mode", value: canonicalHandleRenderMode, source: "resolveCanonicalHandleRenderMode(...)", confidence: canonicalHandleDebugSummary ? fmtPct(canonicalHandleDebugSummary.confidence) : undefined },
          {
            label: "Handle keep-out sector",
            value: wrapMapping?.handleKeepOutArcDeg != null
              ? `center ${round2(wrapMapping.handleMeridianMm ?? 0)} mm / ${round2(wrapMapping.handleKeepOutStartMm ?? 0)} → ${round2(wrapMapping.handleKeepOutEndMm ?? 0)} mm / arc ${round2(wrapMapping.handleKeepOutArcDeg)}°`
              : "None",
            source: "canonicalDimensionCalibration.wrapMappingMm",
          },
        ],
      },
      {
        id: "logo-placement",
        title: "Logo placement",
        fields: [
          { label: "Logo source", value: manufacturerLogoStamp?.logoPlacement?.source ?? "n/a", source: "manufacturerLogoStamp.logoPlacement" },
          { label: "Logo confidence", value: fmtPct(manufacturerLogoStamp?.logoPlacement?.confidence), source: "manufacturerLogoStamp.logoPlacement.confidence" },
          { label: "θ center / span", value: `${fmtTheta(manufacturerLogoStamp?.logoPlacement?.thetaCenter)} / ${fmtTheta(manufacturerLogoStamp?.logoPlacement?.thetaSpan)}`, source: "body-local coordinates" },
          {
            label: "s center / span",
            value: manufacturerLogoStamp?.logoPlacement
              ? `${round2(manufacturerLogoStamp.logoPlacement.sCenter)} / ${round2(manufacturerLogoStamp.logoPlacement.sSpan)}`
              : "n/a",
            source: "body-local coordinates",
          },
          {
            label: "Wrap-space center / span",
            value: logoWrapCenterMm != null && logoWrapSpanMm != null ? `${logoWrapCenterMm} mm / ${logoWrapSpanMm} mm` : "n/a",
            source: "front meridian + wrapWidthMm",
            formula: "wrapCenterMm = frontMeridianMm + (thetaCenter / 2π) × wrapWidthMm",
          },
          {
            label: "Axial top / bottom",
            value: logoTopMm != null && logoBottomMm != null ? `${logoTopMm} → ${logoBottomMm} mm` : "n/a",
            source: "printable surface check",
            warning: logoPlacementSurfaceStatus?.overlapsPrintableSurface ? "Logo overlaps the locked printable-height boundary." : undefined,
          },
          {
            label: "Duplicate to back",
            value: "no",
            source: "manual action only",
          },
        ],
      },
      {
        id: "wrap-export",
        title: "Wrap / export mapping",
        fields: [
          { label: "Front meridian", value: fmtMm(wrapMapping?.frontMeridianMm), source: "canonicalDimensionCalibration.wrapMappingMm" },
          { label: "Back meridian", value: fmtMm(wrapMapping?.backMeridianMm), source: "canonicalDimensionCalibration.wrapMappingMm" },
          { label: "Quarter guides", value: wrapMapping ? `${fmtMm(wrapMapping.leftQuarterMm)} / ${fmtMm(wrapMapping.rightQuarterMm)}` : "n/a", source: "canonicalDimensionCalibration.wrapMappingMm" },
          { label: "Handle meridian", value: fmtMm(wrapMapping?.handleMeridianMm), source: "canonicalDimensionCalibration.wrapMappingMm" },
          { label: "Wrap width authoritative", value: lockedProductionGeometry ? "yes" : "no", source: "locked production geometry state", override: lockedProductionGeometry ? "no" : "yes" },
          {
            label: "Exported guide set",
            value: "front / back / quarter / keep-out / printable top-bottom / logo",
            source: "guide-only export payload",
          },
          {
            label: "Coordinate system",
            value: "origin top-left / units mm / width wrapWidthMm / height printableHeightMm",
            source: "export contract",
          },
        ],
      },
      {
        id: "viewer-truth",
        title: "Viewer mode / placement truth",
        fields: [
          { label: "Current visible mode", value: previewModelMode, source: "template preview mode" },
          { label: "Production default mode", value: defaultPreviewModelMode, source: "resolveDefaultPreviewModelMode(...)" },
          { label: "Placement truth", value: "canonical alignment", source: "placement/wrap/snap contract", warning: previewModelMode === "source-traced" ? "Source model visible; placement still uses canonical alignment data." : undefined },
          { label: "Body-only camera fit", value: previewModelMode === "alignment-model" ? "yes" : "n/a", source: "alignment-model camera", },
        ],
      },
      {
        id: "consistency",
        title: "Warnings / consistency checks",
        fields: [
          { label: "Wrap vs diameter mismatch", value: `${round2(diameterMismatchMm)} mm`, source: "wrapWidthMm / π vs effective diameter", warning: diameterMismatchMm > 0.5 ? "Mismatch exceeds tolerance." : undefined },
          { label: "Overall reused as printable", value: printableHeightMatchesOverall ? "possible" : "no", source: "printable height consistency", warning: printableHeightMatchesOverall ? "Printable height is too close to overall height." : undefined },
          { label: "Handle span contaminates body", value: handleSpanContaminatesBody ? "possible" : "no", source: "body vs handle metadata", warning: handleSpanContaminatesBody ? "Handle span is near the effective diameter." : undefined },
          { label: "Printable bounds valid", value: printableContract && printableContract.printableTopMm < printableContract.printableBottomMm ? "yes" : "no", source: "printableSurfaceContract", warning: printableContract && printableContract.printableTopMm >= printableContract.printableBottomMm ? "Printable top is greater than or equal to printable bottom." : undefined },
          { label: "Canonical contracts present", value: activeCanonicalBodyProfile && activeCanonicalDimensionCalibration ? "yes" : "no", source: "stored canonical contracts", warning: !activeCanonicalBodyProfile || !activeCanonicalDimensionCalibration ? "Missing canonical body profile or calibration." : undefined },
        ],
      },
    ];
  }, [
    activeCanonicalBodyProfile,
    activeCanonicalDimensionCalibration,
    activeDrinkwareGlbStatus?.sourceLabel,
    activeDrinkwareGlbStatus?.status,
    activePrintableSurfaceResolution,
    bodyReferencePhotoDataUrl,
    canonicalHandleDebugSummary,
    canonicalHandleProfile,
    canonicalHandleRenderMode,
    defaultPreviewModelMode,
    effectiveCylinderDiameterMm,
    baseDiameterMm,
    frontBgStatus,
    frontCleanUrl,
    glbPath,
    handleSpanMm,
    lockedProductionGeometry,
    logoPlacementSurfaceStatus,
    lookupResult?.fitDebug,
    lookupResult?.matchedProfileId,
    lookupResult?.mode,
    manufacturerLogoStamp,
    overallHeightMm,
    previewModelMode,
    productReferenceSet?.canonicalViewSelection,
    productType,
    templateWidthMm,
  ]);

  const pipelineDebugWarnings = bodyReferenceWarnings;
  /*
    const warnings: string[] = [];
    const printableContract = activePrintableSurfaceResolution?.printableSurfaceContract ?? activeCanonicalDimensionCalibration?.printableSurfaceContract ?? null;

    if (!activeCanonicalBodyProfile || !activeCanonicalDimensionCalibration) {
      warnings.push("Missing canonical body profile or canonical dimension calibration.");
    }
    if (templateWidthMm > 0 && effectiveCylinderDiameterMm > 0) {
      const mismatch = Math.abs((templateWidthMm / Math.PI) - effectiveCylinderDiameterMm);
      if (mismatch > 0.5) {
        warnings.push(`Wrap width and cylinder diameter differ by ${round2(mismatch)} mm through π.`);
      }
    }
    if (printableContract && printableContract.printableTopMm >= printableContract.printableBottomMm) {
      warnings.push("Printable top is greater than or equal to printable bottom.");
    }
    if (printableContract && overallHeightMm > 0 && Math.abs(printableContract.printableHeightMm - overallHeightMm) <= 0.5) {
      warnings.push("Printable height is effectively equal to overall height; verify lid/ring exclusion.");
    }
    const handleSpanValue = handleSpanMm ?? 0;
    if (handleSpanValue > 0 && effectiveCylinderDiameterMm > 0 && handleSpanValue <= effectiveCylinderDiameterMm + 2) {
      warnings.push("Handle span metadata is too close to the body diameter and may be contaminating sizing.");
    }
    if (canonicalHandleProfile && canonicalHandleProfile.confidence < 0.8) {
      warnings.push(`Handle confidence is only ${Math.round(canonicalHandleProfile.confidence * 100)}%.`);
    }
    if (logoPlacementSurfaceStatus?.overlapsPrintableSurface) {
      warnings.push("Logo overlaps the locked printable-height boundary.");
    }
    if (previewModelMode === "source-traced") {
      warnings.push("Source traced model is visible; placement still uses canonical alignment data.");
    }
    return warnings;
  }, [
    activeCanonicalBodyProfile,
    activeCanonicalDimensionCalibration,
    activePrintableSurfaceResolution?.printableSurfaceContract,
    canonicalHandleProfile,
    effectiveCylinderDiameterMm,
    handleSpanMm,
    logoPlacementSurfaceStatus?.overlapsPrintableSurface,
    overallHeightMm,
    previewModelMode,
    templateWidthMm,
  ]);

  */

  const templateProvenanceBadges = React.useMemo(
    () => {
      const badges: Array<{ label: string; tone: TemplateReadinessStatus }> = [];
      if (smartLookupApplied || lookupResult || flatLookupResult || flatLookupMatch) {
        badges.push({ label: "Lookup seeded", tone: "ready" });
      }
      if (activeDrinkwareGlbStatus?.status === "verified-product-model") {
        badges.push({ label: "Verified 3D model", tone: "ready" });
      } else if (glbPath.trim()) {
        badges.push({ label: "Custom 3D model", tone: "review" });
      }
      if ((productReferenceSet?.images.length ?? 0) > 0) {
        badges.push({ label: `Reference set (${productReferenceSet?.images.length})`, tone: "ready" });
      }
      if (tumblerMapping?.isMapped) {
        badges.push({ label: "Orientation mapped", tone: "ready" });
      }
      if (advancedGeometryOverridesUnlocked) {
        badges.push({ label: "Geometry overrides unlocked", tone: "review" });
      }
      return badges;
    },
    [
      activeDrinkwareGlbStatus?.status,
      advancedGeometryOverridesUnlocked,
      flatLookupMatch,
      flatLookupResult,
      glbPath,
      lookupResult,
      productReferenceSet?.images.length,
      smartLookupApplied,
      tumblerMapping?.isMapped,
    ],
  );

  const saveBlockingIssues = React.useMemo(() => {
    const issues: string[] = [];
    if (!name.trim()) issues.push("Product name is required.");
    if (!productType) issues.push("Product type is required.");
    if (productType === "flat" && flatWidthMm <= 0) {
      issues.push("Template width must be > 0 for flat products.");
    }
    if (productType && productType !== "flat" && templateWidthMm <= 0) {
      issues.push("Wrap width / circumference must be > 0 for non-flat products.");
    }
    if (productType && productType !== "flat" && effectiveCylinderDiameterMm <= 0) {
      issues.push("Cylinder diameter could not be derived from wrap width.");
    }
    if (productType && productType !== "flat" && !activeCanonicalBodyProfile) {
      issues.push("Canonical body profile is missing. Finish BODY REFERENCE before saving.");
    }
    if (productType && productType !== "flat" && !activeCanonicalDimensionCalibration) {
      issues.push("Canonical dimension calibration is missing. Re-run lookup or BODY REFERENCE before saving.");
    }
    if (productType && productType !== "flat" && bodyReferenceQa?.severity === "action") {
      issues.push(...bodyReferenceWarnings);
    }
    if (productType && productType !== "flat" && glbPath.trim() && !tumblerMapping?.isMapped) {
      issues.push("Map tumbler orientation before saving a 3D-backed drinkware template.");
    }
    if (hasBlockingGeometryMismatch) {
      issues.push(`Cylinder diameter override is inconsistent with wrap width by ${derivedDiameterMismatchMm.toFixed(2)} mm. Recompute derived fields from wrap width or relock production geometry.`);
    }
    if (printHeightMm <= 0) issues.push("Print height must be > 0.");
    if (productType && productType !== "flat" && printableHeightLooksLikeOverallHeight) {
      issues.push("Printable height still matches overall assembled height. Re-run body analysis or set printable boundaries before saving.");
    }
    if (productType && productType !== "flat" && handleSpanContaminatesBodyWidth) {
      issues.push("Overall handle span is matching the body diameter. Handle span metadata must not be used as body width or wrap math.");
    }
    if (
      productType &&
      productType !== "flat" &&
      overallHeightMm > 0 &&
      (bodyBottomFromOverallMm <= bodyTopFromOverallMm || bodyBottomFromOverallMm > overallHeightMm)
    ) {
      issues.push("Body top/bottom reference is invalid. Re-run lookup or adjust the body bounds.");
    }
    if (glbPath.trim() && glbUploadError?.startsWith("Model file not found:")) {
      issues.push("3D model path is missing or invalid.");
    }
    return Array.from(new Set(issues));
  }, [
    activeCanonicalBodyProfile,
    activeCanonicalDimensionCalibration,
    bodyReferenceQa?.severity,
    bodyReferenceWarnings,
    bodyBottomFromOverallMm,
    bodyTopFromOverallMm,
    derivedDiameterMismatchMm,
    effectiveCylinderDiameterMm,
    flatWidthMm,
    glbPath,
    glbUploadError,
    handleSpanContaminatesBodyWidth,
    hasBlockingGeometryMismatch,
    name,
    overallHeightMm,
    printHeightMm,
    printableHeightLooksLikeOverallHeight,
    productType,
    templateWidthMm,
    tumblerMapping?.isMapped,
  ]);

  const templateReadinessItems = React.useMemo(
    () => {
      const items: Array<{ label: string; status: TemplateReadinessStatus; detail: string }> = [];
      items.push({
        label: "Product identity",
        status: name.trim() && productType ? "ready" : "action",
        detail: name.trim() && productType ? "Name and product type are set." : "Add a product name and choose the product type.",
      });
      items.push({
        label: "Reference photos",
        status: productType === "flat"
          ? "review"
          : (activeReferencePhotoDataUrl || productPhotoFullUrl ? "ready" : "review"),
        detail: productType === "flat"
          ? "Not required for flat items."
          : (activeReferencePhotoDataUrl || productPhotoFullUrl
            ? "Front/reference imagery is attached for visual QA."
            : "Add a front/reference photo so BODY REFERENCE can be reviewed against a real image."),
      });
      items.push({
        label: "Body calibration",
        status: productType === "flat"
          ? "review"
          : (activeCanonicalBodyProfile && activeCanonicalDimensionCalibration
            ? (bodyReferenceQa?.severity === "action" ? "action" : (bodyReferenceWarnings.length > 0 ? "review" : "ready"))
            : "action"),
        detail: productType === "flat"
          ? "Not required for flat items."
          : (!activeCanonicalBodyProfile || !activeCanonicalDimensionCalibration
            ? "Canonical body contracts are missing."
            : bodyReferenceWarnings[0]
              ? bodyReferenceWarnings[0]
              : "Canonical body profile and printable surface contract are locked."),
      });
      items.push({
        label: "3D preview + orientation",
        status: productType === "flat"
          ? "review"
          : (!glbPath.trim()
            ? "review"
            : (glbUploadError?.startsWith("Model file not found:")
              ? "action"
              : (tumblerMapping?.isMapped ? "ready" : "action"))),
        detail: productType === "flat"
          ? "Not required for flat items."
          : (!glbPath.trim()
            ? "Optional. Add a GLB if this template should open with a 3D preview."
            : (glbUploadError?.startsWith("Model file not found:")
              ? "The configured GLB path is missing."
              : (tumblerMapping?.isMapped
                ? "Orientation mapping has been confirmed."
                : "Map the tumbler orientation before saving."))),
      });
      items.push({
        label: "Workflow provenance",
        status: templateProvenanceBadges.length > 0 ? "ready" : "review",
        detail: templateProvenanceBadges.length > 0
          ? templateProvenanceBadges.map((badge) => badge.label).join(" • ")
          : "No lookup or template provenance is attached yet.",
      });
      return items;
    },
    [
      activeCanonicalBodyProfile,
      activeCanonicalDimensionCalibration,
      activeReferencePhotoDataUrl,
      bodyReferenceQa?.severity,
      bodyReferenceWarnings,
      glbPath,
      glbUploadError,
      name,
      productPhotoFullUrl,
      productType,
      templateProvenanceBadges,
      tumblerMapping?.isMapped,
    ],
  );

  const saveDisabledReason = saveBlockingIssues[0] ?? null;

  const pipelineDebugRawObjects = React.useMemo<PipelineDebugRawObject[]>(() => ([
    { id: "canonical-body-profile", label: "canonicalBodyProfile", value: activeCanonicalBodyProfile },
    { id: "canonical-dimension-calibration", label: "canonicalDimensionCalibration", value: activeCanonicalDimensionCalibration },
    { id: "printable-surface-contract", label: "printableSurfaceContract", value: activePrintableSurfaceResolution?.printableSurfaceContract ?? activeCanonicalDimensionCalibration?.printableSurfaceContract ?? null },
    { id: "body-reference-qa", label: "bodyReferenceQA", value: bodyReferenceQa },
    { id: "body-reference-contract-version", label: "bodyReferenceContractVersion", value: bodyReferenceContractVersion },
    { id: "canonical-handle-profile", label: "canonicalHandleProfile", value: canonicalHandleProfile ?? null },
    { id: "logo-placement", label: "logoPlacement", value: manufacturerLogoStamp?.logoPlacement ?? null },
  ]), [
    activeCanonicalBodyProfile,
    activeCanonicalDimensionCalibration,
    activePrintableSurfaceResolution?.printableSurfaceContract,
    bodyReferenceContractVersion,
    bodyReferenceQa,
    canonicalHandleProfile,
    manufacturerLogoStamp?.logoPlacement,
  ]);

  const pipelineDebugFormulas = React.useMemo(
    () => [
      "Cylinder diameter = wrapWidthMm / π",
      "Printable height = printableBottomMm - printableTopMm",
      "Logo wrap center = frontMeridianMm + (thetaCenter / 2π) × wrapWidthMm",
      "Logo wrap span = (thetaSpan / 2π) × wrapWidthMm",
      "Handle keep-out width = wrapWidthMm × (handleKeepOutArcDeg / 360)",
      "Alignment shell fit = svgFrontViewBoxMm + fixed body-only padding",
    ],
    [],
  );

  const pipelineDebugJson = React.useMemo(
    () => ({
      lookup: {
        matchedProfileId: lookupResult?.matchedProfileId ?? null,
        mode: lookupResult?.mode ?? null,
        glbPath: glbPath || null,
        glbStatus: activeDrinkwareGlbStatus?.status ?? null,
        glbSourceLabel: activeDrinkwareGlbStatus?.sourceLabel ?? null,
      },
      imagePrep: {
        sourceImage: lookupResult?.fitDebug
          ? {
              widthPx: lookupResult.fitDebug.imageWidthPx,
              heightPx: lookupResult.fitDebug.imageHeightPx,
            }
          : null,
        backgroundRemoved: frontBgStatus === "done" || Boolean(frontCleanUrl || bodyReferencePhotoDataUrl),
        alphaMaskPresent: frontBgStatus === "done" || Boolean(frontCleanUrl || bodyReferencePhotoDataUrl),
      },
      canonicalBodyProfile: activeCanonicalBodyProfile,
      canonicalDimensionCalibration: activeCanonicalDimensionCalibration,
      printableSurfaceContract: activePrintableSurfaceResolution?.printableSurfaceContract ?? activeCanonicalDimensionCalibration?.printableSurfaceContract ?? null,
      bodyReferenceQA: bodyReferenceQa,
      bodyReferenceContractVersion,
      canonicalHandleProfile: normalizedCanonicalHandleProfile ?? null,
      logoPlacement: manufacturerLogoStamp?.logoPlacement ?? null,
      viewer: {
        previewModelMode,
        defaultPreviewModelMode,
        lockedProductionGeometry,
      },
      warnings: pipelineDebugWarnings,
    }),
    [
      activeCanonicalBodyProfile,
      activeCanonicalDimensionCalibration,
      activeDrinkwareGlbStatus?.sourceLabel,
      activeDrinkwareGlbStatus?.status,
      activePrintableSurfaceResolution?.printableSurfaceContract,
      bodyReferenceContractVersion,
      bodyReferenceQa,
      bodyReferencePhotoDataUrl,
      defaultPreviewModelMode,
      frontBgStatus,
      frontCleanUrl,
      glbPath,
      lockedProductionGeometry,
      lookupResult?.fitDebug,
      lookupResult?.matchedProfileId,
      lookupResult?.mode,
      manufacturerLogoStamp?.logoPlacement,
      canonicalHandleProfile,
      pipelineDebugWarnings,
      previewModelMode,
    ],
  );

  React.useEffect(() => {
    if (productType === "flat") {
      autoZoneSignatureRef.current = "";
      return;
    }

    const autoZone = deriveEngravableZoneFromFitDebug({
      overallHeightMm,
      fitDebug: lookupResult?.fitDebug ?? null,
    });
    if (!autoZone || overallHeightMm <= 0) {
      autoZoneSignatureRef.current = "";
      return;
    }

    const signature = JSON.stringify({
      overallHeightMm: round2(overallHeightMm),
      sourceImageUrl: lookupResult?.fitDebug?.sourceImageUrl ?? "",
      imageSize: lookupResult?.fitDebug
        ? `${lookupResult.fitDebug.imageWidthPx}x${lookupResult.fitDebug.imageHeightPx}`
        : "",
      bounds: lookupResult?.fitDebug
        ? `${lookupResult.fitDebug.fullTopPx}:${lookupResult.fitDebug.fullBottomPx}:${lookupResult.fitDebug.rimBottomPx}:${lookupResult.fitDebug.bodyBottomPx}`
        : "",
      bodyTopFromOverallMm: autoZone.bodyTopFromOverallMm,
      bodyBottomFromOverallMm: autoZone.bodyBottomFromOverallMm,
      bodyHeightMm: autoZone.bodyHeightMm,
      topMarginMm: autoZone.topMarginMm,
      bottomMarginMm: autoZone.bottomMarginMm,
      printHeightMm: autoZone.printHeightMm,
    });

    if (autoZoneSignatureRef.current === signature) return;
    autoZoneSignatureRef.current = signature;

    setBodyTopFromOverallMm(autoZone.bodyTopFromOverallMm);
    setBodyBottomFromOverallMm(autoZone.bodyBottomFromOverallMm);
    if (!hasSemanticTopBandData) {
      setLidSeamFromOverallMm(undefined);
      setSilverBandBottomFromOverallMm(undefined);
    }
    setPrintableTopOverrideMm(undefined);
    setPrintableBottomOverrideMm(undefined);
    setTopMarginMm(autoZone.topMarginMm);
    setBottomMarginMm(autoZone.bottomMarginMm);
    setPrintHeightMm(autoZone.printHeightMm);
  }, [hasSemanticTopBandData, lookupResult?.fitDebug, overallHeightMm, productType]);

  // ── Validation ───────────────────────────────────────────────────
  const [errors, setErrors] = React.useState<string[]>([]);
  const errorSummaryRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (errors.length === 0) return;
    errorSummaryRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [errors]);

  /** Handle product image selection — store file for auto-detect, generate thumbnail + full-res */
  const handleProductImage = React.useCallback(async (file: File) => {
    setProductImageFile(file);
    setProductImageLabel(file.name);
    setDetectResult(null);
    setDetectError(null);
    // Thumbnail: 120x120 cropped (for gallery cards)
    const thumb = await generateThumbnail(file);
    setThumbDataUrl(thumb);
    // Full-res: max 1024px (for grid overlay)
    const full = await fileToFacePhotoDataUrl(file, 1024);
    if (full) setProductPhotoFullUrl(full);
  }, []);

  const clearProductImage = React.useCallback(() => {
    setProductImageFile(null);
    setProductImageLabel(null);
    setThumbDataUrl("");
    setProductPhotoFullUrl("");
    autoZoneSignatureRef.current = "";
    bodyOutlineSeedSignatureRef.current = "";
    manufacturerLogoSignatureRef.current = "";
    setPrintableSurfaceDetection(null);
    setPrintableTopOverrideMm(undefined);
    setPrintableBottomOverrideMm(undefined);
    setManufacturerLogoStamp(undefined);
    setDetectedManufacturerLogoStamp(undefined);
    setDetectResult(null);
    setDetectError(null);
  }, []);

  const applyFacePhotoFile = React.useCallback(async (
    file: File,
    side: "front" | "back",
  ) => {
    const original = await fileToFacePhotoDataUrl(file);
    if (!original) return;

    if (side === "front") {
      setFrontOriginalUrl(original);
      setFrontCleanUrl("");
      setFrontPhotoDataUrl(original);
      setFrontUseOriginal(false);
      setFrontBgStatus("idle");
      return;
    }

    setBackOriginalUrl(original);
    setBackCleanUrl("");
    setBackPhotoDataUrl(original);
    setBackUseOriginal(false);
    setBackBgStatus("idle");
  }, []);

  const resolveLookupPhotoUrl = React.useCallback(async (
    photoUrl: string,
  ): Promise<{ file: File; dataUrl: string }> => {
    const imageRes = await fetch("/api/admin/flatbed/fetch-url", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ url: photoUrl }),
    });
    const imagePayload = await imageRes.json();
    if (!imageRes.ok || !imagePayload.dataUrl) {
      throw new Error(
        typeof imagePayload?.error === "string"
          ? imagePayload.error
          : "Product photo could not be pulled from the lookup result.",
      );
    }

    const dataUrl = imagePayload.dataUrl as string;
    const imgFetch = await fetch(dataUrl);
    const blob = await imgFetch.blob();
    const mimeType = imagePayload.mimeType ?? blob.type ?? "image/jpeg";
    const fileName = photoUrl.split("/").pop() ?? "lookup-product-image.jpg";
    const file = new File([blob], fileName, { type: mimeType });

    return { file, dataUrl };
  }, []);

  const applyResolvedProductPhotoUrl = React.useCallback(async (
    photoUrl: string,
    label: string | null,
  ): Promise<{ file: File; dataUrl: string }> => {
    const { file, dataUrl } = await resolveLookupPhotoUrl(photoUrl);
    await handleProductImage(file);
    setProductImageLabel(label ?? "Lookup product photo");
    setLookupDebugImageUrl(dataUrl);
    return { file, dataUrl };
  }, [handleProductImage, resolveLookupPhotoUrl]);

  const applyProfileOrDimensions = React.useCallback((args: {
    brand: string | null | undefined;
    model: string | null | undefined;
    capacityOz?: number | null;
    outsideDiameterMm?: number | null;
    topDiameterMm?: number | null;
    bottomDiameterMm?: number | null;
    overallHeightMm?: number | null;
    usableHeightMm?: number | null;
  }) => {
    const profileId = findTumblerProfileIdForBrandModel({
      brand: args.brand,
      model: args.model,
      capacityOz: args.capacityOz,
    });
    const matchedProfile = profileId ? getTumblerProfileById(profileId) : null;
    const resolvedBodyDiameterMm = resolveBodyReferenceDiameterMm({
      outsideDiameterMm: matchedProfile?.outsideDiameterMm ?? args.outsideDiameterMm,
      topDiameterMm: matchedProfile?.topDiameterMm ?? args.topDiameterMm,
      bottomDiameterMm: matchedProfile?.bottomDiameterMm ?? args.bottomDiameterMm,
      fallbackOutsideDiameterMm: matchedProfile?.outsideDiameterMm ?? null,
    });
    const resolvedTopOuterDiameterMm =
      matchedProfile?.topDiameterMm ??
      args.topDiameterMm ??
      resolvedBodyDiameterMm;
    const resolvedBaseDiameterMm =
      matchedProfile?.bottomDiameterMm ??
      args.bottomDiameterMm ??
      resolvedBodyDiameterMm;

    if (resolvedBodyDiameterMm) {
      setDiameterMm(round2(resolvedBodyDiameterMm));
      setWrapWidthInputMm(round2(matchedProfile?.wrapWidthMm ?? (Math.PI * resolvedBodyDiameterMm)));
    }
    if (resolvedTopOuterDiameterMm) {
      setTopOuterDiameterMm(round2(resolvedTopOuterDiameterMm));
    }
    if (resolvedBaseDiameterMm) {
      setBaseDiameterMm(round2(resolvedBaseDiameterMm));
    }

    if (matchedProfile?.usableHeightMm) {
      setPrintHeightMm(round2(matchedProfile.usableHeightMm));
    } else if (args.usableHeightMm) {
      setPrintHeightMm(round2(args.usableHeightMm));
    }

    const profileArc = getProfileHandleArcDeg(matchedProfile);
    setHandleArcDeg(profileArc);
    if (matchedProfile) {
      const oh = matchedProfile.overallHeightMm;
      setOverallHeightMm(round2(oh));
      const usable = matchedProfile.usableHeightMm;
      const topM = matchedProfile.guideBand?.upperGrooveYmm ?? round2((oh - usable) / 2);
      const bottomM = round2(Math.max(0, oh - usable - topM));
      setBodyTopFromOverallMm(topM);
      setBodyBottomFromOverallMm(round2(oh - bottomM));
      setTopMarginMm(topM);
      setBottomMarginMm(bottomM);
      setLidSeamFromOverallMm(
        typeof matchedProfile.lidSeamFromOverallMm === "number"
          ? round2(matchedProfile.lidSeamFromOverallMm)
          : undefined,
      );
      setSilverBandBottomFromOverallMm(
        typeof matchedProfile.silverBandBottomFromOverallMm === "number"
          ? round2(matchedProfile.silverBandBottomFromOverallMm)
          : undefined,
      );
      if (matchedProfile.shapeType === "tapered") {
        const top = matchedProfile.topDiameterMm ?? null;
        const bottom = matchedProfile.bottomDiameterMm ?? null;
        if (top && bottom) {
          setTaperCorrection(top < bottom ? "top-narrow" : "bottom-narrow");
        }
      } else {
        setTaperCorrection("none");
      }
      return;
    }

    if (args.overallHeightMm) {
      setOverallHeightMm(round2(args.overallHeightMm));
    }
    if (args.overallHeightMm && args.usableHeightMm) {
      const topM = round2((args.overallHeightMm - args.usableHeightMm) / 2);
      const bottomM = round2(Math.max(0, args.overallHeightMm - args.usableHeightMm - topM));
      setBodyTopFromOverallMm(topM);
      setBodyBottomFromOverallMm(round2(args.overallHeightMm - bottomM));
      setTopMarginMm(topM);
      setBottomMarginMm(bottomM);
    }
    setLidSeamFromOverallMm(undefined);
    setSilverBandBottomFromOverallMm(undefined);
    if (
      resolvedTopOuterDiameterMm &&
      resolvedBaseDiameterMm &&
      resolvedTopOuterDiameterMm !== resolvedBaseDiameterMm
    ) {
      setTaperCorrection(resolvedTopOuterDiameterMm < resolvedBaseDiameterMm ? "top-narrow" : "bottom-narrow");
    } else {
      setTaperCorrection("none");
    }
  }, []);

  const applySmartLookupResult = React.useCallback(async (
    result: SmartTemplateLookupResponse,
    files: {
      analysisImageFile: File | null;
      frontPhotoFile: File | null;
      backPhotoFile: File | null;
    },
  ) => {
    const draft = result.templateDraft;
    const draftDims = draft.dimensions;
    const resolvedProductReferenceSet =
      draft.productReferenceSet ??
      result.tumblerLookupResult?.productReferenceSet ??
      undefined;
    const resolvedReferenceImagesById = new Map(
      (resolvedProductReferenceSet?.images ?? []).map((image) => [image.id, image] as const),
    );
    const canonicalFrontReferenceImage =
      resolvedProductReferenceSet?.canonicalViewSelection?.canonicalFrontImageId
        ? (resolvedReferenceImagesById.get(resolvedProductReferenceSet.canonicalViewSelection.canonicalFrontImageId) ?? null)
        : resolvedProductReferenceSet?.canonicalFrontImageId
          ? (resolvedReferenceImagesById.get(resolvedProductReferenceSet.canonicalFrontImageId) ?? null)
          : null;
    const tracedFrontReferenceUrl =
      !result.tumblerLookupResult?.fitDebug &&
      result.flatLookupResult?.traceDebug?.accepted &&
      (result.flatLookupResult.traceDebug.outlinePointsPx.length ?? 0) > 20
        ? result.flatLookupResult.traceDebug.sourceImageUrl
        : null;
    const preferredFrontPhotoUrl = tracedFrontReferenceUrl ?? canonicalFrontReferenceImage?.url ?? draft.productPhotoUrl ?? null;
    const matchedLookupProfile = result.matchedProfileId
      ? getTumblerProfileById(result.matchedProfileId)
      : null;
    const matchedFlatItem = result.matchedFlatItemId
      ? (FLAT_BED_ITEMS.find((item) => item.id === result.matchedFlatItemId) ?? null)
      : null;
    const primaryProductImageFile = files.frontPhotoFile ?? files.analysisImageFile;

    setErrors([]);
    setDetectError(null);
    setDetectResult(null);
    setLookupError(null);
    setSmartLookupApplied(true);
    setLookupResult(result.tumblerLookupResult ?? null);
    setFlatLookupResult(result.flatLookupResult ?? null);
    setProductReferenceSet(resolvedProductReferenceSet);
    setFlatLookupMatch(
      result.flatLookupResult?.matchedItemId
        ? (FLAT_BED_ITEMS.find((item) => item.id === result.flatLookupResult!.matchedItemId) ?? null)
        : matchedFlatItem,
    );

    // Smart lookup should not carry forward a stale auto-seeded BODY REFERENCE
    // shell from a previous lookup. Let the current lookup/photo reseed it.
    if (!editingTemplate) {
      setBodyOutlineProfile(undefined);
      setReferencePaths(createReferencePaths({
        bodyOutline: null,
        lidProfile: null,
        silverProfile: null,
      }));
      setReferenceLayerState(cloneReferenceLayerState(null));
    }

    // When lookup owns the face photos, clear any prior in-memory render state first
    // so rerunning lookup in the same open modal cannot keep a stale image alive.
    if (!files.frontPhotoFile) {
      setFrontOriginalUrl("");
      setFrontPhotoDataUrl("");
      setFrontCleanUrl("");
      setFrontUseOriginal(false);
      setFrontBgStatus("idle");
      setBodyReferencePhotoDataUrl("");
    }
    if (!files.backPhotoFile) {
      setBackOriginalUrl("");
      setBackPhotoDataUrl("");
      setBackCleanUrl("");
      setBackUseOriginal(false);
      setBackBgStatus("idle");
    }

    let resolvedLookupPhotoFile: File | null = null;
    let resolvedLookupBackPhotoFile: File | null = null;
    if (primaryProductImageFile) {
      await handleProductImage(primaryProductImageFile);
      setLookupDebugImageUrl("");
    }
    if (!files.frontPhotoFile && preferredFrontPhotoUrl && draft.productType && draft.productType !== "flat") {
      try {
        const resolvedFront = await resolveLookupPhotoUrl(preferredFrontPhotoUrl);
        resolvedLookupPhotoFile = resolvedFront.file;
        setProductImageLabel(
          canonicalFrontReferenceImage
            ? draft.productPhotoLabel ?? "Canonical front reference"
            : draft.productPhotoLabel ?? "Lookup product photo",
        );
        setLookupDebugImageUrl(resolvedFront.dataUrl);
      } catch {
        // Non-fatal: dimensions and categorization should still be applied.
      }
    } else if (!primaryProductImageFile && preferredFrontPhotoUrl) {
      try {
        const resolved = await applyResolvedProductPhotoUrl(
          preferredFrontPhotoUrl,
          canonicalFrontReferenceImage
            ? draft.productPhotoLabel ?? "Canonical front reference"
            : draft.productPhotoLabel ?? null,
        );
        resolvedLookupPhotoFile = resolved.file;
      } catch {
        // Non-fatal: dimensions and categorization should still be applied.
      }
    }
    if (!files.backPhotoFile && draft.backPhotoUrl && draft.productType && draft.productType !== "flat") {
      try {
        const resolvedBack = await resolveLookupPhotoUrl(draft.backPhotoUrl);
        resolvedLookupBackPhotoFile = resolvedBack.file;
      } catch {
        // Non-fatal: keep the mirrored fallback when the opposite-side photo cannot be pulled.
      }
    }

    if (files.frontPhotoFile) {
      await applyFacePhotoFile(files.frontPhotoFile, "front");
    } else if (resolvedLookupPhotoFile && draft.productType && draft.productType !== "flat") {
      await applyFacePhotoFile(resolvedLookupPhotoFile, "front");
    }
    if (files.backPhotoFile) {
      setMirrorForBack(false);
      await applyFacePhotoFile(files.backPhotoFile, "back");
    } else if (resolvedLookupBackPhotoFile && draft.productType && draft.productType !== "flat") {
      setMirrorForBack(false);
      await applyFacePhotoFile(resolvedLookupBackPhotoFile, "back");
    } else if ((files.frontPhotoFile || resolvedLookupPhotoFile) && draft.productType && draft.productType !== "flat") {
      setMirrorForBack(false);
      setBackPhotoDataUrl("");
      setBackOriginalUrl("");
      setBackCleanUrl("");
      setBackUseOriginal(false);
      setBackBgStatus("idle");
    }

    const normalizedDraftName =
      result.tumblerLookupResult != null
        ? buildTemplateDisplayName({
            brand: draft.brand ?? result.tumblerLookupResult.brand,
            model: result.tumblerLookupResult.model,
            capacityOz: parseCapacityOzValue(draft.capacity) ?? result.tumblerLookupResult.capacityOz,
            fallbackTitle: draft.name,
            fallbackRaw: draft.name,
          })
        : draft.name;
    if (normalizedDraftName) setName(normalizedDraftName);
    if (draft.brand !== undefined && draft.brand !== null) setBrand(draft.brand);
    if (draft.capacity !== undefined && draft.capacity !== null) setCapacity(draft.capacity);
    if (draft.laserType) setLaserType(draft.laserType);
    if (draft.productType) setProductType(draft.productType);
    if (draft.materialSlug !== undefined) {
      setResolvedMaterialSlug(draft.materialSlug ?? "");
    }
    if (draft.materialLabel !== undefined) {
      setResolvedMaterialLabel(draft.materialLabel ?? "");
    }
    materialProfileTouchedRef.current = false;
    applyMaterialProfileSettings(
      draft.materialProfileId ?? "",
      draft.laserType,
      draft.productType,
    );

    if (draft.glbPath !== undefined) {
      const nextGlbPath =
        draft.productType === "flat"
          ? (draft.glbPath ?? "")
          : draft.glbStatus === "verified-product-model"
            ? (draft.glbPath ?? "")
            : "";
      setGlbPath(nextGlbPath);
      setGlbFileName(nextGlbPath ? (nextGlbPath.split("/").pop() ?? null) : null);
      setGlbUploadError(null);
    }

    if (draft.productType === "flat") {
      setDiameterMm(0);
      setWrapWidthInputMm(0);
      setTopOuterDiameterMm(0);
      setBaseDiameterMm(0);
      setAdvancedGeometryOverridesUnlocked(false);
      setTumblerMapping(undefined);
      setHandleArcDeg(0);
      setTaperCorrection("none");
      setOverallHeightMm(draftDims?.overallHeightMm ?? 0);
      setBodyTopFromOverallMm(draftDims?.bodyTopFromOverallMm ?? 0);
      setBodyBottomFromOverallMm(
        draftDims?.bodyBottomFromOverallMm ??
          (
            draftDims?.overallHeightMm != null && draftDims?.bottomMarginMm != null
              ? round2(draftDims.overallHeightMm - draftDims.bottomMarginMm)
              : 0
          ),
      );
      setLidSeamFromOverallMm(draftDims?.lidSeamFromOverallMm ?? undefined);
      setSilverBandBottomFromOverallMm(draftDims?.silverBandBottomFromOverallMm ?? undefined);
      setPrintableSurfaceDetection(null);
      setPrintableTopOverrideMm(undefined);
      setPrintableBottomOverrideMm(undefined);
      setHandleTopFromOverallMm(draftDims?.handleTopFromOverallMm ?? undefined);
      setHandleBottomFromOverallMm(draftDims?.handleBottomFromOverallMm ?? undefined);
      setHandleReachMm(draftDims?.handleReachMm ?? undefined);
      setHandleUpperCornerFromOverallMm(draftDims?.handleUpperCornerFromOverallMm ?? undefined);
      setHandleLowerCornerFromOverallMm(draftDims?.handleLowerCornerFromOverallMm ?? undefined);
      setHandleUpperCornerReachMm(draftDims?.handleUpperCornerReachMm ?? undefined);
      setHandleLowerCornerReachMm(draftDims?.handleLowerCornerReachMm ?? undefined);
      setHandleUpperTransitionReachMm(draftDims?.handleUpperTransitionReachMm ?? undefined);
      setHandleLowerTransitionReachMm(draftDims?.handleLowerTransitionReachMm ?? undefined);
      setHandleUpperTransitionFromOverallMm(draftDims?.handleUpperTransitionFromOverallMm ?? undefined);
      setHandleLowerTransitionFromOverallMm(draftDims?.handleLowerTransitionFromOverallMm ?? undefined);
      setHandleOuterTopFromOverallMm(undefined);
      setHandleOuterBottomFromOverallMm(undefined);
      setHandleTubeDiameterMm(editingTemplate ? (draftDims?.handleTubeDiameterMm ?? undefined) : undefined);
      setHandleSpanMm(draftDims?.handleSpanMm ?? undefined);
      setCanonicalHandleProfile(draftDims?.canonicalHandleProfile ?? undefined);
      setShoulderDiameterMm(draftDims?.shoulderDiameterMm ?? undefined);
      setTaperUpperDiameterMm(draftDims?.taperUpperDiameterMm ?? undefined);
      setTaperLowerDiameterMm(draftDims?.taperLowerDiameterMm ?? undefined);
      setBevelDiameterMm(draftDims?.bevelDiameterMm ?? undefined);
      setBodyOutlineProfile(draftDims?.referencePaths?.bodyOutline ?? draftDims?.bodyOutlineProfile ?? undefined);
      setReferencePaths(createReferencePaths({
        bodyOutline: draftDims?.referencePaths?.bodyOutline ?? draftDims?.bodyOutlineProfile ?? null,
        lidProfile: draftDims?.referencePaths?.lidProfile ?? null,
        silverProfile: draftDims?.referencePaths?.silverProfile ?? null,
      }));
      setReferenceLayerState(cloneReferenceLayerState(draftDims?.referenceLayerState ?? null));
      setTopMarginMm(draftDims?.topMarginMm ?? 0);
      setBottomMarginMm(draftDims?.bottomMarginMm ?? 0);

      if (typeof draftDims?.templateWidthMm === "number") {
        setFlatWidthMm(round2(draftDims.templateWidthMm));
      }
      if (typeof draftDims?.printHeightMm === "number") {
        setPrintHeightMm(round2(draftDims.printHeightMm));
      }
      if (typeof draftDims?.flatThicknessMm === "number") {
        setFlatThicknessMm(round2(draftDims.flatThicknessMm));
      }
      if (draftDims?.flatFamilyKey) {
        setFlatFamilyKey(draftDims.flatFamilyKey);
      }
      return;
    }

    if (draft.productType) {
      setFlatFamilyKey("");
      applyProfileOrDimensions({
        brand: draft.brand ?? result.tumblerLookupResult?.brand,
        model: result.tumblerLookupResult?.model,
        capacityOz: result.tumblerLookupResult?.capacityOz ?? parseCapacityOzValue(draft.capacity),
        outsideDiameterMm:
          draftDims?.bodyDiameterMm ??
          draftDims?.diameterMm ??
          result.tumblerLookupResult?.dimensions.outsideDiameterMm,
        topDiameterMm:
          draftDims?.topOuterDiameterMm ??
          result.tumblerLookupResult?.dimensions.topDiameterMm,
        bottomDiameterMm:
          draftDims?.baseDiameterMm ??
          result.tumblerLookupResult?.dimensions.bottomDiameterMm,
        overallHeightMm: draftDims?.overallHeightMm ?? result.tumblerLookupResult?.dimensions.overallHeightMm,
        usableHeightMm: draftDims?.printHeightMm ?? result.tumblerLookupResult?.dimensions.usableHeightMm,
      });

      if (typeof draftDims?.handleArcDeg === "number") {
        setHandleArcDeg(draftDims.handleArcDeg);
      }
      if (typeof draftDims?.templateWidthMm === "number" && draftDims.templateWidthMm > 0) {
        setWrapWidthInputMm(round2(draftDims.templateWidthMm));
      }
      setAdvancedGeometryOverridesUnlocked(draftDims?.advancedGeometryOverridesUnlocked ?? false);
      if (draftDims?.taperCorrection) {
        setTaperCorrection(draftDims.taperCorrection);
      }
      if (!matchedLookupProfile && typeof draftDims?.overallHeightMm === "number") {
        setOverallHeightMm(round2(draftDims.overallHeightMm));
      }
      if (!matchedLookupProfile && typeof draftDims?.bodyTopFromOverallMm === "number") {
        setBodyTopFromOverallMm(round2(draftDims.bodyTopFromOverallMm));
      } else if (!matchedLookupProfile && typeof draftDims?.topMarginMm === "number") {
        setBodyTopFromOverallMm(round2(draftDims.topMarginMm));
      }
      if (!matchedLookupProfile && typeof draftDims?.bodyBottomFromOverallMm === "number") {
        setBodyBottomFromOverallMm(round2(draftDims.bodyBottomFromOverallMm));
      } else if (
        !matchedLookupProfile &&
        typeof draftDims?.overallHeightMm === "number" &&
        typeof draftDims?.bottomMarginMm === "number"
      ) {
        setBodyBottomFromOverallMm(round2(draftDims.overallHeightMm - draftDims.bottomMarginMm));
      }
      if (typeof matchedLookupProfile?.lidSeamFromOverallMm === "number") {
        setLidSeamFromOverallMm(round2(matchedLookupProfile.lidSeamFromOverallMm));
      } else if (typeof draftDims?.lidSeamFromOverallMm === "number") {
        setLidSeamFromOverallMm(round2(draftDims.lidSeamFromOverallMm));
      } else {
        setLidSeamFromOverallMm(undefined);
      }
      if (typeof matchedLookupProfile?.silverBandBottomFromOverallMm === "number") {
        setSilverBandBottomFromOverallMm(round2(matchedLookupProfile.silverBandBottomFromOverallMm));
      } else if (typeof draftDims?.silverBandBottomFromOverallMm === "number") {
        setSilverBandBottomFromOverallMm(round2(draftDims.silverBandBottomFromOverallMm));
      } else {
        setSilverBandBottomFromOverallMm(undefined);
      }
      setPrintableSurfaceDetection(null);
      if (typeof draftDims?.printableTopOverrideMm === "number") {
        setPrintableTopOverrideMm(round2(draftDims.printableTopOverrideMm));
      } else {
        setPrintableTopOverrideMm(undefined);
      }
      if (typeof draftDims?.printableBottomOverrideMm === "number") {
        setPrintableBottomOverrideMm(round2(draftDims.printableBottomOverrideMm));
      } else {
        setPrintableBottomOverrideMm(undefined);
      }
      if (editingTemplate && typeof draftDims?.handleTopFromOverallMm === "number") {
        setHandleTopFromOverallMm(round2(draftDims.handleTopFromOverallMm));
      } else {
        setHandleTopFromOverallMm(undefined);
      }
      if (editingTemplate && typeof draftDims?.handleBottomFromOverallMm === "number") {
        setHandleBottomFromOverallMm(round2(draftDims.handleBottomFromOverallMm));
      } else {
        setHandleBottomFromOverallMm(undefined);
      }
      if (editingTemplate && typeof draftDims?.handleReachMm === "number") {
        setHandleReachMm(round2(draftDims.handleReachMm));
      } else {
        setHandleReachMm(undefined);
      }
      if (editingTemplate && typeof draftDims?.handleUpperCornerFromOverallMm === "number") {
        setHandleUpperCornerFromOverallMm(round2(draftDims.handleUpperCornerFromOverallMm));
      } else {
        setHandleUpperCornerFromOverallMm(undefined);
      }
      if (editingTemplate && typeof draftDims?.handleLowerCornerFromOverallMm === "number") {
        setHandleLowerCornerFromOverallMm(round2(draftDims.handleLowerCornerFromOverallMm));
      } else {
        setHandleLowerCornerFromOverallMm(undefined);
      }
      if (editingTemplate && typeof draftDims?.handleUpperCornerReachMm === "number") {
        setHandleUpperCornerReachMm(round2(draftDims.handleUpperCornerReachMm));
      } else {
        setHandleUpperCornerReachMm(undefined);
      }
      if (editingTemplate && typeof draftDims?.handleLowerCornerReachMm === "number") {
        setHandleLowerCornerReachMm(round2(draftDims.handleLowerCornerReachMm));
      } else {
        setHandleLowerCornerReachMm(undefined);
      }
      if (editingTemplate && typeof draftDims?.handleUpperTransitionReachMm === "number") {
        setHandleUpperTransitionReachMm(round2(draftDims.handleUpperTransitionReachMm));
      } else {
        setHandleUpperTransitionReachMm(undefined);
      }
      if (editingTemplate && typeof draftDims?.handleLowerTransitionReachMm === "number") {
        setHandleLowerTransitionReachMm(round2(draftDims.handleLowerTransitionReachMm));
      } else {
        setHandleLowerTransitionReachMm(undefined);
      }
      if (editingTemplate && typeof draftDims?.handleUpperTransitionFromOverallMm === "number") {
        setHandleUpperTransitionFromOverallMm(round2(draftDims.handleUpperTransitionFromOverallMm));
      } else {
        setHandleUpperTransitionFromOverallMm(undefined);
      }
      if (editingTemplate && typeof draftDims?.handleLowerTransitionFromOverallMm === "number") {
        setHandleLowerTransitionFromOverallMm(round2(draftDims.handleLowerTransitionFromOverallMm));
      } else {
        setHandleLowerTransitionFromOverallMm(undefined);
      }
      setHandleOuterTopFromOverallMm(undefined);
      setHandleOuterBottomFromOverallMm(undefined);
      if (editingTemplate && typeof draftDims?.handleTubeDiameterMm === "number") {
        setHandleTubeDiameterMm(round2(draftDims.handleTubeDiameterMm));
      } else {
        setHandleTubeDiameterMm(undefined);
      }
      if (typeof draftDims?.handleSpanMm === "number") {
        setHandleSpanMm(round2(draftDims.handleSpanMm));
      } else {
        setHandleSpanMm(undefined);
      }
      setCanonicalHandleProfile(draftDims?.canonicalHandleProfile ?? undefined);
      if (typeof draftDims?.shoulderDiameterMm === "number") {
        setShoulderDiameterMm(round2(draftDims.shoulderDiameterMm));
      } else {
        setShoulderDiameterMm(undefined);
      }
      if (typeof draftDims?.taperUpperDiameterMm === "number") {
        setTaperUpperDiameterMm(round2(draftDims.taperUpperDiameterMm));
      } else {
        setTaperUpperDiameterMm(undefined);
      }
      if (typeof draftDims?.taperLowerDiameterMm === "number") {
        setTaperLowerDiameterMm(round2(draftDims.taperLowerDiameterMm));
      } else {
        setTaperLowerDiameterMm(undefined);
      }
      if (typeof draftDims?.bevelDiameterMm === "number") {
        setBevelDiameterMm(round2(draftDims.bevelDiameterMm));
      } else {
        setBevelDiameterMm(undefined);
      }
      setBodyOutlineProfile(draftDims?.referencePaths?.bodyOutline ?? draftDims?.bodyOutlineProfile ?? undefined);
      setReferencePaths(createReferencePaths({
        bodyOutline: draftDims?.referencePaths?.bodyOutline ?? draftDims?.bodyOutlineProfile ?? null,
        lidProfile: draftDims?.referencePaths?.lidProfile ?? null,
        silverProfile: draftDims?.referencePaths?.silverProfile ?? null,
      }));
      setReferenceLayerState(cloneReferenceLayerState(draftDims?.referenceLayerState ?? null));
      if (typeof draftDims?.topMarginMm === "number") {
        setTopMarginMm(round2(draftDims.topMarginMm));
      }
      if (typeof draftDims?.bottomMarginMm === "number") {
        setBottomMarginMm(round2(draftDims.bottomMarginMm));
      }
      if (typeof draftDims?.printHeightMm === "number") {
        setPrintHeightMm(round2(draftDims.printHeightMm));
      }
      if (draftDims?.bodyColorHex) {
        setBodyColorHex(draftDims.bodyColorHex);
      }
      if (draftDims?.lidColorHex) {
        setLidColorHex(draftDims.lidColorHex);
      } else if (draftDims?.bodyColorHex) {
        setLidColorHex(draftDims.bodyColorHex);
      }
      if (draftDims?.rimColorHex) {
        setRimColorHex(draftDims.rimColorHex);
      }
    }
  }, [applyFacePhotoFile, applyMaterialProfileSettings, applyProfileOrDimensions, applyResolvedProductPhotoUrl, handleProductImage, resolveLookupPhotoUrl]);

  const handleItemLookup = async () => {
    const raw = lookupInput.trim();
    if (!raw) return;

    setLookingUpItem(true);
    clearLookupState({ keepInput: true });
    setDetectError(null);

    try {
      if (productType === "flat") {
        try {
          const result = await lookupFlatItemRequest(raw);
          setFlatLookupResult(result);
          setFlatLookupMatch(
            result.matchedItemId
              ? (FLAT_BED_ITEMS.find((item) => item.id === result.matchedItemId) ?? null)
              : null,
          );
          setName(result.label);
          setBrand(result.brand ?? "");
          setCapacity("");
          setDiameterMm(0);
          setWrapWidthInputMm(0);
          setTopOuterDiameterMm(0);
          setBaseDiameterMm(0);
          setFlatWidthMm(round2(result.widthMm));
          setFlatThicknessMm(round2(result.thicknessMm));
          setFlatFamilyKey(result.familyKey);
          setPrintHeightMm(round2(result.heightMm));
          setGlbPath(result.glbPath || "");
          setGlbFileName(result.glbPath ? (result.glbPath.split("/").pop() ?? null) : null);
          setTumblerMapping(undefined);
          setHandleArcDeg(0);
          setTaperCorrection("none");

          if (result.imageUrl) {
            try {
              const imageRes = await fetch("/api/admin/flatbed/fetch-url", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ url: result.imageUrl }),
              });
              const imagePayload = await imageRes.json();
              if (imageRes.ok && imagePayload.dataUrl) {
                const dataUrl = imagePayload.dataUrl as string;
                setLookupDebugImageUrl(dataUrl);
                setProductPhotoFullUrl(dataUrl);
                setProductImageLabel("Lookup product photo");
              }
            } catch {
              // Non-fatal: the lookup should still apply dimensions and model generation.
            }
          }
          return;
        } catch {
          const matchedItem = findFlatItemLookupMatch(raw);
          if (!matchedItem) {
            throw new Error("No flat-item catalog match found. Try a simpler product name or fill in the dimensions manually.");
          }

          setFlatLookupMatch(matchedItem);
          setName(matchedItem.label);
          setBrand("");
          setCapacity("");
          setDiameterMm(0);
          setWrapWidthInputMm(0);
          setTopOuterDiameterMm(0);
          setBaseDiameterMm(0);
          setFlatWidthMm(round2(matchedItem.widthMm));
          setFlatThicknessMm(round2(matchedItem.thicknessMm));
          setFlatFamilyKey(inferFlatFamilyKey({ label: matchedItem.label }));
          setPrintHeightMm(round2(matchedItem.heightMm));
          setGlbPath("");
          setGlbFileName(null);
          setTumblerMapping(undefined);
          setHandleArcDeg(0);
          setTaperCorrection("none");
          return;
        }
      }

      const result = await lookupTumblerItem(raw);
      setLookupResult(result);

      setName(buildTemplateDisplayName({
        brand: result.brand,
        model: result.model,
        capacityOz: result.capacityOz,
        fallbackTitle: result.title,
        fallbackRaw: raw,
      }));
      if (result.brand) setBrand(result.brand);
      if (result.capacityOz) setCapacity(formatCapacityOzLabel(result.capacityOz));
      setFlatFamilyKey("");
      const inferredProductType = inferLookupProductType(
        [raw, result.title, result.model, result.brand].filter(Boolean).join(" "),
        result,
      );
      setProductType(inferredProductType);
      const nextLookupGlbPath =
        inferredProductType === "flat"
          ? (result.glbPath || "")
          : result.modelStatus === "verified-product-model"
            ? (result.glbPath || "")
            : "";
      setGlbPath(nextLookupGlbPath);
      setGlbFileName(nextLookupGlbPath ? (nextLookupGlbPath.split("/").pop() ?? null) : null);
      if (result.bodyColorHex) {
        setBodyColorHex(result.bodyColorHex);
        setLidColorHex(result.bodyColorHex);
      }
      if (result.rimColorHex) setRimColorHex(result.rimColorHex);
      if (inferredProductType !== "flat" && !materialProfileTouchedRef.current) {
        applyResolvedDrinkwareMaterial({
          laserType,
          productType: inferredProductType,
          bodyColorHex: result.bodyColorHex ?? bodyColorHex,
          rimColorHex: result.rimColorHex ?? rimColorHex,
          textHints: [raw, result.title, result.brand, result.model],
        });
      }

      if (inferredProductType !== "flat") {
        const inferredProfileId = findTumblerProfileIdForBrandModel({
          brand: result.brand,
          model: result.model,
          capacityOz: result.capacityOz,
        });
        const matchedProfile = (
          inferredProfileId
            ? getTumblerProfileById(inferredProfileId)
            : result.matchedProfileId
              ? getTumblerProfileById(result.matchedProfileId)
              : null
        );
        const resolvedOverallHeightMm =
          matchedProfile?.overallHeightMm ??
          result.dimensions.overallHeightMm ??
          null;
        applyProfileOrDimensions({
          brand: result.brand,
          model: result.model,
          capacityOz: result.capacityOz,
          outsideDiameterMm: result.dimensions.outsideDiameterMm,
          topDiameterMm: result.dimensions.topDiameterMm,
          bottomDiameterMm: result.dimensions.bottomDiameterMm,
          overallHeightMm: resolvedOverallHeightMm,
          usableHeightMm: result.dimensions.usableHeightMm,
        });
        const autoZone = deriveEngravableZoneFromFitDebug({
          overallHeightMm: resolvedOverallHeightMm,
          fitDebug: result.fitDebug ?? null,
        });
        if (autoZone) {
          setBodyTopFromOverallMm(autoZone.bodyTopFromOverallMm);
          setBodyBottomFromOverallMm(autoZone.bodyBottomFromOverallMm);
          setTopMarginMm(autoZone.topMarginMm);
          setBottomMarginMm(autoZone.bottomMarginMm);
          setPrintHeightMm(autoZone.printHeightMm);
        }
        if (typeof result.dimensions.handleSpanMm === "number") {
          setHandleSpanMm(round2(result.dimensions.handleSpanMm));
        }
      }

      if (result.imageUrl) {
        try {
          const imageRes = await fetch("/api/admin/flatbed/fetch-url", {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({ url: result.imageUrl }),
          });
          const imagePayload = await imageRes.json();
          if (imageRes.ok && imagePayload.dataUrl) {
            const dataUrl = imagePayload.dataUrl as string;
            const imgFetch = await fetch(dataUrl);
            const blob = await imgFetch.blob();
            const mimeType = imagePayload.mimeType ?? blob.type ?? "image/jpeg";
            const fileName = result.imageUrl.split("/").pop() ?? "lookup-image.jpg";
            const file = new File([blob], fileName, { type: mimeType });
            setProductImageFile(file);
            setProductImageLabel(getLookupPhotoLabel(result));
            const thumb = await generateThumbnail(file);
            setThumbDataUrl(thumb);
            const full = await fileToFacePhotoDataUrl(file, 1024);
            if (full) {
              setLookupDebugImageUrl(full);
              setProductPhotoFullUrl(full);
              setFrontOriginalUrl(full);
              setFrontPhotoDataUrl((prev) => prev || full);
            }
          }
        } catch {
          // Keep the resolved lookup details even if proxying the product image fails.
        }
      }
    } catch (e) {
      setLookupError(
        e instanceof Error ? e.message : "Item lookup failed. Fill in manually.",
      );
    } finally {
      setLookingUpItem(false);
    }
  };

  const handleCatalogBatchImport = async () => {
    if (!CATALOG_BATCH_IMPORT_AVAILABLE) {
      setBatchImportError("Catalog batch import is not available in this build yet.");
      setBatchImportStatus(null);
      return;
    }
    const trimmedUrl = batchImportUrl.trim();
    if (!trimmedUrl) {
      setBatchImportError("Paste an official collection or category URL first.");
      return;
    }

    setBatchImportError(null);
    setBatchImportSummary(null);
    setBatchImportStatus("Discovering product styles...");
    setIsBatchImporting(true);

    try {
      const summary = await importCatalogTemplates({
        sourceUrl: trimmedUrl,
        onProgress: (message) => setBatchImportStatus(message),
      });
      setBatchImportSummary(summary);
      setBatchImportStatus(
        [
          `Imported ${summary.createdCount + summary.updatedCount} ${summary.providerLabel} styles from ${summary.styleCount} discovered.`,
          summary.createdCount > 0 ? `${summary.createdCount} new` : null,
          summary.updatedCount > 0 ? `${summary.updatedCount} updated` : null,
          summary.failedCount > 0 ? `${summary.failedCount} failed` : null,
        ].filter(Boolean).join(" | "),
      );
    } catch (error) {
      setBatchImportError(
        error instanceof Error ? error.message : "Batch import failed.",
      );
      setBatchImportStatus(null);
    } finally {
      setIsBatchImporting(false);
    }
  };

  /** Run auto-detect on the uploaded product image */
  const handleAutoDetect = async () => {
    if (!productImageFile) return;
    setDetecting(true);
    setDetectError(null);
    setDetectResult(null);
    try {
      const result = await detectTumblerFromImage(productImageFile);
      setDetectResult(result);
      // Auto-fill form fields from detection
      const { draft, response } = result;
      const sug = response.suggestion;
      // Build a display name from brand + model + capacity
      const detectedName = buildTemplateDisplayName({
        brand: sug.brand,
        model: sug.model,
        capacityOz: sug.capacityOz,
      });
      if (detectedName) setName(detectedName);
      if (sug.brand) setBrand(sug.brand);
      if (sug.capacityOz) setCapacity(formatCapacityOzLabel(sug.capacityOz));
      // Handle arc: prefer profile-specific value, fall back to 90 if hasHandle
      const profileId = findTumblerProfileIdForBrandModel({
        brand: sug.brand,
        model: sug.model,
        capacityOz: sug.capacityOz,
      });
      const matchedProfile = profileId ? getTumblerProfileById(profileId) : null;
      const resolvedBodyDiameterMm = resolveBodyReferenceDiameterMm({
        outsideDiameterMm: draft.outsideDiameterMm,
        topDiameterMm: draft.topDiameterMm,
        bottomDiameterMm: draft.bottomDiameterMm,
        fallbackOutsideDiameterMm: matchedProfile?.outsideDiameterMm ?? null,
      });
      if (resolvedBodyDiameterMm) {
        setDiameterMm(resolvedBodyDiameterMm);
        setWrapWidthInputMm(round2(Math.PI * resolvedBodyDiameterMm));
      }
      const resolvedTopOuterDiameterMm = matchedProfile?.topDiameterMm ?? draft.topDiameterMm ?? resolvedBodyDiameterMm ?? 0;
      if (resolvedTopOuterDiameterMm > 0) {
        setTopOuterDiameterMm(round2(resolvedTopOuterDiameterMm));
      }
      const resolvedBaseDiameterMm = matchedProfile?.bottomDiameterMm ?? draft.bottomDiameterMm ?? resolvedBodyDiameterMm ?? 0;
      if (resolvedBaseDiameterMm > 0) {
        setBaseDiameterMm(round2(resolvedBaseDiameterMm));
      }
      if (draft.usableHeightMm) setPrintHeightMm(round2(draft.usableHeightMm));
      else if (draft.templateHeightMm) setPrintHeightMm(round2(draft.templateHeightMm));
      const profileArc = getProfileHandleArcDeg(matchedProfile);
      if (matchedProfile) {
        setHandleArcDeg(profileArc);
      } else if (sug.hasHandle) {
        setHandleArcDeg(90);
      } else {
        setHandleArcDeg(0);
      }
      // Product type
      const detectedProductType = mapProductType(sug.productType);
      setProductType(detectedProductType);
      if (detectedProductType !== "flat") {
        setFlatFamilyKey("");
      }
      if (detectedProductType !== "flat" && !materialProfileTouchedRef.current) {
        applyResolvedDrinkwareMaterial({
          laserType,
          productType: detectedProductType,
          explicitFinishType: null,
          bodyColorHex,
          rimColorHex,
          textHints: [
            productImageFile.name,
            sug.brand,
            sug.model,
            ...(response.analysis.notes ?? []),
          ],
        });
      }
      // Taper
      if (sug.topDiameterMm && sug.bottomDiameterMm && sug.topDiameterMm !== sug.bottomDiameterMm) {
        setTaperCorrection(sug.topDiameterMm < sug.bottomDiameterMm ? "top-narrow" : "bottom-narrow");
      }

      // Overall height + margins from profile
      if (matchedProfile) {
        const oh = matchedProfile.overallHeightMm;
        setOverallHeightMm(round2(oh));
        const usable = matchedProfile.usableHeightMm;
        const topM = matchedProfile.guideBand?.upperGrooveYmm ?? round2((oh - usable) / 2);
        const bottomM = round2(Math.max(0, oh - usable - topM));
        setBodyTopFromOverallMm(topM);
        setBodyBottomFromOverallMm(round2(oh - bottomM));
        setTopMarginMm(topM);
        setBottomMarginMm(bottomM);
      } else if (sug.overallHeightMm && sug.usableHeightMm) {
        const oh = sug.overallHeightMm;
        setOverallHeightMm(round2(oh));
        const topM = round2((oh - sug.usableHeightMm) / 2);
        const bottomM = round2(Math.max(0, oh - sug.usableHeightMm - topM));
        setBodyTopFromOverallMm(topM);
        setBodyBottomFromOverallMm(round2(oh - bottomM));
        setTopMarginMm(topM);
        setBottomMarginMm(bottomM);
      }

      // Auto-assign product photo as front face + auto BG removal
      if (productImageFile && !frontPhotoDataUrl) {
        const original = await fileToFacePhotoDataUrl(productImageFile);
        if (original) {
          setFrontOriginalUrl(original);
          setFrontPhotoDataUrl(original);
          // Auto-trigger background removal
          setFrontBgStatus("processing");
          try {
            const imgRes = await fetch(original);
            const blob = await imgRes.blob();
            const { removeBackground } = await import("@imgly/background-removal");
            const clean = await removeBackground(blob, { model: "isnet_quint8", proxyToWorker: false });
            const reader = new FileReader();
            reader.onloadend = () => {
              const url = reader.result as string;
              if (url) {
                setFrontCleanUrl(url);
                setFrontPhotoDataUrl(url);
                setFrontBgStatus("done");
              } else {
                setFrontBgStatus("failed");
              }
            };
            reader.onerror = () => setFrontBgStatus("failed");
            reader.readAsDataURL(clean);
          } catch {
            setFrontBgStatus("failed");
          }
        }
      }
    } catch (e) {
      setDetectError(e instanceof Error ? e.message : "Auto-detect failed. Fill in manually.");
    } finally {
      setDetecting(false);
    }
  };

  const handleGlbFile = async (file: File) => {
    setGlbFileName(file.name);
    setGlbUploading(true);
    setGlbUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/models/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.path) {
        setGlbPath(data.path);
      } else {
        setGlbUploadError(data.error ?? "Upload failed");
      }
    } catch {
      setGlbUploadError("Upload failed — check server logs");
    } finally {
      setGlbUploading(false);
    }
  };

  const handleSave = React.useCallback(async () => {
    const errs = [...saveBlockingIssues];
    if (glbPath.trim()) {
      const glbOk = await verifyCurrentGlbPath({ clearOnMissing: false });
      if (!glbOk) errs.push("3D model path is missing or invalid.");
    }
    if (errs.length > 0) {
      setErrors(Array.from(new Set(errs)));
      return;
    }
    setErrors([]);

    const resolvedManufacturerLogoStamp = productType === "flat"
      ? undefined
      : manufacturerLogoStamp;

    const now = new Date().toISOString();
    const templateMaterial = inferTemplateMaterial(
      editingTemplate,
      flatLookupMatch,
      flatLookupResult,
      resolvedMaterialSlug,
      resolvedMaterialLabel,
      materialProfileId,
    );
    const template: ProductTemplate = {
      id: editingTemplate?.id ?? crypto.randomUUID(),
      name: name.trim(),
      brand: brand.trim(),
      capacity: capacity.trim(),
      laserType: laserType || undefined,
      productType: productType as ProductTemplate["productType"],
      materialSlug: templateMaterial.materialSlug,
      materialLabel: templateMaterial.materialLabel,
      thumbnailDataUrl: thumbDataUrl,
      productPhotoFullUrl: productPhotoFullUrl || undefined,
      glbPath,
      glbStatus: activeDrinkwareGlbStatus?.status,
      glbSourceLabel: activeDrinkwareGlbStatus?.sourceLabel ?? undefined,
      dimensions: {
        diameterMm: effectiveCylinderDiameterMm,
        bodyDiameterMm: productType === "flat" || effectiveCylinderDiameterMm <= 0 ? undefined : effectiveCylinderDiameterMm,
        advancedGeometryOverridesUnlocked: productType === "flat" ? undefined : advancedGeometryOverridesUnlocked,
        topOuterDiameterMm: productType === "flat" || topOuterDiameterMm <= 0 ? undefined : topOuterDiameterMm,
        baseDiameterMm: productType === "flat" || baseDiameterMm <= 0 ? undefined : baseDiameterMm,
        printHeightMm,
        templateWidthMm,
        flatThicknessMm: productType === "flat" && flatThicknessMm > 0 ? flatThicknessMm : undefined,
        flatFamilyKey: productType === "flat"
          ? inferFlatFamilyKey({
              familyKey: flatFamilyKey,
              glbPath,
              label: name.trim(),
            })
          : undefined,
        handleArcDeg,
        taperCorrection,
        overallHeightMm: overallHeightMm > 0 ? overallHeightMm : undefined,
        bodyTopFromOverallMm:
          productType === "flat" || !Number.isFinite(bodyTopFromOverallMm)
            ? undefined
            : round2(Math.max(0, bodyTopFromOverallMm)),
        bodyBottomFromOverallMm:
          productType === "flat" || !Number.isFinite(bodyBottomFromOverallMm)
            ? undefined
            : round2(Math.max(bodyTopFromOverallMm, bodyBottomFromOverallMm)),
        lidSeamFromOverallMm:
          productType === "flat" || !Number.isFinite(resolvedLidSeamForPersistence)
            ? undefined
            : round2(Math.max(0, resolvedLidSeamForPersistence ?? 0)),
        silverBandBottomFromOverallMm:
          productType === "flat" || !Number.isFinite(resolvedSilverBandBottomForPersistence)
            ? undefined
            : round2(Math.max(0, resolvedSilverBandBottomForPersistence ?? 0)),
        printableTopOverrideMm:
          productType === "flat" || !Number.isFinite(printableTopOverrideMm)
            ? undefined
            : round2(Math.min(bodyBottomFromOverallMm, Math.max(bodyTopFromOverallMm, printableTopOverrideMm ?? 0))),
        printableBottomOverrideMm:
          productType === "flat" || !Number.isFinite(printableBottomOverrideMm)
            ? undefined
            : round2(Math.min(bodyBottomFromOverallMm, Math.max(bodyTopFromOverallMm, printableBottomOverrideMm ?? 0))),
        handleTopFromOverallMm:
          productType === "flat" || !Number.isFinite(handleTopFromOverallMm)
            ? undefined
            : round2(Math.max(0, handleTopFromOverallMm ?? 0)),
        handleBottomFromOverallMm:
          productType === "flat" || !Number.isFinite(handleBottomFromOverallMm)
            ? undefined
            : round2(Math.max(0, handleBottomFromOverallMm ?? 0)),
        handleReachMm:
          productType === "flat" || !Number.isFinite(handleReachMm)
            ? undefined
            : round2(Math.max(0, handleReachMm ?? 0)),
        handleUpperCornerFromOverallMm:
          productType === "flat" || !Number.isFinite(handleUpperCornerFromOverallMm)
            ? undefined
            : round2(Math.max(0, handleUpperCornerFromOverallMm ?? 0)),
        handleLowerCornerFromOverallMm:
          productType === "flat" || !Number.isFinite(handleLowerCornerFromOverallMm)
            ? undefined
            : round2(Math.max(0, handleLowerCornerFromOverallMm ?? 0)),
        handleUpperCornerReachMm:
          productType === "flat" || !Number.isFinite(handleUpperCornerReachMm)
            ? undefined
            : round2(Math.max(0, handleUpperCornerReachMm ?? 0)),
        handleLowerCornerReachMm:
          productType === "flat" || !Number.isFinite(handleLowerCornerReachMm)
            ? undefined
            : round2(Math.max(0, handleLowerCornerReachMm ?? 0)),
        handleUpperTransitionReachMm:
          productType === "flat" || !Number.isFinite(handleUpperTransitionReachMm)
            ? undefined
            : round2(Math.max(0, handleUpperTransitionReachMm ?? 0)),
        handleLowerTransitionReachMm:
          productType === "flat" || !Number.isFinite(handleLowerTransitionReachMm)
            ? undefined
            : round2(Math.max(0, handleLowerTransitionReachMm ?? 0)),
        handleUpperTransitionFromOverallMm:
          productType === "flat" || !Number.isFinite(handleUpperTransitionFromOverallMm)
            ? undefined
            : round2(Math.max(0, handleUpperTransitionFromOverallMm ?? 0)),
        handleLowerTransitionFromOverallMm:
          productType === "flat" || !Number.isFinite(handleLowerTransitionFromOverallMm)
            ? undefined
            : round2(Math.max(0, handleLowerTransitionFromOverallMm ?? 0)),
        handleOuterTopFromOverallMm: undefined,
        handleOuterBottomFromOverallMm: undefined,
        handleTubeDiameterMm:
          productType === "flat" || !Number.isFinite(handleTubeDiameterMm)
            ? undefined
            : round2(Math.max(0, handleTubeDiameterMm ?? 0)),
        handleSpanMm:
          productType === "flat" || !Number.isFinite(handleSpanMm)
            ? undefined
            : round2(Math.max(0, handleSpanMm ?? 0)),
        canonicalHandleProfile: productType === "flat" ? undefined : normalizedCanonicalHandleProfile,
        canonicalBodyProfile: productType === "flat" ? undefined : (activeCanonicalBodyProfile ?? undefined),
        canonicalDimensionCalibration: productType === "flat" ? undefined : (activeCanonicalDimensionCalibration ?? undefined),
        bodyReferenceQA: productType === "flat" ? undefined : (bodyReferenceQa ?? undefined),
        bodyReferenceWarnings:
          productType === "flat" || bodyReferenceWarnings.length === 0
            ? undefined
            : [...bodyReferenceWarnings],
        bodyReferenceContractVersion:
          productType === "flat"
            ? undefined
            : (bodyReferenceContractVersion ?? undefined),
        axialSurfaceBands: productType === "flat" ? undefined : (activePrintableSurfaceResolution?.axialSurfaceBands ?? undefined),
        printableSurfaceContract:
          productType === "flat"
            ? undefined
            : (activePrintableSurfaceResolution?.printableSurfaceContract ?? undefined),
        shoulderDiameterMm:
          productType === "flat" || !Number.isFinite(shoulderDiameterMm)
            ? undefined
            : round2(Math.max(0, shoulderDiameterMm ?? 0)),
        taperUpperDiameterMm:
          productType === "flat" || !Number.isFinite(taperUpperDiameterMm)
            ? undefined
            : round2(Math.max(0, taperUpperDiameterMm ?? 0)),
        taperLowerDiameterMm:
          productType === "flat" || !Number.isFinite(taperLowerDiameterMm)
            ? undefined
            : round2(Math.max(0, taperLowerDiameterMm ?? 0)),
        bevelDiameterMm:
          productType === "flat" || !Number.isFinite(bevelDiameterMm)
            ? undefined
            : round2(Math.max(0, bevelDiameterMm ?? 0)),
        bodyOutlineProfile: productType === "flat" ? undefined : (referencePaths.bodyOutline ?? bodyOutlineProfile),
        referencePaths: productType === "flat"
          ? undefined
          : createReferencePaths({
              bodyOutline: referencePaths.bodyOutline ?? bodyOutlineProfile ?? null,
              lidProfile: referencePaths.lidProfile,
              silverProfile: referencePaths.silverProfile,
            }),
        referenceLayerState: productType === "flat" ? undefined : cloneReferenceLayerState(referenceLayerState),
        bodyHeightMm:
          productType === "flat" || !Number.isFinite(bodyBottomFromOverallMm - bodyTopFromOverallMm)
            ? undefined
            : round2(Math.max(0, bodyBottomFromOverallMm - bodyTopFromOverallMm)),
        topMarginMm: Number.isFinite(topMarginMm) ? topMarginMm : undefined,
        bottomMarginMm: Number.isFinite(bottomMarginMm) ? bottomMarginMm : undefined,
        referencePhotoScalePct:
          Number.isFinite(referencePhotoWidthScalePct) &&
          Number.isFinite(referencePhotoHeightScalePct) &&
          Math.abs(referencePhotoWidthScalePct - referencePhotoHeightScalePct) < 0.1
            ? referencePhotoWidthScalePct
            : undefined,
        referencePhotoWidthScalePct: Number.isFinite(referencePhotoWidthScalePct) ? referencePhotoWidthScalePct : undefined,
        referencePhotoHeightScalePct: Number.isFinite(referencePhotoHeightScalePct) ? referencePhotoHeightScalePct : undefined,
        referencePhotoLockAspect,
        referencePhotoOffsetXPct: Number.isFinite(referencePhotoOffsetXPct) ? referencePhotoOffsetXPct : undefined,
        referencePhotoOffsetYPct: Number.isFinite(referencePhotoOffsetYPct) ? referencePhotoOffsetYPct : undefined,
        referencePhotoAnchorY,
        referencePhotoCenterMode,
        bodyColorHex: bodyColorHex || undefined,
        lidColorHex: lidColorHex || undefined,
        rimColorHex: rimColorHex || undefined,
      },
      laserSettings: {
        power,
        speed,
        frequency,
        lineInterval,
        materialProfileId,
        rotaryPresetId: "",
      },
      createdAt: editingTemplate?.createdAt ?? now,
      updatedAt: now,
      builtIn: editingTemplate?.builtIn ?? false,
      tumblerMapping: productType === "flat" ? undefined : tumblerMapping,
      frontPhotoDataUrl: frontPhotoDataUrl || undefined,
      backPhotoDataUrl: backPhotoDataUrl || undefined,
      manufacturerLogoStamp: productType === "flat" ? undefined : resolvedManufacturerLogoStamp,
      productReferenceSet: productType === "flat" ? undefined : productReferenceSet,
    };

    if (isEdit) {
      updateTemplate(template.id, template);
    } else {
      saveTemplate(template);
    }
    onSave(template);
  }, [
    backPhotoDataUrl,
    bodyColorHex,
    lidColorHex,
    bodyBottomFromOverallMm,
    bodyOutlineProfile,
    bodyTopFromOverallMm,
    bottomMarginMm,
    brand,
    capacity,
    activeCanonicalBodyProfile,
    activeCanonicalDimensionCalibration,
    bodyReferenceContractVersion,
    bodyReferenceQa,
    bodyReferenceWarnings,
    canonicalHandleProfile,
    advancedGeometryOverridesUnlocked,
    derivedDiameterMismatchMm,
    editingTemplate,
    effectiveCylinderDiameterMm,
    hasBlockingGeometryMismatch,
    activeDrinkwareGlbStatus,
    activePrintableSurfaceResolution?.axialSurfaceBands,
    activePrintableSurfaceResolution?.printableSurfaceContract,
    flatFamilyKey,
    flatLookupMatch,
    flatLookupResult,
    flatThicknessMm,
    flatWidthMm,
    frontPhotoDataUrl,
    frequency,
    glbPath,
    handleArcDeg,
    isEdit,
    laserType,
    lineInterval,
    manufacturerLogoStamp,
    materialProfileId,
    name,
    onSave,
    overallHeightMm,
    power,
    printHeightMm,
    printableBottomOverrideMm,
    printableTopOverrideMm,
    productReferenceSet,
    productPhotoFullUrl,
    productType,
    referenceLayerState,
    referencePaths,
    referencePhotoAnchorY,
    referencePhotoCenterMode,
    referencePhotoHeightScalePct,
    referencePhotoLockAspect,
    referencePhotoOffsetXPct,
    referencePhotoOffsetYPct,
    referencePhotoWidthScalePct,
    resolvedLidSeamForPersistence,
    resolvedMaterialLabel,
    resolvedMaterialSlug,
    resolvedSilverBandBottomForPersistence,
    resolveManufacturerLogoStamp,
    rimColorHex,
    handleBottomFromOverallMm,
    handleLowerCornerFromOverallMm,
    handleLowerCornerReachMm,
    handleLowerTransitionFromOverallMm,
    handleLowerTransitionReachMm,
    handleOuterBottomFromOverallMm,
    handleOuterTopFromOverallMm,
    handleTubeDiameterMm,
    handleReachMm,
    handleSpanMm,
    handleSpanContaminatesBodyWidth,
    shoulderDiameterMm,
    taperUpperDiameterMm,
    taperLowerDiameterMm,
    bevelDiameterMm,
    handleTopFromOverallMm,
    handleUpperCornerFromOverallMm,
    handleUpperCornerReachMm,
    handleUpperTransitionFromOverallMm,
    handleUpperTransitionReachMm,
    printableHeightLooksLikeOverallHeight,
    speed,
    taperCorrection,
    templateWidthMm,
    thumbDataUrl,
    topOuterDiameterMm,
    baseDiameterMm,
    saveBlockingIssues,
    topMarginMm,
    tumblerMapping,
    verifyCurrentGlbPath,
  ]);

  React.useImperativeHandle(ref, () => ({
    save: () => {
      void handleSave();
    },
  }), [handleSave]);

  return (
    <div className={styles.form}>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Template readiness</div>
        <div className={styles.readinessList}>
          {templateReadinessItems.map((item) => (
            <div key={item.label} className={styles.readinessItem}>
              <div className={styles.readinessItemHeader}>
                <span className={styles.readinessItemLabel}>{item.label}</span>
                <span
                  className={
                    item.status === "ready"
                      ? styles.lookupBadgePrimary
                      : item.status === "action"
                        ? styles.lookupBadgeWarning
                        : styles.lookupBadgeReview
                  }
                >
                  {item.status === "ready" ? "Ready" : item.status === "action" ? "Needs action" : "Review"}
                </span>
              </div>
              <div className={styles.readinessItemDetail}>{item.detail}</div>
            </div>
          ))}
        </div>
        {saveDisabledReason && (
          <div className={styles.readinessBlocker}>
            Save is blocked: {saveDisabledReason}
          </div>
        )}
      </div>

      {errors.length > 0 && (
        <div ref={errorSummaryRef} className={styles.errorSummary} role="alert" aria-live="assertive">
          <div className={styles.errorSummaryTitle}>Can&apos;t save template yet</div>
          <div className={styles.errorSummaryList}>
            {errors.map((err) => (
              <div key={err} className={styles.errorSummaryItem}>{err}</div>
            ))}
          </div>
        </div>
      )}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Smart lookup</div>
        <SmartTemplateLookupPanel
          onResolved={applySmartLookupResult}
          onOpenMapping={() => setShowMappingWizard(true)}
          canOpenMapping={Boolean(glbPath.trim()) && Boolean(productType) && productType !== "flat"}
          onClearResult={() => setSmartLookupApplied(false)}
        />
        <div className={styles.externalToolNotice}>
          Need manual raster cleanup or tracing from a product photo?
          {" "}
          <Link
            href="/admin/image-to-svg"
            target="_blank"
            rel="noreferrer"
            className={styles.externalToolLink}
          >
            Open Image to SVG in a new tab
          </Link>
          .
        </div>
      </div>
      {/* ── Product identity ──────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Product identity</div>
        {templateProvenanceBadges.length > 0 && (
          <div className={styles.readinessBadgeRow}>
            {templateProvenanceBadges.map((badge) => (
              <span
                key={badge.label}
                className={
                  badge.tone === "ready"
                    ? styles.lookupBadgePrimary
                    : badge.tone === "action"
                      ? styles.lookupBadgeWarning
                      : styles.lookupBadgeReview
                }
              >
                {badge.label}
              </span>
            ))}
          </div>
        )}

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Product name *</label>
          <input
            className={styles.textInput}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Brand</label>
          <input
            className={styles.textInput}
            type="text"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Capacity</label>
          <input
            className={styles.textInput}
            type="text"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Laser type</label>
          <select
            className={styles.selectInput}
            value={laserType}
            onChange={(e) => setLaserType(e.target.value as TemplateLaserType)}
          >
            <option value="">Optional</option>
            <option value="fiber">Fiber</option>
            <option value="co2">CO2</option>
            <option value="diode">Diode</option>
          </select>
          <span className={styles.fieldHint}>Optional. Leave blank if the template should not preselect a laser source.</span>
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Product type</label>
          <select
            className={styles.selectInput}
            value={productType}
            onChange={(e) => {
              setProductType(e.target.value as TemplateProductType);
              setSmartLookupApplied(false);
              clearLookupState({ clearFamilyKey: true });
            }}
          >
            <option value="">Select product type</option>
            <option value="tumbler">Tumbler</option>
            <option value="mug">Mug</option>
            <option value="bottle">Bottle</option>
            <option value="flat">Flat</option>
          </select>
        </div>
      </div>

      {/* ── Product image + auto-detect ──────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Product image</div>

        {productType && !smartLookupApplied && (
          <div className={styles.lookupBlock}>
            <div className={styles.lookupHeader}>
              <div>
                <div className={styles.lookupTitle}>Item lookup</div>
                <div className={styles.lookupHint}>
                  {productType === "flat"
                    ? "Paste a product name or URL slug. Lookup will try to match a flat-bed catalog item and fill its dimensions."
                    : "Paste a product URL or product name. Lookup will try to resolve the item, reuse a known tumbler profile when possible, and pull a usable product photo."}
                </div>
              </div>
              {(lookupResult || flatLookupMatch || flatLookupResult) && (
                <button
                  type="button"
                  className={styles.lookupResetBtn}
                  onClick={() => clearLookupState({ clearFamilyKey: true })}
                >
                  Clear lookup
                </button>
              )}
            </div>
            <form
              className={styles.lookupRow}
              onSubmit={(event) => {
                event.preventDefault();
                if (!lookingUpItem && lookupInput.trim()) {
                  void handleItemLookup();
                }
              }}
            >
              <input
                className={styles.textInput}
                type="text"
                value={lookupInput}
                onChange={(e) => setLookupInput(e.target.value)}
                placeholder={productType === "flat"
                  ? "Acacia cutting board, stainless dog tag, slate coaster..."
                  : "https://example.com/product or Stanley IceFlow 30 oz"}
              />
              <button
                type="button"
                className={styles.detectBtn}
                onClick={() => void handleItemLookup()}
                disabled={lookingUpItem || !lookupInput.trim()}
              >
                {lookingUpItem ? "Looking up..." : "Run lookup"}
              </button>
            </form>
            <div className={styles.lookupAssistText} role="status" aria-live="polite">
              {lookingUpItem
                ? "Checking the product and filling the best available dimensions."
                : "Press Enter or click Run lookup, then review the result before saving."}
            </div>

            {lookupResult && (
              <div className={styles.lookupSummary}>
                <div className={styles.lookupSummaryHeader}>
                  <div className={styles.lookupSummaryTitle}>
                    {name || lookupResult.title || "Resolved item"}
                  </div>
                  <div className={styles.lookupBadgeRow}>
                    <span className={styles.lookupBadgePrimary}>
                      {getLookupModeLabel(lookupResult.mode)}
                    </span>
                    {getLookupSourceLabel(lookupResult) && (
                      <span className={styles.lookupBadgeMuted}>
                        {getLookupSourceLabel(lookupResult)}
                      </span>
                    )}
                    {lookupResult.imageUrl && productImageLabel && thumbDataUrl && (
                      <span className={styles.lookupBadgeMuted}>Photo applied</span>
                    )}
                  </div>
                </div>
                <div className={styles.lookupSummaryLine}>
                  {[lookupResult.brand, lookupResult.capacityOz ? `${lookupResult.capacityOz}oz` : null]
                    .filter(Boolean)
                    .join(" / ")}
                </div>
                <div className={styles.lookupMetrics}>
                  {formatLookupMeasurement(lookupResult.dimensions.outsideDiameterMm) && (
                    <span>Dia {formatLookupMeasurement(lookupResult.dimensions.outsideDiameterMm)}</span>
                  )}
                  {formatLookupMeasurement(lookupResult.dimensions.usableHeightMm) && (
                    <span>Print {formatLookupMeasurement(lookupResult.dimensions.usableHeightMm)}</span>
                  )}
                  {lookupResult.glbPath && (
                    <span>{getDrinkwareGlbStatusLabel(lookupResult.modelStatus ?? "verified-product-model")}</span>
                  )}
                </div>
                {lookupResult.modelSourceLabel && (
                  <div className={styles.lookupNotice}>{lookupResult.modelSourceLabel}</div>
                )}
              </div>
            )}

            {flatLookupResult && (
              <div
                className={[
                  styles.lookupSummary,
                  flatLookupResult.isProxy ? styles.lookupSummaryWarning : "",
                  flatLookupResult.requiresReview && !flatLookupResult.isProxy ? styles.lookupSummaryReview : "",
                ].filter(Boolean).join(" ")}
              >
                <div className={styles.lookupSummaryHeader}>
                  <div className={styles.lookupSummaryTitle}>{flatLookupResult.label}</div>
                  <div className={styles.lookupBadgeRow}>
                    <span className={styles.lookupBadgePrimary}>
                      {getFlatLookupModeLabel(flatLookupResult.mode)}
                    </span>
                    <span className={styles.lookupBadgeMuted}>{flatLookupResult.materialLabel}</span>
                    {flatLookupResult.glbPath && (
                      <span
                        className={[
                          flatLookupResult.isProxy ? styles.lookupBadgeWarning : styles.lookupBadgeMuted,
                          flatLookupResult.requiresReview && !flatLookupResult.isProxy ? styles.lookupBadgeReview : "",
                        ].filter(Boolean).join(" ")}
                      >
                        {getFlatModelStrategyLabel(flatLookupResult.modelStrategy)}
                      </span>
                    )}
                    {flatLookupResult.requiresReview && (
                      <span className={styles.lookupBadgeReview}>Review before save</span>
                    )}
                  </div>
                </div>
                <div className={styles.lookupSummaryLine}>
                  {[flatLookupResult.brand, flatLookupResult.category, `${Math.round(flatLookupResult.confidence * 100)}% confidence`]
                    .filter(Boolean)
                    .join(" / ")}
                </div>
                <div className={styles.lookupMetrics}>
                  <span>Width {round2(flatLookupResult.widthMm)} mm</span>
                  <span>Height {round2(flatLookupResult.heightMm)} mm</span>
                  <span>Thickness {round2(flatLookupResult.thicknessMm)} mm</span>
                  {formatFlatTraceQuality(flatLookupResult.traceScore) && (
                    <span>{formatFlatTraceQuality(flatLookupResult.traceScore)}</span>
                  )}
                </div>
                {!flatLookupResult.glbPath && getFlatLookupNotice(flatLookupResult) && (
                  <div className={styles.lookupNotice}>{getFlatLookupNotice(flatLookupResult)}</div>
                )}
              </div>
            )}

            {!flatLookupResult && flatLookupMatch && (
              <div className={styles.lookupSummary}>
                <div className={styles.lookupSummaryHeader}>
                  <div className={styles.lookupSummaryTitle}>{flatLookupMatch.label}</div>
                  <div className={styles.lookupBadgeRow}>
                    <span className={styles.lookupBadgePrimary}>Catalog match</span>
                    <span className={styles.lookupBadgeMuted}>{flatLookupMatch.materialLabel}</span>
                  </div>
                </div>
                <div className={styles.lookupSummaryLine}>{flatLookupMatch.category}</div>
                <div className={styles.lookupMetrics}>
                  <span>Width {round2(flatLookupMatch.widthMm)} mm</span>
                  <span>Height {round2(flatLookupMatch.heightMm)} mm</span>
                  <span>Thickness {round2(flatLookupMatch.thicknessMm)} mm</span>
                </div>
              </div>
            )}

            {lookupError && <div className={styles.detectErrorBanner}>{lookupError}</div>}

            {lookupResult?.fitDebug && lookupDebugImageUrl && (
              <TumblerLookupDebugPanel
                debug={lookupResult.fitDebug}
                imageUrl={bodyReferencePhotoDataUrl || lookupDebugImageUrl}
                handleProfile={normalizedCanonicalHandleProfile}
              />
            )}

            {flatLookupResult?.traceDebug && lookupDebugImageUrl && (
              <FlatItemLookupDebugPanel
                debug={flatLookupResult.traceDebug}
                imageUrl={lookupDebugImageUrl}
              />
            )}
          </div>
        )}

        {productType && productType !== "flat" && (
          <div className={styles.lookupBlock}>
            <div className={styles.lookupHeader}>
              <div>
                <div className={styles.lookupTitle}>Catalog batch upload</div>
                <div className={styles.lookupHint}>
                  Paste an official collection or category URL to create one template per product style, not one per color.
                </div>
              </div>
            </div>
            <form
              className={styles.lookupRow}
              onSubmit={(event) => {
                event.preventDefault();
                if (!isBatchImporting && !batchImportDisabledReason && batchImportUrl.trim()) {
                  void handleCatalogBatchImport();
                }
              }}
            >
              <input
                className={styles.textInput}
                type="url"
                value={batchImportUrl}
                onChange={(e) => setBatchImportUrl(e.target.value)}
                placeholder="https://www.stanley1913.com/collections/adventure-quencher-travel-tumblers"
              />
              <button
                type="button"
                className={styles.detectBtn}
                onClick={() => void handleCatalogBatchImport()}
                disabled={isBatchImporting || Boolean(batchImportDisabledReason)}
                title={batchImportDisabledReason ?? undefined}
              >
                {isBatchImporting ? "Importing..." : "Batch upload"}
              </button>
            </form>
            <div className={styles.lookupAssistText} role="status" aria-live="polite">
              {isBatchImporting
                ? batchImportStatus ?? "Importing catalog styles into templates."
                : batchImportDisabledReason ?? "Current live provider support is Stanley 1913 official catalog URLs. The workflow is provider-based so more catalogs can use this same screen later."}
            </div>

            {batchImportStatus && !isBatchImporting && (
              <div className={styles.batchImportStatus}>{batchImportStatus}</div>
            )}

            {batchImportError && (
              <div className={styles.detectErrorBanner}>{batchImportError}</div>
            )}

            {batchImportSummary && (
              <div className={styles.lookupSummary}>
                <div className={styles.lookupSummaryHeader}>
                  <div className={styles.lookupSummaryTitle}>
                    Imported {batchImportSummary.createdCount + batchImportSummary.updatedCount} {batchImportSummary.providerLabel} styles
                  </div>
                  <div className={styles.lookupBadgeRow}>
                    <span className={styles.lookupBadgePrimary}>Style-level import</span>
                    <span className={styles.lookupBadgeMuted}>{batchImportSummary.providerLabel}</span>
                  </div>
                </div>
                <div className={styles.lookupSummaryLine}>
                  {batchImportSummary.styleCount} discovered from the source catalog. Colors stay attached to each style card as swatches.
                </div>
                <div className={styles.lookupMetrics}>
                  <span>{batchImportSummary.createdCount} new</span>
                  <span>{batchImportSummary.updatedCount} updated</span>
                  {batchImportSummary.failedCount > 0 && (
                    <span>{batchImportSummary.failedCount} failed</span>
                  )}
                </div>
                {batchImportSummary.failedNames.length > 0 && (
                  <div className={styles.lookupNotice}>
                    Failed: {batchImportSummary.failedNames.slice(0, 5).join(", ")}
                    {batchImportSummary.failedNames.length > 5 ? "..." : ""}
                  </div>
                )}
                <div className={styles.lookupRow}>
                  <button
                    type="button"
                    className={styles.lookupResetBtn}
                    onClick={onCancel}
                  >
                    View imported templates
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Product photo</label>
          <div className={styles.thumbRow}>
            <div className={styles.thumbDropZone}>
              <FileDropZone
                accept="image/*"
                fileName={productImageLabel}
                onFileSelected={(f) => void handleProductImage(f)}
                onClear={clearProductImage}
              />
            </div>
            {thumbDataUrl && (
              <div className={styles.productPhotoPreview}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbDataUrl}
                  alt="Thumbnail preview"
                  className={styles.thumbPreview}
                />
                {lookupResult?.imageUrl && productImageLabel && (
                  <span className={styles.productPhotoMeta}>{productImageLabel}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {productImageFile && productType && productType !== "flat" && !detectResult && !lookupResult && !smartLookupApplied && (
          <button
            type="button"
            className={styles.detectBtn}
            onClick={() => void handleAutoDetect()}
            disabled={detecting}
          >
            {detecting ? "Detecting\u2026" : "Auto-detect product specs"}
          </button>
        )}

        {detectResult && !lookupResult && !smartLookupApplied && (
          <div className={styles.detectBanner}>
            <span className={styles.detectBannerText}>
              Detected: <strong>{name || "Unknown product"}</strong> — review and confirm
            </span>
            <button
              type="button"
              className={styles.detectRerunBtn}
              onClick={() => void handleAutoDetect()}
              disabled={detecting}
            >
              {detecting ? "Re-detecting\u2026" : "Re-detect"}
            </button>
          </div>
        )}

        {detectError && !lookupResult && !smartLookupApplied && (
          <div className={styles.detectErrorBanner}>
            {detectError} — fill in manually below.
          </div>
        )}
      </div>

      {/* ── Front / Back face photos ─────────────────────────────── */}
      {productType && productType !== "flat" && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Face photos (grid overlay)</div>

          {/* ── FRONT ── */}
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Front face</label>
            <div className={styles.thumbRow}>
              <div className={styles.thumbDropZone}>
                <FileDropZone
                  accept="image/*"
                  fileName={frontPhotoDataUrl ? "front-photo" : null}
                  label="Drop front photo"
                  hint="Auto background removal"
                  onFileSelected={async (f) => {
                    const original = await fileToFacePhotoDataUrl(f);
                    if (!original) return;
                    setFrontOriginalUrl(original);
                    setFrontCleanUrl("");
                    setFrontPhotoDataUrl(original);
                    setFrontUseOriginal(false);
                    setFrontBgStatus("idle");
                    setBodyReferencePhotoDataUrl("");
                    setManufacturerLogoStamp(undefined);
                    setDetectedManufacturerLogoStamp(undefined);
                    setOutlineAssistStatus("idle");
                    setOutlineAssistNote(null);
                    setLogoAssistStatus("idle");
                    setLogoAssistNote(null);
                  }}
                  onClear={() => {
                    setFrontPhotoDataUrl("");
                    setFrontOriginalUrl("");
                    setFrontCleanUrl("");
                    setFrontBgStatus("idle");
                    setBodyReferencePhotoDataUrl("");
                    setManufacturerLogoStamp(undefined);
                    setDetectedManufacturerLogoStamp(undefined);
                    setOutlineAssistStatus("idle");
                    setOutlineAssistNote(null);
                    setLogoAssistStatus("idle");
                    setLogoAssistNote(null);
                  }}
                />
              </div>
              {(frontPhotoDataUrl || productPhotoFullUrl) && (
                <div className={styles.bgPreviewGroup}>
                  <div className={styles.bgPreviewItem}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={frontPhotoDataUrl || productPhotoFullUrl} alt="Front" className={styles.thumbPreview} />
                    {frontBgStatus === "done" && <span className={styles.bgPreviewLabelDone}>BG removed</span>}
                  </div>
                  {frontBgStatus === "idle" && (
                    <button
                      type="button"
                      className={styles.bgRemoveBtn}
                      onClick={async () => {
                        const currentFrontPreviewUrl = frontPhotoDataUrl || productPhotoFullUrl;
                        if (!currentFrontPreviewUrl) return;
                        setFrontBgStatus("processing");
                        try {
                          const res = await fetch(currentFrontPreviewUrl);
                          const blob = await res.blob();
                          const { removeBackground } = await import("@imgly/background-removal");
                          const clean = await removeBackground(blob, { model: "isnet_quint8", proxyToWorker: false });
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            const url = reader.result as string;
                            if (url) {
                              setFrontCleanUrl(url);
                              setFrontPhotoDataUrl(url);
                              setFrontBgStatus("done");
                            } else {
                              setFrontBgStatus("failed");
                            }
                          };
                          reader.onerror = () => setFrontBgStatus("failed");
                          reader.readAsDataURL(clean);
                        } catch {
                          setFrontBgStatus("failed");
                        }
                      }}
                    >
                      Remove background
                    </button>
                  )}
                  {frontBgStatus === "processing" && (
                    <span className={styles.bgProcessing}>Removing background…</span>
                  )}
                  {frontBgStatus === "done" && frontCleanUrl && (
                    <label className={styles.bgToggle}>
                      <input type="checkbox" checked={frontUseOriginal}
                        onChange={(e) => {
                          setFrontUseOriginal(e.target.checked);
                          setFrontPhotoDataUrl(e.target.checked ? frontOriginalUrl : frontCleanUrl);
                        }}
                      /> Use original
                    </label>
                  )}
                  {frontBgStatus === "failed" && (
                    <span className={styles.bgFailed}>BG removal failed — using original</span>
                  )}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
                    <button
                      type="button"
                      className={styles.detectBtn}
                      onClick={() => void runAiOutlineAssist()}
                      disabled={outlineAssistStatus === "processing"}
                    >
                      {outlineAssistStatus === "processing" ? "Preparing outline…" : "AI Prep Outline"}
                    </button>
                    <button
                      type="button"
                      className={styles.detectBtn}
                      onClick={() => void runLogoPlacementAssist()}
                      disabled={logoAssistStatus === "processing" || overallHeightMm <= 0}
                    >
                      {logoAssistStatus === "processing" ? "Detecting logo…" : "Detect Logo"}
                    </button>
                  </div>
                  {(outlineAssistNote || logoAssistNote) && (
                    <div className={styles.lookupAssistText} role="status" aria-live="polite">
                      {[outlineAssistNote, logoAssistNote].filter(Boolean).join(" ")}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Front captured prompt ── */}
          {(frontPhotoDataUrl || productPhotoFullUrl) && !backPhotoDataUrl && !mirrorForBack && (
            <div className={styles.frontCapturedBanner}>
              <div className={styles.frontCapturedTitle}>Front photo captured</div>
              <div className={styles.frontCapturedHint}>
                For two-sided placement, add a back photo or enable mirror below.
              </div>
            </div>
          )}

          {/* ── Mirror for back toggle ── */}
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel} />
            <label className={styles.mirrorToggle}>
              <input
                type="checkbox"
                checked={mirrorForBack}
                onChange={(e) => {
                  setMirrorForBack(e.target.checked);
                  if (e.target.checked) {
                    // Clear manual back photo state when switching to mirror
                    setBackOriginalUrl("");
                    setBackCleanUrl("");
                    setBackBgStatus("idle");
                    setBackUseOriginal(false);
                  }
                }}
              />
              <span>Use mirrored front photo for back side</span>
            </label>
          </div>

          {/* ── BACK — manual upload (hidden when mirroring) ── */}
          {referenceSelection && (
            <div className={styles.frontCapturedBanner}>
              <div className={styles.frontCapturedTitle}>Reference classification</div>
              <div className={styles.frontCapturedHint}>
                {canonicalFrontReferenceImage
                  ? `Front: ${canonicalFrontReferenceImage.viewClass} (${Math.round((referenceSelection.frontConfidence ?? 0) * 100)}%). `
                  : "Front: unknown. "}
                {referenceSelection.canonicalBackStatus === "true-back" && canonicalBackReferenceImage
                  ? `Back: true back (${Math.round((referenceSelection.backConfidence ?? 0) * 100)}%).`
                  : referenceSelection.canonicalBackStatus === "only-back-3q-found" && auxiliaryBackReferenceImage
                    ? `Back: unavailable. Best auxiliary reference is back-3q (${Math.round((referenceSelection.backConfidence ?? 0) * 100)}%). Enable mirror only if you want to reuse the front photo.`
                    : "Back: unknown. Add a real back photo or enable mirror manually."}
              </div>
            </div>
          )}

          {!mirrorForBack && (
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>Back face</label>
              <div className={styles.thumbRow}>
                <div className={`${styles.thumbDropZone} ${frontPhotoDataUrl && !backPhotoDataUrl ? styles.backDropHighlight : ""}`}>
                  <FileDropZone
                    accept="image/*"
                    fileName={backPhotoDataUrl ? "back-photo" : null}
                    label="Drop back photo"
                    hint={frontPhotoDataUrl ? "Rotate tumbler 180° and photograph" : "Auto background removal"}
                    onFileSelected={async (f) => {
                      const original = await fileToFacePhotoDataUrl(f);
                      if (!original) return;
                      setBackOriginalUrl(original);
                      setBackCleanUrl("");
                      setBackPhotoDataUrl(original);
                      setBackUseOriginal(false);
                      setBackBgStatus("idle");
                    }}
                    onClear={() => { setBackPhotoDataUrl(""); setBackOriginalUrl(""); setBackCleanUrl(""); setBackBgStatus("idle"); }}
                  />
                </div>
                {backPhotoDataUrl && (
                  <div className={styles.bgPreviewGroup}>
                    <div className={styles.bgPreviewItem}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={backPhotoDataUrl} alt="Back" className={styles.thumbPreview} />
                      {backBgStatus === "done" && <span className={styles.bgPreviewLabelDone}>BG removed</span>}
                    </div>
                    {backBgStatus === "idle" && (
                      <button
                        type="button"
                        className={styles.bgRemoveBtn}
                        onClick={async () => {
                          setBackBgStatus("processing");
                          try {
                            const res = await fetch(backPhotoDataUrl);
                            const blob = await res.blob();
                            const { removeBackground } = await import("@imgly/background-removal");
                            const clean = await removeBackground(blob, { model: "isnet_quint8", proxyToWorker: false });
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              const url = reader.result as string;
                              if (url) {
                                setBackCleanUrl(url);
                                setBackPhotoDataUrl(url);
                                setBackBgStatus("done");
                              } else {
                                setBackBgStatus("failed");
                              }
                            };
                            reader.onerror = () => setBackBgStatus("failed");
                            reader.readAsDataURL(clean);
                          } catch {
                            setBackBgStatus("failed");
                          }
                        }}
                      >
                        Remove background
                      </button>
                    )}
                    {backBgStatus === "processing" && (
                      <span className={styles.bgProcessing}>Removing background…</span>
                    )}
                    {backBgStatus === "done" && backCleanUrl && (
                      <label className={styles.bgToggle}>
                        <input type="checkbox" checked={backUseOriginal}
                          onChange={(e) => {
                            setBackUseOriginal(e.target.checked);
                            setBackPhotoDataUrl(e.target.checked ? backOriginalUrl : backCleanUrl);
                          }}
                        /> Use original
                      </label>
                    )}
                    {backBgStatus === "failed" && (
                      <span className={styles.bgFailed}>BG removal failed — using original</span>
                    )}
                  </div>
                )}
              </div>
              {hasStrictCanonicalBack && (
                <span className={styles.fieldHint}>
                  Canonical back is a strict true-back reference ({Math.round((referenceSelection?.backConfidence ?? 0) * 100)}% confidence).
                </span>
              )}
              {!backPhotoDataUrl && hasAuxiliaryBack3q && (
                <span className={styles.fieldHint}>
                  No strict true back was assigned. Best retained auxiliary reference is labeled back-3q ({Math.round((referenceSelection?.backConfidence ?? 0) * 100)}% confidence) and is not used for the Back face slot.
                </span>
              )}
            </div>
          )}

          {/* ── Mirror preview (when mirroring is on) ── */}
          {mirrorForBack && backPhotoDataUrl && (
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>Back (mirrored)</label>
              <div className={styles.bgPreviewGroup}>
                <div className={styles.bgPreviewItem}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={backPhotoDataUrl} alt="Mirrored back" className={styles.thumbPreview} />
                  <span className={styles.bgPreviewLabel}>Auto-mirrored</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 3D Model file ──────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>3D Model</div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>GLB / GLTF file</label>
          <div className={styles.glbRow}>
            <FileDropZone
              accept=".glb,.gltf"
              fileName={glbUploading ? "Uploading\u2026" : glbFileName}
              label="Drop GLB or GLTF file here"
              hint="3D model file for preview"
              onFileSelected={(f) => void handleGlbFile(f)}
              onClear={() => {
                setGlbFileName(null);
                setGlbPath("");
                setGlbUploadError(null);
              }}
            />
            {(glbPath || (productType && productType !== "flat")) && !glbUploading && (
              productType !== "flat" && activeDrinkwareGlbStatus?.status ? (
                <div
                  className={[
                    styles.glbPathStatusBlock,
                    activeDrinkwareGlbStatus.status === "placeholder-model" || activeDrinkwareGlbStatus.status === "missing-model"
                      ? styles.glbPathWarning
                      : "",
                  ].filter(Boolean).join(" ")}
                >
                  <span className={styles.glbPathStatusLabel}>{getDrinkwareGlbStatusLabel(activeDrinkwareGlbStatus.status)}</span>
                  <span className={styles.glbPathValue}>{glbPath || "No GLB assigned"}</span>
                  {activeDrinkwareGlbStatus.sourceLabel && (
                    <div className={styles.glbPathNote}>{activeDrinkwareGlbStatus.sourceLabel}</div>
                  )}
                </div>
              ) : getFlatGlbStatusLabel(activeFlatLookupModel) ? (
                <div
                  className={[
                    styles.glbPathStatusBlock,
                    activeFlatLookupModel?.isProxy ? styles.glbPathWarning : "",
                    activeFlatLookupModel?.requiresReview && !activeFlatLookupModel?.isProxy ? styles.glbPathReview : "",
                  ].filter(Boolean).join(" ")}
                >
                  <span className={styles.glbPathStatusLabel}>{getFlatGlbStatusLabel(activeFlatLookupModel)}</span>
                  <span className={styles.glbPathValue}>{glbPath}</span>
                </div>
              ) : (
                <span className={styles.glbPathConfirm}>
                  {glbPath} ✓
                </span>
              )
            )}
            {glbUploadError && (
              <span className={styles.error}>{glbUploadError}</span>
            )}
            <input
              className={styles.textInput}
              type="text"
              value={glbPath}
              onChange={(e) => {
                setGlbPath(e.target.value);
                setGlbUploadError(null);
              }}
              onBlur={() => {
                if (glbPath.trim()) void verifyCurrentGlbPath();
              }}
              placeholder="/models/templates/my-model.glb"
            />
            {activeFlatLookupModel && getFlatLookupNotice(activeFlatLookupModel) && (
              <div className={styles.glbPathNote}>{getFlatLookupNotice(activeFlatLookupModel)}</div>
            )}
          </div>
        </div>

        {glbPath && productType && productType !== "flat" && (
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Orientation</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                type="button"
                className={styles.detectBtn}
                disabled={checkingGlbPath}
                onClick={() => {
                  void (async () => {
                    const ok = await verifyCurrentGlbPath();
                    if (ok) setShowMappingWizard(true);
                  })();
                }}
              >
                {checkingGlbPath
                  ? "Checking model\u2026"
                  : tumblerMapping?.isMapped
                    ? "Re-map orientation"
                    : "Map tumbler orientation"}
              </button>
              {tumblerMapping?.isMapped && (
                <span className={styles.glbPathConfirm}>
                  Mapped ({((tumblerMapping.frontFaceRotation * 180) / Math.PI).toFixed(0)}&deg;) &#x2713;
                </span>
              )}
            </div>
          </div>
        )}

        {(glbPath.trim() || previewModelFile || liveFlatPreview || previewLoadError || canUseCanonicalPreviewModel) && (
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Preview</label>
            <div className={styles.modelPreviewBlock}>
              <div className={styles.modelPreviewMeta}>
                <span className={styles.modelPreviewMode}>
                  {getPreviewModelModeLabel({
                    productType,
                    mode: previewModelMode,
                    glbStatus: activeDrinkwareGlbStatus?.status,
                  })}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {productType !== "flat" && (
                    <>
                      <button
                        type="button"
                        className={`${styles.detectBtn} ${previewModelMode === "alignment-model" ? styles.detectBtnActive : ""}`}
                        disabled={!canUseCanonicalPreviewModel}
                        aria-pressed={previewModelMode === "alignment-model"}
                        onClick={() => handlePreviewModelModeChange("alignment-model")}
                      >
                        Alignment (Default)
                      </button>
                      <button
                        type="button"
                        className={`${styles.detectBtn} ${previewModelMode === "full-model" ? styles.detectBtnActive : ""}`}
                        disabled={!canUseCanonicalPreviewModel}
                        aria-pressed={previewModelMode === "full-model"}
                        onClick={() => handlePreviewModelModeChange("full-model")}
                      >
                        Full
                      </button>
                      <button
                        type="button"
                        className={`${styles.detectBtn} ${previewModelMode === "source-traced" ? styles.detectBtnActive : ""}`}
                        disabled={!hasSourcePreviewModel}
                        aria-pressed={previewModelMode === "source-traced"}
                        onClick={() => handlePreviewModelModeChange("source-traced")}
                      >
                        Source (Compare)
                      </button>
                    </>
                  )}
                  {!glbPath.trim() && !previewModelFile && liveFlatPreview && (
                    <span className={styles.modelPreviewDims}>
                      {liveFlatPreview.widthMm} x {liveFlatPreview.heightMm} x {liveFlatPreview.thicknessMm} mm
                    </span>
                  )}
                  {productType !== "flat" && activeDrinkwareGlbStatus && previewModelMode === "source-traced" && (
                    <span className={styles.modelPreviewDims}>
                      {getDrinkwareGlbStatusLabel(activeDrinkwareGlbStatus.status) ?? "Source model"}
                    </span>
                  )}
                </div>
              </div>
              <div className={styles.modelPreviewViewport}>
                {glbPath.trim() || previewModelFile || liveFlatPreview || canUseCanonicalPreviewModel ? (
                  <>
                    <ModelViewer
                      file={previewModelFile}
                      modelUrl={resolvedDrinkwarePreviewModelUrl}
                      flatPreview={
                        preferGeneratedFlatPreview
                          ? liveFlatPreview
                          : (previewModelFile ? null : liveFlatPreview)
                      }
                      bedWidthMm={liveFlatPreview?.widthMm}
                      bedHeightMm={liveFlatPreview?.heightMm}
                      tumblerDims={
                        previewModelMode === "full-model"
                          ? (fullPreviewTumblerDims ?? liveTumblerDims)
                          : liveTumblerDims
                      }
                      handleArcDeg={handleArcDeg}
                      glbPath={glbPath || null}
                      tumblerMapping={tumblerMapping}
                      bodyTintColor={productType === "flat" ? undefined : bodyColorHex}
                      lidTintColor={productType === "flat" ? undefined : lidColorHex}
                      rimTintColor={productType === "flat" ? undefined : rimColorHex}
                      lidAssemblyPreset={productType === "flat" ? undefined : fullPreviewLidPreset}
                      manufacturerLogoStamp={productType === "flat" ? undefined : manufacturerLogoStamp}
                      showTemplateSurfaceZones={previewModelMode === "alignment-model"}
                      dimensionCalibration={
                        productType === "flat"
                          ? undefined
                          : (
                              previewModelMode === "full-model"
                                ? (fullPreviewCanonicalDimensionCalibration ?? activeCanonicalDimensionCalibration)
                                : activeCanonicalDimensionCalibration
                            )
                      }
                      canonicalBodyProfile={
                        productType === "flat"
                          ? undefined
                          : (
                              previewModelMode === "full-model"
                                ? (fullPreviewCanonicalBodyProfile ?? activeCanonicalBodyProfile)
                                : activeCanonicalBodyProfile
                            )
                      }
                      canonicalHandleProfile={productType === "flat" ? undefined : normalizedCanonicalHandleProfile}
                      editableHandlePreview={productType === "flat" ? undefined : editableHandlePreview}
                      previewModelMode={previewModelMode}
                    />
                    {productType !== "flat" && previewModelMode === "alignment-model" && activeCanonicalBodyProfile && activeCanonicalDimensionCalibration && (
                      <svg
                        className={styles.modelPreviewOverlay}
                        viewBox={`${activeCanonicalDimensionCalibration.svgFrontViewBoxMm.x} ${activeCanonicalDimensionCalibration.svgFrontViewBoxMm.y} ${activeCanonicalDimensionCalibration.svgFrontViewBoxMm.width} ${activeCanonicalDimensionCalibration.svgFrontViewBoxMm.height}`}
                        preserveAspectRatio="xMidYMid meet"
                        aria-hidden="true"
                      >
                        <path
                          d={activeCanonicalBodyProfile.svgPath}
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth={0.8}
                          vectorEffect="non-scaling-stroke"
                          opacity={0.92}
                        />
                        {alignmentLogoOverlay && (
                          <>
                            <rect
                              x={alignmentLogoOverlay.centerXMm - alignmentLogoOverlay.widthMm / 2}
                              y={alignmentLogoOverlay.centerYMm - alignmentLogoOverlay.heightMm / 2}
                              width={alignmentLogoOverlay.widthMm}
                              height={alignmentLogoOverlay.heightMm}
                              fill="none"
                              stroke={alignmentLogoOverlay.strokeColor}
                              strokeWidth={0.8}
                              strokeDasharray="2 1.5"
                              vectorEffect="non-scaling-stroke"
                              opacity={0.95}
                            />
                            <line
                              x1={alignmentLogoOverlay.centerXMm}
                              y1={alignmentLogoOverlay.centerYMm - alignmentLogoOverlay.heightMm / 2}
                              x2={alignmentLogoOverlay.centerXMm}
                              y2={alignmentLogoOverlay.centerYMm + alignmentLogoOverlay.heightMm / 2}
                              stroke={alignmentLogoOverlay.strokeColor}
                              strokeWidth={0.8}
                              strokeDasharray="2 1.5"
                              vectorEffect="non-scaling-stroke"
                              opacity={0.92}
                            />
                            <line
                              x1={alignmentLogoOverlay.centerXMm - alignmentLogoOverlay.widthMm / 2}
                              y1={alignmentLogoOverlay.centerYMm}
                              x2={alignmentLogoOverlay.centerXMm + alignmentLogoOverlay.widthMm / 2}
                              y2={alignmentLogoOverlay.centerYMm}
                              stroke={alignmentLogoOverlay.strokeColor}
                              strokeWidth={0.8}
                              strokeDasharray="2 1.5"
                              vectorEffect="non-scaling-stroke"
                              opacity={0.92}
                            />
                          </>
                        )}
                      </svg>
                    )}
                  </>
                ) : (
                  <div className={styles.modelPreviewEmpty}>Preview unavailable</div>
                )}
              </div>
              {productType !== "flat" && previewModelMode === "alignment-model" && alignmentShellMismatchSummary && (
                <div className={styles.modelPreviewDims}>
                  Canonical silhouette QA: avg {alignmentShellMismatchSummary.averageErrorMm.toFixed(2)} mm / max {alignmentShellMismatchSummary.maxErrorMm.toFixed(2)} mm across {alignmentShellMismatchSummary.rowCount} rows
                  {" "}
                  {silhouetteLockPass ? "PASS" : "MISMATCH WARNING"}
                </div>
              )}
              {productType !== "flat" && previewModelMode === "alignment-model" && alignmentOrientationQASummary && (
                <div className={styles.modelPreviewDims}>
                  Canonical orientation QA: body top {alignmentOrientationQASummary.bodyTopWorldY.toFixed(1)} &gt; body bottom {alignmentOrientationQASummary.bodyBottomWorldY.toFixed(1)}
                  {" / "}
                  printable {alignmentOrientationQASummary.printableTopWorldY != null && alignmentOrientationQASummary.printableBottomWorldY != null
                    ? `${alignmentOrientationQASummary.printableTopWorldY.toFixed(1)} > ${alignmentOrientationQASummary.printableBottomWorldY.toFixed(1)}`
                    : "pending"}
                  {" / "}
                  sample order {alignmentOrientationQASummary.topSampleWorldY.toFixed(1)} &gt; {alignmentOrientationQASummary.bottomSampleWorldY.toFixed(1)}
                  {" "}
                  {orientationLockPass ? "PASS" : "ORIENTATION WARNING"}
                </div>
              )}
              {productType !== "flat" && canUseCanonicalPreviewModel && previewModelMode === "alignment-model" && (
                <div className={styles.modelPreviewHint}>
                  Alignment is the production-default view. Placement, wrap mapping, centerline, and snap stay pinned to canonical alignment data.
                </div>
              )}
              {productType !== "flat" && canUseCanonicalPreviewModel && previewModelMode === "source-traced" && (
                <div className={styles.modelPreviewCompareNote}>
                  Source is compare/debug only. Placement, wrap mapping, centerline, and snap still use canonical alignment data.
                </div>
              )}
              {previewLoadError && (
                <div className={styles.modelPreviewNote}>{previewLoadError}</div>
              )}
            </div>
          </div>
        )}

{productType !== "flat" && activeCanonicalDimensionCalibration && activeCanonicalBodyProfile && (
          <>
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>Calibration</label>
              <div className={styles.readOnly}>
                {activeCanonicalDimensionCalibration.frontVisibleWidthMm} mm front width / {activeCanonicalDimensionCalibration.wrapWidthMm} mm wrap width
              </div>
              <span className={styles.fieldHint}>Front projection and wrap circumference stay distinct but share one mm calibration.</span>
            </div>
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>Photo -&gt; front</label>
              <div className={styles.readOnly}>
                {activeCanonicalDimensionCalibration!.photoToFrontTransform.matrix.map((value) => value.toFixed(4)).join(", ")}
              </div>
            </div>
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>Front axis (px)</label>
              <div className={styles.readOnly}>
                {activeCanonicalDimensionCalibration!.frontAxisPx.xTop.toFixed(1)}, {activeCanonicalDimensionCalibration!.frontAxisPx.yTop.toFixed(1)}
                {" -> "}
                {activeCanonicalDimensionCalibration!.frontAxisPx.xBottom.toFixed(1)}, {activeCanonicalDimensionCalibration!.frontAxisPx.yBottom.toFixed(1)}
              </div>
            </div>
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>SVG front box</label>
              <div className={styles.readOnly}>
                {activeCanonicalDimensionCalibration!.svgFrontViewBoxMm.x.toFixed(1)},
                {" "}
                {activeCanonicalDimensionCalibration!.svgFrontViewBoxMm.y.toFixed(1)},
                {" "}
                {activeCanonicalDimensionCalibration!.svgFrontViewBoxMm.width.toFixed(1)} x {activeCanonicalDimensionCalibration!.svgFrontViewBoxMm.height.toFixed(1)} mm
              </div>
            </div>
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>Wrap mapping</label>
              <div className={styles.readOnly}>
                front {activeCanonicalDimensionCalibration.wrapMappingMm.frontMeridianMm.toFixed(1)} / back {activeCanonicalDimensionCalibration.wrapMappingMm.backMeridianMm.toFixed(1)} / GLB {activeCanonicalDimensionCalibration.glbScale.unitsPerMm.toFixed(2)} units/mm / camera body-only
              </div>
            </div>
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>Handle mesh</label>
              <div className={styles.readOnly}>
                {usingEditableHandlePreview && editableHandlePreview
                  ? `${editableHandlePreview.side} / ${(editableHandlePreview.tubeDiameterMm ?? 0).toFixed(2)} mm depth / editable`
                  : canonicalHandleDebugSummary
                  ? `${canonicalHandleDebugSummary.side} / ${canonicalHandleDebugSummary.extrusionDepthMm.toFixed(2)} mm depth / ${Math.round(canonicalHandleDebugSummary.confidence * 100)}% confidence / ${canonicalHandleRenderMode}`
                  : "Unavailable"}
              </div>
              <span className={styles.fieldHint}>
                {usingEditableHandlePreview
                  ? "Full-model preview is using the editable BODY REFERENCE handle path. Canonical handle extraction stays available as fallback/debug data."
                  : canonicalHandleDebugSummary?.derivedFromCanonicalProfile
                  ? canonicalHandleRenderMode === "simplified"
                    ? "Simplified handle mesh derived from canonical anchors/opening because traced confidence is mid-range."
                    : canonicalHandleRenderMode === "hidden"
                      ? "Handle stays out of alignment rendering; keep-out data remains active."
                      : "Separate symmetric extrusion from canonical handle outer/inner contours."
                  : "No canonical handle profile available for extrusion."}
              </span>
            </div>
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>Handle keep-out</label>
              <div className={styles.readOnly}>
                {activeCanonicalDimensionCalibration!.wrapMappingMm.handleKeepOutArcDeg && activeCanonicalDimensionCalibration!.wrapMappingMm.handleMeridianMm != null
                  ? `center ${activeCanonicalDimensionCalibration!.wrapMappingMm.handleMeridianMm.toFixed(1)} mm / arc ${activeCanonicalDimensionCalibration!.wrapMappingMm.handleKeepOutArcDeg.toFixed(1)} deg / sector ${activeCanonicalDimensionCalibration!.wrapMappingMm.handleKeepOutStartMm?.toFixed(1)} -> ${activeCanonicalDimensionCalibration!.wrapMappingMm.handleKeepOutEndMm?.toFixed(1)} mm`
                  : "None"}
              </div>
              <span className={styles.fieldHint}>Wrap math stays body-only; the handle reserves an exclusion sector instead of receiving wrap artwork.</span>
            </div>
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>Front logo</label>
              <div className={styles.readOnly}>
                {manufacturerLogoStamp?.logoPlacement
                  ? `${manufacturerLogoStamp.logoPlacement!.source} / theta ${((manufacturerLogoStamp.logoPlacement!.thetaCenter * 180) / Math.PI).toFixed(1)} deg / span ${((manufacturerLogoStamp.logoPlacement!.thetaSpan * 180) / Math.PI).toFixed(1)} deg / s ${manufacturerLogoStamp.logoPlacement!.sCenter.toFixed(3)} / ${Math.round(manufacturerLogoStamp.logoPlacement!.confidence * 100)}%`
                  : "Not detected"}
              </div>
              <span className={styles.fieldHint}>Stored in canonical body-local coordinates and reused by preview, wrap preview, and guide export.</span>
            </div>
            {logoPlacementSurfaceStatus && (
              <div className={styles.fieldRow}>
                <label className={styles.fieldLabel}>Logo boundary</label>
                <div className={styles.readOnly}>
                  {logoPlacementSurfaceStatus.logoTopMm.toFixed(1)}-{logoPlacementSurfaceStatus.logoBottomMm.toFixed(1)} mm
                </div>
                <span
                  className={`${styles.fieldHint} ${
                    lockedProductionGeometry && logoPlacementSurfaceStatus.overlapsPrintableSurface
                      ? styles.surfaceContractSummaryWarning
                      : ""
                  }`}
                >
                  {lockedProductionGeometry
                    ? logoPlacementSurfaceStatus.overlapsPrintableSurface
                      ? `Locked production warning: logo region crosses the printable ${
                          logoPlacementSurfaceStatus.overlapsTop && logoPlacementSurfaceStatus.overlapsBottom
                            ? "top and bottom boundaries"
                            : logoPlacementSurfaceStatus.overlapsTop
                              ? "top boundary"
                              : "bottom boundary"
                        } (${logoPlacementSurfaceStatus.printableTopMm.toFixed(1)}-${logoPlacementSurfaceStatus.printableBottomMm.toFixed(1)} mm from body top).`
                      : `Locked production check: logo region stays inside the printable ${logoPlacementSurfaceStatus.printableTopMm.toFixed(1)}-${logoPlacementSurfaceStatus.printableBottomMm.toFixed(1)} mm band.`
                    : `Manual geometry overrides are enabled. Printable-boundary checks remain advisory for the ${logoPlacementSurfaceStatus.printableTopMm.toFixed(1)}-${logoPlacementSurfaceStatus.printableBottomMm.toFixed(1)} mm band.`}
                </span>
              </div>
            )}
            {manufacturerLogoStamp?.logoPlacement && (
              <div className={styles.fieldRow}>
                <label className={styles.fieldLabel}>Logo adjust</label>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className={styles.detectBtn}
                    onClick={() => applyLogoPlacementAdjustment((placement) => ({
                      ...placement,
                      thetaCenter: Math.max(-Math.PI, placement.thetaCenter - (Math.PI / 90)),
                    }))}
                  >
                    theta -
                  </button>
                  <button
                    type="button"
                    className={styles.detectBtn}
                    onClick={() => applyLogoPlacementAdjustment((placement) => ({
                      ...placement,
                      thetaCenter: Math.min(Math.PI, placement.thetaCenter + (Math.PI / 90)),
                    }))}
                  >
                    theta +
                  </button>
                  <button
                    type="button"
                    className={styles.detectBtn}
                    onClick={() => applyLogoPlacementAdjustment((placement) => ({
                      ...placement,
                      sCenter: Math.max(0, placement.sCenter - 0.01),
                    }))}
                  >
                    s -
                  </button>
                  <button
                    type="button"
                    className={styles.detectBtn}
                    onClick={() => applyLogoPlacementAdjustment((placement) => ({
                      ...placement,
                      sCenter: Math.min(1, placement.sCenter + 0.01),
                    }))}
                  >
                    s +
                  </button>
                  <button
                    type="button"
                    className={styles.detectBtn}
                    onClick={() => applyLogoPlacementAdjustment((placement) => ({
                      ...placement,
                      thetaSpan: Math.max(0.08, placement.thetaSpan - (Math.PI / 120)),
                      sSpan: Math.max(0.02, placement.sSpan - 0.01),
                    }))}
                  >
                    span -
                  </button>
                  <button
                    type="button"
                    className={styles.detectBtn}
                    onClick={() => applyLogoPlacementAdjustment((placement) => ({
                      ...placement,
                      thetaSpan: Math.min(Math.PI, placement.thetaSpan + (Math.PI / 120)),
                      sSpan: Math.min(0.8, placement.sSpan + 0.01),
                    }))}
                  >
                    span +
                  </button>
                  <button
                    type="button"
                    className={styles.lookupResetBtn}
                    onClick={resetManufacturerLogoStampPlacement}
                    disabled={!detectedManufacturerLogoStamp?.logoPlacement}
                  >
                    Reset to detected
                  </button>
                  <button
                    type="button"
                    className={styles.lookupResetBtn}
                    onClick={() => applyLogoPlacementAdjustment((placement) => ({
                      ...placement,
                      thetaCenter: wrapTheta(placement.thetaCenter + Math.PI),
                    }))}
                  >
                    Duplicate to back
                  </button>
                </div>
                <span className={styles.fieldHint}>Manual nudges change the stored body-local logo region only. Reset restores the last detected placement.</span>
              </div>
            )}
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>Locked production geometry</label>
              <div className={styles.readOnly}>
                wrap width authoritative: {lockedProductionGeometry ? "yes" : "no"} / derived diameter {effectiveCylinderDiameterMm.toFixed(2)} mm / derived front width {frontVisibleWidthReady ? `${derivedFrontVisibleWidthMm.toFixed(2)} mm` : "pending body calibration"} / handle excluded from alignment: yes / silhouette QA: {silhouetteLockPass ? "PASS" : "MISMATCH"} / orientation QA: {alignmentOrientationQASummary ? (orientationLockPass ? "PASS" : "WARNING") : "pending"}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Physical dimensions ───────────────────────────────────── */}
      {productType !== "flat" && pipelineDebugSections.length > 0 && (
        <div className={styles.section}>
          <PipelineDebugDrawer
            title="Pipeline Debug"
            subtitle="Read-only canonical workflow state, formulas, confidence, and warnings."
            sections={pipelineDebugSections}
            warnings={pipelineDebugWarnings}
            rawObjects={pipelineDebugRawObjects}
            formulas={pipelineDebugFormulas}
            debugJson={pipelineDebugJson}
          />
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Physical dimensions</div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>
            {productType === "flat" ? "Template width (mm) *" : "Front visible width (derived)"}
          </label>
          {productType === "flat" ? (
            <input
              className={styles.numInput}
              type="number"
              value={flatWidthMm || ""}
              step={0.1}
              onChange={(e) => {
                setFlatWidthMm(Number(e.target.value) || 0);
              }}
            />
          ) : (
            <>
              <span className={styles.readOnly}>
                {frontVisibleWidthReady ? `${derivedFrontVisibleWidthMm} mm` : "\u2014"}
              </span>
              <span className={styles.fieldHint}>
                {frontVisibleWidthReady
                  ? "Derived from the canonical body profile and used for body-only front alignment."
                  : "Available after BODY REFERENCE calibration builds the canonical body profile."}
              </span>
            </>
          )}
        </div>

        {productType && productType !== "flat" && (
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Wrap width / circumference (mm) *</label>
            <input
              className={styles.numInput}
              type="number"
              value={wrapWidthInputMm || ""}
              step={0.1}
              min={0}
              onChange={(e) => {
                setWrapWidthInputMm(Number(e.target.value) || 0);
              }}
            />
            <span className={styles.fieldHint}>Production-authoritative width. Cylinder diameter is derived from this value using diameter = wrap width / π.</span>
          </div>
        )}

        {productType && productType !== "flat" && (
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Cylinder diameter (derived)</label>
            <span className={styles.readOnly}>
              {effectiveCylinderDiameterMm > 0 ? `${effectiveCylinderDiameterMm} mm` : "\u2014"}
            </span>
            <span className={styles.fieldHint}>Read-only in locked production mode. Formula: diameter = wrap width / π.</span>
          </div>
        )}

        {productType && productType !== "flat" && (
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Overall height (assembled)</label>
            <span className={styles.readOnly}>
              {overallHeightMm > 0 ? `${round2(overallHeightMm)} mm` : "\u2014"}
            </span>
            <span className={styles.fieldHint}>Catalog/lookup seed for the full assembled product. This is not the printable body height.</span>
          </div>
        )}

        {productType && productType !== "flat" && (
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Base diameter</label>
            <span className={styles.readOnly}>
              {baseDiameterMm > 0 ? `${round2(baseDiameterMm)} mm` : "\u2014"}
            </span>
            <span className={styles.fieldHint}>Body-only lower base/foot diameter. Never derived from overall handle span.</span>
          </div>
        )}

        {productType && productType !== "flat" && (
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Printable top (derived)</label>
            <span className={styles.readOnly}>
              {activePrintableSurfaceResolution
                ? `${round2(activePrintableSurfaceResolution.printableSurfaceContract.printableTopMm)} mm`
                : "\u2014"}
            </span>
            <span className={styles.fieldHint}>Derived from detected lid/body or silver-ring boundaries, measured from the overall top.</span>
          </div>
        )}

        {productType && productType !== "flat" && (
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Printable bottom (derived)</label>
            <span className={styles.readOnly}>
              {activePrintableSurfaceResolution
                ? `${round2(activePrintableSurfaceResolution.printableSurfaceContract.printableBottomMm)} mm`
                : "\u2014"}
            </span>
            <span className={styles.fieldHint}>Derived from the lower taper/base transition, measured from the overall top.</span>
          </div>
        )}

        {productType && productType !== "flat" && (
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Printable height (derived)</label>
            <span className={styles.readOnly}>
              {activePrintableSurfaceResolution
                ? `${round2(activePrintableSurfaceResolution.printableSurfaceContract.printableHeightMm)} mm`
                : (printHeightMm > 0 ? `${round2(printHeightMm)} mm` : "\u2014")}
            </span>
            <span className={styles.fieldHint}>Derived from printable top and bottom boundaries; not seeded from the overall catalog height.</span>
          </div>
        )}

        {productType && productType !== "flat" && handleSpanMm != null && handleSpanMm > 0 && (
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Overall handle span metadata</label>
            <span className={styles.readOnly}>
              {round2(handleSpanMm)} mm
            </span>
            <span className={styles.fieldHint}>Reference only. Excluded from body diameter, wrap width, meridians, and alignment math.</span>
          </div>
        )}

        {productType && productType !== "flat" && printableHeightLooksLikeOverallHeight && (
          <div className={styles.error}>
            Printable height is still matching the overall assembled height. Re-run BODY REFERENCE analysis or set printable top / bottom before saving production geometry.
          </div>
        )}

        {productType && productType !== "flat" && handleSpanContaminatesBodyWidth && (
          <div className={styles.error}>
            Overall handle span is matching the body diameter. Handle span metadata must stay separate from body diameter and wrap-width math.
          </div>
        )}

        {productType && productType !== "flat" && (
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Locked production geometry</label>
            <label className={styles.fieldHint}>
              <input
                type="checkbox"
                checked={advancedGeometryOverridesUnlocked}
                onChange={(e) => setAdvancedGeometryOverridesUnlocked(e.target.checked)}
              />
              {" "}Unlock advanced geometry overrides
            </label>
            <span className={styles.fieldHint}>
              {advancedGeometryOverridesUnlocked
                ? "Manual overrides are enabled. The template is no longer in locked production mode."
                : "Wrap width is authoritative. Diameter and front alignment width are derived automatically."}
            </span>
          </div>
        )}

        {productType && productType !== "flat" && activeCanonicalBodyProfile && (
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Canonical body shell</label>
            <span className={styles.readOnly}>
              clean side {activeCanonicalBodyProfile.symmetrySource} / mirrored shell / body-only
            </span>
            <span className={styles.fieldHint}>Body geometry is sampled from the non-handle side and mirrored across the detected body axis. Interior logo/ring analysis does not redefine the shell.</span>
          </div>
        )}

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Print height (mm) *</label>
          <input
            className={styles.numInput}
            type="number"
            value={printHeightMm || ""}
            step={0.1}
            onChange={(e) => setPrintHeightMm(Number(e.target.value) || 0)}
          />
        </div>

        {productType === "flat" && (
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>Thickness (mm)</label>
            <input
              className={styles.numInput}
              type="number"
              value={flatThicknessMm || ""}
              step={0.1}
              min={0}
              onChange={(e) => setFlatThicknessMm(Number(e.target.value) || 0)}
            />
            <span className={styles.fieldHint}>Used for generated 3D preview</span>
          </div>
        )}

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>
            {productType === "flat" ? "Template width" : "Wrap width / circumference"}
          </label>
          <span className={styles.readOnly}>
            {templateWidthMm > 0 ? `${templateWidthMm} mm` : "\u2014"}{" "}
            <span className={styles.fieldHint}>
              {productType === "flat" ? "(from flat width)" : lockedProductionGeometry ? "(authoritative)" : "(derived from override diameter)"}
            </span>
          </span>
        </div>

        {productType && productType !== "flat" && (
          <>
            {advancedGeometryOverridesUnlocked && (
              <>
                <div className={styles.fieldRow}>
                  <label className={styles.fieldLabel}>Top outer diameter override (mm)</label>
                  <input
                    className={styles.numInput}
                    type="number"
                    value={topOuterDiameterMm || ""}
                    step={0.1}
                    min={0}
                    onChange={(e) => setTopOuterDiameterMm(Number(e.target.value) || 0)}
                  />
                  <span className={styles.fieldHint}>Optional lid/rim outer-size override for preview and reference fitting.</span>
                </div>

                <div className={styles.fieldRow}>
                  <label className={styles.fieldLabel}>Cylinder diameter override (mm)</label>
                  <input
                    className={styles.numInput}
                    type="number"
                    value={diameterMm || ""}
                    step={0.1}
                    min={0}
                    onChange={(e) => {
                      const next = Number(e.target.value) || 0;
                      const shouldSyncBase = baseDiameterMm <= 0 || Math.abs(baseDiameterMm - diameterMm) < 0.01;
                      setDiameterMm(next);
                      if (shouldSyncBase) setBaseDiameterMm(next);
                    }}
                  />
                  <span className={styles.fieldHint}>Manual override only. Locked-production consumers still derive from wrap width when overrides are disabled.</span>
                </div>

                <div className={styles.fieldRow}>
                  <label className={styles.fieldLabel}>Base diameter (mm)</label>
                  <input
                    className={styles.numInput}
                    type="number"
                    value={baseDiameterMm || ""}
                    step={0.1}
                    min={0}
                    onChange={(e) => setBaseDiameterMm(Number(e.target.value) || 0)}
                  />
                  <span className={styles.fieldHint}>Used for the lower foot / taper width.</span>
                </div>
              </>
            )}

            {hasBlockingGeometryMismatch && (
              <div className={styles.error}>
                Cylinder diameter override differs from wrap width by {derivedDiameterMismatchMm.toFixed(2)} mm.
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setDiameterMm(round2(templateWidthMm / Math.PI))}
                >
                  Recompute derived fields from wrap width
                </button>
              </div>
            )}

            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>Handle arc (&deg;)</label>
              <input
                className={styles.numInput}
                type="number"
                value={handleArcDeg}
                step={1}
                min={0}
                max={360}
                onChange={(e) => setHandleArcDeg(Number(e.target.value) || 0)}
              />
              <span className={styles.fieldHint}>0 = no handle, 90 = YETI Rambler style</span>
            </div>

            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>Taper correction</label>
              <select
                className={styles.selectInput}
                value={taperCorrection}
                onChange={(e) => setTaperCorrection(e.target.value as "none" | "top-narrow" | "bottom-narrow")}
              >
                <option value="none">None</option>
                <option value="top-narrow">Top narrow</option>
                <option value="bottom-narrow">Bottom narrow</option>
              </select>
            </div>
          </>
        )}
      </div>

      {/* ── Engravable zone editor ──────────────────────────────── */}
      {productType && productType !== "flat" && activeReferencePhotoDataUrl && (overallHeightMm <= 0 || effectiveCylinderDiameterMm <= 0) && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Body reference</div>
          <div className={styles.bodyReferenceLockedNotice}>
            Body reference stays hidden until the required dimensions are filled.
            {overallHeightMm <= 0 && " Add overall height."}
            {effectiveCylinderDiameterMm <= 0 && " Add wrap width / circumference."}
          </div>
        </div>
      )}
      {productType && productType !== "flat" && activeReferencePhotoDataUrl && overallHeightMm > 0 && effectiveCylinderDiameterMm > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Body reference</div>
          {activePrintableSurfaceResolution && (
            <div className={styles.surfaceContractSummary}>
              <div className={styles.surfaceContractSummaryGrid}>
                <div>
                  <div className={styles.surfaceContractMetricLabel}>Printable top</div>
                  <div className={styles.surfaceContractMetricValue}>
                    {round2(activePrintableSurfaceResolution.printableSurfaceContract.printableTopMm)} mm
                  </div>
                </div>
                <div>
                  <div className={styles.surfaceContractMetricLabel}>Printable bottom</div>
                  <div className={styles.surfaceContractMetricValue}>
                    {round2(activePrintableSurfaceResolution.printableSurfaceContract.printableBottomMm)} mm
                  </div>
                </div>
                <div>
                  <div className={styles.surfaceContractMetricLabel}>Printable height</div>
                  <div className={styles.surfaceContractMetricValue}>
                    {round2(activePrintableSurfaceResolution.printableSurfaceContract.printableHeightMm)} mm
                  </div>
                </div>
                <div>
                  <div className={styles.surfaceContractMetricLabel}>Top exclusions</div>
                  <div className={styles.surfaceContractMetricValue}>
                    {activePrintableSurfaceResolution.printableSurfaceContract.axialExclusions
                      .filter((band) => band.kind !== "base")
                      .map((band) => (band.kind === "rim-ring" ? "ring" : band.kind))
                      .join(" / ") || "none"}
                  </div>
                </div>
                <div>
                  <div className={styles.surfaceContractMetricLabel}>Handle keep-out</div>
                  <div className={styles.surfaceContractMetricValue}>
                    {activePrintableSurfaceResolution.printableSurfaceContract.circumferentialExclusions.length ? "yes" : "no"}
                  </div>
                </div>
                <div>
                  <div className={styles.surfaceContractMetricLabel}>Boundary source</div>
                  <div className={styles.surfaceContractMetricValue}>
                    {activePrintableSurfaceResolution.topBoundarySource}
                  </div>
                </div>
              </div>
              <div className={`${styles.surfaceContractSummaryNote} ${bodyReferenceQa?.severity === "action" ? styles.surfaceContractSummaryWarning : ""}`}>
                {bodyReferenceQa?.severity === "action" && bodyReferenceWarnings[0]
                  ? bodyReferenceWarnings[0]
                  : "Axial bands only affect printable height. Wrap width and centerline stay unchanged."}
              </div>
            </div>
          )}
          <EngravableZoneEditor
            photoDataUrl={activeReferencePhotoDataUrl}
            overallHeightMm={activeCanonicalDimensionCalibration?.totalHeightMm ?? overallHeightMm}
            bodyTopFromOverallMm={activeCanonicalDimensionCalibration?.lidBodyLineMm ?? bodyTopFromOverallMm}
            bodyBottomFromOverallMm={activeCanonicalDimensionCalibration?.bodyBottomMm ?? bodyBottomFromOverallMm}
            lidSeamFromOverallMm={resolvedLidSeamForPersistence ?? lidSeamFromOverallMm}
            silverBandBottomFromOverallMm={resolvedSilverBandBottomForPersistence ?? silverBandBottomFromOverallMm}
            diameterMm={activeCanonicalDimensionCalibration?.wrapDiameterMm ?? effectiveCylinderDiameterMm}
            bodyWrapDiameterMm={activeCanonicalDimensionCalibration?.wrapDiameterMm ?? effectiveCylinderDiameterMm}
            topOuterDiameterMm={topOuterDiameterMm}
            baseDiameterMm={baseDiameterMm}
            photoWidthScalePct={referencePhotoWidthScalePct}
            photoHeightScalePct={referencePhotoHeightScalePct}
            photoLockAspect={referencePhotoLockAspect}
            photoOffsetXPct={referencePhotoOffsetXPct}
            photoOffsetYPct={referencePhotoOffsetYPct}
            photoAnchorY={referencePhotoAnchorY}
            photoCenterMode={referencePhotoCenterMode}
            bodyColorHex={bodyColorHex}
            lidColorHex={lidColorHex}
            rimColorHex={rimColorHex}
            fitDebug={lookupResult?.fitDebug ?? null}
            canonicalHandleProfile={normalizedCanonicalHandleProfile ?? null}
            outlineProfile={bodyOutlineProfile}
            referencePaths={referencePaths}
            referenceLayerState={referenceLayerState}
            dimensionCalibration={activeCanonicalDimensionCalibration ?? undefined}
            printableSurfaceContract={activePrintableSurfaceResolution?.printableSurfaceContract ?? null}
            printableTopOverrideMm={printableTopOverrideMm}
            printableBottomOverrideMm={printableBottomOverrideMm}
            onChange={(bodyTop, bodyBottom) => {
              setBodyTopFromOverallMm(bodyTop);
              setBodyBottomFromOverallMm(bodyBottom);
            }}
            onLidSeamChange={setLidSeamFromOverallMm}
            onSilverBandBottomChange={setSilverBandBottomFromOverallMm}
            onPrintableTopOverrideChange={setPrintableTopOverrideMm}
            onPrintableBottomOverrideChange={setPrintableBottomOverrideMm}
            onPrintableSurfaceDetectionChange={setPrintableSurfaceDetection}
            handleTopFromOverallMm={handleTopFromOverallMm ?? editableHandlePreview?.topFromOverallMm}
            handleBottomFromOverallMm={handleBottomFromOverallMm ?? editableHandlePreview?.bottomFromOverallMm}
            handleReachMm={handleReachMm ?? editableHandlePreview?.reachMm}
            handleUpperCornerFromOverallMm={
              handleUpperCornerFromOverallMm ?? editableHandlePreview?.upperCornerFromOverallMm
            }
            handleLowerCornerFromOverallMm={
              handleLowerCornerFromOverallMm ?? editableHandlePreview?.lowerCornerFromOverallMm
            }
            handleUpperCornerReachMm={handleUpperCornerReachMm ?? editableHandlePreview?.upperCornerReachMm}
            handleLowerCornerReachMm={handleLowerCornerReachMm ?? editableHandlePreview?.lowerCornerReachMm}
            handleUpperTransitionReachMm={
              handleUpperTransitionReachMm ?? editableHandlePreview?.upperTransitionReachMm
            }
            handleLowerTransitionReachMm={
              handleLowerTransitionReachMm ?? editableHandlePreview?.lowerTransitionReachMm
            }
            handleUpperTransitionFromOverallMm={
              handleUpperTransitionFromOverallMm ?? editableHandlePreview?.upperTransitionFromOverallMm
            }
            handleLowerTransitionFromOverallMm={
              handleLowerTransitionFromOverallMm ?? editableHandlePreview?.lowerTransitionFromOverallMm
            }
            handleOuterTopFromOverallMm={editableHandlePreview?.outerTopFromOverallMm}
            handleOuterBottomFromOverallMm={editableHandlePreview?.outerBottomFromOverallMm}
            handleTubeDiameterMm={handleTubeDiameterMm ?? editableHandlePreview?.tubeDiameterMm}
            editableHandlePreview={editableHandlePreview}
            shoulderDiameterMm={shoulderDiameterMm}
            taperUpperDiameterMm={taperUpperDiameterMm}
            taperLowerDiameterMm={taperLowerDiameterMm}
            bevelDiameterMm={bevelDiameterMm}
            onHandleTopChange={setHandleTopFromOverallMm}
            onHandleBottomChange={setHandleBottomFromOverallMm}
            onHandleReachChange={setHandleReachMm}
            onHandleUpperCornerChange={setHandleUpperCornerFromOverallMm}
            onHandleLowerCornerChange={setHandleLowerCornerFromOverallMm}
            onHandleUpperCornerReachChange={setHandleUpperCornerReachMm}
            onHandleLowerCornerReachChange={setHandleLowerCornerReachMm}
            onHandleUpperTransitionReachChange={setHandleUpperTransitionReachMm}
            onHandleLowerTransitionReachChange={setHandleLowerTransitionReachMm}
            onHandleUpperTransitionChange={setHandleUpperTransitionFromOverallMm}
            onHandleLowerTransitionChange={setHandleLowerTransitionFromOverallMm}
            onHandleOuterTopChange={undefined}
            onHandleOuterBottomChange={undefined}
            onHandleTubeDiameterChange={setHandleTubeDiameterMm}
            onShoulderDiameterChange={setShoulderDiameterMm}
            onTaperUpperDiameterChange={setTaperUpperDiameterMm}
            onTaperLowerDiameterChange={setTaperLowerDiameterMm}
            onBevelDiameterChange={setBevelDiameterMm}
            onPhotoWidthScaleChange={setReferencePhotoWidthScalePct}
            onPhotoHeightScaleChange={setReferencePhotoHeightScalePct}
            onPhotoLockAspectChange={setReferencePhotoLockAspect}
            onPhotoOffsetXChange={setReferencePhotoOffsetXPct}
            onPhotoOffsetYChange={setReferencePhotoOffsetYPct}
            onPhotoAnchorYChange={setReferencePhotoAnchorY}
            onPhotoCenterModeChange={setReferencePhotoCenterMode}
            onColorsChange={handleAutoSampleColors}
            onDiameterChange={(nextDiameter) => {
              if (advancedGeometryOverridesUnlocked) {
                setDiameterMm(round2(nextDiameter));
                return;
              }
              setWrapWidthInputMm(round2(Math.PI * nextDiameter));
            }}
            onTopOuterDiameterChange={(nextDiameter) => {
              setTopOuterDiameterMm(round2(nextDiameter));
            }}
            onBaseDiameterChange={(nextDiameter) => {
              setBaseDiameterMm(round2(nextDiameter));
            }}
            onBaseDiameterDerived={(nextDiameter) => {
              setBaseDiameterMm(round2(nextDiameter));
            }}
            onOutlineProfileChange={(nextProfile) => {
              setBodyOutlineProfile(nextProfile);
              const derived = deriveDimensionsFromEditableBodyOutline(nextProfile);
              if (typeof derived.bodyTopFromOverallMm === "number") {
                setBodyTopFromOverallMm(round2(derived.bodyTopFromOverallMm));
              }
              if (typeof derived.bodyBottomFromOverallMm === "number") {
                setBodyBottomFromOverallMm(round2(derived.bodyBottomFromOverallMm));
              }
              if (typeof derived.diameterMm === "number") {
                if (advancedGeometryOverridesUnlocked) {
                  setDiameterMm(round2(derived.diameterMm));
                }
              }
              if (typeof derived.topOuterDiameterMm === "number") {
                setTopOuterDiameterMm(round2(derived.topOuterDiameterMm));
              }
              if (typeof derived.baseDiameterMm === "number") {
                setBaseDiameterMm(round2(derived.baseDiameterMm));
              }
              if (typeof derived.shoulderDiameterMm === "number") {
                setShoulderDiameterMm(round2(derived.shoulderDiameterMm));
              }
              if (typeof derived.taperUpperDiameterMm === "number") {
                setTaperUpperDiameterMm(round2(derived.taperUpperDiameterMm));
              }
              if (typeof derived.taperLowerDiameterMm === "number") {
                setTaperLowerDiameterMm(round2(derived.taperLowerDiameterMm));
              }
              if (typeof derived.bevelDiameterMm === "number") {
                setBevelDiameterMm(round2(derived.bevelDiameterMm));
              }
            }}
            onReferencePathsChange={(nextPaths) => {
              setReferencePaths(nextPaths);
              setBodyOutlineProfile(nextPaths.bodyOutline ?? undefined);
            }}
            onReferenceLayerStateChange={setReferenceLayerState}
          />
        </div>
      )}

      {/* ── Default laser settings ────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Default laser settings</div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Power (%)</label>
          <input
            className={styles.numInput}
            type="number"
            value={power}
            step={1}
            min={0}
            max={100}
            onChange={(e) => setPower(Number(e.target.value) || 0)}
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Speed (mm/s)</label>
          <input
            className={styles.numInput}
            type="number"
            value={speed}
            step={10}
            min={0}
            onChange={(e) => setSpeed(Number(e.target.value) || 0)}
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Frequency (kHz)</label>
          <input
            className={styles.numInput}
            type="number"
            value={frequency}
            step={1}
            min={0}
            onChange={(e) => setFrequency(Number(e.target.value) || 0)}
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Line interval (mm)</label>
          <input
            className={styles.numInput}
            type="number"
            value={lineInterval}
            step={0.01}
            min={0}
            onChange={(e) => setLineInterval(Number(e.target.value) || 0)}
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Material profile</label>
          <select
            className={styles.selectInput}
            value={materialProfileId}
            onChange={(e) => {
              materialProfileTouchedRef.current = e.target.value.trim().length > 0;
              applyMaterialProfileSettings(e.target.value, laserType, productType);
            }}
          >
            <option value="">None</option>
            {KNOWN_MATERIAL_PROFILES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

      </div>

      {/* ── Errors ────────────────────────────────────────────────── */}
      {errors.length > 0 && (
        <div>
          {errors.map((err) => (
            <div key={err} className={styles.error}>{err}</div>
          ))}
        </div>
      )}

      {/* ── Buttons ───────────────────────────────────────────────── */}
      {showActions ? (
        <div className={styles.btnRow}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.saveBtn}
            onClick={() => void handleSave()}
            disabled={saveBlockingIssues.length > 0 || lookingUpItem || detecting || checkingGlbPath}
            title={saveDisabledReason ?? undefined}
          >
            {isEdit ? "Save changes" : "Save template"}
          </button>
        </div>
      ) : null}

      {/* ── Tumbler mapping wizard modal ── */}
      {showMappingWizard && glbPath && productType && productType !== "flat" && (
        <TumblerMappingWizard
          glbPath={glbPath}
          diameterMm={effectiveCylinderDiameterMm}
          printHeightMm={printHeightMm}
          productType={productType}
          existingMapping={tumblerMapping}
          handleArcDeg={handleArcDeg}
          onSave={(mapping) => {
            setTumblerMapping(mapping);
            setHandleArcDeg(mapping.handleArcDeg);
            setShowMappingWizard(false);
          }}
          onCancel={() => setShowMappingWizard(false)}
        />
      )}
    </div>
  );
});
