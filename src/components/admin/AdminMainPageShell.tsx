"use client";

import React from "react";
import { AdminLayoutShell } from "./AdminLayoutShell";
import { CalibrationToolsToggle } from "./CalibrationToolsToggle";
import {
  getCalibrationToolsVisible,
  setCalibrationToolsVisible,
} from "@/utils/adminCalibrationState";
import styles from "@/app/admin/page.module.css";

export function AdminMainPageShell() {
  const [showCalibrationTools, setShowCalibrationTools] = React.useState(false);

  React.useEffect(() => {
    setShowCalibrationTools(getCalibrationToolsVisible());
  }, []);

  const handleToggleCalibrationTools = React.useCallback((next: boolean) => {
    setShowCalibrationTools(next);
    setCalibrationToolsVisible(next);
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.calibrationDock}>
        <CalibrationToolsToggle
          enabled={showCalibrationTools}
          onToggle={handleToggleCalibrationTools}
        />
      </div>
      <AdminLayoutShell />
    </div>
  );
}
