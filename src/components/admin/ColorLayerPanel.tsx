"use client";

/**
 * ColorLayerPanel
 *
 * LightBurn-style color layer editor with Smart Lookup for stainless steel.
 * Each color swatch = one laser layer with its own speed / power / passes / mode.
 * SVG paths are assigned to a layer by matching their stroke color.
 *
 * When "Stainless Steel" material is selected and Smart Lookup is triggered,
 * each enabled layer's color is matched to the closest achievable oxide colour
 * and the corresponding MOPA preset settings are auto-filled.
 */

import React, { useState, useCallback } from "react";
import {
  type LaserLayer,
  type LayerMode,
  LAYER_PALETTE,
  LAYER_MODE_LABELS,
  buildDefaultLayers,
  extractSvgColors,
} from "@/types/laserLayer";
import {
  matchSteelColor,
  applyPresetToLayerFields,
  getActiveMachineContext,
  type MachineContext,
} from "@/utils/steelColorLookup";
import { LASER_MATERIAL_PRESETS } from "@/data/laserMaterialPresets";
import styles from "./ColorLayerPanel.module.css";

// ── Materials that support smart colour lookup ────────────────────────────────
const SMART_LOOKUP_MATERIALS = [
  { value: "stainless-steel", label: "Stainless Steel (MOPA fiber)" },
] as const;

type SmartMaterial = (typeof SMART_LOOKUP_MATERIALS)[number]["value"] | "";

interface Props {
  layers: LaserLayer[];
  onUpdateLayer: (layer: LaserLayer) => void;
  onSetLayers: (layers: LaserLayer[]) => void;
  activeAssetContent?: string;
}

