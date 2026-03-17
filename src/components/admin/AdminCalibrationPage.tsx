import Link from "next/link";
import { CalibrationWorkspace } from "./CalibrationWorkspace";
import styles from "./AdminCalibrationPage.module.css";

export function AdminCalibrationPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1>Admin Calibration Tools</h1>
          <p>
            Advanced setup tools for rotary placement, tumbler calibration, and
            export alignment.
          </p>
        </div>
        <Link href="/admin" className={styles.backLink}>
          Back to Admin Workspace
        </Link>
      </header>

      <div className={styles.content}>
        <CalibrationWorkspace />
      </div>
    </main>
  );
}
