import type {
  ProductReferenceLogoBox,
  ProductReferenceViewClass,
} from "@/types/productTemplate";
import type {
  RasterBackgroundStrategy,
  RasterTraceMode,
  RasterTraceRecipe,
} from "@/types/rasterVectorize";

export interface LogoPlacementAssistResponse {
  detected: boolean;
  logoBox: ProductReferenceLogoBox | null;
  viewClass: ProductReferenceViewClass | "unknown";
  confidence: number;
  rationale: string;
}

export interface TraceSettingsAssistResponse {
  traceMode: RasterTraceMode;
  traceRecipe: RasterTraceRecipe;
  backgroundStrategy: RasterBackgroundStrategy;
  preserveText: boolean;
  thresholdMode: "auto" | "manual";
  threshold: number;
  invert: boolean;
  turdSize: number;
  alphaMax: number;
  optTolerance: number;
  posterizeSteps: number;
  confidence: number;
  rationale: string;
}
