import type { TumblerGuideBand } from "../types/admin";

export interface TumblerProfile {
  id: string;
  label: string;
  brand: string;
  model: string;
  guideBand?: TumblerGuideBand;
}

export const KNOWN_TUMBLER_PROFILES: TumblerProfile[] = [
  {
    id: "yeti-rambler-30",
    label: "YETI Rambler 30oz",
    brand: "YETI",
    model: "Rambler 30oz",
    guideBand: {
      id: "yeti-rambler-30-main-band",
      label: "Main Print Band",
      upperGrooveYmm: 22,
      lowerGrooveYmm: 132,
    },
  },
  {
    id: "stanley-quencher-40",
    label: "Stanley Quencher 40oz",
    brand: "Stanley",
    model: "Quencher H2.0 40oz",
    guideBand: {
      id: "stanley-quencher-40-main-band",
      label: "Main Print Band",
      upperGrooveYmm: 28,
      lowerGrooveYmm: 160,
    },
  },
  {
    id: "generic-no-guides",
    label: "Generic / No Groove Profile",
    brand: "Generic",
    model: "No guides",
  },
];

export function getTumblerProfileById(id: string): TumblerProfile | null {
  return KNOWN_TUMBLER_PROFILES.find((profile) => profile.id === id) ?? null;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().trim();
}

export function findTumblerProfileIdForBrandModel(args: {
  brand: string | null | undefined;
  model: string | null | undefined;
}): string | null {
  const brand = normalize(args.brand);
  const model = normalize(args.model);
  if (!brand || brand === "unknown") return null;

  const match = KNOWN_TUMBLER_PROFILES.find((profile) => {
    const profileBrand = normalize(profile.brand);
    if (profileBrand !== brand) return false;
    if (!model || model === "unknown") return true;
    const profileModel = normalize(profile.model);
    return profileModel.includes(model) || model.includes(profileModel);
  });

  return match?.id ?? null;
}
