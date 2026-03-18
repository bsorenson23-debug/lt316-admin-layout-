"use client";

import Link from "next/link";
import styles from "./CalibrationToolsToggle.module.css";

export function CalibrationToolsToggle() {
  return (
    <Link href="/admin/calibration" className={styles.btn}>
      Calibration
    </Link>
  );
}
