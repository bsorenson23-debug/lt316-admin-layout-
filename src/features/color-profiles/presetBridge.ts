import { LASER_MATERIAL_PRESETS, type LaserPreset } from "../../data/laserMaterialPresets.ts";
import type { LaserLayer } from "../../types/laserLayer.ts";
import type { LaserProfile } from "../../types/laserProfile.ts";
import type { AchievableOutcome, OutcomeParameterOverrides, ResolvedLaserContext, ResolvedOutcome } from "./types.ts";

export interface AppliedOutcomeFields {
  mode: "fill";
  speedMmS: number;
  powerPct: number;
  passes: number;
  lineIntervalMm?: number;
  frequencyKhz?: number;
  pulseWidthNs?: number;
  matchedPresetId?: string;
  matchedPresetLabel?: string;
  processFamily?: ResolvedOutcome["processFamily"];
  outcomeId?: string;
  outcomeLabel?: string;
  outcomeTargetHex?: string;
  outcomeDeltaE?: number;
  outcomeNotes?: string;
}

export function hasPresetForOutcome(outcome: Pick<AchievableOutcome, "basePresetId">): boolean {
  if (!outcome.basePresetId) return false;
  return LASER_MATERIAL_PRESETS.some((preset) => preset.id === outcome.basePresetId);
}

function applyOverrides(basePreset: LaserPreset, overrides?: OutcomeParameterOverrides): LaserPreset {
  if (!overrides) return basePreset;
  return {
    ...basePreset,
    powerPct: overrides.powerPct ?? basePreset.powerPct,
    speedMmS: overrides.speedMmS ?? basePreset.speedMmS,
    lineIntervalMm: overrides.lineIntervalMm ?? basePreset.lineIntervalMm,
    passes: overrides.passes ?? basePreset.passes,
    frequencyKhz: overrides.frequencyKhz ?? basePreset.frequencyKhz,
    pulseWidthNs: overrides.pulseWidthNs ?? basePreset.pulseWidthNs,
    crossHatch: overrides.crossHatch ?? basePreset.crossHatch,
  };
}

export function toLaserMachineContext(profile: LaserProfile | ResolvedLaserContext | null | undefined) {
  if (!profile) return null;
  return {
    machineName: profile.name,
    laserType: profile.sourceType,
    wattagePeak: profile.wattagePeak,
    isMopaCapable: profile.sourceType === "fiber" && profile.isMopaCapable === true,
  };
}

function scalePowerForMachine(
  presetPowerPct: number,
  preset: LaserPreset,
  machineWatts: number,
): { scaledPowerPct: number; note: string } {
  const refWatts = (preset.wattageMin + preset.wattageMax) / 2;
  if (!machineWatts || !Number.isFinite(machineWatts) || machineWatts <= 0) {
    return {
      scaledPowerPct: presetPowerPct,
      note: "Using preset power because the active laser wattage is unknown.",
    };
  }

  const ratio = refWatts / machineWatts;
  const scaledPowerPct = Math.max(1, Math.min(100, Math.round(presetPowerPct * ratio)));

  return {
    scaledPowerPct,
    note: scaledPowerPct === presetPowerPct
      ? `Preset already aligns with the active ${machineWatts}W laser.`
      : `Scaled power from ${presetPowerPct}% to ${scaledPowerPct}% for the active ${machineWatts}W laser.`,
  };
}

export function resolvePresetForOutcome(outcome: Pick<AchievableOutcome, "basePresetId" | "parameterOverrides" | "label">): LaserPreset | null {
  if (!outcome.basePresetId) return null;
  const preset = LASER_MATERIAL_PRESETS.find((candidate) => candidate.id === outcome.basePresetId);
  if (!preset) return null;
  return applyOverrides(preset, outcome.parameterOverrides);
}

export function applyOutcomeToLayer(
  outcome: ResolvedOutcome,
  activeLaser: LaserProfile | ResolvedLaserContext | null | undefined,
  matchDeltaE?: number,
): { fields: AppliedOutcomeFields; note: string } | null {
  const effectivePreset = resolvePresetForOutcome(outcome);
  if (!effectivePreset) return null;

  const machine = toLaserMachineContext(activeLaser);
  const { scaledPowerPct, note } = scalePowerForMachine(
    effectivePreset.powerPct,
    effectivePreset,
    machine?.wattagePeak ?? 0,
  );

  return {
    fields: {
      mode: "fill",
      speedMmS: effectivePreset.speedMmS,
      powerPct: scaledPowerPct,
      passes: effectivePreset.passes,
      lineIntervalMm: effectivePreset.lineIntervalMm,
      frequencyKhz: effectivePreset.frequencyKhz,
      pulseWidthNs: effectivePreset.pulseWidthNs,
      matchedPresetId: effectivePreset.id,
      matchedPresetLabel: machine
        ? `${effectivePreset.label} · scaled for ${machine.machineName} (${machine.wattagePeak}W)`
        : effectivePreset.label,
      processFamily: outcome.processFamily,
      outcomeId: outcome.id,
      outcomeLabel: outcome.label,
      outcomeTargetHex: outcome.targetHex,
      outcomeDeltaE: matchDeltaE,
      outcomeNotes: outcome.notes,
    },
    note,
  };
}

function inferOutcomeIdFromPresetId(presetId?: string): string | undefined {
  if (!presetId) return undefined;
  return LASER_MATERIAL_PRESETS.find((preset) => preset.id === presetId)?.outcomeId;
}

export function migrateLaserLayerMetadata(layer: LaserLayer): LaserLayer {
  const outcomeId = layer.outcomeId ?? inferOutcomeIdFromPresetId(layer.matchedPresetId);
  const outcomeLabel = layer.outcomeLabel ?? layer.matchTargetName;
  const outcomeTargetHex = layer.outcomeTargetHex ?? layer.matchTargetHex;
  const outcomeDeltaE = layer.outcomeDeltaE ?? layer.matchDeltaE;

  return {
    ...layer,
    outcomeId,
    outcomeLabel,
    outcomeTargetHex,
    outcomeDeltaE,
    matchedPresetLabel: layer.matchedPresetLabel ?? outcomeLabel,
  };
}
