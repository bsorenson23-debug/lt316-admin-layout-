"use client";

import React from "react";
import dynamic from "next/dynamic";
import type { ProductTemplate, TumblerMapping } from "@/types/productTemplate";
import type { AutoDetectResult } from "@/lib/autoDetect";
import type { TumblerItemLookupResponse } from "@/types/tumblerItemLookup";
import type { PreviewModelMode } from "@/lib/tumblerPreviewModelState";
import { detectTumblerFromImage } from "@/lib/autoDetect";
import { lookupTumblerItem } from "@/lib/tumblerItemLookup";
import { KNOWN_MATERIAL_PROFILES } from "@/data/materialProfiles";
import { DEFAULT_ROTARY_PLACEMENT_PRESETS } from "@/data/rotaryPlacementPresets";
import { saveTemplate, updateTemplate } from "@/lib/templateStorage";
import { generateThumbnail } from "@/lib/generateThumbnail";
import { findTumblerProfileIdForBrandModel, getTumblerProfileById, getProfileHandleArcDeg } from "@/data/tumblerProfiles";
import { getDefaultLaserSettings } from "@/lib/scopedDefaults";
import { getEngravableDimensions } from "@/lib/engravableDimensions";
import {
  buildTemplateCreateWorkflowSteps,
  deriveTemplateCreateWorkflowStep,
  getTemplateCreateSaveGateReason,
  getTemplateCreateSourceReadiness,
} from "@/lib/templateCreateFlow";
import {
  getBodyReferencePreviewModeHint,
  getBodyReferencePreviewModeLabel,
  getDrinkwareGlbStatusLabel,
  isBodyCutoutQaPreviewAvailable,
} from "@/lib/bodyReferencePreviewIntent";
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
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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

function resolveDefaultPreviewModelMode(args: {
  glbPath: string;
  glbStatus?: ProductTemplate["glbStatus"] | null;
}): PreviewModelMode {
  if (args.glbStatus === "generated-reviewed-model") {
    return "body-cutout-qa";
  }
  if (args.glbPath.trim()) {
    return "full-model";
  }
  return "alignment-model";
}

function buildPreviewTumblerDimensions(args: {
  productType: ProductTemplate["productType"];
  diameterMm: number;
  printHeightMm: number;
  overallHeightMm: number;
}): TumblerDimensions | null {
  if (args.productType === "flat") return null;
  if (!Number.isFinite(args.diameterMm) || args.diameterMm <= 0) return null;
  if (!Number.isFinite(args.printHeightMm) || args.printHeightMm <= 0) return null;
  return {
    overallHeightMm:
      Number.isFinite(args.overallHeightMm) && args.overallHeightMm > 0
        ? args.overallHeightMm
        : args.printHeightMm,
    diameterMm: args.diameterMm,
    printableHeightMm: args.printHeightMm,
  };
}

