"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  BedConfig,
  DEFAULT_BED_CONFIG,
  ItemAlignmentMode,
  PlacedItem,
  PlacedItemPatch,
  SvgAsset,
} from "@/types/admin";
import { parseSvgAsset, defaultPlacedSize, normalizeSvgToArtworkBounds } from "@/utils/svg";
import { TumblerSpecDraft } from "@/types/tumblerAutoSize";
import {
  computeAlignmentPatch,
  computePlacementFromArtworkRect,
  getPlacedArtworkBounds,
} from "@/utils/alignment";
import { applyTumblerSuggestion } from "@/utils/tumblerAutoSize";
import { centerArtworkBetweenGrooves, getActiveTumblerGuideBand } from "@/utils/tumblerGuides";
import { SvgAssetLibraryPanel } from "./SvgAssetLibraryPanel";
import { LaserBedWorkspace } from "./LaserBedWorkspace";
import type { FramePreviewProp } from "./LaserBedWorkspace";
import { BedSettingsPanel } from "./BedSettingsPanel";
import { TumblerAutoDetectPanel } from "./TumblerAutoDetectPanel";
import { TumblerExportPanel } from "./TumblerExportPanel";
import { SelectedItemInspector } from "./SelectedItemInspector";
import { SplitAlignmentRail } from "./SplitAlignmentRail";
import styles from "./AdminLayoutShell.module.css";

type TumblerViewMode = "wrap" | "two-sided";
type ActiveSide = "front" | "back";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isDevEnvironment() {
  return process.env.NODE_ENV !== "production";
}

