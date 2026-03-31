"use client";

import React from "react";
import {
  KNOWN_MATERIAL_PROFILES,
  getMaterialProfileById,
} from "@/data/materialProfiles";
import { applyOutcomeToLayer } from "@/features/color-profiles/presetBridge";
import {
  resolveProcessContext,
  resolveSupportedOutcomes,
} from "@/features/color-profiles/resolver";
import type { ResolvedOutcome } from "@/features/color-profiles/types";
import { getActiveLaserProfile } from "@/utils/laserProfileState";
import type { LaserProfile, LaserSourceType } from "@/types/laserProfile";
import type { MaterialProfile } from "@/types/materials";
import { LASER_TYPE_LABELS } from "@/types/materials";
import styles from "./MaterialProfilePanel.module.css";

const STORAGE_KEY = "lt316_material_profile";

function loadSavedProfileId(): string {
  try { return localStorage.getItem(STORAGE_KEY) ?? ""; } catch { return ""; }
}
function saveProfileId(id: string) {
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* noop */ }
}

export interface ActiveMaterialSettings {
  label: string;
  powerPct: number;
  maxPowerPct: number;
  speedMmS: number;
  lpi: number;
  passes: number;
  lineIntervalMm?: number;
  frequencyKhz?: number;
  pulseWidthNs?: number;
  materialSlug?: string;
  materialLabel?: string;
  processFamily?: string;
  outcomeId?: string;
  outcomeLabel?: string;
  presetId?: string;
  presetLabel?: string;
  sourceType?: LaserSourceType;
}

interface Props {
  onMaterialChange: (settings: ActiveMaterialSettings | null) => void;
  selectedProfileId?: string;
  onSelectedProfileIdChange?: (profileId: string) => void;
  currentMaterialSlug?: string | null;
  currentMaterialLabel?: string | null;
  productHint?: string | null;
}

const DEFAULT_OUTCOME_IDS = [
  "powder-coat-reveal",
  "anodized-black",
  "cermark-dark-mark",
  "ss-oxide-black",
  "ss-anneal-dark",
  "ti-oxide-dark",
  "abs-dark-gray",
  "abs-uv-dark-gray",
];

