import assert from "node:assert/strict";
import test from "node:test";
import type { LaserLayer } from "../../types/laserLayer.ts";
import type { LaserProfile } from "../../types/laserProfile.ts";
import type { FiberMachineProfile } from "../../types/fiberColor.ts";
import { resolveProcessContext, resolveSupportedOutcomes } from "./resolver.ts";
import { applyOutcomeToLayer, migrateLaserLayerMetadata, resolvePresetForOutcome } from "./presetBridge.ts";
import { normalizeFiberCalibrationProfile } from "./calibration.ts";

function makeLaserProfile(overrides: Partial<LaserProfile> = {}): LaserProfile {
  return {
    id: "laser-1",
    name: "Test Laser",
    sourceType: "fiber",
    source: "JPT",
    wattagePeak: 30,
    isMopaCapable: false,
    lenses: [],
    ...overrides,
  };
}

function resolveOutcomeIds(profile: LaserProfile, materialSlug: string, productHint?: string) {
  const context = resolveProcessContext(profile, {
    materialSlug,
    materialLabel: materialSlug,
    productHint,
  });
  return resolveSupportedOutcomes(context).map((outcome) => outcome.id);
}

test("stainless steel on MOPA fiber exposes oxide-color outcomes", () => {
  const outcomeIds = resolveOutcomeIds(
    makeLaserProfile({ isMopaCapable: true }),
    "stainless-steel",
  );

  assert.ok(outcomeIds.includes("ss-oxide-black"));
  assert.ok(outcomeIds.includes("ss-oxide-blue"));
  assert.ok(outcomeIds.includes("ss-oxide-gold"));
});

test("stainless steel on standard fiber does not expose MOPA oxide colors", () => {
  const outcomeIds = resolveOutcomeIds(
    makeLaserProfile({ isMopaCapable: false }),
    "stainless-steel",
  );

  assert.deepEqual(outcomeIds, ["ss-anneal-dark", "ss-engrave-basic"]);
});

test("anodized aluminum only exposes anodized and ablation outcomes", () => {
  const outcomeIds = resolveOutcomeIds(
    makeLaserProfile({ isMopaCapable: true }),
    "anodized-aluminum",
  );

  assert.ok(outcomeIds.includes("anodized-black"));
  assert.ok(outcomeIds.includes("anodized-dark-gray"));
  assert.ok(outcomeIds.includes("anodized-light-gray"));
  assert.ok(outcomeIds.includes("anodized-white-ablation"));
  assert.ok(!outcomeIds.includes("ss-oxide-blue"));
});

test("ABS uses a constrained supported outcome set", () => {
  const outcomeIds = resolveOutcomeIds(
    makeLaserProfile({ isMopaCapable: true }),
    "plastic-abs",
    "magazine",
  );

  assert.deepEqual(outcomeIds, ["abs-light-gray", "abs-dark-gray", "abs-black"]);
});

test("powder coat never exposes intrinsic oxide-color outcomes", () => {
  const outcomes = resolveSupportedOutcomes(resolveProcessContext(
    makeLaserProfile({ sourceType: "co2", isMopaCapable: false }),
    {
      materialSlug: "powder-coat",
      materialLabel: "Powder Coat",
      productHint: "tumbler",
    },
  ));

  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0]?.processFamily, "coating-ablation");
});

test("layer migration maps legacy stainless match fields into generic outcome metadata", () => {
  const migrated = migrateLaserLayerMetadata({
    id: "layer-1",
    color: "#ff0000",
    name: "Red",
    mode: "fill",
    speedMmS: 500,
    powerPct: 25,
    passes: 1,
    enabled: true,
    priority: 0,
    matchedPresetId: "mopa-steel-blue-20w",
    matchDeltaE: 4.2,
    matchTargetName: "Bright Blue",
    matchTargetHex: "#2244cc",
  } as LaserLayer);

  assert.equal(migrated.outcomeId, "ss-oxide-blue");
  assert.equal(migrated.outcomeLabel, "Bright Blue");
  assert.equal(migrated.outcomeTargetHex, "#2244cc");
  assert.equal(migrated.outcomeDeltaE, 4.2);
});

test("legacy fiber calibration profiles normalize into scoped profiles", () => {
  const normalized = normalizeFiberCalibrationProfile({
    id: "fiber-legacy",
    machine: "Legacy MOPA",
    ratedPower: 60,
    wavelength: 1064,
    material: "ss",
    lockedAt: "2026-03-30T00:00:00.000Z",
    selectedLine: 3,
    offsetPercent: 0,
    offsetMultiplier: 1,
    physicalTruth: {
      power_w: 30,
      speed_mms: 1000,
      pulseWidth_ns: 200,
      frequency_khz: 30,
      lineSpacing_mm: 0.05,
      energyDensity_Jmm2: 0.6,
    },
    colorMapping: [],
  } as FiberMachineProfile);

  assert.equal(normalized.materialSlug, "stainless-steel");
  assert.equal(normalized.materialLabel, "Stainless Steel");
  assert.equal(normalized.processFamily, "oxide-color");
});

test("missing MOPA capability safely disables stainless color outcomes", () => {
  const outcomes = resolveSupportedOutcomes(resolveProcessContext(
    makeLaserProfile({ isMopaCapable: undefined }),
    {
      materialSlug: "stainless-steel",
      materialLabel: "Stainless Steel",
    },
  ));

  assert.deepEqual(outcomes.map((outcome) => outcome.id), ["ss-anneal-dark", "ss-engrave-basic"]);
});

test("preset bridge reapplies an outcome for a different wattage without losing ids", () => {
  const outcome = resolveSupportedOutcomes(resolveProcessContext(
    makeLaserProfile({ isMopaCapable: true, wattagePeak: 20 }),
    {
      materialSlug: "stainless-steel",
      materialLabel: "Stainless Steel",
    },
  )).find((candidate) => candidate.id === "ss-oxide-black");

  assert.ok(outcome);

  const preset = resolvePresetForOutcome(outcome);
  assert.ok(preset);

  const lowWattApplied = applyOutcomeToLayer(outcome, makeLaserProfile({ id: "laser-low", isMopaCapable: true, wattagePeak: 20 }));
  const highWattApplied = applyOutcomeToLayer(outcome, makeLaserProfile({ id: "laser-high", isMopaCapable: true, wattagePeak: 60 }));

  assert.ok(lowWattApplied);
  assert.ok(highWattApplied);
  assert.equal(lowWattApplied.fields.outcomeId, "ss-oxide-black");
  assert.equal(highWattApplied.fields.outcomeId, "ss-oxide-black");
  assert.notEqual(lowWattApplied.fields.powerPct, highWattApplied.fields.powerPct);
});
