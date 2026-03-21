import assert from "node:assert/strict";
import test from "node:test";
import {
  computeEnergyDensity,
  predictColorFromED,
  generateBracketTest,
  applyCalibration,
  buildCalibratedColorMapping,
  getParamsForColor,
  getStepPct,
  mmsToMmMin,
  mmMinToMms,
  wattsToPercent,
  percentToWatts,
} from "./fiberColorCalc.ts";
import type {
  BracketTestConfig,
  FiberMachineProfile,
} from "../types/fiberColor.ts";

// ---------------------------------------------------------------------------
// Energy density
// ---------------------------------------------------------------------------

test("computeEnergyDensity: ED = P / (S × LS)", () => {
  assert.equal(computeEnergyDensity(50, 1000, 0.05), 1.0);
});

test("computeEnergyDensity: returns 0 for zero speed", () => {
  assert.equal(computeEnergyDensity(50, 0, 0.05), 0);
});

test("computeEnergyDensity: returns 0 for zero line spacing", () => {
  assert.equal(computeEnergyDensity(50, 1000, 0), 0);
});

// ---------------------------------------------------------------------------
// Color prediction
// ---------------------------------------------------------------------------

test("predictColorFromED: 0.0 → Bare metal", () => {
  assert.equal(predictColorFromED(0.0).color, "Bare metal");
});

test("predictColorFromED: 0.85 → Gold", () => {
  assert.equal(predictColorFromED(0.85).color, "Gold");
});

test("predictColorFromED: 2.5 → Purple", () => {
  assert.equal(predictColorFromED(2.5).color, "Purple");
});

test("predictColorFromED: 6.0 → Blue", () => {
  assert.equal(predictColorFromED(6.0).color, "Blue");
});

test("predictColorFromED: 15.0 → Charcoal", () => {
  assert.equal(predictColorFromED(15.0).color, "Charcoal");
});

test("predictColorFromED: lower bound inclusive (0.30 → Pale straw)", () => {
  assert.equal(predictColorFromED(0.30).color, "Pale straw");
  assert.equal(predictColorFromED(0.60).color, "Gold");
  assert.equal(predictColorFromED(1.10).color, "Bronze");
});

test("predictColorFromED: upper bound exclusive (0.299 → Bare metal)", () => {
  assert.equal(predictColorFromED(0.299).color, "Bare metal");
});

// ---------------------------------------------------------------------------
// Bracket test generation
// ---------------------------------------------------------------------------

const baseConfig: BracketTestConfig = {
  param: "speed",
  stepSize: "normal",
  baseParams: {
    power_w: 50,
    speed_mms: 1000,
    pulseWidth_ns: 200,
    frequency_khz: 30,
    lineSpacing_mm: 0.05,
  },
};

test("generateBracketTest: produces exactly 5 lines", () => {
  const lines = generateBracketTest(baseConfig);
  assert.equal(lines.length, 5);
});

test("generateBracketTest: line 3 has offset 0 and unchanged params", () => {
  const lines = generateBracketTest(baseConfig);
  const line3 = lines[2];
  assert.equal(line3.line, 3);
  assert.equal(line3.offset, 0);
  assert.equal(line3.params.speed_mms, 1000);
  assert.equal(line3.params.power_w, 50);
});

test("generateBracketTest speed: line 1 faster, line 5 slower", () => {
  const lines = generateBracketTest(baseConfig);
  assert.ok(lines[0].params.speed_mms > baseConfig.baseParams.speed_mms);
  assert.ok(lines[4].params.speed_mms < baseConfig.baseParams.speed_mms);
});

test("generateBracketTest speed: ED increases monotonically 1→5", () => {
  const lines = generateBracketTest(baseConfig);
  for (let i = 1; i < lines.length; i++) {
    assert.ok(lines[i].energyDensity > lines[i - 1].energyDensity);
  }
});

test("generateBracketTest power: line 5 has higher power, speed unchanged", () => {
  const lines = generateBracketTest({ ...baseConfig, param: "power" });
  assert.ok(lines[4].params.power_w > lines[0].params.power_w);
  assert.equal(lines[0].params.speed_mms, 1000);
  assert.equal(lines[4].params.speed_mms, 1000);
});

test("generateBracketTest pulseWidth: line 5 has wider pulse", () => {
  const lines = generateBracketTest({ ...baseConfig, param: "pulseWidth" });
  assert.ok(lines[4].params.pulseWidth_ns > lines[0].params.pulseWidth_ns);
});

test("generateBracketTest: fine step produces smaller spread than coarse", () => {
  const fineLines = generateBracketTest({ ...baseConfig, stepSize: "fine" });
  const coarseLines = generateBracketTest({ ...baseConfig, stepSize: "coarse" });
  const fineSpread = fineLines[4].energyDensity - fineLines[0].energyDensity;
  const coarseSpread = coarseLines[4].energyDensity - coarseLines[0].energyDensity;
  assert.ok(fineSpread < coarseSpread);
});

// ---------------------------------------------------------------------------
// Calibration offset
// ---------------------------------------------------------------------------

test("applyCalibration: line 3 → zero offset", () => {
  const { offsetPercent, offsetMultiplier } = applyCalibration(3, 0.10);
  assert.equal(offsetPercent, 0);
  assert.equal(offsetMultiplier, 1.0);
});

test("applyCalibration: line 4 at 10% → +10%", () => {
  const { offsetPercent, offsetMultiplier } = applyCalibration(4, 0.10);
  assert.equal(offsetPercent, 10);
  assert.ok(Math.abs(offsetMultiplier - 1.10) < 1e-10);
});

