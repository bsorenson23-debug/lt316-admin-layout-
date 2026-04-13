import type { EngravableZone } from "../types/admin.ts";
import type { ProductTemplate } from "../types/productTemplate.ts";
import type { EngravableDimensions } from "./engravableDimensions.ts";
import { getTumblerWrapLayout } from "../utils/tumblerWrapLayout.ts";
import { mapLogoPlacementToWrapRegion } from "../utils/tumblerExportPlacement.ts";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rebaseBodyLocalY(
  valueMm: number | null | undefined,
  topOffsetMm: number,
  workspaceHeightMm: number,
): number | null {
  if (!Number.isFinite(valueMm)) {
    return null;
  }
  return round2(clamp((valueMm ?? 0) - topOffsetMm, 0, workspaceHeightMm));
}

export interface TumblerPrintableWorkspaceFrame {
  hasPrintableBand: boolean;
  usesPrintableWorkspace: boolean;
  bodyShellHeightMm: number;
  printableTopFromBodyTopMm: number;
  printableBottomFromBodyTopMm: number;
  printableHeightMm: number;
  workspaceTopFromBodyTopMm: number;
  workspaceBottomFromBodyTopMm: number;
  workspaceHeightMm: number;
  workspaceTopFromOverallMm: number;
  workspaceBottomFromOverallMm: number;
  overallTopMarginMm: number;
  overallBottomMarginMm: number;
  printableTopY: number;
  printableBottomY: number;
  printableCenterY: number;
}

export interface TumblerWorkspaceGeometry {
  frame: TumblerPrintableWorkspaceFrame;
  legacyZone: EngravableZone;
  workspaceZone: EngravableZone;
}

export interface TumblerWorkspaceRuntimeState {
  geometry: TumblerWorkspaceGeometry;
  workspaceHeightMm: number;
  usableHeightMm: number;
  overallHeightMm: number;
  templateWidthMm: number;
  templateHeightMm: number;
}

export function deriveTumblerPrintableWorkspaceFrame(
  dims: EngravableDimensions,
): TumblerPrintableWorkspaceFrame {
  const bodyShellHeightMm = round2(Math.max(0, dims.engravableHeightMm));
  const printableTopFromBodyTopMm = round2(
    clamp(dims.printableTopFromBodyTopMm, 0, bodyShellHeightMm),
  );
  const printableBottomFromBodyTopMm = round2(
    clamp(dims.printableBottomFromBodyTopMm, printableTopFromBodyTopMm, bodyShellHeightMm),
  );
  const printableHeightMm = round2(
    Math.max(0, printableBottomFromBodyTopMm - printableTopFromBodyTopMm),
  );
  const hasPrintableBand = printableBottomFromBodyTopMm > printableTopFromBodyTopMm;
  const cropsBodyShell =
    printableTopFromBodyTopMm > 0.01 ||
    printableBottomFromBodyTopMm < bodyShellHeightMm - 0.01;
  const usesPrintableWorkspace = hasPrintableBand && cropsBodyShell;
  const workspaceTopFromBodyTopMm = usesPrintableWorkspace ? printableTopFromBodyTopMm : 0;
  const workspaceBottomFromBodyTopMm = usesPrintableWorkspace
    ? printableBottomFromBodyTopMm
    : bodyShellHeightMm;
  const workspaceHeightMm = usesPrintableWorkspace ? printableHeightMm : bodyShellHeightMm;
  const workspaceTopFromOverallMm = round2(dims.bodyTopOffsetMm + workspaceTopFromBodyTopMm);
  const workspaceBottomFromOverallMm = round2(dims.bodyTopOffsetMm + workspaceBottomFromBodyTopMm);
  const overallTopMarginMm = workspaceTopFromOverallMm;
  const overallBottomMarginMm = round2(
    Math.max(0, dims.totalHeightMm - workspaceBottomFromOverallMm),
  );
  const printableTopY = usesPrintableWorkspace ? 0 : printableTopFromBodyTopMm;
  const printableBottomY = usesPrintableWorkspace
    ? workspaceHeightMm
    : printableBottomFromBodyTopMm;
  const printableCenterY = round2((printableTopY + printableBottomY) / 2);

  return {
    hasPrintableBand,
    usesPrintableWorkspace,
    bodyShellHeightMm,
    printableTopFromBodyTopMm,
    printableBottomFromBodyTopMm,
    printableHeightMm,
    workspaceTopFromBodyTopMm,
    workspaceBottomFromBodyTopMm,
    workspaceHeightMm,
    workspaceTopFromOverallMm,
    workspaceBottomFromOverallMm,
    overallTopMarginMm,
    overallBottomMarginMm,
    printableTopY,
    printableBottomY,
    printableCenterY,
  };
}

