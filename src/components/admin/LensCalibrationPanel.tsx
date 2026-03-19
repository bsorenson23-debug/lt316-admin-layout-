"use client";

import React from "react";
import type { BedHole } from "@/utils/staggeredBedPattern";
import {
  type CalibrationDensity,
  type CalibrationHole,
  type LensCalibrationResult,
  buildCalibrationResult,
  getCalibrationHoleCount,
  selectCalibrationHoles,
} from "@/utils/lensCalibration";
import { analyseCalibrationVideo } from "@/utils/videoRedDotAnalysis";
import {
  buildCalSequenceLbrn,
  downloadTextFile,
} from "@/utils/lightBurnCalSequence";
import styles from "./LensCalibrationPanel.module.css";

type WizardStep = "setup" | "record" | "processing" | "results";

export interface LensCalibrationState {
  sequenceHoles: CalibrationHole[];
  result: LensCalibrationResult | null;
  applied: boolean;
}

interface Props {
  allHoles: BedHole[];
  bedWidthMm: number;
  bedHeightMm: number;
  onSequenceChange: (holes: CalibrationHole[]) => void;
  onResultApplied: (result: LensCalibrationResult | null) => void;
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const STEPS: { id: WizardStep; label: string }[] = [
  { id: "setup", label: "Setup" },
  { id: "record", label: "Record" },
  { id: "processing", label: "Analyze" },
  { id: "results", label: "Results" },
];

function StepIndicator({ current }: { current: WizardStep }) {
  const currentIdx = STEPS.findIndex((s) => s.id === current);
  return (
    <div className={styles.steps}>
      {STEPS.map((step, idx) => {
        const state =
          idx < currentIdx ? "done" : idx === currentIdx ? "active" : "pending";
        return (
          <React.Fragment key={step.id}>
            {idx > 0 && <span className={styles.stepConnectorLine} />}
            <div className={`${styles.stepNode} ${styles[state]}`}>
              <div className={styles.stepBubble}>
                {state === "done" ? "✓" : idx + 1}
              </div>
              <span className={styles.stepText}>{step.label}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Density picker
// ---------------------------------------------------------------------------

const DENSITIES: { id: CalibrationDensity; label: string; meta: string }[] = [
  { id: "quick", label: "Quick", meta: "9 holes · ~2 min" },
  { id: "standard", label: "Standard", meta: "16 holes · ~4 min" },
  { id: "full", label: "Full coverage", meta: "25 holes · ~7 min" },
];

function DensityPicker({
  value,
  onChange,
}: {
  value: CalibrationDensity;
  onChange: (d: CalibrationDensity) => void;
}) {
  return (
    <div className={styles.densityGroup}>
      {DENSITIES.map((opt) => (
        <label
          key={opt.id}
          className={`${styles.densityOption} ${value === opt.id ? styles.densityOptionSelected : ""}`}
        >
          <input
            type="radio"
            name="density"
            value={opt.id}
            checked={value === opt.id}
            onChange={() => onChange(opt.id)}
          />
          <span className={styles.densityDot} />
          <span className={styles.densityLabel}>{opt.label}</span>
          <span className={styles.densityMeta}>{opt.meta}</span>
        </label>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Video drop zone
// ---------------------------------------------------------------------------

function VideoDropZone({
  file,
  onFile,
}: {
  file: File | null;
  onFile: (f: File) => void;
}) {
  const [over, setOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const accept = (f: File) => {
    if (/video/i.test(f.type) || /\.(mp4|mov|webm|avi)$/i.test(f.name)) {
      onFile(f);
    }
  };

  return (
    <div
      className={`${styles.dropZone} ${over ? styles.dropZoneOver : ""} ${file ? styles.fileLoaded : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) accept(f);
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      aria-label="Upload video"
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) accept(f); }}
      />
      {file ? (
        <>
          <span className={styles.dropIcon}>🎬</span>
          <span className={styles.fileName}>{file.name}</span>
          <span className={styles.dropHint}>Click to replace</span>
        </>
      ) : (
        <>
          <span className={styles.dropIcon}>⬆</span>
          <span className={styles.dropLabel}>Drop video here or click to upload</span>
          <span className={styles.dropHint}>.mp4 · .mov · .webm</span>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result card
// ---------------------------------------------------------------------------

function ResultCard({
  result,
  onApply,
  onRedo,
}: {
  result: LensCalibrationResult;
  onApply: () => void;
  onRedo: () => void;
}) {
  const [showDetails, setShowDetails] = React.useState(false);

  const qualityClass =
    result.qualityLabel === "excellent"
      ? styles.qualityExcellent
      : result.qualityLabel === "good"
        ? styles.qualityGood
        : result.qualityLabel === "fair"
          ? styles.qualityFair
          : styles.qualityPoor;

  return (
    <div className={styles.resultCard}>
      <div className={`${styles.resultBadge} ${qualityClass}`}>
        <span className={styles.qualityDot} />
        {result.matchedCount} of {result.totalCount} holes matched ·{" "}
        {result.qualityLabel.charAt(0).toUpperCase() + result.qualityLabel.slice(1)}
      </div>

      <dl className={styles.resultGrid}>
        <dt>Scale X</dt>
        <dd>{result.scaleXMmPerPx.toFixed(4)} mm/px</dd>
        <dt>Scale Y</dt>
        <dd>{result.scaleYMmPerPx.toFixed(4)} mm/px</dd>
        <dt>Rotation</dt>
        <dd>{result.rotationDeg.toFixed(2)}°</dd>
        <dt>Error (RMS)</dt>
        <dd>{result.residualRmsMm.toFixed(2)} mm</dd>
      </dl>

      <button
        type="button"
        className={styles.disclosure}
        onClick={() => setShowDetails((v) => !v)}
        aria-expanded={showDetails}
      >
        {showDetails ? "▾" : "▸"} Technical details
      </button>

      {showDetails && (
        <dl className={styles.resultGrid}>
          <dt>Distortion k1</dt>
          <dd>{result.distortionK1.toFixed(5)}</dd>
          <dt>H[0,0]</dt>
          <dd>{result.homography.values[0].toFixed(5)}</dd>
          <dt>H[1,1]</dt>
          <dd>{result.homography.values[4].toFixed(5)}</dd>
        </dl>
      )}

      <div className={styles.btnRow}>
        <button type="button" className={styles.applyBtn} onClick={onApply}>
          Apply Calibration
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={onRedo}>
          Redo
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function LensCalibrationPanel({
  allHoles,
  bedWidthMm,
  bedHeightMm,
  onSequenceChange,
  onResultApplied,
}: Props) {
  const [step, setStep] = React.useState<WizardStep>("setup");
  const [density, setDensity] = React.useState<CalibrationDensity>("standard");
  const [videoFile, setVideoFile] = React.useState<File | null>(null);
  const [progress, setProgress] = React.useState(0);
  const [progressLabel, setProgressLabel] = React.useState("Extracting frames…");
  const [result, setResult] = React.useState<LensCalibrationResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [applied, setApplied] = React.useState(false);
  const [sequenceHoles, setSequenceHoles] = React.useState<CalibrationHole[]>([]);

  // Build sequence when density/holes change
  React.useEffect(() => {
    const count = getCalibrationHoleCount(density);
    const holes = selectCalibrationHoles(allHoles, count, bedWidthMm, bedHeightMm);
    setSequenceHoles(holes);
    onSequenceChange(holes);
  }, [density, allHoles, bedWidthMm, bedHeightMm, onSequenceChange]);

  const handleStart = React.useCallback(() => {
    setStep("record");
    setVideoFile(null);
    setError(null);
  }, []);

  const handleAnalyze = React.useCallback(async () => {
    if (!videoFile) return;
    setStep("processing");
    setProgress(0);
    setProgressLabel("Extracting frames…");
    setError(null);

    try {
      const analysis = await analyseCalibrationVideo(
        videoFile,
        sequenceHoles.length,
        {
          onProgress: (p) => {
            setProgress(p * 0.8);
            if (p > 0.5) setProgressLabel("Detecting red dots…");
          },
        }
      );

      setProgress(0.9);
      setProgressLabel("Computing calibration…");

      const calibration = buildCalibrationResult(sequenceHoles, analysis.detections);
      setProgress(1);

      if (!calibration) {
        setError(
          `Only ${analysis.matchedCount} holes detected — need at least 4. ` +
            "Check lighting and try again."
        );
        setStep("record");
        return;
      }

      setResult(calibration);
      setStep("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
      setStep("record");
    }
  }, [videoFile, sequenceHoles]);

  const handleApply = React.useCallback(() => {
    if (!result) return;
    setApplied(true);
    onResultApplied(result);
  }, [result, onResultApplied]);

  const handleRedo = React.useCallback(() => {
    setStep("record");
    setVideoFile(null);
    setResult(null);
    setApplied(false);
    setError(null);
  }, []);

  const handleReset = React.useCallback(() => {
    setStep("setup");
    setVideoFile(null);
    setResult(null);
    setApplied(false);
    setError(null);
    onResultApplied(null);
  }, [onResultApplied]);

  return (
    <>
      {/* Applied banner — compact summary when calibration is active */}
      {applied && result && step === "results" && (
        <section style={{ padding: "0 0 8px" }}>
          <div className={styles.appliedBanner}>
            <span className={styles.appliedDot} />
            Calibration applied · {result.matchedCount}/{result.totalCount} holes ·{" "}
            {result.qualityLabel}
            <button
              type="button"
              className={styles.appliedRedo}
              onClick={handleRedo}
            >
              Redo
            </button>
          </div>
        </section>
      )}

      <section>
        <StepIndicator current={step} />
      </section>

      {/* ── Step: Setup ── */}
      {step === "setup" && (
        <section>
          <DensityPicker value={density} onChange={setDensity} />
          <div className={styles.hint} style={{ marginTop: 8 }}>
            Highlighted holes appear on the bed canvas in sequence order.
            Export the LightBurn file to run the dot sequence automatically,
            or red-light each hole manually while recording.
          </div>
          <div className={styles.exportRow} style={{ marginTop: 8 }}>
            <button
              type="button"
              className={styles.exportBtn}
              disabled={sequenceHoles.length === 0}
              onClick={() => {
                const xml = buildCalSequenceLbrn(sequenceHoles, { dwellMs: 400, powerPct: 5 });
                downloadTextFile(xml, `cal-sequence-${sequenceHoles.length}pts.lbrn2`);
              }}
            >
              ↓ Export LightBurn Sequence
            </button>
            <span className={styles.exportMeta}>{sequenceHoles.length} holes · .lbrn2</span>
          </div>
          <div className={styles.btnRow} style={{ marginTop: 8 }}>
            <button type="button" className={styles.primaryBtn} onClick={handleStart}>
              Start Recording →
            </button>
          </div>
        </section>
      )}

      {/* ── Step: Record ── */}
      {step === "record" && (
        <section>
          <div className={styles.hint}>
            Red-light each numbered hole on the bed canvas <strong>in order</strong>.
            Record with a phone or fixed camera, then upload below.
          </div>
          <div style={{ marginTop: 10 }}>
            <VideoDropZone file={videoFile} onFile={setVideoFile} />
          </div>
          {error && (
            <div style={{ fontSize: 11, color: "#f0a0a0", marginTop: 6 }}>{error}</div>
          )}
          <div className={styles.btnRow} style={{ marginTop: 10 }}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => setStep("setup")}
            >
              ← Back
            </button>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={!videoFile}
              onClick={() => void handleAnalyze()}
            >
              Analyze →
            </button>
          </div>
        </section>
      )}

      {/* ── Step: Processing ── */}
      {step === "processing" && (
        <section>
          <div className={styles.progressWrap}>
            <div className={styles.progressLabel}>{progressLabel}</div>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </div>
          <div className={styles.hint} style={{ marginTop: 8 }}>
            This usually takes 10–30 s depending on video length.
          </div>
        </section>
      )}

      {/* ── Step: Results ── */}
      {step === "results" && result && (
        <section>
          <ResultCard result={result} onApply={handleApply} onRedo={handleRedo} />
        </section>
      )}

      {/* Reset link — always available once past setup */}
      {step !== "setup" && (
        <div style={{ marginTop: 10, textAlign: "right" }}>
          <button type="button" className={styles.disclosure} onClick={handleReset}>
            ↺ Start over
          </button>
        </div>
      )}
    </>
  );
}
