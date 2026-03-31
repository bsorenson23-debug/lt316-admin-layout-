"use client";

import React, { useState, useSyncExternalStore } from "react";
import {
  FLAT_BED_ITEMS,
  FLAT_BED_CATEGORIES,
  FLAT_BED_CATEGORY_LABELS,
  type FlatBedItem,
  type FlatBedCategory,
} from "@/data/flatBedItems";
import { getBestPreset } from "@/data/laserMaterialPresets";
import {
  LASER_PROFILE_STATE_CHANGED_EVENT,
  getActiveLaserProfile,
} from "@/utils/laserProfileState";
import type { LaserProfile } from "@/types/laserProfile";
import styles from "./FlatBedItemPanel.module.css";

const CATEGORY_COLORS: Record<string, string> = {
  drinkware: "#4a8aaa",
  "plate-board": "#6aaa5a",
  "coaster-tile": "#aa8a4a",
  "sign-plaque": "#aa5a8a",
  "patch-tag": "#5aaa8a",
  tech: "#7a5aaa",
  other: "#8a8a5a",
};

interface Props {
  onApplyItem?: (item: FlatBedItem | null) => void;
  activeItemId?: string | null;
}

function subscribeToLaserProfileState(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  window.addEventListener("storage", onStoreChange);
  window.addEventListener("focus", onStoreChange);
  window.addEventListener(LASER_PROFILE_STATE_CHANGED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("focus", onStoreChange);
    window.removeEventListener(LASER_PROFILE_STATE_CHANGED_EVENT, onStoreChange);
  };
}

function getActiveLaserSnapshot(): LaserProfile | null {
  try {
    return getActiveLaserProfile();
  } catch {
    return null;
  }
}

