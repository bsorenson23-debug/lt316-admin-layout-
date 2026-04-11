import type { TumblerProfile } from "@/data/tumblerProfiles";
import type { EditableHandlePreview } from "@/lib/editableHandleGeometry";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isStanleyQuencherFamily(profile: TumblerProfile | null | undefined): profile is TumblerProfile {
  if (!profile) return false;
  if (profile.brand.toLowerCase() !== "stanley") return false;
  const id = profile.id.toLowerCase();
  const model = profile.model.toLowerCase();
  return (
    id.startsWith("stanley-quencher-") ||
    id === "stanley-protour-40" ||
    model.includes("quencher") ||
    model.includes("protour")
  );
}

export function buildTemplateHandlePreset(args: {
  profile?: TumblerProfile | null;
  bodyTopFromOverallMm: number;
  bodyBottomFromOverallMm: number;
  effectiveCylinderDiameterMm: number;
  ringBottomMm?: number | null;
  fallbackTubeDiameterMm: number;
}): EditableHandlePreview | null {
  const {
    profile,
    bodyTopFromOverallMm,
    bodyBottomFromOverallMm,
    effectiveCylinderDiameterMm,
    ringBottomMm,
    fallbackTubeDiameterMm,
  } = args;
  if (!isStanleyQuencherFamily(profile)) return null;

  const bodyHeight = Math.max(1, bodyBottomFromOverallMm - bodyTopFromOverallMm);
  const isLargeFamily = profile.capacityOz >= 64;
  const tubeDiameterMm = round2(
    clamp(
      Math.max(
        fallbackTubeDiameterMm,
        effectiveCylinderDiameterMm * (isLargeFamily ? 0.16 : 0.14),
      ),
      8,
      isLargeFamily ? 20 : 18,
    ),
  );
  const targetOuterSpanMm = round2(
    clamp(
      typeof profile.handleSpanMm === "number" && profile.handleSpanMm > effectiveCylinderDiameterMm
        ? profile.handleSpanMm - effectiveCylinderDiameterMm
        : effectiveCylinderDiameterMm * (isLargeFamily ? 0.5 : 0.48),
      effectiveCylinderDiameterMm * 0.38,
      effectiveCylinderDiameterMm * (isLargeFamily ? 0.58 : 0.54),
    ),
  );
  const reachMm = round2(
    Math.max(14, targetOuterSpanMm - tubeDiameterMm),
  );

  const topSeed = Math.max(
    typeof ringBottomMm === "number" ? ringBottomMm + 6 : bodyTopFromOverallMm,
    bodyTopFromOverallMm + (bodyHeight * (isLargeFamily ? 0.06 : 0.07)),
  );
  const bottomSeed = bodyTopFromOverallMm + (bodyHeight * (isLargeFamily ? 0.72 : 0.66));
  const topFromOverallMm = round2(
    clamp(topSeed, bodyTopFromOverallMm, bodyBottomFromOverallMm - 56),
  );
  const bottomFromOverallMm = round2(
    clamp(bottomSeed, topFromOverallMm + 72, bodyBottomFromOverallMm - 18),
  );
  const cornerRadiusMm = round2(
    clamp((bottomFromOverallMm - topFromOverallMm) * 0.2, 16, isLargeFamily ? 30 : 24),
  );
  const cornerReachMm = round2(Math.max(8, reachMm * 0.96));
  const transitionReachMm = round2(Math.max(6, reachMm * 0.66));

  return {
    side: "right",
    topFromOverallMm,
    bottomFromOverallMm,
    outerTopFromOverallMm: topFromOverallMm,
    outerBottomFromOverallMm: bottomFromOverallMm,
    reachMm,
    outerOffsetMm: tubeDiameterMm,
    upperCornerFromOverallMm: round2(topFromOverallMm + cornerRadiusMm),
    lowerCornerFromOverallMm: round2(bottomFromOverallMm - cornerRadiusMm),
    upperCornerReachMm: cornerReachMm,
    lowerCornerReachMm: cornerReachMm,
    upperTransitionFromOverallMm: topFromOverallMm,
    lowerTransitionFromOverallMm: bottomFromOverallMm,
    upperTransitionReachMm: transitionReachMm,
    lowerTransitionReachMm: transitionReachMm,
    tubeDiameterMm,
  };
}
