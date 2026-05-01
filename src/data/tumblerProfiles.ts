import type { TumblerGuideBand } from "../types/admin.ts";
import type { BedConfig } from "../types/admin.ts";
import { normalizeBedConfig } from "../types/admin.ts";

// ---------------------------------------------------------------------------
// Profile interface
// ---------------------------------------------------------------------------

export interface TumblerProfile {
  id: string;
  /** Display name shown in selects and badges */
  label: string;
  brand: string;
  model: string;
  capacityOz: number;
  /** Additional catalog tokens used for generic lookup matching. */
  lookupAliases?: string[];
  /** Official source domains for this profile family, used for source classification. */
  officialDomains?: string[];
  /** "straight" = constant diameter, "tapered" = conical body */
  shapeType: "straight" | "tapered";
  /** Overall outside diameter for straight cups (mm) */
  outsideDiameterMm?: number;
  /** Diameter at the wide (top) end — tapered cups (mm) */
  topDiameterMm?: number;
  /** Diameter at the narrow (base) end — tapered cups (mm) */
  bottomDiameterMm?: number;
  /** Total cup height including lid seat (mm) */
  overallHeightMm: number;
  /** Engraveable / printable height (between grooves, mm) */
  usableHeightMm: number;
  /** Does this model have an external carry handle? */
  hasHandle: boolean;
  /** Handle exclusion arc in degrees (0 = no handle). Defaults to 90 when hasHandle is true. */
  handleArcDeg?: number;
  /** Chuck rotary strongly preferred when true; roller when false */
  chuckRecommended: boolean;
  /** Visual groove/safe-zone guide overlaid on the bed canvas */
  guideBand?: TumblerGuideBand;
  /** Optional calibration notes shown to the user */
  notes?: string;
  /** Existing reviewed/product GLB asset for this profile, when available. */
  templateGlbPath?: string;
  /** Generic generated-model capability for profiles that support image-derived body-band diagnostics. */
  generatedModelPolicy?: {
    strategy: "body-band-lathe";
    fileStem?: string;
    fitDebugProfile?: {
      measurementBandRatio?: {
        top: number;
        height: number;
      };
      engravingGuideRatio?: number;
      minTraceWidthRatio?: number;
    };
  };
}

// ---------------------------------------------------------------------------
// Preset library — community-verified dimensions (all mm, converted from in)
// 1 inch = 25.4 mm
// ---------------------------------------------------------------------------

