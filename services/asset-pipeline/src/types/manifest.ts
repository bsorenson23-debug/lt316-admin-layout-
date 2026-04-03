export type StageName =
  | "created"
  | "lookup"
  | "image-doctor"
  | "color-regions"
  | "vector-doctor"
  | "vectorize"
  | "mesh";
export type ProductCategoryHint = "flat" | "tumbler" | "mug" | "bottle";

export interface ProductDimensions {
  width: number | null;
  height: number | null;
  thickness: number | null;
}

export interface ProductManifestRecord {
  input: string;
  title: string;
  brand: string;
  category: string;
  dimensionsMm: ProductDimensions;
}

export interface JobImageViews {
  overlay: string | null;
  front: string | null;
  back: string | null;
  sideLeft: string | null;
  sideRight: string | null;
}

export interface CreateJobRequestBody {
  input?: string;
  categoryHint?: ProductCategoryHint;
}

export interface ImageDoctorVectorSettings {
  detailPreset?: "soft" | "balanced" | "fine";
  threshold?: number;
  contrast?: number;
  brightnessOffset?: number;
  sharpenSigma?: number;
}

export interface ImageDoctorSilhouetteSettings {
  detailPreset?: "tight" | "balanced" | "bold";
  alphaThreshold?: number;
  edgeGrow?: number;
  blurSigma?: number;
}

export interface ImageDoctorRequestBody {
  vectorSettings?: ImageDoctorVectorSettings;
  silhouetteSettings?: ImageDoctorSilhouetteSettings;
}

export type VectorizeTraceMode = "trace" | "posterize";
export type VectorizeTraceRecipe = "badge" | "line-art" | "script-logo" | "stamp";

export interface VectorizeTraceSettings {
  mode?: VectorizeTraceMode;
  recipe?: VectorizeTraceRecipe;
  outputColor?: string;
  preserveText?: boolean;
  invert?: boolean;
  thresholdMode?: "auto" | "manual";
  threshold?: number;
  turdSize?: number;
  alphaMax?: number;
  optTolerance?: number;
}

export interface VectorizeRequestBody {
  trace?: VectorizeTraceSettings;
}

export interface LookupProductPayload extends ProductManifestRecord {
  imageCandidates: string[];
}

export interface CleanImageArtifacts {
  subjectTransparent: string;
  subjectClean: string;
  vectorInput: string;
  silhouetteMask: string;
  preview: string;
}

export interface RegionMaskArtifact {
  id: string;
  mask: string;
  color: string;
  role: "text-like" | "foreground-shape" | "fill-area" | "accent-detail" | "outline-candidate" | "unknown";
}

export interface ColorRegionArtifacts {
  preview: string | null;
  masks: RegionMaskArtifact[];
}

export interface ImageDoctorResultPayload {
  jobId: string;
  status: Extract<StageName, "image-doctor">;
  directories: {
    raw: string;
    clean: string;
    debug: string;
  };
  views: JobImageViews;
  clean: CleanImageArtifacts;
  note: string;
}

export interface ColorRegionsResultPayload {
  jobId: string;
  status: Extract<StageName, "color-regions">;
  sourceImageUsed: string;
  rawClustersFound: number;
  finalKeptRegions: number;
  preview: string | null;
  masks: RegionMaskArtifact[];
  debugPath: string;
  note: string;
}

export interface VectorDoctorArtifacts {
  colorPreview: string;
  traceInput: string;
  textPreview: string | null;
  arcTextPreview: string | null;
  scriptTextPreview: string | null;
  shapePreview: string | null;
  accentPreview: string | null;
  contourPreview: string | null;
}

export interface VectorDoctorResultPayload {
  jobId: string;
  status: Extract<StageName, "vector-doctor">;
  sourceImageUsed: string;
  traceSourceUsed: string;
  groupedRegions: Array<{
    id: string;
    role: string;
    pixelCount: number;
  }>;
  recipesByRegion: Array<{
    regionId: string;
    role: string;
    recipe: "text-preserve" | "shape-detail" | "accent-line" | "contour" | "ignored";
  }>;
  mergedIntoOutputs: Array<{
    output:
      | "color-preview"
      | "trace-input"
      | "text-preview"
      | "arc-text-preview"
      | "script-text-preview"
      | "shape-preview"
      | "accent-preview"
      | "contour-preview";
    regionIds: string[];
  }>;
  suppressedRegions: string[];
  artifacts: VectorDoctorArtifacts;
  debugPath: string;
  note: string;
}

export interface JobManifest {
  jobId: string;
  status: StageName;
  product: ProductManifestRecord;
  images: {
    raw: string[];
    views: JobImageViews;
    clean: Partial<CleanImageArtifacts>;
    regions?: Partial<ColorRegionArtifacts>;
  };
  svg: {
    logo: string | null;
    silhouette: string | null;
    detail: string | null;
    monochrome: string | null;
  };
  mesh: {
    glb: string | null;
    previewPng: string | null;
  };
  debug: {
    lookup: Record<string, unknown> | null;
    "doctor": Record<string, unknown> | null;
    colorRegions: Record<string, unknown> | null;
    vectorDoctor: Record<string, unknown> | null;
    vectorize: Record<string, unknown> | null;
    mesh: Record<string, unknown> | null;
  };
}
