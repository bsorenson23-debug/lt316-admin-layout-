"use client";

import React from "react";
import type { BodyGeometryContract } from "@/lib/bodyGeometryContract";
import { buildBodyGeometryStatusBadgeState } from "@/lib/bodyGeometryStatusBadge";
import styles from "./BodyGeometryStatusBadge.module.css";

interface BodyGeometryStatusBadgeProps {
  mode: BodyGeometryContract["mode"] | null | undefined;
  contract: BodyGeometryContract | null;
}

function getStatusClass(status: BodyGeometryContract["validation"]["status"] | undefined): string {
  switch (status) {
    case "pass":
      return styles.statusPass;
    case "warn":
      return styles.statusWarn;
    case "fail":
      return styles.statusFail;
    default:
      return styles.statusUnknown;
  }
}

function getBadgeClass(status: BodyGeometryContract["validation"]["status"] | undefined): string {
  switch (status) {
    case "pass":
      return styles.badgePass;
    case "warn":
      return styles.badgeWarn;
    case "fail":
      return styles.badgeFail;
    default:
      return styles.badgeUnknown;
  }
}

function getStatusLabel(status: BodyGeometryContract["validation"]["status"] | undefined): string {
  switch (status) {
    case "pass":
      return "PASS";
    case "warn":
      return "WARN";
    case "fail":
      return "FAIL";
    default:
      return "UNKNOWN";
  }
}

function getNoteClass(status: BodyGeometryContract["validation"]["status"] | undefined): string {
  switch (status) {
    case "pass":
      return styles.notePass;
    case "warn":
      return styles.noteWarn;
    case "fail":
      return styles.noteFail;
    default:
      return styles.noteUnknown;
  }
}

export function BodyGeometryStatusBadge({
  mode,
  contract,
}: BodyGeometryStatusBadgeProps) {
  const state = React.useMemo(
    () => buildBodyGeometryStatusBadgeState({ mode: mode ?? "unknown", contract }),
    [contract, mode],
  );

  return (
    <div
      className={`${styles.badge} ${getBadgeClass(state.status)}`}
      data-testid="body-geometry-status-badge"
      data-status={state.status}
      data-mode={String(mode ?? "unknown")}
    >
      <div className={styles.header}>
        <div className={styles.title} data-testid="body-geometry-status-badge-title">{state.title}</div>
        <div
          className={`${styles.status} ${getStatusClass(state.status)}`}
          data-testid="body-geometry-status-badge-status"
        >
          {getStatusLabel(state.status)}
        </div>
      </div>
      <div className={styles.rows} data-testid="body-geometry-status-badge-rows">
        <div className={styles.row} data-testid="body-geometry-status-badge-source">
          <span className={styles.label}>Source</span>
          <span className={styles.value}>{state.sourceLabel}</span>
        </div>
        <div className={styles.row} data-testid="body-geometry-status-badge-geometry">
          <span className={styles.label}>Geometry</span>
          <span className={styles.value}>{state.geometryLabel}</span>
        </div>
        <div className={styles.row} data-testid="body-geometry-status-badge-fallback">
          <span className={styles.label}>Fallback</span>
          <span className={styles.value}>{state.fallbackLabel}</span>
        </div>
        <div className={styles.row} data-testid="body-geometry-status-badge-glb">
          <span className={styles.label}>GLB</span>
          <span className={styles.value}>{state.glbLabel}</span>
        </div>
      </div>
      <div
        className={`${styles.note} ${getNoteClass(state.status)}`}
        data-testid="body-geometry-status-badge-note"
      >
        {state.qaLabel}
      </div>
    </div>
  );
}
