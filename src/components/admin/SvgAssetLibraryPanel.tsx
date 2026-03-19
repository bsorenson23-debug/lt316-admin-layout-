"use client";

import React, { useRef } from "react";
import { SvgAsset } from "@/types/admin";
import { svgToDataUrl } from "@/utils/svg";
import styles from "./SvgAssetLibraryPanel.module.css";

interface Props {
  assets: SvgAsset[];
  selectedAssetId: string | null;
  onSelectAsset: (id: string) => void;
  onUpload: (files: FileList) => void | Promise<void>;
  uploadError: string | null;
  onPlaceSelectedAsset: () => void;
  onRemoveAsset: (id: string) => void;
  onClearAll: () => void;
  children?: React.ReactNode;
}

export function SvgAssetLibraryPanel({
  assets,
  selectedAssetId,
  onSelectAsset,
  onUpload,
  uploadError,
  onPlaceSelectedAsset,
  onRemoveAsset,
  onClearAll,
  children,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [clearConfirm, setClearConfirm] = React.useState(false);
  const activeAsset = assets.find((a) => a.id === selectedAssetId) ?? null;

  const triggerUpload = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUpload(e.target.files);
      e.target.value = "";
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>SVG Assets</span>
        {assets.length > 0 && (
          clearConfirm ? (
            <>
              <button className={styles.confirmYes} onClick={() => { onClearAll(); setClearConfirm(false); }}>Yes, clear</button>
              <button className={styles.confirmNo} onClick={() => setClearConfirm(false)}>Cancel</button>
            </>
          ) : (
            <button className={styles.clearBtn} onClick={() => setClearConfirm(true)} title="Remove all assets and clear workspace">
              Clear All
            </button>
          )
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".svg,image/svg+xml"
        multiple
        className={styles.fileInput}
        onChange={handleFileChange}
        aria-label="Upload SVG files"
      />

      <button className={styles.uploadBtn} onClick={triggerUpload}>
        <span className={styles.uploadIcon}>+</span>
        Upload SVG
      </button>

      {uploadError && <div className={styles.uploadError}>{uploadError}</div>}

      <div className={styles.placeBar}>
        <button className={styles.placeBtn} onClick={onPlaceSelectedAsset} disabled={!activeAsset}>
          Place on Bed
        </button>
        <span className={styles.placeHint}>
          {activeAsset ? activeAsset.name : "Select an asset to place"}
        </span>
      </div>

      {children}

      <div className={styles.assetList}>
        {assets.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>[]</div>
            <p>No SVGs loaded.</p>
            <p className={styles.emptyHint}>Upload one or more SVG files to get started.</p>
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

function AssetCard({
  asset,
  isSelected,
  onSelect,
  onRemove,
}: {
  asset: SvgAsset;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const dataUrl = svgToDataUrl(asset.content);
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
      <div className={styles.thumbnail}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUrl} alt={asset.name} className={styles.thumbImg} />
      </div>

      <div className={styles.assetMeta}>
        <span className={styles.assetName}>{displayName}</span>
        {(asset.naturalWidth || asset.naturalHeight) && (
          <span className={styles.assetSize}>
            {asset.naturalWidth ?? "?"}x{asset.naturalHeight ?? "?"}
          </span>
        )}
      </div>

      {isSelected && <span className={styles.activeBadge}>active</span>}

      <button
        className={styles.removeBtn}
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        title="Remove asset"
        aria-label={`Remove ${asset.name}`}
      >
        x
      </button>
    </div>
  );
}
