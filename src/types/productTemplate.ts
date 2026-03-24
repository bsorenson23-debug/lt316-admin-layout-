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

export interface TumblerMapping {
  /** Y-axis rotation (radians) that makes the front face point toward the camera */
  frontFaceRotation: number;
  /** Handle center angle in radians (frontFaceRotation + PI) */
  handleCenterAngle: number;
  /** Handle arc width in degrees, as confirmed during mapping */
  handleArcDeg: number;
  /** Whether this template has been mapped */
  isMapped: boolean;
  /** Top margin in mm trimmed from printable area */
  printableTopY?: number;
  /** Bottom margin in mm trimmed from printable area */
  printableBottomY?: number;
  /** Horizontal calibration offset in mm — adjusts Decal angle on the 3D preview */
  calibrationOffsetX?: number;
  /** Vertical calibration offset in mm — adjusts Decal Y on the 3D preview */
  calibrationOffsetY?: number;
  /** Rotation calibration in degrees — rotates the Decal around the cylinder */
  calibrationRotation?: number;
}

export interface ProductTemplate {
  id: string; // crypto.randomUUID()
  name: string; // "YETI Rambler 40oz"
  brand: string;
  capacity: string;
  laserType: "fiber" | "co2" | "diode";
  productType: "tumbler" | "mug" | "bottle" | "flat";
  thumbnailDataUrl: string; // base64 120x120 PNG
  /** Full-resolution product photo (max 1024px, JPEG base64) for grid overlay */
  productPhotoFullUrl?: string;
  glbPath: string; // path in /public/models/
  dimensions: ProductTemplateDimensions;
  laserSettings: ProductTemplateLaserSettings;
  createdAt: string; // ISO string
  updatedAt: string;
  builtIn: boolean; // true = shipped with app, false = user-created
  tumblerMapping?: TumblerMapping;
  /** Straight-on photo of the front face — base64 data URL */
  frontPhotoDataUrl?: string;
  /** Straight-on photo of the back face — base64 data URL */
  backPhotoDataUrl?: string;
}

export interface ProductTemplateStore {
  templates: ProductTemplate[];
  lastUpdated: string;
}
