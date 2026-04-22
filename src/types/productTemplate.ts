import type { AxialSurfaceBand, PrintableSurfaceContract } from "./printableSurface";
import type { TumblerItemLookupDimensions } from "./tumblerItemLookup";
import type {
  LaserBedArtworkPlacement,
  TemplateEngravingPreviewState,
} from "@/lib/laserBedSurfaceMapping";
import type { BodyReferenceV2Draft } from "@/lib/bodyReferenceV2Layers";
import type { ProductAppearanceReferenceLayer } from "@/lib/productAppearanceReferenceLayers";

export type EditableOutlinePointType = "corner" | "smooth";
export type ReferenceLayerKey = "bodyOutline" | "lidProfile" | "silverProfile";

export interface EditableOutlineHandle {
  x: number;
  y: number;
}

export interface EditableBodyOutlinePoint {
  id: string;
  x: number;
  y: number;
  inHandle?: EditableOutlineHandle | null;
  outHandle?: EditableOutlineHandle | null;
  pointType: EditableOutlinePointType;
  role?: "topOuter" | "body" | "shoulder" | "upperTaper" | "lowerTaper" | "bevel" | "base" | "custom";
}

export interface EditableBodyOutlineContourPoint {
  x: number;
  y: number;
}

export interface EditableBodyOutline {
  closed: boolean;
  version: 1;
  points: EditableBodyOutlinePoint[];
  directContour?: EditableBodyOutlineContourPoint[];
  sourceContour?: EditableBodyOutlineContourPoint[];
  sourceContourBounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
  sourceContourMode?: "full-image" | "body-only";
  sourceContourViewport?: {
    minX: number;
    minY: number;
    width: number;
    height: number;
  };
}

export interface NormalizedMeasurementContour {
  contour: EditableBodyOutlineContourPoint[];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
  mirrored: boolean;
  bodyOnly: boolean;
}

export interface CanonicalHandleAnchor {
  sNorm: number;
  xPx: number;
  yPx: number;
}

export interface CanonicalHandleContourPoint {
  x: number;
  y: number;
}

export interface CanonicalHandleCenterlinePoint {
  t: number;
  x: number;
  y: number;
}

export interface CanonicalHandleWidthSample {
  t: number;
  widthPx: number;
}

export interface CanonicalHandleProfile {
  side: "left" | "right";
  confidence: number;
  anchors: {
    upper: CanonicalHandleAnchor;
    lower: CanonicalHandleAnchor;
  };
  outerContour: CanonicalHandleContourPoint[];
  innerContour: CanonicalHandleContourPoint[];
  centerline: CanonicalHandleCenterlinePoint[];
  widthProfile: CanonicalHandleWidthSample[];
  upperAttachmentWidthPx?: number;
  lowerAttachmentWidthPx?: number;
  upperOpeningGapPx?: number;
  lowerOpeningGapPx?: number;
  symmetricExtrusionWidthPx?: number;
  openingBox?: { x: number; y: number; w: number; h: number };
  svgPathOuter?: string;
  svgPathInner?: string;
}

export interface CanonicalBodyProfileAxis {
  xTop: number;
  yTop: number;
  xBottom: number;
  yBottom: number;
}

export interface CanonicalBodyProfileSample {
  sNorm: number;
  yMm: number;
  yPx: number;
  xLeft: number;
  radiusPx: number;
  radiusMm: number;
}

export interface CanonicalBodyProfile {
  symmetrySource: "left" | "right";
  mirroredFromSymmetrySource: boolean;
  mirroredRightFromLeft?: boolean;
  axis: CanonicalBodyProfileAxis;
  samples: CanonicalBodyProfileSample[];
  svgPath: string;
}

export interface CanonicalDimensionCalibration {
  units: "mm";
  totalHeightMm: number;
  bodyHeightMm: number;
  lidBodyLineMm: number;
  bodyBottomMm: number;
  wrapDiameterMm: number;
  baseDiameterMm: number;
  wrapWidthMm: number;
  frontVisibleWidthMm: number;
  frontAxisPx: CanonicalBodyProfileAxis;
  photoToFrontTransform: {
    type: "affine" | "similarity";
    matrix: number[];
  };
  svgFrontViewBoxMm: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  wrapMappingMm: {
    frontMeridianMm: number;
    backMeridianMm: number;
    leftQuarterMm: number;
    rightQuarterMm: number;
    handleMeridianMm?: number;
    handleKeepOutArcDeg?: number;
    handleKeepOutWidthMm?: number;
    handleKeepOutStartMm?: number;
    handleKeepOutEndMm?: number;
  };
  axialSurfaceBands?: AxialSurfaceBand[];
  printableSurfaceContract?: PrintableSurfaceContract;
  glbScale: {
    unitsPerMm: number;
  };
}