export function AdminLayoutShell() {
  // -- Bed config -----------------------------------------------------------
  const [bedConfig, setBedConfig] = useState<BedConfig>(DEFAULT_BED_CONFIG);

  // -- View mode (tumbler only) ---------------------------------------------
  const [tumblerViewMode, setTumblerViewMode] = useState<TumblerViewMode>("wrap");
  const [activeSide, setActiveSide] = useState<ActiveSide>("front");

  // -- Asset library --------------------------------------------------------
  const [svgAssets, setSvgAssets] = useState<SvgAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [placementAssetId, setPlacementAssetId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [inspectorNote, setInspectorNote] = useState<string | null>(null);

  // -- Placed items (front / single) ----------------------------------------
  const [placedItems, setPlacedItems] = useState<PlacedItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // -- Placed items (back — two-sided only) ---------------------------------
  const [backPlacedItems, setBackPlacedItems] = useState<PlacedItem[]>([]);
  const [backSelectedItemId, setBackSelectedItemId] = useState<string | null>(null);

  // -- Frame preview --------------------------------------------------------
  const [framePreview, setFramePreview] = useState<FramePreviewProp | null>(null);

  // -- Derived --------------------------------------------------------------
  const isTumblerMode = bedConfig.workspaceMode === "tumbler-wrap";
  const isTwoSided = isTumblerMode && tumblerViewMode === "two-sided";

  /** Half-circumference bed config used for each panel in two-sided mode. */
  const halfBedConfig = useMemo<BedConfig>(() => ({
    ...bedConfig,
    width: bedConfig.width / 2,
    tumblerTemplateWidthMm: bedConfig.width / 2,
  }), [bedConfig]);

  const placementAsset = svgAssets.find((a) => a.id === placementAssetId) ?? null;
  const isPlacementArmed = placementAsset !== null;

  // Active-side item list and selection
  const activeItems      = activeSide === "front" ? placedItems     : backPlacedItems;
  const activeSelectedId = activeSide === "front" ? selectedItemId  : backSelectedItemId;
  const activeSelectedItem = activeItems.find((p) => p.id === activeSelectedId) ?? null;

  // Export items = active side in two-sided, all items in wrap
  const exportItems = isTwoSided ? activeItems : placedItems;

  // -------------------------------------------------------------------------
  // Asset library handlers
  // -------------------------------------------------------------------------
  const handleUploadAssets = useCallback(async (files: FileList) => {
    const accepted: SvgAsset[] = [];
    const rejected: string[] = [];

    for (const file of Array.from(files)) {
      if (file.type !== "image/svg+xml" && !/\.svg$/i.test(file.name)) {
        rejected.push(`${file.name}: not an SVG file`); continue;
      }
      try {
        const content = await file.text();
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
    const dropItems = (prev: PlacedItem[]) => prev.filter((p) => p.assetId !== assetId);
    setPlacedItems(dropItems);
    setBackPlacedItems(dropItems);
    setSelectedItemId((id) => {
      if (id && !placedItems.some((p) => p.id === id && p.assetId !== assetId)) { setInspectorNote(null); return null; }
      return id;
    });
    setBackSelectedItemId((id) => {
      if (id && !backPlacedItems.some((p) => p.id === id && p.assetId !== assetId)) return null;
      return id;
    });
  }, [selectedAssetId, placementAssetId, placedItems, backPlacedItems]);

  const handleClearAssets = useCallback(() => {
    setSvgAssets([]); setSelectedAssetId(null); setPlacementAssetId(null);
    setPlacedItems([]); setBackPlacedItems([]);
    setSelectedItemId(null); setBackSelectedItemId(null);
    setUploadError(null); setInspectorNote(null);
  }, []);

  // -------------------------------------------------------------------------
  // Item builders
  // -------------------------------------------------------------------------
  const buildPlacedItem = useCallback((
    asset: SvgAsset, xMm: number, yMm: number,
    cfg: BedConfig = bedConfig,
  ): PlacedItem => {
    const maxAutoSize = Math.max(40, Math.min(100, Math.min(cfg.width, cfg.height) * 0.35));
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

  // -------------------------------------------------------------------------
  // Front-side (or single-mode) item handlers
  // -------------------------------------------------------------------------
  const handlePlaceAsset = useCallback((xMm: number, yMm: number) => {
    if (!placementAssetId) return;
    const asset = svgAssets.find((a) => a.id === placementAssetId);
    if (!asset) return;
    const cfg = isTwoSided ? halfBedConfig : bedConfig;
    const item = buildPlacedItem(asset, xMm, yMm, cfg);
    setPlacedItems((prev) => [...prev, item]);
    setSelectedItemId(item.id);
    setActiveSide("front");
    setPlacementAssetId(null);
    setInspectorNote(null);
  }, [placementAssetId, svgAssets, isTwoSided, halfBedConfig, bedConfig, buildPlacedItem]);

  const handlePlaceSelectedAssetOnBed = useCallback(() => {
    if (selectedAssetId) setPlacementAssetId(selectedAssetId);
    setInspectorNote(null);
  }, [selectedAssetId]);

  const handleSelectItem = useCallback((id: string | null) => {
    setSelectedItemId(id);
    setActiveSide("front");
    if (!id) setInspectorNote(null);
  }, []);

  const handleUpdateItem = useCallback((id: string, patch: PlacedItemPatch) => {
    setPlacedItems((prev) => prev.map((p) => p.id === id ? { ...p, ...patch } : p));
  }, []);

  const handleNudgeSelected = useCallback((dxMm: number, dyMm: number) => {
    if (!selectedItemId) return;
    const w = isTwoSided ? halfBedConfig.width : bedConfig.width;
    const h = isTwoSided ? halfBedConfig.height : bedConfig.height;
    setPlacedItems((prev) => prev.map((p) => {
      if (p.id !== selectedItemId) return p;
      return { ...p, x: clamp(p.x + dxMm, 0, Math.max(0, w - p.width)), y: clamp(p.y + dyMm, 0, Math.max(0, h - p.height)) };
    }));
  }, [selectedItemId, isTwoSided, halfBedConfig, bedConfig]);

  const handleClearWorkspace = useCallback(() => {
    setPlacedItems([]); setSelectedItemId(null);
    setPlacementAssetId(null); setInspectorNote(null);
  }, []);

  const handleDeleteItem = useCallback((id: string) => {
    if (activeSide === "front") {
      setPlacedItems((prev) => prev.filter((p) => p.id !== id));
      if (selectedItemId === id) setSelectedItemId(null);
    } else {
      setBackPlacedItems((prev) => prev.filter((p) => p.id !== id));
      if (backSelectedItemId === id) setBackSelectedItemId(null);
    }
  }, [activeSide, selectedItemId, backSelectedItemId]);

  // -------------------------------------------------------------------------
  // Back-side item handlers
  // -------------------------------------------------------------------------
  const handleBackPlaceAsset = useCallback((xMm: number, yMm: number) => {
    if (!placementAssetId) return;
    const asset = svgAssets.find((a) => a.id === placementAssetId);
    if (!asset) return;
    const item = buildPlacedItem(asset, xMm, yMm, halfBedConfig);
    setBackPlacedItems((prev) => [...prev, item]);
    setBackSelectedItemId(item.id);
    setActiveSide("back");
    setPlacementAssetId(null);
    setInspectorNote(null);
  }, [placementAssetId, svgAssets, halfBedConfig, buildPlacedItem]);

  const handleBackSelectItem = useCallback((id: string | null) => {
    setBackSelectedItemId(id);
    setActiveSide("back");
    if (!id) setInspectorNote(null);
  }, []);

  const handleBackUpdateItem = useCallback((id: string, patch: PlacedItemPatch) => {
    setBackPlacedItems((prev) => prev.map((p) => p.id === id ? { ...p, ...patch } : p));
  }, []);

  const handleBackNudge = useCallback((dxMm: number, dyMm: number) => {
    if (!backSelectedItemId) return;
    const { width: w, height: h } = halfBedConfig;
    setBackPlacedItems((prev) => prev.map((p) => {
      if (p.id !== backSelectedItemId) return p;
      return { ...p, x: clamp(p.x + dxMm, 0, Math.max(0, w - p.width)), y: clamp(p.y + dyMm, 0, Math.max(0, h - p.height)) };
    }));
  }, [backSelectedItemId, halfBedConfig]);

  const handleClearBackWorkspace = useCallback(() => {
    setBackPlacedItems([]); setBackSelectedItemId(null);
    setPlacementAssetId(null); setInspectorNote(null);
  }, []);

  // -------------------------------------------------------------------------
  // Shared inspector handlers (route to active side)
  // -------------------------------------------------------------------------
  const handleResetItem = useCallback((id: string) => {
    const reset = (prev: PlacedItem[]) => prev.map((p) =>
      p.id !== id ? p : { ...p, x: p.defaults.x, y: p.defaults.y, width: p.defaults.width, height: p.defaults.height, rotation: p.defaults.rotation }
    );
    if (activeSide === "front") setPlacedItems(reset);
    else setBackPlacedItems(reset);
    setInspectorNote("Reset to defaults");
  }, [activeSide]);

  const handleAlignItem = useCallback((id: string, mode: ItemAlignmentMode) => {
    const cfg = isTwoSided ? halfBedConfig : bedConfig;
    const patch = (prev: PlacedItem[]) => prev.map((p) =>
      p.id !== id ? p : { ...p, ...computeAlignmentPatch(p, cfg, mode) }
    );
    if (activeSide === "front") setPlacedItems(patch);
    else setBackPlacedItems(patch);
    if (mode === "center-bed")  setInspectorNote("Centered using artwork bounds");
    if (mode === "center-x")    setInspectorNote("Centered horizontally");
    if (mode === "center-y")    setInspectorNote("Centered vertically");
    if (mode === "fit-bed")     setInspectorNote("Fitted to bed");
  }, [activeSide, isTwoSided, halfBedConfig, bedConfig]);

  const handleNormalizeItem = useCallback((id: string) => {
    let did = false;
    const norm = (prev: PlacedItem[]) => prev.map((p) => {
      if (p.id !== id) return p;
      try {
        const current = getPlacedArtworkBounds(p);
        const n = normalizeSvgToArtworkBounds(p.sourceSvgText, p.artworkBounds);
        const next = computePlacementFromArtworkRect({ targetArtwork: current, documentBounds: n.documentBounds, artworkBounds: n.artworkBounds });
        did = true;
        return { ...p, svgText: n.svgText, documentBounds: n.documentBounds, artworkBounds: n.artworkBounds, ...next, defaults: { ...p.defaults, ...next } };
      } catch { return p; }
    });
    if (activeSide === "front") setPlacedItems(norm);
    else setBackPlacedItems(norm);
    setInspectorNote(did ? "Normalized SVG bounds" : "Could not normalize");
  }, [activeSide]);

  const handleActiveUpdateItem = useCallback((id: string, patch: PlacedItemPatch) => {
    if (activeSide === "front") handleUpdateItem(id, patch);
    else handleBackUpdateItem(id, patch);
  }, [activeSide, handleUpdateItem, handleBackUpdateItem]);

  const handleCenterSelectedBetweenGuides = useCallback((id: string) => {
    const guideBand = getActiveTumblerGuideBand(bedConfig);
    if (!guideBand) return;
    const center = (prev: PlacedItem[]) => prev.map((p) => {
      if (p.id !== id) return p;
      const c = centerArtworkBetweenGrooves({ currentYmm: p.y, itemHeightMm: p.height, workspaceHeightMm: bedConfig.height, band: guideBand });
      if (isDevEnvironment()) console.info("[tumbler-guides] centered", { guideBand, nextY: c.yMm });
      return { ...p, y: Number(c.yMm.toFixed(3)) };
    });
    if (activeSide === "front") setPlacedItems(center);
    else setBackPlacedItems(center);
    setInspectorNote("Centered between groove guides");
  }, [activeSide, bedConfig]);

  const handleApplyTumblerDraft = useCallback((draft: TumblerSpecDraft) => {
    setBedConfig((prev) => applyTumblerSuggestion(prev, draft));
    setInspectorNote("Applied auto-detected tumbler template");
  }, []);

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------
  const activeCfg = isTwoSided ? halfBedConfig : bedConfig;

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
        />
      </aside>

      {/* CENTER */}
      <main className={styles.centerPanel}>
        {isTwoSided ? (
          /* ── Two-sided split view ── */
          <div className={styles.splitView}>
            <div className={`${styles.splitPane} ${activeSide === "front" ? styles.splitPaneActive : ""}`}>
              <div className={styles.splitPaneLabel}>Front  ·  {(bedConfig.width / 2).toFixed(1)} × {bedConfig.height.toFixed(1)} mm</div>
              <LaserBedWorkspace
                bedConfig={halfBedConfig}
                placedItems={placedItems}
                selectedItemId={activeSide === "front" ? selectedItemId : null}
                placementAsset={placementAsset}
                isPlacementArmed={isPlacementArmed}
                framePreview={null}
                tumblerViewMode={tumblerViewMode}
                onTumblerViewModeChange={setTumblerViewMode}
                onPlaceAsset={handlePlaceAsset}
                onSelectItem={handleSelectItem}
                onUpdateItem={handleUpdateItem}
                onNudgeSelected={handleNudgeSelected}
                onClearWorkspace={handleClearWorkspace}
              />
            </div>
            <SplitAlignmentRail
              bedHeightMm={halfBedConfig.height}
              gridSpacingMm={halfBedConfig.gridSpacing}
              frontItems={placedItems}
              backItems={backPlacedItems}
            />
            <div className={`${styles.splitPane} ${activeSide === "back" ? styles.splitPaneActive : ""}`}>
              <div className={styles.splitPaneLabel}>Back  ·  {(bedConfig.width / 2).toFixed(1)} × {bedConfig.height.toFixed(1)} mm</div>
              <LaserBedWorkspace
                bedConfig={halfBedConfig}
                placedItems={backPlacedItems}
                selectedItemId={activeSide === "back" ? backSelectedItemId : null}
                placementAsset={placementAsset}
                isPlacementArmed={isPlacementArmed}
                framePreview={null}
                tumblerViewMode={tumblerViewMode}
                onTumblerViewModeChange={setTumblerViewMode}
                onPlaceAsset={handleBackPlaceAsset}
                onSelectItem={handleBackSelectItem}
                onUpdateItem={handleBackUpdateItem}
                onNudgeSelected={handleBackNudge}
                onClearWorkspace={handleClearBackWorkspace}
              />
            </div>
          </div>
        ) : (
          /* ── Single / wrap view ── */
          <LaserBedWorkspace
            bedConfig={bedConfig}
            placedItems={placedItems}
            selectedItemId={selectedItemId}
            placementAsset={placementAsset}
            isPlacementArmed={isPlacementArmed}
            framePreview={framePreview}
            tumblerViewMode={tumblerViewMode}
            onTumblerViewModeChange={setTumblerViewMode}
            onPlaceAsset={handlePlaceAsset}
            onSelectItem={handleSelectItem}
            onUpdateItem={handleUpdateItem}
            onNudgeSelected={handleNudgeSelected}
            onClearWorkspace={handleClearWorkspace}
          />
        )}
      </main>

      {/* RIGHT */}
      <aside className={styles.rightPanel}>
        <BedSettingsPanel bedConfig={bedConfig} onUpdateBedConfig={setBedConfig} />
        <TumblerAutoDetectPanel bedConfig={bedConfig} onApplyDraft={handleApplyTumblerDraft} />
        <TumblerExportPanel
          bedConfig={activeCfg}
          placedItems={exportItems}
          onFramePreviewChange={isTwoSided ? undefined : setFramePreview}
        />
        <SelectedItemInspector
          selectedItem={activeSelectedItem}
          bedConfig={activeCfg}
          statusNote={inspectorNote}
          onUpdateItem={handleActiveUpdateItem}
          onAlignItem={handleAlignItem}
          onCenterBetweenGuides={handleCenterSelectedBetweenGuides}
          onResetItem={handleResetItem}
          onNormalizeItem={handleNormalizeItem}
          onDeleteItem={handleDeleteItem}
        />
      </aside>
    </div>
  );
}
