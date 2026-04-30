"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import type { PlacedItem } from "@/types/admin";
import type {
  BodyReferenceQAContract,
  CanonicalBodyProfile,
  CanonicalDimensionCalibration,
  EditableBodyOutline,
  ProductTemplate,
  TumblerMapping,
} from "@/types/productTemplate";
import type { AutoDetectResult } from "@/lib/autoDetect";
import type { PrintableSurfaceContract } from "@/types/printableSurface";
import type {
  DimensionAuthority,
  TumblerItemLookupDimensions,
  TumblerItemLookupResponse,
} from "@/types/tumblerItemLookup";
import {
  deriveTumblerPreviewModelState,
  type PreviewModelMode,
} from "@/lib/tumblerPreviewModelState";
import { detectTumblerFromImage } from "@/lib/autoDetect";
import { lookupTumblerItem } from "@/lib/tumblerItemLookup";
import { KNOWN_MATERIAL_PROFILES } from "@/data/materialProfiles";
import { DEFAULT_ROTARY_PLACEMENT_PRESETS } from "@/data/rotaryPlacementPresets";
import { saveTemplate, updateTemplate } from "@/lib/templateStorage";
import {
  DEFAULT_TEMPLATE_THUMBNAIL_DATA_URL,
  generateThumbnail,
} from "@/lib/generateThumbnail";
import { findTumblerProfileIdForBrandModel, getTumblerProfileById, getProfileHandleArcDeg } from "@/data/tumblerProfiles";
import { getDefaultLaserSettings } from "@/lib/scopedDefaults";
import { getEngravableDimensions } from "@/lib/engravableDimensions";
import {
  buildTemplateCreateWorkflowSteps,
  deriveTemplateCreateWorkflowStep,
  getTemplateBodyCutoutQaGlbLifecycle,
  getTemplateBodyReferenceV2OperatorState,
  getTemplateCreateGenerateGateReason,
  getTemplateCreateNextActionHint,
  getTemplateCreateSaveGateReason,
  getTemplateCreateSourceReadiness,
  isTemplateCreateReviewFlowProductType,
} from "@/lib/templateCreateFlow";
import {
  formatTemplateCreateDisabledActionLabels,
  getTemplateCreateLookupActionReason,
  getTemplateCreatePreviewActionReason,
  getTemplateCreateReviewAcceptActionReason,
  getTemplateCreateV2SeedActionReason,
  groupTemplateCreateDisabledActionReasons,
  resolveTemplateCreateBlockedActionReason,
} from "@/lib/templateCreateActionReasons";
import {
  BODY_REFERENCE_CONTRACT_VERSION,
  deriveBodyReferencePipeline,
} from "@/lib/bodyReferencePipeline";
import {
  cloneEditableBodyOutline,
  createEditableBodyOutline,
} from "@/lib/editableBodyOutline";
import {
  buildOutlineGeometrySignature,
  cloneOutline,
  hasFineTuneDraftChanges,
  rebuildAcceptedBodyReferenceSnapshot,
  resolveFineTuneGlbReviewState,
  resolveOutlineBounds,
  resolveOutlinePointCount,
} from "@/lib/bodyReferenceFineTune";
import { summarizeBodyReferenceFineTuneLifecycle } from "@/lib/bodyReferenceFineTuneLifecycle";
import {
  buildBodyReferenceSvgQualityReportFromOutline,
  summarizeBodyReferenceSvgCutoutLineage,
  summarizeBodyReferenceSvgCutoutLineageForOperator,
  summarizeBodyReferenceSvgQualityForOperator,
} from "@/lib/bodyReferenceSvgQuality";
import {
  getBodyReferencePreviewModeHint,
  getBodyReferencePreviewModeLabel,
  getDrinkwareGlbStatusLabel,
  isBodyCutoutQaPreviewAvailable,
} from "@/lib/bodyReferencePreviewIntent";
import { buildBodyReferenceGlbSourcePayload } from "@/lib/bodyReferenceGlbSource";
import { resolveBodyReferenceGuideFrame } from "@/lib/bodyReferenceGuideFrame";
import {
  mapBodyLocalGuideMmToOverallMm,
  mapOverallGuideMmToBodyLocalMm,
  resolveAcceptedBodyReferenceOverallHeightMm,
  resolveDetectedLowerSilverSeamMm,
  resolveEngravableZoneGuideAuthority,
} from "@/lib/engravableGuideAuthority";
import { parseBodyReferenceGlbResponse } from "@/lib/adminApi.schema";
import type { BodyGeometryContract } from "@/lib/bodyGeometryContract";
import { inferGeneratedModelStatusFromSource } from "@/lib/generatedModelUrl";
import {
  buildLaserBedSurfaceMappingSignature,
  type LaserBedArtworkPlacement,
  type LaserBedSurfaceMapping,
  validateLaserBedSurfaceMapping,
} from "@/lib/laserBedSurfaceMapping";
import {
  summarizeAppearanceReferenceLayers,
  type ProductAppearanceReferenceLayer,
} from "@/lib/productAppearanceReferenceLayers";
import { resolveProductAppearanceSurfaceAuthority } from "@/lib/productAppearanceSurface";
import {
  buildWrapExportPreviewState,
  getWrapExportMappingStatusLabel,
  getWrapExportPreviewStatusLabel,
} from "@/lib/wrapExportPreviewState";
import {
  summarizeWrapExportProductionReadiness,
} from "@/lib/wrapExportProductionValidation";
import {
  getWrapExportAppearanceReferenceNote,
  getWrapExportAuthorityNote,
  getWrapExportExportAuthorityLabel,
  getWrapExportMappingFreshnessLabel,
  getWrapExportNoAppearanceReferenceMessage,
  getWrapExportNoSavedPlacementMessage,
  getWrapExportOperatorWarningNote,
  getWrapExportOverlayPreviewNote,
  getWrapExportRegenerateNote,
  getWrapExportSummarySubtitle,
  getWrapExportSummaryTitle,
} from "@/lib/wrapExportCopy";
import {
  dedupeTemplateCreateDisplayMessages,
  shouldAutoOpenTemplateCreateDiagnostics,
  shouldShowTemplateCreateDiagnostics,
} from "@/lib/templateCreateDisplayDensity";
import {
  buildEngravingOverlayPreviewState,
  ENGRAVING_OVERLAY_PREVIEW_MATERIAL_LABEL,
  ENGRAVING_OVERLAY_PREVIEW_MATERIAL_TOKEN,
} from "@/lib/engravingOverlayPreview";
import { hashJsonSha256, stableStringifyForHash } from "@/lib/hashSha256";
import {
  acceptBodyReferenceV2Draft,
  buildBodyReferenceV2GenerationReadinessFromDraft,
  createEmptyBodyReferenceV2Draft,
  resetBodyReferenceV2Draft,
  seedBodyLeftOutlineFromApprovedBodyOutline,
  seedCenterlineFromApprovedBodyOutline,
  setBodyLeftOutline,
  setCenterlineAxis,
  summarizeBodyReferenceV2CaptureReadiness,
} from "@/lib/bodyReferenceV2Capture";
import {
  summarizeBodyReferenceV2Draft,
  type BodyReferenceV2Draft,
} from "@/lib/bodyReferenceV2Layers";
import {
  summarizeBodyReferenceV2ScaleMirrorPreview,
} from "@/lib/bodyReferenceV2ScaleMirror";
import { summarizeProductDimensionAuthority } from "@/lib/productDimensionAuthority";
import type { BodyHeightAuthorityInput, LookupBodyHeightSource } from "@/lib/bodyHeightAuthority";
import {
  buildBodyReferenceV2GuidanceMessages,
  formatBodyReferenceV2ScaleSourceLabel,
  getBodyReferenceV2AcceptDraftReason,
  getBodyReferenceV2CurrentQaSourceLabel,
  getBodyReferenceV2GenerateGateReason,
  getBodyReferenceV2ReferenceOnlyNote,
  getBodyReferenceV2SourceAuthorityNote,
  getBodyReferenceV2WrapExportDistinctionNote,
} from "@/lib/bodyReferenceV2Guidance";
import { BodyReferenceFineTuneEditor } from "./BodyReferenceFineTuneEditor";
import { FileDropZone } from "./shared/FileDropZone";
import { TumblerMappingWizard } from "./TumblerMappingWizard";
import { EngravableZoneEditor } from "./EngravableZoneEditor";
import { TumblerLookupDebugPanel } from "./TumblerLookupDebugPanel";
import type { ModelViewerProps, TumblerDimensions } from "./ModelViewer";
import styles from "./TemplateCreateForm.module.css";

const ModelViewer = dynamic<ModelViewerProps>(
  () => import("./ModelViewer"),
  { ssr: false },
);

interface Props {
  onSave: (template: ProductTemplate) => void;
  onCancel: () => void;
  editingTemplate?: ProductTemplate;
  workspaceArtworkPlacements?: LaserBedArtworkPlacement[] | null;
  surfaceMode?: "modal" | "page";
}

type BodyOnlyEditorFrame = {
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  bodyHeightMm: number;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function resolveAxialBandBoundaryMm(
  contract: PrintableSurfaceContract | null | undefined,
  kind: "lid" | "rim-ring",
  boundary: "start" | "end",
): number | null {
  const band = contract?.axialExclusions.find((candidate) => candidate.kind === kind);
  const value = band?.[boundary === "start" ? "startMm" : "endMm"];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildEffectiveBodyReferenceV2Draft(args: {
  draft?: BodyReferenceV2Draft | null;
  sourceImageUrl?: string;
  scaleCalibration: BodyReferenceV2Draft["scaleCalibration"];
}): BodyReferenceV2Draft {
  const geometryDraft = args.draft ?? createEmptyBodyReferenceV2Draft();
  return acceptBodyReferenceV2Draft({
    sourceImageUrl: args.sourceImageUrl,
    centerline: geometryDraft.centerline ? cloneSerializable(geometryDraft.centerline) : null,
    layers: cloneSerializable(geometryDraft.layers ?? []),
    blockedRegions: cloneSerializable(geometryDraft.blockedRegions ?? []),
    scaleCalibration: cloneSerializable(args.scaleCalibration),
  });
}

function resolveLookupBodyHeightSource(
  dimensions: TumblerItemLookupDimensions | null | undefined,
): LookupBodyHeightSource | undefined {
  if (!dimensions) return undefined;
  const bodyHeightMm = dimensions.bodyHeightMm;
  const usableHeightMm = dimensions.usableHeightMm;
  if (typeof bodyHeightMm !== "number" || !Number.isFinite(bodyHeightMm) || bodyHeightMm <= 0) {
    return typeof usableHeightMm === "number" && Number.isFinite(usableHeightMm) && usableHeightMm > 0
      ? "usable-height"
      : undefined;
  }
  if (
    typeof usableHeightMm === "number" &&
    Number.isFinite(usableHeightMm) &&
    Math.abs(usableHeightMm - bodyHeightMm) <= 0.05
  ) {
    return "usable-height";
  }
  return "unknown";
}

const ENGRAVING_OVERLAY_TEXTURE_PX_PER_MM = 4;
const ENGRAVING_OVERLAY_TINT = "#d7dde6";
const TEMPLATE_CREATE_DEBUG_DETAILS_ENABLED =
  process.env.NEXT_PUBLIC_ADMIN_DEBUG === "1" ||
  process.env.NEXT_PUBLIC_SHOW_BODY_CONTRACT_INSPECTOR === "1";

function buildFallbackOverlayBounds(widthMm: number, heightMm: number) {
  return {
    x: 0,
    y: 0,
    width: Math.max(1, round2(widthMm)),
    height: Math.max(1, round2(heightMm)),
  };
}

function buildOverlayPreviewPlacedItem(args: {
  assetId: string;
  name: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotationDeg: number;
  visible: boolean;
  placement: LaserBedArtworkPlacement;
}): PlacedItem | null {
  const snapshot = args.placement.assetSnapshot;
  const svgText = snapshot?.svgText?.trim();
  const sourceSvgText = snapshot?.sourceSvgText?.trim() ?? svgText;
  if (!svgText || !sourceSvgText) return null;

  const documentBounds = snapshot?.documentBounds ?? buildFallbackOverlayBounds(args.widthMm, args.heightMm);
  const artworkBounds = snapshot?.artworkBounds ?? documentBounds;

  return {
    id: args.placement.id,
    assetId: args.assetId,
    name: args.name,
    svgText,
    sourceSvgText,
    documentBounds,
    artworkBounds,
    x: args.xMm,
    y: args.yMm,
    width: args.widthMm,
    height: args.heightMm,
    rotation: args.rotationDeg,
    defaults: {
      x: args.xMm,
      y: args.yMm,
      width: args.widthMm,
      height: args.heightMm,
      rotation: args.rotationDeg,
    },
    visible: args.visible,
  };
}

async function rasterizeOverlayTexture(item: PlacedItem, tintColor: string): Promise<HTMLCanvasElement | null> {
  const svgText = item.svgText.trim();
  if (!svgText) return null;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(item.width * ENGRAVING_OVERLAY_TEXTURE_PX_PER_MM));
  canvas.height = Math.max(1, Math.ceil(item.height * ENGRAVING_OVERLAY_TEXTURE_PX_PER_MM));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const blob = new Blob([svgText], { type: "image/svg+xml" });
  const blobUrl = URL.createObjectURL(blob);

  await new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = tintColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-over";
      URL.revokeObjectURL(blobUrl);
      resolve();
    };
    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      resolve();
    };
    img.src = blobUrl;
  });

  return canvas;
}

function formatBoundsLabel(bounds: ReturnType<typeof resolveOutlineBounds>): string {
  if (!bounds) return "n/a";
  return `${bounds.width} x ${bounds.height} contour units`;
}

function formatShortHash(value: string | null | undefined): string {
  const normalized = value?.trim();
  if (!normalized) return "n/a";
  const [prefix, digest] = normalized.includes(":")
    ? normalized.split(":", 2)
    : ["sig", normalized];
  if (!digest) return normalized;
  const head = digest.slice(0, 8);
  const tail = digest.slice(-6);
  return `${prefix}:${head}…${tail}`;
}

