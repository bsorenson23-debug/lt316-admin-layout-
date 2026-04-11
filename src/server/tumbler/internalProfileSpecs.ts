import type { TumblerSpecCandidate } from "../../types/tumblerAutoSize.ts";

interface InternalProfileSpec {
  id: string;
  brand: string;
  model: string;
  capacityOz: number | null;
  hasHandle: boolean | null;
  shapeType: "straight" | "tapered" | "unknown";
  overallHeightMm: number | null;
  outsideDiameterMm: number | null;
  topDiameterMm: number | null;
  bottomDiameterMm: number | null;
  usableHeightMm: number | null;
  tags: string[];
}

const INTERNAL_PROFILES: InternalProfileSpec[] = [
  {
    id: "internal-yeti-rambler-30",
    brand: "YETI",
    model: "Rambler 30oz",
    capacityOz: 30,
    hasHandle: false,
    shapeType: "tapered",
    overallHeightMm: 198.1,
    outsideDiameterMm: 87.9,
    topDiameterMm: 101.6,
    bottomDiameterMm: 69.9,
    usableHeightMm: 160,
    tags: ["yeti", "rambler", "30"],
  },
  {
    id: "internal-stanley-quencher-40",
    brand: "Stanley",
    model: "Quencher H2.0 40oz",
    capacityOz: 40,
    hasHandle: true,
    shapeType: "tapered",
    overallHeightMm: 273.8,
    outsideDiameterMm: 99.8,
    topDiameterMm: 99.8,
    bottomDiameterMm: 78.7,
    usableHeightMm: 216,
    tags: ["stanley", "quencher", "40", "h2.0"],
  },
];

function normalize(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().trim();
}

function toCandidate(profile: InternalProfileSpec): TumblerSpecCandidate {
  return {
    title: `Internal profile: ${profile.brand} ${profile.model}`,
    url: `internal://tumbler-profile/${profile.id}`,
    kind: "internal",
    brand: profile.brand,
    model: profile.model,
    capacityOz: profile.capacityOz,
    hasHandle: profile.hasHandle,
    shapeType: profile.shapeType,
    overallHeight: profile.overallHeightMm,
    outsideDiameter: profile.outsideDiameterMm,
    topDiameter: profile.topDiameterMm,
    bottomDiameter: profile.bottomDiameterMm,
    usableHeight: profile.usableHeightMm,
    snippet: "Internal validated tumbler profile.",
    confidence: 0.98,
  };
}

export function lookupInternalTumblerProfileSpecs(args: {
  brand: string;
  model?: string | null;
  capacityOz?: number | null;
}): TumblerSpecCandidate[] {
  const brand = normalize(args.brand);
  const model = normalize(args.model ?? null);
  const capacity = args.capacityOz ?? null;

  const ranked = INTERNAL_PROFILES.map((profile) => {
    let score = 0;
    if (normalize(profile.brand) === brand) score += 4;
    if (model) {
      const modelText = normalize(profile.model);
      if (modelText.includes(model) || model.includes(modelText)) score += 3;
      for (const token of profile.tags) {
        if (model.includes(token)) score += 0.5;
      }
    }
    if (capacity && profile.capacityOz === capacity) score += 2;
    return { profile, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, 2).map((entry) => toCandidate(entry.profile));
}
