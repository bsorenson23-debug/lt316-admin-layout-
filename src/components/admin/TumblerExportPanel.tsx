"use client";

import React from "react";
import type { BedConfig, PlacedItem } from "@/types/admin";
import type {
  RotaryPlacementPreset,
  TopAnchorMode,
  TumblerPlacementProfile,
} from "@/types/export";
import { DEFAULT_ROTARY_PLACEMENT_PRESETS } from "@/data/rotaryPlacementPresets";
import { getRotaryPresets } from "@/utils/adminCalibrationState";
import {
  buildLightBurnExportArtifacts,
  getLightBurnExportOrigin,
} from "@/utils/tumblerExportPlacement";
import { buildLightBurnLbrn, downloadLbrnFile } from "@/utils/lightBurnLbrnExport";
import { isTaperWarpApplicable } from "@/utils/taperWarp";
import type { LbrnMaterialSettings } from "@/utils/lightBurnLbrnExport";
import styles from "./TumblerExportPanel.module.css";

export interface FramePreview {
  originXmm: number;
  originYmm: number;
  widthMm: number;
  heightMm: number;
}

interface Props {
  bedConfig: BedConfig;
  placedItems: PlacedItem[];
  onFramePreviewChange?: (preview: FramePreview | null) => void;
  materialSettings?: LbrnMaterialSettings | null;
}

function fmt(n: number) { return n.toFixed(2); }

function parseNullableNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferTopSafeOffsetMm(bedConfig: BedConfig): number | undefined {
  const overall = bedConfig.tumblerOverallHeightMm;
  const usable  = bedConfig.tumblerUsableHeightMm;
  if (!Number.isFinite(overall) || !Number.isFinite(usable)) return undefined;
  const delta = ((overall ?? 0) - (usable ?? 0)) / 2;
  return delta > 0 ? Number(delta.toFixed(2)) : 0;
}

function buildPlacementProfile(
  bedConfig: BedConfig,
  anchorMode: TopAnchorMode,
  manualTopOffsetMm: number | null,
): TumblerPlacementProfile {
  return {
    overallHeightMm: bedConfig.tumblerOverallHeightMm ?? bedConfig.height,
    usableHeightMm:  bedConfig.tumblerUsableHeightMm  ?? bedConfig.height,
    topToSafeZoneStartMm: manualTopOffsetMm ?? inferTopSafeOffsetMm(bedConfig) ?? undefined,
    bottomMarginMm: undefined,
    topAnchorMode: anchorMode,
  };
}

function downloadJson(payload: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(href);
}

// ---------------------------------------------------------------------------

