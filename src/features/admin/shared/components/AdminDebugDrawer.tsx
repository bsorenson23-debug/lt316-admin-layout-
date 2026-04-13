"use client";

import React from "react";
import type { AdminSectionSnapshot, AdminTraceEnvelope } from "../types";
import styles from "./AdminDebugDrawer.module.css";

interface Props {
  openByDefault?: boolean;
  trace: AdminTraceEnvelope;
  sections: AdminSectionSnapshot[];
}

function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function AdminDebugDrawer({
  openByDefault = false,
  trace,
  sections,
}: Props) {
  return (
    <details className={styles.drawer} open={openByDefault}>
      <summary className={styles.summary}>
        <div className={styles.summaryTitle}>
          <span className={styles.title}>Admin Debug</span>
          <span className={styles.subtitle}>
            {trace.sectionId ?? "no-section"} · {trace.traceId}
          </span>
        </div>
        <span className={styles.subtitle}>Open</span>
      </summary>

      <div className={styles.body}>
        <div className={styles.traceCard}>
          <div className={styles.sectionTitle}>Trace envelope</div>
          <div className={styles.traceGrid}>
            <div className={styles.row}><span>traceId</span><strong>{trace.traceId}</strong></div>
            <div className={styles.row}><span>runId</span><strong>{trace.runId ?? "—"}</strong></div>
            <div className={styles.row}><span>sectionId</span><strong>{trace.sectionId ?? "—"}</strong></div>
            <div className={styles.row}><span>templateId</span><strong>{trace.templateId ?? "—"}</strong></div>
            <div className={styles.row}><span>selectedItemId</span><strong>{trace.selectedItemId ?? "—"}</strong></div>
            <div className={styles.row}><span>authority</span><strong>{trace.authority ?? "—"}</strong></div>
            <div className={styles.row}><span>warnings</span><strong>{trace.warnings.length}</strong></div>
            <div className={styles.row}><span>errors</span><strong>{trace.errors.length}</strong></div>
          </div>
        </div>

        <div className={styles.sectionList}>
          {sections.map((section) => (
            <div key={section.id} className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>{section.title}</span>
                <span className={styles.status}>{section.status}</span>
              </div>
              <div className={styles.sectionGrid}>
                <div className={styles.row}><span>id</span><strong>{section.id}</strong></div>
                <div className={styles.row}><span>owner</span><strong>{section.owner}</strong></div>
                <div className={styles.row}><span>authority</span><strong>{section.authority ?? "—"}</strong></div>
                <div className={styles.row}><span>summary</span><strong>{section.summary}</strong></div>
              </div>
              <pre className={styles.json}>{stringify(section.debug)}</pre>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