export const KNOWN_TUMBLER_PROFILES: TumblerProfile[] = [

  // ── YETI Rambler — straight cylindrical ──────────────────────────────────

  {
    id: "yeti-rambler-20",
    label: "YETI Rambler 20oz",
    brand: "YETI",
    model: "Rambler 20oz",
    capacityOz: 20,
    shapeType: "straight",
    outsideDiameterMm: 88,          // 3.46"
    overallHeightMm: 196,           // 7.72"
    usableHeightMm: 152,            // ~6" between grooves
    hasHandle: false,
    chuckRecommended: false,
    guideBand: {
      id: "yeti-rambler-20-band",
      label: "Safe Print Zone",
      upperGrooveYmm: 20,
      lowerGrooveYmm: 136,
    },
  },

  {
    id: "yeti-rambler-30",
    label: "YETI Rambler 30oz",
    brand: "YETI",
    model: "Rambler 30oz",
    capacityOz: 30,
    shapeType: "straight",
    outsideDiameterMm: 91,          // 3.58"
    overallHeightMm: 221,           // 8.70"
    usableHeightMm: 175,            // ~6.9"
    hasHandle: false,
    chuckRecommended: false,
    guideBand: {
      id: "yeti-rambler-30-main-band",
      label: "Main Print Band",
      upperGrooveYmm: 22,
      lowerGrooveYmm: 153,
    },
  },

  {
    id: "yeti-rambler-40",
    label: "YETI Rambler 40oz",
    brand: "YETI",
    model: "Rambler 40oz",
    capacityOz: 40,
    shapeType: "straight",
    outsideDiameterMm: 104,         // 4.09"
    overallHeightMm: 297,           // 11.69"
    usableHeightMm: 241,            // ~9.5"
    hasHandle: false,
    chuckRecommended: false,
    guideBand: {
      id: "yeti-rambler-40-band",
      label: "Safe Print Zone",
      upperGrooveYmm: 28,
      lowerGrooveYmm: 213,
    },
    templateGlbPath: "/models/templates/yeti-40oz-body.glb",
    notes: "Same body diameter as 30oz but taller. Roller OK; chuck gives cleaner registration.",
  },

  {
    id: "yeti-rambler-64",
    label: "YETI Rambler 64oz",
    brand: "YETI",
    model: "Rambler 64oz",
    capacityOz: 64,
    shapeType: "straight",
    outsideDiameterMm: 104,         // same body as 40oz
    overallHeightMm: 330,           // ~13"
    usableHeightMm: 279,            // ~11"
    hasHandle: false,
    chuckRecommended: false,
    guideBand: {
      id: "yeti-rambler-64-band",
      label: "Safe Print Zone",
      upperGrooveYmm: 28,
      lowerGrooveYmm: 251,
    },
    notes: "Tall — verify laser head clears the rotary motor at max travel.",
  },

  // ── Stanley Quencher H2.0 — tapered, with handle ─────────────────────────

  {
    id: "stanley-quencher-20",
    label: "Stanley Quencher 20oz",
    brand: "Stanley",
    model: "Quencher H2.0 20oz",
    capacityOz: 20,
    shapeType: "tapered",
    topDiameterMm: 95,              // 3.74" wide end (top)
    bottomDiameterMm: 73,           // 2.87" narrow end (base)
    overallHeightMm: 234,           // 9.21"
    usableHeightMm: 178,            // ~7.0"
    hasHandle: true,
    handleArcDeg: 90,
    chuckRecommended: true,
    guideBand: {
      id: "stanley-quencher-20-band",
      label: "Safe Print Zone",
      upperGrooveYmm: 24,
      lowerGrooveYmm: 154,
    },
    notes: "Chuck required — tapered body + handle prevents roller use. Apply taper warp correction.",
  },

  {
    id: "stanley-quencher-30",
    label: "Stanley Quencher 30oz",
    brand: "Stanley",
    model: "Quencher H2.0 30oz",
    capacityOz: 30,
    shapeType: "tapered",
    topDiameterMm: 106,             // 4.17"
    bottomDiameterMm: 74,           // 2.91"
    overallHeightMm: 254,           // 10.0"
    usableHeightMm: 200,            // ~7.9"
    hasHandle: true,
    handleArcDeg: 90,
    chuckRecommended: true,
    guideBand: {
      id: "stanley-quencher-30-band",
      label: "Safe Print Zone",
      upperGrooveYmm: 26,
      lowerGrooveYmm: 174,
    },
    notes: "Chuck required — tapered body + handle. Significant taper: top Ø106mm, base Ø74mm.",
  },

  {
    id: "stanley-quencher-40",
    label: "Stanley Quencher 40oz",
    brand: "Stanley",
    model: "Quencher H2.0 40oz",
    capacityOz: 40,
    shapeType: "tapered",
    topDiameterMm: 110,             // 4.33"
    bottomDiameterMm: 75,           // 2.95"
    overallHeightMm: 297,           // 11.69"
    usableHeightMm: 240,            // ~9.45"
    hasHandle: true,
    handleArcDeg: 90,
    chuckRecommended: true,
    guideBand: {
      id: "stanley-quencher-40-main-band",
      label: "Main Print Band",
      upperGrooveYmm: 28,
      lowerGrooveYmm: 212,
    },
    notes: "Chuck required — pronounced taper + handle. Most popular SKU; verify groove positions before production run.",
  },

  {
    id: "stanley-quencher-64",
    label: "Stanley Quencher 64oz",
    brand: "Stanley",
    model: "Quencher H2.0 64oz",
    capacityOz: 64,
    shapeType: "tapered",
    topDiameterMm: 120,             // 4.72"
    bottomDiameterMm: 80,           // 3.15"
    overallHeightMm: 356,           // 14.0"
    usableHeightMm: 295,            // ~11.6"
    hasHandle: true,
    handleArcDeg: 90,
    chuckRecommended: true,
    guideBand: {
      id: "stanley-quencher-64-band",
      label: "Safe Print Zone",
      upperGrooveYmm: 30,
      lowerGrooveYmm: 265,
    },
    notes: "Very tall — confirm Y-axis travel is sufficient before engraving.",
  },

  // ── Stanley IceFlow ───────────────────────────────────────────────────────

  {
    id: "stanley-iceflow-30",
    label: "Stanley IceFlow 30oz",
    brand: "Stanley",
    model: "IceFlow Flip Straw 30oz",
    capacityOz: 30,
    lookupAliases: ["flip straw", "ice flow", "iceflow"],
    officialDomains: ["stanley1913.com"],
    shapeType: "tapered",
    topDiameterMm: 88.9,            // Stanley official depth: 3.5"
    bottomDiameterMm: 76.2,         // estimated base diameter: 3.0"
    overallHeightMm: 218.4,         // Stanley official height: 8.6"
    usableHeightMm: 150,            // conservative printable band on the main body
    hasHandle: false,
    handleArcDeg: 0,
    chuckRecommended: true,
    guideBand: {
      id: "stanley-iceflow-30-band",
      label: "Safe Print Zone",
      upperGrooveYmm: 25,
      lowerGrooveYmm: 175,
    },
    generatedModelPolicy: {
      strategy: "body-band-lathe",
      fitDebugProfile: {
        measurementBandRatio: {
          top: 0.004,
          height: 0.035,
        },
        engravingGuideRatio: 0.5,
        minTraceWidthRatio: 0.12,
      },
    },
    notes: "Body-only Stanley IceFlow profile. The top carry handle and lid are ignored for GLB generation and mapping; the silver rim band is used as the body split.",
  },

  // ── RTIC — straight, no handle (similar profile to YETI) ─────────────────

  {
    id: "rtic-20",
    label: "RTIC 20oz Tumbler",
    brand: "RTIC",
    model: "20oz Tumbler",
    capacityOz: 20,
    lookupAliases: [
      "essential tumbler",
      "essential",
      "ceramic lined",
      "ceramic-lined",
      "navy",
      "rtic tumbler",
    ],
    officialDomains: ["rticoutdoors.com"],
    shapeType: "straight",
    outsideDiameterMm: 93,          // 3.66"
    overallHeightMm: 190,           // 7.48"
    usableHeightMm: 148,            // conservative 78% body band
    hasHandle: false,
    chuckRecommended: false,
    guideBand: {
      id: "rtic-20-band",
      label: "Safe Print Zone",
      upperGrooveYmm: 20,
      lowerGrooveYmm: 148,
    },
  },

  {
    id: "rtic-30",
    label: "RTIC 30oz Tumbler",
    brand: "RTIC",
    model: "30oz Tumbler",
    capacityOz: 30,
    lookupAliases: [
      "essential tumbler",
      "essential",
      "ceramic lined",
      "ceramic-lined",
      "rtic tumbler",
      "30oz",
    ],
    officialDomains: ["rticoutdoors.com"],
    shapeType: "straight",
    outsideDiameterMm: 90,          // 3.54"
    overallHeightMm: 226,           // 8.90"
    usableHeightMm: 178,            // ~7.0"
    hasHandle: false,
    chuckRecommended: false,
    guideBand: {
      id: "rtic-30-band",
      label: "Safe Print Zone",
      upperGrooveYmm: 22,
      lowerGrooveYmm: 156,
    },
  },

  {
    id: "rtic-40",
    label: "RTIC 40oz Tumbler",
    brand: "RTIC",
    model: "40oz Tumbler",
    capacityOz: 40,
    lookupAliases: [
      "essential tumbler",
      "essential",
      "ceramic lined",
      "ceramic-lined",
      "rtic tumbler",
      "40oz",
    ],
    officialDomains: ["rticoutdoors.com"],
    shapeType: "straight",
    outsideDiameterMm: 90,          // same body as 30oz, just taller
    overallHeightMm: 290,           // 11.42"
    usableHeightMm: 235,            // ~9.25"
    hasHandle: false,
    chuckRecommended: false,
    guideBand: {
      id: "rtic-40-band",
      label: "Safe Print Zone",
      upperGrooveYmm: 25,
      lowerGrooveYmm: 210,
    },
  },

  // ── Ozark Trail — straight, budget-friendly ───────────────────────────────

  {
    id: "ozark-trail-20",
    label: "Ozark Trail 20oz",
    brand: "Ozark Trail",
    model: "20oz Tumbler",
    capacityOz: 20,
    shapeType: "straight",
    outsideDiameterMm: 86,          // 3.39"
    overallHeightMm: 195,           // 7.68"
    usableHeightMm: 150,            // ~5.9"
    hasHandle: false,
    chuckRecommended: false,
    guideBand: {
      id: "ozark-trail-20-band",
      label: "Safe Print Zone",
      upperGrooveYmm: 20,
      lowerGrooveYmm: 133,
    },
    notes: "Slightly thinner powder coat than premium brands — reduce power by ~5%.",
  },

  {
    id: "ozark-trail-30",
    label: "Ozark Trail 30oz",
    brand: "Ozark Trail",
    model: "30oz Tumbler",
    capacityOz: 30,
    shapeType: "straight",
    outsideDiameterMm: 88,          // 3.46"
    overallHeightMm: 222,           // 8.74"
    usableHeightMm: 173,            // ~6.8"
    hasHandle: false,
    chuckRecommended: false,
    guideBand: {
      id: "ozark-trail-30-band",
      label: "Safe Print Zone",
      upperGrooveYmm: 22,
      lowerGrooveYmm: 151,
    },
    notes: "Slightly thinner powder coat — reduce power by ~5%.",
  },

  {
    id: "ozark-trail-40",
    label: "Ozark Trail 40oz",
    brand: "Ozark Trail",
    model: "40oz Tumbler",
    capacityOz: 40,
    shapeType: "straight",
    outsideDiameterMm: 90,          // 3.54"
    overallHeightMm: 285,           // 11.22"
    usableHeightMm: 228,            // ~8.98"
    hasHandle: false,
    chuckRecommended: false,
    guideBand: {
      id: "ozark-trail-40-band",
      label: "Safe Print Zone",
      upperGrooveYmm: 25,
      lowerGrooveYmm: 203,
    },
    notes: "Slightly thinner powder coat — reduce power by ~5%.",
  },

  // ── Simple Modern Summit — tapered, with straw ────────────────────────────

  {
    id: "simple-modern-summit-32",
    label: "Simple Modern Summit 32oz",
    brand: "Simple Modern",
    model: "Summit 32oz",
    capacityOz: 32,
    shapeType: "tapered",
    topDiameterMm: 93,              // 3.66"
    bottomDiameterMm: 73,           // 2.87"
    overallHeightMm: 254,           // 10.0"
    usableHeightMm: 200,            // ~7.9"
    hasHandle: false,
    chuckRecommended: true,
    guideBand: {
      id: "simple-modern-summit-32-band",
      label: "Safe Print Zone",
      upperGrooveYmm: 26,
      lowerGrooveYmm: 174,
    },
    notes: "Moderate taper — chuck recommended for clean registration.",
  },

  // ── Brumate Toddy — short mug with handle ─────────────────────────────────

  {
    id: "brumate-toddy-16",
    label: "Brumate Toddy 16oz",
    brand: "Brumate",
    model: "Toddy 16oz",
    capacityOz: 16,
    shapeType: "tapered",
    topDiameterMm: 102,             // 4.02" — wide mug shape
    bottomDiameterMm: 76,           // 2.99"
    overallHeightMm: 155,           // 6.10"
    usableHeightMm: 110,            // ~4.33"
    hasHandle: true,
    handleArcDeg: 90,
    chuckRecommended: true,
    guideBand: {
      id: "brumate-toddy-16-band",
      label: "Safe Print Zone",
      upperGrooveYmm: 18,
      lowerGrooveYmm: 92,
    },
    notes: "Short mug — verify laser head clearance with rotary legs. Chuck required.",
  },

  // ── Generic straight — no verified spec ───────────────────────────────────

  {
    id: "generic-straight-20",
    label: "Generic Straight 20oz",
    brand: "Generic",
    model: "20oz Straight",
    capacityOz: 20,
    shapeType: "straight",
    outsideDiameterMm: 87,
    overallHeightMm: 196,
    usableHeightMm: 152,
    hasHandle: false,
    chuckRecommended: false,
    notes: "Use calipers to verify actual diameter before engraving.",
  },

  {
    id: "generic-straight-30",
    label: "Generic Straight 30oz",
    brand: "Generic",
    model: "30oz Straight",
    capacityOz: 30,
    shapeType: "straight",
    outsideDiameterMm: 90,
    overallHeightMm: 222,
    usableHeightMm: 175,
    hasHandle: false,
    chuckRecommended: false,
    notes: "Use calipers to verify actual diameter before engraving.",
  },

  {
    id: "generic-straight-40",
    label: "Generic Straight 40oz",
    brand: "Generic",
    model: "40oz Straight",
    capacityOz: 40,
    shapeType: "straight",
    outsideDiameterMm: 90,
    overallHeightMm: 285,
    usableHeightMm: 228,
    hasHandle: false,
    chuckRecommended: false,
    notes: "Use calipers to verify actual diameter before engraving.",
  },

  {
    id: "generic-no-guides",
    label: "Generic / No Groove Profile",
    brand: "Generic",
    model: "Custom / Unknown",
    capacityOz: 0,
    shapeType: "straight",
    outsideDiameterMm: 90,
    overallHeightMm: 220,
    usableHeightMm: 175,
    hasHandle: false,
    chuckRecommended: false,
    notes: "Measure your tumbler with calipers and update the diameter and height fields.",
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export function getTumblerProfileById(id: string): TumblerProfile | null {
  return KNOWN_TUMBLER_PROFILES.find((profile) => profile.id === id) ?? null;
}

/**
 * Resolve handle arc degrees for a tumbler profile.
 * Returns explicit handleArcDeg if set, 90 if hasHandle is true, or 0.
 */
export function getProfileHandleArcDeg(profile: TumblerProfile | null | undefined): number {
  if (!profile) return 0;
  if (profile.handleArcDeg != null) return profile.handleArcDeg;
  return profile.hasHandle ? 90 : 0;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().trim();
}

export function findTumblerProfileIdForBrandModel(args: {
  brand: string | null | undefined;
  model: string | null | undefined;
  capacityOz?: number | null;
}): string | null {
  const brand = normalize(args.brand);
  const model = normalize(args.model);
  if (!brand || brand === "unknown") return null;

  const candidates = KNOWN_TUMBLER_PROFILES.filter((profile) => {
    const profileBrand = normalize(profile.brand);
    if (profileBrand === "generic") return false;
    if (profileBrand !== brand) return false;
    if (!model || model === "unknown") return true;
    const profileModel = normalize(profile.model);
    return profileModel.includes(model) || model.includes(profileModel);
  });

  if (candidates.length === 0) return null;

  // Prefer exact capacity match when available
  if (args.capacityOz && args.capacityOz > 0) {
    const capacityMatch = candidates.find((p) => p.capacityOz === args.capacityOz);
    if (capacityMatch) return capacityMatch.id;
  }

  return candidates[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// Apply a profile's full spec to a BedConfig
// ---------------------------------------------------------------------------

export function applyProfileToBedConfig(
  config: BedConfig,
  profile: TumblerProfile
): BedConfig {
  const isTapered = profile.shapeType === "tapered";
  const diameterMm = profile.outsideDiameterMm ??
    (isTapered
      ? ((profile.topDiameterMm ?? 90) + (profile.bottomDiameterMm ?? 75)) / 2
      : 90);

  return normalizeBedConfig({
    ...config,
    workspaceMode: "tumbler-wrap",
    tumblerProfileId: profile.id,
    tumblerBrand: profile.brand,
    tumblerModel: profile.model,
    tumblerCapacityOz: profile.capacityOz > 0 ? profile.capacityOz : undefined,
    tumblerShapeType: profile.shapeType,
    tumblerDiameterMm: diameterMm,
    tumblerOutsideDiameterMm: profile.outsideDiameterMm,
    tumblerTopDiameterMm: profile.topDiameterMm,
    tumblerBottomDiameterMm: profile.bottomDiameterMm,
    tumblerOverallHeightMm: profile.overallHeightMm,
    tumblerUsableHeightMm: profile.usableHeightMm,
    tumblerPrintableHeightMm: profile.usableHeightMm,
    tumblerHasHandle: profile.hasHandle,
    tumblerGuideBand: profile.guideBand,
    showTumblerGuideBand: Boolean(profile.guideBand),
  });
}