export function TemplateCreateForm({ onSave, onCancel, editingTemplate }: Props) {
  const isEdit = Boolean(editingTemplate);
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
  const [thumbDataUrl, setThumbDataUrl] = React.useState(editingTemplate?.thumbnailDataUrl ?? "");
  const [glbPath, setGlbPath] = React.useState(editingTemplate?.glbPath ?? "");
  const [glbFileName, setGlbFileName] = React.useState<string | null>(null);
  const [glbUploading, setGlbUploading] = React.useState(false);
  const [glbUploadError, setGlbUploadError] = React.useState<string | null>(null);
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
  const [hasAcceptedBodyReferenceReview, setHasAcceptedBodyReferenceReview] = React.useState(
    () => Boolean(
      editingTemplate?.dimensions.canonicalBodyProfile
      && editingTemplate?.dimensions.canonicalDimensionCalibration,
    ),
  );
  const [previewModelMode, setPreviewModelMode] = React.useState<PreviewModelMode>(
    () => resolveDefaultPreviewModelMode({
      glbPath: editingTemplate?.glbPath ?? "",
      glbStatus: editingTemplate?.glbStatus,
    }),
  );

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
    if (lookupResult?.modelStatus) return lookupResult.modelStatus;
    if (editingTemplate?.glbPath?.trim() === glbPath.trim() && editingTemplate.glbStatus) {
      return editingTemplate.glbStatus;
    }
    if (!glbPath.trim()) return "missing-model";
    return "verified-product-model";
  }, [editingTemplate?.glbPath, editingTemplate?.glbStatus, glbPath, lookupResult?.modelStatus]);

  const activeDrinkwareGlbSourceLabel = React.useMemo(() => {
    return lookupResult?.modelSourceLabel ?? editingTemplate?.glbSourceLabel ?? null;
  }, [editingTemplate?.glbSourceLabel, lookupResult?.modelSourceLabel]);

  const previewTumblerDims = React.useMemo(
    () => buildPreviewTumblerDimensions({
      productType,
      diameterMm,
      printHeightMm,
      overallHeightMm,
    }),
    [diameterMm, overallHeightMm, printHeightMm, productType],
  );

  const workflowInput = React.useMemo(
    () => ({
      productType,
      hasProductImage: Boolean(productImageFile || productPhotoFullUrl),
      hasStagedDetectResult: Boolean(detectResult || lookupResult),
      hasAcceptedReview: hasAcceptedBodyReferenceReview,
      hasCanonicalBodyProfile: Boolean(editingTemplate?.dimensions.canonicalBodyProfile),
      hasCanonicalDimensionCalibration: Boolean(editingTemplate?.dimensions.canonicalDimensionCalibration),
    }),
    [
      detectResult,
      editingTemplate?.dimensions.canonicalBodyProfile,
      editingTemplate?.dimensions.canonicalDimensionCalibration,
      hasAcceptedBodyReferenceReview,
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
  const saveGateReason = React.useMemo(
    () => getTemplateCreateSaveGateReason(workflowInput),
    [workflowInput],
  );

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
    setHasAcceptedBodyReferenceReview(false);
    setPreviewModelMode(resolveDefaultPreviewModelMode({
      glbPath,
      glbStatus: activeDrinkwareGlbStatus,
    }));
  }, [activeDrinkwareGlbStatus, glbPath]);

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

    if (args.outsideDiameterMm) {
      setDiameterMm(round2(args.outsideDiameterMm));
    } else if (matchedProfile?.outsideDiameterMm) {
      setDiameterMm(round2(matchedProfile.outsideDiameterMm));
    } else if (args.topDiameterMm && args.bottomDiameterMm) {
      setDiameterMm(round2((args.topDiameterMm + args.bottomDiameterMm) / 2));
    }

    if (args.usableHeightMm) {
      setPrintHeightMm(round2(args.usableHeightMm));
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

    if (args.overallHeightMm) {
      setOverallHeightMm(round2(args.overallHeightMm));
    }
    if (args.overallHeightMm && args.usableHeightMm) {
      const topM = round2((args.overallHeightMm - args.usableHeightMm) / 2);
      const bottomM = round2(Math.max(0, args.overallHeightMm - args.usableHeightMm - topM));
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
      setLookupResult(result);

      const parts: string[] = [];
      if (result.brand) parts.push(result.brand);
      if (result.model) parts.push(result.model);
      if (result.capacityOz) parts.push(`${result.capacityOz}oz`);
      setName(parts.length > 0 ? parts.join(" ") : result.title ?? raw);
      if (result.brand) setBrand(result.brand);
      if (result.capacityOz) setCapacity(`${result.capacityOz}oz`);
      setProductType("tumbler");
      setGlbPath(result.glbPath || "");

      applyProfileOrDimensions({
        brand: result.brand,
        model: result.model,
        capacityOz: result.capacityOz,
        outsideDiameterMm: result.dimensions.outsideDiameterMm,
        topDiameterMm: result.dimensions.topDiameterMm,
        bottomDiameterMm: result.dimensions.bottomDiameterMm,
        overallHeightMm: result.dimensions.overallHeightMm,
        usableHeightMm: result.dimensions.usableHeightMm,
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
    const template: ProductTemplate = {
      id: editingTemplate?.id ?? crypto.randomUUID(),
      name: name.trim(),
      brand: brand.trim(),
      capacity: capacity.trim(),
      laserType,
      productType,
      thumbnailDataUrl: thumbDataUrl,
      productPhotoFullUrl: productPhotoFullUrl || undefined,
      glbPath,
      dimensions: {
        diameterMm,
        printHeightMm,
        templateWidthMm,
        handleArcDeg,
        taperCorrection,
        overallHeightMm: overallHeightMm > 0 ? overallHeightMm : undefined,
        topMarginMm: Number.isFinite(topMarginMm) ? topMarginMm : undefined,
        bottomMarginMm: Number.isFinite(bottomMarginMm) ? bottomMarginMm : undefined,
        referencePhotoScalePct: Number.isFinite(referencePhotoScalePct) ? referencePhotoScalePct : undefined,
        referencePhotoOffsetYPct: Number.isFinite(referencePhotoOffsetYPct) ? referencePhotoOffsetYPct : undefined,
        referencePhotoAnchorY,
        bodyColorHex: bodyColorHex || undefined,
        rimColorHex: rimColorHex || undefined,
      },
      laserSettings: {
        power,
        speed,
        frequency,
        lineInterval,
        materialProfileId,
        rotaryPresetId,
      },
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
    <div className={styles.form}>
      {/* ── Product identity ──────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Product identity</div>

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
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Product image</div>

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
              {lookupResult && (
                <button
                  type="button"
                  className={styles.lookupResetBtn}
                  onClick={() => {
                    setLookupResult(null);
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
              >
                {lookingUpItem ? "Looking up..." : "Run lookup"}
              </button>
            </div>

            {lookupResult && (
              <div className={styles.lookupSummary}>
                <div className={styles.lookupSummaryHeader}>
                  <div className={styles.lookupSummaryTitle}>
                    {lookupResult.title || name || "Resolved item"}
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
                  {lookupResult.glbPath && <span>3D ready</span>}
                </div>
              </div>
            )}

            {lookupError && <div className={styles.detectErrorBanner}>{lookupError}</div>}

            {lookupResult?.fitDebug && lookupDebugImageUrl && (
              <TumblerLookupDebugPanel
                debug={lookupResult.fitDebug}
                imageUrl={lookupDebugImageUrl}
              />
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
        <div className={styles.section} data-body-reference-review-scaffold="present">
          <div className={styles.sectionTitle}>BODY REFERENCE review scaffold</div>

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
                Current step: {workflowCurrentStep}
              </span>
            </div>

            {!templateCreateSourceReadiness.detectReady && templateCreateSourceReadiness.blockedReason && (
              <div className={styles.workflowBlockedNote}>
                {templateCreateSourceReadiness.blockedReason}
              </div>
            )}
          </div>

          <div className={styles.reviewScaffoldCard}>
            <div className={styles.reviewScaffoldHeader}>
              <div>
                <div className={styles.reviewScaffoldTitle}>Review handoff</div>
                <div className={styles.reviewScaffoldHint}>
                  This branch adds the review/viewer seam only. Later BODY CUTOUT QA runtime-truth and cutout work will attach to these controls.
                </div>
              </div>
              <span
                className={
                  hasAcceptedBodyReferenceReview
                    ? styles.reviewStatusReady
                    : styles.reviewStatusPending
                }
              >
                {hasAcceptedBodyReferenceReview ? "Accepted" : "Pending review"}
              </span>
            </div>

            <div className={styles.reviewScaffoldActions}>
              <button
                type="button"
                className={styles.detectBtn}
                disabled={!workflowInput.hasStagedDetectResult || hasAcceptedBodyReferenceReview}
                onClick={() => {
                  setHasAcceptedBodyReferenceReview(true);
                  setPreviewModelMode(resolveDefaultPreviewModelMode({
                    glbPath,
                    glbStatus: activeDrinkwareGlbStatus,
                  }));
                }}
              >
                {hasAcceptedBodyReferenceReview ? "BODY REFERENCE accepted" : "Accept BODY REFERENCE review"}
              </button>
              <button
                type="button"
                className={styles.detectBtn}
                disabled
              >
                Generate BODY CUTOUT QA GLB
              </button>
            </div>

            <div className={styles.reviewScaffoldMeta}>
              {!workflowInput.hasStagedDetectResult && (
                <div className={styles.reviewScaffoldNote}>
                  Run auto-detect or lookup first so the later BODY REFERENCE review state has something to accept.
                </div>
              )}
              {workflowInput.hasStagedDetectResult && !hasAcceptedBodyReferenceReview && (
                <div className={styles.reviewScaffoldNote}>
                  Detection is staged. Accepting BODY REFERENCE review here creates the clean handoff point for later fine-tune and lineage work.
                </div>
              )}
              {hasAcceptedBodyReferenceReview && (
                <div className={styles.reviewScaffoldNote}>
                  Reviewed GLB generation and BODY CUTOUT QA stay scaffolded in this PR. The later runtime-truth layer will wire these actions to the authoritative reviewed cutout.
                </div>
              )}
              {saveGateReason && (
                <div className={styles.reviewScaffoldNote}>
                  Save gate preview: {saveGateReason}
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

            <div className={styles.previewScaffold} data-body-reference-preview-scaffold="present">
              <div className={styles.previewScaffoldHeader}>
                <div>
                  <div className={styles.previewScaffoldTitle}>
                    {getBodyReferencePreviewModeLabel({
                      productType,
                      mode: previewModelMode,
                      glbStatus: activeDrinkwareGlbStatus,
                    })}
                  </div>
                  <div className={styles.previewScaffoldHint}>
                    {getBodyReferencePreviewModeHint({
                      productType,
                      mode: previewModelMode,
                    })}
                  </div>
                </div>
                {getDrinkwareGlbStatusLabel(activeDrinkwareGlbStatus) && (
                  <span className={styles.previewScaffoldBadge}>
                    {getDrinkwareGlbStatusLabel(activeDrinkwareGlbStatus)}
                  </span>
                )}
              </div>

              <div className={styles.previewModeRow}>
                <button
                  type="button"
                  className={`${styles.detectBtn} ${previewModelMode === "alignment-model" ? styles.detectBtnActive : ""}`}
                  aria-pressed={previewModelMode === "alignment-model"}
                  onClick={() => setPreviewModelMode("alignment-model")}
                >
                  Alignment
                </button>
                <button
                  type="button"
                  className={`${styles.detectBtn} ${previewModelMode === "full-model" ? styles.detectBtnActive : ""}`}
                  disabled={!glbPath.trim()}
                  aria-pressed={previewModelMode === "full-model"}
                  onClick={() => setPreviewModelMode("full-model")}
                >
                  Full model
                </button>
                <button
                  type="button"
                  className={`${styles.detectBtn} ${previewModelMode === "body-cutout-qa" ? styles.detectBtnActive : ""}`}
                  disabled={!isBodyCutoutQaPreviewAvailable(activeDrinkwareGlbStatus)}
                  aria-pressed={previewModelMode === "body-cutout-qa"}
                  onClick={() => setPreviewModelMode("body-cutout-qa")}
                >
                  Body cutout QA
                </button>
                <button
                  type="button"
                  className={`${styles.detectBtn} ${previewModelMode === "source-traced" ? styles.detectBtnActive : ""}`}
                  disabled={!glbPath.trim()}
                  aria-pressed={previewModelMode === "source-traced"}
                  onClick={() => setPreviewModelMode("source-traced")}
                >
                  Source compare
                </button>
              </div>

              {!glbPath.trim() && (
                <div className={styles.previewPlaceholderNote}>
                  Load or resolve a source model to surface the reviewed model preview in this review flow.
                </div>
              )}
              {!isBodyCutoutQaPreviewAvailable(activeDrinkwareGlbStatus) && (
                <div className={styles.previewPlaceholderNote}>
                  BODY CUTOUT QA stays reserved until a reviewed body-only GLB exists.
                </div>
              )}

              <div className={styles.previewSurface}>
                {glbPath.trim() && previewTumblerDims ? (
                  <div className={styles.previewViewerWrap}>
                    <ModelViewer
                      modelUrl={glbPath}
                      glbPath={glbPath}
                      bedWidthMm={templateWidthMm > 0 ? templateWidthMm : undefined}
                      bedHeightMm={printHeightMm > 0 ? printHeightMm : undefined}
                      tumblerDims={previewTumblerDims}
                      handleArcDeg={handleArcDeg}
                      tumblerMapping={tumblerMapping}
                      bodyTintColor={bodyColorHex}
                      rimTintColor={rimColorHex}
                      showTemplateSurfaceZones={previewModelMode === "alignment-model"}
                      previewModelMode={previewModelMode}
                      sourceModelStatus={activeDrinkwareGlbStatus}
                      sourceModelLabel={activeDrinkwareGlbSourceLabel}
                    />
                  </div>
                ) : (
                  <div className={styles.previewSurfacePlaceholder}>
                    Reviewed model preview mounts here once a drinkware model path is available.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Front / Back face photos ─────────────────────────────── */}
      {productType !== "flat" && (
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
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Physical dimensions</div>

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
          <label className={styles.fieldLabel}>Print height (mm) *</label>
          <input
            className={styles.numInput}
            type="number"
            value={printHeightMm || ""}
            step={0.1}
            onChange={(e) => setPrintHeightMm(Number(e.target.value) || 0)}
          />
        </div>

        <div className={styles.fieldRow}>
          <label className={styles.fieldLabel}>Template width</label>
          <span className={styles.readOnly}>
            {templateWidthMm > 0 ? `${templateWidthMm} mm` : "\u2014"}{" "}
            <span className={styles.fieldHint}>(auto-calculated)</span>
          </span>
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
      </div>

      {/* ── Engravable zone editor ──────────────────────────────── */}
      {productType !== "flat" && frontPhotoDataUrl && overallHeightMm > 0 && diameterMm > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Engravable zone</div>
          <EngravableZoneEditor
            photoDataUrl={frontPhotoDataUrl}
            overallHeightMm={overallHeightMm}
            topMarginMm={topMarginMm}
            bottomMarginMm={bottomMarginMm}
            diameterMm={diameterMm}
            photoScalePct={referencePhotoScalePct}
            photoOffsetYPct={referencePhotoOffsetYPct}
            photoAnchorY={referencePhotoAnchorY}
            bodyColorHex={bodyColorHex}
            rimColorHex={rimColorHex}
            onChange={(top, bottom) => {
              setTopMarginMm(top);
              setBottomMarginMm(bottom);
              // Keep printHeightMm in sync
              const eng = round2(overallHeightMm - top - bottom);
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

      {/* ── Errors ────────────────────────────────────────────────── */}
      {errors.length > 0 && (
        <div>
          {errors.map((err) => (
            <div key={err} className={styles.error}>{err}</div>
          ))}
        </div>
      )}

      {/* ── Buttons ───────────────────────────────────────────────── */}
      <div className={styles.btnRow}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={styles.saveBtn} onClick={handleSave}>
          {isEdit ? "Save changes" : "Save template"}
        </button>
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


