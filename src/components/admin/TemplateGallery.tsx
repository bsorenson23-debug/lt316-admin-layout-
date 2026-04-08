"use client";

import React from "react";
import { getTemplateEffectiveCylinderDiameterMm, type ProductTemplate } from "@/types/productTemplate";
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
  co2: "CO2",
  diode: "Diode",
};

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9.\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTemplateSearchText(template: ProductTemplate): string {
  return normalizeSearchText(
    [
      template.name,
      template.brand,
      template.capacity,
      template.materialLabel,
      template.productType,
      template.laserType ? (LASER_LABEL[template.laserType] ?? template.laserType) : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function isPlaceholderThumb(url: string): boolean {
  return url.startsWith("data:image/svg+xml,");
}

function ProductTypeIcon({ type }: { type: string }) {
  const stroke = "currentColor";
  const strokeWidth = 1.5;
  const noFill = "none";

  switch (type) {
    case "tumbler":
      return (
        <svg width="34" height="50" viewBox="0 0 32 48" fill={noFill} xmlns="http://www.w3.org/2000/svg">
          <rect x="6" y="6" width="20" height="38" rx="4" ry="4" stroke={stroke} strokeWidth={strokeWidth} />
          <line x1="6" y1="12" x2="26" y2="12" stroke={stroke} strokeWidth={strokeWidth} />
        </svg>
      );
    case "mug":
      return (
        <svg width="46" height="40" viewBox="0 0 44 40" fill={noFill} xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="6" width="24" height="28" rx="3" stroke={stroke} strokeWidth={strokeWidth} />
          <path d="M28 14 C36 14 36 26 28 26" stroke={stroke} strokeWidth={strokeWidth} fill={noFill} />
        </svg>
      );
    case "bottle":
      return (
        <svg width="24" height="52" viewBox="0 0 24 52" fill={noFill} xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="18" width="16" height="28" rx="3" stroke={stroke} strokeWidth={strokeWidth} />
          <rect x="8" y="4" width="8" height="14" rx="2" stroke={stroke} strokeWidth={strokeWidth} />
        </svg>
      );
    case "flat":
      return (
        <svg width="48" height="32" viewBox="0 0 48 32" fill={noFill} xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="6" width="40" height="20" rx="2" stroke={stroke} strokeWidth={strokeWidth} />
        </svg>
      );
    default:
      return null;
  }
}

function getTemplateSpecLine(template: ProductTemplate): string {
  if (template.productType === "flat") {
    const width = template.dimensions.templateWidthMm;
    const height = template.dimensions.printHeightMm;
    return width > 0 && height > 0 ? `${width} x ${height} mm` : "Flat-bed product";
  }

  const diameter = getTemplateEffectiveCylinderDiameterMm(template);
  const height = template.dimensions.printHeightMm;
  if (diameter > 0 && height > 0) {
    return `${(Math.round(diameter * 10) / 10).toFixed(1)} mm dia / ${height} mm print`;
  }

  return "Tumbler setup";
}

interface Props {
  onSelect: (template: ProductTemplate) => void;
  onCreateNew: () => void;
  onEdit?: (template: ProductTemplate) => void;
  onDelete?: (id: string) => void;
  selectedId?: string;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

export function TemplateGallery({
  onSelect,
  onCreateNew,
  onEdit,
  onDelete,
  selectedId,
  searchInputRef,
}: Props) {
  const [templates, setTemplates] = React.useState<ProductTemplate[]>(() => loadTemplates());
  const [filter, setFilter] = React.useState<ProductTypeFilter>("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [manageMode, setManageMode] = React.useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);
  const [fadingOutId, setFadingOutId] = React.useState<string | null>(null);
  const deferredSearchQuery = React.useDeferredValue(searchQuery);
  const searchTokens = React.useMemo(
    () => normalizeSearchText(deferredSearchQuery).split(" ").filter(Boolean),
    [deferredSearchQuery],
  );

  React.useEffect(() => {
    const refreshTemplates = () => setTemplates(loadTemplates());
    window.addEventListener("storage", refreshTemplates);
    window.addEventListener("focus", refreshTemplates);
    return () => {
      window.removeEventListener("storage", refreshTemplates);
      window.removeEventListener("focus", refreshTemplates);
    };
  }, []);

  const filteredTemplates = React.useMemo(() => {
    const typeFiltered =
      filter === "all"
        ? templates
        : templates.filter((template) => template.productType === filter);

    if (searchTokens.length === 0) return typeFiltered;

    return typeFiltered.filter((template) => {
      const haystack = buildTemplateSearchText(template);
      return searchTokens.every((token) => haystack.includes(token));
    });
  }, [filter, searchTokens, templates]);

  const trimmedSearch = searchQuery.trim();
  const resultLabel = `${filteredTemplates.length} of ${templates.length} products`;
  const builtInCount = templates.filter((template) => template.builtIn).length;
  const customCount = templates.length - builtInCount;

  const handleCardClick = (template: ProductTemplate) => {
    if (manageMode && !template.builtIn) {
      onEdit?.(template);
      return;
    }

    setPendingId(template.id);
    window.setTimeout(() => {
      setPendingId(null);
      onSelect(template);
    }, 300);
  };

  const handleDeleteConfirm = (id: string) => {
    setFadingOutId(id);
    window.setTimeout(() => {
      deleteTemplate(id);
      setTemplates(loadTemplates());
      onDelete?.(id);
      setConfirmDeleteId(null);
      setFadingOutId(null);
    }, 250);
  };

  return (
    <div className={styles.galleryShell}>
      <div className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.heroEyebrow}>Product Templates</div>
          <h2 className={styles.heroTitle}>Select a product</h2>
          <p className={styles.heroText}>
            Load saved dimensions, material defaults, and rotary setup in one click so the operator starts from a known product instead of manual setup.
          </p>
        </div>
        <div className={styles.heroActions}>
          <div className={styles.heroStats}>
            <span className={styles.heroStatValue}>{templates.length}</span>
            <span className={styles.heroStatLabel}>saved products</span>
          </div>
          <button
            type="button"
            className={styles.createBtn}
            onClick={onCreateNew}
          >
            Create new template
          </button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <label className={styles.searchField}>
          <span className={styles.searchLabel}>Find product</span>
          <input
            ref={searchInputRef}
            type="search"
            className={styles.searchInput}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by name, brand, capacity, material, or laser type"
            aria-label="Find product template"
          />
        </label>
        {trimmedSearch ? (
          <button
            type="button"
            className={styles.searchClearBtn}
            onClick={() => setSearchQuery("")}
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className={styles.headerRow}>
        <div className={styles.filterRow}>
          {FILTERS.map((filterOption) => (
            <button
              key={filterOption.value}
              type="button"
              className={`${styles.filterPill} ${filter === filterOption.value ? styles.filterPillActive : ""}`}
              onClick={() => setFilter(filterOption.value)}
            >
              {filterOption.label}
            </button>
          ))}
        </div>
        <div className={styles.headerMeta}>
          <span className={styles.resultCount}>{resultLabel}</span>
          <span className={styles.resultSubtle}>
            {builtInCount} built-in / {customCount} custom
          </span>
          <button
            type="button"
            className={`${styles.managePill} ${manageMode ? styles.managePillActive : ""}`}
            onClick={() => {
              setManageMode((previous) => !previous);
              setConfirmDeleteId(null);
            }}
          >
            {manageMode ? "Done" : "Manage"}
          </button>
        </div>
      </div>

      {manageMode ? (
        <div className={styles.manageBanner}>
          Custom templates can be edited or deleted here. Built-ins stay read-only and selectable.
        </div>
      ) : null}

      <div className={styles.resultsPanel}>
        {filteredTemplates.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyTitle}>No products found</span>
            <span className={styles.emptyText}>
              {trimmedSearch
                ? `No products match "${trimmedSearch}". Try a broader search or add a new template.`
                : "No products are available for this filter yet. Add a new template to get started."}
            </span>
            <button
              type="button"
              className={styles.emptyAction}
              onClick={onCreateNew}
            >
              Create new template
            </button>
          </div>
        ) : (
          <div className={styles.grid}>
            {filteredTemplates.map((template) => {
              const isSelected = template.id === selectedId || template.id === pendingId;
              const isFading = template.id === fadingOutId;
              const isConfirming = template.id === confirmDeleteId;
              const canManageTemplate = !template.builtIn;
              const showActions = canManageTemplate && manageMode ? styles.actionRowVisible : "";
              const hasThumbnail = Boolean(template.thumbnailDataUrl?.trim());
              const cardMeta = [template.brand, template.capacity].filter(Boolean).join(" / ");

              return (
                <article
                  key={template.id}
                  className={
                    `${styles.card}` +
                    `${isSelected ? ` ${styles.cardSelected}` : ""}` +
                    `${isFading ? ` ${styles.cardFading}` : ""}` +
                    `${isConfirming ? ` ${styles.cardConfirming}` : ""}`
                  }
                >
                  <button
                    type="button"
                    className={styles.cardButton}
                    onClick={() => {
                      if (!isConfirming) {
                        handleCardClick(template);
                      }
                    }}
                    aria-pressed={!manageMode && isSelected}
                    aria-label={`${manageMode && canManageTemplate ? "Edit" : "Select"} ${template.name}`}
                    disabled={isConfirming}
                  >
                    <div className={styles.thumbWrap}>
                      {hasThumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={template.thumbnailDataUrl}
                          alt={template.name}
                          className={styles.thumb}
                          width={160}
                          height={160}
                        />
                      ) : (
                        <div className={`${styles.thumb} ${styles.thumbFallback}`} aria-hidden="true" />
                      )}
                      {(!hasThumbnail || isPlaceholderThumb(template.thumbnailDataUrl ?? "")) ? (
                        <span className={styles.thumbIcon}>
                          <ProductTypeIcon type={template.productType} />
                        </span>
                      ) : null}
                      {template.builtIn ? (
                        <span className={styles.thumbBuiltIn}>Built-in</span>
                      ) : null}
                    </div>

                    {isSelected && !manageMode ? (
                      <span className={styles.checkOverlay}>&#x2713;</span>
                    ) : null}

                    <div className={styles.cardBody}>
                      <span className={styles.cardName}>{template.name}</span>
                      <span className={styles.cardMeta}>{cardMeta || "\u00A0"}</span>
                      <span className={styles.specLine}>{getTemplateSpecLine(template)}</span>
                      <div className={styles.badgeRow}>
                        <span className={`${styles.laserBadge} ${template.laserType ? (LASER_BADGE_CLASS[template.laserType] ?? "") : ""}`}>
                          {template.laserType ? (LASER_LABEL[template.laserType] ?? template.laserType) : "Laser optional"}
                        </span>
                        {template.builtIn ? <span className={styles.builtInBadge}>Built-in</span> : null}
                        {template.productType !== "flat" ? (
                          template.tumblerMapping?.isMapped ? (
                            <span className={styles.mappedBadge}>Mapped &#x2713;</span>
                          ) : (
                            <span className={styles.unmappedBadge}>Not mapped</span>
                          )
                        ) : null}
                      </div>
                    </div>
                  </button>

                  {canManageTemplate && !isConfirming ? (
                    <div className={`${styles.actionRow} ${showActions}`}>
                      {onEdit ? (
                        <button
                          type="button"
                          className={styles.editBtn}
                          onClick={(event) => {
                            event.stopPropagation();
                            onEdit(template);
                          }}
                          aria-label={`Edit ${template.name}`}
                          title="Edit"
                        >
                          &#x270E;
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={styles.deleteBtn}
                        onClick={(event) => {
                          event.stopPropagation();
                          setConfirmDeleteId(template.id);
                        }}
                        aria-label={`Delete ${template.name}`}
                        title="Delete"
                      >
                        X
                      </button>
                    </div>
                  ) : null}

                  {isConfirming ? (
                    <div className={styles.confirmOverlay} onClick={(event) => event.stopPropagation()}>
                      <span className={styles.confirmText}>
                        Delete {template.name}? This cannot be undone.
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
                          onClick={() => handleDeleteConfirm(template.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
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
        )}
      </div>
    </div>
  );
}
