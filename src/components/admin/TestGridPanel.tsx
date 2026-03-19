"use client";
import React from "react";
import styles from "./TestGridPanel.module.css";

interface Props {
  bedWidthMm?: number;
  bedHeightMm?: number;
}

function buildLbrn2(
  powerMin: number,
  powerMax: number,
  powerSteps: number,
  speedMin: number,
  speedMax: number,
  speedSteps: number,
  cellSize: number,
  cellGap: number
): string {
  const powers: number[] = [];
  for (let i = 0; i < powerSteps; i++) {
    const t = powerSteps === 1 ? 0 : i / (powerSteps - 1);
    powers.push(Math.round(powerMin + t * (powerMax - powerMin)));
  }

  const speeds: number[] = [];
  for (let j = 0; j < speedSteps; j++) {
    const t = speedSteps === 1 ? 0 : j / (speedSteps - 1);
    speeds.push(Math.round(speedMin + t * (speedMax - speedMin)));
  }

  let cutSettings = "";
  let shapes = "";
  let cutIndex = 0;

  for (let i = 0; i < powers.length; i++) {
    const power = powers[i];
    for (let j = 0; j < speeds.length; j++) {
      const speed = speeds[j];
      const idx = cutIndex++;

      cutSettings += `  <CutSetting type="Cut">
    <index Value="${idx}" />
    <name Value="P${power} S${speed}" />
    <priority Value="0" />
    <kerf Value="0" />
    <LinkPath Value="0" />
    <minPower Value="${power}" />
    <maxPower Value="${power}" />
    <speed Value="${speed}" />
    <enabled Value="True" />
  </CutSetting>\n`;

      const xCenter = j * (cellSize + cellGap) + cellSize / 2;
      const yCenter = i * (cellSize + cellGap) + cellSize / 2;

      shapes += `  <Shape Type="Rect" CutIndex="${idx}">
    <XForm>1 0 0 1 ${xCenter} ${yCenter}</XForm>
    <W Value="${cellSize}" />
    <H Value="${cellSize}" />
    <Cr Value="0" />
  </Shape>\n`;
    }
  }

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<LightBurnProject AppVersion="1.7.00" FormatVersion="1" MaterialHeight="0" MirrorX="False" MirrorY="False">\n` +
    cutSettings +
    shapes +
    `</LightBurnProject>\n`
  );
}

export function TestGridPanel({ bedWidthMm = 300, bedHeightMm = 200 }: Props) {
  const [open, setOpen] = React.useState(false);
  const [powerMin, setPowerMin] = React.useState(10);
  const [powerMax, setPowerMax] = React.useState(80);
  const [powerSteps, setPowerSteps] = React.useState(4);
  const [speedMin, setSpeedMin] = React.useState(100);
  const [speedMax, setSpeedMax] = React.useState(800);
  const [speedSteps, setSpeedSteps] = React.useState(4);
  const [cellSize, setCellSize] = React.useState(10);
  const [cellGap, setCellGap] = React.useState(2);

  const totalW = speedSteps * cellSize + (speedSteps - 1) * cellGap;
  const totalH = powerSteps * cellSize + (powerSteps - 1) * cellGap;
  const fitsOnBed = totalW <= bedWidthMm && totalH <= bedHeightMm;

  function handleGenerate() {
    const xml = buildLbrn2(
      powerMin,
      powerMax,
      powerSteps,
      speedMin,
      speedMax,
      speedSteps,
      cellSize,
      cellGap
    );
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "test-grid.lbrn2";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={styles.panel}>
      <button className={styles.toggle} onClick={() => setOpen((v) => !v)}>
        <span className={styles.toggleLabel}>Power/Speed Test Grid</span>
        <span className={styles.chevron}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className={styles.body}>
          <span className={styles.sectionLabel}>Power (%)</span>
          <div className={styles.row}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Min</label>
              <input
                type="number"
                className={styles.numInput}
                value={powerMin}
                min={1}
                max={100}
                onChange={(e) => setPowerMin(Number(e.target.value))}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Max</label>
              <input
                type="number"
                className={styles.numInput}
                value={powerMax}
                min={1}
                max={100}
                onChange={(e) => setPowerMax(Number(e.target.value))}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Steps</label>
              <input
                type="number"
                className={styles.numInput}
                value={powerSteps}
                min={1}
                max={20}
                onChange={(e) => setPowerSteps(Number(e.target.value))}
              />
            </div>
          </div>

          <span className={styles.sectionLabel}>Speed (mm/min)</span>
          <div className={styles.row}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Min</label>
              <input
                type="number"
                className={styles.numInput}
                value={speedMin}
                min={1}
                onChange={(e) => setSpeedMin(Number(e.target.value))}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Max</label>
              <input
                type="number"
                className={styles.numInput}
                value={speedMax}
                min={1}
                onChange={(e) => setSpeedMax(Number(e.target.value))}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Steps</label>
              <input
                type="number"
                className={styles.numInput}
                value={speedSteps}
                min={1}
                max={20}
                onChange={(e) => setSpeedSteps(Number(e.target.value))}
              />
            </div>
          </div>

          <span className={styles.sectionLabel}>Cell Size</span>
          <div className={styles.row}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Cell (mm)</label>
              <input
                type="number"
                className={styles.numInput}
                value={cellSize}
                min={1}
                onChange={(e) => setCellSize(Number(e.target.value))}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Gap (mm)</label>
              <input
                type="number"
                className={styles.numInput}
                value={cellGap}
                min={0}
                onChange={(e) => setCellGap(Number(e.target.value))}
              />
            </div>
          </div>

          <p className={styles.infoText}>
            Grid: {totalW} x {totalH} mm
            {!fitsOnBed && (
              <> — exceeds bed ({bedWidthMm} x {bedHeightMm} mm)</>
            )}
          </p>

          <button
            className={styles.generateBtn}
            onClick={handleGenerate}
            disabled={powerMin > powerMax || speedMin > speedMax || powerSteps < 1 || speedSteps < 1}
          >
            Generate &amp; Download
          </button>
        </div>
      )}
    </div>
  );
}