test("applyCalibration: line 1 at 10% → -20%", () => {
  const { offsetPercent, offsetMultiplier } = applyCalibration(1, 0.10);
  assert.equal(offsetPercent, -20);
  assert.ok(Math.abs(offsetMultiplier - 0.80) < 1e-10);
});

test("applyCalibration: line 5 at 20% → +40%", () => {
  const { offsetPercent, offsetMultiplier } = applyCalibration(5, 0.20);
  assert.equal(offsetPercent, 40);
  assert.ok(Math.abs(offsetMultiplier - 1.40) < 1e-10);
});

// ---------------------------------------------------------------------------
// Calibrated color mapping
// ---------------------------------------------------------------------------

test("buildCalibratedColorMapping: returns 12 entries (one per spectrum color)", () => {
  const mapping = buildCalibratedColorMapping(1.0);
  assert.equal(mapping.length, 12);
});

test("buildCalibratedColorMapping: multiplier 1.0 → correctedED equals baseED", () => {
  const mapping = buildCalibratedColorMapping(1.0);
  for (const entry of mapping) {
    assert.ok(Math.abs(entry.correctedED - entry.baseED) < 1e-10);
  }
});

test("buildCalibratedColorMapping: multiplier 1.10 → correctedED = baseED × 1.10", () => {
  const mapping = buildCalibratedColorMapping(1.10);
  for (const entry of mapping) {
    const expected = entry.baseED * 1.10;
    assert.ok(Math.abs(entry.correctedED - expected) < 1e-10);
  }
});

test("buildCalibratedColorMapping: Gold midpoint is 0.85", () => {
  const mapping = buildCalibratedColorMapping(1.0);
  const gold = mapping.find((e) => e.color === "Gold");
  assert.ok(gold);
  assert.ok(Math.abs(gold.baseED - 0.85) < 1e-10);
});

// ---------------------------------------------------------------------------
// Reverse lookup
// ---------------------------------------------------------------------------

function makeTestProfile(): FiberMachineProfile {
  return {
    id: "test",
    machine: "Test Machine",
    ratedPower: 100,
    wavelength: 1064,
    material: "ss",
    lockedAt: "2026-03-20T00:00:00Z",
    selectedLine: 3,
    offsetPercent: 0,
    offsetMultiplier: 1.0,
    physicalTruth: {
      power_w: 50,
      speed_mms: 1000,
      pulseWidth_ns: 200,
      frequency_khz: 30,
      lineSpacing_mm: 0.05,
      energyDensity_Jmm2: 1.0,
    },
    colorMapping: buildCalibratedColorMapping(1.0),
  };
}

test("getParamsForColor: returns null for unknown color", () => {
  const result = getParamsForColor("Nonexistent", makeTestProfile(), {
    lineSpacing_mm: 0.05, pulseWidth_ns: 200, frequency_khz: 30,
  });
  assert.equal(result, null);
});

test("getParamsForColor: speed = power / (correctedED × lineSpacing)", () => {
  const result = getParamsForColor("Gold", makeTestProfile(), {
    lineSpacing_mm: 0.05, pulseWidth_ns: 200, frequency_khz: 30,
  });
  assert.ok(result);
  const expectedSpeed = 50 / (0.85 * 0.05);
  assert.ok(Math.abs(result.params.speed_mms - Math.round(expectedSpeed * 10) / 10) < 0.2);
});

test("getParamsForColor: uses machine power", () => {
  const result = getParamsForColor("Gold", makeTestProfile(), {
    lineSpacing_mm: 0.05, pulseWidth_ns: 200, frequency_khz: 30,
  });
  assert.ok(result);
  assert.equal(result.params.power_w, 50);
});

test("getParamsForColor: preserves pulse width and frequency from baseParams", () => {
  const result = getParamsForColor("Gold", makeTestProfile(), {
    lineSpacing_mm: 0.05, pulseWidth_ns: 150, frequency_khz: 40,
  });
  assert.ok(result);
  assert.equal(result.params.pulseWidth_ns, 150);
  assert.equal(result.params.frequency_khz, 40);
});

test("getParamsForColor: calibrated machine adjusts speed", () => {
  const profile = makeTestProfile();
  const calibratedProfile: FiberMachineProfile = {
    ...profile,
    offsetMultiplier: 1.10,
    colorMapping: buildCalibratedColorMapping(1.10),
  };
  const base = getParamsForColor("Gold", profile, {
    lineSpacing_mm: 0.05, pulseWidth_ns: 200, frequency_khz: 30,
  });
  const calibrated = getParamsForColor("Gold", calibratedProfile, {
    lineSpacing_mm: 0.05, pulseWidth_ns: 200, frequency_khz: 30,
  });
  assert.ok(base && calibrated);
  assert.ok(calibrated.params.speed_mms < base.params.speed_mms);
});

// ---------------------------------------------------------------------------
// Unit conversions
// ---------------------------------------------------------------------------

test("mmsToMmMin: 100 mm/s → 6000 mm/min", () => {
  assert.equal(mmsToMmMin(100), 6000);
});

test("mmMinToMms: 6000 mm/min → 100 mm/s", () => {
  assert.equal(mmMinToMms(6000), 100);
});

test("wattsToPercent: 50W of 100W → 50%", () => {
  assert.equal(wattsToPercent(50, 100), 50);
});

test("percentToWatts: 50% of 100W → 50W", () => {
  assert.equal(percentToWatts(50, 100), 50);
});

// ---------------------------------------------------------------------------
// Step sizes
// ---------------------------------------------------------------------------

test("getStepPct: fine = 5%", () => assert.equal(getStepPct("fine"), 0.05));
test("getStepPct: normal = 10%", () => assert.equal(getStepPct("normal"), 0.10));
test("getStepPct: coarse = 20%", () => assert.equal(getStepPct("coarse"), 0.20));
