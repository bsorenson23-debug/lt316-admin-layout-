"use client";

import React from "react";
import type {
  LightBurnPathSettings,
  LightBurnPathValidationResult,
  LightBurnPathValidationItem,
} from "@/types/export";
import {
  loadLightBurnPathSettings,
  saveLightBurnPathSettings,
  resetLightBurnPathSettings,
  buildDefaultLightBurnPathValidationResult,
} from "@/utils/lightBurnPathSettings";
import styles from "./LightBurnPathSettingsPanel.module.css";

interface Props {
  onPathSettingsChange?: (settings: LightBurnPathSettings) => void;
}

function statusClass(item: LightBurnPathValidationItem): string {
  if (item.status === "valid") return styles.statusValid;
  if (item.status === "missing") return styles.statusMissing;
  return styles.statusError;
}

function statusLabel(item: LightBurnPathValidationItem): string {
  switch (item.status) {
    case "valid": return "Valid";
    case "missing": return "Not set";
    case "not-found": return "Not found";
    case "not-writable": return "Not writable";
    case "invalid-extension": return "Wrong extension";
    case "error": return "Error";
    default: return item.message;
  }
}

export function LightBurnPathSettingsPanel({ onPathSettingsChange }: Props) {
  const [open, setOpen] = React.useState(false);
  const [settings, setSettings] = React.useState<LightBurnPathSettings>({});
  const [validation, setValidation] = React.useState<LightBurnPathValidationResult>(
    buildDefaultLightBurnPathValidationResult(),
  );
  const [validating, setValidating] = React.useState(false);
  const [savedFlash, setSavedFlash] = React.useState(false);
  const [apiError, setApiError] = React.useState<string | null>(null);

  // Load from localStorage on first open
  React.useEffect(() => {
    if (open) {
      const loaded = loadLightBurnPathSettings();
      setSettings(loaded);
    }
  }, [open]);

  const updateField = (field: keyof LightBurnPathSettings, value: string) => {
    setSettings((prev) => {
      const next = { ...prev, [field]: value || undefined };
      return next;
    });
    // Clear validation for this field when editing
    setValidation((prev) => ({
      ...prev,
      [field]: { status: "missing" as const, message: "Not validated" },
    }));
    setApiError(null);
  };

  const handleSave = () => {
    const saved = saveLightBurnPathSettings(settings);
    setSettings(saved);
    onPathSettingsChange?.(saved);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  const handleValidate = async () => {
    // Save first so the values persist
    const saved = saveLightBurnPathSettings(settings);
    setSettings(saved);
    onPathSettingsChange?.(saved);

    setValidating(true);
    setApiError(null);
    try {
      const res = await fetch("/api/admin/lightburn/validate-paths", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: saved }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Validation failed" }));
        setApiError((err as { error?: string }).error ?? "Validation failed");
        return;
      }
      const result = (await res.json()) as LightBurnPathValidationResult;
      setValidation(result);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Network error");
    } finally {
      setValidating(false);
    }
  };

  const handleReset = () => {
    const empty = resetLightBurnPathSettings();
    setSettings(empty);
    setValidation(buildDefaultLightBurnPathValidationResult());
    onPathSettingsChange?.(empty);
    setApiError(null);
  };

  return (
    <section className={styles.panel}>
      <button type="button" className={styles.toggle} onClick={() => setOpen((o) => !o)}>
        <span className={styles.toggleLabel}>LightBurn Paths</span>
        <span className={styles.chevron}>{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className={styles.body}>
          {/* ── Output Folder ── */}
          <div className={styles.fieldGroup}>
            <div className={styles.fieldLabelRow}>
              <span className={styles.fieldLabel}>Output Folder</span>
              <div className={`${styles.statusRow} ${statusClass(validation.outputFolderPath)}`}>
                <span className={styles.statusDot} />
                <span>{statusLabel(validation.outputFolderPath)}</span>
              </div>
            </div>
            <input
              type="text"
              className={styles.pathInput}
              placeholder="C:\Users\you\LightBurn\exports"
              value={settings.outputFolderPath ?? ""}
              onChange={(e) => updateField("outputFolderPath", e.target.value)}
            />
            <span className={styles.fieldHint}>Exported .lbrn2 files save here</span>
          </div>

          <div className={styles.divider} />

          {/* ── Template Project ── */}
          <div className={styles.fieldGroup}>
            <div className={styles.fieldLabelRow}>
              <span className={styles.fieldLabel}>Template Project</span>
              <div className={`${styles.statusRow} ${statusClass(validation.templateProjectPath)}`}>
                <span className={styles.statusDot} />
                <span>{statusLabel(validation.templateProjectPath)}</span>
              </div>
            </div>
            <input
              type="text"
              className={styles.pathInput}
              placeholder="C:\Users\you\LightBurn\template.lbrn2"
              value={settings.templateProjectPath ?? ""}
              onChange={(e) => updateField("templateProjectPath", e.target.value)}
            />
            <span className={styles.fieldHint}>Optional base .lbrn2 with your device settings</span>
          </div>

          <div className={styles.divider} />

          {/* ── Device Bundle ── */}
          <div className={styles.fieldGroup}>
            <div className={styles.fieldLabelRow}>
              <span className={styles.fieldLabel}>Device Bundle</span>
              <div className={`${styles.statusRow} ${statusClass(validation.deviceBundlePath)}`}>
                <span className={styles.statusDot} />
                <span>{statusLabel(validation.deviceBundlePath)}</span>
              </div>
            </div>
            <input
              type="text"
              className={styles.pathInput}
              placeholder="C:\Users\you\LightBurn\device.lbzip"
              value={settings.deviceBundlePath ?? ""}
              onChange={(e) => updateField("deviceBundlePath", e.target.value)}
            />
            <span className={styles.fieldHint}>Optional LightBurn device profile (.lbzip)</span>
          </div>

          {/* ── Actions ── */}
          <div className={styles.btnRow}>
            <button
              type="button"
              className={styles.validateBtn}
              disabled={validating}
              onClick={handleValidate}
            >
              {validating ? "Validating..." : "Save & Validate"}
            </button>
            <button type="button" className={styles.resetBtn} onClick={handleReset}>
              Reset
            </button>
          </div>

          {savedFlash && <span className={styles.savedMsg}>Saved</span>}
          {apiError && <span className={styles.errorMsg}>{apiError}</span>}
        </div>
      )}
    </section>
  );
}
