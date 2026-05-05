import type { BedConfig, PlacedItem, WorkspaceMode } from "../types/admin";
import type {
  LightBurnExportArtifacts,
  LightBurnExportCylinder,
  LightBurnExportItem,
  LightBurnExportPayload,
  Lt316LightBurnSetupSidecar,
  RotaryExportOrigin,
  RotaryPlacementPreset,
  TopAnchorMode,
  TumblerPlacementProfile,
} from "../types/export";
import { isTaperWarpApplicable, applyTaperWarpToExportItem } from "./taperWarp.ts";
import { resolveRotaryCenterXmm } from "./rotaryCenter.ts";
import { isFiniteNumber } from "./guards.ts";
import { round4 as toRounded, round2 as toRounded2 } from "./geometry.ts";

function clampNonNegative(value: number): number {
  return value < 0 ? 0 : value;
}

function inferShapeType(
  value: BedConfig["tumblerShapeType"] | null | undefined
): "straight" | "tapered" | "unknown" {
  if (value === "straight" || value === "tapered") return value;
  return "unknown";
}

function getPrintableTopOffsetMm(args: {
  anchorMode: TopAnchorMode;
  placementProfile?: Pick<TumblerPlacementProfile, "topToSafeZoneStartMm"> | null;
}): number {
  if (args.anchorMode !== "printable-top") return 0;
  const topOffset = args.placementProfile?.topToSafeZoneStartMm;
  if (!isFiniteNumber(topOffset)) return 0;
  return clampNonNegative(topOffset);
}

function inferOutsideDiameterMm(config: BedConfig): number | undefined {
  if (isFiniteNumber(config.tumblerOutsideDiameterMm)) return config.tumblerOutsideDiameterMm;
  if (isFiniteNumber(config.tumblerDiameterMm)) return config.tumblerDiameterMm;
  return undefined;
}

function inferTopDiameterMm(config: BedConfig, outsideDiameterMm?: number): number | undefined {
  if (isFiniteNumber(config.tumblerTopDiameterMm)) return config.tumblerTopDiameterMm;
  return outsideDiameterMm;
}

function buildCylinderBlock(
  config: BedConfig,
  templateWidthMm: number
): LightBurnExportCylinder | null {
  if (config.workspaceMode !== "tumbler-wrap") return null;

  const shapeType = inferShapeType(config.tumblerShapeType);
  const outsideDiameterMm = inferOutsideDiameterMm(config);
  const topDiameterMm = inferTopDiameterMm(config, outsideDiameterMm);
  const bottomDiameterMm = inferBottomDiameterMm(config, outsideDiameterMm);

  const objectDiameterMm =
    getRecommendedRotaryDiameter({
      shapeType,
      outsideDiameterMm,
      topDiameterMm,
      bottomDiameterMm,
    }) ?? null;

  const printableHeightMm = toRounded2(
    inferUsableHeightMm(config) ?? inferOverallHeightMm(config) ?? config.height
  );

  return {
    objectDiameterMm,
    splitWidthMm: toRounded2(templateWidthMm),
    printableHeightMm,
    shapeType,
  };
}

function inferBottomDiameterMm(
  config: BedConfig,
  outsideDiameterMm?: number
): number | undefined {
  if (isFiniteNumber(config.tumblerBottomDiameterMm)) return config.tumblerBottomDiameterMm;
  return outsideDiameterMm;
}

function inferOverallHeightMm(config: BedConfig): number | undefined {
  if (isFiniteNumber(config.tumblerOverallHeightMm)) return config.tumblerOverallHeightMm;
  if (isFiniteNumber(config.tumblerPrintableHeightMm)) return config.tumblerPrintableHeightMm;
  if (isFiniteNumber(config.height)) return config.height;
  return undefined;
}

function inferUsableHeightMm(config: BedConfig): number | undefined {
  if (isFiniteNumber(config.tumblerUsableHeightMm)) return config.tumblerUsableHeightMm;
  if (isFiniteNumber(config.tumblerPrintableHeightMm)) return config.tumblerPrintableHeightMm;
  if (isFiniteNumber(config.height)) return config.height;
  return undefined;
}

