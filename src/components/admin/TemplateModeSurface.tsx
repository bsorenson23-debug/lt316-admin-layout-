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
      detail: "Pick the product, confirm the source model, and keep lookup plus imagery together.",
    },
    {
      step: "02",
      title: "Detect",
      detail: "Run lookup or photo detect before you move into contour review.",
    },
    {
      step: "03",
      title: "Review",
      detail: "Lock the accepted BODY REFERENCE so the current contour stays explicit.",
    },
    {
      step: "04",
      title: "BODY CUTOUT QA",
      detail: "Generate and inspect the reviewed body-only GLB without mixing export proof.",
    },
    {
      step: "05",
      title: "WRAP / EXPORT",
      detail: "Check placement, persistence, overlays, and export agreement separately.",
    },
  ] as const;
  const operatorRules = [
    "Create and edit stay on this same dedicated surface.",
    "Save, cancel, and back still use one shared exit path.",
    "BODY CUTOUT QA stays separate from WRAP / EXPORT proof.",
    "Advanced and debug detail stay secondary to the operator path.",
  ] as const;
  const isEdit = mode.intent === "edit";
  const editingTemplate = mode.editingTemplate ?? undefined;
  const title = isEdit ? "Edit template" : "Create new template";
  const subtitle = isEdit
    ? "Template mode keeps template authoring in a dedicated operator workspace instead of layering it over the production shell."
    : "Template mode keeps new template authoring in a dedicated operator workspace instead of layering it over the production shell.";
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
            <div className={styles.railTitle}>Operator route</div>
            <div className={styles.railIntro}>
              Follow the product-first path, then keep proof modes clearly separated.
            </div>
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
            <div className={styles.railTitle}>Guardrails</div>
            <ul className={styles.railList}>
              {operatorRules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
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
