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

import React, { useState, lazy, Suspense } from "react";
import {
  BedConfig,
  EngravableZone,
  ItemAlignmentMode,
  PlacedItem,
  PlacedItemPatch,
} from "@/types/admin";

// Lazy-load the simulator overlay (GSAP is large, don't bundle unless needed)
const LaserSimulatorOverlay = lazy(() =>
  import("./LaserSimulatorOverlay").then(m => ({ default: m.LaserSimulatorOverlay }))
);
import {
  getActiveTumblerGuideBand,
  getGuideBandMetrics,
} from "@/utils/tumblerGuides";
import styles from "./SelectedItemInspector.module.css";

interface Props {
  selectedItem: PlacedItem | null;
  bedConfig: BedConfig;
  statusNote: string | null;
  engravableZone?: EngravableZone | null;
  onUpdateItem: (id: string, patch: PlacedItemPatch) => void;
  onAlignItem: (id: string, mode: ItemAlignmentMode) => void;
  onCenterBetweenGuides: (id: string) => void;
  onResetItem: (id: string) => void;
  onNormalizeItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
}

export function SelectedItemInspector({
  selectedItem,
  bedConfig,
  statusNote,
  engravableZone,
  onUpdateItem,
  onAlignItem,
  onCenterBetweenGuides,
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
  const handleCenterBetweenGuides = () => onCenterBetweenGuides(selectedItem.id);
  const handleNormalize = () => onNormalizeItem(selectedItem.id);
  const [showSimulator, setShowSimulator] = useState(false);
  const positionLimit = Math.max(bedConfig.width, bedConfig.height) * 2;
  const isTumblerMode = bedConfig.workspaceMode === "tumbler-wrap";
  const activeGuideBand = getActiveTumblerGuideBand(bedConfig);
  const guideMetrics = activeGuideBand
    ? getGuideBandMetrics(activeGuideBand)
    : null;

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

        {/* ---- Smart Placement (tumbler-wrap) ---- */}
        {isTumblerMode && (
          <>
            <div className={styles.sectionLabel}>Quick Placement</div>
            <div className={styles.presetGrid}>
              <button
                className={styles.presetBtn}
                onClick={() => handleAlign("center-on-front")}
                title="Center artwork on the front face, opposite the handle"
              >
                <span className={styles.presetIcon}>
                  <svg viewBox="0 0 24 24" width="16" height="16">
                    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="12" cy="2" r="2" fill="var(--text-muted)" />
                    <circle cx="12" cy="22" r="3" fill="var(--accent)" />
                  </svg>
                </span>
                <span>Center Front</span>
              </button>
              <button
                className={styles.presetBtn}
                onClick={() => handleAlign("opposite-logo")}
                title="Place in upper third, opposite the manufacturer logo zone"
              >
                <span className={styles.presetIcon}>
                  <svg viewBox="0 0 24 24" width="16" height="16">
                    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="12" cy="2" r="2" fill="var(--text-muted)" />
                    <circle cx="12" cy="19" r="3" fill="var(--accent)" />
                  </svg>
                </span>
                <span>Opposite Logo</span>
              </button>
              <button
                className={styles.presetBtn}
                onClick={() => handleAlign("right-of-handle")}
                title="Faces you when holding the tumbler in your right hand"
              >
                <span className={styles.presetIcon}>
                  <svg viewBox="0 0 24 24" width="16" height="16">
                    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="12" cy="2" r="2" fill="var(--text-muted)" />
                    <circle cx="17" cy="20" r="3" fill="var(--accent)" />
                  </svg>
                </span>
                <span>Right Hand</span>
              </button>
              <button
                className={styles.presetBtn}
                onClick={() => handleAlign("left-of-handle")}
                title="Faces you when holding the tumbler in your left hand"
              >
                <span className={styles.presetIcon}>
                  <svg viewBox="0 0 24 24" width="16" height="16">
                    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="12" cy="2" r="2" fill="var(--text-muted)" />
                    <circle cx="7" cy="20" r="3" fill="var(--accent)" />
                  </svg>
                </span>
                <span>Left Hand</span>
              </button>
              <button
                className={styles.presetBtn}
                onClick={() => handleAlign("full-wrap")}
                title="Scale artwork to fill the entire printable wrap area"
              >
                <span className={styles.presetIcon}>
                  <svg viewBox="0 0 24 24" width="16" height="16">
                    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="12" cy="2" r="2" fill="var(--text-muted)" />
                    <path d="M4 18 A10 10 0 0 0 20 18" fill="none" stroke="var(--accent)" strokeWidth="2.5" />
                  </svg>
                </span>
                <span>Full Wrap</span>
              </button>
              <button
                className={styles.presetBtn}
                onClick={() => handleAlign("back-side")}
                title="Place artwork on the back of the tumbler, behind the handle"
              >
                <span className={styles.presetIcon}>
                  <svg viewBox="0 0 24 24" width="16" height="16">
                    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="12" cy="2" r="2" fill="var(--text-muted)" />
                    <circle cx="12" cy="5" r="3" fill="var(--accent)" />
                  </svg>
                </span>
                <span>Back Side</span>
              </button>
              {engravableZone && (
                <>
                  <button
                    className={styles.presetBtn}
                    onClick={() => handleAlign("center-zone")}
                    title="Center artwork within the engravable zone"
                  >
                    <span className={styles.presetIcon}>
                      <svg viewBox="0 0 24 24" width="16" height="16">
                        <rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="var(--success)" strokeWidth="1.5" strokeDasharray="3 2" />
                        <circle cx="12" cy="12" r="3" fill="var(--accent)" />
                      </svg>
                    </span>
                    <span>Center Zone</span>
                  </button>
                  <button
                    className={styles.presetBtn}
                    onClick={() => handleAlign("fit-zone")}
                    title="Scale artwork to fit within the engravable zone"
                  >
                    <span className={styles.presetIcon}>
                      <svg viewBox="0 0 24 24" width="16" height="16">
                        <rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="var(--success)" strokeWidth="1.5" strokeDasharray="3 2" />
                        <rect x="5" y="7" width="14" height="10" rx="1" fill="var(--accent)" opacity="0.4" />
                      </svg>
                    </span>
                    <span>Fit Zone</span>
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {/* ---- Manual Alignment ---- */}
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

        {activeGuideBand && guideMetrics && (
          <>
            <div className={styles.sectionLabel}>Groove Guides</div>
            <div className={styles.boundsRow}>
              <span>Band Height</span>
              <span>{guideMetrics.bandHeightMm.toFixed(1)} mm</span>
            </div>
            <div className={styles.boundsRow}>
              <span>Center Y</span>
              <span>{guideMetrics.bandCenterYmm.toFixed(1)} mm</span>
            </div>
            <button className={styles.actionBtn} onClick={handleCenterBetweenGuides}>
              Center between guides
            </button>
          </>
        )}

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

        {/* ── Laser Simulation ── */}
        <div className={styles.sectionLabel}>Laser Tools</div>
        <button
          className={styles.actionBtn}
          style={{ background: "#0a1a2a", borderColor: "#1a4a6a", color: "#5ab0d0" }}
          onClick={() => setShowSimulator(true)}
          title="Animate the laser path using GSAP to preview engrave order and estimate time"
        >
          ▶ Simulate Engrave
        </button>

        {statusNote && <div className={styles.statusNote}>{statusNote}</div>}
      </div>

      {/* GSAP Laser Simulator Overlay */}
      {showSimulator && (
        <Suspense fallback={null}>
          <LaserSimulatorOverlay
            svgContent={selectedItem.svgText}
            itemName={selectedItem.name.replace(/\.svg$/i, "")}
            speedMmPerSec={100}
            passes={1}
            onClose={() => setShowSimulator(false)}
          />
        </Suspense>
      )}
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
