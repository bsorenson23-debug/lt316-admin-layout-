import Link from "next/link";
import { CalibrationWorkspace } from "./CalibrationWorkspace";
import styles from "./AdminCalibrationPage.module.css";

function PlaceholderSection({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className={styles.placeholder}>
      <div className={styles.placeholderTitle}>{title}</div>
      <div className={styles.placeholderText}>{description}</div>
      <div className={styles.placeholderBadge}>Planned</div>
    </section>
  );
}

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

        <div className={styles.futureGrid}>
          <PlaceholderSection
            title="Tumbler Geometry"
            description="Coming later: taper compensation and angularity offsets."
          />
          <PlaceholderSection
            title="Lens Calibration"
            description="Coming later: focus profile and lens-specific alignment."
          />
          <PlaceholderSection
            title="Export Placement Preview"
            description="Coming later: calibration-aware export placement preview."
          />
        </div>
      </div>
    </main>
  );
}
