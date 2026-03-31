"use client";

/**
 * BedSettingsPanel
 *
 * Right-sidebar section for editing workspace configuration:
 *   - Workspace mode (flat bed / tumbler wrap)
 *   - Flat-bed dimensions
 *   - Tumbler dimensions (diameter + printable height)
 *   - Derived tumbler wrap width (circumference)
 *   - Show origin toggle
 *   - Origin position (reserved for future bottom-left support)
 *   - Show crosshair toggle
 *   - Crosshair mode (origin / center / both)
 */

import React from "react";
import {
  BedConfig,
  computeTumblerWrapWidthMm,
  normalizeBedConfig,
} from "@/types/admin";
import {
  getTumblerProfileById,
  KNOWN_TUMBLER_PROFILES,
  applyProfileToBedConfig,
} from "@/data/tumblerProfiles";
import { getActiveTumblerGuideBand } from "@/utils/tumblerGuides";
import type {
  LightBurnPathSettings,
  LightBurnPathValidationResult,
  LightBurnPathValidationStatus,
} from "@/types/export";
import styles from "./BedSettingsPanel.module.css";

const LB_STORAGE_KEY = "lt316_lightburn_paths";

function loadLbPaths(): LightBurnPathSettings {
  try {
    const raw = localStorage.getItem(LB_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LightBurnPathSettings) : {};
  } catch { return {}; }
}

function saveLbPaths(s: LightBurnPathSettings) {
  try { localStorage.setItem(LB_STORAGE_KEY, JSON.stringify(s)); } catch { /* noop */ }
}

interface Props {
  bedConfig: BedConfig;
  onUpdateBedConfig: (config: BedConfig) => void;
  showGridSection?: boolean;
}

type NumericConfigField =
  | "flatWidth"
  | "flatHeight"
  | "tumblerDiameterMm"
  | "tumblerPrintableHeightMm"
  | "gridSpacing";

