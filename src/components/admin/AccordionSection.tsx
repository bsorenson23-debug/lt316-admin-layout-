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
  return (
    <div className={styles.section}>
      <div
        className={styles.header}
        onClick={() => onToggle(id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onToggle(id)}
        aria-expanded={isOpen}
      >
        <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}>
          {"\u25B8"}
        </span>
        <span className={styles.title}>{title}</span>
        <span className={`${styles.summary} ${isOpen ? styles.summaryHidden : ""}`}>
          {summary}
        </span>
      </div>
      <div className={`${styles.body} ${isOpen ? styles.bodyOpen : ""}`}>
        <div className={styles.bodyInner}>
          {children}
        </div>
      </div>
    </div>
  );
}
