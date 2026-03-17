"use client";

import React from "react";
import type { BedConfig, PlacedItem } from "@/types/admin";
import type {
  LightBurnPathSettings,
  LightBurnPathValidationItem,
  LightBurnPathValidationResult,
  RotaryPlacementPreset,
  TopAnchorMode,
  TumblerPlacementProfile,
} from "@/types/export";
import {
  DEFAULT_ROTARY_PLACEMENT_PRESETS,
} from "@/data/rotaryPlacementPresets";
import { getRotaryPresets } from "@/utils/adminCalibrationState";
import {
  buildDefaultLightBurnPathValidationResult,
  loadLightBurnPathSettings,
  resetLightBurnPathSettings,
  saveLightBurnPathSettings,
} from "@/utils/lightBurnPathSettings";
import {
  buildLightBurnExportArtifacts,
  getLightBurnExportOrigin,
} from "@/utils/tumblerExportPlacement";
import styles from "./TumblerExportPanel.module.css";

interface Props {
  bedConfig: BedConfig;
  placedItems: PlacedItem[];
}

interface LightBurnPathDraft {
  templateProjectPath: string;
  outputFolderPath: string;
  deviceBundlePath: string;
}

function toRounded(value: number): string {
  return value.toFixed(2);
}

function parseNullableNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPathDraft(settings: LightBurnPathSettings): LightBurnPathDraft {
  return {
    templateProjectPath: settings.templateProjectPath ?? "",
    outputFolderPath: settings.outputFolderPath ?? "",
    deviceBundlePath: settings.deviceBundlePath ?? "",
  };
}

function toPathSettings(draft: LightBurnPathDraft): LightBurnPathSettings {
  const templateProjectPath = draft.templateProjectPath.trim();
  const outputFolderPath = draft.outputFolderPath.trim();
  const deviceBundlePath = draft.deviceBundlePath.trim();

  return {
    templateProjectPath: templateProjectPath || undefined,
    outputFolderPath: outputFolderPath || undefined,
    deviceBundlePath: deviceBundlePath || undefined,
  };
}

function getValidationTone(status: LightBurnPathValidationItem["status"]): string {
  if (status === "valid") return styles.statusValid;
  if (status === "error") return styles.statusError;
  if (status === "missing") return styles.statusMissing;
  return styles.statusWarning;
}

function formatPathStatus(item: LightBurnPathValidationItem | undefined): string {
  if (!item) return "Missing";
  if (item.status === "invalid-extension") return "Invalid extension";
  if (item.status === "not-found") return "Not found";
  if (item.status === "not-writable") return "Not writable";
  if (item.status === "error") return "Validation error";
  return item.message;
}

