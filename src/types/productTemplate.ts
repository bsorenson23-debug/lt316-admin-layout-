import type { AxialSurfaceBand, PrintableSurfaceContract } from "./printableSurface";

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
  /**
   * High-fidelity closed contour derived from the imported SVG/cutout rows.
   * Used for preview rendering so the visible outline matches the source cutout
   * more closely than the simplified mirrored control profile.
   */
  directContour?: EditableBodyOutlineContourPoint[];
  /**
   * Preview-space contour in the original imported SVG/image coordinates.
   * This is used to render the BODY REFERENCE photo and outline from the same
   * source geometry so the preview cannot drift from the SVG seed.
   */
  sourceContour?: EditableBodyOutlineContourPoint[];
  sourceContourBounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
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
  /** Canonical wrap/body diameter used for circumference math and cylindrical placement. */
  diameterMm: number;
  /** Explicit alias for diameterMm when the style needs body and top diameters separated. */
  bodyDiameterMm?: number;
  /** When true, manual geometry overrides are allowed and the template is no longer in locked production mode. */
  advancedGeometryOverridesUnlocked?: boolean;
  /** Outer diameter at the top/lid seat. */
  topOuterDiameterMm?: number;
  /** Outer diameter at the base/foot. */
  baseDiameterMm?: number;
  /** Optional inner mouth diameter when known from a source catalog. */
  mouthInnerDiameterMm?: number;
  printHeightMm: number;
  templateWidthMm: number; // authoritative wrap width / circumference for drinkware
  /** Flat-item body thickness used for generated 3D preview (mm) */
  flatThicknessMm?: number;
  /** Flat-item preview family key (magazine, knife-blank, dog-tag, etc.) */
  flatFamilyKey?: string;
  handleArcDeg: number; // 0 = no handle
  taperCorrection: "none" | "top-narrow" | "bottom-narrow";
  /** Total product height including non-engravable areas (mm) */
  overallHeightMm?: number;
  /** Distance from the overall top to the physical tumbler body top, excluding lid/straw (mm). */
  bodyTopFromOverallMm?: number;
  /** Distance from the overall top to the physical tumbler body bottom (mm). */
  bodyBottomFromOverallMm?: number;
  /** Top edge of the silver ring / lid seam measured from the overall top (mm). */
  lidSeamFromOverallMm?: number;
  /** Bottom edge of the top silver ring measured from the overall top (mm). */
  silverBandBottomFromOverallMm?: number;
  /** Top edge of the handle silhouette measured from the overall top (mm). */
  handleTopFromOverallMm?: number;
  /** Bottom edge of the handle silhouette measured from the overall top (mm). */
  handleBottomFromOverallMm?: number;
  /** Horizontal reach of the handle silhouette from the body edge to the outermost handle edge (mm). */
  handleReachMm?: number;
  /** Y position of the visible upper outer handle corner measured from the overall top (mm). */
  handleUpperCornerFromOverallMm?: number;
  /** Y position of the visible lower outer handle corner measured from the overall top (mm). */
  handleLowerCornerFromOverallMm?: number;
  /** Reach of the visible upper outer handle corner from the body edge (mm). */
  handleUpperCornerReachMm?: number;
  /** Reach of the visible lower outer handle corner from the body edge (mm). */
  handleLowerCornerReachMm?: number;
  /** Reach of the upper horizontal handle transition from the body edge (mm). */
  handleUpperTransitionReachMm?: number;
  /** Reach of the lower horizontal handle transition from the body edge (mm). */
  handleLowerTransitionReachMm?: number;
  /** Y position of the upper horizontal handle transition from the overall top (mm). */
  handleUpperTransitionFromOverallMm?: number;
  /** Y position of the lower horizontal handle transition from the overall top (mm). */
  handleLowerTransitionFromOverallMm?: number;
  /** Body-edge anchor for the outer handle reference line measured from the overall top (mm). */
  handleOuterTopFromOverallMm?: number;
  /** Body-edge anchor for the outer handle reference line measured from the overall top (mm). */
  handleOuterBottomFromOverallMm?: number;
  /** Wall / thickness offset used to derive the outer handle contour from the inner handle line (mm). */
  handleTubeDiameterMm?: number;
  /** Overall left-to-right product span including the handle silhouette (mm). Metadata only; never used for wrap math. */
  handleSpanMm?: number;
  /** Canonical handle extraction derived from the uploaded reference image and body-only silhouette. */
  canonicalHandleProfile?: CanonicalHandleProfile;
  /** Canonical left-driven mirrored body profile used by preview, guides, and later revolve geometry. */
  canonicalBodyProfile?: CanonicalBodyProfile;
  /** Shared mm calibration consumed by photo overlay, body outline, bed mapping, and GLB alignment. */
  canonicalDimensionCalibration?: CanonicalDimensionCalibration;
  /** Persisted BODY REFERENCE QA used to rehydrate the hard-gated contract on reload. */
  bodyReferenceQA?: BodyReferenceQAContract;
  /** Persisted BODY REFERENCE warning ledger from the active contract. */
  bodyReferenceWarnings?: string[];
  /** Persisted BODY REFERENCE contract version for drift detection across releases. */
  bodyReferenceContractVersion?: number;
  /** Width at the shoulder break where the straight wall transitions into the lower taper (mm). */
  shoulderDiameterMm?: number;
  /** Width at the upper taper control point (mm). */
  taperUpperDiameterMm?: number;
  /** Width at the lower taper control point (mm). */
  taperLowerDiameterMm?: number;
  /** Width at the bevel start just above the flat base (mm). */
  bevelDiameterMm?: number;
  /** Editable mirrored body-outline profile used to drive GLB body generation. */
  bodyOutlineProfile?: EditableBodyOutline;
  /** Multi-layer body reference paths for body, lid, and silver/powder guides. */
  referencePaths?: ReferencePaths;
  /** Editor-layer state for body reference paths. */
  referenceLayerState?: ReferenceLayerState;
  /** Physical tumbler body height excluding lid/straw (mm). */
  bodyHeightMm?: number;
  /** Canonical normalized axial surface segmentation for printable and excluded bands. */
  axialSurfaceBands?: AxialSurfaceBand[];
  /** Canonical printable-surface contract in absolute mm space. */
  printableSurfaceContract?: PrintableSurfaceContract;
  /** Manual override for the printable top boundary measured from the overall top (mm). */
  printableTopOverrideMm?: number;
  /** Manual override for the printable bottom boundary measured from the overall top (mm). */
  printableBottomOverrideMm?: number;
  /** Top non-engravable margin — lid seat / rim (mm) */
  topMarginMm?: number;
  /** Bottom non-engravable margin — base taper (mm) */
  bottomMarginMm?: number;
  /** Template editor-only scale for the reference photo (percent) */
  referencePhotoScalePct?: number;
  /** Template editor-only width scale for the reference photo (percent, relative to the auto-sized baseline). */
  referencePhotoWidthScalePct?: number;
  /** Template editor-only height scale for the reference photo (percent, relative to the auto-sized baseline). */
  referencePhotoHeightScalePct?: number;
  /** Template editor-only lock for keeping width and height adjustments in sync. */
  referencePhotoLockAspect?: boolean;
  /** Template editor-only vertical nudge for the reference photo (percent of editor height) */
  referencePhotoOffsetYPct?: number;
  /** Template editor-only horizontal nudge for the reference photo (percent of editor width) */
  referencePhotoOffsetXPct?: number;
  /** Template editor-only vertical anchor for the reference photo */
  referencePhotoAnchorY?: "center" | "bottom";
  /** Template editor-only horizontal centering mode for the reference photo */
  referencePhotoCenterMode?: "body" | "photo";
  /** Sampled body color from the engravable zone */
  bodyColorHex?: string;
  /** Sampled lid cap color from the reference photo */
  lidColorHex?: string;
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

