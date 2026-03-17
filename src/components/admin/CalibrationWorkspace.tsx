"use client";

import React from "react";
import { DEFAULT_BED_CONFIG } from "@/types/admin";
import type { BedOrigin, RotaryDriveType, RotaryPlacementPreset } from "@/types/export";
import {
  buildRotaryPlacementPreview,
  type RotaryPreviewValues,
} from "@/utils/rotaryCalibration";
import {
  DEFAULT_CALIBRATION_OVERLAY_TOGGLES,
  type CalibrationOverlayKey,
} from "@/utils/calibrationBedReference";
import {
  deleteRotaryPreset,
  getRotaryPresets,
  saveRotaryPreset,
  updateRotaryPreset,
} from "@/utils/adminCalibrationState";
import { CalibrationBedReference } from "./CalibrationBedReference";
import { CalibrationOverlayToggles } from "./CalibrationOverlayToggles";
import { RotaryPlacementPreview } from "./RotaryPlacementPreview";
import { RotaryPresetList } from "./RotaryPresetList";
import styles from "./CalibrationWorkspace.module.css";

const DEFAULT_TEMPLATE_WIDTH_MM = 276.15;

const LENS_PROFILES = [
  { id: "standard-100", label: "Standard 100 mm", fieldInsetMm: 8 },
  { id: "wide-163", label: "Wide 163 mm", fieldInsetMm: 14 },
  { id: "fine-50", label: "Fine 50 mm", fieldInsetMm: 5 },
] as const;

type LensProfileId = (typeof LENS_PROFILES)[number]["id"];

interface RotaryDraft {
  name: string;
  rotaryCenterXmm: string;
  rotaryTopYmm: string;
  chuckOrRoller: RotaryDriveType;
  bedOrigin: BedOrigin;
  notes: string;
}

