"use client";

import React from "react";
import styles from "./WorkflowRail.module.css";

export interface WorkflowRailStep {
  id: string;
  label: string;
  detail: string;
  state: "done" | "active" | "upcoming";
  onSelect: () => void;
  spanFull?: boolean;
}

interface WorkflowRailProps {
  steps: WorkflowRailStep[];
}

export function WorkflowRail({ steps }: WorkflowRailProps) {
  return (
    <div className={styles.rail} aria-label="Job workflow">
      {steps.map((step, index) => {
        const stateLabel =
          step.state === "done" ? "Done" : step.state === "active" ? "Next" : "Later";

        return (
          <button
            key={step.id}
            type="button"
            className={[
              styles.step,
              step.state === "done"
                ? styles.stepDone
                : step.state === "active"
                  ? styles.stepActive
                  : styles.stepUpcoming,
              step.spanFull ? styles.stepFull : "",
            ].join(" ")}
            onClick={step.onSelect}
            aria-current={step.state === "active" ? "step" : undefined}
          >
            <span className={styles.stepHeader}>
              <span className={styles.stepBadge}>
                {step.state === "done" ? "\u2713" : index + 1}
              </span>
              <span className={styles.stepTitle}>{step.label}</span>
              <span className={styles.stepState}>{stateLabel}</span>
            </span>
            <span className={styles.stepDetail}>{step.detail}</span>
          </button>
        );
      })}
    </div>
  );
}
