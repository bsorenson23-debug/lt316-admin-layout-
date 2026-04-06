export type AxialSurfaceBandKind = "lid" | "rim-ring" | "upper-body" | "lower-taper" | "base";

export interface AxialSurfaceBand {
  id: string;
  kind: AxialSurfaceBandKind;
  sStart: number;
  sEnd: number;
  printable: boolean;
  confidence: number;
}

export interface PrintableSurfaceContract {
  printableTopMm: number;
  printableBottomMm: number;
  printableHeightMm: number;
  axialExclusions: Array<{
    kind: "lid" | "rim-ring" | "base";
    startMm: number;
    endMm: number;
  }>;
  circumferentialExclusions: Array<{
    kind: "handle";
    startMm: number;
    endMm: number;
    wraps: boolean;
  }>;
}
