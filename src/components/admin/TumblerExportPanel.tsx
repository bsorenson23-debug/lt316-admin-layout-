"use client";

import React from "react";
import JSZip from "jszip";
import type { BedConfig, PlacedItem } from "@/types/admin";
import type {
  LightBurnExportPayload,
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
import { buildLightBurnExportSvg } from "@/utils/lightBurnSvgExport";
import { isTaperWarpApplicable } from "@/utils/taperWarp";
import type { LbrnMaterialSettings } from "@/utils/lightBurnLbrnExport";
import { appendExportHistory, fingerprintItems } from "./ExportHistoryPanel";
import styles from "./TumblerExportPanel.module.css";

export interface FramePreview {
  originXmm: number;
  originYmm: number;
  widthMm: number;
  heightMm: number;
}

export type PreflightNavTarget =
  | "rotary-preset"
  | "cylinder-diameter"
  | "template-dimensions"
  | "top-anchor";

interface Props {
  bedConfig: BedConfig;
  placedItems: PlacedItem[];
  compact?: boolean;
  onFramePreviewChange?: (preview: FramePreview | null) => void;
  materialSettings?: LbrnMaterialSettings | null;
  rotaryEnabled?: boolean;
  onRotaryEnabledChange?: (enabled: boolean) => void;
  selectedPresetId?: string;
  onSelectedPresetIdChange?: (presetId: string) => void;
  onPreflightNav?: (target: PreflightNavTarget) => void;
  /** Lifted taper warp state — synced with overlay controls */
  taperWarpEnabled?: boolean;
  onTaperWarpChange?: (enabled: boolean) => void;
  /** Configured LightBurn output folder (from path settings panel) */
  outputFolderPath?: string;
  /** Callback to update the tumbler diameter in the parent bed config */
  onDiameterChange?: (diameterMm: number) => void;
  /** Snap all placed items to full-wrap dimensions (circumference x printable height) */
  onSnapFullWrap?: () => void;
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

async function downloadLightBurnBundle(args: {
  baseName: string;
  lbrnContent: string;
  svgContent: string;
  jsonContent: string;
}): Promise<void> {
  const zip = new JSZip();
  zip.file(`${args.baseName}.lbrn2`, args.lbrnContent);
  zip.file(`${args.baseName}.svg`, args.svgContent);
  zip.file(`${args.baseName}.lightburn.json`, args.jsonContent);
  zip.file(
    "README.txt",
    [
      "Open the .lbrn2 file in LightBurn for the minimal artwork-only project.",
      "This export includes basic galvo rotary diameter/setup when rotary is enabled.",
      "It still excludes bounds, notes, and advanced LT316 settings.",
      "Save-to-folder mode also refreshes fixed aliases named current-job.lbrn2 / .svg / .lightburn.json.",
      "Import or inspect the .svg only if you need the raw artwork export.",
      "The .lightburn.json file is LT316 metadata and is not meant to be opened by LightBurn.",
    ].join("\r\n"),
  );

  const blob = await zip.generateAsync({ type: "blob" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `${args.baseName}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(href);
}

const CURRENT_JOB_BASENAME = "current-job";

async function preprocessPayloadForLbrn(
  payload: LightBurnExportPayload,
): Promise<{
  payload: LightBurnExportPayload;
  usedInkscape: boolean;
  messages: string[];
}> {
  try {
    const response = await fetch("/api/admin/lightburn/preprocess-svg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: payload.items.map((item) => ({
          id: item.id,
          svgText: item.svgText,
        })),
      }),
    });

    if (!response.ok) {
      return { payload, usedInkscape: false, messages: [] };
    }

    const data = (await response.json()) as {
      usedInkscape?: boolean;
      items?: Array<{
        id: string;
        svgText: string;
        message?: string | null;
      }>;
    };

    const byId = new Map(
      (data.items ?? []).map((item) => [item.id, item]),
    );

    return {
      payload: {
        ...payload,
        items: payload.items.map((item) => {
          const preprocessed = byId.get(item.id);
          return preprocessed?.svgText
            ? { ...item, svgText: preprocessed.svgText }
            : item;
        }),
      },
      usedInkscape: Boolean(data.usedInkscape),
      messages: (data.items ?? [])
        .map((item) => item.message)
        .filter((message): message is string => Boolean(message)),
    };
  } catch {
    return { payload, usedInkscape: false, messages: [] };
  }
}

// ---------------------------------------------------------------------------

export function TumblerExportPanel({
  bedConfig, placedItems, compact = false, onFramePreviewChange, materialSettings,
  rotaryEnabled: rotaryEnabledProp, onRotaryEnabledChange,
  selectedPresetId: selectedPresetIdProp, onSelectedPresetIdChange,
  onPreflightNav,
  taperWarpEnabled: taperWarpEnabledProp, onTaperWarpChange, outputFolderPath, onDiameterChange,
  onSnapFullWrap,
}: Props) {
  const [localRotaryEnabled,  setLocalRotaryEnabled]  = React.useState(false);
  const [availablePresets,    setAvailablePresets]    = React.useState<RotaryPlacementPreset[]>(DEFAULT_ROTARY_PLACEMENT_PRESETS);
  const [localSelectedPresetId, setLocalSelectedPresetId] = React.useState("");
  const [anchorMode,          setAnchorMode]          = React.useState<TopAnchorMode>("physical-top");
  const [topOffsetDraft,      setTopOffsetDraft]      = React.useState("");
  const [showNextSteps,       setShowNextSteps]       = React.useState(false);
  const [showSetupDetails,    setShowSetupDetails]    = React.useState(!compact);
  const [saving,              setSaving]              = React.useState(false);
  const [saveResult,          setSaveResult]          = React.useState<{ ok: boolean; message: string } | null>(null);
  const [diameterDraft,       setDiameterDraft]       = React.useState("");
  const rotaryEnabled = rotaryEnabledProp ?? localRotaryEnabled;
  const setRotaryEnabled = onRotaryEnabledChange ?? setLocalRotaryEnabled;
  const selectedPresetId = selectedPresetIdProp ?? localSelectedPresetId;
  const setSelectedPresetId = onSelectedPresetIdChange ?? setLocalSelectedPresetId;
  // Use lifted state if provided, otherwise local fallback
  const [localTaperWarp,      setLocalTaperWarp]      = React.useState(true);
  const taperWarpEnabled = taperWarpEnabledProp ?? localTaperWarp;
  const setTaperWarpEnabled = onTaperWarpChange ?? setLocalTaperWarp;

  React.useEffect(() => { setAvailablePresets(getRotaryPresets()); }, []);
  React.useEffect(() => { setShowSetupDetails(!compact); }, [compact]);

  // Sync diameter draft from bedConfig when it changes externally
  const currentDiameterMm = bedConfig.tumblerOutsideDiameterMm ?? bedConfig.tumblerDiameterMm ?? 0;
  React.useEffect(() => {
    if (currentDiameterMm > 0) setDiameterDraft(String(currentDiameterMm));
  }, [currentDiameterMm]);

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
    includeLightBurnSetup: isTumblerMode,
    bedConfig,
    workspaceMode: bedConfig.workspaceMode,
    templateWidthMm: bedConfig.width,
    templateHeightMm: bedConfig.height,
    items: placedItems,
    rotary: { enabled: rotaryEnabled, preset: selectedPreset, anchorMode, placementProfile },
    taperWarpEnabled: taperApplicable && taperWarpEnabled,
  });

  const warnings = exportArtifacts.artworkPayload.warnings;

  const hasOutputFolder = Boolean(outputFolderPath?.trim());
  const quickSummary = [
    {
      label: "Rotary",
      value: !isTumblerMode
        ? "Flat-bed export"
        : rotaryEnabled
          ? selectedPreset?.name ?? "Preset needed"
          : "Manual placement",
    },
    {
      label: "Diameter",
      value: isTumblerMode && currentDiameterMm > 0 ? `${fmt(currentDiameterMm)} mm` : "n/a",
    },
    {
      label: "Origin",
      value: `X ${fmt(previewOrigin.xMm)} · Y ${fmt(previewOrigin.yMm)}`,
    },
    {
      label: "Output",
      value: hasOutputFolder ? "Watched folder save" : "Download bundle",
    },
  ];

  const doExport = async (mode: "download" | "save") => {
    const name = `lt316-${Date.now()}`;
    const material = materialSettings ?? undefined;
    const preprocessedForLbrn = await preprocessPayloadForLbrn(exportArtifacts.artworkPayload);
    const sidecarPayload = {
      artwork: exportArtifacts.artworkPayload,
      setup: exportArtifacts.sidecar,
      setupSummary: exportArtifacts.setupSummary,
      materialSettings: materialSettings ?? null,
      lbrnPreprocess: {
        usedInkscape: preprocessedForLbrn.usedInkscape,
        messages: preprocessedForLbrn.messages,
      },
    };
    const svgContent = buildLightBurnExportSvg(exportArtifacts.artworkPayload);
    const lbrnContent = buildLightBurnLbrn(
      preprocessedForLbrn.payload,
      materialSettings ?? undefined,
      undefined,
      { mode: "minimal" },
    );
    const sidecarContent = JSON.stringify(sidecarPayload, null, 2);

    if (mode === "save" && outputFolderPath?.trim()) {
      setSaving(true);
      setSaveResult(null);
      const saveFile = async (filename: string, content: string) => {
        const res = await fetch("/api/admin/lightburn/save-export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            outputFolderPath: outputFolderPath.trim(),
            filename,
            content,
          }),
        });
        const data = (await res.json()) as { saved?: boolean; path?: string; error?: string };
        if (!res.ok || !data.saved || !data.path) {
          throw new Error(data.error ?? `Failed to save ${filename}`);
        }
        return data.path;
      };

      try {
        const [
          lbrnPath,
          svgPath,
          jsonPath,
          currentLbrnPath,
          currentSvgPath,
          currentJsonPath,
        ] = await Promise.all([
        saveFile(`${name}.lbrn2`, lbrnContent),
        saveFile(`${name}.svg`, svgContent),
        saveFile(`${name}.lightburn.json`, sidecarContent),
        saveFile(`${CURRENT_JOB_BASENAME}.lbrn2`, lbrnContent),
        saveFile(`${CURRENT_JOB_BASENAME}.svg`, svgContent),
        saveFile(`${CURRENT_JOB_BASENAME}.lightburn.json`, sidecarContent),
        ]);
        setSaveResult({
          ok: true,
          message: `Saved ${lbrnPath}, ${svgPath}, and ${jsonPath}. Updated fixed job files at ${currentLbrnPath}, ${currentSvgPath}, and ${currentJsonPath}${preprocessedForLbrn.usedInkscape ? " (Inkscape preprocessed .lbrn2 artwork)" : ""}`,
        });
      } catch (err) {
        setSaveResult({
          ok: false,
          message: err instanceof Error ? err.message : "Network error",
        });
        setSaving(false);
        return;
      } finally {
        setSaving(false);
      }
    } else {
      void downloadLightBurnBundle({
        baseName: name,
        lbrnContent,
        svgContent,
        jsonContent: sidecarContent,
      });
    }

    setShowNextSteps(true);
    appendExportHistory({
      tumblerBrand: bedConfig.tumblerBrand,
      tumblerModel: bedConfig.tumblerModel,
      tumblerProfileId: bedConfig.tumblerProfileId,
      rotaryPresetId: selectedPreset?.id,
      rotaryPresetName: selectedPreset?.name,
      materialLabel: material?.label,
      templateWidthMm: bedConfig.width,
      templateHeightMm: bedConfig.height,
      artworkFingerprint: fingerprintItems(placedItems),
      itemsSnapshot: placedItems.map((p) => ({ name: p.name, x: p.x, y: p.y, width: p.width, height: p.height, rotation: p.rotation })),
      exportOriginXmm: previewOrigin.xMm,
      exportOriginYmm: previewOrigin.yMm,
      exportPayloadSnapshot: preprocessedForLbrn.payload,
      materialSettingsSnapshot: material ? { ...material } : null,
    });
  };

  const handleDownloadLbrn = async () => {
    const preprocessedForLbrn = await preprocessPayloadForLbrn(exportArtifacts.artworkPayload);
    const lbrnContent = buildLightBurnLbrn(
      preprocessedForLbrn.payload,
      materialSettings ?? undefined,
      undefined,
      { mode: "minimal" },
    );
    downloadLbrnFile(lbrnContent, `lt316-${Date.now()}.lbrn2`);
  };

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>{compact ? "Export Bundle" : "LightBurn Export"}</span>
        <span className={styles.modeBadge}>{isTumblerMode ? "Tumbler" : "Flat Bed"}</span>
      </div>

      <div className={styles.body}>
        {compact && (
          <>
            <div className={styles.quickSummaryGrid}>
              {quickSummary.map((entry) => (
                <div key={entry.label} className={styles.quickSummaryCard}>
                  <span className={styles.quickSummaryLabel}>{entry.label}</span>
                  <span className={styles.quickSummaryValue}>{entry.value}</span>
                </div>
              ))}
            </div>
            <button
              type="button"
              className={styles.setupToggle}
              onClick={() => setShowSetupDetails((prev) => !prev)}
            >
              {showSetupDetails ? "Hide export setup" : "Show export setup"}
            </button>
          </>
        )}

        {/* ── Rotary Placement ── */}
        {showSetupDetails && (
          <>
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
                    id="rotary-preset-select"
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

        {/* ── Cylinder Diameter ── */}
        {isTumblerMode && (
          <div className={styles.sectionCard}>
            <div className={styles.sectionCardTitle}>Cylinder</div>
            <div className={styles.sectionCardBody}>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>Diameter</span>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input
                    id="cylinder-diameter-input"
                    type="number"
                    step={0.1}
                    min={0}
                    className={styles.numInput}
                    value={diameterDraft}
                    placeholder="0"
                    onChange={(e) => {
                      setDiameterDraft(e.target.value);
                      const val = Number(e.target.value);
                      if (Number.isFinite(val) && val > 0 && onDiameterChange) {
                        onDiameterChange(val);
                      }
                    }}
                  />
                  <span className={styles.numUnit}>mm</span>
                </div>
              </div>
              {currentDiameterMm > 0 && (
                <div className={styles.diameterMeta}>
                  Circumference: {fmt(Math.PI * currentDiameterMm)} mm
                </div>
              )}
              {placedItems.length > 0 && currentDiameterMm > 0 && bedConfig.height > 0 && onSnapFullWrap && (
                <button
                  type="button"
                  className={styles.snapWrapBtn}
                  onClick={onSnapFullWrap}
                  title={`Resize all artwork to ${fmt(bedConfig.width)} × ${fmt(bedConfig.height)} mm and position at origin`}
                >
                  Snap Full Wrap
                </button>
              )}
            </div>
          </div>
        )}

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
        {!compact && (
          <PreflightChecklist
            isTumblerMode={isTumblerMode}
            hasItems={placedItems.length > 0}
            hasPreset={!rotaryEnabled || Boolean(selectedPresetId)}
            hasDiameter={Boolean(exportArtifacts.artworkPayload.cylinder?.objectDiameterMm)}
            hasTemplateDimensions={bedConfig.width > 0 && bedConfig.height > 0}
            hasTopAnchor={Boolean(selectedPreset?.rotaryTopYmm)}
            onNavigate={onPreflightNav}
          />
        )}

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
          </>
        )}

        <div className={styles.exportBtnRow}>
          {hasOutputFolder ? (
            <button
              className={styles.primaryBtn}
              disabled={saving}
              onClick={() => doExport("save")}
            >
              {saving ? "Saving..." : "Save LightBurn Files + current-job"}
            </button>
          ) : (
            <button
              className={styles.primaryBtn}
              onClick={() => doExport("download")}
            >
              Export Minimal LightBurn Bundle
            </button>
          )}
          {hasOutputFolder && (
            <button
              className={styles.secondaryBtn}
              title="Download minimal LightBurn bundle (.zip with artwork-only .lbrn2, .svg, and metadata)"
              onClick={() => doExport("download")}
            >
              DL
            </button>
          )}
          <button
            className={styles.secondaryBtn}
            title="Download minimal artwork-only .lbrn2 project"
            onClick={handleDownloadLbrn}
          >
            LBRN
          </button>
          <button
            className={styles.secondaryBtn}
            title="Download raw export payload JSON (not for LightBurn)"
            onClick={() => downloadJson({ ...exportArtifacts.artworkPayload, materialSettings: materialSettings ?? null }, `lt316-${Date.now()}-payload.json`)}
          >
            JSON
          </button>
        </div>
        {saveResult && (
          <div className={saveResult.ok ? styles.saveSuccess : styles.warning}>
            {saveResult.message}
          </div>
        )}

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
  onNavigate,
}: {
  isTumblerMode: boolean; hasItems: boolean; hasPreset: boolean;
  hasDiameter: boolean; hasTemplateDimensions: boolean; hasTopAnchor: boolean;
  onNavigate?: (target: PreflightNavTarget) => void;
}) {
  const items: { label: string; status: "pass" | "fail" | "warn"; action?: PreflightNavTarget }[] = isTumblerMode
    ? [
        { label: "Artwork on bed",        status: hasItems              ? "pass" : "fail" },
        { label: "Rotary preset",         status: hasPreset             ? "pass" : "fail", action: "rotary-preset" },
        { label: "Cylinder diameter",     status: hasDiameter           ? "pass" : "fail", action: "cylinder-diameter" },
        { label: "Template dimensions",   status: hasTemplateDimensions ? "pass" : "pass", action: "template-dimensions" },
        { label: "Top anchor calibrated", status: hasTopAnchor          ? "pass" : "warn", action: "top-anchor" },
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
      {items.map((item) => {
        const statusClass =
          item.status === "pass" ? styles.preflightPass
            : item.status === "warn" ? styles.preflightWarn
            : styles.preflightFail;

        if (item.action && onNavigate) {
          return (
            <button
              key={item.label}
              type="button"
              className={`${styles.preflightItem} ${styles.preflightItemClickable} ${statusClass}`}
              onClick={() => onNavigate(item.action!)}
            >
              <span className={styles.preflightDot} />
              {item.label}
              <span className={styles.preflightArrow}>→</span>
            </button>
          );
        }

        return (
          <div
            key={item.label}
            className={`${styles.preflightItem} ${statusClass}`}
          >
            <span className={styles.preflightDot} />
            {item.label}
          </div>
        );
      })}
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
        <li><strong>File → Open</strong> the <strong>.lbrn2</strong> — minimal artwork-only project with basic galvo rotary setup</li>
        <li><strong>Device Settings</strong> → Origin: <strong>Top-Left</strong></li>
        <li>Set <strong>Start From → Absolute Coords</strong></li>
        {hasMaterialProfile
          ? <li>Set or verify power/speed on <strong>C00</strong> manually</li>
          : <li>Set power on <strong>C00</strong> for your material</li>
        }
        <li>Enter rotary settings manually for now if needed</li>
        <li><strong>Frame</strong> to verify, then run</li>
      </ol>
    </div>
  );
}
