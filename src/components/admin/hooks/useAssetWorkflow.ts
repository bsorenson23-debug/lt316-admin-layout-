import { useCallback, useDebugValue } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  BedConfig,
  EngravableZone,
  ItemAlignmentMode,
  PlacedItem,
  PlacedItemPatch,
  SvgAsset,
  WorkspaceMode,
} from "@/types/admin";
import type { TumblerSpecDraft } from "@/types/tumblerAutoSize";
import { clearSvgLibraryAssets, deleteSvgLibraryAsset, importSvgLibraryAssets } from "@/lib/svgLibraryClient";
import { convertVectorUpload } from "@/lib/vectorImportClient";
import { clamp } from "@/utils/geometry";
import { defaultPlacedSize, normalizeSvgToArtworkBounds } from "@/utils/svg";
import {
  computeAlignmentPatch,
  computePlacementFromArtworkRect,
  getPlacedArtworkBounds,
} from "@/utils/alignment";
import { applyTumblerSuggestion } from "@/utils/tumblerAutoSize";
import { checkSvgQuality } from "@/utils/svgQualityCheck";
import { centerArtworkBetweenGrooves, getActiveTumblerGuideBand } from "@/utils/tumblerGuides";
import { getWrapFrontCenter } from "@/utils/tumblerWrapLayout";

interface UseAssetWorkflowParams {
  bedConfig: BedConfig;
  activeHandleArcDeg: number;
  isTumblerMode: boolean;
  engravableZone: EngravableZone | null;
  svgAssets: SvgAsset[];
  selectedAssetId: string | null;
  placementAssetId: string | null;
  selectedItemId: string | null;
  setSvgAssets: Dispatch<SetStateAction<SvgAsset[]>>;
  setSelectedAssetId: Dispatch<SetStateAction<string | null>>;
  setPlacementAssetId: Dispatch<SetStateAction<string | null>>;
  setUploadError: Dispatch<SetStateAction<string | null>>;
  setInspectorNote: Dispatch<SetStateAction<string | null>>;
  setPlacedItems: Dispatch<SetStateAction<PlacedItem[]>>;
  setSelectedItemId: Dispatch<SetStateAction<string | null>>;
  setBedConfig: Dispatch<SetStateAction<BedConfig>>;
  setTumblerViewMode: (viewMode: "grid" | "3d-placement") => void;
  normalizeBedConfig: (config: BedConfig) => BedConfig;
}

function isDevEnvironment() {
  return process.env.NODE_ENV !== "production";
}

