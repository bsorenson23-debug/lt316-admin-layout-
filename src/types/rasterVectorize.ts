export type RasterTraceMode = "trace" | "posterize";

export interface RasterVectorizeResponse {
  svg: string;
  mode: RasterTraceMode;
  pathCount: number;
  width: number;
  height: number;
}