export function BedSettingsPanel({
  bedConfig,
  onUpdateBedConfig,
  showGridSection = true,
}: Props) {
  const set = (patch: Partial<BedConfig>) =>
    onUpdateBedConfig(normalizeBedConfig({ ...bedConfig, ...patch }));

  const [workspaceOpen, setWorkspaceOpen] = React.useState(true);
  const [gridOpen, setGridOpen] = React.useState(false);
  const [guidesOpen, setGuidesOpen] = React.useState(false);
  const [lbOpen, setLbOpen] = React.useState(false);
  const [lbPaths, setLbPaths] = React.useState<LightBurnPathSettings>(() => loadLbPaths());
  const [lbValidation, setLbValidation] = React.useState<LightBurnPathValidationResult | null>(null);
  const [lbValidating, setLbValidating] = React.useState(false);

  const updateLbPath = (key: keyof LightBurnPathSettings, value: string) => {
    const next = { ...lbPaths, [key]: value || undefined };
    setLbPaths(next);
    saveLbPaths(next);
    setLbValidation(null);
  };

  const validateLbPaths = React.useCallback(async () => {
    setLbValidating(true);
    try {
      const res = await fetch("/api/admin/lightburn/validate-paths", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: lbPaths }),
      });
      const data = await res.json() as LightBurnPathValidationResult;
      setLbValidation(data);
    } catch { /* network error — leave null */ }
    finally { setLbValidating(false); }
  }, [lbPaths]);

  const handleNumber = (field: NumericConfigField, value: number) => {
    if (field === "tumblerDiameterMm") {
      const isTapered = bedConfig.tumblerShapeType === "tapered";
      set({
        tumblerDiameterMm: value,
        tumblerOutsideDiameterMm: value,
        tumblerTemplateWidthMm: computeTumblerWrapWidthMm(value),
        ...(isTapered
          ? {}
          : {
              tumblerTopDiameterMm: value,
              tumblerBottomDiameterMm: value,
            }),
      });
      return;
    }

    if (field === "tumblerPrintableHeightMm") {
      set({
        tumblerPrintableHeightMm: value,
        tumblerUsableHeightMm: value,
        tumblerTemplateHeightMm: value,
      });
      return;
    }

    set({ [field]: value } as Partial<BedConfig>);
  };

  const wrapWidthMm = bedConfig.tumblerTemplateWidthMm ?? computeTumblerWrapWidthMm(bedConfig.tumblerDiameterMm);
  const isTumblerMode = bedConfig.workspaceMode === "tumbler-wrap";
  const activeGuideBand = getActiveTumblerGuideBand(bedConfig);
  const activeProfile = bedConfig.tumblerProfileId ? getTumblerProfileById(bedConfig.tumblerProfileId) : null;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Bed Settings</span>
      </div>

      <div className={styles.body}>
        {/* ── Workspace ── */}
        <CollapsibleSection
          title="Workspace"
          open={workspaceOpen}
          onToggle={() => setWorkspaceOpen((o) => !o)}
        >
          {isTumblerMode ? (
            <>
              <FieldRow label="Profile">
                <select
                  className={styles.select}
                  value={bedConfig.tumblerProfileId ?? ""}
                  onChange={(e) => {
                    const profileId = e.target.value || undefined;
                    const profile = profileId ? getTumblerProfileById(profileId) : null;
                    if (profile) {
                      onUpdateBedConfig(applyProfileToBedConfig(bedConfig, profile));
                    } else {
                      set({ tumblerProfileId: undefined });
                    }
                  }}
                  aria-label="Tumbler profile"
                >
                  <option value="">Custom / None</option>
                  {KNOWN_TUMBLER_PROFILES.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.label}
                    </option>
                  ))}
                </select>
              </FieldRow>

              {activeProfile && (
                <FieldRow label="Rotary">
                  <span className={activeProfile.chuckRecommended ? styles.rotaryChuck : styles.rotaryRoller}>
                    {activeProfile.chuckRecommended ? "Chuck" : "Roller"}
                  </span>
                  {activeProfile.hasHandle && (
                    <span className={styles.rotaryHandle} title="This model has a handle">⊕ handle</span>
                  )}
                </FieldRow>
              )}

              <FieldRow label="Diameter (mm)">
                <DraftNumberInput
                  id="bed-cylinder-diameter"
                  className={styles.numInput}
                  value={bedConfig.tumblerDiameterMm}
                  min={10}
                  max={300}
                  step={0.1}
                  onValueChange={(value) => handleNumber("tumblerDiameterMm", value)}
                  aria-label="Tumbler diameter in mm"
                />
              </FieldRow>

              <FieldRow label="Print Height (mm)">
                <DraftNumberInput
                  className={styles.numInput}
                  value={bedConfig.tumblerPrintableHeightMm}
                  min={10}
                  max={500}
                  step={0.1}
                  onValueChange={(value) =>
                    handleNumber("tumblerPrintableHeightMm", value)
                  }
                  aria-label="Tumbler printable height in mm"
                />
              </FieldRow>

              <FieldRow label="Template W (mm)">
                <span id="bed-template-dimensions" className={styles.readonlyValue} tabIndex={-1}>
                  {wrapWidthMm.toFixed(2)}
                </span>
              </FieldRow>

              {activeGuideBand && (
                <FieldRow label="Show Guides">
                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={bedConfig.showTumblerGuideBand}
                      onChange={(e) =>
                        set({ showTumblerGuideBand: e.target.checked })
                      }
                      aria-label="Show groove guides in workspace"
                    />
                    <span className={styles.toggleTrack} />
                  </label>
                </FieldRow>
              )}
            </>
          ) : (
            <>
              <FieldRow label="Width (mm)">
                <DraftNumberInput
                  id="bed-template-dimensions"
                  className={styles.numInput}
                  value={bedConfig.flatWidth}
                  min={10}
                  max={2000}
                  step={10}
                  onValueChange={(value) => handleNumber("flatWidth", value)}
                  aria-label="Bed width in mm"
                />
              </FieldRow>

              <FieldRow label="Height (mm)">
                <DraftNumberInput
                  className={styles.numInput}
                  value={bedConfig.flatHeight}
                  min={10}
                  max={2000}
                  step={10}
                  onValueChange={(value) => handleNumber("flatHeight", value)}
                  aria-label="Bed height in mm"
                />
              </FieldRow>
            </>
          )}
        </CollapsibleSection>

        {/* ── Grid & Snap ── */}
        {showGridSection ? (
          <CollapsibleSection
          title="Grid & Snap"
          open={gridOpen}
          onToggle={() => setGridOpen((o) => !o)}
        >
          <FieldRow label="Grid (mm)">
            <DraftNumberInput
              className={styles.numInput}
              value={bedConfig.gridSpacing}
              min={1}
              max={200}
              step={1}
              onValueChange={(value) => handleNumber("gridSpacing", value)}
              aria-label="Grid spacing in mm"
            />
          </FieldRow>

          <FieldRow label="Snap to Grid">
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={bedConfig.snapToGrid}
                onChange={(e) => set({ snapToGrid: e.target.checked })}
                aria-label="Snap dragged items to grid"
              />
              <span className={styles.toggleTrack} />
            </label>
          </FieldRow>
          </CollapsibleSection>
        ) : null}

        {/* ── LightBurn Paths ── */}
        <CollapsibleSection
          title="LightBurn Paths"
          open={lbOpen}
          onToggle={() => setLbOpen((o) => !o)}
        >
          <LbPathRow
            label="Template (.lbrn2)"
            value={lbPaths.templateProjectPath ?? ""}
            validation={lbValidation?.templateProjectPath ?? null}
            onChange={(v) => updateLbPath("templateProjectPath", v)}
          />
          <LbPathRow
            label="Output Folder"
            value={lbPaths.outputFolderPath ?? ""}
            validation={lbValidation?.outputFolderPath ?? null}
            onChange={(v) => updateLbPath("outputFolderPath", v)}
          />
          <LbPathRow
            label="Device Bundle"
            value={lbPaths.deviceBundlePath ?? ""}
            validation={lbValidation?.deviceBundlePath ?? null}
            onChange={(v) => updateLbPath("deviceBundlePath", v)}
          />
          <button
            className={styles.lbValidateBtn}
            onClick={() => void validateLbPaths()}
            disabled={lbValidating}
          >
            {lbValidating ? "Checking…" : "Validate Paths"}
          </button>
        </CollapsibleSection>

        {/* ── Visual Guides ── */}
        <CollapsibleSection
          title="Visual Guides"
          open={guidesOpen}
          onToggle={() => setGuidesOpen((o) => !o)}
        >
          <FieldRow label="Show Origin">
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={bedConfig.showOrigin}
                onChange={(e) => set({ showOrigin: e.target.checked })}
                aria-label="Show origin indicator"
              />
              <span className={styles.toggleTrack} />
            </label>
          </FieldRow>

          <FieldRow label="Show Crosshair">
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={bedConfig.showCrosshair}
                onChange={(e) => set({ showCrosshair: e.target.checked })}
                aria-label="Show crosshair overlay"
              />
              <span className={styles.toggleTrack} />
            </label>
          </FieldRow>

          <FieldRow label="Crosshair Mode">
            <select
              className={styles.select}
              value={bedConfig.crosshairMode}
              onChange={(e) =>
                set({
                  crosshairMode: e.target.value as BedConfig["crosshairMode"],
                })
              }
              aria-label="Crosshair mode"
            >
              <option value="origin">Origin</option>
              <option value="center">Center</option>
              <option value="both">Both</option>
            </select>
          </FieldRow>
        </CollapsibleSection>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: collapsible section with header toggle
