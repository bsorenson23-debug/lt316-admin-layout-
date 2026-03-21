"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { SvgAsset } from "@/types/admin";
import { svgToDataUrl } from "@/utils/svg";
import { analyzeSvgForLaser, makeSvgLaserReady, type LaserAnalysis } from "@/utils/svgLaserUtils";
import { SvgRepairPanel } from "./SvgRepairPanel";
import styles from "./SvgAssetLibraryPanel.module.css";

interface Props {
  assets: SvgAsset[];
  selectedAssetId: string | null;
  onSelectAsset: (id: string) => void;
  onUpload: (files: FileList) => void | Promise<void>;
  uploadError: string | null;
  onPlaceSelectedAsset: () => void;
  onRemoveAsset: (id: string) => void;
  /** Called with a modified SVG string to replace the asset's content */
  onUpdateAssetContent?: (id: string, newSvgContent: string) => void;
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
  onUpdateAssetContent,
  onClearAll,
  children,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [analysisCache, setAnalysisCache] = useState<Map<string, LaserAnalysis>>(new Map());
  const activeAsset = assets.find((a) => a.id === selectedAssetId) ?? null;

  // Analyze each asset on mount / when assets change
  useEffect(() => {
    assets.forEach(asset => {
      if (analysisCache.has(asset.id)) return;
      // Run analysis asynchronously to avoid blocking render
      setTimeout(() => {
        const result = analyzeSvgForLaser(asset.content);
        setAnalysisCache(prev => new Map(prev).set(asset.id, result));
      }, 0);
    });
    // Prune removed assets
    setAnalysisCache(prev => {
      const ids = new Set(assets.map(a => a.id));
      const next = new Map(prev);
      let changed = false;
      for (const k of next.keys()) { if (!ids.has(k)) { next.delete(k); changed = true; } }
      return changed ? next : prev;
    });
  }, [assets]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMakeLaserReady = useCallback((asset: SvgAsset) => {
    const ready = makeSvgLaserReady(asset.content);
    onUpdateAssetContent?.(asset.id, ready);
    // Re-analyze
    setTimeout(() => {
      setAnalysisCache(prev => new Map(prev).set(asset.id, analyzeSvgForLaser(ready)));
    }, 50);
  }, [onUpdateAssetContent]);

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
              analysis={analysisCache.get(asset.id) ?? null}
              onSelect={() => onSelectAsset(asset.id)}
              onRemove={() => onRemoveAsset(asset.id)}
              onMakeLaserReady={onUpdateAssetContent ? () => handleMakeLaserReady(asset) : undefined}
              onUpdateAssetContent={onUpdateAssetContent}
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
  analysis,
  onSelect,
  onRemove,
  onMakeLaserReady,
  onUpdateAssetContent,
}: {
  asset: SvgAsset;
  isSelected: boolean;
  analysis: LaserAnalysis | null;
  onSelect: () => void;
  onRemove: () => void;
  onMakeLaserReady?: () => void;
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
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
          {analysis ? (
            analysis.isLaserReady ? (
              <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#0a3a1a", color: "#4dbb6a", border: "1px solid #1a5a2a", fontFamily: "monospace" }}>
                ✓ Laser Ready
              </span>
            ) : (
              <>
                {analysis.hasFills && (
                  <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#3a1a00", color: "#ff8833", border: "1px solid #5a3010", fontFamily: "monospace" }}>
                    ⚠ Fills
                  </span>
                )}
                {analysis.hasText && (
                  <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#2a1a3a", color: "#cc88ff", border: "1px solid #4a2a5a", fontFamily: "monospace" }}>
                    ⚠ Text
                  </span>
                )}
                {analysis.pathCount === 0 && (
                  <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#2a1a1a", color: "#ff6666", border: "1px solid #5a2a2a", fontFamily: "monospace" }}>
                    ⚠ No paths
                  </span>
                )}
              </>
            )
          ) : (
            <span style={{ fontSize: 9, color: "#444", fontFamily: "monospace" }}>analyzing…</span>
          )}
          {analysis && (
            <span style={{ fontSize: 9, color: "#555", fontFamily: "monospace" }}>
              {analysis.pathCount}p · {analysis.totalPathLengthMm.toFixed(0)}mm
            </span>
          )}
        </div>
      </div>

      {/* Make Laser Ready button — only when needed and handler provided */}
      {isSelected && analysis && !analysis.isLaserReady && onMakeLaserReady && (
        <button
          onClick={(e) => { e.stopPropagation(); onMakeLaserReady(); }}
          title="Strip fills and set stroke-only for laser output"
          style={{
            display: "block", width: "100%", marginTop: 6,
            padding: "4px 8px", fontSize: 10, fontFamily: "monospace",
            background: "#0a2a1a", border: "1px solid #1a5a2a", color: "#4dbb6a",
            borderRadius: 4, cursor: "pointer", textAlign: "left",
          }}
        >
          ⚡ Make Laser Ready
        </button>
      )}

      {/* ── Path repair panel — only shown when asset is selected ── */}
      {isSelected && onUpdateAssetContent && (
        <div onClick={e => e.stopPropagation()}>
          <div style={{ marginTop: 8, marginBottom: 2, fontSize: 9, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "#555" }}>
            Path Repair
          </div>
          <SvgRepairPanel
            svgContent={asset.content}
            onRepaired={(fixed) => onUpdateAssetContent(asset.id, fixed)}
          />
        </div>
      )}

      {isSelected && <span className={styles.activeBadge}>active</span>}

      <button
        className={styles.removeBtn}
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        title="Remove asset"
        aria-label={`Remove ${asset.name}`}
      >
        ×
      </button>
    </div>
  );
}
