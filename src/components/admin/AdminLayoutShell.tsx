"use client";

import React, { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BedConfig,
  DEFAULT_BED_CONFIG,
  ItemAlignmentMode,
  PlacedItem,
  PlacedItemPatch,
  SvgAsset,
  WorkspaceMode,
  normalizeBedConfig,
} from "@/types/admin";
import { clamp } from "@/utils/geometry";
import { parseSvgAsset, defaultPlacedSize, normalizeSvgToArtworkBounds } from "@/utils/svg";
import { TumblerSpecDraft } from "@/types/tumblerAutoSize";
import {
  computeAlignmentPatch,
  computePlacementFromArtworkRect,
  getPlacedArtworkBounds,
} from "@/utils/alignment";
import { applyTumblerSuggestion } from "@/utils/tumblerAutoSize";
import { checkSvgQuality } from "@/utils/svgQualityCheck";
import { centerArtworkBetweenGrooves, getActiveTumblerGuideBand } from "@/utils/tumblerGuides";
import { SvgAssetLibraryPanel } from "./SvgAssetLibraryPanel";
import { LaserBedWorkspace } from "./LaserBedWorkspace";
import type { FramePreviewProp, BedMockupConfig, FlatBedItemOverlay } from "./LaserBedWorkspace";
import { BedSettingsPanel } from "./BedSettingsPanel";
import { TumblerAutoDetectPanel } from "./TumblerAutoDetectPanel";
import { Model3DPanel } from "./Model3DPanel";
import { TumblerPlacementView } from "./TumblerPlacementView";
import { AccordionSection } from "./AccordionSection";
import { TumblerExportPanel } from "./TumblerExportPanel";
import type { PreflightNavTarget } from "./TumblerExportPanel";
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
import { TextPersonalizationPanel } from "./TextPersonalizationPanel";
import { CameraOverlayPanel } from "./CameraOverlayPanel";
import { TextToolPanel } from "./TextToolPanel";
import { TestGridPanel } from "./TestGridPanel";
import { FlatBedItemPanel } from "./FlatBedItemPanel";
import { FlatBedAutoDetectPanel } from "./FlatBedAutoDetectPanel";
import { ColorLayerPanel } from "./ColorLayerPanel";
import { type LaserLayer, buildDefaultLayers } from "@/types/laserLayer";
import { FiberColorCalibrationPanel } from "./FiberColorCalibrationPanel";
import { TemplateGallery } from "./TemplateGallery";
import { TemplateCreateForm } from "./TemplateCreateForm";
import type { ProductTemplate } from "@/types/productTemplate";
import { loadTemplates, updateTemplate } from "@/lib/templateStorage";
import styles from "./AdminLayoutShell.module.css";

function isDevEnvironment() {
  return process.env.NODE_ENV !== "production";
}

