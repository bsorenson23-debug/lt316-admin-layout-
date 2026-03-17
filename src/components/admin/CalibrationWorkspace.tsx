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
import type { CalibrationOverlayKey } from "@/utils/calibrationBedReference";
import { buildExportPlacementPreview } from "@/utils/calibrationExportPreview";
import {
  CALIBRATION_MODE_DEFINITIONS,
  DEFAULT_CALIBRATION_MODE,
  type CalibrationMode,
  buildOverlayStateForMode,
  getVisibleOverlayKeysForMode,
  resolveCalibrationMode,
} from "@/utils/calibrationModes";
import { getBedCenterXmm, resolveRotaryCenterXmm } from "@/utils/rotaryCenter";
import {
  buildRotaryFootprintFromAnchor,
  formatAnchorReadout,
  isManualRotaryOverrideActive,
  resolveRotaryAxisFromAnchor,
  selectRotaryAnchorHole,
  toBedHoleReference,
  type RotaryHoleAnchorSelection,
} from "@/utils/rotaryAnchoring";
import {
  getRotaryBaseVisualForPreset,
  placeRotaryBaseFromAnchor,
} from "@/utils/rotaryBaseVisual";
import {
  deleteRotaryPreset,
  getRotaryPresets,
  isSeededRotaryPresetId,
  resetRotaryPresetToDefault,
  saveRotaryPreset,
  saveRotaryPresetAsCustom,
  updateRotaryPreset,
} from "@/utils/adminCalibrationState";
import {
  buildDefaultCalibrationOverlayStateByMode,
  loadCalibrationWorkspaceState,
  resetCalibrationWorkspaceState,
  saveCalibrationWorkspaceState,
  type CalibrationOverlayStateByMode,
} from "@/utils/calibrationWorkspaceState";
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
import {
  RotaryMeasurementGuide,
  type RotaryMeasurementFocus,
} from "./RotaryMeasurementGuide";
import styles from "./CalibrationWorkspace.module.css";

const DEFAULT_TEMPLATE_WIDTH_MM = 276.15;
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
  "front-right-bolt",
  "front-edge-center",
  "custom",
];

const ROTARY_OVERLAY_LABELS: Partial<Record<CalibrationOverlayKey, string>> = {
  showHoleGrid: "Show hole grid",
  showCenterline: "Show bed centerline",
  showOrigin: "Show origin",
  showRotaryCenterline: "Show rotary axis",
  showTopAnchorLine: "Show top line",
  showMountFootprint: "Show mount footprint",
};

type LensProfileId = (typeof LENS_PROFILES)[number]["id"];

function parseNumberInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMm(value: number): string {
  return `${value.toFixed(2)} mm`;
}

