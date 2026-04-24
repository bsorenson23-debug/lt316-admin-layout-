"use client";

import React from "react";
import type { TumblerItemLookupFitDebug } from "@/types/tumblerItemLookup";
import { buildTumblerLookupDebugGuideModel } from "@/lib/tumblerLookupDebugGuides";
import styles from "./TumblerLookupDebugPanel.module.css";

interface Props {
  debug: TumblerItemLookupFitDebug;
  imageUrl: string;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function buildEdgePolyline(
  debug: TumblerItemLookupFitDebug,
  direction: "left" | "right",
): string {
  return debug.profilePoints
    .map((point) => {
      const x = direction === "left"
        ? debug.centerXPx - point.radiusPx
        : debug.centerXPx + point.radiusPx;
      return `${round1(x)},${round1(point.yPx)}`;
    })
    .join(" ");
}

export function TumblerLookupDebugPanel({ debug, imageUrl }: Props) {
  const viewBox = `0 0 ${debug.imageWidthPx} ${debug.imageHeightPx}`;
  const silhouetteWidth = debug.silhouetteBoundsPx.maxX - debug.silhouetteBoundsPx.minX;
  const silhouetteHeight = debug.silhouetteBoundsPx.maxY - debug.silhouetteBoundsPx.minY;
  const bodyTraceTopPx = debug.bodyTraceTopPx ?? debug.bodyTopPx;
  const bodyTraceBottomPx = debug.bodyTraceBottomPx ?? debug.bodyBottomPx;
  const bodyHeight = bodyTraceBottomPx - bodyTraceTopPx;
  const rightProfile = buildEdgePolyline(debug, "right");
  const leftProfile = buildEdgePolyline(debug, "left");
  const guideModel = buildTumblerLookupDebugGuideModel(debug);
  const measurementBand = guideModel.measurementBand;
  const measurementBandTopPx = measurementBand?.topPx ?? debug.referenceBandTopPx;
  const measurementBandBottomPx = measurementBand?.bottomPx ?? debug.referenceBandBottomPx;
  const measurementBandLeftPx = measurementBand?.leftPx ?? Math.max(0, debug.centerXPx - debug.referenceHalfWidthPx);
  const measurementBandRightPx = measurementBand?.rightPx ?? Math.min(debug.imageWidthPx, debug.centerXPx + debug.referenceHalfWidthPx);
  const measurementBandWidthPx = measurementBand?.widthPx ?? Math.max(1, measurementBandRightPx - measurementBandLeftPx + 1);

  return (
    <div className={styles.panel}>
      <div className={styles.headerRow}>
        <div>
          <div className={styles.title}>Auto-fit debug</div>
          <div className={styles.hint}>
            These are the actual checkpoints the Stanley auto-generator used to build the lathed body.
          </div>
        </div>
        <div className={styles.scorePill}>Fit {debug.fitScore.toFixed(1)}</div>
      </div>

      <div className={styles.metricRow}>
        <span>Bounds {round1(silhouetteWidth)} × {round1(silhouetteHeight)} px</span>
        <span>Body band {round1(bodyHeight)} px</span>
        <span>Center X {round1(debug.centerXPx)} px</span>
        <span>Rim split {round1(debug.rimBottomPx - debug.rimTopPx)} px</span>
      </div>

      <div className={styles.grid}>
        <figure className={styles.card}>
          <figcaption className={styles.cardTitle}>1. Chosen silhouette</figcaption>
          <svg viewBox={viewBox} className={styles.preview} aria-label="Chosen silhouette">
            <image href={imageUrl} x="0" y="0" width={debug.imageWidthPx} height={debug.imageHeightPx} />
            <rect
              x={debug.silhouetteBoundsPx.minX}
              y={debug.silhouetteBoundsPx.minY}
              width={silhouetteWidth}
              height={silhouetteHeight}
              className={styles.boundsRect}
            />
            <line
              x1={debug.centerXPx}
              y1={debug.silhouetteBoundsPx.minY}
              x2={debug.centerXPx}
              y2={debug.silhouetteBoundsPx.maxY}
              className={styles.centerLine}
            />
          </svg>
          <div className={styles.caption}>Foreground bounds and estimated centerline.</div>
        </figure>

        <figure className={styles.card}>
          <figcaption className={styles.cardTitle}>2. Rim split and diameter band</figcaption>
          <svg
            viewBox={viewBox}
            className={styles.preview}
            aria-label="Rim split and diameter band"
            data-bottom-body-guide={guideModel.showBottomBodyGuide ? "present" : "absent"}
          >
            <image href={imageUrl} x="0" y="0" width={debug.imageWidthPx} height={debug.imageHeightPx} />
            <rect
              x={debug.silhouetteBoundsPx.minX}
              y={debug.rimTopPx}
              width={silhouetteWidth}
              height={Math.max(1, debug.rimBottomPx - debug.rimTopPx)}
              className={styles.rimBand}
            />
            <rect
              x={measurementBandLeftPx}
              y={measurementBandTopPx}
              width={measurementBandWidthPx}
              height={Math.max(1, measurementBandBottomPx - measurementBandTopPx)}
              className={styles.bodyBand}
            />
            <line x1={0} y1={debug.rimTopPx} x2={debug.imageWidthPx} y2={debug.rimTopPx} className={styles.rimLine} />
            <line x1={0} y1={debug.rimBottomPx} x2={debug.imageWidthPx} y2={debug.rimBottomPx} className={styles.rimLine} />
            <line
              x1={0}
              y1={guideModel.engravingStartGuideYPx}
              x2={debug.imageWidthPx}
              y2={guideModel.engravingStartGuideYPx}
              className={styles.bodyLine}
            />
            {guideModel.showBottomBodyGuide && guideModel.bottomBodyGuideYPx != null && (
              <line
                x1={0}
                y1={guideModel.bottomBodyGuideYPx}
                x2={debug.imageWidthPx}
                y2={guideModel.bottomBodyGuideYPx}
                className={styles.bodyLine}
              />
            )}
            <line
              x1={debug.centerXPx}
              y1={debug.silhouetteBoundsPx.minY}
              x2={debug.centerXPx}
              y2={debug.silhouetteBoundsPx.maxY}
              className={styles.centerLine}
            />
          </svg>
          <div className={styles.caption}>{guideModel.caption}</div>
        </figure>

        <figure className={styles.card}>
          <figcaption className={styles.cardTitle}>3. Revolved profile</figcaption>
          <svg viewBox={viewBox} className={styles.preview} aria-label="Revolved body profile">
            <image href={imageUrl} x="0" y="0" width={debug.imageWidthPx} height={debug.imageHeightPx} className={styles.fadedImage} />
            <line
              x1={debug.centerXPx}
              y1={debug.silhouetteBoundsPx.minY}
              x2={debug.centerXPx}
              y2={debug.silhouetteBoundsPx.maxY}
              className={styles.centerLine}
            />
            <polyline points={leftProfile} className={styles.profileLine} />
            <polyline points={rightProfile} className={styles.profileLine} />
            {debug.profilePoints.map((point) => (
              <React.Fragment key={`${point.yPx}-${point.radiusPx}`}>
                <circle
                  cx={debug.centerXPx - point.radiusPx}
                  cy={point.yPx}
                  r="1.8"
                  className={styles.profilePoint}
                />
                <circle
                  cx={debug.centerXPx + point.radiusPx}
                  cy={point.yPx}
                  r="1.8"
                  className={styles.profilePoint}
                />
              </React.Fragment>
            ))}
            <line x1={0} y1={bodyTraceTopPx} x2={debug.imageWidthPx} y2={bodyTraceTopPx} className={styles.bodyLine} />
            <line x1={0} y1={bodyTraceBottomPx} x2={debug.imageWidthPx} y2={bodyTraceBottomPx} className={styles.bodyLine} />
          </svg>
          <div className={styles.caption}>Sampled lathe profile points that become the generated body mesh.</div>
        </figure>
      </div>
    </div>
  );
}
