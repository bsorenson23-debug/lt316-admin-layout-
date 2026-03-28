import type { JobManifest } from "../types/manifest";

export function createInitialManifest(
  jobId: string,
  seed?: Partial<Pick<JobManifest["product"], "input" | "category">>,
): JobManifest {
  return {
    jobId,
    status: "created",
    product: {
      input: seed?.input ?? "",
      title: "",
      brand: "",
      category: seed?.category ?? "",
      dimensionsMm: {
        width: null,
        height: null,
        thickness: null,
      },
    },
    images: {
      raw: [],
      views: {
        overlay: null,
        front: null,
        back: null,
        sideLeft: null,
        sideRight: null,
      },
      clean: {},
    },
    svg: {
      logo: null,
      silhouette: null,
      detail: null,
    },
    mesh: {
      glb: null,
      previewPng: null,
    },
    debug: {
      lookup: null,
      doctor: null,
      vectorize: null,
      mesh: null,
    },
  };
}
