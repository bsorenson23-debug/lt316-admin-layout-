"use client";

import React from "react";

import type { LaserBedArtworkPlacement } from "@/lib/laserBedSurfaceMapping";
import type { TemplateModeState } from "@/lib/templateModeState";
import type { ProductTemplate } from "@/types/productTemplate";

import { TemplateCreateForm } from "./TemplateCreateForm";
import styles from "./TemplateModeSurface.module.css";

interface Props {
  mode: TemplateModeState;
  workspaceArtworkPlacements?: LaserBedArtworkPlacement[] | null;
  onSave: (template: ProductTemplate) => void;
  onExit: () => void;
}

export function TemplateModeSurface({
  mode,
  workspaceArtworkPlacements = null,
  onSave,
  onExit,
}: Props) {
  const workflowPhases = [
    {
      step: "01",
      title: "Source",
      detail: "Identity, lookup, source imagery, and the starting model inputs stay together here.",
    },
    {
      step: "02",
      title: "Detect",
      detail: "Lookup and photo auto-detect stay clearly ahead of BODY REFERENCE review.",
    },
    {
      step: "03",
      title: "Review",
      detail: "Accept BODY REFERENCE before QA generation so the current contour stays explicit.",
    },
    {
      step: "04",
      title: "BODY CUTOUT QA",
      detail: "Generate and inspect the reviewed body-only GLB without mixing in WRAP / EXPORT proof.",
    },
    {
      step: "05",
      title: "WRAP / EXPORT",
      detail: "Placement, saved artwork persistence, overlay preview, and export agreement stay separate.",
    },
  ] as const;
  const isEdit = mode.intent === "edit";
  const editingTemplate = mode.editingTemplate ?? undefined;
  const title = isEdit ? "Edit template" : "Create new template";
  const subtitle = isEdit
    ? "Template mode keeps template authoring as the primary workspace instead of layering it over the production job shell."
    : "Template mode keeps new template authoring as the primary workspace instead of layering it over the production job shell.";
  const exitLabel =
    mode.returnTarget === "gallery"
      ? "Back to product browser"
      : "Back to workspace";
  const summaryMeta = editingTemplate
    ? [
        editingTemplate.productType,
        editingTemplate.builtIn ? "Built-in" : "User template",
      ]
        .filter(Boolean)
        .join(" · ")
    : "New template draft";

  return (
    <div
      className={styles.surface}
      data-testid="template-mode-shell"
      data-template-mode-intent={mode.intent ?? "inactive"}
    >
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <span className={styles.eyebrow}>Template mode</span>
          <h1 className={styles.title} data-testid="template-mode-title">
            {title}
          </h1>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Current authoring context</span>
            <span className={styles.summaryTitle}>
              {editingTemplate?.name ?? "Unsaved template"}
            </span>
            <span className={styles.summaryMeta}>{summaryMeta}</span>
          </div>
          <button
            type="button"
            className={styles.exitButton}
            data-testid="template-mode-exit"
            onClick={onExit}
          >
            {exitLabel}
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <aside className={styles.rail}>
          <section className={styles.railCard}>
            <div className={styles.railTitle}>Template-first workflow</div>
            <div className={styles.phaseList}>
              {workflowPhases.map((phase) => (
                <div key={phase.step} className={styles.phaseCard}>
                  <div className={styles.phaseHeader}>
                    <span className={styles.phaseStep}>{phase.step}</span>
                    <span className={styles.phaseTitle}>{phase.title}</span>
                  </div>
                  <div className={styles.phaseDetail}>{phase.detail}</div>
                </div>
              ))}
            </div>
          </section>
          <section className={styles.railCard}>
            <div className={styles.railTitle}>Mode rules</div>
            <ul className={styles.railList}>
              <li>Production-only workspace chrome stays secondary until you exit template mode.</li>
              <li>Save, cancel, and the header back button still use one shared template-mode exit path.</li>
              <li>BODY CUTOUT QA, WRAP / EXPORT, v2 capture, product appearance references, and overlay semantics stay unchanged.</li>
            </ul>
          </section>
        </aside>

        <main className={styles.main}>
          <TemplateCreateForm
            editingTemplate={editingTemplate}
            workspaceArtworkPlacements={workspaceArtworkPlacements}
            onSave={onSave}
            onCancel={onExit}
            surfaceMode="page"
          />
        </main>
      </div>
    </div>
  );
}
