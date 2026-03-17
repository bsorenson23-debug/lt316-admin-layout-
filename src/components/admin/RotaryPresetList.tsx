"use client";

import type { RotaryPlacementPreset } from "@/types/export";
import styles from "./RotaryPresetList.module.css";

interface Props {
  presets: RotaryPlacementPreset[];
  selectedPresetId: string | null;
  onSelectPreset: (presetId: string) => void;
}

export function RotaryPresetList({
  presets,
  selectedPresetId,
  onSelectPreset,
}: Props) {
  if (presets.length === 0) {
    return (
      <div className={styles.emptyState}>
        No rotary presets yet. Create one to start calibration.
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {presets.map((preset) => {
        const selected = preset.id === selectedPresetId;
        const topAnchorLabel =
          typeof preset.rotaryTopYmm === "number"
            ? preset.rotaryTopYmm.toFixed(1)
            : "Measure";
        return (
          <button
            key={preset.id}
            type="button"
            className={selected ? styles.itemActive : styles.item}
            onClick={() => onSelectPreset(preset.id)}
          >
            <span className={styles.itemTitle}>{preset.name}</span>
            <span className={styles.itemMeta}>
              {preset.chuckOrRoller} | X {preset.rotaryCenterXmm.toFixed(1)} | Y{" "}
              {topAnchorLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}