export function TumblerExportPanel({ bedConfig, placedItems, onFramePreviewChange, materialSettings }: Props) {
  const [rotaryEnabled,       setRotaryEnabled]       = React.useState(false);
  const [availablePresets,    setAvailablePresets]    = React.useState<RotaryPlacementPreset[]>(DEFAULT_ROTARY_PLACEMENT_PRESETS);
  const [selectedPresetId,    setSelectedPresetId]    = React.useState("");
  const [anchorMode,          setAnchorMode]          = React.useState<TopAnchorMode>("physical-top");
  const [topOffsetDraft,      setTopOffsetDraft]      = React.useState("");
  const [showNextSteps,       setShowNextSteps]       = React.useState(false);
  const [taperWarpEnabled,    setTaperWarpEnabled]    = React.useState(true);

  React.useEffect(() => { setAvailablePresets(getRotaryPresets()); }, []);

  const isTumblerMode      = bedConfig.workspaceMode === "tumbler-wrap";
  const taperApplicable    = isTaperWarpApplicable(bedConfig);
  const selectedPreset = selectedPresetId
    ? availablePresets.find((p) => p.id === selectedPresetId) ?? null
    : null;

  const manualTopOffsetMm  = parseNullableNumber(topOffsetDraft);
  const placementProfile   = buildPlacementProfile(bedConfig, anchorMode, manualTopOffsetMm);

  const previewOrigin = isTumblerMode
    ? getLightBurnExportOrigin({
        templateWidthMm: bedConfig.width,
        preset: selectedPreset,
        bedWidthMm: bedConfig.flatWidth,
        anchorMode,
        placementProfile,
      }) ?? { xMm: 0, yMm: 0 }
    : { xMm: 0, yMm: 0 };

  React.useEffect(() => {
    if (!onFramePreviewChange) return;
    if (!isTumblerMode || !rotaryEnabled || !selectedPresetId) {
      onFramePreviewChange(null); return;
    }
    const origin = getLightBurnExportOrigin({
      templateWidthMm: bedConfig.width,
      preset: selectedPreset,
      bedWidthMm: bedConfig.flatWidth,
      anchorMode,
      placementProfile: buildPlacementProfile(bedConfig, anchorMode, parseNullableNumber(topOffsetDraft)),
    });
    if (!origin) { onFramePreviewChange(null); return; }
    onFramePreviewChange({ originXmm: origin.xMm, originYmm: origin.yMm, widthMm: bedConfig.width, heightMm: bedConfig.height });
  }, [onFramePreviewChange, isTumblerMode, rotaryEnabled, selectedPresetId,
      selectedPreset, bedConfig, anchorMode, topOffsetDraft]);

  const exportArtifacts = buildLightBurnExportArtifacts({
    includeLightBurnSetup: false,
    bedConfig,
    workspaceMode: bedConfig.workspaceMode,
    templateWidthMm: bedConfig.width,
    templateHeightMm: bedConfig.height,
    items: placedItems,
    rotary: { enabled: rotaryEnabled, preset: selectedPreset, anchorMode, placementProfile },
    taperWarpEnabled: taperApplicable && taperWarpEnabled,
  });

  const warnings = exportArtifacts.artworkPayload.warnings;

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>LightBurn Export</span>
        <span className={styles.modeBadge}>{isTumblerMode ? "Tumbler" : "Flat Bed"}</span>
      </div>

      <div className={styles.body}>

        {/* ── Rotary Placement ── */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionCardTitle}>Rotary Placement</div>
          <div className={styles.sectionCardBody}>

            <label className={styles.checkRow}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={rotaryEnabled}
                disabled={!isTumblerMode}
                onChange={(e) => setRotaryEnabled(e.target.checked)}
              />
              <span className={styles.checkLabel}>Auto Placement</span>
            </label>

            {rotaryEnabled && (
              <div className={styles.subOptions}>
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>Preset</span>
                  <select
                    className={styles.select}
                    value={selectedPresetId}
                    onChange={(e) => setSelectedPresetId(e.target.value)}
                  >
                    <option value="">None</option>
                    {availablePresets.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>Anchor</span>
                  <div className={styles.radioGroup}>
                    <label className={styles.radioOption}>
                      <input
                        type="radio"
                        name="anchor"
                        value="physical-top"
                        checked={anchorMode === "physical-top"}
                        onChange={() => setAnchorMode("physical-top")}
                      />
                      Physical Top
                    </label>
                    <label className={styles.radioOption}>
                      <input
                        type="radio"
                        name="anchor"
                        value="printable-top"
                        checked={anchorMode === "printable-top"}
                        onChange={() => setAnchorMode("printable-top")}
                      />
                      Printable Top
                    </label>
                  </div>
                </div>

                {anchorMode === "printable-top" && (
                  <div className={styles.fieldRow}>
                    <span className={styles.fieldLabel}>Top Offset</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input
                        type="number"
                        step={0.1}
                        className={styles.numInput}
                        value={topOffsetDraft}
                        placeholder={`${inferTopSafeOffsetMm(bedConfig) ?? 0}`}
                        onChange={(e) => setTopOffsetDraft(e.target.value)}
                      />
                      <span className={styles.numUnit}>mm</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Origin ── */}
        <div className={styles.originBar}>
          <span className={styles.originLabel}>Origin</span>
          <span className={styles.originValue}>
            X {fmt(previewOrigin.xMm)} · Y {fmt(previewOrigin.yMm)} mm
          </span>
        </div>

        {/* ── Warnings ── */}
        {warnings.map((w) => (
          <div key={w} className={styles.warning}>{w}</div>
        ))}

        {/* ── Pre-flight ── */}
        <PreflightChecklist
          isTumblerMode={isTumblerMode}
          hasItems={placedItems.length > 0}
          hasPreset={Boolean(selectedPresetId)}
          hasDiameter={Boolean(exportArtifacts.artworkPayload.cylinder?.objectDiameterMm)}
          hasTemplateDimensions={bedConfig.width > 0 && bedConfig.height > 0}
          hasTopAnchor={Boolean(selectedPreset?.rotaryTopYmm)}
        />

        {/* ── Taper Warp toggle ── */}
        {taperApplicable && (
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={taperWarpEnabled}
              onChange={(e) => setTaperWarpEnabled(e.target.checked)}
            />
            <span className={styles.checkLabel}>
              Taper Warp Correction
              <span className={styles.checkHint}> — scales artwork to match cup diameter at each Y position</span>
            </span>
          </label>
        )}

        {/* ── Export actions ── */}
        <div className={styles.exportBtnRow}>
          <button
            className={styles.primaryBtn}
            onClick={() => {
              const name = `lt316-${Date.now()}`;
              const mat = materialSettings ?? undefined;
              downloadLbrnFile(buildLightBurnLbrn(exportArtifacts.artworkPayload, mat), `${name}.lbrn2`);
              setShowNextSteps(true);
            }}
          >
            Export for LightBurn
          </button>
          <button
            className={styles.secondaryBtn}
            title="Download raw JSON"
            onClick={() => downloadJson({ ...exportArtifacts.artworkPayload, materialSettings: materialSettings ?? null }, `lt316-${Date.now()}.json`)}
          >
            JSON
          </button>
        </div>

        {/* ── Post-export card ── */}
        {showNextSteps && (
          <LightBurnValuesCard
            cylinder={exportArtifacts.artworkPayload.cylinder}
            exportOrigin={previewOrigin}
            hasMaterialProfile={Boolean(materialSettings)}
            onDismiss={() => setShowNextSteps(false)}
          />
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pre-flight checklist
// ---------------------------------------------------------------------------

function PreflightChecklist({
  isTumblerMode, hasItems, hasPreset, hasDiameter, hasTemplateDimensions, hasTopAnchor,
}: {
  isTumblerMode: boolean; hasItems: boolean; hasPreset: boolean;
  hasDiameter: boolean; hasTemplateDimensions: boolean; hasTopAnchor: boolean;
}) {
  const items: { label: string; status: "pass" | "fail" | "warn" }[] = isTumblerMode
    ? [
        { label: "Artwork on bed",        status: hasItems              ? "pass" : "fail" },
        { label: "Rotary preset",         status: hasPreset             ? "pass" : "fail" },
        { label: "Cylinder diameter",     status: hasDiameter           ? "pass" : "fail" },
        { label: "Template dimensions",   status: hasTemplateDimensions ? "pass" : "pass" },
        { label: "Top anchor calibrated", status: hasTopAnchor          ? "pass" : "warn" },
      ]
    : [
        { label: "Artwork on bed",      status: hasItems              ? "pass" : "fail" },
        { label: "Bed dimensions set",  status: hasTemplateDimensions ? "pass" : "fail" },
      ];

  const failCount = items.filter((i) => i.status === "fail").length;
  const warnCount = items.filter((i) => i.status === "warn").length;

  return (
    <div className={styles.preflight}>
      <div className={styles.preflightTitle}>
        Pre-flight{failCount > 0 ? ` · ${failCount} issue${failCount > 1 ? "s" : ""}` : warnCount > 0 ? " · 1 warning" : " · Ready"}
      </div>
      {items.map((item) => (
        <div
          key={item.label}
          className={`${styles.preflightItem} ${
            item.status === "pass" ? styles.preflightPass
              : item.status === "warn" ? styles.preflightWarn
              : styles.preflightFail
          }`}
        >
          <span className={styles.preflightDot} />
          {item.label}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Post-export copy card
// ---------------------------------------------------------------------------

import type { LightBurnExportCylinder } from "@/types/export";

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = React.useCallback(() => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [value]);
  return (
    <button
      type="button"
      className={`${styles.lbCopyBtn} ${copied ? styles.lbCopied : ""}`}
      onClick={handleCopy}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function LightBurnValuesCard({
  cylinder, exportOrigin, hasMaterialProfile, onDismiss,
}: {
  cylinder: LightBurnExportCylinder | null;
  exportOrigin: { xMm: number; yMm: number };
  hasMaterialProfile: boolean;
  onDismiss: () => void;
}) {
  const rows = [
    { label: "Object Diameter",           value: cylinder?.objectDiameterMm != null ? `${fmt(cylinder.objectDiameterMm)} mm` : "n/a" },
    { label: "Circumference (Split Width)", value: cylinder != null ? `${fmt(cylinder.splitWidthMm)} mm` : "n/a" },
    { label: "Export Origin X",            value: `${fmt(exportOrigin.xMm)} mm` },
    { label: "Export Origin Y",            value: `${fmt(exportOrigin.yMm)} mm` },
  ];

  return (
    <div className={styles.lbCard}>
      <div className={styles.lbCardHeader}>
        <span className={styles.lbCardTitle}>Enter in LightBurn</span>
        <button className={styles.lbCardDismiss} onClick={onDismiss}>×</button>
      </div>

      <div className={styles.lbValues}>
        {rows.map((row) => (
          <div key={row.label} className={styles.lbValueRow}>
            <span className={styles.lbValueLabel}>{row.label}</span>
            <span className={styles.lbValueNum}>{row.value}</span>
            {row.value !== "n/a" && <CopyButton value={row.value.replace(" mm", "")} />}
          </div>
        ))}
      </div>

      <div className={styles.lbDivider} />

      <ol className={styles.lbStepsList}>
        <li><strong>File → Open</strong> the <strong>.lbrn2</strong> — artwork + rotary pre-configured</li>
        <li><strong>Device Settings</strong> → Origin: <strong>Top-Left</strong></li>
        <li>Set <strong>Start From → Absolute Coords</strong></li>
        {hasMaterialProfile
          ? <li>Power/speed pre-set on <strong>C00</strong> from material profile — verify before running</li>
          : <li>Set power on <strong>C00</strong> for your material</li>
        }
        <li><strong>Frame</strong> to verify, then run</li>
      </ol>
    </div>
  );
}
