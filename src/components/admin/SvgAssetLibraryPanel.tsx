"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SvgAsset } from "@/types/admin";
import { svgToDataUrl } from "@/utils/svg";
import {
  analyzeSvgForLaser,
  makeSvgLaserReady,
  makeSvgSmartMonochrome,
  type LaserAnalysis,
} from "@/utils/svgLaserUtils";
import { VECTOR_UPLOAD_ACCEPT, VECTOR_UPLOAD_LABEL } from "@/lib/vectorImport";
import { SvgRepairPanel } from "./SvgRepairPanel";
import styles from "./SvgAssetLibraryPanel.module.css";

interface Props {
  assets: SvgAsset[];
  selectedAssetId: string | null;
  placedAssetIds?: string[];
  onSelectAsset: (id: string) => void;
  onUpload: (files: FileList) => void | Promise<void>;
  uploadError: string | null;
  onPlaceSelectedAsset: () => void;
  onRemoveAsset: (id: string) => void;
  onUpdateAssetContent?: (id: string, newSvgContent: string) => void;
  onClearAll: () => void;
  children?: React.ReactNode;
}

export function SvgAssetLibraryPanel({
  assets,
  selectedAssetId,
  placedAssetIds = [],
  onSelectAsset,
  onUpload,
  uploadError,
  onPlaceSelectedAsset,
  onRemoveAsset,
  onUpdateAssetContent,
  onClearAll,
  children,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const directoryInputRef = useRef<HTMLInputElement | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [analysisCache, setAnalysisCache] = useState<Map<string, LaserAnalysis>>(new Map());
  const activeAsset = assets.find((asset) => asset.id === selectedAssetId) ?? null;
  const activeAssetAnalysis = activeAsset ? analysisCache.get(activeAsset.id) ?? null : null;
  const activeAssetPreviewUrl = activeAsset ? svgToDataUrl(activeAsset.content) : null;
  const activeAssetPlaced = activeAsset ? placedAssetIds.includes(activeAsset.id) : false;
  const missingAnalyses = useMemo(
    () => assets.filter((asset) => !analysisCache.has(asset.id)),
    [analysisCache, assets],
  );

  useEffect(() => {
    if (missingAnalyses.length === 0) return undefined;

    const timeouts = missingAnalyses.map((asset) =>
      window.setTimeout(() => {
        const result = analyzeSvgForLaser(asset.content);
        setAnalysisCache((prev) => {
          if (prev.has(asset.id)) return prev;
          return new Map(prev).set(asset.id, result);
        });
      }, 0),
    );

    return () => {
      timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [missingAnalyses]);

  useEffect(() => {
    const ids = new Set(assets.map((asset) => asset.id));
    const frameId = window.requestAnimationFrame(() => {
      setAnalysisCache((prev) => {
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
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [assets]);

  const handleMakeLaserReady = useCallback((asset: SvgAsset) => {
    const ready = makeSvgLaserReady(asset.content);
    onUpdateAssetContent?.(asset.id, ready);
    setTimeout(() => {
      setAnalysisCache((prev) => new Map(prev).set(asset.id, analyzeSvgForLaser(ready)));
    }, 50);
  }, [onUpdateAssetContent]);

  const handleMakeSmartMonochrome = useCallback((asset: SvgAsset) => {
    const monochrome = makeSvgSmartMonochrome(asset.content);
    onUpdateAssetContent?.(asset.id, monochrome);
    setTimeout(() => {
      setAnalysisCache((prev) => new Map(prev).set(asset.id, analyzeSvgForLaser(monochrome)));
    }, 50);
  }, [onUpdateAssetContent]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      onUpload(event.target.files);
      event.target.value = "";
    }
  };

  const bindDirectoryInput = useCallback((node: HTMLInputElement | null) => {
    directoryInputRef.current = node;
    if (!node) return;
    node.setAttribute("webkitdirectory", "");
    node.setAttribute("directory", "");
    node.multiple = true;
  }, []);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerTitleWrap}>
          <span className={styles.title}>Vector Library</span>
          <span className={styles.assetCount}>{assets.length} loaded</span>
        </div>
        {assets.length > 0 && (
          clearConfirm ? (
            <>
              <button className={styles.confirmYes} onClick={() => { onClearAll(); setClearConfirm(false); }}>
                Yes, clear
              </button>
              <button className={styles.confirmNo} onClick={() => setClearConfirm(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button
              className={styles.clearBtn}
              onClick={() => setClearConfirm(true)}
              title="Remove all assets and clear workspace"
            >
              Clear All
            </button>
          )
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={VECTOR_UPLOAD_ACCEPT}
        multiple
        className={styles.fileInput}
        onChange={handleFileChange}
        aria-label={`Upload ${VECTOR_UPLOAD_LABEL} files`}
      />
      <input
        ref={bindDirectoryInput}
        type="file"
        accept={VECTOR_UPLOAD_ACCEPT}
        className={styles.fileInput}
        onChange={handleFileChange}
        aria-label={`Import ${VECTOR_UPLOAD_LABEL} folder`}
      />

      <div className={styles.uploadActions}>
        <button className={styles.uploadBtn} onClick={() => fileInputRef.current?.click()}>
          <span className={styles.uploadIcon}>+</span>
          Upload Vector
        </button>
        <button className={styles.folderBtn} onClick={() => directoryInputRef.current?.click()}>
          Import Folder
        </button>
      </div>

      {uploadError && <div className={styles.uploadError}>{uploadError}</div>}

      <div className={styles.placeBar}>
        <button className={styles.placeBtn} onClick={onPlaceSelectedAsset} disabled={!activeAsset}>
          Place on Bed
        </button>
        <div className={styles.placeStatus}>
          <span className={`${styles.statusChip} ${activeAssetPlaced ? styles.statusChipSuccess : styles.statusChipInfo}`}>
            {activeAssetPlaced ? "Imported and on bed" : activeAsset ? "Imported to library" : "No asset selected"}
          </span>
          <span className={styles.placeHint}>
            {activeAsset
              ? activeAssetPlaced
                ? "This artwork is already placed in the workspace."
                : "Preview it below, then click Place on Bed."
              : "Select an asset to confirm the import and place it."}
          </span>
        </div>
      </div>

      {activeAsset && activeAssetPreviewUrl && (
        <div className={styles.activePreview}>
          <div className={styles.activePreviewHeader}>
            <div className={styles.activePreviewMeta}>
              <span className={styles.activePreviewLabel}>Selected Artwork</span>
              <span className={styles.activePreviewName}>{activeAsset.name.replace(/\.svg$/i, "")}</span>
            </div>
            <div className={styles.activePreviewBadges}>
              <span className={`${styles.previewBadge} ${styles.previewBadgeLibrary}`}>In library</span>
              {activeAssetPlaced && (
                <span className={`${styles.previewBadge} ${styles.previewBadgePlaced}`}>On bed</span>
              )}
              {activeAssetAnalysis?.isLaserReady && (
                <span className={`${styles.previewBadge} ${styles.previewBadgeReady}`}>Laser ready</span>
              )}
            </div>
          </div>
          <div className={styles.activePreviewFrame}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={activeAssetPreviewUrl} alt={activeAsset.name} className={styles.activePreviewImage} />
          </div>
        </div>
      )}

      {children}

      <div className={styles.assetList}>
        {assets.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>[]</div>
            <p>No vector artwork loaded.</p>
            <p className={styles.emptyHint}>Upload {VECTOR_UPLOAD_LABEL} files to get started.</p>
          </div>
        ) : (
          assets.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              isSelected={asset.id === selectedAssetId}
              isPlaced={placedAssetIds.includes(asset.id)}
              analysis={analysisCache.get(asset.id) ?? null}
              onSelect={() => onSelectAsset(asset.id)}
              onRemove={() => onRemoveAsset(asset.id)}
              onMakeLaserReady={onUpdateAssetContent ? () => handleMakeLaserReady(asset) : undefined}
              onMakeSmartMonochrome={onUpdateAssetContent ? () => handleMakeSmartMonochrome(asset) : undefined}
              onUpdateAssetContent={onUpdateAssetContent}
            />
          ))
        )}
      </div>
    </div>
  );
}

function AssetCard({
  asset,
  isSelected,
  isPlaced,
  analysis,
  onSelect,
  onRemove,
  onMakeLaserReady,
  onMakeSmartMonochrome,
  onUpdateAssetContent,
}: {
  asset: SvgAsset;
  isSelected: boolean;
  isPlaced: boolean;
  analysis: LaserAnalysis | null;
  onSelect: () => void;
  onRemove: () => void;
  onMakeLaserReady?: () => void;
  onMakeSmartMonochrome?: () => void;
  onUpdateAssetContent?: (id: string, newContent: string) => void;
}) {
  const dataUrl = svgToDataUrl(asset.content);
  const displayName = asset.name.replace(/\.svg$/i, "");

  return (
    <div
      className={`${styles.assetCard} ${isSelected ? styles.selected : ""}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => event.key === "Enter" && onSelect()}
      aria-pressed={isSelected}
      title={asset.name}
    >
      <div className={styles.thumbnail}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUrl} alt={asset.name} className={styles.thumbImg} />
      </div>

      <div className={styles.assetMeta}>
        <span className={styles.assetName}>{displayName}</span>
        <div className={styles.assetMetaBadges}>
          {isPlaced && <span className={`${styles.previewBadge} ${styles.previewBadgePlaced}`}>On bed</span>}
          {analysis ? (
            analysis.isLaserReady ? (
              <span className={`${styles.previewBadge} ${styles.previewBadgeReady}`}>Laser ready</span>
            ) : (
              <>
                {analysis.hasFills && (
                  <span className={`${styles.previewBadge} ${styles.previewBadgeWarn}`}>Fills</span>
                )}
                {analysis.hasText && (
                  <span className={`${styles.previewBadge} ${styles.previewBadgeText}`}>Text</span>
                )}
                {analysis.pathCount === 0 && (
                  <span className={`${styles.previewBadge} ${styles.previewBadgeError}`}>No paths</span>
                )}
              </>
            )
          ) : (
            <span className={styles.analysisPending}>Analyzing...</span>
          )}
          {analysis && (
            <span className={styles.analysisStats}>
              {analysis.pathCount}p · {analysis.totalPathLengthMm.toFixed(0)}mm
            </span>
          )}
        </div>

        {isSelected && onMakeSmartMonochrome && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              onMakeSmartMonochrome();
            }}
            title="Convert a colored SVG into a smart black-and-white version"
            className={styles.smartMonochromeBtn}
          >
            Smart B/W
          </button>
        )}

        {isSelected && analysis && !analysis.isLaserReady && onMakeLaserReady && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              onMakeLaserReady();
            }}
            title="Strip fills and set stroke-only for laser output"
            className={styles.laserReadyBtn}
          >
            Make Laser Ready
          </button>
        )}

        {isSelected && onUpdateAssetContent && (
          <div onClick={(event) => event.stopPropagation()}>
            <div className={styles.repairLabel}>Path Repair</div>
            <SvgRepairPanel
              svgContent={asset.content}
              onRepaired={(fixed) => onUpdateAssetContent(asset.id, fixed)}
            />
          </div>
        )}
      </div>

      {isSelected && <span className={styles.activeBadge}>selected</span>}

      <button
        className={styles.removeBtn}
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        title="Remove asset"
        aria-label={`Remove ${asset.name}`}
      >
        ×
      </button>
    </div>
  );
}
