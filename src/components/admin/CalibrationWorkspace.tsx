"use client";

import React from "react";
import { DEFAULT_BED_CONFIG } from "@/types/admin";
import type {
  BedOrigin,
  RotaryDriveType,
  RotaryMountBoltSize,
  RotaryMountReferenceMode,
  RotaryPlacementPreset,
  RotaryPresetFamily,
  TopAnchorMode,
} from "@/types/export";
import type {
  CalibrationOverlayKey,
  CalibrationOverlayToggles as CalibrationOverlayToggleState,
} from "@/utils/calibrationBedReference";
import { buildExportPlacementPreview } from "@/utils/calibrationExportPreview";
import {
  CALIBRATION_MODE_DEFINITIONS,
  DEFAULT_CALIBRATION_MODE,
  type CalibrationMode,
  buildOverlayStateForMode,
  getDefaultOverlayTogglesForMode,
  getVisibleOverlayKeysForMode,
} from "@/utils/calibrationModes";
import { getBedCenterXmm, resolveRotaryCenterXmm } from "@/utils/rotaryCenter";
import {
  deleteRotaryPreset,
  getRotaryPresets,
  saveRotaryPreset,
  updateRotaryPreset,
} from "@/utils/adminCalibrationState";
import {
  CUSTOM_ROTARY_PRESET_ID,
  type RotaryModeDraft,
  buildEmptyRotaryDraft,
  buildRotaryDraftFromPreset,
  formatRotaryPresetReadout,
  formatRotaryValue,
  resolveMountFootprintFromDraft,
  validateRotaryPresetDraft,
} from "@/utils/rotaryMode";
import { CalibrationBedReference } from "./CalibrationBedReference";
import { CalibrationModeSwitcher } from "./CalibrationModeSwitcher";
import { CalibrationOverlayToggles } from "./CalibrationOverlayToggles";
import styles from "./CalibrationWorkspace.module.css";

const DEFAULT_TEMPLATE_WIDTH_MM = 276.15;
const OVERLAY_STORAGE_KEY = "lt316.admin.calibration.overlays";
const CALIBRATION_BED_WIDTH_MM = DEFAULT_BED_CONFIG.flatWidth;

const LENS_PROFILES = [
  { id: "standard-100", label: "Standard 100 mm", fieldInsetMm: 8 },
  { id: "wide-163", label: "Wide 163 mm", fieldInsetMm: 14 },
  { id: "fine-50", label: "Fine 50 mm", fieldInsetMm: 5 },
] as const;

const ROTARY_FAMILY_OPTIONS: RotaryPresetFamily[] = [
  "d80c",
  "d100c",
  "rotoboss-talon",
  "custom",
];

const ROTARY_MOUNT_BOLT_OPTIONS: RotaryMountBoltSize[] = ["M6", "unknown"];

const ROTARY_MOUNT_REFERENCE_OPTIONS: RotaryMountReferenceMode[] = [
  "axis-center",
  "front-left-bolt",
  "front-edge-center",
  "custom",
];

type LensProfileId = (typeof LENS_PROFILES)[number]["id"];
type OverlayStateByMode = Record<CalibrationMode, CalibrationOverlayToggleState>;

function buildDefaultOverlayStateByMode(): OverlayStateByMode {
  return {
    rotary: getDefaultOverlayTogglesForMode("rotary"),
    export: getDefaultOverlayTogglesForMode("export"),
    lens: getDefaultOverlayTogglesForMode("lens"),
    geometry: getDefaultOverlayTogglesForMode("geometry"),
    "red-light": getDefaultOverlayTogglesForMode("red-light"),
    distortion: getDefaultOverlayTogglesForMode("distortion"),
  };
}

function parseNumberInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMm(value: number): string {
  return `${value.toFixed(2)} mm`;
}

function resolveLensProfile(id: LensProfileId) {
  return LENS_PROFILES.find((profile) => profile.id === id) ?? LENS_PROFILES[0];
}