export function FlatBedItemPanel({
  onApplyItem,
  activeItemId = null,
}: Props) {
  const [open, setOpen] = useState(true);
  const [category, setCategory] = useState<FlatBedCategory | "">("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const activeLaser = useSyncExternalStore(
    subscribeToLaserProfileState,
    getActiveLaserSnapshot,
    () => null,
  );

  const selectedItem = FLAT_BED_ITEMS.find(i => i.id === selectedItemId) ?? null;

  const suggestedPreset = selectedItem && activeLaser
    ? getBestPreset(
        activeLaser.sourceType,
        activeLaser.wattagePeak,
        selectedItem.material,
        selectedItem.productHint,
      )
    : null;

  const filteredItems = category
    ? FLAT_BED_ITEMS.filter(i => i.category === category)
    : FLAT_BED_ITEMS;

  const overlayActive = selectedItem !== null && activeItemId === selectedItem.id;

  function handlePlaceToBed() {
    if (!selectedItem || !onApplyItem) return;
    if (overlayActive) {
      onApplyItem(null);
      return;
    }
    onApplyItem(selectedItem);
  }

  // Clear overlay when item changes
  function handleSelectItem(id: string) {
    setSelectedItemId(id);
    if (overlayActive) {
      onApplyItem?.(null);
    }
  }

  return (
    <div className={styles.panel}>
      <button
        className={styles.header}
        onClick={() => setOpen(o => !o)}
        type="button"
        aria-expanded={open}
      >
        <span className={styles.headerLabel}>
          Flat Bed Item Lookup
          {overlayActive && <span className={styles.activeDot} title="Overlay active" />}
        </span>
        <span className={styles.chevron}>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className={styles.body}>

          {/* Category filter pills */}
          <div className={styles.categoryRow}>
            <button
              className={`${styles.catBtn} ${category === "" ? styles.catBtnActive : ""}`}
              onClick={() => { setCategory(""); handleSelectItem(""); }}
            >All</button>
            {FLAT_BED_CATEGORIES.map(cat => (
              <button
                key={cat}
                className={`${styles.catBtn} ${category === cat ? styles.catBtnActive : ""}`}
                style={category === cat ? { borderColor: CATEGORY_COLORS[cat], color: CATEGORY_COLORS[cat] } : {}}
                onClick={() => { setCategory(cat); handleSelectItem(""); }}
              >
                {FLAT_BED_CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          {/* Item select */}
          <select
            className={styles.select}
            value={selectedItemId}
            onChange={e => handleSelectItem(e.target.value)}
          >
            <option value="">— Select item —</option>
            {filteredItems.map(i => (
              <option key={i.id} value={i.id}>{i.label}</option>
            ))}
          </select>

          {/* Place on Bed button */}
          {onApplyItem && (
            <button
              className={overlayActive ? styles.clearBedBtn : styles.placeBedBtn}
              onClick={handlePlaceToBed}
              disabled={!selectedItem && !overlayActive}
              type="button"
            >
              {overlayActive ? "Clear Bed Overlay" : "Place on Bed"}
            </button>
          )}

          {selectedItem && (
            <>
              {/* Dimensions card */}
              <div className={styles.card}>
                <div className={styles.cardLabel}>Dimensions</div>
                <dl className={styles.grid}>
                  <dt>Material</dt>
                  <dd>{selectedItem.materialLabel}</dd>
                  <dt>Width</dt>
                  <dd>{selectedItem.widthMm} mm &nbsp;({(selectedItem.widthMm / 25.4).toFixed(2)}&quot;)</dd>
                  <dt>Height</dt>
                  <dd>{selectedItem.heightMm} mm &nbsp;({(selectedItem.heightMm / 25.4).toFixed(2)}&quot;)</dd>
                  <dt>Thickness</dt>
                  <dd>{selectedItem.thicknessMm} mm — set focus</dd>
                </dl>
                {selectedItem.notes && (
                  <div className={styles.note}>{selectedItem.notes}</div>
                )}
              </div>

              {/* Suggested settings card */}
              <div className={styles.card}>
                <div className={styles.cardLabel}>Suggested Settings</div>
                {!activeLaser ? (
                  <div className={styles.hint}>
                    Set an active laser in Calibration → Laser to see settings.
                  </div>
                ) : suggestedPreset ? (
                  <dl className={styles.grid}>
                    <dt>Laser</dt>
                    <dd>{activeLaser.name} ({activeLaser.wattagePeak}W)</dd>
                    <dt>Effect</dt>
                    <dd style={{ textTransform: "capitalize" }}>{suggestedPreset.effect.replace("-", " ")}</dd>
                    <dt>Power</dt>
                    <dd>
                      {suggestedPreset.powerPctMin != null && suggestedPreset.powerPctMax != null
                        ? `${suggestedPreset.powerPctMin}–${suggestedPreset.powerPctMax}%`
                        : `${suggestedPreset.powerPct}%`}
                    </dd>
                    <dt>Speed</dt>
                    <dd>
                      {suggestedPreset.speedMmSMin != null && suggestedPreset.speedMmSMax != null
                        ? `${suggestedPreset.speedMmSMin}–${suggestedPreset.speedMmSMax} mm/s`
                        : `${suggestedPreset.speedMmS} mm/s`}
                    </dd>
                    <dt>Line Interval</dt>
                    <dd>{suggestedPreset.lineIntervalMm} mm</dd>
                    <dt>Passes</dt>
                    <dd>{suggestedPreset.passes}</dd>
                    {suggestedPreset.frequencyKhz != null && (
                      <><dt>Frequency</dt><dd>{suggestedPreset.frequencyKhz} kHz</dd></>
                    )}
                    {suggestedPreset.pulseWidthNs != null && (
                      <><dt>Pulse Width</dt><dd>{suggestedPreset.pulseWidthNs} ns</dd></>
                    )}
                    {suggestedPreset.crossHatch && (
                      <><dt>Cross Hatch</dt><dd>Yes</dd></>
                    )}
                    <dt>Confidence</dt>
                    <dd style={{
                      color: suggestedPreset.confidence === "verified" ? "#7ecfa8"
                        : suggestedPreset.confidence === "community" ? "#b0c8d8"
                        : "#808080",
                      textTransform: "capitalize",
                    }}>{suggestedPreset.confidence}</dd>
                    {suggestedPreset.notes && (
                      <dd className={styles.presetNote} style={{ gridColumn: "1 / -1" }}>
                        {suggestedPreset.notes}
                      </dd>
                    )}
                  </dl>
                ) : (
                  <div className={styles.hint}>
                    No preset found for {activeLaser.name} + {selectedItem.materialLabel}.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
