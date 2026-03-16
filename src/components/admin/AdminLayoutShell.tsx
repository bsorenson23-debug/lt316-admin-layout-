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
import { BedConfig, DEFAULT_BED_CONFIG, PlacedItem, SvgAsset } from "@/types/admin";
import { parseSvgAsset, defaultPlacedSize } from "@/utils/svg";
import { SvgAssetLibraryPanel } from "./SvgAssetLibraryPanel";
import { LaserBedWorkspace } from "./LaserBedWorkspace";
import { BedSettingsPanel } from "./BedSettingsPanel";
import { SelectedItemInspector } from "./SelectedItemInspector";
import styles from "./AdminLayoutShell.module.css";

export function AdminLayoutShell() {
  // -- Bed configuration ----------------------------------------------------
  const [bedConfig, setBedConfig] = useState<BedConfig>(DEFAULT_BED_CONFIG);

  // -- SVG asset library ----------------------------------------------------
  const [svgAssets, setSvgAssets] = useState<SvgAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  // -- Placed items on the bed ----------------------------------------------
  const [placedItems, setPlacedItems] = useState<PlacedItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Asset library handlers
  // -------------------------------------------------------------------------
  const handleUploadAssets = useCallback(
    (files: FileList) => {
      const readers: Promise<SvgAsset>[] = Array.from(files).map(
        (file) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const content = reader.result as string;
              const id = `asset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
              resolve(parseSvgAsset(id, file.name, content));
            };
            reader.onerror = reject;
            reader.readAsText(file);
          })
      );

      Promise.all(readers).then((assets) => {
        setSvgAssets((prev) => [...prev, ...assets]);
        // Auto-select first newly added asset if nothing is selected
        if (!selectedAssetId && assets.length > 0) {
          setSelectedAssetId(assets[0].id);
        }
      });
    },
    [selectedAssetId]
  );

  const handleRemoveAsset = useCallback(
    (assetId: string) => {
      setSvgAssets((prev) => prev.filter((a) => a.id !== assetId));
      // De-select if needed
      if (selectedAssetId === assetId) setSelectedAssetId(null);
      // Remove any placed items sourced from this asset
      setPlacedItems((prev) => prev.filter((p) => p.assetId !== assetId));
    },
    [selectedAssetId]
  );

  const handleClearAssets = useCallback(() => {
    setSvgAssets([]);
    setSelectedAssetId(null);
    setPlacedItems([]);
    setSelectedItemId(null);
  }, []);

  // -------------------------------------------------------------------------
  // Placed item handlers
  // -------------------------------------------------------------------------

  /** Place the currently selected asset at a given bed position (mm). */
  const handlePlaceAsset = useCallback(
    (xMm: number, yMm: number) => {
      if (!selectedAssetId) return;
      const asset = svgAssets.find((a) => a.id === selectedAssetId);
      if (!asset) return;

      const { width, height } = defaultPlacedSize(asset, 80);
      const id = `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const newItem: PlacedItem = {
        id,
        assetId: selectedAssetId,
        x: xMm,
        y: yMm,
        width,
        height,
        rotation: 0,
        locked: false,
        visible: true,
      };

      setPlacedItems((prev) => [...prev, newItem]);
      setSelectedItemId(id);
    },
    [selectedAssetId, svgAssets]
  );

  const handleSelectItem = useCallback((itemId: string | null) => {
    setSelectedItemId(itemId);
  }, []);

  const handleUpdateItem = useCallback(
    (id: string, patch: Partial<Omit<PlacedItem, "id" | "assetId">>) => {
      setPlacedItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
      );
    },
    []
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
  }, []);

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------
  const selectedItem = placedItems.find((p) => p.id === selectedItemId) ?? null;
  const selectedAsset = svgAssets.find((a) => a.id === selectedAssetId) ?? null;

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
          onRemoveAsset={handleRemoveAsset}
          onClearAll={handleClearAssets}
        />
      </aside>

      {/* CENTER: Laser bed workspace */}
      <main className={styles.centerPanel}>
        <LaserBedWorkspace
          bedConfig={bedConfig}
          svgAssets={svgAssets}
          placedItems={placedItems}
          selectedItemId={selectedItemId}
          activeAsset={selectedAsset}
          onPlaceAsset={handlePlaceAsset}
          onSelectItem={handleSelectItem}
          onUpdateItem={handleUpdateItem}
          onClearWorkspace={handleClearWorkspace}
        />
      </main>

      {/* RIGHT: Bed settings + item inspector */}
      <aside className={styles.rightPanel}>
        <BedSettingsPanel
          bedConfig={bedConfig}
          onUpdateBedConfig={setBedConfig}
        />
        <SelectedItemInspector
          selectedItem={selectedItem}
          bedConfig={bedConfig}
          onUpdateItem={handleUpdateItem}
          onDeleteItem={handleDeleteItem}
        />
      </aside>
    </div>
  );
}
