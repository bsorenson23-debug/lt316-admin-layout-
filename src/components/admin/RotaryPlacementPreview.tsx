"use client";

import type { RotaryPreviewValues } from "@/utils/rotaryCalibration";
import styles from "./RotaryPlacementPreview.module.css";

interface Props {
  values: RotaryPreviewValues;
}

function toMm(value: number): string {
  return `${value.toFixed(2)} mm`;
}

export function RotaryPlacementPreview({ values }: Props) {
  return (
    <div className={styles.grid}>
      <span>Effective Top Anchor</span>
      <span>{toMm(values.effectiveTopAnchorYmm)}</span>
      <span>Export Origin X</span>
      <span>{toMm(values.exportOriginXmm)}</span>
      <span>Export Origin Y</span>
      <span>{toMm(values.exportOriginYmm)}</span>
    </div>
  );
}
