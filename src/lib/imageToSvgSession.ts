import type {
  RasterBackgroundStrategy,
  RasterBedPreviewTarget,
  RasterPreviewBackground,
  RasterTraceMode,
  RasterTraceRecipe,
  RasterVectorizeBranchPreviews,
} from "../types/rasterVectorize.ts";
import type { TemplatePipelineDiagnostics } from "../types/templatePipelineDiagnostics.ts";
import { normalizeTemplatePipelineDiagnostics } from "./templatePipelineDiagnostics.ts";

export type ImageToSvgThresholdMode = "auto" | "manual";

export interface PersistedImageToSvgFile {
  name: string;
  type: string;
  dataUrl: string;
}

export interface ImageToSvgSessionSnapshot {
  sourceFile: PersistedImageToSvgFile | null;
  workingFile: PersistedImageToSvgFile | null;
  traceMode: RasterTraceMode;
  traceRecipe: RasterTraceRecipe;
  thresholdMode: ImageToSvgThresholdMode;
  threshold: number;
  invert: boolean;
  trimWhitespace: boolean;
  normalizeLevels: boolean;
  turdSize: number;
  alphaMax: number;
  optTolerance: number;
  posterizeSteps: number;
  preserveText: boolean;
  backgroundStrategy: RasterBackgroundStrategy;
  outputColor: string;
  previewBackground: RasterPreviewBackground;
  bedPreviewTarget: RasterBedPreviewTarget;
  assistNote: string | null;
  svgText: string | null;
  stats: { pathCount: number; width: number; height: number } | null;
  traceEngine: "potrace" | "asset-pipeline" | null;
  branchPreviews: RasterVectorizeBranchPreviews | null;
  hiddenSvgColors: string[];
  bgEngine: string | null;
  cleanupEngine: string | null;
  despeckleLevel: number;
  diagnostics?: TemplatePipelineDiagnostics | null;
}