export function deriveTumblerWorkspaceGeometry(
  template: ProductTemplate,
  dims: EngravableDimensions,
): TumblerWorkspaceGeometry {
  const frame = deriveTumblerPrintableWorkspaceFrame(dims);
  const fullWrapWidthMm = dims.circumferenceMm;
  const wrapMapping = template.dimensions.canonicalDimensionCalibration?.wrapMappingMm;
  const layout = getTumblerWrapLayout(
    template.tumblerMapping?.handleArcDeg ??
      template.dimensions.handleArcDeg ??
      dims.handleArcDeg,
  );
  const frontCenterX =
    wrapMapping?.frontMeridianMm ?? fullWrapWidthMm * layout.frontCenterRatio;
  const backCenterX =
    wrapMapping?.backMeridianMm ??
    (layout.backCenterRatio == null ? null : fullWrapWidthMm * layout.backCenterRatio);
  const handleCenterX =
    wrapMapping?.handleMeridianMm ??
    (layout.handleCenterRatio == null ? null : fullWrapWidthMm * layout.handleCenterRatio);

  let zoneWidthMm = Math.max(0, Math.min(dims.printableWidthMm ?? fullWrapWidthMm, fullWrapWidthMm));
  if (zoneWidthMm <= 0) zoneWidthMm = fullWrapWidthMm;
  let zoneX = frontCenterX - zoneWidthMm / 2;
  if (zoneX < 0 || zoneX + zoneWidthMm > fullWrapWidthMm) {
    zoneX = 0;
    zoneWidthMm = fullWrapWidthMm;
  }

  const bodyTopFromOverallMm = dims.bodyTopOffsetMm;
  const lidBoundaryOverallMm =
    dims.printableSurfaceContract.axialExclusions.find((band) => band.kind === "lid")?.endMm ??
    null;
  const rimBoundaryOverallMm =
    dims.printableSurfaceContract.axialExclusions.find((band) => band.kind === "rim-ring")?.endMm ??
    null;
  const lidBoundaryBodyLocalMm =
    lidBoundaryOverallMm != null ? round2(Math.max(0, lidBoundaryOverallMm - bodyTopFromOverallMm)) : null;
  const rimBoundaryBodyLocalMm =
    rimBoundaryOverallMm != null ? round2(Math.max(0, rimBoundaryOverallMm - bodyTopFromOverallMm)) : null;
  const logoRegion = mapLogoPlacementToWrapRegion({
    templateWidthMm: fullWrapWidthMm,
    templateHeightMm: dims.engravableHeightMm,
    calibration: template.dimensions.canonicalDimensionCalibration ?? null,
    stamp: template.manufacturerLogoStamp ?? null,
  });

  const legacyZone: EngravableZone = {
    x: round2(zoneX),
    y: frame.printableTopFromBodyTopMm,
    width: round2(zoneWidthMm),
    height: frame.printableHeightMm,
    printableTopY: frame.printableTopFromBodyTopMm,
    printableBottomY: frame.printableBottomFromBodyTopMm,
    printableCenterY: round2(
      (frame.printableTopFromBodyTopMm + frame.printableBottomFromBodyTopMm) / 2,
    ),
    lidBoundaryY: lidBoundaryBodyLocalMm,
    rimBoundaryY: rimBoundaryBodyLocalMm,
    printableDetectionWeak: dims.automaticPrintableDetectionWeak,
    frontCenterX: round2(frontCenterX),
    backCenterX: backCenterX != null ? round2(backCenterX) : null,
    leftQuarterX: wrapMapping?.leftQuarterMm != null ? round2(wrapMapping.leftQuarterMm) : null,
    rightQuarterX: wrapMapping?.rightQuarterMm != null ? round2(wrapMapping.rightQuarterMm) : null,
    handleCenterX: handleCenterX != null ? round2(handleCenterX) : null,
    handleKeepOutStartX:
      wrapMapping?.handleKeepOutStartMm != null ? round2(wrapMapping.handleKeepOutStartMm) : null,
    handleKeepOutEndX:
      wrapMapping?.handleKeepOutEndMm != null ? round2(wrapMapping.handleKeepOutEndMm) : null,
    handleKeepOutWraps:
      wrapMapping?.handleKeepOutStartMm != null &&
      wrapMapping?.handleKeepOutEndMm != null &&
      wrapMapping.handleKeepOutStartMm > wrapMapping.handleKeepOutEndMm,
    logoCenterX: logoRegion?.centerXMm ?? null,
    logoCenterY: logoRegion?.centerYMm ?? null,
    logoWidth: logoRegion?.widthMm ?? null,
    logoHeight: logoRegion?.heightMm ?? null,
    logoWraps: logoRegion?.wrapsAround ?? false,
    logoConfidence: logoRegion?.confidence ?? null,
  };

  const workspaceZone: EngravableZone = frame.usesPrintableWorkspace
    ? {
        ...legacyZone,
        y: 0,
        height: frame.workspaceHeightMm,
        printableTopY: frame.printableTopY,
        printableBottomY: frame.printableBottomY,
        printableCenterY: frame.printableCenterY,
        lidBoundaryY: rebaseBodyLocalY(
          lidBoundaryBodyLocalMm,
          frame.workspaceTopFromBodyTopMm,
          frame.workspaceHeightMm,
        ),
        rimBoundaryY: rebaseBodyLocalY(
          rimBoundaryBodyLocalMm,
          frame.workspaceTopFromBodyTopMm,
          frame.workspaceHeightMm,
        ),
        logoCenterY: rebaseBodyLocalY(
          logoRegion?.centerYMm,
          frame.workspaceTopFromBodyTopMm,
          frame.workspaceHeightMm,
        ),
      }
    : legacyZone;

  return {
    frame,
    legacyZone,
    workspaceZone,
  };
}

export function deriveTumblerWorkspaceRuntimeState(
  template: ProductTemplate,
  dims: EngravableDimensions,
): TumblerWorkspaceRuntimeState {
  const geometry = deriveTumblerWorkspaceGeometry(template, dims);
  return {
    geometry,
    workspaceHeightMm: geometry.frame.workspaceHeightMm,
    usableHeightMm: geometry.frame.workspaceHeightMm,
    overallHeightMm: dims.totalHeightMm,
    templateWidthMm: dims.circumferenceMm,
    templateHeightMm: geometry.frame.workspaceHeightMm,
  };
}
