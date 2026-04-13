"use client";

import React from "react";
import type { AdminSectionSnapshot } from "../types";
import styles from "./AdminSectionSurface.module.css";

interface Props {
  snapshot: AdminSectionSnapshot;
  debugEnabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function AdminSectionSurface({
  snapshot,
  debugEnabled = false,
  className,
  children,
}: Props) {
  return (
    <section
      className={[styles.surface, className].filter(Boolean).join(" ")}
      data-section-id={snapshot.id}
      data-section-owner={snapshot.owner}
      data-testid={snapshot.testId}
    >
      {debugEnabled ? (
        <div className={styles.debugHeader}>
          <div className={styles.debugTitle}>
            <span className={styles.debugLabel}>{snapshot.title}</span>
            <span className={styles.statusChip}>{snapshot.status}</span>
            {snapshot.authority ? (
              <span className={styles.authorityChip}>{snapshot.authority}</span>
            ) : null}
          </div>
          <div className={styles.debugMeta}>
            <span className={styles.summary}>{snapshot.summary}</span>
          </div>
        </div>
      ) : null}
      {children}
    </section>
  );
}
