import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { BedConfig, PlacedItem } from "@/types/admin";
import type { LaserLayer } from "@/types/laserLayer";
import { buildDefaultLayers } from "@/types/laserLayer";
import { migrateLaserLayerMetadata } from "@/features/color-profiles/presetBridge";
import type { ActiveMaterialSettings } from "../MaterialProfilePanel";

type BuildMaterialSettings = (profileId: string) => ActiveMaterialSettings | null;

interface UseAdminWorkspacePersistenceParams {
  bedConfig: BedConfig;
  setBedConfig: Dispatch<SetStateAction<BedConfig>>;
  placedItems: PlacedItem[];
  setPlacedItems: Dispatch<SetStateAction<PlacedItem[]>>;
  laserLayers: LaserLayer[];
  setLaserLayers: Dispatch<SetStateAction<LaserLayer[]>>;
  setSelectedMaterialProfileId: Dispatch<SetStateAction<string>>;
  setMaterialSettings: Dispatch<SetStateAction<ActiveMaterialSettings | null>>;
  setLbOutputFolderPath: Dispatch<SetStateAction<string | undefined>>;
  buildMaterialSettings: BuildMaterialSettings;
  normalizeBedConfig: (config: BedConfig) => BedConfig;
}

export function useAdminWorkspacePersistence({
  bedConfig,
  setBedConfig,
  placedItems,
  setPlacedItems,
  laserLayers,
  setLaserLayers,
  setSelectedMaterialProfileId,
  setMaterialSettings,
  setLbOutputFolderPath,
  buildMaterialSettings,
  normalizeBedConfig,
}: UseAdminWorkspacePersistenceParams) {
  const [didRestorePersistedState, setDidRestorePersistedState] = useState(false);

  useEffect(() => {
    try {
      const rawBedConfig = localStorage.getItem("lt316_bed_config");
      if (rawBedConfig) {
        setBedConfig(normalizeBedConfig(JSON.parse(rawBedConfig) as BedConfig));
      }

      const rawPlacedItems = localStorage.getItem("lt316_placed_items");
      if (rawPlacedItems) {
        setPlacedItems(JSON.parse(rawPlacedItems) as PlacedItem[]);
      }

      const rawLayers = localStorage.getItem("lt316_laser_layers");
      if (rawLayers) {
        const parsed = JSON.parse(rawLayers) as LaserLayer[];
        const defaults = buildDefaultLayers();
        const migrated = defaults.map((defaultLayer) => {
          const savedLayer = parsed.find((layer) => layer.id === defaultLayer.id);
          return savedLayer
            ? migrateLaserLayerMetadata({ ...defaultLayer, ...savedLayer })
            : defaultLayer;
        });
        setLaserLayers(migrated);
      }

      const savedMaterialProfileId = localStorage.getItem("lt316_material_profile") ?? "";
      setSelectedMaterialProfileId(savedMaterialProfileId);
      setMaterialSettings(buildMaterialSettings(savedMaterialProfileId));

      const rawLightBurnPaths = localStorage.getItem("lt316.integration.lightburn.paths");
      if (rawLightBurnPaths) {
        const parsed = JSON.parse(rawLightBurnPaths) as { outputFolderPath?: string };
        setLbOutputFolderPath(parsed.outputFolderPath || undefined);
      }
    } catch {
      // Ignore malformed persisted state and fall back to defaults.
    } finally {
      setDidRestorePersistedState(true);
    }
  }, [
    buildMaterialSettings,
    normalizeBedConfig,
    setBedConfig,
    setLbOutputFolderPath,
    setLaserLayers,
    setMaterialSettings,
    setPlacedItems,
    setSelectedMaterialProfileId,
  ]);

  useEffect(() => {
    if (!didRestorePersistedState) return;
    try {
      localStorage.setItem("lt316_bed_config", JSON.stringify(bedConfig));
    } catch {
      // quota exceeded
    }
  }, [bedConfig, didRestorePersistedState]);

  useEffect(() => {
    if (!didRestorePersistedState) return;
    try {
      localStorage.setItem("lt316_placed_items", JSON.stringify(placedItems));
    } catch {
      // quota exceeded
    }
  }, [placedItems, didRestorePersistedState]);

  useEffect(() => {
    if (!didRestorePersistedState) return;
    try {
      localStorage.setItem("lt316_laser_layers", JSON.stringify(laserLayers));
    } catch {
      // quota exceeded
    }
  }, [laserLayers, didRestorePersistedState]);

  return { didRestorePersistedState };
}