export function getRotaryExportOrigin(args: {
  templateWidthMm: number;
  rotaryCenterXmm: number;
  rotaryTopYmm: number;
  anchorMode: TopAnchorMode;
  placementProfile?: Pick<TumblerPlacementProfile, "topToSafeZoneStartMm"> | null;
}): RotaryExportOrigin {
  const printableTopOffset = getPrintableTopOffsetMm({
    anchorMode: args.anchorMode,
    placementProfile: args.placementProfile,
  });

  return {
    xMm: toRounded(args.rotaryCenterXmm - args.templateWidthMm / 2),
    yMm: toRounded(args.rotaryTopYmm + printableTopOffset),
  };
}

export function getLightBurnExportOrigin(args: {
  templateWidthMm: number | null | undefined;
  preset: Pick<RotaryPlacementPreset, "rotaryCenterXmm" | "rotaryTopYmm"> | null;
  bedWidthMm?: number | null | undefined;
  manualRotaryCenterXmm?: number | null | undefined;
  manualRotaryTopYmm?: number | null | undefined;
  anchorMode: TopAnchorMode;
  placementProfile?: Pick<TumblerPlacementProfile, "topToSafeZoneStartMm"> | null;
}): RotaryExportOrigin | null {
  if (!isFiniteNumber(args.templateWidthMm) || args.templateWidthMm <= 0) {
    return null;
  }

  const resolvedRotaryCenterXmm = resolveRotaryCenterXmm({
    selectedPresetRotaryCenterXmm: args.preset?.rotaryCenterXmm,
    manualRotaryCenterXmm: args.manualRotaryCenterXmm,
    bedWidthMm: args.bedWidthMm,
  });
  const resolvedRotaryTopYmm =
    args.preset?.rotaryTopYmm ??
    (isFiniteNumber(args.manualRotaryTopYmm) ? args.manualRotaryTopYmm : 0);

  return getRotaryExportOrigin({
    templateWidthMm: args.templateWidthMm,
    rotaryCenterXmm: resolvedRotaryCenterXmm,
    rotaryTopYmm: resolvedRotaryTopYmm,
    anchorMode: args.anchorMode,
    placementProfile: args.placementProfile,
  });
}

export function applyRotaryPlacementToItems(args: {
  items: Pick<
    PlacedItem,
    "id" | "assetId" | "name" | "x" | "y" | "width" | "height" | "rotation" | "svgText"
  >[];
  exportOrigin: RotaryExportOrigin;
}): LightBurnExportItem[] {
  return args.items.map((item) => ({
    id: item.id,
    assetId: item.assetId,
    name: item.name,
    xMm: toRounded(args.exportOrigin.xMm + item.x),
    yMm: toRounded(args.exportOrigin.yMm + item.y),
    widthMm: toRounded(item.width),
    heightMm: toRounded(item.height),
    rotationDeg: toRounded(item.rotation),
    svgText: item.svgText,
  }));
}

function toUnshiftedExportItems(
  items: Pick<
    PlacedItem,
    "id" | "assetId" | "name" | "x" | "y" | "width" | "height" | "rotation" | "svgText"
  >[]
): LightBurnExportItem[] {
  return items.map((item) => ({
    id: item.id,
    assetId: item.assetId,
    name: item.name,
    xMm: toRounded(item.x),
    yMm: toRounded(item.y),
    widthMm: toRounded(item.width),
    heightMm: toRounded(item.height),
    rotationDeg: toRounded(item.rotation),
    svgText: item.svgText,
  }));
}

