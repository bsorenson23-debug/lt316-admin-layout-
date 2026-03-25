"use client";

import React from "react";
import type { ProductTemplate } from "@/types/productTemplate";
import { loadTemplates, deleteTemplate } from "@/lib/templateStorage";
import styles from "./TemplateGallery.module.css";

type ProductTypeFilter = "all" | "tumbler" | "mug" | "bottle" | "flat";

const FILTERS: { value: ProductTypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "tumbler", label: "Tumbler" },
  { value: "mug", label: "Mug" },
  { value: "bottle", label: "Bottle" },
  { value: "flat", label: "Flat" },
];

const LASER_BADGE_CLASS: Record<string, string> = {
  fiber: styles.laserFiber,
  co2: styles.laserCo2,
  diode: styles.laserDiode,
};

const LASER_LABEL: Record<string, string> = {
  fiber: "Fiber",
  co2: "CO\u2082",
  diode: "Diode",
};

function isPlaceholderThumb(url: string): boolean {
  return url.startsWith("data:image/svg+xml,");
}

function ProductTypeIcon({ type }: { type: string }) {
  const stroke = "rgba(255,255,255,0.4)";
  const sw = 1.5;
  const none = "none";
  switch (type) {
    case "tumbler":
      return (
        <svg width="32" height="48" viewBox="0 0 32 48" fill={none} xmlns="http://www.w3.org/2000/svg">
          <rect x="6" y="6" width="20" height="38" rx="4" ry="4" stroke={stroke} strokeWidth={sw} />
          <line x1="6" y1="12" x2="26" y2="12" stroke={stroke} strokeWidth={sw} />
        </svg>
      );
    case "mug":
      return (
        <svg width="44" height="40" viewBox="0 0 44 40" fill={none} xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="6" width="24" height="28" rx="3" stroke={stroke} strokeWidth={sw} />
          <path d="M28 14 C36 14 36 26 28 26" stroke={stroke} strokeWidth={sw} fill={none} />
        </svg>
      );
    case "bottle":
      return (
        <svg width="24" height="52" viewBox="0 0 24 52" fill={none} xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="18" width="16" height="28" rx="3" stroke={stroke} strokeWidth={sw} />
          <rect x="8" y="4" width="8" height="14" rx="2" stroke={stroke} strokeWidth={sw} />
        </svg>
      );
    case "flat":
      return (
        <svg width="48" height="32" viewBox="0 0 48 32" fill={none} xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="6" width="40" height="20" rx="2" stroke={stroke} strokeWidth={sw} />
        </svg>
      );
    default:
      return null;
  }
}

interface Props {
  onSelect: (template: ProductTemplate) => void;
  onCreateNew: () => void;
  onEdit?: (template: ProductTemplate) => void;
  onDelete?: (id: string) => void;
  selectedId?: string;
}

