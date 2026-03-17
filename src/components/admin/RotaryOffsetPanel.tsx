"use client";

import React from "react";
import type { BedOrigin, RotaryPlacementPreset } from "@/types/export";
import { buildRotaryPlacementPreview } from "@/utils/rotaryCalibration";
import { getBedCenterXmm } from "@/utils/rotaryCenter";
import {
  deleteRotaryPreset,
  getRotaryPresets,
  saveRotaryPreset,
  updateRotaryPreset,
} from "@/utils/adminCalibrationState";
import { RotaryPresetList } from "./RotaryPresetList";
import { RotaryPlacementPreview } from "./RotaryPlacementPreview";
import { RotaryPresetDraft, RotaryPresetForm } from "./RotaryPresetForm";
import styles from "./RotaryOffsetPanel.module.css";

const DEFAULT_TEMPLATE_WIDTH_MM = 276.15;
const DEFAULT_BED_WIDTH_MM = 300;

function parseNumberInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildDraftFromPreset(preset: RotaryPlacementPreset): RotaryPresetDraft {
  return {
    name: preset.name,
    rotaryCenterXmm: String(preset.rotaryCenterXmm),
    rotaryTopYmm:
      typeof preset.rotaryTopYmm === "number" ? String(preset.rotaryTopYmm) : "",
    chuckOrRoller: preset.chuckOrRoller,
    bedOrigin: preset.bedOrigin,
    notes: preset.notes ?? "",
  };
}

function buildEmptyDraft(): RotaryPresetDraft {
  const bedCenterXmm = getBedCenterXmm(DEFAULT_BED_WIDTH_MM);
  return {
    name: "",
    rotaryCenterXmm: String(bedCenterXmm),
    rotaryTopYmm: "",
    chuckOrRoller: "roller",
    bedOrigin: "top-left",
    notes: "",
  };
}

function validateDraft(
  draft: RotaryPresetDraft
): { ok: true; value: Omit<RotaryPlacementPreset, "id"> } | { ok: false; error: string } {
  const name = draft.name.trim();
  if (!name) {
    return { ok: false, error: "Preset name is required." };
  }

  const rotaryCenterXmm = parseNumberInput(draft.rotaryCenterXmm);
  if (rotaryCenterXmm === null || rotaryCenterXmm < 0) {
    return { ok: false, error: "Rotary Center X must be a valid non-negative number." };
  }

  const rotaryTopYmm = draft.rotaryTopYmm.trim()
    ? parseNumberInput(draft.rotaryTopYmm)
    : null;
  if (rotaryTopYmm !== null && rotaryTopYmm < 0) {
    return { ok: false, error: "Top Anchor Y must be a valid non-negative number." };
  }

  return {
    ok: true,
    value: {
      name,
      rotaryCenterXmm,
      rotaryTopYmm: rotaryTopYmm ?? undefined,
      chuckOrRoller: draft.chuckOrRoller,
      bedOrigin: draft.bedOrigin as BedOrigin,
      notes: draft.notes.trim() || undefined,
    },
  };
}