export const DEFAULT_IMAGE_TO_SVG_SESSION: ImageToSvgSessionSnapshot = {
  sourceFile: null,
  workingFile: null,
  traceMode: "trace",
  traceRecipe: "badge",
  thresholdMode: "auto",
  threshold: 160,
  invert: false,
  trimWhitespace: true,
  normalizeLevels: true,
  turdSize: 0,
  alphaMax: 0.35,
  optTolerance: 0.05,
  posterizeSteps: 4,
  preserveText: true,
  backgroundStrategy: "original",
  outputColor: "#000000",
  previewBackground: "light",
  bedPreviewTarget: "result",
  assistNote: null,
  svgText: null,
  stats: null,
  traceEngine: null,
  branchPreviews: null,
  hiddenSvgColors: [],
  bgEngine: null,
  cleanupEngine: null,
  despeckleLevel: 1,
  diagnostics: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeStoredFile(value: unknown): PersistedImageToSvgFile | null {
  if (!isRecord(value)) return null;

  const name = typeof value.name === "string" ? value.name.trim() : "";
  const type = typeof value.type === "string" ? value.type.trim() : "";
  const dataUrl = typeof value.dataUrl === "string" ? value.dataUrl.trim() : "";

  if (!name || !dataUrl.startsWith("data:")) return null;

  return {
    name,
    type: type || "image/png",
    dataUrl,
  };
}

function normalizeStats(value: unknown): ImageToSvgSessionSnapshot["stats"] {
  if (!isRecord(value)) return null;
  const pathCount = isFiniteNumber(value.pathCount) ? value.pathCount : null;
  const width = isFiniteNumber(value.width) ? value.width : null;
  const height = isFiniteNumber(value.height) ? value.height : null;
  if (pathCount === null || width === null || height === null) return null;
  return { pathCount, width, height };
}

function normalizeBranchPreviews(value: unknown): RasterVectorizeBranchPreviews | null {
  if (!isRecord(value)) return null;

  const normalized: RasterVectorizeBranchPreviews = {};

  for (const key of [
    "colorPreview",
    "textPreview",
    "arcTextPreview",
    "scriptTextPreview",
    "shapePreview",
    "contourPreview",
  ] as const) {
    const current = value[key];
    if (typeof current === "string") {
      normalized[key] = current;
      continue;
    }
    if (current === null) {
      normalized[key] = null;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return isFiniteNumber(value) ? value : fallback;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function normalizeImageToSvgSession(
  value: unknown,
  fallback: ImageToSvgSessionSnapshot = DEFAULT_IMAGE_TO_SVG_SESSION,
): ImageToSvgSessionSnapshot {
  if (!isRecord(value)) {
    return { ...fallback };
  }

  return {
    sourceFile: normalizeStoredFile(value.sourceFile),
    workingFile: normalizeStoredFile(value.workingFile),
    traceMode: value.traceMode === "posterize" ? "posterize" : fallback.traceMode,
    traceRecipe:
      value.traceRecipe === "line-art" ||
      value.traceRecipe === "script-logo" ||
      value.traceRecipe === "stamp"
        ? value.traceRecipe
        : fallback.traceRecipe,
    thresholdMode: value.thresholdMode === "manual" ? "manual" : fallback.thresholdMode,
    threshold: readNumber(value.threshold, fallback.threshold),
    invert: readBoolean(value.invert, fallback.invert),
    trimWhitespace: readBoolean(value.trimWhitespace, fallback.trimWhitespace),
    normalizeLevels: readBoolean(value.normalizeLevels, fallback.normalizeLevels),
    turdSize: readNumber(value.turdSize, fallback.turdSize),
    alphaMax: readNumber(value.alphaMax, fallback.alphaMax),
    optTolerance: readNumber(value.optTolerance, fallback.optTolerance),
    posterizeSteps: readNumber(value.posterizeSteps, fallback.posterizeSteps),
    preserveText: readBoolean(value.preserveText, fallback.preserveText),
    backgroundStrategy:
      value.backgroundStrategy === "cutout" || value.backgroundStrategy === "hybrid"
        ? value.backgroundStrategy
        : fallback.backgroundStrategy,
    outputColor: readString(value.outputColor, fallback.outputColor),
    previewBackground:
      value.previewBackground === "dark" || value.previewBackground === "checker"
        ? value.previewBackground
        : fallback.previewBackground,
    bedPreviewTarget:
      value.bedPreviewTarget === "source" ||
      value.bedPreviewTarget === "thresholdPreview" ||
      value.bedPreviewTarget === "colorPreview" ||
      value.bedPreviewTarget === "textPreview" ||
      value.bedPreviewTarget === "arcTextPreview" ||
      value.bedPreviewTarget === "scriptTextPreview" ||
      value.bedPreviewTarget === "shapePreview" ||
      value.bedPreviewTarget === "contourPreview"
        ? value.bedPreviewTarget
        : fallback.bedPreviewTarget,
    assistNote: readNullableString(value.assistNote),
    svgText: readNullableString(value.svgText),
    stats: normalizeStats(value.stats),
    traceEngine: value.traceEngine === "potrace" || value.traceEngine === "asset-pipeline" ? value.traceEngine : null,
    branchPreviews: normalizeBranchPreviews(value.branchPreviews),
    hiddenSvgColors: readStringArray(value.hiddenSvgColors),
    bgEngine: readNullableString(value.bgEngine),
    cleanupEngine: readNullableString(value.cleanupEngine),
    despeckleLevel: readNumber(value.despeckleLevel, fallback.despeckleLevel),
    diagnostics:
      value.diagnostics != null
        ? normalizeTemplatePipelineDiagnostics(value.diagnostics)
        : null,
  };
}

export function readImageToSvgSession(
  key: string,
  storage: Pick<Storage, "getItem"> | null | undefined,
): ImageToSvgSessionSnapshot | null {
  if (!key || !storage) return null;

  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return normalizeImageToSvgSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeImageToSvgSession(
  key: string,
  snapshot: ImageToSvgSessionSnapshot,
  storage: Pick<Storage, "setItem"> | null | undefined,
): void {
  if (!key || !storage) return;

  try {
    storage.setItem(key, JSON.stringify(snapshot));
  } catch {
    // Ignore storage quota or serialization failures.
  }
}

export function clearImageToSvgSession(
  key: string,
  storage: Pick<Storage, "removeItem"> | null | undefined,
): void {
  if (!key || !storage) return;

  try {
    storage.removeItem(key);
  } catch {
    // Ignore storage failures so UI clear actions still succeed.
  }
}
