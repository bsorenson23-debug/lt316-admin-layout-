"use client";

import React from "react";
import type { RotaryPlacementPreset } from "@/types/export";
import { getRotaryPresets, saveRotaryPresetAsCustom } from "@/utils/adminCalibrationState";
import styles from "./RotaryPresetSharePanel.module.css";

interface Props {
  onPresetsChanged?: () => void;
}

export function RotaryPresetSharePanel({ onPresetsChanged }: Props) {
  const [open, setOpen] = React.useState(false);
  const [presets, setPresets] = React.useState<RotaryPlacementPreset[]>([]);
  const [selectedId, setSelectedId] = React.useState("");
  const [importText, setImportText] = React.useState("");
  const [importError, setImportError] = React.useState<string | null>(null);
  const [importSuccess, setImportSuccess] = React.useState<string | null>(null);
  const [exported, setExported] = React.useState(false);

  React.useEffect(() => {
    if (open) setPresets(getRotaryPresets());
  }, [open]);

  const selectedPreset = presets.find((p) => p.id === selectedId) ?? null;

  const handleExport = () => {
    if (!selectedPreset) return;
    const { id: _id, ...shareData } = selectedPreset;
    const json = JSON.stringify(shareData, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      setExported(true);
      setTimeout(() => setExported(false), 1500);
    }).catch(() => {
      // Fallback: trigger download
      const blob = new Blob([json], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${selectedPreset.name.replace(/\s+/g, "-").toLowerCase()}-preset.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  };

  const handleImport = () => {
    setImportError(null);
    setImportSuccess(null);
    const text = importText.trim();
    if (!text) { setImportError("Paste a preset JSON first."); return; }
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setImportError("Not a valid preset JSON object."); return;
      }
      const obj = parsed as Record<string, unknown>;
      if (typeof obj.name !== "string" || !obj.name.trim()) {
        setImportError("Preset must have a name field."); return;
      }
      // Strip any injected id and save as a new custom preset
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _stripped, ...rest } = obj as Partial<RotaryPlacementPreset>;
      const updated = saveRotaryPresetAsCustom(rest as Omit<RotaryPlacementPreset, "id">);
      setPresets(updated);
      setImportText("");
      setImportSuccess(`Imported "${obj.name as string}" as a custom preset.`);
      onPresetsChanged?.();
    } catch {
      setImportError("Failed to parse JSON — check the pasted text.");
    }
  };

  return (
    <div className={styles.panel}>
      <button className={styles.toggle} onClick={() => setOpen((o) => !o)} type="button">
        <span className={styles.toggleLabel}>Share / Import Preset</span>
        <span className={styles.chevron}>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className={styles.body}>
          <div className={styles.sectionLabel}>Export a Preset</div>
          <select className={styles.select} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">— Select preset —</option>
            {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className={styles.primaryBtn} disabled={!selectedId} onClick={handleExport}>
            {exported ? "✓ Copied to Clipboard" : "Copy JSON to Clipboard"}
          </button>

          <div className={styles.divider} />

          <div className={styles.sectionLabel}>Import a Preset</div>
          <textarea
            className={styles.textarea}
            placeholder={`Paste preset JSON here…\n{\n  "name": "My Rotary",\n  "chuckOrRoller": "chuck",\n  …\n}`}
            value={importText}
            onChange={(e) => { setImportText(e.target.value); setImportError(null); setImportSuccess(null); }}
            rows={5}
          />
          {importError && <div className={styles.errorMsg}>{importError}</div>}
          {importSuccess && <div className={styles.successMsg}>{importSuccess}</div>}
          <button className={styles.primaryBtn} disabled={!importText.trim()} onClick={handleImport}>
            Import Preset
          </button>
        </div>
      )}
    </div>
  );
}
