"use client";

import React from "react";
import type { TumblerItemLookupFitDebug } from "@/types/tumblerItemLookup";
import type { CanonicalHandleProfile } from "@/types/productTemplate";
import styles from "./TumblerLookupDebugPanel.module.css";

interface Props {
  debug: TumblerItemLookupFitDebug;
  imageUrl: string;
  handleProfile?: CanonicalHandleProfile;
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

export function TumblerLookupDebugPanel({ debug, imageUrl, handleProfile }: Props) {
  const viewBox = `0 0 ${debug.imageWidthPx} ${debug.imageHeightPx}`;
  const silhouetteWidth = debug.silhouetteBoundsPx.maxX - debug.silhouetteBoundsPx.minX;
  const silhouetteHeight = debug.silhouetteBoundsPx.maxY - debug.silhouetteBoundsPx.minY;
  const bodyHeight = debug.bodyBottomPx - debug.bodyTopPx;
  const rightProfile = buildEdgePolyline(debug, "right");
  const leftProfile = buildEdgePolyline(debug, "left");

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
          <figcaption className={styles.cardTitle}>2. Rim split and body band</figcaption>
          <svg viewBox={viewBox} className={styles.preview} aria-label="Rim split and body band">
            <image href={imageUrl} x="0" y="0" width={debug.imageWidthPx} height={debug.imageHeightPx} />
            <rect
              x={debug.silhouetteBoundsPx.minX}
              y={debug.rimTopPx}
              width={silhouetteWidth}
              height={Math.max(1, debug.rimBottomPx - debug.rimTopPx)}
              className={styles.rimBand}
            />
            <rect
              x={debug.silhouetteBoundsPx.minX}
              y={debug.bodyTopPx}
              width={silhouetteWidth}
              height={Math.max(1, bodyHeight)}
              className={styles.bodyBand}
            />
            <line x1={0} y1={debug.rimTopPx} x2={debug.imageWidthPx} y2={debug.rimTopPx} className={styles.rimLine} />
            <line x1={0} y1={debug.rimBottomPx} x2={debug.imageWidthPx} y2={debug.rimBottomPx} className={styles.rimLine} />
            <line x1={0} y1={debug.bodyTopPx} x2={debug.imageWidthPx} y2={debug.bodyTopPx} className={styles.bodyLine} />
            <line x1={0} y1={debug.bodyBottomPx} x2={debug.imageWidthPx} y2={debug.bodyBottomPx} className={styles.bodyLine} />
            <line
              x1={debug.centerXPx}
              y1={debug.silhouetteBoundsPx.minY}
              x2={debug.centerXPx}
              y2={debug.silhouetteBoundsPx.maxY}
              className={styles.centerLine}
            />
          </svg>
          <div className={styles.caption}>Silver rim split and the body region used for the revolve profile.</div>
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
                  r="3"
                  className={styles.profilePoint}
                />
                <circle
                  cx={debug.centerXPx + point.radiusPx}
                  cy={point.yPx}
                  r="3"
                  className={styles.profilePoint}
                />
              </React.Fragment>
            ))}
            <line x1={0} y1={debug.bodyTopPx} x2={debug.imageWidthPx} y2={debug.bodyTopPx} className={styles.bodyLine} />
            <line x1={0} y1={debug.bodyBottomPx} x2={debug.imageWidthPx} y2={debug.bodyBottomPx} className={styles.bodyLine} />
          </svg>
          <div className={styles.caption}>Sampled lathe profile points that become the generated body mesh.</div>
        </figure>

        {handleProfile && handleProfile.outerContour.length >= 4 && (
          <figure className={styles.card}>
            <figcaption className={styles.cardTitle}>4. Canonical handle</figcaption>
            <svg viewBox={viewBox} className={styles.preview} aria-label="Canonical handle profile">
              <image href={imageUrl} x="0" y="0" width={debug.imageWidthPx} height={debug.imageHeightPx} className={styles.fadedImage} />
              <line
                x1={debug.centerXPx}
                y1={debug.silhouetteBoundsPx.minY}
                x2={debug.centerXPx}
                y2={debug.silhouetteBoundsPx.maxY}
                className={styles.centerLine}
              />
              {handleProfile.svgPathOuter && (
                <path d={handleProfile.svgPathOuter} className={styles.profileLine} />
              )}
              {handleProfile.svgPathInner && (
                <path d={handleProfile.svgPathInner} className={styles.boundsRect} />
              )}
              <polyline
                points={handleProfile.centerline.map((point) => `${round1(point.x)},${round1(point.y)}`).join(" ")}
                className={styles.bodyLine}
              />
              <circle cx={handleProfile.anchors.upper.xPx} cy={handleProfile.anchors.upper.yPx} r="4" className={styles.profilePoint} />
              <circle cx={handleProfile.anchors.lower.xPx} cy={handleProfile.anchors.lower.yPx} r="4" className={styles.profilePoint} />
            </svg>
            <div className={styles.caption}>
              {handleProfile.side} handle · confidence {handleProfile.confidence.toFixed(2)} · {handleProfile.centerline.length} centerline samples
            </div>
          </figure>
        )}
      </div>
    </div>
  );
}
