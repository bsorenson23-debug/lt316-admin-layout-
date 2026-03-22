export interface ProductTemplateDimensions {
  diameterMm: number;
  printHeightMm: number;
  templateWidthMm: number; // computed: Math.PI * diameterMm
  handleArcDeg: number; // 0 = no handle
  taperCorrection: "none" | "top-narrow" | "bottom-narrow";
}

export interface ProductTemplateLaserSettings {
  power: number; // percent 0-100
  speed: number; // mm/s
  frequency: number; // kHz
  lineInterval: number; // mm
  materialProfileId: string;
  rotaryPresetId: string;
}

export interface ProductTemplate {
  id: string; // crypto.randomUUID()
  name: string; // "YETI Rambler 40oz"
  brand: string;
  capacity: string;
  laserType: "fiber" | "co2" | "diode";
  productType: "tumbler" | "mug" | "bottle" | "flat";
  thumbnailDataUrl: string; // base64 120x120 PNG
  glbPath: string; // path in /public/models/
  dimensions: ProductTemplateDimensions;
  laserSettings: ProductTemplateLaserSettings;
  createdAt: string; // ISO string
  updatedAt: string;
  builtIn: boolean; // true = shipped with app, false = user-created
}

export interface ProductTemplateStore {
  templates: ProductTemplate[];
  lastUpdated: string;
}
