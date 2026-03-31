export type RasterTraceMode = "trace" | "posterize";
export type RasterTraceRecipe = "badge" | "line-art" | "script-logo" | "stamp";
export type RasterPreviewBackground = "light" | "dark" | "checker";
export type RasterBackgroundStrategy = "original" | "cutout" | "hybrid";
export type RasterBedPreviewTarget =
  | "result"
  | "source"
  | "thresholdPreview"
  | "colorPreview"
  | "textPreview"
  | "arcTextPreview"
  | "scriptTextPreview"
  | "shapePreview"
  | "contourPreview";

export interface RasterVectorizeBranchPreviews {
  colorPreview?: string | null;
  textPreview?: string | null;
  arcTextPreview?: string | null;
  scriptTextPreview?: string | null;
  shapePreview?: string | null;
  contourPreview?: string | null;
}

export interface RasterVectorizeResponse {
  svg: string;
  mode: RasterTraceMode;
  pathCount: number;
  width: number;
  height: number;
  engine?: "potrace" | "asset-pipeline";
  jobId?: string;
  sourcePath?: string;
  branchPreviews?: RasterVectorizeBranchPreviews;
}
