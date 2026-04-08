"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BedConfig,
  DEFAULT_BED_CONFIG,
  PlacedItem,
  SvgAsset,
  normalizeBedConfig,
} from "@/types/admin";
import {
  createSvgLibraryAsset,
  fetchSvgLibraryAssets,
  updateSvgLibraryAsset,
} from "@/lib/svgLibraryClient";
import { SvgAssetLibraryPanel } from "./SvgAssetLibraryPanel";
import { LaserBedWorkspace } from "./LaserBedWorkspace";
import type { FramePreviewProp, BedMockupConfig, FlatBedItemOverlay } from "./LaserBedWorkspace";
import { BedSettingsPanel } from "./BedSettingsPanel";
import { TumblerAutoDetectPanel } from "./TumblerAutoDetectPanel";
import { Model3DPanel } from "./Model3DPanel";
import { TumblerPlacementView } from "./TumblerPlacementView";
import { AccordionSection } from "./AccordionSection";
import { TumblerExportPanel, type PreflightNavTarget } from "./TumblerExportPanel";
import { SelectedItemInspector } from "./SelectedItemInspector";
import { OrdersPanel } from "./OrdersPanel";
import { MaterialProfilePanel } from "./MaterialProfilePanel";
import type { ActiveMaterialSettings } from "./MaterialProfilePanel";
import { ProofMockupPanel } from "./ProofMockupPanel";
import { SprCalibrationPanel } from "./SprCalibrationPanel";
import { BatchQueuePanel } from "./BatchQueuePanel";
import { MachineProfilePanel } from "./MachineProfilePanel";
import { ExportHistoryPanel } from "./ExportHistoryPanel";
import { RotaryPresetSharePanel } from "./RotaryPresetSharePanel";
import { LightBurnPathSettingsPanel } from "./LightBurnPathSettingsPanel";
import { TextPersonalizationPanel } from "./TextPersonalizationPanel";
import { CameraOverlayPanel } from "./CameraOverlayPanel";
import { TextToolPanel } from "./TextToolPanel";
import { RasterToSvgPanel, type RasterToSvgPreviewState } from "./RasterToSvgPanel";
import { TestGridPanel } from "./TestGridPanel";
import { GridSettingsPanel } from "./GridSettingsPanel";
import { FlatBedItemPanel } from "./FlatBedItemPanel";
import { FlatBedAutoDetectPanel } from "./FlatBedAutoDetectPanel";
import { ColorLayerPanel } from "./ColorLayerPanel";
import { SvgLibraryGallery } from "./SvgLibraryGallery";
import { LensQuickSelect } from "./LensQuickSelect";
import { JobRunnerOverlay } from "./JobRunnerOverlay";
import { WorkflowRail, type WorkflowRailStep } from "./WorkflowRail";
import { CurrentJobCard, type JobQuickAction } from "./CurrentJobCard";
import { RunReadinessPanel, type RunReadinessItem } from "./RunReadinessPanel";
import { type LaserLayer, buildDefaultLayers } from "@/types/laserLayer";
import { FiberColorCalibrationPanel } from "./FiberColorCalibrationPanel";
import { TemplateGallery } from "./TemplateGallery";
import { TemplateCreateForm } from "./TemplateCreateForm";
import { getTemplateEffectiveCylinderDiameterMm, type ProductTemplate } from "@/types/productTemplate";
import type { OrderJobRecipe, OrderRecord, OrderRecipePlacedItem } from "@/types/orders";
import { loadTemplates, updateTemplate } from "@/lib/templateStorage";
import { getEngravableDimensions } from "@/lib/engravableDimensions";
import { inferFlatFamilyKey } from "@/lib/flatItemFamily";
import { getPrintableSurfaceResolutionFromDimensions } from "@/lib/printableSurface";
import { getTumblerWrapLayout } from "@/utils/tumblerWrapLayout";
import { getMaterialProfileById } from "@/data/materialProfiles";
import type { LightBurnExportPayload } from "@/types/export";
import {
  LASER_PROFILE_STATE_CHANGED_EVENT,
  getActiveLaserAndLens,
} from "@/utils/laserProfileState";
import { buildLightBurnExportArtifacts, mapLogoPlacementToWrapRegion } from "@/utils/tumblerExportPlacement";
import { buildLightBurnLbrn } from "@/utils/lightBurnLbrnExport";
import { buildLightBurnAlignmentGuideSvg, buildLightBurnExportSvg } from "@/utils/lightBurnSvgExport";
import { useAdminWorkspacePersistence } from "./hooks/useAdminWorkspacePersistence";
import { useQueueRunnerState } from "./hooks/useQueueRunnerState";
import { useTemplateWorkflow } from "./hooks/useTemplateWorkflow";
import { useAssetWorkflow } from "./hooks/useAssetWorkflow";
import { useTemplateModalState } from "./hooks/useTemplateModalState";
import { ModalDialog } from "./shared/ModalDialog";
import { getRotaryPresets } from "@/utils/adminCalibrationState";
import styles from "./AdminLayoutShell.module.css";

function buildActiveMaterialSettings(profileId: string): ActiveMaterialSettings | null {
  if (!profileId) return null;

  const profile = getMaterialProfileById(profileId);
  if (!profile) return null;

  return {
    label: profile.label,
    powerPct: profile.powerPct,
    maxPowerPct: profile.maxPowerPct,
    speedMmS: profile.speedMmS,
    lpi: profile.lpi,
    passes: profile.passes,
  };
}

function getTemplateFallbackIcon(productType: ProductTemplate["productType"]): string {
  switch (productType) {
    case "mug":
      return "MG";
    case "bottle":
      return "BT";
    case "flat":
      return "FL";
    case "tumbler":
    default:
      return "TB";
  }
}

function readActiveLaserSetup() {
  try {
    return getActiveLaserAndLens();
  } catch {
    return null;
  }
}

