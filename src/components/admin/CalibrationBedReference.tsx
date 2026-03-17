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
  type BedHole,
  generateStaggeredBedHoles,
  mapBedMmToCanvasPercent,
} from "@/utils/staggeredBedPattern";
import type { RotaryHoleAnchorSelection } from "@/utils/rotaryAnchoring";
import type { RotaryPlacedBaseVisual } from "@/utils/rotaryBaseVisual";
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
  mountFootprintBoxMm?: {
    xMm: number;
    yMm: number;
    widthMm: number;
    heightMm: number;
  } | null;
  lensInsetMm: number;
  bedOrigin: BedOrigin;
  overlays: CalibrationOverlayToggles;
  exportPlacementPreview?: ExportPlacementPreview | null;
  holeSelectionEnabled?: boolean;
  selectedAnchorHoles?: RotaryHoleAnchorSelection;
  rotaryBaseVisual?: RotaryPlacedBaseVisual | null;
  onBedHoleSelect?: (args: {
    rowIndex: number;
    columnIndex: number;
    xMm: number;
    yMm: number;
    asSecondary: boolean;
  }) => void;
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
  mountFootprintBoxMm,
  lensInsetMm,
  bedOrigin,
  overlays,
  exportPlacementPreview,
  holeSelectionEnabled = false,
  selectedAnchorHoles,
  rotaryBaseVisual,
  onBedHoleSelect,
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
    typeof mountFootprintBoxMm?.widthMm === "number" &&
    mountFootprintBoxMm.widthMm > 0 &&
    typeof mountFootprintBoxMm?.heightMm === "number" &&
    mountFootprintBoxMm.heightMm > 0
      ? {
          leftPercent: (mountFootprintBoxMm.xMm / Math.max(1, bedWidthMm)) * 100,
          topPercent: (mountFootprintBoxMm.yMm / Math.max(1, bedHeightMm)) * 100,
          widthPercent:
            (mountFootprintBoxMm.widthMm / Math.max(1, bedWidthMm)) * 100,
          heightPercent:
            (mountFootprintBoxMm.heightMm / Math.max(1, bedHeightMm)) * 100,
        }
      : typeof mountFootprintMm?.widthMm === "number" &&
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

  const isPrimaryHole = React.useCallback(
    (hole: BedHole) =>
      selectedAnchorHoles?.primaryHole?.row === hole.rowIndex &&
      selectedAnchorHoles.primaryHole.col === hole.columnIndex,
    [selectedAnchorHoles]
  );

  const isSecondaryHole = React.useCallback(
    (hole: BedHole) =>
      selectedAnchorHoles?.secondaryHole?.row === hole.rowIndex &&
      selectedAnchorHoles.secondaryHole.col === hole.columnIndex,
    [selectedAnchorHoles]
  );

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

  const rotaryBaseOverlay = rotaryBaseVisual
    ? {
        leftPercent: (rotaryBaseVisual.leftMm / Math.max(1, bedWidthMm)) * 100,
        topPercent: (rotaryBaseVisual.topMm / Math.max(1, bedHeightMm)) * 100,
        widthPercent: (rotaryBaseVisual.widthMm / Math.max(1, bedWidthMm)) * 100,
        heightPercent: (rotaryBaseVisual.depthMm / Math.max(1, bedHeightMm)) * 100,
        axis: mapBedMmToCanvasPercent(
          rotaryBaseVisual.axisCenter.xMm,
          rotaryBaseVisual.axisCenter.yMm,
          {
            widthMm: bedWidthMm,
            heightMm: bedHeightMm,
          }
        ),
        anchor: mapBedMmToCanvasPercent(
          rotaryBaseVisual.anchorPoint.xMm,
          rotaryBaseVisual.anchorPoint.yMm,
          {
            widthMm: bedWidthMm,
            heightMm: bedHeightMm,
          }
        ),
        mountHoles: rotaryBaseVisual.mountHoles.map((hole) => ({
          id: hole.id,
          ...mapBedMmToCanvasPercent(hole.xMm, hole.yMm, {
            widthMm: bedWidthMm,
            heightMm: bedHeightMm,
          }),
        })),
        isPlaceholder: rotaryBaseVisual.isPlaceholder,
        presetName: rotaryBaseVisual.presetName,
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
            <div
              className={`${styles.holesLayer} ${
                holeSelectionEnabled ? styles.holesLayerInteractive : ""
              }`}
            >
              {holes.map((hole) => {
                const mapped = mapBedMmToCanvasPercent(hole.xMm, hole.yMm, {
                  widthMm: bedWidthMm,
                  heightMm: bedHeightMm,
                });
                const holeClassName = [
                  styles.hole,
                  holeSelectionEnabled ? styles.holeInteractive : "",
                  isPrimaryHole(hole) ? styles.holePrimary : "",
                  isSecondaryHole(hole) ? styles.holeSecondary : "",
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <button
                    key={`${hole.rowIndex}-${hole.columnIndex}`}
                    type="button"
                    className={holeClassName}
                    onClick={(event) =>
                      onBedHoleSelect?.({
                        rowIndex: hole.rowIndex,
                        columnIndex: hole.columnIndex,
                        xMm: hole.xMm,
                        yMm: hole.yMm,
                        asSecondary: event.shiftKey,
                      })
                    }
                    disabled={!holeSelectionEnabled || !onBedHoleSelect}
                    aria-label={`Bed hole row ${hole.rowIndex + 1}, column ${
                      hole.columnIndex + 1
                    }`}
                    title={
                      holeSelectionEnabled
                        ? "Click to set anchor. Shift+click for secondary anchor."
                        : undefined
                    }
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
          rotaryBaseOverlay ? (
            <>
              <div
                className={
                  rotaryBaseOverlay.isPlaceholder
                    ? styles.rotaryBasePlaceholder
                    : styles.rotaryBase
                }
                style={{
                  left: `${rotaryBaseOverlay.leftPercent}%`,
                  top: `${rotaryBaseOverlay.topPercent}%`,
                  width: `${rotaryBaseOverlay.widthPercent}%`,
                  height: `${rotaryBaseOverlay.heightPercent}%`,
                }}
              />
              {rotaryBaseOverlay.mountHoles.map((hole) => (
                <span
                  key={hole.id}
                  className={styles.rotaryBaseHole}
                  style={{ left: `${hole.xPercent}%`, top: `${hole.yPercent}%` }}
                />
              ))}
              <span
                className={styles.rotaryBaseAnchor}
                style={{
                  left: `${rotaryBaseOverlay.anchor.xPercent}%`,
                  top: `${rotaryBaseOverlay.anchor.yPercent}%`,
                }}
              />
              <span
                className={styles.rotaryBaseAxisMarker}
                style={{
                  left: `${rotaryBaseOverlay.axis.xPercent}%`,
                  top: `${rotaryBaseOverlay.axis.yPercent}%`,
                }}
              />
              <span
                className={styles.rotaryBaseLabel}
                style={{
                  left: clampLabelOffset(
                    rotaryBaseOverlay.leftPercent + rotaryBaseOverlay.widthPercent / 2
                  ),
                  top: clampLabelOffset(rotaryBaseOverlay.topPercent - 2),
                }}
              >
                {rotaryBaseOverlay.presetName}
              </span>
            </>
          ) : null}

          {isCalibrationOverlayVisible(overlays, "showMountFootprint") &&
          mountFootprint &&
          !rotaryBaseOverlay ? (
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
