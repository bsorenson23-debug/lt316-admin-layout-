"use client";

import Link from "next/link";
import styles from "./CalibrationToolsToggle.module.css";

interface Props {
  enabled: boolean;
  onToggle: (next: boolean) => void;
}

export function CalibrationToolsToggle({ enabled, onToggle }: Props) {
  return (
    <div className={styles.wrap}>
      <label className={styles.toggleRow}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label="Show Calibration Tools"
        />
        <span className={styles.toggleTrack} />
        <span className={styles.label}>Show Calibration Tools</span>
      </label>

      {enabled && (
        <Link href="/admin/calibration" className={styles.entryCard}>
          <span className={styles.entryTitle}>Admin Calibration Tools</span>
          <span className={styles.entryHint}>Open advanced rotary setup page</span>
        </Link>
      )}
    </div>
  );
}
