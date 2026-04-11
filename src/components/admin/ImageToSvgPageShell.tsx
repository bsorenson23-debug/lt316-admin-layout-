"use client";

import React from "react";
import Link from "next/link";
import { createSvgLibraryAsset } from "@/lib/svgLibraryClient";
import { publishSvgLibrarySync } from "@/lib/svgLibrarySync";
import { RasterToSvgPanel } from "./RasterToSvgPanel";
import styles from "./ImageToSvgPageShell.module.css";

type SaveStatus =
  | { kind: "idle"; message: null }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

const IMAGE_TO_SVG_SESSION_KEY = "lt316_image_to_svg_session";

export function ImageToSvgPageShell() {
  const [resetSignal, setResetSignal] = React.useState(0);
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>({
    kind: "idle",
    message: null,
  });

  const handleAddAsset = React.useCallback(async (svgContent: string, fileName: string) => {
    try {
      await createSvgLibraryAsset({ name: fileName, svgText: svgContent });
      publishSvgLibrarySync(typeof window !== "undefined" ? window.localStorage : null);
      setSaveStatus({
        kind: "success",
        message: `${fileName} was saved to the shared SVG library.`,
      });
    } catch (error) {
      setSaveStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not save the SVG to the library.",
      });
    }
  }, []);

  const handleStartAnother = React.useCallback(() => {
    setSaveStatus({ kind: "idle", message: null });
    setResetSignal((current) => current + 1);
  }, []);

  return (
    <div className={styles.page} data-testid="image-to-svg-page">
      <div className={styles.shell}>
        <div className={styles.headerCard}>
          <div className={styles.headerContent}>
            <div className={styles.eyebrow}>Dedicated Workflow</div>
            <h1 className={styles.title}>Image to SVG</h1>
            <p className={styles.summary}>
              Clean product photos, tune the trace, and save the final SVG into the shared library
              without crowding the main admin workspace.
            </p>
            <div className={styles.headerMetaRow}>
              <span className={styles.metaChip}>Standalone raster workflow</span>
              <span className={styles.metaChip}>Shared library handoff</span>
              <span className={styles.metaChip}>Autosaves current session</span>
            </div>
          </div>
          <div className={styles.actions}>
            <Link href="/admin" className={styles.navBtnPrimary + " " + styles.navBtn}>
              Back to Admin
            </Link>
            <Link href="/admin/calibration" className={styles.navBtn}>
              Calibration
            </Link>
          </div>
        </div>

        {saveStatus.kind !== "idle" ? (
          <div
            className={`${styles.statusBanner} ${
              saveStatus.kind === "success" ? styles.statusSuccess : styles.statusError
            }`}
            role="status"
            aria-live="polite"
            data-testid="image-to-svg-save-status"
          >
            <div className={styles.statusCopy}>{saveStatus.message}</div>
            <div className={styles.statusActions}>
              {saveStatus.kind === "success" ? (
                <>
                  <Link href="/admin?tab=tools&library=1" className={styles.statusActionLink}>
                    Open Vector Library
                  </Link>
                  <Link href="/admin" className={styles.statusActionLink}>
                    Back to Admin
                  </Link>
                  <button type="button" className={styles.statusActionButton} onClick={handleStartAnother}>
                    Start Another
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className={styles.panelWrap}>
          <p className={styles.helper}>
            The build and save controls stay pinned while you scroll. Saved SVGs appear in the
            admin artwork library, and the admin screen will resync on focus.
          </p>
          <RasterToSvgPanel
            onAddAsset={handleAddAsset}
            variant="page"
            persistSessionKey={IMAGE_TO_SVG_SESSION_KEY}
            resetSignal={resetSignal}
          />
        </div>
      </div>
    </div>
  );
}
