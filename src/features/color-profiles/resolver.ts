import type { LaserProfile, LaserSourceType } from "../../types/laserProfile.ts";
import { deltaE, hexToLab } from "../../utils/steelColorLookup.ts";
import { MATERIAL_LASER_CAPABILITIES, getMaterialLabel } from "./capabilities.ts";
import type {
  MaterialLaserCapability,
  MaterialSelectionContext,
  ResolvedLaserContext,
  ResolvedOutcome,
  ResolvedProcessContext,
} from "./types.ts";
import { hasPresetForOutcome } from "./presetBridge.ts";

export function isLaserProfileMopa(profile: Pick<LaserProfile, "sourceType" | "isMopaCapable"> | null | undefined): boolean {
  return profile?.sourceType === "fiber" && profile.isMopaCapable === true;
}

export function toResolvedLaserContext(profile: LaserProfile | null | undefined): ResolvedLaserContext | null {
  if (!profile) return null;
  return {
    id: profile.id,
    name: profile.name,
    sourceType: profile.sourceType,
    wattagePeak: profile.wattagePeak,
    isMopaCapable: isLaserProfileMopa(profile),
  };
}

function capabilityApplies(
  capability: MaterialLaserCapability,
  sourceType: LaserSourceType,
  isMopaCapable: boolean,
  productHint?: string,
): boolean {
  if (capability.laserSourceType !== sourceType) return false;
  if (capability.requiresMopa && !isMopaCapable) return false;
  if (!capability.productHints?.length || !productHint) return true;
  return capability.productHints.includes(productHint);
}

export function resolveProcessContext(
  activeLaser: LaserProfile | null | undefined,
  selection: MaterialSelectionContext,
): ResolvedProcessContext | null {
  const materialSlug = selection.materialSlug?.trim();
  if (!materialSlug) return null;

  const materialLabel = selection.materialLabel?.trim() || getMaterialLabel(materialSlug);
  const laserContext = toResolvedLaserContext(activeLaser);
  const warnings: string[] = [];

  if (!laserContext) {
    warnings.push("No active laser profile selected.");
  }

  const matchedCapabilities = laserContext
    ? MATERIAL_LASER_CAPABILITIES.filter((capability) =>
        capability.materialSlug === materialSlug &&
        capabilityApplies(capability, laserContext.sourceType, laserContext.isMopaCapable, selection.productHint ?? undefined),
      )
    : [];
  const capabilities = matchedCapabilities.some((capability) => capability.requiresMopa)
    ? matchedCapabilities.filter((capability) => capability.requiresMopa)
    : matchedCapabilities;

  if (laserContext && capabilities.length === 0) {
    warnings.push(`No supported marking outcomes for ${materialLabel} on ${laserContext.name}.`);
  }

  return {
    materialSlug,
    materialLabel,
    productHint: selection.productHint ?? undefined,
    activeLaser: laserContext,
    capabilities,
    warnings,
  };
}

export function resolveSupportedOutcomes(context: ResolvedProcessContext | null): ResolvedOutcome[] {
  if (!context?.activeLaser) return [];

  return context.capabilities.flatMap((capability) =>
    capability.outcomes.map((outcome) => ({
      ...outcome,
      capabilityId: capability.id,
      materialSlug: capability.materialSlug,
      materialLabel: capability.materialLabel,
      sourceType: capability.laserSourceType,
      suggested: false,
      presetAvailable: hasPresetForOutcome(outcome),
      warning: hasPresetForOutcome(outcome) ? undefined : outcome.notes ?? "No preset mapped yet for this outcome.",
    })),
  );
}

export function suggestNearestOutcome(outcomes: ResolvedOutcome[], hex: string): ResolvedOutcome | null {
  const inputLab = hexToLab(hex);
  if (!inputLab) return null;

  let winner: ResolvedOutcome | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const outcome of outcomes) {
    if (!outcome.targetHex) continue;
    const targetLab = hexToLab(outcome.targetHex);
    if (!targetLab) continue;
    const currentDelta = deltaE(inputLab, targetLab);
    if (currentDelta < bestDelta) {
      bestDelta = currentDelta;
      winner = outcome;
    }
  }

  return winner ? { ...winner, suggested: true } : null;
}
