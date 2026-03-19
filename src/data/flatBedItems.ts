// ---------------------------------------------------------------------------
// Flat Bed Item Library
// Physical dimensions for common items that lie flat on the laser bed.
// Material slug links to laserMaterialPresets for settings lookup.
// ---------------------------------------------------------------------------

export type FlatBedCategory =
  | "drinkware"
  | "plate-board"
  | "coaster-tile"
  | "sign-plaque"
  | "patch-tag"
  | "tech"
  | "other";

export const FLAT_BED_CATEGORY_LABELS: Record<FlatBedCategory, string> = {
  drinkware: "Drinkware",
  "plate-board": "Plates & Boards",
  "coaster-tile": "Coasters & Tiles",
  "sign-plaque": "Signs & Plaques",
  "patch-tag": "Patches & Tags",
  tech: "Tech Accessories",
  other: "Other",
};

export interface FlatBedItem {
  id: string;
  label: string;
  category: FlatBedCategory;
  /** Usable engrave width on the flat bed (mm) */
  widthMm: number;
  /** Usable engrave height on the flat bed (mm) */
  heightMm: number;
  /** Item thickness — affects focus height (mm) */
  thicknessMm: number;
  /** Material slug — links to laserMaterialPresets */
  material: string;
  materialLabel: string;
  /** Optional product hint for settings scoring */
  productHint?: string;
  notes?: string;
}

