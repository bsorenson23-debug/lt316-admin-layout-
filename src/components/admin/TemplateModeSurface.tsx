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
  const isEdit = mode.intent === "edit";
  const editingTemplate = mode.editingTemplate ?? undefined;
  const title = isEdit ? "Edit template" : "Create new template";
  const subtitle = isEdit
    ? "Template mode isolates editing, preview, BODY CUTOUT QA, WRAP / EXPORT, and BODY REFERENCE v2 review from the production workspace shell."
    : "Template mode isolates new product authoring, preview, BODY CUTOUT QA, WRAP / EXPORT, and BODY REFERENCE v2 review from the production workspace shell.";
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
            <div className={styles.railTitle}>Authoring focus</div>
            <ul className={styles.railList}>
              <li>Source, BODY REFERENCE, BODY CUTOUT QA, WRAP / EXPORT, and v2 capture stay together here.</li>
              <li>Production-only workspace chrome is hidden until you exit template mode.</li>
              <li>Save, cancel, and the header back button all use the same mode exit rules.</li>
            </ul>
          </section>
          <section className={styles.railCard}>
            <div className={styles.railTitle}>Preserved behavior</div>
            <ul className={styles.railList}>
              <li>BODY CUTOUT QA rules, reviewed GLB generation, WRAP / EXPORT behavior, and artwork persistence stay unchanged.</li>
              <li>Product appearance references remain reference-only, and the engraving overlay stays tied to WRAP / EXPORT only.</li>
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
