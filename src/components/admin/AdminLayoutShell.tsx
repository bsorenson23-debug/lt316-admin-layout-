"use client";

import React, { useCallback, useState } from "react";
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
import type { FramePreviewProp, BedMockupConfig } from "./LaserBedWorkspace";
import { BedSettingsPanel } from "./BedSettingsPanel";
import { TumblerAutoDetectPanel } from "./TumblerAutoDetectPanel";
import { Model3DPanel } from "./Model3DPanel";
import { TumblerExportPanel } from "./TumblerExportPanel";
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

  // -- Derived --------------------------------------------------------------
  const isTumblerMode = bedConfig.workspaceMode === "tumbler-wrap";
  const placementAsset = svgAssets.find((a) => a.id === placementAssetId) ?? null;
  const isPlacementArmed = placementAsset !== null;
  const selectedItem = placedItems.find((p) => p.id === selectedItemId) ?? null;

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
    }
    if (qualityNotes.length > 0) {
      setInspectorNote(`Quality warnings: ${qualityNotes.slice(0, 2).join(" | ")}${qualityNotes.length > 2 ? " | ..." : ""}`);
    }
    if (rejected.length > 0) {
      const preview = rejected.slice(0, 2).join(" | ") + (rejected.length > 2 ? " | ..." : "");
      setUploadError(`Skipped ${rejected.length} file(s): ${preview}`);
    } else { setUploadError(null); }
  }, [selectedAssetId]);

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
  const buildPlacedItem = useCallback((
    asset: SvgAsset, xMm: number, yMm: number,
  ): PlacedItem => {
    const maxAutoSize = Math.max(40, Math.min(100, Math.min(bedConfig.width, bedConfig.height) * 0.35));
    const { width, height } = defaultPlacedSize(asset, maxAutoSize);
    const id = `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const defaults = { x: xMm, y: yMm, width, height, rotation: 0 };
    return {
      id, assetId: asset.id, name: asset.name,
      svgText: asset.content, sourceSvgText: asset.content,
      documentBounds: { ...asset.documentBounds },
      artworkBounds: { ...asset.artworkBounds },
      x: xMm, y: yMm, width, height, rotation: 0, defaults,
    };
  }, [bedConfig]);

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
    if (selectedAssetId) setPlacementAssetId(selectedAssetId);
    setInspectorNote(null);
  }, [selectedAssetId]);

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
    if (mode === "center-bed")    setInspectorNote("Centered using artwork bounds");
    if (mode === "center-x")      setInspectorNote("Centered horizontally");
    if (mode === "center-y")      setInspectorNote("Centered vertically");
    if (mode === "fit-bed")       setInspectorNote("Fitted to bed");
    if (mode === "opposite-logo") setInspectorNote("Placed opposite logo (180°)");
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
  }, []);

  const handleLoadOrder = useCallback((snapshot: BedConfig) => {
    setBedConfig(snapshot);
  }, []);

  // Derived list of asset names for order capture
  const assetNames = svgAssets.map((a) => a.name);

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

  return (
    <div className={styles.shell}>
      {/* LEFT */}
      <aside className={styles.leftPanel}>
        <SvgAssetLibraryPanel
          assets={svgAssets}
          selectedAssetId={selectedAssetId}
          onSelectAsset={setSelectedAssetId}
          onUpload={handleUploadAssets}
          uploadError={uploadError}
          onPlaceSelectedAsset={handlePlaceSelectedAssetOnBed}
          onRemoveAsset={handleRemoveAsset}
          onClearAll={handleClearAssets}
        >
          <TumblerAutoDetectPanel
            bedConfig={bedConfig}
            onApplyDraft={handleApplyTumblerDraft}
            onSetMockup={setMockupConfig}
            mockupActive={mockupConfig !== null}
          />
        </SvgAssetLibraryPanel>
        <Model3DPanel />
      </aside>

      {/* CENTER */}
      <main className={styles.centerPanel}>
        <LaserBedWorkspace
          bedConfig={bedConfig}
          placedItems={placedItems}
          selectedItemId={selectedItemId}
          placementAsset={placementAsset}
          isPlacementArmed={isPlacementArmed}
          framePreview={framePreview}
          showTwoSidedCrosshairs={isTumblerMode}
          mockupConfig={mockupConfig}
          onWorkspaceModeChange={handleWorkspaceModeChange}
          onPlaceAsset={handlePlaceAsset}
          onSelectItem={handleSelectItem}
          onUpdateItem={handleUpdateItem}
          onNudgeSelected={handleNudgeSelected}
          onDeleteItem={handleDeleteItem}
          onClearWorkspace={handleClearWorkspace}
        />
      </main>

      {/* RIGHT */}
      <aside className={styles.rightPanel}>
        <OrdersPanel
          bedConfig={bedConfig}
          assetNames={assetNames}
          onLoadOrder={handleLoadOrder}
        />
        <BatchQueuePanel onLoadOrder={handleLoadOrder} />
        <BedSettingsPanel bedConfig={bedConfig} onUpdateBedConfig={setBedConfig} />
        <MaterialProfilePanel onMaterialChange={setMaterialSettings} />
        <TumblerExportPanel
          bedConfig={bedConfig}
          placedItems={placedItems}
          onFramePreviewChange={setFramePreview}
          materialSettings={materialSettings}
        />
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
        <ProofMockupPanel
          bedConfig={bedConfig}
          placedItems={placedItems}
          mockupConfig={mockupConfig}
        />
        <SprCalibrationPanel bedConfig={bedConfig} />
        <TextToolPanel onAddAsset={handleAddTextAsset} />
        <TextPersonalizationPanel />
        <CameraOverlayPanel onCaptureOverlay={handleCameraCapture} />
        <TestGridPanel bedWidthMm={bedConfig.width} bedHeightMm={bedConfig.height} />
        <MachineProfilePanel />
        <ExportHistoryPanel bedConfig={bedConfig} placedItems={placedItems} />
        <RotaryPresetSharePanel />
      </aside>
    </div>
  );
}
