"use client";

import React from "react";
import styles from "./AccordionSection.module.css";

export interface AccordionSectionProps {
  id: string;
  title: string;
  /** One-line summary shown when collapsed */
  summary: string;
  isOpen: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}

export function AccordionSection({
  id,
  title,
  summary,
  isOpen,
  onToggle,
  children,
}: AccordionSectionProps) {
  const headerId = `${id}-header`;
  const panelId = `${id}-panel`;

  return (
    <div className={styles.section}>
      <button
        id={headerId}
        type="button"
        className={styles.header}
        onClick={() => onToggle(id)}
        aria-expanded={isOpen}
        aria-controls={panelId}
      >
        <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}>
          {"\u25B8"}
        </span>
        <span className={styles.title}>{title}</span>
        <span className={`${styles.summary} ${isOpen ? styles.summaryHidden : ""}`}>
          {summary}
        </span>
      </button>
      <div
        id={panelId}
        className={`${styles.body} ${isOpen ? styles.bodyOpen : ""}`}
        role="region"
        aria-labelledby={headerId}
      >
        <div className={styles.bodyInner}>
          {children}
        </div>
      </div>
    </div>
  );
}