export interface ManufacturerLogoStampPlacement {
  /** Horizontal offset from the mapped front-center in mm. Positive = viewer-right. */
  offsetXMm: number;
  /** Vertical center from the overall tumbler top in mm. */
  centerYFromTopMm: number;
  /** Physical logo width in mm. */
  widthMm: number;
  /** Physical logo height in mm. */
  heightMm: number;
}

export interface OrientationLandmarks {
  thetaFront: number;
  thetaBack: number;
  thetaHandle?: number;
  sourceImageId?: string;
  confidence: number;
}

export interface LogoPlacement {
  source: "uploaded-image" | "reference-image" | "manual";
  sourceImageId?: string;
  sCenter: number;
  sSpan: number;
  thetaCenter: number;
  thetaSpan: number;
  bboxPx?: { x: number; y: number; w: number; h: number };
  confidence: number;
}

export interface ManufacturerLogoStamp {
  /** Transparent PNG data URL extracted from the lookup/front product photo. */
  dataUrl: string;
  /** Placement solved from the source product photo. */
  placement: ManufacturerLogoStampPlacement;
  /** Canonical body-local logo placement used by preview, overlays, and later GLB work. */
  logoPlacement: LogoPlacement;
  /** Canonical orientation landmarks associated with the source image / reference set. */
  orientationLandmarks: OrientationLandmarks;
  /** Where the logo extraction came from. */
  source: "lookup-photo" | "front-photo";
  /** Brand name associated with the extracted logo, when known. */
  brand?: string;
}

