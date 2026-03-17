"use client";

import React from "react";
import type { BedOrigin } from "@/types/export";
import {
  buildCalibrationBedOverlayMetrics,
  isCalibrationOverlayVisible,
  type CalibrationOverlayToggles,
} from "@/utils/calibrationBedReference";
import {
  DEFAULT_STAGGERED_BED_PATTERN,
  generateStaggeredBedHoles,
  mapBedMmToCanvasPercent,
} from "@/utils/staggeredBedPattern";
import type { ExportPlacementPreview } from "@/utils/calibrationExportPreview";
import styles from "./CalibrationBedReference.module.css";

interface Props {
  bedWidthMm: number;
  bedHeightMm: number;
  rotaryCenterXmm: number;
  topAnchorYmm: number;
  mountFootprintMm?: {
    widthMm?: number;
    heightMm?: number;
  } | null;
  lensInsetMm: number;
  bedOrigin: BedOrigin;
  overlays: CalibrationOverlayToggles;
  exportPlacementPreview?: ExportPlacementPreview | null;
}

function clampLabelOffset(percent: number): string {
  if (percent <= 3) return "3%";
  if (percent >= 97) return "97%";
  return `${percent}%`;
}

export function CalibrationBedReference({
  bedWidthMm,
  bedHeightMm,
  rotaryCenterXmm,
  topAnchorYmm,
  mountFootprintMm,
  lensInsetMm,
  bedOrigin,
  overlays,
  exportPlacementPreview,
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

  const holes = React.useMemo(
    () =>
      generateStaggeredBedHoles(
        { widthMm: bedWidthMm, heightMm: bedHeightMm },
        DEFAULT_STAGGERED_BED_PATTERN
      ),
    [bedWidthMm, bedHeightMm]
  );

  const holeDiameterXPercent =
    (DEFAULT_STAGGERED_BED_PATTERN.holeDiameterMm / Math.max(1, bedWidthMm)) * 100;
  const holeDiameterYPercent =
    (DEFAULT_STAGGERED_BED_PATTERN.holeDiameterMm / Math.max(1, bedHeightMm)) * 100;

  const mountFootprint =
    typeof mountFootprintMm?.widthMm === "number" &&
    mountFootprintMm.widthMm > 0 &&
    typeof mountFootprintMm?.heightMm === "number" &&
    mountFootprintMm.heightMm > 0
      ? {
          leftPercent:
            ((rotaryCenterXmm - mountFootprintMm.widthMm / 2) / Math.max(1, bedWidthMm)) *
            100,
          topPercent: (topAnchorYmm / Math.max(1, bedHeightMm)) * 100,
          widthPercent:
            (mountFootprintMm.widthMm / Math.max(1, bedWidthMm)) * 100,
          heightPercent:
            (mountFootprintMm.heightMm / Math.max(1, bedHeightMm)) * 100,
        }
      : null;

  const exportBox =
    exportPlacementPreview &&
    exportPlacementPreview.exportOriginXmm !== undefined &&
    exportPlacementPreview.exportOriginYmm !== undefined &&
    exportPlacementPreview.templateWidthMm !== undefined &&
    exportPlacementPreview.templateHeightMm !== undefined
      ? {
          origin: {
            xPercent:
              (exportPlacementPreview.exportOriginXmm / Math.max(1, bedWidthMm)) *
              100,
            yPercent:
              (exportPlacementPreview.exportOriginYmm / Math.max(1, bedHeightMm)) *
              100,
          },
          widthPercent:
            (exportPlacementPreview.templateWidthMm / Math.max(1, bedWidthMm)) * 100,
          heightPercent:
            (exportPlacementPreview.templateHeightMm / Math.max(1, bedHeightMm)) * 100,
          isWithinBed: exportPlacementPreview.isWithinBed,
        }
      : null;

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.title}>Laser Bed Calibration Canvas</span>
        <span className={styles.meta}>
          6 mm | 25 x 25 mm | staggered 12.5 mm
        </span>
      </div>

      <div className={styles.stage}>
        <div
          className={styles.bed}
          style={{ aspectRatio: `${bedWidthMm} / ${bedHeightMm}` }}
          aria-label="Staggered laser bed calibration canvas"
        >
          {isCalibrationOverlayVisible(overlays, "showHoleGrid") ? (
            <div className={styles.holesLayer}>
              {holes.map((hole) => {
                const mapped = mapBedMmToCanvasPercent(hole.xMm, hole.yMm, {
                  widthMm: bedWidthMm,
                  heightMm: bedHeightMm,
                });

                return (
                  <span
                    key={`${hole.rowIndex}-${hole.columnIndex}`}
                    className={styles.hole}
                    style={{
                      left: `${mapped.xPercent}%`,
                      top: `${mapped.yPercent}%`,
                      width: `${holeDiameterXPercent}%`,
                      height: `${holeDiameterYPercent}%`,
                    }}
                  />
                );
              })}
            </div>
          ) : null}

          {isCalibrationOverlayVisible(overlays, "showCenterline") ? (
            <>
              <div
                className={`${styles.line} ${styles.centerVertical}`}
                style={{ left: `${metrics.bedCenterXPercent}%` }}
              />
              <div
                className={`${styles.line} ${styles.centerHorizontal}`}
                style={{ top: `${metrics.bedCenterYPercent}%` }}
              />
              <div
                className={styles.centerTarget}
                style={{
                  left: `${metrics.bedCenterXPercent}%`,
                  top: `${metrics.bedCenterYPercent}%`,
                }}
              />
            </>
          ) : null}

          {isCalibrationOverlayVisible(overlays, "showRotaryCenterline") ? (
            <>
              <div
                className={`${styles.line} ${styles.rotaryLine}`}
                style={{ left: `${metrics.rotaryCenterXPercent}%` }}
              />
              <span
                className={styles.rotaryLabel}
                style={{ left: clampLabelOffset(metrics.rotaryCenterXPercent) }}
              >
                Rotary X {rotaryCenterXmm.toFixed(1)}
              </span>
            </>
          ) : null}

          {isCalibrationOverlayVisible(overlays, "showTopAnchorLine") ? (
            <>
              <div
                className={`${styles.line} ${styles.topAnchorLine}`}
                style={{ top: `${metrics.topAnchorYPercent}%` }}
              />
              <span
                className={styles.topAnchorLabel}
                style={{ top: clampLabelOffset(metrics.topAnchorYPercent) }}
              >
                Top Y {topAnchorYmm.toFixed(1)}
              </span>
            </>
          ) : null}

          {isCalibrationOverlayVisible(overlays, "showLensFieldOutline") ? (
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

          {isCalibrationOverlayVisible(overlays, "showMountFootprint") &&
          mountFootprint ? (
            <>
              <div
                className={styles.mountFootprint}
                style={{
                  left: `${mountFootprint.leftPercent}%`,
                  top: `${mountFootprint.topPercent}%`,
                  width: `${mountFootprint.widthPercent}%`,
                  height: `${mountFootprint.heightPercent}%`,
                }}
              />
              <span
                className={styles.mountFootprintLabel}
                style={{
                  left: clampLabelOffset(
                    mountFootprint.leftPercent + mountFootprint.widthPercent / 2
                  ),
                  top: clampLabelOffset(mountFootprint.topPercent),
                }}
              >
                Mount footprint
              </span>
            </>
          ) : null}

          {isCalibrationOverlayVisible(overlays, "showOrigin") ? (
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

          {isCalibrationOverlayVisible(overlays, "showExportPreview") && exportBox ? (
            <>
              <div
                className={
                  exportBox.isWithinBed ? styles.exportBox : styles.exportBoxWarning
                }
                style={{
                  left: `${exportBox.origin.xPercent}%`,
                  top: `${exportBox.origin.yPercent}%`,
                  width: `${exportBox.widthPercent}%`,
                  height: `${exportBox.heightPercent}%`,
                }}
              />
              <div
                className={styles.exportOriginMarker}
                style={{
                  left: `${exportBox.origin.xPercent}%`,
                  top: `${exportBox.origin.yPercent}%`,
                }}
              />
              <span
                className={styles.exportOriginLabel}
                style={{
                  left: clampLabelOffset(exportBox.origin.xPercent),
                  top: clampLabelOffset(exportBox.origin.yPercent),
                }}
              >
                Export Origin
              </span>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
