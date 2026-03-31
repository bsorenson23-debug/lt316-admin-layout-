"use client";

import type { FlatItemLookupTraceDebug } from "@/types/flatItemLookup";
import styles from "./FlatItemLookupDebugPanel.module.css";

interface Props {
  debug: FlatItemLookupTraceDebug;
  imageUrl: string;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function FlatItemLookupDebugPanel({ debug, imageUrl }: Props) {
  const viewBox = `0 0 ${debug.imageWidthPx} ${debug.imageHeightPx}`;
  const boundsWidth = debug.silhouetteBoundsPx.maxX - debug.silhouetteBoundsPx.minX;
  const boundsHeight = debug.silhouetteBoundsPx.maxY - debug.silhouetteBoundsPx.minY;
  const outline = debug.outlinePointsPx.map((point) => `${point.xPx},${point.yPx}`).join(" ");

  return (
    <div className={styles.panel}>
      <div className={styles.headerRow}>
        <div>
          <div className={styles.title}>Trace debug</div>
          <div className={styles.hint}>
            This is the source image and silhouette pass the flat-item lookup used before accepting or rejecting the trace.
          </div>
        </div>
        <div className={styles.scorePill}>
          {debug.accepted ? "Accepted" : "Rejected"} {debug.traceScore.toFixed(2)}
        </div>
      </div>

      <div className={styles.metricRow}>
        <span>Bounds {round1(boundsWidth)} × {round1(boundsHeight)} px</span>
        <span>Coverage {round1(debug.coverage * 100)}%</span>
        <span>Target {round1(debug.targetWidthMm)} × {round1(debug.targetHeightMm)} mm</span>
      </div>

      <div className={styles.grid}>
        <figure className={styles.card}>
          <figcaption className={styles.cardTitle}>1. Chosen source image</figcaption>
          <svg viewBox={viewBox} className={styles.preview} aria-label="Chosen source image">
            <image href={imageUrl} x="0" y="0" width={debug.imageWidthPx} height={debug.imageHeightPx} />
            <rect
              x={debug.silhouetteBoundsPx.minX}
              y={debug.silhouetteBoundsPx.minY}
              width={Math.max(1, boundsWidth)}
              height={Math.max(1, boundsHeight)}
              className={styles.boundsRect}
            />
          </svg>
          <div className={styles.caption}>The bounding region the tracer treated as the foreground item.</div>
        </figure>

        <figure className={styles.card}>
          <figcaption className={styles.cardTitle}>2. Extracted outline</figcaption>
          <svg viewBox={viewBox} className={styles.preview} aria-label="Extracted outline">
            <image href={imageUrl} x="0" y="0" width={debug.imageWidthPx} height={debug.imageHeightPx} className={styles.fadedImage} />
            {outline ? <polyline points={outline} className={styles.outline} /> : null}
            <rect
              x={debug.silhouetteBoundsPx.minX}
              y={debug.silhouetteBoundsPx.minY}
              width={Math.max(1, boundsWidth)}
              height={Math.max(1, boundsHeight)}
              className={styles.boundsRect}
            />
          </svg>
          <div className={styles.caption}>
            {debug.rejectionReason ?? "The traced silhouette cleared the current acceptance threshold."}
          </div>
        </figure>
      </div>
    </div>
  );
}