export function MaterialProfilePanel({
  onMaterialChange,
  selectedProfileId,
  onSelectedProfileIdChange,
  currentMaterialSlug,
  currentMaterialLabel,
  productHint,
}: Props) {
  const [open, setOpen] = React.useState(true);
  const [activeLaser, setActiveLaser] = React.useState<LaserProfile | null>(null);
  const [internalSelectedId, setInternalSelectedId] = React.useState<string>("");
  const [selectedOutcomeId, setSelectedOutcomeId] = React.useState<string>("");
  const isControlled = selectedProfileId !== undefined;
  const selectedId = isControlled ? selectedProfileId : internalSelectedId;

  React.useEffect(() => {
    if (isControlled) return;
    const saved = loadSavedProfileId();
    if (saved) setInternalSelectedId(saved);
  }, [isControlled]);

  React.useEffect(() => {
    if (!open) return;
    setActiveLaser(getActiveLaserProfile());
  }, [open, currentMaterialSlug, currentMaterialLabel]);

  const legacyProfile = selectedId ? getMaterialProfileById(selectedId) : null;
  const resolvedContext = React.useMemo(
    () => resolveProcessContext(activeLaser, {
      materialSlug: currentMaterialSlug,
      materialLabel: currentMaterialLabel,
      productHint,
    }),
    [activeLaser, currentMaterialLabel, currentMaterialSlug, productHint],
  );
  const outcomes = React.useMemo(
    () => resolveSupportedOutcomes(resolvedContext),
    [resolvedContext],
  );

  React.useEffect(() => {
    if (legacyProfile || outcomes.length === 0) return;
    const preferred = pickDefaultOutcome(outcomes);
    setSelectedOutcomeId((prev) => (prev && outcomes.some((outcome) => outcome.id === prev) ? prev : preferred?.id ?? ""));
  }, [legacyProfile, outcomes]);

  const selectedOutcome = React.useMemo(
    () => outcomes.find((outcome) => outcome.id === selectedOutcomeId) ?? pickDefaultOutcome(outcomes),
    [outcomes, selectedOutcomeId],
  );

  const [customPower, setCustomPower] = React.useState("");
  const [customSpeed, setCustomSpeed] = React.useState("");
  const [customPasses, setCustomPasses] = React.useState("");

  const effectiveSettings = React.useMemo((): ActiveMaterialSettings | null => {
    if (legacyProfile) {
      return {
        label: legacyProfile.label,
        powerPct: parseOverride(customPower, legacyProfile.powerPct),
        maxPowerPct: parseOverride(customPower, legacyProfile.maxPowerPct),
        speedMmS: parseOverride(customSpeed, legacyProfile.speedMmS),
        lpi: legacyProfile.lpi,
        passes: parseOverride(customPasses, legacyProfile.passes, true),
        materialSlug: currentMaterialSlug ?? undefined,
        materialLabel: currentMaterialLabel ?? undefined,
        sourceType: activeLaser?.sourceType,
      };
    }

    if (!selectedOutcome || !activeLaser) return null;
    const applied = applyOutcomeToLayer(selectedOutcome, activeLaser);
    if (!applied) return null;

    const powerPct = parseOverride(customPower, applied.fields.powerPct);
    const speedMmS = parseOverride(customSpeed, applied.fields.speedMmS);
    const passes = parseOverride(customPasses, applied.fields.passes, true);
    const lineIntervalMm = applied.fields.lineIntervalMm;

    return {
      label: `${resolvedContext?.materialLabel ?? currentMaterialLabel ?? "Material"} · ${selectedOutcome.label}`,
      powerPct,
      maxPowerPct: powerPct,
      speedMmS,
      lpi: lineIntervalMm && lineIntervalMm > 0 ? Math.round(25.4 / lineIntervalMm) : 0,
      passes,
      lineIntervalMm,
      frequencyKhz: applied.fields.frequencyKhz,
      pulseWidthNs: applied.fields.pulseWidthNs,
      materialSlug: resolvedContext?.materialSlug,
      materialLabel: resolvedContext?.materialLabel,
      processFamily: applied.fields.processFamily,
      outcomeId: applied.fields.outcomeId,
      outcomeLabel: applied.fields.outcomeLabel,
      presetId: applied.fields.matchedPresetId,
      presetLabel: applied.fields.matchedPresetLabel,
      sourceType: activeLaser.sourceType,
    };
  }, [
    activeLaser,
    currentMaterialLabel,
    currentMaterialSlug,
    customPasses,
    customPower,
    customSpeed,
    legacyProfile,
    resolvedContext,
    selectedOutcome,
  ]);

  React.useEffect(() => {
    onMaterialChange(effectiveSettings);
  }, [effectiveSettings, onMaterialChange]);

  const compatibleLegacyProfiles = React.useMemo(() => {
    const laserType = activeLaser?.sourceType;
    if (!laserType || (laserType !== "co2" && laserType !== "diode" && laserType !== "fiber")) {
      return [] as MaterialProfile[];
    }
    return KNOWN_MATERIAL_PROFILES.filter((profile) => profile.laserType === laserType);
  }, [activeLaser?.sourceType]);

  const handleSelectLegacyOverride = (id: string) => {
    if (isControlled) {
      onSelectedProfileIdChange?.(id);
    } else {
      setInternalSelectedId(id);
    }
    saveProfileId(id);
    setCustomPower("");
    setCustomSpeed("");
    setCustomPasses("");
  };

  const handleClearOverride = () => {
    if (isControlled) {
      onSelectedProfileIdChange?.("");
    } else {
      setInternalSelectedId("");
    }
    saveProfileId("");
    setCustomPower("");
    setCustomSpeed("");
    setCustomPasses("");
  };

  const activeLaserLabel = activeLaser ? `${activeLaser.name} · ${activeLaser.wattagePeak}W` : "No active laser";

  return (
    <div className={styles.panel}>
      <button
        className={styles.sectionToggle}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        type="button"
      >
        <span className={styles.sectionToggleLabel}>
          Material Profile
          {effectiveSettings && <span className={styles.activeDot} title={effectiveSettings.label} />}
        </span>
        <span className={styles.sectionToggleChevron}>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className={styles.body}>
          {!currentMaterialSlug && (
            <div className={styles.empty}>
              Select a product or flat-bed item to resolve material-aware defaults.
            </div>
          )}

          {currentMaterialSlug && (
            <>
              <div className={styles.contextCard}>
                <div className={styles.contextRow}>
                  <span className={styles.contextLabel}>Material</span>
                  <span className={styles.contextValue}>{currentMaterialLabel ?? currentMaterialSlug}</span>
                </div>
                <div className={styles.contextRow}>
                  <span className={styles.contextLabel}>Laser</span>
                  <span className={styles.contextValue}>{activeLaserLabel}</span>
                </div>
              </div>

              {!activeLaser && (
                <div className={styles.empty}>
                  Set an active laser in Calibration → Laser to resolve supported outcomes.
                </div>
              )}

              {resolvedContext?.warnings.map((warning) => (
                <div key={warning} className={styles.warningBox}>{warning}</div>
              ))}

              {activeLaser && outcomes.length > 0 && (
                <>
                  {outcomes.length > 1 && (
                    <div className={styles.overrideSection}>
                      <div className={styles.overrideLabel}>Default Outcome</div>
                      <select
                        className={styles.select}
                        value={selectedOutcome?.id ?? ""}
                        onChange={(e) => setSelectedOutcomeId(e.target.value)}
                      >
                        {outcomes.map((outcome) => (
                          <option key={outcome.id} value={outcome.id}>
                            {outcome.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {selectedOutcome && (
                    <div className={styles.profileCard}>
                      <div className={styles.profileCardStats}>
                        <div className={styles.statCell}>
                          <span className={styles.statLabel}>Outcome</span>
                          <span className={styles.statValue}>{selectedOutcome.label}</span>
                        </div>
                        <div className={styles.statCell}>
                          <span className={styles.statLabel}>Process</span>
                          <span className={styles.statValue}>{selectedOutcome.processFamily}</span>
                        </div>
                        <div className={styles.statCell}>
                          <span className={styles.statLabel}>Preset</span>
                          <span className={styles.statValue}>
                            {effectiveSettings?.presetLabel ?? (selectedOutcome.presetAvailable ? "Available" : "Pending")}
                          </span>
                        </div>
                      </div>
                      {selectedOutcome.notes && (
                        <div className={styles.profileNotes}>{selectedOutcome.notes}</div>
                      )}
                      {!selectedOutcome.presetAvailable && (
                        <div className={styles.warningBox}>
                          This outcome is scaffolded, but no preset is mapped yet for the current laser family.
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className={styles.overrideSection}>
                <div className={styles.overrideLabel}>Legacy Override</div>
                <select
                  className={styles.select}
                  value={selectedId}
                  onChange={(e) => handleSelectLegacyOverride(e.target.value)}
                >
                  <option value="">Use resolved defaults</option>
                  {compatibleLegacyProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.label}
                    </option>
                  ))}
                </select>
              </div>

              {effectiveSettings && (
                <>
                  <div className={styles.overrideSection}>
                    <div className={styles.overrideLabel}>Override</div>
                    <div className={styles.overrideGrid}>
                      <OverrideField
                        label="Power %"
                        placeholder={`${effectiveSettings.powerPct}`}
                        value={customPower}
                        onChange={setCustomPower}
                      />
                      <OverrideField
                        label="Speed mm/s"
                        placeholder={`${effectiveSettings.speedMmS}`}
                        value={customSpeed}
                        onChange={setCustomSpeed}
                      />
                      <OverrideField
                        label="Passes"
                        placeholder={`${effectiveSettings.passes}`}
                        value={customPasses}
                        onChange={setCustomPasses}
                      />
                    </div>
                  </div>

                  <div className={styles.applyBadge}>
                    {legacyProfile
                      ? "Using legacy preset override"
                      : "Using resolved laser/material defaults"}
                  </div>
                </>
              )}

              {selectedId && (
                <button className={styles.clearBtn} onClick={handleClearOverride}>
                  Clear Override
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function pickDefaultOutcome(outcomes: ResolvedOutcome[]): ResolvedOutcome | null {
  for (const id of DEFAULT_OUTCOME_IDS) {
    const outcome = outcomes.find((candidate) => candidate.id === id);
    if (outcome) return outcome;
  }
  return outcomes[0] ?? null;
}

function OverrideField({
  label, placeholder, value, onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className={styles.overrideField}>
      <span className={styles.overrideFieldLabel}>{label}</span>
      <input
        type="number"
        className={styles.overrideInput}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function parseOverride(raw: string, fallback: number, integer = false): number {
  if (!raw.trim()) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return integer ? Math.round(n) : n;
}
