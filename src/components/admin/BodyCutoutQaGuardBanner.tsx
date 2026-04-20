"use client";

import type { BodyCutoutQaGuardState } from "@/lib/bodyCutoutQaGuard";
import styles from "./BodyCutoutQaGuardBanner.module.css";

export function BodyCutoutQaGuardBanner({
  state,
}: {
  state: BodyCutoutQaGuardState;
}) {
  return (
    <div
      className={`${styles.banner} ${state.severity === "fail" ? styles.fail : styles.warn}`}
      data-testid="body-cutout-qa-guard-banner"
      data-severity={state.severity}
      data-reason={state.reason}
    >
      <div className={styles.titleRow}>
        <div className={styles.severity}>
          {state.severity === "fail" ? "Fail" : "Warn"}
        </div>
        <div className={styles.title}>{state.title}</div>
      </div>
      <div className={styles.message} data-testid="body-cutout-qa-guard-message">
        {state.message}
      </div>
    </div>
  );
}