export function buildLightBurnExportPayload(args: {
  bedConfig: BedConfig;
  workspaceMode: WorkspaceMode;
  templateWidthMm: number;
  templateHeightMm: number;
  items: Pick<
    PlacedItem,
    "id" | "assetId" | "name" | "x" | "y" | "width" | "height" | "rotation" | "svgText"
  >[];
  rotary: {
    enabled: boolean;
    preset: RotaryPlacementPreset | null;
    anchorMode: TopAnchorMode;
    placementProfile?: TumblerPlacementProfile | null;
  };
  taperWarpEnabled?: boolean;
}): LightBurnExportPayload {
  const warnings: string[] = [];
  const isTumblerMode = args.workspaceMode === "tumbler-wrap";
  const shouldApplyRotary = isTumblerMode && args.rotary.enabled && Boolean(args.rotary.preset);

  if (isTumblerMode && args.rotary.enabled && !args.rotary.preset) {
    warnings.push(
      "Rotary auto placement is enabled but no preset is selected. Export uses template-space coordinates."
    );
  }

  if (shouldApplyRotary && !isFiniteNumber(args.rotary.preset?.rotaryTopYmm)) {
    warnings.push("Rotary Top Y is not calibrated. Using 0 mm anchor until measured.");
  }

  const resolvedExportOrigin = shouldApplyRotary
    ? getLightBurnExportOrigin({
        templateWidthMm: args.templateWidthMm,
        preset: args.rotary.preset,
        anchorMode: args.rotary.anchorMode,
        placementProfile: args.rotary.placementProfile,
      })
    : null;
  const exportOrigin = resolvedExportOrigin ?? { xMm: 0, yMm: 0 };

  const rawItems = shouldApplyRotary
    ? applyRotaryPlacementToItems({
        items: args.items,
        exportOrigin,
      })
    : toUnshiftedExportItems(args.items);

  // Apply taper warp correction (horizontal scale per item Y position)
  const items =
    args.taperWarpEnabled && isTaperWarpApplicable(args.bedConfig)
      ? rawItems.map((exportItem) => {
          const templateYcenter =
            exportItem.yMm - exportOrigin.yMm + exportItem.heightMm / 2;
          return applyTaperWarpToExportItem(exportItem, templateYcenter, args.bedConfig);
        })
      : rawItems;

  return {
    kind: "lt316-lightburn-export",
    workspaceMode: args.workspaceMode,
    templateWidthMm: toRounded(args.templateWidthMm),
    templateHeightMm: toRounded(args.templateHeightMm),
    generatedAt: new Date().toISOString(),
    rotaryAutoPlacementApplied: shouldApplyRotary,
    cylinder: buildCylinderBlock(args.bedConfig, args.templateWidthMm),
    rotary: {
      enabled: args.rotary.enabled,
      presetId: args.rotary.preset?.id ?? null,
      presetName: args.rotary.preset?.name ?? null,
      bedOrigin: args.rotary.preset?.bedOrigin ?? null,
      chuckOrRoller: args.rotary.preset?.chuckOrRoller ?? null,
      anchorMode: args.rotary.anchorMode,
      rotaryCenterXmm: args.rotary.preset?.rotaryCenterXmm ?? null,
      rotaryTopYmm: args.rotary.preset?.rotaryTopYmm ?? null,
      exportOriginXmm: toRounded(exportOrigin.xMm),
      exportOriginYmm: toRounded(exportOrigin.yMm),
    },
    warnings,
    items,
  };
}

export function getRecommendedRotaryDiameter(args: {
  shapeType: "straight" | "tapered" | "unknown";
  outsideDiameterMm: number | null | undefined;
  topDiameterMm: number | null | undefined;
  bottomDiameterMm: number | null | undefined;
}): number | undefined {
  const outside = isFiniteNumber(args.outsideDiameterMm)
    ? args.outsideDiameterMm
    : undefined;
  const top = isFiniteNumber(args.topDiameterMm) ? args.topDiameterMm : outside;
  const bottom = isFiniteNumber(args.bottomDiameterMm) ? args.bottomDiameterMm : outside;

  if (args.shapeType === "tapered") {
    const candidates = [top, bottom, outside].filter(isFiniteNumber);
    if (candidates.length === 0) return undefined;
    return toRounded2(Math.max(...candidates));
  }

  const straight = outside ?? top ?? bottom;
  return isFiniteNumber(straight) ? toRounded2(straight) : undefined;
}

export function getRecommendedCircumference(args: {
  templateWidthMm: number | null | undefined;
  recommendedDiameterMm: number | null | undefined;
}): number | undefined {
  if (isFiniteNumber(args.templateWidthMm) && args.templateWidthMm > 0) {
    return toRounded2(args.templateWidthMm);
  }
  if (isFiniteNumber(args.recommendedDiameterMm) && args.recommendedDiameterMm > 0) {
    return toRounded2(Math.PI * args.recommendedDiameterMm);
  }
  return undefined;
}