function parseNumberInput(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMm(value: number): string {
  return `${value.toFixed(2)} mm`;
}

function buildDraftFromPreset(preset: RotaryPlacementPreset): RotaryDraft {
  return {
    name: preset.name,
    rotaryCenterXmm: String(preset.rotaryCenterXmm),
    rotaryTopYmm: String(preset.rotaryTopYmm),
    chuckOrRoller: preset.chuckOrRoller,
    bedOrigin: preset.bedOrigin,
    notes: preset.notes ?? "",
  };
}

function buildEmptyDraft(): RotaryDraft {
  return {
    name: "",
    rotaryCenterXmm: "160",
    rotaryTopYmm: "24",
    chuckOrRoller: "roller",
    bedOrigin: "top-left",
    notes: "",
  };
}

function resolveLensProfile(id: LensProfileId) {
  return (
    LENS_PROFILES.find((profile) => profile.id === id) ?? LENS_PROFILES[0]
  );
}

function validateDraft(
  draft: RotaryDraft
): { ok: true; value: Omit<RotaryPlacementPreset, "id"> } | { ok: false; error: string } {
  const name = draft.name.trim();
  if (!name) {
    return { ok: false, error: "Preset name is required." };
  }
  const rotaryCenterXmm = parseNumberInput(draft.rotaryCenterXmm);
  if (rotaryCenterXmm === null || rotaryCenterXmm < 0) {
    return { ok: false, error: "Rotary Center X must be a valid non-negative mm value." };
  }
  const rotaryTopYmm = parseNumberInput(draft.rotaryTopYmm);
  if (rotaryTopYmm === null || rotaryTopYmm < 0) {
    return { ok: false, error: "Rotary Top Y must be a valid non-negative mm value." };
  }

  return {
    ok: true,
    value: {
      name,
      rotaryCenterXmm,
      rotaryTopYmm,
      chuckOrRoller: draft.chuckOrRoller,
      bedOrigin: draft.bedOrigin,
      notes: draft.notes.trim() || undefined,
    },
  };
}

export function CalibrationWorkspace() {
  const [isLoading, setIsLoading] = React.useState(true);
  const [presets, setPresets] = React.useState<RotaryPlacementPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = React.useState<string | null>(
    null
  );
  const [draft, setDraft] = React.useState<RotaryDraft>(buildEmptyDraft);
  const [overlayToggles, setOverlayToggles] = React.useState(
    DEFAULT_CALIBRATION_OVERLAY_TOGGLES
  );
  const [lensProfileId, setLensProfileId] = React.useState<LensProfileId>(
    LENS_PROFILES[0].id
  );
  const [templateWidthMm, setTemplateWidthMm] = React.useState(
    String(DEFAULT_TEMPLATE_WIDTH_MM)
  );
  const [topAnchorOffsetMm, setTopAnchorOffsetMm] = React.useState("0");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    const loaded = getRotaryPresets();
    setPresets(loaded);
    if (loaded.length > 0) {
      setSelectedPresetId(loaded[0].id);
      setDraft(buildDraftFromPreset(loaded[0]));
    }
    setIsLoading(false);
  }, []);

  const selectedPreset = React.useMemo(
    () => presets.find((preset) => preset.id === selectedPresetId) ?? null,
    [presets, selectedPresetId]
  );

  const preview = React.useMemo<RotaryPreviewValues>(() => {
    const templateWidth = parseNumberInput(templateWidthMm) ?? DEFAULT_TEMPLATE_WIDTH_MM;
    const rotaryCenter = parseNumberInput(draft.rotaryCenterXmm) ?? 0;
    const rotaryTop = parseNumberInput(draft.rotaryTopYmm) ?? 0;
    const topOffset = parseNumberInput(topAnchorOffsetMm) ?? 0;

    return buildRotaryPlacementPreview({
      templateWidthMm: templateWidth,
      rotaryCenterXmm: rotaryCenter,
      rotaryTopYmm: rotaryTop,
      topAnchorOffsetMm: topOffset,
    });
  }, [draft.rotaryCenterXmm, draft.rotaryTopYmm, templateWidthMm, topAnchorOffsetMm]);

  const lensProfile = resolveLensProfile(lensProfileId);

  const handleSelectPreset = React.useCallback(
    (presetId: string) => {
      const preset = presets.find((entry) => entry.id === presetId);
      if (!preset) return;
      setSelectedPresetId(presetId);
      setDraft(buildDraftFromPreset(preset));
      setErrorMessage(null);
      setStatusMessage(null);
    },
    [presets]
  );

  const handleStartNewPreset = React.useCallback(() => {
    setSelectedPresetId(null);
    setDraft(buildEmptyDraft());
    setErrorMessage(null);
    setStatusMessage("Creating a new rotary preset.");
  }, []);

  const handleSavePreset = React.useCallback(() => {
    const parsed = validateDraft(draft);
    if (!parsed.ok) {
      setErrorMessage(parsed.error);
      setStatusMessage(null);
      return;
    }

    try {
      if (selectedPresetId) {
        const next = updateRotaryPreset(selectedPresetId, parsed.value);
        setPresets(next);
        setStatusMessage("Preset updated.");
      } else {
        const next = saveRotaryPreset(parsed.value);
        const created = next[next.length - 1] ?? null;
        setPresets(next);
        if (created) {
          setSelectedPresetId(created.id);
          setDraft(buildDraftFromPreset(created));
        }
        setStatusMessage("Preset created.");
      }
      setErrorMessage(null);
    } catch {
      setErrorMessage("Could not save preset. Try again.");
      setStatusMessage(null);
    }
  }, [draft, selectedPresetId]);

  const handleDeletePreset = React.useCallback(() => {
    if (!selectedPresetId) return;

    try {
      const next = deleteRotaryPreset(selectedPresetId);
      setPresets(next);
      if (next.length > 0) {
        setSelectedPresetId(next[0].id);
        setDraft(buildDraftFromPreset(next[0]));
      } else {
        setSelectedPresetId(null);
        setDraft(buildEmptyDraft());
      }
      setErrorMessage(null);
      setStatusMessage("Preset deleted.");
    } catch {
      setErrorMessage("Could not delete preset. Try again.");
      setStatusMessage(null);
    }
  }, [selectedPresetId]);

  const handleResetInputs = React.useCallback(() => {
    if (selectedPreset) {
      setDraft(buildDraftFromPreset(selectedPreset));
      setStatusMessage("Inputs reset to selected preset.");
    } else {
      setDraft(buildEmptyDraft());
      setStatusMessage("Inputs reset to defaults.");
    }
    setErrorMessage(null);
  }, [selectedPreset]);

  const handleToggleOverlay = React.useCallback(
    (key: CalibrationOverlayKey, enabled: boolean) => {
      setOverlayToggles((current) => ({ ...current, [key]: enabled }));
    },
    []
  );

  const rotaryCenterXmm = parseNumberInput(draft.rotaryCenterXmm) ?? 0;
  const rotaryTopYmm = parseNumberInput(draft.rotaryTopYmm) ?? 0;

  return (
    <section className={styles.workspace}>
      <aside className={styles.leftPanel}>
        <section className={styles.card}>
          <div className={styles.sectionLabel}>Rotary Presets</div>
          {isLoading ? (
            <div className={styles.info}>Loading rotary presets...</div>
          ) : (
            <RotaryPresetList
              presets={presets}
              selectedPresetId={selectedPresetId}
              onSelectPreset={handleSelectPreset}
            />
          )}
          <div className={styles.inlineActions}>
            <button type="button" className={styles.secondaryBtn} onClick={handleStartNewPreset}>
              New Preset
            </button>
            {selectedPresetId ? (
              <button
                type="button"
                className={styles.dangerBtn}
                onClick={handleDeletePreset}
              >
                Delete
              </button>
            ) : null}
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.sectionLabel}>Rotary Offset Inputs</div>
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              <span>Preset Name</span>
              <input
                type="text"
                value={draft.name}
                className={styles.textInput}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label className={styles.field}>
              <span>Rotary Center X (mm)</span>
              <input
                type="number"
                value={draft.rotaryCenterXmm}
                className={styles.numInput}
                step={0.1}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    rotaryCenterXmm: event.target.value,
                  }))
                }
              />
            </label>
            <label className={styles.field}>
              <span>Top Anchor Y (mm)</span>
              <input
                type="number"
                value={draft.rotaryTopYmm}
                className={styles.numInput}
                step={0.1}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    rotaryTopYmm: event.target.value,
                  }))
                }
              />
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
            <label className={styles.field}>
              <span>Drive Type</span>
              <div className={styles.chips}>
                <button
                  type="button"
                  className={
                    draft.chuckOrRoller === "roller" ? styles.chipActive : styles.chip
                  }
                  onClick={() =>
                    setDraft((current) => ({ ...current, chuckOrRoller: "roller" }))
                  }
                >
                  Roller
                </button>
                <button
                  type="button"
                  className={
                    draft.chuckOrRoller === "chuck" ? styles.chipActive : styles.chip
                  }
                  onClick={() =>
                    setDraft((current) => ({ ...current, chuckOrRoller: "chuck" }))
                  }
                >
                  Chuck
                </button>
              </div>
            </label>
            <label className={`${styles.field} ${styles.fullWidth}`}>
              <span>Notes</span>
              <input
                type="text"
                value={draft.notes}
                className={styles.textInput}
                placeholder="Optional setup notes"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </label>
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
          </div>
          <CalibrationOverlayToggles value={overlayToggles} onToggle={handleToggleOverlay} />
        </section>
      </aside>

      <div className={styles.centerPanel}>
        <CalibrationBedReference
          bedWidthMm={DEFAULT_BED_CONFIG.flatWidth}
          bedHeightMm={DEFAULT_BED_CONFIG.flatHeight}
          rotaryCenterXmm={rotaryCenterXmm}
          topAnchorYmm={preview.effectiveTopAnchorYmm}
          lensInsetMm={lensProfile.fieldInsetMm}
          bedOrigin={draft.bedOrigin}
          overlays={overlayToggles}
        />
      </div>

      <aside className={styles.rightPanel}>
        <section className={styles.card}>
          <div className={styles.sectionLabel}>Current Values</div>
          <dl className={styles.valueGrid}>
            <dt>Preset</dt>
            <dd>{draft.name.trim() || "Unsaved"}</dd>
            <dt>Drive</dt>
            <dd>{draft.chuckOrRoller}</dd>
            <dt>Origin</dt>
            <dd>{draft.bedOrigin}</dd>
            <dt>Rotary Center X</dt>
            <dd>{formatMm(rotaryCenterXmm)}</dd>
            <dt>Top Anchor Y</dt>
            <dd>{formatMm(rotaryTopYmm)}</dd>
            <dt>Lens Profile</dt>
            <dd>{lensProfile.label}</dd>
          </dl>
        </section>

        <section className={styles.card}>
          <div className={styles.sectionLabel}>Export Origin Preview</div>
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
              <span>Top Anchor Offset (mm)</span>
              <input
                type="number"
                className={styles.numInput}
                value={topAnchorOffsetMm}
                step={0.1}
                onChange={(event) => setTopAnchorOffsetMm(event.target.value)}
              />
            </label>
          </div>
          <RotaryPlacementPreview values={preview} />
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
          <div className={styles.info}>
            Bed center and overlay guides are editor-only references for calibration setup.
          </div>
        </section>
      </aside>
    </section>
  );
}
