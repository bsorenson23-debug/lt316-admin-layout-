"use client";

import React from "react";
import {
  KNOWN_MATERIAL_PROFILES,
  getMaterialProfileById,
} from "@/data/materialProfiles";
import type { MaterialProfile, LaserType } from "@/types/materials";
import { LASER_TYPE_LABELS, TUMBLER_FINISH_LABELS } from "@/types/materials";
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
}

interface Props {
  onMaterialChange: (settings: ActiveMaterialSettings | null) => void;
}

export function MaterialProfilePanel({ onMaterialChange }: Props) {
  const [open, setOpen] = React.useState(true);
  const [laserFilter, setLaserFilter] = React.useState<LaserType | "">("");
  const [selectedId, setSelectedId] = React.useState<string>(() => loadSavedProfileId());

  // Custom overrides (applied on top of preset)
  const [customPower, setCustomPower] = React.useState("");
  const [customSpeed, setCustomSpeed] = React.useState("");
  const [customPasses, setCustomPasses] = React.useState("");

  const filtered = laserFilter
    ? KNOWN_MATERIAL_PROFILES.filter((p) => p.laserType === laserFilter)
    : KNOWN_MATERIAL_PROFILES;

  const selectedProfile = selectedId ? getMaterialProfileById(selectedId) : null;

  // Build effective settings (preset + any custom overrides)
  const effectiveSettings = React.useMemo((): ActiveMaterialSettings | null => {
    if (!selectedProfile) return null;
    return {
      label: selectedProfile.label,
      powerPct: parseOverride(customPower, selectedProfile.powerPct),
      maxPowerPct: parseOverride(customPower, selectedProfile.maxPowerPct),
      speedMmS: parseOverride(customSpeed, selectedProfile.speedMmS),
      lpi: selectedProfile.lpi,
      passes: parseOverride(customPasses, selectedProfile.passes, true),
    };
  }, [selectedProfile, customPower, customSpeed, customPasses]);

  // Notify parent whenever effective settings change
  React.useEffect(() => {
    onMaterialChange(effectiveSettings);
  }, [effectiveSettings, onMaterialChange]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    saveProfileId(id);
    setCustomPower("");
    setCustomSpeed("");
    setCustomPasses("");
  };

  const handleClear = () => {
    setSelectedId("");
    saveProfileId("");
    setCustomPower("");
    setCustomSpeed("");
    setCustomPasses("");
  };

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
          {selectedProfile && (
            <span className={styles.activeDot} title={selectedProfile.label} />
          )}
        </span>
        <span className={styles.sectionToggleChevron}>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className={styles.body}>
          {/* ── Laser type filter ── */}
          <div className={styles.filterRow}>
            <span className={styles.filterLabel}>Laser</span>
            <div className={styles.filterBtns}>
              <button
                className={`${styles.filterBtn} ${laserFilter === "" ? styles.filterBtnActive : ""}`}
                onClick={() => setLaserFilter("")}
              >All</button>
              {(Object.entries(LASER_TYPE_LABELS) as [LaserType, string][]).map(([k, v]) => (
                <button
                  key={k}
                  className={`${styles.filterBtn} ${laserFilter === k ? styles.filterBtnActive : ""}`}
                  onClick={() => setLaserFilter(k)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* ── Profile selector ── */}
          <select
            className={styles.select}
            value={selectedId}
            onChange={(e) => handleSelect(e.target.value)}
            aria-label="Material profile"
          >
            <option value="">— Select a profile —</option>
            {filtered.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>

          {/* ── Selected profile details ── */}
          {selectedProfile && (
            <>
              <ProfileCard profile={selectedProfile} />

              {/* Custom overrides */}
              <div className={styles.overrideSection}>
                <div className={styles.overrideLabel}>Override</div>
                <div className={styles.overrideGrid}>
                  <OverrideField
                    label="Power %"
                    placeholder={`${selectedProfile.powerPct}`}
                    value={customPower}
                    onChange={setCustomPower}
                  />
                  <OverrideField
                    label="Speed mm/s"
                    placeholder={`${selectedProfile.speedMmS}`}
                    value={customSpeed}
                    onChange={setCustomSpeed}
                  />
                  <OverrideField
                    label="Passes"
                    placeholder={`${selectedProfile.passes}`}
                    value={customPasses}
                    onChange={setCustomPasses}
                  />
                </div>
              </div>

              <div className={styles.applyBadge}>
                Profile will be embedded in the .lbrn2 export
              </div>

              <button className={styles.clearBtn} onClick={handleClear}>
                Clear Profile
              </button>
            </>
          )}

          {!selectedProfile && (
            <div className={styles.empty}>
              No profile selected — C00 will export at 100% power. Select a profile to pre-configure power, speed, and LPI.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile card
// ---------------------------------------------------------------------------

function ProfileCard({ profile }: { profile: MaterialProfile }) {
  const stats: { label: string; value: string }[] = [
    { label: "Power",  value: `${profile.powerPct}%` },
    { label: "Speed",  value: `${profile.speedMmS} mm/s` },
    { label: "LPI",    value: `${profile.lpi}` },
    { label: "Passes", value: `${profile.passes}` },
    { label: "Watts",  value: profile.wattageRange },
    { label: "Finish", value: TUMBLER_FINISH_LABELS[profile.finishType] },
  ];

  return (
    <div className={styles.profileCard}>
      <div className={styles.profileCardStats}>
        {stats.map((s) => (
          <div key={s.label} className={styles.statCell}>
            <span className={styles.statLabel}>{s.label}</span>
            <span className={styles.statValue}>{s.value}</span>
          </div>
        ))}
      </div>
      {profile.notes && (
        <div className={styles.profileNotes}>{profile.notes}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Override input
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseOverride(raw: string, fallback: number, integer = false): number {
  if (!raw.trim()) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return integer ? Math.round(n) : n;
}
