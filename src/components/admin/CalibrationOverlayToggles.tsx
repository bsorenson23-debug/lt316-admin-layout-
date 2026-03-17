"use client";

import type {
  CalibrationOverlayKey,
  CalibrationOverlayToggles,
} from "@/utils/calibrationBedReference";
import styles from "./CalibrationOverlayToggles.module.css";

interface Props {
  value: CalibrationOverlayToggles;
  onToggle: (key: CalibrationOverlayKey, enabled: boolean) => void;
}

const OVERLAY_ITEMS: Array<{ key: CalibrationOverlayKey; label: string }> = [
  { key: "bedCenterline", label: "Bed Centerline" },
  { key: "originMarker", label: "Origin Marker" },
  { key: "rotaryCenterline", label: "Rotary Centerline" },
  { key: "tumblerTopAnchorLine", label: "Tumbler Top Anchor" },
  { key: "lensFieldOutline", label: "Lens Field Outline" },
];

export function CalibrationOverlayToggles({ value, onToggle }: Props) {
  return (
    <section className={styles.section}>
      <div className={styles.label}>Overlay Toggles</div>
      <div className={styles.grid}>
        {OVERLAY_ITEMS.map((item) => (
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