export function ColorLayerPanel({
  layers,
  onUpdateLayer,
  onSetLayers,
  activeAssetContent,
}: Props) {
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const [detectMsg, setDetectMsg] = useState<string | null>(null);
  const [material, setMaterial] = useState<SmartMaterial>("");
  const [machine, setMachine] = useState<MachineContext | null>(null);

  // Read active machine from localStorage whenever the panel opens
  React.useEffect(() => {
    if (open) setMachine(getActiveMachineContext());
  }, [open]);

  const selectedLayer = layers.find(l => l.id === selectedLayerId) ?? null;

  // ── Detect colors from SVG ──────────────────────────────────────────────
  const handleDetect = useCallback(() => {
    if (!activeAssetContent) return;
    const found = extractSvgColors(activeAssetContent);
    if (found.length === 0) { setDetectMsg("No stroke/fill colors found in SVG."); return; }

    const next = layers.map(layer => ({
      ...layer,
      enabled: found.some(c => c.toLowerCase() === layer.color.toLowerCase()),
    }));
    onSetLayers(next);

    const paletteColors = LAYER_PALETTE.map(p => p.color.toLowerCase());
    const unmatched = found.filter(c => !paletteColors.includes(c.toLowerCase()));
    const msg = unmatched.length > 0
      ? `${found.length} color${found.length !== 1 ? "s" : ""} enabled. Off-palette: ${unmatched.join(", ")}`
      : `${found.length} color${found.length !== 1 ? "s" : ""} detected and enabled.`;
    setDetectMsg(msg);
    setTimeout(() => setDetectMsg(null), 5000);
  }, [activeAssetContent, layers, onSetLayers]);

  // ── Smart Lookup (stainless steel oxide colours) ────────────────────────
  const handleSmartLookup = useCallback(() => {
    if (material !== "stainless-steel") return;

    // Refresh machine context right before running
    const currentMachine = getActiveMachineContext();
    setMachine(currentMachine);

    let matchedCount = 0;
    const powerNotes: string[] = [];

    const next = layers.map(layer => {
      if (!layer.enabled) return layer;

      const match = matchSteelColor(layer.color);
      if (!match) return layer;

      const preset = LASER_MATERIAL_PRESETS.find(p => p.id === match.presetId);
      if (!preset) return layer;

      matchedCount++;
      const { fields, powerNote } = applyPresetToLayerFields(preset, currentMachine);
      if (powerNote) powerNotes.push(`${match.targetName}: ${powerNote}`);

      return {
        ...layer,
        ...fields,
        name:            match.targetName,
        matchDeltaE:     match.deltaE,
        matchTargetName: match.targetName,
        matchTargetHex:  match.targetHex,
      };
    });

    onSetLayers(next);

    const machineStr = currentMachine
      ? ` (${currentMachine.machineName} ${currentMachine.wattagePeak}W)`
      : " (no machine — power not scaled)";
    setDetectMsg(
      `Smart Lookup${machineStr}: ${matchedCount} layer${matchedCount !== 1 ? "s" : ""} filled.` +
      (powerNotes.length ? " Power scaled for your machine." : ""),
    );
    setTimeout(() => setDetectMsg(null), 8000);
  }, [material, layers, onSetLayers]);

  // ── Reset all layers ────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    onSetLayers(buildDefaultLayers());
    setSelectedLayerId(null);
  }, [onSetLayers]);

  const patch = useCallback((updates: Partial<LaserLayer>) => {
    if (!selectedLayer) return;
    onUpdateLayer({ ...selectedLayer, ...updates });
  }, [selectedLayer, onUpdateLayer]);

  const enabledCount = layers.filter(l => l.enabled).length;

  return (
    <section className={styles.panel}>
      <button
        className={styles.header}
        onClick={() => setOpen(o => !o)}
        type="button"
        aria-expanded={open}
      >
        <span className={styles.title}>Color Layers</span>
        <span className={styles.badge}>{enabledCount} active</span>
        <span className={styles.chevron}>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className={styles.body}>

          {/* ── Palette grid ── */}
          <div className={styles.sectionLabel}>Palette</div>
          <div className={styles.swatchGrid}>
            {layers.map(layer => (
              <button
                key={layer.id}
                type="button"
                title={`${layer.name}${layer.matchTargetName ? ` → ${layer.matchTargetName}` : ""}\n${layer.enabled ? "Enabled" : "Disabled"}`}
                className={`${styles.swatch} ${layer.id === selectedLayerId ? styles.swatchSelected : ""} ${layer.enabled ? styles.swatchEnabled : styles.swatchDisabled}`}
                style={{
                  background: layer.color,
                  borderColor: layer.id === selectedLayerId ? "#ff6600" : layer.enabled ? "#888" : "transparent",
                }}
                onClick={() => setSelectedLayerId(id => id === layer.id ? null : layer.id)}
              >
                {layer.enabled && <span className={styles.swatchDot} />}
                {layer.matchedPresetId && <span className={styles.swatchMatchPin} title="Smart lookup applied" />}
              </button>
            ))}
          </div>

          {/* ── Detect / reset bar ── */}
          <div className={styles.detectRow}>
            <button
              type="button"
              className={styles.detectBtn}
              onClick={handleDetect}
              disabled={!activeAssetContent}
              title="Scan the selected SVG for stroke/fill colors and enable matching layers"
            >
              ⟳ Detect from SVG
            </button>
            <button
              type="button"
              className={styles.resetBtn}
              onClick={handleReset}
              title="Reset all layers to defaults"
            >
              Reset
            </button>
          </div>

          {/* ── Smart Lookup ── */}
          <div className={styles.sectionLabel} style={{ marginTop: 6 }}>Smart Lookup</div>

          {/* Machine status bar */}
          {machine ? (
            <div className={`${styles.machineBar} ${machine.isMopaCapable ? styles.machineBarOk : styles.machineBarWarn}`}>
              <span className={styles.machineIcon}>{machine.isMopaCapable ? "⬡" : "⚠"}</span>
              <span className={styles.machineName}>{machine.machineName}</span>
              <span className={styles.machineBadge}>{machine.laserType.toUpperCase()}</span>
              <span className={styles.machineWatts}>{machine.wattagePeak}W</span>
            </div>
          ) : (
            <div className={styles.machineBarMissing}>
              No machine configured — go to Setup → Machine Profile.
              Power will not be scaled.
            </div>
          )}

          <div className={styles.smartRow}>
            <select
              className={styles.materialSelect}
              value={material}
              onChange={e => setMaterial(e.target.value as SmartMaterial)}
              title="Choose the material to look up color-marking settings for"
            >
              <option value="">— Select material —</option>
              {SMART_LOOKUP_MATERIALS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <button
              type="button"
              className={styles.smartBtn}
              disabled={!material || enabledCount === 0}
              onClick={handleSmartLookup}
              title="Auto-fill laser settings scaled to your machine's wattage"
            >
              ⚡ Smart Lookup
            </button>
          </div>

          {material === "stainless-steel" && machine && !machine.isMopaCapable && (
            <div className={styles.smartWarn}>
              ⚠ Your machine is <strong>{machine.laserType.toUpperCase()}</strong> —
              stainless steel oxide color marking requires a <strong>MOPA fiber laser</strong>.
              These settings will not produce color on a CO₂ or diode machine.
            </div>
          )}
          {material === "stainless-steel" && machine?.isMopaCapable && (
            <div className={styles.smartNote}>
              Settings are calibrated for your <strong>{machine.wattagePeak}W</strong> machine.
              Power % is scaled from the reference preset. Freq and pulse width are not scaled — they determine the colour.
              Always test on scrap first.
            </div>
          )}
          {material === "stainless-steel" && !machine && (
            <div className={styles.smartNote}>
              Configure your machine in Setup → Machine Profile to get power values
              scaled to your wattage. Settings will use preset defaults until then.
            </div>
          )}

          {detectMsg && <div className={styles.detectMsg}>{detectMsg}</div>}

          {/* ── Layer editor ── */}
          {selectedLayer ? (
            <div className={styles.editor}>
              <div className={styles.editorHeader}>
                <span className={styles.editorSwatch} style={{ background: selectedLayer.color }} />
                <span className={styles.editorTitle}>{selectedLayer.name}</span>
                <label className={styles.enableToggle}>
                  <input
                    type="checkbox"
                    checked={selectedLayer.enabled}
                    onChange={e => patch({ enabled: e.target.checked })}
                    style={{ display: "none" }}
                  />
                  <span className={selectedLayer.enabled ? styles.toggleOn : styles.toggleOff}>
                    {selectedLayer.enabled ? "ON" : "OFF"}
                  </span>
                </label>
              </div>

              {/* Smart-lookup match badge */}
              {selectedLayer.matchTargetName && (
                <div className={styles.matchBadge}>
                  <span
                    className={styles.matchSwatch}
                    style={{ background: selectedLayer.matchTargetHex ?? selectedLayer.color }}
                  />
                  <span className={styles.matchText}>
                    Matched: <strong>{selectedLayer.matchTargetName}</strong>
                    {selectedLayer.matchDeltaE !== undefined && (
                      <span className={styles.matchDelta}> ΔE {selectedLayer.matchDeltaE.toFixed(1)}</span>
                    )}
                  </span>
                  {selectedLayer.matchedPresetLabel && (
                    <span className={styles.matchPreset}>{selectedLayer.matchedPresetLabel}</span>
                  )}
                  {/* Re-scale button — useful if user changes machines after lookup */}
                  <button
                    type="button"
                    onClick={() => {
                      const currentMachine = getActiveMachineContext();
                      if (!selectedLayer.matchedPresetId) return;
                      const preset = LASER_MATERIAL_PRESETS.find(p => p.id === selectedLayer.matchedPresetId);
                      if (!preset) return;
                      const { fields } = applyPresetToLayerFields(preset, currentMachine);
                      onUpdateLayer({ ...selectedLayer, ...fields });
                    }}
                    style={{
                      marginTop: 3, width: "100%", padding: "2px 6px", fontSize: 9,
                      fontFamily: "monospace", background: "#1a0a00",
                      border: "1px solid #4a2800", color: "#ff8833",
                      borderRadius: 3, cursor: "pointer",
                    }}
                  >
                    ↺ Re-scale power for current machine
                  </button>
                </div>
              )}

              <div className={styles.editorRow}>
                <label className={styles.editorLabel}>Name</label>
                <input type="text" className={styles.editorInput} value={selectedLayer.name}
                  onChange={e => patch({ name: e.target.value })} />
              </div>

              <div className={styles.editorRow}>
                <label className={styles.editorLabel}>Color</label>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="color" className={styles.colorPicker}
                    value={selectedLayer.color} onChange={e => patch({ color: e.target.value })} />
                  <input type="text" className={styles.editorInput} style={{ width: 80 }}
                    value={selectedLayer.color} onChange={e => patch({ color: e.target.value })} />
                </div>
              </div>

              <div className={styles.editorRow}>
                <label className={styles.editorLabel}>Mode</label>
                <select className={styles.editorSelect} value={selectedLayer.mode}
                  onChange={e => patch({ mode: e.target.value as LayerMode })}>
                  {(Object.entries(LAYER_MODE_LABELS) as [LayerMode, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              <div className={styles.editorRow}>
                <label className={styles.editorLabel}>Speed</label>
                <div style={{ display: "flex", gap: 4, alignItems: "center", flex: 1 }}>
                  <input type="range" min={1} max={2000} step={10}
                    value={selectedLayer.speedMmS}
                    onChange={e => patch({ speedMmS: Number(e.target.value) })}
                    className={styles.editorSlider} />
                  <span className={styles.editorVal}>{selectedLayer.speedMmS} mm/s</span>
                </div>
              </div>

              <div className={styles.editorRow}>
                <label className={styles.editorLabel}>Power</label>
                <div style={{ display: "flex", gap: 4, alignItems: "center", flex: 1 }}>
                  <input type="range" min={1} max={100} step={1}
                    value={selectedLayer.powerPct}
                    onChange={e => patch({ powerPct: Number(e.target.value) })}
                    className={styles.editorSlider} />
                  <span className={styles.editorVal}>{selectedLayer.powerPct}%</span>
                </div>
              </div>

              <div className={styles.editorRow}>
                <label className={styles.editorLabel}>Passes</label>
                <input type="number" className={styles.editorInput} min={1} max={20} step={1}
                  value={selectedLayer.passes} style={{ width: 60 }}
                  onChange={e => patch({ passes: Math.max(1, Number(e.target.value)) })} />
              </div>

              {/* ── MOPA / fiber settings ── */}
              <div className={styles.mopaSection}>
                <div className={styles.mopaSectionLabel}>MOPA / Fiber Advanced</div>

                <div className={styles.editorRow}>
                  <label className={styles.editorLabel}>Freq</label>
                  <input type="number" className={styles.editorInput}
                    min={1} max={4000} step={1} style={{ width: 70 }}
                    placeholder="—"
                    value={selectedLayer.frequencyKhz ?? ""}
                    onChange={e => patch({ frequencyKhz: e.target.value ? Number(e.target.value) : undefined })} />
                  <span className={styles.editorUnit}>kHz</span>
                </div>

                <div className={styles.editorRow}>
                  <label className={styles.editorLabel}>Pulse W</label>
                  <input type="number" className={styles.editorInput}
                    min={1} max={500} step={1} style={{ width: 70 }}
                    placeholder="—"
                    value={selectedLayer.pulseWidthNs ?? ""}
                    onChange={e => patch({ pulseWidthNs: e.target.value ? Number(e.target.value) : undefined })} />
                  <span className={styles.editorUnit}>ns</span>
                </div>

                <div className={styles.editorRow}>
                  <label className={styles.editorLabel}>Interval</label>
                  <input type="number" className={styles.editorInput}
                    min={0.001} max={1} step={0.001} style={{ width: 70 }}
                    placeholder="—"
                    value={selectedLayer.lineIntervalMm ?? ""}
                    onChange={e => patch({ lineIntervalMm: e.target.value ? Number(e.target.value) : undefined })} />
                  <span className={styles.editorUnit}>mm</span>
                </div>
              </div>

              <div className={styles.editorRow}>
                <label className={styles.editorLabel}>Priority</label>
                <input type="number" className={styles.editorInput}
                  min={0} max={99} step={1} value={selectedLayer.priority} style={{ width: 60 }}
                  title="0 = burns first"
                  onChange={e => patch({ priority: Number(e.target.value) })} />
              </div>

              <div className={styles.summary}>
                {selectedLayer.enabled ? (
                  <span className={styles.summaryEnabled}>
                    {LAYER_MODE_LABELS[selectedLayer.mode]} · {selectedLayer.speedMmS} mm/s · {selectedLayer.powerPct}% · {selectedLayer.passes}×
                    {selectedLayer.frequencyKhz != null && ` · ${selectedLayer.frequencyKhz} kHz`}
                    {selectedLayer.pulseWidthNs  != null && ` · ${selectedLayer.pulseWidthNs} ns`}
                  </span>
                ) : (
                  <span className={styles.summaryDisabled}>Layer disabled — will not export</span>
                )}
              </div>
            </div>
          ) : (
            <div className={styles.editorHint}>
              Click a color swatch to edit its laser settings.
            </div>
          )}

          {/* ── Enabled layers summary table ── */}
          {enabledCount > 0 && (
            <>
              <div className={styles.sectionLabel} style={{ marginTop: 10 }}>Active Layers</div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th />
                    <th>Name</th>
                    <th>Spd</th>
                    <th>Pwr</th>
                    <th>Freq</th>
                    <th>PW</th>
                  </tr>
                </thead>
                <tbody>
                  {layers
                    .filter(l => l.enabled)
                    .sort((a, b) => a.priority - b.priority)
                    .map(l => (
                      <tr
                        key={l.id}
                        className={l.id === selectedLayerId ? styles.tableRowSelected : ""}
                        onClick={() => setSelectedLayerId(id => id === l.id ? null : l.id)}
                        style={{ cursor: "pointer" }}
                      >
                        <td>
                          <span className={styles.tableColorDot} style={{ background: l.color }} />
                          {l.matchTargetHex && (
                            <span
                              className={styles.tableColorDot}
                              style={{ background: l.matchTargetHex, marginLeft: 2, opacity: 0.7 }}
                              title={`Target: ${l.matchTargetName}`}
                            />
                          )}
                        </td>
                        <td className={styles.tableCell}>{l.name}</td>
                        <td className={styles.tableCell}>{l.speedMmS}</td>
                        <td className={styles.tableCell}>{l.powerPct}%</td>
                        <td className={styles.tableCell}>{l.frequencyKhz != null ? `${l.frequencyKhz}k` : "—"}</td>
                        <td className={styles.tableCell}>{l.pulseWidthNs  != null ? `${l.pulseWidthNs}ns` : "—"}</td>
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
