"use client";

import type { CalibrationMode, CalibrationModeDefinition } from "@/utils/calibrationModes";
import styles from "./CalibrationModeSwitcher.module.css";

interface Props {
  activeMode: CalibrationMode;
  modes: CalibrationModeDefinition[];
  onChange: (mode: CalibrationMode) => void;
}

export function CalibrationModeSwitcher({ activeMode, modes, onChange }: Props) {
  return (
    <section className={styles.switcher} aria-label="Calibration mode switcher">
      {modes.map((mode) => (
        <button
          key={mode.id}
          type="button"
          className={mode.id === activeMode ? styles.buttonActive : styles.button}
          onClick={() => onChange(mode.id)}
        >
          {mode.label}
        </button>
      ))}
    </section>
  );
}