function getPathWarnings(validation: LightBurnPathValidationResult): string[] {
  const warnings: string[] = [];

  if (validation.templateProjectPath.status !== "valid") {
    warnings.push("LightBurn project template path is not valid.");
  }
  if (validation.outputFolderPath.status !== "valid") {
    warnings.push("LightBurn output folder path is not valid.");
  }
  if (
    validation.deviceBundlePath.status !== "valid" &&
    validation.deviceBundlePath.status !== "missing"
  ) {
    warnings.push("LightBurn device bundle path is not valid.");
  }

  return warnings;
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
  const [lightBurnPathDraft, setLightBurnPathDraft] =
    React.useState<LightBurnPathDraft>(() => toPathDraft({}));
  const [pathValidation, setPathValidation] =
    React.useState<LightBurnPathValidationResult>(
      buildDefaultLightBurnPathValidationResult
    );
  const [isValidatingPaths, setIsValidatingPaths] = React.useState(false);
  const [pathStatusMessage, setPathStatusMessage] = React.useState<string | null>(
    null
  );
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

  const validateLightBurnPaths = React.useCallback(
    async (settings: LightBurnPathSettings) => {
      setIsValidatingPaths(true);
      try {
        const response = await fetch("/api/admin/lightburn/validate-paths", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ settings }),
        });

        if (!response.ok) {
          throw new Error("Validation request failed.");
        }

        const result = (await response.json()) as LightBurnPathValidationResult;
        setPathValidation(result);
        setPathStatusMessage("Path validation complete.");
      } catch {
        setPathStatusMessage("Could not validate paths. Check values and try again.");
      } finally {
        setIsValidatingPaths(false);
      }
    },
    []
  );

  React.useEffect(() => {
    const savedSettings = loadLightBurnPathSettings();
    const draft = toPathDraft(savedSettings);
    setLightBurnPathDraft(draft);
    void validateLightBurnPaths(toPathSettings(draft));
  }, [validateLightBurnPaths]);

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
    isTumblerMode
      ? getLightBurnExportOrigin({
          templateWidthMm: bedConfig.width,
          preset: selectedPreset,
          bedWidthMm: bedConfig.flatWidth,
          anchorMode,
          placementProfile,
        }) ?? { xMm: 0, yMm: 0 }
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
  const pathWarnings = includeLightBurnSetup ? getPathWarnings(pathValidation) : [];
  const allWarnings = Array.from(
    new Set([...fromArtworkWarnings, ...fromSetupWarnings, ...pathWarnings])
  );

  const lightBurnPathSettings = toPathSettings(lightBurnPathDraft);

  const handlePathFieldChange = React.useCallback(
    (key: keyof LightBurnPathDraft, value: string) => {
      setLightBurnPathDraft((current) => ({
        ...current,
        [key]: value,
      }));
      setPathStatusMessage("Path values changed. Validate Paths to refresh status.");
    },
    []
  );

  const handleSaveLightBurnPaths = React.useCallback(() => {
    const normalized = saveLightBurnPathSettings(toPathSettings(lightBurnPathDraft));
    const normalizedDraft = toPathDraft(normalized);
    setLightBurnPathDraft(normalizedDraft);
    setPathStatusMessage("LightBurn paths saved.");
    void validateLightBurnPaths(normalized);
  }, [lightBurnPathDraft, validateLightBurnPaths]);

  const handleResetLightBurnPaths = React.useCallback(() => {
    const reset = resetLightBurnPathSettings();
    const resetDraft = toPathDraft(reset);
    setLightBurnPathDraft(resetDraft);
    setPathValidation(buildDefaultLightBurnPathValidationResult());
    setPathStatusMessage("LightBurn paths reset.");
  }, []);

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

        <div className={styles.integrationSection}>
          <div className={styles.sectionTitle}>LightBurn Integration</div>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Project Template</span>
            <input
              type="text"
              className={styles.pathInput}
              value={lightBurnPathDraft.templateProjectPath}
              placeholder="C:\\LightBurn\\Templates\\job-template.lbrn2"
              onChange={(event) =>
                handlePathFieldChange("templateProjectPath", event.target.value)
              }
            />
            <span className={styles.fieldHint}>Project Template: .lbrn2 or .lbrn</span>
            <span
              className={`${styles.statusChip} ${getValidationTone(
                pathValidation.templateProjectPath.status
              )}`}
            >
              {formatPathStatus(pathValidation.templateProjectPath)}
            </span>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Job Output Folder</span>
            <input
              type="text"
              className={styles.pathInput}
              value={lightBurnPathDraft.outputFolderPath}
              placeholder="C:\\LightBurn\\LT316\\jobs"
              onChange={(event) =>
                handlePathFieldChange("outputFolderPath", event.target.value)
              }
            />
            <span className={styles.fieldHint}>Output Folder: exported LT316 jobs</span>
            <span
              className={`${styles.statusChip} ${getValidationTone(
                pathValidation.outputFolderPath.status
              )}`}
            >
              {formatPathStatus(pathValidation.outputFolderPath)}
            </span>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Device Bundle</span>
            <input
              type="text"
              className={styles.pathInput}
              value={lightBurnPathDraft.deviceBundlePath}
              placeholder="C:\\LightBurn\\Devices\\machine.lbzip"
              onChange={(event) =>
                handlePathFieldChange("deviceBundlePath", event.target.value)
              }
            />
            <span className={styles.fieldHint}>Device Bundle: .lbzip</span>
            <span
              className={`${styles.statusChip} ${getValidationTone(
                pathValidation.deviceBundlePath.status
              )}`}
            >
              {formatPathStatus(pathValidation.deviceBundlePath)}
            </span>
          </label>

          <div className={styles.inlineActions}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={handleSaveLightBurnPaths}
            >
              Save
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => void validateLightBurnPaths(lightBurnPathSettings)}
              disabled={isValidatingPaths}
            >
              {isValidatingPaths ? "Validating..." : "Validate Paths"}
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={handleResetLightBurnPaths}
            >
              Reset
            </button>
          </div>

          {pathStatusMessage && <div className={styles.hint}>{pathStatusMessage}</div>}
          <div className={styles.hint}>
            Use Open in LightBurn for project templates, not Import.
          </div>
        </div>

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

        <div className={styles.previewGrid}>
          <span>Project template</span>
          <span className={styles.pathValue}>
            {lightBurnPathSettings.templateProjectPath ?? "Not set"}
          </span>
          <span>Output folder</span>
          <span className={styles.pathValue}>
            {lightBurnPathSettings.outputFolderPath ?? "Not set"}
          </span>
        </div>

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
