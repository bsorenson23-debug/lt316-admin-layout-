"use client";

/**
 * BedSettingsPanel
 *
 * Right-sidebar section for editing laser bed configuration:
 *   - Width (mm)
 *   - Height (mm)
 *   - Grid spacing (mm)
 *   - Show origin toggle
 *   - Origin position (reserved for future bottom-left support)
 */

import React from "react";
import { BedConfig } from "@/types/admin";
import styles from "./BedSettingsPanel.module.css";

interface Props {
  bedConfig: BedConfig;
  onUpdateBedConfig: (config: BedConfig) => void;
}

export function BedSettingsPanel({ bedConfig, onUpdateBedConfig }: Props) {
  const set = (patch: Partial<BedConfig>) =>
    onUpdateBedConfig({ ...bedConfig, ...patch });

  const handleNumber = (
    field: keyof Pick<BedConfig, "width" | "height" | "gridSpacing">,
    raw: string,
    min: number,
    max: number
  ) => {
    const n = parseFloat(raw);
    if (!isNaN(n) && n >= min && n <= max) {
      set({ [field]: n });
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Bed Settings</span>
      </div>

      <div className={styles.body}>
        {/* Bed width */}
        <FieldRow label="Width (mm)">
          <input
            type="number"
            className={styles.numInput}
            value={bedConfig.width}
            min={10}
            max={2000}
            step={10}
            onChange={(e) => handleNumber("width", e.target.value, 10, 2000)}
            aria-label="Bed width in mm"
          />
        </FieldRow>

        {/* Bed height */}
        <FieldRow label="Height (mm)">
          <input
            type="number"
            className={styles.numInput}
            value={bedConfig.height}
            min={10}
            max={2000}
            step={10}
            onChange={(e) => handleNumber("height", e.target.value, 10, 2000)}
            aria-label="Bed height in mm"
          />
        </FieldRow>

        {/* Grid spacing */}
        <FieldRow label="Grid (mm)">
          <input
            type="number"
            className={styles.numInput}
            value={bedConfig.gridSpacing}
            min={1}
            max={200}
            step={1}
            onChange={(e) => handleNumber("gridSpacing", e.target.value, 1, 200)}
            aria-label="Grid spacing in mm"
          />
        </FieldRow>

        {/* Show origin */}
        <FieldRow label="Show Origin">
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={bedConfig.showOrigin}
              onChange={(e) => set({ showOrigin: e.target.checked })}
              aria-label="Show origin indicator"
            />
            <span className={styles.toggleTrack} />
          </label>
        </FieldRow>

        {/* Origin position */}
        <FieldRow label="Origin">
          <select
            className={styles.select}
            value={bedConfig.originPosition}
            onChange={(e) =>
              set({
                originPosition: e.target.value as BedConfig["originPosition"],
              })
            }
            aria-label="Origin position"
          >
            <option value="top-left">Top-left</option>
            {/* TODO: bottom-left support requires flipping y in the workspace render */}
            <option value="bottom-left" disabled>
              Bottom-left (coming soon)
            </option>
          </select>
        </FieldRow>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: labelled form row
// ---------------------------------------------------------------------------

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.fieldRow}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.fieldControl}>{children}</div>
    </div>
  );
}