export function buildLt316Sidecar(args: {
  bedConfig: BedConfig;
  workspaceMode: WorkspaceMode;
  templateWidthMm: number;
  templateHeightMm: number;
  rotary: {
    preset: RotaryPlacementPreset | null;
    anchorMode: TopAnchorMode;
    placementProfile?: TumblerPlacementProfile | null;
  };
}): { sidecar: Lt316LightBurnSetupSidecar | null; warnings: string[] } {
  const warnings: string[] = [];
  if (args.workspaceMode !== "tumbler-wrap") {
    warnings.push("LightBurn setup bundle is available only in tumbler mode.");
    return { sidecar: null, warnings };
  }

  const shapeType = inferShapeType(args.bedConfig.tumblerShapeType);
  const outsideDiameterMm = inferOutsideDiameterMm(args.bedConfig);
  const topDiameterMm = inferTopDiameterMm(args.bedConfig, outsideDiameterMm);
  const bottomDiameterMm = inferBottomDiameterMm(args.bedConfig, outsideDiameterMm);
  const overallHeightMm = inferOverallHeightMm(args.bedConfig);
  const usableHeightMm = inferUsableHeightMm(args.bedConfig);

  if (!isFiniteNumber(outsideDiameterMm) && shapeType !== "tapered") {
    warnings.push("Missing tumbler diameter.");
  }
  if (!isFiniteNumber(args.templateWidthMm) || args.templateWidthMm <= 0) {
    warnings.push("Missing template width.");
  }
  if (!args.rotary.preset) {
    warnings.push("No rotary preset selected.");
  } else if (!isFiniteNumber(args.rotary.preset.rotaryTopYmm)) {
    warnings.push("Rotary Top Y not calibrated; sidecar uses 0 mm anchor fallback.");
  }

  const recommendedObjectDiameterMm = getRecommendedRotaryDiameter({
    shapeType,
    outsideDiameterMm,
    topDiameterMm,
    bottomDiameterMm,
  });
  if (!isFiniteNumber(recommendedObjectDiameterMm)) {
    warnings.push("Could not determine recommended object diameter.");
  }

  const recommendedCircumferenceMm = getRecommendedCircumference({
    templateWidthMm: args.templateWidthMm,
    recommendedDiameterMm: recommendedObjectDiameterMm,
  });
  if (!isFiniteNumber(recommendedCircumferenceMm)) {
    warnings.push("Missing template width; circumference fallback unavailable.");
  } else if (!isFiniteNumber(args.templateWidthMm) || args.templateWidthMm <= 0) {
    warnings.push("Using diameter-based circumference fallback.");
  }

  const exportOrigin = getLightBurnExportOrigin({
    templateWidthMm: args.templateWidthMm,
    preset: args.rotary.preset,
    bedWidthMm: args.bedConfig.flatWidth,
    anchorMode: args.rotary.anchorMode,
    placementProfile: args.rotary.placementProfile,
  });
  if (!exportOrigin) {
    warnings.push("Missing rotary anchor values.");
  }

  const notes: string[] = [];
  if (shapeType === "tapered") {
    notes.push("For tapered objects, use the largest diameter in LightBurn.");
  }
  notes.push(...warnings);

  const sidecar: Lt316LightBurnSetupSidecar = {
    product: {
      profileId: args.bedConfig.tumblerProfileId ?? null,
      shapeType,
      outsideDiameterMm: isFiniteNumber(outsideDiameterMm)
        ? toRounded2(outsideDiameterMm)
        : undefined,
      topDiameterMm: isFiniteNumber(topDiameterMm) ? toRounded2(topDiameterMm) : undefined,
      bottomDiameterMm: isFiniteNumber(bottomDiameterMm)
        ? toRounded2(bottomDiameterMm)
        : undefined,
      overallHeightMm: isFiniteNumber(overallHeightMm) ? toRounded2(overallHeightMm) : undefined,
      usableHeightMm: isFiniteNumber(usableHeightMm) ? toRounded2(usableHeightMm) : undefined,
      templateWidthMm: toRounded2(args.templateWidthMm),
      templateHeightMm: toRounded2(args.templateHeightMm),
    },
    rotary: {
      presetId: args.rotary.preset?.id ?? null,
      presetName: args.rotary.preset?.name ?? null,
      mode: args.rotary.preset?.chuckOrRoller ?? "unknown",
      rotaryCenterXmm: args.rotary.preset
        ? toRounded2(args.rotary.preset.rotaryCenterXmm)
        : undefined,
      rotaryTopYmm:
        args.rotary.preset && isFiniteNumber(args.rotary.preset.rotaryTopYmm)
          ? toRounded2(args.rotary.preset.rotaryTopYmm)
          : undefined,
      anchorMode: args.rotary.anchorMode,
    },
    lightburn: {
      recommendedObjectDiameterMm: recommendedObjectDiameterMm,
      recommendedCircumferenceMm: recommendedCircumferenceMm,
      exportOriginXmm: exportOrigin ? toRounded2(exportOrigin.xMm) : undefined,
      exportOriginYmm: exportOrigin ? toRounded2(exportOrigin.yMm) : undefined,
      notes,
    },
    meta: {
      createdAt: new Date().toISOString(),
      source: "lt316",
    },
  };

  return { sidecar, warnings };
}

