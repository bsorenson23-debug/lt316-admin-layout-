"use client";

import React from "react";
import type { BedOrigin } from "@/types/export";
import {
  buildCalibrationBedOverlayMetrics,
  isCalibrationOverlayVisible,
  type CalibrationOverlayToggles,
} from "@/utils/calibrationBedReference";
import styles from "./CalibrationBedReference.module.css";

interface Props {
  bedWidthMm: number;
  bedHeightMm: number;
  rotaryCenterXmm: number;
  topAnchorYmm: number;
  lensInsetMm: number;
  bedOrigin: BedOrigin;
  overlays: CalibrationOverlayToggles;
}

function clampLabelOffset(percent: number): string {
  if (percent <= 2) return "2%";
  if (percent >= 98) return "98%";
  return `${percent}%`;
}

export function CalibrationBedReference({
  bedWidthMm,
  bedHeightMm,
  rotaryCenterXmm,
  topAnchorYmm,
  lensInsetMm,
  bedOrigin,
  overlays,
}: Props) {
  const metrics = React.useMemo(
    () =>
      buildCalibrationBedOverlayMetrics({
        bedWidthMm,
        bedHeightMm,
        rotaryCenterXmm,
        topAnchorYmm,
        lensInsetMm,
        bedOrigin,
      }),
    [bedWidthMm, bedHeightMm, rotaryCenterXmm, topAnchorYmm, lensInsetMm, bedOrigin]
  );

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.title}>Laser Bed Reference</span>
        <span className={styles.meta}>
          {bedWidthMm.toFixed(0)} x {bedHeightMm.toFixed(0)} mm
        </span>
      </div>

      <div className={styles.stage}>
        <div
          className={styles.bed}
          style={{ aspectRatio: `${bedWidthMm} / ${bedHeightMm}` }}
          aria-label="Calibration laser bed reference"
        >
          {isCalibrationOverlayVisible(overlays, "bedCenterline") ? (
            <>
              <div
                className={`${styles.line} ${styles.centerVertical}`}
                style={{ left: `${metrics.bedCenterXPercent}%` }}
              />
              <div
                className={`${styles.line} ${styles.centerHorizontal}`}
                style={{ top: `${metrics.bedCenterYPercent}%` }}
              />
            </>
          ) : null}

          {isCalibrationOverlayVisible(overlays, "rotaryCenterline") ? (
            <>
              <div
                className={`${styles.line} ${styles.rotaryLine}`}
                style={{ left: `${metrics.rotaryCenterXPercent}%` }}
              />
              <span
                className={styles.rotaryLabel}
                style={{ left: clampLabelOffset(metrics.rotaryCenterXPercent) }}
              >
                Rotary X
              </span>
            </>
          ) : null}

          {isCalibrationOverlayVisible(overlays, "tumblerTopAnchorLine") ? (
            <>
              <div
                className={`${styles.line} ${styles.topAnchorLine}`}
                style={{ top: `${metrics.topAnchorYPercent}%` }}
              />
              <span
                className={styles.topAnchorLabel}
                style={{ top: clampLabelOffset(metrics.topAnchorYPercent) }}
              >
                Top Anchor
              </span>
            </>
          ) : null}

          {isCalibrationOverlayVisible(overlays, "lensFieldOutline") ? (
            <div
              className={styles.lensField}
              style={{
                left: `${metrics.lensInsetXPercent}%`,
                top: `${metrics.lensInsetYPercent}%`,
                width: `${metrics.lensWidthPercent}%`,
                height: `${metrics.lensHeightPercent}%`,
              }}
            />
          ) : null}

          <div
            className={styles.centerTarget}
            style={{
              left: `${metrics.bedCenterXPercent}%`,
              top: `${metrics.bedCenterYPercent}%`,
            }}
          />

          {isCalibrationOverlayVisible(overlays, "originMarker") ? (
            <div
              className={styles.originMarker}
              style={{
                left: `${metrics.originXPercent}%`,
                top: `${metrics.originYPercent}%`,
              }}
            >
              <span className={styles.originDot} />
              <span className={styles.originLabel}>Origin</span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
