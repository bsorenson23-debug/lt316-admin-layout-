"use client";

import React from "react";
import styles from "./CurrentJobCard.module.css";

interface JobMetric {
  label: string;
  value: string;
}

export interface JobQuickAction {
  label: string;
  shortcut: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}

interface CurrentJobCardProps {
  modeLabel: string;
  productName: string;
  orderName: string;
  nextAction: string;
  metrics: JobMetric[];
  quickActions?: JobQuickAction[];
}

export function CurrentJobCard({
  modeLabel,
  productName,
  orderName,
  nextAction,
  metrics,
  quickActions = [],
}: CurrentJobCardProps) {
  return (
    <section className={styles.card} aria-label="Current job summary">
      <div className={styles.header}>
        <span className={styles.title}>Current Job</span>
        <span className={styles.modeBadge}>{modeLabel}</span>
      </div>

      <div className={styles.primaryBlock}>
        <span className={styles.productName}>{productName}</span>
        <span className={styles.orderName}>{orderName}</span>
      </div>

      <div className={styles.metricGrid}>
        {metrics.map((metric) => (
          <div key={metric.label} className={styles.metricCard}>
            <span className={styles.metricLabel}>{metric.label}</span>
            <span className={styles.metricValue}>{metric.value}</span>
          </div>
        ))}
      </div>

      <div className={styles.nextMove}>
        <span className={styles.nextMoveLabel}>Next move</span>
        <span className={styles.nextMoveValue}>{nextAction}</span>
      </div>

      {quickActions.length > 0 ? (
        <div className={styles.quickActions} aria-label="Current job quick actions">
          {quickActions.map((action) => (
            <button
              key={`${action.label}-${action.shortcut}`}
              type="button"
              className={
                action.variant === "primary"
                  ? styles.quickActionPrimary
                  : styles.quickActionSecondary
              }
              onClick={action.onClick}
              disabled={action.disabled}
            >
              <span>{action.label}</span>
              <span className={styles.shortcutChip}>{action.shortcut}</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
