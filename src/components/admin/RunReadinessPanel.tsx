"use client";

import React from "react";
import styles from "./RunReadinessPanel.module.css";

export interface RunReadinessItem {
  id: string;
  label: string;
  detail: string;
  status: "pass" | "fail" | "warn";
  onSelect?: () => void;
}

interface RunReadinessPanelProps {
  items: RunReadinessItem[];
  nextAction: string;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
}

export function RunReadinessPanel({
  items,
  nextAction,
  primaryActionLabel,
  onPrimaryAction,
}: RunReadinessPanelProps) {
  const failCount = items.filter((item) => item.status === "fail").length;
  const warnCount = items.filter((item) => item.status === "warn").length;
  const summary =
    failCount > 0
      ? `${failCount} blocker${failCount === 1 ? "" : "s"} before export`
      : warnCount > 0
        ? `${warnCount} warning${warnCount === 1 ? "" : "s"} to review`
        : "Ready to export";

  return (
    <section className={styles.card} aria-label="Run readiness">
      <div className={styles.header}>
        <div className={styles.headerCopy}>
          <span className={styles.title}>Run Readiness</span>
          <span className={styles.summary}>{summary}</span>
        </div>
        <button type="button" className={styles.primaryAction} onClick={onPrimaryAction}>
          {primaryActionLabel}
        </button>
      </div>

      <div className={styles.nextMove}>
        <span className={styles.nextMoveLabel}>Next move</span>
        <span className={styles.nextMoveValue}>{nextAction}</span>
      </div>

      <div className={styles.list}>
        {items.map((item) => {
          const className =
            item.status === "pass"
              ? styles.itemPass
              : item.status === "warn"
                ? styles.itemWarn
                : styles.itemFail;

          const content = (
            <>
              <span className={`${styles.statusDot} ${className}`} aria-hidden="true" />
              <span className={styles.itemText}>
                <span className={styles.itemLabel}>{item.label}</span>
                <span className={styles.itemDetail}>{item.detail}</span>
              </span>
              <span className={styles.itemStatus}>
                {item.status === "pass" ? "Ready" : item.status === "warn" ? "Review" : "Fix"}
              </span>
            </>
          );

          if (!item.onSelect) {
            return (
              <div key={item.id} className={styles.item}>
                {content}
              </div>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              className={`${styles.item} ${styles.itemButton}`}
              onClick={item.onSelect}
            >
              {content}
            </button>
          );
        })}
      </div>
    </section>
  );
}