function isFinitePositive(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function formatMaybeMm(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? formatMm(value) : "n/a";
}

function formatAnchorCoordinate(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(2)} mm`
    : "n/a";
}

function getShapeLabel(value: "straight" | "tapered" | "unknown"): string {
  if (value === "straight") return "Straight";
  if (value === "tapered") return "Tapered";
  return "Unknown";
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
  const [overlayStateByMode, setOverlayStateByMode] =
    React.useState<CalibrationOverlayStateByMode>(
      buildDefaultCalibrationOverlayStateByMode
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
  const [activeMeasurementFocus, setActiveMeasurementFocus] =
    React.useState<RotaryMeasurementFocus | null>(null);
  const [rotaryAnchorSelection, setRotaryAnchorSelection] =
    React.useState<RotaryHoleAnchorSelection>({});
  const [manualRotaryOverrideEnabled, setManualRotaryOverrideEnabled] =
    React.useState(false);

  React.useEffect(() => {
    const loadedPresets = getRotaryPresets();
    const persisted = loadCalibrationWorkspaceState();
    const emptyDraft = buildEmptyRotaryDraft(bedCenterXmm);
    const restoredCustomDraft = persisted.customRotaryDraft ?? emptyDraft;
    const restoredSelectedPresetId =
      persisted.selectedRotaryPresetId &&
      loadedPresets.some((preset) => preset.id === persisted.selectedRotaryPresetId)
        ? persisted.selectedRotaryPresetId
        : null;

    const selectedPreset =
      restoredSelectedPresetId
        ? loadedPresets.find((preset) => preset.id === restoredSelectedPresetId) ?? null
        : null;

    setPresets(loadedPresets);
    setActiveMode(resolveCalibrationMode(persisted.activeCalibrationMode));
    setOverlayStateByMode(persisted.overlayStateByMode);
    setAnchorMode(persisted.anchorMode);
    setSelectedPresetId(restoredSelectedPresetId);
    setCustomDraft(restoredCustomDraft);
    setRotaryAnchorSelection(persisted.rotaryAnchorSelection ?? {});
    setManualRotaryOverrideEnabled(Boolean(persisted.manualRotaryOverrideEnabled));
    setDraft(
      persisted.currentRotaryDraft ??
        (selectedPreset
          ? buildRotaryDraftFromPreset(selectedPreset)
          : restoredCustomDraft)
    );
    setIsLoading(false);
  }, [bedCenterXmm]);

  React.useEffect(() => {
    if (isLoading) return;
    saveCalibrationWorkspaceState({
      activeCalibrationMode: activeMode,
      selectedRotaryPresetId: selectedPresetId,
      overlayStateByMode,
      anchorMode,
      customRotaryDraft: customDraft,
      currentRotaryDraft: draft,
      rotaryAnchorSelection,
      manualRotaryOverrideEnabled,
    });
  }, [
    activeMode,
    anchorMode,
    customDraft,
    draft,
    isLoading,
    manualRotaryOverrideEnabled,
    overlayStateByMode,
    rotaryAnchorSelection,
    selectedPresetId,
  ]);

  React.useEffect(() => {
    if (selectedPresetId !== null) return;
    setCustomDraft(draft);
  }, [selectedPresetId, draft]);

  React.useEffect(() => {
    if (activeMode !== "rotary") {
      setActiveMeasurementFocus(null);
    }
  }, [activeMode]);

  const selectedPreset = React.useMemo(
    () => presets.find((preset) => preset.id === selectedPresetId) ?? null,
    [presets, selectedPresetId]
  );
  const selectedPresetChoice = selectedPresetId ?? CUSTOM_ROTARY_PRESET_ID;
  const lensProfile = resolveLensProfile(lensProfileId);

  const manualRotaryCenterXmm = parseNumberInput(draft.rotaryCenterXmm);
  const manualRotaryTopYmm = parseNumberInput(draft.rotaryTopYmm);
  const referenceToAxisOffsetXmm = parseNumberInput(draft.referenceToAxisOffsetXmm);
  const referenceToAxisOffsetYmm = parseNumberInput(draft.referenceToAxisOffsetYmm);
  const resolvedAxisFromAnchor = resolveRotaryAxisFromAnchor({
    selection: rotaryAnchorSelection,
    referenceToAxisOffsetXmm,
    referenceToAxisOffsetYmm,
  });
  const isManualCenterActive = isManualRotaryOverrideActive({
    manualOverrideEnabled: manualRotaryOverrideEnabled,
    manualRotaryCenterXmm,
  });
  const fallbackRotaryCenterXmm = resolveRotaryCenterXmm({
    selectedPresetRotaryCenterXmm: selectedPreset?.rotaryCenterXmm,
    manualRotaryCenterXmm: isManualCenterActive ? manualRotaryCenterXmm : undefined,
    bedWidthMm: CALIBRATION_BED_WIDTH_MM,
    preferManualOverride: true,
  });
  const rotaryCenterXmm =
    !isManualCenterActive && resolvedAxisFromAnchor.isResolved
      ? resolvedAxisFromAnchor.rotaryAxisXmm ?? fallbackRotaryCenterXmm
      : fallbackRotaryCenterXmm;
  const resolvedTopAnchorYmm = manualRotaryTopYmm ?? selectedPreset?.rotaryTopYmm ?? 0;
  const rotaryAxisYmm = resolvedAxisFromAnchor.rotaryAxisYmm;
  const templateWidthValue = parseNumberInput(templateWidthMm);
  const templateHeightValue = parseNumberInput(templateHeightMm);
  const printableOffsetMm = parseNumberInput(printableOffsetMmDraft);
  const outsideDiameterMm = parseNumberInput(outsideDiameterMmDraft);
  const topDiameterMm = parseNumberInput(topDiameterMmDraft);
  const bottomDiameterMm = parseNumberInput(bottomDiameterMmDraft);
  const hasAppliedTemplateData = [
    templateWidthValue,
    templateHeightValue,
    outsideDiameterMm,
    topDiameterMm,
    bottomDiameterMm,
  ].some((value) => isFinitePositive(value));
  const appliedProductLabel = hasAppliedTemplateData
    ? `${getShapeLabel(shapeType)} tumbler`
    : "No applied tumbler data";

  const exportPreview = buildExportPlacementPreview({
    workspaceMode: "tumbler-wrap",
    bedWidthMm: CALIBRATION_BED_WIDTH_MM,
    bedHeightMm: DEFAULT_BED_CONFIG.flatHeight,
    rotaryPreset: selectedPreset,
    manualRotaryCenterXmm: rotaryCenterXmm,
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

  const mountFootprintDimensions =
    activeMode === "rotary" ? resolveMountFootprintFromDraft(draft) : null;
  const mountFootprintBoxMm =
    activeMode === "rotary"
      ? buildRotaryFootprintFromAnchor({
          selection: rotaryAnchorSelection,
          mountReferenceMode: draft.mountReferenceMode,
          mountPatternXmm: mountFootprintDimensions?.widthMm,
          mountPatternYmm: mountFootprintDimensions?.heightMm,
          resolvedAxisXmm: rotaryCenterXmm,
          resolvedAxisYmm: rotaryAxisYmm,
        })
      : null;
  const rotaryBaseVisual =
    activeMode === "rotary"
      ? getRotaryBaseVisualForPreset({
          preset: selectedPreset,
          mountPatternXmm: mountFootprintDimensions?.widthMm,
          mountPatternYmm: mountFootprintDimensions?.heightMm,
          mountReferenceMode: draft.mountReferenceMode,
        })
      : null;
  const placedRotaryBaseVisual =
    activeMode === "rotary" && rotaryBaseVisual
      ? placeRotaryBaseFromAnchor({
          baseVisual: rotaryBaseVisual,
          selection: rotaryAnchorSelection,
          rotaryAxisXmm: rotaryCenterXmm,
          rotaryAxisYmm: rotaryAxisYmm,
          referenceToAxisOffsetXmm,
          referenceToAxisOffsetYmm,
        })
      : null;
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
            activeCanvasOverlaysBase.showMountFootprint &&
            (placedRotaryBaseVisual !== null ||
              mountFootprintBoxMm !== null ||
              mountFootprintDimensions !== null),
        }
      : activeCanvasOverlaysBase;

  const readout = formatRotaryPresetReadout({
    preset: selectedPreset,
    draft,
    resolvedRotaryCenterXmm: rotaryCenterXmm,
    resolvedRotaryTopYmm: manualRotaryTopYmm ?? selectedPreset?.rotaryTopYmm ?? null,
  });
  const selectedPresetIsSeeded = selectedPreset
    ? isSeededRotaryPresetId(selectedPreset.id)
    : false;
  const presetSourceLabel = selectedPreset
    ? selectedPresetIsSeeded
      ? "Using default preset"
      : "Using custom preset"
    : "Using custom draft";
  const baselineDraft = selectedPreset
    ? buildRotaryDraftFromPreset(selectedPreset)
    : customDraft;
  const hasUnsavedChanges = JSON.stringify(draft) !== JSON.stringify(baselineDraft);
  const anchorPrimaryLabel = formatAnchorReadout(rotaryAnchorSelection.primaryHole);
  const anchorSecondaryLabel = formatAnchorReadout(rotaryAnchorSelection.secondaryHole);
  const anchorCoordinateLabel = rotaryAnchorSelection.primaryHole
    ? `${rotaryAnchorSelection.primaryHole.xMm.toFixed(1)}, ${rotaryAnchorSelection.primaryHole.yMm.toFixed(1)} mm`
    : "n/a";
  const placementSourceLabel = isManualCenterActive
    ? "Manual override"
    : resolvedAxisFromAnchor.isResolved
      ? "Calculated from bed hole anchor"
      : selectedPreset
        ? "Preset/default center"
        : "Bed-center fallback";
  const hasManualAnchorConflict =
    isManualCenterActive &&
    resolvedAxisFromAnchor.isResolved &&
    typeof manualRotaryCenterXmm === "number" &&
    typeof resolvedAxisFromAnchor.rotaryAxisXmm === "number" &&
    Math.abs(manualRotaryCenterXmm - resolvedAxisFromAnchor.rotaryAxisXmm) > 0.01;

  const rotaryWarnings = [
    !rotaryAnchorSelection.primaryHole
      ? "No bed hole anchor selected. Click a bed hole to anchor rotary placement."
      : null,
    resolvedAxisFromAnchor.isResolved ? null : resolvedAxisFromAnchor.missing[0] ?? null,
    !isManualCenterActive && !resolvedAxisFromAnchor.isResolved && selectedPresetId === null
      ? "Using bed center as default rotary axis."
      : null,
    hasManualAnchorConflict
      ? "Manual override differs from calculated anchor axis."
      : null,
    !hasRotaryTopAnchor
      ? "Top anchor Y is unset. Measure on machine for production placement."
      : null,
    draft.mountReferenceMode === "custom"
      ? "Mount reference mode is custom. Verify offsets on machine."
      : null,
    placedRotaryBaseVisual?.isPlaceholder
      ? "Using simplified base visual. Confirm measured mount geometry on machine."
      : null,
    draft.family === "rotoboss-talon" && mountFootprintDimensions === null
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

  const handleMeasurementFieldFocus = React.useCallback(
    (field: RotaryMeasurementFocus) => {
      setActiveMeasurementFocus(field);
    },
    []
  );

  const handleMeasurementFieldBlur = React.useCallback(() => {
    setActiveMeasurementFocus(null);
  }, []);

  const handleAnchorHoleSelect = React.useCallback(
    (args: {
      rowIndex: number;
      columnIndex: number;
      xMm: number;
      yMm: number;
      asSecondary: boolean;
    }) => {
      const holeRef = toBedHoleReference({
        rowIndex: args.rowIndex,
        columnIndex: args.columnIndex,
        xMm: args.xMm,
        yMm: args.yMm,
      });
      setRotaryAnchorSelection((current) =>
        selectRotaryAnchorHole({
          current,
          hole: holeRef,
          asSecondary: args.asSecondary,
        })
      );
      setManualRotaryOverrideEnabled(false);
      setErrorMessage(null);
      setStatusMessage(
        args.asSecondary
          ? `Secondary anchor set: R${holeRef.row + 1} C${holeRef.col + 1}`
          : `Anchor set: R${holeRef.row + 1} C${holeRef.col + 1}`
      );
    },
    []
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
        setStatusMessage("Preset saved.");
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

  const handleSaveAsCustomPreset = React.useCallback(() => {
    const parsed = validateRotaryPresetDraft(draft);
    if (!parsed.ok) {
      setErrorMessage(parsed.error);
      setStatusMessage(null);
      return;
    }

    const customName =
      selectedPreset && parsed.value.name === selectedPreset.name
        ? `${parsed.value.name} Custom`
        : parsed.value.name;

    try {
      const next = saveRotaryPresetAsCustom({
        ...parsed.value,
        name: customName,
      });
      const created = next[next.length - 1] ?? null;
      setPresets(next);
      if (created) {
        setSelectedPresetId(created.id);
        setDraft(buildRotaryDraftFromPreset(created));
      }
      setErrorMessage(null);
      setStatusMessage("Saved as custom preset.");
    } catch {
      setErrorMessage("Could not save custom preset. Try again.");
      setStatusMessage(null);
    }
  }, [draft, selectedPreset]);

  const handleResetInputs = React.useCallback(() => {
    if (selectedPreset) {
      if (isSeededRotaryPresetId(selectedPreset.id)) {
        const next = resetRotaryPresetToDefault(selectedPreset.id);
        const restored =
          next.find((preset) => preset.id === selectedPreset.id) ?? selectedPreset;
        setPresets(next);
        setDraft(buildRotaryDraftFromPreset(restored));
        setStatusMessage("Seeded preset restored to factory defaults.");
      } else {
        setDraft(buildRotaryDraftFromPreset(selectedPreset));
        setStatusMessage("Custom preset reset to saved values.");
      }
    } else {
      const empty = buildEmptyRotaryDraft(bedCenterXmm);
      setDraft(empty);
      setCustomDraft(empty);
      setStatusMessage("Custom draft reset.");
    }
    setManualRotaryOverrideEnabled(false);
    setErrorMessage(null);
  }, [bedCenterXmm, selectedPreset]);

  const handleResetWorkspace = React.useCallback(() => {
    const defaults = resetCalibrationWorkspaceState();
    const empty = buildEmptyRotaryDraft(bedCenterXmm);
    setActiveMode(defaults.activeCalibrationMode);
    setOverlayStateByMode(defaults.overlayStateByMode);
    setAnchorMode(defaults.anchorMode);
    setSelectedPresetId(null);
    setDraft(empty);
    setCustomDraft(empty);
    setRotaryAnchorSelection(defaults.rotaryAnchorSelection ?? {});
    setManualRotaryOverrideEnabled(Boolean(defaults.manualRotaryOverrideEnabled));
    setStatusMessage("Workspace preferences reset to defaults.");
    setErrorMessage(null);
  }, [bedCenterXmm]);

  const renderLeftPanel = () => {
    if (activeMode === "rotary") {
      return (
        <>
          <section className={styles.card}>
            <div className={styles.sectionLabel}>Rotary Setup</div>
            <div className={styles.subSection}>
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
                      setManualRotaryOverrideEnabled(false);
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
                    setManualRotaryOverrideEnabled(false);
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
                  className={styles.quietBtn}
                  onClick={() => {
                    const empty = buildEmptyRotaryDraft(bedCenterXmm);
                    setSelectedPresetId(null);
                    setCustomDraft(empty);
                    setDraft(empty);
                    setManualRotaryOverrideEnabled(false);
                    setStatusMessage("Editing custom rotary values.");
                    setErrorMessage(null);
                  }}
                >
                  New Custom
                </button>
                {selectedPresetId && selectedPreset && !isSeededRotaryPresetId(selectedPreset.id) ? (
                  <button
                    type="button"
                    className={styles.dangerBtn}
                    onClick={() => {
                      const next = deleteRotaryPreset(selectedPresetId);
                      setPresets(next);
                      if (next.length > 0) {
                        setSelectedPresetId(null);
                        setDraft(customDraft);
                        setManualRotaryOverrideEnabled(false);
                        setStatusMessage("Preset deleted. Using custom fallback.");
                      } else {
                        setSelectedPresetId(null);
                        setDraft(customDraft);
                        setManualRotaryOverrideEnabled(false);
                        setStatusMessage("Preset deleted. Using custom fallback.");
                      }
                      setErrorMessage(null);
                    }}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </div>

            <div className={styles.subSection}>
              <label className={styles.field}>
                <span>Setup Name</span>
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
                <span>Rotary Model</span>
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
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.sectionLabel}>Rotary Position &amp; Mounting</div>

            <div className={styles.subSection}>
              <div className={styles.subSectionTitle}>Bed Hole Anchor</div>
              <div className={styles.info}>
                Click a bed hole to set the primary anchor. Shift+click to set secondary.
              </div>
              <dl className={styles.valueGrid}>
                <dt>Selected Anchor Hole</dt>
                <dd>{anchorPrimaryLabel}</dd>
                <dt>Secondary Hole</dt>
                <dd>{anchorSecondaryLabel}</dd>
                <dt>Calculated Rotary Center (X)</dt>
                <dd>{formatAnchorCoordinate(rotaryCenterXmm)}</dd>
                <dt>Calculated Rotary Position (Y)</dt>
                <dd>{formatAnchorCoordinate(rotaryAxisYmm)}</dd>
              </dl>
              <label className={styles.field}>
                <span>Reference to Axis Offset (X)</span>
                <input
                  type="number"
                  className={styles.numInput}
                  value={draft.referenceToAxisOffsetXmm}
                  step={0.1}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      referenceToAxisOffsetXmm: event.target.value,
                    }))
                  }
                />
              </label>
              <label className={styles.field}>
                <span>Reference to Axis Offset (Y)</span>
                <input
                  type="number"
                  className={styles.numInput}
                  value={draft.referenceToAxisOffsetYmm}
                  step={0.1}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      referenceToAxisOffsetYmm: event.target.value,
                    }))
                  }
                />
              </label>
              <div className={styles.inlineActions}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => {
                    setRotaryAnchorSelection({});
                    setStatusMessage("Bed hole anchor cleared.");
                    setErrorMessage(null);
                  }}
                >
                  Clear Anchor
                </button>
              </div>
            </div>

            <div className={styles.subSection}>
              <div className={styles.subSectionTitle}>Rotary Position</div>
              <label className={styles.checkboxField}>
                <input
                  type="checkbox"
                  checked={manualRotaryOverrideEnabled}
                  onChange={(event) =>
                    setManualRotaryOverrideEnabled(event.target.checked)
                  }
                />
                <span>Manual Override</span>
              </label>
              <label className={styles.field}>
                <span>Rotary Center Position (X)</span>
                <input
                  type="number"
                  className={styles.numInput}
                  value={draft.rotaryCenterXmm}
                  step={0.1}
                  disabled={!manualRotaryOverrideEnabled}
                  onFocus={() =>
                    handleMeasurementFieldFocus("Rotary Center Position (X)")
                  }
                  onBlur={handleMeasurementFieldBlur}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, rotaryCenterXmm: event.target.value }));
                    setManualRotaryOverrideEnabled(true);
                  }}
                />
              </label>
              <label className={styles.field}>
                <span>Top of Tumbler Position (Y)</span>
                <input
                  type="number"
                  className={styles.numInput}
                  value={draft.rotaryTopYmm}
                  step={0.1}
                  onFocus={() =>
                    handleMeasurementFieldFocus("Top of Tumbler Position (Y)")
                  }
                  onBlur={handleMeasurementFieldBlur}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, rotaryTopYmm: event.target.value }))
                  }
                />
              </label>
              <label className={styles.field}>
                <span>Rotary Style</span>
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
              <div className={styles.helperText}>
                Bed-hole anchoring is preferred. Manual center is an advanced fallback.
              </div>
            </div>

            <div className={styles.subSection}>
              <div className={styles.subSectionTitle}>Mounting Details</div>
              <label className={styles.field}>
                <span>Mount Hole Spacing (X)</span>
                <input
                  type="number"
                  className={styles.numInput}
                  value={draft.mountPatternXmm}
                  step={0.1}
                  onFocus={() =>
                    handleMeasurementFieldFocus("Mount Hole Spacing (X)")
                  }
                  onBlur={handleMeasurementFieldBlur}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, mountPatternXmm: event.target.value }))
                  }
                />
              </label>
              <label className={styles.field}>
                <span>Mount Hole Spacing (Y)</span>
                <input
                  type="number"
                  className={styles.numInput}
                  value={draft.mountPatternYmm}
                  step={0.1}
                  onFocus={() =>
                    handleMeasurementFieldFocus("Mount Hole Spacing (Y)")
                  }
                  onBlur={handleMeasurementFieldBlur}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, mountPatternYmm: event.target.value }))
                  }
                />
              </label>
              <label className={styles.field}>
                <span>Mount Bolt Size</span>
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
                <span>Rotary Axis Height</span>
                <input
                  type="number"
                  className={styles.numInput}
                  value={draft.axisHeightMm}
                  step={0.1}
                  onFocus={() =>
                    handleMeasurementFieldFocus("Rotary Axis Height")
                  }
                  onBlur={handleMeasurementFieldBlur}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, axisHeightMm: event.target.value }))
                  }
                />
              </label>
              <label className={styles.field}>
                <span>Mount Reference Point</span>
                <select
                  className={styles.selectInput}
                  value={draft.mountReferenceMode}
                  onFocus={() =>
                    handleMeasurementFieldFocus("Mount Reference Point")
                  }
                  onBlur={handleMeasurementFieldBlur}
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
                <span>Machine Origin</span>
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
              <label className={styles.field}>
                <span>Setup Notes</span>
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
              <div className={styles.helperText}>Measure on machine if unknown.</div>
            </div>

            <CalibrationOverlayToggles
              value={modeOverlay}
              onToggle={handleToggleOverlay}
              visibleKeys={visibleOverlayKeys}
              title="Bed View Options"
              labelOverrides={ROTARY_OVERLAY_LABELS}
            />
          </section>

          <section className={styles.card}>
            <div className={styles.sectionLabel}>Measurement Guide</div>
            <RotaryMeasurementGuide activeMeasurement={activeMeasurementFocus} />
          </section>
        </>
      );
    }

    if (activeMode === "export") {
      return (
        <>
          <section className={styles.card}>
            <div className={styles.sectionLabel}>Export Context</div>
            <dl className={styles.valueGrid}>
              <dt>Rotary Preset</dt>
              <dd>{selectedPreset?.name ?? "None selected"}</dd>
              <dt>Applied Product</dt>
              <dd>{appliedProductLabel}</dd>
              <dt>Anchor Mode</dt>
              <dd>{anchorMode}</dd>
            </dl>
            {!selectedPreset ? (
              <div className={styles.warning}>Using bed-center rotary axis fallback.</div>
            ) : null}
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
                <span>Top Safe Offset (mm)</span>
                <input
                  type="number"
                  className={styles.numInput}
                  value={printableOffsetMmDraft}
                  step={0.1}
                  placeholder="Optional printable-top offset"
                  onChange={(event) => setPrintableOffsetMmDraft(event.target.value)}
                />
              </label>
            ) : null}
            <CalibrationOverlayToggles
              value={modeOverlay}
              onToggle={handleToggleOverlay}
              visibleKeys={visibleOverlayKeys}
              title="Export Overlays"
            />
          </section>

          <section className={styles.card}>
            <div className={styles.sectionLabel}>Applied Template Snapshot</div>
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
            <div className={styles.info}>
              Export mode is preview-only; update these values only to validate placement.
            </div>
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
              <dt>Base Visual</dt>
              <dd>
                {rotaryBaseVisual
                  ? `${rotaryBaseVisual.widthMm.toFixed(1)} x ${rotaryBaseVisual.depthMm.toFixed(1)} mm${
                      rotaryBaseVisual.isPlaceholder ? " (placeholder)" : ""
                    }`
                  : "Unavailable"}
              </dd>
              <dt>Bolt Size</dt>
              <dd>{readout.boltSize}</dd>
              <dt>Axis Height</dt>
              <dd>{readout.axisHeight}</dd>
              <dt>Selected Anchor</dt>
              <dd>{anchorPrimaryLabel}</dd>
              <dt>Anchor Coordinates</dt>
              <dd>{anchorCoordinateLabel}</dd>
              <dt>Secondary Anchor</dt>
              <dd>{anchorSecondaryLabel}</dd>
              <dt>Reference Offset X</dt>
              <dd>{readout.referenceToAxisOffsetX}</dd>
              <dt>Reference Offset Y</dt>
              <dd>{readout.referenceToAxisOffsetY}</dd>
              <dt>Anchor Reference</dt>
              <dd>
                {placedRotaryBaseVisual
                  ? `${placedRotaryBaseVisual.anchorPoint.xMm.toFixed(1)}, ${placedRotaryBaseVisual.anchorPoint.yMm.toFixed(1)} mm`
                  : "n/a"}
              </dd>
              <dt>Calculated Axis X</dt>
              <dd>{readout.axisCenterX}</dd>
              <dt>Calculated Axis Y</dt>
              <dd>{formatAnchorCoordinate(rotaryAxisYmm)}</dd>
              <dt>Top Anchor Y</dt>
              <dd>{readout.topAnchorY}</dd>
              <dt>Rotary Type</dt>
              <dd>{readout.rotaryType}</dd>
              <dt>Placement Source</dt>
              <dd>{placementSourceLabel}</dd>
              <dt>Notes</dt>
              <dd>{readout.notes}</dd>
            </dl>
            <div className={styles.info}>{presetSourceLabel}</div>
            <div className={styles.info}>{hasUnsavedChanges ? "Unsaved changes" : "Saved"}</div>
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
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={handleSaveAsCustomPreset}
              >
                Save as Custom
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
        <>
          <section className={styles.card}>
            <div className={styles.sectionLabel}>Export Placement Preview</div>
            <dl className={styles.valueGrid}>
              <dt>Rotary Preset</dt>
              <dd>{exportPreview.presetName ?? "None selected"}</dd>
              <dt>Anchor Mode</dt>
              <dd>{exportPreview.anchorMode}</dd>
              <dt>Origin X</dt>
              <dd>{formatMaybeMm(exportPreview.exportOriginXmm)}</dd>
              <dt>Origin Y</dt>
              <dd>{formatMaybeMm(exportPreview.exportOriginYmm)}</dd>
              <dt>Template W</dt>
              <dd>{formatMaybeMm(exportPreview.templateWidthMm)}</dd>
              <dt>Template H</dt>
              <dd>{formatMaybeMm(exportPreview.templateHeightMm)}</dd>
              <dt>Object Diameter</dt>
              <dd>{formatRotaryValue(exportPreview.recommendedObjectDiameterMm)}</dd>
              <dt>Wrap Width</dt>
              <dd>{formatRotaryValue(exportPreview.recommendedCircumferenceMm)}</dd>
            </dl>
          </section>

          <section className={styles.summaryCard}>
            <div className={styles.sectionLabel}>LightBurn Setup Note</div>
            <div className={styles.info}>{exportPreview.setupSummary ?? "Setup summary unavailable."}</div>
            {exportPreview.notes.map((note) => (
              <div key={note} className={styles.info}>
                {note}
              </div>
            ))}
          </section>

          {exportPreview.warnings.map((warning) => (
            <div key={warning} className={styles.warning}>
              {warning}
            </div>
          ))}
        </>
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
        <div className={styles.modeHeaderActions}>
          <button type="button" className={styles.secondaryBtn} onClick={handleResetWorkspace}>
            Reset Workspace
          </button>
          <CalibrationModeSwitcher
            activeMode={activeMode}
            modes={CALIBRATION_MODE_DEFINITIONS}
            onChange={setActiveMode}
          />
        </div>
      </header>

      <div className={styles.workspace}>
        <aside className={styles.leftPanel}>{renderLeftPanel()}</aside>

        <div className={styles.centerPanel}>
          <CalibrationBedReference
            bedWidthMm={DEFAULT_BED_CONFIG.flatWidth}
            bedHeightMm={DEFAULT_BED_CONFIG.flatHeight}
            rotaryCenterXmm={placedRotaryBaseVisual?.axisCenter.xMm ?? rotaryCenterXmm}
            topAnchorYmm={resolvedTopAnchorYmm}
            mountFootprintMm={mountFootprintDimensions}
            mountFootprintBoxMm={mountFootprintBoxMm}
            lensInsetMm={lensProfile.fieldInsetMm}
            bedOrigin={draft.bedOrigin}
            overlays={activeCanvasOverlays}
            exportPlacementPreview={exportPreview}
            holeSelectionEnabled={activeMode === "rotary"}
            selectedAnchorHoles={rotaryAnchorSelection}
            rotaryBaseVisual={placedRotaryBaseVisual}
            onBedHoleSelect={activeMode === "rotary" ? handleAnchorHoleSelect : undefined}
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
