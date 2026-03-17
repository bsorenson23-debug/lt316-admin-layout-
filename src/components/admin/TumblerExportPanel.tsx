"use client";

import React from "react";
import type { BedConfig, PlacedItem } from "@/types/admin";
import type {
  RotaryPlacementPreset,
  TopAnchorMode,
  TumblerPlacementProfile,
} from "@/types/export";
import {
  DEFAULT_ROTARY_PLACEMENT_PRESETS,
} from "@/data/rotaryPlacementPresets";
import { getRotaryPresets } from "@/utils/adminCalibrationState";
import {
  buildLightBurnExportArtifacts,
  getRotaryExportOrigin,
} from "@/utils/tumblerExportPlacement";
import styles from "./TumblerExportPanel.module.css";

interface Props {
  bedConfig: BedConfig;
  placedItems: PlacedItem[];
}

function toRounded(value: number): string {
  return value.toFixed(2);
}

function parseNullableNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferTopSafeOffsetMm(bedConfig: BedConfig): number | undefined {
  const overall = bedConfig.tumblerOverallHeightMm;
  const usable = bedConfig.tumblerUsableHeightMm;
  if (!Number.isFinite(overall) || !Number.isFinite(usable)) return undefined;
  const delta = ((overall ?? 0) - (usable ?? 0)) / 2;
  return delta > 0 ? Number(delta.toFixed(2)) : 0;
}

function buildPlacementProfile(
  bedConfig: BedConfig,
  anchorMode: TopAnchorMode,
  manualTopOffsetMm: number | null
): TumblerPlacementProfile {
  const inferredTopOffset = inferTopSafeOffsetMm(bedConfig);
  return {
    overallHeightMm: bedConfig.tumblerOverallHeightMm ?? bedConfig.height,
    usableHeightMm: bedConfig.tumblerUsableHeightMm ?? bedConfig.height,
    topToSafeZoneStartMm:
      manualTopOffsetMm ?? inferredTopOffset ?? undefined,
    bottomMarginMm: undefined,
    topAnchorMode: anchorMode,
  };
}

function downloadJson(payload: unknown, filename: string): void {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(href);
}

