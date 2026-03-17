"use client";

import type {
  CalibrationOverlayKey,
  CalibrationOverlayToggles,
} from "@/utils/calibrationBedReference";
import styles from "./CalibrationOverlayToggles.module.css";

interface Props {
  value: CalibrationOverlayToggles;
  onToggle: (key: CalibrationOverlayKey, enabled: boolean) => void;
  visibleKeys?: CalibrationOverlayKey[];
  title?: string;
}

const OVERLAY_ITEMS: Array<{ key: CalibrationOverlayKey; label: string }> = [
  { key: "showHoleGrid", label: "Show hole grid" },
  { key: "showCenterline", label: "Show centerline" },
  { key: "showOrigin", label: "Show origin" },
  { key: "showRotaryCenterline", label: "Show rotary centerline" },
  { key: "showTopAnchorLine", label: "Show top anchor line" },
  { key: "showMountFootprint", label: "Show mount footprint" },
  { key: "showLensFieldOutline", label: "Show lens field outline" },
  { key: "showExportPreview", label: "Show export preview" },
];

export function CalibrationOverlayToggles({
  value,
  onToggle,
  visibleKeys,
  title = "Overlay Toggles",
}: Props) {
  const visibleSet = visibleKeys ? new Set(visibleKeys) : null;
  const items = visibleSet
    ? OVERLAY_ITEMS.filter((item) => visibleSet.has(item.key))
    : OVERLAY_ITEMS;

  return (
    <section className={styles.section}>
      <div className={styles.label}>{title}</div>
      <div className={styles.grid}>
        {items.map((item) => (
          <label key={item.key} className={styles.row}>
            <input
              type="checkbox"
              checked={value[item.key]}
              onChange={(event) => onToggle(item.key, event.target.checked)}
            />
            <span>{item.label}</span>
          </label>
        ))}
      </div>
    </section>
  );
}