export function useAssetWorkflow({
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
}: UseAssetWorkflowParams) {
  useDebugValue({
    workspaceMode: bedConfig.workspaceMode,
    selectedAssetId,
    placementAssetId,
    selectedItemId,
    isTumblerMode,
  });

  const buildPlacedItem = useCallback((asset: SvgAsset, xMm: number, yMm: number): PlacedItem => {
    const maxAutoSize = Math.max(40, Math.min(100, Math.min(bedConfig.width, bedConfig.height) * 0.35));
    const { width, height } = defaultPlacedSize(asset, maxAutoSize);
    const id = `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const itemX = xMm - width / 2;
    const itemY = yMm - height / 2;
    const defaults = { x: itemX, y: itemY, width, height, rotation: 0 };
    return {
      id,
      assetId: asset.id,
      name: asset.name,
      svgText: asset.content,
      sourceSvgText: asset.content,
      documentBounds: { ...asset.documentBounds },
      artworkBounds: { ...asset.artworkBounds },
      x: itemX,
      y: itemY,
      width,
      height,
      rotation: 0,
      defaults,
    };
  }, [bedConfig]);

  const handleUploadAssets = useCallback(async (files: FileList) => {
    const acceptedInputs: Array<{
      name: string;
      originalFileName: string;
      relativePath: string | null;
      svgText: string;
    }> = [];
    const rejected: string[] = [];
    const qualityNotes: string[] = [];

    for (const file of Array.from(files)) {
      try {
        const imported = await convertVectorUpload(file);
        const quality = checkSvgQuality(imported.svgText);
        if (quality.hasErrors) {
          const msgs = quality.issues.filter((i) => i.severity === "error").map((i) => i.message).join("; ");
          rejected.push(`${file.name}: ${msgs}`);
          continue;
        }
        if (imported.warnings.length > 0) {
          qualityNotes.push(`${file.name}: ${imported.warnings.join(" | ")}`);
        }
        if (quality.hasWarnings) {
          const msgs = quality.issues.filter((i) => i.severity === "warn").map((i) => i.code).join(", ");
          qualityNotes.push(`${file.name}: ${msgs}`);
        }
        acceptedInputs.push({
          name: imported.name,
          originalFileName: file.name,
          relativePath:
            typeof file.webkitRelativePath === "string" && file.webkitRelativePath.trim()
              ? file.webkitRelativePath
              : null,
          svgText: imported.svgText,
        });
      } catch (e) {
        rejected.push(`${file.name}: ${e instanceof Error ? e.message : "parse error"}`);
      }
    }

    let accepted: SvgAsset[] = [];
    if (acceptedInputs.length > 0) {
      try {
        const importedAssets = await importSvgLibraryAssets(acceptedInputs);
        accepted = importedAssets.assets;
        if (importedAssets.rejected.length > 0) {
          rejected.push(
            ...importedAssets.rejected.map((entry) => `${entry.relativePath ?? entry.name}: ${entry.error}`),
          );
        }
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : "Failed to import SVG library files");
        return;
      }
    }

    if (accepted.length > 0) {
      setSvgAssets((prev) => [...prev, ...accepted]);
      if (!selectedAssetId) setSelectedAssetId(accepted[0].id);

      const placementCenterX =
        bedConfig.workspaceMode === "tumbler-wrap"
          ? getWrapFrontCenter(bedConfig.width, activeHandleArcDeg)
          : bedConfig.width / 2;
      const placementCenterY = engravableZone
        ? (engravableZone.printableCenterY ?? (engravableZone.y + engravableZone.height / 2))
        : bedConfig.height / 2;
      const newItems: PlacedItem[] = accepted.map((asset) =>
        buildPlacedItem(asset, placementCenterX, placementCenterY),
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
    } else {
      setUploadError(null);
    }
  }, [
    activeHandleArcDeg,
    bedConfig,
    buildPlacedItem,
    engravableZone,
    selectedAssetId,
    setInspectorNote,
    setPlacedItems,
    setSelectedAssetId,
    setSelectedItemId,
    setSvgAssets,
    setUploadError,
  ]);

  const handleRemoveAsset = useCallback(async (assetId: string) => {
    try {
      await deleteSvgLibraryAsset(assetId);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Failed to delete SVG");
      return;
    }

    setSvgAssets((prev) => {
      const next = prev.filter((a) => a.id !== assetId);
      if (selectedAssetId === assetId) setSelectedAssetId(next[0]?.id ?? null);
      if (placementAssetId === assetId) setPlacementAssetId(null);
      return next;
    });

    setPlacedItems((prev) => prev.filter((p) => p.assetId !== assetId));
    setSelectedItemId((id) => {
      if (id && id === selectedItemId) {
        setInspectorNote(null);
        return null;
      }
      return id;
    });
    setUploadError(null);
  }, [placementAssetId, selectedAssetId, selectedItemId, setInspectorNote, setPlacedItems, setPlacementAssetId, setSelectedAssetId, setSelectedItemId, setSvgAssets, setUploadError]);

  const handleClearAssets = useCallback(async () => {
    try {
      await clearSvgLibraryAssets();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Failed to clear SVG library");
      return;
    }

    setSvgAssets([]);
    setSelectedAssetId(null);
    setPlacementAssetId(null);
    setPlacedItems([]);
    setSelectedItemId(null);
    setUploadError(null);
    setInspectorNote(null);
  }, [setInspectorNote, setPlacedItems, setPlacementAssetId, setSelectedAssetId, setSelectedItemId, setSvgAssets, setUploadError]);

  const handlePlaceAsset = useCallback((xMm: number, yMm: number) => {
    if (!placementAssetId) return;
    const asset = svgAssets.find((a) => a.id === placementAssetId);
    if (!asset) return;
    const item = buildPlacedItem(asset, xMm, yMm);
    setPlacedItems((prev) => [...prev, item]);
    setSelectedItemId(item.id);
    setPlacementAssetId(null);
    setInspectorNote(null);
  }, [buildPlacedItem, placementAssetId, setInspectorNote, setPlacedItems, setPlacementAssetId, setSelectedItemId, svgAssets]);

  const handlePlaceSelectedAssetOnBed = useCallback(() => {
    if (!selectedAssetId) return;
    if (isTumblerMode) {
      const asset = svgAssets.find((a) => a.id === selectedAssetId);
      if (asset) {
        const item = buildPlacedItem(
          asset,
          getWrapFrontCenter(bedConfig.width, activeHandleArcDeg),
          engravableZone
            ? (engravableZone.printableCenterY ?? (engravableZone.y + engravableZone.height / 2))
            : bedConfig.height / 2,
        );
        setPlacedItems((prev) => [...prev, item]);
        setSelectedItemId(item.id);
        setInspectorNote(null);
        return;
      }
    }
    setPlacementAssetId(selectedAssetId);
    setInspectorNote(null);
  }, [activeHandleArcDeg, bedConfig, buildPlacedItem, engravableZone, isTumblerMode, selectedAssetId, setInspectorNote, setPlacedItems, setPlacementAssetId, setSelectedItemId, svgAssets]);

  const handleSelectItem = useCallback((id: string | null) => {
    setSelectedItemId(id);
    if (!id) setInspectorNote(null);
  }, [setInspectorNote, setSelectedItemId]);

  const handleUpdateItem = useCallback((id: string, patch: PlacedItemPatch) => {
    setPlacedItems((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, [setPlacedItems]);

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
  }, [bedConfig, selectedItemId, setPlacedItems]);

  const handleClearWorkspace = useCallback(() => {
    setPlacedItems([]);
    setSelectedItemId(null);
    setPlacementAssetId(null);
    setInspectorNote(null);
  }, [setInspectorNote, setPlacedItems, setPlacementAssetId, setSelectedItemId]);

  const handleDeleteItem = useCallback((id: string) => {
    setPlacedItems((prev) => prev.filter((p) => p.id !== id));
    if (selectedItemId === id) setSelectedItemId(null);
  }, [selectedItemId, setPlacedItems, setSelectedItemId]);

  const handleResetItem = useCallback((id: string) => {
    setPlacedItems((prev) => prev.map((p) =>
      p.id !== id
        ? p
        : { ...p, x: p.defaults.x, y: p.defaults.y, width: p.defaults.width, height: p.defaults.height, rotation: p.defaults.rotation },
    ));
    setInspectorNote("Reset to defaults");
  }, [setInspectorNote, setPlacedItems]);

  const handleAlignItem = useCallback((id: string, mode: ItemAlignmentMode) => {
    setPlacedItems((prev) => prev.map((p) =>
      p.id !== id ? p : { ...p, ...computeAlignmentPatch(p, bedConfig, mode, engravableZone) },
    ));
    if (mode === "center-bed") setInspectorNote("Centered using artwork bounds");
    if (mode === "center-x") setInspectorNote("Centered horizontally");
    if (mode === "center-y") setInspectorNote("Centered vertically");
    if (mode === "fit-bed") setInspectorNote("Fitted to bed");
    if (mode === "opposite-logo") setInspectorNote("Placed opposite logo (180°)");
    if (mode === "center-on-front") setInspectorNote("Centered on front face");
    if (mode === "center-zone") setInspectorNote("Centered in engravable zone");
    if (mode === "fit-zone") setInspectorNote("Fitted to engravable zone");
  }, [bedConfig, engravableZone, setInspectorNote, setPlacedItems]);

  const handleNormalizeItem = useCallback((id: string) => {
    let did = false;
    setPlacedItems((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      try {
        const current = getPlacedArtworkBounds(p);
        const n = normalizeSvgToArtworkBounds(p.sourceSvgText, p.artworkBounds);
        const next = computePlacementFromArtworkRect({
          targetArtwork: current,
          documentBounds: n.documentBounds,
          artworkBounds: n.artworkBounds,
        });
        did = true;
        return {
          ...p,
          svgText: n.svgText,
          documentBounds: n.documentBounds,
          artworkBounds: n.artworkBounds,
          ...next,
          defaults: { ...p.defaults, ...next },
        };
      } catch {
        return p;
      }
    }));
    setInspectorNote(did ? "Normalized SVG bounds" : "Could not normalize");
  }, [setInspectorNote, setPlacedItems]);

  const handleCenterSelectedBetweenGuides = useCallback((id: string) => {
    const guideBand = getActiveTumblerGuideBand(bedConfig);
    if (!guideBand) return;

    setPlacedItems((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const c = centerArtworkBetweenGrooves({
        currentYmm: p.y,
        itemHeightMm: p.height,
        workspaceHeightMm: bedConfig.height,
        band: guideBand,
      });
      if (isDevEnvironment()) {
        console.info("[tumbler-guides] centered", { guideBand, nextY: c.yMm });
      }
      return { ...p, y: Number(c.yMm.toFixed(3)) };
    }));

    setInspectorNote("Centered between groove guides");
  }, [bedConfig, setInspectorNote, setPlacedItems]);

  const handleApplyTumblerDraft = useCallback((draft: TumblerSpecDraft) => {
    setBedConfig((prev) => applyTumblerSuggestion(prev, draft));
    setInspectorNote("Applied auto-detected tumbler template");
  }, [setBedConfig, setInspectorNote]);

  const handleWorkspaceModeChange = useCallback((mode: WorkspaceMode) => {
    setBedConfig((prev) => normalizeBedConfig({ ...prev, workspaceMode: mode }));
    if (mode !== "tumbler-wrap") setTumblerViewMode("grid");
  }, [normalizeBedConfig, setBedConfig, setTumblerViewMode]);

  return {
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
  };
}
