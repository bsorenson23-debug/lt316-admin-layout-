export type StageName = "created" | "lookup" | "image-doctor" | "vectorize" | "mesh";
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

export interface LookupProductPayload extends ProductManifestRecord {
  imageCandidates: string[];
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
  clean: Record<string, string>;
  note: string;
}

export interface JobManifest {
  jobId: string;
  status: StageName;
  product: ProductManifestRecord;
  images: {
    raw: string[];
    views: JobImageViews;
    clean: Record<string, string>;
  };
  svg: {
    logo: string | null;
    silhouette: string | null;
    detail: string | null;
  };
  mesh: {
    glb: string | null;
    previewPng: string | null;
  };
  debug: {
    lookup: Record<string, unknown> | null;
    "doctor": Record<string, unknown> | null;
    vectorize: Record<string, unknown> | null;
    mesh: Record<string, unknown> | null;
  };
}