export function RotaryOffsetPanel() {
  const [isLoading, setIsLoading] = React.useState(true);
  const [presets, setPresets] = React.useState<RotaryPlacementPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = React.useState<string | null>(
    null
  );
  const [editorMode, setEditorMode] = React.useState<"create" | "edit">("create");
  const [draft, setDraft] = React.useState<RotaryPresetDraft>(buildEmptyDraft);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [templateWidthMm, setTemplateWidthMm] = React.useState(
    String(DEFAULT_TEMPLATE_WIDTH_MM)
  );
  const [topAnchorOffsetMm, setTopAnchorOffsetMm] = React.useState("0");

  React.useEffect(() => {
    const loaded = getRotaryPresets();
    setPresets(loaded);

    if (loaded.length > 0) {
      setSelectedPresetId(loaded[0].id);
      setEditorMode("edit");
      setDraft(buildDraftFromPreset(loaded[0]));
    } else {
      setSelectedPresetId(null);
      setEditorMode("create");
      setDraft(buildEmptyDraft());
    }

    setIsLoading(false);
  }, []);

  const handleSelectPreset = React.useCallback(
    (presetId: string) => {
      const preset = presets.find((entry) => entry.id === presetId);
      if (!preset) return;
      setErrorMessage(null);
      setStatusMessage(null);
      setEditorMode("edit");
      setSelectedPresetId(presetId);
      setDraft(buildDraftFromPreset(preset));
    },
    [presets]
  );

  const handleStartCreate = React.useCallback(() => {
    setEditorMode("create");
    setSelectedPresetId(null);
    setDraft(buildEmptyDraft());
    setErrorMessage(null);
    setStatusMessage(null);
  }, []);

  const handleSave = React.useCallback(() => {
    const parsed = validateDraft(draft);
    if (!parsed.ok) {
      setErrorMessage(parsed.error);
      setStatusMessage(null);
      return;
    }

    try {
      if (editorMode === "create" || !selectedPresetId) {
        const next = saveRotaryPreset(parsed.value);
        const created = next[next.length - 1] ?? null;
        setPresets(next);
        if (created) {
          setSelectedPresetId(created.id);
          setDraft(buildDraftFromPreset(created));
          setEditorMode("edit");
        }
        setStatusMessage("Preset created.");
      } else {
        const next = updateRotaryPreset(selectedPresetId, parsed.value);
        setPresets(next);
        const updated = next.find((preset) => preset.id === selectedPresetId);
        if (updated) {
          setDraft(buildDraftFromPreset(updated));
        }
        setStatusMessage("Preset updated.");
      }
      setErrorMessage(null);
    } catch {
      setErrorMessage("Could not save preset. Try again.");
      setStatusMessage(null);
    }
  }, [draft, editorMode, selectedPresetId]);

  const handleDelete = React.useCallback(() => {
    if (!selectedPresetId) return;
    try {
      const next = deleteRotaryPreset(selectedPresetId);
      setPresets(next);
      if (next.length > 0) {
        const fallback = next[0];
        setSelectedPresetId(fallback.id);
        setDraft(buildDraftFromPreset(fallback));
        setEditorMode("edit");
      } else {
        setSelectedPresetId(null);
        setDraft(buildEmptyDraft());
        setEditorMode("create");
      }
      setErrorMessage(null);
      setStatusMessage("Preset deleted.");
    } catch {
      setErrorMessage("Could not delete preset. Try again.");
      setStatusMessage(null);
    }
  }, [selectedPresetId]);

  const preview = React.useMemo(() => {
    const centerX = parseNumberInput(draft.rotaryCenterXmm) ?? 0;
    const topY = parseNumberInput(draft.rotaryTopYmm) ?? 0;
    const width = parseNumberInput(templateWidthMm) ?? DEFAULT_TEMPLATE_WIDTH_MM;
    const topOffset = parseNumberInput(topAnchorOffsetMm) ?? 0;
    return buildRotaryPlacementPreview({
      templateWidthMm: width,
      rotaryCenterXmm: centerX,
      rotaryTopYmm: topY,
      topAnchorOffsetMm: topOffset,
    });
  }, [draft.rotaryCenterXmm, draft.rotaryTopYmm, templateWidthMm, topAnchorOffsetMm]);

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Rotary Offset</span>
        <span className={styles.badge}>v1</span>
      </div>

      <div className={styles.body}>
        <div className={styles.sectionLabel}>Saved Rotary Presets</div>
        {isLoading ? (
          <div className={styles.loading}>Loading rotary presets...</div>
        ) : (
          <RotaryPresetList
            presets={presets}
            selectedPresetId={selectedPresetId}
            onSelectPreset={handleSelectPreset}
          />
        )}

        <RotaryPresetForm
          mode={editorMode}
          draft={draft}
          onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          onStartCreate={handleStartCreate}
          onSave={handleSave}
          onDelete={handleDelete}
          canDelete={editorMode === "edit" && selectedPresetId !== null}
          errorMessage={errorMessage}
          statusMessage={statusMessage}
        />

        <div className={styles.sectionLabel}>Preview Inputs</div>
        <div className={styles.twoCol}>
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
        </div>

        <div className={styles.sectionLabel}>Placement Preview</div>
        <RotaryPlacementPreview values={preview} />
      </div>
    </section>
  );
}
