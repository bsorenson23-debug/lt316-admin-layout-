import type { FiberMachineProfile } from "../../types/fiberColor.ts";
import type { MarkingProcessFamily } from "./types.ts";

export interface FiberCalibrationScope {
  laserProfileId?: string;
  materialSlug: string;
  processFamily: MarkingProcessFamily;
}

export function normalizeFiberCalibrationProfile(profile: FiberMachineProfile): FiberMachineProfile {
  return {
    ...profile,
    materialSlug: profile.materialSlug ?? (profile.material === "ti" ? "titanium" : "stainless-steel"),
    processFamily: profile.processFamily ?? "oxide-color",
    materialLabel: profile.materialLabel ?? (profile.material === "ti" ? "Titanium" : "Stainless Steel"),
    laserProfileId: profile.laserProfileId ?? undefined,
  };
}

export function matchesFiberCalibrationScope(
  profile: FiberMachineProfile,
  scope: FiberCalibrationScope,
): boolean {
  const normalized = normalizeFiberCalibrationProfile(profile);
  return (
    normalized.materialSlug === scope.materialSlug &&
    normalized.processFamily === scope.processFamily &&
    (scope.laserProfileId ? normalized.laserProfileId === scope.laserProfileId : true)
  );
}
