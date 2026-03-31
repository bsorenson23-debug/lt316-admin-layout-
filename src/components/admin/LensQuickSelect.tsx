"use client";

import React from "react";
import type { LaserLens, LaserProfile } from "@/types/laserProfile";
import { LASER_SOURCE_LABELS } from "@/types/laserProfile";
import {
  getActiveLaserId,
  getActiveLensId,
  getLaserProfiles,
  setActiveLaserId,
  setActiveLensId,
} from "@/utils/laserProfileState";
import styles from "./LensQuickSelect.module.css";

function fmtMm(value: number): string {
  return Number.isInteger(value) ? `${value} mm` : `${value.toFixed(2)} mm`;
}

interface Props {
  onSelectionChange?: (laser: LaserProfile | null, lens: LaserLens | null) => void;
}

export function LensQuickSelect({ onSelectionChange }: Props) {
  const [profiles, setProfiles] = React.useState<LaserProfile[]>([]);
  const [activeLaserId, setActiveLaserIdState] = React.useState<string | null>(null);
  const [activeLensId, setActiveLensIdState] = React.useState<string | null>(null);

  const syncFromStorage = React.useCallback(() => {
    const nextProfiles = getLaserProfiles();
    let nextActiveLaserId = getActiveLaserId();
    let nextActiveLensId = getActiveLensId();

    const activeProfile =
      nextProfiles.find((profile) => profile.id === nextActiveLaserId) ??
      nextProfiles[0] ??
      null;

    if (activeProfile && activeProfile.id !== nextActiveLaserId) {
      nextActiveLaserId = activeProfile.id;
      setActiveLaserId(nextActiveLaserId);
    }

    const activeLens =
      activeProfile?.lenses.find((lens) => lens.id === nextActiveLensId) ??
      activeProfile?.lenses[0] ??
      null;

    if (activeProfile && activeLens?.id !== nextActiveLensId) {
      nextActiveLensId = activeLens?.id ?? null;
      setActiveLensId(nextActiveLensId);
    }

    setProfiles(nextProfiles);
    setActiveLaserIdState(nextActiveLaserId);
    setActiveLensIdState(nextActiveLensId);
    onSelectionChange?.(activeProfile, activeLens);
  }, [onSelectionChange]);

  React.useEffect(() => {
    syncFromStorage();
  }, [syncFromStorage]);

  React.useEffect(() => {
    const handleStorage = () => syncFromStorage();
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleStorage);
    };
  }, [syncFromStorage]);

  const activeProfile =
    profiles.find((profile) => profile.id === activeLaserId) ?? null;
  const activeLens =
    activeProfile?.lenses.find((lens) => lens.id === activeLensId) ?? null;

  const handleLaserChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextLaserId = event.target.value || null;
    const nextProfile =
      profiles.find((profile) => profile.id === nextLaserId) ?? null;
    const nextLens = nextProfile?.lenses[0] ?? null;

    setActiveLaserId(nextLaserId);
    setActiveLaserIdState(nextLaserId);
    setActiveLensId(nextLens?.id ?? null);
    setActiveLensIdState(nextLens?.id ?? null);
    onSelectionChange?.(nextProfile, nextLens);
  };

  const handleLensChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextLensId = event.target.value || null;
    const nextLens =
      activeProfile?.lenses.find((lens) => lens.id === nextLensId) ?? null;

    setActiveLensId(nextLensId);
    setActiveLensIdState(nextLensId);
    onSelectionChange?.(activeProfile, nextLens);
  };

  const hasProfiles = profiles.length > 0;
  const hasLenses = Boolean(activeProfile?.lenses.length);

  return (
    <div className={styles.panel}>
      <div className={styles.headerRow}>
        <div>
          <div className={styles.eyebrow}>Laser / Lens</div>
          <div className={styles.title}>Active optical setup</div>
        </div>
        {activeProfile && (
          <div className={styles.sourceBadge}>
            {LASER_SOURCE_LABELS[activeProfile.sourceType]}
          </div>
        )}
      </div>

      {!hasProfiles ? (
        <div className={styles.emptyState}>
          No laser profiles with lenses are configured yet.
        </div>
      ) : (
        <>
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Laser</span>
              <select
                className={styles.select}
                value={activeLaserId ?? ""}
                onChange={handleLaserChange}
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Lens</span>
              <select
                className={styles.select}
                value={activeLensId ?? ""}
                onChange={handleLensChange}
                disabled={!hasLenses}
              >
                {!hasLenses && <option value="">No lenses</option>}
                {activeProfile?.lenses.map((lens) => (
                  <option key={lens.id} value={lens.id}>
                    {lens.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={styles.metaRow}>
            {activeLens ? (
              <>
                <span className={styles.metaItem}>
                  Focal: {fmtMm(activeLens.focalLengthMm)}
                </span>
                <span className={styles.metaDivider}>•</span>
                <span className={styles.metaItem}>
                  Kerf: {activeLens.kerfMm != null ? fmtMm(activeLens.kerfMm) : "n/a"}
                </span>
              </>
            ) : (
              <span className={styles.metaItem}>Select a lens to make it active.</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
