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
import {
  BedConfig,
  ItemAlignmentMode,
  PlacedItem,
  PlacedItemPatch,
} from "@/types/admin";
import styles from "./SelectedItemInspector.module.css";

interface Props {
  selectedItem: PlacedItem | null;
  bedConfig: BedConfig;
  statusNote: string | null;
  onUpdateItem: (id: string, patch: PlacedItemPatch) => void;
  onAlignItem: (id: string, mode: ItemAlignmentMode) => void;
  onResetItem: (id: string) => void;
  onNormalizeItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
}

export function SelectedItemInspector({
  selectedItem,
  bedConfig,
  statusNote,
  onUpdateItem,
  onAlignItem,
  onResetItem,
  onNormalizeItem,
  onDeleteItem,
}: Props) {
  if (!selectedItem) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.title}>Inspector</span>
        </div>
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>o</span>
          <p>No item selected.</p>
          <p className={styles.emptyHint}>Click a placed item on the bed to inspect it.</p>
        </div>
      </div>
    );
  }

  const update = (patch: PlacedItemPatch) =>
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

  const handleReset = () => onResetItem(selectedItem.id);
  const handleAlign = (mode: ItemAlignmentMode) => onAlignItem(selectedItem.id, mode);
  const handleNormalize = () => onNormalizeItem(selectedItem.id);
  const positionLimit = Math.max(bedConfig.width, bedConfig.height) * 2;

  const displayName = selectedItem.name.replace(/\.svg$/i, "");

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Inspector</span>
        <span className={styles.itemLabel}>selected</span>
      </div>

      <div className={styles.body}>
        <div className={styles.sectionLabel}>Item</div>
        <div className={styles.itemName}>{displayName}</div>

        {/* ---- Position ---- */}
        <div className={styles.sectionLabel}>Position (mm)</div>
        <div className={styles.twoCol}>
          <InspectorField
            label="X"
            value={selectedItem.x}
            min={-positionLimit}
            max={positionLimit}
            onChange={(v) => handleNum("x", v, -positionLimit, positionLimit)}
          />
          <InspectorField
            label="Y"
            value={selectedItem.y}
            min={-positionLimit}
            max={positionLimit}
            onChange={(v) => handleNum("y", v, -positionLimit, positionLimit)}
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
        <div className={styles.sectionLabel}>Rotation (deg)</div>
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
        <div className={styles.sectionLabel}>Alignment</div>
        <div className={styles.alignActions}>
          <button className={styles.actionBtn} onClick={() => handleAlign("center-bed")}>
            Center on Bed
          </button>
          <button className={styles.actionBtn} onClick={() => handleAlign("center-x")}>
            Center X
          </button>
          <button className={styles.actionBtn} onClick={() => handleAlign("center-y")}>
            Center Y
          </button>
          <button className={styles.actionBtn} onClick={() => handleAlign("fit-bed")}>
            Fit to Bed
          </button>
        </div>

        <div className={styles.sectionLabel}>SVG Bounds</div>
        <div className={styles.boundsRow}>
          <span>Document</span>
          <span>
            {selectedItem.documentBounds.x.toFixed(1)},{selectedItem.documentBounds.y.toFixed(1)} /{" "}
            {selectedItem.documentBounds.width.toFixed(1)} x {selectedItem.documentBounds.height.toFixed(1)}
          </span>
        </div>
        <div className={styles.boundsRow}>
          <span>Artwork</span>
          <span>
            {selectedItem.artworkBounds.x.toFixed(1)},{selectedItem.artworkBounds.y.toFixed(1)} /{" "}
            {selectedItem.artworkBounds.width.toFixed(1)} x {selectedItem.artworkBounds.height.toFixed(1)}
          </span>
        </div>
        <button className={styles.secondaryBtn} onClick={handleNormalize}>
          Normalize Bounds
        </button>

        <div className={styles.actions}>
          <button className={styles.resetBtn} onClick={handleReset}>
            Reset Placement
          </button>
          <button
            className={styles.deleteBtn}
            onClick={() => onDeleteItem(selectedItem.id)}
          >
            Delete Item
          </button>
        </div>

        {statusNote && <div className={styles.statusNote}>{statusNote}</div>}
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
