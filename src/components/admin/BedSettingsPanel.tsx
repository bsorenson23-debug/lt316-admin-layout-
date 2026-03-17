"use client";

/**
 * BedSettingsPanel
 *
 * Right-sidebar section for editing workspace configuration:
 *   - Workspace mode (flat bed / tumbler wrap)
 *   - Flat-bed dimensions
 *   - Tumbler dimensions (diameter + printable height)
 *   - Derived tumbler wrap width (circumference)
 *   - Grid spacing (mm)
 *   - Snap to grid toggle
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
} from "@/data/tumblerProfiles";
import styles from "./BedSettingsPanel.module.css";

interface Props {
  bedConfig: BedConfig;
  onUpdateBedConfig: (config: BedConfig) => void;
}

type NumericConfigField =
  | "flatWidth"
  | "flatHeight"
  | "tumblerDiameterMm"
  | "tumblerPrintableHeightMm"
  | "gridSpacing";

export function BedSettingsPanel({ bedConfig, onUpdateBedConfig }: Props) {
  const set = (patch: Partial<BedConfig>) =>
    onUpdateBedConfig(normalizeBedConfig({ ...bedConfig, ...patch }));

  const handleNumber = (field: NumericConfigField, value: number) => {
    if (field === "tumblerDiameterMm") {
      const isTapered = bedConfig.tumblerShapeType === "tapered";
      set({
        tumblerDiameterMm: value,
        tumblerOutsideDiameterMm: value,
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
      });
      return;
    }

    set({ [field]: value } as Partial<BedConfig>);
  };

  const wrapWidthMm = bedConfig.tumblerTemplateWidthMm ?? computeTumblerWrapWidthMm(bedConfig.tumblerDiameterMm);
  const isTumblerMode = bedConfig.workspaceMode === "tumbler-wrap";
  const activeProfile = bedConfig.tumblerProfileId
    ? getTumblerProfileById(bedConfig.tumblerProfileId)
    : null;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Bed Settings</span>
      </div>

      <div className={styles.body}>
        <FieldRow label="Workspace">
          <select
            className={styles.select}
            value={bedConfig.workspaceMode}
            onChange={(e) =>
              set({ workspaceMode: e.target.value as BedConfig["workspaceMode"] })
            }
            aria-label="Workspace mode"
          >
            <option value="flat-bed">Flat Bed</option>
            <option value="tumbler-wrap">Tumbler Wrap</option>
          </select>
        </FieldRow>

        {isTumblerMode ? (
          <>
            <FieldRow label="Profile">
              <select
                className={styles.select}
                value={bedConfig.tumblerProfileId ?? ""}
                onChange={(e) => {
                  const profileId = e.target.value || undefined;
                  const profile = profileId ? getTumblerProfileById(profileId) : null;
                  set({
                    tumblerProfileId: profileId,
                    tumblerGuideBand: profile?.guideBand,
                  });
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

            <FieldRow label="Diameter (mm)">
              <DraftNumberInput
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
              <span className={styles.readonlyValue}>{wrapWidthMm.toFixed(2)}</span>
            </FieldRow>

            {activeProfile?.guideBand && (
              <>
                <FieldRow label="Guide Upper">
                  <span className={styles.readonlyValue}>
                    {activeProfile.guideBand.upperGrooveYmm.toFixed(1)} mm
                  </span>
                </FieldRow>
                <FieldRow label="Guide Lower">
                  <span className={styles.readonlyValue}>
                    {activeProfile.guideBand.lowerGrooveYmm.toFixed(1)} mm
                  </span>
                </FieldRow>
              </>
            )}
          </>
        ) : (
          <>
            <FieldRow label="Width (mm)">
              <DraftNumberInput
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

        {/* Grid spacing */}
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

        {/* Snap to grid */}
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

        {/* Show origin */}
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

        {/* Origin position */}
        <FieldRow label="Origin">
          <select
            className={styles.select}
            value={bedConfig.originPosition}
            onChange={(e) =>
              set({
                originPosition: e.target.value as BedConfig["originPosition"],
              })
            }
            aria-label="Origin position"
          >
            <option value="top-left">Top-left</option>
            {/* TODO: bottom-left support requires flipping y in the workspace render */}
            <option value="bottom-left" disabled>
              Bottom-left (coming soon)
            </option>
          </select>
        </FieldRow>

        {/* Show crosshair */}
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

        {/* Crosshair mode */}
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
      </div>
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
  value,
  min,
  max,
  step,
  className,
  onValueChange,
  "aria-label": ariaLabel,
}: {
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
