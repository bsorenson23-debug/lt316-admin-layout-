"use client";

/**
 * SelectedItemInspector
 *
 * Right-sidebar section for inspecting and editing the selected placed item:
 *   - Position (x, y) in mm
 *   - Size (width, height) in mm
 *   - Rotation in degrees
 *   - Reset to defaults
 *   - Delete item
 *
 * Shows an empty state when nothing is selected.
 */

import React from "react";
import { BedConfig, PlacedItem } from "@/types/admin";
import styles from "./SelectedItemInspector.module.css";

interface Props {
  selectedItem: PlacedItem | null;
  bedConfig: BedConfig;
  onUpdateItem: (id: string, patch: Partial<Omit<PlacedItem, "id" | "assetId">>) => void;
  onDeleteItem: (id: string) => void;
}

export function SelectedItemInspector({
  selectedItem,
  bedConfig,
  onUpdateItem,
  onDeleteItem,
}: Props) {
  if (!selectedItem) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.title}>Inspector</span>
        </div>
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>⊙</span>
          <p>No item selected.</p>
          <p className={styles.emptyHint}>Click a placed item on the bed to inspect it.</p>
        </div>
      </div>
    );
  }

  const update = (patch: Partial<Omit<PlacedItem, "id" | "assetId">>) =>
    onUpdateItem(selectedItem.id, patch);

  const handleNum = (
    field: keyof Pick<PlacedItem, "x" | "y" | "width" | "height" | "rotation">,
    raw: string,
    min: number,
    max: number
  ) => {
    const n = parseFloat(raw);
    if (!isNaN(n) && n >= min && n <= max) {
      update({ [field]: n });
    }
  };

  const handleReset = () =>
    update({ x: 0, y: 0, rotation: 0 });

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Inspector</span>
        <span className={styles.itemLabel}>item selected</span>
      </div>

      <div className={styles.body}>
        {/* ---- Position ---- */}
        <div className={styles.sectionLabel}>Position (mm)</div>
        <div className={styles.twoCol}>
          <InspectorField
            label="X"
            value={selectedItem.x}
            min={0}
            max={bedConfig.width}
            onChange={(v) => handleNum("x", v, 0, bedConfig.width)}
          />
          <InspectorField
            label="Y"
            value={selectedItem.y}
            min={0}
            max={bedConfig.height}
            onChange={(v) => handleNum("y", v, 0, bedConfig.height)}
          />
        </div>

        {/* ---- Size ---- */}
        <div className={styles.sectionLabel}>Size (mm)</div>
        <div className={styles.twoCol}>
          <InspectorField
            label="W"
            value={selectedItem.width}
            min={1}
            max={bedConfig.width}
            onChange={(v) => handleNum("width", v, 1, bedConfig.width)}
          />
          <InspectorField
            label="H"
            value={selectedItem.height}
            min={1}
            max={bedConfig.height}
            onChange={(v) => handleNum("height", v, 1, bedConfig.height)}
          />
        </div>

        {/* ---- Rotation ---- */}
        <div className={styles.sectionLabel}>Rotation (°)</div>
        <div className={styles.rotRow}>
          <input
            type="range"
            className={styles.rotSlider}
            min={-180}
            max={180}
            step={1}
            value={selectedItem.rotation}
            onChange={(e) => handleNum("rotation", e.target.value, -180, 180)}
            aria-label="Rotation degrees"
          />
          <input
            type="number"
            className={styles.numInput}
            value={selectedItem.rotation}
            min={-180}
            max={180}
            step={1}
            onChange={(e) => handleNum("rotation", e.target.value, -180, 180)}
            aria-label="Rotation value"
          />
        </div>

        {/* ---- Actions ---- */}
        <div className={styles.actions}>
          <button className={styles.resetBtn} onClick={handleReset}>
            Reset Position
          </button>
          <button
            className={styles.deleteBtn}
            onClick={() => onDeleteItem(selectedItem.id)}
          >
            Delete Item
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tiny sub-component: a labelled number input
// ---------------------------------------------------------------------------

function InspectorField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: string) => void;
}) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <input
        type="number"
        className={styles.numInput}
        value={Math.round(value * 10) / 10}
        min={min}
        max={max}
        step={0.5}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      />
    </div>
  );
}