export function buildLightBurnSetupSummary(
  sidecar: Lt316LightBurnSetupSidecar
): string {
  const objectDiameter =
    sidecar.lightburn.recommendedObjectDiameterMm !== undefined
      ? `${sidecar.lightburn.recommendedObjectDiameterMm.toFixed(2)} mm`
      : "n/a";
  const circumference =
    sidecar.lightburn.recommendedCircumferenceMm !== undefined
      ? `${sidecar.lightburn.recommendedCircumferenceMm.toFixed(2)} mm`
      : "n/a";
  const originX =
    sidecar.lightburn.exportOriginXmm !== undefined
      ? `${sidecar.lightburn.exportOriginXmm.toFixed(2)} mm`
      : "n/a";
  const originY =
    sidecar.lightburn.exportOriginYmm !== undefined
      ? `${sidecar.lightburn.exportOriginYmm.toFixed(2)} mm`
      : "n/a";

  return [
    `Rotary preset: ${sidecar.rotary.presetName ?? "none"}`,
    `Rotary mode: ${sidecar.rotary.mode}`,
    `Object diameter: ${objectDiameter}`,
    `Wrap width: ${circumference}`,
    `Origin X: ${originX}`,
    `Origin Y: ${originY}`,
    `Anchor mode: ${sidecar.rotary.anchorMode}`,
  ].join(" | ");
}

export function buildLightBurnExportArtifacts(args: {
  includeLightBurnSetup: boolean;
  bedConfig: BedConfig;
  workspaceMode: WorkspaceMode;
  templateWidthMm: number;
  templateHeightMm: number;
  items: Pick<
    PlacedItem,
    "id" | "assetId" | "name" | "x" | "y" | "width" | "height" | "rotation" | "svgText"
  >[];
  rotary: {
    enabled: boolean;
    preset: RotaryPlacementPreset | null;
    anchorMode: TopAnchorMode;
    placementProfile?: TumblerPlacementProfile | null;
  };
  taperWarpEnabled?: boolean;
}): LightBurnExportArtifacts {
  const artworkPayload = buildLightBurnExportPayload({
    bedConfig: args.bedConfig,
    workspaceMode: args.workspaceMode,
    templateWidthMm: args.templateWidthMm,
    templateHeightMm: args.templateHeightMm,
    items: args.items,
    rotary: args.rotary,
    taperWarpEnabled: args.taperWarpEnabled,
  });

  if (!args.includeLightBurnSetup) {
    return {
      artworkPayload,
      sidecar: null,
      setupSummary: null,
      setupWarnings: [],
    };
  }

  const { sidecar, warnings } = buildLt316Sidecar({
    bedConfig: args.bedConfig,
    workspaceMode: args.workspaceMode,
    templateWidthMm: args.templateWidthMm,
    templateHeightMm: args.templateHeightMm,
    rotary: {
      preset: args.rotary.preset,
      anchorMode: args.rotary.anchorMode,
      placementProfile: args.rotary.placementProfile,
    },
  });

  if (!sidecar) {
    return {
      artworkPayload,
      sidecar: null,
      setupSummary: null,
      setupWarnings: warnings,
    };
  }

  return {
    artworkPayload,
    sidecar,
    setupSummary: buildLightBurnSetupSummary(sidecar),
    setupWarnings: warnings,
  };
}