export interface BodyReferenceQAContract {
  pass: boolean;
  severity: "ready" | "review" | "action";
  shellAuthority: "outline-profile" | "dimensional-seed";
  scaleAuthority: "validated-midband-ratio" | "outline-ratio-fallback" | "none";
  acceptedRowCount: number;
  rejectedRowCount: number;
  fallbackMode: "none" | "outline-only" | "missing-measurement-contour";
  issues: string[];
}

export interface ReferencePaths {
  bodyOutline: EditableBodyOutline | null;
  lidProfile: EditableBodyOutline | null;
  silverProfile: EditableBodyOutline | null;
}

export interface ReferenceLayerState {
  activeLayer: ReferenceLayerKey;
  visibility: Record<ReferenceLayerKey, boolean>;
  locked: Record<ReferenceLayerKey, boolean>;
}

export interface ProductTemplateDimensions {
  diameterMm: number;
  bodyDiameterMm?: number;
  printHeightMm: number;
  templateWidthMm: number; // computed: Math.PI * diameterMm
  handleArcDeg: number; // 0 = no handle
  taperCorrection: "none" | "top-narrow" | "bottom-narrow";
  /** Total product height including non-engravable areas (mm) */
  overallHeightMm?: number;
  bodyTopFromOverallMm?: number;
  bodyBottomFromOverallMm?: number;
  topOuterDiameterMm?: number;
  baseDiameterMm?: number;
  shoulderDiameterMm?: number;
  taperUpperDiameterMm?: number;
  taperLowerDiameterMm?: number;
  bevelDiameterMm?: number;
  lidSeamFromOverallMm?: number;
  silverBandBottomFromOverallMm?: number;
  bodyHeightMm?: number;
  canonicalBodyProfile?: CanonicalBodyProfile;
  canonicalDimensionCalibration?: CanonicalDimensionCalibration;
  bodyReferenceQA?: BodyReferenceQAContract;
  bodyReferenceWarnings?: string[];
  bodyReferenceContractVersion?: number;
  bodyOutlineProfile?: EditableBodyOutline;
  referencePaths?: ReferencePaths;
  referenceLayerState?: ReferenceLayerState;
  axialSurfaceBands?: AxialSurfaceBand[];
  printableSurfaceContract?: PrintableSurfaceContract;
  printableTopOverrideMm?: number;
  printableBottomOverrideMm?: number;
  /** Top non-engravable margin — lid seat / rim (mm) */
  topMarginMm?: number;
  /** Bottom non-engravable margin — base taper (mm) */
  bottomMarginMm?: number;
  /** Template editor-only scale for the reference photo (percent) */
  referencePhotoScalePct?: number;
  /** Template editor-only vertical nudge for the reference photo (percent of editor height) */
  referencePhotoOffsetYPct?: number;
  /** Template editor-only vertical anchor for the reference photo */
  referencePhotoAnchorY?: "center" | "bottom";
  /** Sampled body color from the engravable zone */
  bodyColorHex?: string;
  /** Sampled rim / engraved render color */
  rimColorHex?: string;
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
  materialSlug?: string;
  materialLabel?: string;
  thumbnailDataUrl: string; // base64 120x120 PNG
  /** Full-resolution product photo (max 1024px, JPEG base64) for grid overlay */
  productPhotoFullUrl?: string;
  glbPath: string; // path in /public/models/
  glbStatus?: "verified-product-model" | "generated-reviewed-model" | "placeholder-model" | "missing-model";
  glbSourceLabel?: string;
  dimensions: ProductTemplateDimensions;
  laserSettings: ProductTemplateLaserSettings;
  createdAt: string; // ISO string
  updatedAt: string;
  builtIn: boolean; // true = shipped with app, false = user-created
  tumblerMapping?: TumblerMapping;
  appearanceReferenceLayers?: ProductAppearanceReferenceLayer[];
  artworkPlacements?: LaserBedArtworkPlacement[];
  engravingPreviewState?: TemplateEngravingPreviewState;
  lookupDimensions?: TumblerItemLookupDimensions;
  acceptedBodyReferenceV2Draft?: BodyReferenceV2Draft;
  /** Straight-on photo of the front face — base64 data URL */
  frontPhotoDataUrl?: string;
  /** Straight-on photo of the back face — base64 data URL */
  backPhotoDataUrl?: string;
}

export interface ProductTemplateStore {
  templates: ProductTemplate[];
  lastUpdated: string;
  deletedBuiltInIds?: string[];
}
