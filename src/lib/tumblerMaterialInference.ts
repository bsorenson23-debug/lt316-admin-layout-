import { KNOWN_MATERIAL_PROFILES } from "../data/materialProfiles.ts";
import type { TumblerFinish } from "../types/materials.ts";
import type { ProductTemplate } from "../types/productTemplate.ts";

export interface ResolveTumblerMaterialSetupArgs {
  laserType: ProductTemplate["laserType"] | null;
  explicitFinishType?: TumblerFinish | null;
  materialSlug?: string | null;
  materialLabel?: string | null;
  bodyColorHex?: string | null;
  rimColorHex?: string | null;
  textHints?: Array<string | null | undefined>;
}

export interface ResolvedTumblerMaterialSetup {
  laserType: ProductTemplate["laserType"] | null;
  materialSlug: string | null;
  materialLabel: string | null;
  materialFinishType: TumblerFinish | null;
  materialProfileId: string | null;
  materialProfileLabel: string | null;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9.\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferTumblerFinishFromText(
  value: string,
): { materialSlug: string; materialLabel: string; laserType: ProductTemplate["laserType"] | null } | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (/\bpowder\b|\bpowder coat\b|\bpowder coated\b/.test(normalized)) {
    return { materialSlug: "powder-coat", materialLabel: "Powder Coat", laserType: "co2" };
  }
  if (/\braw stainless\b|\bstainless\b|\buncoated\b|\bsteel\b/.test(normalized)) {
    return { materialSlug: "stainless-steel", materialLabel: "Stainless Steel", laserType: "fiber" };
  }
  if (/\banodized\b/.test(normalized)) {
    return { materialSlug: "anodized-aluminum", materialLabel: "Anodized Aluminum", laserType: "fiber" };
  }
  if (/\bchrome\b/.test(normalized)) {
    return { materialSlug: "painted-metal", materialLabel: "Chrome-Plated Metal", laserType: "co2" };
  }
  if (/\bmatte\b/.test(normalized)) {
    return { materialSlug: "painted-metal", materialLabel: "Matte Finish Metal", laserType: "co2" };
  }
  if (/\bpainted\b|\bpaint coat\b/.test(normalized)) {
    return { materialSlug: "painted-metal", materialLabel: "Painted Metal", laserType: "co2" };
  }
  return null;
}

function materialFromFinishType(
  finishType: TumblerFinish | null | undefined,
): { materialSlug: string; materialLabel: string; laserType: ProductTemplate["laserType"] | null } | null {
  switch (finishType) {
    case "powder-coat":
      return { materialSlug: "powder-coat", materialLabel: "Powder Coat", laserType: "co2" };
    case "raw-stainless":
      return { materialSlug: "stainless-steel", materialLabel: "Stainless Steel", laserType: "fiber" };
    case "painted":
      return { materialSlug: "painted-metal", materialLabel: "Painted Metal", laserType: "co2" };
    case "anodized":
      return { materialSlug: "anodized-aluminum", materialLabel: "Anodized Aluminum", laserType: "fiber" };
    case "chrome-plated":
      return { materialSlug: "painted-metal", materialLabel: "Chrome-Plated Metal", laserType: "co2" };
    case "matte-finish":
      return { materialSlug: "painted-metal", materialLabel: "Matte Finish Metal", laserType: "co2" };
    default:
      return null;
  }
}

function inferFinishTypeFromMaterial(args: {
  materialSlug?: string | null;
  materialLabel?: string | null;
  explicitFinishType?: TumblerFinish | null;
  textHints?: Array<string | null | undefined>;
}): TumblerFinish | null {
  if (args.explicitFinishType) return args.explicitFinishType;

  const fromMaterial = normalizeText(`${args.materialSlug ?? ""} ${args.materialLabel ?? ""}`);
  if (/\bpowder\b/.test(fromMaterial)) return "powder-coat";
  if (/\bstainless\b|\buncoated\b|\bsteel\b/.test(fromMaterial)) return "raw-stainless";
  if (/\banodized\b/.test(fromMaterial)) return "anodized";
  if (/\bchrome\b/.test(fromMaterial)) return "chrome-plated";
  if (/\bmatte\b/.test(fromMaterial)) return "matte-finish";
  if (/\bpainted\b|\bpaint\b/.test(fromMaterial)) return "painted";

  const fromHints = inferTumblerFinishFromText((args.textHints ?? []).filter(Boolean).join(" "));
  if (!fromHints) return null;

  switch (fromHints.materialSlug) {
    case "powder-coat":
      return "powder-coat";
    case "stainless-steel":
      return "raw-stainless";
    case "anodized-aluminum":
      return "anodized";
    case "painted-metal":
      if (fromHints.materialLabel === "Chrome-Plated Metal") return "chrome-plated";
      if (fromHints.materialLabel === "Matte Finish Metal") return "matte-finish";
      return "painted";
    default:
      return null;
  }
}

function looksMetallic(hex: string | null | undefined): boolean {
  if (!hex || !/^#?[0-9a-f]{6}$/i.test(hex)) return false;
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const channelSpread = Math.max(red, green, blue) - Math.min(red, green, blue);
  const average = (red + green + blue) / 3;
  return channelSpread <= 18 && average >= 110;
}

function pickPreferredMaterialProfile(
  laserType: ProductTemplate["laserType"] | null | undefined,
  finishType: TumblerFinish | null | undefined,
): { id: string; label: string } | null {
  if (!laserType || !finishType) return null;

  const matches = KNOWN_MATERIAL_PROFILES.filter((profile) => (
    profile.laserType === laserType && profile.finishType === finishType
  ));
  if (matches.length === 0) return null;

  const preferredWattage = laserType === "co2" ? "50W" : "20W";
  const preferred = matches.find((profile) => profile.label.includes(preferredWattage)) ?? matches[0];
  return { id: preferred.id, label: preferred.label };
}

export function resolveTumblerMaterialSetup(
  args: ResolveTumblerMaterialSetupArgs,
): ResolvedTumblerMaterialSetup {
  let materialFinishType = inferFinishTypeFromMaterial({
    materialSlug: args.materialSlug,
    materialLabel: args.materialLabel,
    explicitFinishType: args.explicitFinishType ?? null,
    textHints: args.textHints,
  });

  let finishMaterial = materialFromFinishType(materialFinishType);
  if (!finishMaterial && looksMetallic(args.bodyColorHex) && looksMetallic(args.rimColorHex)) {
    materialFinishType = "raw-stainless";
    finishMaterial = materialFromFinishType(materialFinishType);
  } else if (!finishMaterial && args.bodyColorHex && looksMetallic(args.rimColorHex)) {
    materialFinishType = "powder-coat";
    finishMaterial = materialFromFinishType(materialFinishType);
  }

  const inferredTextMaterial = inferTumblerFinishFromText((args.textHints ?? []).filter(Boolean).join(" "));
  const resolvedLaserType = args.laserType ?? finishMaterial?.laserType ?? inferredTextMaterial?.laserType ?? null;
  const materialProfile = pickPreferredMaterialProfile(resolvedLaserType, materialFinishType);

  return {
    laserType: resolvedLaserType,
    materialSlug: args.materialSlug ?? finishMaterial?.materialSlug ?? inferredTextMaterial?.materialSlug ?? null,
    materialLabel: args.materialLabel ?? finishMaterial?.materialLabel ?? inferredTextMaterial?.materialLabel ?? null,
    materialFinishType,
    materialProfileId: materialProfile?.id ?? null,
    materialProfileLabel: materialProfile?.label ?? null,
  };
}
