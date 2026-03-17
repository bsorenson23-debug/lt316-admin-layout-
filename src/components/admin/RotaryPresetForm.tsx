"use client";

import type { BedOrigin, RotaryDriveType } from "@/types/export";
import styles from "./RotaryPresetForm.module.css";

export interface RotaryPresetDraft {
  name: string;
  rotaryCenterXmm: string;
  rotaryTopYmm: string;
  chuckOrRoller: RotaryDriveType;
  bedOrigin: BedOrigin;
  notes: string;
}

interface Props {
  mode: "create" | "edit";
  draft: RotaryPresetDraft;
  onChange: (patch: Partial<RotaryPresetDraft>) => void;
  onStartCreate: () => void;
  onSave: () => void;
  onDelete: () => void;
  canDelete: boolean;
  errorMessage: string | null;
  statusMessage: string | null;
}

export function RotaryPresetForm({
  mode,
  draft,
  onChange,
  onStartCreate,
  onSave,
  onDelete,
  canDelete,
  errorMessage,
  statusMessage,
}: Props) {
  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <span className={styles.label}>Preset Editor</span>
        <button type="button" className={styles.newBtn} onClick={onStartCreate}>
          New Preset
        </button>
      </div>

      <div className={styles.grid}>
        <label className={styles.field}>
          <span>Preset Name</span>
          <input
            type="text"
            className={styles.textInput}
            value={draft.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="Rotary setup name"
          />
        </label>

        <label className={styles.field}>
          <span>Rotary Center X (mm)</span>
          <input
            type="number"
            className={styles.numInput}
            value={draft.rotaryCenterXmm}
            step={0.1}
            onChange={(event) => onChange({ rotaryCenterXmm: event.target.value })}
          />
        </label>

        <label className={styles.field}>
          <span>Top Anchor Y (mm)</span>
          <input
            type="number"
            className={styles.numInput}
            value={draft.rotaryTopYmm}
            step={0.1}
            onChange={(event) => onChange({ rotaryTopYmm: event.target.value })}
          />
        </label>

        <label className={styles.field}>
          <span>Bed Origin</span>
          <select
            className={styles.selectInput}
            value={draft.bedOrigin}
            onChange={(event) =>
              onChange({ bedOrigin: event.target.value as BedOrigin })
            }
          >
            <option value="top-left">Top-left</option>
            <option value="top-right">Top-right</option>
            <option value="bottom-left">Bottom-left</option>
            <option value="bottom-right">Bottom-right</option>
          </select>
        </label>

        <label className={`${styles.field} ${styles.fullWidth}`}>
          <span>Notes (optional)</span>
          <input
            type="text"
            className={styles.textInput}
            value={draft.notes}
            onChange={(event) => onChange({ notes: event.target.value })}
            placeholder="Machine jig notes"
          />
        </label>
      </div>

      <div className={styles.driveRow}>
        <span>Drive</span>
        <div className={styles.chips}>
          <button
            type="button"
            className={
              draft.chuckOrRoller === "roller" ? styles.chipActive : styles.chip
            }
            onClick={() => onChange({ chuckOrRoller: "roller" })}
          >
            Roller
          </button>
          <button
            type="button"
            className={
              draft.chuckOrRoller === "chuck" ? styles.chipActive : styles.chip
            }
            onClick={() => onChange({ chuckOrRoller: "chuck" })}
          >
            Chuck
          </button>
        </div>
      </div>

      {(errorMessage || statusMessage) && (
        <div className={errorMessage ? styles.error : styles.status}>
          {errorMessage ?? statusMessage}
        </div>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.saveBtn} onClick={onSave}>
          {mode === "create" ? "Create Preset" : "Save Changes"}
        </button>
        {canDelete ? (
          <button type="button" className={styles.deleteBtn} onClick={onDelete}>
            Delete
          </button>
        ) : null}
      </div>
    </section>
  );
}