export function AdminLayoutShell() {
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

  // -- Tumbler mockup overlay -----------------------------------------------
  const [mockupConfig, setMockupConfig] = useState<BedMockupConfig | null>(null);

  // -- Flat bed item footprint overlay --------------------------------------
  const [flatBedItemOverlay, setFlatBedItemOverlay] = useState<FlatBedItemOverlay | null>(null);

  // -- Tumbler view mode (grid vs 3D placement) ----------------------------
  const [tumblerViewMode, setTumblerViewMode] = useState<"grid" | "3d-placement">("grid");

  // -- Product photo overlay on grid ----------------------------------------
  const [overlayMode, setOverlayMode] = useState<"schematic" | "photo" | "off">("schematic");
  const [overlayOpacity, setOverlayOpacity] = useState(12); // percent (5–50)
  const [twoSidedMode, setTwoSidedMode] = useState(false);
  const [bgRemovalStatus, setBgRemovalStatus] = useState<"idle" | "running" | "done" | "failed">("idle");

  // -- Color laser layers ---------------------------------------------------
  const [laserLayers, setLaserLayers] = useState<LaserLayer[]>(() => buildDefaultLayers());

  const handleUpdateLayer = useCallback((layer: LaserLayer) => {
    setLaserLayers(prev => prev.map(l => l.id === layer.id ? layer : l));
  }, []);

  // -- Derived --------------------------------------------------------------
  const isTumblerMode = bedConfig.workspaceMode === "tumbler-wrap";
  const is3DPlacement = isTumblerMode && tumblerViewMode === "3d-placement";
  const placementAsset = svgAssets.find((a) => a.id === placementAssetId) ?? null;

  // Tumbler dimensions — shared between left panel preview and center 3D view
  const tumblerDims = React.useMemo(() => {
    if (!isTumblerMode || bedConfig.tumblerDiameterMm <= 0) return null;
    return {
      overallHeightMm: bedConfig.tumblerOverallHeightMm ?? 215,
      diameterMm: bedConfig.tumblerDiameterMm,
      topDiameterMm: bedConfig.tumblerTopDiameterMm,
      bottomDiameterMm: bedConfig.tumblerBottomDiameterMm,
      printableHeightMm: bedConfig.tumblerPrintableHeightMm ?? bedConfig.height,
    };
  }, [isTumblerMode, bedConfig]);

  const isPlacementArmed = placementAsset !== null;
  const selectedItem = placedItems.find((p) => p.id === selectedItemId) ?? null;

  // -------------------------------------------------------------------------
  // Build a PlacedItem from an SvgAsset at a given center point (mm)
  // -------------------------------------------------------------------------
  const buildPlacedItem = useCallback((
    asset: SvgAsset, xMm: number, yMm: number,
  ): PlacedItem => {
    const maxAutoSize = Math.max(40, Math.min(100, Math.min(bedConfig.width, bedConfig.height) * 0.35));
    const { width, height } = defaultPlacedSize(asset, maxAutoSize);
    const id = `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const itemX = xMm - width / 2;
    const itemY = yMm - height / 2;
    const defaults = { x: itemX, y: itemY, width, height, rotation: 0 };
    return {
      id, assetId: asset.id, name: asset.name,
      svgText: asset.content, sourceSvgText: asset.content,
      documentBounds: { ...asset.documentBounds },
      artworkBounds: { ...asset.artworkBounds },
      x: itemX, y: itemY, width, height, rotation: 0, defaults,
    };
  }, [bedConfig]);

  // -------------------------------------------------------------------------
  // Asset library handlers
  // -------------------------------------------------------------------------
  const handleUploadAssets = useCallback(async (files: FileList) => {
    const accepted: SvgAsset[] = [];
    const rejected: string[] = [];
    const qualityNotes: string[] = [];

    for (const file of Array.from(files)) {
      if (file.type !== "image/svg+xml" && !/\.svg$/i.test(file.name)) {
        rejected.push(`${file.name}: not an SVG file`); continue;
      }
      try {
        const content = await file.text();
        // Quality check — surface errors as rejections, warnings as notes
        const quality = checkSvgQuality(content);
        if (quality.hasErrors) {
          const msgs = quality.issues.filter((i) => i.severity === "error").map((i) => i.message).join("; ");
          rejected.push(`${file.name}: ${msgs}`); continue;
        }
        if (quality.hasWarnings) {
          const msgs = quality.issues.filter((i) => i.severity === "warn").map((i) => i.code).join(", ");
          qualityNotes.push(`${file.name}: ${msgs}`);
        }
        const id = `asset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const parsed = parseSvgAsset(id, file.name, content);
        try {
          const norm = normalizeSvgToArtworkBounds(parsed.content, parsed.artworkBounds);
          accepted.push({
            ...parsed,
            content: norm.svgText,
            viewBox: `${norm.documentBounds.x} ${norm.documentBounds.y} ${norm.documentBounds.width} ${norm.documentBounds.height}`,
            naturalWidth: norm.documentBounds.width,
            naturalHeight: norm.documentBounds.height,
            documentBounds: norm.documentBounds,
            artworkBounds: norm.artworkBounds,
          });
        } catch { accepted.push(parsed); }
      } catch (e) {
        rejected.push(`${file.name}: ${e instanceof Error ? e.message : "parse error"}`);
      }
    }

    if (accepted.length > 0) {
      setSvgAssets((prev) => [...prev, ...accepted]);
      if (!selectedAssetId) setSelectedAssetId(accepted[0].id);

      // Auto-place each uploaded SVG centered on the bed (skip the old "Place on Bed" step)
      const newItems: PlacedItem[] = accepted.map((asset) =>
        buildPlacedItem(asset, bedConfig.width / 2, bedConfig.height / 2),
      );
      if (newItems.length > 0) {
        setPlacedItems((prev) => [...prev, ...newItems]);
        setSelectedItemId(newItems[newItems.length - 1].id);
      }
    }
    if (qualityNotes.length > 0) {
      setInspectorNote(`Quality warnings: ${qualityNotes.slice(0, 2).join(" | ")}${qualityNotes.length > 2 ? " | ..." : ""}`);
    }
    if (rejected.length > 0) {
      const preview = rejected.slice(0, 2).join(" | ") + (rejected.length > 2 ? " | ..." : "");
      setUploadError(`Skipped ${rejected.length} file(s): ${preview}`);
    } else { setUploadError(null); }
  }, [selectedAssetId, buildPlacedItem, bedConfig]);

  const handleRemoveAsset = useCallback((assetId: string) => {
    setSvgAssets((prev) => {
      const next = prev.filter((a) => a.id !== assetId);
      if (selectedAssetId === assetId) setSelectedAssetId(next[0]?.id ?? null);
      if (placementAssetId === assetId) setPlacementAssetId(null);
      return next;
    });
    setPlacedItems((prev) => prev.filter((p) => p.assetId !== assetId));
    setSelectedItemId((id) => {
      if (id && placedItems.some((p) => p.id === id && p.assetId === assetId)) {
        setInspectorNote(null); return null;
      }
      return id;
    });
  }, [selectedAssetId, placementAssetId, placedItems]);

  const handleClearAssets = useCallback(() => {
    setSvgAssets([]); setSelectedAssetId(null); setPlacementAssetId(null);
    setPlacedItems([]); setSelectedItemId(null);
    setUploadError(null); setInspectorNote(null);
  }, []);

  // -------------------------------------------------------------------------
  // Item handlers
  // -------------------------------------------------------------------------

  const handlePlaceAsset = useCallback((xMm: number, yMm: number) => {
    if (!placementAssetId) return;
    const asset = svgAssets.find((a) => a.id === placementAssetId);
    if (!asset) return;
    const item = buildPlacedItem(asset, xMm, yMm);
    setPlacedItems((prev) => [...prev, item]);
    setSelectedItemId(item.id);
    setPlacementAssetId(null);
    setInspectorNote(null);
  }, [placementAssetId, svgAssets, buildPlacedItem]);

  const handlePlaceSelectedAssetOnBed = useCallback(() => {
    if (!selectedAssetId) return;
    // In tumbler mode, auto-place at front-center immediately
    if (isTumblerMode) {
      const asset = svgAssets.find((a) => a.id === selectedAssetId);
      if (asset) {
        const item = buildPlacedItem(asset, bedConfig.width / 2, bedConfig.height / 2);
        setPlacedItems((prev) => [...prev, item]);
        setSelectedItemId(item.id);
        setInspectorNote(null);
        return;
      }
    }
    setPlacementAssetId(selectedAssetId);
    setInspectorNote(null);
  }, [selectedAssetId, isTumblerMode, svgAssets, buildPlacedItem, bedConfig]);

  const handleSelectItem = useCallback((id: string | null) => {
    setSelectedItemId(id);
    if (!id) setInspectorNote(null);
  }, []);

  const handleUpdateItem = useCallback((id: string, patch: PlacedItemPatch) => {
    setPlacedItems((prev) => prev.map((p) => p.id === id ? { ...p, ...patch } : p));
  }, []);

  const handleNudgeSelected = useCallback((dxMm: number, dyMm: number) => {
    if (!selectedItemId) return;
    setPlacedItems((prev) => prev.map((p) => {
      if (p.id !== selectedItemId) return p;
      return {
        ...p,
        x: clamp(p.x + dxMm, 0, Math.max(0, bedConfig.width - p.width)),
        y: clamp(p.y + dyMm, 0, Math.max(0, bedConfig.height - p.height)),
      };
    }));
  }, [selectedItemId, bedConfig]);

  const handleClearWorkspace = useCallback(() => {
    setPlacedItems([]); setSelectedItemId(null);
    setPlacementAssetId(null); setInspectorNote(null);
  }, []);

  const handleDeleteItem = useCallback((id: string) => {
    setPlacedItems((prev) => prev.filter((p) => p.id !== id));
    if (selectedItemId === id) setSelectedItemId(null);
  }, [selectedItemId]);

  // -------------------------------------------------------------------------
  // Inspector handlers
  // -------------------------------------------------------------------------
  const handleResetItem = useCallback((id: string) => {
    setPlacedItems((prev) => prev.map((p) =>
      p.id !== id ? p : { ...p, x: p.defaults.x, y: p.defaults.y, width: p.defaults.width, height: p.defaults.height, rotation: p.defaults.rotation }
    ));
    setInspectorNote("Reset to defaults");
  }, []);

  const handleAlignItem = useCallback((id: string, mode: ItemAlignmentMode) => {
    setPlacedItems((prev) => prev.map((p) =>
      p.id !== id ? p : { ...p, ...computeAlignmentPatch(p, bedConfig, mode) }
    ));
    if (mode === "center-bed")      setInspectorNote("Centered using artwork bounds");
    if (mode === "center-x")        setInspectorNote("Centered horizontally");
    if (mode === "center-y")        setInspectorNote("Centered vertically");
    if (mode === "fit-bed")         setInspectorNote("Fitted to bed");
    if (mode === "opposite-logo")   setInspectorNote("Placed opposite logo (180°)");
    if (mode === "center-on-front") setInspectorNote("Centered on front face");
  }, [bedConfig]);

  const handleNormalizeItem = useCallback((id: string) => {
    let did = false;
    setPlacedItems((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      try {
        const current = getPlacedArtworkBounds(p);
        const n = normalizeSvgToArtworkBounds(p.sourceSvgText, p.artworkBounds);
        const next = computePlacementFromArtworkRect({ targetArtwork: current, documentBounds: n.documentBounds, artworkBounds: n.artworkBounds });
        did = true;
        return { ...p, svgText: n.svgText, documentBounds: n.documentBounds, artworkBounds: n.artworkBounds, ...next, defaults: { ...p.defaults, ...next } };
      } catch { return p; }
    }));
    setInspectorNote(did ? "Normalized SVG bounds" : "Could not normalize");
  }, []);

  const handleCenterSelectedBetweenGuides = useCallback((id: string) => {
    const guideBand = getActiveTumblerGuideBand(bedConfig);
    if (!guideBand) return;
    setPlacedItems((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const c = centerArtworkBetweenGrooves({ currentYmm: p.y, itemHeightMm: p.height, workspaceHeightMm: bedConfig.height, band: guideBand });
      if (isDevEnvironment()) console.info("[tumbler-guides] centered", { guideBand, nextY: c.yMm });
      return { ...p, y: Number(c.yMm.toFixed(3)) };
    }));
    setInspectorNote("Centered between groove guides");
  }, [bedConfig]);

  const handleApplyTumblerDraft = useCallback((draft: TumblerSpecDraft) => {
    setBedConfig((prev) => applyTumblerSuggestion(prev, draft));
    setInspectorNote("Applied auto-detected tumbler template");
  }, []);

  const handleWorkspaceModeChange = useCallback((mode: WorkspaceMode) => {
    setBedConfig((prev) => normalizeBedConfig({ ...prev, workspaceMode: mode }));
    if (mode !== "tumbler-wrap") setTumblerViewMode("grid");
  }, []);

  const handleLoadOrder = useCallback((snapshot: BedConfig) => {
    setBedConfig(snapshot);
  }, []);

  // Derived list of asset names for order capture
  const assetNames = svgAssets.map((a) => a.name);

  // Right panel tab + accordion
  const [rightTab, setRightTab] = useState<"workflow" | "tools" | "setup">("workflow");
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [showOrders, setShowOrders] = useState(false);
  const handleAccordionToggle = useCallback((id: string) => {
    setOpenSection((prev) => (prev === id ? null : id));
  }, []);
  const router = useRouter();

  const scrollAndPulse = useCallback((elementId: string) => {
    setTimeout(() => {
      const el = document.getElementById(elementId);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("preflight-pulse");
      setTimeout(() => el.classList.remove("preflight-pulse"), 1000);
    }, 150);
  }, []);

  const handlePreflightNav = useCallback((target: PreflightNavTarget) => {
    switch (target) {
      case "rotary-preset":
        scrollAndPulse("rotary-preset-select");
        break;
      case "cylinder-diameter":
        scrollAndPulse("bed-cylinder-diameter");
        break;
      case "template-dimensions":
        scrollAndPulse("bed-template-dimensions");
        break;
      case "top-anchor":
        router.push("/admin/calibration");
        break;
    }
  }, [scrollAndPulse, router]);

  const handleAddTextAsset = useCallback((svgContent: string, fileName: string) => {
    const id = `asset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      const parsed = parseSvgAsset(id, fileName, svgContent);
      try {
        const norm = normalizeSvgToArtworkBounds(parsed.content, parsed.artworkBounds);
        setSvgAssets((prev) => [...prev, {
          ...parsed, content: norm.svgText,
          viewBox: `${norm.documentBounds.x} ${norm.documentBounds.y} ${norm.documentBounds.width} ${norm.documentBounds.height}`,
          naturalWidth: norm.documentBounds.width, naturalHeight: norm.documentBounds.height,
          documentBounds: norm.documentBounds, artworkBounds: norm.artworkBounds,
        }]);
      } catch { setSvgAssets((prev) => [...prev, parsed]); }
    } catch { /* noop */ }
  }, []);

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
      imageSrc,
      imageNaturalWidth,
      imageNaturalHeight,
    });
  }, []);

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

  // -- Product template system -----------------------------------------------
  const [selectedTemplate, setSelectedTemplate] = useState<ProductTemplate | null>(null);
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ProductTemplate | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Left panel state machine
  const leftPanelState = React.useMemo(() => {
    if (!selectedTemplate) return "no-template" as const;
    if (placedItems.length === 0) return "no-artwork" as const;
    return "ready" as const;
  }, [selectedTemplate, placedItems.length]);

  // Accordion summary strings for the right panel
  const bedSummary = React.useMemo(() => {
    if (isTumblerMode) {
      return `\u00F8${bedConfig.tumblerDiameterMm}mm \u00D7 ${bedConfig.tumblerPrintableHeightMm ?? bedConfig.height}mm`;
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

  // Ref for the standalone artwork upload button (state B)
  const artworkFileRef = React.useRef<HTMLInputElement>(null);

  const handleTemplateSelect = useCallback((template: ProductTemplate) => {
    // Apply all dimensions at once via bedConfig
    const isRotary = template.productType === "tumbler" || template.productType === "mug" || template.productType === "bottle";
    const mode: WorkspaceMode = isRotary ? "tumbler-wrap" : "flat-bed";

    setBedConfig((prev) =>
      normalizeBedConfig({
        ...prev,
        workspaceMode: mode,
        tumblerDiameterMm: template.dimensions.diameterMm,
        tumblerPrintableHeightMm: template.dimensions.printHeightMm,
        ...(isRotary
          ? {
              tumblerOutsideDiameterMm: template.dimensions.diameterMm,
              tumblerUsableHeightMm: template.dimensions.printHeightMm,
            }
          : {
              flatWidth: template.dimensions.templateWidthMm,
              flatHeight: template.dimensions.printHeightMm,
            }),
      })
    );

    setSelectedTemplate(template);
    setShowTemplateGallery(false);
    setShowCreateForm(false);
    setBgRemovalStatus("idle");

    // Show toast
    setToastMessage(`${template.name} loaded \u2014 place your artwork`);
    setTimeout(() => setToastMessage(null), 2200);
  }, []);

  const handleUpdateCalibration = useCallback((offsetX: number, offsetY: number, rotation: number) => {
    if (!selectedTemplate) return;
    const updatedMapping = {
      ...(selectedTemplate.tumblerMapping ?? {
        frontFaceRotation: 0,
        handleCenterAngle: Math.PI,
        handleArcDeg: 0,
        isMapped: false,
      }),
      calibrationOffsetX: offsetX,
      calibrationOffsetY: offsetY,
      calibrationRotation: rotation,
    };
    const updated = { ...selectedTemplate, tumblerMapping: updatedMapping };
    updateTemplate(updated.id, updated);
    setSelectedTemplate(updated);
  }, [selectedTemplate]);

  const previewTemplates = React.useMemo(() => loadTemplates().slice(0, 4), []);

  return (
    <div className={styles.shell}>
      {/* LEFT */}
      <aside className={styles.leftPanel}>
        {/* ── Step indicator ── */}
        <div className={styles.stepIndicator}>
          <span className={`${styles.stepPill} ${selectedTemplate ? styles.stepPillDone : styles.stepPillActive}`}>
            <span className={styles.stepPillNumber}>{selectedTemplate ? "\u2713" : "1"}</span>
            Product
          </span>
          <span className={`${styles.stepPill} ${leftPanelState === "ready" ? styles.stepPillDone : leftPanelState === "no-artwork" ? styles.stepPillActive : ""}`}>
            <span className={styles.stepPillNumber}>{leftPanelState === "ready" ? "\u2713" : "2"}</span>
            Artwork
          </span>
          <span className={`${styles.stepPill} ${leftPanelState === "ready" ? styles.stepPillActive : ""}`}>
            <span className={styles.stepPillNumber}>3</span>
            Export
          </span>
        </div>

        <div className={styles.leftPanelScroll}>
          {/* ══════════════════════════════════════════════════════════ */}
          {/* STATE A — No template selected                           */}
          {/* ══════════════════════════════════════════════════════════ */}
          {leftPanelState === "no-template" && (
            <>
              <div className={styles.selectProductPrompt}>
                <span className={styles.selectProductPromptText}>
                  Select a product to get started
                </span>
                <button
                  type="button"
                  className={styles.selectProductBtn}
                  onClick={() => setShowTemplateGallery(true)}
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
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={t.thumbnailDataUrl} alt={t.name} className={styles.productMiniThumb} />
                      <span className={styles.productMiniName}>{t.name}</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={styles.seeAllBtn}
                  onClick={() => setShowTemplateGallery(true)}
                >
                  See all {"\u2192"}
                </button>
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedTemplate.thumbnailDataUrl}
                  alt={selectedTemplate.name}
                  className={styles.productCardCompactThumb}
                />
                <div className={styles.productCardCompactInfo}>
                  <span className={styles.productCardCompactName}>{selectedTemplate.name}</span>
                  <span className={styles.productCardCompactDims}>
                    {selectedTemplate.dimensions.diameterMm > 0
                      ? `\u00F8${selectedTemplate.dimensions.diameterMm}mm \u00D7 ${selectedTemplate.dimensions.printHeightMm}mm`
                      : `${selectedTemplate.dimensions.templateWidthMm} \u00D7 ${selectedTemplate.dimensions.printHeightMm}mm`}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.productCardCompactChange}
                  onClick={() => setShowTemplateGallery(true)}
                >
                  Change
                </button>
              </div>

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
                <button
                  type="button"
                  className={styles.artworkUploadBtn}
                  onClick={() => artworkFileRef.current?.click()}
                >
                  + Upload SVG
                </button>
                <span className={styles.artworkUploadHint}>
                  Drop an SVG file or click to browse
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedTemplate.thumbnailDataUrl}
                  alt={selectedTemplate.name}
                  className={styles.productCardCompactThumb}
                />
                <div className={styles.productCardCompactInfo}>
                  <span className={styles.productCardCompactName}>{selectedTemplate.name}</span>
                  <span className={styles.productCardCompactDims}>
                    {selectedTemplate.dimensions.diameterMm > 0
                      ? `\u00F8${selectedTemplate.dimensions.diameterMm}mm \u00D7 ${selectedTemplate.dimensions.printHeightMm}mm`
                      : `${selectedTemplate.dimensions.templateWidthMm} \u00D7 ${selectedTemplate.dimensions.printHeightMm}mm`}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.productCardCompactChange}
                  onClick={() => setShowTemplateGallery(true)}
                >
                  Change
                </button>
              </div>

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
                <button
                  type="button"
                  className={styles.artworkUploadBtn}
                  onClick={() => artworkFileRef.current?.click()}
                  style={{ padding: "8px 0", fontSize: "12px" }}
                >
                  + Add more artwork
                </button>
              </div>

              {/* 3D preview — temporarily hidden until properly oriented GLB is ready */}
              {false && !is3DPlacement && (
                <Model3DPanel
                  placedItems={placedItems}
                  bedWidthMm={bedConfig.width}
                  bedHeightMm={bedConfig.height}
                  workspaceMode={bedConfig.workspaceMode}
                  tumblerDims={tumblerDims}
                  handleArcDeg={selectedTemplate?.tumblerMapping?.handleArcDeg ?? selectedTemplate?.dimensions?.handleArcDeg ?? 0}
                  modelPathOverride={selectedTemplate?.glbPath ?? null}
                  tumblerMapping={selectedTemplate?.tumblerMapping}
                  onUpdateCalibration={handleUpdateCalibration}
                />
              )}
            </>
          )}
        </div>
      </aside>

      {/* CENTER */}
      <main className={styles.centerPanel}>
        {/* 3D placement view — temporarily hidden until properly oriented GLB is ready */}
        {false && is3DPlacement && tumblerDims ? (
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
            isPlacementArmed={isPlacementArmed}
            framePreview={framePreview}
            showTwoSidedCrosshairs={isTumblerMode}
            mockupConfig={mockupConfig}
            flatBedItemOverlay={flatBedItemOverlay}
            handleArcDeg={selectedTemplate?.tumblerMapping?.handleArcDeg ?? selectedTemplate?.dimensions?.handleArcDeg ?? 0}
            onWorkspaceModeChange={handleWorkspaceModeChange}
            tumblerViewMode={tumblerViewMode}
            onTumblerViewModeChange={setTumblerViewMode}
            onPlaceAsset={handlePlaceAsset}
            onSelectItem={handleSelectItem}
            onUpdateItem={handleUpdateItem}
            onNudgeSelected={handleNudgeSelected}
            onDeleteItem={handleDeleteItem}
            onClearWorkspace={handleClearWorkspace}
            productName={selectedTemplate?.name}
            templateOverlayUrl={selectedTemplate?.productPhotoFullUrl ?? selectedTemplate?.frontPhotoDataUrl ?? selectedTemplate?.thumbnailDataUrl ?? null}
            backOverlayUrl={selectedTemplate?.backPhotoDataUrl ?? null}
            overlayMode={overlayMode}
            overlayOpacityPct={overlayOpacity}
            twoSidedMode={twoSidedMode}
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
            Job
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

        {rightTab === "workflow" && (
          <>
            {/* ZONE 2: Accordion sections (scrollable) */}
            <div className={styles.rightAccordionScroll}>
              {/* Orders toggle — hidden by default */}
              {showOrders && (
                <>
                  <OrdersPanel
                    bedConfig={bedConfig}
                    assetNames={assetNames}
                    onLoadOrder={handleLoadOrder}
                  />
                  <BatchQueuePanel onLoadOrder={handleLoadOrder} />
                </>
              )}
              <button
                type="button"
                className={styles.ordersToggle}
                onClick={() => setShowOrders((p) => !p)}
              >
                {showOrders ? "\u25BE" : "\u25B8"} Orders
              </button>

              {/* Selected item inspector — only when item selected */}
              {selectedItem && (
                <SelectedItemInspector
                  selectedItem={selectedItem}
                  bedConfig={bedConfig}
                  statusNote={inspectorNote}
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
                <BedSettingsPanel bedConfig={bedConfig} onUpdateBedConfig={setBedConfig} />
              </AccordionSection>

              <AccordionSection
                id="material"
                title="Material Profile"
                summary={materialSummary}
                isOpen={openSection === "material"}
                onToggle={handleAccordionToggle}
              >
                <MaterialProfilePanel onMaterialChange={setMaterialSettings} />
              </AccordionSection>

              <AccordionSection
                id="grid"
                title="Grid & Snap"
                summary={gridSummary}
                isOpen={openSection === "grid"}
                onToggle={handleAccordionToggle}
              >
                {/* Grid settings are inside BedSettingsPanel — reuse */}
                <BedSettingsPanel bedConfig={bedConfig} onUpdateBedConfig={setBedConfig} />
              </AccordionSection>

              <AccordionSection
                id="history"
                title="Export History"
                summary=""
                isOpen={openSection === "history"}
                onToggle={handleAccordionToggle}
              >
                <ExportHistoryPanel bedConfig={bedConfig} placedItems={placedItems} />
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
            <div className={styles.rightPinnedExport}>
              <TumblerExportPanel
                bedConfig={bedConfig}
                placedItems={placedItems}
                onFramePreviewChange={setFramePreview}
                materialSettings={materialSettings}
                onPreflightNav={handlePreflightNav}
              />
            </div>
          </>
        )}

        {rightTab === "tools" && (
          <div className={styles.tabPane}>
            <ColorLayerPanel
              layers={laserLayers}
              onUpdateLayer={handleUpdateLayer}
              onSetLayers={setLaserLayers}
              activeAssetContent={svgAssets.find(a => a.id === selectedAssetId)?.content}
            />
            <FlatBedItemPanel />
            <TextToolPanel onAddAsset={handleAddTextAsset} />
            <TextPersonalizationPanel />
            <CameraOverlayPanel onCaptureOverlay={handleCameraCapture} />
            <TestGridPanel bedWidthMm={bedConfig.width} bedHeightMm={bedConfig.height} />
          </div>
        )}

        {rightTab === "setup" && (
          <div className={styles.tabPane}>
            <MachineProfilePanel />
            <FiberColorCalibrationPanel />
            <SprCalibrationPanel bedConfig={bedConfig} />
            <RotaryPresetSharePanel />
          </div>
        )}
      </aside>

      {/* ── Template gallery modal ── */}
      {showTemplateGallery && (
        <div className={styles.modalBackdrop} onClick={() => { setShowTemplateGallery(false); setShowCreateForm(false); setEditingTemplate(null); }}>
          <div className={styles.modalContainer} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>
                {showCreateForm
                  ? editingTemplate ? "Edit template" : "Create new template"
                  : "Select product"}
              </span>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => { setShowTemplateGallery(false); setShowCreateForm(false); setEditingTemplate(null); }}
              >
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              {showCreateForm ? (
                <TemplateCreateForm
                  editingTemplate={editingTemplate ?? undefined}
                  onSave={(t) => {
                    // If the edited template is the active one, re-select to sync workspace
                    if (editingTemplate && selectedTemplate?.id === t.id) {
                      handleTemplateSelect(t);
                    } else if (!editingTemplate) {
                      handleTemplateSelect(t);
                    }
                    setShowCreateForm(false);
                    setEditingTemplate(null);
                    if (editingTemplate) {
                      setToastMessage("Template updated");
                      setTimeout(() => setToastMessage(null), 2200);
                    }
                  }}
                  onCancel={() => { setShowCreateForm(false); setEditingTemplate(null); }}
                />
              ) : (
                <TemplateGallery
                  onSelect={handleTemplateSelect}
                  onCreateNew={() => { setEditingTemplate(null); setShowCreateForm(true); }}
                  onEdit={(t) => { setEditingTemplate(t); setShowCreateForm(true); }}
                  selectedId={selectedTemplate?.id}
                />
              )}
            </div>
            {!showCreateForm && (
              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.modalCreateBtn}
                  onClick={() => { setEditingTemplate(null); setShowCreateForm(true); }}
                >
                  Create new template
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toastMessage && (
        <div className={styles.toast}>{toastMessage}</div>
      )}
    </div>
  );
}