export interface ProductTemplateColorOption {
  /** Stable variant key from the source catalog. */
  id: string;
  /** User-facing color label, e.g. "Daffodil". */
  label: string;
  /** Remote swatch or product image used to render the color button. */
  swatchImageUrl?: string;
  /** Variant URL that represents this color on the source catalog. */
  variantUrl?: string;
}

export type ProductReferenceImageSource = "official" | "retailer" | "other";

export type ProductReferenceViewClass =
  | "front"
  | "back"
  | "left-side"
  | "right-side"
  | "front-3q"
  | "back-3q"
  | "handle-side"
  | "detail"
  | "lifestyle"
  | "unknown";

export interface ProductReferenceLogoBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ProductReferenceImage {
  id: string;
  url: string;
  source: ProductReferenceImageSource;
  hash: string;
  width: number;
  height: number;
  viewClass: ProductReferenceViewClass;
  approxAzimuthDeg?: 0 | 45 | 90 | 135 | 180;
  handleVisible: boolean;
  handleSide: "left" | "right" | "center" | "hidden" | "unknown";
  logoDetected: boolean;
  logoBox?: ProductReferenceLogoBox;
  confidence: number;
}

export type CanonicalBackStatus = "true-back" | "only-back-3q-found" | "unknown";

export interface CanonicalViewSelection {
  canonicalFrontImageId?: string;
  canonicalBackImageId?: string;
  canonicalBackStatus: CanonicalBackStatus;
  frontConfidence: number;
  backConfidence: number;
  bestAuxBack3qImageId?: string;
}

export interface ProductReferenceSet {
  productKey: string;
  images: ProductReferenceImage[];
  canonicalFrontImageId?: string;
  canonicalBackImageId?: string;
  canonicalHandleSideImageId?: string;
  orientationConfidence: number;
  canonicalViewSelection?: CanonicalViewSelection;
}

export interface ProductTemplate {
  id: string; // crypto.randomUUID()
  name: string; // "YETI Rambler 40oz"
  brand: string;
  capacity: string;
  laserType?: "fiber" | "co2" | "diode";
  productType: "tumbler" | "mug" | "bottle" | "flat";
  materialSlug?: string;
  materialLabel?: string;
  thumbnailDataUrl: string; // base64 120x120 PNG
  /** Full-resolution product photo (max 1024px, JPEG base64) for grid overlay */
  productPhotoFullUrl?: string;
  glbPath: string; // path in /public/models/
  glbStatus?: "verified-product-model" | "placeholder-model" | "missing-model";
  glbSourceLabel?: string;
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
  /** Manufacturer logo extracted from the clean product photo and stamped onto the 3D preview. */
  manufacturerLogoStamp?: ManufacturerLogoStamp;
  /** Available catalog colors for this style; used for style-level selection without duplicating templates per color. */
  availableColors?: ProductTemplateColorOption[];
  /** Multi-image product references captured during lookup for later orientation and logo workflows. */
  productReferenceSet?: ProductReferenceSet;
}

export interface ProductTemplateStore {
  templates: ProductTemplate[];
  lastUpdated: string;
  deletedBuiltInIds?: string[];
}

export function getTemplateBodyDiameterMm(template: Pick<ProductTemplate, "dimensions">): number {
  return template.dimensions.bodyDiameterMm ?? template.dimensions.diameterMm;
}

export function getTemplateEffectiveCylinderDiameterMm(template: Pick<ProductTemplate, "dimensions">): number {
  const dims = template.dimensions;
  if (!dims.advancedGeometryOverridesUnlocked && dims.templateWidthMm > 0) {
    return dims.templateWidthMm / Math.PI;
  }
  return getTemplateBodyDiameterMm(template);
}

export function getTemplateTopOuterDiameterMm(template: Pick<ProductTemplate, "dimensions">): number | undefined {
  return template.dimensions.topOuterDiameterMm;
}

export function getTemplateBaseDiameterMm(template: Pick<ProductTemplate, "dimensions">): number | undefined {
  return template.dimensions.baseDiameterMm;
}
