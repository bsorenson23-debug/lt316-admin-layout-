import type { FlatItemLookupResponse } from "./flatItemLookup";
import type { TumblerFinish } from "./materials";
import type {
  CanonicalBodyProfile,
  CanonicalDimensionCalibration,
  CanonicalHandleProfile,
  EditableBodyOutline,
  ProductReferenceSet,
  ProductTemplate,
  ReferenceLayerState,
  ReferencePaths,
} from "./productTemplate";
import type { AxialSurfaceBand, PrintableSurfaceContract } from "./printableSurface";
import type { TumblerItemLookupResponse } from "./tumblerItemLookup";

export type SmartTemplateLookupSourceType = "image" | "url" | "text" | "mixed";

export type SmartTemplateLookupCategory = ProductTemplate["productType"] | "unknown";

export type SmartTemplateLookupPrompt =
  | "confirm-category"
  | "confirm-dimensions"
  | "choose-laser-type"
  | "choose-material-profile"
  | "choose-rotary-preset"
  | "choose-model"
  | "map-tumbler";

export interface SmartTemplateLookupDimensionsDraft {
  diameterMm?: number | null;
  bodyDiameterMm?: number | null;
  advancedGeometryOverridesUnlocked?: boolean | null;
  topOuterDiameterMm?: number | null;
  baseDiameterMm?: number | null;
  mouthInnerDiameterMm?: number | null;
  printHeightMm?: number | null;
  templateWidthMm?: number | null;
  flatThicknessMm?: number | null;
  flatFamilyKey?: string | null;
  handleArcDeg?: number | null;
  taperCorrection?: ProductTemplate["dimensions"]["taperCorrection"] | null;
  overallHeightMm?: number | null;
  bodyTopFromOverallMm?: number | null;
  bodyBottomFromOverallMm?: number | null;
  lidSeamFromOverallMm?: number | null;
  silverBandBottomFromOverallMm?: number | null;
  handleTopFromOverallMm?: number | null;
  handleBottomFromOverallMm?: number | null;
  handleReachMm?: number | null;
  handleUpperCornerFromOverallMm?: number | null;
  handleLowerCornerFromOverallMm?: number | null;
  handleUpperCornerReachMm?: number | null;
  handleLowerCornerReachMm?: number | null;
  handleUpperTransitionReachMm?: number | null;
  handleLowerTransitionReachMm?: number | null;
  handleUpperTransitionFromOverallMm?: number | null;
  handleLowerTransitionFromOverallMm?: number | null;
  handleOuterTopFromOverallMm?: number | null;
  handleOuterBottomFromOverallMm?: number | null;
  handleTubeDiameterMm?: number | null;
  handleSpanMm?: number | null;
  canonicalHandleProfile?: CanonicalHandleProfile | null;
  canonicalBodyProfile?: CanonicalBodyProfile | null;
  canonicalDimensionCalibration?: CanonicalDimensionCalibration | null;
  shoulderDiameterMm?: number | null;
  taperUpperDiameterMm?: number | null;
  taperLowerDiameterMm?: number | null;
  bevelDiameterMm?: number | null;
  bodyOutlineProfile?: EditableBodyOutline | null;
  referencePaths?: ReferencePaths | null;
  referenceLayerState?: ReferenceLayerState | null;
  bodyHeightMm?: number | null;
  axialSurfaceBands?: AxialSurfaceBand[] | null;
  printableSurfaceContract?: PrintableSurfaceContract | null;
  printableTopOverrideMm?: number | null;
  printableBottomOverrideMm?: number | null;
  topMarginMm?: number | null;
  bottomMarginMm?: number | null;
  bodyColorHex?: string | null;
  rimColorHex?: string | null;
}

export interface SmartTemplateLookupDraft {
  name?: string | null;
  brand?: string | null;
  capacity?: string | null;
  laserType?: ProductTemplate["laserType"] | null;
  productType?: ProductTemplate["productType"] | null;
  materialSlug?: string | null;
  materialLabel?: string | null;
  materialFinishType?: TumblerFinish | null;
  materialProfileId?: string | null;
  materialProfileLabel?: string | null;
  productPhotoUrl?: string | null;
  productPhotoLabel?: string | null;
  backPhotoUrl?: string | null;
  backPhotoLabel?: string | null;
  productReferenceSet?: ProductReferenceSet | null;
  glbPath?: string | null;
  glbStatus?: ProductTemplate["glbStatus"] | null;
  glbSourceLabel?: ProductTemplate["glbSourceLabel"] | null;
  dimensions?: SmartTemplateLookupDimensionsDraft;
}

export interface SmartTemplateLookupResponse {
  sourceType: SmartTemplateLookupSourceType;
  category: SmartTemplateLookupCategory;
  confidence: number;
  reviewRequired: boolean;
  matchedProfileId: string | null;
  matchedFlatItemId: string | null;
  categoryReason: string;
  templateDraft: SmartTemplateLookupDraft;
  nextPrompts: SmartTemplateLookupPrompt[];
  warnings: string[];
  notes: string[];
  flatLookupResult?: FlatItemLookupResponse | null;
  tumblerLookupResult?: TumblerItemLookupResponse | null;
}

export interface SmartTemplateLookupError {
  code: string;
  message: string;
  detail?: string;
}

export type SmartTemplateLookupResult =
  | {
      ok: true;
      data: SmartTemplateLookupResponse;
      warnings?: string[];
    }
  | {
      ok: false;
      error: SmartTemplateLookupError;
    };
