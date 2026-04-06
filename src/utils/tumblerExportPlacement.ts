import type { BedConfig, PlacedItem, WorkspaceMode } from "../types/admin";
import type {
  LightBurnAlignmentGuideLine,
  LightBurnAlignmentLogoRegion,
  LightBurnAlignmentGuidePayload,
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
import type { CanonicalDimensionCalibration, ManufacturerLogoStamp } from "../types/productTemplate";
import type { AxialSurfaceBand, PrintableSurfaceContract } from "../types/printableSurface";
import { isTaperWarpApplicable, applyTaperWarpToExportItem } from "./taperWarp.ts";
import { resolveRotaryCenterXmm } from "./rotaryCenter.ts";
import { isFiniteNumber } from "./guards.ts";
import { round4 as toRounded, round2 as toRounded2 } from "./geometry.ts";
import { getPrintableSurfaceLocalBounds } from "../lib/printableSurface.ts";

function clampNonNegative(value: number): number {
  return value < 0 ? 0 : value;
}

function wrapMm(value: number, wrapWidthMm: number): number {
  if (!(wrapWidthMm > 0)) return 0;
  const wrapped = value % wrapWidthMm;
  return wrapped < 0 ? wrapped + wrapWidthMm : wrapped;
}

function buildAlignmentGuideLines(wrapMappingMm: CanonicalDimensionCalibration["wrapMappingMm"]): LightBurnAlignmentGuideLine[] {
  const lines: LightBurnAlignmentGuideLine[] = [
    {
      id: "front-meridian",
      kind: "front-meridian",
      label: "Front meridian",
      orientation: "vertical",
      xMm: toRounded2(wrapMappingMm.frontMeridianMm),
    },
    {
      id: "back-meridian",
      kind: "back-meridian",
      label: "Back meridian",
      orientation: "vertical",
      xMm: toRounded2(wrapMappingMm.backMeridianMm),
    },
    {
      id: "left-quarter",
      kind: "left-quarter",
      label: "Left quarter",
      orientation: "vertical",
      xMm: toRounded2(wrapMappingMm.leftQuarterMm),
    },
    {
      id: "right-quarter",
      kind: "right-quarter",
      label: "Right quarter",
      orientation: "vertical",
      xMm: toRounded2(wrapMappingMm.rightQuarterMm),
    },
  ];

  if (isFiniteNumber(wrapMappingMm.handleMeridianMm)) {
    lines.push({
      id: "handle-meridian",
      kind: "handle-meridian",
      label: "Handle meridian",
      orientation: "vertical",
      xMm: toRounded2(wrapMappingMm.handleMeridianMm),
    });
  }

  if (isFiniteNumber(wrapMappingMm.handleKeepOutStartMm) && isFiniteNumber(wrapMappingMm.handleKeepOutEndMm)) {
    lines.push(
      {
        id: "keep-out-start",
        kind: "keep-out-start",
        label: "Handle keep-out start",
        orientation: "vertical",
        xMm: toRounded2(wrapMappingMm.handleKeepOutStartMm),
      },
      {
        id: "keep-out-end",
        kind: "keep-out-end",
        label: "Handle keep-out end",
        orientation: "vertical",
        xMm: toRounded2(wrapMappingMm.handleKeepOutEndMm),
      },
    );
  }

  return lines;
}

function normalizeThetaToWrapMm(theta: number, wrapWidthMm: number): number {
  return wrapMm((theta / (Math.PI * 2)) * wrapWidthMm, wrapWidthMm);
}

export function mapLogoPlacementToWrapRegion(args: {
  templateWidthMm: number;
  templateHeightMm: number;
  calibration: CanonicalDimensionCalibration | null | undefined;
  stamp: ManufacturerLogoStamp | null | undefined;
}): LightBurnAlignmentLogoRegion | null {
  if (!args.calibration?.wrapMappingMm || !args.stamp?.logoPlacement) {
    return null;
  }
  const wrapWidthMm = args.templateWidthMm;
  const templateHeightMm = args.templateHeightMm;
  if (!(wrapWidthMm > 0) || !(templateHeightMm > 0)) {
    return null;
  }

  const placement = args.stamp.logoPlacement;
  const frontMeridianMm = args.calibration.wrapMappingMm.frontMeridianMm;
  const thetaOffsetMm = normalizeThetaToWrapMm(placement.thetaCenter, wrapWidthMm);
  const centerXMm = wrapMm(frontMeridianMm + thetaOffsetMm, wrapWidthMm);
  const widthMm = Math.max(0.5, wrapWidthMm * (Math.max(0.001, placement.thetaSpan) / (Math.PI * 2)));
  const centerYMm = clampNonNegative(Math.min(templateHeightMm, placement.sCenter * templateHeightMm));
  const heightMm = Math.max(0.5, Math.min(templateHeightMm, placement.sSpan * templateHeightMm));
  const leftMm = wrapMm(centerXMm - widthMm / 2, wrapWidthMm);
  const rightMm = wrapMm(centerXMm + widthMm / 2, wrapWidthMm);

  return {
    label: "Front logo region",
    centerXMm: toRounded2(centerXMm),
    centerYMm: toRounded2(centerYMm),
    widthMm: toRounded2(widthMm),
    heightMm: toRounded2(heightMm),
    wrapsAround: leftMm > rightMm,
    source: placement.source,
    confidence: toRounded(placement.confidence),
  };
}

function mapContractToBodyLocalSurface(args: {
  calibration: CanonicalDimensionCalibration | null | undefined;
  printableSurfaceContract?: PrintableSurfaceContract | null;
}): { topMm: number; bottomMm: number; heightMm: number } | null {
  const contract = args.printableSurfaceContract ?? args.calibration?.printableSurfaceContract;
  if (!contract || !args.calibration) {
    return null;
  }
  return getPrintableSurfaceLocalBounds({
    contract,
    bodyTopFromOverallMm: args.calibration.lidBodyLineMm,
    bodyBottomFromOverallMm: args.calibration.bodyBottomMm,
  });
}

function buildPrintableBoundaryGuideLines(args: {
  calibration: CanonicalDimensionCalibration;
  printableSurfaceContract?: PrintableSurfaceContract | null;
  axialSurfaceBands?: AxialSurfaceBand[] | null;
}): LightBurnAlignmentGuideLine[] {
  const localSurface = mapContractToBodyLocalSurface(args);
  if (!localSurface) {
    return [];
  }

  const lines: LightBurnAlignmentGuideLine[] = [
    {
      id: "printable-top",
      kind: "printable-top",
      label: "Printable top",
      orientation: "horizontal",
      yMm: toRounded2(localSurface.topMm),
    },
    {
      id: "printable-bottom",
      kind: "printable-bottom",
      label: "Printable bottom",
      orientation: "horizontal",
      yMm: toRounded2(localSurface.bottomMm),
    },
  ];

  const contract = args.printableSurfaceContract ?? args.calibration.printableSurfaceContract ?? null;
  const lidExclusion = contract?.axialExclusions.find((exclusion) => exclusion.kind === "lid") ?? null;
  const rimExclusion = contract?.axialExclusions.find((exclusion) => exclusion.kind === "rim-ring") ?? null;
  const baseExclusion = contract?.axialExclusions.find((exclusion) => exclusion.kind === "base") ?? null;
  const bodyTopMm = args.calibration.lidBodyLineMm;

  if (lidExclusion && lidExclusion.endMm >= bodyTopMm) {
    lines.push({
      id: "lid-boundary",
      kind: "lid-boundary",
      label: "Lid boundary",
      orientation: "horizontal",
      yMm: toRounded2(Math.max(0, lidExclusion.endMm - bodyTopMm)),
    });
  }
  if (rimExclusion) {
    lines.push({
      id: "rim-boundary",
      kind: "rim-boundary",
      label: "Ring boundary",
      orientation: "horizontal",
      yMm: toRounded2(Math.max(0, rimExclusion.endMm - bodyTopMm)),
    });
  }
  if (baseExclusion) {
    lines.push({
      id: "base-boundary",
      kind: "base-boundary",
      label: "Base boundary",
      orientation: "horizontal",
      yMm: toRounded2(Math.max(0, baseExclusion.startMm - bodyTopMm)),
    });
  }

  const normalizedBands = args.axialSurfaceBands ?? args.calibration.axialSurfaceBands ?? [];
  if (normalizedBands.length === 0) {
    return lines;
  }

  return lines.filter((line, index, all) =>
    all.findIndex((candidate) => candidate.kind === line.kind && candidate.yMm === line.yMm) === index,
  );
}

export function buildLightBurnAlignmentGuidePayload(args: {
  workspaceMode: WorkspaceMode;
  templateWidthMm: number;
  templateHeightMm: number;
  calibration: CanonicalDimensionCalibration | null | undefined;
  printableSurfaceContract?: PrintableSurfaceContract | null | undefined;
  axialSurfaceBands?: AxialSurfaceBand[] | null | undefined;
  manufacturerLogoStamp?: ManufacturerLogoStamp | null | undefined;
}): LightBurnAlignmentGuidePayload | null {
  if (args.workspaceMode !== "tumbler-wrap" || !args.calibration) {
    return null;
  }

  const wrapMappingMm = args.calibration.wrapMappingMm;
  const keepOutRegion =
    isFiniteNumber(wrapMappingMm.handleKeepOutStartMm) &&
    isFiniteNumber(wrapMappingMm.handleKeepOutEndMm)
      ? {
          label: "Handle keep-out",
          startMm: toRounded2(wrapMappingMm.handleKeepOutStartMm),
          endMm: toRounded2(wrapMappingMm.handleKeepOutEndMm),
          wrapsAround: (wrapMappingMm.handleKeepOutStartMm ?? 0) > (wrapMappingMm.handleKeepOutEndMm ?? 0),
        }
      : null;
  const logoRegion = mapLogoPlacementToWrapRegion({
    templateWidthMm: args.templateWidthMm,
    templateHeightMm: args.templateHeightMm,
    calibration: args.calibration,
    stamp: args.manufacturerLogoStamp,
  });

  const lines = [
    ...buildAlignmentGuideLines(wrapMappingMm),
    ...buildPrintableBoundaryGuideLines({
      calibration: args.calibration,
      printableSurfaceContract: args.printableSurfaceContract,
      axialSurfaceBands: args.axialSurfaceBands,
    }),
  ];
  if (logoRegion) {
    lines.push({
      id: "logo-center",
      kind: "logo-center",
      label: "Front logo center",
      orientation: "vertical",
      xMm: toRounded2(logoRegion.centerXMm),
    });
  }

  return {
    kind: "lt316-lightburn-alignment-guides",
    workspaceMode: args.workspaceMode,
    templateWidthMm: toRounded2(args.templateWidthMm),
    templateHeightMm: toRounded2(args.templateHeightMm),
    generatedAt: new Date().toISOString(),
    units: "mm",
    origin: "top-left",
    bodyOnlyWrapSpace: true,
    wrapWidthAuthoritative: true,
    wrapMappingMm: {
      ...wrapMappingMm,
    },
    printableSurfaceContract: args.printableSurfaceContract ?? args.calibration.printableSurfaceContract ?? null,
    axialSurfaceBands: args.axialSurfaceBands ?? args.calibration.axialSurfaceBands ?? [],
    lines,
    keepOutRegion,
    logoRegion,
    warnings: [
      ...(keepOutRegion ? [] : ["No handle keep-out sector is defined for this template."]),
    ],
  };
}

function splitWrappedRange(startMm: number, endMm: number, wrapWidthMm: number): Array<{ start: number; end: number }> {
  const normalizedStart = wrapMm(startMm, wrapWidthMm);
  const normalizedEnd = wrapMm(endMm, wrapWidthMm);
  if (normalizedStart <= normalizedEnd) {
    return [{ start: normalizedStart, end: normalizedEnd }];
  }
  return [
    { start: normalizedStart, end: wrapWidthMm },
    { start: 0, end: normalizedEnd },
  ];
}

function rangesOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

export function collectHandleKeepOutWarnings(args: {
  items: Pick<PlacedItem, "id" | "name" | "x" | "width">[];
  wrapWidthMm: number;
  calibration: CanonicalDimensionCalibration | null | undefined;
  lockedProductionGeometry: boolean;
}): string[] {
  if (!args.lockedProductionGeometry || !args.calibration || !(args.wrapWidthMm > 0)) {
    return [];
  }
  const keepOutStartMm = args.calibration.wrapMappingMm.handleKeepOutStartMm;
  const keepOutEndMm = args.calibration.wrapMappingMm.handleKeepOutEndMm;
  if (!isFiniteNumber(keepOutStartMm) || !isFiniteNumber(keepOutEndMm)) {
    return [];
  }

  const keepOutRanges = splitWrappedRange(keepOutStartMm, keepOutEndMm, args.wrapWidthMm);
  const offenders = args.items.filter((item) => {
    const itemRanges = splitWrappedRange(item.x, item.x + item.width, args.wrapWidthMm);
    return itemRanges.some((itemRange) => keepOutRanges.some((keepOutRange) => rangesOverlap(itemRange, keepOutRange)));
  });

  if (offenders.length === 0) {
    return [];
  }

  return offenders.map((item) => `Artwork "${item.name}" crosses the handle keep-out sector in locked production mode.`);
}

export function collectPrintableSurfaceWarnings(args: {
  items: Pick<PlacedItem, "id" | "name" | "y" | "height">[];
  calibration: CanonicalDimensionCalibration | null | undefined;
  printableSurfaceContract?: PrintableSurfaceContract | null | undefined;
  lockedProductionGeometry: boolean;
}): string[] {
  if (!args.lockedProductionGeometry || !args.calibration) {
    return [];
  }
  const localSurface = mapContractToBodyLocalSurface({
    calibration: args.calibration,
    printableSurfaceContract: args.printableSurfaceContract,
  });
  if (!localSurface) {
    return [];
  }

  const offenders = args.items.filter((item) => {
    const itemTop = item.y;
    const itemBottom = item.y + item.height;
    return itemTop < localSurface.topMm || itemBottom > localSurface.bottomMm;
  });
  return offenders.map((item) => `Artwork "${item.name}" crosses the locked printable-height boundary.`);
}

export function collectLogoKeepOutWarnings(args: {
  wrapWidthMm: number;
  logoRegion: LightBurnAlignmentLogoRegion | null | undefined;
  calibration: CanonicalDimensionCalibration | null | undefined;
  lockedProductionGeometry: boolean;
}): string[] {
  if (!args.lockedProductionGeometry || !args.logoRegion || !args.calibration || !(args.wrapWidthMm > 0)) {
    return [];
  }
  const keepOutStartMm = args.calibration.wrapMappingMm.handleKeepOutStartMm;
  const keepOutEndMm = args.calibration.wrapMappingMm.handleKeepOutEndMm;
  if (!isFiniteNumber(keepOutStartMm) || !isFiniteNumber(keepOutEndMm)) {
    return [];
  }

  const keepOutRanges = splitWrappedRange(keepOutStartMm, keepOutEndMm, args.wrapWidthMm);
  const logoRanges = splitWrappedRange(
    args.logoRegion.centerXMm - args.logoRegion.widthMm / 2,
    args.logoRegion.centerXMm + args.logoRegion.widthMm / 2,
    args.wrapWidthMm,
  );
  const overlaps = logoRanges.some((logoRange) =>
    keepOutRanges.some((keepOutRange) => rangesOverlap(logoRange, keepOutRange)),
  );
  return overlaps
    ? [`Front logo region overlaps the handle keep-out sector in locked production mode.`]
    : [];
}

export function collectLogoPrintableSurfaceWarnings(args: {
  logoRegion: LightBurnAlignmentLogoRegion | null | undefined;
  calibration: CanonicalDimensionCalibration | null | undefined;
  printableSurfaceContract?: PrintableSurfaceContract | null | undefined;
  lockedProductionGeometry: boolean;
}): string[] {
  if (!args.lockedProductionGeometry || !args.logoRegion || !args.calibration) {
    return [];
  }
  const localSurface = mapContractToBodyLocalSurface({
    calibration: args.calibration,
    printableSurfaceContract: args.printableSurfaceContract,
  });
  if (!localSurface) {
    return [];
  }

  const logoTop = args.logoRegion.centerYMm - args.logoRegion.heightMm / 2;
  const logoBottom = args.logoRegion.centerYMm + args.logoRegion.heightMm / 2;
  return logoTop < localSurface.topMm || logoBottom > localSurface.bottomMm
    ? [`Front logo region overlaps the locked printable-height boundary.`]
    : [];
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
  const presetStepsPerRotation = isFiniteNumber(args.rotary.preset?.stepsPerRotation)
    ? args.rotary.preset.stepsPerRotation
    : null;
  const presetSprCorrectionFactor = isFiniteNumber(args.rotary.preset?.sprCorrectionFactor)
    ? args.rotary.preset.sprCorrectionFactor
    : null;

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
      stepsPerRotation: presetStepsPerRotation,
      sprCorrectionFactor: presetSprCorrectionFactor,
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
      stepsPerRotation: isFiniteNumber(args.rotary.preset?.stepsPerRotation)
        ? toRounded2(args.rotary.preset.stepsPerRotation)
        : undefined,
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
    `SPR: ${sidecar.rotary.stepsPerRotation !== undefined ? sidecar.rotary.stepsPerRotation.toFixed(2) : "n/a"}`,
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
  calibration?: CanonicalDimensionCalibration | null;
  printableSurfaceContract?: PrintableSurfaceContract | null;
  axialSurfaceBands?: AxialSurfaceBand[] | null;
  manufacturerLogoStamp?: ManufacturerLogoStamp | null;
  lockedProductionGeometry?: boolean;
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
  const rawArtworkPayload = buildLightBurnExportPayload({
    bedConfig: args.bedConfig,
    workspaceMode: args.workspaceMode,
    templateWidthMm: args.templateWidthMm,
    templateHeightMm: args.templateHeightMm,
    items: args.items,
    rotary: args.rotary,
    taperWarpEnabled: args.taperWarpEnabled,
  });
  const handleKeepOutWarnings = collectHandleKeepOutWarnings({
    items: args.items,
    wrapWidthMm: args.templateWidthMm,
    calibration: args.calibration,
    lockedProductionGeometry: Boolean(args.lockedProductionGeometry),
  });
  const printableSurfaceWarnings = collectPrintableSurfaceWarnings({
    items: args.items,
    calibration: args.calibration,
    printableSurfaceContract: args.printableSurfaceContract,
    lockedProductionGeometry: Boolean(args.lockedProductionGeometry),
  });
  const alignmentGuides = buildLightBurnAlignmentGuidePayload({
    workspaceMode: args.workspaceMode,
    templateWidthMm: args.templateWidthMm,
    templateHeightMm: args.templateHeightMm,
    calibration: args.calibration,
    printableSurfaceContract: args.printableSurfaceContract,
    axialSurfaceBands: args.axialSurfaceBands,
    manufacturerLogoStamp: args.manufacturerLogoStamp,
  });
  const logoKeepOutWarnings = collectLogoKeepOutWarnings({
    wrapWidthMm: args.templateWidthMm,
    logoRegion: alignmentGuides?.logoRegion,
    calibration: args.calibration,
    lockedProductionGeometry: Boolean(args.lockedProductionGeometry),
  });
  const logoPrintableSurfaceWarnings = collectLogoPrintableSurfaceWarnings({
    logoRegion: alignmentGuides?.logoRegion,
    calibration: args.calibration,
    printableSurfaceContract: args.printableSurfaceContract,
    lockedProductionGeometry: Boolean(args.lockedProductionGeometry),
  });
  const artworkPayload =
    handleKeepOutWarnings.length > 0 ||
      printableSurfaceWarnings.length > 0 ||
      logoKeepOutWarnings.length > 0 ||
      logoPrintableSurfaceWarnings.length > 0
      ? {
          ...rawArtworkPayload,
          warnings: [
            ...rawArtworkPayload.warnings,
            ...handleKeepOutWarnings,
            ...printableSurfaceWarnings,
            ...logoKeepOutWarnings,
            ...logoPrintableSurfaceWarnings,
          ],
        }
      : rawArtworkPayload;

  if (!args.includeLightBurnSetup) {
    return {
      artworkPayload,
      alignmentGuides,
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
      alignmentGuides,
      sidecar: null,
      setupSummary: null,
      setupWarnings: warnings,
    };
  }

  return {
    artworkPayload,
    alignmentGuides,
      sidecar,
      setupSummary: buildLightBurnSetupSummary(sidecar),
      setupWarnings: [
        ...warnings,
        ...handleKeepOutWarnings,
        ...printableSurfaceWarnings,
        ...logoKeepOutWarnings,
        ...logoPrintableSurfaceWarnings,
      ],
    };
}
