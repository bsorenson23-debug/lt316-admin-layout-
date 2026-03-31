"use client";

import React from "react";
import type {
  BracketParam,
  BracketStepSize,
  BracketTestLine,
  FiberBaseParams,
  FiberMachineProfile,
  SubstrateMaterial,
  Wavelength,
} from "@/types/fiberColor";
import type { MarkingProcessFamily } from "@/features/color-profiles/types";
import {
  applyCalibration,
  buildCalibratedColorMapping,
  computeEnergyDensity,
  generateBracketTest,
  getActiveFiberProfileId,
  getStepPct,
  loadFiberProfiles,
  predictColorFromED,
  saveFiberProfiles,
  setActiveFiberProfileId,
} from "@/utils/fiberColorCalc";
import { getActiveLaserProfile } from "@/utils/laserProfileState";
import {
  matchesFiberCalibrationScope,
  normalizeFiberCalibrationProfile,
  type FiberCalibrationScope,
} from "@/features/color-profiles/calibration";
import type { LaserProfile } from "@/types/laserProfile";
import styles from "./FiberColorCalibrationPanel.module.css";

type Phase = "idle" | "config" | "test" | "done";

interface Props {
  currentMaterialSlug?: string | null;
  currentMaterialLabel?: string | null;
  currentProcessFamily?: string | null;
}

