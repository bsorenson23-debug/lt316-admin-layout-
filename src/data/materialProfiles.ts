import type { MaterialProfile } from "@/types/materials";

/**
 * Community-verified laser settings for common tumbler finishes.
 * All power values are percentages (0–100).
 * Speed is mm/s.
 * These are starting points — always test on scrap before a production run.
 */
export const KNOWN_MATERIAL_PROFILES: MaterialProfile[] = [

  // ── CO₂ · Powder Coat ─────────────────────────────────────────────────────

  {
    id: "co2-40w-powder-coat",
    label: "CO₂ 40W — Powder Coat",
    laserType: "co2",
    wattageRange: "35–45W",
    finishType: "powder-coat",
    powerPct: 30,
    maxPowerPct: 30,
    speedMmS: 250,
    lpi: 270,
    passes: 1,
    notes: "Good for most standard powder-coat colors. Reduce power 5% on budget/thin coats.",
  },

  {
    id: "co2-50w-powder-coat",
    label: "CO₂ 50W — Powder Coat",
    laserType: "co2",
    wattageRange: "45–55W",
    finishType: "powder-coat",
    powerPct: 25,
    maxPowerPct: 25,
    speedMmS: 300,
    lpi: 270,
    passes: 1,
    notes: "Most popular CO₂ wattage for tumbler shops. Covers YETI, RTIC, Ozark Trail at these settings.",
  },

  {
    id: "co2-60w-powder-coat",
    label: "CO₂ 60W — Powder Coat",
    laserType: "co2",
    wattageRange: "55–65W",
    finishType: "powder-coat",
    powerPct: 22,
    maxPowerPct: 22,
    speedMmS: 350,
    lpi: 270,
    passes: 1,
  },

  {
    id: "co2-80w-powder-coat",
    label: "CO₂ 80W — Powder Coat",
    laserType: "co2",
    wattageRange: "70–90W",
    finishType: "powder-coat",
    powerPct: 18,
    maxPowerPct: 18,
    speedMmS: 400,
    lpi: 270,
    passes: 1,
    notes: "Higher wattage tubes overshoot easily — keep power low and speed high.",
  },

  {
    id: "co2-100w-powder-coat",
    label: "CO₂ 100W — Powder Coat",
    laserType: "co2",
    wattageRange: "90–120W",
    finishType: "powder-coat",
    powerPct: 15,
    maxPowerPct: 15,
    speedMmS: 450,
    lpi: 270,
    passes: 1,
    notes: "Very high power — use minimum power mode in LightBurn and test first.",
  },

  // ── CO₂ · Raw Stainless ────────────────────────────────────────────────────

  {
    id: "co2-50w-raw-stainless",
    label: "CO₂ 50W — Raw Stainless",
    laserType: "co2",
    wattageRange: "45–55W",
    finishType: "raw-stainless",
    powerPct: 80,
    maxPowerPct: 80,
    speedMmS: 80,
    lpi: 500,
    passes: 2,
    notes: "Marking/oxidizing SS requires high power + slow speed. Results vary by alloy. Apply dry moly spray for better contrast.",
  },

  {
    id: "co2-80w-raw-stainless",
    label: "CO₂ 80W — Raw Stainless",
    laserType: "co2",
    wattageRange: "70–90W",
    finishType: "raw-stainless",
    powerPct: 65,
    maxPowerPct: 65,
    speedMmS: 100,
    lpi: 500,
    passes: 2,
    notes: "Use Dry Moly or CerMark spray for dark marks on SS with CO₂.",
  },

  // ── CO₂ · Matte / Painted ─────────────────────────────────────────────────

  {
    id: "co2-50w-matte",
    label: "CO₂ 50W — Matte Finish",
    laserType: "co2",
    wattageRange: "45–55W",
    finishType: "matte-finish",
    powerPct: 28,
    maxPowerPct: 28,
    speedMmS: 280,
    lpi: 270,
    passes: 1,
    notes: "Matte coatings often thinner than gloss powder coat — start at lower power.",
  },

  {
    id: "co2-50w-painted",
    label: "CO₂ 50W — Painted",
    laserType: "co2",
    wattageRange: "45–55W",
    finishType: "painted",
    powerPct: 35,
    maxPowerPct: 35,
    speedMmS: 250,
    lpi: 270,
    passes: 1,
    notes: "Spray paint is thinner than powder coat — use lower power. Results vary widely by paint brand.",
  },

  // ── Diode · Powder Coat ───────────────────────────────────────────────────

  {
    id: "diode-10w-powder-coat",
    label: "Diode 10W — Powder Coat",
    laserType: "diode",
    wattageRange: "8–12W optical",
    finishType: "powder-coat",
    powerPct: 75,
    maxPowerPct: 75,
    speedMmS: 50,
    lpi: 270,
    passes: 2,
    notes: "Diode lasers require slower speed for clean removal. xTool D1 Pro, Sculpfun S30 series.",
  },

  {
    id: "diode-20w-powder-coat",
    label: "Diode 20W — Powder Coat",
    laserType: "diode",
    wattageRange: "18–22W optical",
    finishType: "powder-coat",
    powerPct: 65,
    maxPowerPct: 65,
    speedMmS: 70,
    lpi: 270,
    passes: 1,
    notes: "xTool D1 Pro 20W, Sculpfun S30 Pro Max. Good powder-coat removal in 1 pass at these settings.",
  },

  // ── Fiber · Powder Coat ───────────────────────────────────────────────────

  {
    id: "fiber-20w-powder-coat",
    label: "Fiber 20W — Powder Coat",
    laserType: "fiber",
    wattageRange: "20W MOPA/JPT",
    finishType: "powder-coat",
    powerPct: 25,
    maxPowerPct: 25,
    speedMmS: 1200,
    lpi: 600,
    passes: 1,
    notes: "Fiber lasers excel at powder-coat removal. Very high speed, very fine detail. Adjust frequency (20–60kHz) for color.",
  },

  {
    id: "fiber-30w-powder-coat",
    label: "Fiber 30W — Powder Coat",
    laserType: "fiber",
    wattageRange: "30W MOPA/JPT",
    finishType: "powder-coat",
    powerPct: 20,
    maxPowerPct: 20,
    speedMmS: 1500,
    lpi: 600,
    passes: 1,
  },

  {
    id: "fiber-20w-raw-stainless",
    label: "Fiber 20W — Raw Stainless",
    laserType: "fiber",
    wattageRange: "20W MOPA/JPT",
    finishType: "raw-stainless",
    powerPct: 30,
    maxPowerPct: 30,
    speedMmS: 800,
    lpi: 500,
    passes: 1,
    notes: "MOPA fiber can produce color annealing on SS by varying frequency (20kHz=dark, 80kHz=gold, 200kHz=blue).",
  },

  // ── Anodized / Chrome ─────────────────────────────────────────────────────

  {
    id: "co2-50w-anodized",
    label: "CO₂ 50W — Anodized",
    laserType: "co2",
    wattageRange: "45–55W",
    finishType: "anodized",
    powerPct: 20,
    maxPowerPct: 20,
    speedMmS: 350,
    lpi: 300,
    passes: 1,
    notes: "Anodized aluminum requires light touch — the goal is to ablate the dye, not the aluminum itself.",
  },

  {
    id: "fiber-20w-anodized",
    label: "Fiber 20W — Anodized",
    laserType: "fiber",
    wattageRange: "20W MOPA/JPT",
    finishType: "anodized",
    powerPct: 15,
    maxPowerPct: 15,
    speedMmS: 2000,
    lpi: 600,
    passes: 1,
    notes: "Fiber is ideal for anodized — very clean ablation with fine detail.",
  },
];

export function getMaterialProfileById(id: string): MaterialProfile | null {
  return KNOWN_MATERIAL_PROFILES.find((p) => p.id === id) ?? null;
}

export function getMaterialProfilesForLaserType(
  laserType: MaterialProfile["laserType"] | null | undefined
): MaterialProfile[] {
  if (!laserType) return KNOWN_MATERIAL_PROFILES;
  return KNOWN_MATERIAL_PROFILES.filter((p) => p.laserType === laserType);
}
