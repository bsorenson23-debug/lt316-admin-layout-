"use client";

import React from "react";
import { BedConfig, normalizeBedConfig } from "@/types/admin";
import styles from "./GridSettingsPanel.module.css";

interface Props {
  bedConfig: BedConfig;
  onUpdateBedConfig: (config: BedConfig) => void;
}

export function GridSettingsPanel({ bedConfig, onUpdateBedConfig }: Props) {
  const set = (patch: Partial<BedConfig>) =>
    onUpdateBedConfig(normalizeBedConfig({ ...bedConfig, ...patch }));

  return (
    <div className={styles.panel}>
      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>Grid (mm)</span>
        <div className={styles.fieldControl}>
          <input
            className={styles.numInput}
            type="number"
            min={1}
            max={200}
            step={1}
            value={bedConfig.gridSpacing}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (!Number.isFinite(next)) return;
              set({ gridSpacing: Math.min(200, Math.max(1, next)) });
            }}
            aria-label="Grid spacing in mm"
          />
        </div>
      </div>

      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>Snap to Grid</span>
        <div className={styles.fieldControl}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={bedConfig.snapToGrid}
              onChange={(event) => set({ snapToGrid: event.target.checked })}
              aria-label="Snap dragged items to grid"
            />
            <span className={styles.toggleTrack} />
          </label>
        </div>
      </div>

      <p className={styles.note}>
        Keyboard nudges and the on-canvas arrow pad follow the current grid step when snap is on.
      </p>
    </div>
  );
}
