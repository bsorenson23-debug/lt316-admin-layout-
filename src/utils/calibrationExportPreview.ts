import type { WorkspaceMode } from "../types/admin";
import type {
  RotaryPlacementPreset,
  TopAnchorMode,
  TumblerPlacementProfile,
} from "../types/export";
import {
  getLightBurnExportOrigin,
  getRecommendedCircumference,
  getRecommendedRotaryDiameter,
} from "./tumblerExportPlacement.ts";
import { resolveRotaryCenterXmm } from "./rotaryCenter.ts";

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export type ExportPlacementPreview = {
  exportOriginXmm?: number;
  exportOriginYmm?: number;
  templateWidthMm?: number;
  templateHeightMm?: number;
  anchorMode: TopAnchorMode;
  resolvedRotaryCenterXmm?: number;
  resolvedTopAnchorYmm?: number;
  recommendedObjectDiameterMm?: number;
  recommendedCircumferenceMm?: number;
  setupSummary: string | null;
  warnings: string[];
  notes: string[];
  isValid: boolean;
  isWithinBed: boolean;
  presetName?: string;
};

function formatPreviewValueMm(value?: number): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(2)} mm`
    : "n/a";
}

export function formatLightBurnSetupSummary(
  preview: Pick<
    ExportPlacementPreview,
    | "presetName"
    | "recommendedObjectDiameterMm"
    | "recommendedCircumferenceMm"
    | "exportOriginXmm"
    | "exportOriginYmm"
    | "anchorMode"
  >
): string {
  return [
    `Rotary preset: ${preview.presetName ?? "none"}`,
    `Object diameter: ${formatPreviewValueMm(preview.recommendedObjectDiameterMm)}`,
    `Wrap width: ${formatPreviewValueMm(preview.recommendedCircumferenceMm)}`,
    `Origin X: ${formatPreviewValueMm(preview.exportOriginXmm)}`,
    `Origin Y: ${formatPreviewValueMm(preview.exportOriginYmm)}`,
    `Anchor mode: ${preview.anchorMode}`,
  ].join(" | ");
}

export function isPreviewPlacementWithinBed(args: {
  bedWidthMm: number;
  bedHeightMm: number;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}): boolean {
  return (
    args.xMm >= 0 &&
    args.yMm >= 0 &&
    args.xMm + args.widthMm <= args.bedWidthMm &&
    args.yMm + args.heightMm <= args.bedHeightMm
  );
}

export function buildExportPlacementPreview(args: {
  workspaceMode: WorkspaceMode;
  bedWidthMm: number;
  bedHeightMm: number;
  rotaryPreset: RotaryPlacementPreset | null;
  manualRotaryCenterXmm?: number | null;
  manualRotaryTopYmm?: number | null;
  anchorMode: TopAnchorMode;
  printableOffsetMm?: number | null;
  templateWidthMm?: number | null;
  templateHeightMm?: number | null;
  shapeType: "straight" | "tapered" | "unknown";
  outsideDiameterMm?: number | null;
  topDiameterMm?: number | null;
  bottomDiameterMm?: number | null;
}): ExportPlacementPreview {
  const warnings: string[] = [];
  const notes: string[] = [];
  if (args.workspaceMode !== "tumbler-wrap") {
    warnings.push("Export placement preview is available only in tumbler mode.");
  }

  const hasAnyAppliedTemplateData = [
    args.templateWidthMm,
    args.templateHeightMm,
    args.outsideDiameterMm,
    args.topDiameterMm,
    args.bottomDiameterMm,
  ].some((value) => isFiniteNumber(value) && value > 0);
  if (!hasAnyAppliedTemplateData) {
    warnings.push("No applied tumbler/template data.");
  }

  if (!args.rotaryPreset) {
    warnings.push("No rotary preset selected.");
    warnings.push("Using bed center as default rotary axis.");
  }

  if (!isFiniteNumber(args.templateWidthMm) || args.templateWidthMm <= 0) {
    warnings.push("Template width is missing.");
  }

  if (!isFiniteNumber(args.templateHeightMm) || args.templateHeightMm <= 0) {
    warnings.push("Template height is missing.");
  }

  const placementProfile: Pick<TumblerPlacementProfile, "topToSafeZoneStartMm"> | null =
    args.anchorMode === "printable-top" && isFiniteNumber(args.printableOffsetMm)
      ? { topToSafeZoneStartMm: args.printableOffsetMm }
      : null;

  if (args.anchorMode === "printable-top" && !isFiniteNumber(args.printableOffsetMm)) {
    warnings.push("Anchor data incomplete for printable-top mode.");
  }

  if (
    !isFiniteNumber(args.rotaryPreset?.rotaryTopYmm) &&
    !isFiniteNumber(args.manualRotaryTopYmm)
  ) {
    warnings.push("Top anchor Y is not calibrated. Using 0 mm until measured.");
  }

  const resolvedRotaryCenterXmm = resolveRotaryCenterXmm({
    selectedPresetRotaryCenterXmm: args.rotaryPreset?.rotaryCenterXmm,
    manualRotaryCenterXmm: args.manualRotaryCenterXmm,
    bedWidthMm: args.bedWidthMm,
    preferManualOverride: true,
  });
  const resolvedTopAnchorYmm =
    (isFiniteNumber(args.manualRotaryTopYmm) ? args.manualRotaryTopYmm : undefined) ??
    args.rotaryPreset?.rotaryTopYmm ??
    0;

  const previewPreset = args.rotaryPreset
    ? {
        ...args.rotaryPreset,
        rotaryCenterXmm: resolvedRotaryCenterXmm,
        rotaryTopYmm: resolvedTopAnchorYmm,
      }
    : null;

  const origin = getLightBurnExportOrigin({
    templateWidthMm: args.templateWidthMm,
    preset: previewPreset,
    bedWidthMm: args.bedWidthMm,
    manualRotaryCenterXmm: resolvedRotaryCenterXmm,
    manualRotaryTopYmm: resolvedTopAnchorYmm,
    anchorMode: args.anchorMode,
    placementProfile,
  });

  const recommendedObjectDiameterMm = getRecommendedRotaryDiameter({
    shapeType: args.shapeType,
    outsideDiameterMm: args.outsideDiameterMm,
    topDiameterMm: args.topDiameterMm,
    bottomDiameterMm: args.bottomDiameterMm,
  });
  if (!isFiniteNumber(recommendedObjectDiameterMm)) {
    warnings.push("Missing outside/top/bottom diameter for recommendation.");
  }

  const recommendedCircumferenceMm = getRecommendedCircumference({
    templateWidthMm: args.templateWidthMm,
    recommendedDiameterMm: recommendedObjectDiameterMm,
  });
  if (!isFiniteNumber(recommendedCircumferenceMm)) {
    warnings.push("Recommended wrap width is unavailable.");
  }

  if (args.shapeType === "tapered") {
    notes.push("For tapered objects, use the largest diameter in LightBurn.");
  }

  let isWithinBed = false;
  if (
    origin &&
    isFiniteNumber(args.templateWidthMm) &&
    isFiniteNumber(args.templateHeightMm)
  ) {
    isWithinBed = isPreviewPlacementWithinBed({
      bedWidthMm: args.bedWidthMm,
      bedHeightMm: args.bedHeightMm,
      xMm: origin.xMm,
      yMm: origin.yMm,
      widthMm: args.templateWidthMm,
      heightMm: args.templateHeightMm,
    });
    if (!isWithinBed) {
      warnings.push("Export preview box is outside the reference bed bounds.");
    }
  }

  const setupSummary = formatLightBurnSetupSummary({
    presetName: args.rotaryPreset?.name,
    recommendedObjectDiameterMm,
    recommendedCircumferenceMm,
    exportOriginXmm: origin?.xMm,
    exportOriginYmm: origin?.yMm,
    anchorMode: args.anchorMode,
  });

  return {
    exportOriginXmm: origin?.xMm,
    exportOriginYmm: origin?.yMm,
    templateWidthMm: isFiniteNumber(args.templateWidthMm)
      ? args.templateWidthMm
      : undefined,
    templateHeightMm: isFiniteNumber(args.templateHeightMm)
      ? args.templateHeightMm
      : undefined,
    anchorMode: args.anchorMode,
    resolvedRotaryCenterXmm,
    resolvedTopAnchorYmm,
    recommendedObjectDiameterMm: recommendedObjectDiameterMm,
    recommendedCircumferenceMm,
    setupSummary,
    warnings,
    notes,
    isValid: warnings.length === 0,
    isWithinBed,
    presetName: args.rotaryPreset?.name,
  };
}
