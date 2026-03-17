import type { WorkspaceMode } from "../types/admin";
import type {
  RotaryPlacementPreset,
  TopAnchorMode,
  TumblerPlacementProfile,
} from "../types/export";
import {
  getLightBurnExportOrigin,
  getRecommendedRotaryDiameter,
} from "./tumblerExportPlacement.ts";

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export type ExportPlacementPreview = {
  exportOriginXmm?: number;
  exportOriginYmm?: number;
  templateWidthMm?: number;
  templateHeightMm?: number;
  anchorMode: TopAnchorMode;
  recommendedObjectDiameterMm?: number;
  warnings: string[];
  isValid: boolean;
  isWithinBed: boolean;
  presetName?: string;
};

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
  if (args.workspaceMode !== "tumbler-wrap") {
    warnings.push("Export placement preview is available only in tumbler mode.");
  }

  if (!args.rotaryPreset) {
    warnings.push("No rotary preset selected.");
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

  const origin = getLightBurnExportOrigin({
    templateWidthMm: args.templateWidthMm,
    preset: args.rotaryPreset,
    anchorMode: args.anchorMode,
    placementProfile,
  });

  const recommendedObjectDiameterMm = getRecommendedRotaryDiameter({
    shapeType: args.shapeType,
    outsideDiameterMm: args.outsideDiameterMm,
    topDiameterMm: args.topDiameterMm,
    bottomDiameterMm: args.bottomDiameterMm,
  });

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
    recommendedObjectDiameterMm: recommendedObjectDiameterMm,
    warnings,
    isValid: warnings.length === 0,
    isWithinBed,
    presetName: args.rotaryPreset?.name,
  };
}
