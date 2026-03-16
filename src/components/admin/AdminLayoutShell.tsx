"use client";

/**
 * AdminLayoutShell
 *
 * Top-level container for the LT316 admin laser bed workspace.
 * Owns all shared state and distributes it to child panels via props.
 *
 * Panel layout:
 *   [LEFT: SVG Asset Library] [CENTER: Laser Bed Workspace] [RIGHT: Settings + Inspector]
 */

import { useCallback, useState } from "react";
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
import { SvgAssetLibraryPanel } from "./SvgAssetLibraryPanel";
import { LaserBedWorkspace } from "./LaserBedWorkspace";
import { BedSettingsPanel } from "./BedSettingsPanel";
import { TumblerAutoDetectPanel } from "./TumblerAutoDetectPanel";
import { SelectedItemInspector } from "./SelectedItemInspector";
import styles from "./AdminLayoutShell.module.css";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function AdminLayoutShell() {
  // -- Bed configuration ----------------------------------------------------
  const [bedConfig, setBedConfig] = useState<BedConfig>(DEFAULT_BED_CONFIG);

  // -- SVG asset library ----------------------------------------------------
  const [svgAssets, setSvgAssets] = useState<SvgAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [placementAssetId, setPlacementAssetId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [inspectorNote, setInspectorNote] = useState<string | null>(null);

  // -- Placed items on the bed ----------------------------------------------
  const [placedItems, setPlacedItems] = useState<PlacedItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Asset library handlers
  // -------------------------------------------------------------------------
  const handleUploadAssets = useCallback(
    async (files: FileList) => {
      const acceptedAssets: SvgAsset[] = [];
      const rejected: string[] = [];

      for (const file of Array.from(files)) {
        const looksLikeSvg =
          file.type === "image/svg+xml" || /\.svg$/i.test(file.name);

        if (!looksLikeSvg) {
          rejected.push(`${file.name}: not an SVG file`);
          continue;
        }

        try {
          const content = await file.text();
          const id = `asset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const parsed = parseSvgAsset(id, file.name, content);

          try {
            const normalized = normalizeSvgToArtworkBounds(
              parsed.content,
              parsed.artworkBounds
            );
            acceptedAssets.push({
              ...parsed,
              content: normalized.svgText,
              viewBox: `${normalized.documentBounds.x} ${normalized.documentBounds.y} ${normalized.documentBounds.width} ${normalized.documentBounds.height}`,
              naturalWidth: normalized.documentBounds.width,
              naturalHeight: normalized.documentBounds.height,
              documentBounds: normalized.documentBounds,
              artworkBounds: normalized.artworkBounds,
            });
          } catch {
            acceptedAssets.push(parsed);
          }
        } catch (error) {
          const reason =
            error instanceof Error ? error.message : "Could not parse SVG";
          rejected.push(`${file.name}: ${reason}`);
        }
      }

      if (acceptedAssets.length > 0) {
        setSvgAssets((prev) => [...prev, ...acceptedAssets]);
        if (!selectedAssetId) setSelectedAssetId(acceptedAssets[0].id);
      }

      if (rejected.length > 0) {
        const preview = rejected.slice(0, 2).join(" | ");
        const suffix = rejected.length > 2 ? " | ..." : "";
        setUploadError(`Skipped ${rejected.length} file(s): ${preview}${suffix}`);
      } else {
        setUploadError(null);
      }
    },
    [selectedAssetId]
  );

  const handleRemoveAsset = useCallback(
    (assetId: string) => {
      setSvgAssets((prev) => {
        const next = prev.filter((a) => a.id !== assetId);
        if (selectedAssetId === assetId) {
          setSelectedAssetId(next.length > 0 ? next[0].id : null);
        }
        if (placementAssetId === assetId) {
          setPlacementAssetId(null);
        }
        return next;
      });

      setPlacedItems((prev) => {
        const next = prev.filter((p) => p.assetId !== assetId);
        if (selectedItemId && !next.some((item) => item.id === selectedItemId)) {
          setSelectedItemId(null);
          setInspectorNote(null);
        }
        return next;
      });
    },
    [selectedAssetId, selectedItemId, placementAssetId]
  );

  const handleClearAssets = useCallback(() => {
    setSvgAssets([]);
    setSelectedAssetId(null);
    setPlacementAssetId(null);
    setPlacedItems([]);
    setSelectedItemId(null);
    setUploadError(null);
    setInspectorNote(null);
  }, []);

  // -------------------------------------------------------------------------
  // Placed item handlers
  // -------------------------------------------------------------------------

  const buildPlacedItem = useCallback(
    (
      asset: SvgAsset,
      xMm: number,
      yMm: number,
      forcedSize?: { width: number; height: number }
    ): PlacedItem => {
      const maxAutoSize = Math.max(
        40,
        Math.min(100, Math.min(bedConfig.width, bedConfig.height) * 0.35)
      );
      const { width, height } = forcedSize ?? defaultPlacedSize(asset, maxAutoSize);
      const id = `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const defaults = {
        x: xMm,
        y: yMm,
        width,
        height,
        rotation: 0,
      };

      return {
        id,
        assetId: asset.id,
        name: asset.name,
        svgText: asset.content,
        sourceSvgText: asset.content,
        documentBounds: { ...asset.documentBounds },
        artworkBounds: { ...asset.artworkBounds },
        x: xMm,
        y: yMm,
        width,
        height,
        rotation: 0,
        defaults,
      };
    },
    [bedConfig.height, bedConfig.width]
  );

  const addPlacedItem = useCallback((item: PlacedItem) => {
    setPlacedItems((prev) => [...prev, item]);
    setSelectedItemId(item.id);
  }, []);

  /** Place the currently selected asset at a given bed position (mm). */
  const handlePlaceAsset = useCallback(
    (xMm: number, yMm: number) => {
      if (!placementAssetId) return;
      const asset = svgAssets.find((a) => a.id === placementAssetId);
      if (!asset) return;

      addPlacedItem(buildPlacedItem(asset, xMm, yMm));
      setPlacementAssetId(null);
      setInspectorNote(null);
    },
    [placementAssetId, svgAssets, buildPlacedItem, addPlacedItem]
  );

  const handlePlaceSelectedAssetOnBed = useCallback(() => {
    if (!selectedAssetId) return;
    setPlacementAssetId(selectedAssetId);
    setInspectorNote(null);
  }, [selectedAssetId]);

  const handleResetItem = useCallback((id: string) => {
    setPlacedItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              x: item.defaults.x,
              y: item.defaults.y,
              width: item.defaults.width,
              height: item.defaults.height,
              rotation: item.defaults.rotation,
            }
          : item
      )
    );
    setInspectorNote("Reset placement to item defaults");
  }, []);

  const handleAlignItem = useCallback(
    (id: string, mode: ItemAlignmentMode) => {
      setPlacedItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                ...computeAlignmentPatch(item, bedConfig, mode),
              }
            : item
        )
      );

      if (mode === "center-bed") setInspectorNote("Centered using artwork bounds");
      if (mode === "center-x") setInspectorNote("Centered artwork horizontally");
      if (mode === "center-y") setInspectorNote("Centered artwork vertically");
      if (mode === "fit-bed") setInspectorNote("Fitted artwork to bed");
    },
    [bedConfig]
  );

  const handleNormalizeItem = useCallback((id: string) => {
    let didNormalize = false;

    setPlacedItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;

        try {
          const currentArtwork = getPlacedArtworkBounds(item);
          const normalized = normalizeSvgToArtworkBounds(item.sourceSvgText, item.artworkBounds);
          const nextPlacement = computePlacementFromArtworkRect({
            targetArtwork: currentArtwork,
            documentBounds: normalized.documentBounds,
            artworkBounds: normalized.artworkBounds,
          });

          didNormalize = true;
          return {
            ...item,
            svgText: normalized.svgText,
            documentBounds: normalized.documentBounds,
            artworkBounds: normalized.artworkBounds,
            x: nextPlacement.x,
            y: nextPlacement.y,
            width: nextPlacement.width,
            height: nextPlacement.height,
            defaults: {
              ...item.defaults,
              x: nextPlacement.x,
              y: nextPlacement.y,
              width: nextPlacement.width,
              height: nextPlacement.height,
            },
          };
        } catch {
          return item;
        }
      })
    );

    if (didNormalize) {
      setInspectorNote("Normalized SVG bounds");
    } else {
      setInspectorNote("Could not normalize SVG bounds");
    }
  }, []);

  const handleSelectItem = useCallback((itemId: string | null) => {
    setSelectedItemId(itemId);
    if (!itemId) setInspectorNote(null);
  }, []);

  const handleUpdateItem = useCallback(
    (id: string, patch: PlacedItemPatch) => {
      setPlacedItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
      );
    },
    []
  );

  const handleNudgeSelected = useCallback(
    (dxMm: number, dyMm: number) => {
      if (!selectedItemId) return;

      setPlacedItems((prev) =>
        prev.map((item) => {
          if (item.id !== selectedItemId) return item;
          const maxX = Math.max(0, bedConfig.width - item.width);
          const maxY = Math.max(0, bedConfig.height - item.height);
          return {
            ...item,
            x: clamp(item.x + dxMm, 0, maxX),
            y: clamp(item.y + dyMm, 0, maxY),
          };
        })
      );
    },
    [selectedItemId, bedConfig.width, bedConfig.height]
  );

  const handleDeleteItem = useCallback(
    (id: string) => {
      setPlacedItems((prev) => prev.filter((p) => p.id !== id));
      if (selectedItemId === id) setSelectedItemId(null);
    },
    [selectedItemId]
  );

  const handleClearWorkspace = useCallback(() => {
    setPlacedItems([]);
    setSelectedItemId(null);
    setPlacementAssetId(null);
    setInspectorNote(null);
  }, []);

  const handleApplyTumblerDraft = useCallback((draft: TumblerSpecDraft) => {
    setBedConfig((prev) => applyTumblerSuggestion(prev, draft));
    setInspectorNote("Applied auto-detected tumbler template");
  }, []);

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------
  const selectedItem = placedItems.find((p) => p.id === selectedItemId) ?? null;
  const placementAsset = svgAssets.find((a) => a.id === placementAssetId) ?? null;
  const isPlacementArmed = placementAsset !== null;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className={styles.shell}>
      {/* LEFT: SVG asset library */}
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

      {/* CENTER: Laser bed workspace */}
      <main className={styles.centerPanel}>
        <LaserBedWorkspace
          bedConfig={bedConfig}
          placedItems={placedItems}
          selectedItemId={selectedItemId}
          placementAsset={placementAsset}
          isPlacementArmed={isPlacementArmed}
          onPlaceAsset={handlePlaceAsset}
          onSelectItem={handleSelectItem}
          onUpdateItem={handleUpdateItem}
          onNudgeSelected={handleNudgeSelected}
          onClearWorkspace={handleClearWorkspace}
        />
      </main>

      {/* RIGHT: Bed settings + item inspector */}
      <aside className={styles.rightPanel}>
        <BedSettingsPanel
          bedConfig={bedConfig}
          onUpdateBedConfig={setBedConfig}
        />
        <TumblerAutoDetectPanel
          bedConfig={bedConfig}
          onApplyDraft={handleApplyTumblerDraft}
        />
        <SelectedItemInspector
          selectedItem={selectedItem}
          bedConfig={bedConfig}
          statusNote={inspectorNote}
          onUpdateItem={handleUpdateItem}
          onAlignItem={handleAlignItem}
          onResetItem={handleResetItem}
          onNormalizeItem={handleNormalizeItem}
          onDeleteItem={handleDeleteItem}
        />
      </aside>
    </div>
  );
}