export function TumblerExportPanel({ bedConfig, placedItems }: Props) {
  const [rotaryAutoPlacementEnabled, setRotaryAutoPlacementEnabled] =
    React.useState(false);
  const [includeLightBurnSetup, setIncludeLightBurnSetup] = React.useState(false);
  const [availablePresets, setAvailablePresets] = React.useState<RotaryPlacementPreset[]>(
    DEFAULT_ROTARY_PLACEMENT_PRESETS
  );
  const [selectedPresetId, setSelectedPresetId] = React.useState("");
  const [anchorMode, setAnchorMode] =
    React.useState<TopAnchorMode>("physical-top");
  const [manualTopOffsetDraft, setManualTopOffsetDraft] = React.useState("");

  React.useEffect(() => {
    setAvailablePresets(getRotaryPresets());
  }, []);

  const isTumblerMode = bedConfig.workspaceMode === "tumbler-wrap";
  const selectedPreset = selectedPresetId
    ? availablePresets.find((preset) => preset.id === selectedPresetId) ?? null
    : null;
  const manualTopOffsetMm = parseNullableNumber(manualTopOffsetDraft);
  const placementProfile = buildPlacementProfile(
    bedConfig,
    anchorMode,
    manualTopOffsetMm
  );

  const previewOrigin =
    isTumblerMode && selectedPreset
      ? getRotaryExportOrigin({
          templateWidthMm: bedConfig.width,
          rotaryCenterXmm: selectedPreset.rotaryCenterXmm,
          rotaryTopYmm: selectedPreset.rotaryTopYmm,
          anchorMode,
          placementProfile,
        })
      : { xMm: 0, yMm: 0 };

  const exportArtifacts = buildLightBurnExportArtifacts({
    includeLightBurnSetup,
    bedConfig,
    workspaceMode: bedConfig.workspaceMode,
    templateWidthMm: bedConfig.width,
    templateHeightMm: bedConfig.height,
    items: placedItems,
    rotary: {
      enabled: rotaryAutoPlacementEnabled,
      preset: selectedPreset,
      anchorMode,
      placementProfile,
    },
  });

  const fromArtworkWarnings = exportArtifacts.artworkPayload.warnings;
  const fromSetupWarnings = includeLightBurnSetup ? exportArtifacts.setupWarnings : [];
  const allWarnings = Array.from(
    new Set([...fromArtworkWarnings, ...fromSetupWarnings])
  );

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>LightBurn Export</span>
        <span className={styles.modeBadge}>
          {isTumblerMode ? "Tumbler" : "Flat Bed"}
        </span>
      </div>

      <div className={styles.body}>
        <div className={styles.row}>
          <span className={styles.label}>Rotary Auto Placement</span>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={rotaryAutoPlacementEnabled}
              onChange={(e) => setRotaryAutoPlacementEnabled(e.target.checked)}
            />
            <span className={styles.toggleTrack} />
          </label>
        </div>

        <div className={styles.row}>
          <span className={styles.label}>Include LightBurn setup</span>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={includeLightBurnSetup}
              disabled={!isTumblerMode}
              onChange={(e) =>
                setIncludeLightBurnSetup(e.target.checked)
              }
            />
            <span className={styles.toggleTrack} />
          </label>
        </div>

        <div className={styles.row}>
          <span className={styles.label}>Rotary Preset</span>
          <select
            className={styles.select}
            value={selectedPresetId}
            onChange={(e) => setSelectedPresetId(e.target.value)}
            disabled={!isTumblerMode}
          >
            <option value="">None</option>
            {availablePresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.row}>
          <span className={styles.label}>Anchor Mode</span>
          <select
            className={styles.select}
            value={anchorMode}
            onChange={(e) =>
              setAnchorMode(e.target.value as TopAnchorMode)
            }
            disabled={!isTumblerMode}
          >
            <option value="physical-top">Physical Top</option>
            <option value="printable-top">Printable Top</option>
          </select>
        </div>

        {anchorMode === "printable-top" && (
          <div className={styles.row}>
            <span className={styles.label}>Top Safe Offset (mm)</span>
            <input
              type="number"
              step={0.1}
              className={styles.numInput}
              value={manualTopOffsetDraft}
              placeholder={`${inferTopSafeOffsetMm(bedConfig) ?? 0}`}
              onChange={(e) => setManualTopOffsetDraft(e.target.value)}
              disabled={!isTumblerMode}
            />
          </div>
        )}

        <div className={styles.previewGrid}>
          <span>Export Origin X</span>
          <span>{toRounded(previewOrigin.xMm)} mm</span>
          <span>Export Origin Y</span>
          <span>{toRounded(previewOrigin.yMm)} mm</span>
        </div>

        {allWarnings.map((warning) => (
          <div key={warning} className={styles.warning}>
            {warning}
          </div>
        ))}
        {!isTumblerMode && (
          <div className={styles.hint}>
            Rotary auto placement applies only in tumbler mode. Flat-bed export remains unchanged.
          </div>
        )}

        {includeLightBurnSetup && exportArtifacts.sidecar && (
          <div className={styles.previewGrid}>
            <span>Rotary preset</span>
            <span>{exportArtifacts.sidecar.rotary.presetName ?? "none"}</span>
            <span>Rotary mode</span>
            <span>{exportArtifacts.sidecar.rotary.mode}</span>
            <span>Object diameter</span>
            <span>
              {exportArtifacts.sidecar.lightburn.recommendedObjectDiameterMm !== undefined
                ? `${toRounded(exportArtifacts.sidecar.lightburn.recommendedObjectDiameterMm)} mm`
                : "n/a"}
            </span>
            <span>Wrap width</span>
            <span>
              {exportArtifacts.sidecar.lightburn.recommendedCircumferenceMm !== undefined
                ? `${toRounded(exportArtifacts.sidecar.lightburn.recommendedCircumferenceMm)} mm`
                : "n/a"}
            </span>
            <span>Export origin X</span>
            <span>
              {exportArtifacts.sidecar.lightburn.exportOriginXmm !== undefined
                ? `${toRounded(exportArtifacts.sidecar.lightburn.exportOriginXmm)} mm`
                : "n/a"}
            </span>
            <span>Export origin Y</span>
            <span>
              {exportArtifacts.sidecar.lightburn.exportOriginYmm !== undefined
                ? `${toRounded(exportArtifacts.sidecar.lightburn.exportOriginYmm)} mm`
                : "n/a"}
            </span>
            <span>Top anchor mode</span>
            <span>{exportArtifacts.sidecar.rotary.anchorMode}</span>
          </div>
        )}

        {includeLightBurnSetup && exportArtifacts.setupSummary && (
          <div className={styles.summary}>{exportArtifacts.setupSummary}</div>
        )}

        <button
          className={styles.primaryBtn}
          onClick={() => {
            const jobName = `lt316-lightburn-export-${Date.now()}`;
            downloadJson(
              exportArtifacts.artworkPayload,
              `${jobName}.json`
            );

            if (includeLightBurnSetup && exportArtifacts.sidecar) {
              downloadJson(
                exportArtifacts.sidecar,
                `${jobName}.lt316.json`
              );
            }
          }}
        >
          Export Artwork
        </button>
      </div>
    </section>
  );
}