// ---------------------------------------------------------------------------

function CollapsibleSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.collapsibleSection}>
      <button
        className={styles.sectionToggle}
        onClick={onToggle}
        aria-expanded={open}
        type="button"
      >
        <span className={styles.sectionToggleLabel}>{title}</span>
        <span className={styles.sectionToggleChevron}>{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className={styles.sectionBody}>{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: labelled form row
// ---------------------------------------------------------------------------

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.fieldRow}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.fieldControl}>{children}</div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseDraftNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (
    trimmed === "" ||
    trimmed === "-" ||
    trimmed === "." ||
    trimmed === "-."
  ) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDraftNumber(value: number): string {
  return `${value}`;
}

function DraftNumberInput({
  id,
  value,
  min,
  max,
  step,
  className,
  onValueChange,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  className: string;
  onValueChange: (value: number) => void;
  "aria-label": string;
}) {
  const [draft, setDraft] = React.useState(() => formatDraftNumber(value));

  React.useEffect(() => {
    setDraft(formatDraftNumber(value));
  }, [value]);

  const commitDraft = React.useCallback(() => {
    const parsed = parseDraftNumber(draft);
    if (parsed === null) {
      setDraft(formatDraftNumber(value));
      return;
    }
    const normalized = clamp(parsed, min, max);
    onValueChange(normalized);
    setDraft(formatDraftNumber(normalized));
  }, [draft, value, min, max, onValueChange]);

  return (
    <input
      id={id}
      type="number"
      className={className}
      value={draft}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const parsed = parseDraftNumber(raw);
        if (parsed === null) return;
        // Keep live updates responsive while typing.
        if (parsed > 0) {
          onValueChange(parsed);
        }
      }}
      onBlur={commitDraft}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      aria-label={ariaLabel}
    />
  );
}

// ---------------------------------------------------------------------------
// LightBurn path row with inline validation badge
// ---------------------------------------------------------------------------

const STATUS_COLOR: Record<LightBurnPathValidationStatus, string> = {
  valid: "#7ecfa8",
  missing: "#888",
  "invalid-extension": "#f6b36f",
  "not-found": "#f6b36f",
  "not-writable": "#f6b36f",
  error: "#f1b6b6",
};

function LbPathRow({
  label,
  value,
  validation,
  onChange,
}: {
  label: string;
  value: string;
  validation: { status: LightBurnPathValidationStatus; message: string } | null;
  onChange: (v: string) => void;
}) {
  return (
    <div className={styles.lbPathRow}>
      <span className={styles.fieldLabel}>{label}</span>
      <input
        type="text"
        className={styles.lbPathInput}
        value={value}
        placeholder="Paste full path…"
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
      {validation && (
        <span
          className={styles.lbStatus}
          style={{ color: STATUS_COLOR[validation.status] }}
          title={validation.message}
        >
          {validation.status === "valid" ? "✓" : "✗"}
        </span>
      )}
    </div>
  );
}