function cloneRecipePlacedItems(items: OrderRecipePlacedItem[]): PlacedItem[] {
  return items.map((item, index) => ({
    ...item,
    id: `item-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
    documentBounds: { ...item.documentBounds },
    artworkBounds: { ...item.artworkBounds },
    defaults: { ...item.defaults },
  }));
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.closest("[contenteditable='true']")) return true;

  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.getAttribute("role") === "textbox";
}

const CURRENT_JOB_BASENAME = "current-job";

function inferTopSafeOffsetMm(
  bedConfig: BedConfig,
  printableSurfaceContract?: ProductTemplate["dimensions"]["printableSurfaceContract"] | null,
  bodyTopMm?: number | null,
): number | undefined {
  if (printableSurfaceContract && Number.isFinite(printableSurfaceContract.printableTopMm) && Number.isFinite(bodyTopMm)) {
    const delta = printableSurfaceContract.printableTopMm - (bodyTopMm ?? 0);
    return delta > 0 ? Number(delta.toFixed(2)) : 0;
  }
  const overallHeightMm = bedConfig.tumblerOverallHeightMm;
  const usableHeightMm = bedConfig.tumblerUsableHeightMm;
  if (!Number.isFinite(overallHeightMm) || !Number.isFinite(usableHeightMm)) {
    return undefined;
  }
  const delta = ((overallHeightMm ?? 0) - (usableHeightMm ?? 0)) / 2;
  return delta > 0 ? Number(delta.toFixed(2)) : 0;
}

async function preprocessPayloadForCurrentJob(
  payload: LightBurnExportPayload,
): Promise<LightBurnExportPayload> {
  try {
    const response = await fetch("/api/admin/lightburn/preprocess-svg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: payload.items.map((item) => ({
          id: item.id,
          svgText: item.svgText,
        })),
      }),
    });

    if (!response.ok) {
      return payload;
    }

    const data = (await response.json()) as {
      items?: Array<{
        id: string;
        svgText: string;
      }>;
    };

    const byId = new Map((data.items ?? []).map((item) => [item.id, item.svgText]));
    return {
      ...payload,
      items: payload.items.map((item) => {
        const preprocessedSvg = byId.get(item.id);
        return preprocessedSvg ? { ...item, svgText: preprocessedSvg } : item;
      }),
    };
  } catch {
    return payload;
  }
}

async function saveCurrentJobFile(args: {
  outputFolderPath: string;
  filename: string;
  content: string;
}): Promise<void> {
  const response = await fetch("/api/admin/lightburn/save-export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });

  const payload = (await response.json()) as { saved?: boolean; error?: string };
  if (!response.ok || !payload.saved) {
    throw new Error(payload.error ?? `Failed to save ${args.filename}`);
  }
}

export function AdminLayoutShell() {
  const router = useRouter();

  // -- Bed config -----------------------------------------------------------
  const [bedConfig, setBedConfig] = useState<BedConfig>(DEFAULT_BED_CONFIG);

  // -- Asset library --------------------------------------------------------
  const [svgAssets, setSvgAssets] = useState<SvgAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [placementAssetId, setPlacementAssetId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [inspectorNote, setInspectorNote] = useState<string | null>(null);

  // -- Placed items ---------------------------------------------------------
  const [placedItems, setPlacedItems] = useState<PlacedItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // -- Frame preview --------------------------------------------------------
  const [framePreview, setFramePreview] = useState<FramePreviewProp | null>(null);

  // -- Material profile -----------------------------------------------------
  const [materialSettings, setMaterialSettings] = useState<ActiveMaterialSettings | null>(null);
  const [selectedMaterialProfileId, setSelectedMaterialProfileId] = useState("");

  // -- Tumbler mockup overlay -----------------------------------------------
  const [mockupConfig, setMockupConfig] = useState<BedMockupConfig | null>(null);

  // -- Flat bed item footprint overlay --------------------------------------
  const [flatBedItemOverlay, setFlatBedItemOverlay] = useState<FlatBedItemOverlay | null>(null);

  // -- Tumbler view mode (grid vs 3D placement) ----------------------------
  const [tumblerViewMode, setTumblerViewMode] = useState<"grid" | "3d-placement">("grid");

  // -- Product photo overlay on grid ----------------------------------------
  const [overlayMode, setOverlayMode] = useState<"schematic" | "photo" | "off">("schematic");
  const [overlayOpacity, setOverlayOpacity] = useState(12); // percent (5–50)
  const [overlayBlend, setOverlayBlend] = useState<"normal" | "multiply">("normal");
  const [twoSidedMode, setTwoSidedMode] = useState(false);
  const [taperWarpEnabled, setTaperWarpEnabled] = useState(true);
  const [lbOutputFolderPath, setLbOutputFolderPath] = useState<string | undefined>(undefined);
  const [curvedOverlay, setCurvedOverlay] = useState(false);
  const [bgRemovalStatus, setBgRemovalStatus] = useState<"idle" | "running" | "done" | "failed">("idle");

  // -- Engravable safe zone ---------------------------------------------------
  const [engravableZone, setEngravableZone] = useState<import("@/types/admin").EngravableZone | null>(null);

  // -- Screenshot export from Konva stage ------------------------------------
  const konvaStageRef = useRef<import("konva").default.Stage | null>(null);
  const handleStageRef = useCallback((stage: import("konva").default.Stage | null) => {
    konvaStageRef.current = stage;
  }, []);
  const handleScreenshot = useCallback(() => {
    const stage = konvaStageRef.current;
    if (!stage) return;
    const dataUrl = stage.toDataURL({ pixelRatio: 2 });
    const link = document.createElement("a");
    link.download = `lt316-proof-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  }, []);

  // -- Model body tint color -------------------------------------------------
  const [bodyTintColor, setBodyTintColor] = useState<string>("#b0b8c4");

  // -- Color laser layers ---------------------------------------------------
  const [laserLayers, setLaserLayers] = useState<LaserLayer[]>(buildDefaultLayers);
  const [rotaryAutoPlacementEnabled, setRotaryAutoPlacementEnabled] = useState(false);
  const [selectedRotaryPresetId, setSelectedRotaryPresetId] = useState("");

  // -- Product template system -----------------------------------------------
  const [selectedTemplate, setSelectedTemplate] = useState<ProductTemplate | null>(null);
  const [modelViewerResetKey, setModelViewerResetKey] = useState(0);
  const [activeLaserSetup, setActiveLaserSetup] = useState(readActiveLaserSetup);

  const {
    showTemplateGallery,
    showCreateForm,
    editingTemplate,
    toastMessage,
    setShowTemplateGallery,
    setShowCreateForm,
    setToastMessage,
    openTemplateGallery,
    closeTemplateGallery,
    openCreateTemplate,
    handleEditTemplate,
    handleDeleteTemplate,
    cancelCreateTemplate,
    showToast,
  } = useTemplateModalState({
    selectedTemplate,
    setSelectedTemplate,
  });

  const handleUpdateLayer = useCallback((layer: LaserLayer) => {
    setLaserLayers(prev => prev.map(l => l.id === layer.id ? layer : l));
  }, []);

  const { didRestorePersistedState } = useAdminWorkspacePersistence({
    bedConfig,
    setBedConfig,
    placedItems,
    setPlacedItems,
    laserLayers,
    setLaserLayers,
    setSelectedMaterialProfileId,
    setMaterialSettings,
    setLbOutputFolderPath,
    buildMaterialSettings: buildActiveMaterialSettings,
    normalizeBedConfig,
  });

  useEffect(() => {
    if (!didRestorePersistedState) return;

    let cancelled = false;
    void (async () => {
      try {
        const result = await fetchSvgLibraryAssets();
        if (cancelled) return;
        setSvgAssets(result.assets);
        setSelectedAssetId((prev) => {
          if (prev && result.assets.some((asset) => asset.id === prev)) {
            return prev;
          }
          return result.assets[0]?.id ?? null;
        });
        setUploadError(null);
      } catch (error) {
        if (cancelled) return;
        setUploadError(error instanceof Error ? error.message : "Failed to load SVG library");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [didRestorePersistedState]);

  useEffect(() => {
    const syncActiveLaserSetup = () => setActiveLaserSetup(readActiveLaserSetup());
    syncActiveLaserSetup();
    window.addEventListener("storage", syncActiveLaserSetup);
    window.addEventListener("focus", syncActiveLaserSetup);
    window.addEventListener(LASER_PROFILE_STATE_CHANGED_EVENT, syncActiveLaserSetup);
    return () => {
      window.removeEventListener("storage", syncActiveLaserSetup);
      window.removeEventListener("focus", syncActiveLaserSetup);
      window.removeEventListener(LASER_PROFILE_STATE_CHANGED_EVENT, syncActiveLaserSetup);
    };
  }, []);

  // -- Derived --------------------------------------------------------------
  const isTumblerMode = bedConfig.workspaceMode === "tumbler-wrap";
  const is3DPlacement = isTumblerMode && tumblerViewMode === "3d-placement";
  const placementAsset = svgAssets.find((a) => a.id === placementAssetId) ?? null;
  const templateEngravableDims = React.useMemo(() => {
    if (!isTumblerMode || !selectedTemplate) return null;
    return getEngravableDimensions(selectedTemplate);
  }, [isTumblerMode, selectedTemplate]);
  const selectedTemplateEffectiveDiameterMm = React.useMemo(
    () => (selectedTemplate ? getTemplateEffectiveCylinderDiameterMm(selectedTemplate) : 0),
    [selectedTemplate],
  );
  const templatePrintableSurface = React.useMemo(() => {
    if (!selectedTemplate) return null;
    return getPrintableSurfaceResolutionFromDimensions(
      selectedTemplate.dimensions,
      selectedTemplate.dimensions.canonicalDimensionCalibration,
    );
  }, [selectedTemplate]);

  // Tumbler dimensions — shared between left panel preview and center 3D view
  const tumblerDims = React.useMemo(() => {
    if (!isTumblerMode || bedConfig.tumblerDiameterMm <= 0) return null;
    const overallHeightMm =
      templateEngravableDims?.totalHeightMm ??
      bedConfig.tumblerOverallHeightMm ??
      bedConfig.height;
    const printableHeightMm =
      templateEngravableDims?.printableHeightMm ??
      bedConfig.tumblerUsableHeightMm ??
      bedConfig.tumblerPrintableHeightMm ??
      bedConfig.height;
    const printableTopOffsetMm =
      templateEngravableDims?.printableSurfaceContract?.printableTopMm ??
      templateEngravableDims?.topMarginMm ??
      Math.max(0, (overallHeightMm - printableHeightMm) / 2);
    return {
      overallHeightMm,
      diameterMm: bedConfig.tumblerDiameterMm,
      topDiameterMm: bedConfig.tumblerTopDiameterMm,
      bottomDiameterMm: bedConfig.tumblerBottomDiameterMm,
      bodyTopOffsetMm: templateEngravableDims?.bodyTopOffsetMm,
      bodyHeightMm: templateEngravableDims?.engravableHeightMm,
      printableHeightMm,
      printableTopOffsetMm,
      lidSeamFromOverallMm: selectedTemplate?.dimensions.lidSeamFromOverallMm,
      silverBandBottomFromOverallMm: selectedTemplate?.dimensions.silverBandBottomFromOverallMm,
    };
  }, [
    isTumblerMode,
    bedConfig,
    selectedTemplate?.dimensions.lidSeamFromOverallMm,
    selectedTemplate?.dimensions.silverBandBottomFromOverallMm,
    templateEngravableDims,
  ]);

  const isPlacementArmed = placementAsset !== null;
  const selectedItem = placedItems.find((p) => p.id === selectedItemId) ?? null;
  const selectedTemplatePrintHeightMm =
    templateEngravableDims?.engravableHeightMm ?? selectedTemplate?.dimensions.printHeightMm ?? 0;
  const activeHandleArcDeg =
    selectedTemplate?.tumblerMapping?.handleArcDeg ??
    selectedTemplate?.dimensions.handleArcDeg ??
    0;
  const rimTintColor = selectedTemplate?.dimensions.rimColorHex ?? "#d0d0d0";
  const flatPreview = React.useMemo(() => {
    if (!selectedTemplate || selectedTemplate.productType !== "flat") return null;
    const widthMm = selectedTemplate.dimensions.templateWidthMm;
    const heightMm = selectedTemplate.dimensions.printHeightMm;
    if (!(widthMm > 0) || !(heightMm > 0)) return null;
    return {
      widthMm,
      heightMm,
      thicknessMm: selectedTemplate.dimensions.flatThicknessMm ?? 4,
      familyKey: inferFlatFamilyKey({
        familyKey: selectedTemplate.dimensions.flatFamilyKey,
        glbPath: selectedTemplate.glbPath,
        label: selectedTemplate.name,
      }),
      label: selectedTemplate.name,
    };
  }, [selectedTemplate]);

  React.useEffect(() => {
    setBodyTintColor(selectedTemplate?.dimensions.bodyColorHex ?? "#b0b8c4");
  }, [selectedTemplate?.id, selectedTemplate?.dimensions.bodyColorHex]);

  React.useEffect(() => {
    if (!isTumblerMode || !selectedTemplate || !templateEngravableDims) return;

    setBedConfig((prev) => {
      const nextWorkspaceHeight = templateEngravableDims.engravableHeightMm;
      const nextUsableHeight = templateEngravableDims.printableHeightMm;
      const nextOverallHeight = templateEngravableDims.totalHeightMm;
      const nextWidth = templateEngravableDims.circumferenceMm;

      if (
        Math.abs((prev.tumblerPrintableHeightMm ?? 0) - nextWorkspaceHeight) < 0.01 &&
        Math.abs((prev.tumblerUsableHeightMm ?? 0) - nextUsableHeight) < 0.01 &&
        Math.abs((prev.tumblerOverallHeightMm ?? 0) - nextOverallHeight) < 0.01 &&
        Math.abs((prev.tumblerTemplateWidthMm ?? 0) - nextWidth) < 0.01 &&
        Math.abs((prev.tumblerTemplateHeightMm ?? 0) - nextWorkspaceHeight) < 0.01
      ) {
        return prev;
      }

      return normalizeBedConfig({
        ...prev,
        tumblerDiameterMm: templateEngravableDims.diameterMm,
        tumblerOutsideDiameterMm: templateEngravableDims.diameterMm,
        tumblerPrintableHeightMm: nextWorkspaceHeight,
        tumblerUsableHeightMm: nextUsableHeight,
        tumblerOverallHeightMm: nextOverallHeight,
        tumblerTemplateWidthMm: nextWidth,
        tumblerTemplateHeightMm: nextWorkspaceHeight,
      });
    });
  }, [isTumblerMode, selectedTemplate, templateEngravableDims]);

  React.useEffect(() => {
    if (!isTumblerMode || !selectedTemplate || !templateEngravableDims) {
      setEngravableZone(null);
      return;
    }

    const fullWrapW = templateEngravableDims.circumferenceMm;
    const printableSurfaceLocalTop = templateEngravableDims.printableTopFromBodyTopMm;
    const printableSurfaceLocalBottom = templateEngravableDims.printableBottomFromBodyTopMm;
    const printableSurfaceLocalCenter = (printableSurfaceLocalTop + printableSurfaceLocalBottom) / 2;
    const wrapMapping = selectedTemplate.dimensions.canonicalDimensionCalibration?.wrapMappingMm;
    const logoRegion = mapLogoPlacementToWrapRegion({
      templateWidthMm: fullWrapW,
      templateHeightMm: templateEngravableDims.engravableHeightMm,
      calibration: selectedTemplate.dimensions.canonicalDimensionCalibration ?? null,
      stamp: selectedTemplate.manufacturerLogoStamp ?? null,
    });
    const layout = getTumblerWrapLayout(activeHandleArcDeg);
    const frontCenterX = wrapMapping?.frontMeridianMm ?? (fullWrapW * layout.frontCenterRatio);
    const backCenterX = wrapMapping?.backMeridianMm ?? (layout.backCenterRatio == null ? null : fullWrapW * layout.backCenterRatio);
    const handleCenterX = wrapMapping?.handleMeridianMm ?? (layout.handleCenterRatio == null ? null : fullWrapW * layout.handleCenterRatio);
    let zoneW = Math.max(0, Math.min(templateEngravableDims.printableWidthMm, fullWrapW));
    if (zoneW <= 0) zoneW = fullWrapW;
    let zoneX = frontCenterX - zoneW / 2;
    if (zoneX < 0 || zoneX + zoneW > fullWrapW) {
      zoneX = 0;
      zoneW = fullWrapW;
    }
    const bodyTopMm = selectedTemplate.dimensions.bodyTopFromOverallMm ??
      selectedTemplate.dimensions.canonicalDimensionCalibration?.lidBodyLineMm ??
      0;
    const lidBoundaryY = templatePrintableSurface?.printableSurfaceContract.axialExclusions.find((band) => band.kind === "lid")?.endMm;
    const rimBoundaryY = templatePrintableSurface?.printableSurfaceContract.axialExclusions.find((band) => band.kind === "rim-ring")?.endMm;
    const nextZone = {
      x: zoneX,
      y: printableSurfaceLocalTop,
      width: zoneW,
      height: templateEngravableDims.printableHeightMm,
      printableTopY: printableSurfaceLocalTop,
      printableBottomY: printableSurfaceLocalBottom,
      printableCenterY: printableSurfaceLocalCenter,
      lidBoundaryY: lidBoundaryY != null ? Math.max(0, lidBoundaryY - bodyTopMm) : null,
      rimBoundaryY: rimBoundaryY != null ? Math.max(0, rimBoundaryY - bodyTopMm) : null,
      printableDetectionWeak: templateEngravableDims.automaticPrintableDetectionWeak,
      frontCenterX,
      backCenterX,
      leftQuarterX: wrapMapping?.leftQuarterMm ?? null,
      rightQuarterX: wrapMapping?.rightQuarterMm ?? null,
      handleCenterX,
      handleKeepOutStartX: wrapMapping?.handleKeepOutStartMm ?? null,
      handleKeepOutEndX: wrapMapping?.handleKeepOutEndMm ?? null,
      handleKeepOutWraps:
        wrapMapping?.handleKeepOutStartMm != null &&
        wrapMapping?.handleKeepOutEndMm != null &&
        wrapMapping.handleKeepOutStartMm > wrapMapping.handleKeepOutEndMm,
      logoCenterX: logoRegion?.centerXMm ?? null,
      logoCenterY: logoRegion?.centerYMm ?? null,
      logoWidth: logoRegion?.widthMm ?? null,
      logoHeight: logoRegion?.heightMm ?? null,
      logoWraps: logoRegion?.wrapsAround ?? false,
      logoConfidence: logoRegion?.confidence ?? null,
    };

    setEngravableZone((prev) => {
      if (
        prev &&
        Math.abs(prev.x - nextZone.x) < 0.01 &&
        Math.abs(prev.y - nextZone.y) < 0.01 &&
        Math.abs(prev.width - nextZone.width) < 0.01 &&
        Math.abs(prev.height - nextZone.height) < 0.01 &&
        Math.abs((prev.printableTopY ?? -1) - (nextZone.printableTopY ?? -1)) < 0.01 &&
        Math.abs((prev.printableBottomY ?? -1) - (nextZone.printableBottomY ?? -1)) < 0.01 &&
        Math.abs((prev.printableCenterY ?? -1) - (nextZone.printableCenterY ?? -1)) < 0.01 &&
        Math.abs((prev.lidBoundaryY ?? -1) - (nextZone.lidBoundaryY ?? -1)) < 0.01 &&
        Math.abs((prev.rimBoundaryY ?? -1) - (nextZone.rimBoundaryY ?? -1)) < 0.01 &&
        Boolean(prev.printableDetectionWeak) === Boolean(nextZone.printableDetectionWeak) &&
        Math.abs(prev.frontCenterX - nextZone.frontCenterX) < 0.01 &&
        Math.abs((prev.backCenterX ?? -1) - (nextZone.backCenterX ?? -1)) < 0.01 &&
        Math.abs((prev.leftQuarterX ?? -1) - (nextZone.leftQuarterX ?? -1)) < 0.01 &&
        Math.abs((prev.rightQuarterX ?? -1) - (nextZone.rightQuarterX ?? -1)) < 0.01 &&
        Math.abs((prev.handleCenterX ?? -1) - (nextZone.handleCenterX ?? -1)) < 0.01 &&
        Math.abs((prev.handleKeepOutStartX ?? -1) - (nextZone.handleKeepOutStartX ?? -1)) < 0.01 &&
        Math.abs((prev.handleKeepOutEndX ?? -1) - (nextZone.handleKeepOutEndX ?? -1)) < 0.01 &&
        Boolean(prev.handleKeepOutWraps) === Boolean(nextZone.handleKeepOutWraps) &&
        Math.abs((prev.logoCenterX ?? -1) - (nextZone.logoCenterX ?? -1)) < 0.01 &&
        Math.abs((prev.logoCenterY ?? -1) - (nextZone.logoCenterY ?? -1)) < 0.01 &&
        Math.abs((prev.logoWidth ?? -1) - (nextZone.logoWidth ?? -1)) < 0.01 &&
        Math.abs((prev.logoHeight ?? -1) - (nextZone.logoHeight ?? -1)) < 0.01 &&
        Boolean(prev.logoWraps) === Boolean(nextZone.logoWraps) &&
        Math.abs((prev.logoConfidence ?? -1) - (nextZone.logoConfidence ?? -1)) < 0.001
      ) {
        return prev;
      }
      return nextZone;
    });
  }, [isTumblerMode, selectedTemplate, templateEngravableDims, templatePrintableSurface, activeHandleArcDeg]);

  const {
    handleUploadAssets,
    handleRemoveAsset,
    handleClearAssets,
    handlePlaceAsset,
    handlePlaceSelectedAssetOnBed,
    handleSelectItem,
    handleUpdateItem,
    handleNudgeSelected,
    handleClearWorkspace,
    handleDeleteItem,
    handleResetItem,
    handleAlignItem,
    handleNormalizeItem,
    handleCenterSelectedBetweenGuides,
    handleApplyTumblerDraft,
    handleWorkspaceModeChange,
  } = useAssetWorkflow({
    bedConfig,
    activeHandleArcDeg,
    isTumblerMode,
    engravableZone,
    svgAssets,
    selectedAssetId,
    placementAssetId,
    selectedItemId,
    setSvgAssets,
    setSelectedAssetId,
    setPlacementAssetId,
    setUploadError,
    setInspectorNote,
    setPlacedItems,
    setSelectedItemId,
    setBedConfig,
    setTumblerViewMode,
    normalizeBedConfig,
  });

  const {
    handleMaterialProfileSelection,
    handleTemplateSelect,
    handleUpdateCalibration,
  } = useTemplateWorkflow({
    bedConfig,
    normalizeBedConfig,
    selectedTemplate,
    setSelectedMaterialProfileId,
    setMaterialSettings,
    setBedConfig,
    setSelectedRotaryPresetId,
    setRotaryAutoPlacementEnabled,
    setSelectedTemplate,
    setMockupConfig,
    setFlatBedItemOverlay,
    setShowTemplateGallery,
    setShowCreateForm,
    setBgRemovalStatus,
    setEngravableZone,
    setToastMessage,
    bumpModelViewerResetKey: () => setModelViewerResetKey((value) => value + 1),
    buildMaterialSettings: buildActiveMaterialSettings,
  });

  // Derived list of asset names for order capture
  const assetNames = svgAssets.map((a) => a.name);

  // Right panel tab + accordion
  const [rightTab, setRightTab] = useState<"workflow" | "tools" | "setup">("workflow");
  const [svgDoctorOpenSignal, setSvgDoctorOpenSignal] = useState(0);
  const [showSvgLibraryModal, setShowSvgLibraryModal] = useState(false);
  const [svgDoctorPreview, setSvgDoctorPreview] = useState<RasterToSvgPreviewState | null>(null);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [showOrders, setShowOrders] = useState(true);
  const [showJobRunnerOverlay, setShowJobRunnerOverlay] = useState(false);
  const productStepActionRef = useRef<HTMLButtonElement | null>(null);
  const artworkStepActionRef = useRef<HTMLButtonElement | null>(null);
  const workspaceStepSectionRef = useRef<HTMLElement | null>(null);
  const runCheckSectionRef = useRef<HTMLDivElement | null>(null);
  const exportStepSectionRef = useRef<HTMLDivElement | null>(null);
  const handleAccordionToggle = useCallback((id: string) => {
    setOpenSection((prev) => (prev === id ? null : id));
  }, []);

  const focusAndPulseTarget = useCallback((element: HTMLElement | null) => {
    window.setTimeout(() => {
      if (!(element instanceof HTMLElement)) return;

      if (
        !element.hasAttribute("tabindex") &&
        !["BUTTON", "INPUT", "SELECT", "TEXTAREA", "A"].includes(element.tagName)
      ) {
        element.setAttribute("tabindex", "-1");
      }

      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.focus({ preventScroll: true });
      element.classList.add("preflight-pulse");
      window.setTimeout(() => element.classList.remove("preflight-pulse"), 1000);
    }, 220);
  }, []);

  const focusAndPulseElement = useCallback((elementId: string) => {
    focusAndPulseTarget(document.getElementById(elementId));
  }, [focusAndPulseTarget]);

  const handlePreflightNav = useCallback((target: PreflightNavTarget) => {
    if (target === "top-anchor") {
      router.push("/admin/calibration");
      return;
    }

    setRightTab("workflow");

    if (target === "cylinder-diameter" || target === "template-dimensions") {
      setOpenSection("bed");
    }

    const targetIdByNav: Record<Exclude<PreflightNavTarget, "top-anchor">, string> = {
      "rotary-preset": "rotary-preset-select",
      "cylinder-diameter": "bed-cylinder-diameter",
      "template-dimensions": "bed-template-dimensions",
    };

    focusAndPulseElement(targetIdByNav[target]);
  }, [focusAndPulseElement, router]);

  const handleOpenSvgDoctor = useCallback(() => {
    setRightTab("tools");
    setSvgDoctorOpenSignal((prev) => prev + 1);
  }, []);

  const handleOpenSvgLibrary = useCallback(() => {
    setShowSvgLibraryModal(true);
  }, []);

  const handleCloseSvgLibrary = useCallback(() => {
    setShowSvgLibraryModal(false);
  }, []);

  const handleWorkflowSectionNav = useCallback((sectionId: string, focusId: string) => {
    setRightTab("workflow");
    setOpenSection(sectionId);
    focusAndPulseElement(focusId);
  }, [focusAndPulseElement]);

  const handleWorkflowStepNav = useCallback((step: "product" | "artwork" | "placement" | "run-check" | "export") => {
    if (step === "product") {
      if (!selectedTemplate) {
        openTemplateGallery();
        return;
      }
      focusAndPulseTarget(productStepActionRef.current);
      return;
    }

    if (step === "artwork") {
      focusAndPulseTarget(artworkStepActionRef.current);
      return;
    }

    if (step === "placement") {
      focusAndPulseTarget(workspaceStepSectionRef.current);
      return;
    }

    if (step === "run-check") {
      setRightTab("workflow");
      focusAndPulseTarget(runCheckSectionRef.current);
      return;
    }

    setRightTab("workflow");
    focusAndPulseTarget(exportStepSectionRef.current);
  }, [focusAndPulseTarget, openTemplateGallery, selectedTemplate]);

  const handleOpenJobBoard = useCallback(() => {
    setShowOrders(true);
    setShowJobRunnerOverlay(true);
  }, []);

  const syncOrderToLightBurnWatchedFolder = useCallback(async (
    order: OrderRecord,
    snapshot: BedConfig,
    recipeItems: PlacedItem[],
  ) => {
    const outputFolderPath = lbOutputFolderPath?.trim();
    if (!outputFolderPath || recipeItems.length === 0) {
      return;
    }

    const selectedPreset = order.jobRecipe?.rotaryPresetId
      ? getRotaryPresets().find((preset) => preset.id === order.jobRecipe?.rotaryPresetId) ?? null
      : null;
    const materialSettings = order.jobRecipe?.materialProfileId
      ? buildActiveMaterialSettings(order.jobRecipe.materialProfileId) ?? undefined
      : undefined;
    const printableSurfaceContract =
      selectedTemplate?.dimensions.printableSurfaceContract ??
      selectedTemplate?.dimensions.canonicalDimensionCalibration?.printableSurfaceContract ??
      null;
    const axialSurfaceBands =
      selectedTemplate?.dimensions.axialSurfaceBands ??
      selectedTemplate?.dimensions.canonicalDimensionCalibration?.axialSurfaceBands ??
      null;
    const bodyTopMm =
      selectedTemplate?.dimensions.bodyTopFromOverallMm ??
      selectedTemplate?.dimensions.canonicalDimensionCalibration?.lidBodyLineMm ??
      null;
    const placementProfile = {
      overallHeightMm: snapshot.tumblerOverallHeightMm ?? snapshot.height,
      usableHeightMm: snapshot.tumblerUsableHeightMm ?? snapshot.height,
      topToSafeZoneStartMm: inferTopSafeOffsetMm(snapshot, printableSurfaceContract, bodyTopMm),
      bottomMarginMm: undefined,
      topAnchorMode: "physical-top" as const,
    };

    try {
      const exportArtifacts = buildLightBurnExportArtifacts({
        includeLightBurnSetup: snapshot.workspaceMode === "tumbler-wrap",
        bedConfig: snapshot,
        workspaceMode: snapshot.workspaceMode,
        templateWidthMm: snapshot.width,
        templateHeightMm: snapshot.height,
        calibration: selectedTemplate?.dimensions.canonicalDimensionCalibration ?? null,
        printableSurfaceContract,
        axialSurfaceBands,
        manufacturerLogoStamp: selectedTemplate?.manufacturerLogoStamp ?? null,
        lockedProductionGeometry: Boolean(selectedTemplate && !selectedTemplate.dimensions.advancedGeometryOverridesUnlocked),
        items: recipeItems,
        rotary: {
          enabled: Boolean(order.jobRecipe?.rotaryAutoPlacementEnabled),
          preset: selectedPreset,
          anchorMode: "physical-top",
          placementProfile,
        },
      });
      const preprocessedPayload = await preprocessPayloadForCurrentJob(exportArtifacts.artworkPayload);
      const sidecarPayload = JSON.stringify({
        artwork: exportArtifacts.artworkPayload,
        alignmentGuides: exportArtifacts.alignmentGuides,
        setup: exportArtifacts.sidecar,
        setupSummary: exportArtifacts.setupSummary,
        materialSettings: materialSettings ?? null,
      }, null, 2);
      const svgContent = buildLightBurnExportSvg(exportArtifacts.artworkPayload);
      const guideSvgContent = exportArtifacts.alignmentGuides
        ? buildLightBurnAlignmentGuideSvg(exportArtifacts.alignmentGuides)
        : null;
      const lbrnContent = buildLightBurnLbrn(
        preprocessedPayload,
        materialSettings,
        undefined,
        { mode: "minimal" },
      );

      await Promise.all([
        saveCurrentJobFile({
          outputFolderPath,
          filename: `${CURRENT_JOB_BASENAME}.lbrn2`,
          content: lbrnContent,
        }),
        saveCurrentJobFile({
          outputFolderPath,
          filename: `${CURRENT_JOB_BASENAME}.svg`,
          content: svgContent,
        }),
        ...(guideSvgContent
          ? [saveCurrentJobFile({
              outputFolderPath,
              filename: `${CURRENT_JOB_BASENAME}.alignment-guides.svg`,
              content: guideSvgContent,
            })]
          : []),
        saveCurrentJobFile({
          outputFolderPath,
          filename: `${CURRENT_JOB_BASENAME}.lightburn.json`,
          content: sidecarPayload,
        }),
      ]);
    } catch (error) {
      setToastMessage(
        `Loaded ${order.customerName}, but couldn't refresh current-job in the watched LightBurn folder: ${
          error instanceof Error ? error.message : "Unknown save error"
        }`,
      );
    }
  }, [lbOutputFolderPath, selectedTemplate, setToastMessage]);

  const handleLoadOrder = useCallback((order: OrderRecord) => {
    const snapshot = normalizeBedConfig(order.bedConfigSnapshot);
    const recipeItems = order.jobRecipe?.placedItems?.length
      ? cloneRecipePlacedItems(order.jobRecipe.placedItems)
      : [];
    const matchedAsset = [
      ...(order.jobRecipe?.assetIds ?? []).map((assetId) => svgAssets.find((asset) => asset.id === assetId) ?? null),
      ...order.assetNames.map((assetName) => svgAssets.find((asset) => asset.name === assetName) ?? null),
    ]
      .find((asset): asset is SvgAsset => asset !== null) ?? null;
    const assignedTemplate = order.assignedTemplateId
      ? loadTemplates().find((template) => template.id === order.assignedTemplateId) ?? null
      : null;

    setPlacedItems([]);
    setSelectedItemId(null);
    setPlacementAssetId(null);
    setFramePreview(null);
    setMockupConfig(null);
    setFlatBedItemOverlay(null);
    setTumblerViewMode("grid");
    setSelectedAssetId(matchedAsset?.id ?? null);
    setOpenSection(null);
    setRightTab("workflow");
    void syncOrderToLightBurnWatchedFolder(order, snapshot, recipeItems);

    if (assignedTemplate) {
      handleTemplateSelect(assignedTemplate);
      if (order.jobRecipe?.materialProfileId) {
        handleMaterialProfileSelection(order.jobRecipe.materialProfileId);
      }
      if (typeof order.jobRecipe?.rotaryAutoPlacementEnabled === "boolean") {
        setRotaryAutoPlacementEnabled(order.jobRecipe.rotaryAutoPlacementEnabled);
      }
      if (typeof order.jobRecipe?.rotaryPresetId === "string") {
        setSelectedRotaryPresetId(order.jobRecipe.rotaryPresetId);
      }
      setBedConfig((previous) =>
        normalizeBedConfig({
          ...previous,
          gridSpacing: snapshot.gridSpacing,
          snapToGrid: snapshot.snapToGrid,
          showOrigin: snapshot.showOrigin,
          showCrosshair: snapshot.showCrosshair,
          crosshairMode: snapshot.crosshairMode,
          originPosition: snapshot.originPosition,
          showTumblerGuideBand: snapshot.showTumblerGuideBand,
          tumblerBrand: snapshot.tumblerBrand,
          tumblerModel: snapshot.tumblerModel,
          tumblerProfileId: snapshot.tumblerProfileId,
          tumblerCapacityOz: snapshot.tumblerCapacityOz,
          tumblerHasHandle: snapshot.tumblerHasHandle,
          tumblerShapeType: snapshot.tumblerShapeType,
          tumblerGuideBand: snapshot.tumblerGuideBand,
          tumblerTopDiameterMm: snapshot.tumblerTopDiameterMm,
          tumblerBottomDiameterMm: snapshot.tumblerBottomDiameterMm,
        }),
      );
      if (recipeItems.length > 0) {
        setPlacedItems(recipeItems);
        setSelectedItemId(recipeItems[recipeItems.length - 1]?.id ?? null);
        setInspectorNote(
          `Loaded ${recipeItems.length} saved placement item${recipeItems.length === 1 ? "" : "s"} for ${order.customerName}.`,
        );
        setToastMessage(
          `Loaded ${assignedTemplate.name} and restored the saved recipe for ${order.customerName}.`,
        );
        return;
      }
      setInspectorNote(
        matchedAsset
          ? `Setup loaded for ${order.customerName}. ${matchedAsset.name} is selected for placement.`
          : `Setup loaded for ${order.customerName}. Place this job's artwork next.`,
      );
      setToastMessage(`Loaded ${assignedTemplate.name} for ${order.customerName}.`);
      return;
    }

    setSelectedTemplate(null);
    setMaterialSettings(null);
    setSelectedMaterialProfileId("");
    setSelectedRotaryPresetId("");
    setRotaryAutoPlacementEnabled(false);
    setEngravableZone(null);
    setBedConfig(snapshot);
    if (order.jobRecipe?.materialProfileId) {
      handleMaterialProfileSelection(order.jobRecipe.materialProfileId);
    }
    if (typeof order.jobRecipe?.rotaryAutoPlacementEnabled === "boolean") {
      setRotaryAutoPlacementEnabled(order.jobRecipe.rotaryAutoPlacementEnabled);
    }
    if (typeof order.jobRecipe?.rotaryPresetId === "string") {
      setSelectedRotaryPresetId(order.jobRecipe.rotaryPresetId);
    }
    if (recipeItems.length > 0) {
      setPlacedItems(recipeItems);
      setSelectedItemId(recipeItems[recipeItems.length - 1]?.id ?? null);
    }
    setInspectorNote(
      recipeItems.length > 0
        ? `Loaded the saved recipe for ${order.customerName}. Verify product setup before running.`
        : order.assignedTemplateId
        ? `Assigned template for ${order.customerName} is missing. Saved bed settings were loaded instead.`
        : matchedAsset
          ? `Saved setup loaded for ${order.customerName}. ${matchedAsset.name} is selected for placement.`
          : `Saved setup loaded for ${order.customerName}. Stage or choose the product template next.`,
    );
    setToastMessage(
      recipeItems.length > 0
        ? `Loaded the saved recipe for ${order.customerName}.`
        : order.assignedTemplateId
        ? `Assigned template could not be found for ${order.customerName}. Loaded the saved bed settings instead.`
        : `Loaded saved setup for ${order.customerName}.`,
    );
  }, [
    handleMaterialProfileSelection,
    handleTemplateSelect,
    syncOrderToLightBurnWatchedFolder,
    setToastMessage,
    svgAssets,
  ]);

  const {
    queuedJobCount,
    runnableOrders,
    activeQueueOrder,
    currentJobProductLabel,
    handleActivateQueuedOrder,
    handleLoadNextQueuedOrder,
    handleReopenCurrentQueuedJob,
    handleDoneAndLoadNextQueuedOrder,
    handleCompleteQueuedOrder,
  } = useQueueRunnerState({ onLoadOrder: handleLoadOrder });

  const handleAddGeneratedSvgAsset = useCallback(async (svgContent: string, fileName: string) => {
    try {
      const asset = await createSvgLibraryAsset({ name: fileName, svgText: svgContent });
      setSvgAssets((prev) => [asset, ...prev.filter((entry) => entry.id !== asset.id)]);
      setSelectedAssetId(asset.id);
      setUploadError(null);
      setInspectorNote("Saved SVG to library");
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Could not save generated SVG");
    }
  }, []);

  const handleUpdateSvgLibraryAssetEntry = useCallback(async (
    assetId: string,
    patch: { name?: string; svgText?: string },
    successNote = "Updated SVG in library",
  ) => {
    const currentAsset = svgAssets.find((asset) => asset.id === assetId);
    if (!currentAsset) return null;

    try {
      const nextAsset = await updateSvgLibraryAsset({
        id: currentAsset.id,
        name: patch.name,
        svgText: patch.svgText,
      });

      setPlacedItems((placedPrev) =>
        placedPrev.map((item) =>
          item.assetId !== currentAsset.id
            ? item
            : {
                ...item,
                name: nextAsset.name,
                ...(patch.svgText
                  ? {
                      svgText: nextAsset.content,
                      sourceSvgText: nextAsset.content,
                      documentBounds: { ...nextAsset.documentBounds },
                      artworkBounds: { ...nextAsset.artworkBounds },
                    }
                  : {}),
              },
        ),
      );
      setSvgAssets((prev) => prev.map((asset) => (asset.id === currentAsset.id ? nextAsset : asset)));
      setInspectorNote(successNote);
      setUploadError(null);
      return nextAsset;
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Could not update SVG");
      return null;
    }
  }, [setInspectorNote, setPlacedItems, setSvgAssets, setUploadError, svgAssets]);

  const handleReplaceSelectedSvgAsset = useCallback(async (svgContent: string) => {
    if (!selectedAssetId) return;
    await handleUpdateSvgLibraryAssetEntry(
      selectedAssetId,
      { svgText: svgContent },
      "Updated selected SVG in library",
    );
  }, [handleUpdateSvgLibraryAssetEntry, selectedAssetId]);

  const handleApplyFlatBedItem = useCallback((
    item: import("@/data/flatBedItems").FlatBedItem,
    imageSrc?: string,
    imageNaturalWidth?: number,
    imageNaturalHeight?: number,
  ) => {
    setFlatBedItemOverlay({
      itemId: item.id,
      widthMm: item.widthMm,
      heightMm: item.heightMm,
      thicknessMm: item.thicknessMm,
      label: item.label,
      category: item.category,
      material: item.material,
      materialLabel: item.materialLabel,
      productHint: item.productHint,
      imageSrc,
      imageNaturalWidth,
      imageNaturalHeight,
    });
  }, []);

  const activeFlatBedItemId = flatBedItemOverlay?.itemId ?? null;
  const selectedAsset = svgAssets.find((asset) => asset.id === selectedAssetId) ?? null;
  const currentMaterialContext = React.useMemo(() => {
    if (!isTumblerMode && flatBedItemOverlay?.material) {
      return {
        materialSlug: flatBedItemOverlay.material,
        materialLabel: flatBedItemOverlay.materialLabel ?? flatBedItemOverlay.material,
        productHint: flatBedItemOverlay.productHint ?? null,
      };
    }

    if (selectedTemplate?.materialSlug) {
      return {
        materialSlug: selectedTemplate.materialSlug,
        materialLabel: selectedTemplate.materialLabel ?? selectedTemplate.materialSlug,
        productHint:
          selectedTemplate.productType === "tumbler" ||
          selectedTemplate.productType === "mug" ||
          selectedTemplate.productType === "bottle"
            ? "tumbler"
            : null,
      };
    }

    return {
      materialSlug: null,
      materialLabel: null,
      productHint: null,
    };
  }, [flatBedItemOverlay, isTumblerMode, selectedTemplate]);

  const handleCameraCapture = useCallback((dataUrl: string) => {
    const img = new Image();
    img.onload = () => {
      setMockupConfig({
        src: dataUrl,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        printTopPct: 0.1,
        printBottomPct: 0.9,
        opacity: 0.5,
      });
    };
    img.src = dataUrl;
  }, []);

  // Left panel state machine
  const hasArtworkLoaded = svgAssets.length > 0 || placedItems.length > 0;
  const leftPanelState = React.useMemo(() => {
    if (!selectedTemplate) return "no-template" as const;
    if (placedItems.length === 0) return "no-artwork" as const;
    return "ready" as const;
  }, [selectedTemplate, placedItems.length]);

  // Accordion summary strings for the right panel
  const bedSummary = React.useMemo(() => {
    if (isTumblerMode) {
      return `\u00F8${bedConfig.tumblerDiameterMm}mm \u00D7 ${bedConfig.height}mm`;
    }
    return `${bedConfig.flatWidth} \u00D7 ${bedConfig.flatHeight}mm`;
  }, [isTumblerMode, bedConfig]);

  const materialSummary = React.useMemo(() => {
    if (!materialSettings) return "Not set";
    return materialSettings.label;
  }, [materialSettings]);

  const gridSummary = React.useMemo(() => {
    return `Grid: ${bedConfig.gridSpacing}mm \u2014 Snap: ${bedConfig.snapToGrid ? "On" : "Off"}`;
  }, [bedConfig.gridSpacing, bedConfig.snapToGrid]);

  const currentCylinderDiameterMm =
    bedConfig.tumblerOutsideDiameterMm ?? bedConfig.tumblerDiameterMm ?? 0;
  const hasOutputFolder = Boolean(lbOutputFolderPath?.trim());
  const selectedRotaryPreset = React.useMemo(() => {
    if (!selectedRotaryPresetId) return null;
    return getRotaryPresets().find((preset) => preset.id === selectedRotaryPresetId) ?? null;
  }, [selectedRotaryPresetId]);
  const selectedRotaryPresetName = selectedRotaryPreset?.name ?? null;
  const machineSetupLabel = activeLaserSetup
    ? `${activeLaserSetup.laser.name} · ${activeLaserSetup.lens.name}`
    : "No active laser + lens";
  const currentJobRecipe = React.useMemo<OrderJobRecipe | null>(() => {
    const placedRecipeItems = placedItems.map<OrderRecipePlacedItem>((item) => ({
      assetId: item.assetId,
      name: item.name,
      svgText: item.svgText,
      sourceSvgText: item.sourceSvgText,
      documentBounds: { ...item.documentBounds },
      artworkBounds: { ...item.artworkBounds },
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      rotation: item.rotation,
      defaults: { ...item.defaults },
    }));
    const assetIds = Array.from(new Set(placedItems.map((item) => item.assetId)));
    const hasRecipe =
      placedRecipeItems.length > 0 ||
      Boolean(selectedMaterialProfileId) ||
      Boolean(selectedRotaryPresetId) ||
      rotaryAutoPlacementEnabled;

    if (!hasRecipe) return null;

    return {
      assetIds,
      placedItems: placedRecipeItems,
      materialProfileId: selectedMaterialProfileId || undefined,
      materialLabel: materialSettings?.label,
      rotaryPresetId: selectedRotaryPresetId || undefined,
      rotaryPresetName: selectedRotaryPresetName ?? undefined,
      rotaryAutoPlacementEnabled,
    };
  }, [
    materialSettings?.label,
    placedItems,
    rotaryAutoPlacementEnabled,
    selectedMaterialProfileId,
    selectedRotaryPresetId,
    selectedRotaryPresetName,
  ]);
  const activeJobRecipePlacedCount = activeQueueOrder?.jobRecipe?.placedItems?.length ?? 0;
  const activeJobRecipeAssetCount = activeQueueOrder?.jobRecipe?.assetIds?.length ?? 0;
  const currentRecipeCount = currentJobRecipe?.placedItems.length ?? currentJobRecipe?.assetIds.length ?? 0;
  const currentRecipeAssetNames = React.useMemo(() => (
    Array.from(new Set(
      placedItems.length > 0
        ? placedItems.map((item) => item.name).filter(Boolean)
        : svgAssets
          .filter((asset) => asset.id === selectedAssetId)
          .map((asset) => asset.name),
    ))
  ), [placedItems, selectedAssetId, svgAssets]);
  const activeOrderHasStagedTemplate = Boolean(activeQueueOrder?.assignedTemplateId);
  const activeOrderTemplateMatches =
    Boolean(activeQueueOrder?.assignedTemplateId) &&
    activeQueueOrder?.assignedTemplateId === selectedTemplate?.id;
  const activeOrderTemplateMismatch =
    Boolean(activeQueueOrder?.assignedTemplateId) &&
    activeQueueOrder?.assignedTemplateId !== selectedTemplate?.id;

  const workflowReadinessItems = React.useMemo<RunReadinessItem[]>(() => {
    const productTemplateItem: RunReadinessItem = activeOrderTemplateMismatch
      ? {
          id: "product-template",
          label: "Product template",
          detail: `Queued job is staged for ${activeQueueOrder?.assignedTemplateName ?? "a different template"}. Reload that setup before continuing.`,
          status: "fail",
          onSelect: handleOpenJobBoard,
        }
      : {
          id: "product-template",
          label: "Product template",
          detail: selectedTemplate
            ? activeOrderTemplateMatches && activeQueueOrder?.assignedTemplateName
              ? `${selectedTemplate.name} loaded from the job board staging`
              : activeQueueOrder && !activeOrderHasStagedTemplate
                ? `${selectedTemplate.name} loaded manually. Drag it onto the queued job in the board to save time next run.`
              : selectedTemplate.name
            : activeQueueOrder && !activeOrderHasStagedTemplate
              ? "Choose a product template or stage this queued job in the job board first."
              : "Choose a product template to load dimensions and defaults.",
          status: selectedTemplate ? "pass" : "fail",
          onSelect:
            activeQueueOrder && (!selectedTemplate || !activeOrderHasStagedTemplate)
              ? handleOpenJobBoard
              : () => handleWorkflowStepNav("product"),
        };

    const items: RunReadinessItem[] = [
      productTemplateItem,
      {
        id: "artwork-library",
        label: "Artwork",
        detail: hasArtworkLoaded
          ? placedItems.length > 0
            ? `${placedItems.length} item${placedItems.length === 1 ? "" : "s"} on the bed`
            : `${svgAssets.length} asset${svgAssets.length === 1 ? "" : "s"} loaded`
          : "Upload or choose artwork for this job.",
        status: hasArtworkLoaded ? "pass" : "fail",
        onSelect: () => handleWorkflowStepNav("artwork"),
      },
      {
        id: "placement",
        label: "Placement",
        detail:
          placedItems.length > 0
            ? `${placedItems.length} item${placedItems.length === 1 ? "" : "s"} positioned and ready to review`
            : "Place and align artwork on the workspace before export.",
        status: placedItems.length > 0 ? "pass" : "fail",
        onSelect: () => handleWorkflowStepNav("placement"),
      },
      ...(activeQueueOrder
        ? [{
            id: "job-recipe",
            label: "Saved recipe",
            detail: activeQueueOrder.jobRecipe
              ? activeJobRecipePlacedCount > 0
                ? `${activeJobRecipePlacedCount} placed item${activeJobRecipePlacedCount === 1 ? "" : "s"} saved with this job`
                : "Material and machine settings were saved with this job."
              : "No saved recipe yet. Capturing layout with the order removes another setup step next run.",
            status: activeQueueOrder.jobRecipe ? "pass" : "warn",
            onSelect: handleOpenJobBoard,
          } satisfies RunReadinessItem]
        : []),
      {
        id: "machine-lens",
        label: "Machine + lens",
        detail: activeLaserSetup
          ? `${activeLaserSetup.laser.name} · ${activeLaserSetup.lens.name}`
          : "Pick the active laser and lens in Setup so the operator is working against the real machine context.",
        status: activeLaserSetup ? "pass" : "warn",
        onSelect: () => setRightTab("setup"),
      },
      {
        id: "material-profile",
        label: "Material profile",
        detail: materialSettings
          ? materialSettings.label
          : "Recommended before export so the LightBurn handoff matches the job.",
        status: materialSettings ? "pass" : "warn",
        onSelect: () => handleWorkflowSectionNav("material", "material-header"),
      },
    ];

    if (isTumblerMode) {
      items.push({
        id: "cylinder-diameter",
        label: "Cylinder diameter",
        detail:
          currentCylinderDiameterMm > 0
            ? `${currentCylinderDiameterMm.toFixed(1)} mm confirmed`
            : "Confirm the cup diameter so wrap width and scaling are correct.",
        status: currentCylinderDiameterMm > 0 ? "pass" : "fail",
        onSelect: () => handlePreflightNav("cylinder-diameter"),
      });

      if (rotaryAutoPlacementEnabled) {
        items.push({
          id: "rotary-preset",
          label: "Rotary preset",
          detail: selectedRotaryPresetId
            ? selectedRotaryPresetName ?? selectedRotaryPresetId
            : "Pick a rotary preset so origin and setup values match the machine.",
          status: selectedRotaryPresetId ? "pass" : "fail",
          onSelect: () => handlePreflightNav("rotary-preset"),
        });

        items.push({
          id: "top-anchor-calibration",
          label: "Top anchor calibration",
          detail: selectedRotaryPreset?.rotaryTopYmm != null
            ? `${selectedRotaryPreset.rotaryTopYmm.toFixed(1)} mm top anchor captured`
            : "Verify top anchor calibration before running this rotary preset.",
          status: selectedRotaryPreset?.rotaryTopYmm != null ? "pass" : "warn",
          onSelect: () => handlePreflightNav("top-anchor"),
        });
      }
    }

    items.push({
      id: "export-handoff",
      label: "Export handoff",
      detail: hasOutputFolder
        ? `Saves directly to ${lbOutputFolderPath?.trim()} and refreshes current-job aliases`
        : "Downloads the LightBurn bundle locally. Configure a watched output folder to skip the manual copy step.",
      status: hasOutputFolder ? "pass" : "warn",
      onSelect: () => handleWorkflowStepNav("export"),
    });

    return items;
  }, [
    activeLaserSetup,
    currentCylinderDiameterMm,
    handlePreflightNav,
    handleOpenJobBoard,
    handleWorkflowSectionNav,
    handleWorkflowStepNav,
    activeJobRecipePlacedCount,
    activeOrderHasStagedTemplate,
    activeOrderTemplateMatches,
    activeOrderTemplateMismatch,
    activeQueueOrder,
    hasArtworkLoaded,
    hasOutputFolder,
    isTumblerMode,
    lbOutputFolderPath,
    materialSettings,
    placedItems.length,
    rotaryAutoPlacementEnabled,
    selectedRotaryPresetId,
    selectedRotaryPreset,
    selectedRotaryPresetName,
    selectedTemplate,
    svgAssets.length,
  ]);

  const workflowBlockerCount = workflowReadinessItems.filter((item) => item.status === "fail").length;
  const workflowWarningCount = workflowReadinessItems.filter((item) => item.status === "warn").length;

  const workflowGuidance = React.useMemo(() => {
    if (activeOrderTemplateMismatch) {
      return {
        text: `Reload ${activeQueueOrder?.assignedTemplateName ?? "the staged product"} from the job board so this queued job matches the setup.`,
        actionLabel: "Open job board",
        onAction: handleOpenJobBoard,
      };
    }

    if (!selectedTemplate) {
      return {
        text: activeQueueOrder
          ? "Stage the queued job's product in the job board or choose it now so setup starts from the right template."
          : "Choose the product first so the bed, model, and default settings are already loaded.",
        actionLabel: activeQueueOrder ? "Open job board" : "Choose product",
        onAction: activeQueueOrder ? handleOpenJobBoard : () => handleWorkflowStepNav("product"),
      };
    }

    if (!hasArtworkLoaded) {
      return {
        text: "Load artwork now so the operator can place the job without leaving this screen.",
        actionLabel: "Load artwork",
        onAction: () => handleWorkflowStepNav("artwork"),
      };
    }

    if (placedItems.length === 0) {
      return {
        text: "Place the artwork on the bed so sizing, wrap position, and proofs are based on the real job.",
        actionLabel: "Open placement",
        onAction: () => handleWorkflowStepNav("placement"),
      };
    }

    if (isTumblerMode && currentCylinderDiameterMm <= 0) {
      return {
        text: "Confirm cylinder diameter before export so the wrap width matches the actual cup.",
        actionLabel: "Set diameter",
        onAction: () => handlePreflightNav("cylinder-diameter"),
      };
    }

    if (isTumblerMode && rotaryAutoPlacementEnabled && !selectedRotaryPresetId) {
      return {
        text: "Pick the rotary preset now so origin and top anchor are based on the actual machine.",
        actionLabel: "Select preset",
        onAction: () => handlePreflightNav("rotary-preset"),
      };
    }

    if (!activeLaserSetup) {
      return {
        text: "Set the active laser and lens so this job is staged against the actual machine before export.",
        actionLabel: "Open setup",
        onAction: () => setRightTab("setup"),
      };
    }

    if (!materialSettings) {
      return {
        text: "Select a material profile before export to reduce operator guesswork in LightBurn.",
        actionLabel: "Choose material",
        onAction: () => handleWorkflowSectionNav("material", "material-header"),
      };
    }

    return {
      text: hasOutputFolder
        ? "Save the LightBurn bundle straight to the watched folder and cut one more manual step."
        : "Export the LightBurn bundle and hand off a ready-to-run job package.",
      actionLabel: "Go to export",
      onAction: () => handleWorkflowStepNav("export"),
    };
  }, [
    activeLaserSetup,
    activeOrderTemplateMismatch,
    activeQueueOrder,
    currentCylinderDiameterMm,
    handleOpenJobBoard,
    handlePreflightNav,
    handleWorkflowSectionNav,
    handleWorkflowStepNav,
    hasArtworkLoaded,
    hasOutputFolder,
    isTumblerMode,
    materialSettings,
    placedItems.length,
    rotaryAutoPlacementEnabled,
    selectedRotaryPresetId,
    selectedTemplate,
  ]);

  const workflowCurrentStepId = React.useMemo(() => {
    if (activeOrderTemplateMismatch) return "product";
    if (!selectedTemplate) return "product";
    if (!hasArtworkLoaded) return "artwork";
    if (placedItems.length === 0) return "placement";
    if (workflowBlockerCount > 0 || workflowWarningCount > 0) return "run-check";
    return "export";
  }, [
    activeOrderTemplateMismatch,
    hasArtworkLoaded,
    placedItems.length,
    selectedTemplate,
    workflowBlockerCount,
    workflowWarningCount,
  ]);

  const workflowSteps = React.useMemo<WorkflowRailStep[]>(() => {
    const artworkDetail = hasArtworkLoaded
      ? placedItems.length > 0
        ? `${placedItems.length} on bed`
        : `${svgAssets.length} loaded`
      : "Load artwork";

    const runCheckDetail =
      workflowBlockerCount > 0
        ? `${workflowBlockerCount} blocker${workflowBlockerCount === 1 ? "" : "s"}`
        : workflowWarningCount > 0
          ? `${workflowWarningCount} warning${workflowWarningCount === 1 ? "" : "s"}`
          : "Setup verified";

    const stepState = (stepId: string): WorkflowRailStep["state"] => {
      if (stepId === workflowCurrentStepId) return "active";

      const order = ["product", "artwork", "placement", "run-check", "export"];
      const currentIndex = order.indexOf(workflowCurrentStepId);
      const stepIndex = order.indexOf(stepId);
      return stepIndex >= 0 && currentIndex >= 0 && stepIndex < currentIndex ? "done" : "upcoming";
    };

    return [
      {
        id: "product",
        label: "Product",
        detail: selectedTemplate?.name ?? "Choose product",
        state: stepState("product"),
        onSelect: () => handleWorkflowStepNav("product"),
      },
      {
        id: "artwork",
        label: "Artwork",
        detail: artworkDetail,
        state: stepState("artwork"),
        onSelect: () => handleWorkflowStepNav("artwork"),
      },
      {
        id: "placement",
        label: "Placement",
        detail:
          placedItems.length > 0
            ? `${placedItems.length} positioned`
            : "Place and align",
        state: stepState("placement"),
        onSelect: () => handleWorkflowStepNav("placement"),
      },
      {
        id: "run-check",
        label: "Run Check",
        detail: runCheckDetail,
        state: stepState("run-check"),
        onSelect: () => handleWorkflowStepNav("run-check"),
      },
      {
        id: "export",
        label: "Export",
        detail: hasOutputFolder ? "Save watched folder bundle" : "Download LightBurn bundle",
        state: stepState("export"),
        onSelect: () => handleWorkflowStepNav("export"),
        spanFull: true,
      },
    ];
  }, [
    handleWorkflowStepNav,
    hasArtworkLoaded,
    hasOutputFolder,
    placedItems.length,
    selectedTemplate,
    svgAssets.length,
    workflowBlockerCount,
    workflowCurrentStepId,
    workflowWarningCount,
  ]);

  const runConfidenceLabel = React.useMemo(() => {
    if (activeOrderTemplateMismatch) {
      return "Low · staged job mismatch";
    }
    if (!activeLaserSetup) {
      return "Medium · machine context missing";
    }
    if (workflowBlockerCount > 0) {
      return `Low · ${workflowBlockerCount} blocker${workflowBlockerCount === 1 ? "" : "s"}`;
    }
    if (workflowWarningCount > 0) {
      return `Medium · ${workflowWarningCount} review${workflowWarningCount === 1 ? "" : "s"}`;
    }
    if (activeOrderTemplateMatches) {
      return "High · staged template matched";
    }
    return "High · setup aligned";
  }, [
    activeLaserSetup,
    activeOrderTemplateMatches,
    activeOrderTemplateMismatch,
    workflowBlockerCount,
    workflowWarningCount,
  ]);

  const currentJobMetrics = React.useMemo(() => {
    return [
      {
        label: "Job",
        value: !activeQueueOrder
          ? "Manual setup"
          : activeJobRecipePlacedCount > 0
            ? `Queued · ${activeJobRecipePlacedCount} placed saved`
            : activeQueueOrder.assignedTemplateName
              ? `Queued · ${activeQueueOrder.assignedTemplateName}`
              : "Queued · not staged",
      },
      {
        label: "Recipe",
        value: !activeQueueOrder
          ? currentJobRecipe
            ? currentRecipeCount > 0
              ? `${currentRecipeCount} item${currentRecipeCount === 1 ? "" : "s"} ready`
              : "Settings ready"
            : "Not saved yet"
          : activeJobRecipePlacedCount > 0
            ? `${activeJobRecipePlacedCount} placed item${activeJobRecipePlacedCount === 1 ? "" : "s"}`
            : activeQueueOrder.jobRecipe
              ? activeJobRecipeAssetCount > 0
                ? `${activeJobRecipeAssetCount} staged asset${activeJobRecipeAssetCount === 1 ? "" : "s"}`
                : "Settings only"
              : "Queued · not staged",
      },
      {
        label: "Artwork",
        value:
          placedItems.length > 0
            ? `${placedItems.length} item${placedItems.length === 1 ? "" : "s"} placed`
            : hasArtworkLoaded
              ? `${svgAssets.length} asset${svgAssets.length === 1 ? "" : "s"} loaded`
              : "No artwork yet",
      },
      {
        label: "Machine",
        value: machineSetupLabel,
      },
      { label: "Material", value: materialSettings?.label ?? "Not selected" },
      {
        label: "Rotary",
        value:
          !isTumblerMode
            ? "Not needed"
            : rotaryAutoPlacementEnabled
              ? selectedRotaryPresetName ?? "Preset not selected"
              : "Manual placement",
      },
      {
        label: "Calibration",
        value:
          !isTumblerMode
            ? "Not needed"
            : selectedRotaryPreset?.rotaryTopYmm != null
              ? `Top anchor ${selectedRotaryPreset.rotaryTopYmm.toFixed(1)} mm`
              : "Top anchor review",
      },
      {
        label: "Export",
        value: hasOutputFolder ? "Watched folder save" : "Manual download",
      },
      {
        label: "Confidence",
        value: runConfidenceLabel,
      },
    ];
  }, [
    activeQueueOrder,
    activeJobRecipeAssetCount,
    activeJobRecipePlacedCount,
    currentRecipeCount,
    currentJobRecipe,
    hasOutputFolder,
    hasArtworkLoaded,
    isTumblerMode,
    materialSettings,
    machineSetupLabel,
    placedItems.length,
    runConfidenceLabel,
    rotaryAutoPlacementEnabled,
    selectedRotaryPreset,
    selectedRotaryPresetName,
    svgAssets.length,
  ]);

  const currentJobQuickActions = React.useMemo<JobQuickAction[]>(() => {
    const actions: JobQuickAction[] = [];

    if (runnableOrders.length > 0) {
      actions.push({
        label: "Job Board",
        shortcut: "J",
        onClick: handleOpenJobBoard,
      });

      actions.push({
        label: activeQueueOrder ? "Next Job" : "Start Next",
        shortcut: "N",
        onClick: handleLoadNextQueuedOrder,
        disabled: queuedJobCount === 0,
        variant: "primary",
      });
    }

    if (activeQueueOrder) {
      actions.push({
        label: "Done + Next",
        shortcut: "Shift+N",
        onClick: handleDoneAndLoadNextQueuedOrder,
        variant: "primary",
      });
    }

    actions.push({
      label: "Jump to Export",
      shortcut: "E",
      onClick: () => handleWorkflowStepNav("export"),
    });

    return actions;
  }, [
    activeQueueOrder,
    handleDoneAndLoadNextQueuedOrder,
    handleLoadNextQueuedOrder,
    handleOpenJobBoard,
    handleWorkflowStepNav,
    queuedJobCount,
    runnableOrders.length,
  ]);

  useEffect(() => {
    const handleWorkflowShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (isTypingTarget(event.target)) return;
      if (showJobRunnerOverlay || showTemplateGallery || showCreateForm || showSvgLibraryModal) return;

      const key = event.key.toLowerCase();

      if (key === "j" && !event.shiftKey && runnableOrders.length > 0) {
        event.preventDefault();
        handleOpenJobBoard();
        return;
      }

      if (key === "n" && event.shiftKey) {
        if (!activeQueueOrder && queuedJobCount === 0) return;
        event.preventDefault();
        handleDoneAndLoadNextQueuedOrder();
        return;
      }

      if (key === "n" && queuedJobCount > 0) {
        event.preventDefault();
        handleLoadNextQueuedOrder();
        return;
      }

      if (key === "e" && !event.shiftKey) {
        event.preventDefault();
        handleWorkflowStepNav("export");
      }
    };

    window.addEventListener("keydown", handleWorkflowShortcut);
    return () => window.removeEventListener("keydown", handleWorkflowShortcut);
  }, [
    activeQueueOrder,
    handleDoneAndLoadNextQueuedOrder,
    handleLoadNextQueuedOrder,
    handleOpenJobBoard,
    handleWorkflowStepNav,
    queuedJobCount,
    runnableOrders.length,
    showCreateForm,
    showJobRunnerOverlay,
    showSvgLibraryModal,
    showTemplateGallery,
  ]);

  // Ref for the standalone artwork upload button (state B)
  const artworkFileRef = React.useRef<HTMLInputElement>(null);
  const templateSearchInputRef = React.useRef<HTMLInputElement>(null);

  const previewTemplates = loadTemplates().slice(0, 4);
  const autoDetectPanel = isTumblerMode ? (
    <TumblerAutoDetectPanel
      bedConfig={bedConfig}
      onApplyDraft={handleApplyTumblerDraft}
      onSetMockup={setMockupConfig}
      mockupActive={Boolean(mockupConfig)}
    />
  ) : (
    <FlatBedAutoDetectPanel
      onApplyItem={handleApplyFlatBedItem}
      onSetMockup={setMockupConfig}
      onClearItemOverlay={() => setFlatBedItemOverlay(null)}
      mockupActive={Boolean(mockupConfig)}
    />
  );

  return (
    <div className={styles.shell}>
      {/* LEFT */}
      <aside className={styles.leftPanel}>
        {/* ── Step indicator ── */}
        <WorkflowRail steps={workflowSteps} />

        <div className={styles.leftPanelScroll}>
          {/* ══════════════════════════════════════════════════════════ */}
          {/* STATE A — No template selected                           */}
          {/* ══════════════════════════════════════════════════════════ */}
          {leftPanelState === "no-template" && (
            <>
              <div className={styles.selectProductPrompt}>
                <span className={styles.selectProductPromptText}>
                  Select a product or start with artwork
                </span>
                <button
                  ref={productStepActionRef}
                  type="button"
                  className={styles.selectProductBtn}
                  onClick={openTemplateGallery}
                >
                  Browse Products
                </button>
              </div>

              {/* Quick-pick grid */}
              <div className={styles.productSection}>
                <span className={styles.productSectionTitle}>Quick select</span>
                <div className={styles.productMiniGrid}>
                  {previewTemplates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={styles.productMiniCard}
                      onClick={() => handleTemplateSelect(t)}
                    >
                      {t.thumbnailDataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.thumbnailDataUrl} alt={t.name} className={styles.productMiniThumb} />
                      ) : (
                        <div className={`${styles.productMiniThumb} ${styles.productThumbFallback}`} aria-hidden="true">
                          {getTemplateFallbackIcon(t.productType)}
                        </div>
                      )}
                      <span className={styles.productMiniName}>{t.name}</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={styles.seeAllBtn}
                  onClick={openTemplateGallery}
                >
                  See all {"\u2192"}
                </button>
              </div>

              {placedItems.map((item) => (
                <div key={item.id} className={styles.artworkCard}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`data:image/svg+xml,${encodeURIComponent(item.svgText)}`}
                    alt={item.name}
                    className={styles.artworkCardThumb}
                  />
                  <div className={styles.artworkCardInfo}>
                    <span className={styles.artworkCardName}>{item.name}</span>
                    <span className={styles.artworkCardDims}>
                      {item.width.toFixed(1)} \u00D7 {item.height.toFixed(1)}mm
                    </span>
                  </div>
                  <div className={styles.artworkCardActions}>
                    <button
                      type="button"
                      className={styles.artworkCardBtn}
                      onClick={() => {
                        artworkFileRef.current?.click();
                      }}
                      title="Replace artwork"
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      className={`${styles.artworkCardBtn} ${styles.artworkCardBtnDanger}`}
                      onClick={() => handleDeleteItem(item.id)}
                      title="Remove from bed"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}

              <div
                className={styles.artworkUploadSection}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add(styles.artworkUploadDragOver); }}
                onDragLeave={(e) => { e.currentTarget.classList.remove(styles.artworkUploadDragOver); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove(styles.artworkUploadDragOver);
                  if (e.dataTransfer.files.length) handleUploadAssets(e.dataTransfer.files);
                }}
              >
                <span className={styles.artworkSectionLabel}>Artwork</span>
                <input
                  ref={artworkFileRef}
                  type="file"
                  accept=".svg,image/svg+xml"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => {
                    if (e.target.files?.length) {
                      handleUploadAssets(e.target.files);
                      e.target.value = "";
                    }
                  }}
                />
                <div className={styles.artworkUploadActions}>
                  <button
                    ref={artworkStepActionRef}
                    type="button"
                    className={styles.artworkUploadBtn}
                    onClick={() => artworkFileRef.current?.click()}
                  >
                    + Upload SVG
                  </button>
                  <button
                    type="button"
                    className={styles.artworkDoctorBtn}
                    onClick={handleOpenSvgDoctor}
                  >
                    SVG Doctor
                  </button>
                  <button
                    type="button"
                    className={styles.artworkLibraryBtn}
                    onClick={handleOpenSvgLibrary}
                  >
                    SVG Library
                  </button>
                </div>
                <span className={styles.artworkUploadHint}>
                  You can place artwork on the bed before choosing a product template.
                </span>
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════════════════ */}
          {/* STATE B — Template selected, no artwork                   */}
          {/* ══════════════════════════════════════════════════════════ */}
          {leftPanelState === "no-artwork" && selectedTemplate && (
            <>
              {/* Compact product card */}
              <div className={styles.productCardCompact}>
                {selectedTemplate.thumbnailDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedTemplate.thumbnailDataUrl}
                    alt={selectedTemplate.name}
                    className={styles.productCardCompactThumb}
                  />
                ) : (
                  <div className={`${styles.productCardCompactThumb} ${styles.productThumbFallback}`} aria-hidden="true">
                    {getTemplateFallbackIcon(selectedTemplate.productType)}
                  </div>
                )}
                <div className={styles.productCardCompactInfo}>
                  <span className={styles.productCardCompactName}>{selectedTemplate.name}</span>
                  <span className={styles.productCardCompactDims}>
                    {selectedTemplateEffectiveDiameterMm > 0
                      ? `\u00F8${(Math.round(selectedTemplateEffectiveDiameterMm * 10) / 10).toFixed(1)}mm \u00D7 ${selectedTemplatePrintHeightMm}mm`
                      : `${selectedTemplate.dimensions.templateWidthMm} \u00D7 ${selectedTemplatePrintHeightMm}mm`}
                  </span>
                </div>
                <button
                  ref={productStepActionRef}
                  type="button"
                  className={styles.productCardCompactChange}
                  onClick={openTemplateGallery}
                >
                  Change
                </button>
              </div>

              {autoDetectPanel}

              {/* Product photo overlay controls */}
              <div className={styles.overlayControlsRow}>
                <div className={styles.overlayModeToggle}>
                  <button type="button"
                    className={`${styles.overlayModeBtn} ${overlayMode === "schematic" ? styles.overlayModeBtnActive : ""}`}
                    onClick={() => setOverlayMode("schematic")}
                  >Schematic</button>
                  <button type="button"
                    className={`${styles.overlayModeBtn} ${overlayMode === "photo" ? styles.overlayModeBtnActive : ""}`}
                    onClick={() => setOverlayMode("photo")}
                  >Photo</button>
                  <button type="button"
                    className={`${styles.overlayModeBtn} ${overlayMode === "off" ? styles.overlayModeBtnActive : ""}`}
                    onClick={() => setOverlayMode("off")}
                  >Off</button>
                </div>
                {overlayMode !== "off" && (
                  <>
                    <label className={styles.overlaySubToggle}>
                      <input
                        type="checkbox"
                        checked={twoSidedMode}
                        onChange={(e) => setTwoSidedMode(e.target.checked)}
                      />
                      <span>2-sided placement</span>
                    </label>
                    {overlayMode === "photo" && (
                      <>
                        <div className={styles.overlaySliderRow}>
                          <span>Opacity</span>
                          <input
                            type="range"
                            min={5}
                            max={50}
                            step={1}
                            value={overlayOpacity}
                            onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                          />
                          <span>{overlayOpacity}%</span>
                        </div>
                        <label className={styles.overlaySubToggle}>
                          <input
                            type="checkbox"
                            checked={overlayBlend === "multiply"}
                            onChange={(e) => setOverlayBlend(e.target.checked ? "multiply" : "normal")}
                          />
                          <span>Multiply blend</span>
                        </label>
                        <label className={styles.overlaySubToggle}>
                          <input
                            type="checkbox"
                            checked={taperWarpEnabled}
                            onChange={(e) => setTaperWarpEnabled(e.target.checked)}
                          />
                          <span>Cylinder correction</span>
                        </label>
                        <label className={styles.overlaySubToggle}>
                          <input
                            type="checkbox"
                            checked={curvedOverlay}
                            onChange={(e) => setCurvedOverlay(e.target.checked)}
                          />
                          <span>Curved perspective</span>
                        </label>
                        {selectedTemplate && (
                          <button
                            type="button"
                            className={styles.overlayBgRemoveBtn}
                            disabled={bgRemovalStatus === "running"}
                            onClick={async () => {
                              if (!selectedTemplate) return;
                              const photoUrl = selectedTemplate.productPhotoFullUrl
                                ?? selectedTemplate.frontPhotoDataUrl
                                ?? selectedTemplate.thumbnailDataUrl;
                              if (!photoUrl) return;
                              setBgRemovalStatus("running");
                              try {
                                const res = await fetch(photoUrl);
                                const blob = await res.blob();
                                const { removeBackground } = await import("@imgly/background-removal");
                                const clean = await removeBackground(blob, {
                                  model: "isnet_quint8",
                                  proxyToWorker: false,
                                  output: { format: "image/png", quality: 0.9 },
                                });
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  const cleanUrl = reader.result as string;
                                  if (!cleanUrl) { setBgRemovalStatus("failed"); return; }
                                  const updated = {
                                    ...selectedTemplate,
                                    productPhotoFullUrl: cleanUrl,
                                    frontPhotoDataUrl: cleanUrl,
                                  };
                                  updateTemplate(updated.id, updated);
                                  setSelectedTemplate(updated);
                                  setBgRemovalStatus("done");
                                };
                                reader.onerror = () => setBgRemovalStatus("failed");
                                reader.readAsDataURL(clean);
                              } catch {
                                setBgRemovalStatus("failed");
                              }
                            }}
                          >
                            {bgRemovalStatus === "running" ? "Removing background\u2026"
                              : bgRemovalStatus === "done" ? "Background removed \u2713"
                              : bgRemovalStatus === "failed" ? "Failed \u2014 retry?"
                              : "AI remove background"}
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}

                {/* Screenshot proof export */}
                <button
                  type="button"
                  className={styles.screenshotBtn}
                  onClick={handleScreenshot}
                  title="Save workspace as proof image"
                >
                  Screenshot
                </button>
              </div>

              {/* Body tint color picker */}
              <div className={styles.bodyTintRow}>
                <span className={styles.bodyTintLabel}>Body color</span>
                <input
                  type="color"
                  value={bodyTintColor}
                  onChange={(e) => setBodyTintColor(e.target.value)}
                  className={styles.bodyTintSwatch}
                />
                  <button
                    type="button"
                    className={styles.bodyTintResetBtn}
                    onClick={() => setBodyTintColor(selectedTemplate?.dimensions.bodyColorHex ?? "#b0b8c4")}
                    title="Reset to template body color"
                  >
                    Reset
                  </button>
              </div>

              {/* Artwork upload section */}
              <div
                className={styles.artworkUploadSection}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add(styles.artworkUploadDragOver); }}
                onDragLeave={(e) => { e.currentTarget.classList.remove(styles.artworkUploadDragOver); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove(styles.artworkUploadDragOver);
                  if (e.dataTransfer.files.length) handleUploadAssets(e.dataTransfer.files);
                }}
              >
                <span className={styles.artworkSectionLabel}>Artwork</span>
                <input
                  ref={artworkFileRef}
                  type="file"
                  accept=".svg,image/svg+xml"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => {
                    if (e.target.files?.length) {
                      handleUploadAssets(e.target.files);
                      e.target.value = "";
                    }
                  }}
                />
                <div className={styles.artworkUploadActions}>
                  <button
                    ref={artworkStepActionRef}
                    type="button"
                    className={styles.artworkUploadBtn}
                    onClick={() => artworkFileRef.current?.click()}
                  >
                    + Upload SVG
                  </button>
                  <button
                    type="button"
                    className={styles.artworkDoctorBtn}
                    onClick={handleOpenSvgDoctor}
                  >
                    SVG Doctor
                  </button>
                  <button
                    type="button"
                    className={styles.artworkLibraryBtn}
                    onClick={handleOpenSvgLibrary}
                  >
                    SVG Library
                  </button>
                </div>
                <span className={styles.artworkUploadHint}>
                  Drop an SVG file, or open SVG Doctor for raster cleanup and tracing
                </span>
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════════════════ */}
          {/* STATE C — Template + artwork placed (ready)               */}
          {/* ══════════════════════════════════════════════════════════ */}
          {leftPanelState === "ready" && selectedTemplate && (
            <>
              {/* Compact product card */}
              <div className={styles.productCardCompact}>
                {selectedTemplate.thumbnailDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedTemplate.thumbnailDataUrl}
                    alt={selectedTemplate.name}
                    className={styles.productCardCompactThumb}
                  />
                ) : (
                  <div className={`${styles.productCardCompactThumb} ${styles.productThumbFallback}`} aria-hidden="true">
                    {getTemplateFallbackIcon(selectedTemplate.productType)}
                  </div>
                )}
                <div className={styles.productCardCompactInfo}>
                  <span className={styles.productCardCompactName}>{selectedTemplate.name}</span>
                  <span className={styles.productCardCompactDims}>
                    {selectedTemplateEffectiveDiameterMm > 0
                      ? `\u00F8${(Math.round(selectedTemplateEffectiveDiameterMm * 10) / 10).toFixed(1)}mm \u00D7 ${selectedTemplatePrintHeightMm}mm`
                      : `${selectedTemplate.dimensions.templateWidthMm} \u00D7 ${selectedTemplatePrintHeightMm}mm`}
                  </span>
                </div>
                <button
                  ref={productStepActionRef}
                  type="button"
                  className={styles.productCardCompactChange}
                  onClick={openTemplateGallery}
                >
                  Change
                </button>
              </div>

              {autoDetectPanel}

              {/* Product photo overlay controls */}
              <div className={styles.overlayControlsRow}>
                <div className={styles.overlayModeToggle}>
                  <button type="button"
                    className={`${styles.overlayModeBtn} ${overlayMode === "schematic" ? styles.overlayModeBtnActive : ""}`}
                    onClick={() => setOverlayMode("schematic")}
                  >Schematic</button>
                  <button type="button"
                    className={`${styles.overlayModeBtn} ${overlayMode === "photo" ? styles.overlayModeBtnActive : ""}`}
                    onClick={() => setOverlayMode("photo")}
                  >Photo</button>
                  <button type="button"
                    className={`${styles.overlayModeBtn} ${overlayMode === "off" ? styles.overlayModeBtnActive : ""}`}
                    onClick={() => setOverlayMode("off")}
                  >Off</button>
                </div>
                {overlayMode !== "off" && (
                  <>
                    <label className={styles.overlaySubToggle}>
                      <input
                        type="checkbox"
                        checked={twoSidedMode}
                        onChange={(e) => setTwoSidedMode(e.target.checked)}
                      />
                      <span>2-sided placement</span>
                    </label>
                    {overlayMode === "photo" && (
                      <>
                        <div className={styles.overlaySliderRow}>
                          <span>Opacity</span>
                          <input
                            type="range"
                            min={5}
                            max={50}
                            step={1}
                            value={overlayOpacity}
                            onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                          />
                          <span>{overlayOpacity}%</span>
                        </div>
                        <label className={styles.overlaySubToggle}>
                          <input
                            type="checkbox"
                            checked={overlayBlend === "multiply"}
                            onChange={(e) => setOverlayBlend(e.target.checked ? "multiply" : "normal")}
                          />
                          <span>Multiply blend</span>
                        </label>
                        <label className={styles.overlaySubToggle}>
                          <input
                            type="checkbox"
                            checked={taperWarpEnabled}
                            onChange={(e) => setTaperWarpEnabled(e.target.checked)}
                          />
                          <span>Cylinder correction</span>
                        </label>
                        <label className={styles.overlaySubToggle}>
                          <input
                            type="checkbox"
                            checked={curvedOverlay}
                            onChange={(e) => setCurvedOverlay(e.target.checked)}
                          />
                          <span>Curved perspective</span>
                        </label>
                        {selectedTemplate && (
                          <button
                            type="button"
                            className={styles.overlayBgRemoveBtn}
                            disabled={bgRemovalStatus === "running"}
                            onClick={async () => {
                              if (!selectedTemplate) return;
                              const photoUrl = selectedTemplate.productPhotoFullUrl
                                ?? selectedTemplate.frontPhotoDataUrl
                                ?? selectedTemplate.thumbnailDataUrl;
                              if (!photoUrl) return;
                              setBgRemovalStatus("running");
                              try {
                                const res = await fetch(photoUrl);
                                const blob = await res.blob();
                                const { removeBackground } = await import("@imgly/background-removal");
                                const clean = await removeBackground(blob, {
                                  model: "isnet_quint8",
                                  proxyToWorker: false,
                                  output: { format: "image/png", quality: 0.9 },
                                });
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  const cleanUrl = reader.result as string;
                                  if (!cleanUrl) { setBgRemovalStatus("failed"); return; }
                                  const updated = {
                                    ...selectedTemplate,
                                    productPhotoFullUrl: cleanUrl,
                                    frontPhotoDataUrl: cleanUrl,
                                  };
                                  updateTemplate(updated.id, updated);
                                  setSelectedTemplate(updated);
                                  setBgRemovalStatus("done");
                                };
                                reader.onerror = () => setBgRemovalStatus("failed");
                                reader.readAsDataURL(clean);
                              } catch {
                                setBgRemovalStatus("failed");
                              }
                            }}
                          >
                            {bgRemovalStatus === "running" ? "Removing background\u2026"
                              : bgRemovalStatus === "done" ? "Background removed \u2713"
                              : bgRemovalStatus === "failed" ? "Failed \u2014 retry?"
                              : "AI remove background"}
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}

                {/* Screenshot proof export */}
                <button
                  type="button"
                  className={styles.screenshotBtn}
                  onClick={handleScreenshot}
                  title="Save workspace as proof image"
                >
                  Screenshot
                </button>
              </div>

              {/* Artwork cards */}
              {placedItems.map((item) => (
                <div key={item.id} className={styles.artworkCard}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`data:image/svg+xml,${encodeURIComponent(item.svgText)}`}
                    alt={item.name}
                    className={styles.artworkCardThumb}
                  />
                  <div className={styles.artworkCardInfo}>
                    <span className={styles.artworkCardName}>{item.name}</span>
                    <span className={styles.artworkCardDims}>
                      {item.width.toFixed(1)} \u00D7 {item.height.toFixed(1)}mm
                    </span>
                  </div>
                  <div className={styles.artworkCardActions}>
                    <button
                      type="button"
                      className={styles.artworkCardBtn}
                      onClick={() => {
                        artworkFileRef.current?.click();
                      }}
                      title="Replace artwork"
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      className={`${styles.artworkCardBtn} ${styles.artworkCardBtnDanger}`}
                      onClick={() => handleDeleteItem(item.id)}
                      title="Remove from bed"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}

              {/* Add more artwork */}
              <div className={styles.artworkUploadSection}>
                <input
                  ref={artworkFileRef}
                  type="file"
                  accept=".svg,image/svg+xml"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => {
                    if (e.target.files?.length) {
                      handleUploadAssets(e.target.files);
                      e.target.value = "";
                    }
                  }}
                />
                <div className={styles.artworkUploadActions}>
                  <button
                    ref={artworkStepActionRef}
                    type="button"
                    className={styles.artworkUploadBtn}
                    onClick={() => artworkFileRef.current?.click()}
                    style={{ padding: "8px 0", fontSize: "12px" }}
                  >
                    + Add more artwork
                  </button>
                  <button
                    type="button"
                    className={styles.artworkDoctorBtn}
                    onClick={handleOpenSvgDoctor}
                  >
                    SVG Doctor
                  </button>
                  <button
                    type="button"
                    className={styles.artworkLibraryBtn}
                    onClick={handleOpenSvgLibrary}
                  >
                    SVG Library
                  </button>
                </div>
              </div>

            </>
          )}

          {/* 3D preview */}
          {selectedTemplate && !is3DPlacement && (
            <Model3DPanel
              viewerModeResetKey={modelViewerResetKey}
              templateKey={selectedTemplate.id}
              placedItems={placedItems}
              bedWidthMm={bedConfig.width}
              bedHeightMm={bedConfig.height}
              workspaceMode={bedConfig.workspaceMode}
              tumblerDims={tumblerDims}
              handleArcDeg={activeHandleArcDeg}
              modelPathOverride={selectedTemplate?.glbPath ?? null}
              flatPreview={flatPreview}
              tumblerMapping={selectedTemplate?.tumblerMapping}
              onUpdateCalibration={handleUpdateCalibration}
              bodyTintColor={bodyTintColor}
              rimTintColor={rimTintColor}
              artworkTintColor={rimTintColor}
              dimensionCalibration={selectedTemplate?.dimensions.canonicalDimensionCalibration ?? null}
              canonicalBodyProfile={selectedTemplate?.dimensions.canonicalBodyProfile ?? null}
              canonicalHandleProfile={selectedTemplate?.dimensions.canonicalHandleProfile ?? null}
            />
          )}
        </div>
      </aside>

      {/* CENTER */}
      <main ref={workspaceStepSectionRef} className={styles.centerPanel}>
        {/* 3D placement view */}
        {is3DPlacement && tumblerDims ? (
          <div className={styles.center3DWrap}>
            <TumblerPlacementView
              placedItems={placedItems}
              tumblerDims={tumblerDims!}
              selectedTemplate={selectedTemplate}
              bedWidthMm={bedConfig.width}
              bedHeightMm={bedConfig.height}
              selectedItemId={selectedItemId}
              onSelectItem={handleSelectItem}
              onUpdateItem={handleUpdateItem}
            />
            {/* Mode toggle floats on top */}
            <div className={styles.center3DModeOverlay}>
              <button
                className={`${styles.center3DModeBtn} ${!is3DPlacement ? styles.center3DModeBtnActive : ""}`}
                onClick={() => setTumblerViewMode("grid")}
              >Grid</button>
              <button
                className={`${styles.center3DModeBtn} ${is3DPlacement ? styles.center3DModeBtnActive : ""}`}
                onClick={() => setTumblerViewMode("3d-placement")}
              >3D</button>
            </div>
          </div>
        ) : (
          <LaserBedWorkspace
            bedConfig={bedConfig}
            placedItems={placedItems}
            selectedItemId={selectedItemId}
            placementAsset={placementAsset}
            svgDoctorPreview={svgDoctorPreview}
            isPlacementArmed={isPlacementArmed}
            framePreview={framePreview}
            showTwoSidedCrosshairs={isTumblerMode}
            mockupConfig={mockupConfig}
            flatBedItemOverlay={flatBedItemOverlay}
              handleArcDeg={activeHandleArcDeg}
            onWorkspaceModeChange={handleWorkspaceModeChange}
            tumblerViewMode={tumblerViewMode}
            onTumblerViewModeChange={setTumblerViewMode}
            onPlaceAsset={handlePlaceAsset}
            onSelectItem={handleSelectItem}
            onUpdateItem={handleUpdateItem}
            onNudgeSelected={handleNudgeSelected}
            onDeleteItem={handleDeleteItem}
            currentJobLabel={activeQueueOrder?.customerName ?? null}
            currentJobProduct={currentJobProductLabel || selectedTemplate?.name || null}
            onLoadNextJob={handleLoadNextQueuedOrder}
            onDoneAndNextJob={handleDoneAndLoadNextQueuedOrder}
            onReopenCurrentJob={handleReopenCurrentQueuedJob}
            onViewAllJobs={() => setShowJobRunnerOverlay(true)}
            hasQueuedJobs={queuedJobCount > 0}
            queuedJobCount={queuedJobCount}
            onClearWorkspace={handleClearWorkspace}
            productName={selectedTemplate?.name}
              templateOverlayUrl={selectedTemplate?.frontPhotoDataUrl ?? selectedTemplate?.productPhotoFullUrl ?? selectedTemplate?.thumbnailDataUrl ?? null}
            backOverlayUrl={selectedTemplate?.backPhotoDataUrl ?? null}
            tumblerOverallHeightMm={templateEngravableDims?.totalHeightMm ?? bedConfig.tumblerOverallHeightMm}
            tumblerTopMarginMm={templateEngravableDims?.topMarginMm}
            tumblerBottomMarginMm={templateEngravableDims?.bottomMarginMm}
            overlayMode={overlayMode}
            overlayOpacityPct={overlayOpacity}
            overlayBlend={overlayBlend}
            curvedOverlay={curvedOverlay}
            twoSidedMode={twoSidedMode}
            stageRefCallback={handleStageRef}
            engravableZone={engravableZone}
          />
        )}
      </main>

      {/* RIGHT */}
      <aside className={styles.rightPanel}>
        <div className={styles.tabBar}>
          <button
            className={rightTab === "workflow" ? styles.tabActive : styles.tab}
            onClick={() => setRightTab("workflow")}
            type="button"
          >
            Production
          </button>
          <button
            className={rightTab === "tools" ? styles.tabActive : styles.tab}
            onClick={() => setRightTab("tools")}
            type="button"
          >
            Tools
          </button>
          <button
            className={rightTab === "setup" ? styles.tabActive : styles.tab}
            onClick={() => setRightTab("setup")}
            type="button"
          >
            Setup
          </button>
          <Link href="/admin/calibration" className={styles.tabCalibrationLink}>
            Calibration {"\u2192"}
          </Link>
        </div>

        <LensQuickSelect />

        {rightTab === "workflow" && (
          <>
            {/* ZONE 2: Accordion sections (scrollable) */}
            <div className={styles.rightAccordionScroll}>
              <CurrentJobCard
                modeLabel={isTumblerMode ? "Tumbler Wrap" : "Flat Bed"}
                productName={currentJobProductLabel || selectedTemplate?.name || "No product selected"}
                orderName={
                  activeQueueOrder?.customerName
                    ? `Active order: ${activeQueueOrder.customerName}`
                    : queuedJobCount > 0
                      ? `${queuedJobCount} queued job${queuedJobCount === 1 ? "" : "s"} ready`
                      : "Manual setup job"
                }
                nextAction={workflowGuidance.text}
                metrics={currentJobMetrics}
                quickActions={currentJobQuickActions}
              />

              <div ref={runCheckSectionRef}>
                <RunReadinessPanel
                  items={workflowReadinessItems}
                  nextAction={workflowGuidance.text}
                  primaryActionLabel={workflowGuidance.actionLabel}
                  onPrimaryAction={workflowGuidance.onAction}
                />
              </div>

              {/* Orders and batch queue */}
              <button
                type="button"
                className={styles.ordersToggle}
                onClick={() => setShowOrders((previous) => !previous)}
                aria-expanded={showOrders}
                aria-controls="workflow-orders-section"
              >
                <span>{showOrders ? "\u25BE" : "\u25B8"}</span>
                <span>{showOrders ? "Hide orders and queue" : "Show orders and queue"}</span>
              </button>
              {showOrders && (
                <div id="workflow-orders-section" className={styles.ordersSection}>
                  <OrdersPanel
                    bedConfig={bedConfig}
                    assetNames={assetNames}
                    selectedTemplate={selectedTemplate}
                    currentJobRecipe={currentJobRecipe}
                    onLoadOrder={handleLoadOrder}
                  />
                  <BatchQueuePanel onLoadOrder={handleLoadOrder} />
                </div>
              )}

              {/* Selected item inspector — only when item selected */}
              {selectedItem && (
                <SelectedItemInspector
                  selectedItem={selectedItem}
                  bedConfig={bedConfig}
                  statusNote={inspectorNote}
                  engravableZone={engravableZone}
                  onUpdateItem={handleUpdateItem}
                  onAlignItem={handleAlignItem}
                  onCenterBetweenGuides={handleCenterSelectedBetweenGuides}
                  onResetItem={handleResetItem}
                  onNormalizeItem={handleNormalizeItem}
                  onDeleteItem={handleDeleteItem}
                />
              )}

              <AccordionSection
                id="bed"
                title="Bed Settings"
                summary={bedSummary}
                isOpen={openSection === "bed"}
                onToggle={handleAccordionToggle}
              >
                <BedSettingsPanel
                  bedConfig={bedConfig}
                  onUpdateBedConfig={setBedConfig}
                  showGridSection={false}
                />
              </AccordionSection>

              <AccordionSection
                id="material"
                title="Material Profile"
                summary={materialSummary}
                isOpen={openSection === "material"}
                onToggle={handleAccordionToggle}
              >
                <MaterialProfilePanel
                  onMaterialChange={setMaterialSettings}
                  selectedProfileId={selectedMaterialProfileId}
                  onSelectedProfileIdChange={handleMaterialProfileSelection}
                  currentMaterialSlug={currentMaterialContext.materialSlug}
                  currentMaterialLabel={currentMaterialContext.materialLabel}
                  productHint={currentMaterialContext.productHint}
                />
              </AccordionSection>

              <AccordionSection
                id="grid"
                title="Grid & Snap"
                summary={gridSummary}
                isOpen={openSection === "grid"}
                onToggle={handleAccordionToggle}
              >
                {/* Dedicated grid controls avoid mounting the full bed panel twice */}
                <GridSettingsPanel bedConfig={bedConfig} onUpdateBedConfig={setBedConfig} />
              </AccordionSection>

              <AccordionSection
                id="history"
                title="Export History"
                summary=""
                isOpen={openSection === "history"}
                onToggle={handleAccordionToggle}
              >
                <ExportHistoryPanel />
              </AccordionSection>

              <AccordionSection
                id="mockup"
                title="Proof Mockup"
                summary=""
                isOpen={openSection === "mockup"}
                onToggle={handleAccordionToggle}
              >
                <ProofMockupPanel
                  bedConfig={bedConfig}
                  placedItems={placedItems}
                  mockupConfig={mockupConfig}
                />
              </AccordionSection>
            </div>

            {/* ZONE 1: Export — pinned at bottom */}
            <div ref={exportStepSectionRef} className={styles.rightPinnedExport}>
              <TumblerExportPanel
                compact
                bedConfig={bedConfig}
                placedItems={placedItems}
                onFramePreviewChange={setFramePreview}
                materialSettings={materialSettings}
                rotaryEnabled={rotaryAutoPlacementEnabled}
                onRotaryEnabledChange={setRotaryAutoPlacementEnabled}
                selectedPresetId={selectedRotaryPresetId}
                onSelectedPresetIdChange={setSelectedRotaryPresetId}
                onPreflightNav={handlePreflightNav}
                taperWarpEnabled={taperWarpEnabled}
                onTaperWarpChange={setTaperWarpEnabled}
                outputFolderPath={lbOutputFolderPath}
                onDiameterChange={(d) => setBedConfig((prev) => normalizeBedConfig({
                  ...prev,
                  tumblerDiameterMm: d,
                  tumblerOutsideDiameterMm: d,
                }))}
                onSnapFullWrap={() => {
                  const w = bedConfig.width;
                  const h = bedConfig.height;
                  if (w <= 0 || h <= 0) return;
                  setPlacedItems((prev) => prev.map((p) => ({
                    ...p,
                    x: 0,
                    y: 0,
                    width: w,
                    height: h,
                  })));
                }}
                dimensionCalibration={selectedTemplate?.dimensions.canonicalDimensionCalibration ?? null}
                manufacturerLogoStamp={selectedTemplate?.manufacturerLogoStamp ?? null}
                lockedProductionGeometry={Boolean(selectedTemplate && !selectedTemplate.dimensions.advancedGeometryOverridesUnlocked)}
              />
            </div>
          </>
        )}

        {rightTab === "tools" && (
          <div className={styles.tabPane}>
            <SvgAssetLibraryPanel
              assets={svgAssets}
              selectedAssetId={selectedAssetId}
              placedAssetIds={placedItems.map((item) => item.assetId)}
              onSelectAsset={setSelectedAssetId}
              onUpload={handleUploadAssets}
              uploadError={uploadError}
              onPlaceSelectedAsset={handlePlaceSelectedAssetOnBed}
              onRemoveAsset={handleRemoveAsset}
              onUpdateAssetContent={(_id, newSvgContent) => {
                void handleReplaceSelectedSvgAsset(newSvgContent);
              }}
              onClearAll={() => {
                void handleClearAssets();
              }}
            />
            <ColorLayerPanel
              layers={laserLayers}
              onUpdateLayer={handleUpdateLayer}
              onSetLayers={setLaserLayers}
              activeAssetContent={svgAssets.find(a => a.id === selectedAssetId)?.content}
              currentMaterialSlug={currentMaterialContext.materialSlug}
              currentMaterialLabel={currentMaterialContext.materialLabel}
              productHint={currentMaterialContext.productHint}
            />
            {!isTumblerMode && (
              <FlatBedItemPanel
                onApplyItem={(item) => {
                  if (item) {
                    handleApplyFlatBedItem(item);
                    return;
                  }
                  setFlatBedItemOverlay(null);
                }}
                activeItemId={activeFlatBedItemId}
              />
            )}
            <TextToolPanel
              onAddAsset={handleAddGeneratedSvgAsset}
              selectedAsset={selectedAsset}
              onReplaceSelectedAsset={handleReplaceSelectedSvgAsset}
            />
              <RasterToSvgPanel
                onAddAsset={handleAddGeneratedSvgAsset}
                openSignal={svgDoctorOpenSignal}
                onPreviewChange={setSvgDoctorPreview}
              />
            <TextPersonalizationPanel />
            <CameraOverlayPanel onCaptureOverlay={handleCameraCapture} />
            <TestGridPanel bedWidthMm={bedConfig.width} bedHeightMm={bedConfig.height} />
          </div>
        )}

        {rightTab === "setup" && (
          <div className={styles.tabPane}>
            <MachineProfilePanel />
            <LightBurnPathSettingsPanel
              onPathSettingsChange={(s) => setLbOutputFolderPath(s.outputFolderPath)}
            />
            <FiberColorCalibrationPanel
              currentMaterialSlug={currentMaterialContext.materialSlug}
              currentMaterialLabel={currentMaterialContext.materialLabel}
              currentProcessFamily={materialSettings?.processFamily ?? null}
            />
            <SprCalibrationPanel bedConfig={bedConfig} />
            <RotaryPresetSharePanel />
          </div>
        )}
      </aside>

      {/* ── Template gallery modal ── */}
      <JobRunnerOverlay
        open={showJobRunnerOverlay}
        orders={runnableOrders}
        activeOrderId={activeQueueOrder?.id ?? null}
        currentTemplateId={selectedTemplate?.id ?? null}
        currentTemplateName={selectedTemplate?.name ?? null}
        currentJobRecipe={currentJobRecipe}
        currentBedConfig={bedConfig}
        currentRecipeAssetNames={currentRecipeAssetNames}
        autoRefreshEnabled={Boolean(lbOutputFolderPath?.trim())}
        onClose={() => setShowJobRunnerOverlay(false)}
        onLoadOrder={(order) => {
          handleActivateQueuedOrder(order);
          setShowJobRunnerOverlay(false);
        }}
        onMarkDone={handleCompleteQueuedOrder}
      />
      <ModalDialog
        open={showSvgLibraryModal}
        title="Vector Library"
        onClose={handleCloseSvgLibrary}
        size="xwide"
      >
        <SvgLibraryGallery
          assets={svgAssets}
          selectedId={selectedAssetId}
          placedAssetIds={placedItems.map((item) => item.assetId)}
          uploadError={uploadError}
          onSelect={setSelectedAssetId}
          onUpload={handleUploadAssets}
          onRename={async (id, name) => {
            await handleUpdateSvgLibraryAssetEntry(id, { name }, "Renamed artwork in library");
          }}
          onDelete={handleRemoveAsset}
          onClearAll={handleClearAssets}
          onPlaceSelected={() => {
            handlePlaceSelectedAssetOnBed();
            handleCloseSvgLibrary();
          }}
        />
      </ModalDialog>
      <ModalDialog
        open={showTemplateGallery}
        title={showCreateForm
          ? editingTemplate ? "Edit template" : "Create new template"
          : "Select product"}
        onClose={closeTemplateGallery}
        size="fullscreen"
        initialFocusRef={showCreateForm ? undefined : templateSearchInputRef}
      >
        {showCreateForm ? (
          <TemplateCreateForm
            editingTemplate={editingTemplate ?? undefined}
            onSave={(t) => {
              if (editingTemplate && selectedTemplate?.id === t.id) {
                handleTemplateSelect(t);
              } else if (!editingTemplate) {
                handleTemplateSelect(t);
              }
              cancelCreateTemplate();
              if (editingTemplate) {
                showToast("Template updated");
              }
            }}
            onCancel={cancelCreateTemplate}
          />
        ) : (
          <TemplateGallery
            onSelect={handleTemplateSelect}
            onCreateNew={openCreateTemplate}
            onEdit={handleEditTemplate}
            onDelete={handleDeleteTemplate}
            selectedId={selectedTemplate?.id}
            searchInputRef={templateSearchInputRef}
          />
        )}
      </ModalDialog>
      {/* ── Toast ── */}
      {toastMessage && (
        <div className={styles.statusBanner} role="status" aria-live="polite">
          <span className={styles.statusBannerText}>{toastMessage}</span>
          <button
            type="button"
            className={styles.statusBannerDismiss}
            onClick={() => setToastMessage(null)}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