function formatDimensionMetric(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${round2(value)} mm`
    : "n/a";
}

function formatBodyBoundsMetric(
  bounds: BodyGeometryContract["dimensionsMm"]["bodyBounds"] | null | undefined,
): string {
  if (!bounds) return "n/a";
  return `${round2(bounds.width)} × ${round2(bounds.height)} × ${round2(bounds.depth)} mm`;
}

function formatBodyReferenceOutlineSourceLabel(
  outline: EditableBodyOutline | null | undefined,
): string {
  if (!outline) return "pending";
  if (outline.sourceContourMode === "body-only") return "body-only contour";
  switch (outline.contourFrame?.kind) {
    case "full-body-only-source":
      return "full body source";
    case "printable-band":
      return "printable band";
    case "body-band-from-overall-product":
      return "body band from product";
    case "explicit-body-trace-frame":
      return "explicit body trace";
    case "ui-only-guide":
      return "UI-only guide";
    default:
      return "detected contour";
  }
}

function buildWrapExportSurfaceMapping(
  contract: BodyGeometryContract | null | undefined,
  frontCenterAngleDeg?: number,
): LaserBedSurfaceMapping | null {
  if (!contract) return null;

  const wrapDiameterMm =
    typeof contract.dimensionsMm.wrapDiameterMm === "number" && Number.isFinite(contract.dimensionsMm.wrapDiameterMm)
      ? round2(contract.dimensionsMm.wrapDiameterMm)
      : undefined;
  const wrapWidthMm =
    typeof contract.dimensionsMm.wrapWidthMm === "number" && Number.isFinite(contract.dimensionsMm.wrapWidthMm)
      ? round2(contract.dimensionsMm.wrapWidthMm)
      : undefined;
  const printableTopMm =
    typeof contract.dimensionsMm.printableTopMm === "number" && Number.isFinite(contract.dimensionsMm.printableTopMm)
      ? round2(contract.dimensionsMm.printableTopMm)
      : undefined;
  const printableBottomMm =
    typeof contract.dimensionsMm.printableBottomMm === "number" && Number.isFinite(contract.dimensionsMm.printableBottomMm)
      ? round2(contract.dimensionsMm.printableBottomMm)
      : undefined;
  const printableHeightMm =
    typeof printableTopMm === "number" &&
    typeof printableBottomMm === "number" &&
    printableBottomMm > printableTopMm
      ? round2(printableBottomMm - printableTopMm)
      : undefined;
  const expectedBodyWidthMm =
    typeof contract.dimensionsMm.expectedBodyWidthMm === "number" && Number.isFinite(contract.dimensionsMm.expectedBodyWidthMm)
      ? round2(contract.dimensionsMm.expectedBodyWidthMm)
      : undefined;
  const expectedBodyHeightMm =
    typeof contract.dimensionsMm.expectedBodyHeightMm === "number" && Number.isFinite(contract.dimensionsMm.expectedBodyHeightMm)
      ? round2(contract.dimensionsMm.expectedBodyHeightMm)
      : undefined;
  const bodyBounds = contract.dimensionsMm.bodyBounds;

  return {
    mode: "cylindrical-v1",
    wrapDiameterMm,
    wrapWidthMm,
    printableTopMm,
    printableBottomMm,
    printableHeightMm,
    expectedBodyWidthMm,
    expectedBodyHeightMm,
    bodyBounds: bodyBounds
      ? {
          width: round2(bodyBounds.width),
          height: round2(bodyBounds.height),
          depth: round2(bodyBounds.depth),
        }
      : undefined,
    scaleSource: contract.dimensionsMm.scaleSource,
    frontCenterAngleDeg:
      typeof frontCenterAngleDeg === "number" && Number.isFinite(frontCenterAngleDeg)
        ? round2(frontCenterAngleDeg)
        : undefined,
    sourceHash: contract.source.hash,
    glbSourceHash: contract.glb.sourceHash,
  };
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
      URL.revokeObjectURL(img.src);
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
  return getLookupSourceLabelFromUrl(sourceUrl);
}

function getLookupSourceLabelFromUrl(sourceUrl: string | null | undefined): string | null {
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

function formatLookupSize(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? `${round2(value)} oz`
    : "n/a";
}

function formatLookupAuthority(value: DimensionAuthority | null | undefined): string {
  switch (value) {
    case "diameter-primary":
      return "Diameter primary";
    case "body-diameter-primary":
      return "Body diameter primary";
    case "wrap-diameter-primary":
      return "Wrap diameter primary";
    case "manual-override":
      return "Manual override";
    default:
      return "Unknown";
  }
}

function formatLookupVariantStatus(
  value: ReturnType<typeof summarizeProductDimensionAuthority>["variantStatus"],
): string {
  switch (value) {
    case "exact":
      return "Exact variant";
    case "generic":
      return "Generic variant";
    case "ambiguous":
      return "Ambiguous variant";
    case "mismatch":
      return "Variant mismatch";
    default:
      return "Variant unknown";
  }
}

function buildLookupTemplateName(result: TumblerItemLookupResponse, fallback: string): string {
  const parts: string[] = [];
  if (result.brand) parts.push(result.brand);
  if (result.model) parts.push(result.model);
  const normalizedModel = result.model?.toLowerCase() ?? "";
  if (result.capacityOz && !normalizedModel.includes(`${result.capacityOz}oz`) && !normalizedModel.includes(`${result.capacityOz} oz`)) {
    parts.push(`${result.capacityOz}oz`);
  }
  return parts.length > 0 ? parts.join(" ") : result.title ?? fallback;
}

function resolveDefaultPreviewModelMode(args: {
  glbPath: string;
  glbStatus?: ProductTemplate["glbStatus"] | null;
  glbSourceLabel?: string | null;
}): PreviewModelMode {
  const glbStatus = args.glbStatus ?? inferGeneratedModelStatusFromSource({
    modelUrl: args.glbPath,
    sourceModelLabel: args.glbSourceLabel,
  });
  if (glbStatus === "generated-reviewed-model") {
    return "body-cutout-qa";
  }
  if (args.glbPath.trim()) {
    return "full-model";
  }
  return "alignment-model";
}

function getTemplateCreateWorkflowStatusLabel(status: "ready" | "action" | "review"): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "action":
      return "Do next";
    default:
      return "Waiting";
  }
}

function buildPreviewTumblerDimensions(args: {
  productType: ProductTemplate["productType"];
  diameterMm: number;
  printHeightMm: number;
  overallHeightMm: number;
  printableTopOffsetMm?: number | null;
  bodyTopOffsetMm?: number | null;
  bodyBottomFromOverallMm?: number | null;
  lidSeamFromOverallMm?: number | null;
  silverBandBottomFromOverallMm?: number | null;
}): TumblerDimensions | null {
  if (args.productType === "flat") return null;
  if (!Number.isFinite(args.diameterMm) || args.diameterMm <= 0) return null;
  if (!Number.isFinite(args.printHeightMm) || args.printHeightMm <= 0) return null;
  const bodyHeightMm =
    isFiniteNumber(args.bodyTopOffsetMm) &&
    isFiniteNumber(args.bodyBottomFromOverallMm) &&
    args.bodyBottomFromOverallMm > args.bodyTopOffsetMm
      ? round2(args.bodyBottomFromOverallMm - args.bodyTopOffsetMm)
      : undefined;
  return {
    overallHeightMm:
      Number.isFinite(args.overallHeightMm) && args.overallHeightMm > 0
        ? args.overallHeightMm
        : args.printHeightMm,
    diameterMm: args.diameterMm,
    printableHeightMm: args.printHeightMm,
    printableTopOffsetMm: isFiniteNumber(args.printableTopOffsetMm)
      ? round2(args.printableTopOffsetMm)
      : undefined,
    bodyTopOffsetMm: isFiniteNumber(args.bodyTopOffsetMm)
      ? round2(args.bodyTopOffsetMm)
      : undefined,
    bodyHeightMm,
    lidSeamFromOverallMm: isFiniteNumber(args.lidSeamFromOverallMm)
      ? round2(args.lidSeamFromOverallMm)
      : undefined,
    silverBandBottomFromOverallMm: isFiniteNumber(args.silverBandBottomFromOverallMm)
      ? round2(args.silverBandBottomFromOverallMm)
      : undefined,
  };
}

export function TemplateCreateForm({
  onSave,
  onCancel,
  editingTemplate,
  workspaceArtworkPlacements = null,
  surfaceMode = "modal",
}: Props) {
  const inDedicatedTemplateMode = surfaceMode === "page";
  const isEdit = Boolean(editingTemplate);
  const searchParams = useSearchParams();
  const routeDebugEnabled = searchParams.get("debug") === "1";
  const templateCreateDiagnosticsVisible =
    shouldShowTemplateCreateDiagnostics({
      adminDebugEnabled: TEMPLATE_CREATE_DEBUG_DETAILS_ENABLED,
      routeDebugEnabled,
    });
  const templateCreateDiagnosticsExpanded =
    shouldAutoOpenTemplateCreateDiagnostics({
      adminDebugEnabled: TEMPLATE_CREATE_DEBUG_DETAILS_ENABLED,
      routeDebugEnabled,
    });
  const derivedEditingDims = React.useMemo(
    () => (editingTemplate ? getEngravableDimensions(editingTemplate) : null),
    [editingTemplate],
  );
  const editingHasExplicitMargins =
    editingTemplate?.dimensions.topMarginMm != null ||
    editingTemplate?.dimensions.bottomMarginMm != null;

  // ── Product identity ─────────────────────────────────────────────
  const [name, setName] = React.useState(editingTemplate?.name ?? "");
  const [brand, setBrand] = React.useState(editingTemplate?.brand ?? "");
  const [capacity, setCapacity] = React.useState(editingTemplate?.capacity ?? "");
  const [laserType, setLaserType] = React.useState<"fiber" | "co2" | "diode">(
    editingTemplate?.laserType ?? "fiber"
  );
  const [productType, setProductType] = React.useState<"tumbler" | "mug" | "bottle" | "flat">(
    editingTemplate?.productType ?? "tumbler"
  );

  // ── Files ────────────────────────────────────────────────────────
  const [thumbDataUrl, setThumbDataUrl] = React.useState(
    editingTemplate?.thumbnailDataUrl ?? DEFAULT_TEMPLATE_THUMBNAIL_DATA_URL,
  );
  const [glbPath, setGlbPath] = React.useState(editingTemplate?.glbPath ?? "");
  const [glbFileName, setGlbFileName] = React.useState<string | null>(null);
  const [glbUploading, setGlbUploading] = React.useState(false);
  const [glbUploadError, setGlbUploadError] = React.useState<string | null>(null);
  const [overlayPreviewTextures, setOverlayPreviewTextures] = React.useState<Map<string, HTMLCanvasElement>>(new Map());
  const [checkingGlbPath, setCheckingGlbPath] = React.useState(false);
  const [productImageFile, setProductImageFile] = React.useState<File | null>(null);
  const [productImageLabel, setProductImageLabel] = React.useState<string | null>(
    editingTemplate?.productPhotoFullUrl ? "Saved product photo" : null,
  );
  const [productPhotoFullUrl, setProductPhotoFullUrl] = React.useState(editingTemplate?.productPhotoFullUrl ?? "");

  // ── Auto-detect ──────────────────────────────────────────────────
  const [detecting, setDetecting] = React.useState(false);
  const [detectResult, setDetectResult] = React.useState<AutoDetectResult | null>(null);
  const [detectError, setDetectError] = React.useState<string | null>(null);
  const [lookupInput, setLookupInput] = React.useState("");
  const [lookingUpItem, setLookingUpItem] = React.useState(false);
  const [lookupResult, setLookupResult] = React.useState<TumblerItemLookupResponse | null>(null);
  const [lookupDimensionsSnapshot, setLookupDimensionsSnapshot] = React.useState<TumblerItemLookupDimensions | null>(
    editingTemplate?.lookupDimensions ?? null,
  );
  const [lookupError, setLookupError] = React.useState<string | null>(null);
  const [lookupDebugImageUrl, setLookupDebugImageUrl] = React.useState("");

  // ── Dimensions ───────────────────────────────────────────────────
  const [diameterMm, setDiameterMm] = React.useState(editingTemplate?.dimensions.diameterMm ?? 0);
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
  const [topMarginMm, setTopMarginMm] = React.useState(
    editingTemplate?.dimensions.topMarginMm ?? derivedEditingDims?.topMarginMm ?? 0,
  );
  const [bottomMarginMm, setBottomMarginMm] = React.useState(
    editingTemplate?.dimensions.bottomMarginMm ?? derivedEditingDims?.bottomMarginMm ?? 0,
  );
  const [printableTopOverrideMm, setPrintableTopOverrideMm] = React.useState<number | null>(
    typeof editingTemplate?.dimensions.printableTopOverrideMm === "number" &&
      Number.isFinite(editingTemplate.dimensions.printableTopOverrideMm)
      ? editingTemplate.dimensions.printableTopOverrideMm
      : null,
  );
  const [printableBottomOverrideMm, setPrintableBottomOverrideMm] = React.useState<number | null>(
    typeof editingTemplate?.dimensions.printableBottomOverrideMm === "number" &&
      Number.isFinite(editingTemplate.dimensions.printableBottomOverrideMm)
      ? editingTemplate.dimensions.printableBottomOverrideMm
      : null,
  );
  const [referencePhotoScalePct, setReferencePhotoScalePct] = React.useState(
    editingTemplate?.dimensions.referencePhotoScalePct ?? 100,
  );
  const [referencePhotoOffsetYPct, setReferencePhotoOffsetYPct] = React.useState(
    editingTemplate?.dimensions.referencePhotoOffsetYPct ?? 0,
  );
  const [referencePhotoAnchorY, setReferencePhotoAnchorY] = React.useState<"center" | "bottom">(
    editingTemplate?.dimensions.referencePhotoAnchorY ?? "center",
  );
  const [bodyColorHex, setBodyColorHex] = React.useState(
    editingTemplate?.dimensions.bodyColorHex ?? "#b0b8c4",
  );
  const [rimColorHex, setRimColorHex] = React.useState(
    editingTemplate?.dimensions.rimColorHex ?? "#d0d0d0",
  );

  const templateWidthMm = diameterMm > 0 ? round2(Math.PI * diameterMm) : 0;

  // ── Laser settings (scoped defaults based on product/laser type) ──
  const scopedDefaults = React.useMemo(
    () => getDefaultLaserSettings(productType, laserType),
    [productType, laserType],
  );
  const [power, setPower] = React.useState(editingTemplate?.laserSettings.power ?? scopedDefaults.power);
  const [speed, setSpeed] = React.useState(editingTemplate?.laserSettings.speed ?? scopedDefaults.speed);
  const [frequency, setFrequency] = React.useState(editingTemplate?.laserSettings.frequency ?? scopedDefaults.frequency);
  const [lineInterval, setLineInterval] = React.useState(editingTemplate?.laserSettings.lineInterval ?? scopedDefaults.lineInterval);
  const [materialProfileId, setMaterialProfileId] = React.useState(editingTemplate?.laserSettings.materialProfileId ?? "");
  const [rotaryPresetId, setRotaryPresetId] = React.useState(editingTemplate?.laserSettings.rotaryPresetId ?? "");

  // When product type or laser type changes, update laser settings to new scoped defaults
  // (only for new templates — edits keep their values)
  React.useEffect(() => {
    if (isEdit) return;
    const defaults = getDefaultLaserSettings(productType, laserType);
    setPower(defaults.power);
    setSpeed(defaults.speed);
    setFrequency(defaults.frequency);
    setLineInterval(defaults.lineInterval);
  }, [productType, laserType, isEdit]);

  // ── Tumbler mapping ─────────────────────────────────────────────
  const [tumblerMapping, setTumblerMapping] = React.useState<TumblerMapping | undefined>(
    editingTemplate?.tumblerMapping,
  );
  const [showMappingWizard, setShowMappingWizard] = React.useState(false);
  const handleAutoSampleColors = React.useCallback((nextBody: string, nextRim: string) => {
    setBodyColorHex((prev) => (prev === nextBody ? prev : nextBody));
    setRimColorHex((prev) => (prev === nextRim ? prev : nextRim));
  }, []);

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

  // ── Front / Back face photos ──────────────────────────────────
  const [frontPhotoDataUrl, setFrontPhotoDataUrl] = React.useState(editingTemplate?.frontPhotoDataUrl ?? "");
  const [backPhotoDataUrl, setBackPhotoDataUrl] = React.useState(editingTemplate?.backPhotoDataUrl ?? "");
  const [frontOriginalUrl, setFrontOriginalUrl] = React.useState("");
  const [backOriginalUrl, setBackOriginalUrl] = React.useState("");
  const [frontCleanUrl, setFrontCleanUrl] = React.useState("");
  const [backCleanUrl, setBackCleanUrl] = React.useState("");
  const [frontBgStatus, setFrontBgStatus] = React.useState<"idle" | "processing" | "done" | "failed">("idle");
  const [backBgStatus, setBackBgStatus] = React.useState<"idle" | "processing" | "done" | "failed">("idle");
  const [frontUseOriginal, setFrontUseOriginal] = React.useState(false);
  const [backUseOriginal, setBackUseOriginal] = React.useState(false);
  const [mirrorForBack, setMirrorForBack] = React.useState(true);
  const [approvedBodyOutline, setApprovedBodyOutline] = React.useState<EditableBodyOutline | null>(
    () => editingTemplate?.dimensions.bodyOutlineProfile
      ? cloneSerializable(editingTemplate.dimensions.bodyOutlineProfile)
      : null,
  );
  const [approvedCanonicalBodyProfile, setApprovedCanonicalBodyProfile] = React.useState<CanonicalBodyProfile | null>(
    () => editingTemplate?.dimensions.canonicalBodyProfile
      ? cloneSerializable(editingTemplate.dimensions.canonicalBodyProfile)
      : null,
  );
  const [approvedCanonicalDimensionCalibration, setApprovedCanonicalDimensionCalibration] = React.useState<CanonicalDimensionCalibration | null>(
    () => editingTemplate?.dimensions.canonicalDimensionCalibration
      ? cloneSerializable(editingTemplate.dimensions.canonicalDimensionCalibration)
      : null,
  );
  const [approvedBodyReferenceQa, setApprovedBodyReferenceQa] = React.useState<BodyReferenceQAContract | null>(
    () => editingTemplate?.dimensions.bodyReferenceQA
      ? cloneSerializable(editingTemplate.dimensions.bodyReferenceQA)
      : null,
  );
  const [approvedBodyReferenceWarnings, setApprovedBodyReferenceWarnings] = React.useState<string[]>(
    () => [...(editingTemplate?.dimensions.bodyReferenceWarnings ?? [])],
  );
  const [bodyReferenceV2DraftCapture, setBodyReferenceV2DraftCapture] = React.useState<BodyReferenceV2Draft>(
    () => editingTemplate?.acceptedBodyReferenceV2Draft
      ? cloneSerializable(editingTemplate.acceptedBodyReferenceV2Draft)
      : createEmptyBodyReferenceV2Draft(),
  );
  const [acceptedBodyReferenceV2DraftSnapshot, setAcceptedBodyReferenceV2DraftSnapshot] = React.useState<BodyReferenceV2Draft | null>(
    () => editingTemplate?.acceptedBodyReferenceV2Draft
      ? cloneSerializable(editingTemplate.acceptedBodyReferenceV2Draft)
      : null,
  );
  const [bodyReferenceFineTuneModeEnabled, setBodyReferenceFineTuneModeEnabled] = React.useState(false);
  const [bodyReferenceFineTuneDraftOutline, setBodyReferenceFineTuneDraftOutline] = React.useState<EditableBodyOutline | null>(null);
  const [bodyReferenceFineTuneDetectedBaselineOutline, setBodyReferenceFineTuneDetectedBaselineOutline] = React.useState<EditableBodyOutline | null>(null);
  const [bodyReferenceFineTuneUndoStack, setBodyReferenceFineTuneUndoStack] = React.useState<EditableBodyOutline[]>([]);
  const [reviewedBodyCutoutQaGeneratedSourceSignature, setReviewedBodyCutoutQaGeneratedSourceSignature] = React.useState<string | null>(null);
  const [generatedReviewedBodyGeometryContract, setGeneratedReviewedBodyGeometryContract] = React.useState<BodyGeometryContract | null>(null);
  const [loadedBodyGeometryContract, setLoadedBodyGeometryContract] = React.useState<BodyGeometryContract | null>(null);
  const [currentReviewedBodyReferenceSourceHash, setCurrentReviewedBodyReferenceSourceHash] = React.useState<string | null>(null);
  const [reviewedGeneratedModelState, setReviewedGeneratedModelState] = React.useState<{
    glbPath: string;
    status: "generated-reviewed-model";
    sourceLabel: string | null;
  } | null>(() => (
    editingTemplate?.glbStatus === "generated-reviewed-model" && editingTemplate.glbPath.trim()
      ? {
          glbPath: editingTemplate.glbPath.trim(),
          status: "generated-reviewed-model",
          sourceLabel: editingTemplate.glbSourceLabel ?? null,
        }
      : null
  ));
  const [generatingReviewedBodyReferenceGlb, setGeneratingReviewedBodyReferenceGlb] = React.useState(false);
  const [hasAcceptedBodyReferenceReview, setHasAcceptedBodyReferenceReview] = React.useState(
    () => Boolean(
      editingTemplate?.dimensions.canonicalBodyProfile &&
      editingTemplate?.dimensions.canonicalDimensionCalibration,
    ),
  );
  const [previewModelMode, setPreviewModelMode] = React.useState<PreviewModelMode>(
    () => resolveDefaultPreviewModelMode({
      glbPath: editingTemplate?.glbPath ?? "",
      glbStatus: editingTemplate?.glbStatus,
      glbSourceLabel: editingTemplate?.glbSourceLabel,
    }),
  );

  const resetBodyReferenceFineTuneState = React.useCallback(() => {
    setBodyReferenceFineTuneModeEnabled(false);
    setBodyReferenceFineTuneDraftOutline(null);
    setBodyReferenceFineTuneDetectedBaselineOutline(null);
    setBodyReferenceFineTuneUndoStack([]);
  }, []);

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

  const activeDrinkwareGlbStatus = React.useMemo<ProductTemplate["glbStatus"] | null>(() => {
    if (
      reviewedGeneratedModelState?.glbPath &&
      reviewedGeneratedModelState.glbPath.trim() === glbPath.trim()
    ) {
      return reviewedGeneratedModelState.status;
    }
    if (lookupResult?.modelStatus) return lookupResult.modelStatus;
    if (editingTemplate?.glbPath?.trim() === glbPath.trim() && editingTemplate.glbStatus) {
      return editingTemplate.glbStatus;
    }
    const inferredStatus = inferGeneratedModelStatusFromSource({
      modelUrl: glbPath,
      sourceModelLabel: lookupResult?.modelSourceLabel ?? editingTemplate?.glbSourceLabel ?? null,
    });
    if (inferredStatus) return inferredStatus;
    if (!glbPath.trim()) return "missing-model";
    return "verified-product-model";
  }, [
    editingTemplate?.glbPath,
    editingTemplate?.glbSourceLabel,
    editingTemplate?.glbStatus,
    glbPath,
    lookupResult?.modelSourceLabel,
    lookupResult?.modelStatus,
    reviewedGeneratedModelState?.glbPath,
    reviewedGeneratedModelState?.status,
  ]);

  const activeDrinkwareGlbSourceLabel = React.useMemo(() => {
    if (
      reviewedGeneratedModelState?.glbPath &&
      reviewedGeneratedModelState.glbPath.trim() === glbPath.trim()
    ) {
      return reviewedGeneratedModelState.sourceLabel;
    }
    return lookupResult?.modelSourceLabel ?? editingTemplate?.glbSourceLabel ?? null;
  }, [
    editingTemplate?.glbSourceLabel,
    glbPath,
    lookupResult?.modelSourceLabel,
    reviewedGeneratedModelState?.glbPath,
    reviewedGeneratedModelState?.sourceLabel,
  ]);

  const resolvedMatchedProfileId = React.useMemo(() => {
    if (lookupResult?.matchedProfileId) return lookupResult.matchedProfileId;
    const suggestion = detectResult?.response.suggestion;
    return findTumblerProfileIdForBrandModel({
      brand: lookupResult?.brand ?? suggestion?.brand ?? brand,
      model: lookupResult?.model ?? suggestion?.model ?? null,
      capacityOz: lookupResult?.capacityOz ?? suggestion?.capacityOz ?? null,
    });
  }, [
    brand,
    detectResult?.response.suggestion,
    lookupResult?.brand,
    lookupResult?.capacityOz,
    lookupResult?.matchedProfileId,
    lookupResult?.model,
  ]);

  const resolvedMatchedProfile = React.useMemo(
    () => (resolvedMatchedProfileId ? getTumblerProfileById(resolvedMatchedProfileId) : null),
    [resolvedMatchedProfileId],
  );

  const bodyReferenceFrameBounds = React.useMemo(() => {
    if (!Number.isFinite(overallHeightMm) || overallHeightMm <= 0) {
      return null;
    }
    const bodyTopFromOverallMm = round2(Math.max(0, topMarginMm));
    const bodyBottomFromOverallMm = round2(
      Math.max(bodyTopFromOverallMm + 1, overallHeightMm - Math.max(0, bottomMarginMm)),
    );
    if (bodyBottomFromOverallMm <= bodyTopFromOverallMm) return null;
    return { bodyTopFromOverallMm, bodyBottomFromOverallMm };
  }, [bottomMarginMm, overallHeightMm, topMarginMm]);

  const persistedPrintableSurfaceContract = React.useMemo(
    () =>
      approvedCanonicalDimensionCalibration?.printableSurfaceContract ??
      editingTemplate?.dimensions.printableSurfaceContract ??
      editingTemplate?.dimensions.canonicalDimensionCalibration?.printableSurfaceContract ??
      null,
    [
      approvedCanonicalDimensionCalibration?.printableSurfaceContract,
      editingTemplate?.dimensions.canonicalDimensionCalibration?.printableSurfaceContract,
      editingTemplate?.dimensions.printableSurfaceContract,
    ],
  );

  const savedSilverBandBottomFromOverallMm = React.useMemo(() => {
    const explicit = editingTemplate?.dimensions.silverBandBottomFromOverallMm;
    if (typeof explicit === "number" && Number.isFinite(explicit)) return explicit;
    return resolveAxialBandBoundaryMm(persistedPrintableSurfaceContract, "rim-ring", "end");
  }, [editingTemplate?.dimensions.silverBandBottomFromOverallMm, persistedPrintableSurfaceContract]);

  const savedLidSeamFromOverallMm = React.useMemo(() => {
    const explicit = editingTemplate?.dimensions.lidSeamFromOverallMm;
    if (typeof explicit === "number" && Number.isFinite(explicit)) return explicit;
    return (
      resolveAxialBandBoundaryMm(persistedPrintableSurfaceContract, "lid", "end") ??
      resolveAxialBandBoundaryMm(persistedPrintableSurfaceContract, "rim-ring", "start")
    );
  }, [editingTemplate?.dimensions.lidSeamFromOverallMm, persistedPrintableSurfaceContract]);

  const detectedLowerSilverSeamMm = React.useMemo(() => {
    if (!bodyReferenceFrameBounds) return null;
    return resolveDetectedLowerSilverSeamMm({
      overallHeightMm,
      bodyTopFromOverallMm: bodyReferenceFrameBounds.bodyTopFromOverallMm,
      bodyBottomFromOverallMm: bodyReferenceFrameBounds.bodyBottomFromOverallMm,
      savedSilverBandBottomFromOverallMm,
      fitDebug: lookupResult?.fitDebug ?? null,
    });
  }, [bodyReferenceFrameBounds, lookupResult?.fitDebug, overallHeightMm, savedSilverBandBottomFromOverallMm]);

  const engravableGuideAuthority = React.useMemo(() => {
    if (!bodyReferenceFrameBounds) return null;
    return resolveEngravableZoneGuideAuthority({
      overallHeightMm,
      bodyTopFromOverallMm: bodyReferenceFrameBounds.bodyTopFromOverallMm,
      bodyBottomFromOverallMm: bodyReferenceFrameBounds.bodyBottomFromOverallMm,
      acceptedBodyReferenceAvailable: Boolean(approvedBodyOutline || approvedCanonicalDimensionCalibration),
      printableTopOverrideMm,
      printableBottomOverrideMm,
      savedSilverBandBottomFromOverallMm,
      fitDebug: lookupResult?.fitDebug ?? null,
      printableSurfaceContract: persistedPrintableSurfaceContract,
    });
    }, [
      approvedBodyOutline,
      approvedCanonicalDimensionCalibration,
      bodyReferenceFrameBounds,
      lookupResult?.fitDebug,
      overallHeightMm,
      persistedPrintableSurfaceContract,
      printableBottomOverrideMm,
      printableTopOverrideMm,
      savedSilverBandBottomFromOverallMm,
    ]);

  const acceptedBodyOnlyZoneMode = React.useMemo(
    () => (
      hasAcceptedBodyReferenceReview &&
      productType !== "flat" &&
      approvedBodyOutline?.sourceContourMode === "body-only"
    ),
    [approvedBodyOutline?.sourceContourMode, hasAcceptedBodyReferenceReview, productType],
  );
  const authorityTopGuideMm = React.useMemo(
    () => round2(engravableGuideAuthority?.topGuideMm ?? topMarginMm),
    [engravableGuideAuthority?.topGuideMm, topMarginMm],
  );
  const authorityBottomGuideMm = React.useMemo(
    () => round2(
      engravableGuideAuthority?.bottomGuideMm
      ?? Math.max(authorityTopGuideMm, overallHeightMm - Math.max(0, bottomMarginMm)),
    ),
    [authorityTopGuideMm, bottomMarginMm, engravableGuideAuthority?.bottomGuideMm, overallHeightMm],
  );
  const engravableBodyCutoutHeightMm = React.useMemo(
    () => round2(Math.max(1, authorityBottomGuideMm - authorityTopGuideMm)),
    [authorityBottomGuideMm, authorityTopGuideMm],
  );
  const bodyOnlyEditorFrame = React.useMemo<BodyOnlyEditorFrame | null>(() => {
    if (!acceptedBodyOnlyZoneMode) return null;
    const acceptedBodyTopMm = approvedCanonicalDimensionCalibration?.lidBodyLineMm;
    const fallbackBodyTopMm = bodyReferenceFrameBounds?.bodyTopFromOverallMm;
    const bodyTopFromOverallMm = isFiniteNumber(acceptedBodyTopMm)
      ? acceptedBodyTopMm
      : isFiniteNumber(fallbackBodyTopMm)
        ? fallbackBodyTopMm
        : null;
    const acceptedBodyBottomMm = approvedCanonicalDimensionCalibration?.bodyBottomMm;
    const fallbackBodyBottomMm = bodyReferenceFrameBounds?.bodyBottomFromOverallMm;
    const bodyBottomFromOverallMm = isFiniteNumber(acceptedBodyBottomMm)
      ? acceptedBodyBottomMm
      : isFiniteNumber(fallbackBodyBottomMm)
        ? fallbackBodyBottomMm
        : null;
    if (bodyTopFromOverallMm == null || bodyBottomFromOverallMm == null) return null;
    if (bodyTopFromOverallMm < 0 || bodyBottomFromOverallMm <= bodyTopFromOverallMm) return null;

    const acceptedBodyHeightMm = approvedCanonicalDimensionCalibration?.bodyHeightMm;
    const bodyHeightMm = isFiniteNumber(acceptedBodyHeightMm) && acceptedBodyHeightMm > 0
      ? acceptedBodyHeightMm
      : bodyBottomFromOverallMm - bodyTopFromOverallMm;
    if (!(bodyHeightMm > 0)) return null;

    return {
      bodyTopFromOverallMm: round2(bodyTopFromOverallMm),
      bodyBottomFromOverallMm: round2(bodyTopFromOverallMm + bodyHeightMm),
      bodyHeightMm: round2(bodyHeightMm),
    };
  }, [
    acceptedBodyOnlyZoneMode,
    approvedCanonicalDimensionCalibration?.bodyBottomMm,
    approvedCanonicalDimensionCalibration?.bodyHeightMm,
    approvedCanonicalDimensionCalibration?.lidBodyLineMm,
    bodyReferenceFrameBounds?.bodyBottomFromOverallMm,
    bodyReferenceFrameBounds?.bodyTopFromOverallMm,
  ]);
  const bodyOnlyEditorMode = acceptedBodyOnlyZoneMode && bodyOnlyEditorFrame != null;
  const bodyOnlyCutoutTotalHeightMm = bodyOnlyEditorFrame?.bodyHeightMm ?? null;
  const engravableEditorOverallHeightMm = bodyOnlyEditorMode && bodyOnlyCutoutTotalHeightMm != null
    ? bodyOnlyCutoutTotalHeightMm
    : overallHeightMm;
  const detectedEngravableEditorSilverRingMm = React.useMemo(() => {
    if (typeof detectedLowerSilverSeamMm !== "number" || !Number.isFinite(detectedLowerSilverSeamMm)) {
      return null;
    }
    if (bodyOnlyEditorMode) {
      if (!bodyOnlyEditorFrame) return null;
      return mapOverallGuideMmToBodyLocalMm({
        overallGuideMm: detectedLowerSilverSeamMm,
        bodyTopFromOverallMm: bodyOnlyEditorFrame.bodyTopFromOverallMm,
        bodyOnlyHeightMm: bodyOnlyEditorFrame.bodyHeightMm,
      });
    }
    return round2(Math.max(0, detectedLowerSilverSeamMm));
  }, [
    bodyOnlyEditorFrame,
    bodyOnlyEditorMode,
    detectedLowerSilverSeamMm,
  ]);
  const engravableEditorTopGuideSource = engravableGuideAuthority?.topGuideSource;
  const engravableEditorBottomGuideSource = engravableGuideAuthority?.bottomGuideSource;

  const liveBodyReferenceOutline = React.useMemo(() => {
    if (productType === "flat") return null;
    if (!Number.isFinite(overallHeightMm) || overallHeightMm <= 0) return null;
    if (!Number.isFinite(diameterMm) || diameterMm <= 0) return null;
    if (!bodyReferenceFrameBounds) return null;
    const { bodyTopFromOverallMm, bodyBottomFromOverallMm } = bodyReferenceFrameBounds;
    if (bodyBottomFromOverallMm <= bodyTopFromOverallMm) return null;
    return createEditableBodyOutline({
      overallHeightMm,
      bodyTopFromOverallMm,
      bodyBottomFromOverallMm,
      diameterMm,
      matchedProfileId: resolvedMatchedProfileId ?? undefined,
      topOuterDiameterMm:
        resolvedMatchedProfile?.topDiameterMm ??
        resolvedMatchedProfile?.outsideDiameterMm ??
        null,
      baseDiameterMm:
        resolvedMatchedProfile?.bottomDiameterMm ??
        resolvedMatchedProfile?.outsideDiameterMm ??
        null,
      fitDebug: lookupResult?.fitDebug ?? null,
    });
  }, [
    bodyReferenceFrameBounds,
    diameterMm,
    lookupResult?.fitDebug,
    overallHeightMm,
    productType,
    resolvedMatchedProfile?.bottomDiameterMm,
    resolvedMatchedProfile?.outsideDiameterMm,
    resolvedMatchedProfile?.topDiameterMm,
    resolvedMatchedProfileId,
  ]);

  const liveBodyReferencePipeline = React.useMemo(() => {
    if (!liveBodyReferenceOutline || productType === "flat") return null;
    if (!bodyReferenceFrameBounds) return null;
    const { bodyTopFromOverallMm, bodyBottomFromOverallMm } = bodyReferenceFrameBounds;
    if (bodyBottomFromOverallMm <= bodyTopFromOverallMm) return null;
    return deriveBodyReferencePipeline({
      outline: liveBodyReferenceOutline,
      overallHeightMm,
      bodyTopFromOverallMm,
      bodyBottomFromOverallMm,
      wrapDiameterMm: diameterMm,
      baseDiameterMm:
        resolvedMatchedProfile?.bottomDiameterMm ??
        resolvedMatchedProfile?.outsideDiameterMm ??
        diameterMm,
      handleArcDeg,
      lidSeamFromOverallMm: savedLidSeamFromOverallMm,
      silverBandBottomFromOverallMm: detectedLowerSilverSeamMm,
      printableTopOverrideMm,
      printableBottomOverrideMm,
      persistedPrintableSurfaceContract,
      persistedCanonicalPrintableSurfaceContract:
        approvedCanonicalDimensionCalibration?.printableSurfaceContract ??
        editingTemplate?.dimensions.canonicalDimensionCalibration?.printableSurfaceContract ??
        null,
      fitDebug: lookupResult?.fitDebug ?? null,
    });
  }, [
    approvedCanonicalDimensionCalibration?.printableSurfaceContract,
    bodyReferenceFrameBounds,
    detectedLowerSilverSeamMm,
    diameterMm,
    editingTemplate?.dimensions.canonicalDimensionCalibration?.printableSurfaceContract,
    handleArcDeg,
    liveBodyReferenceOutline,
    lookupResult?.fitDebug,
    overallHeightMm,
    persistedPrintableSurfaceContract,
    printableBottomOverrideMm,
    printableTopOverrideMm,
    productType,
    resolvedMatchedProfile?.bottomDiameterMm,
    resolvedMatchedProfile?.outsideDiameterMm,
    savedLidSeamFromOverallMm,
  ]);

  const savedAppearanceReferenceLayers = React.useMemo<ProductAppearanceReferenceLayer[]>(
    () => cloneSerializable(editingTemplate?.appearanceReferenceLayers ?? []),
    [editingTemplate?.appearanceReferenceLayers],
  );
  const upstreamManufacturerLogoReference = React.useMemo(() => {
    const lookupBrand = lookupResult?.brand?.trim();
    if (lookupBrand) {
      return {
        label: lookupBrand,
        source: "lookup" as const,
        confidence: lookupResult?.dimensions.confidence ?? null,
      };
    }

    const logoDetection = detectResult?.response.analysis.logoDetection;
    const detectedBrand = logoDetection?.matchedBrand?.trim();
    if (detectedBrand) {
      return {
        label: detectedBrand,
        source: "auto-detect" as const,
        confidence: logoDetection?.confidence ?? null,
      };
    }

    return null;
  }, [
    detectResult?.response.analysis.logoDetection,
    lookupResult?.brand,
    lookupResult?.dimensions.confidence,
  ]);
  const productAppearanceSurfaceAuthority = React.useMemo(() => {
    if (productType === "flat") return null;
    const fallbackOverallHeightMm = Number.isFinite(overallHeightMm) && overallHeightMm > 0
      ? overallHeightMm
      : printHeightMm;
    if (!Number.isFinite(fallbackOverallHeightMm) || fallbackOverallHeightMm <= 0) {
      return null;
    }
    const bodyTopFromOverallMm = bodyReferenceFrameBounds?.bodyTopFromOverallMm ?? 0;
    const bodyBottomFromOverallMm =
      bodyReferenceFrameBounds?.bodyBottomFromOverallMm ?? fallbackOverallHeightMm;
    if (bodyBottomFromOverallMm <= bodyTopFromOverallMm) return null;

    return resolveProductAppearanceSurfaceAuthority({
      overallHeightMm: fallbackOverallHeightMm,
      bodyTopFromOverallMm,
      bodyBottomFromOverallMm,
      engravableGuideAuthority,
      printableSurfaceContract:
        liveBodyReferencePipeline?.printableSurfaceResolution?.printableSurfaceContract ??
        persistedPrintableSurfaceContract,
      existingAppearanceReferenceLayers: savedAppearanceReferenceLayers,
      lidSeamFromOverallMm: savedLidSeamFromOverallMm,
      silverBandBottomFromOverallMm: detectedLowerSilverSeamMm,
      bodyColorHex,
      rimColorHex,
      bodyReferenceSourceHash: currentReviewedBodyReferenceSourceHash,
      manufacturerLogo: upstreamManufacturerLogoReference,
    });
  }, [
    bodyColorHex,
    bodyReferenceFrameBounds?.bodyBottomFromOverallMm,
    bodyReferenceFrameBounds?.bodyTopFromOverallMm,
    currentReviewedBodyReferenceSourceHash,
    detectedLowerSilverSeamMm,
    engravableGuideAuthority,
    liveBodyReferencePipeline?.printableSurfaceResolution?.printableSurfaceContract,
    overallHeightMm,
    persistedPrintableSurfaceContract,
    printHeightMm,
    productType,
    rimColorHex,
    savedAppearanceReferenceLayers,
    savedLidSeamFromOverallMm,
    upstreamManufacturerLogoReference,
  ]);
  const templateAppearanceReferenceLayers = React.useMemo<ProductAppearanceReferenceLayer[]>(
    () => productAppearanceSurfaceAuthority?.appearanceReferenceLayers ?? savedAppearanceReferenceLayers,
    [productAppearanceSurfaceAuthority?.appearanceReferenceLayers, savedAppearanceReferenceLayers],
  );
  const upstreamSilverRingOverallMm = React.useMemo(() => {
    const layer = productAppearanceSurfaceAuthority?.silverBandLayer;
    if (!layer) return detectedLowerSilverSeamMm;
    const yMm = layer.yMm;
    const heightMm = layer.heightMm;
    if (!isFiniteNumber(yMm) || !isFiniteNumber(heightMm)) return detectedLowerSilverSeamMm;
    return round2(yMm + heightMm);
  }, [detectedLowerSilverSeamMm, productAppearanceSurfaceAuthority?.silverBandLayer]);
  const engravableEditorSilverRingMm = React.useMemo(() => {
    if (!isFiniteNumber(upstreamSilverRingOverallMm)) {
      return detectedEngravableEditorSilverRingMm;
    }
    if (bodyOnlyEditorMode) {
      if (!bodyOnlyEditorFrame) return null;
      return mapOverallGuideMmToBodyLocalMm({
        overallGuideMm: upstreamSilverRingOverallMm,
        bodyTopFromOverallMm: bodyOnlyEditorFrame.bodyTopFromOverallMm,
        bodyOnlyHeightMm: bodyOnlyEditorFrame.bodyHeightMm,
      });
    }
    return round2(Math.max(0, upstreamSilverRingOverallMm));
  }, [
    bodyOnlyEditorFrame,
    bodyOnlyEditorMode,
    detectedEngravableEditorSilverRingMm,
    upstreamSilverRingOverallMm,
  ]);
  const engravableEditorAppearanceReferenceLayers = React.useMemo<ProductAppearanceReferenceLayer[]>(() => {
    if (!bodyOnlyEditorMode || !bodyOnlyEditorFrame) return templateAppearanceReferenceLayers;
    return templateAppearanceReferenceLayers.map((layer) => {
      if (layer.kind === "top-finish-band") {
        const yMm = layer.yMm;
        const heightMm = layer.heightMm;
        const bottomMm = isFiniteNumber(yMm) && isFiniteNumber(heightMm)
          ? yMm + heightMm
          : null;
        const localTopMm = mapOverallGuideMmToBodyLocalMm({
          overallGuideMm: yMm,
          bodyTopFromOverallMm: bodyOnlyEditorFrame.bodyTopFromOverallMm,
          bodyOnlyHeightMm: bodyOnlyEditorFrame.bodyHeightMm,
        });
        const localBottomMm = mapOverallGuideMmToBodyLocalMm({
          overallGuideMm: bottomMm,
          bodyTopFromOverallMm: bodyOnlyEditorFrame.bodyTopFromOverallMm,
          bodyOnlyHeightMm: bodyOnlyEditorFrame.bodyHeightMm,
        });
        return {
          ...layer,
          ...(localTopMm != null ? { yMm: localTopMm } : {}),
          ...(localTopMm != null && localBottomMm != null
            ? { heightMm: round2(Math.max(0.1, localBottomMm - localTopMm)) }
            : {}),
        };
      }
      if (layer.kind === "front-brand-logo" || layer.kind === "back-brand-logo") {
        const localCenterYMm = mapOverallGuideMmToBodyLocalMm({
          overallGuideMm: layer.centerYMm,
          bodyTopFromOverallMm: bodyOnlyEditorFrame.bodyTopFromOverallMm,
          bodyOnlyHeightMm: bodyOnlyEditorFrame.bodyHeightMm,
        });
        return {
          ...layer,
          ...(localCenterYMm != null ? { centerYMm: localCenterYMm } : {}),
        };
      }
      return layer;
    });
  }, [bodyOnlyEditorFrame, bodyOnlyEditorMode, templateAppearanceReferenceLayers]);
  const upstreamSurfaceTopGuideMm = React.useMemo(
    () => round2(productAppearanceSurfaceAuthority?.engravableSurface.printableTopMm ?? authorityTopGuideMm),
    [authorityTopGuideMm, productAppearanceSurfaceAuthority?.engravableSurface.printableTopMm],
  );
  const upstreamSurfaceBottomGuideMm = React.useMemo(
    () => round2(productAppearanceSurfaceAuthority?.engravableSurface.printableBottomMm ?? authorityBottomGuideMm),
    [authorityBottomGuideMm, productAppearanceSurfaceAuthority?.engravableSurface.printableBottomMm],
  );
  const upstreamBodyOnlyTopGuideLocalMm = React.useMemo(() => {
    if (!bodyOnlyEditorFrame) return null;
    return mapOverallGuideMmToBodyLocalMm({
      overallGuideMm: upstreamSurfaceTopGuideMm,
      bodyTopFromOverallMm: bodyOnlyEditorFrame.bodyTopFromOverallMm,
      bodyOnlyHeightMm: bodyOnlyEditorFrame.bodyHeightMm,
    });
  }, [
    bodyOnlyEditorFrame,
    upstreamSurfaceTopGuideMm,
  ]);
  const upstreamBodyOnlyBottomGuideLocalMm = React.useMemo(() => {
    if (!bodyOnlyEditorFrame) return null;
    return mapOverallGuideMmToBodyLocalMm({
      overallGuideMm: upstreamSurfaceBottomGuideMm,
      bodyTopFromOverallMm: bodyOnlyEditorFrame.bodyTopFromOverallMm,
      bodyOnlyHeightMm: bodyOnlyEditorFrame.bodyHeightMm,
    });
  }, [
    bodyOnlyEditorFrame,
    upstreamSurfaceBottomGuideMm,
  ]);
  const upstreamEngravableEditorTopMarginMm = bodyOnlyEditorMode
    ? (upstreamBodyOnlyTopGuideLocalMm ?? 0)
    : upstreamSurfaceTopGuideMm;
  const upstreamEngravableEditorBottomMarginMm = bodyOnlyEditorMode
    ? round2(Math.max(0, engravableEditorOverallHeightMm - (upstreamBodyOnlyBottomGuideLocalMm ?? engravableEditorOverallHeightMm)))
    : round2(Math.max(0, overallHeightMm - upstreamSurfaceBottomGuideMm));
  const appearanceReferenceSummary = React.useMemo(
    () => summarizeAppearanceReferenceLayers(templateAppearanceReferenceLayers),
    [templateAppearanceReferenceLayers],
  );
  const previewTumblerDims = React.useMemo(
    () => buildPreviewTumblerDimensions({
      productType,
      diameterMm,
      printHeightMm: productAppearanceSurfaceAuthority?.engravableSurface.printableHeightMm ?? printHeightMm,
      overallHeightMm,
      printableTopOffsetMm: productAppearanceSurfaceAuthority?.engravableSurface.printableTopMm,
      bodyTopOffsetMm: bodyReferenceFrameBounds?.bodyTopFromOverallMm,
      bodyBottomFromOverallMm: bodyReferenceFrameBounds?.bodyBottomFromOverallMm,
      lidSeamFromOverallMm: savedLidSeamFromOverallMm,
      silverBandBottomFromOverallMm:
        productAppearanceSurfaceAuthority?.silverBandLayer
          ? round2(
              (productAppearanceSurfaceAuthority.silverBandLayer.yMm ?? 0) +
              (productAppearanceSurfaceAuthority.silverBandLayer.heightMm ?? 0),
            )
          : detectedLowerSilverSeamMm,
    }),
    [
      bodyReferenceFrameBounds?.bodyBottomFromOverallMm,
      bodyReferenceFrameBounds?.bodyTopFromOverallMm,
      detectedLowerSilverSeamMm,
      diameterMm,
      overallHeightMm,
      printHeightMm,
      productAppearanceSurfaceAuthority?.engravableSurface.printableHeightMm,
      productAppearanceSurfaceAuthority?.engravableSurface.printableTopMm,
      productAppearanceSurfaceAuthority?.silverBandLayer,
      productType,
      savedLidSeamFromOverallMm,
    ],
  );
  const previewCanonicalBounds = React.useMemo(() => {
    if (!previewTumblerDims) return null;
    const widthMm = previewTumblerDims.diameterMm;
    const heightMm = previewTumblerDims.overallHeightMm;
    const depthMm = previewTumblerDims.diameterMm;
    if (
      !Number.isFinite(widthMm) ||
      widthMm <= 0 ||
      !Number.isFinite(heightMm) ||
      heightMm <= 0 ||
      !Number.isFinite(depthMm) ||
      depthMm <= 0
    ) {
      return null;
    }
    return {
      widthMm: round2(widthMm),
      heightMm: round2(heightMm),
      depthMm: round2(depthMm),
    };
  }, [previewTumblerDims]);
  const previewModelState = React.useMemo(() => (
    productType === "tumbler"
      ? deriveTumblerPreviewModelState({
          requestedMode: previewModelMode,
          hasCanonicalAlignmentModel: Boolean(previewTumblerDims),
          hasSourceModel: Boolean(glbPath.trim()),
          sourceModelPath: glbPath.trim() || null,
          sourceModelStatus: activeDrinkwareGlbStatus,
          sourceBounds: null,
          canonicalBounds: previewCanonicalBounds,
        })
      : null
  ), [
    activeDrinkwareGlbStatus,
    glbPath,
    previewCanonicalBounds,
    previewModelMode,
    previewTumblerDims,
    productType,
  ]);
  const effectivePreviewModelMode = previewModelState?.effectiveMode ?? previewModelMode;
  const wrapExportContract =
    loadedBodyGeometryContract ?? generatedReviewedBodyGeometryContract;
  const wrapExportPreviewState = React.useMemo(
    () => buildWrapExportPreviewState(wrapExportContract),
    [wrapExportContract],
  );
  const templateArtworkPlacements = React.useMemo(
    () => cloneSerializable(
      workspaceArtworkPlacements
      ?? editingTemplate?.artworkPlacements
      ?? editingTemplate?.engravingPreviewState?.placements
      ?? [],
    ),
    [
      editingTemplate?.artworkPlacements,
      editingTemplate?.engravingPreviewState?.placements,
      workspaceArtworkPlacements,
    ],
  );
  const activeLookupDimensions = React.useMemo(
    () => lookupResult?.dimensions ?? lookupDimensionsSnapshot ?? null,
    [lookupDimensionsSnapshot, lookupResult?.dimensions],
  );
  const lookupDimensionAuthoritySummary = React.useMemo(
    () => summarizeProductDimensionAuthority(activeLookupDimensions, {
      requireScaleDiameter: true,
      requireExactVariantMatch: true,
    }),
    [activeLookupDimensions],
  );
  const activeLookupSourceLabel = React.useMemo(
    () => lookupResult
      ? getLookupSourceLabel(lookupResult)
      : getLookupSourceLabelFromUrl(
          activeLookupDimensions?.productUrl
          ?? activeLookupDimensions?.dimensionSourceUrl
          ?? null,
        ),
    [
      activeLookupDimensions?.dimensionSourceUrl,
      activeLookupDimensions?.productUrl,
      lookupResult,
    ],
  );
  const bodyReferenceV2ScaleCalibration = React.useMemo<BodyReferenceV2Draft["scaleCalibration"]>(() => {
    const lookupDiameterMm = lookupDimensionAuthoritySummary.readyForLookupScale
      ? lookupDimensionAuthoritySummary.scaleDiameterMm ?? null
      : null;
    const resolvedDiameterMm = diameterMm > 0 ? round2(diameterMm) : undefined;

    return {
      scaleSource:
        typeof lookupDiameterMm === "number" && lookupDiameterMm > 0
          ? "lookup-diameter"
          : resolvedDiameterMm != null
            ? "manual-diameter"
            : "unknown",
      lookupDiameterMm:
        typeof lookupDiameterMm === "number" && lookupDiameterMm > 0
          ? round2(lookupDiameterMm)
          : undefined,
      resolvedDiameterMm,
      wrapDiameterMm:
        typeof lookupDiameterMm === "number" && lookupDiameterMm > 0
          ? round2(lookupDiameterMm)
          : resolvedDiameterMm,
      wrapWidthMm: templateWidthMm > 0 ? round2(templateWidthMm) : undefined,
      expectedBodyHeightMm: printHeightMm > 0 ? round2(printHeightMm) : undefined,
      expectedBodyWidthMm: resolvedDiameterMm,
      lookupVariantLabel: lookupDimensionAuthoritySummary.selectedVariantLabel,
      lookupSizeOz: lookupDimensionAuthoritySummary.selectedSizeOz,
      lookupDimensionAuthority: lookupDimensionAuthoritySummary.dimensionAuthority,
      lookupScaleStatus: lookupDimensionAuthoritySummary.status,
      lookupFullProductHeightMm: lookupDimensionAuthoritySummary.fullProductHeightMm,
      lookupBodyHeightMm: lookupDimensionAuthoritySummary.bodyHeightMm,
      lookupHeightIgnoredForScale: lookupDimensionAuthoritySummary.heightIgnoredForScale,
      lookupWarnings: lookupDimensionAuthoritySummary.warnings,
      lookupErrors: lookupDimensionAuthoritySummary.errors,
    };
  }, [
    diameterMm,
    lookupDimensionAuthoritySummary.bodyHeightMm,
    lookupDimensionAuthoritySummary.dimensionAuthority,
    lookupDimensionAuthoritySummary.errors,
    lookupDimensionAuthoritySummary.fullProductHeightMm,
    lookupDimensionAuthoritySummary.heightIgnoredForScale,
    lookupDimensionAuthoritySummary.readyForLookupScale,
    lookupDimensionAuthoritySummary.scaleDiameterMm,
    lookupDimensionAuthoritySummary.selectedSizeOz,
    lookupDimensionAuthoritySummary.selectedVariantLabel,
    lookupDimensionAuthoritySummary.status,
    lookupDimensionAuthoritySummary.warnings,
    printHeightMm,
    templateWidthMm,
  ]);
  const bodyReferenceV2Draft = React.useMemo<BodyReferenceV2Draft>(() => buildEffectiveBodyReferenceV2Draft({
    draft: bodyReferenceV2DraftCapture,
    sourceImageUrl: productPhotoFullUrl || undefined,
    scaleCalibration: bodyReferenceV2ScaleCalibration,
  }), [
    bodyReferenceV2DraftCapture,
    bodyReferenceV2ScaleCalibration,
    productPhotoFullUrl,
  ]);
  const acceptedBodyReferenceV2Draft = React.useMemo<BodyReferenceV2Draft | null>(() => (
    acceptedBodyReferenceV2DraftSnapshot
      ? buildEffectiveBodyReferenceV2Draft({
          draft: acceptedBodyReferenceV2DraftSnapshot,
          sourceImageUrl: productPhotoFullUrl || undefined,
          scaleCalibration: bodyReferenceV2ScaleCalibration,
        })
      : null
  ), [
    acceptedBodyReferenceV2DraftSnapshot,
    bodyReferenceV2ScaleCalibration,
    productPhotoFullUrl,
  ]);
  const bodyReferenceV2Summary = React.useMemo(
    () => summarizeBodyReferenceV2Draft(bodyReferenceV2Draft),
    [bodyReferenceV2Draft],
  );
  const bodyReferenceV2ScaleMirrorPreview = React.useMemo(
    () => summarizeBodyReferenceV2ScaleMirrorPreview(bodyReferenceV2Draft),
    [bodyReferenceV2Draft],
  );
  const bodyReferenceV2GenerationReadiness = React.useMemo(
    () => buildBodyReferenceV2GenerationReadinessFromDraft(bodyReferenceV2Draft),
    [bodyReferenceV2Draft],
  );
  const acceptedBodyReferenceV2GenerationReadiness = React.useMemo(
    () => acceptedBodyReferenceV2Draft
      ? buildBodyReferenceV2GenerationReadinessFromDraft(acceptedBodyReferenceV2Draft)
      : null,
    [acceptedBodyReferenceV2Draft],
  );
  const bodyReferenceV2CaptureReadiness = React.useMemo(
    () => summarizeBodyReferenceV2CaptureReadiness({
      draft: bodyReferenceV2Draft,
      acceptedDraft: acceptedBodyReferenceV2Draft,
    }),
    [acceptedBodyReferenceV2Draft, bodyReferenceV2Draft],
  );
  const activeReviewedBodyReferenceAuthority = React.useMemo(() => {
    const sourceType = wrapExportContract?.source.type ?? null;
    if (sourceType === "body-reference-v2") {
      return "BODY REFERENCE v2 mirrored profile";
    }
    if (sourceType === "approved-svg") {
      return "Accepted BODY REFERENCE cutout";
    }
    return null;
  }, [wrapExportContract]);
  const isBodyReferenceV2CurrentQaSource = activeReviewedBodyReferenceAuthority === "BODY REFERENCE v2 mirrored profile";
  const templateArtworkPlacementMapping = React.useMemo(
    () => buildWrapExportSurfaceMapping(wrapExportContract, appearanceReferenceSummary.frontCenterAngleDeg),
    [appearanceReferenceSummary.frontCenterAngleDeg, wrapExportContract],
  );
  const templateArtworkPlacementMappingSignature = React.useMemo(
    () => templateArtworkPlacementMapping
      ? buildLaserBedSurfaceMappingSignature(templateArtworkPlacementMapping)
      : undefined,
    [templateArtworkPlacementMapping],
  );
  const savedArtworkPlacementSignature =
    workspaceArtworkPlacements != null
      ? templateArtworkPlacementMappingSignature
      : editingTemplate?.engravingPreviewState?.mappingSignature
        ?? editingTemplate?.artworkPlacements?.[0]?.mappingSignature;
  const persistedArtworkPlacements = React.useMemo(
    () => templateArtworkPlacements.map((placement) => ({
      ...placement,
      mappingSignature:
        templateArtworkPlacementMappingSignature
        ?? placement.mappingSignature,
    })),
    [templateArtworkPlacements, templateArtworkPlacementMappingSignature],
  );
  const persistedTemplateEngravingPreviewState = React.useMemo(
    () => validateLaserBedSurfaceMapping({
      mapping: templateArtworkPlacementMapping,
      placements: persistedArtworkPlacements,
      savedSignature: savedArtworkPlacementSignature ?? null,
    }),
    [
      persistedArtworkPlacements,
      savedArtworkPlacementSignature,
      templateArtworkPlacementMapping,
    ],
  );
  const engravingOverlayPreviewState = React.useMemo(
    () => buildEngravingOverlayPreviewState({
      placements: persistedArtworkPlacements,
      mapping: templateArtworkPlacementMapping,
      savedSignature: savedArtworkPlacementSignature ?? null,
      previewMode: effectivePreviewModelMode,
    }),
    [
      effectivePreviewModelMode,
      persistedArtworkPlacements,
      savedArtworkPlacementSignature,
      templateArtworkPlacementMapping,
    ],
  );
  const wrapExportProductionReadiness = React.useMemo(
    () => summarizeWrapExportProductionReadiness({
      contract: wrapExportContract,
      placements: persistedArtworkPlacements,
      mapping: templateArtworkPlacementMapping,
      savedSignature: savedArtworkPlacementSignature ?? null,
      previewMode: effectivePreviewModelMode,
      overlayState: engravingOverlayPreviewState,
      appearanceReferenceLayers: templateAppearanceReferenceLayers,
    }),
    [
      effectivePreviewModelMode,
      editingTemplate?.engravingPreviewState?.mappingSignature,
      engravingOverlayPreviewState,
      persistedArtworkPlacements,
      savedArtworkPlacementSignature,
      templateAppearanceReferenceLayers,
      templateArtworkPlacementMapping,
      wrapExportContract,
      workspaceArtworkPlacements,
    ],
  );
  const overlayPreviewPlacedItems = React.useMemo<PlacedItem[]>(
    () => {
      const placementsById = new Map(persistedArtworkPlacements.map((placement) => [placement.id, placement]));
      return engravingOverlayPreviewState.items.flatMap((item) => {
        if (!item.visible) return [];
        const placement = placementsById.get(item.id);
        if (!placement) return [];
        const restored = buildOverlayPreviewPlacedItem({
          assetId: item.assetId,
          name: item.name,
          xMm: item.xMm,
          yMm: item.yMm,
          widthMm: item.widthMm,
          heightMm: item.heightMm,
          rotationDeg: item.rotationDeg,
          visible: item.visible,
          placement,
        });
        return restored ? [restored] : [];
      });
    },
    [engravingOverlayPreviewState.items, persistedArtworkPlacements],
  );
  const overlayPreviewTextureKey = React.useMemo(
    () => overlayPreviewPlacedItems
      .map((item) => `${item.id}:${item.x}:${item.y}:${item.width}:${item.height}:${item.rotation}:${item.svgText.length}`)
      .join("|"),
    [overlayPreviewPlacedItems],
  );

  React.useEffect(() => {
    if (!engravingOverlayPreviewState.enabled || overlayPreviewPlacedItems.length === 0) {
      setOverlayPreviewTextures(new Map());
      return;
    }

    let cancelled = false;
    Promise.all(
      overlayPreviewPlacedItems.map(async (item) => {
        const texture = await rasterizeOverlayTexture(item, ENGRAVING_OVERLAY_TINT);
        return texture ? [item.id, texture] as const : null;
      }),
    ).then((entries) => {
      if (cancelled) return;
      setOverlayPreviewTextures(new Map(entries.filter((entry): entry is readonly [string, HTMLCanvasElement] => Boolean(entry))));
    });

    return () => {
      cancelled = true;
    };
  }, [engravingOverlayPreviewState.enabled, overlayPreviewPlacedItems, overlayPreviewTextureKey]);
  const hasSavedArtworkPlacements = persistedArtworkPlacements.length > 0;
  const wrapExportFreshnessLabel = React.useMemo(
    () => getWrapExportMappingFreshnessLabel({
      freshness: wrapExportProductionReadiness.mappingFreshness,
      hasSavedPlacements: hasSavedArtworkPlacements,
    }),
    [hasSavedArtworkPlacements, wrapExportProductionReadiness.mappingFreshness],
  );
  const wrapExportOperatorWarningNote = React.useMemo(
    () => getWrapExportOperatorWarningNote({
      freshness: wrapExportProductionReadiness.mappingFreshness,
      placementCount: wrapExportProductionReadiness.placementCount,
      outsidePrintableWarningCount: engravingOverlayPreviewState.outsidePrintableAreaCount,
      staleMappingWarningCount: wrapExportProductionReadiness.staleMappingWarningCount,
    }),
    [
      engravingOverlayPreviewState.outsidePrintableAreaCount,
      wrapExportProductionReadiness.mappingFreshness,
      wrapExportProductionReadiness.placementCount,
      wrapExportProductionReadiness.staleMappingWarningCount,
    ],
  );
  const wrapExportDiagnosticMessages = React.useMemo(
    () => dedupeTemplateCreateDisplayMessages([
      ...wrapExportPreviewState.errors.map((message) => ({ level: "error" as const, message })),
      ...wrapExportPreviewState.warnings.map((message) => ({ level: "warning" as const, message })),
      ...appearanceReferenceSummary.warnings.map((message) => ({ level: "warning" as const, message })),
      ...persistedTemplateEngravingPreviewState.errors.map((message) => ({ level: "error" as const, message })),
      ...persistedTemplateEngravingPreviewState.warnings.map((message) => ({ level: "warning" as const, message })),
      ...engravingOverlayPreviewState.errors.map((message) => ({ level: "error" as const, message })),
      ...engravingOverlayPreviewState.warnings.map((message) => ({ level: "warning" as const, message })),
    ]),
    [
      appearanceReferenceSummary.warnings,
      engravingOverlayPreviewState.errors,
      engravingOverlayPreviewState.warnings,
      persistedTemplateEngravingPreviewState.errors,
      persistedTemplateEngravingPreviewState.warnings,
      wrapExportPreviewState.errors,
      wrapExportPreviewState.warnings,
    ],
  );
  const wrapExportSummaryVisible =
    previewModelMode === "wrap-export" ||
    effectivePreviewModelMode === "wrap-export";
  const requestedPreviewModeLabel = React.useMemo(
    () => getBodyReferencePreviewModeLabel({
      productType,
      mode: previewModelMode,
      glbStatus: activeDrinkwareGlbStatus,
    }),
    [activeDrinkwareGlbStatus, previewModelMode, productType],
  );
  const effectivePreviewModeLabel = React.useMemo(
    () => getBodyReferencePreviewModeLabel({
      productType,
      mode: effectivePreviewModelMode,
      glbStatus: activeDrinkwareGlbStatus,
    }),
    [activeDrinkwareGlbStatus, effectivePreviewModelMode, productType],
  );
  const effectivePreviewModeHint = React.useMemo(
    () => getBodyReferencePreviewModeHint({
      productType,
      mode: effectivePreviewModelMode,
    }),
    [effectivePreviewModelMode, productType],
  );
  const previewModeDowngradeActive =
    previewModelState != null &&
    previewModelState.requestedMode !== previewModelState.effectiveMode;
  const hasReviewedBodyCutoutQaGlb = activeDrinkwareGlbStatus === "generated-reviewed-model";
  const hasSourceModelForPreview = Boolean(glbPath.trim());

  const workflowInput = React.useMemo(
    () => ({
      productType,
      hasProductImage: Boolean(productImageFile || productPhotoFullUrl),
      hasStagedDetectResult: Boolean(detectResult || lookupResult),
      hasAcceptedReview: hasAcceptedBodyReferenceReview,
      hasReviewedBodyCutoutQa: hasReviewedBodyCutoutQaGlb,
      hasCanonicalBodyProfile: Boolean(approvedCanonicalBodyProfile),
      hasCanonicalDimensionCalibration: Boolean(approvedCanonicalDimensionCalibration),
    }),
    [
      approvedCanonicalBodyProfile,
      approvedCanonicalDimensionCalibration,
      detectResult,
      hasAcceptedBodyReferenceReview,
      hasReviewedBodyCutoutQaGlb,
      lookupResult,
      productImageFile,
      productPhotoFullUrl,
      productType,
    ],
  );

  const templateCreateSourceReadiness = React.useMemo(
    () => getTemplateCreateSourceReadiness(workflowInput),
    [workflowInput],
  );
  const workflowSteps = React.useMemo(
    () => buildTemplateCreateWorkflowSteps(workflowInput),
    [workflowInput],
  );
  const workflowCurrentStep = React.useMemo(
    () => deriveTemplateCreateWorkflowStep(workflowInput),
    [workflowInput],
  );
  const workflowSourceStep = React.useMemo(
    () => workflowSteps.find((step) => step.step === "source") ?? null,
    [workflowSteps],
  );
  const workflowDetectStep = React.useMemo(
    () => workflowSteps.find((step) => step.step === "detect") ?? null,
    [workflowSteps],
  );
  const workflowReviewStep = React.useMemo(
    () => workflowSteps.find((step) => step.step === "review") ?? null,
    [workflowSteps],
  );
  const workflowGenerateStep = React.useMemo(
    () => workflowSteps.find((step) => step.step === "generate") ?? null,
    [workflowSteps],
  );
  const workflowPreviewStep = React.useMemo(
    () => workflowSteps.find((step) => step.step === "preview") ?? null,
    [workflowSteps],
  );
  const workflowCurrentStepLabel = React.useMemo(
    () => workflowSteps.find((step) => step.step === workflowCurrentStep)?.label ?? workflowCurrentStep,
    [workflowCurrentStep, workflowSteps],
  );
  const workflowNextActionHint = React.useMemo(
    () => getTemplateCreateNextActionHint(workflowInput),
    [workflowInput],
  );
  const saveGateReason = React.useMemo(
    () => getTemplateCreateSaveGateReason(workflowInput),
    [workflowInput],
  );
  const lookupActionReason = React.useMemo(
    () => getTemplateCreateLookupActionReason({
      lookupInput,
      lookingUp: lookingUpItem,
    }),
    [lookupInput, lookingUpItem],
  );
  const templateModeWorkflowHeading = React.useMemo(() => {
    if (!isTemplateCreateReviewFlowProductType(productType)) {
      return "Source and template details";
    }
    return "Template operator flow";
  }, [productType]);
  const workflowCurrentStepDisplayLabel = React.useMemo(
    () => workflowCurrentStepLabel.replace(/^\d+\.\s*/, ""),
    [workflowCurrentStepLabel],
  );
  const reviewStageLabel = React.useMemo(() => {
    if (hasAcceptedBodyReferenceReview) {
      return "BODY REFERENCE accepted";
    }
    if (workflowInput.hasStagedDetectResult) {
      return "Review pending";
    }
    return "Review blocked";
  }, [hasAcceptedBodyReferenceReview, workflowInput.hasStagedDetectResult]);
  const wrapExportStageLabel = React.useMemo(() => {
    if (!hasSourceModelForPreview) {
      return "Source model needed";
    }
    return getWrapExportPreviewStatusLabel(wrapExportProductionReadiness.status);
  }, [hasSourceModelForPreview, wrapExportProductionReadiness.status]);
  const appearanceReferenceStageLabel = React.useMemo(() => {
    if (appearanceReferenceSummary.totalLayers <= 0) {
      return "No references saved";
    }
    return `${appearanceReferenceSummary.totalLayers} reference layer${
      appearanceReferenceSummary.totalLayers === 1 ? "" : "s"
    }`;
  }, [appearanceReferenceSummary.totalLayers]);

  React.useEffect(() => {
    if (previewModelMode !== "body-cutout-qa") return;
    if (!isBodyCutoutQaPreviewAvailable(activeDrinkwareGlbStatus)) {
      setPreviewModelMode(resolveDefaultPreviewModelMode({
        glbPath,
        glbStatus: activeDrinkwareGlbStatus,
      }));
    }
  }, [activeDrinkwareGlbStatus, glbPath, previewModelMode]);

  // ── Validation ───────────────────────────────────────────────────
  const [errors, setErrors] = React.useState<string[]>([]);

  const resetBodyReferenceReviewScaffold = React.useCallback(() => {
    resetBodyReferenceFineTuneState();
    setHasAcceptedBodyReferenceReview(false);
    setApprovedBodyOutline(null);
    setApprovedCanonicalBodyProfile(null);
    setApprovedCanonicalDimensionCalibration(null);
    setApprovedBodyReferenceQa(null);
    setApprovedBodyReferenceWarnings([]);
    setBodyReferenceV2DraftCapture(createEmptyBodyReferenceV2Draft());
    setAcceptedBodyReferenceV2DraftSnapshot(null);
    setGeneratedReviewedBodyGeometryContract(null);
    setLoadedBodyGeometryContract(null);
    setReviewedBodyCutoutQaGeneratedSourceSignature(null);
    setReviewedGeneratedModelState(null);
    setPreviewModelMode(resolveDefaultPreviewModelMode({
      glbPath,
      glbStatus: activeDrinkwareGlbStatus,
    }));
  }, [activeDrinkwareGlbStatus, glbPath, resetBodyReferenceFineTuneState]);

  /** Handle product image selection — store file for auto-detect, generate thumbnail + full-res */
  const handleProductImage = async (file: File) => {
    resetBodyReferenceReviewScaffold();
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
  };

  const clearProductImage = React.useCallback(() => {
    resetBodyReferenceReviewScaffold();
    setProductImageFile(null);
    setProductImageLabel(null);
    setThumbDataUrl("");
    setProductPhotoFullUrl("");
    setDetectResult(null);
    setDetectError(null);
  }, [resetBodyReferenceReviewScaffold]);

  const applyProfileOrDimensions = React.useCallback((args: {
    brand: string | null | undefined;
    model: string | null | undefined;
    capacityOz?: number | null;
    scaleDiameterMm?: number | null;
    topDiameterMm?: number | null;
    bottomDiameterMm?: number | null;
    fullProductHeightMm?: number | null;
    bodyHeightMm?: number | null;
  }) => {
    const profileId = findTumblerProfileIdForBrandModel({
      brand: args.brand,
      model: args.model,
      capacityOz: args.capacityOz,
    });
    const matchedProfile = profileId ? getTumblerProfileById(profileId) : null;

    if (args.scaleDiameterMm) {
      setDiameterMm(round2(args.scaleDiameterMm));
    } else if (matchedProfile?.outsideDiameterMm) {
      setDiameterMm(round2(matchedProfile.outsideDiameterMm));
    } else if (args.topDiameterMm && args.bottomDiameterMm) {
      setDiameterMm(round2((args.topDiameterMm + args.bottomDiameterMm) / 2));
    }

    if (args.bodyHeightMm) {
      setPrintHeightMm(round2(args.bodyHeightMm));
    } else if (matchedProfile?.usableHeightMm) {
      setPrintHeightMm(round2(matchedProfile.usableHeightMm));
    }

    const profileArc = getProfileHandleArcDeg(matchedProfile);
    setHandleArcDeg(profileArc);
    if (matchedProfile) {
      const oh = matchedProfile.overallHeightMm;
      setOverallHeightMm(round2(oh));
      const usable = matchedProfile.usableHeightMm;
      const topM = matchedProfile.guideBand?.upperGrooveYmm ?? round2((oh - usable) / 2);
      const bottomM = round2(Math.max(0, oh - usable - topM));
      setTopMarginMm(topM);
      setBottomMarginMm(bottomM);
      if (matchedProfile.shapeType === "tapered") {
        const top = matchedProfile.topDiameterMm ?? null;
        const bottom = matchedProfile.bottomDiameterMm ?? null;
        if (top && bottom) {
          setTaperCorrection(top < bottom ? "top-narrow" : "bottom-narrow");
        }
      }
      return;
    }

    if (args.fullProductHeightMm) {
      setOverallHeightMm(round2(args.fullProductHeightMm));
    }
    if (args.fullProductHeightMm && args.bodyHeightMm) {
      const topM = round2((args.fullProductHeightMm - args.bodyHeightMm) / 2);
      const bottomM = round2(Math.max(0, args.fullProductHeightMm - args.bodyHeightMm - topM));
      setTopMarginMm(topM);
      setBottomMarginMm(bottomM);
    }
    if (args.topDiameterMm && args.bottomDiameterMm && args.topDiameterMm !== args.bottomDiameterMm) {
      setTaperCorrection(args.topDiameterMm < args.bottomDiameterMm ? "top-narrow" : "bottom-narrow");
    }
  }, []);

  const handleItemLookup = async () => {
    const raw = lookupInput.trim();
    if (!raw) return;

    resetBodyReferenceReviewScaffold();
    setLookingUpItem(true);
    setLookupError(null);
    setLookupResult(null);
    setDetectError(null);
    setLookupDebugImageUrl("");

    try {
      const result = await lookupTumblerItem(raw);
      const authoritySummary = summarizeProductDimensionAuthority(result.dimensions, {
        requireScaleDiameter: true,
        requireExactVariantMatch: true,
      });
      setLookupResult(result);
      setLookupDimensionsSnapshot(result.dimensions);

      setName(buildLookupTemplateName(result, raw));
      if (result.brand) setBrand(result.brand);
      if (result.capacityOz) setCapacity(`${result.capacityOz}oz`);
      setProductType("tumbler");
      setGlbPath(result.glbPath || "");

        // New lookup dimensions should become the active zone authority.
        // Clear any prior manual drag overrides before applying lookup/profile values.
        setPrintableTopOverrideMm(null);
        setPrintableBottomOverrideMm(null);

      applyProfileOrDimensions({
        brand: result.brand,
        model: result.model,
        capacityOz: result.capacityOz,
        scaleDiameterMm: authoritySummary.readyForLookupScale
          ? authoritySummary.scaleDiameterMm ?? null
          : null,
        topDiameterMm: result.dimensions.topDiameterMm,
        bottomDiameterMm: result.dimensions.bottomDiameterMm,
        fullProductHeightMm:
          authoritySummary.fullProductHeightMm
          ?? result.dimensions.fullProductHeightMm
          ?? result.dimensions.overallHeightMm,
        bodyHeightMm:
          authoritySummary.bodyHeightMm
          ?? result.dimensions.bodyHeightMm
          ?? result.dimensions.usableHeightMm,
      });

      if (result.imageUrl) {
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
      }
    } catch (e) {
      setLookupError(
        e instanceof Error ? e.message : "Item lookup failed. Fill in manually.",
      );
    } finally {
      setLookingUpItem(false);
    }
  };

  /** Run auto-detect on the uploaded product image */
  const handleAutoDetect = async () => {
    if (!productImageFile) return;
    resetBodyReferenceReviewScaffold();
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
      const parts: string[] = [];
      if (sug.brand) parts.push(sug.brand);
      if (sug.model) parts.push(sug.model);
      if (sug.capacityOz) parts.push(`${sug.capacityOz}oz`);
      if (parts.length > 0) setName(parts.join(" "));
      if (sug.brand) setBrand(sug.brand);
      if (sug.capacityOz) setCapacity(`${sug.capacityOz}oz`);
      // Dimensions
      if (draft.outsideDiameterMm) setDiameterMm(round2(draft.outsideDiameterMm));
      if (draft.usableHeightMm) setPrintHeightMm(round2(draft.usableHeightMm));
      else if (draft.templateHeightMm) setPrintHeightMm(round2(draft.templateHeightMm));
      // Handle arc: prefer profile-specific value, fall back to 90 if hasHandle
      const profileId = findTumblerProfileIdForBrandModel({
        brand: sug.brand,
        model: sug.model,
        capacityOz: sug.capacityOz,
      });
      const matchedProfile = profileId ? getTumblerProfileById(profileId) : null;
      const profileArc = getProfileHandleArcDeg(matchedProfile);
      if (matchedProfile) {
        setHandleArcDeg(profileArc);
      } else if (sug.hasHandle) {
        setHandleArcDeg(90);
      } else {
        setHandleArcDeg(0);
      }
      // Product type
      setProductType(mapProductType(sug.productType));
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
        setTopMarginMm(topM);
        setBottomMarginMm(bottomM);
      } else if (sug.overallHeightMm && sug.usableHeightMm) {
        const oh = sug.overallHeightMm;
        setOverallHeightMm(round2(oh));
        const topM = round2((oh - sug.usableHeightMm) / 2);
        const bottomM = round2(Math.max(0, oh - sug.usableHeightMm - topM));
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
    setReviewedGeneratedModelState(null);
    setGeneratedReviewedBodyGeometryContract(null);
    setLoadedBodyGeometryContract(null);
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

  const canGenerateReviewedBodyReferenceGlb = Boolean(
    productType !== "flat" &&
    hasAcceptedBodyReferenceReview &&
    approvedBodyOutline &&
    approvedCanonicalBodyProfile &&
    approvedCanonicalDimensionCalibration,
  );

  const activeBodyReferenceFineTuneOutline = React.useMemo(
    () => (
      bodyReferenceFineTuneModeEnabled
        ? (bodyReferenceFineTuneDraftOutline ?? approvedBodyOutline)
        : approvedBodyOutline
    ),
    [approvedBodyOutline, bodyReferenceFineTuneDraftOutline, bodyReferenceFineTuneModeEnabled],
  );
  const bodyReferenceFineTuneDraftHasChanges = React.useMemo(
    () => hasFineTuneDraftChanges({
      approved: approvedBodyOutline,
      draft: activeBodyReferenceFineTuneOutline,
    }),
    [activeBodyReferenceFineTuneOutline, approvedBodyOutline],
  );
  const bodyReferenceFineTuneDraftPendingAcceptance =
    bodyReferenceFineTuneModeEnabled &&
    bodyReferenceFineTuneDraftHasChanges;
  const generateBodyCutoutGateReason = React.useMemo(
    () => getTemplateCreateGenerateGateReason({
      productType,
      hasAcceptedReview: hasAcceptedBodyReferenceReview,
      canGenerate: canGenerateReviewedBodyReferenceGlb,
      hasPendingSourceDraft: bodyReferenceFineTuneDraftPendingAcceptance,
    }),
    [
      bodyReferenceFineTuneDraftPendingAcceptance,
      canGenerateReviewedBodyReferenceGlb,
      hasAcceptedBodyReferenceReview,
      productType,
    ],
  );
  const acceptBodyReferenceActionReason = React.useMemo(
    () => getTemplateCreateReviewAcceptActionReason({
      hasAcceptedReview: hasAcceptedBodyReferenceReview,
      hasLivePipeline: Boolean(liveBodyReferencePipeline),
    }),
    [hasAcceptedBodyReferenceReview, liveBodyReferencePipeline],
  );
  const generateBodyCutoutActionReason = React.useMemo(
    () => resolveTemplateCreateBlockedActionReason({
      busy: generatingReviewedBodyReferenceGlb,
      blockedReason: generateBodyCutoutGateReason,
    }),
    [generateBodyCutoutGateReason, generatingReviewedBodyReferenceGlb],
  );
  const previewModeTransitionNote = React.useMemo(
    () => previewModeDowngradeActive
      ? `Selected preview: ${requestedPreviewModeLabel}. Viewer is showing ${effectivePreviewModeLabel} until the required model state is available.`
      : null,
    [effectivePreviewModeLabel, previewModeDowngradeActive, requestedPreviewModeLabel],
  );
  const bodyReferenceV2GenerateGateReason = React.useMemo(() => {
    return getBodyReferenceV2GenerateGateReason({
      hasPendingV1FineTune: bodyReferenceFineTuneDraftPendingAcceptance,
      hasCenterline: bodyReferenceV2GenerationReadiness.centerlineCaptured,
      hasBodyLeft: bodyReferenceV2GenerationReadiness.leftBodyPointCount > 0,
      lookupDiameterReady: bodyReferenceV2GenerationReadiness.lookupDiameterMm != null,
      accepted: bodyReferenceV2CaptureReadiness.accepted,
      hasDraftChanges: bodyReferenceV2CaptureReadiness.hasDraftChanges,
      generationReady: bodyReferenceV2CaptureReadiness.generationReady,
    });
  }, [
    bodyReferenceFineTuneDraftPendingAcceptance,
    bodyReferenceV2CaptureReadiness.accepted,
    bodyReferenceV2CaptureReadiness.generationReady,
    bodyReferenceV2CaptureReadiness.hasDraftChanges,
    bodyReferenceV2GenerationReadiness.centerlineCaptured,
    bodyReferenceV2GenerationReadiness.leftBodyPointCount,
    bodyReferenceV2GenerationReadiness.lookupDiameterMm,
  ]);
  const bodyReferenceV2AcceptDraftGateReason = React.useMemo(
    () => getBodyReferenceV2AcceptDraftReason({
      hasCenterline: Boolean(bodyReferenceV2Draft.centerline),
      hasBodyLeft: bodyReferenceV2Summary.bodyLeftCaptured,
    }),
    [bodyReferenceV2Draft.centerline, bodyReferenceV2Summary.bodyLeftCaptured],
  );
  const bodyReferenceV2AcceptDraftActionReason = React.useMemo(
    () => resolveTemplateCreateBlockedActionReason({
      busy: false,
      blockedReason: bodyReferenceV2AcceptDraftGateReason,
    }),
    [bodyReferenceV2AcceptDraftGateReason],
  );
  const bodyReferenceV2GenerateActionReason = React.useMemo(
    () => resolveTemplateCreateBlockedActionReason({
      busy: generatingReviewedBodyReferenceGlb,
      blockedReason: bodyReferenceV2GenerateGateReason,
    }),
    [bodyReferenceV2GenerateGateReason, generatingReviewedBodyReferenceGlb],
  );
  const bodyReferenceV2SeedActionReason = React.useMemo(
    () => getTemplateCreateV2SeedActionReason({
      hasApprovedBodyOutline: Boolean(approvedBodyOutline),
    }),
    [approvedBodyOutline],
  );
  const bodyReferenceV2CurrentQaSourceLabel = React.useMemo(
    () => getBodyReferenceV2CurrentQaSourceLabel(isBodyReferenceV2CurrentQaSource),
    [isBodyReferenceV2CurrentQaSource],
  );
  const bodyReferenceV2SourceAuthorityNote = React.useMemo(
    () => getBodyReferenceV2SourceAuthorityNote({
      isCurrentGenerationSource: isBodyReferenceV2CurrentQaSource,
      hasDraftChanges: bodyReferenceV2CaptureReadiness.hasDraftChanges,
    }),
    [bodyReferenceV2CaptureReadiness.hasDraftChanges, isBodyReferenceV2CurrentQaSource],
  );
  const bodyReferenceV2SummaryGuidanceMessages = React.useMemo(
    () => buildBodyReferenceV2GuidanceMessages({
      errors: [
        ...bodyReferenceV2Summary.validation.errors,
        ...bodyReferenceV2CaptureReadiness.errors,
      ],
      warnings: [
        ...bodyReferenceV2Summary.validation.warnings,
        ...bodyReferenceV2CaptureReadiness.warnings,
      ],
    }),
    [
      bodyReferenceV2CaptureReadiness.errors,
      bodyReferenceV2CaptureReadiness.warnings,
      bodyReferenceV2Summary.validation.errors,
      bodyReferenceV2Summary.validation.warnings,
    ],
  );
  const bodyReferenceV2MirrorGuidanceMessages = React.useMemo(
    () => buildBodyReferenceV2GuidanceMessages({
      errors: bodyReferenceV2ScaleMirrorPreview.errors,
      warnings: bodyReferenceV2ScaleMirrorPreview.warnings,
    }),
    [bodyReferenceV2ScaleMirrorPreview.errors, bodyReferenceV2ScaleMirrorPreview.warnings],
  );
  const bodyReferenceV2GenerationGuidanceMessages = React.useMemo(
    () => buildBodyReferenceV2GuidanceMessages({
      errors: bodyReferenceV2GenerationReadiness.errors,
      warnings: bodyReferenceV2GenerationReadiness.warnings,
    }),
    [bodyReferenceV2GenerationReadiness.errors, bodyReferenceV2GenerationReadiness.warnings],
  );
  const bodyReferenceV2OperatorState = React.useMemo(
    () => getTemplateBodyReferenceV2OperatorState({
      isActiveGenerationSource: isBodyReferenceV2CurrentQaSource,
      accepted: bodyReferenceV2CaptureReadiness.accepted,
      generationReady: bodyReferenceV2CaptureReadiness.generationReady,
      hasDraftChanges: bodyReferenceV2CaptureReadiness.hasDraftChanges,
      errorCount:
        bodyReferenceV2Summary.validation.errors.length +
        bodyReferenceV2CaptureReadiness.errors.length +
        bodyReferenceV2GenerationReadiness.errors.length,
      warningCount:
        bodyReferenceV2Summary.validation.warnings.length +
        bodyReferenceV2CaptureReadiness.warnings.length +
        bodyReferenceV2GenerationReadiness.warnings.length,
    }),
    [
      bodyReferenceV2CaptureReadiness.accepted,
      bodyReferenceV2CaptureReadiness.errors.length,
      bodyReferenceV2CaptureReadiness.generationReady,
      bodyReferenceV2CaptureReadiness.hasDraftChanges,
      bodyReferenceV2CaptureReadiness.warnings.length,
      bodyReferenceV2GenerationReadiness.errors.length,
      bodyReferenceV2GenerationReadiness.warnings.length,
      bodyReferenceV2Summary.validation.errors.length,
      bodyReferenceV2Summary.validation.warnings.length,
      isBodyReferenceV2CurrentQaSource,
    ],
  );
  const reviewDisabledActionReasonGroups = React.useMemo(
    () => groupTemplateCreateDisabledActionReasons([
      {
        label: "Accept BODY REFERENCE (v1)",
        reason: acceptBodyReferenceActionReason,
      },
      {
        label: "Generate BODY CUTOUT QA GLB (v1)",
        reason: generateBodyCutoutActionReason,
      },
    ]),
    [acceptBodyReferenceActionReason, generateBodyCutoutActionReason],
  );
  const previewDisabledActionReasonGroups = React.useMemo(
    () => groupTemplateCreateDisabledActionReasons([
      {
        label: "BODY CUTOUT QA",
        reason: getTemplateCreatePreviewActionReason({
          action: "body-cutout-qa",
          hasSourceModel: hasSourceModelForPreview,
          hasQaPreview: isBodyCutoutQaPreviewAvailable(activeDrinkwareGlbStatus),
        }),
      },
      {
        label: "WRAP / EXPORT",
        reason: getTemplateCreatePreviewActionReason({
          action: "wrap-export",
          hasSourceModel: hasSourceModelForPreview,
          hasQaPreview: isBodyCutoutQaPreviewAvailable(activeDrinkwareGlbStatus),
        }),
      },
      {
        label: "Full model",
        reason: getTemplateCreatePreviewActionReason({
          action: "full-model",
          hasSourceModel: hasSourceModelForPreview,
          hasQaPreview: isBodyCutoutQaPreviewAvailable(activeDrinkwareGlbStatus),
        }),
      },
      {
        label: "Source compare",
        reason: getTemplateCreatePreviewActionReason({
          action: "source-compare",
          hasSourceModel: hasSourceModelForPreview,
          hasQaPreview: isBodyCutoutQaPreviewAvailable(activeDrinkwareGlbStatus),
        }),
      },
    ]),
    [activeDrinkwareGlbStatus, hasSourceModelForPreview],
  );
  const bodyReferenceV2DisabledActionReasonGroups = React.useMemo(
    () => groupTemplateCreateDisabledActionReasons([
      {
        label: "Capture / seed centerline",
        reason: bodyReferenceV2SeedActionReason,
      },
      {
        label: "Set body-left from accepted BODY REFERENCE",
        reason: bodyReferenceV2SeedActionReason,
      },
      {
        label: "Accept v2 draft",
        reason: bodyReferenceV2AcceptDraftActionReason,
      },
      {
        label: "Generate BODY CUTOUT QA from v2 mirrored profile",
        reason: bodyReferenceV2GenerateActionReason,
      },
    ]),
    [
      bodyReferenceV2AcceptDraftActionReason,
      bodyReferenceV2GenerateActionReason,
      bodyReferenceV2SeedActionReason,
    ],
  );
  const approvedBodyReferenceOutlineBounds = React.useMemo(
    () => resolveOutlineBounds(approvedBodyOutline),
    [approvedBodyOutline],
  );
  const draftBodyReferenceOutlineBounds = React.useMemo(
    () => resolveOutlineBounds(activeBodyReferenceFineTuneOutline),
    [activeBodyReferenceFineTuneOutline],
  );
  const approvedBodyReferencePointCount = React.useMemo(
    () => resolveOutlinePointCount(approvedBodyOutline),
    [approvedBodyOutline],
  );
  const draftBodyReferencePointCount = React.useMemo(
    () => resolveOutlinePointCount(activeBodyReferenceFineTuneOutline),
    [activeBodyReferenceFineTuneOutline],
  );
  const activeBodyReferenceSvgQuality = React.useMemo(
    () => buildBodyReferenceSvgQualityReportFromOutline({
      outline: activeBodyReferenceFineTuneOutline,
    }),
    [activeBodyReferenceFineTuneOutline],
  );
  const bodyHeightAuthorityInput = React.useMemo<BodyHeightAuthorityInput>(() => {
    const bodyTopFromOverallMm = round2(Math.max(0, topMarginMm));
    const bodyBottomFromOverallMm = round2(Math.max(bodyTopFromOverallMm, overallHeightMm - Math.max(0, bottomMarginMm)));
    const referenceBandHeightPx =
      typeof lookupResult?.fitDebug?.referenceBandTopPx === "number" &&
      typeof lookupResult.fitDebug.referenceBandBottomPx === "number"
        ? round2(Math.max(0, lookupResult.fitDebug.referenceBandBottomPx - lookupResult.fitDebug.referenceBandTopPx))
        : undefined;

    return {
      lookupBodyHeightMm: lookupDimensionAuthoritySummary.bodyHeightMm,
      lookupBodyHeightSource: resolveLookupBodyHeightSource(activeLookupDimensions),
      lookupFullProductHeightMm: lookupDimensionAuthoritySummary.fullProductHeightMm,
      templateDimensionsHeightMm: overallHeightMm > 0 ? round2(overallHeightMm) : undefined,
      templateDimensionsPrintHeightMm: printHeightMm > 0 ? round2(printHeightMm) : undefined,
      printableHeightMm: approvedCanonicalDimensionCalibration?.printableSurfaceContract?.printableHeightMm,
      engravableHeightMm: printHeightMm > 0 ? round2(printHeightMm) : undefined,
      approvedSvgBoundsHeightMm: activeBodyReferenceSvgQuality.bounds?.height,
      approvedSvgMarkedPhysicalMm: false,
      v2ExpectedBodyHeightMm: bodyReferenceV2ScaleCalibration.expectedBodyHeightMm,
      referenceBandHeightPx,
      canonicalBodyHeightMm: approvedCanonicalDimensionCalibration?.bodyHeightMm,
      bodyTopFromOverallMm,
      bodyBottomFromOverallMm,
      diameterAuthority:
        lookupDimensionAuthoritySummary.readyForLookupScale
          ? "lookup-diameter"
          : "manual-diameter",
      radialScaleSource: "diameterMm",
      yScaleSource: "template body top/bottom",
      sourceFunction: "TemplateCreateForm.bodyHeightAuthorityInput",
    };
  }, [
    activeBodyReferenceSvgQuality.bounds?.height,
    activeLookupDimensions,
    approvedCanonicalDimensionCalibration?.bodyHeightMm,
    approvedCanonicalDimensionCalibration?.printableSurfaceContract?.printableHeightMm,
    bodyReferenceV2ScaleCalibration.expectedBodyHeightMm,
    bottomMarginMm,
    lookupDimensionAuthoritySummary.bodyHeightMm,
    lookupDimensionAuthoritySummary.fullProductHeightMm,
    lookupDimensionAuthoritySummary.readyForLookupScale,
    lookupResult?.fitDebug?.referenceBandBottomPx,
    lookupResult?.fitDebug?.referenceBandTopPx,
    overallHeightMm,
    printHeightMm,
    topMarginMm,
  ]);
  const currentReviewedBodyReferenceSourcePayload = React.useMemo(() => {
    if (
      !canGenerateReviewedBodyReferenceGlb ||
      !approvedBodyOutline ||
      !approvedCanonicalBodyProfile ||
      !approvedCanonicalDimensionCalibration
    ) {
      return null;
    }
    return buildBodyReferenceGlbSourcePayload({
      bodyOutline: approvedBodyOutline,
      canonicalBodyProfile: approvedCanonicalBodyProfile,
      canonicalDimensionCalibration: approvedCanonicalDimensionCalibration,
    });
  }, [
    approvedBodyOutline,
    approvedCanonicalBodyProfile,
    approvedCanonicalDimensionCalibration,
    canGenerateReviewedBodyReferenceGlb,
  ]);
  const currentReviewedBodyReferenceSourceSignature = React.useMemo(
    () => (
      currentReviewedBodyReferenceSourcePayload
        ? stableStringifyForHash(currentReviewedBodyReferenceSourcePayload)
        : null
    ),
    [currentReviewedBodyReferenceSourcePayload],
  );
  React.useEffect(() => {
    let cancelled = false;
    if (!currentReviewedBodyReferenceSourcePayload) {
      setCurrentReviewedBodyReferenceSourceHash(null);
      return () => {
        cancelled = true;
      };
    }
    void hashJsonSha256(currentReviewedBodyReferenceSourcePayload)
      .then((hash) => {
        if (!cancelled) {
          setCurrentReviewedBodyReferenceSourceHash(hash);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCurrentReviewedBodyReferenceSourceHash(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentReviewedBodyReferenceSourcePayload]);
  const activeBodyReferenceDraftSourcePayload = React.useMemo(() => {
    if (
      !canGenerateReviewedBodyReferenceGlb ||
      !activeBodyReferenceFineTuneOutline ||
      !approvedCanonicalBodyProfile ||
      !approvedCanonicalDimensionCalibration
    ) {
      return null;
    }
    return buildBodyReferenceGlbSourcePayload({
      bodyOutline: activeBodyReferenceFineTuneOutline,
      canonicalBodyProfile: approvedCanonicalBodyProfile,
      canonicalDimensionCalibration: approvedCanonicalDimensionCalibration,
    });
  }, [
    activeBodyReferenceFineTuneOutline,
    approvedCanonicalBodyProfile,
    approvedCanonicalDimensionCalibration,
    canGenerateReviewedBodyReferenceGlb,
  ]);
  const activeBodyReferenceDraftSourceSignature = React.useMemo(
    () => (
      activeBodyReferenceDraftSourcePayload
        ? stableStringifyForHash(activeBodyReferenceDraftSourcePayload)
        : null
    ),
    [activeBodyReferenceDraftSourcePayload],
  );
  const reviewedBodyReferenceGlbSourceHash =
    loadedBodyGeometryContract?.glb.sourceHash
    ?? generatedReviewedBodyGeometryContract?.glb.sourceHash
    ?? null;
  const bodyReferenceGuideFrame = React.useMemo(
    () => resolveBodyReferenceGuideFrame({
      acceptedBodyReferenceOutline: approvedBodyOutline,
      acceptedSourceHash: currentReviewedBodyReferenceSourceHash,
      generatedSourceHash: reviewedBodyReferenceGlbSourceHash,
      fitDebug: lookupResult?.fitDebug ?? null,
    }),
    [
      approvedBodyOutline,
      currentReviewedBodyReferenceSourceHash,
      lookupResult?.fitDebug,
      reviewedBodyReferenceGlbSourceHash,
    ],
  );
  const reviewedBodyReferenceGlbFreshness = React.useMemo(
    () => resolveFineTuneGlbReviewState({
      canGenerate: canGenerateReviewedBodyReferenceGlb,
      hasGeneratedArtifact: activeDrinkwareGlbStatus === "generated-reviewed-model",
      currentSourceSignature: currentReviewedBodyReferenceSourceSignature,
      generatedSourceSignature: reviewedBodyCutoutQaGeneratedSourceSignature,
      hasPendingSourceDraft: bodyReferenceFineTuneDraftPendingAcceptance,
    }),
    [
      activeDrinkwareGlbStatus,
      bodyReferenceFineTuneDraftPendingAcceptance,
      canGenerateReviewedBodyReferenceGlb,
      currentReviewedBodyReferenceSourceSignature,
      reviewedBodyCutoutQaGeneratedSourceSignature,
    ],
  );
  const bodyCutoutQaGlbLifecycle = React.useMemo(
    () => getTemplateBodyCutoutQaGlbLifecycle({
      hasAcceptedBodyReference: hasAcceptedBodyReferenceReview,
      hasReviewedGlb: hasReviewedBodyCutoutQaGlb,
      hasPendingSourceDraft: bodyReferenceFineTuneDraftPendingAcceptance,
      freshnessStatus: reviewedBodyReferenceGlbFreshness.status,
      glbFreshRelativeToSource: loadedBodyGeometryContract?.glb.freshRelativeToSource ?? null,
      runtimeInspectionStatus: loadedBodyGeometryContract?.runtimeInspection?.status ?? null,
      validationStatus: loadedBodyGeometryContract?.validation.status ?? null,
    }),
    [
      bodyReferenceFineTuneDraftPendingAcceptance,
      hasAcceptedBodyReferenceReview,
      hasReviewedBodyCutoutQaGlb,
      loadedBodyGeometryContract?.glb.freshRelativeToSource,
      loadedBodyGeometryContract?.runtimeInspection?.status,
      loadedBodyGeometryContract?.validation.status,
      reviewedBodyReferenceGlbFreshness.status,
    ],
  );
  const qaStageLabel = bodyCutoutQaGlbLifecycle.label.replace(/^BODY CUTOUT QA GLB:\s*/, "");
  const operatorNextActionHint =
    hasAcceptedBodyReferenceReview && bodyCutoutQaGlbLifecycle.nextActionLabel
      ? bodyCutoutQaGlbLifecycle.nextActionLabel
      : workflowNextActionHint;
  const bodyReferenceFineTuneLifecycle = React.useMemo(
    () => summarizeBodyReferenceFineTuneLifecycle({
      hasAcceptedCutout: hasAcceptedBodyReferenceReview && Boolean(approvedBodyOutline),
      isDraftDirty: bodyReferenceFineTuneDraftPendingAcceptance,
      hasAcceptedCorrectedCutout:
        reviewedBodyReferenceGlbFreshness.status === "stale" &&
        reviewedBodyReferenceGlbFreshness.hasGeneratedArtifact,
      hasReviewedGlb: reviewedBodyReferenceGlbFreshness.hasGeneratedArtifact,
      acceptedSourceHash: currentReviewedBodyReferenceSourceHash,
      reviewedGlbSourceHash: reviewedBodyReferenceGlbSourceHash,
      reviewedGlbFreshRelativeToSource:
        reviewedBodyReferenceGlbFreshness.status === "current"
          ? true
          : reviewedBodyReferenceGlbFreshness.status === "stale"
            ? false
            : null,
    }),
    [
      approvedBodyOutline,
      bodyReferenceFineTuneDraftPendingAcceptance,
      currentReviewedBodyReferenceSourceHash,
      hasAcceptedBodyReferenceReview,
      reviewedBodyReferenceGlbFreshness.hasGeneratedArtifact,
      reviewedBodyReferenceGlbFreshness.status,
      reviewedBodyReferenceGlbSourceHash,
    ],
  );
  const bodyReferenceFineTuneStatusLabel = bodyReferenceFineTuneLifecycle.label;
  const activeBodyReferenceSvgQualityOperatorSummary = React.useMemo(
    () => summarizeBodyReferenceSvgQualityForOperator(activeBodyReferenceSvgQuality, {
      hasAcceptedCutout: hasAcceptedBodyReferenceReview && Boolean(approvedBodyOutline),
    }),
    [activeBodyReferenceSvgQuality, approvedBodyOutline, hasAcceptedBodyReferenceReview],
  );
  const bodyReferenceSvgCutoutLineage = React.useMemo(
    () => summarizeBodyReferenceSvgCutoutLineage({
      hasAcceptedCutout: hasAcceptedBodyReferenceReview && Boolean(approvedBodyOutline),
      hasReviewedGlb: reviewedBodyReferenceGlbFreshness.hasGeneratedArtifact,
      acceptedSourceHash: currentReviewedBodyReferenceSourceHash,
      correctedDraftSourceHash: bodyReferenceFineTuneDraftPendingAcceptance
        ? activeBodyReferenceDraftSourceSignature
        : null,
      reviewedGlbSourceHash: reviewedBodyReferenceGlbSourceHash,
      svgQualityStatus: activeBodyReferenceSvgQuality.status,
    }),
    [
      activeBodyReferenceDraftSourceSignature,
      activeBodyReferenceSvgQuality.status,
      approvedBodyOutline,
      bodyReferenceFineTuneDraftPendingAcceptance,
      currentReviewedBodyReferenceSourceHash,
      hasAcceptedBodyReferenceReview,
      reviewedBodyReferenceGlbFreshness.hasGeneratedArtifact,
      reviewedBodyReferenceGlbSourceHash,
    ],
  );
  const bodyReferenceSvgCutoutLineageOperatorSummary = React.useMemo(
    () => summarizeBodyReferenceSvgCutoutLineageForOperator(bodyReferenceSvgCutoutLineage),
    [bodyReferenceSvgCutoutLineage],
  );
  const bodyReferenceFineTuneVisualWarnings = React.useMemo(() => {
    const warnings: Array<{ level: "warn" | "error"; message: string }> = [];
    if (hasAcceptedBodyReferenceReview && activeBodyReferenceSvgQuality.status === "fail") {
      warnings.push({
        level: "error",
        message:
          activeBodyReferenceSvgQualityOperatorSummary.generationBlockedReason ??
          "Draft contour fails SVG quality and should be corrected before regeneration.",
      });
    }
    if (
      hasAcceptedBodyReferenceReview &&
      activeBodyReferenceSvgQualityOperatorSummary.generationBlocked &&
      activeBodyReferenceSvgQualityOperatorSummary.operatorFixHint
    ) {
      warnings.push({
        level: "error",
        message: activeBodyReferenceSvgQualityOperatorSummary.operatorFixHint,
      });
    }
    if (draftBodyReferencePointCount < 3) {
      warnings.push({
        level: "error",
        message: "Draft contour has too few points to remain usable.",
      });
    }
    if (
      !draftBodyReferenceOutlineBounds ||
      draftBodyReferenceOutlineBounds.width <= 0 ||
      draftBodyReferenceOutlineBounds.height <= 0
    ) {
      warnings.push({
        level: "error",
        message: "Draft contour bounds are invalid.",
      });
    }
    if (activeBodyReferenceSvgQuality.suspiciousJumpCount > 0) {
      warnings.push({
        level: "warn",
        message: `Draft contour contains ${activeBodyReferenceSvgQuality.suspiciousJumpCount} suspicious jump segment(s).`,
      });
    }
    if (
      bodyReferenceFineTuneDraftPendingAcceptance &&
      activeBodyReferenceDraftSourceSignature &&
      currentReviewedBodyReferenceSourceSignature &&
      activeBodyReferenceDraftSourceSignature !== currentReviewedBodyReferenceSourceSignature
    ) {
      warnings.push({
        level: "warn",
        message: "Draft contour changes the BODY REFERENCE source hash but remains non-authoritative until accepted.",
      });
    }
    if (
      reviewedBodyReferenceGlbFreshness.status === "stale" &&
      reviewedBodyReferenceGlbFreshness.hasGeneratedArtifact
    ) {
      warnings.push({
        level: "warn",
        message: "Accepted cutout is newer than the reviewed GLB. Regenerate BODY CUTOUT QA before saving or exporting.",
      });
    }
    return warnings;
  }, [
    activeBodyReferenceDraftSourceSignature,
    activeBodyReferenceSvgQuality,
    activeBodyReferenceSvgQualityOperatorSummary,
    bodyReferenceFineTuneDraftPendingAcceptance,
    currentReviewedBodyReferenceSourceSignature,
    draftBodyReferenceOutlineBounds,
    draftBodyReferencePointCount,
    hasAcceptedBodyReferenceReview,
    reviewedBodyReferenceGlbFreshness.hasGeneratedArtifact,
    reviewedBodyReferenceGlbFreshness.status,
  ]);
  const sourceTruthSummary = React.useMemo(() => {
    const staleReasons: string[] = [];
    if (approvedBodyReferenceWarnings.length > 0) {
      staleReasons.push(...approvedBodyReferenceWarnings.slice(0, 2));
    }
    if (bodyReferenceFineTuneDraftPendingAcceptance) {
      staleReasons.push("Corrected cutout draft is pending acceptance and is not authoritative yet.");
    }
    if (
      reviewedBodyReferenceGlbFreshness.status === "stale" &&
      reviewedBodyReferenceGlbFreshness.hasGeneratedArtifact
    ) {
      staleReasons.push("Accepted cutout is newer than the reviewed GLB. Regenerate BODY CUTOUT QA.");
    }
    if (loadedBodyGeometryContract?.validation.status === "fail") {
      staleReasons.push("Runtime BODY CUTOUT QA validation is failing.");
    }

    let runtimeQaLabel = "pending";
    if (loadedBodyGeometryContract) {
      runtimeQaLabel = `${loadedBodyGeometryContract.validation.status} / ${
        loadedBodyGeometryContract.runtimeInspection?.status ?? "pending"
      }`;
    } else if (generatedReviewedBodyGeometryContract) {
      runtimeQaLabel = "generated, runtime pending";
    }

    let authoritativeStageLabel = "source context";
    if (hasReviewedBodyCutoutQaGlb && loadedBodyGeometryContract?.glb.freshRelativeToSource) {
      authoritativeStageLabel = "reviewed QA GLB";
    } else if (bodyReferenceFineTuneDraftPendingAcceptance) {
      authoritativeStageLabel = "accepted BODY REFERENCE + draft pending";
    } else if (hasAcceptedBodyReferenceReview) {
      authoritativeStageLabel = "accepted BODY REFERENCE";
    } else if (templateCreateSourceReadiness.detectReady) {
      authoritativeStageLabel = "staged detection";
    }

    return {
      activeSourceOfTruth: authoritativeStageLabel,
      acceptedBodyReferenceLabel: hasAcceptedBodyReferenceReview ? "accepted" : "pending",
      approvedSvgShortHash: formatShortHash(currentReviewedBodyReferenceSourceHash),
      sourceProvenanceLabel: formatBodyReferenceOutlineSourceLabel(approvedBodyOutline),
      svgQualityLabel: activeBodyReferenceSvgQualityOperatorSummary.statusLabel,
      bodyOnlyConfidenceLabel: activeBodyReferenceSvgQualityOperatorSummary.bodyOnlyConfidenceLabel,
      correctedDraftLabel: bodyReferenceSvgCutoutLineageOperatorSummary.correctedDraftLabel,
      reviewedGlbFreshnessLabel: bodyCutoutQaGlbLifecycle.label.replace(/^BODY CUTOUT QA GLB:\s*/, ""),
      runtimeQaLabel,
      authoritativeStageLabel,
      staleReasons,
    };
  }, [
    activeBodyReferenceSvgQualityOperatorSummary.bodyOnlyConfidenceLabel,
    activeBodyReferenceSvgQualityOperatorSummary.statusLabel,
    approvedBodyOutline,
    approvedBodyReferenceWarnings,
    bodyCutoutQaGlbLifecycle.label,
    bodyReferenceFineTuneDraftPendingAcceptance,
    bodyReferenceSvgCutoutLineageOperatorSummary.correctedDraftLabel,
    currentReviewedBodyReferenceSourceHash,
    generatedReviewedBodyGeometryContract,
    hasAcceptedBodyReferenceReview,
    hasReviewedBodyCutoutQaGlb,
    loadedBodyGeometryContract,
    reviewedBodyReferenceGlbFreshness.hasGeneratedArtifact,
    reviewedBodyReferenceGlbFreshness.status,
    templateCreateSourceReadiness.detectReady,
  ]);

  const clearReviewedBodyReferenceGeneratedState = React.useCallback(() => {
    setGeneratedReviewedBodyGeometryContract(null);
    setLoadedBodyGeometryContract(null);
    setReviewedBodyCutoutQaGeneratedSourceSignature(null);
    setReviewedGeneratedModelState(null);
  }, []);

  const handleStartBodyReferenceFineTune = React.useCallback(() => {
    if (productType === "flat" || !approvedBodyOutline) return;
    setBodyReferenceFineTuneModeEnabled(true);
    setBodyReferenceFineTuneDraftOutline(cloneOutline(approvedBodyOutline));
    setBodyReferenceFineTuneUndoStack([]);
    const detectedBaseline =
      liveBodyReferencePipeline?.outline?.sourceContourMode === "body-only"
        ? cloneEditableBodyOutline(liveBodyReferencePipeline.outline) ?? null
        : (approvedBodyOutline.sourceContourMode === "body-only"
          ? cloneEditableBodyOutline(approvedBodyOutline) ?? null
          : null);
    setBodyReferenceFineTuneDetectedBaselineOutline(detectedBaseline);
  }, [approvedBodyOutline, liveBodyReferencePipeline?.outline, productType]);

  const handleResetFineTuneDraftToApproved = React.useCallback(() => {
    if (!approvedBodyOutline) return;
    setBodyReferenceFineTuneDraftOutline(cloneOutline(approvedBodyOutline));
    setBodyReferenceFineTuneUndoStack([]);
  }, [approvedBodyOutline]);

  const handleResetFineTuneDraftToDetected = React.useCallback(() => {
    if (!bodyReferenceFineTuneDetectedBaselineOutline) return;
    setBodyReferenceFineTuneDraftOutline(cloneOutline(bodyReferenceFineTuneDetectedBaselineOutline));
    setBodyReferenceFineTuneUndoStack([]);
  }, [bodyReferenceFineTuneDetectedBaselineOutline]);

  const handleBodyReferenceFineTuneEditStart = React.useCallback((previousOutline: EditableBodyOutline) => {
    const snapshot = cloneOutline(previousOutline) ?? previousOutline;
    const nextSignature = buildOutlineGeometrySignature(snapshot);
    setBodyReferenceFineTuneUndoStack((current) => {
      const previousSignature = current.length > 0
        ? buildOutlineGeometrySignature(current[current.length - 1]!)
        : null;
      if (previousSignature === nextSignature) {
        return current;
      }
      return [...current.slice(-39), snapshot];
    });
  }, []);

  const handleUndoBodyReferenceFineTuneEdit = React.useCallback(() => {
    setBodyReferenceFineTuneUndoStack((current) => {
      const previousOutline = current[current.length - 1];
      if (previousOutline) {
        setBodyReferenceFineTuneDraftOutline(cloneOutline(previousOutline));
      }
      return current.slice(0, -1);
    });
  }, []);

  const handleDiscardBodyReferenceFineTuneDraft = React.useCallback(() => {
    resetBodyReferenceFineTuneState();
  }, [resetBodyReferenceFineTuneState]);

  const handleAcceptBodyReferenceFineTuneDraft = React.useCallback(() => {
    if (!activeBodyReferenceFineTuneOutline || !bodyReferenceFineTuneDraftHasChanges) return;
    const rebuiltSnapshot = rebuildAcceptedBodyReferenceSnapshot({
      acceptedOutline: activeBodyReferenceFineTuneOutline,
      overallHeightMm,
      topMarginMm,
      bottomMarginMm,
      diameterMm,
      baseDiameterMm:
        resolvedMatchedProfile?.bottomDiameterMm ??
        resolvedMatchedProfile?.outsideDiameterMm ??
        diameterMm,
      handleArcDeg,
      fitDebug: lookupResult?.fitDebug ?? null,
    });
    if (!rebuiltSnapshot) return;
    setApprovedBodyOutline(cloneSerializable(rebuiltSnapshot.approvedBodyOutline));
    setApprovedCanonicalBodyProfile(
      rebuiltSnapshot.approvedCanonicalBodyProfile
        ? cloneSerializable(rebuiltSnapshot.approvedCanonicalBodyProfile)
        : null,
    );
    setApprovedCanonicalDimensionCalibration(
      rebuiltSnapshot.approvedCanonicalDimensionCalibration
        ? cloneSerializable(rebuiltSnapshot.approvedCanonicalDimensionCalibration)
        : null,
    );
    setApprovedBodyReferenceQa(
      rebuiltSnapshot.approvedBodyReferenceQa
        ? cloneSerializable(rebuiltSnapshot.approvedBodyReferenceQa)
        : null,
    );
    setApprovedBodyReferenceWarnings([...rebuiltSnapshot.approvedBodyReferenceWarnings]);
    setOverallHeightMm(resolveAcceptedBodyReferenceOverallHeightMm({
      canonicalTotalHeightMm: rebuiltSnapshot.approvedCanonicalDimensionCalibration?.totalHeightMm,
      lookupFullProductHeightMm: lookupResult?.dimensions?.fullProductHeightMm,
      currentOverallHeightMm: overallHeightMm,
    }));
    setTopMarginMm(rebuiltSnapshot.nextTopMarginMm);
    setBottomMarginMm(rebuiltSnapshot.nextBottomMarginMm);
    setPrintHeightMm(rebuiltSnapshot.nextPrintHeightMm);
    setDiameterMm(rebuiltSnapshot.nextDiameterMm);
    clearReviewedBodyReferenceGeneratedState();
    setPrintableTopOverrideMm(null);
    setPrintableBottomOverrideMm(null);
    setPreviewModelMode("alignment-model");
    setHasAcceptedBodyReferenceReview(true);
    resetBodyReferenceFineTuneState();
  }, [
    activeBodyReferenceFineTuneOutline,
    bodyReferenceFineTuneDraftHasChanges,
    bottomMarginMm,
    clearReviewedBodyReferenceGeneratedState,
    diameterMm,
    handleArcDeg,
    lookupResult?.dimensions?.fullProductHeightMm,
    lookupResult?.fitDebug,
    overallHeightMm,
    resetBodyReferenceFineTuneState,
    resolvedMatchedProfile?.bottomDiameterMm,
    resolvedMatchedProfile?.outsideDiameterMm,
    topMarginMm,
  ]);

  const handleSeedBodyReferenceV2Centerline = React.useCallback(() => {
    const seededCenterline = seedCenterlineFromApprovedBodyOutline(approvedBodyOutline);
    if (!seededCenterline) return;
    setBodyReferenceV2DraftCapture((currentDraft) => setCenterlineAxis(currentDraft, seededCenterline));
  }, [approvedBodyOutline]);

  const handleSeedBodyReferenceV2BodyLeft = React.useCallback(() => {
    const seededBodyLeft = seedBodyLeftOutlineFromApprovedBodyOutline(approvedBodyOutline);
    if (seededBodyLeft.length < 2) return;
    setBodyReferenceV2DraftCapture((currentDraft) => setBodyLeftOutline(currentDraft, seededBodyLeft));
  }, [approvedBodyOutline]);

  const handleChangeBodyReferenceV2CenterlineX = React.useCallback((nextX: number) => {
    if (!Number.isFinite(nextX)) return;
    setBodyReferenceV2DraftCapture((currentDraft) => {
      if (!currentDraft.centerline) {
        return currentDraft;
      }
      return setCenterlineAxis(currentDraft, {
        ...currentDraft.centerline,
        xPx: nextX,
        source: "operator",
      });
    });
  }, []);

  const handleAcceptBodyReferenceV2Draft = React.useCallback(() => {
    const acceptedDraft = acceptBodyReferenceV2Draft(bodyReferenceV2Draft);
    setBodyReferenceV2DraftCapture(acceptedDraft);
    setAcceptedBodyReferenceV2DraftSnapshot(acceptedDraft);
  }, [bodyReferenceV2Draft]);

  const handleResetBodyReferenceV2Draft = React.useCallback(() => {
    setBodyReferenceV2DraftCapture(resetBodyReferenceV2Draft({
      sourceImageUrl: productPhotoFullUrl || undefined,
      scaleCalibration: bodyReferenceV2ScaleCalibration,
      acceptedDraft: acceptedBodyReferenceV2DraftSnapshot,
    }));
  }, [
    acceptedBodyReferenceV2DraftSnapshot,
    bodyReferenceV2ScaleCalibration,
    productPhotoFullUrl,
  ]);

  const handleGenerateReviewedBodyReferenceGlb = React.useCallback(async (
    generationSourceMode: "v1-approved-contour" | "v2-mirrored-profile" = "v1-approved-contour",
  ) => {
    const requestingV2 = generationSourceMode === "v2-mirrored-profile";
    if (productType === "flat") {
      return;
    }
    if (
      requestingV2
        ? !bodyReferenceV2CaptureReadiness.generationReady || !acceptedBodyReferenceV2Draft
        : (
          !approvedBodyOutline ||
          !approvedCanonicalBodyProfile ||
          !approvedCanonicalDimensionCalibration
        )
    ) {
      return;
    }
    setGeneratingReviewedBodyReferenceGlb(true);
    setGlbUploadError(null);

    try {
      const response = await fetch("/api/admin/tumbler/generate-body-reference-glb", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          templateName: name.trim() || null,
          renderMode: "body-cutout-qa",
          matchedProfileId: resolvedMatchedProfileId ?? null,
          generationSourceMode,
          bodyHeightAuthorityInput,
          ...(requestingV2
            ? {
                bodyReferenceV2Draft: acceptedBodyReferenceV2Draft,
              }
            : {
                bodyOutline: approvedBodyOutline,
                bodyOutlineSourceMode: approvedBodyOutline?.sourceContourMode ?? null,
                canonicalBodyProfile: approvedCanonicalBodyProfile,
                canonicalDimensionCalibration: approvedCanonicalDimensionCalibration,
              }),
          bodyColorHex: bodyColorHex || null,
          rimColorHex: rimColorHex || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "Failed to generate the reviewed BODY REFERENCE GLB.",
        );
      }

      const generated = parseBodyReferenceGlbResponse(payload);
      if (!generated) {
        throw new Error("Reviewed BODY REFERENCE GLB response could not be parsed.");
      }

      setGlbPath(generated.glbPath);
      setGlbFileName(generated.glbPath.split("/").pop() ?? null);
      setPreviewModelMode("body-cutout-qa");
      setGeneratedReviewedBodyGeometryContract(generated.bodyGeometryContract ?? null);
      setLoadedBodyGeometryContract(null);
      setReviewedBodyCutoutQaGeneratedSourceSignature(generated.generatedSourceSignature ?? null);
      setReviewedGeneratedModelState({
        glbPath: generated.glbPath,
        status: "generated-reviewed-model",
        sourceLabel:
          generated.modelSourceLabel
          ?? (requestingV2
            ? "Generated from BODY REFERENCE v2 mirrored profile"
            : "Generated from accepted BODY REFERENCE cutout"),
      });
    } catch (error) {
      setGlbUploadError(
        error instanceof Error
          ? error.message
          : "Failed to generate the reviewed BODY REFERENCE GLB.",
      );
    } finally {
      setGeneratingReviewedBodyReferenceGlb(false);
    }
  }, [
    approvedBodyOutline,
    acceptedBodyReferenceV2Draft,
    approvedCanonicalBodyProfile,
    approvedCanonicalDimensionCalibration,
    bodyColorHex,
    bodyHeightAuthorityInput,
    bodyReferenceV2CaptureReadiness.generationReady,
    name,
    productType,
    resolvedMatchedProfileId,
    rimColorHex,
  ]);

  const handleSave = async () => {
    const errs: string[] = [];
    if (!name.trim()) errs.push("Product name is required.");
    if (productType !== "flat" && diameterMm <= 0) errs.push("Diameter must be > 0 for non-flat products.");
    if (printHeightMm <= 0) errs.push("Print height must be > 0.");
    if (glbPath.trim()) {
      const glbOk = await verifyCurrentGlbPath({ clearOnMissing: false });
      if (!glbOk) errs.push("3D model path is missing or invalid.");
    }
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }
    setErrors([]);

    const now = new Date().toISOString();
    const printableSurfaceResolutionForSave = liveBodyReferencePipeline?.printableSurfaceResolution ?? null;
    const printableSurfaceContractForSave =
      productAppearanceSurfaceAuthority?.printableSurfaceContract ??
      printableSurfaceResolutionForSave?.printableSurfaceContract ??
      approvedCanonicalDimensionCalibration?.printableSurfaceContract ??
      editingTemplate?.dimensions.printableSurfaceContract ??
      undefined;
    const axialSurfaceBandsForSave =
      printableSurfaceResolutionForSave?.axialSurfaceBands ??
      approvedCanonicalDimensionCalibration?.axialSurfaceBands ??
      editingTemplate?.dimensions.axialSurfaceBands ??
      undefined;
    const canonicalDimensionCalibrationForSave =
      approvedCanonicalDimensionCalibration
        ? {
            ...approvedCanonicalDimensionCalibration,
            axialSurfaceBands: axialSurfaceBandsForSave,
            printableSurfaceContract: printableSurfaceContractForSave,
          }
        : undefined;
    const effectivePrintHeightMm = productAppearanceSurfaceAuthority
      ? productAppearanceSurfaceAuthority.engravableSurface.printableHeightMm
      : engravableGuideAuthority
      ? round2(Math.max(0, engravableGuideAuthority.bottomGuideMm - engravableGuideAuthority.topGuideMm))
      : printHeightMm;
    const silverBandBottomForSave = productAppearanceSurfaceAuthority?.silverBandLayer
      ? round2(
          (productAppearanceSurfaceAuthority.silverBandLayer.yMm ?? 0) +
          (productAppearanceSurfaceAuthority.silverBandLayer.heightMm ?? 0),
        )
      : detectedLowerSilverSeamMm;
    const template: ProductTemplate = {
      id: editingTemplate?.id ?? crypto.randomUUID(),
      name: name.trim(),
      brand: brand.trim(),
      capacity: capacity.trim(),
      laserType,
      productType,
      thumbnailDataUrl: thumbDataUrl || DEFAULT_TEMPLATE_THUMBNAIL_DATA_URL,
      productPhotoFullUrl: productPhotoFullUrl || undefined,
      glbPath,
      glbStatus: activeDrinkwareGlbStatus ?? undefined,
      glbSourceLabel: activeDrinkwareGlbSourceLabel ?? undefined,
      dimensions: {
        diameterMm,
        printHeightMm: effectivePrintHeightMm,
        templateWidthMm,
        handleArcDeg,
        taperCorrection,
        overallHeightMm: overallHeightMm > 0 ? overallHeightMm : undefined,
        bodyTopFromOverallMm: bodyReferenceFrameBounds?.bodyTopFromOverallMm,
        bodyBottomFromOverallMm: bodyReferenceFrameBounds?.bodyBottomFromOverallMm,
        lidSeamFromOverallMm:
          typeof savedLidSeamFromOverallMm === "number" && Number.isFinite(savedLidSeamFromOverallMm)
            ? savedLidSeamFromOverallMm
            : undefined,
        silverBandBottomFromOverallMm:
          typeof silverBandBottomForSave === "number" && Number.isFinite(silverBandBottomForSave)
            ? silverBandBottomForSave
            : undefined,
        printableTopOverrideMm:
          typeof printableTopOverrideMm === "number" && Number.isFinite(printableTopOverrideMm)
            ? printableTopOverrideMm
            : undefined,
        printableBottomOverrideMm:
          typeof printableBottomOverrideMm === "number" && Number.isFinite(printableBottomOverrideMm)
            ? printableBottomOverrideMm
            : undefined,
        topMarginMm: Number.isFinite(topMarginMm) ? topMarginMm : undefined,
        bottomMarginMm: Number.isFinite(bottomMarginMm) ? bottomMarginMm : undefined,
        referencePhotoScalePct: Number.isFinite(referencePhotoScalePct) ? referencePhotoScalePct : undefined,
        referencePhotoOffsetYPct: Number.isFinite(referencePhotoOffsetYPct) ? referencePhotoOffsetYPct : undefined,
        referencePhotoAnchorY,
        bodyColorHex: bodyColorHex || undefined,
        rimColorHex: rimColorHex || undefined,
        canonicalBodyProfile: approvedCanonicalBodyProfile ?? undefined,
        canonicalDimensionCalibration: canonicalDimensionCalibrationForSave,
        bodyReferenceQA: approvedBodyReferenceQa ?? undefined,
        bodyReferenceWarnings: approvedBodyReferenceWarnings.length > 0 ? approvedBodyReferenceWarnings : undefined,
        bodyReferenceContractVersion:
          approvedCanonicalBodyProfile && approvedCanonicalDimensionCalibration
            ? BODY_REFERENCE_CONTRACT_VERSION
            : undefined,
        bodyOutlineProfile: approvedBodyOutline ?? undefined,
        axialSurfaceBands: axialSurfaceBandsForSave,
        printableSurfaceContract: printableSurfaceContractForSave,
      },
      laserSettings: {
        power,
        speed,
        frequency,
        lineInterval,
        materialProfileId,
        rotaryPresetId,
      },
      appearanceReferenceLayers:
        templateAppearanceReferenceLayers.length > 0
          ? templateAppearanceReferenceLayers
          : undefined,
      artworkPlacements: persistedArtworkPlacements,
      engravingPreviewState: {
        ...persistedTemplateEngravingPreviewState,
        mappingSignature:
          templateArtworkPlacementMappingSignature
          ?? persistedTemplateEngravingPreviewState.mappingSignature,
      },
      lookupDimensions: lookupDimensionsSnapshot ?? undefined,
      acceptedBodyReferenceV2Draft: acceptedBodyReferenceV2Draft ?? undefined,
      createdAt: editingTemplate?.createdAt ?? now,
      updatedAt: now,
      builtIn: editingTemplate?.builtIn ?? false,
      tumblerMapping,
      frontPhotoDataUrl: frontPhotoDataUrl || undefined,
      backPhotoDataUrl: backPhotoDataUrl || undefined,
    };

    if (isEdit) {
      updateTemplate(template.id, template);
    } else {
      saveTemplate(template);
    }
    onSave(template);
  };

  return (
    <div
      className={`${styles.form} ${surfaceMode === "page" ? styles.formPage : ""}`}
      data-testid="template-create-form"
      data-template-create-surface-mode={surfaceMode}
    >
      {inDedicatedTemplateMode && (
        <section className={styles.modeWorkflowOverview}>
          <div className={styles.modeWorkflowHeader}>
            <div>
              <div className={styles.modeWorkflowEyebrow}>Template workflow</div>
              <div className={styles.modeWorkflowTitle}>{templateModeWorkflowHeading}</div>
              <div className={styles.modeWorkflowHint}>
                Keep product setup first, then move through review and proof in order without mixing BODY CUTOUT QA and WRAP / EXPORT.
              </div>
            </div>
            <div className={styles.modeWorkflowHeaderMeta}>
              <span className={styles.modeWorkflowCurrent}>Current step: {workflowCurrentStepDisplayLabel}</span>
              <span
                className={
                  templateCreateSourceReadiness.sourceReady
                    ? styles.workflowReadinessReady
                    : styles.workflowReadinessPending
                }
              >
                {templateCreateSourceReadiness.sourceReady ? "Source ready" : "Source pending"}
              </span>
              <span
                className={
                  templateCreateSourceReadiness.detectReady
                    ? styles.workflowReadinessReady
                    : styles.workflowReadinessPending
                }
              >
                {templateCreateSourceReadiness.detectReady ? "Detect actionable" : "Detect blocked"}
              </span>
            </div>
          </div>
          <div className={styles.modeWorkflowStepGrid}>
            {workflowSteps.map((step) => (
              <div
                key={`mode-workflow-${step.step}`}
                className={[
                  styles.modeWorkflowStepCard,
                  step.status === "ready"
                    ? styles.workflowStepReady
                    : step.status === "action"
                      ? styles.workflowStepAction
                      : styles.workflowStepReview,
                  workflowCurrentStep === step.step ? styles.workflowStepCurrent : "",
                ].join(" ")}
              >
                <div className={styles.modeWorkflowStepHeader}>
                  <span className={styles.modeWorkflowStepNumber}>
                    {step.label.split(".")[0]}
                  </span>
                  <span className={styles.modeWorkflowStepLabel}>{step.label.replace(/^\d+\.\s*/, "")}</span>
                </div>
                <div className={styles.modeWorkflowStepMeta}>
                  {getTemplateCreateWorkflowStatusLabel(step.status)}
                </div>
                <div className={styles.modeWorkflowStepDetail}>
                  {workflowCurrentStep === step.step ? step.detail : `${getTemplateCreateWorkflowStatusLabel(step.status)} stage`}
                </div>
              </div>
            ))}
          </div>
          <div className={styles.modeWorkflowFooter}>
            <div className={styles.modeWorkflowNextAction}>Next action: {workflowNextActionHint}</div>
            {!templateCreateSourceReadiness.detectReady && templateCreateSourceReadiness.blockedReason && (
              <div className={styles.workflowBlockedNote}>
                {templateCreateSourceReadiness.blockedReason}
              </div>
            )}
          </div>
        </section>
      )}

      {inDedicatedTemplateMode && (
        <div className={styles.sourceTruthCard} data-template-pipeline-summary="present">
          <div className={styles.sourceTruthHeader}>
            <div>
              <div className={styles.sourceTruthEyebrow}>Active source of truth</div>
              <div className={styles.sourceTruthTitle}>
                {sourceTruthSummary.activeSourceOfTruth}
              </div>
            </div>
          </div>

          <div className={styles.sourceTruthGrid}>
            <div className={styles.sourceTruthMetric}>
              <span>Accepted BODY REFERENCE</span>
              <strong>{sourceTruthSummary.acceptedBodyReferenceLabel}</strong>
            </div>
            <div className={styles.sourceTruthMetric}>
              <span>Approved SVG hash</span>
              <strong>{sourceTruthSummary.approvedSvgShortHash}</strong>
            </div>
            <div className={styles.sourceTruthMetric}>
              <span>Contour source</span>
              <strong>{sourceTruthSummary.sourceProvenanceLabel}</strong>
            </div>
            <div className={styles.sourceTruthMetric}>
              <span>SVG cutout quality</span>
              <strong>{sourceTruthSummary.svgQualityLabel}</strong>
            </div>
            <div className={styles.sourceTruthMetric}>
              <span>Body-only confidence</span>
              <strong>{sourceTruthSummary.bodyOnlyConfidenceLabel}</strong>
            </div>
            <div className={styles.sourceTruthMetric}>
              <span>Corrected draft</span>
              <strong>{sourceTruthSummary.correctedDraftLabel}</strong>
            </div>
            <div className={styles.sourceTruthMetric}>
              <span>Reviewed GLB freshness</span>
              <strong>{sourceTruthSummary.reviewedGlbFreshnessLabel}</strong>
            </div>
            <div className={styles.sourceTruthMetric}>
              <span>Runtime QA</span>
              <strong>{sourceTruthSummary.runtimeQaLabel}</strong>
            </div>
            <div className={styles.sourceTruthMetric}>
              <span>Authoritative stage</span>
              <strong>{sourceTruthSummary.authoritativeStageLabel}</strong>
            </div>
          </div>

          {sourceTruthSummary.staleReasons.length > 0 && (
            <div className={styles.sourceTruthWarnings}>
              {sourceTruthSummary.staleReasons.map((reason) => (
                <span key={reason}>{reason}</span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className={inDedicatedTemplateMode ? styles.pageWorkspace : undefined}>
      <div className={inDedicatedTemplateMode ? styles.pageMainColumn : undefined}>

      {/* ── Product identity ──────────────────────────────────────── */}
      <div className={`${styles.section} ${inDedicatedTemplateMode ? styles.pageSection : ""}`}>
        <div className={styles.sectionTitle}>
          {inDedicatedTemplateMode ? "Step 1 · Source details" : "Product identity"}
        </div>
        {inDedicatedTemplateMode && (
          <div className={styles.sectionLead}>
            Set the template name, product type, and base identity first. The downstream detect and review steps depend on this source context.
          </div>
        )}

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Product name *</label>
          <input
            className={styles.textInput}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="YETI Rambler 40oz"
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Brand</label>
          <input
            className={styles.textInput}
            type="text"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="YETI"
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Capacity</label>
          <input
            className={styles.textInput}
            type="text"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            placeholder="40oz"
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Laser type</label>
          <select
            className={styles.selectInput}
            value={laserType}
            onChange={(e) => setLaserType(e.target.value as "fiber" | "co2" | "diode")}
          >
            <option value="fiber">Fiber</option>
            <option value="co2">CO₂</option>
            <option value="diode">Diode</option>
          </select>
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Product type</label>
          <select
            className={styles.selectInput}
            data-testid="template-product-type-select"
            value={productType}
            onChange={(e) => setProductType(e.target.value as "tumbler" | "mug" | "bottle" | "flat")}
          >
            <option value="tumbler">Tumbler</option>
            <option value="mug">Mug</option>
            <option value="bottle">Bottle</option>
            <option value="flat">Flat</option>
          </select>
        </div>
      </div>

      {/* ── Product image + auto-detect ──────────────────────────── */}
      <div className={`${styles.section} ${inDedicatedTemplateMode ? styles.pageSection : ""}`}>
        <div className={styles.sectionTitle}>
          {inDedicatedTemplateMode
            ? isTemplateCreateReviewFlowProductType(productType)
              ? "Step 2 · Source imagery and detect inputs"
              : "Source imagery"
            : "Product image"}
        </div>
        {inDedicatedTemplateMode && (
          <div className={styles.sectionLead}>
            Keep lookup, product imagery, and photo auto-detect together so Source and Detect stay visually upstream from BODY REFERENCE review.
          </div>
        )}

        {productType !== "flat" && (
          <div className={styles.lookupBlock}>
            <div className={styles.lookupHeader}>
              <div>
                <div className={styles.lookupTitle}>Item lookup</div>
                <div className={styles.lookupHint}>
                  Paste a product URL or exact tumbler name. Lookup should resolve the item,
                  assign the best profile, and pull a usable product photo.
                </div>
              </div>
              {activeLookupDimensions && (
                <button
                  type="button"
                  className={styles.lookupResetBtn}
                  onClick={() => {
                    setLookupResult(null);
                    setLookupDimensionsSnapshot(null);
                    setLookupError(null);
                    setLookupInput("");
                    setLookupDebugImageUrl("");
                  }}
                >
                  Clear lookup
                </button>
              )}
            </div>
            <div className={styles.lookupRow}>
              <input
                className={styles.textInput}
                type="text"
                value={lookupInput}
                onChange={(e) => setLookupInput(e.target.value)}
                placeholder="https://www.academy.com/... or Stanley IceFlow 30 oz Classic Flip Straw Tumbler"
              />
              <button
                type="button"
                className={styles.detectBtn}
                onClick={() => void handleItemLookup()}
                disabled={lookingUpItem || !lookupInput.trim()}
                title={lookupActionReason ?? undefined}
                data-testid="template-create-run-lookup"
              >
                {lookingUpItem ? "Looking up..." : "Run lookup"}
              </button>
            </div>
            {lookupActionReason && (
              <div
                className={styles.actionDisabledReason}
                data-testid="template-create-lookup-action-reason"
              >
                Run lookup: {lookupActionReason}
              </div>
            )}

            {activeLookupDimensions && (
              <div className={styles.lookupSummary}>
                <div className={styles.lookupSummaryHeader}>
                  <div className={styles.lookupSummaryTitle}>
                    {lookupResult?.title || activeLookupDimensions.selectedVariantLabel || name || "Resolved item"}
                  </div>
                  <div className={styles.lookupBadgeRow}>
                    <span className={styles.lookupBadgePrimary}>
                      {lookupResult ? getLookupModeLabel(lookupResult.mode) : "Saved lookup"}
                    </span>
                    {activeLookupSourceLabel && (
                      <span className={styles.lookupBadgeMuted}>
                        {activeLookupSourceLabel}
                      </span>
                    )}
                    {lookupResult?.imageUrl && productImageLabel && thumbDataUrl && (
                      <span className={styles.lookupBadgeMuted}>Photo applied</span>
                    )}
                  </div>
                </div>
                <div className={styles.lookupSummaryLine}>
                  {[
                    lookupResult?.brand ?? brand,
                    lookupDimensionAuthoritySummary.selectedSizeOz
                      ? `${lookupDimensionAuthoritySummary.selectedSizeOz}oz`
                      : lookupResult?.capacityOz
                        ? `${lookupResult.capacityOz}oz`
                        : null,
                    activeLookupDimensions.selectedColorOrFinish ?? null,
                  ]
                    .filter(Boolean)
                    .join(" / ")}
                </div>
                <div className={styles.lookupMetrics}>
                  {formatLookupMeasurement(lookupDimensionAuthoritySummary.scaleDiameterMm) && (
                    <span>Diameter authority {formatLookupMeasurement(lookupDimensionAuthoritySummary.scaleDiameterMm)}</span>
                  )}
                  <span>Authority {formatLookupAuthority(lookupDimensionAuthoritySummary.dimensionAuthority)}</span>
                  <span>{formatLookupAuthority(lookupDimensionAuthoritySummary.dimensionAuthority)}</span>
                  {formatLookupMeasurement(lookupDimensionAuthoritySummary.wrapWidthMm) && (
                    <span>Wrap width {formatLookupMeasurement(lookupDimensionAuthoritySummary.wrapWidthMm)} = Math.PI * diameter</span>
                  )}
                  {(lookupResult?.glbPath || glbPath) && <span>3D ready</span>}
                </div>
                <div className={styles.lookupMetrics}>
                  <span>Variant {activeLookupDimensions.selectedVariantLabel || "n/a"}</span>
                  <span>Selected size {formatLookupSize(lookupDimensionAuthoritySummary.selectedSizeOz)}</span>
                  <span>{formatLookupVariantStatus(lookupDimensionAuthoritySummary.variantStatus)}</span>
                  {lookupDimensionAuthoritySummary.heightIgnoredForScale && (
                    <span>Full product height is stored for context and ignored for lookup-based body contour scale.</span>
                  )}
                </div>
                <details className={styles.compactDetails}>
                  <summary className={styles.compactDetailsSummary}>
                    Reference dimensions
                  </summary>
                  <div className={styles.compactDetailsContent}>
                    <div className={styles.lookupMetrics}>
                      {formatLookupMeasurement(lookupDimensionAuthoritySummary.bodyHeightMm) && (
                        <span>Reference body band {formatLookupMeasurement(lookupDimensionAuthoritySummary.bodyHeightMm)}</span>
                      )}
                      {formatLookupMeasurement(lookupDimensionAuthoritySummary.fullProductHeightMm) && (
                        <span>Reference full height {formatLookupMeasurement(lookupDimensionAuthoritySummary.fullProductHeightMm)}</span>
                      )}
                      {lookupDimensionAuthoritySummary.heightIgnoredForScale && (
                        <span>Height is reference only and is not used for body scale authority.</span>
                      )}
                    </div>
                  </div>
                </details>
                {(lookupDimensionAuthoritySummary.errors.length > 0 || lookupDimensionAuthoritySummary.warnings.length > 0) && (
                  <div className={styles.cutoutFitWarningList}>
                    {lookupDimensionAuthoritySummary.errors.map((error) => (
                      <div key={`lookup-dimension-error-${error}`} className={styles.cutoutFitWarningError}>
                        {error}
                      </div>
                    ))}
                    {lookupDimensionAuthoritySummary.warnings.map((warning) => (
                      <div key={`lookup-dimension-warning-${warning}`} className={styles.cutoutFitWarning}>
                        {warning}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {lookupError && <div className={styles.detectErrorBanner}>{lookupError}</div>}

            {lookupResult?.fitDebug && lookupDebugImageUrl && templateCreateDiagnosticsVisible && (
              <details className={styles.compactDetails} open={templateCreateDiagnosticsExpanded}>
                <summary className={styles.compactDetailsSummary}>
                  Advanced debug · lookup fit and detection guides
                </summary>
                <div className={styles.compactDetailsContent}>
                  <TumblerLookupDebugPanel
                    debug={lookupResult.fitDebug}
                    imageUrl={lookupDebugImageUrl}
                    guideFrame={bodyReferenceGuideFrame}
                  />
                </div>
              </details>
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

        {productImageFile && !detectResult && !lookupResult && (
          <button
            type="button"
            className={styles.detectBtn}
            onClick={() => void handleAutoDetect()}
            disabled={detecting}
          >
            {detecting ? "Detecting\u2026" : "Auto-detect product specs"}
          </button>
        )}

        {detectResult && !lookupResult && (
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

        {detectError && !lookupResult && (
          <div className={styles.detectErrorBanner}>
            {detectError} — fill in manually below.
          </div>
        )}
      </div>

      {productType !== "flat" && (
        <div
          className={`${styles.section} ${inDedicatedTemplateMode ? styles.pageSection : ""}`}
          data-body-reference-review-scaffold="present"
        >
          <div className={styles.sectionTitle}>
            {inDedicatedTemplateMode
              ? "Steps 3-5 · Review, BODY CUTOUT QA, and WRAP / EXPORT"
              : "BODY REFERENCE workflow"}
          </div>
          <div className={styles.sectionLead}>
            {inDedicatedTemplateMode
              ? "Review and lock BODY REFERENCE first, then generate the body-only QA GLB, and only then switch into BODY CUTOUT QA or WRAP / EXPORT proof."
              : "Move through the drinkware flow in order: stage the source, review BODY REFERENCE, generate BODY CUTOUT QA, then switch preview modes for QA or WRAP / EXPORT checks."}
          </div>

          {inDedicatedTemplateMode ? (
            <div className={styles.workflowContextBar}>
              <div className={styles.workflowContextRow}>
                {workflowSourceStep && (
                  <span
                    className={
                      workflowSourceStep.status === "ready"
                        ? styles.workflowReadinessReady
                        : workflowSourceStep.status === "action"
                          ? styles.workflowReadinessPending
                          : styles.workflowReadinessCurrent
                    }
                  >
                    {workflowSourceStep.label.replace(/^\d+\.\s*/, "")}
                  </span>
                )}
                {workflowDetectStep && (
                  <span
                    className={
                      workflowDetectStep.status === "ready"
                        ? styles.workflowReadinessReady
                        : workflowDetectStep.status === "action"
                          ? styles.workflowReadinessPending
                          : styles.workflowReadinessCurrent
                    }
                  >
                    {workflowDetectStep.label.replace(/^\d+\.\s*/, "")}
                  </span>
                )}
                {workflowReviewStep && (
                  <span
                    className={
                      workflowReviewStep.status === "ready"
                        ? styles.workflowReadinessReady
                        : workflowReviewStep.status === "action"
                          ? styles.workflowReadinessPending
                          : styles.workflowReadinessCurrent
                    }
                  >
                    {workflowReviewStep.label.replace(/^\d+\.\s*/, "")}
                  </span>
                )}
                {workflowGenerateStep && (
                  <span
                    className={
                      workflowGenerateStep.status === "ready"
                        ? styles.workflowReadinessReady
                        : workflowGenerateStep.status === "action"
                          ? styles.workflowReadinessPending
                          : styles.workflowReadinessCurrent
                    }
                  >
                    {workflowGenerateStep.label.replace(/^\d+\.\s*/, "")}
                  </span>
                )}
                {workflowPreviewStep && (
                  <span
                    className={
                      workflowPreviewStep.status === "ready"
                        ? styles.workflowReadinessReady
                        : workflowPreviewStep.status === "action"
                          ? styles.workflowReadinessPending
                          : styles.workflowReadinessCurrent
                    }
                  >
                    {workflowPreviewStep.label.replace(/^\d+\.\s*/, "")}
                  </span>
                )}
              </div>
              <div className={styles.workflowContextSummary}>
                <span className={styles.workflowReadinessCurrent}>
                  Current step: {workflowCurrentStepLabel}
                </span>
                <span className={styles.workflowNextNote}>
                  Next action: {operatorNextActionHint}
                </span>
              </div>
              {!templateCreateSourceReadiness.detectReady && templateCreateSourceReadiness.blockedReason && (
                <div
                  className={styles.workflowBlockedNote}
                  data-testid="template-create-source-blocked-reason"
                >
                  {templateCreateSourceReadiness.blockedReason}
                </div>
              )}
            </div>
          ) : (
            <div className={styles.workflowScaffold}>
              <div className={styles.workflowStepRow}>
                {workflowSteps.map((step) => (
                  <div
                    key={step.step}
                    className={[
                      styles.workflowStepCard,
                      step.status === "ready"
                        ? styles.workflowStepReady
                        : step.status === "action"
                          ? styles.workflowStepAction
                          : styles.workflowStepReview,
                      workflowCurrentStep === step.step ? styles.workflowStepCurrent : "",
                    ].join(" ")}
                  >
                    <div className={styles.workflowStepLabel}>{step.label}</div>
                    <div className={styles.workflowStepDetail}>{step.detail}</div>
                  </div>
                ))}
              </div>

              <div className={styles.workflowReadinessRow}>
                <span
                  className={
                    templateCreateSourceReadiness.sourceReady
                      ? styles.workflowReadinessReady
                      : styles.workflowReadinessPending
                  }
                >
                  {templateCreateSourceReadiness.sourceReady ? "Source ready" : "Source pending"}
                </span>
                <span
                  className={
                    templateCreateSourceReadiness.detectReady
                      ? styles.workflowReadinessReady
                      : styles.workflowReadinessPending
                  }
                >
                  {templateCreateSourceReadiness.detectReady ? "Detect actionable" : "Detect blocked"}
                </span>
                <span className={styles.workflowReadinessCurrent}>
                  Current step: {workflowCurrentStepLabel}
                </span>
              </div>

              <div className={styles.workflowNextNote}>
                Next action: {operatorNextActionHint}
              </div>

              {!templateCreateSourceReadiness.detectReady && templateCreateSourceReadiness.blockedReason && (
                <div
                  className={styles.workflowBlockedNote}
                  data-testid="template-create-source-blocked-reason"
                >
                  {templateCreateSourceReadiness.blockedReason}
                </div>
              )}
            </div>
          )}

          <div className={styles.reviewScaffoldCard}>
            <div className={styles.reviewScaffoldHeader}>
              <div>
                <div className={styles.reviewScaffoldTitle}>Step 4 · Generate BODY CUTOUT QA</div>
                <div className={styles.reviewScaffoldHint}>
                  Lock the accepted BODY REFERENCE (v1) first, then generate the reviewed body-only GLB used by BODY CUTOUT QA.
                </div>
              </div>
              <span
                className={
                  bodyCutoutQaGlbLifecycle.status === "fresh"
                    ? styles.reviewStatusReady
                    : styles.reviewStatusPending
                }
              >
                {hasAcceptedBodyReferenceReview ? qaStageLabel : "Pending BODY REFERENCE"}
              </span>
            </div>

            <div className={styles.reviewScaffoldActions}>
              <button
                type="button"
                className={styles.detectBtn}
                disabled={!liveBodyReferencePipeline || hasAcceptedBodyReferenceReview}
                title={acceptBodyReferenceActionReason ?? undefined}
                onClick={() => {
                  if (!liveBodyReferencePipeline) return;
                  resetBodyReferenceFineTuneState();
                  setApprovedBodyOutline(
                    liveBodyReferencePipeline.outline
                      ? cloneSerializable(liveBodyReferencePipeline.outline)
                      : null,
                  );
                  setApprovedCanonicalBodyProfile(
                    cloneSerializable(liveBodyReferencePipeline.canonicalBodyProfile),
                  );
                  const acceptedCal = liveBodyReferencePipeline.canonicalDimensionCalibration;
                  setApprovedCanonicalDimensionCalibration(
                    cloneSerializable(acceptedCal),
                  );
                  setOverallHeightMm(resolveAcceptedBodyReferenceOverallHeightMm({
                    canonicalTotalHeightMm: acceptedCal.totalHeightMm,
                    lookupFullProductHeightMm: lookupResult?.dimensions?.fullProductHeightMm,
                    currentOverallHeightMm: overallHeightMm,
                  }));
                  // Keep body bounds in full-product coordinates from the accepted
                  // BODY REFERENCE calibration.
                  setTopMarginMm(round2(acceptedCal.lidBodyLineMm));
                  setBottomMarginMm(round2(Math.max(0, acceptedCal.totalHeightMm - acceptedCal.bodyBottomMm)));
                  setPrintHeightMm(round2(acceptedCal.bodyHeightMm));
                  setApprovedBodyReferenceQa(cloneSerializable(liveBodyReferencePipeline.qa));
                  setApprovedBodyReferenceWarnings([...liveBodyReferencePipeline.warnings]);
                  clearReviewedBodyReferenceGeneratedState();
                  setPrintableTopOverrideMm(null);
                  setPrintableBottomOverrideMm(null);
                  setHasAcceptedBodyReferenceReview(true);
                  setPreviewModelMode("alignment-model");
                }}
                data-testid="body-reference-v1-accept"
              >
                {hasAcceptedBodyReferenceReview ? "BODY REFERENCE (v1) locked" : "Accept BODY REFERENCE (v1)"}
              </button>
              <button
                type="button"
                className={styles.detectBtn}
                disabled={
                  !canGenerateReviewedBodyReferenceGlb ||
                  generatingReviewedBodyReferenceGlb ||
                  bodyReferenceFineTuneDraftPendingAcceptance
                }
                title={generateBodyCutoutActionReason ?? undefined}
                onClick={() => {
                  void handleGenerateReviewedBodyReferenceGlb();
                }}
                data-testid="body-reference-v1-generate"
              >
                {generatingReviewedBodyReferenceGlb
                  ? "Generating BODY CUTOUT QA GLB…"
                  : bodyCutoutQaGlbLifecycle.status === "stale"
                    ? "Regenerate BODY CUTOUT QA GLB"
                    : "Generate BODY CUTOUT QA GLB"}
              </button>
            </div>
            {reviewDisabledActionReasonGroups.length > 0 && (
              <div
                className={styles.actionReasonList}
                data-testid="template-create-review-action-reasons"
              >
                {reviewDisabledActionReasonGroups.map((group) => (
                  <div
                    key={`review-disabled-reason-${group.reason}`}
                    className={styles.actionDisabledReason}
                    data-testid="template-create-review-action-reason"
                  >
                    {formatTemplateCreateDisabledActionLabels(group.labels)}: {group.reason}
                  </div>
                ))}
              </div>
            )}

            <div className={styles.reviewScaffoldMeta}>
              {!workflowInput.hasStagedDetectResult && !liveBodyReferencePipeline && (
                <div className={styles.reviewScaffoldNote}>
                  Run auto-detect or lookup first so BODY REFERENCE review has a real canonical contour to accept.
                </div>
              )}
              {workflowInput.hasStagedDetectResult && !hasAcceptedBodyReferenceReview && liveBodyReferencePipeline && (
                <div className={styles.reviewScaffoldNote}>
                  Detection is staged. Accepting BODY REFERENCE review snapshots the current outline, canonical body profile, and calibration as the QA source of truth.
                </div>
              )}
              {hasAcceptedBodyReferenceReview && (
                <div className={styles.reviewScaffoldNote}>
                  BODY REFERENCE accepted. {bodyCutoutQaGlbLifecycle.label}
                  {bodyCutoutQaGlbLifecycle.nextActionLabel
                    ? `. Next action: ${bodyCutoutQaGlbLifecycle.nextActionLabel}.`
                    : "."}
                </div>
              )}
              {approvedBodyReferenceWarnings.length > 0 && (
                <div className={styles.reviewScaffoldNote}>
                  {approvedBodyReferenceWarnings[0]}
                </div>
              )}
              {bodyReferenceFineTuneDraftPendingAcceptance && (
                <div className={styles.reviewScaffoldNote}>
                  Accept corrected cutout before generating BODY CUTOUT QA GLB.
                </div>
              )}
              {activeBodyReferenceSvgQualityOperatorSummary.generationBlocked && (
                <div className={styles.actionDisabledReason}>
                  {activeBodyReferenceSvgQualityOperatorSummary.generationBlockedReason}{" "}
                  {activeBodyReferenceSvgQualityOperatorSummary.operatorFixHint}
                </div>
              )}
              {saveGateReason && (
                <div className={styles.reviewScaffoldNote}>
                  Save remains blocked: {saveGateReason}
                </div>
              )}
              {templateCreateDiagnosticsVisible && (approvedBodyReferenceQa || loadedBodyGeometryContract || getDrinkwareGlbStatusLabel(activeDrinkwareGlbStatus)) && (
                <details className={styles.compactDetails} open={templateCreateDiagnosticsExpanded}>
                  <summary className={styles.compactDetailsSummary}>
                    Review diagnostics and runtime detail
                  </summary>
                  <div className={styles.compactDetailsContent}>
                    {approvedBodyReferenceQa && (
                      <div className={styles.reviewScaffoldInlineMeta}>
                        <span>QA {approvedBodyReferenceQa.severity}</span>
                        <span>{approvedBodyReferenceQa.shellAuthority}</span>
                        <span>{approvedBodyReferenceQa.scaleAuthority}</span>
                      </div>
                    )}
                    {loadedBodyGeometryContract && (
                      <div className={styles.reviewScaffoldInlineMeta}>
                        <span>Runtime {loadedBodyGeometryContract.validation.status}</span>
                        <span>
                          {loadedBodyGeometryContract.glb.freshRelativeToSource === true
                            ? "GLB fresh"
                            : loadedBodyGeometryContract.glb.freshRelativeToSource === false
                              ? "GLB stale"
                              : "GLB freshness unknown"}
                        </span>
                      </div>
                    )}
                    {getDrinkwareGlbStatusLabel(activeDrinkwareGlbStatus) && (
                      <div className={styles.reviewScaffoldInlineMeta}>
                        <span>{getDrinkwareGlbStatusLabel(activeDrinkwareGlbStatus)}</span>
                        {activeDrinkwareGlbSourceLabel && (
                          <span>{activeDrinkwareGlbSourceLabel}</span>
                        )}
                      </div>
                    )}
                  </div>
                </details>
              )}
            </div>

            <div
              className={styles.previewScaffold}
              data-body-reference-preview-scaffold="present"
              data-requested-preview-mode={previewModelMode}
              data-effective-preview-mode={effectivePreviewModelMode}
              data-preview-status={previewModelState?.glbPreviewStatus ?? "not-requested"}
              data-preview-reason={previewModelState?.reason ?? "not-requested"}
            >
              <div className={styles.previewScaffoldHeader}>
                <div>
                  <div className={styles.previewScaffoldTitle}>
                    Step 5 · Preview and operator checks
                  </div>
                  <div className={styles.previewScaffoldHint}>
                    Select the viewer mode here. BODY CUTOUT QA validates reviewed body-only geometry; WRAP / EXPORT stays separate and reports printable-surface readiness.
                  </div>
                </div>
                {getDrinkwareGlbStatusLabel(activeDrinkwareGlbStatus) && (
                  <span className={styles.previewScaffoldBadge}>
                    {getDrinkwareGlbStatusLabel(activeDrinkwareGlbStatus)}
                  </span>
                )}
              </div>

              {previewModeDowngradeActive && (
                <div className={styles.reviewScaffoldInlineMeta}>
                  <span>Selected preview: {requestedPreviewModeLabel}</span>
                  <span>Viewer showing: {effectivePreviewModeLabel}</span>
                </div>
              )}
              {previewModeTransitionNote && (
                <div className={styles.previewPlaceholderNote}>
                  {previewModeTransitionNote}
                </div>
              )}
              <div className={styles.reviewScaffoldInlineMeta}>
                <span>Preview mode: {effectivePreviewModeLabel}</span>
                <span>{effectivePreviewModeHint}</span>
              </div>
              {previewModelState?.message && (
                <div className={styles.previewPlaceholderNote}>
                  {previewModelState.message}
                </div>
              )}

              <div className={styles.previewModeRow}>
                <button
                  type="button"
                  className={`${styles.detectBtn} ${previewModelMode === "body-cutout-qa" ? styles.detectBtnActive : ""}`}
                  disabled={!isBodyCutoutQaPreviewAvailable(activeDrinkwareGlbStatus)}
                  title={getTemplateCreatePreviewActionReason({
                    action: "body-cutout-qa",
                    hasSourceModel: hasSourceModelForPreview,
                    hasQaPreview: isBodyCutoutQaPreviewAvailable(activeDrinkwareGlbStatus),
                  }) ?? undefined}
                  aria-pressed={previewModelMode === "body-cutout-qa"}
                  onClick={() => setPreviewModelMode("body-cutout-qa")}
                  data-testid="preview-mode-body-cutout-qa"
                >
                  BODY CUTOUT QA
                </button>
                <button
                  type="button"
                  className={`${styles.detectBtn} ${previewModelMode === "wrap-export" ? styles.detectBtnActive : ""}`}
                  disabled={!glbPath.trim()}
                  title={getTemplateCreatePreviewActionReason({
                    action: "wrap-export",
                    hasSourceModel: hasSourceModelForPreview,
                    hasQaPreview: isBodyCutoutQaPreviewAvailable(activeDrinkwareGlbStatus),
                  }) ?? undefined}
                  aria-pressed={previewModelMode === "wrap-export"}
                  onClick={() => setPreviewModelMode("wrap-export")}
                  data-testid="preview-mode-wrap-export"
                >
                  WRAP / EXPORT
                </button>
                <button
                  type="button"
                  className={`${styles.detectBtn} ${previewModelMode === "alignment-model" ? styles.detectBtnActive : ""}`}
                  aria-pressed={previewModelMode === "alignment-model"}
                  onClick={() => setPreviewModelMode("alignment-model")}
                >
                  Alignment review
                </button>
                <button
                  type="button"
                  className={`${styles.detectBtn} ${previewModelMode === "full-model" ? styles.detectBtnActive : ""}`}
                  disabled={!glbPath.trim()}
                  title={getTemplateCreatePreviewActionReason({
                    action: "full-model",
                    hasSourceModel: hasSourceModelForPreview,
                    hasQaPreview: isBodyCutoutQaPreviewAvailable(activeDrinkwareGlbStatus),
                  }) ?? undefined}
                  aria-pressed={previewModelMode === "full-model"}
                  onClick={() => setPreviewModelMode("full-model")}
                >
                  Full model
                </button>
                <button
                  type="button"
                  className={`${styles.detectBtn} ${previewModelMode === "source-traced" ? styles.detectBtnActive : ""}`}
                  disabled={!glbPath.trim()}
                  title={getTemplateCreatePreviewActionReason({
                    action: "source-compare",
                    hasSourceModel: hasSourceModelForPreview,
                    hasQaPreview: isBodyCutoutQaPreviewAvailable(activeDrinkwareGlbStatus),
                  }) ?? undefined}
                  aria-pressed={previewModelMode === "source-traced"}
                  onClick={() => setPreviewModelMode("source-traced")}
                >
                  Source compare
                </button>
              </div>

              {previewDisabledActionReasonGroups.length > 0 && (
                <div
                  className={styles.actionReasonList}
                  data-testid="template-create-preview-action-reasons"
                >
                  {previewDisabledActionReasonGroups.map((group) => (
                    <div
                      key={`preview-disabled-reason-${group.reason}`}
                      className={styles.actionDisabledReason}
                      data-testid="template-create-preview-action-reason"
                    >
                      {formatTemplateCreateDisabledActionLabels(group.labels)}: {group.reason}
                    </div>
                  ))}
                </div>
              )}

              {wrapExportSummaryVisible && (
                <div
                  className={styles.cutoutFitSummary}
                  data-testid="wrap-export-summary"
                  data-engraving-overlay-enabled={engravingOverlayPreviewState.enabled ? "yes" : "no"}
                  data-engraving-overlay-count={engravingOverlayPreviewState.visibleCount}
                  data-engraving-overlay-first-angle={engravingOverlayPreviewState.items[0]?.angleDeg ?? ""}
                  data-engraving-overlay-first-body-y={engravingOverlayPreviewState.items[0]?.bodyYMm ?? ""}
                  data-wrap-export-authority={wrapExportProductionReadiness.exportAuthority}
                  data-wrap-export-body-cutout-qa-proof={wrapExportProductionReadiness.notBodyCutoutQa ? "no" : "yes"}
                  data-wrap-export-body-bounds-source={wrapExportProductionReadiness.bodyBoundsSource}
                  data-wrap-export-mapping-freshness={wrapExportProductionReadiness.mappingFreshness}
                >
                  <div className={styles.cutoutFitSummaryHeader}>
                    <div>
                      <div className={styles.cutoutFitSummaryTitle}>{getWrapExportSummaryTitle()}</div>
                      <div className={styles.cutoutFitSummaryHint}>
                        {getWrapExportSummarySubtitle()}
                      </div>
                    </div>
                    <span
                      className={
                        wrapExportProductionReadiness.status === "pass"
                          ? styles.reviewStatusReady
                          : wrapExportProductionReadiness.status === "fail"
                            ? styles.reviewStatusFail
                            : wrapExportProductionReadiness.status === "warn"
                              ? styles.reviewStatusPending
                              : styles.previewScaffoldBadge
                      }
                    >
                      {getWrapExportPreviewStatusLabel(wrapExportProductionReadiness.status)}
                    </span>
                  </div>

                  <div className={styles.cutoutFitSummaryGrid}>
                    <div className={styles.cutoutFitMetric}>
                      <span className={styles.cutoutFitMetricLabel}>Mapping status</span>
                      <span className={styles.cutoutFitMetricValue}>
                        {getWrapExportMappingStatusLabel(wrapExportProductionReadiness.mappingStatus)}
                      </span>
                    </div>
                    <div className={styles.cutoutFitMetric}>
                      <span className={styles.cutoutFitMetricLabel}>Saved artwork placements</span>
                      <span className={styles.cutoutFitMetricValue}>{wrapExportProductionReadiness.placementCount}</span>
                    </div>
                    <div className={styles.cutoutFitMetric}>
                      <span className={styles.cutoutFitMetricLabel}>Saved placement agreement</span>
                      <span className={styles.cutoutFitMetricValue}>
                        {hasSavedArtworkPlacements
                          ? wrapExportFreshnessLabel
                          : "No saved artwork placement yet"}
                      </span>
                    </div>
                    <div className={styles.cutoutFitMetric}>
                      <span className={styles.cutoutFitMetricLabel}>Export source of truth</span>
                      <span className={styles.cutoutFitMetricValue}>
                        {getWrapExportExportAuthorityLabel(wrapExportProductionReadiness.exportAuthority)}
                      </span>
                    </div>
                  </div>

                  {templateCreateDiagnosticsVisible && (
                    <details className={styles.compactDetails} open={templateCreateDiagnosticsExpanded}>
                      <summary className={styles.compactDetailsSummary}>
                        Mapping, overlay, and signature detail
                      </summary>
                      <div className={styles.compactDetailsContent}>
                      <div className={styles.cutoutFitSummaryGrid}>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Ready for preview</span>
                          <span className={styles.cutoutFitMetricValue}>
                            {wrapExportProductionReadiness.readyForPreview ? "yes" : "no"}
                          </span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Ready for exact placement</span>
                          <span className={styles.cutoutFitMetricValue}>
                            {wrapExportProductionReadiness.readyForExactPlacement ? "yes" : "no"}
                          </span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Viewer agreement ready</span>
                          <span className={styles.cutoutFitMetricValue}>
                            {wrapExportProductionReadiness.readyForViewerAgreement ? "yes" : "no"}
                          </span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>BODY CUTOUT QA proof</span>
                          <span className={styles.cutoutFitMetricValue}>
                            {wrapExportProductionReadiness.notBodyCutoutQa ? "no" : "yes"}
                          </span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Wrap diameter</span>
                          <span className={styles.cutoutFitMetricValue}>{formatDimensionMetric(wrapExportPreviewState.wrapDiameterMm)}</span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Wrap width</span>
                          <span className={styles.cutoutFitMetricValue}>{formatDimensionMetric(wrapExportPreviewState.wrapWidthMm)}</span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Printable top</span>
                          <span className={styles.cutoutFitMetricValue}>{formatDimensionMetric(wrapExportPreviewState.printableTopMm)}</span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Printable bottom</span>
                          <span className={styles.cutoutFitMetricValue}>{formatDimensionMetric(wrapExportPreviewState.printableBottomMm)}</span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Printable height</span>
                          <span className={styles.cutoutFitMetricValue}>{formatDimensionMetric(wrapExportPreviewState.printableHeightMm)}</span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Expected body width</span>
                          <span className={styles.cutoutFitMetricValue}>{formatDimensionMetric(wrapExportPreviewState.expectedBodyWidthMm)}</span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Expected body height</span>
                          <span className={styles.cutoutFitMetricValue}>{formatDimensionMetric(wrapExportPreviewState.expectedBodyHeightMm)}</span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Body bounds</span>
                          <span className={styles.cutoutFitMetricValue}>{formatBodyBoundsMetric(wrapExportPreviewState.bodyBounds)}</span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Scale source</span>
                          <span className={styles.cutoutFitMetricValue}>{wrapExportPreviewState.scaleSource ?? "unknown"}</span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Body bounds source</span>
                          <span className={styles.cutoutFitMetricValue}>{wrapExportProductionReadiness.bodyBoundsSource}</span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Visible overlay items</span>
                          <span className={styles.cutoutFitMetricValue}>
                            {wrapExportProductionReadiness.overlayCount} / {wrapExportProductionReadiness.overlayTotalCount}
                          </span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Overlay enabled</span>
                          <span className={styles.cutoutFitMetricValue}>{wrapExportProductionReadiness.overlayEnabled ? "yes" : "no"}</span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Overlay material</span>
                          <span className={styles.cutoutFitMetricValue}>{ENGRAVING_OVERLAY_PREVIEW_MATERIAL_TOKEN}</span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Outside printable placements</span>
                          <span className={styles.cutoutFitMetricValue}>{engravingOverlayPreviewState.outsidePrintableAreaCount}</span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Appearance references</span>
                          <span className={styles.cutoutFitMetricValue}>{appearanceReferenceSummary.totalLayers}</span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Stale mapping warnings</span>
                          <span className={styles.cutoutFitMetricValue}>{wrapExportProductionReadiness.staleMappingWarningCount}</span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Source hash</span>
                          <span className={styles.cutoutFitMetricValue}>
                            {formatShortHash(wrapExportContract?.source.hash)}
                          </span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>GLB source hash</span>
                          <span className={styles.cutoutFitMetricValue}>
                            {formatShortHash(wrapExportContract?.glb.sourceHash)}
                          </span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Saved mapping signature</span>
                          <span className={styles.cutoutFitMetricValue}>
                            {formatShortHash(
                              wrapExportProductionReadiness.mappingSignature
                              ?? templateArtworkPlacementMappingSignature
                              ?? editingTemplate?.engravingPreviewState?.mappingSignature,
                            )}
                          </span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Reference-only layers</span>
                          <span className={styles.cutoutFitMetricValue}>
                            {wrapExportProductionReadiness.appearanceReferenceContextOnly ? "yes" : "no"}
                          </span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Top finish band</span>
                          <span className={styles.cutoutFitMetricValue}>{appearanceReferenceSummary.topFinishBandPresent ? "present" : "none"}</span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Bottom finish band</span>
                          <span className={styles.cutoutFitMetricValue}>{appearanceReferenceSummary.bottomFinishBandPresent ? "present" : "none"}</span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Front logo reference</span>
                          <span className={styles.cutoutFitMetricValue}>{appearanceReferenceSummary.frontLogoReferencePresent ? "present" : "none"}</span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Back logo reference</span>
                          <span className={styles.cutoutFitMetricValue}>{appearanceReferenceSummary.backLogoReferencePresent ? "present" : "none"}</span>
                        </div>
                      </div>
                      </div>
                    </details>
                  )}

                  <div className={styles.reviewScaffoldNote}>
                    {getWrapExportAuthorityNote()}
                  </div>
                  <div className={styles.reviewScaffoldNote}>
                    {getWrapExportOverlayPreviewNote(ENGRAVING_OVERLAY_PREVIEW_MATERIAL_LABEL)}
                  </div>
                  <div className={styles.reviewScaffoldNote}>
                    {getWrapExportRegenerateNote()}
                  </div>
                  <div
                    className={styles.reviewScaffoldNote}
                    data-testid="appearance-reference-summary"
                  >
                    {getWrapExportAppearanceReferenceNote()}
                  </div>

                  {!hasSavedArtworkPlacements && (
                    <div className={styles.previewPlaceholderNote}>
                      {getWrapExportNoSavedPlacementMessage()}
                    </div>
                  )}
                  {hasSavedArtworkPlacements && engravingOverlayPreviewState.disabledReason && (
                    <div className={styles.previewPlaceholderNote}>
                      {engravingOverlayPreviewState.disabledReason}
                    </div>
                  )}
                  {wrapExportOperatorWarningNote && (
                    <div className={styles.previewPlaceholderNote}>
                      {wrapExportOperatorWarningNote}
                    </div>
                  )}
                  {appearanceReferenceSummary.totalLayers === 0 && (
                    <div className={styles.previewPlaceholderNote}>
                      {getWrapExportNoAppearanceReferenceMessage()}
                    </div>
                  )}

                  {wrapExportDiagnosticMessages.length > 0 && (
                    <div className={styles.cutoutFitWarningList}>
                      {wrapExportDiagnosticMessages.map((entry) => (
                        <div
                          key={`wrap-export-diagnostic-${entry.level}-${entry.message}`}
                          className={entry.level === "error" ? styles.cutoutFitWarningError : styles.cutoutFitWarning}
                        >
                          {entry.message}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className={styles.previewSurface}>
                {glbPath.trim() && previewTumblerDims ? (
                  <div className={styles.previewViewerWrap}>
                    <ModelViewer
                      modelUrl={glbPath}
                      glbPath={glbPath}
                      placedItems={engravingOverlayPreviewState.enabled ? overlayPreviewPlacedItems : undefined}
                      itemTextures={engravingOverlayPreviewState.enabled ? overlayPreviewTextures : undefined}
                      bedWidthMm={templateWidthMm > 0 ? templateWidthMm : undefined}
                      bedHeightMm={printHeightMm > 0 ? printHeightMm : undefined}
                      tumblerDims={previewTumblerDims}
                      handleArcDeg={handleArcDeg}
                      tumblerMapping={tumblerMapping}
                      bodyTintColor={bodyColorHex}
                      rimTintColor={rimColorHex}
                      appearanceReferenceLayers={templateAppearanceReferenceLayers}
                      showTemplateSurfaceZones={
                        effectivePreviewModelMode === "alignment-model" ||
                        effectivePreviewModelMode === "wrap-export"
                      }
                      previewModelMode={previewModelMode}
                      sourceModelStatus={activeDrinkwareGlbStatus}
                      sourceModelLabel={activeDrinkwareGlbSourceLabel}
                      approvedBodyOutline={approvedBodyOutline}
                      canonicalBodyProfile={approvedCanonicalBodyProfile}
                      canonicalDimensionCalibration={approvedCanonicalDimensionCalibration}
                      bodyGeometryContractSeed={generatedReviewedBodyGeometryContract}
                      wrapExportProductionReadiness={wrapExportProductionReadiness}
                      showModelDebug={templateCreateDiagnosticsVisible}
                      onBodyGeometryContractChange={setLoadedBodyGeometryContract}
                    />
                  </div>
                ) : (
                  <div className={styles.previewSurfacePlaceholder}>
                    Reviewed model preview mounts here once a drinkware model path is available.
                  </div>
                )}
              </div>
            </div>

            {hasAcceptedBodyReferenceReview && approvedBodyOutline && (
              <div className={styles.reviewScaffoldCard} data-body-reference-fine-tune-panel="present">
                <div className={styles.reviewScaffoldHeader}>
                  <div>
                    <div className={styles.reviewScaffoldTitle}>BODY REFERENCE Cutout Fine-Tune</div>
                    <div className={styles.reviewScaffoldHint}>
                      Draft edits stay non-authoritative until you accept the corrected cutout.
                    </div>
                  </div>
                  <span
                    className={
                      reviewedBodyReferenceGlbFreshness.status === "stale" || bodyReferenceFineTuneDraftPendingAcceptance
                        ? styles.reviewStatusPending
                        : styles.reviewStatusReady
                    }
                  >
                    {bodyReferenceFineTuneStatusLabel}
                  </span>
                </div>

                <div className={styles.reviewScaffoldActions}>
                  <button
                    type="button"
                    className={styles.detectBtn}
                    onClick={handleStartBodyReferenceFineTune}
                    disabled={bodyReferenceFineTuneModeEnabled}
                    data-testid="body-reference-fine-tune-edit"
                  >
                    Edit contour
                  </button>
                  <button
                    type="button"
                    className={styles.detectBtn}
                    onClick={handleAcceptBodyReferenceFineTuneDraft}
                    disabled={!bodyReferenceFineTuneDraftPendingAcceptance}
                    data-testid="body-reference-fine-tune-accept"
                  >
                    Accept corrected cutout
                  </button>
                  <button
                    type="button"
                    className={styles.detectBtn}
                    onClick={handleResetFineTuneDraftToApproved}
                    disabled={!bodyReferenceFineTuneModeEnabled}
                  >
                    Reset to approved
                  </button>
                  <button
                    type="button"
                    className={styles.detectBtn}
                    onClick={handleResetFineTuneDraftToDetected}
                    disabled={!bodyReferenceFineTuneModeEnabled || !bodyReferenceFineTuneDetectedBaselineOutline}
                  >
                    Reset to detected contour
                  </button>
                  <button
                    type="button"
                    className={styles.detectBtn}
                    onClick={handleDiscardBodyReferenceFineTuneDraft}
                    disabled={!bodyReferenceFineTuneModeEnabled}
                  >
                    Discard draft
                  </button>
                  {reviewedBodyReferenceGlbFreshness.hasGeneratedArtifact && (
                    <button
                      type="button"
                      className={styles.detectBtn}
                      disabled={
                        !canGenerateReviewedBodyReferenceGlb ||
                        generatingReviewedBodyReferenceGlb ||
                        bodyReferenceFineTuneDraftPendingAcceptance ||
                        !reviewedBodyReferenceGlbFreshness.canRequestGeneration
                      }
                      onClick={() => {
                        void handleGenerateReviewedBodyReferenceGlb();
                      }}
                      data-testid="body-reference-fine-tune-regenerate"
                    >
                      {generatingReviewedBodyReferenceGlb
                        ? "Regenerating BODY CUTOUT QA GLB…"
                        : "Regenerate BODY CUTOUT QA GLB"}
                    </button>
                  )}
                </div>

                <div
                  className={styles.fineTuneLifecyclePanel}
                  data-testid="body-reference-fine-tune-lifecycle"
                >
                  <div className={styles.fineTuneLifecycleHeader}>
                    <div>
                      <div className={styles.fineTuneLifecycleEyebrow}>Draft lifecycle</div>
                      <div className={styles.fineTuneLifecycleTitle}>
                        {bodyReferenceFineTuneLifecycle.label}
                      </div>
                    </div>
                    <span
                      className={
                        bodyReferenceFineTuneLifecycle.status === "reviewed-glb-fresh" ||
                        bodyReferenceFineTuneLifecycle.status === "no-draft"
                          ? styles.reviewStatusReady
                          : styles.reviewStatusPending
                      }
                    >
                      GLB {bodyReferenceFineTuneLifecycle.glbFreshnessLabel}
                    </span>
                  </div>
                  <div className={styles.fineTuneLifecycleMessage}>
                    {bodyReferenceFineTuneLifecycle.operatorMessage}
                  </div>
                  <div className={styles.fineTuneLifecycleGrid}>
                    <div className={styles.cutoutFitMetric}>
                      <span className={styles.cutoutFitMetricLabel}>GLB freshness</span>
                      <span className={styles.cutoutFitMetricValue}>
                        {bodyReferenceFineTuneLifecycle.glbFreshnessLabel}
                      </span>
                    </div>
                    <div className={styles.cutoutFitMetric}>
                      <span className={styles.cutoutFitMetricLabel}>Next action</span>
                      <span className={styles.cutoutFitMetricValue}>
                        {bodyReferenceFineTuneLifecycle.nextActionLabel ?? "No regeneration required"}
                      </span>
                    </div>
                  </div>
                  {bodyReferenceFineTuneLifecycle.warnings.length > 0 && (
                    <div className={styles.fineTuneLifecycleWarnings}>
                      {bodyReferenceFineTuneLifecycle.warnings.map((warning) => (
                        <div key={warning} className={styles.cutoutFitWarning}>
                          {warning}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className={styles.fineTuneActionConsequences}>
                  <span>Accepted cutout: authoritative BODY CUTOUT QA source.</span>
                  <span>Corrected draft: pending only until accepted.</span>
                  <span>Accept corrected cutout: replace accepted source and mark reviewed GLB stale.</span>
                  <span>Reset or discard draft: keep the accepted cutout authoritative.</span>
                </div>

                <div className={styles.cutoutFitSummary}>
                  <div className={styles.cutoutFitSummaryHeader}>
                    <div>
                      <div className={styles.cutoutFitSummaryTitle}>SVG Cutout Quality</div>
                      <div className={styles.cutoutFitSummaryHint}>
                        {activeBodyReferenceSvgQualityOperatorSummary.bodyOnlySummary} BODY CUTOUT QA authority still follows accept then regenerate.
                      </div>
                    </div>
                    <span
                      className={
                        activeBodyReferenceSvgQualityOperatorSummary.statusTone === "pass"
                          ? styles.reviewStatusReady
                          : activeBodyReferenceSvgQualityOperatorSummary.statusTone === "fail"
                            ? styles.reviewStatusFail
                            : styles.reviewStatusPending
                      }
                    >
                      {activeBodyReferenceSvgQualityOperatorSummary.statusLabel}
                    </span>
                  </div>

                  <div className={styles.cutoutFitSummaryGrid}>
                    <div className={styles.cutoutFitMetric}>
                      <span className={styles.cutoutFitMetricLabel}>Accepted source</span>
                      <span className={styles.cutoutFitMetricValue}>{bodyReferenceSvgCutoutLineageOperatorSummary.acceptedSourceLabel}</span>
                    </div>
                    <div className={styles.cutoutFitMetric}>
                      <span className={styles.cutoutFitMetricLabel}>Corrected draft</span>
                      <span className={styles.cutoutFitMetricValue}>{bodyReferenceSvgCutoutLineageOperatorSummary.correctedDraftLabel}</span>
                    </div>
                    <div className={styles.cutoutFitMetric}>
                      <span className={styles.cutoutFitMetricLabel}>Reviewed GLB</span>
                      <span className={styles.cutoutFitMetricValue}>{bodyReferenceSvgCutoutLineageOperatorSummary.reviewedGlbLabel}</span>
                    </div>
                    <div className={styles.cutoutFitMetric}>
                      <span className={styles.cutoutFitMetricLabel}>Next action</span>
                      <span className={styles.cutoutFitMetricValue}>{bodyReferenceSvgCutoutLineageOperatorSummary.nextActionLabel}</span>
                    </div>
                    <div className={styles.cutoutFitMetric}>
                      <span className={styles.cutoutFitMetricLabel}>Body-only confidence</span>
                      <span className={styles.cutoutFitMetricValue}>{activeBodyReferenceSvgQualityOperatorSummary.bodyOnlyConfidenceLabel}</span>
                    </div>
                    <div className={styles.cutoutFitMetric}>
                      <span className={styles.cutoutFitMetricLabel}>Suspicious jumps</span>
                      <span className={styles.cutoutFitMetricValue}>{activeBodyReferenceSvgQuality.suspiciousJumpCount}</span>
                    </div>
                    <div className={styles.cutoutFitMetric}>
                      <span className={styles.cutoutFitMetricLabel}>Expected bridge segments</span>
                      <span className={styles.cutoutFitMetricValue}>{activeBodyReferenceSvgQuality.expectedBridgeSegmentCount}</span>
                    </div>
                  </div>

                  {activeBodyReferenceSvgQualityOperatorSummary.reasonLabels.length > 0 && (
                    <div className={styles.cutoutFitReasonList}>
                      {activeBodyReferenceSvgQualityOperatorSummary.reasonLabels.slice(0, 6).map((reason) => (
                        <span key={reason}>{reason}</span>
                      ))}
                    </div>
                  )}

                  {templateCreateDiagnosticsVisible && (
                    <details className={styles.compactDetails} open={templateCreateDiagnosticsExpanded}>
                      <summary className={styles.compactDetailsSummary}>
                        Cutout geometry and hash detail
                      </summary>
                      <div className={styles.compactDetailsContent}>
                      <div className={styles.cutoutFitSummaryGrid}>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Approved point count</span>
                          <span className={styles.cutoutFitMetricValue}>{approvedBodyReferencePointCount}</span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Draft point count</span>
                          <span className={styles.cutoutFitMetricValue}>{draftBodyReferencePointCount}</span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Approved bounds</span>
                          <span className={styles.cutoutFitMetricValue}>{formatBoundsLabel(approvedBodyReferenceOutlineBounds)}</span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Draft bounds</span>
                          <span className={styles.cutoutFitMetricValue}>{formatBoundsLabel(draftBodyReferenceOutlineBounds)}</span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Tiny segments</span>
                          <span className={styles.cutoutFitMetricValue}>{activeBodyReferenceSvgQuality.tinySegmentCount}</span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Suspicious spikes</span>
                          <span className={styles.cutoutFitMetricValue}>{activeBodyReferenceSvgQuality.suspiciousSpikeCount}</span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Duplicate points</span>
                          <span className={styles.cutoutFitMetricValue}>{activeBodyReferenceSvgQuality.duplicatePointCount}</span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Near-duplicate points</span>
                          <span className={styles.cutoutFitMetricValue}>{activeBodyReferenceSvgQuality.nearDuplicatePointCount}</span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>Source hash</span>
                          <span className={styles.cutoutFitMetricValue}>{formatShortHash(currentReviewedBodyReferenceSourceHash)}</span>
                        </div>
                        <div className={styles.cutoutFitMetric}>
                          <span className={styles.cutoutFitMetricLabel}>GLB source hash</span>
                          <span className={styles.cutoutFitMetricValue}>{formatShortHash(reviewedBodyReferenceGlbSourceHash)}</span>
                        </div>
                      </div>
                      </div>
                    </details>
                  )}

                  <div className={styles.reviewScaffoldNote}>
                    {bodyReferenceFineTuneLifecycle.operatorMessage}
                    {bodyReferenceFineTuneLifecycle.nextActionLabel
                      ? ` Next action: ${bodyReferenceFineTuneLifecycle.nextActionLabel}.`
                      : ""}
                  </div>

                  {bodyReferenceFineTuneVisualWarnings.length > 0 && (
                    <div className={styles.cutoutFitWarningList}>
                      {bodyReferenceFineTuneVisualWarnings.map((warning) => (
                        <div
                          key={`${warning.level}:${warning.message}`}
                          className={
                            warning.level === "error"
                              ? styles.cutoutFitWarningError
                              : styles.cutoutFitWarning
                          }
                        >
                          {warning.message}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <BodyReferenceFineTuneEditor
                  outline={activeBodyReferenceFineTuneOutline}
                  approvedOutline={approvedBodyOutline}
                  detectedOutline={bodyReferenceFineTuneDetectedBaselineOutline}
                  overallHeightMm={overallHeightMm}
                  sourceImageUrl={productPhotoFullUrl || null}
                  fitDebug={lookupResult?.fitDebug ?? null}
                  svgQualityReport={activeBodyReferenceSvgQuality}
                  interactive={bodyReferenceFineTuneModeEnabled}
                  canUndo={bodyReferenceFineTuneUndoStack.length > 0}
                  onUndo={handleUndoBodyReferenceFineTuneEdit}
                  onEditAction={handleBodyReferenceFineTuneEditStart}
                  onChange={(nextOutline) => {
                    if (!bodyReferenceFineTuneModeEnabled) return;
                    setBodyReferenceFineTuneDraftOutline(nextOutline);
                  }}
                />
              </div>
            )}

            <details
              className={`${styles.cutoutFitSummary} ${styles.optionalPanel}`}
              data-testid="body-reference-v2-summary"
              data-body-reference-v2-status={bodyReferenceV2Summary.status}
              data-body-reference-v2-operator-status={bodyReferenceV2OperatorState.status}
              open={isBodyReferenceV2CurrentQaSource}
            >
              <summary className={styles.optionalPanelSummary}>
                <span>Optional BODY REFERENCE v2</span>
                <span
                  className={
                    bodyReferenceV2OperatorState.promoteMessagesToMainPath
                      ? bodyReferenceV2OperatorState.status === "active-ready"
                        ? styles.reviewStatusReady
                        : styles.reviewStatusPending
                      : styles.workflowReadinessCurrent
                  }
                >
                  {bodyReferenceV2OperatorState.label}
                </span>
              </summary>
              <div className={styles.optionalPanelBody}>
              <div className={styles.cutoutFitSummaryHeader}>
                <div>
                  <div className={styles.cutoutFitSummaryTitle}>BODY REFERENCE v2 capture (optional)</div>
                  <div className={styles.cutoutFitSummaryHint}>
                    Use v2 when you want an operator-reviewed centerline plus body-left profile. BODY CUTOUT QA stays on the accepted v1 contour until you accept the v2 draft and explicitly generate from it.
                  </div>
                </div>
                <span
                  className={
                    bodyReferenceV2Summary.status === "pass"
                      ? styles.reviewStatusReady
                      : bodyReferenceV2Summary.status === "fail"
                        ? styles.reviewStatusFail
                        : styles.reviewStatusPending
                  }
                >
                  {bodyReferenceV2Summary.status.toUpperCase()}
                </span>
              </div>

              <div className={styles.reviewScaffoldActions}>
                <button
                  type="button"
                  className={styles.detectBtn}
                  data-testid="body-reference-v2-seed-centerline"
                  disabled={!approvedBodyOutline}
                  title={bodyReferenceV2SeedActionReason ?? undefined}
                  onClick={handleSeedBodyReferenceV2Centerline}
                >
                  Capture / seed centerline
                </button>
                <button
                  type="button"
                  className={styles.detectBtn}
                  data-testid="body-reference-v2-seed-body-left"
                  disabled={!approvedBodyOutline}
                  title={bodyReferenceV2SeedActionReason ?? undefined}
                  onClick={handleSeedBodyReferenceV2BodyLeft}
                >
                  Set body-left from accepted BODY REFERENCE
                </button>
                <button
                  type="button"
                  className={styles.detectBtn}
                  data-testid="body-reference-v2-accept-draft"
                  disabled={!bodyReferenceV2Draft.centerline && !bodyReferenceV2Summary.bodyLeftCaptured}
                  title={bodyReferenceV2AcceptDraftActionReason ?? undefined}
                  onClick={handleAcceptBodyReferenceV2Draft}
                >
                  Accept v2 draft
                </button>
                <button
                  type="button"
                  className={styles.detectBtn}
                  data-testid="body-reference-v2-reset-draft"
                  onClick={handleResetBodyReferenceV2Draft}
                >
                  Reset v2 draft
                </button>
              </div>
              {bodyReferenceV2DisabledActionReasonGroups.length > 0 && (
                <div
                  className={styles.actionReasonList}
                  data-testid="body-reference-v2-action-reasons"
                >
                  {bodyReferenceV2DisabledActionReasonGroups
                    .filter((group) => group.reason !== bodyReferenceV2GenerateActionReason)
                    .map((group) => (
                      <div
                        key={`body-reference-v2-disabled-reason-${group.reason}`}
                        className={styles.actionDisabledReason}
                        data-testid="body-reference-v2-action-reason"
                      >
                        {formatTemplateCreateDisabledActionLabels(group.labels)}: {group.reason}
                      </div>
                    ))}
                </div>
              )}

              <div className={styles.fieldRow}>
                <label className={styles.fieldLabel}>Centerline axis X</label>
                <input
                  className={styles.textInput}
                  type="number"
                  step="0.01"
                  value={bodyReferenceV2Draft.centerline?.xPx ?? ""}
                  disabled={!bodyReferenceV2Draft.centerline}
                  onChange={(event) => {
                    const nextValue = Number(event.target.value);
                    if (!Number.isFinite(nextValue)) return;
                    handleChangeBodyReferenceV2CenterlineX(nextValue);
                  }}
                />
              </div>

              <div className={styles.cutoutFitSummaryGrid}>
                <div className={styles.cutoutFitMetric}>
                  <span className={styles.cutoutFitMetricLabel}>Centerline axis</span>
                  <span className={styles.cutoutFitMetricValue}>{bodyReferenceV2Summary.centerlineCaptured ? "captured" : "missing"}</span>
                </div>
                <div className={styles.cutoutFitMetric}>
                  <span className={styles.cutoutFitMetricLabel}>Body-left outline</span>
                  <span className={styles.cutoutFitMetricValue}>{bodyReferenceV2Summary.bodyLeftCaptured ? "captured" : "missing"}</span>
                </div>
                <div className={styles.cutoutFitMetric}>
                  <span className={styles.cutoutFitMetricLabel}>Accepted v2 draft</span>
                  <span className={styles.cutoutFitMetricValue}>{bodyReferenceV2CaptureReadiness.accepted ? "yes" : "no"}</span>
                </div>
                <div className={styles.cutoutFitMetric}>
                  <span className={styles.cutoutFitMetricLabel}>v2 generation ready</span>
                  <span className={styles.cutoutFitMetricValue}>{bodyReferenceV2CaptureReadiness.generationReady ? "yes" : "no"}</span>
                </div>
              </div>

              {templateCreateDiagnosticsVisible && (
                <details className={styles.compactDetails} open={templateCreateDiagnosticsExpanded}>
                  <summary className={styles.compactDetailsSummary}>
                    v2 reference and scale detail
                  </summary>
                  <div className={styles.compactDetailsContent}>
                  <div className={styles.cutoutFitSummaryGrid}>
                    <div className={styles.cutoutFitMetric}>
                      <span className={styles.cutoutFitMetricLabel}>Mirrored right side</span>
                      <span className={styles.cutoutFitMetricValue}>{bodyReferenceV2Summary.bodyRightMirroredPresent ? "derived" : "missing"}</span>
                    </div>
                    <div className={styles.cutoutFitMetric}>
                      <span className={styles.cutoutFitMetricLabel}>Lid references (excluded)</span>
                      <span className={styles.cutoutFitMetricValue}>{bodyReferenceV2Summary.lidReferenceCount}</span>
                    </div>
                    <div className={styles.cutoutFitMetric}>
                      <span className={styles.cutoutFitMetricLabel}>Handle references (excluded)</span>
                      <span className={styles.cutoutFitMetricValue}>{bodyReferenceV2Summary.handleReferenceCount}</span>
                    </div>
                    <div className={styles.cutoutFitMetric}>
                      <span className={styles.cutoutFitMetricLabel}>Blocked regions (reference-only)</span>
                      <span className={styles.cutoutFitMetricValue}>{bodyReferenceV2Summary.blockedRegionCount}</span>
                    </div>
                    <div className={styles.cutoutFitMetric}>
                      <span className={styles.cutoutFitMetricLabel}>Scale authority</span>
                      <span className={styles.cutoutFitMetricValue}>{formatBodyReferenceV2ScaleSourceLabel(bodyReferenceV2Summary.scaleSource)}</span>
                    </div>
                    <div className={styles.cutoutFitMetric}>
                      <span className={styles.cutoutFitMetricLabel}>Lookup diameter ready</span>
                      <span className={styles.cutoutFitMetricValue}>{bodyReferenceV2Summary.lookupDiameterPresent ? "present" : "missing"}</span>
                    </div>
                    <div className={styles.cutoutFitMetric}>
                      <span className={styles.cutoutFitMetricLabel}>Draft pending acceptance</span>
                      <span className={styles.cutoutFitMetricValue}>{bodyReferenceV2CaptureReadiness.hasDraftChanges ? "yes" : "no"}</span>
                    </div>
                    <div className={styles.cutoutFitMetric}>
                      <span className={styles.cutoutFitMetricLabel}>v1 BODY CUTOUT QA</span>
                      <span className={styles.cutoutFitMetricValue}>available fallback</span>
                    </div>
                    <div className={styles.cutoutFitMetric}>
                      <span className={styles.cutoutFitMetricLabel}>Current QA source</span>
                      <span className={styles.cutoutFitMetricValue}>{bodyReferenceV2CurrentQaSourceLabel}</span>
                    </div>
                  </div>
                  </div>
                </details>
              )}

              <div className={styles.reviewScaffoldNote}>
                {approvedBodyOutline
                  ? "Centerline = mirror axis. Body-left = the operator-reviewed left wall. The right side is derived automatically and stays read-only."
                  : "Accept BODY REFERENCE review first if you want to seed the v2 centerline and body-left outline from the accepted v1 contour."}
              </div>
              <div className={styles.reviewScaffoldNote}>
                {getBodyReferenceV2ReferenceOnlyNote()}
              </div>
              <div className={styles.reviewScaffoldNote}>
                {getBodyReferenceV2WrapExportDistinctionNote()}
              </div>
              {bodyReferenceV2SummaryGuidanceMessages.length > 0 && (
                <div className={styles.cutoutFitWarningList}>
                  {bodyReferenceV2SummaryGuidanceMessages.map((entry) => (
                    <div
                      key={`body-reference-v2-guidance-${entry.level}-${entry.message}`}
                      className={entry.level === "error" ? styles.cutoutFitWarningError : styles.cutoutFitWarning}
                    >
                      {entry.message}
                    </div>
                  ))}
                </div>
              )}

              <div
                className={styles.cutoutFitSummary}
                data-testid="body-reference-v2-mirror-preview"
                data-body-reference-v2-mirror-preview-status={bodyReferenceV2ScaleMirrorPreview.status}
              >
                <div className={styles.cutoutFitSummaryHeader}>
                  <div>
                    <div className={styles.cutoutFitSummaryTitle}>BODY REFERENCE v2 Mirror Preview</div>
                    <div className={styles.cutoutFitSummaryHint}>
                      Preview only. Centerline plus body-left define the mirrored right side and lookup-diameter scale. This does not change BODY CUTOUT QA until you explicitly generate from v2.
                    </div>
                  </div>
                  <span
                    className={
                      bodyReferenceV2ScaleMirrorPreview.status === "pass"
                        ? styles.reviewStatusReady
                        : bodyReferenceV2ScaleMirrorPreview.status === "fail"
                          ? styles.reviewStatusFail
                          : styles.reviewStatusPending
                    }
                  >
                    {bodyReferenceV2ScaleMirrorPreview.status.toUpperCase()}
                  </span>
                </div>

                {(bodyReferenceV2ScaleMirrorPreview.centerline == null && bodyReferenceV2ScaleMirrorPreview.leftBodyPointCount === 0) ? (
                  <div className={styles.cutoutFitWarningList}>
                    <div className={styles.cutoutFitWarning}>Capture the centerline axis.</div>
                    <div className={styles.cutoutFitWarning}>Capture or seed the body-left outline.</div>
                  </div>
                ) : (
                  <>
                    <div className={styles.cutoutFitSummaryGrid}>
                      <div className={styles.cutoutFitMetric}>
                        <span className={styles.cutoutFitMetricLabel}>Centerline axis</span>
                        <span className={styles.cutoutFitMetricValue}>{bodyReferenceV2ScaleMirrorPreview.centerline ? "captured" : "missing"}</span>
                      </div>
                    <div className={styles.cutoutFitMetric}>
                      <span className={styles.cutoutFitMetricLabel}>Body-left points</span>
                      <span className={styles.cutoutFitMetricValue}>{bodyReferenceV2ScaleMirrorPreview.leftBodyPointCount}</span>
                    </div>
                    </div>

                    {templateCreateDiagnosticsVisible && (
                      <details className={styles.compactDetails} open={templateCreateDiagnosticsExpanded}>
                        <summary className={styles.compactDetailsSummary}>
                          Mirror scale and lookup detail
                        </summary>
                        <div className={styles.compactDetailsContent}>
                        <div className={styles.cutoutFitSummaryGrid}>
                          <div className={styles.cutoutFitMetric}>
                            <span className={styles.cutoutFitMetricLabel}>Lookup diameter</span>
                            <span className={styles.cutoutFitMetricValue}>{formatDimensionMetric(bodyReferenceV2ScaleMirrorPreview.lookupDiameterMm)}</span>
                          </div>
                          <div className={styles.cutoutFitMetric}>
                            <span className={styles.cutoutFitMetricLabel}>Lookup variant</span>
                            <span className={styles.cutoutFitMetricValue}>{bodyReferenceV2ScaleMirrorPreview.lookupVariantLabel || "n/a"}</span>
                          </div>
                          <div className={styles.cutoutFitMetric}>
                            <span className={styles.cutoutFitMetricLabel}>Selected size</span>
                            <span className={styles.cutoutFitMetricValue}>{formatLookupSize(bodyReferenceV2ScaleMirrorPreview.lookupSizeOz)}</span>
                          </div>
                          <div className={styles.cutoutFitMetric}>
                            <span className={styles.cutoutFitMetricLabel}>Diameter (px)</span>
                            <span className={styles.cutoutFitMetricValue}>{bodyReferenceV2ScaleMirrorPreview.diameterPx != null ? round2(bodyReferenceV2ScaleMirrorPreview.diameterPx) : "n/a"}</span>
                          </div>
                          <div className={styles.cutoutFitMetric}>
                            <span className={styles.cutoutFitMetricLabel}>mm per px</span>
                            <span className={styles.cutoutFitMetricValue}>{bodyReferenceV2ScaleMirrorPreview.mmPerPx != null ? bodyReferenceV2ScaleMirrorPreview.mmPerPx.toFixed(4) : "n/a"}</span>
                          </div>
                          <div className={styles.cutoutFitMetric}>
                            <span className={styles.cutoutFitMetricLabel}>Derived wrap width</span>
                            <span className={styles.cutoutFitMetricValue}>{formatDimensionMetric(bodyReferenceV2ScaleMirrorPreview.wrapWidthMm)}</span>
                          </div>
                          <div className={styles.cutoutFitMetric}>
                            <span className={styles.cutoutFitMetricLabel}>Full product height</span>
                            <span className={styles.cutoutFitMetricValue}>{formatDimensionMetric(bodyReferenceV2ScaleMirrorPreview.lookupFullProductHeightMm)}</span>
                          </div>
                          <div className={styles.cutoutFitMetric}>
                            <span className={styles.cutoutFitMetricLabel}>Mirrored-right points</span>
                            <span className={styles.cutoutFitMetricValue}>{bodyReferenceV2ScaleMirrorPreview.mirroredRightPointCount}</span>
                          </div>
                          <div className={styles.cutoutFitMetric}>
                            <span className={styles.cutoutFitMetricLabel}>Lookup diameter authority</span>
                            <span className={styles.cutoutFitMetricValue}>{formatLookupAuthority(bodyReferenceV2ScaleMirrorPreview.lookupDimensionAuthority)}</span>
                          </div>
                          <div className={styles.cutoutFitMetric}>
                            <span className={styles.cutoutFitMetricLabel}>Current QA source</span>
                            <span className={styles.cutoutFitMetricValue}>{bodyReferenceV2CurrentQaSourceLabel}</span>
                          </div>
                        </div>
                        </div>
                      </details>
                    )}
                  </>
                )}

                <div className={styles.reviewScaffoldNote}>
                  Mirrored-right is derived automatically. You do not edit it directly.
                </div>
                <div className={styles.reviewScaffoldNote}>
                  Full product height is context only here. Lookup diameter remains the v2 scale authority.
                </div>

                {bodyReferenceV2MirrorGuidanceMessages.length > 0 && (
                  <div className={styles.cutoutFitWarningList}>
                    {bodyReferenceV2MirrorGuidanceMessages.map((entry) => (
                      <div
                        key={`body-reference-v2-mirror-guidance-${entry.level}-${entry.message}`}
                        className={entry.level === "error" ? styles.cutoutFitWarningError : styles.cutoutFitWarning}
                      >
                        {entry.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div
                className={styles.cutoutFitSummary}
                data-testid="body-reference-v2-generation-readiness"
                data-body-reference-v2-generation-status={bodyReferenceV2GenerationReadiness.status}
              >
                <div className={styles.cutoutFitSummaryHeader}>
                  <div>
                    <div className={styles.cutoutFitSummaryTitle}>BODY REFERENCE v2 Generation Readiness</div>
                    <div className={styles.cutoutFitSummaryHint}>
                      v2 generation unlocks only after the accepted v2 capture passes centerline, body-left, lookup-diameter scale, and mirror checks. BODY CUTOUT QA stays body-only and excludes reference and artwork layers.
                    </div>
                  </div>
                  <span
                    className={
                      bodyReferenceV2GenerationReadiness.status === "pass"
                        ? styles.reviewStatusReady
                        : bodyReferenceV2GenerationReadiness.status === "fail"
                          ? styles.reviewStatusFail
                          : styles.reviewStatusPending
                    }
                  >
                    {bodyReferenceV2GenerationReadiness.status.toUpperCase()}
                  </span>
                </div>

                {(bodyReferenceV2GenerationReadiness.centerlineCaptured === false && bodyReferenceV2GenerationReadiness.leftBodyPointCount === 0) ? (
                  <div className={styles.cutoutFitWarningList}>
                    <div className={styles.cutoutFitWarning}>Capture the centerline axis.</div>
                    <div className={styles.cutoutFitWarning}>Capture or seed the body-left outline.</div>
                  </div>
                ) : (
                  <>
                    <div className={styles.cutoutFitSummaryGrid}>
                      <div className={styles.cutoutFitMetric}>
                        <span className={styles.cutoutFitMetricLabel}>Centerline axis</span>
                        <span className={styles.cutoutFitMetricValue}>{bodyReferenceV2GenerationReadiness.centerlineCaptured ? "captured" : "missing"}</span>
                      </div>
                    <div className={styles.cutoutFitMetric}>
                      <span className={styles.cutoutFitMetricLabel}>Body-left points</span>
                      <span className={styles.cutoutFitMetricValue}>{bodyReferenceV2GenerationReadiness.leftBodyPointCount}</span>
                    </div>
                    <div className={styles.cutoutFitMetric}>
                      <span className={styles.cutoutFitMetricLabel}>Accepted draft</span>
                      <span className={styles.cutoutFitMetricValue}>{bodyReferenceV2CaptureReadiness.accepted ? "yes" : "no"}</span>
                    </div>
                  </div>

                    {templateCreateDiagnosticsVisible && (
                      <details className={styles.compactDetails} open={templateCreateDiagnosticsExpanded}>
                        <summary className={styles.compactDetailsSummary}>
                          v2 generation metric detail
                        </summary>
                        <div className={styles.compactDetailsContent}>
                        <div className={styles.cutoutFitSummaryGrid}>
                          <div className={styles.cutoutFitMetric}>
                            <span className={styles.cutoutFitMetricLabel}>Mirrored-right points</span>
                            <span className={styles.cutoutFitMetricValue}>{bodyReferenceV2GenerationReadiness.mirroredRightPointCount}</span>
                          </div>
                          <div className={styles.cutoutFitMetric}>
                            <span className={styles.cutoutFitMetricLabel}>Lookup diameter</span>
                            <span className={styles.cutoutFitMetricValue}>{formatDimensionMetric(bodyReferenceV2GenerationReadiness.lookupDiameterMm)}</span>
                          </div>
                          <div className={styles.cutoutFitMetric}>
                            <span className={styles.cutoutFitMetricLabel}>Diameter (px)</span>
                            <span className={styles.cutoutFitMetricValue}>{bodyReferenceV2GenerationReadiness.diameterPx != null ? round2(bodyReferenceV2GenerationReadiness.diameterPx) : "n/a"}</span>
                          </div>
                          <div className={styles.cutoutFitMetric}>
                            <span className={styles.cutoutFitMetricLabel}>mm per px</span>
                            <span className={styles.cutoutFitMetricValue}>{bodyReferenceV2GenerationReadiness.mmPerPx != null ? bodyReferenceV2GenerationReadiness.mmPerPx.toFixed(4) : "n/a"}</span>
                          </div>
                          <div className={styles.cutoutFitMetric}>
                            <span className={styles.cutoutFitMetricLabel}>Derived wrap width</span>
                            <span className={styles.cutoutFitMetricValue}>{formatDimensionMetric(bodyReferenceV2GenerationReadiness.wrapWidthMm)}</span>
                          </div>
                          <div className={styles.cutoutFitMetric}>
                            <span className={styles.cutoutFitMetricLabel}>Blocked regions</span>
                            <span className={styles.cutoutFitMetricValue}>{bodyReferenceV2GenerationReadiness.blockedRegionCount}</span>
                          </div>
                          <div className={styles.cutoutFitMetric}>
                            <span className={styles.cutoutFitMetricLabel}>Draft pending acceptance</span>
                            <span className={styles.cutoutFitMetricValue}>{bodyReferenceV2CaptureReadiness.hasDraftChanges ? "yes" : "no"}</span>
                          </div>
                          <div className={styles.cutoutFitMetric}>
                            <span className={styles.cutoutFitMetricLabel}>Accepted draft ready</span>
                            <span className={styles.cutoutFitMetricValue}>{acceptedBodyReferenceV2GenerationReadiness?.ready ? "yes" : "no"}</span>
                          </div>
                          <div className={styles.cutoutFitMetric}>
                            <span className={styles.cutoutFitMetricLabel}>Current QA source</span>
                            <span className={styles.cutoutFitMetricValue}>{bodyReferenceV2CurrentQaSourceLabel}</span>
                          </div>
                        </div>
                        </div>
                      </details>
                    )}
                  </>
                )}

                <div className={styles.reviewScaffoldActions}>
                  <button
                    type="button"
                    className={styles.detectBtn}
                    disabled={
                      !bodyReferenceV2CaptureReadiness.generationReady ||
                      generatingReviewedBodyReferenceGlb ||
                      bodyReferenceFineTuneDraftPendingAcceptance
                    }
                    title={bodyReferenceV2GenerateActionReason ?? undefined}
                    onClick={() => {
                      void handleGenerateReviewedBodyReferenceGlb("v2-mirrored-profile");
                    }}
                    data-testid="body-reference-v2-generate"
                  >
                    {generatingReviewedBodyReferenceGlb
                      ? "Generating BODY CUTOUT QA GLB…"
                      : !bodyReferenceV2CaptureReadiness.accepted
                        ? "Accept v2 draft to unlock optional v2 generation"
                        : bodyReferenceV2CaptureReadiness.hasDraftChanges
                          ? "Accept or reset v2 draft changes"
                          : "Generate BODY CUTOUT QA from v2 mirrored profile"}
                  </button>
                </div>
                {bodyReferenceV2GenerateActionReason && (
                  <div
                    className={styles.actionReasonList}
                    data-testid="body-reference-v2-generate-action-reasons"
                  >
                    <div
                      className={styles.actionDisabledReason}
                      data-testid="body-reference-v2-generate-action-reason"
                    >
                      Generate BODY CUTOUT QA from v2 mirrored profile: {bodyReferenceV2GenerateActionReason}
                    </div>
                  </div>
                )}

                <div className={styles.reviewScaffoldNote}>
                  {activeReviewedBodyReferenceAuthority === "BODY REFERENCE v2 mirrored profile"
                    ? "Current source authority: BODY REFERENCE v2 mirrored profile."
                    : bodyReferenceV2SourceAuthorityNote}
                </div>
                <div className={styles.reviewScaffoldNote}>
                  {getBodyReferenceV2ReferenceOnlyNote()}
                </div>
                <div className={styles.reviewScaffoldNote}>
                  {getBodyReferenceV2WrapExportDistinctionNote()}
                </div>

                {bodyReferenceV2GenerationGuidanceMessages.length > 0 && (
                  <div className={styles.cutoutFitWarningList}>
                    {bodyReferenceV2GenerationGuidanceMessages.map((entry) => (
                      <div
                        key={`body-reference-v2-generation-guidance-${entry.level}-${entry.message}`}
                        className={entry.level === "error" ? styles.cutoutFitWarningError : styles.cutoutFitWarning}
                      >
                        {entry.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </div>
            </details>
          </div>
        </div>
      )}

      <div className={inDedicatedTemplateMode ? styles.pageSecondaryGrid : undefined}>

      {/* ── Front / Back face photos ─────────────────────────────── */}
      {productType !== "flat" && (
        <div className={`${styles.section} ${inDedicatedTemplateMode ? styles.pageSection : ""}`}>
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
                    setMirrorForBack(true);
                    setFrontBgStatus("idle");
                  }}
                  onClear={() => { setFrontPhotoDataUrl(""); setFrontOriginalUrl(""); setFrontCleanUrl(""); setFrontBgStatus("idle"); }}
                />
              </div>
              {frontPhotoDataUrl && (
                <div className={styles.bgPreviewGroup}>
                  <div className={styles.bgPreviewItem}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={frontPhotoDataUrl} alt="Front" className={styles.thumbPreview} />
                    {frontBgStatus === "done" && <span className={styles.bgPreviewLabelDone}>BG removed</span>}
                  </div>
                  {frontBgStatus === "idle" && (
                    <button
                      type="button"
                      className={styles.bgRemoveBtn}
                      onClick={async () => {
                        setFrontBgStatus("processing");
                        try {
                          const res = await fetch(frontPhotoDataUrl);
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
                </div>
              )}
            </div>
          </div>

          {/* ── Front captured prompt ── */}
          {frontPhotoDataUrl && !backPhotoDataUrl && !mirrorForBack && (
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
      <div className={`${styles.section} ${inDedicatedTemplateMode ? styles.pageSection : ""}`}>
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
            {glbPath && !glbUploading && (
              <span className={styles.glbPathConfirm}>
                {glbPath} ✓
              </span>
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
          </div>
        </div>

        {glbPath && productType !== "flat" && (
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
      </div>

      {/* ── Physical dimensions ───────────────────────────────────── */}
      <div className={`${styles.section} ${inDedicatedTemplateMode ? styles.pageSection : ""}`}>
        <div className={styles.sectionTitle}>Diameter authority</div>
        <div className={styles.sectionLead}>
          Diameter is the only body scale authority. Other measurements are reference context and do not prove BODY CUTOUT QA scale.
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Diameter (mm) *</label>
          <input
            className={styles.numInput}
            type="number"
            value={diameterMm || ""}
            step={0.1}
            onChange={(e) => setDiameterMm(Number(e.target.value) || 0)}
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Wrap width</label>
          <span className={styles.readOnly}>
            {templateWidthMm > 0 ? `${templateWidthMm} mm` : "\u2014"}{" "}
            <span className={styles.fieldHint}>(Math.PI * diameter)</span>
          </span>
        </div>

        <details className={styles.compactDetails} data-testid="template-reference-dimensions-details">
          <summary className={styles.compactDetailsSummary}>
            Reference dimensions
          </summary>
          <div className={styles.compactDetailsContent}>
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>Reference printable band</label>
              <input
                className={styles.numInput}
                data-testid="template-print-height-input"
                type="number"
                value={printHeightMm || ""}
                step={0.1}
                onChange={(e) => setPrintHeightMm(Number(e.target.value) || 0)}
              />
              <span className={styles.fieldHint}>Used for workspace/export context, not body scale authority.</span>
            </div>

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
              <span className={styles.fieldHint}>Reference only for product context.</span>
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
          </div>
        </details>
      </div>

        {/* ── Engravable zone editor ──────────────────────────────── */}
        {productType !== "flat" && hasAcceptedBodyReferenceReview && approvedBodyOutline && (productPhotoFullUrl || frontPhotoDataUrl) && overallHeightMm > 0 && diameterMm > 0 && (
        <div className={`${styles.section} ${inDedicatedTemplateMode ? styles.pageSection : ""}`}>
          <div className={styles.sectionTitle}>Reference engravable zone</div>
          <div className={styles.sectionLead}>
            This visual band helps workspace/export context. BODY CUTOUT QA scale still comes from diameter plus accepted BODY REFERENCE.
          </div>
          <EngravableZoneEditor
            photoDataUrl={productPhotoFullUrl || frontPhotoDataUrl}
            overallHeightMm={engravableEditorOverallHeightMm}
            topMarginMm={upstreamEngravableEditorTopMarginMm}
            bottomMarginMm={upstreamEngravableEditorBottomMarginMm}
            diameterMm={diameterMm}
            photoScalePct={referencePhotoScalePct}
            photoOffsetYPct={referencePhotoOffsetYPct}
            photoAnchorY={referencePhotoAnchorY}
            bodyColorHex={bodyColorHex}
            rimColorHex={rimColorHex}
            guideFrame={bodyReferenceGuideFrame}
            silverRingIndicatorMm={engravableEditorSilverRingMm}
            appearanceReferenceLayers={engravableEditorAppearanceReferenceLayers}
            bodyOnlyScaleMode={bodyOnlyEditorMode}
            outline={bodyOnlyEditorMode ? approvedBodyOutline : null}
            bodyScaleSource={engravableGuideAuthority?.bodyScaleSource}
            topGuideSource={engravableEditorTopGuideSource}
            bottomGuideSource={engravableEditorBottomGuideSource}
            manualTopOverrideActive={engravableGuideAuthority?.manualTopOverrideActive}
            manualBottomOverrideActive={engravableGuideAuthority?.manualBottomOverrideActive}
            onChange={(top, bottom, changedLine) => {
              let nextTopGuideMm: number;
              let nextBottomGuideMm: number;

              if (bodyOnlyEditorMode && bodyOnlyEditorFrame) {
                const bodyTopOverallMm = bodyOnlyEditorFrame.bodyTopFromOverallMm;
                const bodyBottomOverallMm = bodyOnlyEditorFrame.bodyBottomFromOverallMm;
                const localBottomGuideMm = round2(engravableEditorOverallHeightMm - bottom);
                const currentLocalBottomGuideMm = round2(
                  engravableEditorOverallHeightMm - upstreamEngravableEditorBottomMarginMm,
                );
                const nextLocalTopGuideMm = changedLine === "top"
                  ? top
                  : upstreamEngravableEditorTopMarginMm;
                const nextLocalBottomGuideMm = changedLine === "bottom"
                  ? localBottomGuideMm
                  : currentLocalBottomGuideMm;
                nextTopGuideMm = mapBodyLocalGuideMmToOverallMm({
                  localGuideMm: nextLocalTopGuideMm,
                  bodyTopFromOverallMm: bodyTopOverallMm,
                  bodyBottomFromOverallMm: bodyBottomOverallMm,
                });
                nextBottomGuideMm = mapBodyLocalGuideMmToOverallMm({
                  localGuideMm: nextLocalBottomGuideMm,
                  bodyTopFromOverallMm: bodyTopOverallMm,
                  bodyBottomFromOverallMm: bodyBottomOverallMm,
                });
              } else {
                const bottomGuideMm = round2(overallHeightMm - bottom);
                nextTopGuideMm = changedLine === "top"
                  ? top
                  : upstreamSurfaceTopGuideMm;
                nextBottomGuideMm = changedLine === "bottom"
                  ? bottomGuideMm
                  : upstreamSurfaceBottomGuideMm;
              }

              if (nextBottomGuideMm < nextTopGuideMm) {
                if (changedLine === "top") {
                  nextTopGuideMm = nextBottomGuideMm;
                } else {
                  nextBottomGuideMm = nextTopGuideMm;
                }
              }

              if (changedLine === "top") {
                setPrintableTopOverrideMm(nextTopGuideMm);
              } else {
                setPrintableBottomOverrideMm(nextBottomGuideMm);
              }
              const eng = round2(nextBottomGuideMm - nextTopGuideMm);
              if (eng > 0) setPrintHeightMm(eng);
            }}
            onPhotoScaleChange={setReferencePhotoScalePct}
            onPhotoOffsetYChange={setReferencePhotoOffsetYPct}
            onPhotoAnchorYChange={setReferencePhotoAnchorY}
            onColorsChange={handleAutoSampleColors}
          />
        </div>
      )}

      {/* ── Default laser settings ────────────────────────────────── */}
      <div className={`${styles.section} ${inDedicatedTemplateMode ? styles.pageSection : ""}`}>
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
            onChange={(e) => setMaterialProfileId(e.target.value)}
          >
            <option value="">None</option>
            {KNOWN_MATERIAL_PROFILES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Rotary preset</label>
          <select
            className={styles.selectInput}
            value={rotaryPresetId}
            onChange={(e) => setRotaryPresetId(e.target.value)}
          >
            <option value="">None</option>
            {DEFAULT_ROTARY_PLACEMENT_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      </div>

      {/* ── Errors ────────────────────────────────────────────────── */}
      {!inDedicatedTemplateMode && errors.length > 0 && (
        <div>
          {errors.map((err) => (
            <div key={err} className={styles.error}>{err}</div>
          ))}
        </div>
      )}

      {/* ── Buttons ───────────────────────────────────────────────── */}
      {!inDedicatedTemplateMode && (
        <div className={styles.btnRow}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.saveBtn}
            onClick={handleSave}
            data-testid="template-create-save"
          >
            {isEdit ? "Save changes" : "Save template"}
          </button>
        </div>
      )}

      </div>
      {inDedicatedTemplateMode && (
        <aside className={styles.pageSidebar}>
          <div className={styles.pageSidebarSticky}>
            <section className={styles.pageSidebarCard}>
              <div className={styles.pageSidebarEyebrow}>Current step</div>
              <div className={styles.pageSidebarTitle}>{workflowCurrentStepDisplayLabel}</div>
              <div className={styles.pageSidebarLead}>{workflowNextActionHint}</div>
              <div className={styles.pageSidebarStatusGrid}>
                <div className={styles.pageSidebarStatusItem}>
                  <span className={styles.pageSidebarStatusLabel}>Source</span>
                  <span
                    className={
                      templateCreateSourceReadiness.sourceReady
                        ? styles.workflowReadinessReady
                        : styles.workflowReadinessPending
                    }
                  >
                    {templateCreateSourceReadiness.sourceReady ? "Ready" : "Pending"}
                  </span>
                </div>
                <div className={styles.pageSidebarStatusItem}>
                  <span className={styles.pageSidebarStatusLabel}>Detect</span>
                  <span
                    className={
                      templateCreateSourceReadiness.detectReady
                        ? styles.workflowReadinessReady
                        : styles.workflowReadinessPending
                    }
                  >
                    {templateCreateSourceReadiness.detectReady ? "Actionable" : "Blocked"}
                  </span>
                </div>
                <div className={styles.pageSidebarStatusItem}>
                  <span className={styles.pageSidebarStatusLabel}>Review</span>
                  <span
                    className={
                      hasAcceptedBodyReferenceReview
                        ? styles.workflowReadinessReady
                        : styles.workflowReadinessPending
                    }
                  >
                    {reviewStageLabel}
                  </span>
                </div>
                <div className={styles.pageSidebarStatusItem}>
                  <span className={styles.pageSidebarStatusLabel}>BODY CUTOUT QA</span>
                  <span
                    className={
                      hasReviewedBodyCutoutQaGlb
                        ? styles.workflowReadinessReady
                        : styles.workflowReadinessCurrent
                    }
                  >
                    {qaStageLabel}
                  </span>
                </div>
              </div>
            </section>

            <section className={`${styles.pageSidebarCard} ${styles.pageActionCard}`}>
              <div className={styles.pageSidebarEyebrow}>Pinned actions</div>
              <div className={styles.pageSidebarTitle}>Save or back out cleanly</div>
              <div className={styles.pageSidebarLead}>
                {saveGateReason
                  ? `Save blocked: ${saveGateReason}`
                  : isEdit
                    ? "Changes are ready to save whenever the operator pass is complete."
                    : "Save the template whenever the operator pass is complete."}
              </div>
              {errors.length > 0 && (
                <div className={styles.pageActionErrorList}>
                  {errors.map((err) => (
                    <div key={err} className={styles.error}>{err}</div>
                  ))}
                </div>
              )}
              <div className={styles.pageActionButtons}>
                <button
                  type="button"
                  className={`${styles.cancelBtn} ${styles.pageActionButton}`}
                  onClick={onCancel}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`${styles.saveBtn} ${styles.pageActionButton}`}
                  onClick={handleSave}
                  data-testid="template-create-save"
                >
                  {isEdit ? "Save changes" : "Save template"}
                </button>
              </div>
            </section>

            <section className={styles.pageSidebarCard}>
              <div className={styles.pageSidebarEyebrow}>Operator checks</div>
              <div className={styles.pageSidebarMiniGrid}>
                <div className={styles.pageSidebarMetric}>
                  <span className={styles.pageSidebarMetricLabel}>WRAP / EXPORT</span>
                  <span className={styles.pageSidebarMetricValue}>{wrapExportStageLabel}</span>
                </div>
                <div className={styles.pageSidebarMetric}>
                  <span className={styles.pageSidebarMetricLabel}>Appearance refs</span>
                  <span className={styles.pageSidebarMetricValue}>{appearanceReferenceStageLabel}</span>
                </div>
                <div className={styles.pageSidebarMetric}>
                  <span className={styles.pageSidebarMetricLabel}>BODY REFERENCE v2</span>
                  <span className={styles.pageSidebarMetricValue}>{bodyReferenceV2OperatorState.label}</span>
                </div>
                <div className={styles.pageSidebarMetric}>
                  <span className={styles.pageSidebarMetricLabel}>Exit path</span>
                  <span className={styles.pageSidebarMetricValue}>Shared save/cancel/back</span>
                </div>
              </div>
            </section>

            <section className={styles.pageSidebarCard}>
              <div className={styles.pageSidebarEyebrow}>Mode boundaries</div>
              <ul className={styles.pageSidebarList}>
                <li>BODY CUTOUT QA stays body proof only.</li>
                <li>WRAP / EXPORT stays placement and export proof only.</li>
                <li>BODY REFERENCE v2 stays optional beneath accepted v1 by default.</li>
                <li>Debug mode exposes audit and hash detail; normal mode keeps operator checks visible.</li>
              </ul>
            </section>
          </div>
        </aside>
      )}
      </div>

      {/* ── Tumbler mapping wizard modal ── */}
      {showMappingWizard && glbPath && (
        <TumblerMappingWizard
          glbPath={glbPath}
          diameterMm={diameterMm}
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
}