function PlaceholderBlock({ title, copy }: { title: string; copy: string }) {
  return (
    <section className={styles.card}>
      <div className={styles.sectionLabel}>{title}</div>
      <div className={styles.placeholder}>{copy}</div>
    </section>
  );
}

export function CalibrationWorkspace() {
  const bedCenterXmm = getBedCenterXmm(CALIBRATION_BED_WIDTH_MM);

  const [activeMode, setActiveMode] =
    React.useState<CalibrationMode>(DEFAULT_CALIBRATION_MODE);
  const [overlayStateByMode, setOverlayStateByMode] = React.useState<OverlayStateByMode>(
    buildDefaultOverlayStateByMode
  );

  const [isLoading, setIsLoading] = React.useState(true);
  const [presets, setPresets] = React.useState<RotaryPlacementPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<RotaryModeDraft>(() =>
    buildEmptyRotaryDraft(bedCenterXmm)
  );
  const [customDraft, setCustomDraft] = React.useState<RotaryModeDraft>(() =>
    buildEmptyRotaryDraft(bedCenterXmm)
  );
  const [lensProfileId, setLensProfileId] = React.useState<LensProfileId>(LENS_PROFILES[0].id);

  const [templateWidthMm, setTemplateWidthMm] = React.useState(String(DEFAULT_TEMPLATE_WIDTH_MM));
  const [templateHeightMm, setTemplateHeightMm] = React.useState("160");
  const [anchorMode, setAnchorMode] = React.useState<TopAnchorMode>("physical-top");
  const [printableOffsetMmDraft, setPrintableOffsetMmDraft] = React.useState("");
  const [shapeType, setShapeType] =
    React.useState<"straight" | "tapered" | "unknown">("straight");
  const [outsideDiameterMmDraft, setOutsideDiameterMmDraft] = React.useState("87");
  const [topDiameterMmDraft, setTopDiameterMmDraft] = React.useState("");
  const [bottomDiameterMmDraft, setBottomDiameterMmDraft] = React.useState("");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    const loaded = getRotaryPresets();
    setPresets(loaded);
    if (loaded.length > 0) {
      setSelectedPresetId(null);
      setDraft(buildEmptyRotaryDraft(bedCenterXmm));
      setCustomDraft(buildEmptyRotaryDraft(bedCenterXmm));
    } else {
      setDraft(buildEmptyRotaryDraft(bedCenterXmm));
      setCustomDraft(buildEmptyRotaryDraft(bedCenterXmm));
    }
    setIsLoading(false);
  }, [bedCenterXmm]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(OVERLAY_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<
        Record<CalibrationMode, CalibrationOverlayToggleState>
      >;
      if (!parsed || typeof parsed !== "object") return;
      setOverlayStateByMode((current) => ({
        ...current,
        ...parsed,
      }));
    } catch {
      // ignore invalid persisted overlay state
    }
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(OVERLAY_STORAGE_KEY, JSON.stringify(overlayStateByMode));
  }, [overlayStateByMode]);

  React.useEffect(() => {
    if (selectedPresetId !== null) return;
    setCustomDraft(draft);
  }, [selectedPresetId, draft]);

  const selectedPreset = React.useMemo(
    () => presets.find((preset) => preset.id === selectedPresetId) ?? null,
    [presets, selectedPresetId]
  );
  const selectedPresetChoice = selectedPresetId ?? CUSTOM_ROTARY_PRESET_ID;
  const lensProfile = resolveLensProfile(lensProfileId);

  const manualRotaryCenterXmm = parseNumberInput(draft.rotaryCenterXmm);
  const manualRotaryTopYmm = parseNumberInput(draft.rotaryTopYmm);
  const rotaryTopYmm = manualRotaryTopYmm ?? 0;
  const templateWidthValue = parseNumberInput(templateWidthMm);
  const templateHeightValue = parseNumberInput(templateHeightMm);
  const printableOffsetMm = parseNumberInput(printableOffsetMmDraft);
  const outsideDiameterMm = parseNumberInput(outsideDiameterMmDraft);
  const topDiameterMm = parseNumberInput(topDiameterMmDraft);
  const bottomDiameterMm = parseNumberInput(bottomDiameterMmDraft);

  const rotaryCenterXmm = resolveRotaryCenterXmm({
    selectedPresetRotaryCenterXmm: selectedPreset?.rotaryCenterXmm,
    manualRotaryCenterXmm,
    bedWidthMm: CALIBRATION_BED_WIDTH_MM,
    preferManualOverride: true,
  });

  const exportPreview = buildExportPlacementPreview({
    workspaceMode: "tumbler-wrap",
    bedWidthMm: CALIBRATION_BED_WIDTH_MM,
    bedHeightMm: DEFAULT_BED_CONFIG.flatHeight,
    rotaryPreset: selectedPreset,
    manualRotaryCenterXmm,
    manualRotaryTopYmm,
    anchorMode,
    printableOffsetMm,
    templateWidthMm: templateWidthValue,
    templateHeightMm: templateHeightValue,
    shapeType,
    outsideDiameterMm,
    topDiameterMm,
    bottomDiameterMm,
  });

  const modeOverlay = overlayStateByMode[activeMode];
  const visibleOverlayKeys = getVisibleOverlayKeysForMode(activeMode);
  const activeCanvasOverlaysBase = buildOverlayStateForMode({
    mode: activeMode,
    toggles: modeOverlay,
  });

  const mountFootprintMm =
    activeMode === "rotary" ? resolveMountFootprintFromDraft(draft) : null;
  const hasRotaryTopAnchor =
    (typeof manualRotaryTopYmm === "number" && Number.isFinite(manualRotaryTopYmm)) ||
    (typeof selectedPreset?.rotaryTopYmm === "number" &&
      Number.isFinite(selectedPreset.rotaryTopYmm));

  const activeCanvasOverlays =
    activeMode === "rotary"
      ? {
          ...activeCanvasOverlaysBase,
          showTopAnchorLine: activeCanvasOverlaysBase.showTopAnchorLine && hasRotaryTopAnchor,
          showMountFootprint:
            activeCanvasOverlaysBase.showMountFootprint && mountFootprintMm !== null,
        }
      : activeCanvasOverlaysBase;

  const readout = formatRotaryPresetReadout({
    preset: selectedPreset,
    draft,
    resolvedRotaryCenterXmm: rotaryCenterXmm,
    resolvedRotaryTopYmm: manualRotaryTopYmm,
  });

  const rotaryWarnings = [
    selectedPresetId === null ? "Using bed center as default rotary axis." : null,
    !hasRotaryTopAnchor
      ? "Top anchor Y is unset. Measure on machine for production placement."
      : null,
    draft.family === "rotoboss-talon" && mountFootprintMm === null
      ? "RotoBoss Talon mount footprint is not verified. Measure on machine."
      : null,
  ].filter((warning): warning is string => Boolean(warning));

  const handleToggleOverlay = React.useCallback(
    (key: CalibrationOverlayKey, enabled: boolean) => {
      setOverlayStateByMode((current) => ({
        ...current,
        [activeMode]: {
          ...current[activeMode],
          [key]: enabled,
        },
      }));
    },
    [activeMode]
  );

  const handleSavePreset = React.useCallback(() => {
    const parsed = validateRotaryPresetDraft(draft);
    if (!parsed.ok) {
      setErrorMessage(parsed.error);
      setStatusMessage(null);
      return;
    }
    try {
      if (selectedPresetId) {
        setPresets(updateRotaryPreset(selectedPresetId, parsed.value));
        setStatusMessage("Preset updated.");
      } else {
        const next = saveRotaryPreset(parsed.value);
        const created = next[next.length - 1] ?? null;
        setPresets(next);
        if (created) {
          setSelectedPresetId(created.id);
          setDraft(buildRotaryDraftFromPreset(created));
        }
        setStatusMessage("Preset created.");
      }
      setErrorMessage(null);
    } catch {
      setErrorMessage("Could not save preset. Try again.");
      setStatusMessage(null);
    }
  }, [draft, selectedPresetId]);

  const handleResetInputs = React.useCallback(() => {
    if (selectedPreset) {
      setDraft(buildRotaryDraftFromPreset(selectedPreset));
      setStatusMessage("Inputs reset to selected preset.");
    } else {
      setDraft(buildEmptyRotaryDraft(bedCenterXmm));
      setStatusMessage("Inputs reset to defaults.");
    }
    setErrorMessage(null);
  }, [selectedPreset, bedCenterXmm]);

  const renderLeftPanel = () => {
    if (activeMode === "rotary") {
      return (
        <>
          <section className={styles.card}>
            <div className={styles.sectionLabel}>Preset Selector</div>
            <label className={styles.field}>
              <span>Rotary Preset</span>
              <select
                className={styles.selectInput}
                value={selectedPresetChoice}
                onChange={(event) => {
                  const nextId = event.target.value;
                  if (nextId === CUSTOM_ROTARY_PRESET_ID) {
                    setSelectedPresetId(null);
                    setDraft(customDraft);
                    setStatusMessage("Using bed center as default rotary axis.");
                    setErrorMessage(null);
                    return;
                  }

                  const preset = presets.find((entry) => entry.id === nextId);
                  if (!preset) return;
                  if (selectedPresetId === null) {
                    setCustomDraft(draft);
                  }
                  setSelectedPresetId(nextId);
                  setDraft(buildRotaryDraftFromPreset(preset));
                  setStatusMessage(`Loaded preset: ${preset.name}`);
                  setErrorMessage(null);
                }}
              >
                <option value={CUSTOM_ROTARY_PRESET_ID}>Custom</option>
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </label>
            {isLoading ? <div className={styles.info}>Loading rotary presets...</div> : null}
            <div className={styles.inlineActions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => {
                  const empty = buildEmptyRotaryDraft(bedCenterXmm);
                  setSelectedPresetId(null);
                  setCustomDraft(empty);
                  setDraft(empty);
                  setStatusMessage("Editing custom rotary values.");
                  setErrorMessage(null);
                }}
              >
                New Custom
              </button>
              {selectedPresetId ? (
                <button
                  type="button"
                  className={styles.dangerBtn}
                  onClick={() => {
                    const next = deleteRotaryPreset(selectedPresetId);
                    setPresets(next);
                    if (next.length > 0) {
                      setSelectedPresetId(null);
                      setDraft(customDraft);
                      setStatusMessage("Preset deleted. Using custom fallback.");
                    } else {
                      setSelectedPresetId(null);
                      setDraft(customDraft);
                      setStatusMessage("Preset deleted. Using custom fallback.");
                    }
                    setErrorMessage(null);
                  }}
                >
                  Delete
                </button>
              ) : null}
            </div>
          </section>
          <section className={styles.card}>
            <div className={styles.sectionLabel}>Rotary Controls</div>
            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span>Preset Name</span>
                <input
                  type="text"
                  className={styles.textInput}
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label className={styles.field}>
                <span>Family</span>
                <select
                  className={styles.selectInput}
                  value={draft.family}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      family: event.target.value as RotaryPresetFamily,
                    }))
                  }
                >
                  {ROTARY_FAMILY_OPTIONS.map((family) => (
                    <option key={family} value={family}>
                      {family}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Rotary Center X (mm)</span>
                <input
                  type="number"
                  className={styles.numInput}
                  value={draft.rotaryCenterXmm}
                  step={0.1}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, rotaryCenterXmm: event.target.value }))
                  }
                />
              </label>
              <label className={styles.field}>
                <span>Rotary Type</span>
                <select
                  className={styles.selectInput}
                  value={draft.chuckOrRoller}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      chuckOrRoller: event.target.value as RotaryDriveType,
                    }))
                  }
                >
                  <option value="chuck">Chuck</option>
                  <option value="roller">Roller</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Top Anchor Y (mm)</span>
                <input
                  type="number"
                  className={styles.numInput}
                  value={draft.rotaryTopYmm}
                  step={0.1}
                  placeholder="Measure on machine"
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, rotaryTopYmm: event.target.value }))
                  }
                />
              </label>
              <label className={styles.field}>
                <span>Mount Pattern X (mm)</span>
                <input
                  type="number"
                  className={styles.numInput}
                  value={draft.mountPatternXmm}
                  step={0.1}
                  placeholder="Measure on machine"
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, mountPatternXmm: event.target.value }))
                  }
                />
              </label>
              <label className={styles.field}>
                <span>Mount Pattern Y (mm)</span>
                <input
                  type="number"
                  className={styles.numInput}
                  value={draft.mountPatternYmm}
                  step={0.1}
                  placeholder="Measure on machine"
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, mountPatternYmm: event.target.value }))
                  }
                />
              </label>
              <label className={styles.field}>
                <span>Bolt Size</span>
                <select
                  className={styles.selectInput}
                  value={draft.mountBoltSize}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      mountBoltSize: event.target.value as RotaryMountBoltSize,
                    }))
                  }
                >
                  {ROTARY_MOUNT_BOLT_OPTIONS.map((boltSize) => (
                    <option key={boltSize} value={boltSize}>
                      {boltSize}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Axis Height (mm)</span>
                <input
                  type="number"
                  className={styles.numInput}
                  value={draft.axisHeightMm}
                  step={0.1}
                  placeholder="Measure on machine"
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, axisHeightMm: event.target.value }))
                  }
                />
              </label>
              <label className={styles.field}>
                <span>Mount Reference</span>
                <select
                  className={styles.selectInput}
                  value={draft.mountReferenceMode}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      mountReferenceMode: event.target.value as RotaryMountReferenceMode,
                    }))
                  }
                >
                  {ROTARY_MOUNT_REFERENCE_OPTIONS.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Bed Origin</span>
                <select
                  className={styles.selectInput}
                  value={draft.bedOrigin}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      bedOrigin: event.target.value as BedOrigin,
                    }))
                  }
                >
                  <option value="top-left">Top-left</option>
                  <option value="top-right">Top-right</option>
                  <option value="bottom-left">Bottom-left</option>
                  <option value="bottom-right">Bottom-right</option>
                </select>
              </label>
              <label className={`${styles.field} ${styles.fullWidth}`}>
                <span>Notes</span>
                <input
                  type="text"
                  className={styles.textInput}
                  value={draft.notes}
                  placeholder="Optional setup notes"
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </label>
            </div>
            <CalibrationOverlayToggles
              value={modeOverlay}
              onToggle={handleToggleOverlay}
              visibleKeys={visibleOverlayKeys}
              title="Rotary Overlays"
            />
          </section>
        </>
      );
    }

    if (activeMode === "export") {
      return (
        <>
          <section className={styles.card}>
            <div className={styles.sectionLabel}>Export Controls</div>
            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span>Template Width (mm)</span>
                <input
                  type="number"
                  className={styles.numInput}
                  value={templateWidthMm}
                  step={0.1}
                  onChange={(event) => setTemplateWidthMm(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>Template Height (mm)</span>
                <input
                  type="number"
                  className={styles.numInput}
                  value={templateHeightMm}
                  step={0.1}
                  onChange={(event) => setTemplateHeightMm(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>Anchor Mode</span>
                <select
                  className={styles.selectInput}
                  value={anchorMode}
                  onChange={(event) => setAnchorMode(event.target.value as TopAnchorMode)}
                >
                  <option value="physical-top">Physical Top</option>
                  <option value="printable-top">Printable Top</option>
                </select>
              </label>
              {anchorMode === "printable-top" ? (
                <label className={styles.field}>
                  <span>Printable Offset (mm)</span>
                  <input
                    type="number"
                    className={styles.numInput}
                    value={printableOffsetMmDraft}
                    step={0.1}
                    onChange={(event) => setPrintableOffsetMmDraft(event.target.value)}
                  />
                </label>
              ) : null}
              <label className={styles.field}>
                <span>Shape Type</span>
                <select
                  className={styles.selectInput}
                  value={shapeType}
                  onChange={(event) =>
                    setShapeType(event.target.value as "straight" | "tapered" | "unknown")
                  }
                >
                  <option value="straight">Straight</option>
                  <option value="tapered">Tapered</option>
                  <option value="unknown">Unknown</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Outside Diameter (mm)</span>
                <input
                  type="number"
                  className={styles.numInput}
                  value={outsideDiameterMmDraft}
                  step={0.1}
                  onChange={(event) => setOutsideDiameterMmDraft(event.target.value)}
                />
              </label>
              {shapeType === "tapered" ? (
                <>
                  <label className={styles.field}>
                    <span>Top Diameter (mm)</span>
                    <input
                      type="number"
                      className={styles.numInput}
                      value={topDiameterMmDraft}
                      step={0.1}
                      onChange={(event) => setTopDiameterMmDraft(event.target.value)}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Bottom Diameter (mm)</span>
                    <input
                      type="number"
                      className={styles.numInput}
                      value={bottomDiameterMmDraft}
                      step={0.1}
                      onChange={(event) => setBottomDiameterMmDraft(event.target.value)}
                    />
                  </label>
                </>
              ) : null}
            </div>
            <CalibrationOverlayToggles
              value={modeOverlay}
              onToggle={handleToggleOverlay}
              visibleKeys={visibleOverlayKeys}
              title="Export Overlays"
            />
          </section>
        </>
      );
    }

    if (activeMode === "lens") {
      return (
        <>
          <section className={styles.card}>
            <div className={styles.sectionLabel}>Lens Controls</div>
            <label className={styles.field}>
              <span>Lens Profile</span>
              <select
                className={styles.selectInput}
                value={lensProfileId}
                onChange={(event) => setLensProfileId(event.target.value as LensProfileId)}
              >
                {LENS_PROFILES.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.label}
                  </option>
                ))}
              </select>
            </label>
            <CalibrationOverlayToggles
              value={modeOverlay}
              onToggle={handleToggleOverlay}
              visibleKeys={visibleOverlayKeys}
              title="Lens Overlays"
            />
          </section>
        </>
      );
    }

    return (
      <PlaceholderBlock
        title="Controls"
        copy={`Compact ${activeMode} controls will be implemented in a follow-up slice.`}
      />
    );
  };

  const renderRightPanel = () => {
    if (activeMode === "rotary") {
      return (
        <>
          <section className={styles.card}>
            <div className={styles.sectionLabel}>Preset Details</div>
            <dl className={styles.valueGrid}>
              <dt>Preset</dt>
              <dd>{readout.presetName}</dd>
              <dt>Family</dt>
              <dd>{readout.family}</dd>
              <dt>Mount Pattern</dt>
              <dd>{readout.mountPattern}</dd>
              <dt>Bolt Size</dt>
              <dd>{readout.boltSize}</dd>
              <dt>Axis Height</dt>
              <dd>{readout.axisHeight}</dd>
              <dt>Axis Center X</dt>
              <dd>{readout.axisCenterX}</dd>
              <dt>Top Anchor Y</dt>
              <dd>{readout.topAnchorY}</dd>
              <dt>Rotary Type</dt>
              <dd>{readout.rotaryType}</dd>
              <dt>Notes</dt>
              <dd>{readout.notes}</dd>
            </dl>
            {rotaryWarnings.map((warning) => (
              <div key={warning} className={styles.warning}>
                {warning}
              </div>
            ))}
          </section>
          <section className={styles.card}>
            <div className={styles.sectionLabel}>Actions</div>
            <div className={styles.stackActions}>
              <button type="button" className={styles.primaryBtn} onClick={handleSavePreset}>
                Save Preset
              </button>
              <button type="button" className={styles.secondaryBtn} onClick={handleResetInputs}>
                Reset Inputs
              </button>
            </div>
            {(errorMessage || statusMessage) && (
              <div className={errorMessage ? styles.error : styles.status}>
                {errorMessage ?? statusMessage}
              </div>
            )}
          </section>
        </>
      );
    }

    if (activeMode === "export") {
      return (
        <section className={styles.card}>
          <div className={styles.sectionLabel}>Export Readout</div>
          <dl className={styles.valueGrid}>
            <dt>Origin X</dt>
            <dd>
              {exportPreview.exportOriginXmm !== undefined
                ? formatMm(exportPreview.exportOriginXmm)
                : "n/a"}
            </dd>
            <dt>Origin Y</dt>
            <dd>
              {exportPreview.exportOriginYmm !== undefined
                ? formatMm(exportPreview.exportOriginYmm)
                : "n/a"}
            </dd>
            <dt>Template W</dt>
            <dd>{templateWidthValue ? formatMm(templateWidthValue) : "n/a"}</dd>
            <dt>Template H</dt>
            <dd>{templateHeightValue ? formatMm(templateHeightValue) : "n/a"}</dd>
            <dt>Recommended Diameter</dt>
            <dd>{formatRotaryValue(exportPreview.recommendedObjectDiameterMm)}</dd>
          </dl>
          {exportPreview.warnings.map((warning) => (
            <div key={warning} className={styles.warning}>
              {warning}
            </div>
          ))}
        </section>
      );
    }

    if (activeMode === "lens") {
      return (
        <section className={styles.card}>
          <div className={styles.sectionLabel}>Lens Readout</div>
          <dl className={styles.valueGrid}>
            <dt>Lens Profile</dt>
            <dd>{lensProfile.label}</dd>
            <dt>Lens Inset</dt>
            <dd>{formatMm(lensProfile.fieldInsetMm)}</dd>
          </dl>
        </section>
      );
    }

    return (
      <PlaceholderBlock
        title="Readout"
        copy={`Compact ${activeMode} readout and warnings are staged as placeholders.`}
      />
    );
  };

  return (
    <section className={styles.workspaceShell}>
      <header className={styles.modeHeader}>
        <div className={styles.modeHeaderText}>
          <div className={styles.sectionLabel}>Calibration Workspace</div>
          <div className={styles.info}>One shared bed canvas with mode-based overlays.</div>
        </div>
        <CalibrationModeSwitcher
          activeMode={activeMode}
          modes={CALIBRATION_MODE_DEFINITIONS}
          onChange={setActiveMode}
        />
      </header>

      <div className={styles.workspace}>
        <aside className={styles.leftPanel}>{renderLeftPanel()}</aside>

        <div className={styles.centerPanel}>
          <CalibrationBedReference
            bedWidthMm={DEFAULT_BED_CONFIG.flatWidth}
            bedHeightMm={DEFAULT_BED_CONFIG.flatHeight}
            rotaryCenterXmm={rotaryCenterXmm}
            topAnchorYmm={exportPreview.exportOriginYmm ?? rotaryTopYmm}
            mountFootprintMm={mountFootprintMm}
            lensInsetMm={lensProfile.fieldInsetMm}
            bedOrigin={draft.bedOrigin}
            overlays={activeCanvasOverlays}
            exportPlacementPreview={exportPreview}
          />
        </div>

        <aside className={styles.rightPanel}>
          <section className={styles.card}>
            <div className={styles.sectionLabel}>Bed Reference</div>
            <div className={styles.info}>
              Pattern: 6 mm holes | 25 x 25 mm | staggered rows (12.5 mm offset).
            </div>
            <div className={styles.info}>
              Bed: {DEFAULT_BED_CONFIG.flatWidth} x {DEFAULT_BED_CONFIG.flatHeight} mm
            </div>
          </section>
          {renderRightPanel()}
        </aside>
      </div>
    </section>
  );
}
