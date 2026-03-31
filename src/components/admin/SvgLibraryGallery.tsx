"use client";

import React from "react";
import type { SvgAsset } from "@/types/admin";
import { VECTOR_UPLOAD_ACCEPT, VECTOR_UPLOAD_LABEL } from "@/lib/vectorImport";
import { svgToDataUrl } from "@/utils/svg";
import { analyzeSvgForLaser, type LaserAnalysis } from "@/utils/svgLaserUtils";
import styles from "./SvgLibraryGallery.module.css";

type LibraryFilter = "all" | "placed" | "ready" | "attention" | "review";

const FILTERS: { value: LibraryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "placed", label: "On Bed" },
  { value: "ready", label: "Ready" },
  { value: "attention", label: "Needs Repair" },
  { value: "review", label: "Review Queue" },
];

function formatItemTypeLabel(value: string | null | undefined) {
  if (!value || value === "unknown") return "Unknown item";
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function needsReview(asset: SvgAsset) {
  const reviewState = asset.libraryMeta?.classification.reviewState;
  return reviewState === "pending-analysis" || reviewState === "pending-review";
}

interface Props {
  assets: SvgAsset[];
  selectedId: string | null;
  placedAssetIds: string[];
  uploadError: string | null;
  onSelect: (id: string) => void;
  onUpload: (files: FileList) => void | Promise<void>;
  onRename: (id: string, name: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onClearAll: () => void | Promise<void>;
  onPlaceSelected: () => void;
}

export function SvgLibraryGallery({
  assets,
  selectedId,
  placedAssetIds,
  uploadError,
  onSelect,
  onUpload,
  onRename,
  onDelete,
  onClearAll,
  onPlaceSelected,
}: Props) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const directoryInputRef = React.useRef<HTMLInputElement | null>(null);
  const [filter, setFilter] = React.useState<LibraryFilter>("all");
  const [query, setQuery] = React.useState("");
  const [manageMode, setManageMode] = React.useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draftName, setDraftName] = React.useState("");
  const [clearConfirm, setClearConfirm] = React.useState(false);
  const [analysisCache, setAnalysisCache] = React.useState<Map<string, LaserAnalysis>>(new Map());
  const reviewCount = React.useMemo(
    () => assets.filter((asset) => needsReview(asset)).length,
    [assets],
  );

  const bindDirectoryInput = React.useCallback((node: HTMLInputElement | null) => {
    directoryInputRef.current = node;
    if (!node) return;
    node.setAttribute("webkitdirectory", "");
    node.setAttribute("directory", "");
    node.multiple = true;
  }, []);

  React.useEffect(() => {
    assets.forEach((asset) => {
      if (analysisCache.has(asset.id)) return;
      setTimeout(() => {
        const result = analyzeSvgForLaser(asset.content);
        setAnalysisCache((prev) => new Map(prev).set(asset.id, result));
      }, 0);
    });

    setAnalysisCache((prev) => {
      const ids = new Set(assets.map((asset) => asset.id));
      const next = new Map(prev);
      let changed = false;
      for (const key of next.keys()) {
        if (!ids.has(key)) {
          next.delete(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [assets, analysisCache]);

  const filteredAssets = React.useMemo(() => {
    const loweredQuery = query.trim().toLowerCase();
    return assets.filter((asset) => {
      const analysis = analysisCache.get(asset.id) ?? null;
      const metadata = asset.libraryMeta;
      const searchHaystack = [
        asset.name,
        metadata?.classification.businessName,
        metadata?.classification.itemType,
        metadata?.sourceFolderLabel,
        metadata?.sourceRelativePath,
        ...(metadata?.classification.detectedText ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesQuery =
        loweredQuery.length === 0 ||
        searchHaystack.includes(loweredQuery);

      if (!matchesQuery) return false;

      switch (filter) {
        case "placed":
          return placedAssetIds.includes(asset.id);
        case "ready":
          return analysis?.isLaserReady ?? metadata?.laserReady ?? false;
        case "attention":
          return analysis ? !analysis.isLaserReady : !(metadata?.laserReady ?? false);
        case "review":
          return needsReview(asset);
        default:
          return true;
      }
    });
  }, [assets, query, filter, analysisCache, placedAssetIds]);

  const selectedAsset = assets.find((asset) => asset.id === selectedId) ?? null;

  const beginRename = (asset: SvgAsset) => {
    setEditingId(asset.id);
    setDraftName(asset.name.replace(/\.svg$/i, ""));
    setConfirmDeleteId(null);
  };

  const submitRename = async (assetId: string) => {
    const nextName = draftName.trim();
    if (!nextName) return;
    await onRename(assetId, nextName);
    setEditingId(null);
  };

  return (
    <div className={styles.gallery}>
      <div className={styles.headerRow}>
        <div className={styles.filterRow}>
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`${styles.filterPill} ${filter === item.value ? styles.filterPillActive : ""}`}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`${styles.managePill} ${manageMode ? styles.managePillActive : ""}`}
          onClick={() => {
            setManageMode((prev) => !prev);
            setConfirmDeleteId(null);
            setEditingId(null);
          }}
        >
          {manageMode ? "Done" : "Manage"}
        </button>
      </div>

      <div className={styles.searchRow}>
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by file, business, folder, or item type"
          className={styles.searchInput}
        />
        <span className={styles.countLabel}>
          {filteredAssets.length} visible{reviewCount > 0 ? ` · ${reviewCount} review` : ""}
        </span>
      </div>

      {manageMode && (
        <div className={styles.manageBanner}>
          Rename, delete, or clear library entries here. Placed artwork keeps working until you remove it from the bed.
        </div>
      )}

      {!manageMode && reviewCount > 0 && filter !== "review" && (
        <div className={styles.reviewBanner}>
          <span>{reviewCount} imported asset{reviewCount === 1 ? "" : "s"} need category review.</span>
          <button
            type="button"
            className={styles.reviewBannerBtn}
            onClick={() => setFilter("review")}
          >
            Open review queue
          </button>
        </div>
      )}

      {uploadError && <div className={styles.errorBanner}>{uploadError}</div>}

      <div className={styles.grid}>
        {filteredAssets.map((asset) => {
          const isSelected = asset.id === selectedId;
          const isPlaced = placedAssetIds.includes(asset.id);
          const isEditing = editingId === asset.id;
          const isConfirmingDelete = confirmDeleteId === asset.id;
          const analysis = analysisCache.get(asset.id) ?? null;
          const showActions = manageMode ? styles.actionRowVisible : "";
          const businessName = asset.libraryMeta?.classification.businessName;
          const itemTypeLabel = formatItemTypeLabel(asset.libraryMeta?.classification.itemType);
          const sourceFolderLabel = asset.libraryMeta?.sourceFolderLabel;
          const confidence = asset.libraryMeta?.classification.confidence;
          const reviewState = asset.libraryMeta?.classification.reviewState;
          const isLaserReady = analysis?.isLaserReady ?? asset.libraryMeta?.laserReady ?? false;

          return (
            <div
              key={asset.id}
              className={`${styles.card} ${isSelected ? styles.cardSelected : ""} ${isConfirmingDelete ? styles.cardConfirming : ""}`}
              onClick={() => !isEditing && !isConfirmingDelete && onSelect(asset.id)}
            >
              <div className={styles.thumbWrap}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={svgToDataUrl(asset.content)}
                  alt={asset.name}
                  className={styles.thumb}
                />
                {isSelected && !manageMode && (
                  <span className={styles.checkOverlay}>✓</span>
                )}
                {isPlaced && (
                  <span className={styles.thumbPlaced}>On bed</span>
                )}
              </div>

              {!isEditing && !isConfirmingDelete && (
                <div className={`${styles.actionRow} ${showActions}`}>
                  <button
                    type="button"
                    className={styles.editBtn}
                    onClick={(event) => {
                      event.stopPropagation();
                      beginRename(asset);
                    }}
                    aria-label={`Rename ${asset.name}`}
                    title="Rename"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className={styles.deleteBtn}
                    onClick={(event) => {
                      event.stopPropagation();
                      setConfirmDeleteId(asset.id);
                      setEditingId(null);
                    }}
                    aria-label={`Delete ${asset.name}`}
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              )}

              {isConfirmingDelete && (
                <div className={styles.confirmOverlay} onClick={(event) => event.stopPropagation()}>
                  <span className={styles.confirmText}>
                    Delete {asset.name.replace(/\.svg$/i, "")}?
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
                      onClick={async () => {
                        await onDelete(asset.id);
                        setConfirmDeleteId(null);
                        if (selectedId === asset.id) {
                          setEditingId(null);
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}

              <div className={styles.cardBody}>
                {isEditing ? (
                  <div className={styles.renameWrap} onClick={(event) => event.stopPropagation()}>
                    <input
                      className={styles.renameInput}
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      autoFocus
                    />
                    <div className={styles.renameActions}>
                      <button
                        type="button"
                        className={styles.renameCancelBtn}
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={styles.renameSaveBtn}
                        onClick={() => void submitRename(asset.id)}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className={styles.cardName}>{asset.name.replace(/\.svg$/i, "")}</span>
                    <span className={styles.cardMeta}>
                      {sourceFolderLabel
                        ? sourceFolderLabel
                        : `Added ${new Date(asset.uploadedAt).toLocaleDateString()}`}
                    </span>
                    {(businessName || itemTypeLabel) && (
                      <div className={styles.libraryChipRow}>
                        {businessName && (
                          <span className={styles.businessChip}>{businessName}</span>
                        )}
                        {itemTypeLabel && (
                          <span className={styles.itemChip}>{itemTypeLabel}</span>
                        )}
                      </div>
                    )}
                    <div className={styles.badgeRow}>
                      {isLaserReady ? (
                        <span className={styles.readyBadge}>Laser ready</span>
                      ) : (
                        <span className={styles.attentionBadge}>Needs review</span>
                      )}
                      {reviewState && reviewState !== "approved" && (
                        <span className={styles.reviewBadge}>{reviewState.replace(/-/g, " ")}</span>
                      )}
                      {isPlaced && <span className={styles.placedBadge}>Placed</span>}
                      {typeof confidence === "number" && (
                        <span className={styles.statsBadge}>{Math.round(confidence * 100)}%</span>
                      )}
                      {analysis && (
                        <span className={styles.statsBadge}>
                          {analysis.pathCount}p
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {filteredAssets.length === 0 && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>[]</div>
            <p>No vector files match this view.</p>
            <p className={styles.emptyHint}>Upload a file or clear the search/filter.</p>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={VECTOR_UPLOAD_ACCEPT}
        multiple
        className={styles.fileInput}
        onChange={(event) => {
          if (event.target.files?.length) {
            void onUpload(event.target.files);
            event.target.value = "";
          }
        }}
      />
      <input
        ref={bindDirectoryInput}
        type="file"
        accept={VECTOR_UPLOAD_ACCEPT}
        className={styles.fileInput}
        onChange={(event) => {
          if (event.target.files?.length) {
            void onUpload(event.target.files);
            event.target.value = "";
          }
        }}
      />

      <div className={styles.footer}>
        <div className={styles.footerSummary}>
          {selectedAsset ? (
            <>
              <span className={styles.footerTitle}>Selected</span>
              <span className={styles.footerName}>{selectedAsset.name.replace(/\.svg$/i, "")}</span>
            </>
          ) : (
            <span className={styles.footerTitle}>Select imported artwork to place it on the bed.</span>
          )}
        </div>

        <div className={styles.footerActions}>
          {clearConfirm ? (
            <>
              <button
                type="button"
                className={styles.clearCancelBtn}
                onClick={() => setClearConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.clearConfirmBtn}
                onClick={async () => {
                  await onClearAll();
                  setClearConfirm(false);
                }}
              >
                Confirm Clear
              </button>
            </>
          ) : (
            <>
              {manageMode && assets.length > 0 && (
                <button
                  type="button"
                  className={styles.clearLibraryBtn}
                  onClick={() => setClearConfirm(true)}
                >
                  Clear Library
                </button>
              )}
              <button
                type="button"
                className={styles.uploadLibraryBtn}
                onClick={() => fileInputRef.current?.click()}
              >
                Upload {VECTOR_UPLOAD_LABEL}
              </button>
              <button
                type="button"
                className={styles.folderLibraryBtn}
                onClick={() => directoryInputRef.current?.click()}
              >
                Import Folder
              </button>
              <button
                type="button"
                className={styles.placeLibraryBtn}
                disabled={!selectedAsset}
                onClick={onPlaceSelected}
              >
                Place on Bed
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
