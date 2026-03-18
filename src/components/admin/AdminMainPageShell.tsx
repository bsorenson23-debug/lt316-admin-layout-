"use client";

import { AdminLayoutShell } from "./AdminLayoutShell";
import { CalibrationToolsToggle } from "./CalibrationToolsToggle";
import styles from "@/app/admin/page.module.css";

export function AdminMainPageShell() {
  return (
    <div className={styles.page}>
      <div className={styles.calibrationDock}>
        <CalibrationToolsToggle />
      </div>
      <AdminLayoutShell />
    </div>
  );
}