export function TemplateGallery({ onSelect, onCreateNew, onEdit, onDelete, selectedId }: Props) {
  const [templates, setTemplates] = React.useState<ProductTemplate[]>(() => loadTemplates());
  const [filter, setFilter] = React.useState<ProductTypeFilter>("all");
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [manageMode, setManageMode] = React.useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);
  const [fadingOutId, setFadingOutId] = React.useState<string | null>(null);

  const filtered =
    filter === "all"
      ? templates
      : templates.filter((t) => t.productType === filter);

  const handleCardClick = (t: ProductTemplate) => {
    if (manageMode) {
      if (onEdit) {
        onEdit(t);
      }
      return;
    }
    setPendingId(t.id);
    setTimeout(() => {
      setPendingId(null);
      onSelect(t);
    }, 300);
  };

  const handleDeleteConfirm = (id: string) => {
    setFadingOutId(id);
    setTimeout(() => {
      deleteTemplate(id);
      setTemplates(loadTemplates());
      onDelete?.(id);
      setConfirmDeleteId(null);
      setFadingOutId(null);
    }, 250);
  };

  return (
    <div>
      <div className={styles.headerRow}>
        <div className={styles.filterRow}>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`${styles.filterPill} ${filter === f.value ? styles.filterPillActive : ""}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`${styles.managePill} ${manageMode ? styles.managePillActive : ""}`}
          onClick={() => { setManageMode((m) => !m); setConfirmDeleteId(null); }}
        >
          {manageMode ? "Done" : "Manage"}
        </button>
      </div>

      {manageMode && (
        <div className={styles.manageBanner}>
          Tap any template to edit or delete it
        </div>
      )}

      <div className={styles.grid}>
        {filtered.map((t) => {
          const isSelected = t.id === selectedId || t.id === pendingId;
          const isFading = t.id === fadingOutId;
          const isConfirming = t.id === confirmDeleteId;
          const showActions = manageMode || undefined;

          return (
            <div
              key={t.id}
              className={
                `${styles.card}` +
                `${isSelected ? ` ${styles.cardSelected}` : ""}` +
                `${isFading ? ` ${styles.cardFading}` : ""}` +
                `${isConfirming ? ` ${styles.cardConfirming}` : ""}`
              }
              onClick={() => !isConfirming && handleCardClick(t)}
            >
              <div className={styles.thumbWrap}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={t.thumbnailDataUrl}
                  alt={t.name}
                  className={styles.thumb}
                  width={120}
                  height={120}
                />
                {isPlaceholderThumb(t.thumbnailDataUrl) && (
                  <span className={styles.thumbIcon}>
                    <ProductTypeIcon type={t.productType} />
                  </span>
                )}
                {t.builtIn && (
                  <span className={styles.thumbBuiltIn}>Built-in</span>
                )}
              </div>

              {isSelected && !manageMode && (
                <span className={styles.checkOverlay}>✓</span>
              )}

              {/* Action icons — always visible in manage mode, hover-only otherwise */}
              {!isConfirming && (
                <div className={`${styles.actionRow} ${showActions ? styles.actionRowVisible : ""}`}>
                  {onEdit && (
                    <button
                      type="button"
                      className={styles.editBtn}
                      onClick={(e) => { e.stopPropagation(); onEdit(t); }}
                      aria-label={`Edit ${t.name}`}
                      title="Edit"
                    >
                      ✎
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.deleteBtn}
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(t.id); }}
                    aria-label={`Delete ${t.name}`}
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* Inline delete confirmation */}
              {isConfirming && (
                <div className={styles.confirmOverlay} onClick={(e) => e.stopPropagation()}>
                  <span className={styles.confirmText}>
                    Delete {t.name}? This cannot be undone.
                  </span>
                  <div className={styles.confirmBtns}>
                    <button
                      type="button"
                      className={styles.confirmCancelBtn}
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={styles.confirmDeleteBtn}
                      onClick={() => handleDeleteConfirm(t.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}

              <div className={styles.cardBody}>
                <span className={styles.cardName}>{t.name}</span>
                <span className={styles.cardMeta}>
                  {[t.brand, t.capacity].filter(Boolean).join(" · ") || "\u00A0"}
                </span>
                <div className={styles.badgeRow}>
                  <span className={`${styles.laserBadge} ${LASER_BADGE_CLASS[t.laserType] ?? ""}`}>
                    {LASER_LABEL[t.laserType] ?? t.laserType}
                  </span>
                  {t.builtIn && (
                    <span className={styles.builtInBadge}>Built-in</span>
                  )}
                  {t.productType !== "flat" && (
                    t.tumblerMapping?.isMapped ? (
                      <span className={styles.mappedBadge}>Mapped &#x2713;</span>
                    ) : (
                      <span className={styles.unmappedBadge}>Not mapped</span>
                    )
                  )}
                </div>
              </div>
            </div>
          );
        })}

        <button
          type="button"
          className={styles.addCard}
          onClick={onCreateNew}
        >
          <span className={styles.addIcon}>+</span>
          <span className={styles.addLabel}>Add product</span>
        </button>
      </div>
    </div>
  );
}
