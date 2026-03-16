"use client";

/**
 * SvgAssetLibraryPanel
 *
 * Left sidebar that hosts the SVG asset library:
 *   - Upload button (file input, multiple .svg files)
 *   - List of uploaded SVGs with a thumbnail preview
 *   - Active-asset highlight
 *   - Per-asset remove action
 *   - Clear-all action
 *   - Empty state when no assets are loaded
 */

import React, { useRef } from "react";
import { SvgAsset } from "@/types/admin";
import { svgToDataUrl } from "@/utils/svg";
import styles from "./SvgAssetLibraryPanel.module.css";

interface Props {
  assets: SvgAsset[];
  selectedAssetId: string | null;
  onSelectAsset: (id: string) => void;
  onUpload: (files: FileList) => void;
  onRemoveAsset: (id: string) => void;
  onClearAll: () => void;
}

export function SvgAssetLibraryPanel({
  assets,
  selectedAssetId,
  onSelectAsset,
  onUpload,
  onRemoveAsset,
  onClearAll,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const triggerUpload = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUpload(e.target.files);
      // Reset input so the same file can be re-uploaded if removed
      e.target.value = "";
    }
  };

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.title}>SVG Assets</span>
        {assets.length > 0 && (
          <button
            className={styles.clearBtn}
            onClick={onClearAll}
            title="Remove all assets and clear workspace"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".svg,image/svg+xml"
        multiple
        className={styles.fileInput}
        onChange={handleFileChange}
        aria-label="Upload SVG files"
      />

      {/* Upload button */}
      <button className={styles.uploadBtn} onClick={triggerUpload}>
        <span className={styles.uploadIcon}>↑</span>
        Upload SVG
      </button>

      {/* Asset list */}
      <div className={styles.assetList}>
        {assets.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>⬡</div>
            <p>No SVGs loaded.</p>
            <p className={styles.emptyHint}>
              Upload one or more SVG files to get started.
            </p>
          </div>
        ) : (
          assets.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              isSelected={asset.id === selectedAssetId}
              onSelect={() => onSelectAsset(asset.id)}
              onRemove={() => onRemoveAsset(asset.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Asset card sub-component
// ---------------------------------------------------------------------------

interface AssetCardProps {
  asset: SvgAsset;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

function AssetCard({ asset, isSelected, onSelect, onRemove }: AssetCardProps) {
  const dataUrl = svgToDataUrl(asset.content);
  // Display just the base name without extension
  const displayName = asset.name.replace(/\.svg$/i, "");

  return (
    <div
      className={`${styles.assetCard} ${isSelected ? styles.selected : ""}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      aria-pressed={isSelected}
      title={asset.name}
    >
      {/* Thumbnail */}
      <div className={styles.thumbnail}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUrl} alt={asset.name} className={styles.thumbImg} />
      </div>

      {/* Metadata */}
      <div className={styles.assetMeta}>
        <span className={styles.assetName}>{displayName}</span>
        {(asset.naturalWidth || asset.naturalHeight) && (
          <span className={styles.assetSize}>
            {asset.naturalWidth ?? "?"}×{asset.naturalHeight ?? "?"}
          </span>
        )}
      </div>

      {/* Active badge */}
      {isSelected && <span className={styles.activeBadge}>active</span>}

      {/* Remove button */}
      <button
        className={styles.removeBtn}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        title="Remove asset"
        aria-label={`Remove ${asset.name}`}
      >
        ✕
      </button>
    </div>
  );
}
