"use client";

import React from "react";
import type {
  FiberMachineProfile,
  FiberBaseParams,
  BracketParam,
  BracketStepSize,
  BracketTestLine,
  Wavelength,
  SubstrateMaterial,
} from "@/types/fiberColor";
import {
  computeEnergyDensity,
  predictColorFromED,
  generateBracketTest,
  applyCalibration,
  buildCalibratedColorMapping,
  getStepPct,
  loadFiberProfiles,
  saveFiberProfiles,
  getActiveFiberProfileId,
  setActiveFiberProfileId,
} from "@/utils/fiberColorCalc";
import styles from "./FiberColorCalibrationPanel.module.css";

// ---------------------------------------------------------------------------
// Phase of the calibration flow
// ---------------------------------------------------------------------------

type Phase = "idle" | "config" | "test" | "done";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FiberColorCalibrationPanel() {
  // ── Saved profiles ──────────────────────────────────────────────────────
  const [profiles, setProfiles] = React.useState<FiberMachineProfile[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [phase, setPhase] = React.useState<Phase>("idle");

  // Load profiles from localStorage on mount
  React.useEffect(() => {
    setProfiles(loadFiberProfiles());
    setActiveId(getActiveFiberProfileId());
  }, []);

  const activeProfile = profiles.find((p) => p.id === activeId) ?? null;

  // ── Config form state ───────────────────────────────────────────────────
  const [machine, setMachine] = React.useState("MOPA #1");
  const [ratedPower, setRatedPower] = React.useState(100);
  const [wavelength, setWavelength] = React.useState<Wavelength>(1064);
  const [material, setMaterial] = React.useState<SubstrateMaterial>("ss");
  const [speed, setSpeed] = React.useState(1000);
  const [power, setPower] = React.useState(50);
  const [pulseWidth, setPulseWidth] = React.useState(200);
  const [frequency, setFrequency] = React.useState(30);
  const [lineSpacing, setLineSpacing] = React.useState(0.05);
  const [bracketParam, setBracketParam] = React.useState<BracketParam>("speed");
  const [bracketStep, setBracketStep] = React.useState<BracketStepSize>("normal");

  // ── Test state ──────────────────────────────────────────────────────────
  const [testLines, setTestLines] = React.useState<BracketTestLine[] | null>(null);
  const [selectedLine, setSelectedLine] = React.useState<1 | 2 | 3 | 4 | 5>(3);

  // ── Derived ─────────────────────────────────────────────────────────────
  const currentED = computeEnergyDensity(power, speed, lineSpacing);
  const predictedColor = predictColorFromED(currentED);

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleStartCalibration = () => {
    // Pre-fill form from active profile if one exists
    if (activeProfile) {
      setMachine(activeProfile.machine);
      setRatedPower(activeProfile.ratedPower);
      setWavelength(activeProfile.wavelength);
      setMaterial(activeProfile.material);
      setSpeed(activeProfile.physicalTruth.speed_mms);
      setPower(activeProfile.physicalTruth.power_w);
      setPulseWidth(activeProfile.physicalTruth.pulseWidth_ns);
      setFrequency(activeProfile.physicalTruth.frequency_khz);
      setLineSpacing(activeProfile.physicalTruth.lineSpacing_mm);
    }
    setTestLines(null);
    setSelectedLine(3);
    setPhase("config");
  };

  const handleGenerate = () => {
    const baseParams: FiberBaseParams = {
      power_w: power,
      speed_mms: speed,
      pulseWidth_ns: pulseWidth,
      frequency_khz: frequency,
      lineSpacing_mm: lineSpacing,
    };
    const lines = generateBracketTest({
      param: bracketParam,
      stepSize: bracketStep,
      baseParams,
    });
    setTestLines(lines);
    setSelectedLine(3);
    setPhase("test");
  };

  const handleSave = () => {
    if (!testLines) return;
    const stepPct = getStepPct(bracketStep);
    const { offsetPercent, offsetMultiplier } = applyCalibration(selectedLine, stepPct);
    const picked = testLines[selectedLine - 1];

    const profile: FiberMachineProfile = {
      id: activeProfile?.id ?? `fiber-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      machine,
      ratedPower,
      wavelength,
      material,
      lockedAt: new Date().toISOString(),
      selectedLine,
      offsetPercent,
      offsetMultiplier,
      physicalTruth: {
        ...picked.params,
        energyDensity_Jmm2: picked.energyDensity,
      },
      colorMapping: buildCalibratedColorMapping(offsetMultiplier),
    };

    const next = activeProfile
      ? profiles.map((p) => (p.id === profile.id ? profile : p))
      : [...profiles, profile];

    setProfiles(next);
    saveFiberProfiles(next);
    setActiveId(profile.id);
    setActiveFiberProfileId(profile.id);
    setPhase("done");
  };

  const handleSelectProfile = (id: string) => {
    setActiveId(id);
    setActiveFiberProfileId(id);
    setPhase("idle");
    setTestLines(null);
  };

  const handleDelete = () => {
    if (!activeProfile) return;
    const next = profiles.filter((p) => p.id !== activeProfile.id);
    setProfiles(next);
    saveFiberProfiles(next);
    setActiveId(next[0]?.id ?? null);
    setActiveFiberProfileId(next[0]?.id ?? null);
    setPhase("idle");
    setTestLines(null);
  };

  // ── Render helpers ──────────────────────────────────────────────────────
  const paramLabel = (p: BracketParam) =>
    p === "speed" ? "Speed" : p === "power" ? "Power" : "Pulse Width";

  const formatLineParam = (line: BracketTestLine, param: BracketParam) => {
    switch (param) {
      case "speed": return `${Math.round(line.params.speed_mms)} mm/s`;
      case "power": return `${line.params.power_w.toFixed(1)} W`;
      case "pulseWidth": return `${Math.round(line.params.pulseWidth_ns)} ns`;
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Fiber Color Calibration</span>
        {activeProfile ? (
          <span className={`${styles.statusBadge} ${styles.statusCalibrated}`}>Calibrated</span>
        ) : (
          <span className={`${styles.statusBadge} ${styles.statusUncalibrated}`}>Uncalibrated</span>
        )}
      </div>

      <div className={styles.body}>
        {/* ── Profile selector ── */}
        {profiles.length > 0 && phase === "idle" && (
          <>
            <div className={styles.profileRow}>
              <select
                className={styles.profileSelect}
                value={activeId ?? ""}
                onChange={(e) => handleSelectProfile(e.target.value)}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.machine} ({p.wavelength}nm, {p.material.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            {/* Active profile summary */}
            {activeProfile && (
              <div className={styles.resultBox}>
                <div className={styles.resultRow}>
                  <span>Machine</span>
                  <span className={styles.resultValue}>{activeProfile.machine}</span>
                </div>
                <div className={styles.resultRow}>
                  <span>Offset</span>
                  <span className={styles.resultValue}>
                    {activeProfile.offsetPercent >= 0 ? "+" : ""}{activeProfile.offsetPercent.toFixed(0)}%
                    (×{activeProfile.offsetMultiplier.toFixed(2)})
                  </span>
                </div>
                <div className={styles.resultRow}>
                  <span>Calibrated</span>
                  <span className={styles.resultValue}>
                    {new Date(activeProfile.lockedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className={styles.resultRow}>
                  <span>Line selected</span>
                  <span className={styles.resultValue}>
                    {activeProfile.selectedLine} of 5
                  </span>
                </div>
              </div>
            )}

            <div className={styles.btnRow}>
              <button className={styles.secondaryBtn} onClick={handleStartCalibration}>
                Recalibrate
              </button>
              <button className={`${styles.secondaryBtn} ${styles.dangerBtn}`} onClick={handleDelete}>
                Delete
              </button>
            </div>
          </>
        )}

        {/* ── Start button when no profiles ── */}
        {profiles.length === 0 && phase === "idle" && (
          <button
            className={`${styles.primaryBtn} ${styles.generateBtn}`}
            onClick={handleStartCalibration}
          >
            Start Calibration
          </button>
        )}

        {/* ── Phase: config ── */}
        {phase === "config" && (
          <>
            <span className={styles.sectionLabel}>Machine</span>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Name</span>
              <input
                className={`${styles.input} ${styles.inputWide}`}
                value={machine}
                onChange={(e) => setMachine(e.target.value)}
              />
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Rated power</span>
              <input
                type="number"
                className={styles.input}
                value={ratedPower}
                min={1}
                onChange={(e) => setRatedPower(Number(e.target.value))}
              />
              <span className={styles.fieldUnit}>W</span>
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Wavelength</span>
              <select
                className={styles.select}
                value={wavelength}
                onChange={(e) => setWavelength(Number(e.target.value) as Wavelength)}
              >
                <option value={1064}>1064 nm</option>
                <option value={532}>532 nm</option>
                <option value={355}>355 nm</option>
              </select>
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Material</span>
              <div className={styles.materialToggle}>
                <button
                  type="button"
                  className={`${styles.materialBtn} ${material === "ss" ? styles.materialBtnActive : ""}`}
                  onClick={() => setMaterial("ss")}
                >SS</button>
                <button
                  type="button"
                  className={`${styles.materialBtn} ${material === "ti" ? styles.materialBtnActive : ""}`}
                  onClick={() => setMaterial("ti")}
                >Ti</button>
              </div>
            </div>

            <span className={styles.sectionLabel}>Base Parameters (Line 3)</span>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Power</span>
              <input type="number" className={styles.input} value={power} min={0.1} step={0.1}
                onChange={(e) => setPower(Number(e.target.value))} />
              <span className={styles.fieldUnit}>W</span>
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Speed</span>
              <input type="number" className={styles.input} value={speed} min={1} step={10}
                onChange={(e) => setSpeed(Number(e.target.value))} />
              <span className={styles.fieldUnit}>mm/s</span>
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Pulse width</span>
              <input type="number" className={styles.input} value={pulseWidth} min={1} step={1}
                onChange={(e) => setPulseWidth(Number(e.target.value))} />
              <span className={styles.fieldUnit}>ns</span>
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Frequency</span>
              <input type="number" className={styles.input} value={frequency} min={1} step={1}
                onChange={(e) => setFrequency(Number(e.target.value))} />
              <span className={styles.fieldUnit}>kHz</span>
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Line spacing</span>
              <input type="number" className={styles.input} value={lineSpacing} min={0.001} step={0.005}
                onChange={(e) => setLineSpacing(Number(e.target.value))} />
              <span className={styles.fieldUnit}>mm</span>
            </div>

            {/* Live ED preview */}
            <div className={styles.edPreview}>
              <span>ED:</span>
              <span className={styles.edValue}>{currentED.toFixed(2)} J/mm²</span>
              <span className={styles.swatch} style={{ backgroundColor: predictedColor.hex }} />
              <span className={styles.swatchLabel}>{predictedColor.color}</span>
            </div>

            <span className={styles.sectionLabel}>Bracket Config</span>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Vary</span>
              <select className={styles.select} value={bracketParam}
                onChange={(e) => setBracketParam(e.target.value as BracketParam)}>
                <option value="speed">Speed</option>
                <option value="power">Power</option>
                <option value="pulseWidth">Pulse W.</option>
              </select>
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Step size</span>
              <select className={styles.select} value={bracketStep}
                onChange={(e) => setBracketStep(e.target.value as BracketStepSize)}>
                <option value="fine">Fine (5%)</option>
                <option value="normal">Normal (10%)</option>
                <option value="coarse">Coarse (20%)</option>
              </select>
            </div>

            <button className={`${styles.primaryBtn} ${styles.generateBtn}`} onClick={handleGenerate}>
              Generate 5-Line Test
            </button>

            <button className={styles.secondaryBtn} onClick={() => { setPhase("idle"); setTestLines(null); }}>
              Cancel
            </button>
          </>
        )}

        {/* ── Phase: test — select best line ── */}
        {phase === "test" && testLines && (
          <>
            <span className={styles.sectionLabel}>
              Select Best Line (varying {paramLabel(bracketParam)})
            </span>

            <div className={styles.testLines}>
              {testLines.map((line) => (
                <div
                  key={line.line}
                  className={`${styles.testLine} ${selectedLine === line.line ? styles.testLineSelected : ""} ${line.line === 3 ? styles.testLineCenter : ""}`}
                  onClick={() => setSelectedLine(line.line)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && setSelectedLine(line.line)}
                >
                  <span className={styles.testLineNum}>{line.line}</span>
                  <span
                    className={styles.testLineBar}
                    style={{ backgroundColor: line.predictedColor.hex }}
                  />
                  <span className={styles.swatch} style={{ backgroundColor: line.predictedColor.hex }} />
                  <span className={styles.testLineParams}>
                    {formatLineParam(line, bracketParam)}
                  </span>
                  <span className={styles.testLineED}>
                    {line.energyDensity.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            {/* Preview of calibration result */}
            {(() => {
              const stepPct = getStepPct(bracketStep);
              const { offsetPercent, offsetMultiplier } = applyCalibration(selectedLine, stepPct);
              return (
                <div className={styles.resultBox}>
                  <div className={styles.resultRow}>
                    <span>Offset</span>
                    <span className={styles.resultValue}>
                      {offsetPercent >= 0 ? "+" : ""}{offsetPercent.toFixed(0)}%
                    </span>
                  </div>
                  <div className={styles.resultRow}>
                    <span>Multiplier</span>
                    <span className={styles.resultValue}>×{offsetMultiplier.toFixed(2)}</span>
                  </div>
                </div>
              );
            })()}

            <button
              className={`${styles.primaryBtn} ${styles.saveBtn}`}
              onClick={handleSave}
            >
              Save Calibration
            </button>

            <button className={styles.secondaryBtn} onClick={() => setPhase("config")}>
              Back to Config
            </button>
          </>
        )}

        {/* ── Phase: done ── */}
        {phase === "done" && activeProfile && (
          <>
            <div className={styles.resultBox}>
              <div className={styles.resultRow}>
                <span>Machine</span>
                <span className={styles.resultValue}>{activeProfile.machine}</span>
              </div>
              <div className={styles.resultRow}>
                <span>Offset</span>
                <span className={styles.resultValue}>
                  {activeProfile.offsetPercent >= 0 ? "+" : ""}{activeProfile.offsetPercent.toFixed(0)}%
                  (×{activeProfile.offsetMultiplier.toFixed(2)})
                </span>
              </div>
              <div className={styles.resultRow}>
                <span>Line selected</span>
                <span className={styles.resultValue}>{activeProfile.selectedLine} of 5</span>
              </div>
            </div>

            <button className={styles.secondaryBtn} onClick={() => setPhase("idle")}>
              Done
            </button>
          </>
        )}
      </div>
    </section>
  );
}
