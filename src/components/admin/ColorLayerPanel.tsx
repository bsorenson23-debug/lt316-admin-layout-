"use client";

import React from "react";
import {
  type LaserLayer,
  type LayerMode,
  LAYER_MODE_LABELS,
  LAYER_PALETTE,
  buildDefaultLayers,
  extractSvgColors,
} from "@/types/laserLayer";
import { applyOutcomeToLayer } from "@/features/color-profiles/presetBridge";
import {
  resolveProcessContext,
  resolveSupportedOutcomes,
  suggestNearestOutcome,
} from "@/features/color-profiles/resolver";
import type { ResolvedOutcome } from "@/features/color-profiles/types";
import type { LaserProfile } from "@/types/laserProfile";
import { getActiveLaserProfile } from "@/utils/laserProfileState";
import styles from "./ColorLayerPanel.module.css";

interface Props {
  layers: LaserLayer[];
  onUpdateLayer: (layer: LaserLayer) => void;
  onSetLayers: (layers: LaserLayer[]) => void;
  activeAssetContent?: string;
  currentMaterialSlug?: string | null;
  currentMaterialLabel?: string | null;
  productHint?: string | null;
}

export function ColorLayerPanel({
  layers,
  onUpdateLayer,
  onSetLayers,
  activeAssetContent,
  currentMaterialSlug,
  currentMaterialLabel,
  productHint,
}: Props) {
  const [selectedLayerId, setSelectedLayerId] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(true);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [activeLaser, setActiveLaser] = React.useState<LaserProfile | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setActiveLaser(getActiveLaserProfile());
  }, [open, currentMaterialSlug, currentMaterialLabel, productHint]);

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
  const outcomesById = React.useMemo(
    () => new Map(outcomes.map((outcome) => [outcome.id, outcome])),
    [outcomes],
  );
  const enabledCount = layers.filter((layer) => layer.enabled).length;
  const selectedLayer = layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const suggestedOutcome = React.useMemo(() => {
    if (!selectedLayer) return null;
    return suggestNearestOutcome(outcomes, selectedLayer.color);
  }, [outcomes, selectedLayer]);
  const activeLaserLabel = activeLaser
    ? `${activeLaser.name} - ${activeLaser.wattagePeak}W ${activeLaser.isMopaCapable ? "MOPA" : activeLaser.sourceType.toUpperCase()}`
    : "No active laser";
  const outcomeSignature = React.useMemo(
    () => outcomes.map((outcome) => `${outcome.id}:${outcome.basePresetId ?? "none"}`).join("|"),
    [outcomes],
  );

  React.useEffect(() => {
    if (!activeLaser || outcomes.length === 0) return;

    let changed = false;
    const nextLayers = layers.map((layer) => {
      if (!layer.outcomeId) return layer;
      const resolvedOutcome = outcomesById.get(layer.outcomeId);
      if (!resolvedOutcome || !resolvedOutcome.presetAvailable) return layer;
      const updatedLayer = applyResolvedOutcome(layer, resolvedOutcome, activeLaser, layer.outcomeDeltaE);
      if (updatedLayer && !areLayerSettingsEqual(layer, updatedLayer)) {
        changed = true;
        return updatedLayer;
      }
      return layer;
    });

    if (changed) {
      onSetLayers(nextLayers);
    }
  }, [activeLaser, layers, onSetLayers, outcomeSignature, outcomesById]);

  React.useEffect(() => {
    if (!activeLaser || outcomes.length !== 1) return;

    const autoOutcome = outcomes[0];
    if (!autoOutcome.presetAvailable) return;

    let changed = false;
    const nextLayers = layers.map((layer) => {
      if (!layer.enabled || layer.outcomeId === autoOutcome.id) return layer;
      const updatedLayer = applyResolvedOutcome(layer, autoOutcome, activeLaser);
      if (updatedLayer && !areLayerSettingsEqual(layer, updatedLayer)) {
        changed = true;
        return updatedLayer;
      }
      return layer;
    });

    if (changed) {
      onSetLayers(nextLayers);
      setStatusMessage(`Applied ${autoOutcome.label} to all enabled layers for the current material.`);
    }
  }, [activeLaser, layers, onSetLayers, outcomeSignature, outcomes]);

  const patch = React.useCallback((updates: Partial<LaserLayer>) => {
    if (!selectedLayer) return;
    onUpdateLayer({ ...selectedLayer, ...updates });
  }, [onUpdateLayer, selectedLayer]);

  const handleDetect = React.useCallback(() => {
    if (!activeAssetContent) return;
    const found = extractSvgColors(activeAssetContent);
    if (found.length === 0) {
      setStatusMessage("No stroke or fill colors found in the selected SVG.");
      return;
    }

    const next = layers.map((layer) => ({
      ...layer,
      enabled: found.some((color) => color.toLowerCase() === layer.color.toLowerCase()),
    }));
    onSetLayers(next);

    const paletteColors = LAYER_PALETTE.map((entry) => entry.color.toLowerCase());
    const unmatched = found.filter((color) => !paletteColors.includes(color.toLowerCase()));
    setStatusMessage(
      unmatched.length > 0
        ? `${found.length} colors enabled. Off-palette colors: ${unmatched.join(", ")}`
        : `${found.length} colors detected and enabled.`,
    );
  }, [activeAssetContent, layers, onSetLayers]);

  const handleReset = React.useCallback(() => {
    onSetLayers(buildDefaultLayers());
    setSelectedLayerId(null);
    setStatusMessage("Layer settings reset to the default LightBurn palette.");
  }, [onSetLayers]);

  const handleApplySuggestions = React.useCallback(() => {
    if (!activeLaser || outcomes.length === 0) return;

    let appliedCount = 0;
    let skippedCount = 0;

    const nextLayers = layers.map((layer) => {
      if (!layer.enabled) return layer;

      const targetOutcome = outcomes.length === 1
        ? outcomes[0]
        : suggestNearestOutcome(outcomes, layer.color);

      if (!targetOutcome || !targetOutcome.presetAvailable) {
        skippedCount += 1;
        return layer;
      }

      const updatedLayer = applyResolvedOutcome(layer, targetOutcome, activeLaser);
      if (!updatedLayer) {
        skippedCount += 1;
        return layer;
      }

      appliedCount += 1;
      return updatedLayer;
    });

    onSetLayers(nextLayers);

    if (appliedCount === 0) {
      setStatusMessage("No enabled layers could be mapped to a supported outcome.");
      return;
    }

    setStatusMessage(
      skippedCount > 0
        ? `Applied ${appliedCount} layer outcomes. ${skippedCount} enabled layers still need manual review.`
        : `Applied resolver-backed outcomes to ${appliedCount} enabled layers.`,
    );
  }, [activeLaser, layers, onSetLayers, outcomes]);

  const handleApplyOutcome = React.useCallback((layer: LaserLayer, outcomeId: string) => {
    if (!activeLaser) return;

    if (!outcomeId) {
      onUpdateLayer(clearOutcomeMetadata(layer));
      setStatusMessage(`Cleared the mapped outcome for ${layer.name}.`);
      return;
    }

    const outcome = outcomesById.get(outcomeId);
    if (!outcome) return;
    if (!outcome.presetAvailable) {
      setStatusMessage(`${outcome.label} is defined, but no preset is mapped for the current laser family yet.`);
      return;
    }

    const updatedLayer = applyResolvedOutcome(layer, outcome, activeLaser);
    if (!updatedLayer) return;
    onUpdateLayer(updatedLayer);
    setStatusMessage(`Applied ${outcome.label} to ${layer.color}.`);
  }, [activeLaser, onUpdateLayer, outcomesById]);

  const handleRefreshSelectedLayer = React.useCallback(() => {
    if (!selectedLayer || !selectedLayer.outcomeId || !activeLaser) return;
    const outcome = outcomesById.get(selectedLayer.outcomeId);
    if (!outcome || !outcome.presetAvailable) return;
    const updatedLayer = applyResolvedOutcome(selectedLayer, outcome, activeLaser, selectedLayer.outcomeDeltaE);
    if (!updatedLayer) return;
    onUpdateLayer(updatedLayer);
    setStatusMessage(`Reapplied ${outcome.label} for ${activeLaser.name}.`);
  }, [activeLaser, onUpdateLayer, outcomesById, selectedLayer]);

  return (
    <section className={styles.panel}>
      <button
        className={styles.header}
        onClick={() => setOpen((value) => !value)}
        type="button"
        aria-expanded={open}
      >
        <span className={styles.title}>Color Layers</span>
        <span className={styles.badge}>{enabledCount} active</span>
        <span className={styles.chevron}>{open ? "v" : ">"}</span>
      </button>

      {open && (
        <div className={styles.body}>
          <div className={styles.sectionLabel}>Palette</div>
          <div className={styles.swatchGrid}>
            {layers.map((layer) => (
              <button
                key={layer.id}
                type="button"
                title={layer.outcomeLabel ? `${layer.name} -> ${layer.outcomeLabel}` : layer.name}
                className={[
                  styles.swatch,
                  layer.id === selectedLayerId ? styles.swatchSelected : "",
                  layer.enabled ? styles.swatchEnabled : styles.swatchDisabled,
                ].filter(Boolean).join(" ")}
                style={{ background: layer.color }}
                onClick={() => setSelectedLayerId((current) => current === layer.id ? null : layer.id)}
              >
                {layer.enabled && <span className={styles.swatchDot} />}
                {layer.outcomeId && <span className={styles.swatchMatchPin} title={layer.outcomeLabel ?? "Mapped outcome"} />}
              </button>
            ))}
          </div>

          <div className={styles.detectRow}>
            <button
              type="button"
              className={styles.detectBtn}
              onClick={handleDetect}
              disabled={!activeAssetContent}
              title="Enable LightBurn palette layers that appear in the selected SVG"
            >
              Detect from SVG
            </button>
            <button
              type="button"
              className={styles.resetBtn}
              onClick={handleReset}
              title="Reset all layer settings"
            >
              Reset
            </button>
          </div>

          <div className={styles.sectionLabel}>Material Resolver</div>
          {!currentMaterialSlug ? (
            <div className={styles.machineBarMissing}>
              Select a product or flat-bed item to resolve supported outcomes.
            </div>
          ) : (
            <>
              <div className={styles.machineBar}>
                <span className={styles.machineName}>{currentMaterialLabel ?? currentMaterialSlug}</span>
                <span className={styles.machineBadge}>{activeLaser ? activeLaser.sourceType.toUpperCase() : "NO LASER"}</span>
                <span className={styles.machineWatts}>{activeLaserLabel}</span>
              </div>

              {resolvedContext?.warnings.map((warning) => (
                <div key={warning} className={styles.smartWarn}>{warning}</div>
              ))}

              {activeLaser && outcomes.length === 0 && (
                <div className={styles.smartWarn}>
                  No outcomes are supported for this material and laser combination. Leave layers manual or switch material or laser.
                </div>
              )}

              {activeLaser && outcomes.length === 1 && (
                <div className={styles.smartNote}>
                  One supported outcome is available. Enabled layers are auto-filled with that process.
                </div>
              )}

              {activeLaser && outcomes.length > 1 && (
                <>
                  <div className={styles.smartNote}>
                    Supported outcomes: {outcomes.map((outcome) => outcome.label).join(", ")}
                  </div>
                  <button
                    type="button"
                    className={styles.smartBtn}
                    disabled={enabledCount === 0}
                    onClick={handleApplySuggestions}
                  >
                    Apply suggested outcomes
                  </button>
                </>
              )}
            </>
          )}

          {statusMessage && <div className={styles.detectMsg}>{statusMessage}</div>}

          {selectedLayer ? (
            <div className={styles.editor}>
              <div className={styles.editorHeader}>
                <span className={styles.editorSwatch} style={{ background: selectedLayer.color }} />
                <span className={styles.editorTitle}>{selectedLayer.name}</span>
                <label className={styles.enableToggle}>
                  <input
                    type="checkbox"
                    checked={selectedLayer.enabled}
                    onChange={(event) => patch({ enabled: event.target.checked })}
                    style={{ display: "none" }}
                  />
                  <span className={selectedLayer.enabled ? styles.toggleOn : styles.toggleOff}>
                    {selectedLayer.enabled ? "ON" : "OFF"}
                  </span>
                </label>
              </div>

              {selectedLayer.outcomeLabel && (
                <div className={styles.matchBadge}>
                  <span className={styles.matchSwatch} style={{ background: selectedLayer.outcomeTargetHex ?? selectedLayer.color }} />
                  <span className={styles.matchText}>
                    Outcome: <strong>{selectedLayer.outcomeLabel}</strong>
                    {selectedLayer.outcomeDeltaE != null && (
                      <span className={styles.matchDelta}> dE {selectedLayer.outcomeDeltaE.toFixed(1)}</span>
                    )}
                  </span>
                  {selectedLayer.matchedPresetLabel && (
                    <span className={styles.matchPreset}>{selectedLayer.matchedPresetLabel}</span>
                  )}
                  {selectedLayer.outcomeNotes && (
                    <span className={styles.matchPreset}>{selectedLayer.outcomeNotes}</span>
                  )}
                  <button
                    type="button"
                    className={styles.matchActionBtn}
                    onClick={handleRefreshSelectedLayer}
                  >
                    Reapply for active laser
                  </button>
                </div>
              )}

              {!selectedLayer.outcomeLabel && suggestedOutcome && outcomes.length > 1 && (
                <div className={styles.matchBadge}>
                  <span className={styles.matchSwatch} style={{ background: suggestedOutcome.targetHex ?? selectedLayer.color }} />
                  <span className={styles.matchText}>
                    Suggested: <strong>{suggestedOutcome.label}</strong>
                  </span>
                  <button
                    type="button"
                    className={styles.matchActionBtn}
                    onClick={() => handleApplyOutcome(selectedLayer, suggestedOutcome.id)}
                  >
                    Apply suggestion
                  </button>
                </div>
              )}

              {currentMaterialSlug && activeLaser && outcomes.length > 0 && (
                <div className={styles.editorRow}>
                  <label className={styles.editorLabel}>Outcome</label>
                  <select
                    className={styles.editorSelect}
                    value={selectedLayer.outcomeId ?? ""}
                    onChange={(event) => handleApplyOutcome(selectedLayer, event.target.value)}
                  >
                    <option value="">Manual settings</option>
                    {outcomes.map((outcome) => (
                      <option key={outcome.id} value={outcome.id}>
                        {outcome.label}{outcome.presetAvailable ? "" : " (no preset)"}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className={styles.editorRow}>
                <label className={styles.editorLabel}>Name</label>
                <input
                  type="text"
                  className={styles.editorInput}
                  value={selectedLayer.name}
                  onChange={(event) => patch({ name: event.target.value })}
                />
              </div>

              <div className={styles.editorRow}>
                <label className={styles.editorLabel}>Color</label>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="color"
                    className={styles.colorPicker}
                    value={selectedLayer.color}
                    onChange={(event) => patch({ color: event.target.value })}
                  />
                  <input
                    type="text"
                    className={styles.editorInput}
                    style={{ width: 88 }}
                    value={selectedLayer.color}
                    onChange={(event) => patch({ color: event.target.value })}
                  />
                </div>
              </div>

              <div className={styles.editorRow}>
                <label className={styles.editorLabel}>Mode</label>
                <select
                  className={styles.editorSelect}
                  value={selectedLayer.mode}
                  onChange={(event) => patch({ mode: event.target.value as LayerMode })}
                >
                  {(Object.entries(LAYER_MODE_LABELS) as [LayerMode, string][]).map(([key, value]) => (
                    <option key={key} value={key}>{value}</option>
                  ))}
                </select>
              </div>

              <div className={styles.editorRow}>
                <label className={styles.editorLabel}>Speed</label>
                <div style={{ display: "flex", gap: 4, alignItems: "center", flex: 1 }}>
                  <input
                    type="range"
                    min={1}
                    max={2000}
                    step={10}
                    value={selectedLayer.speedMmS}
                    onChange={(event) => patch({ speedMmS: Number(event.target.value) })}
                    className={styles.editorSlider}
                  />
                  <span className={styles.editorVal}>{selectedLayer.speedMmS} mm/s</span>
                </div>
              </div>

              <div className={styles.editorRow}>
                <label className={styles.editorLabel}>Power</label>
                <div style={{ display: "flex", gap: 4, alignItems: "center", flex: 1 }}>
                  <input
                    type="range"
                    min={1}
                    max={100}
                    step={1}
                    value={selectedLayer.powerPct}
                    onChange={(event) => patch({ powerPct: Number(event.target.value) })}
                    className={styles.editorSlider}
                  />
                  <span className={styles.editorVal}>{selectedLayer.powerPct}%</span>
                </div>
              </div>

              <div className={styles.editorRow}>
                <label className={styles.editorLabel}>Passes</label>
                <input
                  type="number"
                  className={styles.editorInput}
                  min={1}
                  max={20}
                  step={1}
                  value={selectedLayer.passes}
                  style={{ width: 60 }}
                  onChange={(event) => patch({ passes: Math.max(1, Number(event.target.value)) })}
                />
              </div>

              <div className={styles.mopaSection}>
                <div className={styles.mopaSectionLabel}>Fiber Advanced</div>

                <div className={styles.editorRow}>
                  <label className={styles.editorLabel}>Freq</label>
                  <input
                    type="number"
                    className={styles.editorInput}
                    min={1}
                    max={4000}
                    step={1}
                    style={{ width: 70 }}
                    placeholder="-"
                    value={selectedLayer.frequencyKhz ?? ""}
                    onChange={(event) => patch({
                      frequencyKhz: event.target.value ? Number(event.target.value) : undefined,
                    })}
                  />
                  <span className={styles.editorUnit}>kHz</span>
                </div>

                <div className={styles.editorRow}>
                  <label className={styles.editorLabel}>Pulse</label>
                  <input
                    type="number"
                    className={styles.editorInput}
                    min={1}
                    max={500}
                    step={1}
                    style={{ width: 70 }}
                    placeholder="-"
                    value={selectedLayer.pulseWidthNs ?? ""}
                    onChange={(event) => patch({
                      pulseWidthNs: event.target.value ? Number(event.target.value) : undefined,
                    })}
                  />
                  <span className={styles.editorUnit}>ns</span>
                </div>

                <div className={styles.editorRow}>
                  <label className={styles.editorLabel}>Interval</label>
                  <input
                    type="number"
                    className={styles.editorInput}
                    min={0.001}
                    max={1}
                    step={0.001}
                    style={{ width: 70 }}
                    placeholder="-"
                    value={selectedLayer.lineIntervalMm ?? ""}
                    onChange={(event) => patch({
                      lineIntervalMm: event.target.value ? Number(event.target.value) : undefined,
                    })}
                  />
                  <span className={styles.editorUnit}>mm</span>
                </div>
              </div>

              <div className={styles.editorRow}>
                <label className={styles.editorLabel}>Priority</label>
                <input
                  type="number"
                  className={styles.editorInput}
                  min={0}
                  max={99}
                  step={1}
                  value={selectedLayer.priority}
                  style={{ width: 60 }}
                  onChange={(event) => patch({ priority: Number(event.target.value) })}
                />
              </div>

              <div className={styles.summary}>
                {selectedLayer.enabled ? (
                  <span className={styles.summaryEnabled}>
                    {LAYER_MODE_LABELS[selectedLayer.mode]} - {selectedLayer.speedMmS} mm/s - {selectedLayer.powerPct}% - {selectedLayer.passes}x
                    {selectedLayer.frequencyKhz != null && ` - ${selectedLayer.frequencyKhz} kHz`}
                    {selectedLayer.pulseWidthNs != null && ` - ${selectedLayer.pulseWidthNs} ns`}
                  </span>
                ) : (
                  <span className={styles.summaryDisabled}>Layer disabled and excluded from export.</span>
                )}
              </div>
            </div>
          ) : (
            <div className={styles.editorHint}>
              Click a color swatch to edit its settings or mapped outcome.
            </div>
          )}

          {enabledCount > 0 && (
            <>
              <div className={styles.sectionLabel}>Active Layers</div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th />
                    <th>Name</th>
                    <th>Outcome</th>
                    <th>Spd</th>
                    <th>Pwr</th>
                    <th>Freq</th>
                    <th>PW</th>
                  </tr>
                </thead>
                <tbody>
                  {layers
                    .filter((layer) => layer.enabled)
                    .sort((a, b) => a.priority - b.priority)
                    .map((layer) => (
                      <tr
                        key={layer.id}
                        className={layer.id === selectedLayerId ? styles.tableRowSelected : ""}
                        onClick={() => setSelectedLayerId((current) => current === layer.id ? null : layer.id)}
                        style={{ cursor: "pointer" }}
                      >
                        <td>
                          <span className={styles.tableColorDot} style={{ background: layer.color }} />
                          {layer.outcomeLabel && (
                            <span className={styles.tableOutcomeChip}>{layer.outcomeLabel}</span>
                          )}
                        </td>
                        <td className={styles.tableCell}>{layer.name}</td>
                        <td className={styles.tableCell}>{layer.processFamily ?? "-"}</td>
                        <td className={styles.tableCell}>{layer.speedMmS}</td>
                        <td className={styles.tableCell}>{layer.powerPct}%</td>
                        <td className={styles.tableCell}>{layer.frequencyKhz != null ? `${layer.frequencyKhz}k` : "-"}</td>
                        <td className={styles.tableCell}>{layer.pulseWidthNs != null ? `${layer.pulseWidthNs}ns` : "-"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function applyResolvedOutcome(
  layer: LaserLayer,
  outcome: ResolvedOutcome,
  activeLaser: LaserProfile,
  matchDeltaE?: number,
): LaserLayer | null {
  const applied = applyOutcomeToLayer(outcome, activeLaser, matchDeltaE);
  if (!applied) return null;

  return {
    ...layer,
    ...applied.fields,
    name: outcome.label,
    matchDeltaE: applied.fields.outcomeDeltaE,
    matchTargetName: applied.fields.outcomeLabel,
    matchTargetHex: applied.fields.outcomeTargetHex,
  };
}

function clearOutcomeMetadata(layer: LaserLayer): LaserLayer {
  return {
    ...layer,
    matchedPresetId: undefined,
    matchedPresetLabel: undefined,
    processFamily: undefined,
    outcomeId: undefined,
    outcomeLabel: undefined,
    outcomeTargetHex: undefined,
    outcomeDeltaE: undefined,
    outcomeNotes: undefined,
    matchDeltaE: undefined,
    matchTargetName: undefined,
    matchTargetHex: undefined,
  };
}

function areLayerSettingsEqual(a: LaserLayer, b: LaserLayer): boolean {
  return (
    a.name === b.name &&
    a.mode === b.mode &&
    a.speedMmS === b.speedMmS &&
    a.powerPct === b.powerPct &&
    a.passes === b.passes &&
    a.frequencyKhz === b.frequencyKhz &&
    a.pulseWidthNs === b.pulseWidthNs &&
    a.lineIntervalMm === b.lineIntervalMm &&
    a.matchedPresetId === b.matchedPresetId &&
    a.matchedPresetLabel === b.matchedPresetLabel &&
    a.processFamily === b.processFamily &&
    a.outcomeId === b.outcomeId &&
    a.outcomeLabel === b.outcomeLabel &&
    a.outcomeTargetHex === b.outcomeTargetHex &&
    a.outcomeDeltaE === b.outcomeDeltaE &&
    a.outcomeNotes === b.outcomeNotes &&
    a.matchDeltaE === b.matchDeltaE &&
    a.matchTargetName === b.matchTargetName &&
    a.matchTargetHex === b.matchTargetHex
  );
}
