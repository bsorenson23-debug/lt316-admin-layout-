"use client";

import React from "react";
import type { BedConfig } from "@/types/admin";
import type { RotaryPlacementPreset } from "@/types/export";
import { getRotaryPresets, updateRotaryPreset } from "@/utils/adminCalibrationState";
import styles from "./SprCalibrationPanel.module.css";

interface Props {
  bedConfig: BedConfig;
}

type Step = "select" | "command" | "measure" | "result";

function fmt(n: number, decimals = 3) {
  return n.toFixed(decimals);
}

function inferCircumference(bedConfig: BedConfig): number | null {
  const d = bedConfig.tumblerDiameterMm;
  if (d && Number.isFinite(d) && d > 0) return Math.PI * d;
  const w = bedConfig.width;
  if (w > 0) return w;
  return null;
}

export function SprCalibrationPanel({ bedConfig }: Props) {
  const [step, setStep] = React.useState<Step>("select");
  const [presets, setPresets] = React.useState<RotaryPlacementPreset[]>([]);
  const [selectedId, setSelectedId] = React.useState("");
  const [commandedDraft, setCommandedDraft] = React.useState("");
  const [measuredDraft, setMeasuredDraft] = React.useState("");
  const [currentSprDraft, setCurrentSprDraft] = React.useState("");
  const [savedNote, setSavedNote] = React.useState<string | null>(null);

  React.useEffect(() => {
    setPresets(getRotaryPresets());
  }, []);

  const selectedPreset = presets.find((p) => p.id === selectedId) ?? null;

  const inferredCircumference = inferCircumference(bedConfig);

  const commandedMm = parseFloat(commandedDraft);
  const measuredMm  = parseFloat(measuredDraft);
  const currentSpr  = parseFloat(currentSprDraft);

  const isCommandedValid = Number.isFinite(commandedMm) && commandedMm > 0;
  const isMeasuredValid  = Number.isFinite(measuredMm)  && measuredMm  > 0;
  const isCurrentSprValid = Number.isFinite(currentSpr) && currentSpr > 0;

  const correctionFactor = (isCommandedValid && isMeasuredValid)
    ? commandedMm / measuredMm
    : null;

  const correctedSpr = (correctionFactor !== null && isCurrentSprValid)
    ? currentSpr * correctionFactor
    : null;

  const handleSelectNext = () => {
    if (!selectedId) return;
    // Pre-fill commanded distance from circumference
    if (!commandedDraft && inferredCircumference) {
      setCommandedDraft(inferredCircumference.toFixed(2));
    }
    // Pre-fill current SPR from saved preset value
    if (!currentSprDraft && selectedPreset?.stepsPerRotation) {
      setCurrentSprDraft(String(selectedPreset.stepsPerRotation));
    }
    setStep("command");
  };

  const handleSaveResult = () => {
    if (!selectedId || correctionFactor === null) return;
    const patch: Partial<Omit<RotaryPlacementPreset, "id">> = {
      sprCorrectionFactor: Number(correctionFactor.toFixed(6)),
    };
    if (correctedSpr !== null) {
      patch.stepsPerRotation = Math.round(correctedSpr);
    }
    const updated = updateRotaryPreset(selectedId, patch);
    setPresets(updated);
    setSavedNote(
      correctedSpr !== null
        ? `Saved — SPR: ${Math.round(correctedSpr)}, factor: ${fmt(correctionFactor)}`
        : `Saved — correction factor: ${fmt(correctionFactor)}`
    );
    setStep("result");
  };

  const handleReset = () => {
    setStep("select");
    setCommandedDraft("");
    setMeasuredDraft("");
    setSavedNote(null);
  };

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>SPR Calibration</span>
        <span className={styles.stepBadge}>
          {step === "select"  ? "1 / 3" :
           step === "command" ? "2 / 3" :
           step === "measure" ? "3 / 3" : "Done"}
        </span>
      </div>

      <div className={styles.body}>
        {/* ── Step 1: Select Preset ── */}
        {step === "select" && (
          <>
            <p className={styles.stepHint}>
              Select the rotary preset to calibrate steps-per-rotation for.
            </p>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Preset</span>
              <select
                className={styles.select}
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                <option value="">— Select —</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {selectedPreset?.stepsPerRotation && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Saved SPR</span>
                <span className={styles.infoValue}>{selectedPreset.stepsPerRotation}</span>
              </div>
            )}
            {selectedPreset?.sprCorrectionFactor && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Last factor</span>
                <span className={styles.infoValue}>{fmt(selectedPreset.sprCorrectionFactor)}</span>
              </div>
            )}

            {inferredCircumference && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Circumference</span>
                <span className={styles.infoValue}>{inferredCircumference.toFixed(2)} mm</span>
              </div>
            )}

            <button
              className={styles.primaryBtn}
              disabled={!selectedId}
              onClick={handleSelectNext}
            >
              Next →
            </button>
          </>
        )}

        {/* ── Step 2: Commanded distance ── */}
        {step === "command" && (
          <>
            <p className={styles.stepHint}>
              In LightBurn, use <strong>Rotary Setup → Test</strong> to command the rotary to move a known distance.
              Enter the distance you commanded below.
            </p>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Commanded</span>
              <div className={styles.inputGroup}>
                <input
                  type="number"
                  step={0.1}
                  className={styles.numInput}
                  value={commandedDraft}
                  placeholder="100.00"
                  onChange={(e) => setCommandedDraft(e.target.value)}
                />
                <span className={styles.unit}>mm</span>
              </div>
            </div>
            <div className={styles.hint}>
              Tip: Use your tumbler&apos;s circumference ({inferredCircumference ? inferredCircumference.toFixed(2) : "—"} mm) as the commanded distance for one full rotation.
            </div>
            <div className={styles.btnRow}>
              <button className={styles.ghostBtn} onClick={() => setStep("select")}>← Back</button>
              <button
                className={styles.primaryBtn}
                disabled={!isCommandedValid}
                onClick={() => setStep("measure")}
              >
                Next →
              </button>
            </div>
          </>
        )}

        {/* ── Step 3: Measured distance ── */}
        {step === "measure" && (
          <>
            <p className={styles.stepHint}>
              Mark the tumbler before the move and measure the actual distance it traveled. Enter the measured value.
            </p>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Commanded</span>
              <span className={styles.readonlyVal}>{commandedDraft} mm</span>
            </div>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Measured</span>
              <div className={styles.inputGroup}>
                <input
                  type="number"
                  step={0.1}
                  className={styles.numInput}
                  value={measuredDraft}
                  placeholder={commandedDraft || "100.00"}
                  onChange={(e) => setMeasuredDraft(e.target.value)}
                />
                <span className={styles.unit}>mm</span>
              </div>
            </div>

            {correctionFactor !== null && (
              <div className={styles.resultCard}>
                <div className={styles.resultRow}>
                  <span className={styles.resultLabel}>Correction Factor</span>
                  <span className={styles.resultValue}>{fmt(correctionFactor)}</span>
                </div>
                <div className={styles.resultHint}>
                  Multiply your current SPR by this value.
                </div>
              </div>
            )}

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Current SPR</span>
              <div className={styles.inputGroup}>
                <input
                  type="number"
                  step={1}
                  className={styles.numInput}
                  value={currentSprDraft}
                  placeholder="e.g. 3200"
                  onChange={(e) => setCurrentSprDraft(e.target.value)}
                />
              </div>
            </div>

            {correctedSpr !== null && (
              <div className={`${styles.resultCard} ${styles.resultCardGreen}`}>
                <div className={styles.resultRow}>
                  <span className={styles.resultLabel}>New SPR</span>
                  <span className={styles.resultValueLarge}>{Math.round(correctedSpr)}</span>
                </div>
                <div className={styles.resultHint}>Enter this in LightBurn → Rotary Setup → Steps Per Rotation.</div>
              </div>
            )}

            <div className={styles.btnRow}>
              <button className={styles.ghostBtn} onClick={() => setStep("command")}>← Back</button>
              <button
                className={styles.primaryBtn}
                disabled={!isMeasuredValid || correctionFactor === null}
                onClick={handleSaveResult}
              >
                Save & Done
              </button>
            </div>
          </>
        )}

        {/* ── Step 4: Result ── */}
        {step === "result" && (
          <>
            {savedNote && (
              <div className={styles.successCard}>
                <div className={styles.successIcon}>✓</div>
                <div className={styles.successText}>{savedNote}</div>
              </div>
            )}
            {correctedSpr !== null && (
              <div className={styles.resultCard}>
                <div className={styles.resultRow}>
                  <span className={styles.resultLabel}>Enter in LightBurn</span>
                  <span className={styles.resultValueLarge}>{Math.round(correctedSpr)}</span>
                </div>
                <div className={styles.resultHint}>
                  Rotary Setup → Steps Per Rotation → <strong>{Math.round(correctedSpr)}</strong>
                </div>
              </div>
            )}
            <button className={styles.primaryBtn} onClick={handleReset}>
              Calibrate Again
            </button>
          </>
        )}
      </div>
    </section>
  );
}
