// Admin-approved 3D model templates.
// Place .glb files in /public/models/templates/
// Place thumbnail .png files in /public/models/thumbnails/  (optional — icon is the fallback)

export interface GlbTemplate {
  id: string;
  /** Short display label shown under the thumbnail */
  label: string;
  /** Path relative to /public — empty when no approved GLB has been added yet */
  glbPath: string;
  /** Optional thumbnail image — falls back to icon if missing/404 */
  thumbnailPath?: string;
  /** Emoji shown when no thumbnail is available */
  icon: string;
  /** Which workspace modes this template applies to */
  workspaceModes: ("tumbler-wrap" | "flat-bed")[];
}

export const GLB_TEMPLATES: GlbTemplate[] = [
  // ── Tumbler / rotary ──────────────────────────────────────────────────────
  {
    id: "tumbler-20oz-skinny",
    label: "20oz Skinny",
    glbPath: "",
    thumbnailPath: "/models/thumbnails/tumbler-20oz-skinny.png",
    icon: "🥤",
    workspaceModes: ["tumbler-wrap"],
  },
  {
    id: "tumbler-30oz",
    label: "30oz Tumbler",
    glbPath: "",
    thumbnailPath: "/models/thumbnails/tumbler-30oz.png",
    icon: "🥤",
    workspaceModes: ["tumbler-wrap"],
  },
  {
    id: "tumbler-40oz",
    label: "40oz Tumbler",
    glbPath: "/models/templates/yeti-40oz-body.glb",
    thumbnailPath: "/models/thumbnails/tumbler-40oz.png",
    icon: "🥤",
    workspaceModes: ["tumbler-wrap"],
  },
  {
    id: "tumbler-wine",
    label: "Wine Tumbler",
    glbPath: "",
    thumbnailPath: "/models/thumbnails/tumbler-wine.png",
    icon: "🍷",
    workspaceModes: ["tumbler-wrap"],
  },
  {
    id: "mug-12oz",
    label: "12oz Mug",
    glbPath: "",
    thumbnailPath: "/models/thumbnails/mug-12oz.png",
    icon: "☕",
    workspaceModes: ["tumbler-wrap"],
  },
  {
    id: "bottle-24oz",
    label: "24oz Bottle",
    glbPath: "",
    thumbnailPath: "/models/thumbnails/bottle-24oz.png",
    icon: "🍶",
    workspaceModes: ["tumbler-wrap"],
  },

  // ── Flat bed ──────────────────────────────────────────────────────────────
  {
    id: "flat-phone-case",
    label: "Phone Case",
    glbPath: "",
    thumbnailPath: "/models/thumbnails/phone-case.png",
    icon: "📱",
    workspaceModes: ["flat-bed"],
  },
  {
    id: "flat-wood-plank",
    label: "Wood Plank",
    glbPath: "",
    thumbnailPath: "/models/thumbnails/wood-plank.png",
    icon: "🪵",
    workspaceModes: ["flat-bed"],
  },
  {
    id: "flat-dog-tag",
    label: "Dog Tag",
    glbPath: "",
    thumbnailPath: "/models/thumbnails/dog-tag.png",
    icon: "🏷",
    workspaceModes: ["flat-bed"],
  },
  {
    id: "flat-slate",
    label: "Slate Tile",
    glbPath: "",
    thumbnailPath: "/models/thumbnails/slate-tile.png",
    icon: "◼",
    workspaceModes: ["flat-bed"],
  },
  {
    id: "flat-keychain",
    label: "Keychain",
    glbPath: "",
    thumbnailPath: "/models/thumbnails/keychain.png",
    icon: "🔑",
    workspaceModes: ["flat-bed"],
  },
  {
    id: "flat-tumbler-blank",
    label: "Tumbler Blank",
    glbPath: "",
    thumbnailPath: "/models/thumbnails/tumbler-blank.png",
    icon: "⬛",
    workspaceModes: ["flat-bed"],
  },
];