function createFiberProfileId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `fiber-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function FiberColorCalibrationPanel({
  currentMaterialSlug,
  currentMaterialLabel,
  currentProcessFamily,
}: Props) {
  const [profiles, setProfiles] = React.useState<FiberMachineProfile[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [activeLaser, setActiveLaser] = React.useState<LaserProfile | null>(null);

  React.useEffect(() => {
    const nextActiveLaser = getActiveLaserProfile();
    setProfiles(loadFiberProfiles());
    setActiveId(getActiveFiberProfileId());
    setActiveLaser(nextActiveLaser);
  }, [currentMaterialSlug, currentProcessFamily]);

  const scopedMaterial = currentMaterialSlug === "titanium" ? "ti" : "ss";
  const scopedProcessFamily = normalizeProcessFamily(currentProcessFamily);
  const calibrationScope = React.useMemo((): FiberCalibrationScope | null => {
    if (!currentMaterialSlug || !scopedProcessFamily) return null;
    return {
      laserProfileId: activeLaser?.id,
      materialSlug: currentMaterialSlug,
      processFamily: scopedProcessFamily,
    };
  }, [activeLaser?.id, currentMaterialSlug, scopedProcessFamily]);
  const isEligible =
    currentMaterialSlug != null &&
    (currentMaterialSlug === "stainless-steel" || currentMaterialSlug === "titanium") &&
    scopedProcessFamily != null &&
    activeLaser?.sourceType === "fiber" &&
    activeLaser.isMopaCapable === true;

  const scopedProfiles = React.useMemo(() => {
    if (!calibrationScope) return [];
    return profiles
      .map(normalizeFiberCalibrationProfile)
      .filter((profile) => matchesFiberCalibrationScope(profile, calibrationScope));
  }, [calibrationScope, profiles]);
  const activeProfile =
    scopedProfiles.find((profile) => profile.id === activeId) ??
    scopedProfiles[0] ??
    null;

  React.useEffect(() => {
    if (!activeProfile) return;
    if (activeId === activeProfile.id) return;
    setActiveId(activeProfile.id);
  }, [activeId, activeProfile]);

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

  const [testLines, setTestLines] = React.useState<BracketTestLine[] | null>(null);
  const [selectedLine, setSelectedLine] = React.useState<1 | 2 | 3 | 4 | 5>(3);

  const currentED = computeEnergyDensity(power, speed, lineSpacing);
  const predictedColor = predictColorFromED(currentED);
  const availabilityMessage = buildAvailabilityMessage({
    currentMaterialSlug,
    scopedProcessFamily,
    activeLaser,
  });

  const handleStartCalibration = () => {
    if (!isEligible || !calibrationScope) return;

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
    } else {
      setMachine(activeLaser?.name ?? "MOPA #1");
      setRatedPower(activeLaser?.wattagePeak ?? 100);
      setMaterial(scopedMaterial);
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
    if (!testLines || !calibrationScope || !isEligible) return;
    const stepPct = getStepPct(bracketStep);
    const { offsetPercent, offsetMultiplier } = applyCalibration(selectedLine, stepPct);
    const picked = testLines[selectedLine - 1];

    const profile: FiberMachineProfile = normalizeFiberCalibrationProfile({
      id: activeProfile?.id ?? createFiberProfileId(),
      machine,
      laserProfileId: calibrationScope.laserProfileId,
      ratedPower,
      wavelength,
      material,
      materialSlug: calibrationScope.materialSlug,
      materialLabel: currentMaterialLabel ?? (material === "ti" ? "Titanium" : "Stainless Steel"),
      processFamily: calibrationScope.processFamily,
      lockedAt: new Date().toISOString(),
      selectedLine,
      offsetPercent,
      offsetMultiplier,
      physicalTruth: {
        ...picked.params,
        energyDensity_Jmm2: picked.energyDensity,
      },
      colorMapping: buildCalibratedColorMapping(offsetMultiplier),
    });

    const next = activeProfile
      ? profiles.map((entry) => (entry.id === profile.id ? profile : entry))
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
    const next = profiles.filter((profile) => profile.id !== activeProfile.id);
    setProfiles(next);
    saveFiberProfiles(next);
    const nextScopedProfile = next
      .map(normalizeFiberCalibrationProfile)
      .find((profile) => calibrationScope && matchesFiberCalibrationScope(profile, calibrationScope));
    setActiveId(nextScopedProfile?.id ?? null);
    setActiveFiberProfileId(nextScopedProfile?.id ?? null);
    setPhase("idle");
    setTestLines(null);
  };

  const paramLabel = (param: BracketParam) =>
    param === "speed" ? "Speed" : param === "power" ? "Power" : "Pulse Width";

  const formatLineParam = (line: BracketTestLine, param: BracketParam) => {
    switch (param) {
      case "speed":
        return `${Math.round(line.params.speed_mms)} mm/s`;
      case "power":
        return `${line.params.power_w.toFixed(1)} W`;
      case "pulseWidth":
        return `${Math.round(line.params.pulseWidth_ns)} ns`;
      default:
        return "";
    }
  };

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Fiber Color Calibration</span>
        {!isEligible ? (
          <span className={`${styles.statusBadge} ${styles.statusUncalibrated}`}>Unavailable</span>
        ) : activeProfile ? (
          <span className={`${styles.statusBadge} ${styles.statusCalibrated}`}>Calibrated</span>
        ) : (
          <span className={`${styles.statusBadge} ${styles.statusUncalibrated}`}>Uncalibrated</span>
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.resultBox}>
          <div className={styles.resultRow}>
            <span>Laser scope</span>
            <span className={styles.resultValue}>{activeLaser?.name ?? "No active laser"}</span>
          </div>
          <div className={styles.resultRow}>
            <span>Material</span>
            <span className={styles.resultValue}>{currentMaterialLabel ?? "Not selected"}</span>
          </div>
          <div className={styles.resultRow}>
            <span>Process</span>
            <span className={styles.resultValue}>{scopedProcessFamily ?? "Not eligible"}</span>
          </div>
        </div>

        {!isEligible && (
          <div className={styles.resultBox}>
            <div className={styles.resultRow}>
            <span>Status</span>
              <span className={styles.resultValue}>{availabilityMessage}</span>
            </div>
          </div>
        )}

        {isEligible && scopedProfiles.length > 0 && phase === "idle" && (
          <>
            <div className={styles.profileRow}>
              <select
                className={styles.profileSelect}
                value={activeProfile?.id ?? ""}
                onChange={(event) => handleSelectProfile(event.target.value)}
              >
                {scopedProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.machine} ({profile.materialLabel}, {profile.processFamily})
                  </option>
                ))}
              </select>
            </div>

            {activeProfile && (
              <div className={styles.resultBox}>
                <div className={styles.resultRow}>
                  <span>Machine</span>
                  <span className={styles.resultValue}>{activeProfile.machine}</span>
                </div>
                <div className={styles.resultRow}>
                  <span>Offset</span>
                  <span className={styles.resultValue}>
                    {activeProfile.offsetPercent >= 0 ? "+" : ""}
                    {activeProfile.offsetPercent.toFixed(0)}% (x{activeProfile.offsetMultiplier.toFixed(2)})
                  </span>
                </div>
                <div className={styles.resultRow}>
                  <span>Calibrated</span>
                  <span className={styles.resultValue}>
                    {new Date(activeProfile.lockedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className={styles.resultRow}>
                  <span>Selected line</span>
                  <span className={styles.resultValue}>{activeProfile.selectedLine} of 5</span>
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

        {isEligible && scopedProfiles.length === 0 && phase === "idle" && (
          <button
            className={`${styles.primaryBtn} ${styles.generateBtn}`}
            onClick={handleStartCalibration}
          >
            Start Calibration
          </button>
        )}

        {phase === "config" && isEligible && (
          <>
            <span className={styles.sectionLabel}>Calibration Scope</span>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Material</span>
              <span className={styles.resultValue}>{currentMaterialLabel}</span>
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Process</span>
              <span className={styles.resultValue}>{scopedProcessFamily}</span>
            </div>

            <span className={styles.sectionLabel}>Machine</span>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Name</span>
              <input
                className={`${styles.input} ${styles.inputWide}`}
                value={machine}
                onChange={(event) => setMachine(event.target.value)}
              />
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Rated power</span>
              <input
                type="number"
                className={styles.input}
                value={ratedPower}
                min={1}
                onChange={(event) => setRatedPower(Number(event.target.value))}
              />
              <span className={styles.fieldUnit}>W</span>
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Wavelength</span>
              <select
                className={styles.select}
                value={wavelength}
                onChange={(event) => setWavelength(Number(event.target.value) as Wavelength)}
              >
                <option value={1064}>1064 nm</option>
                <option value={532}>532 nm</option>
                <option value={355}>355 nm</option>
              </select>
            </div>

            <span className={styles.sectionLabel}>Base Parameters (Line 3)</span>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Power</span>
              <input
                type="number"
                className={styles.input}
                value={power}
                min={0.1}
                step={0.1}
                onChange={(event) => setPower(Number(event.target.value))}
              />
              <span className={styles.fieldUnit}>W</span>
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Speed</span>
              <input
                type="number"
                className={styles.input}
                value={speed}
                min={1}
                step={10}
                onChange={(event) => setSpeed(Number(event.target.value))}
              />
              <span className={styles.fieldUnit}>mm/s</span>
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Pulse width</span>
              <input
                type="number"
                className={styles.input}
                value={pulseWidth}
                min={1}
                step={1}
                onChange={(event) => setPulseWidth(Number(event.target.value))}
              />
              <span className={styles.fieldUnit}>ns</span>
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Frequency</span>
              <input
                type="number"
                className={styles.input}
                value={frequency}
                min={1}
                step={1}
                onChange={(event) => setFrequency(Number(event.target.value))}
              />
              <span className={styles.fieldUnit}>kHz</span>
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Line spacing</span>
              <input
                type="number"
                className={styles.input}
                value={lineSpacing}
                min={0.001}
                step={0.005}
                onChange={(event) => setLineSpacing(Number(event.target.value))}
              />
              <span className={styles.fieldUnit}>mm</span>
            </div>

            <div className={styles.edPreview}>
              <span>ED:</span>
              <span className={styles.edValue}>{currentED.toFixed(2)} J/mm2</span>
              <span className={styles.swatch} style={{ backgroundColor: predictedColor.hex }} />
              <span className={styles.swatchLabel}>{predictedColor.color}</span>
            </div>

            <span className={styles.sectionLabel}>Bracket Config</span>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Vary</span>
              <select
                className={styles.select}
                value={bracketParam}
                onChange={(event) => setBracketParam(event.target.value as BracketParam)}
              >
                <option value="speed">Speed</option>
                <option value="power">Power</option>
                <option value="pulseWidth">Pulse Width</option>
              </select>
            </div>

            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Step size</span>
              <select
                className={styles.select}
                value={bracketStep}
                onChange={(event) => setBracketStep(event.target.value as BracketStepSize)}
              >
                <option value="fine">Fine (5%)</option>
                <option value="normal">Normal (10%)</option>
                <option value="coarse">Coarse (20%)</option>
              </select>
            </div>

            <button className={`${styles.primaryBtn} ${styles.generateBtn}`} onClick={handleGenerate}>
              Generate 5-Line Test
            </button>

            <button
              className={styles.secondaryBtn}
              onClick={() => {
                setPhase("idle");
                setTestLines(null);
              }}
            >
              Cancel
            </button>
          </>
        )}

        {phase === "test" && testLines && isEligible && (
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
                  onKeyDown={(event) => {
                    if (event.key === "Enter") setSelectedLine(line.line);
                  }}
                >
                  <span className={styles.testLineNum}>{line.line}</span>
                  <span className={styles.testLineBar} style={{ backgroundColor: line.predictedColor.hex }} />
                  <span className={styles.swatch} style={{ backgroundColor: line.predictedColor.hex }} />
                  <span className={styles.testLineParams}>{formatLineParam(line, bracketParam)}</span>
                  <span className={styles.testLineED}>{line.energyDensity.toFixed(2)}</span>
                </div>
              ))}
            </div>

            {(() => {
              const stepPct = getStepPct(bracketStep);
              const { offsetPercent, offsetMultiplier } = applyCalibration(selectedLine, stepPct);
              return (
                <div className={styles.resultBox}>
                  <div className={styles.resultRow}>
                    <span>Offset</span>
                    <span className={styles.resultValue}>
                      {offsetPercent >= 0 ? "+" : ""}
                      {offsetPercent.toFixed(0)}%
                    </span>
                  </div>
                  <div className={styles.resultRow}>
                    <span>Multiplier</span>
                    <span className={styles.resultValue}>x{offsetMultiplier.toFixed(2)}</span>
                  </div>
                </div>
              );
            })()}

            <button className={`${styles.primaryBtn} ${styles.saveBtn}`} onClick={handleSave}>
              Save Calibration
            </button>

            <button className={styles.secondaryBtn} onClick={() => setPhase("config")}>
              Back to Config
            </button>
          </>
        )}

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
                  {activeProfile.offsetPercent >= 0 ? "+" : ""}
                  {activeProfile.offsetPercent.toFixed(0)}% (x{activeProfile.offsetMultiplier.toFixed(2)})
                </span>
              </div>
              <div className={styles.resultRow}>
                <span>Scope</span>
                <span className={styles.resultValue}>
                  {activeProfile.materialLabel} - {activeProfile.processFamily}
                </span>
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

function normalizeProcessFamily(processFamily: string | null | undefined): MarkingProcessFamily | null {
  switch (processFamily) {
    case "oxide-color":
    case "oxide-black":
    case "oxide-dark":
      return processFamily;
    default:
      return null;
  }
}

function buildAvailabilityMessage({
  currentMaterialSlug,
  scopedProcessFamily,
  activeLaser,
}: {
  currentMaterialSlug?: string | null;
  scopedProcessFamily: MarkingProcessFamily | null;
  activeLaser: LaserProfile | null;
}): string {
  if (!activeLaser) {
    return "Select an active MOPA fiber laser before calibrating.";
  }
  if (activeLaser.sourceType !== "fiber" || activeLaser.isMopaCapable !== true) {
    return "Color calibration is only available for active MOPA fiber laser profiles.";
  }
  if (!currentMaterialSlug) {
    return "Select a stainless steel or titanium material before calibrating.";
  }
  if (currentMaterialSlug !== "stainless-steel" && currentMaterialSlug !== "titanium") {
    return "Calibration is only available for stainless steel and titanium color-marking scopes.";
  }
  if (!scopedProcessFamily) {
    return "Calibration is only available for MOPA oxide-color process families.";
  }
  return "Scope ready.";
}
