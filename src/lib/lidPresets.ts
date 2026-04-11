import type { TumblerProfile } from "@/data/tumblerProfiles";

export interface LidAssemblyPreset {
  family: "stanley-flowstate";
  lidShellRadiusScale: number;
  lidLowerRadiusScale: number;
  lidTopPlateauScale: number;
  topInsetRadiusScale: number;
  topInsetHeightMm: number;
  upperShoulderDropMm: number;
  lowerShoulderRiseMm: number;
  silverBandHeightMm: number;
  silverBandRadiusScale: number;
  gasketHeightMm: number;
  gasketGapMm: number;
  strawHeightMm: number;
  strawRadiusScale: number;
  lidLipHeightMm: number;
  lidLipInsetMm: number;
  grommetRadiusScale: number;
  grommetHeightMm: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isStanleyFlowStateFamily(profile: TumblerProfile | null | undefined): profile is TumblerProfile {
  if (!profile) return false;
  if (profile.brand.toLowerCase() !== "stanley") return false;
  const id = profile.id.toLowerCase();
  const model = profile.model.toLowerCase();
  return id.startsWith("stanley-quencher-") || model.includes("quencher h2.0");
}

export function buildTemplateLidPreset(args: {
  profile?: TumblerProfile | null;
  topRadiusMm: number;
  ringTopMm?: number | null;
  ringBottomMm?: number | null;
}): LidAssemblyPreset | null {
  const { profile, topRadiusMm, ringTopMm, ringBottomMm } = args;
  if (!isStanleyFlowStateFamily(profile)) return null;

  const measuredSilverBandHeightMm =
    typeof ringTopMm === "number" &&
    typeof ringBottomMm === "number" &&
    ringBottomMm > ringTopMm
      ? ringBottomMm - ringTopMm
      : null;

  return {
    family: "stanley-flowstate",
    lidShellRadiusScale: 1.004,
    lidLowerRadiusScale: 0.992,
    lidTopPlateauScale: 0.94,
    topInsetRadiusScale: 0.57,
    topInsetHeightMm: clamp(topRadiusMm * 0.0068, 0.18, 0.34),
    upperShoulderDropMm: clamp(topRadiusMm * 0.0065, 0.22, 0.44),
    lowerShoulderRiseMm: clamp(topRadiusMm * 0.0085, 0.24, 0.54),
    silverBandHeightMm: clamp(measuredSilverBandHeightMm ?? (topRadiusMm * 0.048), 3.2, 4.9),
    silverBandRadiusScale: 1.0005,
    gasketHeightMm: clamp(topRadiusMm * 0.0032, 0.09, 0.16),
    gasketGapMm: 0.06,
    strawHeightMm: clamp(topRadiusMm * 0.16, 5.8, 8.6),
    strawRadiusScale: 0.053,
    lidLipHeightMm: clamp(topRadiusMm * 0.0105, 0.26, 0.52),
    lidLipInsetMm: clamp(topRadiusMm * 0.018, 0.52, 0.96),
    grommetRadiusScale: 0.115,
    grommetHeightMm: clamp(topRadiusMm * 0.0045, 0.12, 0.2),
  };
}