export const FLAT_BED_ITEMS: FlatBedItem[] = [

  // ── Drinkware ────────────────────────────────────────────────────────────

  {
    id: "tumbler-20oz-flat",
    label: "20oz Tumbler — Powder Coat",
    category: "drinkware",
    widthMm: 90,
    heightMm: 160,
    thicknessMm: 2,
    material: "powder-coat",
    materialLabel: "Powder Coat (Metal)",
    productHint: "tumbler",
    notes: "Lay flat — approximate engraveable area. Rotary preferred for wraparound.",
  },
  {
    id: "tumbler-30oz-flat",
    label: "30oz Tumbler — Powder Coat",
    category: "drinkware",
    widthMm: 90,
    heightMm: 200,
    thicknessMm: 2,
    material: "powder-coat",
    materialLabel: "Powder Coat (Metal)",
    productHint: "tumbler",
    notes: "Lay flat — approximate engraveable area.",
  },
  {
    id: "tumbler-40oz-flat",
    label: "40oz Tumbler — Powder Coat",
    category: "drinkware",
    widthMm: 95,
    heightMm: 240,
    thicknessMm: 2,
    material: "powder-coat",
    materialLabel: "Powder Coat (Metal)",
    productHint: "tumbler",
  },
  {
    id: "mug-11oz-ceramic",
    label: "11oz Ceramic Mug — Lay Flat",
    category: "drinkware",
    widthMm: 95,
    heightMm: 80,
    thicknessMm: 7,
    material: "ceramic",
    materialLabel: "Ceramic",
    notes: "Lay flat on side. Use rotary for full wrap.",
  },
  {
    id: "water-bottle-ss",
    label: "Stainless Water Bottle — Flat",
    category: "drinkware",
    widthMm: 72,
    heightMm: 180,
    thicknessMm: 2,
    material: "stainless-steel",
    materialLabel: "Stainless Steel",
  },

  // ── Plates & Boards ──────────────────────────────────────────────────────

  {
    id: "ss-plate-10in",
    label: "Stainless Plate 10\"",
    category: "plate-board",
    widthMm: 254,
    heightMm: 254,
    thicknessMm: 1.5,
    material: "stainless-steel",
    materialLabel: "Stainless Steel",
    productHint: "flat-plate",
  },
  {
    id: "ss-tray-12x8",
    label: "Stainless Serving Tray 12×8\"",
    category: "plate-board",
    widthMm: 305,
    heightMm: 203,
    thicknessMm: 1.5,
    material: "stainless-steel",
    materialLabel: "Stainless Steel",
    productHint: "flat-plate",
  },
  {
    id: "cutting-board-bamboo-12x8",
    label: "Bamboo Cutting Board 12×8\"",
    category: "plate-board",
    widthMm: 305,
    heightMm: 203,
    thicknessMm: 19,
    material: "wood-hard",
    materialLabel: "Wood — Hard",
    notes: "Bamboo engraves similar to hard wood.",
  },
  {
    id: "wood-charcuterie-14x10",
    label: "Wood Charcuterie Board 14×10\"",
    category: "plate-board",
    widthMm: 356,
    heightMm: 254,
    thicknessMm: 15,
    material: "wood-hard",
    materialLabel: "Wood — Hard",
  },
  {
    id: "acrylic-platter-12x8",
    label: "Acrylic Serving Platter 12×8\"",
    category: "plate-board",
    widthMm: 305,
    heightMm: 203,
    thicknessMm: 6,
    material: "acrylic-cast",
    materialLabel: "Acrylic — Cast",
  },

  // ── Coasters & Tiles ─────────────────────────────────────────────────────

  {
    id: "slate-coaster-4in",
    label: "Slate Coaster 4\" Round",
    category: "coaster-tile",
    widthMm: 101,
    heightMm: 101,
    thicknessMm: 8,
    material: "slate",
    materialLabel: "Slate",
  },
  {
    id: "slate-coaster-4in-square",
    label: "Slate Coaster 4\" Square",
    category: "coaster-tile",
    widthMm: 101,
    heightMm: 101,
    thicknessMm: 8,
    material: "slate",
    materialLabel: "Slate",
  },
  {
    id: "ceramic-tile-4x4",
    label: "Ceramic Tile 4×4\"",
    category: "coaster-tile",
    widthMm: 101,
    heightMm: 101,
    thicknessMm: 6,
    material: "ceramic",
    materialLabel: "Ceramic",
  },
  {
    id: "ceramic-tile-6x6",
    label: "Ceramic Tile 6×6\"",
    category: "coaster-tile",
    widthMm: 152,
    heightMm: 152,
    thicknessMm: 6,
    material: "ceramic",
    materialLabel: "Ceramic",
  },
  {
    id: "hardwood-coaster-4in",
    label: "Hardwood Coaster 4\" Round",
    category: "coaster-tile",
    widthMm: 101,
    heightMm: 101,
    thicknessMm: 9,
    material: "wood-hard",
    materialLabel: "Wood — Hard",
  },
  {
    id: "acrylic-coaster-4in",
    label: "Acrylic Coaster 4\" Round",
    category: "coaster-tile",
    widthMm: 101,
    heightMm: 101,
    thicknessMm: 4,
    material: "acrylic-cast",
    materialLabel: "Acrylic — Cast",
  },

  // ── Signs & Plaques ──────────────────────────────────────────────────────

  {
    id: "acrylic-sign-3x8",
    label: "Acrylic Sign 3×8\"",
    category: "sign-plaque",
    widthMm: 76,
    heightMm: 203,
    thicknessMm: 3,
    material: "acrylic-cast",
    materialLabel: "Acrylic — Cast",
  },
  {
    id: "acrylic-sign-4x6",
    label: "Acrylic Sign 4×6\"",
    category: "sign-plaque",
    widthMm: 101,
    heightMm: 152,
    thicknessMm: 3,
    material: "acrylic-cast",
    materialLabel: "Acrylic — Cast",
  },
  {
    id: "wood-plaque-4x6",
    label: "Wood Plaque 4×6\"",
    category: "sign-plaque",
    widthMm: 101,
    heightMm: 152,
    thicknessMm: 6,
    material: "wood-hard",
    materialLabel: "Wood — Hard",
  },
  {
    id: "wood-plaque-5x7",
    label: "Wood Plaque 5×7\"",
    category: "sign-plaque",
    widthMm: 127,
    heightMm: 178,
    thicknessMm: 6,
    material: "wood-hard",
    materialLabel: "Wood — Hard",
  },
  {
    id: "mdf-sign-12x6",
    label: "MDF Sign 12×6\"",
    category: "sign-plaque",
    widthMm: 305,
    heightMm: 152,
    thicknessMm: 6,
    material: "mdf",
    materialLabel: "MDF",
  },
  {
    id: "brass-nameplate-3x1",
    label: "Brass Nameplate 3×1\"",
    category: "sign-plaque",
    widthMm: 76,
    heightMm: 25,
    thicknessMm: 1.5,
    material: "brass",
    materialLabel: "Brass",
  },
  {
    id: "aluminum-sign-8x3",
    label: "Anodized Aluminum Sign 8×3\"",
    category: "sign-plaque",
    widthMm: 203,
    heightMm: 76,
    thicknessMm: 1.6,
    material: "anodized-aluminum",
    materialLabel: "Anodized Aluminum",
  },
  {
    id: "ss-sign-8x3",
    label: "Stainless Steel Sign 8×3\"",
    category: "sign-plaque",
    widthMm: 203,
    heightMm: 76,
    thicknessMm: 1.5,
    material: "stainless-steel",
    materialLabel: "Stainless Steel",
  },

  // ── Patches & Tags ───────────────────────────────────────────────────────

  {
    id: "leather-patch-3x2",
    label: "Leather Patch 3×2\"",
    category: "patch-tag",
    widthMm: 76,
    heightMm: 51,
    thicknessMm: 3,
    material: "leather-natural",
    materialLabel: "Leather — Natural",
  },
  {
    id: "pu-leather-patch-3x2",
    label: "PU Leather Patch 3×2\"",
    category: "patch-tag",
    widthMm: 76,
    heightMm: 51,
    thicknessMm: 3,
    material: "leather-synthetic",
    materialLabel: "Leather — Synthetic",
  },
  {
    id: "dog-tag-ss",
    label: "Stainless Dog Tag",
    category: "patch-tag",
    widthMm: 50,
    heightMm: 28,
    thicknessMm: 1.2,
    material: "stainless-steel",
    materialLabel: "Stainless Steel",
  },
  {
    id: "anodized-keychain",
    label: "Anodized Aluminum Keychain",
    category: "patch-tag",
    widthMm: 60,
    heightMm: 28,
    thicknessMm: 1.6,
    material: "anodized-aluminum",
    materialLabel: "Anodized Aluminum",
  },
  {
    id: "business-card-aluminum",
    label: "Metal Business Card (Anodized)",
    category: "patch-tag",
    widthMm: 89,
    heightMm: 51,
    thicknessMm: 0.8,
    material: "anodized-aluminum",
    materialLabel: "Anodized Aluminum",
  },
  {
    id: "business-card-ss",
    label: "Metal Business Card (Stainless)",
    category: "patch-tag",
    widthMm: 89,
    heightMm: 51,
    thicknessMm: 0.5,
    material: "stainless-steel",
    materialLabel: "Stainless Steel",
  },

  // ── Tech Accessories ─────────────────────────────────────────────────────

  {
    id: "phone-case-flat",
    label: "Phone Case (Flat, ABS)",
    category: "tech",
    widthMm: 78,
    heightMm: 160,
    thicknessMm: 12,
    material: "plastic-abs",
    materialLabel: "Plastic — ABS",
  },
  {
    id: "laptop-sticker-blank",
    label: "Laptop Sticker Blank (Acrylic)",
    category: "tech",
    widthMm: 80,
    heightMm: 80,
    thicknessMm: 3,
    material: "acrylic-cast",
    materialLabel: "Acrylic — Cast",
  },
  {
    id: "ss-card-wallet",
    label: "Stainless Card / Wallet Insert",
    category: "tech",
    widthMm: 85,
    heightMm: 54,
    thicknessMm: 0.8,
    material: "stainless-steel",
    materialLabel: "Stainless Steel",
  },

  // ── Other ────────────────────────────────────────────────────────────────

  {
    id: "glass-ornament-3in",
    label: "Glass Ornament 3\" Round",
    category: "other",
    widthMm: 76,
    heightMm: 76,
    thicknessMm: 4,
    material: "glass",
    materialLabel: "Glass",
  },
  {
    id: "rubber-stamp-blank",
    label: "Rubber Stamp Blank",
    category: "other",
    widthMm: 60,
    heightMm: 40,
    thicknessMm: 8,
    material: "rubber",
    materialLabel: "Rubber",
  },
  {
    id: "paper-card-a2",
    label: "Paper Card / A2 Envelope",
    category: "other",
    widthMm: 140,
    heightMm: 108,
    thicknessMm: 0.5,
    material: "paper",
    materialLabel: "Paper / Cardstock",
  },
  {
    id: "fabric-patch-4x4",
    label: "Fabric Patch 4×4\"",
    category: "other",
    widthMm: 101,
    heightMm: 101,
    thicknessMm: 3,
    material: "fabric",
    materialLabel: "Fabric",
  },
];

/** All unique categories present in the library, in display order */
export const FLAT_BED_CATEGORIES: FlatBedCategory[] = [
  "drinkware",
  "plate-board",
  "coaster-tile",
  "sign-plaque",
  "patch-tag",
  "tech",
  "other",
];
